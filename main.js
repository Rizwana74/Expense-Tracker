// main.js — Firebase Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyBcCrwyvmUSgOECow7pb5Y1NVXuE-SkRiY",
  authDomain: "expensetracker-e2ed6.firebaseapp.com",
  projectId: "expensetracker-e2ed6",
  storageBucket: "expensetracker-e2ed6.appspot.com",
  messagingSenderId: "1045547401974",
  appId: "1:1045547401974:web:2d576982e58d5f21b9e2d7",
  measurementId: "G-2VD1YCZ6WG"
};

export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
