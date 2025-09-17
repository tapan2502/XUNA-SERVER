import express from "express";
import { phoneNumberController } from "../controllers/phoneNumberController.js";
import { verifyFirebaseToken } from "../middlewares/verifyFirebaseToken.js";

const router = express.Router();

router.post("/create",verifyFirebaseToken, phoneNumberController.createPhoneNumber);
router.get(
  "/:phone_number_id",
  verifyFirebaseToken,
  phoneNumberController.getPhoneNumber
);
router.patch(
  "/:phone_number_id",verifyFirebaseToken,
  phoneNumberController.updatePhoneNumber
);
router.delete(
  "/:phone_number_id",verifyFirebaseToken,
  phoneNumberController.deletePhoneNumber
);
router.get(
  "/",
  verifyFirebaseToken,
  phoneNumberController.listPhoneNumbers
);

export default router;
