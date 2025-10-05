// ===========================
// NCHSM E-Learning Auth System (with Phone Support)
// ===========================

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const logoutBtn = document.getElementById("logoutBtn");
  const loginMessage = document.getElementById("loginMessage");
  const registerMessage = document.getElementById("registerMessage");

  // Load users from localStorage or create empty array
  let users = JSON.parse(localStorage.getItem("nchsmUsers")) || [];

  // -------- LOGIN --------
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value.trim();

      const user = users.find((u) => u.email === email && u.password === password);

      if (user) {
        localStorage.setItem("loggedInUser", JSON.stringify(user));
        window.location.href = "index.html";
      } else {
        loginMessage.textContent = "Invalid email or password!";
      }
    });
  }

  // -------- REGISTER --------
  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const phone = document.getElementById("phone").value.trim();
      const password = document.getElementById("regPassword").value.trim();
      const confirm = document.getElementById("confirmPassword").value.trim();

      // Validation
      if (password !== confirm) {
        registerMessage.textContent = "Passwords do not match!";
        return;
      }

      if (!/^[0-9]{10}$/.test(phone)) {
        registerMessage.textContent = "Enter a valid 10-digit phone number!";
        return;
      }

      const exists = users.find((u) => u.email === email);
      if (exists) {
        registerMessage.textContent = "Email already registered!";
        return;
      }

      const newUser = { name, email, phone, password };
      users.push(newUser);
      localStorage.setItem("nchsmUsers", JSON.stringify(users));
      localStorage.setItem("loggedInUser", JSON.stringify(newUser));

      registerMessage.style.color = "green";
      registerMessage.textContent = "Registration successful! Redirecting...";
      setTimeout(() => (window.location.href = "index.html"), 1000);
    });
  }

  // -------- LOGOUT --------
  if (logoutBtn) {
    const user = localStorage.getItem("loggedInUser");
    if (!user) {
      window.location.href = "login.html";
    }

    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("loggedInUser");
      window.location.href = "login.html";
    });
  }
});

