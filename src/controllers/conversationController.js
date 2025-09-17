import { db } from "../config/firebase.js";
import { elevenLabsConversationService } from "../services/elevenLabsConversation.js";
import {
  getConversationSchema,
} from "../validators/conversation.js";

export const conversationController = {
  async listConversations(req, res) {
    try {
      const user_id = req.uid;

      // Get user's agents from Firebase
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const userAgents = userData.agents || [];

      // Get conversations for each agent
      const conversationsPromises = userAgents.map(async (agent) => {
        try {
          const response =
            await elevenLabsConversationService.listConversations(
              agent.agent_id,
            );
          return response.conversations || [];
        } catch (error) {
          console.error(
            `Error fetching conversations for agent ${agent.agent_id}:`,
            error,
          );
          return [];
        }
      });

      const conversationsArrays = await Promise.all(conversationsPromises);

      // Combine all conversations into a single array
      const allConversations = conversationsArrays.flat();

      // Sort conversations by start time (most recent first)
      allConversations.sort(
        (a, b) => b.start_time_unix_secs - a.start_time_unix_secs,
      );

      res.json({
        conversations: allConversations,
        has_more: false,
      });
    } catch (error) {
      console.error("Error listing conversations:", error);
      res.status(500).json({ error: "Failed to list conversations" });
    }
  },

  async getConversation(req, res) {
    try {
      const { error, value } = getConversationSchema.validate({
        ...req.params,
        ...req.body,
      });
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { conversation_id } = value;
      const user_id = req.uid;

      // Verify user exists
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get conversation data and audio
      const { conversation, audio } =
        await elevenLabsConversationService.getConversation(conversation_id);

      res.json({
        conversation,
        audio,
      });
    } catch (error) {
      console.error("Error getting conversation:", error);
      res.status(500).json({ error: "Failed to get conversation" });
    }
  },
};
