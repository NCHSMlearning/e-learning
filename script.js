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
const userNameEl = document.getElementById("userName");
if (userNameEl) {
  userNameEl.textContent = user.full_name;
}

  // Tab navigation
  const navLinks = document.querySelectorAll('.nav a');
  const lastTab = localStorage.getItem('activeTab') || 'dashboard';
  showTab(lastTab);

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      localStorage.setItem('activeTab', link.dataset.tab);
      showTab(link.dataset.tab);
    });
  });

  // Load initial data
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
});

// =========================
// 🔧 Tab Switching
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
// 🧑‍🎓 Admin: Students (with phone)
// =========================
async function loadStudents() {
  const { data, error } = await sb.from('profiles').select('*').eq('role', 'student');
  const tbody = document.getElementById('students-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.id}</td><td>${s.full_name}</td><td>${s.email || ''}</td><td>${s.phone || ''}</td><td>${s.approved}</td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('add-student-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const button = e.target.querySelector('button');
  button.textContent = 'Processing...';
  button.disabled = true;

  const name = document.getElementById('student-name').value.trim();
  const email = document.getElementById('student-email').value.trim().toLowerCase();
  const phone = document.getElementById('student-phone').value.trim();
  const password = document.getElementById('student-password').value;

  try {
    const { data: authData, error: authError } = await sb.auth.admin.createUser({ email, password });
    if (authError) throw new Error(authError.message);

    await sb.from('profiles').insert([{
      id: authData.user.id,
      full_name: name,
      email,
      phone,
      role: 'student',
      approved: true
    }]);

    showNotification(`Student ${name} added successfully.`);
    loadStudents();
    e.target.reset();
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    button.textContent = 'Add Student';
    button.disabled = false;
  }
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
  const button = e.target.querySelector('button');
  button.textContent = 'Processing...';
  button.disabled = true;
  const name = document.getElementById('course-name').value.trim();
  try {
    await sb.from('courses').insert([{ name }]);
    showNotification(`Course "${name}" added successfully.`);
    loadCourses();
    e.target.reset();
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    button.textContent = 'Add Course';
    button.disabled = false;
  }
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

// Classroom
document.getElementById('classroom-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const inputs = e.target.querySelectorAll('input');
  await sb.from('attendance').insert([{
    student_id: inputs[0].value,
    session_type: 'Classroom',
    course_or_rotation: inputs[1].value,
    location_or_time: inputs[2].value,
    date: inputs[3].value
  }]);
  loadAttendance();
  e.target.reset();
});

// Clinical
document.getElementById('clinical-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const inputs = e.target.querySelectorAll('input');
  await sb.from('attendance').insert([{
    student_id: inputs[0].value,
    session_type: 'Clinical',
    course_or_rotation: inputs[1].value,
    location_or_time: inputs[2].value,
    date: inputs[3].value
  }]);
  loadAttendance();
  e.target.reset();
});

// =========================
// 🧪 Admin: Exams/CATS
// =========================
async function loadExams() {
  const { data } = await sb.from('exams').select('*');
  const container = document.getElementById('exams-list');
  if (!container) return;
  container.innerHTML = '';
  data.forEach(e => {
    const div = document.createElement('div');
    div.textContent = `${e.name} - ${e.date}`;
    container.appendChild(div);
  });
}

document.getElementById('add-exam-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const button = e.target.querySelector('button');
  button.textContent = 'Processing...';
  button.disabled = true;
  const inputs = e.target.querySelectorAll('input');
  try {
    await sb.from('exams').insert([{ name: inputs[0].value, date: inputs[1].value }]);
    showNotification(`Exam "${inputs[0].value}" added.`);
    loadExams();
    e.target.reset();
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    button.textContent = 'Add Exam';
    button.disabled = false;
  }
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
  const button = e.target.querySelector('button');
  button.textContent = 'Sending...';
  button.disabled = true;

  const recipient = e.target.querySelector('input').value.trim();
  const content = e.target.querySelector('textarea').value.trim();
  try {
    await sb.from('messages').insert([{ recipient, content }]);
    showNotification('Message sent successfully.');
    loadMessages();
    e.target.reset();
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    button.textContent = 'Send Message';
    button.disabled = false;
  }
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
  const button = e.target.querySelector('button');
  button.textContent = 'Uploading...';
  button.disabled = true;

  const fileInput = e.target.querySelector('input');
  if (!fileInput.files.length) return;

  const file = fileInput.files[0];
  try {
    await sb.from('resources').insert([{ name: file.name }]);
    showNotification(`Resource "${file.name}" uploaded.`);
    loadResources();
    e.target.value = '';
  } catch (err) {
    showNotification(err.message, true);
  } finally {
    button.textContent = 'Upload Resource';
    button.disabled = false;
  }
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

// =========================
// 🔔 Notification Bar
// =========================
function showNotification(message, isError = false) {
  let notif = document.getElementById('notification');
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'notification';
    document.body.insertBefore(notif, document.body.firstChild);
  }
  notif.textContent = message;
  notif.style.display = 'block';
  notif.style.backgroundColor = isError ? '#fee2e2' : '#fef3c7';
  notif.style.color = isError ? '#b91c1c' : '#92400e';
  setTimeout(() => notif.style.display = 'none', 4000);
}
