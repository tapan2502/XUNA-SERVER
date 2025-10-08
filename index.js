import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import expressWs from "express-ws";
import agentRoutes from "./src/routes/agent.js";
import phoneNumberRoutes from "./src/routes/phoneNumber.js";
import voiceRoutes from "./src/routes/voice.js";
import conversationRoutes from "./src/routes/conversation.js";
import knowledgeBaseRoutes from "./src/routes/knowledgeBase.js";
import callRoutes from "./src/routes/call.js";
import toolRoutes from "./src/routes/tool.js";
import ghlRoutes from "./src/routes/ghl.js";
import calRoutes from "./src/routes/cal.js";
import secretRoutes from "./src/routes/secret.js";
import dashboardRoutes from "./src/routes/dashboard.js";
import dummyForwardTranscript from "./src/routes/ForwardTranscript.js";
import { elevenLabsCallService } from "./src/services/elevenLabsCall.js";
import bodyParser from "body-parser";
import { elevenLabsService } from "./src/services/elevenLabs.js";
import axios from "axios";
import batchCallRoutes from "./src/routes/batchCall.js";
import llmUsageRoutes from "./src/routes/llmUsage.js";
import paymentRoutes from "./src/routes/payment.js";
import userRoutes from "./src/routes/user.js";
import { db, bucket } from "./src/config/firebase.js";
import admin from "firebase-admin";

dotenv.config();

import Stripe from "stripe";
import { secondsToMinutesUpper}  from "./src/constant/secondsToMinutesUpper.js";
import billingrouter from "./src/routes/billinginvoice.js";
import { verifyFirebaseToken } from "./src/middlewares/verifyFirebaseToken.js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

const app = express();

const envAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [];

const staticAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://xuna-client.vercel.app",
  process.env.APP_URL,
].filter(Boolean);

