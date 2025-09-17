import express from "express";
import multer from "multer";
import { knowledgeBaseController } from "../controllers/knowledgeBaseController.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});
import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";

const router = express.Router();

router.post(
  "/create",verifyFirebaseToken,
  upload.single("file"),
  knowledgeBaseController.createKnowledgeBase
);
router.get(
  "/:document_id",
  verifyFirebaseToken,
  knowledgeBaseController.getKnowledgeBase
);
router.delete(
  "/:document_id",
  verifyFirebaseToken,
  knowledgeBaseController.deleteKnowledgeBase
);
router.get(
  "/",
  verifyFirebaseToken,
  knowledgeBaseController.listKnowledgeBases
);
router.get(
  "/:document_id/dependent-agents",
  verifyFirebaseToken,
  knowledgeBaseController.getDependentAgents
);

export default router;
