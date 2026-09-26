// DatingApp/config/firebase.js
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("./serviceAccountKey.json");

// Initialize the Firebase Admin App
const app = initializeApp({
  credential: cert(serviceAccount),
});

// Get the Auth service instance
const auth = getAuth(app);

module.exports = { auth };