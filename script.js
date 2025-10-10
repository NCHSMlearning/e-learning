// !!! IMPORTANT: CHECK YOUR KEYS AND URL !!!
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const RESOURCES_BUCKET = 'resources';
const IP_API_URL = 'https://api.ipify.org?format=json';
const MAPBOX_ACCESS_TOKEN = 'pk.cbe61eae35ecbe1d1d682c347d81381c';
const DEVICE_ID_KEY = 'nchsm_device_id';
const SETTINGS_TABLE = 'settings';
const MESSAGE_KEY = 'student_welcome_message';

let currentUserProfile = {}; // should be set on login
let attendanceMap = null;

// Helper
function $(id) { return document.getElementById(id); }
function escapeHtml(text, isAttr) { 
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function setButtonLoading(button, loading, text) { 
    if (loading) { button.disabled = true; button.textContent = 'Please wait...'; } 
    else { button.disabled = false; button.textContent = text; }
}
async function getIPAddress() { 
    try { const res = await fetch(IP_API_URL); const data = await res.json(); return data.ip; } 
    catch { return 'N/A'; } 
}
function getDeviceId() { 
    let id = localStorage.getItem(DEVICE_ID_KEY); 
    if (!id) { id = 'dev_' + Date.now() + Math.floor(Math.random()*1000); localStorage.setItem(DEVICE_ID_KEY, id); } 
    return id; 
}

// --- NAVIGATION ---
function showTab(tabName){
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    $(tabName).classList.add('active');
    document.querySelectorAll('#mainNav a').forEach(a => a.classList.remove('active'));
    document.querySelector(`#mainNav a[data-tab="${tabName}"]`).classList.add('active');
}

// --- FETCH HELPER ---
async function fetchData(table, columns='*', filter={}, orderBy=null, ascending=true){
    let query = sb.from(table).select(columns);
    for(const key in filter) query = query.eq(key, filter[key]);
    if(orderBy) query = query.order(orderBy, { ascending });
    const { data, error } = await query;
    return { data, error };
}

// --- DASHBOARD CARDS ---
async function loadDashboardData(){
    const { data: users } = await fetchData('profiles');
    const { data: students } = await fetchData('profiles', '*', { role:'student', approved:true });
    const { data: checkins } = await fetchData('geo_attendance_logs', '*', {});

    $('totalUsers').textContent = users?.length || 0;
    $('totalStudents').textContent = students?.length || 0;
    $('todayCheckins').textContent = checkins?.filter(c => new Date(c.check_in_time).toDateString()===new Date().toDateString()).length || 0;

    const pending = await fetchData('profiles', '*', { approved:false });
    $('pendingApprovals').textContent = pending.data?.length || 0;
}

// --- USERS TAB ---
async function loadUsers(){
    const tbody = $('users-table');
    tbody.innerHTML = '<tr><td colspan="7">Loading users...</td></tr>';
    const { data: users, error } = await fetchData('profiles');
    if(error){ tbody.innerHTML = `<tr><td colspan="7">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML = '';
    users.forEach(u => {
        tbody.innerHTML += `<tr>
            <td>${u.id}</td>
            <td>${escapeHtml(u.full_name)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td>${u.role}</td>
            <td>${u.program || 'N/A'}</td>
            <td>${u.approved?'Active':'Pending'}</td>
            <td>${u.role==='student'?`<button class="btn btn-edit" onclick="openEditStudentModal('${u.id}', '${escapeHtml(u.full_name)}', '${u.program}', '${u.intake}', '${u.block}')">Edit</button>`:''}</td>
        </tr>`;
    });
}

// --- PENDING TAB ---
async function loadPendingUsers(){
    const tbody = $('pending-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading pending users...</td></tr>';
    const { data: pending, error } = await fetchData('profiles', '*', { approved:false });
    if(error){ tbody.innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML = '';
    pending.forEach(u=>{
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(u.full_name)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td>${u.role}</td>
            <td>${u.program||'N/A'}</td>
            <td>${new Date(u.created_at).toLocaleString()}</td>
            <td><button class="btn btn-approve" onclick="approveUser('${u.id}')">Approve</button></td>
        </tr>`;
    });
}

// --- APPROVE USER ---
async function approveUser(id){
    if(!confirm('Approve this user?')) return;
    const { error } = await sb.from('profiles').update({ approved:true }).eq('id', id);
    if(error) showFeedback(`Error: ${error.message}`,'error'); else showFeedback('User approved!'); 
    loadPendingUsers(); loadUsers(); loadDashboardData();
}

// --- ENROLL STUDENT ---
$('add-account-form')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const btn = e.submitter;
    const text = btn.textContent;
    setButtonLoading(btn,true,text);

    const full_name=$('account-name').value.trim();
    const email=$('account-email').value.trim();
    const password=$('account-password').value;
    const role=$('account-role').value;
    const phone=$('account-phone').value;
    const program=$('account-program').value;
    const intake=$('account-intake').value;
    const block=$('account-block').value;

    try{
        // 1. Auth signup
        const { error: signErr } = await sb.auth.signUp({ email, password });
        if(signErr) throw signErr;

        // 2. Insert profile
        const { error: profileErr } = await sb.from('profiles').insert([{
            full_name, email, role, phone, program, intake, block, approved:true
        }]);
        if(profileErr) throw profileErr;

        showFeedback('Account enrolled successfully!');
        e.target.reset();
        loadUsers();
    }catch(err){ showFeedback(`Error: ${err.message || err}`,'error'); }
    finally{ setButtonLoading(btn,false,text); }
});

