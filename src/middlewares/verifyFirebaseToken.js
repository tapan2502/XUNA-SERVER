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

      // Hydrate req.user with Firestore data
      const userDoc = await db.collection('users').doc(authenticatedUserId).get();
      const userData = userDoc.exists ? userDoc.data() : { role: 'USER' }; // Default to USER if document doesn't exist yet

      const impersonateUserId = req.headers['x-impersonate-user'];
      const isAdmin = userData.role === 'ADMIN';
      const isAgency = userData.role === 'AGENCY';

      if ((isAdmin || isAgency) && impersonateUserId) {
        // Impersonation logic for ADMIN and AGENCY
        try {
          const targetUserDoc = await db.collection('users').doc(impersonateUserId).get();
          if (!targetUserDoc.exists) {
            return res.status(404).json({ error: 'Target user not found' });
          }

          const targetUserData = targetUserDoc.data();

          // Permission check for AGENCY
          if (isAgency) {
            // AGENCY can only impersonate users where agencyId matches their UID
            if (targetUserData.agencyId !== authenticatedUserId) {
              console.warn(`[Auth] AGENCY ${authenticatedUserId} attempted to impersonate user ${impersonateUserId} from different agency`);
              return res.status(403).json({ error: 'Cannot impersonate user from different agency' });
            }
          }
          // ADMIN can impersonate anyone (no additional check needed)

          // Set req.user to the impersonated user
          req.user = {
            uid: impersonateUserId,
            role: targetUserData.role || 'USER',
            agencyId: targetUserData.agencyId,
            workspaceId: targetUserData.workspaceId,
            isActive: targetUserData.isActive !== false,
            _impersonatedBy: authenticatedUserId, // Track who is impersonating
            _impersonatorRole: userData.role
          };
          console.log(`[Auth] ${userData.role} ${authenticatedUserId} impersonating ${impersonateUserId}`);
        } catch (error) {
          console.error('[Auth] Impersonation failed:', error.message);
          return res.status(500).json({ error: 'Impersonation failed' });
        }
      } else {
        // Normal authentication
        req.uid = authenticatedUserId;
        req.user = {
          ...userData,
          uid: authenticatedUserId,
          isImpersonated: false
        };
      }

      // Always set req.uid to the active user's UID (normal or impersonated)
      req.uid = req.user.uid;

      // Check if account is active
      if (req.user.isActive === false) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }

      next();
    } catch (verifyError) {
      console.error('[Auth] Firebase Token Verification Failed:', verifyError.message);
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