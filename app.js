
// app.js
import { auth, db } from "./main.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// --- Auth Functions ---
document.getElementById("signup-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    alert("Sign up successful!");
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    alert("Login successful!");
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("google-btn").addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    alert("Google login successful!");
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    alert("Logged out successfully!");
  } catch (error) {
    alert(error.message);
  }
});

// --- Add Expense ---
document.getElementById("add-expense-btn").addEventListener("click", async () => {
  const amount = parseFloat(document.getElementById("amount").value);
  const category = document.getElementById("category").value;
  const note = document.getElementById("note").value || "";
  const user = auth.currentUser;

  if (!user) {
    alert("Please sign in first.");
    return;
  }

  try {
    await addDoc(collection(db, "expenses"), {
      amount: amount,
      category: category,
      note: note,
      uid: user.uid,
      date: new Date().toISOString()
    });
    alert("Expense added!");
    loadExpenses(user.uid); // Refresh after adding
  } catch (error) {
    console.error("Error adding expense:", error);
    alert(error.message);
  }
});

// --- Load Expenses ---
async function loadExpenses(uid) {
  try {
    const expenseRef = collection(db, "expenses");
    const q = query(expenseRef, where("uid", "==", uid));
    const querySnapshot = await getDocs(q);

    const tableBody = document.getElementById("expense-table-body");
    tableBody.innerHTML = ""; // Clear table

    querySnapshot.forEach((doc) => {
      const exp = doc.data();
      const row = `<tr>
        <td>${exp.amount}</td>
        <td>${exp.category}</td>
        <td>${exp.note}</td>
        <td>${new Date(exp.date).toLocaleDateString()}</td>
      </tr>`;
      tableBody.innerHTML += row;
    });
  } catch (error) {
    console.error("Error loading expenses:", error);
  }
}

// --- Auto-load when logged in ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadExpenses(user.uid);
  } else {
    document.getElementById("expense-table-body").innerHTML = "";
  }
});
