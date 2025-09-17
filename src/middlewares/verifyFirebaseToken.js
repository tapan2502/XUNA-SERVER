import admin from 'firebase-admin';
import { db } from '../config/firebase.js';

export const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized: No valid authorization header provided'
      });
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized: No token provided'
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);

    const authenticatedUserId = decodedToken.uid;

    if (!authenticatedUserId) {
      return res.status(401).json({
        error: 'Unauthorized: No user ID found'
      });
    }
    const impersonateUserId = req.headers['x-impersonate-user'];
     const isAdmin = await checkIfUserIsAdmin(authenticatedUserId);

    if (isAdmin && impersonateUserId) {
      // Verify that authenticated user has admin privileges
     

      if (!isAdmin) {
        return res.status(403).json({ error: 'Insufficient privileges for impersonation' });
      }

      // Verify that target user exists
      try {
        await admin.auth().getUser(impersonateUserId);
      } catch (error) {
        return res.status(404).json({ error: 'Target user not found' });
      }
      req.uid = impersonateUserId;
      req.user = {
        originalUid: authenticatedUserId,
        isImpersonated: true
      };

      console.log(`Admin ${authenticatedUserId} impersonating user ${impersonateUserId}`);

    } else {
      // Normal authentication
      req.uid = authenticatedUserId;
      req.user = {
        uid: authenticatedUserId,
        isImpersonated: false
      };
    }

    next();
  } catch (error) {
    console.error('Firebase token verification failed:', error);
    return res.status(401).json({
      error: 'Unauthorized: Invalid or expired token'
    });
  }
};


const checkIfUserIsAdmin = async (uid) => {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    return userDoc.data()?.role === 'super-admin';
  } catch (error) {
    console.error('Error fetching user data:', error);
    return false;
  }
};