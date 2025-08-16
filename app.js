import { app } from "./main.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
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

const auth = getAuth(app);
const db = getFirestore(app);

// Force Google chooser every time ✅
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// DOM elements
const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authError = document.getElementById("auth-error");

const addExpenseBtn = document.getElementById("add-expense-btn");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const noteInput = document.getElementById("note");
const dataError = document.getElementById("data-error");
const expenseTable = document.getElementById("expense-table");
const welcomeMessage = document.getElementById("welcome-message");

let unsubscribe = null;
let chart = null;

// ---------------- AUTH ----------------

// Email login
loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  try {
    await signInWithEmailAndPassword(auth, email, password);
    authError.textContent = "";
  } catch (error) {
    authError.textContent = error.message;
  }
});

// Email signup
signupBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    authError.textContent = "";
  } catch (error) {
    authError.textContent = error.message;
  }
});

// Google login
googleLoginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
    authError.textContent = "";
  } catch (error) {
    authError.textContent = error.message;
  }
});

// Logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// ---------------- EXPENSES ----------------

addExpenseBtn.addEventListener("click", async () => {
  const amount = parseFloat(amountInput.value);
  const category = categoryInput.value;
  const note = noteInput.value;

  if (!auth.currentUser) {
    dataError.textContent = "You must be logged in.";
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    dataError.textContent = "Enter a valid amount.";
    return;
  }

  try {
    await addDoc(collection(db, "expenses"), {
      uid: auth.currentUser.uid,  // ✅ same UID whether Email or Google
      amount,
      category,
      note,
      date: new Date()
    });
    amountInput.value = "";
    noteInput.value = "";
    dataError.textContent = "";
  } catch (error) {
    dataError.textContent = error.message;
  }
});

// ---------------- REALTIME SYNC ----------------
function loadExpenses(user) {
  if (unsubscribe) unsubscribe();

  const q = query(
    collection(db, "expenses"),
    where("uid", "==", user.uid),
    orderBy("date", "desc")
  );

  unsubscribe = onSnapshot(q, (snapshot) => {
    expenseTable.innerHTML = "";
    const expenses = [];
    snapshot.forEach((docSnap) => {
      const exp = { id: docSnap.id, ...docSnap.data() };
      expenses.push(exp);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${exp.amount}</td>
        <td>${exp.category}</td>
        <td>${exp.note || ""}</td>
        <td>${exp.date.toDate ? exp.date.toDate().toLocaleString() : ""}</td>
        <td><button data-id="${exp.id}" class="delete-btn">❌</button></td>
      `;
      expenseTable.appendChild(row);
    });

    drawChart(expenses);
    attachDeleteHandlers();
  });
}

function attachDeleteHandlers() {
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await deleteDoc(doc(db, "expenses", id));
    });
  });
}

// ---------------- CHART ----------------
function drawChart(expenses) {
  const ctx = document.getElementById("expense-chart").getContext("2d");

  if (chart) chart.destroy();

  const chartType = document.getElementById("chart-type").value;
  if (chartType === "bar") {
    const categories = {};
    expenses.forEach((e) => {
      categories[e.category] = (categories[e.category] || 0) + e.amount;
    });
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: Object.keys(categories),
        datasets: [{ label: "Expenses", data: Object.values(categories) }]
      }
    });
  } else {
    const sorted = [...expenses].reverse();
    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: sorted.map((e) =>
          e.date.toDate ? e.date.toDate().toLocaleDateString() : ""
        ),
        datasets: [{ label: "Expenses", data: sorted.map((e) => e.amount) }]
      }
    });
  }
}

// ---------------- AUTH STATE ----------------
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");
    welcomeMessage.textContent = `Welcome, ${user.displayName || user.email}`;
    loadExpenses(user);
  } else {
    loginPage.classList.remove("hidden");
    mainPage.classList.add("hidden");
    welcomeMessage.textContent = "Welcome!";
    if (unsubscribe) unsubscribe();
  }
});
