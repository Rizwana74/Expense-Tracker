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

const auth = getAuth(app);
const db = getFirestore(app);

// Elements
const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authError = document.getElementById("auth-error");
const welcomeMessage = document.getElementById("welcome-message");
const addExpenseBtn = document.getElementById("add-expense-btn");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const noteInput = document.getElementById("note");
const dataError = document.getElementById("data-error");
const expenseTable = document.getElementById("expense-table");
const chartTypeSelect = document.getElementById("chart-type");
const chartCanvas = document.getElementById("expense-chart");

let unsubscribeExpenses = null;
let expenseChart = null;

// ---------------------- AUTH ----------------------

// Email login
loginBtn.addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
    authError.innerText = "";
  } catch (err) {
    authError.innerText = err.message;
  }
});

// Email signup
signupBtn.addEventListener("click", async () => {
  try {
    await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
    authError.innerText = "";
  } catch (err) {
    authError.innerText = err.message;
  }
});

// Google login (✅ Fixed linking issue)
googleLoginBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // check if this email already has password login
    const methods = await fetchSignInMethodsForEmail(auth, user.email);
    if (methods.includes("password")) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      await linkWithCredential(auth.currentUser, credential);
      console.log("Google account linked to existing email/password account ✅");
    }
  } catch (err) {
    console.error("Google sign-in error:", err);
    authError.innerText = "Google sign-in failed!";
  }
});

// Logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// ---------------------- MAIN APP ----------------------

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");
    welcomeMessage.innerText = `Welcome, ${user.displayName || user.email}!`;
    loadExpenses(user.uid);
  } else {
    loginPage.classList.remove("hidden");
    mainPage.classList.add("hidden");
    welcomeMessage.innerText = "Welcome!";
    if (unsubscribeExpenses) unsubscribeExpenses();
  }
});

// Add expense
addExpenseBtn.addEventListener("click", async () => {
  const amount = parseFloat(amountInput.value);
  const category = categoryInput.value;
  const note = noteInput.value;

  if (isNaN(amount) || amount <= 0) {
    dataError.innerText = "Enter a valid amount.";
    return;
  }

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
    dataError.innerText = "";
  } catch (err) {
    dataError.innerText = err.message;
  }
});

// ---------------------- EXPENSES + CHART ----------------------

function loadExpenses(uid) {
  if (unsubscribeExpenses) unsubscribeExpenses();

  const q = query(
    collection(db, "expenses"),
    where("uid", "==", uid),
    orderBy("date", "desc")
  );

  unsubscribeExpenses = onSnapshot(q, (snapshot) => {
    let expenses = [];
    expenseTable.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const exp = { id: docSnap.id, ...docSnap.data() };
      expenses.push(exp);
      addExpenseToTable(exp);
    });
    updateChart(expenses);
  });
}

function addExpenseToTable(expense) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${expense.amount.toFixed(2)}</td>
    <td>${expense.category}</td>
    <td>${expense.note || ""}</td>
    <td>${new Date(expense.date).toLocaleString()}</td>
    <td><button data-id="${expense.id}" class="delete-btn">Delete</button></td>
  `;
  expenseTable.appendChild(tr);

  tr.querySelector(".delete-btn").addEventListener("click", async () => {
    await deleteDoc(doc(db, "expenses", expense.id));
  });
}

chartTypeSelect.addEventListener("change", () => {
  if (auth.currentUser) loadExpenses(auth.currentUser.uid);
});

function updateChart(expenses) {
  if (expenseChart) expenseChart.destroy();

  const type = chartTypeSelect.value;
  if (type === "bar") {
    // bar chart by category
    const categories = {};
    expenses.forEach((e) => {
      categories[e.category] = (categories[e.category] || 0) + e.amount;
    });

    expenseChart = new Chart(chartCanvas, {
      type: "bar",
      data: {
        labels: Object.keys(categories),
        datasets: [
          {
            label: "Expenses by Category",
            data: Object.values(categories),
          },
        ],
      },
    });
  } else {
    // line chart by time
    const sorted = expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
    expenseChart = new Chart(chartCanvas, {
      type: "line",
      data: {
        labels: sorted.map((e) => new Date(e.date).toLocaleDateString()),
        datasets: [
          {
            label: "Expenses Over Time",
            data: sorted.map((e) => e.amount),
          },
        ],
      },
    });
  }
}
