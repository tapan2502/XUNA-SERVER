import { db } from "../config/firebase.js";
import { elevenLabsKnowledgeBaseService } from "../services/elevenLabsKnowledgeBase.js";
import {
  createKnowledgeBaseSchema,
  getKnowledgeBaseSchema,
  deleteKnowledgeBaseSchema,
  listKnowledgeBasesSchema,
  getDependentAgentsSchema,
} from "../validators/knowledgeBase.js";
import admin from "firebase-admin";

export const knowledgeBaseController = {
  
  async createKnowledgeBase(req, res) {
    const user_id = req.uid;
    try {
      const { error, value } = createKnowledgeBaseSchema.validate({
        // user_id: req.uid,
        url: req.body.url,
      });

      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      
      const { url } = req.body;

      // Validate that either file or URL is provided
      if (!req.file && !url) {
        return res
          .status(400)
          .json({ error: "Either file or URL must be provided" });
      }

      // Create knowledge base in Eleven Labs
      const elevenLabsKnowledgeBase =
        await elevenLabsKnowledgeBaseService.createKnowledgeBase(
          req.file, // Multer adds the file to req.file
          url
        );

      // Store knowledge base reference in Firebase
      const userRef = db.collection("users").doc(user_id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        await userRef.set({ knowledgeBases: [] });
      }

      await userRef.update({
        knowledgeBases: admin.firestore.FieldValue.arrayUnion({
          document_id: elevenLabsKnowledgeBase.id,
          created_at: new Date().toISOString(),
        }),
      });

      res.status(201).json(elevenLabsKnowledgeBase);
    } catch (error) {
      console.error("Error creating knowledge base:", error);
      res.status(500).json({ error: "Failed to create knowledge base" });
    }
  },

  async getKnowledgeBase(req, res) {
    try {
      const { error, value } = getKnowledgeBaseSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id = req.uid;
      const { document_id } = req.params;

      // Check if knowledge base belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const knowledgeBaseExists = userData.knowledgeBases?.some(
        (kb) => kb.document_id === document_id
      );

      if (!knowledgeBaseExists) {
        return res.status(404).json({
          error: "Knowledge base not found or does not belong to user",
        });
      }

      // Get knowledge base details from Eleven Labs
      const knowledgeBaseDetails =
        await elevenLabsKnowledgeBaseService.getKnowledgeBase(document_id);
      res.json(knowledgeBaseDetails);
    } catch (error) {
      console.error("Error getting knowledge base:", error);
      res.status(500).json({ error: "Failed to get knowledge base" });
    }
  },

  async deleteKnowledgeBase(req, res) {
    try {
      const { error, value } = deleteKnowledgeBaseSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id = req.uid;
      const { document_id } = req.params;

      // Check if knowledge base belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const knowledgeBaseExists = userData.knowledgeBases?.some(
        (kb) => kb.document_id === document_id
      );

      if (!knowledgeBaseExists) {
        return res.status(404).json({
          error: "Knowledge base not found or does not belong to user",
        });
      }

      // Delete knowledge base from Eleven Labs
      const response = await elevenLabsKnowledgeBaseService.deleteKnowledgeBase(
        document_id
      );

      // Remove knowledge base from user's list
      const updatedKnowledgeBases = userData.knowledgeBases.filter(
        (kb) => kb.document_id !== document_id
      );
      await userDoc.ref.update({ knowledgeBases: updatedKnowledgeBases });

      res.json(response);
    } catch (error) {
      console.error("Error deleting knowledge base:", error);
      res.status(500).json({ error: "Failed to delete knowledge base" });
    }
  },

  async listKnowledgeBases(req, res) {
    try {
      const { error, value } = listKnowledgeBasesSchema.validate({
        ...req.params,
        ...req.query,
      });

      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id = req.uid;
      const { cursor, page_size } = value;

      // Get user's knowledge bases from Firebase
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const userKnowledgeBases = userData.knowledgeBases || [];

      // Get all knowledge bases from Eleven Labs with pagination
      const response = await elevenLabsKnowledgeBaseService.listKnowledgeBases(
        cursor,
        page_size
      );
      const { documents, has_more, next_cursor } = response;

      // Filter knowledge bases to only include those belonging to the user
      const userKnowledgeBaseIds = new Set(
        userKnowledgeBases.map((kb) => kb.document_id)
      );
      const filteredDocuments = documents.filter((doc) =>
        userKnowledgeBaseIds.has(doc.id)
      );

      res.json({
        documents: filteredDocuments,
        has_more,
        next_cursor,
      });
    } catch (error) {
      console.error("Error listing knowledge bases:", error);
      res.status(500).json({ error: "Failed to list knowledge bases" });
    }
  },

  async getDependentAgents(req, res) {
    try {
      const { error, value } = getDependentAgentsSchema.validate({
        ...req.params,
        ...req.query,
      });

      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user_id = req.uid;
      const { document_id, cursor, page_size } = value;

      // Check if knowledge base belongs to user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const knowledgeBaseExists = userData.knowledgeBases?.some(
        (kb) => kb.document_id === document_id
      );

      if (!knowledgeBaseExists) {
        return res.status(404).json({
          error: "Knowledge base not found or does not belong to user",
        });
      }

      // Get dependent agents from Eleven Labs
      const response = await elevenLabsKnowledgeBaseService.getDependentAgents(
        document_id,
        cursor,
        page_size
      );

      res.json(response);
    } catch (error) {
      console.error("Error getting dependent agents:", error);
      res.status(500).json({ error: "Failed to get dependent agents" });
    }
  },
};
