// Import Firebase SDK modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// ✅ Replace with your Firebase config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const loginPage = document.getElementById('login-page');
const mainPage = document.getElementById('main-page');
const welcomeMessage = document.getElementById('welcome-message');

// Auth State Listener
onAuthStateChanged(auth, user => {
  if (user) {
    loginPage.classList.add('hidden');
    mainPage.classList.remove('hidden');
    welcomeMessage.textContent = `Welcome, ${user.email.split('@')[0]}!`;
    loadExpenses();
  } else {
    loginPage.classList.remove('hidden');
    mainPage.classList.add('hidden');
  }
});

// Login
document.getElementById('login-btn').onclick = () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  signInWithEmailAndPassword(auth, email, password).catch(err => alert(err.message));
};

// Signup
document.getElementById('signup-btn').onclick = () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  createUserWithEmailAndPassword(auth, email, password).catch(err => alert(err.message));
};

// Google Sign-in
document.getElementById('google-login-btn').onclick = () => {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider).catch(err => alert(err.message));
};

// Logout
document.getElementById('logout-btn').onclick = () => signOut(auth);

// Add Expense
document.getElementById('add-expense-btn').onclick = async () => {
  const amount = parseFloat(document.getElementById('amount').value);
  const category = document.getElementById('category').value;
  const note = document.getElementById('note').value;

  if (!amount) return alert("Enter amount");

  await addDoc(collection(db, 'expenses'), {
    uid: auth.currentUser.uid,
    amount,
    category,
    note,
    date: new Date()
  });
};

// Load Expenses
function loadExpenses() {
  const q = query(
    collection(db, 'expenses'),
    where('uid', '==', auth.currentUser.uid),
    orderBy('date', 'desc')
  );

  onSnapshot(q, snapshot => {
    const table = document.getElementById('expense-table');
    table.innerHTML = '';
    let categoryTotals = {};

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${data.amount}</td>
        <td>${data.category}</td>
        <td>${data.note || ''}</td>
        <td>${data.date.toDate().toLocaleDateString()}</td>
        <td><button class="delete-btn" data-id="${docSnap.id}">Delete</button></td>
      `;
      table.appendChild(tr);
      categoryTotals[data.category] = (categoryTotals[data.category] || 0) + data.amount;
    });

    // Delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = async () => {
        await deleteDoc(doc(db, 'expenses', btn.getAttribute('data-id')));
      };
    });

    updateChart(categoryTotals);
  });
}

// Chart.js Pie Chart
let chart;
function updateChart(categoryTotals) {
  const ctx = document.getElementById('expense-chart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(categoryTotals),
      datasets: [{
        data: Object.values(categoryTotals),
        backgroundColor: ['#ff8fab','#a29bfe','#ffeaa7','#fab1a0','#55efc4']
      }]
    }
  });
}
