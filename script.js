// ---------------- SUPABASE INIT ----------------
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const RESOURCES_BUCKET = 'resources';

// ---------------- HELPERS ----------------
function $(id){ return document.getElementById(id); }
function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function setActiveNav(el){ document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active')); if(el) el.classList.add('active'); }

// ---------------- SHOW SECTION ----------------
function showSection(id,el){
    document.querySelectorAll('.tab-content').forEach(s=>s.classList.remove('active'));
    const sec=$(id); if(sec) sec.classList.add('active');
    setActiveNav(el);
    switch(id){
        case'dashboard': if($('#dashboard')) loadDashboard(); break;
        case'users': if($('#users')) loadUsers(); break;
        case'students': if($('#students')) loadStudents(); break;
        case'courses': if($('#courses')) { loadCourses(); populateCourseSelects(); } break;
        case'attendance': if($('#attendance')) { loadAttendance(); populateStudentSelect(); populateCourseSelects(); setAttendanceLocationByIP(); } break;
        case'exams': if($('#exams')) { loadExams(); populateCourseSelects(); } break;
        case'messages': if($('#messages')) loadMessages(); break;
        case'resources': if($('#resources')) loadResources(); break;
        case'pending': if($('#pending')) loadPending(); break;
    }
}

// ---------------- AUTH CHECK ----------------
(async function checkAuth() {
    const { data: { user } } = await sb.auth.getUser();
    if(!user){ window.location.href = '/login.html'; }
    else if($('#sessionInfo')) $('sessionInfo').innerText = `Signed in as ${user.email}`;
})();

// ---------------- LOGOUT ----------------
async function logout() {
    const { error } = await sb.auth.signOut();
    if(error){ alert('Logout failed: '+error.message); return; }
    window.location.href = '/login.html';
}

// ---------------- SIDEBAR NAVIGATION ----------------
document.querySelectorAll('.nav a').forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        showSection(link.dataset.tab, link);
    });
});

// ---------------- DASHBOARD ----------------
async function loadDashboard(){
    if(!$('#dashboard')) return;
    const { data: users } = await sb.from('profiles').select('*');
    if(!users) return;
    const totalUsers = users.length;
    const totalAdmins = users.filter(u=>u.role==='admin').length;
    const totalStudents = users.filter(u=>u.role==='student').length;
    const totalPending = users.filter(u=>!u.approved).length;
    if($('#totalUsers')) $('totalUsers').innerText = totalUsers;
    if($('#totalAdmins')) $('totalAdmins').innerText = totalAdmins;
    if($('#totalStudents')) $('totalStudents').innerText = totalStudents;
    if($('#totalPending')) $('totalPending').innerText = totalPending;
}

// ---------------- USERS ----------------
async function loadUsers(){
    const table=$('usersTable'); if(!table) return;
    const {data:users} = await sb.from('profiles').select('*').order('created_at',{ascending:false});
    table.innerHTML='';
    users?.forEach(u=>{
        const tr=document.createElement('tr');
        tr.innerHTML = `<td>${escapeHtml(u.full_name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.phone)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td>${u.approved?'Yes':'No'}</td>
        <td class="flex">
          ${!u.approved?`<button class="btn btn-approve" onclick="approveUser('${u.id}')">Approve</button>`:''}
          <button class="btn btn-delete" onclick="deleteUser('${u.id}')">Delete</button>
        </td>`;
        table.appendChild(tr);
    });
}

async function approveUser(id){ await sb.from('profiles').update({approved:true}).eq('id',id); loadUsers(); loadDashboard(); }
async function deleteUser(id){ if(confirm('Delete this user?')){ await sb.from('profiles').delete().eq('id',id); loadUsers(); loadDashboard(); } }

if($('#addUserForm')) $('addUserForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const full_name=$('new_full_name').value,email=$('new_email').value,phone=$('new_phone').value,password=$('new_password').value,role=$('new_role').value;
    const {data,error}=await sb.auth.admin.createUser({email,password,phone,role,app_metadata:{role}});
    if(error){ alert(error.message); return; }
    await sb.from('profiles').insert([{id:data.user.id,full_name,email,phone,role,approved:true}]);
    $('addUserForm').reset(); loadUsers(); loadDashboard();
});

