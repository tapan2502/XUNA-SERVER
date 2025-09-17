import { Router } from "express";
import {
  listInvoices,
  getInvoice,
  listPayments,
  listSubscriptions,
  createPortalSession,
} from "../controllers/billinginvoice.js";
import { listActivity } from "../controllers/invoicesubandtop.js";


const billingrouter = Router();

billingrouter.get("/history", listInvoices);
billingrouter.get("/invoices/:id", getInvoice);
billingrouter.get("/payments", listPayments);
billingrouter.get("/subscriptions", listSubscriptions);
billingrouter.post("/portal", createPortalSession);
billingrouter.get('/activity', listActivity);

export default billingrouter;
