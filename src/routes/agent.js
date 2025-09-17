import express from "express";
import { agentController } from "../controllers/agentController.js";
import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";

const router = express.Router();

router.post("/create",verifyFirebaseToken ,agentController.createAgent);
router.patch(
  "/:agent_id",
  verifyFirebaseToken,
  agentController.updateAgent
);
router.delete(
  "/:agent_id",
  verifyFirebaseToken,
  agentController.deleteAgent
);
router.get(
  "/:agent_id",
  verifyFirebaseToken,
  agentController.getAgent
);
router.get("/", verifyFirebaseToken, agentController.listAgents);

export default router;