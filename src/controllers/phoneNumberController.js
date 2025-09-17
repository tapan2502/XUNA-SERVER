import { db } from "../config/firebase.js";
import { elevenLabsPhoneNumberService } from "../services/elevenLabsPhoneNumber.js";
import {
  createPhoneNumberSchema,
  getPhoneNumberSchema,
  updatePhoneNumberSchema,
  deletePhoneNumberSchema,
  listPhoneNumbersSchema,
} from "../validators/phoneNumber.js";
import admin from "firebase-admin";

export const phoneNumberController = {
  async createPhoneNumber(req, res) {
    try {
      const { error, value } = createPhoneNumberSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id = req.uid;
      const { ...phoneNumberData } = value;

      // Check if user exists and get their current phone numbers
      const userRef = db.collection("users").doc(user_id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        await userRef.set({ phoneNumbers: [] });
      } else {
        // Check for duplicate phone number
        const userData = userDoc.data();
        const existingPhoneNumber = userData.phoneNumbers?.find(
          (pn) => pn.phone_number === phoneNumberData.phone_number
        );

        if (existingPhoneNumber) {
          return res.status(409).json({
            error: "Phone number already exists for this user",
          });
        }
      }

      // Create phone number in Eleven Labs
      const elevenLabsPhoneNumber =
        await elevenLabsPhoneNumberService.createPhoneNumber(phoneNumberData);

      const phoneNumberDetails = {
        phone_number_id: elevenLabsPhoneNumber.phone_number_id,
        phone_number: phoneNumberData.phone_number,
        provider: phoneNumberData.provider,
        label: phoneNumberData.label,
        created_at: new Date().toISOString(),
        ...(phoneNumberData.provider === "twilio" && {
          sid: phoneNumberData.sid,
          token: phoneNumberData.token,
        }),
        ...(phoneNumberData.provider === "sip_trunk" && {
          credentials: phoneNumberData.credentials,
          address: phoneNumberData.address,
        }),
      };

      await userRef.update({
        phoneNumbers: admin.firestore.FieldValue.arrayUnion(phoneNumberDetails),
      });

      res.status(201).json(elevenLabsPhoneNumber);
    } catch (error) {
      console.error("Error creating phone number:", error);
      res.status(500).json({ error: "Failed to create phone number" });
    }
  },

  async getPhoneNumber(req, res) {
    try {
      const { error, value } = getPhoneNumberSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id = req.uid;
      const { phone_number_id } = req.params;

      // Check if phone number belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const phoneNumber = userData.phoneNumbers?.find(
        (pn) => pn.phone_number_id === phone_number_id
      );

      if (!phoneNumber) {
        return res
          .status(404)
          .json({ error: "Phone number not found or does not belong to user" });
      }

      // Get phone number details from Eleven Labs and combine with stored data
      const phoneNumberDetails =
        await elevenLabsPhoneNumberService.getPhoneNumber(phone_number_id);

      // Merge the stored details with the API response
      const combinedDetails = {
        ...phoneNumberDetails,
        label: phoneNumber.label,
        ...(phoneNumber.sid && { sid: phoneNumber.sid }),
        ...(phoneNumber.token && { token: phoneNumber.token }),
        ...(phoneNumber.credentials && {
          credentials: phoneNumber.credentials,
        }),
        ...(phoneNumber.address && { address: phoneNumber.address }),
      };

      res.json(combinedDetails);
    } catch (error) {
      console.error("Error getting phone number:", error);
      res.status(500).json({ error: "Failed to get phone number" });
    }
  },

  async updatePhoneNumber(req, res) {
    try {
      const { error, value } = updatePhoneNumberSchema.validate({
        ...req.params,
        ...req.body,
      });
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { phone_number_id, ...updateData } = value;

      // Check if phone number belongs to user
      const user_id = req.uid;
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const phoneNumbers = userData.phoneNumbers || [];
      const phoneNumberIndex = phoneNumbers.findIndex(
        (pn) => pn.phone_number_id === phone_number_id
      );

      if (phoneNumberIndex === -1) {
        return res
          .status(404)
          .json({ error: "Phone number not found or does not belong to user" });
      }

      // Update phone number in Eleven Labs
      const updatedPhoneNumber =
        await elevenLabsPhoneNumberService.updatePhoneNumber(
          phone_number_id,
          updateData
        );

      // Update the phone number details in Firebase
      const updatedPhoneNumbers = [...phoneNumbers];
      updatedPhoneNumbers[phoneNumberIndex] = {
        ...phoneNumbers[phoneNumberIndex],
        ...updateData,
      };

      await userDoc.ref.update({ phoneNumbers: updatedPhoneNumbers });

      res.json(updatedPhoneNumber);
    } catch (error) {
      console.error("Error updating phone number:", error);
      res.status(500).json({ error: "Failed to update phone number" });
    }
  },

  async deletePhoneNumber(req, res) {
    try {
      const { error, value } = deletePhoneNumberSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id = req.uid;
      const { phone_number_id } = req.params;

      // Check if phone number belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const phoneNumberExists = userData.phoneNumbers?.some(
        (pn) => pn.phone_number_id === phone_number_id
      );
      if (!phoneNumberExists) {
        return res
          .status(404)
          .json({ error: "Phone number not found or does not belong to user" });
      }

      // Delete phone number from Eleven Labs
      await elevenLabsPhoneNumberService.deletePhoneNumber(phone_number_id);

      const updatedPhoneNumbers = userData.phoneNumbers.filter(
        (pn) => pn.phone_number_id !== phone_number_id
      );
      await userDoc.ref.update({ phoneNumbers: updatedPhoneNumbers });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting phone number:", error);
      res.status(500).json({ error: "Failed to delete phone number" });
    }
  },

  async listPhoneNumbers(req, res) {
    try {
      const { error, value } = listPhoneNumbersSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id = req.uid;

      // Get user's phone numbers from Firebase
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const userPhoneNumbers = userData.phoneNumbers || [];

      // Get all phone numbers from Eleven Labs
      const allPhoneNumbers =
        await elevenLabsPhoneNumberService.listPhoneNumbers();

      // Combine Eleven Labs data with stored Firebase data
      const enrichedPhoneNumbers = allPhoneNumbers.map((phoneNumber) => {
        const storedPhoneNumber = userPhoneNumbers.find(
          (pn) => pn.phone_number_id === phoneNumber.phone_number_id
        );
        return storedPhoneNumber
          ? {
              ...phoneNumber,
              label: storedPhoneNumber.label,
              ...(storedPhoneNumber.sid && { sid: storedPhoneNumber.sid }),
              ...(storedPhoneNumber.token && {
                token: storedPhoneNumber.token,
              }),
              ...(storedPhoneNumber.credentials && {
                credentials: storedPhoneNumber.credentials,
              }),
              ...(storedPhoneNumber.address && {
                address: storedPhoneNumber.address,
              }),
            }
          : phoneNumber;
      });

      // Filter phone numbers to only include those belonging to the user
      const userPhoneNumberIds = new Set(
        userPhoneNumbers.map((pn) => pn.phone_number_id)
      );
      const filteredPhoneNumbers = enrichedPhoneNumbers.filter((pn) =>
        userPhoneNumberIds.has(pn.phone_number_id)
      );

      res.json(filteredPhoneNumbers);
    } catch (error) {
      console.error("Error listing phone numbers:", error);
      res.status(500).json({ error: "Failed to list phone numbers" });
    }
  },
};
