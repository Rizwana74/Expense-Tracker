// app.js (final robust version)
// Assumes main.js exports `app` (Firebase initialized)
import { app } from "./main.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  fetchSignInMethodsForEmail,
  linkWithCredential,
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
  doc,
  getDocs,
  setDoc
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
const amountInput = document.getElementById('amount');
const categoryInput = document.getElementById('category');
const noteInput = document.getElementById('note');
const expenseTableBody = document.getElementById('expense-table');
const expenseChartCanvas = document.getElementById('expense-chart');

const mergeHelper = document.getElementById('merge-helper');
const mergeMsg = document.getElementById('merge-msg');
const mergeOldUidInput = document.getElementById('merge-old-uid');
const mergeCopyBtn = document.getElementById('merge-copy-btn');
const mergeLinkBtn = document.getElementById('merge-link-btn');
const mergeStatus = document.getElementById('merge-status');

let unsubscribeRoot = null;
let unsubscribeUserSub = null;
let expensesMap = new Map(); // merged from root + users/{uid}/expenses
let chart = null;

// Helper: small UI toast (non-intrusive)
function showToast(text, isError=false) {
  const id = 'simple-toast';
  let t = document.getElementById(id);
  if (!t) {
    t = document.createElement('div');
    t.id = id;
    t.style.position = 'fixed';
    t.style.bottom = '12px';
    t.style.left = '12px';
    t.style.padding = '10px 14px';
    t.style.background = isError ? '#f44336' : '#333';
    t.style.color = '#fff';
    t.style.borderRadius = '6px';
    t.style.zIndex = '9999';
    t.style.transition = 'opacity 0.3s';
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.style.opacity = '1';
  setTimeout(() => t.style.opacity = '0', 3500);
}

// Force google logout (best-effort to make account chooser appear)
async function forceGoogleLogout() {
  try {
    const w = window.open("https://accounts.google.com/Logout", "logout", "width=1,height=1,top=-1000,left=-1000");
    await new Promise(r => setTimeout(r, 900));
    if (w) w.close();
  } catch (_) {}
}

// Save a pending Google credential (idToken & accessToken) in sessionStorage
function savePendingGoogleCred(oauthCred) {
  if (!oauthCred) return;
  const payload = { idToken: oauthCred.idToken || null, accessToken: oauthCred.accessToken || null };
  sessionStorage.setItem('pendingGoogleCred', JSON.stringify(payload));
}

// Retrieve pending Google credential (returns OAuth fields or null)
function getPendingGoogleCred() {
  const raw = sessionStorage.getItem('pendingGoogleCred');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

// Remove pending cred
function clearPendingGoogleCred() { sessionStorage.removeItem('pendingGoogleCred'); }

// Ensure a lightweight user profile exists in `users/{uid}` (makes email->uid discovery possible)
async function ensureUserProfile(user) {
  if (!user || !user.uid) return;
  try {
    const uRef = doc(db, 'users', user.uid);
    await setDoc(uRef, { email: user.email || null, displayName: user.displayName || null, lastSeen: new Date().toISOString() }, { merge: true });
  } catch (e) {
    console.warn('ensureUserProfile failed', e);
  }
}

// ---------- AUTH: login/signup handlers ----------

document.getElementById('login-btn').onclick = async () => {
  authError.textContent = "";
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) return authError.textContent = "Enter email and password.";
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // if there is a pending Google credential (from earlier attempt), link it now
    await tryLinkPendingGoogleCredential();
  } catch (e) {
    authError.textContent = e.message || e.toString();
  }
};

document.getElementById('signup-btn').onclick = async () => {
  authError.textContent = "";
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) return authError.textContent = "Enter email and password.";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (cred?.user) await ensureUserProfile(cred.user);
  } catch (e) {
    authError.textContent = e.message || e.toString();
  }
};

// ---------- GOOGLE SIGN-IN (main robust flow) ----------

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' }); // force chooser

