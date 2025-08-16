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
  EmailAuthProvider,
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
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// Firebase
const auth = getAuth(app);
const db = getFirestore(app);

// Elements
const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const googleBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const addBtn = document.getElementById("add-expense-btn");
const emailInput = document.getElementById("email");
const passInput = document.getElementById("password");
const errorBox = document.getElementById("auth-error");
const tableBody = document.getElementById("expense-table");
const chartTypeSelect = document.getElementById("chart-type");
const chartCanvas = document.getElementById("expense-chart");

let currentUser = null;
let unsubscribe = null;
let expenseChart = null;

// ---------- Auth Handlers ----------

// Email Login
loginBtn.onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth, emailInput.value, passInput.value);
    errorBox.textContent = "";
  } catch (err) {
    errorBox.textContent = err.message;
  }
};

// Email Signup
signupBtn.onclick = async () => {
  try {
    await createUserWithEmailAndPassword(auth, emailInput.value, passInput.value);
    errorBox.textContent = "";
  } catch (err) {
    errorBox.textContent = err.message;
  }
};

// Google Sign-in with merge fix
googleBtn.onclick = async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" }); // always ask account
  try {
    const result = await signInWithPopup(auth, provider);
    const googleUser = result.user;

    // Check if this email already exists
    const methods = await fetchSignInMethodsForEmail(auth, googleUser.email);

    if (methods.includes("password")) {
      // If email/password account exists → merge accounts
      const password = prompt("Enter your password for " + googleUser.email + " to link with Google:");
      if (password) {
        const credential = EmailAuthProvider.credential(googleUser.email, password);
        await linkWithCredential(googleUser, credential);
        console.log("✅ Google linked with existing email account!");
      }
    }

    errorBox.textContent = "";
  } catch (err) {
    errorBox.textContent = err.message;
  }
};

// Logout
logoutBtn.onclick = () => signOut(auth);

// ---------- Auth State ----------
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");
    loadExpenses();
  } else {
    currentUser = null;
    loginPage.classList.remove("hidden");
    mainPage.classList.add("hidden");
    if (unsubscribe) unsubscribe();
  }
});

// ---------- Firestore ----------
async function loadExpenses() {
  if (unsubscribe) unsubscribe();

  const q = query(
    collection(db, "users", currentUser.uid, "expenses"),
    orderBy("date", "desc")
  );

  unsubscribe = onSnapshot(q, (snapshot) => {
    tableBody.innerHTML = "";
    const data = [];
    snapshot.forEach((docSnap) => {
      const exp = docSnap.data();
      data.push(exp);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${exp.amount}</td>
        <td>${exp.category}</td>
        <td>${exp.note || ""}</td>
        <td>${exp.date?.toDate().toLocaleString() || ""}</td>
        <td><button data-id="${docSnap.id}">❌</button></td>
      `;
      tableBody.appendChild(tr);

      tr.querySelector("button").onclick = () =>
        deleteDoc(doc(db, "users", currentUser.uid, "expenses", docSnap.id));
    });

    updateChart(data);
  });
}

// Add expense
addBtn.onclick = async () => {
  const amount = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const note = document.getElementById("note").value;

  if (!amount || amount <= 0) return alert("Enter a valid amount");

  await addDoc(collection(db, "users", currentUser.uid, "expenses"), {
    amount,
    category,
    note,
    date: serverTimestamp(),
  });

  document.getElementById("amount").value = "";
  document.getElementById("note").value = "";
};

// ---------- Chart ----------
function updateChart(expenses) {
  if (!chartCanvas) return;
  if (expenseChart) expenseChart.destroy();

  const type = chartTypeSelect.value;

  if (type === "bar") {
    const grouped = {};
    expenses.forEach((e) => {
      grouped[e.category] = (grouped[e.category] || 0) + e.amount;
    });

    expenseChart = new Chart(chartCanvas, {
      type: "bar",
      data: {
        labels: Object.keys(grouped),
        datasets: [
          { label: "Expenses", data: Object.values(grouped) }
        ]
      }
    });
  } else {
    expenses.sort((a, b) => a.date?.toDate() - b.date?.toDate());
    expenseChart = new Chart(chartCanvas, {
      type: "line",
      data: {
        labels: expenses.map((e) => e.date?.toDate().toLocaleDateString()),
        datasets: [
          { label: "Expenses", data: expenses.map((e) => e.amount) }
        ]
      }
    });
  }
}

chartTypeSelect.onchange = () => {
  if (currentUser) loadExpenses();
};