// --- EDIT STUDENT MODAL ---
function openEditStudentModal(id, fullName, program, intake, block){
    $('edit_student_id').value=id;
    $('edit_student_name').value=fullName;
    $('edit_student_program').value=program||'';
    $('edit_student_intake').value=intake||'';
    $('edit_student_block').value=block||'';
    $('editStudentModal').style.display='flex';
}
$('edit-student-form')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const btn = e.submitter;
    const txt = btn.textContent;
    setButtonLoading(btn,true,txt);

    const id=$('edit_student_id').value;
    const program=$('edit_student_program').value;
    const intake=$('edit_student_intake').value;
    const block=$('edit_student_block').value;

    try{
        const { error } = await sb.from('profiles').update({ program,intake,block }).eq('id',id);
        if(error) throw error;
        showFeedback('Student updated successfully!');
        $('editStudentModal').style.display='none';
        loadUsers();
    }catch(err){ showFeedback(`Error: ${err.message||err}`,'error'); }
    finally{ setButtonLoading(btn,false,txt); }
});

// --- COURSES ---
async function loadCourses(){
    const tbody=$('courses-table'); tbody.innerHTML='<tr><td colspan="5">Loading...</td></tr>';
    const { data:courses, error }=await fetchData('courses');
    if(error){ tbody.innerHTML=`<tr><td colspan="5">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML='';
    courses.forEach(c=>{
        tbody.innerHTML+=`<tr>
            <td>${escapeHtml(c.course_name)}</td>
            <td>${escapeHtml(c.description||'')}</td>
            <td>${c.intake||'N/A'}</td>
            <td>${c.block||'N/A'}</td>
            <td>
                <button class="btn btn-edit" onclick="openEditCourseModal('${c.id}','${escapeHtml(c.course_name)}','${escapeHtml(c.description||'')}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteCourse('${c.id}')">Delete</button>
            </td>
        </tr>`;
    });
}
function openEditCourseModal(id,name,desc){
    $('edit_course_id').value=id;
    $('edit_course_name').value=name;
    $('edit_course_description').value=desc||'';
    $('courseEditModal').style.display='flex';
}
$('edit-course-form')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const btn=e.submitter; const txt=btn.textContent; setButtonLoading(btn,true,txt);
    const id=$('edit_course_id').value;
    const name=$('edit_course_name').value.trim();
    const desc=$('edit_course_description').value.trim();
    try{
        const { error }=await sb.from('courses').update({ course_name:name,description:desc }).eq('id',id);
        if(error) throw error;
        showFeedback('Course updated successfully!');
        $('courseEditModal').style.display='none';
        loadCourses();
    }catch(err){ showFeedback(`Error: ${err.message||err}`,'error'); }
    finally{ setButtonLoading(btn,false,txt); }
}

// --- ATTENDANCE ---
async function populateAttendanceSelects(){
    const { data: students }=await fetchData('profiles','id, full_name',{role:'student',approved:true});
    const sel=$('att_student_id');
    if(students){ sel.innerHTML='<option value="">-- Select Student --</option>'; students.forEach(s=>sel.innerHTML+=`<option value="${s.id}">${escapeHtml(s.full_name)}</option>`);}
}
async function loadAttendance(){
    const tbody=$('attendance-table'); tbody.innerHTML='<tr><td colspan="6">Loading...</td></tr>';
    const { data: records, error } = await fetchData('geo_attendance_logs','*, profile:student_id(full_name, program)');
    if(error){ tbody.innerHTML=`<tr><td colspan="6">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML='';
    records.forEach(r=>{
        const studentName=r.profile?.full_name||'N/A';
        const dateTime=new Date(r.check_in_time).toLocaleString();
        let locationText,mapButton='';
        if(r.latitude && r.longitude){ locationText=`Geo-Log: ${r.location_name||'Coordinates'}`; mapButton=`<button class="btn btn-map" onclick="showMap('${r.latitude}','${r.longitude}','${escapeHtml(r.location_name||'Location',true)}','${escapeHtml(studentName,true)}','${dateTime}')">View Map</button>`;}
        else locationText=`Manual: ${r.location_name||'N/A'}`;
        tbody.innerHTML+=`<tr>
            <td>${escapeHtml(studentName)}</td>
            <td>${escapeHtml(r.session_type||'N/A')}</td>
            <td>${locationText}</td>
            <td>${dateTime}</td>
            <td>${r.latitude?'Yes':'No'}</td>
            <td>${mapButton}<button class="btn btn-delete" onclick="deleteAttendanceRecord('${r.id}')">Delete</button></td>
        </tr>`;
    });
}
function filterAttendanceTable(){
    const filter=$('attendance-search').value.toUpperCase();
    $('attendance-table').querySelectorAll('tr').forEach(tr=>{
        const td=tr.getElementsByTagName('td')[0];
        tr.style.display=td?(td.textContent||td.innerText).toUpperCase().includes(filter)?'':'none':'';
    });
}
$('manual-attendance-form')?.addEventListener('submit', async e=>{
    e.preventDefault(); const btn=e.submitter; const txt=btn.textContent; setButtonLoading(btn,true,txt);
    const record={
        student_id:$('att_student_id').value,
        session_type:$('att_session_type').value,
        course_id:$('att_course_id').value||null,
        location_name:$('att_location').value.trim()||'Manual Entry',
        check_in_time:$('att_date').value+ 'T'+ ($('att_time').value || '00:00') + ':00.000Z',
        ip_address:await getIPAddress(),
        device_id:getDeviceId()
    };
    const { error } = await sb.from('geo_attendance_logs').insert([record]);
    if(error) showFeedback(`Error: ${error.message}`,'error'); else{ showFeedback('Marked successfully!','success'); e.target.reset(); loadAttendance(); loadDashboardData();}
    setButtonLoading(btn,false,txt);
});
async function deleteAttendanceRecord(id){ if(!confirm('Delete this record?')) return; const { error }=await sb.from('geo_attendance_logs').delete().eq('id',id); if(error) showFeedback(`Error: ${error.message}`,'error'); else{ showFeedback('Deleted!','success'); loadAttendance(); } }
function showMap(lat,lng,loc,student,dateTime){ 
    $('mapModal').style.display='flex';
    $('mapInfo').textContent=`${student} checked in at ${loc} on ${dateTime}`;
    if(attendanceMap) attendanceMap.remove();
    attendanceMap=L.map('attendanceMap').setView([lat,lng],15);
    L.tileLayer(`https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=${MAPBOX_ACCESS_TOKEN}`,{id:'mapbox/streets-v11',tileSize:512,zoomOffset:-1,accessToken:MAPBOX_ACCESS_TOKEN}).addTo(attendanceMap);
    L.marker([lat,lng]).addTo(attendanceMap).bindPopup(`${student} - ${loc}`).openPopup();
}

// --- MESSAGES ---
$('send-message-form')?.addEventListener('submit', async e=>{
    e.preventDefault(); const btn=e.submitter; const txt=btn.textContent; setButtonLoading(btn,true,txt);
    try{
        const { error }=await sb.from('messages').insert([{
            program:$('msg_program').value,
            body:$('msg_body').value,
            sent_at:new Date()
        }]);
        if(error) throw error; showFeedback('Message sent!','success'); $('send-message-form').reset(); loadMessages();
    }catch(err){ showFeedback(`Error: ${err.message||err}`,'error'); }
    finally{ setButtonLoading(btn,false,txt); }
});
async function loadMessages(){
    const tbody=$('messages-table'); tbody.innerHTML='<tr><td colspan="3">Loading...</td></tr>';
    const { data: msgs,error }=await fetchData('messages','*',null,'sent_at',false);
    if(error){ tbody.innerHTML=`<tr><td colspan="3">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML='';
    msgs.forEach(m=>tbody.innerHTML+=`<tr><td>${m.program}</td><td>${escapeHtml(m.body)}</td><td>${new Date(m.sent_at).toLocaleString()}</td></tr>`);
}

// --- RESOURCES ---
async function uploadResource(){
    const program=$('resource_program').value;
    const intake=$('resource_intake').value;
    const block=$('resource_block').value;
    const file=$('resourceFile').files[0]; const title=$('resourceTitle').value.trim();
    if(!file||!title){ showFeedback('Select file and title','error'); return; }
    try{
        const { data, error:uploadErr } = await sb.storage.from(RESOURCES_BUCKET).upload(Date.now()+'_'+file.name,file);
        if(uploadErr) throw uploadErr;
        const { error:dbErr }=await sb.from('resources').insert([{ program,intake,block,file_name:file.name,title,uploaded_by:currentUserProfile.full_name,uploaded_at:new Date() }]);
        if(dbErr) throw dbErr;
        showFeedback('Uploaded successfully!','success'); loadResources();
    }catch(err){ showFeedback(`Error: ${err.message||err}`,'error'); }
}
async function loadResources(){
    const tbody=$('resources-list'); tbody.innerHTML='<tr><td colspan="7">Loading...</td></tr>';
    const { data: resources,error }=await fetchData('resources','*',null,'uploaded_at',false);
    if(error){ tbody.innerHTML=`<tr><td colspan="7">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML='';
    resources.forEach(r=>tbody.innerHTML+=`<tr>
        <td>${r.program}</td><td>${escapeHtml(r.file_name)}</td><td>${r.intake}</td><td>${r.block}</td><td>${escapeHtml(r.uploaded_by)}</td><td>${new Date(r.uploaded_at).toLocaleString()}</td><td><button class="btn btn-delete" onclick="deleteResource('${r.id}')">Delete</button></td>
    </tr>`);
}
async function deleteResource(id){ if(!confirm('Delete this resource?')) return; const { error }=await sb.from('resources').delete().eq('id',id); if(error) showFeedback(`Error: ${error.message}`,'error'); else loadResources(); }

// --- WELCOME MESSAGE ---
$('edit-welcome-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=e.submitter; const txt=btn.textContent; setButtonLoading(btn,true,txt);
    try{
        const content=$('welcome-message-editor').value;
        const { error }=await sb.from('settings').upsert([{ key:MESSAGE_KEY,value:content }]);
        if(error) throw error;
        showFeedback('Welcome message saved!','success');
        loadWelcomeMessage();
    }catch(err){ showFeedback(`Error: ${err.message||err}`,'error'); }
    finally{ setButtonLoading(btn,false,txt); }
});
async function loadWelcomeMessage(){
    const { data,error }=await fetchData(SETTINGS_TABLE,'value',{ key:MESSAGE_KEY });
    $('student-welcome-message').innerHTML=data?.[0]?.value||'<p>No welcome message set</p>';
    $('live-preview').innerHTML=data?.[0]?.value||'<p>Loading live preview...</p>';
}

// --- FEEDBACK ---
function showFeedback(msg,type='success'){
    alert(msg);
}

// --- LOGOUT ---
function logout(){ sb.auth.signOut(); window.location.href='login.html'; }

// --- INIT ---
document.addEventListener('DOMContentLoaded',async()=>{
    loadDashboardData();
    loadUsers();
    loadPendingUsers();
    populateAttendanceSelects();
    loadAttendance();
    loadCourses();
    loadMessages();
    loadResources();
    loadWelcomeMessage();
});
