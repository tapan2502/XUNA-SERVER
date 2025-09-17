import express from "express";
import { toolController } from "../controllers/toolController.js";
import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";

const router = express.Router();

router.post("/create",verifyFirebaseToken, toolController.createTool);
router.get("/",verifyFirebaseToken, toolController.listTools);
router.get("/:tool_id",verifyFirebaseToken, toolController.getTool);
router.patch("/:tool_id",verifyFirebaseToken, toolController.updateTool);
router.delete("/:tool_id",verifyFirebaseToken, toolController.deleteTool);

export default router;
