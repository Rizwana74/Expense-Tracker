// Import Firebase SDKs directly from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBcCrwyvmUSgOECow7pb5Y1NVXuE-SkRiY",
  authDomain: "expensetracker-e2ed6.firebaseapp.com",
  projectId: "expensetracker-e2ed6",
  storageBucket: "expensetracker-e2ed6.firebasestorage.app",
  messagingSenderId: "1045547401974",
  appId: "1:1045547401974:web:2d576982e58d5f21b9e2d7",
  measurementId: "G-2VD1YCZ6WG"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Elements
const authSection = document.getElementById("authSection");
const expenseSection = document.getElementById("expenseSection");
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const addExpenseBtn = document.getElementById("addExpenseBtn");
const expenseList = document.getElementById("expenseList");

// Sign up
signupBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    alert("Account created!");
  } catch (error) {
    alert(error.message);
  }
});

// Login
loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    alert("Logged in!");
  } catch (error) {
    alert(error.message);
  }
});

// Google Login
googleLoginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
    alert("Logged in with Google!");
  } catch (error) {
    alert(error.message);
  }
});

// Logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  alert("Logged out!");
});

// Add expense
addExpenseBtn.addEventListener("click", async () => {
  const amount = document.getElementById("amount").value;
  const category = document.getElementById("category").value;
  const note = document.getElementById("note").value;
  const user = auth.currentUser;
  if (!user) return alert("Please login first");

  try {
    await addDoc(collection(db, "expenses"), {
      amount,
      category,
      note,
      uid: user.uid,
      date: new Date().toLocaleString()
    });
    alert("Expense added!");
    loadExpenses(user.uid);
  } catch (error) {
    alert(error.message);
  }
});

// Load expenses
async function loadExpenses(uid) {
  expenseList.innerHTML = "";
  const q = query(collection(db, "expenses"), where("uid", "==", uid));
  const querySnapshot = await getDocs(q);
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    expenseList.innerHTML += `
      <tr>
        <td>${data.amount}</td>
        <td>${data.category}</td>
        <td>${data.note}</td>
        <td>${data.date}</td>
      </tr>`;
  });
}

// Auth state change
onAuthStateChanged(auth, (user) => {
  if (user) {
    authSection.classList.add("hidden");
    expenseSection.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    loadExpenses(user.uid);
  } else {
    authSection.classList.remove("hidden");
    expenseSection.classList.add("hidden");
    logoutBtn.classList.add("hidden");
  }
});
