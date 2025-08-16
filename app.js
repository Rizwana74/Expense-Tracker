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

// Elements
const loginPage = document.getElementById('login-page');
const mainPage  = document.getElementById('main-page');
const welcomeMessage = document.getElementById('welcome-message');
const authError = document.getElementById('auth-error');
const dataError = document.getElementById('data-error');
const chartTypeSelect = document.getElementById('chart-type');

// Force Google logout function
async function forceGoogleLogout() {
  const logoutWindow = window.open(
    "https://accounts.google.com/Logout",
    "logout",
    "width=1,height=1,top=-1000,left=-1000"
  );
  return new Promise(resolve => {
    setTimeout(() => {
      logoutWindow.close();
      resolve();
    }, 1500);
  });
}

// Handle redirect sign-in (for mobile)
getRedirectResult(auth)
  .then((result) => {
    const user = result?.user;
    if (user) {
      loginPage.classList.add('hidden');
      mainPage.classList.remove('hidden');
      welcomeMessage.textContent = `Welcome, ${user.email.split('@')[0]}!`;
      startLiveQuery();
    }
  })
  .catch((e) => { authError.textContent = "❌ " + e.message; });

// Auth state
onAuthStateChanged(auth, user => {
  if (user) {
    loginPage.classList.add('hidden');
    mainPage.classList.remove('hidden');
    welcomeMessage.textContent = `Welcome, ${user.email.split('@')[0]}!`;
    startLiveQuery();
  } else {
    loginPage.classList.remove('hidden');
    mainPage.classList.add('hidden');
    stopLiveQuery();
  }
});

// LOGIN BUTTON
document.getElementById('login-btn').onclick = async () => {
  authError.textContent = "";
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) return authError.textContent = "Enter email and password.";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    if (e.code === "auth/user-not-found") authError.textContent = "❌ User not found.";
    else if (e.code === "auth/wrong-password") authError.textContent = "❌ Wrong password.";
    else if (e.code === "auth/invalid-email") authError.textContent = "❌ Invalid email format.";
    else authError.textContent = "❌ " + e.message;
  }
};

// SIGNUP BUTTON
document.getElementById('signup-btn').onclick = async () => {
  authError.textContent = "";
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) return authError.textContent = "Enter email and password.";
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (e) {
    if (e.code === "auth/email-already-in-use") authError.textContent = "❌ Email already in use.";
    else if (e.code === "auth/invalid-email") authError.textContent = "❌ Invalid email format.";
    else if (e.code === "auth/weak-password") authError.textContent = "❌ Weak password. Use at least 6 chars.";
    else authError.textContent = "❌ " + e.message;
  }
};

// GOOGLE SIGN-IN (Desktop + Mobile) - FIXED
document.getElementById('google-login-btn').onclick = async () => {
  authError.textContent = "";
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    provider.setCustomParameters({ prompt: 'select_account' });

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Force logout from Firebase and Google
    if (auth.currentUser) await signOut(auth);
    await forceGoogleLogout();

    if (isMobile) {
      await signInWithRedirect(auth, provider);
    } else {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      console.log("Signed in as:", user.email, "UID:", user.uid);
    }

    // Listen for auth state change to load expenses
    onAuthStateChanged(auth, u => {
      if (u) {
        loginPage.classList.add('hidden');
        mainPage.classList.remove('hidden');
        welcomeMessage.textContent = `Welcome, ${u.email.split('@')[0]}!`;
        startLiveQuery(); // expenses load correctly
      }
    });

  } catch (e) {
    if (e.code === "auth/popup-closed-by-user")
      authError.textContent = "❌ Popup closed before completing sign-in.";
    else if (e.code === "auth/cancelled-popup-request")
      authError.textContent = "❌ Another popup is already open.";
    else if (e.code === "auth/account-exists-with-different-credential")
      authError.textContent = "❌ Account exists with different credentials.";
    else
      authError.textContent = "❌ " + e.message;
  }
};

// LOGOUT BUTTON
document.getElementById('logout-btn').onclick = () => signOut(auth);

// ADD EXPENSE - FIXED for Google Users
document.getElementById('add-expense-btn').onclick = async () => {
  dataError.textContent = "";
  const amount = parseFloat(document.getElementById('amount').value);
  const category = document.getElementById('category').value;
  const note = document.getElementById('note').value.trim();

  // Use reliable user object
  const user = auth.currentUser;
  if (!user) return dataError.textContent = "Please log in.";
  if (!amount) return dataError.textContent = "Enter a valid amount.";

  try {
    await addDoc(collection(db, 'expenses'), {
      uid: user.uid,  // critical for Google login
      amount,
      category,
      note,
      date: new Date()
    });

    document.getElementById('amount').value = "";
    document.getElementById('note').value = "";

    // Immediately reload expenses
    startLiveQuery();

  } catch (e) {
    dataError.textContent = e.message;
  }
};

// LIVE QUERY + RENDER
let unsubscribe = null;
function startLiveQuery() {
  if (!auth.currentUser) return;
  const q = query(
    collection(db, 'expenses'),
    where('uid', '==', auth.currentUser.uid),
    orderBy('date', 'desc')
  );
  unsubscribe && unsubscribe();
  unsubscribe = onSnapshot(q, renderSnapshot, (e)=> dataError.textContent = e.message);
}
function stopLiveQuery() { if (unsubscribe){ unsubscribe(); unsubscribe = null; } }

// RENDER TABLE + CHART
let chart;
function renderSnapshot(snapshot) {
  const tbody = document.getElementById('expense-table');
  tbody.innerHTML = "";

  const categoryTotals = {};
  const timeSeries = [];

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const when = data.date?.toDate ? data.date.toDate() : new Date(data.date);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>₹ ${Number(data.amount).toFixed(2)}</td>
      <td>${data.category}</td>
      <td>${data.note || ""}</td>
      <td>${when.toLocaleDateString()}</td>
      <td><button class="delete delete-btn" data-id="${docSnap.id}">Delete</button></td>
    `;
    tbody.appendChild(tr);

    categoryTotals[data.category] = (categoryTotals[data.category] || 0) + Number(data.amount || 0);
    timeSeries.push({ x: when, y: Number(data.amount || 0) });
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.onclick = async () => {
      try { await deleteDoc(doc(db, 'expenses', btn.dataset.id)); }
      catch(e){ dataError.textContent = e.message; }
    };
  });

  drawChart(categoryTotals, timeSeries);
}

// CHART RENDER
chartTypeSelect.onchange = () => {
  if (unsubscribe) unsubscribe();
  startLiveQuery();
};

function drawChart(categoryTotals, timeSeries){
  const ctx = document.getElementById('expense-chart').getContext('2d');
  if (chart) chart.destroy();

  const type = chartTypeSelect.value;

  if (type === 'line') {
    const byDate = {};
    timeSeries.forEach(pt => {
      const key = pt.x.toISOString().slice(0,10);
      byDate[key] = (byDate[key] || 0) + pt.y;
    });
    const labels = Object.keys(byDate).sort();
    const values = labels.map(k => byDate[k]);

    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Daily spend', data: values, fill: false }] }
    });

  } else {
    chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: Object.keys(categoryTotals), datasets: [{ label: 'Total by category', data: Object.values(categoryTotals) }] },
      options: { plugins:{ legend:{ display:false } } }
    });
  }
}
