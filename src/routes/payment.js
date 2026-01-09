import express from "express";
import { paymentController } from "../controllers/paymentController.js";
import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";

const router = express.Router();

// Customer management
router.post("/create-customer", verifyFirebaseToken, paymentController.createCustomer);

// Subscription management
router.post(
  "/create-plan-subscription-session",
  verifyFirebaseToken,
  paymentController.createPlanSubscriptionSession
);
router.get(
  "/check-active-subscription",
  paymentController.checkActiveSubscription
);

// Payment method setup and management
router.post(
  "/setup-subscription-payment-method",
  verifyFirebaseToken,
  paymentController.setupSubscriptionPaymentMethod
);
router.get(
  "/check-payment-method-setup",
  paymentController.checkPaymentMethodSetup
);

// Invoice management
router.get("/invoices/:customer_id", paymentController.getInvoices);

// Manual charge
router.post(
  "/charge-payment-method",
  verifyFirebaseToken,
  paymentController.chargePaymentMethod
);

router.post(
  "/create-topup-session",
  verifyFirebaseToken,
  paymentController.createTopupSession
);

router.get(
  "/user-balance-usage",
  verifyFirebaseToken,
  paymentController.getUserBalanceAndUsage
);

router.post(
  "/invoice-payment",
  verifyFirebaseToken,
  paymentController.invoicePayment
);

export default router;
