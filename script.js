// =========================
// 🧭 Handle User Registration
// =========================
function handleRegister(e) {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;

  // Check if user already exists
  if (localStorage.getItem(email)) {
    alert("An account with this email already exists.");
    return false;
  }

  // Create user object
  const user = {
    name,
    phone,
    email,
    password,
  };

  // Store user data in localStorage
  localStorage.setItem(email, JSON.stringify(user));

  alert("Registration successful! You can now log in.");
  window.location.href = "login.html";
  return false;
}

// =========================
// 🔐 Handle User Login
// =========================
function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;

  const storedUser = JSON.parse(localStorage.getItem(email));

  if (storedUser && storedUser.password === password) {
    // Save session info
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
