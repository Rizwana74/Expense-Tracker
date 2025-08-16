import { app } from "./main.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  fetchSignInMethodsForEmail,
  EmailAuthProvider,
  linkWithCredential
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

// Init
const auth = getAuth(app);
const db = getFirestore(app);

// DOM
const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");
const authError = document.getElementById("auth-error");
const dataError = document.getElementById("data-error");
const welcomeMessage = document.getElementById("welcome-message");
const tableBody = document.getElementById("expense-table");
const chartType = document.getElementById("chart-type");
const ctx = document.getElementById("expense-chart").getContext("2d");

let unsubscribe = null;
let chart = null;

// Auth listeners
document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    authError.textContent = err.message;
  }
});

document.getElementById("signup-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    authError.textContent = err.message;
  }
});

document.getElementById("google-login-btn").addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Check if this Google account already exists with Email/Password
    const methods = await fetchSignInMethodsForEmail(auth, user.email);

    if (methods.includes("password")) {
      const password = prompt("You already signed up with Email/Password. Enter your password once to link with Google:");
      if (password) {
        const emailCred = EmailAuthProvider.credential(user.email, password);
        await linkWithCredential(user, emailCred);
        console.log("Google account linked with Email/Password account!");
      }
    }

  } catch (err) {
    authError.textContent = err.message;
  }
});

document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

// Auth state change
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");
    welcomeMessage.textContent = `Welcome, ${user.displayName || user.email}`;

    loadExpenses(user.uid);
  } else {
    loginPage.classList.remove("hidden");
    mainPage.classList.add("hidden");
    if (unsubscribe) unsubscribe();
  }
});

// Expense Add
document.getElementById("add-expense-btn").addEventListener("click", async () => {
  const amount = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const note = document.getElementById("note").value;

  if (isNaN(amount) || amount <= 0) {
    dataError.textContent = "Enter a valid amount.";
    return;
  }

  dataError.textContent = "";

  try {
    await addDoc(collection(db, "users", auth.currentUser.uid, "expenses"), {
      amount,
      category,
      note,
      date: new Date()
    });

    document.getElementById("amount").value = "";
    document.getElementById("note").value = "";
  } catch (err) {
    dataError.textContent = err.message;
  }
});

// Load expenses
function loadExpenses(uid) {
  if (unsubscribe) unsubscribe();

  const q = query(collection(db, "users", uid, "expenses"), orderBy("date", "asc"));

  unsubscribe = onSnapshot(q, (snapshot) => {
    const expenses = [];
    tableBody.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      expenses.push({ id: docSnap.id, ...data });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${data.amount}</td>
        <td>${data.category}</td>
        <td>${data.note || ""}</td>
        <td>${data.date.toDate().toLocaleString()}</td>
        <td><button data-id="${docSnap.id}" class="delete-btn">❌</button></td>
      `;
      tableBody.appendChild(tr);
    });

    updateChart(expenses);

    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await deleteDoc(doc(db, "users", uid, "expenses", btn.dataset.id));
      });
    });
  });
}

// Update chart
function updateChart(expenses) {
  if (chart) chart.destroy();

  const type = chartType.value;

  if (type === "bar") {
    const totals = {};
    expenses.forEach(e => {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
    });

    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: Object.keys(totals),
        datasets: [{
          label: "Expenses by Category",
          data: Object.values(totals)
        }]
      }
    });
  } else {
    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: expenses.map(e => e.date.toDate().toLocaleDateString()),
        datasets: [{
          label: "Expenses Over Time",
          data: expenses.map(e => e.amount)
        }]
      }
    });
  }
}

chartType.addEventListener("change", () => {
  if (auth.currentUser) loadExpenses(auth.currentUser.uid);
});
