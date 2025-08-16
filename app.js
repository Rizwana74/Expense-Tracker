/* app.js - final fixed version
   Requires: main.js that exports `app` (your Firebase initialization)
*/

import { app } from "./main.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import {
  getFirestore, collection, addDoc, query, where,
  orderBy, onSnapshot, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

// Element refs (matching your index.html exactly)
const loginPage = document.getElementById('login-page');
const mainPage  = document.getElementById('main-page');
const welcomeMessage = document.getElementById('welcome-message');
const authError = document.getElementById('auth-error');
const dataError = document.getElementById('data-error');
const chartTypeSelect = document.getElementById('chart-type');
const amountInput = document.getElementById('amount');
const categoryInput = document.getElementById('category');
const noteInput = document.getElementById('note');
const expenseTableBody = document.getElementById('expense-table');
const expenseChartCanvas = document.getElementById('expense-chart');

let unsubscribe = null;
let chart = null;

// ---------- Utility: clickable fading toast ----------
function showActiveUserToast(user) {
  if (!user) return;
  let toast = document.getElementById('user-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'user-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '10px';
    toast.style.right = '10px';
    toast.style.backgroundColor = '#4caf50';
    toast.style.color = '#fff';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '5px';
    toast.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    toast.style.zIndex = '9999';
    toast.style.transition = 'opacity 0.5s ease';
    toast.style.cursor = 'pointer';
    document.body.appendChild(toast);
  }
  toast.textContent = `Active: ${user.email.split('@')[0]}`;
  toast.onclick = () => alert(`Active account:\nEmail: ${user.email}\nUID: ${user.uid}`);
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}

// ---------- Force Google logout (ensures Google prompts for account/password) ----------
async function forceGoogleLogout() {
  try {
    const w = window.open("https://accounts.google.com/Logout", "logout", "width=1,height=1,top=-1000,left=-1000");
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (w) w.close();
  } catch (_) { /* ignore */ }
}

// ---------- Helper: Update UI when a user is ready ----------
function handleUserLogin(user) {
  if (!user) return;
  // show main
  loginPage.classList.add('hidden');
  mainPage.classList.remove('hidden');

  // welcome message (keep same ID used in index.html)
  const username = user.email?.split('@')[0] || "User";
  welcomeMessage.textContent = `Welcome, ${username}!`;

  console.log(`✅ Logged in as: ${user.email}, UID: ${user.uid}`);
  showActiveUserToast(user);

  // start listening to their expenses (works for google & email)
  startLiveQuery();
}

// ---------- Handle redirect result (mobile) ----------
getRedirectResult(auth)
  .then(result => {
    if (result?.user) handleUserLogin(result.user);
  })
  .catch(e => { authError.textContent = "❌ " + e.message; });

// ---------- Auth state listener ----------
onAuthStateChanged(auth, user => {
  if (user) handleUserLogin(user);
  else {
    // show login
    loginPage.classList.remove('hidden');
    mainPage.classList.add('hidden');
    welcomeMessage.textContent = 'Welcome!';
    stopLiveQuery();
  }
});

// ---------- LOGIN & SIGNUP ----------
document.getElementById('login-btn').onclick = async () => {
  authError.textContent = "";
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) return authError.textContent = "Enter email and password.";
  try { await signInWithEmailAndPassword(auth, email, password); }
  catch (e) {
    if (e.code === "auth/user-not-found") authError.textContent = "❌ User not found.";
    else if (e.code === "auth/wrong-password") authError.textContent = "❌ Wrong password.";
    else if (e.code === "auth/invalid-email") authError.textContent = "❌ Invalid email format.";
    else authError.textContent = "❌ " + e.message;
  }
};

document.getElementById('signup-btn').onclick = async () => {
  authError.textContent = "";
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) return authError.textContent = "Enter email and password.";
  try { await createUserWithEmailAndPassword(auth, email, password); }
  catch (e) {
    if (e.code === "auth/email-already-in-use") authError.textContent = "❌ Email already in use.";
    else if (e.code === "auth/invalid-email") authError.textContent = "❌ Invalid email format.";
    else if (e.code === "auth/weak-password") authError.textContent = "❌ Weak password. Use at least 6 chars.";
    else authError.textContent = "❌ " + e.message;
  }
};

// ---------- GOOGLE SIGN-IN (desktop + mobile) ----------
document.getElementById('google-login-btn').onclick = async () => {
  authError.textContent = "";
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    provider.setCustomParameters({ prompt: 'select_account' });

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Sign out firebase and force google logout - ensures prompt for account/password
    if (auth.currentUser) await signOut(auth);
    await forceGoogleLogout();

    if (isMobile) {
      await signInWithRedirect(auth, provider);
    } else {
      const result = await signInWithPopup(auth, provider);
      if (result?.user) handleUserLogin(result.user);
    }
  } catch (e) {
    if (e.code === "auth/popup-closed-by-user") authError.textContent = "❌ Popup closed before completing sign-in.";
    else if (e.code === "auth/cancelled-popup-request") authError.textContent = "❌ Another popup is already open.";
    else if (e.code === "auth/account-exists-with-different-credential") authError.textContent = "❌ Account exists with different credentials.";
    else authError.textContent = "❌ " + e.message;
  }
};

