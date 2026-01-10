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
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();

router.post(
  "/create", verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']),
  upload.single("file"),
  knowledgeBaseController.createKnowledgeBase
);
router.get(
  "/:document_id",
  verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']),
  knowledgeBaseController.getKnowledgeBase
);
router.delete(
  "/:document_id",
  verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']),
  knowledgeBaseController.deleteKnowledgeBase
);
router.get(
  "/",
  verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']),
  knowledgeBaseController.listKnowledgeBases
);
router.get(
  "/:document_id/dependent-agents",
  verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']),
  knowledgeBaseController.getDependentAgents
);

export default router;
