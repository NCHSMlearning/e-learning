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

  const addStudentForm = document.getElementById("add-student-form");
  if (addStudentForm) addStudentForm.addEventListener("submit", handleAddStudent);

  // Display logged-in user name
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  const nameEl = document.getElementById("userName");
  if (nameEl && user) nameEl.textContent = user.full_name;

  // Load students on admin page
  loadStudents();
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

// =========================
// 👩‍🎓 Add Student (Admin)
// =========================
async function handleAddStudent(e) {
  e.preventDefault();

  const id = document.getElementById("student-id")?.value.trim();
  const name = document.getElementById("student-name")?.value.trim();
  const email = document.getElementById("student-email")?.value.trim().toLowerCase();
  const phone = document.getElementById("student-phone")?.value.trim();
  const password = document.getElementById("student-password")?.value;

  if (!id || !name || !email || !phone || !password) {
    alert("Please fill in all fields.");
    return;
  }

  try {
    // Sign up student in Supabase
    const { data: signUpData, error: signUpError } = await sb.auth.signUp({ email, password });
    if (signUpError) {
      alert("Failed to create student: " + signUpError.message);
      return;
    }

    // Insert profile
    const { error: profileError } = await sb.from('profiles')
      .insert([{ id: signUpData.user.id, full_name: name, email, phone, role: 'student', approved: true }]);
    if (profileError) {
      alert("Failed to save profile: " + profileError.message);
      return;
    }

    alert("✅ Student added successfully!");

    // Refresh student table
    loadStudents();

    // Reset form
    e.target.reset();

  } catch (err) {
    console.error(err);
    alert("An unexpected error occurred.");
  }
}

// =========================
// 👩‍🎓 Load Students (Admin Table)
// =========================
async function loadStudents() {
  const studentsTable = document.getElementById("students-table");
  if (!studentsTable) return;

  try {
    const { data: students, error } = await sb
      .from('profiles')
      .select('*')
      .eq('role', 'student');

    if (error) throw error;

    studentsTable.innerHTML = '';
    students.forEach(s => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${s.id}</td><td>${s.full_name}</td><td>${s.email}</td><td>${s.phone}</td>`;
      studentsTable.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    alert('Failed to load students: ' + err.message);
  }
}
