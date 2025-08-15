// Firebase CDN modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// KEEP your config (these are the ones you shared)
const firebaseConfig = {
  apiKey: "AIzaSyBcCrwyvmUSgOECow7pb5Y1NVXuE-SkRiY",
  authDomain: "expensetracker-e2ed6.firebaseapp.com",
  projectId: "expensetracker-e2ed6",
  storageBucket: "expensetracker-e2ed6.firebasestorage.app",
  messagingSenderId: "1045547401974",
  appId: "1:1045547401974:web:2d576982e58d5f21b9e2d7",
  measurementId: "G-2VD1YCZ6WG"
};

// Init + exports
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
