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
  doc,
  getDocs
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

const loginPage = document.getElementById("login-page");
const mainPage = document.getElementById("main-page");
const authError = document.getElementById("auth-error");
const dataError = document.getElementById("data-error");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");

const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const noteInput = document.getElementById("note");
const addExpenseBtn = document.getElementById("add-expense-btn");
const expenseTable = document.getElementById("expense-table");
const welcomeMessage = document.getElementById("welcome-message");

let currentChart = null;
const chartCanvas = document.getElementById("expense-chart");
const chartTypeSelect = document.getElementById("chart-type");

let unsubscribe = null;

// ---------- Authentication ----------
loginBtn.onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
  } catch (err) {
    authError.textContent = err.message;
  }
};

signupBtn.onclick = async () => {
  try {
    await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
  } catch (err) {
    authError.textContent = err.message;
  }
};

googleLoginBtn.onclick = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const methods = await fetchSignInMethodsForEmail(auth, user.email);
    if (methods.includes("password")) {
      const password = prompt("You already signed up with Email/Password. Enter your password once to link:");
      if (password) {
        const emailCred = EmailAuthProvider.credential(user.email, password);
        await linkWithCredential(user, emailCred);
        alert("Accounts linked successfully!");
      }
    }
  } catch (err) {
    authError.textContent = err.message;
  }
};

logoutBtn.onclick = async () => {
  await signOut(auth);
};

// ---------- Firestore ----------
addExpenseBtn.onclick = async () => {
  const amount = parseFloat(amountInput.value);
  if (isNaN(amount) || amount <= 0) {
    dataError.textContent = "Enter a valid amount.";
    return;
  }
  try {
    await addDoc(collection(db, "users", auth.currentUser.uid, "expenses"), {
      amount,
      category: categoryInput.value,
      note: noteInput.value,
      date: new Date().toISOString()
    });
    amountInput.value = "";
    noteInput.value = "";
    dataError.textContent = "";
  } catch (err) {
    dataError.textContent = err.message;
  }
};

// ---------- Load Expenses ----------
function loadExpenses(uid) {
  if (unsubscribe) unsubscribe();

  const q = query(collection(db, "users", uid, "expenses"), orderBy("date", "desc"));
  unsubscribe = onSnapshot(q, (snapshot) => {
    expenseTable.innerHTML = "";
    let expenses = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      expenses.push({ id: docSnap.id, ...data });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${data.amount}</td>
        <td>${data.category}</td>
        <td>${data.note || ""}</td>
        <td>${new Date(data.date).toLocaleDateString()}</td>
        <td><button class="btn small danger">Delete</button></td>
      `;
      tr.querySelector("button").onclick = async () => {
        await deleteDoc(doc(db, "users", uid, "expenses", docSnap.id));
      };
      expenseTable.appendChild(tr);
    });

    drawChart(expenses);
  });
}

// ---------- Chart ----------
function drawChart(expenses) {
  if (currentChart) currentChart.destroy();

  if (chartTypeSelect.value === "bar") {
    const byCat = {};
    expenses.forEach((e) => {
      byCat[e.category] = (byCat[e.category] || 0) + e.amount;
    });
    currentChart = new Chart(chartCanvas, {
      type: "bar",
      data: { labels: Object.keys(byCat), datasets: [{ label: "Expenses", data: Object.values(byCat) }] }
    });
  } else {
    const sorted = [...expenses].sort((a, b) => new Date(a.date) - new Date(b.date));
    currentChart = new Chart(chartCanvas, {
      type: "line",
      data: {
        labels: sorted.map((e) => new Date(e.date).toLocaleDateString()),
        datasets: [{ label: "Expenses over time", data: sorted.map((e) => e.amount) }]
      }
    });
  }
}

chartTypeSelect.onchange = () => {
  if (auth.currentUser) loadExpenses(auth.currentUser.uid);
};

// ---------- Migrate old data ----------
async function migrateOldData(newUid, oldUid) {
  const oldExpensesRef = collection(db, "users", oldUid, "expenses");
  const oldExpensesSnap = await getDocs(oldExpensesRef);

  for (let docSnap of oldExpensesSnap.docs) {
    const data = docSnap.data();
    await addDoc(collection(db, "users", newUid, "expenses"), data);
  }

  console.log("Migrated data from", oldUid, "to", newUid);
}

// ---------- Auth State ----------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");
    welcomeMessage.textContent = `Welcome, ${user.displayName || user.email}!`;

    // if duplicate accounts exist → migrate data
    const methods = await fetchSignInMethodsForEmail(auth, user.email);
    if (methods.includes("google.com") && methods.includes("password")) {
      // one UID is google, one UID is email → copy old data
      const oldUid = "👉 here you’ll manually paste the old UID if needed 👈";
      // (optional: I can write a script for you to fetch it automatically)
      if (oldUid && oldUid !== user.uid) {
        await migrateOldData(user.uid, oldUid);
      }
    }

    loadExpenses(user.uid);
  } else {
    loginPage.classList.remove("hidden");
    mainPage.classList.add("hidden");
  }
});
