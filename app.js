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
  linkWithPopup,
  linkWithRedirect,
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

/* ===== Firebase & DOM ===== */
const auth = getAuth(app);
const db   = getFirestore(app);

const loginPage  = document.getElementById("login-page");
const mainPage   = document.getElementById("main-page");
const loginBtn   = document.getElementById("login-btn");
const signupBtn  = document.getElementById("signup-btn");
const googleBtn  = document.getElementById("google-login-btn");
const logoutBtn  = document.getElementById("logout-btn");

const emailInput = document.getElementById("email");
const passInput  = document.getElementById("password");
const authError  = document.getElementById("auth-error");
const welcomeMsg = document.getElementById("welcome-message");

const addExpenseBtn = document.getElementById("add-expense-btn");
const amountInput   = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const noteInput     = document.getElementById("note");
const dataError     = document.getElementById("data-error");

const expenseTable  = document.getElementById("expense-table");
const chartCanvas   = document.getElementById("expense-chart");
const chartTypeSel  = document.getElementById("chart-type");

let unsubExpenses = null;
let chart = null;

/* ===== Utils ===== */
const setAuthErr = (m="") => (authError.textContent = m);
const setDataErr = (m="") => (dataError.textContent = m);
const firstName  = (u) => {
  const s = (u?.displayName || u?.email || "User");
  return s && s.includes("@") ? s.split("@")[0] : s;
};

/* ===== Email / Password ===== */
loginBtn?.addEventListener("click", async () => {
  setAuthErr("");
  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
  } catch (e) { setAuthErr(e.message); }
});

signupBtn?.addEventListener("click", async () => {
  setAuthErr("");
  try {
    await createUserWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
  } catch (e) { setAuthErr(e.message); }
});

/* ===== Google (chooser + safe linking) ===== */
const googleProvider = new GoogleAuthProvider();
// Always show account chooser so user can pick the right Google
googleProvider.setCustomParameters({ prompt: "select_account" });

googleBtn?.addEventListener("click", async () => {
  setAuthErr("");
  try {
    // Normal Google sign-in
    await signInWithPopup(auth, googleProvider);
    // If success, either new Google account or already linked — no extra steps needed.
  } catch (err) {
    // If an account with the same email exists with a different provider
    if (err?.code === "auth/account-exists-with-different-credential" || err?.code === "auth/email-already-in-use") {
      try {
        const email = err?.customData?.email;
        if (!email) { setAuthErr("This email already exists. Please log in with email/password once, then press Google again to link."); return; }

        // Which methods exist for this email?
        const methods = await fetchSignInMethodsForEmail(auth, email);

        if (methods.includes("password")) {
          // Ask for password to prove ownership of the existing account
          const pwd = prompt(`This email is already registered.\nEnter the password for ${email} to link Google to your existing account:`);
          if (!pwd) { setAuthErr("Linking cancelled."); return; }

          // Sign into the existing (old) account
          const { user } = await signInWithEmailAndPassword(auth, email, pwd);

          // Link Google to that account (opens chooser again if needed)
          try {
            await linkWithPopup(user, googleProvider);
          } catch (linkErr) {
            if (linkErr?.code === "auth/popup-blocked") {
              await linkWithRedirect(user, googleProvider);
            } else {
              setAuthErr(linkErr.message);
              return;
            }
          }

          setAuthErr(""); // linked successfully → same UID forever
          return;
        }

        // If some other provider owns this email, tell the user which one
        if (methods.length) {
          setAuthErr(`This email is registered with: ${methods.join(", ")}. Please sign in using that method first, then you can add Google from the profile.`);
          return;
        }

        // Fallback (should rarely happen)
        setAuthErr("This email already exists. Please sign in with your existing method first.");
      } catch (linkFlowErr) {
        setAuthErr(linkFlowErr.message);
      }
    } else {
      // Other errors (popup closed, blocked, network, etc.)
      setAuthErr(err.message);
    }
  }
});

