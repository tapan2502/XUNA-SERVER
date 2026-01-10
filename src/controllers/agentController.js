import { db } from "../config/firebase.js";
import { elevenLabsService } from "../services/elevenLabs.js";
import {
  createAgentSchema,
  getAgentSchema,
  updateAgentSchema,
  deleteAgentSchema,
  listAgentsSchema,
} from "../validators/agent.js";
import admin from "firebase-admin";
import { elevenLabsPhoneNumberService } from "../services/elevenLabsPhoneNumber.js";
import { elevenLabsConversationService } from "../services/elevenLabsConversation.js";

const formatModelName = (modelId) => {
  if (!modelId) return "ChatGPT 4o";
  const map = {
    "gpt-3.5-turbo": "GPT 3.5 Turbo",
    "gpt-4": "GPT 4",
    "gpt-4o": "GPT 4o",
    "gpt-4o-mini": "GPT 4o Mini",
    "claude-3-opus": "Claude 3 Opus",
    "claude-3-sonnet": "Claude 3 Sonnet",
    "claude-3-haiku": "Claude 3 Haiku",
    "gemini-1.5-pro": "Gemini 1.5 Pro",
    "gemini-1.5-flash": "Gemini 1.5 Flash",
  };
  return map[modelId] || modelId.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
};

