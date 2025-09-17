import express from "express";
import { batchCallController } from "../controllers/batchCallController.js";
import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";
const router = express.Router();

router.post("/",verifyFirebaseToken, batchCallController.createBatchCall);
 
router.get(
  "/:batch_call_id",
  verifyFirebaseToken,
  batchCallController.getBatchCall
);

export default router;