/* ===== Logout ===== */
logoutBtn?.addEventListener("click", () => signOut(auth));

/* ===== Auth state ===== */
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginPage?.classList.add("hidden");
    mainPage?.classList.remove("hidden");
    welcomeMsg.textContent = `Welcome, ${firstName(user)}!`;
    loadExpenses(user.uid);
  } else {
    loginPage?.classList.remove("hidden");
    mainPage?.classList.add("hidden");
    welcomeMsg.textContent = "Welcome!";
    if (unsubExpenses) unsubExpenses();
    if (chart) { chart.destroy(); chart = null; }
    expenseTable.innerHTML = "";
  }
});

/* ===== Expenses (root collection, filtered by uid) ===== */
function loadExpenses(uid) {
  if (unsubExpenses) unsubExpenses();

  const q = query(
    collection(db, "expenses"),
    where("uid", "==", uid),
    orderBy("date", "desc")
  );

  unsubExpenses = onSnapshot(q, (snap) => {
    const items = [];
    expenseTable.innerHTML = "";
    snap.forEach((d) => {
      const e = d.data();
      items.push({ id: d.id, ...e });
      appendRow(d.id, e);
    });
    drawChart(items);
  }, (e) => setDataErr(e.message));
}

function appendRow(id, e) {
  const when = e?.date?.toDate ? e.date.toDate() : new Date(e.date);
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>₹ ${Number(e.amount || 0).toFixed(2)}</td>
    <td>${e.category}</td>
    <td>${e.note || ""}</td>
    <td>${isNaN(when) ? "" : when.toLocaleDateString()}</td>
    <td><button class="delete-btn" data-id="${id}">Delete</button></td>
  `;
  tr.querySelector(".delete-btn").addEventListener("click", async () => {
    try { await deleteDoc(doc(db, "expenses", id)); } catch (err) { setDataErr(err.message); }
  });
  expenseTable.appendChild(tr);
}

/* ===== Add Expense ===== */
addExpenseBtn?.addEventListener("click", async () => {
  setDataErr("");
  const user = auth.currentUser;
  if (!user) { setDataErr("Please log in."); return; }

  const amt = parseFloat(amountInput.value);
  if (!amt || amt <= 0) { setDataErr("Enter a valid amount."); return; }

  try {
    await addDoc(collection(db, "expenses"), {
      uid: user.uid,
      amount: Number(amt),
      category: categoryInput.value,
      note: (noteInput.value || "").trim(),
      date: Date.now(), // store as number; we read both number/Timestamp safely
    });
    amountInput.value = "";
    noteInput.value = "";
  } catch (e) { setDataErr(e.message); }
});

/* ===== Charts ===== */
chartTypeSel?.addEventListener("change", () => {
  const u = auth.currentUser;
  if (u) loadExpenses(u.uid);
});

function drawChart(items) {
  if (!chartCanvas) return;
  if (chart) { chart.destroy(); chart = null; }

  const ctx = chartCanvas.getContext("2d");
  const mode = chartTypeSel.value;

  if (mode === "bar") {
    const byCat = {};
    items.forEach((e) => {
      byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0);
    });
    chart = new Chart(ctx, {
      type: "bar",
      data: { labels: Object.keys(byCat), datasets: [{ label: "Total by category", data: Object.values(byCat) }] },
      options: { plugins: { legend: { display: false } } }
    });
  } else {
    const byDate = {};
    items.forEach((e) => {
      const d = e?.date?.toDate ? e.date.toDate() : new Date(e.date);
      if (isNaN(d)) return;
      const key = d.toISOString().slice(0,10);
      byDate[key] = (byDate[key] || 0) + Number(e.amount || 0);
    });
    const labels = Object.keys(byDate).sort();
    const values = labels.map(k => byDate[k]);
    chart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ label: "Daily spend", data: values, fill: false }] }
    });
  }
}

