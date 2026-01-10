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

      const { tool_config } = value;
      const user_id = req.uid;

      // Create tool in Eleven Labs
      const elevenLabsTool = await elevenLabsToolService.createTool(tool_config);

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
      const user_id = req.uid;
      const userDoc = await db.collection("users").doc(user_id).get();

      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const accessibleToolIds = new Set((userData.tools || []).map(t => t.tool_id));

      const response = await elevenLabsToolService.listTools();
      const allTools = response.tools || [];
      const filteredTools = allTools.filter((tool) => accessibleToolIds.has(tool.id));

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

      const { tool_id } = value;
      const currentUser = req.user;
      let targetUid = currentUser.uid;

      if ((currentUser.role === 'ADMIN' || currentUser.role === 'AGENCY') && req.query.ownerUid) {
        targetUid = req.query.ownerUid;
      }

      const userDoc = await db.collection("users").doc(targetUid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      if (currentUser.role === 'AGENCY' && targetUid !== currentUser.uid) {
        if (userData.agencyId !== currentUser.uid) {
          return res.status(403).json({ error: "Access denied: User is not in your agency" });
        }
      }

      const toolExists = userData.tools?.some((tool) => tool.tool_id === tool_id);
      if (!toolExists) {
        return res.status(404).json({ error: "Tool not found or does not belong to user" });
      }

      const toolDetails = await elevenLabsToolService.getTool(tool_id);
      res.json(toolDetails);
    } catch (error) {
      console.error("Error getting tool:", error);
      res.status(500).json({ error: "Failed to get tool" });
    }
  },

  async updateTool(req, res) {
    try {
      const { error, value } = updateToolSchema.validate({ ...req.params, ...req.body });
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { tool_id, tool_config } = value;
      const currentUser = req.user;
      let targetUid = currentUser.uid;

      if ((currentUser.role === 'ADMIN' || currentUser.role === 'AGENCY') && (req.query.ownerUid || req.body.ownerUid)) {
        targetUid = req.query.ownerUid || req.body.ownerUid;
      }

      const userDoc = await db.collection("users").doc(targetUid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      if (currentUser.role === 'AGENCY' && targetUid !== currentUser.uid) {
        if (userData.agencyId !== currentUser.uid) {
          return res.status(403).json({ error: "Access denied: User is not in your agency" });
        }
      }

      const toolExists = userData.tools?.some((tool) => tool.tool_id === tool_id);
      if (!toolExists) {
        return res.status(404).json({ error: "Tool not found or does not belong to user" });
      }

      const updatedTool = await elevenLabsToolService.updateTool(tool_id, tool_config);
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
      const currentUser = req.user;
      let targetUid = currentUser.uid;

      if ((currentUser.role === 'ADMIN' || currentUser.role === 'AGENCY') && req.query.ownerUid) {
        targetUid = req.query.ownerUid;
      }

      const userDoc = await db.collection("users").doc(targetUid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      if (currentUser.role === 'AGENCY' && targetUid !== currentUser.uid) {
        if (userData.agencyId !== currentUser.uid) {
          return res.status(403).json({ error: "Access denied: User is not in your agency" });
        }
      }

      const toolExists = userData.tools?.some((tool) => tool.tool_id === tool_id);
      if (!toolExists) {
        return res.status(404).json({ error: "Tool not found or does not belong to user" });
      }

      await elevenLabsToolService.deleteTool(tool_id);
      const updatedTools = userData.tools.filter((tool) => tool.tool_id !== tool_id);
      await userDoc.ref.update({ tools: updatedTools });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tool:", error);
      res.status(500).json({ error: "Failed to delete tool" });
    }
  },
};