export const agentController = {
  async createAgent(req, res) {
    try {
      const { error, value } = createAgentSchema.validate(req.body);
      if (error) {
        console.log("invalid request");
        return res.status(400).json({ error: error.details[0].message });
      }

      // console.log(value)

      const user_id = req.uid;
      const { conversation_config, name } = req.body;
      const { use_tool_ids } = req.query;

      // Create agent in Eleven Labs
      const elevenLabsAgent = await elevenLabsService.createAgent(
        name,
        conversation_config,
        { use_tool_ids }
      );

      console.log("elevenLabsAgent", elevenLabsAgent);


      // Store agent reference in Firebase
      const userRef = db.collection("users").doc(user_id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        await userRef.set({ agents: [] });
      }

      await userRef.update({
        agents: admin.firestore.FieldValue.arrayUnion({
          agent_id: elevenLabsAgent.agent_id,
          created_at: new Date().toISOString(),
        }),
      });

      res.status(201).json(elevenLabsAgent);
    } catch (error) {
      console.error("Error creating agent:", error);
      res.status(500).json({ error: "Failed to create agent" });
    }
  },

  async updateAgent(req, res) {
    try {
      const { error, value } = updateAgentSchema.validate({
        ...req.params,
        ...req.body,
      });
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const currentUser = req.user;
      let targetUid = currentUser.uid;

      // If requester is ADMIN or AGENCY, they might be targeting another user's agent
      if ((currentUser.role === 'ADMIN' || currentUser.role === 'AGENCY') && (req.query.ownerUid || req.body.ownerUid)) {
        targetUid = req.query.ownerUid || req.body.ownerUid;
      }

      // Check if agent belongs to target user
      const userDoc = await db.collection("users").doc(targetUid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();

      // Permission check for AGENCY: can only manage self or users they created
      if (currentUser.role === 'AGENCY' && targetUid !== currentUser.uid) {
        if (userData.agencyId !== currentUser.uid) {
          return res.status(403).json({ error: "Access denied: User is not in your agency" });
        }
      }

      const agentExists = userData.agents?.some(
        (agent) => agent.agent_id === agent_id
      );
      if (!agentExists) {
        return res
          .status(404)
          .json({ error: "Agent not found or does not belong to user" });
      }

      // Update agent in Eleven Labs
      const configToSend = conversation_config || {};
      if (configToSend.agent) {
        // Clean up built_in_tools - remove null values
        if (
          configToSend.agent.prompt &&
          configToSend.agent.prompt.built_in_tools
        ) {
          configToSend.agent.prompt.built_in_tools = Object.fromEntries(
            Object.entries(configToSend.agent.prompt.built_in_tools).filter(
              ([_, value]) => value !== null
            )
          );
        }

        // Handle additional_languages - logic from reference
        if (configToSend.agent.additional_languages) {
          if (!Array.isArray(configToSend.agent.additional_languages) || configToSend.agent.additional_languages.length === 0) {
            delete configToSend.agent.additional_languages;
          }
        }
      }

      const updatedAgent = await elevenLabsService.updateAgent(
        agent_id,
        name,
        configToSend,
        platform_settings
      );

      res.json(updatedAgent);
    } catch (error) {
      console.error("Error updating agent:", error);
      res.status(500).json({ error: "Failed to update agent" });
    }
  },

  async deleteAgent(req, res) {
    try {
      const { error, value } = deleteAgentSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const currentUser = req.user;
      let targetUid = currentUser.uid;
      const { agent_id } = req.params;

      if ((currentUser.role === 'ADMIN' || currentUser.role === 'AGENCY') && req.query.ownerUid) {
        targetUid = req.query.ownerUid;
      }

      // Check if agent belongs to user
      const userDoc = await db.collection("users").doc(targetUid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();

      // Permission check for AGENCY
      if (currentUser.role === 'AGENCY' && targetUid !== currentUser.uid) {
        if (userData.agencyId !== currentUser.uid) {
          return res.status(403).json({ error: "Access denied: User is not in your agency" });
        }
      }

      const agentExists = userData.agents?.some(
        (agent) => agent.agent_id === agent_id
      );
      if (!agentExists) {
        return res
          .status(404)
          .json({ error: "Agent not found or does not belong to user" });
      }

      // Delete agent from Eleven Labs
      await elevenLabsService.deleteAgent(agent_id);

      // Remove agent from user's agents list
      const updatedAgents = userData.agents.filter(
        (agent) => agent.agent_id !== agent_id
      );
      await userDoc.ref.update({ agents: updatedAgents });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting agent:", error);
      res.status(500).json({ error: "Failed to delete agent" });
    }
  },

  async getAgent(req, res) {
    try {
      const { error, value } = getAgentSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const currentUser = req.user;
      let targetUid = currentUser.uid;
      const { agent_id } = req.params;

      if ((currentUser.role === 'ADMIN' || currentUser.role === 'AGENCY') && req.query.ownerUid) {
        targetUid = req.query.ownerUid;
      }

      // Check if agent belongs to user
      const userDoc = await db.collection("users").doc(targetUid).get();

      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();

      // Permission check for AGENCY
      if (currentUser.role === 'AGENCY' && targetUid !== currentUser.uid) {
        if (userData.agencyId !== currentUser.uid) {
          return res.status(403).json({ error: "Access denied: User is not in your agency" });
        }
      }

      const agentExists = userData.agents?.some(
        (agent) => agent.agent_id === agent_id
      );

      if (!agentExists) {
        return res
          .status(404)
          .json({ error: "Agent not found or does not belong to user" });
      }

      // Get agent details from Eleven Labs
      const agentDetails = await elevenLabsService.getAgent(agent_id);
      res.json(agentDetails);
    } catch (error) {
      console.error("Error getting agent:", error);
      res.status(500).json({ error: "Failed to get agent" });
    }
  },

  async updateAgentStatus(req, res) {
    try {
      const currentUser = req.user;
      const { agent_id } = req.params;
      const { status } = req.body;
      let targetUid = currentUser.uid;

      if ((currentUser.role === 'ADMIN' || currentUser.role === 'AGENCY') && (req.query.ownerUid || req.body.ownerUid)) {
        targetUid = req.query.ownerUid || req.body.ownerUid;
      }

      if (!status || !["active", "inactive"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const userDoc = await db.collection("users").doc(targetUid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();

      // Permission check for AGENCY
      if (currentUser.role === 'AGENCY' && targetUid !== currentUser.uid) {
        if (userData.agencyId !== currentUser.uid) {
          return res.status(403).json({ error: "Access denied: User is not in your agency" });
        }
      }

      const agents = userData.agents || [];
      const agentIndex = agents.findIndex((a) => a.agent_id === agent_id);

      if (agentIndex === -1) {
        return res.status(404).json({ error: "Agent not found" });
      }

      agents[agentIndex].status = status;
      await userDoc.ref.update({ agents });

      res.json({ message: "Status updated", status });
    } catch (error) {
      console.error("Error updating agent status:", error);
      res.status(500).json({ error: "Failed to update status" });
    }
  },

  async listAgents(req, res) {
    try {
      const user_id = req.uid;
      const userDoc = await db.collection("users").doc(user_id).get();

      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const agentsToEnrich = (userData.agents || []).map(a => ({
        ...a,
        ownerUid: user_id,
        ownerEmail: userData.email
      }));

      if (agentsToEnrich.length === 0) {
        return res.json({ agents: [], has_more: false });
      }

      const usageLimit = 6000; // Default: 100 minutes (6000 seconds)

      // Enrich each agent concurrently
      const enrichedAgents = await Promise.all(
        agentsToEnrich.map(async (ua) => {
          try {
            const details = await elevenLabsService.getAgent(ua.agent_id);
            const phoneNumber = details.phone_numbers && details.phone_numbers.length > 0
              ? details.phone_numbers[0].phone_number
              : null;

            const conversationsResponse = await elevenLabsConversationService.listConversations(ua.agent_id);
            const conversations = conversationsResponse.conversations || [];
            const totalDurationSecs = conversations.reduce((sum, conv) => sum + (conv.call_duration_secs || 0), 0);

            return {
              ...details,
              status: ua.status || "inactive",
              phoneNumber,
              usage: Math.round(totalDurationSecs / 60),
              usageMax: Math.round(usageLimit / 60),
              language: details.conversation_config?.agent?.language || "en",
              languageName: details.conversation_config?.agent?.language === "en" ? "English" : (details.conversation_config?.agent?.language || "English"),
              modelName: formatModelName(details.conversation_config?.agent?.prompt?.llm),
              ownerUid: ua.ownerUid,
              ownerEmail: ua.ownerEmail
            };
          } catch (err) {
            console.error(`Error enriching agent ${ua.agent_id}:`, err.message);
            return {
              agent_id: ua.agent_id,
              name: "Error loading",
              status: ua.status || "inactive",
            };
          }
        })
      );

      res.json({ agents: enrichedAgents });
    } catch (error) {
      console.error("Error listing agents:", error);
      res.status(500).json({ error: "Failed to list agents" });
    }
  },
};