document.getElementById('google-login-btn').onclick = async () => {
  authError.textContent = "";
  try {
    // optional: sign out to reduce silent sign-in
    await signOut(auth).catch(()=>{});
    await forceGoogleLogout();

    // Start popup signin
    const result = await signInWithPopup(auth, provider);

    // Save small profile & start
    if (result?.user) {
      await ensureUserProfile(result.user);
      showToast('Signed in with Google: ' + (result.user.email || ''));
      // After sign-in, we still check if a password-method existed for that email
      // If so, it means the app may have an existing email/password account.
      await handlePostGoogleSignIn(result);
    }

  } catch (err) {
    console.error('Google sign-in error', err);
    // If the error is account-exists-with-different-credential we capture pending credential and instruct user to sign in with existing method
    if (err?.code === 'auth/account-exists-with-different-credential' || err?.code === 'auth/credential-already-in-use') {
      // get email
      const email = err.customData?.email || err.email || null;
      // get pending credential (if available)
      const pendingCred = GoogleAuthProvider.credentialFromError?.(err) || null;
      if (pendingCred) savePendingGoogleCred(pendingCred);
      // Ask user to sign in with existing method (usually password)
      if (email) {
        authError.textContent = `An account already exists for ${email}. Please sign in with your email & password to merge accounts.`;
      } else {
        authError.textContent = `Account exists with a different credential. Please sign in with your existing method so we can merge.`;
      }
      // Show merge helper UI
      showMergeHelper(email);
    } else {
      authError.textContent = err.message || 'Google sign-in failed.';
    }
  }
};

// Called after a successful Google popup sign-in
async function handlePostGoogleSignIn(result) {
  const user = result.user;
  if (!user || !user.email) return;

  // try to detect if email had 'password' sign-in method previously
  try {
    const methods = await fetchSignInMethodsForEmail(auth, user.email);
    // If the same email ALSO has password sign-in, we must ensure accounts merged.
    // If user.uid already matches the email-owner UID, it's fine; otherwise we prompt.
    if (methods.includes('password')) {
      // There's an email/password account for this email. Check users collection to find possible other UID(s)
      // Option A: If linking didn't happen automatically, prompt user to sign in with password to link (we store pending cred)
      const cred = GoogleAuthProvider.credentialFromResult?.(result) || null;
      if (cred) {
        savePendingGoogleCred(cred);
        // Now inform user
        authError.textContent = `An Email/Password account exists for ${user.email}. Please sign in with Email/Password (enter password in the form) — we will automatically link your Google account.`;
        showMergeHelper(user.email);
      } else {
        // no credential object (rare) — offer merge helper
        authError.textContent = `Please sign in with your existing Email/Password account (we will link Google afterwards).`;
        showMergeHelper(user.email);
      }
    } else {
      // No password account; we're good. Ensure user profile and start
      await ensureUserProfile(user);
      // startLiveQuery will be triggered by onAuthStateChanged
    }
  } catch (e) {
    console.warn('Post-Google fetchSignInMethods error', e);
  }
}

// Try to link pending Google credential to the currently signed-in user (called after email/password sign-in)
async function tryLinkPendingGoogleCredential() {
  const p = getPendingGoogleCred();
  if (!p) return;
  try {
    // Create credential object
    const credential = GoogleAuthProvider.credential(p.idToken || null, p.accessToken || null);
    if (!credential) {
      clearPendingGoogleCred();
      return;
    }
    // Link to current user
    await linkWithCredential(auth.currentUser, credential);
    clearPendingGoogleCred();
    showToast('Google account linked successfully.');
    // ensure profile
    await ensureUserProfile(auth.currentUser);
  } catch (e) {
    console.error('tryLinkPendingGoogleCredential error', e);
    authError.textContent = 'Failed to link Google credential: ' + (e.message || e.toString());
  }
}

// Show merge helper UI with optional prefilled email
function showMergeHelper(email) {
  mergeHelper.style.display = 'block';
  mergeOldUidInput.value = '';
  mergeStatus.textContent = '';
  mergeMsg.textContent = email ? `It looks like ${email} has an existing account. You can either sign-in with that email's password to automatically link, or paste the OLD UID below and click "Copy old data → my account".` : `An account exists. You can sign-in with your password to link, or paste OLD UID and copy data.`;
}

// Merge helper buttons
mergeLinkBtn.onclick = async () => {
  mergeStatus.textContent = '';
  // user will sign in through the main form (user must enter email and password above), then we will link in login handler
  mergeStatus.textContent = 'Enter your email & password in the login form above and press Log in; we will link Google automatically once you log in.';
};

