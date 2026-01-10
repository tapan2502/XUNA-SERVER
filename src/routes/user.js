import express from "express";
import { userController } from "../controllers/userController.js";
import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();

router.post('/create', verifyFirebaseToken, authorize(['ADMIN', 'AGENCY']), userController.createUser);
router.delete('/delete', verifyFirebaseToken, authorize(['ADMIN', 'AGENCY']), userController.deleteUser);
router.get('/me', verifyFirebaseToken, userController.getUserDetails);
router.get('/workspaces', verifyFirebaseToken, authorize(['ADMIN', 'AGENCY']), userController.listWorkspaces);
router.post('/change-password', verifyFirebaseToken, userController.changePassword);

export default router;
