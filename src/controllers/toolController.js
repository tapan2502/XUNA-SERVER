import { db } from "../config/firebase.js";
import { elevenLabsToolService } from "../services/elevenLabsTool.js";
import {
  createToolSchema,
  getToolSchema,
  updateToolSchema,
  deleteToolSchema,
  listToolsSchema,
} from "../validators/tool.js";
import admin from "firebase-admin";

export const toolController = {
  async createTool(req, res) {
    try {
      const { error, value } = createToolSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const {  tool_config } = value;
      const user_id = req.uid;


      // Create tool in Eleven Labs
      const elevenLabsTool =
        await elevenLabsToolService.createTool(tool_config);

      // Store tool reference in Firebase
      const userRef = db.collection("users").doc(user_id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        await userRef.set({ tools: [] });
      }

      await userRef.update({
        tools: admin.firestore.FieldValue.arrayUnion({
          tool_id: elevenLabsTool.id,
          created_at: new Date().toISOString(),
        }),
      });

      res.status(201).json(elevenLabsTool);
    } catch (error) {
      console.error("Error creating tool:", error);
      res.status(500).json({ error: "Failed to create tool" });
    }
  },

  async listTools(req, res) {
    try {
      const { error, value } = listToolsSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id  = req.uid;

      // Get user's tools from Firebase
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const userTools = userData.tools || [];

      // Get all tools from Eleven Labs
      const response = await elevenLabsToolService.listTools();
      const allTools = response.tools || [];

      // Filter tools to only include those belonging to the user
      const userToolIds = new Set(userTools.map((tool) => tool.tool_id));
      const filteredTools = allTools.filter((tool) => userToolIds.has(tool.id));

      res.json({ tools: filteredTools });
    } catch (error) {
      console.error("Error listing tools:", error);
      res.status(500).json({ error: "Failed to list tools" });
    }
  },

  async getTool(req, res) {
    try {
      const { error, value } = getToolSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const {  tool_id } = value;
      const user_id = req.uid;

      // Check if tool belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const toolExists = userData.tools?.some(
        (tool) => tool.tool_id === tool_id,
      );

      if (!toolExists) {
        return res
          .status(404)
          .json({ error: "Tool not found or does not belong to user" });
      }

      // Get tool details from Eleven Labs
      const toolDetails = await elevenLabsToolService.getTool(tool_id);
      res.json(toolDetails);
    } catch (error) {
      console.error("Error getting tool:", error);
      res.status(500).json({ error: "Failed to get tool" });
    }
  },

  async updateTool(req, res) {
    try {
      const { error, value } = updateToolSchema.validate({
        ...req.params,
        ...req.body,
      });
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const {  tool_id, tool_config } = value;
      const user_id = req.uid;

      // Check if tool belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const toolExists = userData.tools?.some(
        (tool) => tool.tool_id === tool_id,
      );

      if (!toolExists) {
        return res
          .status(404)
          .json({ error: "Tool not found or does not belong to user" });
      }

      // Update tool in Eleven Labs
      const updatedTool = await elevenLabsToolService.updateTool(
        tool_id,
        tool_config,
      );
      res.json(updatedTool);
    } catch (error) {
      console.error("Error updating tool:", error);
      res.status(500).json({ error: "Failed to update tool" });
    }
  },

  async deleteTool(req, res) {
    try {
      const { error, value } = deleteToolSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { tool_id } = value;
      const user_id = req.uid;

      // Check if tool belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const toolExists = userData.tools?.some(
        (tool) => tool.tool_id === tool_id,
      );

      if (!toolExists) {
        return res
          .status(404)
          .json({ error: "Tool not found or does not belong to user" });
      }

      // Delete tool from Eleven Labs
      await elevenLabsToolService.deleteTool(tool_id);

      // Remove tool from user's tools list
      const updatedTools = userData.tools.filter(
        (tool) => tool.tool_id !== tool_id,
      );
      await userDoc.ref.update({ tools: updatedTools });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tool:", error);
      res.status(500).json({ error: "Failed to delete tool" });
    }
  },
};
