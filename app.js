
import { auth, db } from "./main.js";
import { 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { 
    collection, addDoc, query, where, orderBy, getDocs, deleteDoc, doc 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// UI elements
const authSection = document.getElementById("auth-section");
const appSection = document.getElementById("app-section");

const signupBtn = document.getElementById("signup-btn");
const loginBtn = document.getElementById("login-btn");
const googleBtn = document.getElementById("google-btn");
const logoutBtn = document.getElementById("logout-btn");

const amountInput = document.getElementById("amount");
const categorySelect = document.getElementById("category");
const noteInput = document.getElementById("note");
const addExpenseBtn = document.getElementById("add-expense-btn");
const expensesList = document.getElementById("expenses-list");

// Sign Up
signupBtn.addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
        alert("Please fill in all fields");
        return;
    }

    try {
        await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
        alert(err.message);
    }
});

// Login
loginBtn.addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
        alert("Please fill in all fields");
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        alert(err.message);
    }
});

// Google Login
googleBtn.addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (err) {
        alert(err.message);
    }
});

// Logout
logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
});

// Auth State Change
onAuthStateChanged(auth, (user) => {
    if (user) {
        authSection.classList.add("hidden");
        appSection.classList.remove("hidden");
        loadExpenses();
    } else {
        authSection.classList.remove("hidden");
        appSection.classList.add("hidden");
    }
});

// Add Expense
addExpenseBtn.addEventListener("click", async () => {
    const amount = amountInput.value.trim();
    const category = categorySelect.value;
    const note = noteInput.value.trim();
    const user = auth.currentUser;

    if (!amount || !category) {
        alert("Please enter amount and category");
        return;
    }

    try {
        await addDoc(collection(db, "expenses"), {
            uid: user.uid,
            amount: parseFloat(amount),
            category,
            note,
            date: new Date().toISOString()
        });
        amountInput.value = "";
        noteInput.value = "";
        loadExpenses();
    } catch (err) {
        alert("Error adding expense: " + err.message);
    }
});

// Load Expenses
async function loadExpenses() {
    const user = auth.currentUser;
    expensesList.innerHTML = "";

    try {
        const q = query(
            collection(db, "expenses"),
            where("uid", "==", user.uid),
            orderBy("date", "desc")
        );
        const snapshot = await getDocs(q);

        snapshot.forEach((docSnap) => {
            const exp = docSnap.data();
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${exp.amount}</td>
                <td>${exp.category}</td>
                <td>${exp.note || ""}</td>
                <td>${new Date(exp.date).toLocaleString()}</td>
                <td><button onclick="deleteExpense('${docSnap.id}')">Delete</button></td>
            `;
            expensesList.appendChild(row);
        });
    } catch (err) {
        alert("Error loading expenses: " + err.message);
    }
}

// Delete Expense
window.deleteExpense = async function (id) {
    try {
        await deleteDoc(doc(db, "expenses", id));
        loadExpenses();
    } catch (err) {
        alert("Error deleting expense: " + err.message);
    }
};
