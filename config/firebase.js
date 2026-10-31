// DatingApp/config/firebase.js
const { initializeApp, cert, getApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const firebaseEnv = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY,
};
const hasFirebaseEnv = Object.values(firebaseEnv).some(Boolean);

if (hasFirebaseEnv && Object.values(firebaseEnv).some((value) => !value)) {
  throw new Error(
    "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must all be configured"
  );
}

const serviceAccount = hasFirebaseEnv
  ? {
      project_id: firebaseEnv.projectId,
      client_email: firebaseEnv.clientEmail,
      private_key: firebaseEnv.privateKey.replace(/\\n/g, "\n"),
    }
  : require("./serviceAccountKey.json");
const expectedProjectId = "bummps-2b7de";

if (serviceAccount.project_id !== expectedProjectId) {
  throw new Error(
    `Firebase service account project mismatch: expected ${expectedProjectId}, got ${serviceAccount.project_id || "unset"}`
  );
}

try {
  require("crypto").createPrivateKey(serviceAccount.private_key);
} catch {
  throw new Error("Firebase service account private key is malformed");
}

const app = getApps().some(({ name }) => name === "[DEFAULT]")
  ? getApp()
  : initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

if (app.options.projectId !== expectedProjectId) {
  throw new Error(
    `Firebase Admin app project mismatch: expected ${expectedProjectId}, got ${app.options.projectId || "unset"}`
  );
}

console.log(`[Firebase Admin] Initialized for project ${app.options.projectId}`);

const auth = getAuth(app);

module.exports = { auth };