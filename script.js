/***********************************
 * NCHSM Admin/Student Dashboard JS
 ***********************************/

// Supabase initialization
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Globals
let currentUserProfile = null;
let attendanceMap = null;
const RESOURCES_BUCKET = 'resources';
const DEVICE_ID_KEY = 'nchsm_device_id';
const MAPBOX_ACCESS_TOKEN = 'pk.cbe61eae35ecbe1d1d682c347d81381c';
const SETTINGS_TABLE = 'app_settings'; 
const MESSAGE_KEY = 'student_welcome';
const IP_API_URL = 'https://api.ipify.org?format=json';

// --- Utility ---
function $(id){ return document.getElementById(id); }
function escapeHtml(s,isAttr=false){ 
    let str = String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if(isAttr) str=str.replace(/'/g,'&#39;').replace(/"/g,'&quot;'); else str=str.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    return str;
}
function showFeedback(msg,type='success'){ alert((type==='success'?'✅ ':'❌ ')+msg); }
function setButtonLoading(button,isLoading,orig='Submit'){ button.disabled=isLoading; button.textContent=isLoading?'Processing...':orig; button.style.opacity=isLoading?0.7:1; }
function generateUUID(){ return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]>>c/4).toString(16)); }
function getDeviceId(){ let d=localStorage.getItem(DEVICE_ID_KEY); if(!d){ d=generateUUID(); localStorage.setItem(DEVICE_ID_KEY,d);} return d; }
async function getIPAddress(){ try{ const r=await fetch(IP_API_URL); const d=await r.json(); return d.ip; }catch(e){ console.error('IP error',e); return null; } }
async function reverseGeocode(lat,lng){ try{ const r=await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`); const d=await r.json(); return d.features?.[0]?.place_name || 'Unknown'; }catch(e){ console.error(e); return 'Geocoding error'; } }
function getGeoLocation(){ return new Promise((res,rej)=>{ if(!navigator.geolocation){ rej(new Error('Geolocation not supported')); return; } navigator.geolocation.getCurrentPosition(p=>res(p.coords),err=>rej(new Error(err.message)),{enableHighAccuracy:true,timeout:15000,maxAge:0});}); }
async function fetchData(table,select='*',filters={},order='created_at',asc=false){ let q=sb.from(table).select(select); for(let k in filters) if(filters[k]!==undefined) q=q.eq(k,filters[k]); q=q.order(order,{ascending:asc}); const {data,error}=await q; if(error){ console.error(`Error ${table}`,error); return {data:null,error};} return {data,error:null}; }
function populateSelect(sel,data,valueKey,textKey,def){ sel.innerHTML=`<option value="">-- ${def} --</option>`; data?.forEach(i=>{ sel.innerHTML+=`<option value="${i[valueKey]}">${escapeHtml(i[textKey]||i[valueKey])}</option>`; }); }

// --- Tabs ---
const navLinks=document.querySelectorAll('.nav a');
const tabs=document.querySelectorAll('.tab-content');
navLinks.forEach(link=>link.addEventListener('click',e=>{
    e.preventDefault();
    navLinks.forEach(l=>l.classList.remove('active'));
    link.classList.add('active');
    tabs.forEach(t=>t.classList.remove('active'));
    document.getElementById(link.dataset.tab).classList.add('active');
    loadSectionData(link.dataset.tab);
}));

async function loadSectionData(tabId){
    switch(tabId){
        case'dashboard': loadDashboardData(); loadStudentWelcomeMessage(); break;
        case'users': loadAllUsers(); break;
        case'pending': loadPendingApprovals(); break;
        case'enroll': loadStudents(); break;
        case'courses': loadCourses(); break;
        case'attendance': loadAttendance(); populateAttendanceSelects(); break;
        case'cats': loadExams(); populateAttendanceSelects(); break;
        case'messages': loadMessages(); break;
        case'resources': loadResources(); break;
        case'welcome-editor': loadWelcomeMessageForEdit(); break;
    }
}

// --- Init Session ---
async function initSession(){
    const {data:{user}}=await sb.auth.getUser();
    if(!user){ window.location.href="login.html"; return; }
    const { data: profile } = await sb.from('profiles').select('*').eq('id',user.id).single();
    if(profile){ currentUserProfile=profile; document.querySelector('header h1').textContent=`Welcome, ${profile.full_name||'User'}!`; }
    else { window.location.href="login.html"; return; }
    loadSectionData('dashboard');
    populateAttendanceSelects();
}

// --- Logout ---
async function logout(){ await sb.auth.signOut(); localStorage.removeItem("loggedInUser"); window.location.href="login.html"; }

// --- Dashboard ---
async function loadDashboardData(){
    const { count: allUsersCount } = await sb.from('profiles').select('id',{count:'exact'});
    $('totalUsers').textContent = allUsersCount||0;
    const { count: pendingCount } = await sb.from('profiles').select('id',{count:'exact'}).eq('approved',false);
    $('pendingApprovals').textContent = pendingCount||0;
    const { count: studentsCount } = await sb.from('profiles').select('id',{count:'exact'}).eq('role','student');
    $('totalStudents').textContent=studentsCount||0;
    const today=new Date().toISOString().slice(0,10);
    const { data: checkinData } = await sb.from('geo_attendance_logs').select('id').gte('check_in_time',today);
    $('todayCheckins').textContent=checkinData?.length||0;
}

// --- Users/Students/Pending ---
async function loadAllUsers(){
    const tbody=$('users-table'); tbody.innerHTML='<tr><td colspan="7">Loading all users...</td></tr>';
    const { data: users,error }=await fetchData('profiles','*',{},{},true);
    if(error){ tbody.innerHTML=`<tr><td colspan="7">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML='';
    users.forEach(u=>{
        const roleOptions=['student','admin','superadmin'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${r}</option>`).join('');
        tbody.innerHTML+=`<tr>
            <td>${escapeHtml(u.id.substring(0,8))}...</td>
            <td>${escapeHtml(u.full_name)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td><select onchange="updateUserRole('${u.id}',this.value)" ${u.role==='superadmin'?'disabled':''}>${roleOptions}</select></td>
            <td>${escapeHtml(u.program_type||'N/A')}</td>
            <td>${u.approved?'Approved':'Pending'}</td>
            <td>${!u.approved?`<button onclick="approveUser('${u.id}')">Approve</button>`:''}<button onclick="deleteProfile('${u.id}')">Delete</button></td>
        </tr>`;
    });
}
async function loadPendingApprovals(){
    const tbody=$('pending-table'); tbody.innerHTML='<tr><td colspan="6">Loading...</td></tr>';
    const { data: pending,error }=await fetchData('profiles','*',{approved:false},{},true);
    if(error){ tbody.innerHTML=`<tr><td colspan="6">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML='';
    if(pending.length===0){ tbody.innerHTML='<tr><td colspan="6">No pending approvals</td></tr>'; return; }
    pending.forEach(p=>{
        const regDate=new Date(p.created_at).toLocaleDateString();
        tbody.innerHTML+=`<tr>
            <td>${escapeHtml(p.full_name)}</td>
            <td>${escapeHtml(p.email)}</td>
            <td>${escapeHtml(p.role)}</td>
            <td>${escapeHtml(p.program_type||'N/A')}</td>
            <td>${regDate}</td>
            <td><button onclick="approveUser('${p.id}')">Approve</button><button onclick="deleteProfile('${p.id}')">Reject</button></td>
        </tr>`;
    });
}
async function loadStudents(){
    const tbody=$('students-table'); tbody.innerHTML='<tr><td colspan="7">Loading students...</td></tr>';
    const { data: students,error }=await fetchData('profiles','*',{role:'student'},{},true);
    if(error){ tbody.innerHTML=`<tr><td colspan="7">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML='';
    students.forEach(s=>{
        tbody.innerHTML+=`<tr>
            <td>${escapeHtml(s.id.substring(0,8))}...</td>
            <td>${escapeHtml(s.full_name)}</td>
            <td>${escapeHtml(s.email)}</td>
            <td>${escapeHtml(s.program_type||'N/A')}</td>
            <td>${escapeHtml(s.phone)}</td>
            <td>${s.approved?'Approved':'Pending'}</td>
            <td><button onclick="deleteProfile('${s.id}')">Delete</button></td>
        </tr>`;
    });
}

// --- Approve/Role/Delete ---
async function approveUser(id){ if(!confirm('Approve user?')) return; const {error}=await sb.from('profiles').update({approved:true}).eq('id',id); if(error) showFeedback(error.message,'error'); else { showFeedback('Approved'); loadPendingApprovals(); loadAllUsers(); loadDashboardData(); } }
async function updateUserRole(id,role){ if(!confirm(`Change role to ${role}?`)) return; const {error}=await sb.from('profiles').update({role}).eq('id',id); if(error) showFeedback(error.message,'error'); else showFeedback('Role updated'); loadAllUsers(); }
async function deleteProfile(id){ if(!confirm('Delete profile?')) return; const {error}=await sb.from('profiles').delete().eq('id',id); if(error) showFeedback(error.message,'error'); else { showFeedback('Deleted'); loadAllUsers(); loadPendingApprovals(); loadStudents(); loadDashboardData(); } }

// --- Attendance ---
async function populateAttendanceSelects(){ const { data: students }=await fetchData('profiles','id,full_name',{role:'student',approved:true},'full_name',true); populateSelect($('att_student_id'),students,'id','full_name','Select Student'); }
async function loadAttendance(){
    const tbody=$('attendance-table'); tbody.innerHTML='<tr><td colspan="6">Loading...</td></tr>';
    const { data: recs,error }=await fetchData('geo_attendance_logs','*, profile:student_id(full_name,program_type)',{},'check_in_time',false);
    if(error){ tbody.innerHTML=`<tr><td colspan="6">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML='';
    recs.forEach(r=>{
        const studentName=r.profile?.full_name||'N/A';
        const dt=new Date(r.check_in_time).toLocaleString();
        let locText,mapBtn='';
        if(r.latitude&&r.longitude){ locText=`Geo-Log: ${r.location_name||'Coords'}`; mapBtn=`<button onclick="showMap('${r.latitude}','${r.longitude}','${escapeHtml(r.location_name||'Check-in',true)}','${escapeHtml(studentName,true)}','${dt}')">View Map</button>`; }
        else locText=`Manual: ${r.location_name||'N/A'}`;
        tbody.innerHTML+=`<tr>
            <td>${escapeHtml(studentName)}</td>
            <td>${escapeHtml(r.session_type||'N/A')}</td>
            <td>${locText}</td>
            <td>${dt}</td>
            <td>${r.latitude?'Yes':'No'}</td>
            <td>${mapBtn}<button onclick="deleteAttendanceRecord('${r.id}')">Delete</button></td>
        </tr>`;
    });
}
async function markMyAttendance(){
    const btn=document.querySelector('.btn-attendance'); setButtonLoading(btn,true,'Getting Location...');
    try{
        const coords=await getGeoLocation();
        const locName=await reverseGeocode(coords.latitude,coords.longitude);
        const record={
            student_id: currentUserProfile.id,
            session_type:'office',
            location_name:locName,
            latitude:coords.latitude,
            longitude:coords.longitude,
            check_in_time:new Date().toISOString(),
            ip_address:await getIPAddress(),
            device_id:getDeviceId()
        };
        const {error}=await sb.from('geo_attendance_logs').insert([record]);
        if(error) showFeedback(error.message,'error'); else { showFeedback('Logged at '+locName); loadAttendance(); loadDashboardData(); }
    }catch(e){ showFeedback(e.message,'error'); }
    setButtonLoading(btn,false,'Mark Attendance');
}
async function deleteAttendanceRecord(id){ if(!confirm('Delete record?')) return; const {error}=await sb.from('geo_attendance_logs').delete().eq('id',id); if(error) showFeedback(error.message,'error'); else { showFeedback('Deleted'); loadAttendance(); loadDashboardData(); } }
function showMap(lat,lng,locName,studentName,checkTime){
    const modal=document.createElement('div'); modal.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;z-index:9999;';
    modal.innerHTML=`<div style="background:white;width:80%;height:80%;position:relative;padding:0.5rem;">
        <h3>${studentName} @ ${checkTime}</h3><p>${locName}</p><div id="attendance-map" style="width:100%;height:90%;"></div>
        <button onclick="document.body.removeChild(this.parentNode.parentNode)">Close</button>
    </div>`; document.body.appendChild(modal);
    setTimeout(()=>{
        attendanceMap=L.map('attendance-map').setView([lat,lng],16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(attendanceMap);
        L.marker([lat,lng]).addTo(attendanceMap).bindPopup(`${studentName}<br>${locName}`).openPopup();
    },300);
}

// --- Exams/CATS ---
async function loadExams(){
    const tbody=$('cats-table'); tbody.innerHTML='<tr><td colspan="6">Loading exams/CATs...</td></tr>';
    const { data: exams,error }=await fetchData('exams','*, course(course_name,program_type)','', 'exam_date', false);
    if(error){ tbody.innerHTML=`<tr><td colspan="6">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML='';
    exams.forEach(e=>{ const dt=new Date(e.exam_date).toLocaleDateString(); tbody.innerHTML+=`<tr>
        <td>${escapeHtml(e.course?.course_name||'N/A')}</td>
        <td>${escapeHtml(e.exam_type||'N/A')}</td>
        <td>${escapeHtml(e.program_type||'N/A')}</td>
        <td>${dt}</td>
        <td>${escapeHtml(e.max_marks||'N/A')}</td>
        <td><button onclick="deleteExam('${e.id}')">Delete</button></td>
    </tr>`; });
}
async function deleteExam(id){ if(!confirm('Delete exam?')) return; const {error}=await sb.from('exams').delete().eq('id',id); if(error) showFeedback(error.message,'error'); else { showFeedback('Deleted'); loadExams(); } }

// --- Messages ---
async function loadMessages(){ const tbody=$('messages-table'); tbody.innerHTML='<tr><td colspan="5">Loading messages...</td></tr>';
    const { data: msgs,error }=await fetchData('messages','*, sender:sender_id(full_name)','', 'created_at', false);
    if(error){ tbody.innerHTML=`<tr><td colspan="5">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML=''; msgs.forEach(m=>{ tbody.innerHTML+=`<tr>
        <td>${escapeHtml(m.sender?.full_name||'System')}</td>
        <td>${escapeHtml(m.title||'')}</td>
        <td>${escapeHtml(m.content||'')}</td>
        <td>${new Date(m.created_at).toLocaleString()}</td>
        <td><button onclick="deleteMessage('${m.id}')">Delete</button></td>
    </tr>`; });
}
async function deleteMessage(id){ if(!confirm('Delete message?')) return; const {error}=await sb.from('messages').delete().eq('id',id); if(error) showFeedback(error.message,'error'); else { showFeedback('Deleted'); loadMessages(); } }

// --- Resources ---
async function loadResources(){ const tbody=$('resources-table'); tbody.innerHTML='<tr><td colspan="5">Loading resources...</td></tr>';
    const { data: files,error }=await fetchData('resources','*, uploader:uploaded_by(full_name)','', 'created_at', false);
    if(error){ tbody.innerHTML=`<tr><td colspan="5">Error: ${error.message}</td></tr>`; return; }
    tbody.innerHTML=''; files.forEach(f=>{ tbody.innerHTML+=`<tr>
        <td>${escapeHtml(f.file_name||'N/A')}</td>
        <td>${escapeHtml(f.course_name||'N/A')}</td>
        <td>${escapeHtml(f.uploader?.full_name||'System')}</td>
        <td>${new Date(f.created_at).toLocaleString()}</td>
        <td><button onclick="deleteResource('${f.id}')">Delete</button></td>
    </tr>`; });
}
async function deleteResource(id){ if(!confirm('Delete resource?')) return; const {error}=await sb.from('resources').delete().eq('id',id); if(error) showFeedback(error.message,'error'); else { showFeedback('Deleted'); loadResources(); } }

// --- Welcome Message Editor ---
async function loadStudentWelcomeMessage(){ const { data }=await sb.from(SETTINGS_TABLE).select('value').eq('key',MESSAGE_KEY).single(); if(data) $('studentWelcome').textContent=data.value||'Welcome!'; }
async function loadWelcomeMessageForEdit(){ const { data }=await sb.from(SETTINGS_TABLE).select('value').eq('key',MESSAGE_KEY).single(); $('welcomeMessageEditor').value=data?.value||'Welcome!'; }
async function saveWelcomeMessage(){ const msg=$('welcomeMessageEditor').value; const {error}=await sb.from(SETTINGS_TABLE).upsert({key:MESSAGE_KEY,value:msg}); if(error) showFeedback(error.message,'error'); else showFeedback('Welcome message saved'); loadStudentWelcomeMessage(); }

// --- Init ---
document.addEventListener('DOMContentLoaded',()=>{ initSession(); });
