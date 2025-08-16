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

/* ================== Firebase refs & DOM ================== */
const auth = getAuth(app);
const db = getFirestore(app);

const loginPage = document.getElementById("login-page");
const mainPage  = document.getElementById("main-page");

const loginBtn  = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const googleBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");

const emailInput = document.getElementById("email");
const passInput  = document.getElementById("password");
const authError  = document.getElementById("auth-error");

const welcomeMessage = document.getElementById("welcome-message");

const addExpenseBtn = document.getElementById("add-expense-btn");
const amountInput   = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const noteInput     = document.getElementById("note");
const dataError     = document.getElementById("data-error");

const expenseTable  = document.getElementById("expense-table");
const chartCanvas   = document.getElementById("expense-chart");
const chartTypeSelect = document.getElementById("chart-type");

let unsubscribeExpenses = null;
let expensesChart = null;

/* ================== Helpers ================== */
function setAuthError(msg) { authError.textContent = msg || ""; }
function setDataError(msg) { dataError.textContent = msg || ""; }

function safeWelcomeName(user) {
  const n = user?.displayName || user?.email || "User";
  return n.includes("@") ? n.split("@")[0] : n;
}

/* ================== Email/Password Auth ================== */
loginBtn.addEventListener("click", async () => {
  setAuthError("");
  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
  } catch (e) {
    setAuthError(e.message);
  }
});

signupBtn.addEventListener("click", async () => {
  setAuthError("");
  try {
    await createUserWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
  } catch (e) {
    setAuthError(e.message);
  }
});

/* ================== Google Auth with linking ================== */
googleBtn.addEventListener("click", async () => {
  setAuthError("");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err?.code === "auth/account-exists-with-different-credential") {
      try {
        const email = err?.customData?.email;
        const pendingCred = GoogleAuthProvider.credentialFromError(err);

        if (!email || !pendingCred) {
          setAuthError("This email exists with another sign-in method. Sign in with email/password once, then try Google again.");
          return;
        }

        const methods = await fetchSignInMethodsForEmail(auth, email);

        if (methods.includes("password")) {
          const pwd = prompt(`This email is already registered.\nEnter the password for ${email} to link Google to your account:`);
          if (!pwd) { setAuthError("Linking cancelled."); return; }

          await signInWithEmailAndPassword(auth, email, pwd);
          await linkWithCredential(auth.currentUser, pendingCred);

          setAuthError("");
          return;
        }

        setAuthError(`This email is registered with: ${methods.join(", ")}. Please sign in with that method.`);
      } catch (linkErr) {
        setAuthError(linkErr.message);
      }
    } else {
      setAuthError(err.message);
    }
  }
});

/* ================== Logout ================== */
logoutBtn.addEventListener("click", () => signOut(auth));

/* ================== Auth State ================== */
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginPage.classList.add("hidden");
    mainPage.classList.remove("hidden");
    welcomeMessage.textContent = `Welcome, ${safeWelcomeName(user)}!`;

    loadExpensesFor(user.uid);
  } else {
    loginPage.classList.remove("hidden");
    mainPage.classList.add("hidden");
    welcomeMessage.textContent = "Welcome!";
    if (unsubscribeExpenses) unsubscribeExpenses();
    if (expensesChart) { expensesChart.destroy(); expensesChart = null; }
    expenseTable.innerHTML = "";
  }
});

/* ================== Expenses ================== */
function loadExpensesFor(uid) {
  if (unsubscribeExpenses) unsubscribeExpenses();

  const q = query(
    collection(db, "expenses"),
    where("uid", "==", uid),
    orderBy("date", "desc")
  );

  unsubscribeExpenses = onSnapshot(q, (snap) => {
    const rows = [];
    expenseTable.innerHTML = "";
    snap.forEach((d) => {
      const e = d.data();
      rows.push({ id: d.id, ...e });
      appendExpenseRow(d.id, e);
    });
    renderChart(rows);
  }, (err) => {
    setDataError(err.message);
  });
}

function appendExpenseRow(id, e) {
  const tr = document.createElement("tr");
  const when = new Date(e.date);
  tr.innerHTML = `
    <td>₹ ${Number(e.amount).toFixed(2)}</td>
    <td>${e.category}</td>
    <td>${e.note || ""}</td>
    <td>${isNaN(when) ? "" : when.toLocaleDateString()}</td>
    <td><button class="btn outline" data-id="${id}">Delete</button></td>
  `;
  tr.querySelector("button").addEventListener("click", async () => {
    try { await deleteDoc(doc(db, "expenses", id)); }
    catch (err) { setDataError(err.message); }
  });
  expenseTable.appendChild(tr);
}

/* ================== Add Expense ================== */
addExpenseBtn.addEventListener("click", async () => {
  setDataError("");
  const user = auth.currentUser;
  if (!user) { setDataError("Please log in."); return; }

  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) { setDataError("Enter a valid amount."); return; }

  try {
    await addDoc(collection(db, "expenses"), {
      uid: user.uid,
      amount: Number(amount),
      category: categoryInput.value,
      note: (noteInput.value || "").trim(),
      date: Date.now()
    });
    amountInput.value = "";
    noteInput.value = "";
  } catch (e) {
    setDataError(e.message);
  }
});

/* ================== Chart ================== */
chartTypeSelect.addEventListener("change", () => {
  const user = auth.currentUser;
  if (user) loadExpensesFor(user.uid);
});

function renderChart(items) {
  if (!chartCanvas) return;
  if (expensesChart) { expensesChart.destroy(); expensesChart = null; }

  const type = chartTypeSelect.value;

  if (type === "bar") {
    const byCat = {};
    items.forEach((e) => {
      byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0);
    });

    expensesChart = new Chart(chartCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: Object.keys(byCat),
        datasets: [{ label: "Total by category", data: Object.values(byCat) }]
      },
      options: { plugins: { legend: { display: false } } }
    });
  } else {
    const byDate = {};
    items.forEach((e) => {
      const key = new Date(e.date).toISOString().slice(0, 10);
      byDate[key] = (byDate[key] || 0) + Number(e.amount || 0);
    });
    const labels = Object.keys(byDate).sort();
    const values = labels.map(k => byDate[k]);

    expensesChart = new Chart(chartCanvas.getContext("2d"), {
      type: "line",
      data: { labels, datasets: [{ label: "Daily spend", data: values, fill: false }] }
    });
  }
}
