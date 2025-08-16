import { app } from "./main.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  signOut
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");
const googleLoginBtn = document.getElementById("google-login-btn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authError = document.getElementById("auth-error");

const welcomeMessage = document.getElementById("welcome-message");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const noteInput = document.getElementById("note");
const addExpenseBtn = document.getElementById("add-expense-btn");
const expenseTable = document.getElementById("expense-table");
const dataError = document.getElementById("data-error");

const chartTypeSelect = document.getElementById("chart-type");
const expenseChartCanvas = document.getElementById("expense-chart");
let expenseChart;

// Google provider
const googleProvider = new GoogleAuthProvider();
// Force to always ask for account
googleProvider.setCustomParameters({ prompt: "select_account" });

// --- Auth Listeners ---

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
  } catch (err) {
    authError.innerText = err.message;
  }
});

signupBtn.addEventListener("click", async () => {
  try {
    await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
  } catch (err) {
    authError.innerText = err.message;
  }
});

googleLoginBtn.addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Check if same email exists with another method
    const methods = await fetchSignInMethodsForEmail(auth, user.email);
    if (methods.includes("password")) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      await linkWithCredential(auth.currentUser, credential);
      console.log("Google linked with existing Email/Password account");
    }
  } catch (err) {
    authError.innerText = err.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// --- Expense Tracker ---

let unsubscribeExpenses = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");

    welcomeMessage.innerText = `Welcome, ${user.displayName || user.email}!`;

    // Load expenses for this user
    const q = query(
      collection(db, "users", user.uid, "expenses"),
      orderBy("date", "desc")
    );

    if (unsubscribeExpenses) unsubscribeExpenses();

    unsubscribeExpenses = onSnapshot(q, (snapshot) => {
      expenseTable.innerHTML = "";
      const expenses = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        expenses.push({ id: docSnap.id, ...data });

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${data.amount}</td>
          <td>${data.category}</td>
          <td>${data.note || ""}</td>
          <td>${new Date(data.date).toLocaleString()}</td>
          <td><button data-id="${docSnap.id}" class="delete-btn">❌</button></td>
        `;
        expenseTable.appendChild(row);
      });

      renderChart(expenses);
    });
  } else {
    loginPage.classList.remove("hidden");
    mainPage.classList.add("hidden");
    if (unsubscribeExpenses) unsubscribeExpenses();
  }
});

// Add expense
addExpenseBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const amount = parseFloat(amountInput.value);
  const category = categoryInput.value;
  const note = noteInput.value;

  if (isNaN(amount) || amount <= 0) {
    dataError.innerText = "Enter a valid amount.";
    return;
  }
  dataError.innerText = "";

  await addDoc(collection(db, "users", user.uid, "expenses"), {
    amount,
    category,
    note,
    date: Date.now(),
  });

  amountInput.value = "";
  noteInput.value = "";
});

// Delete expense
expenseTable.addEventListener("click", async (e) => {
  if (e.target.classList.contains("delete-btn")) {
    const user = auth.currentUser;
    const id = e.target.getAttribute("data-id");
    await deleteDoc(doc(db, "users", user.uid, "expenses", id));
  }
});

// --- Chart Rendering ---
function renderChart(expenses) {
  if (expenseChart) expenseChart.destroy();

  if (chartTypeSelect.value === "bar") {
    const byCategory = {};
    expenses.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });

    expenseChart = new Chart(expenseChartCanvas, {
      type: "bar",
      data: {
        labels: Object.keys(byCategory),
        datasets: [
          {
            label: "Expenses",
            data: Object.values(byCategory),
          },
        ],
      },
    });
  } else {
    const sorted = expenses.sort((a, b) => a.date - b.date);
    expenseChart = new Chart(expenseChartCanvas, {
      type: "line",
      data: {
        labels: sorted.map((e) => new Date(e.date).toLocaleDateString()),
        datasets: [
          {
            label: "Expenses",
            data: sorted.map((e) => e.amount),
          },
        ],
      },
    });
  }
}

chartTypeSelect.addEventListener("change", () => {
  if (auth.currentUser) {
    // retrigger expenses render
    const q = query(
      collection(db, "users", auth.currentUser.uid, "expenses"),
      orderBy("date", "desc")
    );
    onSnapshot(q, (snapshot) => {
      const expenses = [];
      snapshot.forEach((docSnap) => {
        expenses.push({ id: docSnap.id, ...docSnap.data() });
      });
      renderChart(expenses);
    });
  }
});
