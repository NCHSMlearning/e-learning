// =========================
// 🔗 Initialize Supabase
// =========================
let sb;

document.addEventListener("DOMContentLoaded", () => {
  const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Attach form listeners
  const regForm = document.getElementById("registerForm");
  if (regForm) regForm.addEventListener("submit", handleRegister);

  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  // Display logged-in user name
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const nameEl = document.getElementById("userName");
  if (nameEl && user) nameEl.textContent = user.full_name;
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
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  if (!/^[0-9]{10}$/.test(phone)) {
    alert("Please enter a valid 10-digit phone number.");
    return;
  }

  try {
    // Sign up
    const { data: signUpData, error: signUpError } = await sb.auth.signUp({ email, password });
    if (signUpError) {
      alert("Registration failed: " + signUpError.message);
      return;
    }

    // Sign in immediately to insert profile
    const { data: signInData, error: signInError } = await sb.auth.signInWithPassword({ email, password });
    if (signInError) {
      alert("Sign-in failed after registration: " + signInError.message);
      return;
    }

    // Insert profile with approved = false
    const { error: profileError } = await sb
      .from('profiles')
      .insert([{ id: signInData.user.id, full_name: name, phone, role: 'student', approved: false }]);

    if (profileError) {
      alert('Profile creation failed: ' + profileError.message);
      return;
    }

    alert("✅ Registration successful! Your account is pending admin approval.");
    window.location.href = "login.html";

  } catch (err) {
    console.error(err);
    alert("An unexpected error occurred.");
  }
}

// =========================
// 🔐 Login Function
// =========================
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById("email")?.value.trim().toLowerCase();
  const password = document.getElementById("password")?.value;

  const { data: authData, error: authError } = await sb.auth.signInWithPassword({ email, password });
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

  if (!profile.approved) {
    alert("Your account is pending approval by an admin.");
    return;
  }

  localStorage.setItem('loggedInUser', JSON.stringify(profile));
  window.location.href = profile.role === 'admin' ? 'admin.html' : 'index.html';
}

// =========================
// 🚪 Logout Function
// =========================
async function logout() {
  await sb.auth.signOut();
  localStorage.removeItem("loggedInUser");
  window.location.href = "login.html";
}
