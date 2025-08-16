// app.js — stable buttons, Google chooser, working expenses/chart
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

// ---- DOM READY (ensures buttons exist before we bind) ----
document.addEventListener("DOMContentLoaded", () => {
  const auth = getAuth(app);
  const db = getFirestore(app);

  // Elements
  const loginPage = document.getElementById("login-page");
  const mainPage  = document.getElementById("main-page");

  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const loginBtn = document.getElementById("login-btn");
  const signupBtn = document.getElementById("signup-btn");
  const googleBtn = document.getElementById("google-login-btn");
  const logoutBtn = document.getElementById("logout-btn");

  const welcomeMessage = document.getElementById("welcome-message");
  const authError = document.getElementById("auth-error");
  const dataError = document.getElementById("data-error");

  const amountEl = document.getElementById("amount");
  const categoryEl = document.getElementById("category");
  const noteEl = document.getElementById("note");
  const addExpenseBtn = document.getElementById("add-expense-btn");

  const expenseTable = document.getElementById("expense-table");
  const chartTypeSelect = document.getElementById("chart-type");
  const chartCanvas = document.getElementById("expense-chart");
  let chart;

  // ---- GOOGLE PROVIDER (force chooser) ----
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  // ---- HELPERS ----
  function setAuthError(msg) { authError.textContent = msg || ""; }
  function setDataError(msg) { dataError.textContent = msg || ""; }

  // ---- AUTH BUTTONS ----
  loginBtn.addEventListener("click", async () => {
    setAuthError("");
    const email = (emailEl.value || "").trim();
    const pw = passwordEl.value || "";
    if (!email || !pw) return setAuthError("Enter email and password.");
    try {
      await signInWithEmailAndPassword(auth, email, pw);
    } catch (e) {
      setAuthError(e.message || "Login failed");
    }
  });

  signupBtn.addEventListener("click", async () => {
    setAuthError("");
    const email = (emailEl.value || "").trim();
    const pw = passwordEl.value || "";
    if (!email || !pw) return setAuthError("Enter email and password.");
    try {
      await createUserWithEmailAndPassword(auth, email, pw);
    } catch (e) {
      setAuthError(e.message || "Sign up failed");
    }
  });

  googleBtn.addEventListener("click", async () => {
    setAuthError("");
    try {
      const result = await signInWithPopup(auth, provider);
      // If this Google email already has a password account, tell the user to log in once with email so we can link.
      // (Linking requires being signed in with the email account, then link Google.)
      const email = result.user?.email || null;
      if (email) {
        const methods = await fetchSignInMethodsForEmail(auth, email);
        if (methods.includes("password")) {
          // Try to link directly if possible (credential from result)
          const cred = GoogleAuthProvider.credentialFromResult(result);
          if (auth.currentUser && cred) {
            try {
              await linkWithCredential(auth.currentUser, cred);
            } catch {
              // If linking fails here, inform user to sign in with email once and we’ll link next time.
              setAuthError(`This email also has a password login. If you don’t see your old data, log in with email/password once, then use Google again to link.`);
            }
          }
        }
      }
    } catch (e) {
      // If popup reuses old session, account chooser still appears due to prompt, but handle errors anyway
      setAuthError(e.message || "Google sign-in failed");
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await signOut(auth).catch(()=>{});
  });

  // ---- AUTH STATE ----
  let unsubscribe = null;
  onAuthStateChanged(auth, (user) => {
    if (user) {
      loginPage.classList.add("hidden");
      mainPage.classList.remove("hidden");

      const name = user.displayName || (user.email ? user.email.split("@")[0] : "User");
      welcomeMessage.textContent = `Welcome, ${name}!`;

      // Start live expenses listener (users/{uid}/expenses)
      const q = query(collection(db, "users", user.uid, "expenses"), orderBy("date", "desc"));
      if (unsubscribe) unsubscribe();
      unsubscribe = onSnapshot(q, renderSnapshot, (e)=> setDataError(e.message || "Failed to load data"));
    } else {
      loginPage.classList.remove("hidden");
      mainPage.classList.add("hidden");
      welcomeMessage.textContent = "Welcome!";
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      clearTableAndChart();
    }
  });

  // ---- ADD EXPENSE ----
  addExpenseBtn.addEventListener("click", async () => {
    setDataError("");
    const user = auth.currentUser;
    if (!user) return setDataError("Please log in.");

    const raw = (amountEl.value ?? "").toString().trim();
    const amount = raw === "" ? NaN : parseFloat(raw);
    const category = categoryEl.value || "Others";
    const note = (noteEl.value || "").trim();

    if (isNaN(amount) || amount <= 0) return setDataError("Enter a valid amount.");

    try {
      await addDoc(collection(db, "users", user.uid, "expenses"), {
        amount,
        category,
        note,
        date: new Date().toISOString()
      });
      amountEl.value = "";
      noteEl.value = "";
    } catch (e) {
      setDataError(e.message || "Failed to add expense.");
    }
  });

  // ---- TABLE + CHART RENDER ----
  function renderSnapshot(snapshot) {
    const rows = [];
    const categoryTotals = {};
    const series = []; // { x: 'YYYY-MM-DD', y: number }

    // Clear table
    expenseTable.innerHTML = "";

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const when = new Date(data.date || Date.now());
      const dateStr = when.toLocaleDateString();

      // row
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>₹ ${Number(data.amount || 0).toFixed(2)}</td>
        <td>${data.category || ""}</td>
        <td>${data.note || ""}</td>
        <td>${dateStr}</td>
        <td><button class="delete-btn" data-id="${docSnap.id}">Delete</button></td>
      `;
      expenseTable.appendChild(tr);

      // aggregates
      const cat = data.category || "Others";
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(data.amount || 0);
      series.push({ x: when.toISOString().slice(0,10), y: Number(data.amount || 0) });
    });

    // Bind delete buttons
    expenseTable.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user) return;
        const id = btn.getAttribute("data-id");
        try {
          await deleteDoc(doc(db, "users", user.uid, "expenses", id));
        } catch (e) {
          setDataError(e.message || "Failed to delete.");
        }
      });
    });

    // Draw chart
    drawChart(categoryTotals, series);
  }

  function clearTableAndChart() {
    expenseTable.innerHTML = "";
    if (chart) { try { chart.destroy(); } catch {} chart = null; }
  }

  chartTypeSelect.addEventListener("change", () => {
    // simply retrigger snapshot by toggling – onSnapshot will call drawChart next time it fires
    const user = getAuth(app).currentUser;
    if (!user) return;
    // No extra work needed; next snapshot will redraw with new type
  });

  function drawChart(categoryTotals, timeSeries) {
    const ctx = chartCanvas.getContext("2d");
    if (chart) { try { chart.destroy(); } catch {} }

    const type = chartTypeSelect.value;

    if (type === "line") {
      // daily totals
      const byDate = {};
      timeSeries.forEach(pt => {
        byDate[pt.x] = (byDate[pt.x] || 0) + pt.y;
      });
      const labels = Object.keys(byDate).sort();
      const values = labels.map(k => byDate[k]);

      chart = new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [{ label: "Daily spend", data: values, fill: false }] },
        options: { responsive: true, plugins: { legend: { display: true } } }
      });

    } else {
      const labels = Object.keys(categoryTotals);
      const values = labels.map(k => categoryTotals[k]);

      chart = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ label: "Total by category", data: values }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }
  }
});
