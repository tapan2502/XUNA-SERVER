import Stripe from "stripe";

// import { stripe } from "../lib/stripe.js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Support Stripe Connect per-request
// Header: x-stripe-account: acct_xxx
// Query:  ?account=acct_xxx
function perRequestStripeOpts(req) {
  const stripeAccount =
    req.headers["x-stripe-account"] ||
    req.query.account ||
    undefined;
  return stripeAccount ? { stripeAccount } : undefined;
}

// GET /billing/history?customer=cus_xxx&limit=20&starting_after=...&ending_before=...
export async function listInvoices(req, res) {
  try {
    const { customer, starting_after, ending_before } = req.query;
    const limit = num(req.query.limit, 20);

    if (!customer) return res.status(400).json({ error: "customer is required" });

    const invoices = await stripe.invoices.list(
      {
        customer,
        limit,
        ...(starting_after ? { starting_after } : {}),
        ...(ending_before ? { ending_before } : {}),
        expand: ["data.charge", "data.subscription"],
      },
      perRequestStripeOpts(req)
    );

    const data = invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      created: inv.created,
      currency: inv.currency,
      amount_due: inv.amount_due,
      amount_paid: inv.amount_paid,
      amount_remaining: inv.amount_remaining,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
      charge_id: typeof inv.charge === "string" ? inv.charge : inv.charge?.id ?? null,
      subscription_id:
        typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? null,
    }));

    res.json({
      data,
      has_more: invoices.has_more,
      next_cursor: invoices.data.at(-1)?.id ?? null,
      prev_cursor: invoices.data.at(0)?.id ?? null,
    });
  } catch (err) {
    console.error("List invoices error:", err);
    res.status(500).json({ error: err.message ?? "Failed to list invoices" });
  }
}

// GET /billing/invoices/:id
export async function getInvoice(req, res) {
  try {
    const invoice = await stripe.invoices.retrieve(
      req.params.id,
      { expand: ["customer", "lines.data.price.product"] },
      perRequestStripeOpts(req)
    );
    res.json(invoice);
  } catch (err) {
    console.error("Retrieve invoice error:", err);
    res.status(500).json({ error: err.message ?? "Failed to retrieve invoice" });
  }
}

// GET /billing/payments?customer=cus_xxx&limit=20
export async function listPayments(req, res) {
  try {
    const { customer } = req.query;
    const limit = num(req.query.limit, 20);
    if (!customer) return res.status(400).json({ error: "customer is required" });

    const intents = await stripe.paymentIntents.list(
      { customer, limit },
      perRequestStripeOpts(req)
    );

    const data = intents.data.map((pi) => ({
      id: pi.id,
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status,
      created: pi.created,
      latest_charge:
        typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null,
      charges_count: pi.charges?.data?.length ?? 0,
    }));

    res.json({
      data,
      has_more: intents.has_more,
      next_cursor: intents.data.at(-1)?.id ?? null,
    });
  } catch (err) {
    console.error("List payments error:", err);
    res.status(500).json({ error: err.message ?? "Failed to list payments" });
  }
}

// GET /billing/subscriptions?customer=cus_xxx&limit=20
// export async function listSubscriptions(req, res) {
//   try {
//     const { customer } = req.query;
//     const limit = num(req.query.limit, 20);
//     if (!customer) return res.status(400).json({ error: "customer is required" });

//     const subs = await stripe.subscriptions.list(
//       { customer, limit, expand: ["data.items.data.price.product"] },
//       perRequestStripeOpts(req)
//     );

//     const data = subs.data.map((s) => ({
//       id: s.id,
//       status: s.status,
//       created: s.created,
//       current_period_start: s.current_period_start,
//       current_period_end: s.current_period_end,
//       items: s.items.data.map((it) => ({
//         price_id: it.price.id,
//         lookup_key: it.price.lookup_key ?? null,
//         product_name: typeof it.price.product === "string" ? null : it.price.product?.name ?? null,
//         unit_amount: it.price.unit_amount ?? null,
//         recurring_interval: it.price.recurring?.interval ?? null,
//         quantity: it.quantity ?? 1,
//       })),
//     }));

//     res.json({
//       data,
//       has_more: subs.has_more,
//       next_cursor: subs.data.at(-1)?.id ?? null,
//     });
//   } catch (err) {
//     console.error("List subscriptions error:", err);
//     res.status(500).json({ error: err.message ?? "Failed to list subscriptions" });
//   }
// }
// GET /billing/subscriptions?customer=cus_xxx&limit=20&names=1
export async function listSubscriptions(req, res) {
  try {
    const { customer } = req.query;
    const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 20;
    const includeNames =
      String(req.query.names).toLowerCase() === "1" ||
      String(req.query.names).toLowerCase() === "true";

    if (!customer) return res.status(400).json({ error: "customer is required" });

    // IMPORTANT: expand only up to price (<= 4 segments)
    const subs = await stripe.subscriptions.list(
      { customer, limit, expand: ["data.items.data.price"] },
      perRequestStripeOpts(req)
    );

    // If caller wants product names, fetch them separately
    let productNameById = {};
    if (includeNames) {
      const productIds = Array.from(
        new Set(
          subs.data.flatMap((s) =>
            s.items.data
              .map((it) =>
                typeof it.price.product === "string"
                  ? it.price.product
                  : it.price.product?.id
              )
              .filter(Boolean)
          )
        )
      );

      const prods = await Promise.all(
        productIds.map((id) =>
          stripe.products.retrieve(id, {}, perRequestStripeOpts(req))
        )
      );
      productNameById = Object.fromEntries(prods.map((p) => [p.id, p.name]));
    }

    const data = subs.data.map((s) => ({
      id: s.id,
      status: s.status,
      created: s.created,
      current_period_start: s.current_period_start,
      current_period_end: s.current_period_end,
      items: s.items.data.map((it) => {
        const price = it.price;
        const productId =
          typeof price.product === "string"
            ? price.product
            : price.product?.id ?? null;

        return {
          price_id: price.id,
          lookup_key: price.lookup_key ?? null,
          product_id: productId,
          // If names=1, fill from the fetched map; otherwise may be null
          product_name:
            (productId && productNameById[productId]) ??
            (typeof price.product === "string" ? null : price.product?.name ?? null),
          unit_amount: price.unit_amount ?? null,
          recurring_interval: price.recurring?.interval ?? null,
          quantity: it.quantity ?? 1,
        };
      }),
    }));

    res.json({
      data,
      has_more: subs.has_more,
      next_cursor: subs.data.at(-1)?.id ?? null,
    });
  } catch (err) {
    console.error("List subscriptions error:", err);
    res.status(500).json({ error: err.message ?? "Failed to list subscriptions" });
  }
}


// POST /billing/portal  { customer: "cus_xxx", return_url?: "https://..." }
export async function createPortalSession(req, res) {
  try {
    const { customer, return_url } = req.body || {};
    if (!customer) return res.status(400).json({ error: "customer is required" });

    const session = await stripe.billingPortal.sessions.create(
      {
        customer,
        return_url: return_url || "https://yourapp.example.com/dashboard/billing",
      },
      perRequestStripeOpts(req)
    );

    res.json({ url: session.url });
  } catch (err) {
    console.error("Portal error:", err);
    res.status(500).json({ error: err.message ?? "Failed to create portal session" });
  }
}
