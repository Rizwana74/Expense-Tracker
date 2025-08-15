import { app } from "./main.js";
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, GoogleAuthProvider, 
  signInWithPopup, signOut 
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { 
  getFirestore, collection, addDoc, query, where, 
  orderBy, onSnapshot, deleteDoc, doc 
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

const loginPage = document.getElementById('login-page');
const mainPage = document.getElementById('main-page');
const welcomeMessage = document.getElementById('welcome-message');

onAuthStateChanged(auth, (user) => {
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

document.getElementById('login-btn').onclick = () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  signInWithEmailAndPassword(auth, email, password).catch(err => alert(err.message));
};

document.getElementById('signup-btn').onclick = () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  createUserWithEmailAndPassword(auth, email, password).catch(err => alert(err.message));
};

document.getElementById('google-login-btn').onclick = () => {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider).catch(err => alert(err.message));
};

document.getElementById('logout-btn').onclick = () => signOut(auth);

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

  document.getElementById('amount').value = '';
  document.getElementById('note').value = '';
};

function loadExpenses() {
  const q = query(
    collection(db, 'expenses'),
    where('uid', '==', auth.currentUser.uid),
    orderBy('date', 'desc')
  );

  onSnapshot(q, (snapshot) => {
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

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = () => deleteDoc(doc(db, 'expenses', btn.getAttribute('data-id')));
    });

    updateChart(categoryTotals);
  });
}

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
