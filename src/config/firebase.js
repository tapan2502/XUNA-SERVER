import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const rawPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim();

let normalizedPrivateKey = rawPrivateKey;

// Remove trailing commas copied along with JSON
while (normalizedPrivateKey.endsWith(',')) {
  normalizedPrivateKey = normalizedPrivateKey.slice(0, -1).trimEnd();
}

// Strip wrapping quotes if present
if (
  normalizedPrivateKey.startsWith('"') &&
  normalizedPrivateKey.endsWith('"')
) {
  normalizedPrivateKey = normalizedPrivateKey.slice(1, -1);
}

normalizedPrivateKey = normalizedPrivateKey.replace(/\\n/g, '\n').trim();

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: normalizedPrivateKey,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!serviceAccount.privateKey.trim()) {
  throw new Error('FIREBASE_PRIVATE_KEY is missing or empty.');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `xpress-voice-236.firebasestorage.app`
});

export const db = admin.firestore();
export const bucket = admin.storage().bucket();
