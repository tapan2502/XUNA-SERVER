import express from "express";
import { dashboardController } from "../controllers/dashboardController.js";

const router = express.Router();

import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";
router.get(
  "/",
  verifyFirebaseToken,
  dashboardController.getUserDashboard
);

export default router;