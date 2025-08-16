import { app } from "./main.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  fetchSignInMethodsForEmail,
  linkWithCredential,
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
  doc,
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const welcomeMessage = document.getElementById("welcome-message");
const addExpenseBtn = document.getElementById("add-expense-btn");
const expenseTable = document.getElementById("expense-table");
const chartCanvas = document.getElementById("expense-chart");
const chartTypeSelect = document.getElementById("chart-type");
const dataError = document.getElementById("data-error");

let expensesChart = null;
let unsubscribeExpenses = null;

/* ---------------- AUTH ---------------- */

// Email login
loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    document.getElementById("auth-error").innerText = err.message;
  }
});

// Email signup
signupBtn.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    document.getElementById("auth-error").innerText = err.message;
  }
});

// Google login (with linking fix)
googleLoginBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const email = user.email;

    // check if email already has password sign-in
    const methods = await fetchSignInMethodsForEmail(auth, email);

    if (methods.includes("password")) {
      // If user previously signed up with Email/Password, link accounts
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential) {
        try {
          await linkWithCredential(auth.currentUser, credential);
          console.log("Google account linked with email account successfully!");
        } catch (linkErr) {
          console.error("Account linking error:", linkErr);
        }
      }
    }
  } catch (err) {
    document.getElementById("auth-error").innerText = err.message;
    console.error("Google login error:", err);
  }
});

// Logout
logoutBtn.addEventListener("click", () => signOut(auth));

/* ---------------- APP ---------------- */

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
    if (expensesChart) expensesChart.destroy();
  }
});

// Load expenses
function loadExpenses(uid) {
  if (unsubscribeExpenses) unsubscribeExpenses();

  const q = query(
    collection(db, "expenses"),
    where("uid", "==", uid),
    orderBy("date", "desc")
  );

  unsubscribeExpenses = onSnapshot(q, (snapshot) => {
    expenseTable.innerHTML = "";
    const data = [];
    snapshot.forEach((docSnap) => {
      const e = docSnap.data();
      data.push({ id: docSnap.id, ...e });
      renderExpense(docSnap.id, e);
    });
    renderChart(data);
  });
}

// Render expense row
function renderExpense(id, e) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${e.amount}</td>
    <td>${e.category}</td>
    <td>${e.note || ""}</td>
    <td>${new Date(e.date).toLocaleDateString()}</td>
    <td><button class="btn outline" data-id="${id}">Delete</button></td>
  `;
  tr.querySelector("button").addEventListener("click", async () => {
    await deleteDoc(doc(db, "expenses", id));
  });
  expenseTable.appendChild(tr);
}

// Add expense
addExpenseBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const amount = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const note = document.getElementById("note").value;

  if (!amount || amount <= 0) {
    dataError.innerText = "Enter a valid amount.";
    return;
  }

  dataError.innerText = "";
  await addDoc(collection(db, "expenses"), {
    uid: user.uid,
    amount,
    category,
    note,
    date: Date.now(),
  });

  document.getElementById("amount").value = "";
  document.getElementById("note").value = "";
});

// Chart
function renderChart(data) {
  if (expensesChart) expensesChart.destroy();

  const ctx = chartCanvas.getContext("2d");
  const type = chartTypeSelect.value;

  if (data.length === 0) return;

  if (type === "bar") {
    const categories = {};
    data.forEach((e) => {
      categories[e.category] = (categories[e.category] || 0) + e.amount;
    });
    expensesChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: Object.keys(categories),
        datasets: [{ label: "Expenses", data: Object.values(categories) }],
      },
    });
  } else {
    const sorted = [...data].sort((a, b) => a.date - b.date);
    expensesChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: sorted.map((e) =>
          new Date(e.date).toLocaleDateString()
        ),
        datasets: [{ label: "Expenses", data: sorted.map((e) => e.amount) }],
      },
    });
  }
}

chartTypeSelect.addEventListener("change", () => {
  const user = auth.currentUser;
  if (user) loadExpenses(user.uid);
});
