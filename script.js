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
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // Show user name
  const nameEl = document.getElementById("userName");
  if (nameEl) nameEl.textContent = user.full_name;

  // =========================
  // 🔧 Tabs
  // =========================
  const navLinks = document.querySelectorAll('.nav a');
  const tabs = document.querySelectorAll('.tab-content');
  const lastTab = localStorage.getItem('activeTab') || 'dashboard';
  showTab(lastTab);

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const tabId = link.dataset.tab;
      localStorage.setItem('activeTab', tabId);
      showTab(tabId);
    });
  });

  // Load data based on role
  if (user.role === 'admin') {
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

  // Attendance session type toggle (admin)
  const sessionSelect = document.getElementById('session-type');
  if (sessionSelect) {
    sessionSelect.addEventListener('change', e => {
      const type = e.target.value;
      document.getElementById('classroom-form').style.display = type === 'classroom' ? 'block' : 'none';
      document.getElementById('clinical-form').style.display = type === 'clinical' ? 'block' : 'none';
    });
  }
});

// =========================
// 🔧 Utility: Tab Switching
// =========================
function showTab(tabId) {
  const navLinks = document.querySelectorAll('.nav a');
  const tabs = document.querySelectorAll('.tab-content');
  navLinks.forEach(l => l.classList.remove('active'));
  tabs.forEach(t => t.classList.remove('active'));
  const link = document.querySelector(`.nav a[data-tab="${tabId}"]`);
  if (link) link.classList.add('active');
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.add('active');
}

// =========================
// 🚪 Logout
// =========================
async function logout() {
  await sb.auth.signOut();
  localStorage.removeItem("loggedInUser");
  window.location.href = "login.html";
}

// =========================
// 🔔 Notifications
// =========================
function notify(message, type = 'info') {
  const notif = document.getElementById('notification');
  if (!notif) return;
  notif.textContent = message;
  notif.style.display = 'block';
  notif.style.backgroundColor = type === 'error' ? '#FEE2E2' : '#FEF3C7';
  notif.style.color = type === 'error' ? '#B91C1C' : '#92400E';
  setTimeout(() => { notif.style.display = 'none'; }, 4000);
}

// =========================
// 🧑‍🎓 Admin: Students
// =========================
async function loadStudents() {
  const { data, error } = await sb.from('profiles').select('*').eq('role', 'student');
  const tbody = document.getElementById('students-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.id}</td><td>${s.full_name}</td><td>${s.email}</td><td>${s.approved}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('add-student-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.textContent = 'Processing...';
  const name = document.getElementById('student-name').value;
  const email = document.getElementById('student-email').value;
  const password = document.getElementById('student-password').value;

  const { data: authData, error: authError } = await sb.auth.admin.createUser({ email, password });
  if (authError) {
    notify(authError.message, 'error');
    btn.textContent = 'Add Student';
    return;
  }

  await sb.from('profiles').insert([{ id: authData.user.id, full_name: name, email, role: 'student', approved: true }]);
  loadStudents();
  notify('Student added successfully!');
  e.target.reset();
  btn.textContent = 'Add Student';
});

// =========================
// 🏫 Admin: Courses
// =========================
async function loadCourses() {
  const { data } = await sb.from('courses').select('*');
  const tbody = document.getElementById('courses-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.name}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('add-course-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.textContent = 'Processing...';
  const name = document.getElementById('course-name').value;
  await sb.from('courses').insert([{ name }]);
  loadCourses();
  notify('Course added successfully!');
  e.target.reset();
  btn.textContent = 'Add Course';
});

// =========================
// 📝 Admin: Attendance
// =========================
async function loadAttendance() {
  const { data } = await sb.from('attendance').select('*');
  const tbody = document.getElementById('attendance-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${a.student_id}</td><td>${a.session_type}</td><td>${a.course_or_rotation}</td><td>${a.location_or_time}</td><td>${a.date}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('classroom-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.textContent = 'Processing...';
  const inputs = e.target.querySelectorAll('input');
  await sb.from('attendance').insert([{
    student_id: inputs[0].value,
    session_type: 'Classroom',
    course_or_rotation: inputs[1].value,
    location_or_time: inputs[2].value,
    date: inputs[3].value
  }]);
  loadAttendance();
  notify('Classroom attendance added!');
  e.target.reset();
  btn.textContent = 'Add Classroom Attendance';
});

document.getElementById('clinical-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.textContent = 'Processing...';
  const inputs = e.target.querySelectorAll('input');
  await sb.from('attendance').insert([{
    student_id: inputs[0].value,
    session_type: 'Clinical',
    course_or_rotation: inputs[1].value,
    location_or_time: inputs[2].value,
    date: inputs[3].value
  }]);
  loadAttendance();
  notify('Clinical attendance added!');
  e.target.reset();
  btn.textContent = 'Add Clinical Attendance';
});

// =========================
// ✉️ Admin: Messages
// =========================
async function loadMessages() {
  const { data } = await sb.from('messages').select('*');
  const container = document.getElementById('messages-list');
  if (!container) return;
  container.innerHTML = '';
  data.forEach(m => {
    const div = document.createElement('div');
    div.innerHTML = `<strong>To:</strong> ${m.recipient}<br>${m.content}<hr>`;
    container.appendChild(div);
  });
}

document.getElementById('send-message-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.textContent = 'Processing...';
  const recipient = e.target.querySelector('input').value;
  const content = e.target.querySelector('textarea').value;
  await sb.from('messages').insert([{ recipient, content }]);
  loadMessages();
  notify('Message sent!');
  e.target.reset();
  btn.textContent = 'Send Message';
});

// =========================
// 📁 Admin: Resources
// =========================
async function loadResources() {
  const { data } = await sb.from('resources').select('*');
  const container = document.getElementById('resources-list');
  if (!container) return;
  container.innerHTML = '';
  data.forEach(r => {
    const div = document.createElement('div');
    div.textContent = r.name;
    container.appendChild(div);
  });
}

document.getElementById('upload-resource-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.textContent = 'Processing...';
  const fileInput = e.target.querySelector('input');
  if (!fileInput.files.length) return;
  const file = fileInput.files[0];
  await sb.from('resources').insert([{ name: file.name }]);
  loadResources();
  notify('Resource uploaded!');
  e.target.value = '';
  btn.textContent = 'Upload Resource';
});

// =========================
// 🔹 Student-Specific Data
// =========================
async function loadStudentAttendance(studentId) {
  const { data } = await sb.from('attendance').select('*').eq('student_id', studentId);
  const tbody = document.getElementById('attendance-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${a.session_type}</td><td>${a.course_or_rotation}</td><td>${a.location_or_time}</td><td>${a.date}</td>`;
    tbody.appendChild(tr);
  });
}

async function loadStudentMessages(studentId) {
  const { data } = await sb.from('messages').select('*').or(`recipient.eq.${studentId},recipient.eq.all`);
  const container = document.getElementById('messages-list');
  if (!container) return;
  container.innerHTML = '';
  data.forEach(m => {
    const div = document.createElement('div');
    div.innerHTML = `<strong>From Admin:</strong><br>${m.content}<hr>`;
    container.appendChild(div);
  });
}

async function loadStudentResources(studentId) {
  const { data } = await sb.from('resources').select('*');
  const container = document.getElementById('resources-list');
  if (!container) return;
  container.innerHTML = '';
  data.forEach(r => {
    const div = document.createElement('div');
    div.textContent = r.name;
    container.appendChild(div);
  });
}
