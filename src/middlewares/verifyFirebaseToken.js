import admin from 'firebase-admin';
import { db } from '../config/firebase.js';

export const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('[Auth] Missing or invalid Authorization header');
      return res.status(401).json({
        error: 'Unauthorized: No valid authorization header provided'
      });
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      console.warn('[Auth] Bearer token is empty');
      return res.status(401).json({
        error: 'Unauthorized: No token provided'
      });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      const authenticatedUserId = decodedToken.uid;

      if (!authenticatedUserId) {
        console.warn('[Auth] Token decoded but UID is missing');
        return res.status(401).json({
          error: 'Unauthorized: No user ID found'
        });
      }

      const impersonateUserId = req.headers['x-impersonate-user'];
      const isAdmin = await checkIfUserIsAdmin(authenticatedUserId);

      if (isAdmin && impersonateUserId) {
        // Administration impersonation logic...
        try {
          await admin.auth().getUser(impersonateUserId);
          req.uid = impersonateUserId;
          req.user = { originalUid: authenticatedUserId, isImpersonated: true };
          console.log(`[Auth] Admin ${authenticatedUserId} impersonating ${impersonateUserId}`);
        } catch (error) {
          console.error('[Auth] Impersonation target not found:', impersonateUserId);
          return res.status(404).json({ error: 'Target user not found' });
        }
      } else {
        // Normal authentication
        req.uid = authenticatedUserId;
        req.user = { uid: authenticatedUserId, isImpersonated: false };
      }

      next();
    } catch (verifyError) {
      console.error('[Auth] Firebase Token Verification Failed:', verifyError.message);
      // This is usually where Project ID mismatch errors show up
      return res.status(401).json({
        error: 'Unauthorized: Invalid or expired token',
        details: verifyError.message
      });
    }
  } catch (error) {
    console.error('[Auth] Internal Middleware Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
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