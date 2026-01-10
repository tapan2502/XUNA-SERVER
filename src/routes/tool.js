import express from "express";
import { toolController } from "../controllers/toolController.js";
import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();

router.post("/create", verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']), toolController.createTool);
router.get("/", verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']), toolController.listTools);
router.get("/:tool_id", verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']), toolController.getTool);
router.patch("/:tool_id", verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']), toolController.updateTool);
router.delete("/:tool_id", verifyFirebaseToken, authorize(['ADMIN', 'AGENCY', 'USER']), toolController.deleteTool);

export default router;
