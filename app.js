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

let expenseChart;

// ================== AUTH ==================

// Email login
document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    document.getElementById("auth-error").innerText = error.message;
  }
});

// Email signup
document.getElementById("signup-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    document.getElementById("auth-error").innerText = error.message;
  }
});

// Google login with linking fix
const googleProvider = new GoogleAuthProvider();
document.getElementById("google-login-btn").addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // If user already has email/password account → link Google
    const methods = await fetchSignInMethodsForEmail(auth, user.email);
    if (methods.includes("password")) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      await linkWithCredential(auth.currentUser, credential);
      console.log("Google linked to existing account ✅");
    }
  } catch (error) {
    document.getElementById("auth-error").innerText = error.message;
  }
});

// Logout
document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
});

// ================== STATE ==================
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("login-page").classList.add("hidden");
    document.getElementById("main-page").classList.remove("hidden");
    document.getElementById("welcome-message").innerText =
      `Welcome, ${user.displayName || user.email}!`;
    loadExpenses(user.uid);
  } else {
    document.getElementById("login-page").classList.remove("hidden");
    document.getElementById("main-page").classList.add("hidden");
  }
});

// ================== EXPENSES ==================
async function loadExpenses(uid) {
  const q = query(collection(db, "users", uid, "expenses"), orderBy("date", "desc"));
  onSnapshot(q, (snapshot) => {
    const table = document.getElementById("expense-table");
    table.innerHTML = "";
    const expenses = [];
    snapshot.forEach((docSnap) => {
      const exp = { id: docSnap.id, ...docSnap.data() };
      expenses.push(exp);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${exp.amount}</td>
        <td>${exp.category}</td>
        <td>${exp.note || ""}</td>
        <td>${new Date(exp.date).toLocaleString()}</td>
        <td><button data-id="${exp.id}" class="delete-btn">❌</button></td>
      `;
      table.appendChild(tr);
    });
    updateChart(expenses);

    // Delete listeners
    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await deleteDoc(doc(db, "users", uid, "expenses", btn.dataset.id));
      });
    });
  });
}

// Add expense
document.getElementById("add-expense-btn").addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;
  const amount = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const note = document.getElementById("note").value;
  if (isNaN(amount) || amount <= 0) {
    document.getElementById("data-error").innerText = "Enter a valid amount.";
    return;
  }
  document.getElementById("data-error").innerText = "";
  await addDoc(collection(db, "users", user.uid, "expenses"), {
    amount,
    category,
    note,
    date: Date.now(),
  });
  document.getElementById("amount").value = "";
  document.getElementById("note").value = "";
});

// ================== CHART ==================
function updateChart(expenses) {
  const ctx = document.getElementById("expense-chart").getContext("2d");
  const chartType = document.getElementById("chart-type").value;

  if (expenseChart) expenseChart.destroy();

  if (chartType === "bar") {
    const totals = {};
    expenses.forEach((e) => {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
    });
    expenseChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: Object.keys(totals),
        datasets: [{
          label: "Expenses",
          data: Object.values(totals),
        }]
      }
    });
  } else {
    const sorted = expenses.sort((a, b) => a.date - b.date);
    expenseChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: sorted.map(e => new Date(e.date).toLocaleDateString()),
        datasets: [{
          label: "Expenses",
          data: sorted.map(e => e.amount),
        }]
      }
    });
  }
}

// Chart type change
document.getElementById("chart-type").addEventListener("change", () => {
  const user = auth.currentUser;
  if (user) loadExpenses(user.uid);
});
