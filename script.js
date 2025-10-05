// =========================
// 🔗 Initialize Supabase
// =========================
let sb;
document.addEventListener("DOMContentLoaded", () => {
  const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Check logged-in user
  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user) window.location.href = "login.html";
  document.getElementById("userName").textContent = user.full_name;

  // Tabs
  const navLinks = document.querySelectorAll(".nav a");
  const tabs = document.querySelectorAll(".tab-content");
  const activeTab = localStorage.getItem("activeTab") || "dashboard";
  showTab(activeTab);

  navLinks.forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      localStorage.setItem("activeTab", link.dataset.tab);
      showTab(link.dataset.tab);
    });
  });

  // Session type switch
  const sessionType = document.getElementById("session-type");
  const classroomForm = document.getElementById("classroom-form");
  const clinicalForm = document.getElementById("clinical-form");

  sessionType.addEventListener("change", () => {
    classroomForm.style.display = sessionType.value === "classroom" ? "block" : "none";
    clinicalForm.style.display = sessionType.value === "clinical" ? "block" : "none";
  });

  // Load data
  if (user.role === "admin") {
    loadStudents();
    loadCourses();
    loadAttendance();
    loadExams();
    loadMessages();
    loadResources();
  } else {
    loadStudentAttendance(user.id);
    loadStudentMessages(user.id);
    loadStudentResources(user.id);
  }
});

// =========================
// Tab switch function
// =========================
function showTab(tabId) {
  document.querySelectorAll(".nav a").forEach(l => l.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  const link = document.querySelector(`.nav a[data-tab="${tabId}"]`);
  const tab = document.getElementById(tabId);
  if (link) link.classList.add("active");
  if (tab) tab.classList.add("active");
}

// =========================
// Logout
// =========================
async function logout() {
  await sb.auth.signOut();
  localStorage.removeItem("loggedInUser");
  window.location.href = "login.html";
}

// =========================
// Admin: Students
// =========================
async function loadStudents() {
  const { data, error } = await sb.from("profiles").select("*").eq("role", "student");
  const tbody = document.getElementById("students-table");
  tbody.innerHTML = "";
  data.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${s.id}</td><td>${s.full_name}</td><td>${s.email}</td><td>${s.approved}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById("add-student-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("student-name").value;
  const email = document.getElementById("student-email").value;
  const password = document.getElementById("student-password").value;

  // Create auth user
  const { data: authData, error: authError } = await sb.auth.admin.createUser({ email, password });
  if (authError) return alert(authError.message);

  await sb.from("profiles").insert([{ id: authData.user.id, full_name: name, email, role: "student", approved: true }]);
  loadStudents();
  e.target.reset();
});

// =========================
// Admin: Courses
// =========================
async function loadCourses() {
  const { data } = await sb.from("courses").select("*");
  const tbody = document.getElementById("courses-table");
  tbody.innerHTML = "";
  data.forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${c.name}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById("add-course-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("course-name").value;
  await sb.from("courses").insert([{ name }]);
  loadCourses();
  e.target.reset();
});

// =========================
// Admin: Attendance
// =========================
async function loadAttendance() {
  const { data } = await sb.from("attendance").select("*");
  const tbody = document.getElementById("attendance-table");
  tbody.innerHTML = "";
  data.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${a.student_id}</td><td>${a.session_type}</td><td>${a.course_or_rotation}</td><td>${a.location_or_time}</td><td>${a.date}</td>`;
    tbody.appendChild(tr);
  });
}

// Form submissions omitted here for brevity (they are similar to loadAttendance logic)
