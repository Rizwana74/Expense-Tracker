// ✅ Replace with your Firebase config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const loginPage = document.getElementById('login-page');
const mainPage = document.getElementById('main-page');
const welcomeMessage = document.getElementById('welcome-message');

auth.onAuthStateChanged(user => {
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
  auth.signInWithEmailAndPassword(email, password).catch(alert);
};
document.getElementById('signup-btn').onclick = () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  auth.createUserWithEmailAndPassword(email, password).catch(alert);
};
document.getElementById('google-login-btn').onclick = () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(alert);
};
document.getElementById('logout-btn').onclick = () => auth.signOut();

document.getElementById('add-expense-btn').onclick = () => {
  const amount = parseFloat(document.getElementById('amount').value);
  const category = document.getElementById('category').value;
  const note = document.getElementById('note').value;

  if (!amount) return alert("Enter amount");

  db.collection('expenses').add({
    uid: auth.currentUser.uid,
    amount,
    category,
    note,
    date: new Date()
  });
};

function loadExpenses() {
  db.collection('expenses').where('uid', '==', auth.currentUser.uid)
    .orderBy('date', 'desc')
    .onSnapshot(snapshot => {
      const table = document.getElementById('expense-table');
      table.innerHTML = '';
      let categoryTotals = {};

      snapshot.forEach(doc => {
        const data = doc.data();
        const tr = document.createElement('tr');

        tr.innerHTML = `
          <td>${data.amount}</td>
          <td>${data.category}</td>
          <td>${data.note || ''}</td>
          <td>${data.date.toDate().toLocaleDateString()}</td>
          <td><button class="delete-btn" data-id="${doc.id}">Delete</button></td>
        `;

        table.appendChild(tr);

        categoryTotals[data.category] = (categoryTotals[data.category] || 0) + data.amount;
      });

      // Delete button
      document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = () => {
          db.collection('expenses').doc(btn.getAttribute('data-id')).delete();
        };
      });

      // Chart update
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