const allowedOrigins = [...new Set([...staticAllowedOrigins, ...envAllowedOrigins])];

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (origin.endsWith(".vercel.app")) return true;
  return false;
};

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    console.warn(`Blocked by CORS: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  exposedHeaders: ["Content-Length"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// // const patchUser = async (userId, patch) => userId && db.collection('users').doc(userId).set(patch, { merge: true });

 
 
// // ---------- Helpers ----------
async function resolvePriceId({ lookup_key, product_id }) {
  if (lookup_key && PRICE_BY_LOOKUP[lookup_key]) return PRICE_BY_LOOKUP[lookup_key];

  if (product_id) {
    // Fallback: find an active MONTHLY price on that product
    const prices = await stripe.prices.list({ product: product_id, active: true, limit: 20 });
    const monthly = prices.data.find(p => p.recurring && p.recurring.interval === 'month');
    if (!monthly) throw new Error('No active monthly price found for product');
    return monthly.id;
  }

  throw new Error('No lookup_key or product_id provided');
}

 //--- Small utils ----------
function cleanUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, cleanUndefined(v)])
    );
  }
  return obj;
}

async function patchUser(userId, patch) {
  if (!userId || typeof userId !== 'string') throw new Error('patchUser: invalid userId');
  const safe = cleanUndefined(patch);
  await db.collection('users').doc(userId).set(safe, { merge: true });
}

async function findUserIdByCustomerId(customerId) {
  const q = await db.collection('users').where('billing.stripeCustomerId', '==', customerId).limit(1).get();
  return q.empty ? null : q.docs[0].id;
}



// ---------- Your price mapping (lookup_key -> price id) ----------
const PRICE_BY_LOOKUP = {
  Price_id:  'price_1S47vLASIXMKONrYGOiUQu80',
  Price_id2: 'price_1S4DvcASIXMKONrYb59Fh8Cg',
  Price_id3: 'price_1S47vOASIXMKONrYisFtZ6IP',
  Price_id4: 'price_1S47vVASIXMKONrY8Zd6BWVX',
};


// ---------- Entitlements / plan names ----------
const BASE_BY_LOOKUP = {
  //   lookup_key                planKey                  plain name                 agents  credits
  Price_id:   { planKey: 'starter',            name: 'Starter',            agentsIncluded: 3,   monthlyCredits: 3000 },
  Price_id2:  { planKey: 'growth',             name: 'Growth',             agentsIncluded: 10,  monthlyCredits: 12000 },
  Price_id3:  { planKey: 'pro',                name: 'Pro',                agentsIncluded: 25,  monthlyCredits: 40000 },
  Price_id4:  { planKey: 'agency_white_label', name: 'Agency White Label', agentsIncluded: 100, monthlyCredits: 200000 },
};
const ADDON_AGENT_LOOKUP = 'nv_voice_addon_agent_v1';
const ADDON_CREDITS_PER_SEAT = 1000;
const PLAN_RANK = { starter: 0, growth: 1, pro: 2, agency_white_label: 3 };

function highestRankBaseItem(items) {
  let best = null;
  for (const it of items || []) {
    const lk = it.price?.lookup_key || null;
    const base = BASE_BY_LOOKUP[lk];
    if (!base) continue;
    if (!best) { best = it; continue; }
    const curr = BASE_BY_LOOKUP[best.price.lookup_key];
    if ((PLAN_RANK[base.planKey] ?? -1) > (PLAN_RANK[curr.planKey] ?? -1)) best = it;
  }
  return best;
}

function getPlanInfo(lookupKey) {
  return BASE_BY_LOOKUP[lookupKey] || null;
}

/** Same as above, but throws if the key is unknown */
function requirePlanInfo(lookupKey) {
  const plan = getPlanInfo(lookupKey);
  if (!plan) throw new Error(`Unknown price lookup_key: ${lookupKey}`);
  return plan;
}

function summarizeEntitlementsFromSub(sub) {
  const items = sub?.items?.data || [];
  const baseItem = highestRankBaseItem(items);
  const baseLookup = baseItem?.price?.lookup_key || null;
  const base = baseLookup ? BASE_BY_LOOKUP[baseLookup] : null;
  console.log(base);
  

  let addonSeats = 0;
  for (const it of items) {
    if ((it.price?.lookup_key || null) === ADDON_AGENT_LOOKUP) {
      addonSeats += it.quantity || 0;
    }
  }

  const agents = (base?.agentsIncluded || 0) + addonSeats;
  const monthlyCreditsIncluded = (base?.monthlyCredits || 0) + addonSeats * ADDON_CREDITS_PER_SEAT;

  return {
    planLookupKey: baseLookup,
    planKey: base?.planKey || null,
    planName: base?.name || null, // 👈 plain, human-readable
    entitlements: {
      agents,
      monthlyCreditsIncluded,
      addonSeatQty: addonSeats,
    },
  };
}

async function writeBillingFromSubscription(userId, sub, opts = {}) {
  const { sessionPaymentStatus = null } = opts;
  const { planLookupKey, planKey, planName, entitlements } = summarizeEntitlementsFromSub(sub);
console.log(planLookupKey, planKey, planName, entitlements );
const agentdata =requirePlanInfo(planLookupKey)
 let creditsToAdd = 0;
  await patchUser(userId, {
    // creditsToAdd: (creditsToAdd+sub.items.data[0].plan.amount/100 || 0)*4,
    plan_lookup_key: planLookupKey || null,
    plan: planKey || null,          // keep if you still use this internally
    currentPlan: planName || null,  // 👈 plain name for UI
    entitlements:agentdata,
    billing: {
      status: sub?.status || (sessionPaymentStatus === 'paid' ? 'active' : 'pending'),
      lastPaymentStatus: sessionPaymentStatus ?? null,
      stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
      stripeSubId: sub?.id || null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  });
}

// ---------- STRIPE WEBHOOK (must be BEFORE express.json) ----------
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  console.log("vv",event.type);
  
  try {
    switch (event.type) {
      // First-time completion after hosted checkout
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log(session);
        
        const userId = session.metadata?.user_id || '';
      console.log(session.metadata?.type === "topup");
      
        if (session.metadata?.type === "topup") {
        const userId = session.metadata.userId;
        const amount = session.amount_total / 100;

        try {
          const userRef = db.collection("users").doc(userId);
          const userDoc = await userRef.get();
          const currentBalance = userDoc.exists
            ? userDoc.data().creditsToAdd || 0
            : 0;

          await userRef.set(
            {
              creditsToAdd: currentBalance + amount*4,
              hasToppedUp: true,
              lastTopUpAt: new Date().toISOString(),
            },
            { merge: true },
          );

          console.log(`✅ Top-up: $${amount} added to user ${userId}`);
        } catch (err) {
          console.error("🔥 Error updating balance:", err.message);
        }
      }

        if (!userId) return res.json({ received: true });
        const sub = session.subscription
          ? await stripe.subscriptions.retrieve(session.subscription, { expand: ['items.data.price'] })
          : null;

        if (sub) {
          await writeBillingFromSubscription(userId, sub, { sessionPaymentStatus: session.payment_status || null });
        }

        // Do NOT update balance here; wait for invoice.payment_succeeded
        return res.json({ received: true });
      }

      // Keep plan/status fresh on changes
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        const userId = sub.metadata?.user_id || (await findUserIdByCustomerId(custId)) || null;

        if (!userId) return res.json({ received: true });
        await writeBillingFromSubscription(userId, sub);
        return res.json({ received: true });
      }

      // Cancel/downgrade
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        const userId = sub.metadata?.user_id || (await findUserIdByCustomerId(custId)) || null;

        if (!userId) return res.json({ received: true });

        await patchUser(userId, {
          plan_lookup_key: null,
          plan: null,
          currentPlan: null, // clear plain name
          entitlements: { agents: 0, monthlyCreditsIncluded: 0, addonSeatQty: 0 },
          billing: {
            status: sub.status || 'canceled',
            lastPaymentStatus: 'unpaid',
            stripeCustomerId: custId || null,
            stripeSubId: sub.id,
            currentPeriodEnd: sub.current_period_end ?? null,
            cancelAtPeriodEnd: !!sub.cancel_at_period_end,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        });

        return res.json({ received: true });
      }

      // Money actually captured => update balance & mark paid
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        

        const sub = await stripe.subscriptions.retrieve(invoice.parent.subscription_details.subscription, { expand: ['items.data.price'] });
        const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        const userId = sub.metadata?.user_id || (await findUserIdByCustomerId(custId)) || null;
        if (!userId) return res.json({ received: true });
console.log("ee",sub.items.data[0].price.lookup_key);
const key=sub.items.data[0].price.lookup_key;
 const amountUsd =( (sub.items.data[0].plan.amount || 0) / 100)*4;

const agentdata =requirePlanInfo(key)
console.log(agentdata);

        // Refresh billing status
        await patchUser(userId, {
          entitlements:agentdata,
          plan:sub.items.data[0].plan,
          price:sub.items.data[0].price,
          ProductName:sub.items.data[0].price.product.name,
          plan_lookup_key: sub.items.data[0].price.lookup_key || null,
          billing: {
            status: sub.status,
            lastPaymentStatus: 'paid',
            stripeCustomerId: custId || null,
            stripeSubId: sub.id,
            currentPeriodEnd: sub.current_period_end ?? null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          billingMeta: {
            lastInvoiceId: invoice.id,
            lastInvoiceAmountPaid: invoice.amount_paid ?? 0,
            lastInvoiceCurrency: invoice.currency ?? null,
          },
        });


        // ✅ Simple wallet balance increment (USD)
       
 const tt=       await db.collection('users').doc(userId).set({
          creditsToAdd: admin.firestore.FieldValue.increment(amountUsd),
          balanceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log("rr",tt);
        

        return res.json({ received: true });
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (!invoice.subscription) return res.json({ received: true });

        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        const userId = sub.metadata?.user_id || (await findUserIdByCustomerId(custId)) || null;
        if (!userId) return res.json({ received: true });

        await patchUser(userId, {
          billing: {
            status: sub.status, // e.g., 'past_due'
            lastPaymentStatus: 'unpaid',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        });

        return res.json({ received: true });
      }

      // Optional async flows (e.g., iDEAL)
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed': {
        return res.json({ received: true });
      }

      default:
        // Handle other events or ignore
        return res.json({ received: true });
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    // While debugging, still 200 to avoid retry storms
    return res.status(200).json({ received: true, note: 'handled with errors' });
  }
});

// ---------- Normal middleware (after webhook) ----------
app.use(express.json());


app.post('/billing/checkout',verifyFirebaseToken, async (req, res) => {
  const user_id= req.uid
  try {
    const { product_id,  email, lookup_key, lookupKey, intent = 'update', when = 'now' } = req.body || {};

    // --- resolve target price ---
    const targetLookup = lookup_key || lookupKey || null;
    const priceId = await resolvePriceId({ lookup_key: targetLookup, product_id, stripe });

    // --- get or create customer by email (you can also use user_id map) ---
    let customerId = null;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      customerId = existing.data[0]?.id || (await stripe.customers.create({ email, metadata: { user_id: user_id || '' } })).id;
    }
    if (!customerId) return res.status(400).json({ error: 'customer_not_found', message: 'Provide email or known customer id.' });
console.log(customerId);
  await patchUser(user_id, {
         stripeCustomerId: customerId
      });

    // --- fetch subscriptions (read-only) ---
    const subsList = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      expand: ['data.items.data.price'],
      limit: 50,
    });

    // choose primary subscription: prefer active/trialing; otherwise most recent
    const ACTIVE = new Set(['active', 'trialing', 'past_due', 'unpaid']);
    const activeLike = subsList.data.filter(s => ACTIVE.has(s.status));
    const primary = activeLike.sort((a,b) => b.created - a.created)[0] ||
                    subsList.data.sort((a,b) => b.created - a.created)[0] || null;

    // ====== CASE 1: no subscription yet -> create Checkout Session ======
    if (!primary) {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        customer: customerId,
        allow_promotion_codes: true,
        client_reference_id: user_id || undefined,
        success_url: `${APP_URL}/dashboard/billing`,
        cancel_url: `${APP_URL}/dashboard/billing`,
        subscription_data: { metadata: { user_id: user_id || '', lookup_key: targetLookup || '', product_id: product_id || '' } },
        metadata: { user_id: user_id || '', lookup_key: targetLookup || '', product_id: product_id || '' },
      });

      // mark pending in your DB
      await patchUser(user_id, {
        billing: {
          status: 'pending',
          lastPaymentStatus: 'unpaid',
          stripeCustomerId: customerId,
          checkoutSessionId: session.id,
          priceId,
          lookupKey: targetLookup || null,
          productId: product_id || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });

      return res.json({ action: 'checkout', url: session.url });
    }

    // ====== CASE 2: there is already a subscription -> DO NOT CREATE ANOTHER ======

    // convenience: the first item is your base plan if you only sell 1 base line
    const currentItem = primary.items.data[0];
    const currentPriceId = currentItem.price.id;
console.log("currentPriceId",currentPriceId);
console.log(priceId);


    // handle intents
    if (intent === 'portal') {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${APP_URL}/dashboard/billing`,
      });
      return res.json({ action: 'portal', url: portal.url, subscriptionId: primary.id });
    }

    if (intent === 'cancel_now') {
      const canceled = await stripe.subscriptions.del(primary.id, { invoice_now: false, prorate: false });
      await patchUser(user_id, {
        billing: {
          status: canceled.status,
          stripeCustomerId: customerId,
          stripeSubId: canceled.id,
          current_period_end: canceled.current_period_end,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
      return res.json({ action: 'canceled_now', subscriptionId: canceled.id });
    }

    if (intent === 'cancel_at_period_end') {
      const scheduled = await stripe.subscriptions.update(primary.id, { cancel_at_period_end: true });
      await patchUser(user_id, {
        billing: {
          status: scheduled.status,
          stripeCustomerId: customerId,
          stripeSubId: scheduled.id,
          current_period_end: scheduled.current_period_end,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
      return res.json({ action: 'canceled_at_period_end', subscriptionId: scheduled.id, ends_unix: scheduled.current_period_end });
    }

    //  const currentItem = primary.items.data[0]; // if you sell add-ons, choose your "base" item by lookup_key
    // const currentPriceId = currentItem.price.id;

    if (primary.status === "canceled") {
      // ⚠️ Cannot update a canceled subscription → send to Checkout to create a new one
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer: customerId,
        allow_promotion_codes: true,
        client_reference_id: user_id || undefined,
        success_url: `${APP_URL}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/billing/cancelled`,
        subscription_data: { metadata: { user_id: user_id || "", switched_from_canceled: primary.id } },
        metadata: { user_id: user_id || "", intent: "resubscribe" },
      });
      return res.json({ action: "resubscribe_via_checkout", url: session.url });
    }

    // default: 'update' (upgrade/downgrade in place) — ONE SUB POLICY
    if (currentPriceId === priceId) {
      // already on this plan — offer portal instead of creating anything
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${APP_URL}/dashboard/billing`,
      });
      return res.json({
        action: 'already_on_plan',
        message: 'You are already on this plan.',
        subscriptionId: primary.id,
        url: portal.url,
      });
    }

    const updated = await stripe.subscriptions.update(
      primary.id,
      {
        items: [{ id: currentItem.id, price: priceId }],
        proration_behavior: 'create_prorations',
        ...(when === 'now' ? { billing_cycle_anchor: 'now' } : {}), // 'now' or keep existing anchor
        metadata: { user_id: user_id || '', switched_via: 'api', to_price: priceId, from_price: currentPriceId },
      },
      // optional: idempotency key prevents accidental double-upgrades if client retries quickly
      // { idempotencyKey: `upgrade:${user_id}:${priceId}:${Date.now()}` }
    );
    // console.log("updated",updated.items);
    
console.log(updated.items.data[0].price.product.name,);
 const amountUsd =( (updated.items.data[0].plan.amount || 0) / 100)*4;
console.log("tt",updated.items.data[0].price.lookup_key );

  const ttt=  await patchUser(user_id, {
      plan_lookup_key: updated.items.data[0].price.lookup_key || null,
      plan:updated.items.data[0].plan,
      price:updated.items.data[0].price,
       ProductName:updated.items.data[0].price.product,

      billing: {
        status: updated.status,
        lastPaymentStatus: 'paid', // this may change after invoice posts; webhook will correct it
        stripeCustomerId: customerId,
        stripeSubId: updated.id,
        current_period_end: updated.current_period_end,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
    //  const tt=       await db.collection('users').doc(user_id).set({
    //       creditsToAdd: admin.firestore.FieldValue.increment(amountUsd),
    //       balanceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    //     }, { merge: true });
    //     console.log("rr",tt);
    // console.log("rerre",ttt);
    return res.json({ action: 'updated', subscriptionId: updated.id });
  } catch (err) {
    console.error('❌ Checkout error:', err);
    return res.status(400).json({ error: err.message || 'Checkout create/update failed' });
  }
});


app.post('/billing/portal', async (req, res) => {
  try {
    const { customer_id, user_id, email } = req.body || {};

    // 1) Resolve an existing customer (prefer explicit ID, then by user_id metadata, then by email)
    let customerId = customer_id || null;

    if (!customerId && user_id) {
      const found = await stripe.customers.search({
        query: `metadata['user_id']:'${user_id}'`,
      });
      customerId = found.data[0]?.id || null;
    }

    if (!customerId && email) {
      const list = await stripe.customers.list({ email, limit: 1 });
      customerId = list.data[0]?.id || null;
    }

    if (!customerId) return res.status(404).json({ error: 'customer_not_found' });

    // 2) (Optional) Fetch active subscription to land directly on its update screen
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
      expand: ['data.items.data.price'],
    });
    const subscriptionId = subs.data[0]?.id || undefined;

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/dashboard/billing`,
      ...(subscriptionId && {
        flow_data: {
          type: 'subscription_update',
          subscription_update: { subscription: subscriptionId },
        },
      }),
    });

    return res.json({ url: portal.url });
  } catch (err) {
    console.error('❌ Portal error:', err);
    return res.status(400).json({ error: err.message || 'Portal failed' });
  }
});


