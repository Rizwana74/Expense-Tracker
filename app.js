import { auth, db, googleProvider } from "./main.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ===== DOM ===== */
const body = document.body;
const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const googleBtn = document.getElementById("googleBtn");
const logoutBtn = document.getElementById("logoutBtn");

const welcomeText = document.getElementById("welcomeText");
const amountEl = document.getElementById("amount");
const categoryEl = document.getElementById("category");
const noteEl = document.getElementById("note");
const addExpenseBtn = document.getElementById("addExpenseBtn");
const expenseTbody = document.getElementById("expenseTbody");

const chartCanvas = document.getElementById("expenseChart");
let chartInstance = null;

/* ===== State ===== */
let currentUID = null;

/* ===== Auth State ===== */
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUID = user.uid;
    loginSection.classList.add("hidden");
    dashboardSection.classList.remove("hidden");
    body.classList.remove("login-page");
    body.classList.add("dashboard-page");

    const name = user.displayName || user.email || "there";
    welcomeText.textContent = `Welcome, ${name}!`;

    startExpenseStream();
  } else {
    currentUID = null;
    dashboardSection.classList.add("hidden");
    loginSection.classList.remove("hidden");
    body.classList.remove("dashboard-page");
    body.classList.add("login-page");
  }
});

/* ===== Auth Actions ===== */
loginBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const pass = passwordEl.value;
  if (!email || !pass) return alert("Please enter email and password.");
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    alert(e.message);
  }
});

signupBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const pass = passwordEl.value;
  if (!email || !pass) return alert("Please enter email and password.");
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    alert("Account created! You are now signed in.");
  } catch (e) {
    alert(e.message);
  }
});

googleBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    alert(e.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

/* ===== Add Expense ===== */
addExpenseBtn.addEventListener("click", async () => {
  if (!currentUID) return alert("Please sign in first.");

  const amount = parseFloat(amountEl.value);
  const category = (categoryEl.value || "").trim();
  const note = (noteEl.value || "").trim();

  if (!amount || !category) {
    return alert("Amount and Category are required.");
  }

  try {
    await addDoc(collection(db, "users", currentUID, "expenses"), {
      amount,
      category,
      note,
      createdAt: serverTimestamp()
    });
    amountEl.value = "";
    categoryEl.value = "";
    noteEl.value = "";
  } catch (e) {
    alert("Error adding expense: " + e.message);
  }
});

/* ===== Stream & Render ===== */
function startExpenseStream() {
  const colRef = collection(db, "users", currentUID, "expenses");
  const q = query(colRef, orderBy("createdAt", "desc"));

  onSnapshot(q, (snap) => {
    const rows = [];
    const totalsByCategory = {};

    snap.forEach((d) => {
      const data = d.data();
      const id = d.id;

      const amt = Number(data.amount) || 0;
      const cat = data.category || "Other";
      const note = data.note || "";
      const dateStr = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "—";

      totalsByCategory[cat] = (totalsByCategory[cat] || 0) + amt;

      rows.push(`
        <tr>
          <td>₹ ${amt.toLocaleString()}</td>
          <td>${escapeHTML(cat)}</td>
          <td>${escapeHTML(note)}</td>
          <td>${dateStr}</td>
          <td>
            <button class="btn danger" data-id="${id}" data-action="delete">Delete</button>
          </td>
        </tr>
      `);
    });

    expenseTbody.innerHTML = rows.join("");
    expenseTbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        try {
          await deleteDoc(doc(db, "users", currentUID, "expenses", id));
        } catch (e) {
          alert("Delete failed: " + e.message);
        }
      });
    });

    drawChart(totalsByCategory);
  });
}

/* ===== Chart ===== */
function drawChart(byCategory){
  const labels = Object.keys(byCategory);
  const data = Object.values(byCategory);

  if (!chartCanvas) return;

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(chartCanvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        label: "Total Spend",
        data,
        borderWidth: 0,
        hoverOffset: 6,
        backgroundColor: [
          "#b388ff","#9a73ff","#8a2be2","#a259ff","#c8b6ff",
          "#e0aaff","#7b2cbf","#5a189a","#3c096c","#efb8ff"
        ]
      }]
    },
    options: {
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#fff",
            boxWidth: 14,
            padding: 16
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.raw ?? 0;
              return ` ₹ ${Number(v).toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

/* ===== Utils ===== */
function escapeHTML(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
