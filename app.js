import { app } from "./main.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  fetchSignInMethodsForEmail,
  EmailAuthProvider,
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

// Elements
const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");
const welcomeMessage = document.getElementById("welcome-message");
const expenseTable = document.getElementById("expense-table");
const chartType = document.getElementById("chart-type");
const chartCanvas = document.getElementById("expense-chart");
let chartInstance = null;
let unsubscribeExpenses = null;

// Auth
document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    document.getElementById("auth-error").innerText = err.message;
  }
});

document.getElementById("signup-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (err) {
    document.getElementById("auth-error").innerText = err.message;
  }
});

// Google Sign In with linking
const googleProvider = new GoogleAuthProvider();
document.getElementById("google-login-btn").addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const googleUser = result.user;

    // Check if email already exists
    const methods = await fetchSignInMethodsForEmail(auth, googleUser.email);

    if (methods.includes("password")) {
      // If user had email/password account, link it
      const credential = GoogleAuthProvider.credentialFromResult(result);
      try {
        await linkWithCredential(auth.currentUser, credential);
        console.log("Google linked with existing Email/Password account");
      } catch (linkErr) {
        console.error("Link error:", linkErr);
      }
    }

  } catch (err) {
    document.getElementById("auth-error").innerText = err.message;
  }
});

// Logout
document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
});

// State change
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

// Expense logic
document.getElementById("add-expense-btn").addEventListener("click", async () => {
  const amount = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const note = document.getElementById("note").value;

  if (isNaN(amount) || amount <= 0) {
    document.getElementById("data-error").innerText = "Enter a valid amount.";
    return;
  }

  const user = auth.currentUser;
  if (!user) return;

  try {
    await addDoc(collection(db, "users", user.uid, "expenses"), {
      amount,
      category,
      note,
      date: new Date()
    });
    document.getElementById("amount").value = "";
    document.getElementById("note").value = "";
    document.getElementById("data-error").innerText = "";
  } catch (err) {
    console.error("Add expense error:", err);
  }
});

function loadExpenses(uid) {
  if (unsubscribeExpenses) unsubscribeExpenses();

  const q = query(
    collection(db, "users", uid, "expenses"),
    orderBy("date", "asc")
  );

  unsubscribeExpenses = onSnapshot(q, (snapshot) => {
    let expenses = [];
    expenseTable.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      expenses.push({ id: docSnap.id, ...data });

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${data.amount}</td>
        <td>${data.category}</td>
        <td>${data.note || ""}</td>
        <td>${new Date(data.date.seconds * 1000).toLocaleString()}</td>
        <td><button data-id="${docSnap.id}" class="delete-btn">❌</button></td>
      `;
      expenseTable.appendChild(row);
    });

    // Delete event
    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.dataset.id;
        await deleteDoc(doc(db, "users", uid, "expenses", id));
      });
    });

    renderChart(expenses);
  });
}

function renderChart(expenses) {
  if (chartInstance) chartInstance.destroy();

  const type = chartType.value;
  let labels = [];
  let data = [];

  if (type === "bar") {
    const sums = {};
    expenses.forEach((ex) => {
      sums[ex.category] = (sums[ex.category] || 0) + ex.amount;
    });
    labels = Object.keys(sums);
    data = Object.values(sums);
  } else {
    labels = expenses.map((ex) =>
      new Date(ex.date.seconds * 1000).toLocaleDateString()
    );
    data = expenses.map((ex) => ex.amount);
  }

  chartInstance = new Chart(chartCanvas, {
    type,
    data: {
      labels,
      datasets: [
        {
          label: "Expenses",
          data,
          backgroundColor: "rgba(75, 192, 192, 0.5)",
          borderColor: "rgba(75, 192, 192, 1)"
        }
      ]
    }
  });
}

chartType.addEventListener("change", () => {
  const user = auth.currentUser;
  if (user) loadExpenses(user.uid);
});
