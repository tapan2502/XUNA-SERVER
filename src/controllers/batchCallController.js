import { db } from "../config/firebase.js";
import { elevenLabsBatchCallService } from "../services/elevenLabsBatchCall.js";
import {
  createBatchCallSchema,
  getBatchCallSchema,
} from "../validators/batchCall.js";
import admin from "firebase-admin";

export const batchCallController = {
  async createBatchCall(req, res) {
    try {
      const { error, value } = createBatchCallSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id = req.uid;
      console.log(user_id);

      const {
        agent_id,
        agent_phone_number_id,
        recipients,
        call_name,
        scheduled_time_unix,
      } = value;

      // Create batch call in ElevenLabs
      const batchCallResponse =
        await elevenLabsBatchCallService.createBatchCall(
          agent_id,
          agent_phone_number_id,
          recipients,
          call_name,
          scheduled_time_unix
        );
      console.log(batchCallResponse);

      // Store batch call reference in Firebase
      const userRef = db.collection("users").doc(user_id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      await userRef.update({
        batch_calls: admin.firestore.FieldValue.arrayUnion({
          batch_call_id: batchCallResponse.id,
          agent_id: batchCallResponse.agent_id,
          agent_name: batchCallResponse.agent_name,
          call_name: call_name,
          created_at: new Date().toISOString(),
          status: batchCallResponse.status || "created",
        }),
      });

      res.status(201).json(batchCallResponse);
    } catch (error) {
      console.error("Error creating batch call:", error);
      res.status(500).json({ error: "Failed to create batch call" });
    }
  },

  async getBatchCall(req, res) {
    try {
      const { error, value } = getBatchCallSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id = req.uid;
      const { batch_call_id } = value;

      // Check if batch call belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const batchCallExists = userData.batch_calls?.some(
        (bc) => bc.batch_call_id === batch_call_id
      );

      if (!batchCallExists) {
        return res.status(404).json({
          error: "Batch call not found or does not belong to user",
        });
      }

      // Get batch call details from ElevenLabs
      const batchCallDetails = await elevenLabsBatchCallService.getBatchCall(
        batch_call_id
      );
      res.json(batchCallDetails);
    } catch (error) {
      console.error("Error getting batch call:", error);
      res.status(500).json({ error: "Failed to get batch call" });
    }
  },

  async listBatchCalls(req, res) {
    try {
      const user_id = req.uid;

      // Get user's batch calls from Firebase
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const userBatchCalls = userData.batch_calls || [];

      // Combine with details from ElevenLabs if needed, or just return from Firebase
      // For now, returning the stored list which contains basic info
      res.json({
        batch_calls: userBatchCalls,
      });
    } catch (error) {
      console.error("Error listing batch calls:", error);
      res.status(500).json({ error: "Failed to list batch calls" });
    }
  },
};

