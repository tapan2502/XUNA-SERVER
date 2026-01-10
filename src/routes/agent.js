import express from "express";
import { agentController } from "../controllers/agentController.js";
import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();

router.post("/create", verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']), agentController.createAgent);
router.patch(
  "/:agent_id",
  verifyFirebaseToken,
  authorize(['ADMIN', 'AGENCY', 'USER']),
  agentController.updateAgent
);
router.delete(
  "/:agent_id",
  verifyFirebaseToken,
  authorize(['ADMIN', 'AGENCY', 'USER']),
  agentController.deleteAgent
);
router.patch(
  "/:agent_id/status",
  verifyFirebaseToken,
  authorize(['ADMIN', 'AGENCY', 'USER']),
  agentController.updateAgentStatus
);
router.get(
  "/:agent_id",
  verifyFirebaseToken,
  authorize(['ADMIN', 'AGENCY', 'USER']),
  agentController.getAgent
);
router.get("/", verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']), agentController.listAgents);

export default router;