// ---------------- STUDENTS ----------------
async function loadStudents(){
    const table=$('studentsTable'); if(!table) return;
    const {data:students}=await sb.from('profiles').select('*').eq('role','student').order('created_at',{ascending:false});
    table.innerHTML='';
    students?.forEach(s=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${escapeHtml(s.full_name)}</td><td>${escapeHtml(s.email)}</td><td>${escapeHtml(s.phone)}</td>
        <td>${s.approved?'Active':'Pending'}</td>
        <td class="flex"><button class="btn btn-delete" onclick="deleteUser('${s.id}')">Delete</button></td>`;
        table.appendChild(tr);
    });
}

// ---------------- COURSES ----------------
async function loadCourses(){
    const table=$('coursesTable'); if(!table) return;
    const {data:courses}=await sb.from('courses').select('*').order('created_at',{ascending:false});
    table.innerHTML='';
    courses?.forEach(c=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${escapeHtml(c.course_name)}</td>
        <td class="flex"><button class="btn btn-edit" onclick="editCourse('${c.id}')">Edit</button>
        <button class="btn btn-delete" onclick="deleteCourse('${c.id}')">Delete</button></td>`;
        table.appendChild(tr);
    });
}

async function deleteCourse(id){ if(confirm('Delete course?')){ await sb.from('courses').delete().eq('id',id); loadCourses(); } }
if($('#addCourseForm')) $('addCourseForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const course_name=$('course_name').value,course_description=$('course_description').value;
    await sb.from('courses').insert([{course_name,description:course_description}]);
    $('addCourseForm').reset(); loadCourses(); populateCourseSelects();
});

async function populateCourseSelects(){
    const {data:courses}=await sb.from('courses').select('*').order('created_at',{ascending:true});
    const selects=['att_course_id','exam_course_id'];
    selects.forEach(id=>{
        const sel=$(id); if(!sel) return; sel.innerHTML='';
        courses?.forEach(c=>{ const opt=document.createElement('option'); opt.value=c.id; opt.innerText=c.course_name; sel.appendChild(opt); });
    });
}

// ---------------- ATTENDANCE ----------------
async function loadAttendance(){
    const table=$('attendanceTable'); if(!table) return;
    const {data:att}=await sb.from('attendance').select('*,profiles(full_name),courses(course_name)').order('created_at',{ascending:false});
    table.innerHTML='';
    att?.forEach(a=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${escapeHtml(a.profiles?.full_name)}</td><td>${escapeHtml(a.session_type)}</td><td>${escapeHtml(a.courses?.course_name)}</td>
        <td>${escapeHtml(a.location)} / ${escapeHtml(a.time)}</td><td>${escapeHtml(a.date)}</td>
        <td class="flex"><button class="btn btn-delete" onclick="deleteAttendance('${a.id}')">Delete</button></td>`;
        table.appendChild(tr);
    });
}

async function deleteAttendance(id){ if(confirm('Delete attendance?')){ await sb.from('attendance').delete().eq('id',id); loadAttendance(); } }
async function populateStudentSelect(){
    const sel=$('att_student_id'); if(!sel) return;
    const {data:students}=await sb.from('profiles').select('*').eq('role','student');
    sel.innerHTML='';
    students?.forEach(s=>{ const opt=document.createElement('option'); opt.value=s.id; opt.innerText=s.full_name; sel.appendChild(opt); });
}
if($('#addAttendanceForm')) $('addAttendanceForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const student_id=$('att_student_id').value,session_type=$('att_session_type').value,course_id=$('att_course_id').value,
          location=$('att_location').value,date=$('att_date').value,time=$('att_time').value;
    await sb.from('attendance').insert([{student_id,session_type,course_id,location,date,time}]);
    $('addAttendanceForm').reset(); loadAttendance();
});

// ---------- AUTO LOCATION BY IP ----------
async function setAttendanceLocationByIP(){
    const input = $('att_location'); if(!input) return;
    try{
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        input.value = `${data.city}, ${data.region}, ${data.country_name}`;
    } catch(err){
        console.warn('Could not fetch location:', err);
    }
}

// ---------------- EXAMS ----------------
async function loadExams(){
    const table=$('examsTable'); if(!table) return;
    const {data:exams}=await sb.from('exams').select('*,courses(course_name)').order('date',{ascending:true});
    table.innerHTML='';
    exams?.forEach(e=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${escapeHtml(e.courses?.course_name)}</td><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.date)}</td><td>${escapeHtml(e.status)}</td>
        <td class="flex"><button class="btn btn-delete" onclick="deleteExam('${e.id}')">Delete</button></td>`;
        table.appendChild(tr);
    });
}
async function deleteExam(id){ if(confirm('Delete exam?')){ await sb.from('exams').delete().eq('id',id); loadExams(); } }
if($('#addExamForm')) $('addExamForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const course_id=$('exam_course_id').value,title=$('exam_title').value,date=$('exam_date').value,status=$('exam_status').value;
    await sb.from('exams').insert([{course_id,title,date,status}]); $('addExamForm').reset(); loadExams();
});