app.get('/billing/verify', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ ok: false, error: 'session_id required' });

    const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['subscription'] });
    const userId = session.metadata?.user_id || null;
    const sub = session.subscription || null;
   // console.log("tt",sub);

     const userRef = db.collection("users").doc(userId);
          const userDoc = await userRef.get();
          const currentBalance = userDoc.exists
            ? userDoc.data().balance || 0
            : 0;
    
    //console.log(session);
    // console.log("RR",session?.plan);
    
    
    if (userId) {
      await patchUser(userId, {
        //  balance: currentBalance + sub?.plan?.amount_decimal/100 || 0,
        plain:sub?.plan,
        billing: {
          status: sub ? sub.status : (session.payment_status === 'paid' ? 'active' : 'pending'),
          lastPaymentStatus: session.payment_status, // 'paid' | 'unpaid' | 'no_payment_required'
          stripeSubscriptionId: sub?.id || null,
          currentPeriodEnd: sub?.current_period_end || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }

    res.json({
      ok: true,
      data: session,
      status: session.status,
      paymentStatus: session.payment_status,
      subscriptionStatus: sub?.status || null,
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});


app.get("/billing/status", async (req, res) => {
  const { userId, expand="stripe" } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const snap = await db.collection("users").doc(userId).get();
    if (!snap.exists) return res.status(404).json({ error: "User not found" });

    const u = snap.data() || {};
// console.log(u);
const TotalCredit= u.creditsToAdd 
    const totalused= u.usage 
    const payload = {
      userId: snap.id,
      credits: typeof u.credits === "number" ? u.creditsToAdd: 0,
      plan_lookup_key:u.plan_lookup_key,
      entitlements:u.entitlements || { agents: 0, monthlyCreditsIncluded: 0, addonSeatQty: 0 },
      TotalCredit: u.creditsToAdd ,
     totalused: u.usage || 0,
      balance: TotalCredit- totalused/100 || 0,




       
    };


const sub = await stripe.subscriptions.retrieve( u.billing.stripeSubscriptionId, {
  expand: ["items.data.price.product"],
});
//  console.log(sub.items.data[0]);
 
    return res.json({data:payload,data1:sub});
  } catch (e) {
    console.error("GET /billing/status error:", e);
    return res.status(500).json({ error: "Failed to load billing status" });
  }
});

const sha256Lower = (s) =>
  crypto.createHash("sha256").update(String(s).trim().toLowerCase()).digest("hex");

app.post("/api/meta/events", async (req, res) => {
  const { event_name, event_id, email, event_source_url, value, currency } = req.body;

  const payload = {
    data: [{
      event_name,
      event_time: Math.floor(Date.now()/1000),
      event_id,                      // use the same ID as browser eventID if you dedup
      action_source: "website",
      event_source_url,
      user_data: {
        client_ip_address: req.ip,
        client_user_agent: req.get("user-agent"),
        // optional but helps matching:
        em: email ? [sha256Lower(email)] : undefined,
        fbp: req.cookies?._fbp,      // if present
        fbc: req.cookies?._fbc,      // if present (or build from fbclid)
      },
      custom_data: value ? { value, currency: (currency || "USD").toUpperCase() } : undefined,
    }],
  };

  const url = `https://graph.facebook.com/v20.0/${process.env.META_DATASET_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`;
  const r = await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  const json = await r.json();
  res.status(r.ok ? 200 : 400).json(json);
});

 

app.post(
  "/payment/stripe-webhook-invoice-success",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("❌ Stripe webhook verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ✅ Handle top-up
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.metadata?.type === "topup") {
        const userId = session.metadata.userId;
        const amount = session.amount_total / 100;

        try {
          const userRef = db.collection("users").doc(userId);
          const userDoc = await userRef.get();
          const currentBalance = userDoc.exists
            ? userDoc.data().creditsToAdd || 0
            : 0;

          await userRef.set(
            {
              creditsToAdd: currentBalance + amount*4,
              hasToppedUp: true,
              lastTopUpAt: new Date().toISOString(),
            },
            { merge: true },
          );

          console.log(`✅ Top-up: $${amount} added to user ${userId}`);
        } catch (err) {
          console.error("🔥 Error updating balance:", err.message);
        }
      }
    }

    // ✅ Handle successful invoice payment
    else if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const amountPaid = invoice.amount_paid / 100;
      const monthKey = invoice.metadata.monthKey;

      try {
        const usersRef = db.collection("users");
        const snapshot = await usersRef
          .where("stripeCustomerId", "==", customerId)
          .limit(1)
          .get();
        if (snapshot.empty) {
          console.warn(`User not found for customer ${customerId}`);
          return res.status(404).send("User not found");
        }

        const userDoc = snapshot.docs[0];
        const userId = userDoc.id;

        await db
          .collection("users")
          .doc(userId)
          .collection("invoices")
          .doc(monthKey)
          .update({
            invoiceStatus: "paid",
            paidAt: admin.firestore.Timestamp.now(),
            stripeInvoiceId: invoice.id,
            stripeUrl: invoice.hosted_invoice_url,
          });
        console.log(`✅ Invoice payment recorded for user ${userId}`);

        await usersRef.doc(userId).collection("payments").add({
          paymentId: invoice.id,
          amount: amountPaid,
          status: "paid",
          invoiceUrl: invoice.hosted_invoice_url,
          createdAt: new Date().toISOString(),
        });

        console.log(`✅ Invoice payment recorded for user ${userId}`);
      } catch (err) {
        console.error("🔥 Error recording invoice:", err.message);
      }
    }

    res.status(200).send("Webhook received");
  },
);