mergeCopyBtn.onclick = async () => {
  // user can optionally input the old UID manually; otherwise we'll try to discover it
  mergeStatus.textContent = '';
  const oldUid = mergeOldUidInput.value.trim();
  mergeStatus.textContent = 'Attempting to copy old data...';
  try {
    const current = auth.currentUser;
    if (!current) {
      mergeStatus.textContent = 'Sign in first (either the Google user or the email user).';
      return;
    }
    let candidateUids = [];
    if (oldUid) candidateUids.push(oldUid);

    // Try to discover other uids with same email via `users` profile collection
    if (current.email) {
      const usersQ = query(collection(db, 'users'), where('email', '==', current.email));
      const snap = await getDocs(usersQ);
      snap.forEach(d => {
        if (d.id !== current.uid) candidateUids.push(d.id);
      });
    }

    // remove duplicates and current UID
    candidateUids = Array.from(new Set(candidateUids)).filter(u => u && u !== current.uid);
    if (candidateUids.length === 0) {
      mergeStatus.textContent = 'No old UID provided and none found in users collection. If you know the OLD UID, paste it above and retry, or run the admin migration script.';
      return;
    }

    // Attempt copy from users/{oldUid}/expenses or top-level 'expenses' where uid == oldUid
    let copiedCount = 0;
    for (const candidate of candidateUids) {
      // try users/{candidate}/expenses
      try {
        const oldCol = collection(db, 'users', candidate, 'expenses');
        const oldSnap = await getDocs(oldCol);
        if (!oldSnap.empty) {
          // copy docs to users/{current.uid}/expenses
          for (const d of oldSnap.docs) {
            const newRef = doc(collection(db, 'users', current.uid, 'expenses'));
            await setDoc(newRef, d.data());
            copiedCount++;
          }
        }
      } catch (e) {
        console.warn('users subcollection read failed for', candidate, e);
      }

      // try top-level 'expenses' with field uid == candidate
      try {
        const expensesQ = query(collection(db, 'expenses'), where('uid', '==', candidate));
        const expSnap = await getDocs(expensesQ);
        if (!expSnap.empty) {
          for (const d of expSnap.docs) {
            // write to users/{current.uid}/expenses
            const newRef = doc(collection(db, 'users', current.uid, 'expenses'));
            await setDoc(newRef, d.data());
            copiedCount++;
          }
        }
      } catch (e) {
        console.warn('root expenses read failed for', candidate, e);
      }
    }

    if (copiedCount > 0) {
      mergeStatus.textContent = `Copied ${copiedCount} documents into your current account. Refreshing view...`;
      // restart listeners
      startLiveQuery();
      setTimeout(()=> mergeStatus.textContent = 'Copy complete.', 800);
    } else {
      mergeStatus.textContent = 'No documents found to copy, or reads were blocked by security rules. If reads were blocked, run the admin migration script I provided earlier.';
    }
  } catch (e) {
    console.error(e);
    mergeStatus.textContent = 'Error during copy: ' + (e.message || e.toString());
  }
};

// ---------- LOGOUT ----------
document.getElementById('logout-btn').onclick = async () => {
  await signOut(auth).catch(()=>{});
};

// ---------- REDIRECT RESULT (mobile) ----------
getRedirectResult?.(auth).then(async (res) => {
  if (res?.user) {
    await ensureUserProfile(res.user);
  }
}).catch((e) => { console.warn('Redirect result error', e); });

// ---------- AUTH STATE ----------

onAuthStateChanged(auth, async (user) => {
  if (user) {
    loginPage.classList.add('hidden');
    mainPage.classList.remove('hidden');
    welcomeMessage.textContent = `Welcome, ${user.displayName || (user.email?.split?.('@')[0] ?? 'User')}!`;
    mergeHelper.style.display = 'none';
    mergeStatus.textContent = '';
    await ensureUserProfile(user);
    await tryLinkPendingGoogleCredential();
    startLiveQuery();
  } else {
    loginPage.classList.remove('hidden');
    mainPage.classList.add('hidden');
    welcomeMessage.textContent = 'Welcome!';
    stopLiveQuery();
  }
});

// ---------- ADD EXPENSE ----------

document.getElementById('add-expense-btn').onclick = async () => {
  dataError.textContent = '';
  const user = auth.currentUser;
  if (!user) return dataError.textContent = 'Please sign in.';
  const raw = (amountInput.value ?? '').toString().trim();
  const amount = raw === '' ? NaN : parseFloat(raw);
  const category = categoryInput.value || 'Others';
  const note = (noteInput.value || '').toString().trim();

  if (isNaN(amount) || amount <= 0) {
    return dataError.textContent = 'Enter a valid amount.';
  }

  try {
    // write to users/{uid}/expenses for consistency
    await addDoc(collection(db, 'users', user.uid, 'expenses'), {
      amount,
      category,
      note,
      date: new Date().toISOString()
    });
    amountInput.value = '';
    noteInput.value = '';
    // listeners will update view
  } catch (e) {
    console.error(e);
    dataError.textContent = e.message || 'Failed to add expense.';
  }
};

