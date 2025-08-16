// app.js
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  fetchSignInMethodsForEmail,
  linkWithCredential
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

import { app } from "./main.js";

// Firebase init
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// DOM elements
const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const googleBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const authError = document.getElementById("auth-error");
const dataError = document.getElementById("data-error");
const welcomeMessage = document.getElementById("welcome-message");

const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const noteInput = document.getElementById("note");
const addExpenseBtn = document.getElementById("add-expense-btn");
const expenseTable = document.getElementById("expense-table");
const chartTypeSelect = document.getElementById("chart-type");
const expenseChart = document.getElementById("expense-chart");

let unsubscribeExpenses = null;
let chartInstance = null;

// ---------------- AUTH ----------------

// Email login
loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    authError.innerText = error.message;
  }
});

// Email signup
signupBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    authError.innerText = error.message;
  }
});

// Google login (with account linking fix)
googleBtn.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Check if this Google account already exists with another method
    const methods = await fetchSignInMethodsForEmail(auth, user.email);
    if (methods.length > 0 && !methods.includes("google.com")) {
      // Link Google to the existing account (same email)
      const credential = GoogleAuthProvider.credentialFromResult(result);
      try {
        await linkWithCredential(auth.currentUser, credential);
        console.log("Google account linked to existing email account.");
      } catch (linkError) {
        console.warn("Linking failed:", linkError);
      }
    }
  } catch (error) {
    console.error("Google login error:", error);
    authError.innerText = "Google sign-in failed!";
  }
});

// Logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// Auth state observer
onAuthStateChanged(auth, (user) => {
  if (user) {
    showMainPage(user);
    loadExpenses(user.uid);
  } else {
    showLoginPage();
  }
});

// ---------------- UI HANDLERS ----------------
function showLoginPage() {
  loginPage.classList.remove("hidden");
  mainPage.classList.add("hidden");
  authError.innerText = "";
  if (unsubscribeExpenses) unsubscribeExpenses();
}

function showMainPage(user) {
  loginPage.classList.add("hidden");
  mainPage.classList.remove("hidden");
  welcomeMessage.innerText = `Welcome, ${user.displayName || user.email}`;
}

// ---------------- FIRESTORE (EXPENSES) ----------------
addExpenseBtn.addEventListener("click", async () => {
  const amount = parseFloat(amountInput.value);
  const category = categoryInput.value;
  const note = noteInput.value;

  if (isNaN(amount) || amount <= 0) {
    dataError.innerText = "Enter a valid amount.";
    return;
  }
  dataError.innerText = "";

  try {
    await addDoc(collection(db, "expenses"), {
      uid: auth.currentUser.uid,
      amount,
      category,
      note,
      date: new Date().toISOString()
    });
    amountInput.value = "";
    noteInput.value = "";
  } catch (error) {
    dataError.innerText = error.message;
  }
});

function loadExpenses(uid) {
  if (unsubscribeExpenses) unsubscribeExpenses();

  const q = query(
    collection(db, "expenses"),
    where("uid", "==", uid),
    orderBy("date", "desc")
  );

  unsubscribeExpenses = onSnapshot(q, (snapshot) => {
    const expenses = [];
    expenseTable.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const exp = { id: docSnap.id, ...docSnap.data() };
      expenses.push(exp);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${exp.amount}</td>
        <td>${exp.category}</td>
        <td>${exp.note || ""}</td>
        <td>${new Date(exp.date).toLocaleString()}</td>
        <td><button data-id="${exp.id}" class="delete-btn">Delete</button></td>
      `;
      expenseTable.appendChild(tr);
    });

    // Hook up delete buttons
    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.getAttribute("data-id");
        await deleteDoc(doc(db, "expenses", id));
      });
    });

    renderChart(expenses);
  });
}

// ---------------- CHARTS ----------------
chartTypeSelect.addEventListener("change", () => {
  if (auth.currentUser) loadExpenses(auth.currentUser.uid);
});

function renderChart(expenses) {
  if (chartInstance) {
    chartInstance.destroy();
  }

  const ctx = expenseChart.getContext("2d");
  const type = chartTypeSelect.value;

  if (type === "bar") {
    // Group by category
    const totals = {};
    expenses.forEach((e) => {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
    });

    chartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: Object.keys(totals),
        datasets: [
          {
            label: "Expenses by Category",
            data: Object.values(totals),
            backgroundColor: "rgba(75,192,192,0.6)"
          }
        ]
      }
    });
  } else {
    // Line chart over time
    const sorted = [...expenses].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: sorted.map((e) =>
          new Date(e.date).toLocaleDateString()
        ),
        datasets: [
          {
            label: "Expenses Over Time",
            data: sorted.map((e) => e.amount),
            borderColor: "rgba(153,102,255,1)",
            fill: false
          }
        ]
      }
    });
  }
}
