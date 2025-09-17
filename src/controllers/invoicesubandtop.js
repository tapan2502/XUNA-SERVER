import Stripe from "stripe";

// controllers/billing.activity.controller.js
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// tiny helpers
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function perRequestStripeOpts(req) {
  const stripeAccount =
    req.headers["x-stripe-account"] ||
    req.query.account ||
    undefined;
  return stripeAccount ? { stripeAccount } : undefined;
}

// Heuristic: treat a PI as a "topup" if marked in metadata or description
function isTopupPI(pi) {
  const md = pi.metadata || {};
  const desc = (pi.description || "").toLowerCase();
  return (
    md.type === "topup" ||
    md.purpose === "topup" ||
    /top[-\s]?up/.test(desc)
  );
}

/**
 * Unified billing activity:
 * GET /billing/activity?customer=cus_xxx&limit=25&created_before=UNIX&kinds=invoice,topup[,payment]
 *
 * - kinds defaults to "invoice,topup"
 * - created_before is a unix seconds cursor for next page
 */
export async function listActivity(req, res) {
  try {
    const { customer } = req.query || {};
    if (!customer) return res.status(400).json({ error: "customer is required" });

    const limit = Math.min(num(req.query.limit, 25), 100);
    const createdBefore = req.query.created_before ? Number(req.query.created_before) : undefined;

    // which types to include
    const kindsRaw = (req.query.kinds || "invoice,topup")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const includeInvoice = kindsRaw.includes("invoice");
    const includeTopup = kindsRaw.includes("topup");
    const includePayment = kindsRaw.includes("payment"); // one-time payments that are NOT top-ups

    // ---- Fetch Stripe data ----
    // Use created[lt] so both resources page on the same time axis
    const createdFilter = createdBefore ? { lt: createdBefore } : undefined;

    const [invoiceList, piList] = await Promise.all([
      includeInvoice
        ? stripe.invoices.list(
            {
              customer,
              // pull a bit more so merge+slice can hit your limit
              limit: limit,
              ...(createdFilter ? { created: createdFilter } : {}),
              expand: [
                "data.charge",
                "data.subscription",
                "data.lines.data.price", // for plan names
              ],
            },
            perRequestStripeOpts(req)
          )
        : Promise.resolve({ data: [], has_more: false }),
      includeTopup || includePayment
        ? stripe.paymentIntents.list(
            {
              customer,
              limit: limit * 2, // usually more varied; pull extra to have enough after filtering
              ...(createdFilter ? { created: createdFilter } : {}),
              expand: ["data.latest_charge"], // for receipt_url
            },
            perRequestStripeOpts(req)
          )
        : Promise.resolve({ data: [], has_more: false }),
    ]);

    // ---- Map to a unified shape ----
    const invoiceRows = (invoiceList.data || []).map((inv) => {
        // console.log("inv",inv);
        
      // try to get plan info from first line (customize if you have multi-line invoices)
      const line = inv.lines;
    //   console.log("line",line);
      
      const price = line?.price;
      const product = typeof price?.product === "string" ? null : price?.product;
// console.log("product",product);
// console.log("price",price);


      return {
        kind: "invoice",
        id: inv.id,
        created: inv.created, // unix (sec)
        status: inv.status,   // 'paid','open','uncollectible'...
        currency: inv.currency,

        // amount to display: paid if paid, otherwise due
        amount_paid: inv.amount_paid ?? null,
        amount_due: inv.amount_due ?? null,
        amount_remaining: inv.amount_remaining ?? null,

        // useful bits
        number: inv.number ?? null,
        invoiceId: inv.id,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        invoice_pdf: inv.invoice_pdf ?? null,

        // plan hints
        plan_lookup_key: price?.lookup_key ?? null,
        plan_nickname: price?.nickname ?? null,
        product_name: price?? null,

        // references
        subscription_id:
          typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? null,
        charge_id: typeof inv.charge === "string" ? inv.charge : inv.charge?.id ?? null,
      };
    });

    const piRowsRaw = (piList.data || []).map((pi) => {
      const latestCharge = typeof pi.latest_charge === "string" ? null : pi.latest_charge;
      return {
        base: {
          id: pi.id,
          created: pi.created,
          status: pi.status, // 'succeeded','processing','requires_payment_method','canceled',...
          currency: pi.currency,
          amount: pi.amount ?? null,
          description: pi.description ?? null,
          receipt_url: latestCharge?.receipt_url ?? null,
        },
        isTopup: isTopupPI(pi),
      };
    });

    const topupRows = includeTopup
      ? piRowsRaw
          .filter((r) => r.isTopup)
          .map((r) => ({
            kind: "topup",
            id: r.base.id,
            created: r.base.created,
            status: r.base.status,
            currency: r.base.currency,
            amount: r.base.amount,
            description: r.base.description || "Wallet top-up",
            receipt_url: r.base.receipt_url,
          }))
      : [];

    const paymentRows = includePayment
      ? piRowsRaw
          .filter((r) => !r.isTopup)
          .map((r) => ({
            kind: "payment",
            id: r.base.id,
            created: r.base.created,
            status: r.base.status,
            currency: r.base.currency,
            amount: r.base.amount,
            description: r.base.description || "One-time payment",
            receipt_url: r.base.receipt_url,
          }))
      : [];

    // ---- Merge, sort, slice ----
    const merged = [...invoiceRows, ...topupRows, ...paymentRows].sort((a, b) => {
      if (b.created !== a.created) return b.created - a.created;
      // tie-breaker to keep sort stable
      return (b.id || "").localeCompare(a.id || "");
    });

    const page = merged.slice(0, limit);
    const next_created_before = page.length ? page[page.length - 1].created : null;

    // has_more: if either underlying list has more OR we trimmed the merged set
    const has_more =
      page.length < merged.length ||
      (includeInvoice && invoiceList.has_more) ||
      ((includeTopup || includePayment) && piList.has_more);

    res.json({
      data: page,
      has_more,
      // pass this in the next call: ?created_before=<number>
      next_created_before,
      // helpful debug cursors if you need them:
      cursors: {
        invoices_more: includeInvoice ? invoiceList.has_more : false,
        payment_intents_more: includeTopup || includePayment ? piList.has_more : false,
      },
    });
  } catch (err) {
    console.error("List activity error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to list activity" });
  }
}