// ---------------- MESSAGES ----------------
async function loadMessages(){
    const table=$('messagesTable'); if(!table) return;
    const {data:msgs}=await sb.from('messages').select('*,profiles_from:sender(*),profiles_to:recipient(*)').order('created_at',{ascending:false});
    table.innerHTML='';
    msgs?.forEach(m=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${escapeHtml(m.profiles_from?.full_name)}</td><td>${escapeHtml(m.profiles_to?.full_name)}</td>
        <td>${escapeHtml(m.message)}</td><td>${escapeHtml(m.created_at)}</td>`;
        table.appendChild(tr);
    });
}
if($('#sendMessageForm')) $('sendMessageForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const recipient_email=$('msg_recipient').value,message=$('msg_body').value;
    const {data:recipient}=await sb.from('profiles').select('*').eq('email',recipient_email).single();
    if(!recipient){ alert('Recipient not found'); return; }
    const {data:{user}} = await sb.auth.getUser();
    await sb.from('messages').insert([{sender:user.id,recipient:recipient.id,message}]);
    $('sendMessageForm').reset(); loadMessages();
});

// ---------------- RESOURCES ----------------
async function loadResources(){
    const table=$('resourcesTable'); if(!table) return;
    const {data:files,error}=await sb.storage.from(RESOURCES_BUCKET).list('',{limit:100,offset:0});
    table.innerHTML='';
    files?.forEach(f=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td><a href="${sb.storage.from(RESOURCES_BUCKET).getPublicUrl(f.name).data.publicUrl}" target="_blank">${escapeHtml(f.name)}</a></td>
        <td>${(f.size/1024).toFixed(1)} KB</td>
        <td class="flex"><button class="btn btn-delete" onclick="deleteResource('${f.name}')">Delete</button></td>`;
        table.appendChild(tr);
    });
}
if($('#uploadResourceBtn')) $('uploadResourceBtn').addEventListener('click', async ()=>{
    const file=$('resourceFile').files[0]; if(!file){ alert('Select a file'); return; }
    const title=$('resourceTitle').value||file.name;
    const {data,error}=await sb.storage.from(RESOURCES_BUCKET).upload(file.name,file,{upsert:true});
    if(error){ alert(error.message); return; }
    $('resourceFile').value=''; $('resourceTitle').value=''; loadResources();
});
async function deleteResource(name){ if(confirm('Delete resource?')){ await sb.storage.from(RESOURCES_BUCKET).remove([name]); loadResources(); } }

// ---------------- PENDING ----------------
async function loadPending(){
    const table=$('pendingTable'); if(!table) return;
    const {data:users}=await sb.from('profiles').select('*').eq('approved',false);
    table.innerHTML='';
    users?.forEach(u=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${escapeHtml(u.full_name)}</td><td>${escapeHtml(u.email)}</td>
        <td class="flex"><button class="btn btn-approve" onclick="approveUser('${u.id}')">Approve</button>
        <button class="btn btn-delete" onclick="deleteUser('${u.id}')">Delete</button></td>`;
        table.appendChild(tr);
    });
}

// ---------------- AUTO REFRESH ----------------
const AUTO_REFRESH_INTERVAL = 10000; // 10s
async function refreshAllData() {
    if ($('#dashboard')) loadDashboard();
    if ($('#users')) loadUsers();
    if ($('#students')) loadStudents();
    if ($('#courses')) loadCourses();
    if ($('#attendance')) loadAttendance();
    if ($('#exams')) loadExams();
    if ($('#messages')) loadMessages();
    if ($('#resources')) loadResources();
    if ($('#pending')) loadPending();
}
setInterval(refreshAllData, AUTO_REFRESH_INTERVAL);

// ---------------- INIT ----------------
(async function init(){
    if($('#dashboard')) loadDashboard();
    if($('#users')) loadUsers();
    if($('#students')) loadStudents();
    if($('#courses')) { loadCourses(); populateCourseSelects(); }
    if($('#attendance')) { loadAttendance(); populateStudentSelect(); populateCourseSelects(); setAttendanceLocationByIP(); }
    if($('#exams')) loadExams();
    if($('#messages')) loadMessages();
    if($('#resources')) loadResources();
    if($('#pending')) loadPending();
})();