expressWs(app);


// Enable CORS for all routes
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(
  bodyParser.raw({
    type: function (req) {
      // Exclude multipart form data from raw parsing
      return (
        req.get("Content-Type") &&
        !req.get("Content-Type").startsWith("multipart/")
      );
    },
    limit: "50mb",
  }),
);

// Root route for health check
app.get("/", (_, res) => {
  res.json({ message: "Server is running" });
});

// Route to handle incoming calls from Twilio
app.all("/incoming-call-eleven", (req, res) => {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <Stream url="wss://${req.headers.host}/media-stream" />
      </Connect>
    </Response>`;

  res.type("text/xml").send(twimlResponse);
});

// WebSocket route for handling media streams
app.ws("/media-stream", (ws, req) => {
  elevenLabsCallService.handleMediaStream(ws, req);
});

// ---- pricing mode selector ----
// BILLING_MODE: 'provider' | 'flat' (default 'provider' if unset)
// Per-user override: user.pricingMode: 'provider' | 'flat'
const DEFAULT_USD_PER_SECOND = parseFloat(process.env.CALL_USD_PER_SECOND || "0.10"); // 10¢/sec
const MIN_BILLABLE_SECONDS   = parseInt(process.env.CALL_MIN_BILLABLE_SECONDS || "0", 10);

const LIVE_NUMBER = (n) => (typeof n === "number" && isFinite(n) ? n : 0);
const roundUSD = (n) => Math.round(n * 100) / 100;

/** Flat: simple $/sec */
function calcFlatPrice({ seconds, userRate }) {
  const secs = Math.max(MIN_BILLABLE_SECONDS, Math.max(0, Number(seconds) || 0));
  const perSecondUsd = (typeof userRate === "number" && userRate > 0)
    ? userRate
    : DEFAULT_USD_PER_SECOND;

  const costUsd = roundUSD(secs * perSecondUsd);
  return {
    costUsd,
    perSecondUsd,
    breakdown: {
      source: "flat_per_second",
      durationSecs: secs,
      usdPerSecond: perSecondUsd,
      minBillableSecs: MIN_BILLABLE_SECONDS,
    },
  };
}

/** Provider: use total cost if provider sent it; else fallback to user's per-second */
function calcProviderFirst(postCallData, userData) {
  const secs = LIVE_NUMBER(postCallData?.metadata?.call_duration_secs);
  const providerTotal =
    (typeof postCallData?.metadata?.cost_usd === "number" && postCallData.metadata.cost_usd) ??
    (typeof postCallData?.metadata?.cost     === "number" && postCallData.metadata.cost) ??
    null;

  if (providerTotal != null && secs > 0) {
    return {
      costUsd: providerTotal,
      perSecondUsd: providerTotal / secs,
      breakdown: { source: "provider_total", durationSecs: secs },
    };
  }

  // fallback: user’s saved per-second (e.g., from plan) or DEFAULT
  const rate = (typeof userData?.callCostPerSecond === "number" && userData.callCostPerSecond > 0)
    ? userData.callCostPerSecond
    : DEFAULT_USD_PER_SECOND;

  return {
    costUsd: roundUSD(rate * secs),
    perSecondUsd: rate,
    breakdown: { source: "fallback_user_per_second", durationSecs: secs, usdPerSecond: rate },
  };
}

/** Choose pricing mode without mixing logic */
function chooseConversationCost({ postCallData, userData }) {
  const mode = (userData?.pricingMode || process.env.BILLING_MODE || "provider").toLowerCase();
  const secs = LIVE_NUMBER(postCallData?.metadata?.call_duration_secs);

  if (mode === "flat") {
    return calcFlatPrice({ seconds: secs, userRate: userData?.callCostPerSecond });
  }
  // default: provider-first
  return calcProviderFirst(postCallData, userData);
}


// Routes
app.use("/agents", agentRoutes);
app.use("/phone-numbers", phoneNumberRoutes);
app.use("/voices", voiceRoutes);
app.use("/", conversationRoutes);
app.use("/knowledge-base", knowledgeBaseRoutes);
app.use("/call", callRoutes);
app.use("/tools", toolRoutes);
app.use("/ghl", ghlRoutes);
app.use("/calcom", calRoutes);
app.use("/secrets", secretRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/batch-call", batchCallRoutes);
app.use("/llm-usage", llmUsageRoutes);
app.use("/payment", paymentRoutes);
app.use("/users", userRoutes);
app.use("/billing", billingrouter);

const secret = process.env.ELEVEN_LABS_WEBHOOK_SECRET;

// Webhook testing endpoint
app.all("/webhook", async (req, res) => {

  

  const headers = req.headers["elevenlabs-signature"].split(",");
  const timestamp = headers.find((e) => e.startsWith("t=")).substring(2);
  const signature = headers.find((e) => e.startsWith("v0="));
  // Validate timestamp
  const reqTimestamp = timestamp * 1000;
  const tolerance = Date.now() - 30 * 60 * 1000;
  if (reqTimestamp < tolerance) {
    console.log("request expired");
    res.status(403).send("Request expired");
    return;
  }

  const postCallData = req.body.data;
  const agentData = await elevenLabsService.getAgent(postCallData.agent_id);
  const conversationId = postCallData.conversation_id;
  const webhookUrl =
    agentData?.platform_settings?.workspace_overrides
      ?.conversation_initiation_client_data_webhook?.url;
console.log("webhookUrl",webhookUrl);
console.log(agentData?.platform_settings);


  if (webhookUrl) {
    try {
      // Fetch conversation audio from ElevenLabs API
      let audioData = null;
      let audioUrl = null;
      if (conversationId) {
        try {
          const elevenLabsAudioUrl = `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`;
          const audioResponse = await axios.get(elevenLabsAudioUrl, {
            headers: {
              "xi-api-key": process.env.ELEVEN_LABS_API_KEY,
            },
            responseType: "arraybuffer",
          });

          // Convert audio to base64
          audioData = Buffer.from(audioResponse.data).toString("base64");

          // Save audio to Firebase Storage
          const fileName = `conversations/${conversationId}.wav`;
          const file = bucket.file(fileName);

          // Upload the original audio buffer to Firebase Storage
          await file.save(Buffer.from(audioResponse.data), {
            metadata: {
              contentType: "audio/wav",
            },
          });

          // Make file publicly accessible and get download URL
          await file.makePublic();
          audioUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

          console.log(
            `Successfully fetched and uploaded audio for conversation: ${conversationId}`,
          );
        } catch (audioError) {
          console.error(
            `Error fetching/uploading conversation audio: ${audioError.message}`,
          );
        }
      }

      const webhookPayload = {
        filename: `${conversationId}.wav`,
        base64: audioData,
        audioUrl: audioUrl,
      };

      console.log(webhookPayload);

      const headers =
        agentData?.platform_settings?.workspace_overrides
          ?.conversation_initiation_client_data_webhook?.request_headers || {};
      await axios.post(webhookUrl, webhookPayload, { headers });
      console.log(`Successfully sent data to webhook: ${webhookUrl}`);
    } catch (error) {
      console.error(`Error sending data to webhook: ${error.message}`);
    }
  } else {
    console.log("Webhook URL is not available");
  }
 

 

 
  

  // Save conversation data to Firebase
  try {
    const agentId = postCallData.agent_id;
    const convId = postCallData.conversation_id;
    const callDurationSecs = postCallData.metadata?.call_duration_secs || 0;
    const convTimestamp = postCallData.metadata.start_time_unix_secs;

    if (!agentId || !convId) {
      console.error("Missing agent_id or conversation_id in the request body.");
      res.status(200).send();
      return;
    }

    console.log(
      `Saving conversation ${convId} for agent ${agentId} to Firebase`,
    );

    // Find the user who owns this agent
    let userId = null;

    // Query all users to find which one has this agent
    const usersSnapshot = await db.collection("users").get();

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userAgents = userData.agents || [];

      const agentExists = userAgents.some(
        (agent) => agent.agent_id === agentId,
      );

      if (agentExists) {
        userId = userDoc.id;
        break;
      }
    }

    if (!userId) {
      console.warn(`Agent ID '${agentId}' not found in any user's agents.`);
      res.status(200).send();
      return;
    }

    console.log(`Agent ID '${agentId}' belongs to User ID '${userId}'.`);

    // Get user data to fetch callCostPerSecond
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();
    const callCostPerSecond =   userData?.callCostPerSecond || 20;

    // Calculate convCost based on user's callCostPerSecond and call duration
    let convCost;
    if (callCostPerSecond && callCostPerSecond > 0) {
      convCost = callCostPerSecond * callDurationSecs;
    } else {
      // Fallback to payload cost if callCostPerSecond is not available or 0
      convCost = postCallData.metadata?.cost || 0;
    }
    let callCost=0;
    const callCredit=secondsToMinutesUpper(callDurationSecs);
   callCost=callCredit*callCostPerSecond;
    console.log({ convCost, callCostPerSecond, callDurationSecs,callCost });

        // await db.collection('users').doc(userId).set({
        //   creditsToAdd: admin.firestore.FieldValue.increment(amountUsd),
        //   balanceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // }, { merge: true });
        // console.log("rr",tt);

    // Save conversation to conv_history collection
    const convHistoryRef = db
      .collection("users")
      .doc(userId)
      .collection("conv_history")
      .doc(convId);

    // await convHistoryRef.set(postCallData);
    await convHistoryRef.set(
  { ...postCallData, callCost:callCost},
  { merge: true }
);
    console.log(
      `Conversation ID '${convId}' has been saved to 'conv_history'.`,
    );

    // Update monthly invoice
    const currentDate = new Date(convTimestamp * 1000);
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

    const invoiceRef = db
      .collection("users")
      .doc(userId)
      .collection("invoices")
      .doc(monthKey);

    await invoiceRef.set(
      {
        conv_ids: admin.firestore.FieldValue.arrayUnion(convId),
        totalConvs: admin.firestore.FieldValue.increment(1),
        totalCost: admin.firestore.FieldValue.increment(callCost),
        invoiceStatus: "pending",
        generated_at: admin.firestore.Timestamp.fromDate(new Date()),
      },
      { merge: true },
    );
    console.log("THE CONVERSATION COST", convCost);
    console.log(
      `Conversation ID '${convId}' has been added to the invoice for '${monthKey}'. Total cost updated.`,
    );

    const updatedInvoice = await invoiceRef.get();
    const invoiceData = updatedInvoice.data();
    const updatedTotalCost = invoiceData?.totalCost || 0;
console.log("updatedTotalCost",updatedTotalCost);

    const userRef = db.collection("users").doc(userId);
    await userRef.set(
      {
        //  usage: 6000,
        totalcall: admin.firestore.FieldValue.increment(1),
        LastCalluse:callCost,
        totalCall: admin.firestore.FieldValue.increment(1) ,
        totalusage: admin.firestore.FieldValue.increment(callCost),
        usage: updatedTotalCost ,
        lastCallAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (error) {
    console.error(`Error saving conversation to Firebase: ${error.message}`);
  }

  res.status(200).send();
});

app.use("/", dummyForwardTranscript);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
