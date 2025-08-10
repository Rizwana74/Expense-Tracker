// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// ✅ Replace with YOUR Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBcCrwyvmUSgOECow7pb5Y1NVXuE-SkRiY",
  authDomain: "expensetracker-e2ed6.firebaseapp.com",
  projectId: "expensetracker-e2ed6",
  storageBucket: "expensetracker-e2ed6.firebasestorage.app",
  messagingSenderId: "1045547401974",
  appId: "1:1045547401974:web:2d576982e58d5f21b9e2d7",
  measurementId: "G-2VD1YCZ6WG"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
