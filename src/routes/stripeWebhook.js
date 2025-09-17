 // src/routes/stripeWebhook.js
import express from "express";
import Stripe from "stripe";
import { db, admin } from "../config/firebase.js"; // make sure this file exists & exports { db, admin }

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/** Map Stripe subscription.status → your app status */
function mapSubStatus(s) {
  switch (s) {
    case "active":
    case "trialing":
    case "past_due":
    case "unpaid":
      return "active";
    case "incomplete":
    case "incomplete_expired":
    case "canceled":
    case "paused":
    default:
      return "cancelled";
  }
}

/** Prevent double-processing */
async function alreadyProcessed(eventId) {
  const ref = db.collection("billing_webhook_events").doc(eventId);
  const snap = await ref.get();
  if (snap.exists) return true;
  await ref.set({ receivedAt: admin.firestore.FieldValue.serverTimestamp() });
  return false;
}

/** Resolve userId (prefer explicit, else match by customer) */
async function resolveUserId(explicitUserId, customerId) {
  if (explicitUserId) return explicitUserId;
  if (customerId) {
    const q = await db
      .collection("users")
      .where("stripeCustomerId", "==", customerId)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0].id;
  }
  return null;
}

/** Write/refresh subscription fields on user */
async function upsertUserSubscription(userId, sub) {
  const item = sub.items.data[0];
  const price = item && item.price;
  const productId = (price && price.product) || null;

  await db.collection("users").doc(userId).set(
    {
      stripeSubscriptionId: sub.id,
      activeSubscription: sub.id,
      subscriptionStatus: mapSubStatus(sub.status),
      planKey: (price && price.metadata && price.metadata.plan_key) || null,
      priceId: (price && price.id) || null,
      productId,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      currentPeriodStart: admin.firestore.Timestamp.fromMillis(
        sub.current_period_start * 1000
      ),
      currentPeriodEnd: admin.firestore.Timestamp.fromMillis(
        sub.current_period_end * 1000
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** On hard cancel, mark cancelled or expired */
async function markCancellation(userId, sub) {
  const nowMs = Date.now();
  const endMs = (sub.current_period_end || 0) * 1000;
  const status = endMs > 0 && endMs < nowMs ? "expired" : "cancelled";

  await db.collection("users").doc(userId).set(
    {
      subscriptionStatus: status,
      activeSubscription: null,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: admin.firestore.Timestamp.fromMillis(endMs || nowMs),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Atomic credit grant + ledger line */
async function grantCredits(userId, credits, reason, refId) {
  if (!credits || credits <= 0) return;

  const userRef = db.collection("users").doc(userId);
  await db.runTransaction(async (tx) => {
    tx.set(
      userRef,
      {
        credits: admin.firestore.FieldValue.increment(credits),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await db
    .collection("users")
    .doc(userId)
    .collection("payments")
    .add({
      type: "credit_grant",
      reason,
      credits,
      status: "succeeded",
      provider: "stripe",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      refId: refId || null,
    });
}

/** Payment ledger helper */
async function recordPayment(userId, data) {
  await db
    .collection("users")
    .doc(userId)
    .collection("payments")
    .add({
      ...data,
      provider: "stripe",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

/** RAW body required for signature verification — keep this ONLY on this route */
router.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;
    try {
      const sig = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("❌ Webhook verify failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (await alreadyProcessed(event.id)) return res.status(200).send("duplicate");

    try {
      switch (event.type) {
        /**
         * Checkout finished:
         * - mode=subscription → set subscription fields
         * - mode=payment → treat as credit pack purchase (if you sell credits via Checkout)
         */
        case "checkout.session.completed": {
          const session = event.data.object;

          const userId = await resolveUserId(
            session.client_reference_id || (session.metadata && session.metadata.user_id),
            session.customer || null
          );
          if (!userId) break;

          if (session.mode === "subscription" && session.subscription) {
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            await upsertUserSubscription(userId, sub);

            // Optional welcome credits (set on Price metadata.monthly_credits)
            const price = sub.items.data[0] && sub.items.data[0].price;
            const monthlyCredits = parseInt(
              (price && price.metadata && price.metadata.monthly_credits) || "0",
              10
            );
            if (monthlyCredits > 0) {
              await grantCredits(userId, monthlyCredits, "monthly_credits_first_cycle", sub.id);
            }

            await recordPayment(userId, {
              status: "succeeded",
              category: "checkout",
              amount: (session.amount_total || 0) / 100,
              currency: session.currency || "usd",
              url: session.url || null,
              stripeIds: {
                checkoutSessionId: session.id,
                subscriptionId: sub.id,
                customerId: session.customer || null,
              },
              extra: {
                mode: session.mode,
                planKey: (price && price.metadata && price.metadata.plan_key) || null,
              },
            });
          }

          if (session.mode === "payment") {
            // (Only if you also sell one-time credit packs via Checkout)
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
            const priceId =
              lineItems.data[0] && lineItems.data[0].price && lineItems.data[0].price.id;

            let credits = 0;
            if (priceId) {
              const price = await stripe.prices.retrieve(priceId);
              credits = parseInt((price.metadata && price.metadata.credits) || "0", 10);
            } else {
              credits = parseInt((session.metadata && session.metadata.credits) || "0", 10);
            }

            if (credits > 0) await grantCredits(userId, credits, "credits_checkout", session.id);

            await recordPayment(userId, {
              status: "succeeded",
              category: "checkout",
              amount: (session.amount_total || 0) / 100,
              currency: session.currency || "usd",
              url: session.url || null,
              stripeIds: {
                checkoutSessionId: session.id,
                paymentIntentId: session.payment_intent || null,
                customerId: session.customer || null,
                priceId: priceId || null,
              },
              extra: { mode: session.mode, creditsGranted: credits },
            });
          }
          break;
        }

        /** Sub lifecycle keeps user fields up to date */
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data.object;
          const userId = await resolveUserId(
            sub.metadata && sub.metadata.user_id,
            sub.customer || null
          );
          if (!userId) break;
          await upsertUserSubscription(userId, sub);
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const userId = await resolveUserId(
            sub.metadata && sub.metadata.user_id,
            sub.customer || null
          );
          if (!userId) break;
          await markCancellation(userId, sub);
          break;
        }

        /** Renewals: success → (optional) monthly credits + payment log */
        case "invoice.payment_succeeded": {
          const invoice = event.data.object;
          const userId = await resolveUserId(
            invoice.metadata && invoice.metadata.user_id,
            invoice.customer
          );
          if (!userId) break;

          await recordPayment(userId, {
            status: "succeeded",
            category: "invoice",
            amount: (invoice.amount_paid || 0) / 100,
            currency: invoice.currency || "usd",
            url: invoice.hosted_invoice_url || null,
            stripeIds: {
              invoiceId: invoice.id,
              subscriptionId: invoice.subscription || null,
              customerId: invoice.customer || null,
              paymentIntentId: invoice.payment_intent || null,
            },
            extra: {
              number: invoice.number,
              attemptCount: invoice.attempt_count,
            },
          });

          if (invoice.subscription) {
            const sub = await stripe.subscriptions.retrieve(invoice.subscription, {
              expand: ["items.data.price"],
            });
            const price = sub.items.data[0] && sub.items.data[0].price;
            const monthlyCredits = parseInt(
              (price && price.metadata && price.metadata.monthly_credits) || "0",
              10
            );
            if (monthlyCredits > 0)
              await grantCredits(userId, monthlyCredits, "monthly_credits_cycle", invoice.id);
            await upsertUserSubscription(userId, sub);
          }
          break;
        }

        /** Renewal failed → mark payment failure */
        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const userId = await resolveUserId(
            invoice.metadata && invoice.metadata.user_id,
            invoice.customer
          );
          if (!userId) break;

          await recordPayment(userId, {
            status: "failed",
            category: "invoice",
            amount: (invoice.amount_due || 0) / 100,
            currency: invoice.currency || "usd",
            url: invoice.hosted_invoice_url || null,
            stripeIds: {
              invoiceId: invoice.id,
              subscriptionId: invoice.subscription || null,
              customerId: invoice.customer || null,
              paymentIntentId: invoice.payment_intent || null,
            },
            extra: {
              attemptCount: invoice.attempt_count,
              lastPaymentError:
                (invoice.last_finalization_error && invoice.last_finalization_error.message) || null,
            },
          });
          break;
        }

        /** Optional: raw charge events if you ever charge outside Checkout */
        case "charge.succeeded":
        case "charge.failed": {
          const charge = event.data.object;
          const userId = await resolveUserId(undefined, charge.customer || null);
          if (!userId) break;

          await recordPayment(userId, {
            status: event.type === "charge.succeeded" ? "succeeded" : "failed",
            category: "charge",
            amount: (charge.amount || 0) / 100,
            currency: charge.currency || "usd",
            url: charge.receipt_url || null,
            stripeIds: {
              chargeId: charge.id,
              customerId: charge.customer || null,
              paymentIntentId: charge.payment_intent || null,
            },
            extra: {
              failureCode: charge.failure_code || null,
              failureMessage: charge.failure_message || null,
            },
          });
          break;
        }

        default:
          // Ignore others
          break;
      }

      res.status(200).send("ok");
    } catch (err) {
      console.error("🔥 Webhook error:", err.message, err);
      res.status(500).send("failure");
    }
  }
);

export default router;