// ---------- LOGOUT ----------
document.getElementById('logout-btn').onclick = async () => {
  try { await signOut(auth); } catch (e) { console.error(e); }
};

// ---------- ADD EXPENSE ----------
document.getElementById('add-expense-btn').onclick = async () => {
  dataError.textContent = "";

  const user = auth.currentUser;
  if (!user) return dataError.textContent = "Please log in.";

  // robust amount parsing
  const rawAmount = (amountInput.value ?? "").toString().trim();
  const amount = rawAmount === "" ? NaN : parseFloat(rawAmount);
  const category = categoryInput.value;
  const note = noteInput.value.trim();

  if (isNaN(amount) || amount <= 0) return dataError.textContent = "Enter a valid amount.";
  if (!category) return dataError.textContent = "Select a category.";

  try {
    await addDoc(collection(db, 'expenses'), {
      uid: user.uid,
      amount,
      category,
      note,
      date: new Date()
    });
    amountInput.value = "";
    noteInput.value = "";
    // restart/live query will update view automatically
    startLiveQuery();
  } catch (e) {
    dataError.textContent = e.message;
  }
};

// ---------- LIVE QUERY / RENDER ----------
function startLiveQuery() {
  const user = auth.currentUser;
  if (!user) return;

  const q = query(
    collection(db, 'expenses'),
    where('uid', '==', user.uid),
    orderBy('date', 'desc')
  );

  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(q, snapshot => {
    renderSnapshot(snapshot);
  }, e => {
    dataError.textContent = e.message;
  });
}

function stopLiveQuery() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

// ---------- Render table + compute chart data robustly ----------
function renderSnapshot(snapshot) {
  // Clear table
  expenseTableBody.innerHTML = "";

  // Aggregate containers
  const categoryTotals = {};
  const timeTotals = {}; // keyed by YYYY-MM-DD

  snapshot.forEach(docSnap => {
    const data = docSnap.data();

    // Normalize amount to number safely
    const amt = Number(data.amount) || 0;

    // Normalize date (handles Firestore Timestamp or Date or ISO string)
    let when;
    if (data.date && typeof data.date.toDate === 'function') {
      when = data.date.toDate();
    } else if (data.date) {
      // try Date constructor
      when = new Date(data.date);
      if (isNaN(when)) when = new Date(); // fallback to now
    } else {
      when = new Date();
    }

    // Build table row (with fade-in)
    const tr = document.createElement('tr');
    tr.style.opacity = '0';
    tr.style.transition = 'opacity 0.45s ease';
    tr.innerHTML = `
      <td>₹ ${amt.toFixed(2)}</td>
      <td>${(data.category || "").toString()}</td>
      <td>${(data.note || "").toString()}</td>
      <td>${when.toLocaleDateString()}</td>
      <td><button class="delete delete-btn" data-id="${docSnap.id}">Delete</button></td>
    `;
    expenseTableBody.appendChild(tr);
    requestAnimationFrame(() => { tr.style.opacity = '1'; });

    // Accumulate category totals
    const cat = data.category || 'Others';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;

    // Accumulate daily totals (YYYY-MM-DD)
    const key = when.toISOString().slice(0,10);
    timeTotals[key] = (timeTotals[key] || 0) + amt;
  });

  // Attach delete handlers
  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.onclick = async () => {
      try {
        await deleteDoc(doc(db, 'expenses', btn.dataset.id));
      } catch (e) {
        dataError.textContent = e.message;
      }
    };
  });

  // Draw chart using aggregated totals
  drawChart(categoryTotals, timeTotals);
}

// ---------- Charting ----------
function drawChart(categoryTotals, timeTotals) {
  const ctx = expenseChartCanvas.getContext('2d');

  // Destroy previous chart instance cleanly
  if (chart) {
    try { chart.destroy(); } catch (_) { /* ignore */ }
    chart = null;
  }

  const type = chartTypeSelect.value || 'bar';

  if (type === 'line') {
    const labels = Object.keys(timeTotals).sort();
    const data = labels.map(k => timeTotals[k] || 0);

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Daily spend',
          data,
          fill: false,
          borderWidth: 3,
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 700, easing: 'easeOutQuart' },
        scales: {
          x: { display: true },
          y: { beginAtZero: true }
        }
      }
    });

  } else {
    // Bar by category - ensure stable ordering
    const labels = Object.keys(categoryTotals);
    const data = labels.map(k => categoryTotals[k] || 0);

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Total by category',
          data,
          backgroundColor: '#4caf50'
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
}

// Redraw chart when chart type changes
chartTypeSelect.onchange = () => {
  startLiveQuery(); // restart listener (safe) which triggers re-render
};

// Ensure startup state is correct
// (If user already signed-in, onAuthStateChanged will fire and call startLiveQuery)