// ---------- LIVE QUERY (merge root + users subcollection) ----------

function stopLiveQuery() {
  if (unsubscribeRoot) { unsubscribeRoot(); unsubscribeRoot = null; }
  if (unsubscribeUserSub) { unsubscribeUserSub(); unsubscribeUserSub = null; }
  expensesMap.clear();
  renderExpenses();
}

function startLiveQuery() {
  stopLiveQuery();
  const user = auth.currentUser;
  if (!user) return;

  // Listen to top-level 'expenses' where uid == user.uid
  try {
    const qRoot = query(collection(db, 'expenses'), where('uid', '==', user.uid), orderBy('date', 'desc'));
    unsubscribeRoot = onSnapshot(qRoot, snap => handleRootSnapshot(snap), e => console.warn('root snapshot error', e));
  } catch (e) { console.warn('subscribe root failed', e); }

  // Listen to users/{uid}/expenses subcollection
  try {
    const qUserSub = query(collection(db, 'users', user.uid, 'expenses'), orderBy('date', 'desc'));
    unsubscribeUserSub = onSnapshot(qUserSub, snap => handleUserSubSnapshot(snap), e => console.warn('user-sub snapshot error', e));
  } catch (e) { console.warn('subscribe user sub failed', e); }
}

// root snapshot handler
function handleRootSnapshot(snap) {
  // mark previous root entries removed then update
  // We'll store with key `root:{docId}`
  // Remove old root keys that are not present
  const present = new Set();
  snap.forEach(docSnap => {
    const key = `root:${docSnap.id}`;
    present.add(key);
    expensesMap.set(key, { id: docSnap.id, ...docSnap.data(), source:'root' });
  });
  // delete stale root keys
  for (const k of Array.from(expensesMap.keys())) {
    if (k.startsWith('root:') && !present.has(k)) expensesMap.delete(k);
  }
  renderExpenses();
}

// user subcollection snapshot handler
function handleUserSubSnapshot(snap) {
  const present = new Set();
  snap.forEach(docSnap => {
    const key = `usersub:${docSnap.id}`;
    present.add(key);
    expensesMap.set(key, { id: docSnap.id, ...docSnap.data(), source:'usersub' });
  });
  for (const k of Array.from(expensesMap.keys())) {
    if (k.startsWith('usersub:') && !present.has(k)) expensesMap.delete(k);
  }
  renderExpenses();
}

// Render merged expenses into table + chart
function renderExpenses() {
  const tbody = expenseTableBody;
  tbody.innerHTML = '';

  // Build list from map and sort by date descending
  const arr = Array.from(expensesMap.values()).map(e => {
    // normalize date
    let when;
    if (!e.date) when = new Date();
    else {
      // handle possible formats (ISO string, ms number, Firestore string)
      when = new Date(e.date);
      if (isNaN(when)) {
        try { when = new Date(parseInt(e.date)); } catch(_) { when = new Date(); }
      }
    }
    return { ...e, _when: when };
  });

  arr.sort((a,b) => b._when - a._when);

  const chartPoints = [];
  const categoryTotals = {};

  arr.forEach(item => {
    const tr = document.createElement('tr');
    const formattedDate = item._when.toLocaleDateString();
    tr.innerHTML = `
      <td>₹ ${Number(item.amount || 0).toFixed(2)}</td>
      <td>${item.category || ''}</td>
      <td>${item.note || ''}</td>
      <td>${formattedDate}</td>
      <td><button class="delete delete-btn" data-id="${item.id}" data-source="${item.source}">Delete</button></td>
    `;
    tbody.appendChild(tr);

    // accumulate
    categoryTotals[item.category || 'Others'] = (categoryTotals[item.category || 'Others'] || 0) + Number(item.amount || 0);
    chartPoints.push({ x: item._when.toISOString().slice(0,10), y: Number(item.amount || 0) });
  });

  // attach delete handlers
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const source = btn.dataset.source;
      try {
        if (source === 'root') {
          await deleteDoc(doc(db, 'expenses', id));
        } else {
          const user = auth.currentUser;
          if (!user) return showToast('Not signed in', true);
          await deleteDoc(doc(db, 'users', user.uid, 'expenses', id));
        }
      } catch (e) {
        console.error('delete error', e);
        showToast('Delete failed: ' + (e.message || e.toString()), true);
      }
    };
  });

  // draw chart
  drawChart(categoryTotals, chartPoints);

  // If empty and there may be other account data, offer migration helper
  if (arr.length === 0) {
    // Try to discover other user UID(s) by searching users collection for same email
    const cur = auth.currentUser;
    if (cur && cur.email) {
      (async () => {
        try {
          const usersQ = query(collection(db, 'users'), where('email','==', cur.email));
          const snap = await getDocs(usersQ);
          const other = [];
          snap.forEach(d => { if (d.id !== cur.uid) other.push(d.id); });
          if (other.length > 0) {
            mergeHelper.style.display = 'block';
            mergeOldUidInput.value = other[0] || '';
            mergeMsg.textContent = `We found data associated with another UID (${other[0]}). You can paste it in the box or click Copy to migrate data into your current account.`;
          } else {
            // no users doc found — hide
            mergeHelper.style.display = 'none';
          }
        } catch (err) {
          console.warn('discover users error', err);
          // can't discover (maybe rules) — show minimal message
          mergeHelper.style.display = 'none';
        }
      })();
    } else {
      mergeHelper.style.display = 'none';
    }
  } else {
    mergeHelper.style.display = 'none';
  }
}

