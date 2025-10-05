// =========================
// 🧭 Handle User Registration
// =========================
function handleRegister(e) {
  e.preventDefault();

  const name = document.getElementById("name")?.value.trim();
  const phone = document.getElementById("phone")?.value.trim();
  const email = document.getElementById("regEmail")?.value.trim().toLowerCase();
  const password = document.getElementById("regPassword")?.value;
  const confirmPassword = document.getElementById("confirmPassword")?.value;

  // Safety: if any element is missing, stop
  if (!name || !phone || !email || !password || !confirmPassword) {
    alert("Please fill in all fields.");
    return false;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match.");
    return false;
  }

  if (!/^[0-9]{10}$/.test(phone)) {
    alert("Please enter a valid 10-digit phone number.");
    return false;
  }

  // ✅ Check if account already exists
  if (localStorage.getItem(email)) {
    alert("An account with this email already exists.");
    return false;
  }

  // ✅ Save user to localStorage
  const user = { name, phone, email, password };
  localStorage.setItem(email, JSON.stringify(user));

  alert("✅ Registration successful! You can now log in.");
  window.location.href = "login.html";
  return false;
}

// =========================
// 🔐 Handle User Login
// =========================
function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById("email")?.value.trim().toLowerCase();
  const password = document.getElementById("password")?.value;

  const storedUser = JSON.parse(localStorage.getItem(email));

  if (storedUser && storedUser.password === password) {
    localStorage.setItem("loggedInUser", email);
    window.location.href = "index.html";
  } else {
    alert("Invalid email or password. Please try again.");
  }
}

// =========================
// 🚪 Handle Logout
// =========================
function logout() {
  localStorage.removeItem("loggedInUser");
  window.location.href = "login.html";
}

// =========================
// 🙋 Display Logged-In User Name on Dashboard
// =========================
window.addEventListener("DOMContentLoaded", () => {
  const loggedEmail = localStorage.getItem("loggedInUser");
  if (loggedEmail) {
    const user = JSON.parse(localStorage.getItem(loggedEmail));
    const nameEl = document.getElementById("userName");
    if (nameEl && user) {
      nameEl.textContent = user.name;
    }
  }
});

// =========================
// 🧩 Attach Event Listeners (waits for DOM)
// =========================
document.addEventListener("DOMContentLoaded", () => {
  const regForm = document.getElementById("registerForm");
  const loginForm = document.getElementById("loginForm");

  if (regForm) regForm.addEventListener("submit", handleRegister);
  if (loginForm) loginForm.addEventListener("submit", handleLogin);
});
