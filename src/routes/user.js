
import express from "express";
import { userController } from "../controllers/userController.js";
import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";

const router = express.Router();

router.delete('/delete', verifyFirebaseToken , userController.deleteUser);

export default router;