// Chart draw (categoryTotals: object, chartPoints array)
function drawChart(categoryTotals, timePoints) {
  const ctx = expenseChartCanvas.getContext('2d');
  if (chart) try { chart.destroy(); } catch(_) {}
  const type = chartTypeSelect.value || 'bar';
  if (type === 'line') {
    // build daily totals
    const byDate = {};
    timePoints.forEach(pt => { byDate[pt.x] = (byDate[pt.x] || 0) + pt.y; });
    const labels = Object.keys(byDate).sort();
    const data = labels.map(k => byDate[k]);
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Daily spend', data }] },
      options: { responsive:true }
    });
  } else {
    const labels = Object.keys(categoryTotals);
    const data = labels.map(k => categoryTotals[k]);
    chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Total by category', data }] },
      options: { responsive:true, plugins:{ legend:{ display:false } } }
    });
  }
}

// ---------- Utilities: attempt to auto-link stored pending credential ----------

async function tryLinkPendingGoogleCredential() {
  const pending = getPendingGoogleCred();
  if (!pending) return;
  if (!auth.currentUser) return;
  try {
    const credential = GoogleAuthProvider.credential(pending.idToken || null, pending.accessToken || null);
    if (!credential) { clearPendingGoogleCred(); return; }
    await linkWithCredential(auth.currentUser, credential);
    clearPendingGoogleCred();
    showToast('Google linked to your account successfully.');
  } catch (e) {
    console.error('link pending error', e);
    // keep pending cred for next attempt
    // show message to user
    authError.textContent = 'Automatic linking failed: ' + (e.message || e.toString());
  }
}

// ---------- START / STOP listeners ----------

function startLiveQuery() { startLiveQueryForCurrentUser(); }
function stopLiveQuery() { stopLiveQuery(); }

// Implementation detail: to avoid duplicate function name shadowing, define startLiveQueryForCurrentUser
function startLiveQueryForCurrentUser() {
  const user = auth.currentUser;
  if (!user) return;
  // clear previous
  if (unsubscribeRoot) { unsubscribeRoot(); unsubscribeRoot = null; }
  if (unsubscribeUserSub) { unsubscribeUserSub(); unsubscribeUserSub = null; }
  expensesMap.clear();

  // root
  try {
    const qRoot = query(collection(db, 'expenses'), where('uid','==', user.uid), orderBy('date','desc'));
    unsubscribeRoot = onSnapshot(qRoot, handleRootSnapshot, err => console.warn('root snapshot err', err));
  } catch (e) { console.warn('subscribe root failed', e); }

  // users subcollection
  try {
    const qUser = query(collection(db, 'users', user.uid, 'expenses'), orderBy('date','desc'));
    unsubscribeUserSub = onSnapshot(qUser, handleUserSubSnapshot, err => console.warn('user sub snapshot err', err));
  } catch (e) { console.warn('subscribe user sub failed', e); }
}

// ---------- Chart type change ----------
chartTypeSelect.onchange = () => {
  renderExpenses(); // re-render with new chart type
};

// ---------- End of app.js ----------
