import express from "express";
import { conversationController } from "../controllers/conversationController.js";
import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";

const router = express.Router();

router.get("/list-conversations", verifyFirebaseToken, conversationController.listConversations);
router.get(
  "/get-conversation/:conversation_id",
  verifyFirebaseToken,
  conversationController.getConversation,
);

export default router;
