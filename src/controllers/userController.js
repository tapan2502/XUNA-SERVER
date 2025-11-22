
import { db } from "../config/firebase.js";
import admin from "firebase-admin";
import { deleteUserSchema } from "../validators/user.js";

export const userController = {
  async deleteUser(req, res) {
    try {
      const { error, value } = deleteUserSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { targetUserId } = value;
      const currentUserId = req.uid;
      if (!currentUserId) {
        return res.status(401).json({ error: 'Unauthorized: No user ID found in request' });
      }

      // First, verify that the current user is a super-admin
      const currentUserDoc = await db.collection('users').doc(currentUserId).get();

      if (!currentUserDoc.exists) {
        return res.status(404).json({ error: 'Current user not found' });
      }

      const currentUserData = currentUserDoc.data();

      // Check if the current user has super-admin role
      if (currentUserData.role !== 'super-admin') {
        return res.status(403).json({
          error: 'Access denied. Only super-admin users can delete other users.'
        });
      }

      // Verify target user exists
      const targetUserDoc = await db.collection('users').doc(targetUserId).get();
      if (!targetUserDoc.exists) {
        return res.status(404).json({ error: 'Target user not found' });
      }

      const targetUserData = targetUserDoc.data();

      // Start batch operations
      const batch = db.batch();

      // 1. Delete the target user document
      batch.delete(db.collection('users').doc(targetUserId));

      // 2. Remove target user from current user's sentRequests
      const newSentRequests = { ...currentUserData.sentRequests };
      delete newSentRequests[targetUserId];

      batch.update(db.collection('users').doc(currentUserId), {
        sentRequests: newSentRequests,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 3. Get all users to clean up references
      const allUsersSnapshot = await db.collection('users').get();

      allUsersSnapshot.docs.forEach(userDoc => {
        if (userDoc.id === targetUserId || userDoc.id === currentUserId) return;

        const userData = userDoc.data();
        let needsUpdate = false;
        const updates = {};

        // Remove from sentRequests
        if (userData.sentRequests && userData.sentRequests[targetUserId]) {
          const newSentRequests = { ...userData.sentRequests };
          delete newSentRequests[targetUserId];
          updates.sentRequests = newSentRequests;
          needsUpdate = true;
        }

        // Remove from receivedRequests
        if (userData.receivedRequests && userData.receivedRequests[targetUserId]) {
          const newReceivedRequests = { ...userData.receivedRequests };
          delete newReceivedRequests[targetUserId];
          updates.receivedRequests = newReceivedRequests;
          needsUpdate = true;
        }

        if (needsUpdate) {
          updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
          batch.update(db.collection('users').doc(userDoc.id), updates);
        }
      });

      // Execute all operations
      await batch.commit();

      // Try to delete from Firebase Auth (optional - may fail if no permissions)
      try {
        await admin.auth().deleteUser(targetUserId);
        console.log('User deleted from Firebase Auth:', targetUserId);
      } catch (authError) {
        console.warn('Could not delete from Firebase Auth:', authError.message);
        // Continue - Firestore deletion was successful
      }

      res.json({
        success: true,
        message: `User ${targetUserData.email} has been successfully deleted`,
        deletedUserId: targetUserId
      });

    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },
  async getUserDetails(req, res) {
    try {
      const userId = req.uid;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = userDoc.data();
      // Return relevant user details
      res.json({
        uid: userId,
        email: userData.email,
        name: userData.name || null,
        role: userData.role || 'user',
        photoURL: userData.photoURL || null,
        createdAt: userData.createdAt,
        batch_calls: userData.batch_calls || [],
        // Add other fields as needed
      });
    } catch (error) {
      console.error('Error fetching user details:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async changePassword(req, res) {
    try {
      const { password } = req.body;
      const userId = req.uid;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      await admin.auth().updateUser(userId, {
        password: password,
      });

      res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
      console.error('Error updating password:', error);
      res.status(500).json({ error: 'Failed to update password', details: error.message });
    }
  }
};
