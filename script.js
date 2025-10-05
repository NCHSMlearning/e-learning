// ==============================
// Simple Local Storage Auth System
// ==============================

// Helper: Get users from localStorage
function getUsers() {
  const users = localStorage.getItem("nchsm_users");
  return users ? JSON.parse(users) : [];
}

// Helper: Save users to localStorage
function saveUsers(users) {
  localStorage.setItem("nchsm_users", JSON.stringify(users));
}

// ==============================
// REGISTER LOGIC
// ==============================
const registerForm = document.getElementById("registerForm");

if (registerForm) {
  registerForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!fullName || !email || !phone || !password) {
      alert("⚠️ Please fill in all fields.");
      return;
    }

    let users = getUsers();
    const existingUser = users.find(u => u.email === email);

    if (existingUser) {
      alert("⚠️ An account with this email already exists.");
      return;
    }

    const newUser = { fullName, email, phone, password };
    users.push(newUser);
    saveUsers(users);

    alert("✅ Registration successful! You can now log in.");
    registerForm.reset();
    window.location.href = "login.html";
  });
}

// ==============================
// LOGIN LOGIC
// ==============================
const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value.trim();

    let users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);

    if (!user) {
      alert("❌ Invalid email or password. Please try again.");
      return;
    }

    localStorage.setItem("nchsm_loggedInUser", JSON.stringify(user));
    alert(`🎉 Welcome, ${user.fullName}!`);
    window.location.href = "index.html";
  });
}

// ==============================
// CHECK LOGIN STATE (Optional)
// ==============================
function getLoggedInUser() {
  const user = localStorage.getItem("nchsm_loggedInUser");
  return user ? JSON.parse(user) : null;
}

// ==============================
// LOGOUT (if needed)
// ==============================
function logout() {
  localStorage.removeItem("nchsm_loggedInUser");
  alert("You have been logged out.");
  window.location.href = "login.html";
}
