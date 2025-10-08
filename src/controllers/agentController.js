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

      const user_id = req.uid;
      const { agent_id, conversation_config, name, platform_settings } = value;

      // Check if agent belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const agentExists = userData.agents?.some(
        (agent) => agent.agent_id === agent_id
      );
      if (!agentExists) {
        return res
          .status(404)
          .json({ error: "Agent not found or does not belong to user" });
      }

      // Update agent in Eleven Labs
      const updatedAgent = await elevenLabsService.updateAgent(
        agent_id,
        name,
        conversation_config || {},
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

      const user_id = req.uid;
      const { agent_id } = req.params;

      // Check if agent belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
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

      const user_id = req.uid;
      const { agent_id } = req.params;

      // Check if agent belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();

      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
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

  async listAgents(req, res) {
    try {
      const { error, value } = listAgentsSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id = req.uid;

      // Get user's agents from Firebase
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const userAgents = userData.agents || [];

      // Get all agents from Eleven Labs
      const { agents, has_more, next_cursor } =
        await elevenLabsService.listAgents();

      // Filter agents to only include those belonging to the user
      const userAgentIds = new Set(userAgents.map((agent) => agent.agent_id));
      const filteredAgents = agents.filter((agent) =>
        userAgentIds.has(agent.agent_id)
      );

      // Merge additional user data (like custom names) with Eleven Labs data
      const enrichedAgents = filteredAgents.map((agent) => {
        const userAgent = userAgents.find(
          (ua) => ua.agent_id === agent.agent_id
        );
        return {
          ...agent,
          name: agent.name,
        };
      });

      res.json({
        agents: enrichedAgents,
        has_more,
        next_cursor,
      });
    } catch (error) {
      console.error("Error listing agents:", error);
      res.status(500).json({ error: "Failed to list agents" });
    }
  },
};
