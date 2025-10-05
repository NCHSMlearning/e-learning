// =========================
// 🔗 Initialize Supabase
// =========================
let sb; // Supabase client placeholder

document.addEventListener("DOMContentLoaded", () => {
  const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // =========================
  // 🧭 Handle User Registration
  // =========================
  const regForm = document.getElementById("registerForm");
  if (regForm) regForm.addEventListener("submit", handleRegister);

  // =========================
  // 🔐 Handle User Login
  // =========================
  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  // =========================
  // 🙋 Display Logged-In User Name on Dashboard
  // =========================
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const nameEl = document.getElementById("userName");
  if (nameEl && user) {
    nameEl.textContent = user.full_name;
  }
});

// =========================
// 🧭 Registration Function
// =========================
async function handleRegister(e) {
  e.preventDefault();

  const name = document.getElementById("name")?.value.trim();
  const phone = document.getElementById("phone")?.value.trim();
  const email = document.getElementById("regEmail")?.value.trim().toLowerCase();
  const password = document.getElementById("regPassword")?.value;
  const confirmPassword = document.getElementById("confirmPassword")?.value;

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

  const { data: authData, error: authError } = await sb.auth.signUp({
    email: email,
    password: password
  });

  if (authError) {
    alert('Registration failed: ' + authError.message);
    return false;
  }

  const userId = authData.user.id;
  const { error: profileError } = await sb
    .from('profiles')
    .insert([{ id: userId, full_name: name, role: 'student' }]);

  if (profileError) {
    alert('Profile creation failed: ' + profileError.message);
    return false;
  }

  alert("✅ Registration successful! You can now log in.");
  window.location.href = "login.html";
}

// =========================
// 🔐 Login Function
// =========================
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById("email")?.value.trim().toLowerCase();
  const password = document.getElementById("password")?.value;

  const { data: authData, error: authError } = await sb.auth.signInWithPassword({
    email, password
  });

  if (authError) {
    alert('Login failed: ' + authError.message);
    return;
  }

  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profileError) {
    alert('Profile fetch error: ' + profileError.message);
    return;
  }

  localStorage.setItem('loggedInUser', JSON.stringify(profile));

  if (profile.role === 'admin') {
    window.location.href = 'admin.html';
  } else {
    window.location.href = 'index.html';
  }
}

// =========================
// 🚪 Logout Function
// =========================
async function logout() {
  await sb.auth.signOut();
  localStorage.removeItem("loggedInUser");
  window.location.href = "login.html";
}
