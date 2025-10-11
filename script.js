/**********************************************************************************
 * Final Integrated JavaScript File (script.js)
 * SUPERADMIN DASHBOARD - COURSE, USER, ATTENDANCE & FULL FILTERING MANAGEMENT
 * (Includes fixes for dynamic Program/Intake/Block/Course filtering across all tabs)
 **********************************************************************************/

// !!! IMPORTANT: CHECK YOUR KEYS AND URL !!!
// REPLACE with your actual Supabase URL and ANON_KEY
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const RESOURCES_BUCKET = 'resources';
const IP_API_URL = 'https://api.ipify.org?format=json';
const DEVICE_ID_KEY = 'nchsm_device_id';
const SETTINGS_TABLE = 'app_settings'; 
const MESSAGE_KEY = 'student_welcome'; 

// Global Variables
let currentUserProfile = null;
let attendanceMap = null; // Used for Leaflet instance

/*******************************************************
 * 1. CORE UTILITY FUNCTIONS
 *******************************************************/
function $(id){ return document.getElementById(id); }

function escapeHtml(s, isAttribute = false){ 
    let str = String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if (isAttribute) {
        str = str.replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    } else {
        str = str.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    return str;
}

/**
 * @param {string} message 
 * @param {'success'|'error'} type 
 */
function showFeedback(message, type = 'success') {
    const prefix = type === 'success' ? '✅ Success: ' : '❌ Error: ';
    alert(prefix + message);
}

/**
 * @param {HTMLButtonElement} button 
 * @param {boolean} isLoading 
 * @param {string} originalText 
 */
function setButtonLoading(button, isLoading, originalText = 'Submit') {
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? 'Processing...' : originalText;
    button.style.opacity = isLoading ? 0.7 : 1;
}

/**
 * Generic data fetching utility using Supabase
 */
async function fetchData(tableName, selectQuery = '*', filters = {}, order = 'created_at', ascending = false) {
    let query = sb.from(tableName).select(selectQuery);

    for (const key in filters) {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
            query = query.eq(key, filters[key]);
        }
    }
    
    query = query.order(order, { ascending });

    const { data, error } = await query;
    if (error) {
        console.error(`Error loading ${tableName}:`, error);
        return { data: null, error };
    }
    return { data, error: null };
}

/**
 * Utility to populate select/dropdown elements
 */
function populateSelect(selectElement, data, valueKey, textKey, defaultText) {
    selectElement.innerHTML = `<option value="">-- ${defaultText} --</option>`;
    data?.forEach(item => {
        const text = item[textKey] || item[valueKey];
        selectElement.innerHTML += `<option value="${item[valueKey]}">${escapeHtml(text)}</option>`;
    });
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getDeviceId() {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = generateUUID();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
}

async function getIPAddress() {
    try {
        const response = await fetch(IP_API_URL);
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('IP fetch failed:', error);
        return null;
    }
}

// Tab switching logic
const navLinks = document.querySelectorAll('.nav a');
const tabs = document.querySelectorAll('.tab-content');
navLinks.forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        tabs.forEach(tab => tab.classList.remove('active'));
        
        const tabId = link.dataset.tab;
        const targetTab = document.getElementById(tabId);
        if (targetTab) targetTab.classList.add('active');
        
        loadSectionData(tabId);
    });
});

async function loadSectionData(tabId) {
    // Hide all modals when switching tabs
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    
    switch(tabId) {
        case 'dashboard': 
            loadDashboardData(); 
            break;
        case 'users': loadAllUsers(); break;
        case 'pending': loadPendingApprovals(); break;
        case 'enroll': loadStudents(); break; 
        case 'courses': loadCourses(); break;
        case 'sessions': loadScheduledSessions(); populateSessionCourseSelects(); break;
        case 'attendance': loadAttendance(); populateAttendanceSelects(); break;
        case 'cats': loadExams(); populateExamCourseSelects(); break;
        case 'messages': loadMessages(); break;
        case 'calendar': renderFullCalendar(); break;
        case 'resources': loadResources(); break;
        case 'welcome-editor': loadWelcomeMessageForEdit(); break; 
        case 'backup': loadBackupHistory(); break;
    }
}

// --- Session / Init ---
async function initSession() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (profile) {
        currentUserProfile = profile;
        if (currentUserProfile.role !== 'superadmin') {
            window.location.href = "admin.html"; 
            return;
        }
        document.querySelector('header h1').textContent = `Welcome, ${profile.full_name || 'Super Admin'}!`;
    } else {
        window.location.href = "login.html";
        return;
    }
    
    loadSectionData('dashboard');
    
    // Setup Event Listeners
    
    // ATTENDANCE TAB
    $('att_session_type')?.addEventListener('change', toggleAttendanceFields);
    toggleAttendanceFields(); 
    $('manual-attendance-form')?.addEventListener('submit', handleManualAttendance);
    $('attendance-search')?.addEventListener('keyup', () => filterTable('attendance-search', 'attendance-table', [0, 1, 2]));
    
    // ENROLLMENT/USER TAB
    $('add-account-form')?.addEventListener('submit', handleAddAccount);
    $('account-program')?.addEventListener('change', () => updateBlockTermOptions('account-program', 'account-block-term')); 
    $('account-intake')?.addEventListener('change', () => updateBlockTermOptions('account-program', 'account-block-term'));
    $('user-search')?.addEventListener('keyup', () => filterTable('user-search', 'users-table', [1, 2, 4]));
    
    // COURSES TAB
    $('add-course-form')?.addEventListener('submit', handleAddCourse);
    $('course-search')?.addEventListener('keyup', () => filterTable('course-search', 'courses-table', [0, 1, 3]));
    $('course-program')?.addEventListener('change', () => { updateBlockTermOptions('course-program', 'course-block'); });
    $('course-intake')?.addEventListener('change', () => { updateBlockTermOptions('course-program', 'course-block'); });
    
    // SESSIONS TAB
    $('add-session-form')?.addEventListener('submit', handleAddSession);
    // Program changes MUST update courses AND blocks
    $('session_program')?.addEventListener('change', () => { 
        updateBlockTermOptions('session_program', 'session_block_term'); 
        populateSessionCourseSelects(); 
    });
    // Intake only needs to update blocks
    $('session_intake')?.addEventListener('change', () => updateBlockTermOptions('session_program', 'session_block_term')); 
    $('clinical_program')?.addEventListener('change', () => { updateBlockTermOptions('clinical_program', 'clinical_block_term'); }); 
    $('clinical_intake')?.addEventListener('change', () => updateBlockTermOptions('clinical_program', 'clinical_block_term')); 

    // CATS/EXAMS TAB
    $('add-exam-form')?.addEventListener('submit', handleAddExam);
    // Program changes MUST update courses AND blocks
    $('exam_program')?.addEventListener('change', () => { 
        filterCoursesByProgram(); // This handles populating exam_course_id
        updateBlockTermOptions('exam_program', 'exam_block_term'); 
    });
    // Intake only needs to update blocks
    $('exam_intake')?.addEventListener('change', () => updateBlockTermOptions('exam_program', 'exam_block_term')); 
    
    // MESSAGE/WELCOME EDITOR TAB
    $('send-message-form')?.addEventListener('submit', handleSendMessage);
    $('edit-welcome-form')?.addEventListener('submit', handleSaveWelcomeMessage); 
    
    // RESOURCES TAB
    $('resource_program')?.addEventListener('change', () => { updateBlockTermOptions('resource_program', 'resource_block'); });
    $('resource_intake')?.addEventListener('change', () => { updateBlockTermOptions('resource_program', 'resource_block'); });

    // MODAL/EDIT LISTENERS
    $('edit-user-form')?.addEventListener('submit', handleEditUser);
    document.querySelector('#userEditModal .close')?.addEventListener('click', () => { $('userEditModal').style.display = 'none'; });
    document.querySelector('#mapModal .close')?.addEventListener('click', () => { $('mapModal').style.display = 'none'; });
    $('edit-course-form')?.addEventListener('submit', handleEditCourse);
    $('edit_course_program')?.addEventListener('change', () => { updateBlockTermOptions('edit_course_program', 'edit_course_block'); });
    $('edit_course_intake')?.addEventListener('change', () => { updateBlockTermOptions('edit_course_program', 'edit_course_block'); });
    document.querySelector('#courseEditModal .close')?.addEventListener('click', () => { $('courseEditModal').style.display = 'none'; });
}

// Logout
async function logout() {
    await sb.auth.signOut();
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
}

/*******************************************************
 * 2. TABLE FILTERING & EXPORT FUNCTIONS
 *******************************************************/

/**
 * Generic function to filter table rows based on text input and specific columns.
 */
function filterTable(inputId, tableId, columnsToSearch = [0]) {
    const filter = $(inputId)?.value.toUpperCase() || '';
    const tbody = $(tableId);
    if (!tbody) return;

    const trs = tbody.getElementsByTagName('tr');

    for (let i = 0; i < trs.length; i++) {
        let rowMatches = false;

        // Skip rows that span the entire table (e.g., "Loading..." or "No data")
        if (trs[i].getElementsByTagName('td').length <= 1) {
             trs[i].style.display = "";
             continue;
        }

        // Check each specified column for a match
        for (const colIndex of columnsToSearch) {
            const td = trs[i].getElementsByTagName('td')[colIndex];
            if (td) {
                const txtValue = td.textContent || td.innerText;
                if (txtValue.toUpperCase().indexOf(filter) > -1) {
                    rowMatches = true;
                    break; // Found a match, stop checking columns
                }
            }
        }

        trs[i].style.display = rowMatches ? "" : "none";
    }
}

/**
 * Core CSV Export Function - Referenced by ALL Export buttons in HTML
 */
function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) { console.error("Export Error: Table not found with ID:", tableId); return; }

    const rows = table.querySelectorAll('tr');
    let csv = [];

    // 1. Extract Header Row (from <thead>)
    const thead = table.closest('table').querySelector('thead');
    if (thead) {
        const headerRow = thead.querySelector('tr');
        if (headerRow) {
            const headerCols = headerRow.querySelectorAll('th');
            const header = [];
            for (let j = 0; j < headerCols.length - 1; j++) { // Exclude the 'Actions' column
                let data = headerCols[j].innerText.trim();
                data = data.replace(/"/g, '""'); 
                header.push('"' + data + '"');
            }
            csv.push(header.join(','));
        }
    }
    
    // 2. Extract Data Rows (from <tbody>)
    for (let i = 0; i < rows.length; i++) {
        const row = [];
        const cols = rows[i].querySelectorAll('td'); 
        
        // Skip empty/status rows
        if (cols.length < 2) continue;

        for (let j = 0; j < cols.length - 1; j++) { // Exclude the last 'Actions' column
            let data = cols[j].innerText.trim();
            data = data.replace(/"/g, '""'); 
            row.push('"' + data + '"');
        }
        csv.push(row.join(','));
    }

    const csv_string = csv.join('\n');

    // 3. Trigger the download
    const link = document.createElement('a');
    link.style.display = 'none';
    link.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv_string));
    link.setAttribute('download', filename);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


/*******************************************************
 * 3. Dashboard / Welcome Editor
 *******************************************************/

async function loadDashboardData() {
    const { count: allUsersCount } = await sb.from('profiles').select('id', { count: 'exact' });
    $('totalUsers').textContent = allUsersCount || 0;
    const { count: pendingCount } = await sb.from('profiles').select('id', { count: 'exact' }).eq('approved', false);
    $('pendingApprovals').textContent = pendingCount || 0;
    const { count: studentsCount } = await sb.from('profiles').select('id', { count: 'exact' }).eq('role', 'student');
    $('totalStudents').textContent = studentsCount || 0;
    const today = new Date().toISOString().slice(0, 10);
    const { data: checkinData } = await sb.from('geo_attendance_logs').select('id').gte('check_in_time', today);
    $('todayCheckins').textContent = checkinData?.length || 0;
    
    loadStudentWelcomeMessage(); 
}

async function loadStudentWelcomeMessage() {
    const { data } = await fetchData(SETTINGS_TABLE, '*', { setting_key: MESSAGE_KEY });
    const messageDiv = $('student-welcome-message') || $('live-preview');
    if (!messageDiv) return;

    if (data && data.length > 0) {
        messageDiv.innerHTML = data[0].setting_value;
    } else {
        messageDiv.innerHTML = '<p>Welcome student! Please check in for attendance. (Default Message)</p>';
    }
}

async function loadWelcomeMessageForEdit() {
    const { data } = await fetchData(SETTINGS_TABLE, '*', { setting_key: MESSAGE_KEY });
    const editor = $('welcome-message-editor');

    if (data && data.length > 0) {
        editor.value = data[0].setting_value;
    } else {
        editor.value = '<p>Welcome student! Please check in for attendance. (Default Message)</p>';
    }
    loadStudentWelcomeMessage(); // Refresh live preview
}

async function handleSaveWelcomeMessage(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const setting_value = $('welcome-message-editor').value.trim();

    if (!setting_value) { showFeedback('Message content cannot be empty.', 'error'); setButtonLoading(submitButton, false, originalText); return; }
    
    const { data: existing } = await fetchData(SETTINGS_TABLE, 'id', { setting_key: MESSAGE_KEY });

    let updateOrInsertError = null;

    if (existing && existing.length > 0) {
        const { error } = await sb.from(SETTINGS_TABLE).update({ setting_value, updated_at: new Date().toISOString() }).eq('id', existing[0].id);
        updateOrInsertError = error;
    } else {
        const { error } = await sb.from(SETTINGS_TABLE).insert({ setting_key: MESSAGE_KEY, setting_value: setting_value });
        updateOrInsertError = error;
    }

    if (updateOrInsertError) {
        showFeedback(`Failed to save message: ${updateOrInsertError.message}`, 'error');
    } else {
        showFeedback('Welcome message saved successfully!');
        loadWelcomeMessageForEdit(); // Refresh the editor and preview
    }

    setButtonLoading(submitButton, false, originalText);
}


/*******************************************************
 * 4. Users/Enroll Tab (Approvals, EDIT, Delete Logic)
 *******************************************************/

/**
 * Dynamic Block/Term Options based on Program (KRCHN vs TVET).
 * KRCHN uses Block A/B. TVET uses Term 1/2/3.
 * @param {string} programSelectId - ID of the program SELECT element 
 * @param {string} blockTermSelectId - ID of the block/term SELECT element 
 */
function updateBlockTermOptions(programSelectId, blockTermSelectId) {
    const program = $(programSelectId)?.value;
    const blockTermSelect = $(blockTermSelectId);
    
    if (!blockTermSelect) return;

    let options = [];

    if (program === 'KRCHN') {
        // KRCHN specific: Only uses Block A and Block B
        options = [
            { value: 'A', text: 'Block A' },
            { value: 'B', text: 'Block B' }
        ];
    } else if (program === 'TVET') {
        // TVET specific: Uses Term 1, Term 2, Term 3
        options = [
            { value: 'T1', text: 'Term 1' },
            { value: 'T2', text: 'Term 2' },
            { value: 'T3', text: 'Term 3' }
        ];
    } else {
        // Default/Other (e.g., if program isn't selected or is Admin)
        options = [
            { value: 'A', text: 'Block A / Term 1' },
            { value: 'B', text: 'Block B / Term 2' }
        ];
    }
    
    let html = '<option value="">-- Select Block/Term --</option>';
    options.forEach(opt => {
        html += `<option value="${opt.value}">${escapeHtml(opt.text)}</option>`;
    });
    blockTermSelect.innerHTML = html;
}

async function handleAddAccount(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const name = $('account-name').value.trim();
    const email = $('account-email').value.trim();
    const password = $('account-password').value.trim();
    const role = $('account-role').value;
    const phone = $('account-phone').value.trim();
    const program_type = $('account-program').value;
    const intake_year = $('account-intake').value; 
    const block = $('account-block-term').value; 

    const userData = { 
        full_name: name, role: role, phone: phone, program_type: program_type, 
        intake_year: intake_year, block: block, approved: true, block_program_year: false 
    };

    const { data: { user }, error: authError } = await sb.auth.signUp({
        email: email, password: password, options: { data: userData }
    });

    if (authError) {
        showFeedback(`Account Enrollment Error: ${authError.message}`, 'error');
    } else if (user && user.id) {
        e.target.reset();
        showFeedback(`New ${role.toUpperCase()} account successfully enrolled and approved!`, 'success');
        loadStudents(); loadAllUsers(); loadDashboardData();
    } else {
        showFeedback('Enrollment succeeded but Auth user object was not returned. Please check the logs.', 'error');
    }

    setButtonLoading(submitButton, false, originalText);
}


async function loadAllUsers() {
    const tbody = $('users-table');
    tbody.innerHTML = '<tr><td colspan="7">Loading all users...</td></tr>';
    
    const { data: users, error } = await fetchData('profiles', '*', {}, 'full_name', true);
    if (error) { tbody.innerHTML = `<tr><td colspan="7">Error loading users: ${error.message}</td></tr>`; return; }
    
    tbody.innerHTML = '';
    users.forEach(u => {
        const roleOptions = ['student', 'admin', 'superadmin']
            .map(role => `<option value="${role}" ${u.role === role ? 'selected' : ''}>${role}</option>`).join('');
        
        const isBlocked = u.block_program_year === true;
        const statusText = isBlocked ? 'BLOCKED' : (u.approved ? 'Approved' : 'Pending');
        const statusClass = isBlocked ? 'status-danger' : (u.approved ? 'status-approved' : 'status-pending');

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(u.id.substring(0, 8))}...</td>
            <td>${escapeHtml(u.full_name)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td>
                <select class="btn" onchange="updateUserRole('${u.id}', this.value)" ${u.role === 'superadmin' ? 'disabled' : ''}>
                    ${roleOptions}
                </select>
            </td>
            <td>${escapeHtml(u.program_type || 'N/A')}</td>
            <td class="${statusClass}">${statusText}</td>
            <td>
                <button class="btn btn-map" onclick="openEditUserModal('${u.id}')">Edit</button>
                ${!u.approved ? `<button class="btn btn-approve" onclick="approveUser('${u.id}')">Approve</button>` : ''}
                <button class="btn btn-delete" onclick="deleteProfile('${u.id}')">Delete</button>
            </td>
        </tr>`;
    });
    filterTable('user-search', 'users-table', [1, 2, 4]); 
}

async function loadPendingApprovals() {
    const tbody = $('pending-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading pending users...</td></tr>';
    
    const { data: pending, error } = await fetchData('profiles', '*', { approved: false }, 'created_at', true);
    if (error) { tbody.innerHTML = `<tr><td colspan="6">Error loading pending list: ${error.message}</td></tr>`; return; }
    
    tbody.innerHTML = '';
    if (pending.length === 0) { tbody.innerHTML = `<tr><td colspan="6">No pending approvals!</td></tr>`; return; }
    
    pending.forEach(p => {
        const registeredDate = new Date(p.created_at).toLocaleDateString();
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(p.full_name)}</td>
            <td>${escapeHtml(p.email)}</td>
            <td>${escapeHtml(p.role)}</td>
            <td>${escapeHtml(p.program_type || 'N/A')}</td>
            <td>${registeredDate}</td>
            <td>
                <button class="btn btn-approve" onclick="approveUser('${p.id}')">Approve</button>
                <button class="btn btn-reject" onclick="deleteProfile('${p.id}')">Reject & Delete</button>
            </td>
        </tr>`;
    });
}

async function loadStudents() {
    const tbody = $('students-table');
    tbody.innerHTML = '<tr><td colspan="10">Loading students...</td></tr>';
    
    const { data: students, error } = await fetchData('profiles', '*', { role: 'student' }, 'full_name', true);
    if (error) { tbody.innerHTML = `<tr><td colspan="10">Error loading students: ${error.message}</td></tr>`; return; }
    
    tbody.innerHTML = '';
    students.forEach(s => {
        const isBlocked = s.block_program_year === true;
        const statusText = isBlocked ? 'BLOCKED' : (s.approved ? 'Approved' : 'Pending');
        const statusClass = isBlocked ? 'status-danger' : (s.approved ? 'status-approved' : 'status-pending');

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(s.id.substring(0, 8))}...</td>
            <td>${escapeHtml(s.full_name)}</td>
            <td>${escapeHtml(s.email)}</td>
            <td>${escapeHtml(s.program_type || 'N/A')}</td>
            <td>${escapeHtml(s.intake_year || 'N/A')}</td>
            <td>${escapeHtml(s.block || 'N/A')}</td>
            <td>${escapeHtml(s.phone)}</td>
            <td class="${statusClass}">${statusText}</td>
            <td>
                <button class="btn btn-map" onclick="openEditUserModal('${s.id}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteProfile('${s.id}')">Delete</button>
            </td>
        </tr>`;
    });
    filterTable('student-search', 'students-table', [1, 3, 5]); 
}

async function approveUser(userId) {
    if (!confirm('Are you sure you want to approve this user?')) return;
    const { error } = await sb.from('profiles').update({ approved: true }).eq('id', userId);
    if (error) { showFeedback(`Failed to approve user: ${error.message}`, 'error'); } 
    else { showFeedback('User approved successfully!'); loadPendingApprovals(); loadAllUsers(); loadDashboardData(); }
}

async function updateUserRole(userId, newRole) {
    if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;
    const { error } = await sb.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) { showFeedback(`Failed to update role: ${error.message}`, 'error'); } 
    else { showFeedback(`User role updated to ${newRole} successfully!`); loadAllUsers(); }
}

async function deleteProfile(userId) {
    if (!confirm('WARNING: Deleting the profile is an irreversible action. Are you absolutely sure?')) return;
    const { error: profileError } = await sb.from('profiles').delete().eq('id', userId);
    if (profileError) { showFeedback(`Failed to delete profile: ${profileError.message}`, 'error'); return; }
    showFeedback('User profile deleted successfully!', 'success');
    loadAllUsers(); loadPendingApprovals(); loadStudents(); loadDashboardData();
}

async function openEditUserModal(userId) {
    try {
        const { data: user, error } = await sb.from('profiles').select('*').eq('id', userId).single();
        if (error || !user) throw new Error('User data fetch failed.');

        $('edit_user_id').value = user.id;
        $('edit_user_name').value = user.full_name || '';
        $('edit_user_email').value = user.email || '';
        $('edit_user_role').value = user.role || 'student';
        $('edit_user_program').value = user.program_type || 'KRCHN';
        $('edit_user_intake').value = user.intake_year || '2024';
        $('edit_user_block').value = user.block || 'A';
        $('edit_user_block_status').value = user.block_program_year === true ? 'true' : 'false';

        // NOTE: This relies on the select options in the HTML matching the DB data.
        updateBlockTermOptions('edit_user_program', 'edit_user_block');
        $('edit_user_block').value = user.block || 'A';


        $('userEditModal').style.display = 'flex'; 
    } catch (error) {
        showFeedback(`Failed to load user data: ${error.message}`, 'error');
    }
}

async function handleEditUser(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);
    
    const userId = $('edit_user_id').value;
    const updatedData = {
        full_name: $('edit_user_name').value.trim(),
        email: $('edit_user_email').value.trim(),
        role: $('edit_user_role').value,
        program_type: $('edit_user_program').value,
        intake_year: $('edit_user_intake').value,
        block: $('edit_user_block').value,
        block_program_year: $('edit_user_block_status').value === 'true' 
    };

    try {
        const { error } = await sb.from('profiles').update(updatedData).eq('id', userId);
        if (error) throw error;

        showFeedback('User profile updated successfully!');
        $('userEditModal').style.display = 'none';
        loadAllUsers(); loadStudents(); loadDashboardData();
    } catch (e) {
        showFeedback('Failed to update user: ' + (e.message || e), 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


/*******************************************************
 * 5. Courses Tab
 *******************************************************/

async function handleAddCourse(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const course_name = $('course-name').value.trim();
    const unit_code = $('course-unit-code').value.trim(); 
    const description = $('course-description').value.trim();
    const target_program = $('course-program').value; 
    const intake_year = $('course-intake').value; 
    const block = $('course-block').value; 
    
    if (!course_name || !target_program || !unit_code) {
        showFeedback('Course Name, Unit Code, and Target Program are required.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const { error } = await sb.from('courses').insert({ 
        course_name, 
        unit_code, 
        description, 
        target_program, 
        intake_year, 
        block,
        status: 'Active'
    });

    if (error) {
        showFeedback(`Failed to add course: ${error.message}`, 'error');
    } else {
        showFeedback('Course added successfully!');
        e.target.reset();
        loadCourses();
    }

    setButtonLoading(submitButton, false, originalText);
}

async function loadCourses() {
    const tbody = $('courses-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading courses...</td></tr>';

    const { data: courses, error } = await fetchData('courses', '*', {}, 'course_name', true);
    if (error) { tbody.innerHTML = `<tr><td colspan="6">Error loading courses: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    courses.forEach(c => {
        const courseNameAttr = escapeHtml(c.course_name, true);
        const unitCodeAttr = escapeHtml(c.unit_code || '', true);
        const descriptionAttr = escapeHtml(c.description || '', true);
        const programTypeAttr = escapeHtml(c.target_program || '', true); 
        const intakeYearAttr = escapeHtml(c.intake_year || '', true);     
        const blockAttr = escapeHtml(c.block || '', true);              

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(c.course_name)}</td>
            <td>${escapeHtml(c.unit_code || 'N/A')}</td>
            <td>${escapeHtml(c.target_program || 'N/A')}</td>
            <td>${escapeHtml(c.intake_year || 'N/A')}</td>
            <td>${escapeHtml(c.block || 'N/A')}</td>
            <td>
                <button class="btn-action" onclick="openEditCourseModal('${c.id}', '${courseNameAttr}', '${unitCodeAttr}', '${descriptionAttr}', '${programTypeAttr}', '${intakeYearAttr}', '${blockAttr}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteCourse('${c.id}')">Delete</button>
            </td>
        </tr>`;
    });
    
    filterTable('course-search', 'courses-table', [0, 1, 3]); 
    
    // Auto-populate course selectors in other tabs
    populateExamCourseSelects(courses);
    populateSessionCourseSelects(courses);
}

async function deleteCourse(courseId) {
    if (!confirm('Are you sure you want to delete this course? This cannot be undone.')) return;
    const { error } = await sb.from('courses').delete().eq('id', courseId);
    if (error) { showFeedback(`Failed to delete course: ${error.message}`, 'error'); } 
    else { showFeedback('Course deleted successfully!'); loadCourses(); }
}

function openEditCourseModal(id, name, unit_code, description, target_program, intake_year, block) {
    $('edit_course_id').value = id;
    $('edit_course_name').value = name; 
    $('edit_course_unit_code').value = unit_code; 
    $('edit_course_description').value = description;
    $('edit_course_program').value = target_program || ''; 
    $('edit_course_intake').value = intake_year; 
    
    // 1. Load correct block options based on program
    updateBlockTermOptions('edit_course_program', 'edit_course_block'); 
    
    // 2. Set the block value (this must happen AFTER block options are loaded)
    $('edit_course_block').value = block;

    $('courseEditModal').style.display = 'flex'; 
}

async function handleEditCourse(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const id = $('edit_course_id').value;
    const name = $('edit_course_name').value.trim();
    const unit_code = $('edit_course_unit_code').value.trim(); 
    const description = $('edit_course_description').value.trim();
    const target_program = $('edit_course_program').value;
    const intake_year = $('edit_course_intake').value;
    const block = $('edit_course_block').value;
    
    try {
        const updateData = { 
            course_name: name, 
            unit_code: unit_code, 
            description: description, 
            target_program: target_program,
            intake_year: intake_year,
            block: block
        };
        
        const { error } = await sb.from('courses').update(updateData).eq('id', id); 

        if (error) throw error;

        showFeedback('Course updated successfully!');
        $('courseEditModal').style.display = 'none';
        loadCourses(); 
    } catch (e) {
        showFeedback('Failed to update course: ' + (e.message || e), 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


/*******************************************************
 * 6. Manage Sessions Tab (Including Clinical)
 *******************************************************/

async function populateSessionCourseSelects(courses = null) {
    const courseSelect = $('session_course_id');
    const program = $('session_program').value;
    
    let filteredCourses = [];
    
    if (!program) {
        // If no program is selected, show no courses initially
        filteredCourses = []; 
    } else {
        if (!courses) {
            // Fetch courses if not already provided
            const { data } = await fetchData('courses', 'id, course_name', { target_program: program }, 'course_name', true);
            filteredCourses = data || [];
        } else {
            // Filter courses if provided (e.g., from loadCourses call)
            filteredCourses = courses.filter(c => c.target_program === program);
        }
    }
    
    populateSelect(courseSelect, filteredCourses, 'id', 'course_name', 'Select Course (Optional)');
}


async function loadScheduledSessions() {
    const tbody = $('scheduled-sessions-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading scheduled sessions...</td></tr>';
    
    const { data: sessions, error } = await fetchData('scheduled_sessions', '*, course:course_id(course_name)', {}, 'session_date', false);
    if (error) { tbody.innerHTML = `<tr><td colspan="6">Error loading sessions: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    sessions.forEach(s => {
        const dateTime = new Date(s.session_date).toLocaleDateString() + ' ' + (s.session_time || 'N/A');
        const courseName = s.course?.course_name || 'N/A';
        
        let detail = s.session_title;
        if (s.session_type === 'clinical' && s.clinical_area) {
            detail += ` (${s.clinical_area})`;
        } else if (s.session_type === 'class' && courseName !== 'N/A') {
            detail += ` (${courseName})`;
        }

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(s.session_type)}</td>
            <td>${escapeHtml(detail)}</td>
            <td>${dateTime}</td>
            <td>${escapeHtml(s.target_program || 'N/A')}</td>
            <td>${escapeHtml(s.block_term || 'N/A')}</td>
            <td>
                <button class="btn btn-delete" onclick="deleteSession('${s.id}')">Delete</button>
            </td>
        </tr>`;
    });
}

async function handleAddSession(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const session_type = $('session_type').value;
    const session_title = $('session_title').value.trim();
    const session_date = $('session_date').value;
    const session_time = $('session_time').value;
    const target_program = $('session_program').value;
    const intake_year = $('session_intake').value;
    const block_term = $('session_block_term').value;
    const course_id = $('session_course_id').value || null;

    if (!session_type || !session_title || !session_date || !target_program || !block_term) {
        showFeedback('Please fill in all required fields.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const sessionData = {
        session_type, session_title, 
        session_date, session_time: session_time || null, 
        target_program, intake_year, block_term, course_id
    };

    const { error } = await sb.from('scheduled_sessions').insert([sessionData]);
    
    if (error) {
        showFeedback(`Failed to schedule session: ${error.message}`, 'error');
    } else {
        showFeedback('Session scheduled successfully!');
        e.target.reset(); 
        loadScheduledSessions(); 
        renderFullCalendar();
    }

    setButtonLoading(submitButton, false, originalText);
}

async function deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this session?')) return;
    const { error } = await sb.from('scheduled_sessions').delete().eq('id', sessionId);
    if (error) { showFeedback(`Failed to delete session: ${error.message}`, 'error'); } 
    else { showFeedback('Session deleted successfully!'); loadScheduledSessions(); renderFullCalendar(); }
}

// Placeholder function for Clinical Name Update
function saveClinicalName() {
    const program = $('clinical_program').value;
    const intake = $('clinical_intake').value;
    const block = $('clinical_block_term').value;
    const name = $('clinical_name_to_edit').value.trim();

    if (!program || !intake || !block || !name) {
        showFeedback('Please select Program, Intake, Block/Term and provide a name.', 'error');
        return;
    }
    
    showFeedback(`Clinical Area: "${name}" saved for ${program} ${intake} Block/Term ${block}. (DB logic not implemented)`, 'success');
}


/*******************************************************
 * 7. Attendance Tab
 *******************************************************/

async function populateAttendanceSelects() {
    const { data: students } = await fetchData('profiles', 'id, full_name', { role: 'student', approved: true }, 'full_name', true);
    const attStudentSelect = $('att_student_id');
    if (students) { populateSelect(attStudentSelect, students, 'id', 'full_name', 'Select Student'); }
}

function toggleAttendanceFields() {
    const sessionType = $('att_session_type').value;
    const departmentInput = $('att_department');
    const courseSelect = $('att_course_id');
    
    // These elements don't exist in the HTML provided, so we'll skip checking for them or hide them
    // const departmentGroup = $('att_department_group');
    // const courseGroup = $('att_course_group');
    
    // if (departmentGroup) departmentGroup.style.display = 'block'; // Assume always visible for robustness
    // if (courseGroup) courseGroup.style.display = 'block'; // Assume always visible for robustness

    if (sessionType === 'clinical') {
        departmentInput.placeholder = "Clinical Department/Area";
        departmentInput.required = true;
        if (courseSelect) courseSelect.required = false;
        if (courseSelect) courseSelect.value = ""; 
    } else if (sessionType === 'classroom') {
        departmentInput.placeholder = "Classroom Location/Room (Optional)";
        departmentInput.required = false;
        if (courseSelect) courseSelect.required = true;
    } else {
        departmentInput.placeholder = "Location/Detail (e.g., Virtual Meeting Link)";
        departmentInput.required = false;
        if (courseSelect) courseSelect.required = false;
        if (courseSelect) courseSelect.value = "";
    }
}

async function handleManualAttendance(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const student_id = $('att_student_id').value;
    const session_type = $('att_session_type').value;
    const date = $('att_date').value;
    const time = $('att_time').value;
    
    const course_id = session_type === 'classroom' ? $('att_course_id').value : null;
    const department = $('att_department').value.trim() || null; // Use department for clinical or other location details
    const location_name = $('att_location').value.trim() || 'Manual Admin Entry';
    
    let check_in_time = new Date().toISOString();
    if (date && time) {
        check_in_time = new Date(`${date}T${time}`).toISOString();
    } else if (date) {
        check_in_time = new Date(date).toISOString();
    }
    
    if (!student_id || (session_type === 'classroom' && !course_id)) {
        showFeedback('Please select a student and fill in required fields.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }
    
    const attendanceData = {
        student_id: student_id,
        session_type: session_type,
        check_in_time: check_in_time, 
        department: department,
        course_id: course_id,
        is_manual_entry: true, 
        latitude: null, longitude: null,
        location_name: location_name,
        ip_address: await getIPAddress(),
        device_id: getDeviceId()
    };

    const { error } = await sb.from('geo_attendance_logs').insert([attendanceData]);
    
    if (error) {
        showFeedback(`Failed to record attendance: ${error.message}`, 'error');
    } else {
        showFeedback('Manual attendance recorded successfully!');
        e.target.reset(); 
        loadAttendance(); 
        toggleAttendanceFields(); 
    }

    setButtonLoading(submitButton, false, originalText);
}

async function loadAttendance() {
    const todayBody = $('attendance-table');
    const pastBody = $('past-attendance-table');
    
    todayBody.innerHTML = '<tr><td colspan="6">Loading today\'s records...</td></tr>';
    pastBody.innerHTML = '<tr><td colspan="5">Loading history...</td></tr>';
    
    const todayISO = new Date().toISOString().slice(0, 10);

    const { data: allRecords, error } = await fetchData(
        'geo_attendance_logs', 
        '*, profile:student_id(full_name, role), course:course_id(course_name)', 
        {}, 'check_in_time', false 
    );

    if (error) { 
        todayBody.innerHTML = `<tr><td colspan="6">Error loading records: ${error.message}</td></tr>`; 
        pastBody.innerHTML = `<tr><td colspan="5">Error loading records: ${error.message}</td></tr>`;
        return; 
    }

    let todayHtml = '';
    let pastHtml = '';
    
    allRecords.forEach(r => {
        const userName = r.profile?.full_name || 'N/A User';
        const userRole = r.profile?.role || 'N/A';
        const dateTime = new Date(r.check_in_time).toLocaleString();
        
        let locationDetail;
        if (r.session_type === 'clinical' && r.department) {
            locationDetail = escapeHtml(r.department);
        } else if (r.session_type === 'classroom' && r.course?.course_name) {
            locationDetail = escapeHtml(r.course.course_name);
        } else {
            locationDetail = escapeHtml(r.location_name || r.department || 'N/A Location');
        }
        
        const recordDate = new Date(r.check_in_time).toISOString().slice(0, 10);
        
        if (recordDate === todayISO) {
            // TODAY'S RECORDS
            let geoStatus;
            let mapButton = '';
            if (r.latitude && r.longitude) {
                geoStatus = 'Yes (Geo-Logged)';
                mapButton = `<button class="btn btn-map" onclick="showMap('${r.latitude}', '${r.longitude}', '${escapeHtml(r.location_name || 'Check-in Location', true)}', '${escapeHtml(userName, true)}', '${dateTime}')">View Map</button>`;
            } else {
                geoStatus = 'No (Manual)';
            }
            
            todayHtml += `<tr>
                <td>${escapeHtml(userName)}</td>
                <td>${escapeHtml(r.session_type || 'N/A')}</td>
                <td>${locationDetail}</td>
                <td>${dateTime}</td>
                <td>${geoStatus}</td>
                <td>
                    ${mapButton}
                    <button class="btn btn-delete" onclick="deleteAttendanceRecord('${r.id}')">Delete</button>
                </td>
            </tr>`;
        } else {
            // PAST HISTORY
            pastHtml += `<tr>
                <td>${escapeHtml(userName)} (${userRole})</td>
                <td>${escapeHtml(r.session_type || 'N/A')}</td>
                <td>${dateTime}</td>
                <td>${r.is_manual_entry ? 'Manual' : 'Geo-Tracked'}</td>
                <td>
                    <button class="btn btn-delete" onclick="deleteAttendanceRecord('${r.id}')">Delete</button>
                </td>
            </tr>`;
        }
    });
    
    todayBody.innerHTML = todayHtml || '<tr><td colspan="6">No check-in records for today.</td></tr>';
    pastBody.innerHTML = pastHtml || '<tr><td colspan="5">No past attendance history found.</td></tr>';

    filterTable('attendance-search', 'attendance-table', [0, 1, 2]); 
}

function showMap(lat, lng, locationName, studentName, dateTime) {
    const mapModal = $('mapModal');
    const mapContainer = $('mapbox-map'); 
    
    // NOTE: map-modal-title element is missing in the provided HTML, using mapModal.querySelector if possible or omitting.
    // Assuming the title is set by the H2 in the modal content which is static.
    
    $('map-details').innerHTML = `<strong>Time:</strong> ${dateTime}<br><strong>Location:</strong> ${locationName}<br><strong>Coords:</strong> ${lat}, ${lng}`;

    mapModal.style.display = 'flex';
    
    if (attendanceMap) {
        attendanceMap.remove(); 
    }
    
    // Initialize Leaflet Map
    attendanceMap = L.map(mapContainer.id, { attributionControl: false }).setView([lat, lng], 15);

    // Add Tile Layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(attendanceMap);

    // Add Marker
    L.marker([lat, lng])
        .bindPopup(`<h5>${locationName}</h5><p>${studentName}</p>`)
        .addTo(attendanceMap)
        .openPopup();
        
    setTimeout(() => { 
        if (attendanceMap) { attendanceMap.invalidateSize(); } 
    }, 100); 
}

async function deleteAttendanceRecord(recordId) {
    if (!confirm('Are you sure you want to delete this attendance record?')) return;
    const { error } = await sb.from('geo_attendance_logs').delete().eq('id', recordId);
    if (error) { showFeedback(`Failed to delete record: ${error.message}`, 'error'); } 
    else { showFeedback('Attendance record deleted successfully!'); loadAttendance(); }
}

async function adminCheckIn() {
    const ip = await getIPAddress();
    const deviceId = getDeviceId();
    
    if (!currentUserProfile) {
        showFeedback('User profile not loaded. Cannot check in.', 'error');
        return;
    }

    const checkinData = {
        student_id: currentUserProfile.id,
        session_type: 'admin_checkin',
        check_in_time: new Date().toISOString(), 
        is_manual_entry: true, 
        location_name: 'Admin Self Check-in',
        ip_address: ip,
        device_id: deviceId
    };

    const { error } = await sb.from('geo_attendance_logs').insert([checkinData]);
    
    if (error) {
        showFeedback(`Failed to record admin check-in: ${error.message}`, 'error');
    } else {
        showFeedback('Admin self check-in recorded successfully!');
        loadAttendance(); 
        loadDashboardData();
    }
}


/*******************************************************
 * 8. CATS/Exams Tab
 *******************************************************/
async function populateExamCourseSelects(courses = null) {
    const courseSelect = $('exam_course_id');
    const program = $('exam_program').value;
    
    let filteredCourses = [];
    
    if (!program) {
        // If no program is selected, show no courses initially
        filteredCourses = []; 
    } else {
        if (!courses) {
            // Fetch courses if not already provided
            const { data } = await fetchData('courses', 'id, course_name', { target_program: program }, 'course_name', true);
            filteredCourses = data || [];
        } else {
            // Filter courses if provided (e.g., from loadCourses call)
            filteredCourses = courses.filter(c => c.target_program === program);
        }
    }
    
    // The select box for courses is now populated only with courses matching the selected program.
    populateSelect(courseSelect, filteredCourses, 'id', 'course_name', 'Select Course');
}

function filterCoursesByProgram() {
    // This is the simplified function called by the exam_program onchange handler.
    populateExamCourseSelects();
}

async function handleAddExam(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const program = $('exam_program').value;
    const course_id = $('exam_course_id').value;
    const exam_title = $('exam_title').value.trim();
    const exam_date = $('exam_date').value;
    const exam_status = $('exam_status').value;
    const intake = $('exam_intake').value;
    const block_term = $('exam_block_term').value;

    if (!program || !course_id || !exam_title || !exam_date || !intake || !block_term) {
        showFeedback('All fields in the Add Exam form are required.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const { error } = await sb.from('exams').insert({ 
        exam_name: exam_title, 
        course_id, 
        exam_date, 
        target_program: program, 
        intake_year: intake,     
        block_term,              
        status: exam_status
    });

    if (error) { showFeedback(`Failed to add exam: ${error.message}`, 'error'); } 
    else { showFeedback('Exam added successfully!'); e.target.reset(); loadExams(); renderFullCalendar(); }

    setButtonLoading(submitButton, false, originalText);
}


async function loadExams() {
    const tbody = $('exams-table');
    tbody.innerHTML = '<tr><td colspan="8">Loading exams/CATs...</td></tr>';
    
    const { data: exams, error } = await fetchData('exams', '*, course:course_id(course_name)', {}, 'exam_date', false);
    if (error) { tbody.innerHTML = `<tr><td colspan="8">Error loading exams: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    exams.forEach(e => {
        const examDate = new Date(e.exam_date).toLocaleDateString();
        const courseName = e.course?.course_name || 'N/A';
        const program = e.target_program || 'N/A';
        const intake = e.intake_year || 'N/A';

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(program)}</td>
            <td>${escapeHtml(courseName)}</td>
            <td>${escapeHtml(e.exam_name)}</td>
            <td>${examDate}</td>
            <td>${escapeHtml(e.status)}</td>
            <td>${escapeHtml(intake)}</td>
            <td>${escapeHtml(e.block_term || 'N/A')}</td>
            <td>
                <button class="btn-action" onclick="openGradeModal('${e.id}', '${escapeHtml(e.exam_name, true)}')">Grade</button>
                <button class="btn btn-delete" onclick="deleteExam('${e.id}')">Delete</button>
            </td>
        </tr>`;
    });
    
    filterTable('exam-search', 'exams-table', [2, 1, 6]); 
}

async function deleteExam(examId) {
    if (!confirm('Are you sure you want to delete this exam? This cannot be undone.')) return;
    const { error } = await sb.from('exams').delete().eq('id', examId);
    if (error) { showFeedback(`Failed to delete exam: ${error.message}`, 'error'); } 
    else { showFeedback('Exam deleted successfully!'); loadExams(); renderFullCalendar(); }
}

function openGradeModal(examId, examName) {
    showFeedback(`Grading functionality for: ${examName} (ID: ${examId}) is pending implementation.`, 'success');
}


/*******************************************************
 * 9. Calendar Tab (FullCalendar Integration)
 *******************************************************/

async function renderFullCalendar() {
    const calendarEl = $('fullCalendarDisplay');
    if (!calendarEl) return;
    calendarEl.innerHTML = ''; 

    const { data: sessions } = await fetchData('scheduled_sessions', '*', {}, 'session_date', true);
    const { data: exams } = await fetchData('exams', '*, course:course_id(course_name)', {}, 'exam_date', true);

    const events = [];

    // Map Sessions
    sessions?.forEach(s => {
        let title = `${s.session_type.toUpperCase()}: ${s.session_title}`;
        let color = s.session_type === 'clinical' ? '#2ecc71' : s.session_type === 'event' ? '#9b59b6' : '#3498db';
        
        events.push({
            title: title,
            start: s.session_date + (s.session_time ? `T${s.session_time}` : ''),
            allDay: !s.session_time,
            color: color
        });
    });

    // Map Exams
    exams?.forEach(e => {
        const courseName = e.course?.course_name || 'Exam';
        events.push({
            title: `EXAM: ${e.exam_name} (${courseName})`,
            start: e.exam_date,
            allDay: true,
            color: '#e74c3c'
        });
    });

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: events
    });

    calendar.render();
}

/*******************************************************
 * 10. Messages Tab
 *******************************************************/

async function handleSendMessage(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const target_program = $('msg_program').value; 
    const message_content = $('msg_body').value.trim(); 
    const subject = `Message to ${target_program}`;
    const message_type = 'system'; 

    if (!message_content) {
        showFeedback('Message content cannot be empty.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const { error } = await sb.from('notifications').insert({ 
        recipient_id: null, 
        target_program: target_program === 'ALL' ? null : target_program, 
        subject: subject, 
        message_content: message_content, 
        message_type: message_type,
        sender_id: currentUserProfile.id
    });

    if (error) { showFeedback(`Failed to send message: ${error.message}`, 'error'); } 
    else { showFeedback('Message sent successfully!'); e.target.reset(); loadMessages(); }

    setButtonLoading(submitButton, false, originalText);
}

async function loadMessages() {
    const tbody = $('messages-table');
    tbody.innerHTML = '<tr><td colspan="3">Loading messages...</td></tr>';
    
    const { data: messages, error } = await fetchData('notifications', '*', { message_type: 'system' }, 'created_at', false);
    
    if (error) { tbody.innerHTML = `<tr><td colspan="3">Error loading messages: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    messages.forEach(m => {
        const recipient = m.target_program || 'ALL Students';
        const sendDate = new Date(m.created_at).toLocaleString();

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(recipient)}</td>
            <td>${escapeHtml(m.message_content.substring(0, 80) + '...')}</td>
            <td>${sendDate}</td>
        </tr>`;
    });
}


/*******************************************************
 * 11. Resources Tab
 *******************************************************/

$('upload-resource-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const program = $('resource_program').value;
    const intake = $('resource_intake').value;
    const block = $('resource_block').value;
    const fileInput = $('resource-file');
    const title = $('resource-title').value.trim();

    if (fileInput.files.length === 0 || !program || !intake || !block || !title) { 
        showFeedback('Please select a file and all target fields.', 'error'); 
        setButtonLoading(submitButton, false, originalText); 
        return; 
    }

    const file = fileInput.files[0];
    const filePath = `${program}/${intake}/${block}/${title.replace(/ /g, '_')}_${file.name.replace(/ /g, '_')}`; 

    try {
        const { error } = await sb.storage.from(RESOURCES_BUCKET).upload(filePath, file, { 
            cacheControl: '3600', 
            upsert: true,
            contentType: file.type,
            metadata: {
                title: title,
                program: program,
                intake: intake,
                block: block,
                uploaded_by: currentUserProfile.full_name
            }
        });
        if (error) throw error;
        showFeedback(`File "${file.name}" uploaded successfully!`);
        e.target.reset(); loadResources();
    } catch (e) {
        showFeedback(`File upload failed: ${e.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

async function loadResources() {
    const tableBody = $('resources-list'); 
    tableBody.innerHTML = '<tr><td colspan="7">Loading resources...</td></tr>';
    
    try {
        const { data: { contents: files }, error: listError } = await sb.storage
            .from(RESOURCES_BUCKET).list('', { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } });

        if (listError) throw listError;
        
        tableBody.innerHTML = '';
        if (!files || files.length === 0) { tableBody.innerHTML = '<tr><td colspan="7">No resources found.</td></tr>'; return; }

        files.forEach(file => {
            if (file.name === '.emptyFolderPlaceholder' || file.id === undefined) return;
            
            const { data: { publicUrl } } = sb.storage.from(RESOURCES_BUCKET).getPublicUrl(file.name);
            const lastModified = new Date(file.lastModified).toLocaleString();
            
            const parts = file.name.split('/');
            const program = parts[0] || 'N/A';
            const intake = parts[1] || 'N/A';
            const block = parts[2] || 'N/A';
            const fileName = parts.slice(3).join('/') || file.name;

            tableBody.innerHTML += `<tr>
                <td>${escapeHtml(program)}</td>
                <td>${escapeHtml(fileName)}</td>
                <td>${escapeHtml(intake)}</td>
                <td>${escapeHtml(block)}</td>
                <td>${escapeHtml(file.metadata?.uploaded_by || 'Admin')}</td>
                <td>${lastModified}</td>
                <td>
                    <a href="${publicUrl}" target="_blank" class="btn-action">Download</a>
                    <button class="btn btn-delete" onclick="deleteResource('${escapeHtml(file.name, true)}')">Delete</button>
                </td>
            </tr>`;
        });
    } catch (e) {
        tableBody.innerHTML = `<tr><td colspan="7">Error listing resources: ${e.message}</td></tr>`;
    }
    filterTable('resource-search', 'resources-list', [0, 1]); 
}

async function deleteResource(fileName) {
    if (!confirm(`Are you sure you want to delete "${fileName}"? This cannot be undone.`)) return;
    try {
        const { error } = await sb.storage.from(RESOURCES_BUCKET).remove([fileName]);
        if (error) throw error;
        showFeedback('Resource deleted successfully!'); loadResources();
    } catch (e) {
        showFeedback(`Failed to delete resource: ${e.message}`, 'error');
    }
}


/*******************************************************
 * 12. Backup & Restore Tab
 *******************************************************/

async function loadBackupHistory() {
    const tbody = $('backup-history-table');
    tbody.innerHTML = '<tr><td colspan="4">Loading backup history...</td></tr>';
    
    // Placeholder Data
    const history = [
        { name: 'nchsm_db_20251010.sql', date: '2025-10-10 02:00:00', size: '125 MB' },
        { name: 'nchsm_db_20251009.sql', date: '2025-10-09 02:00:00', size: '124 MB' },
    ];

    tbody.innerHTML = '';
    history.forEach(h => {
        tbody.innerHTML += `<tr>
            <td>${h.name}</td>
            <td>${h.date}</td>
            <td>${h.size}</td>
            <td>
                <button class="btn-action" onclick="showFeedback('Download feature is a placeholder. File: ${h.name}')">Download</button>
                <button class="btn btn-delete" onclick="showFeedback('Delete feature is a placeholder. File: ${h.name}')">Delete</button>
            </td>
        </tr>`;
    });
}

function triggerBackup() {
    showFeedback('Backup initiated! Check Supabase Console for status (manual process).', 'success');
}

$('restore-form')?.addEventListener('submit', e => {
    e.preventDefault();
    showFeedback('Database restoration initiated. This is a critical server-side process, check logs for completion.', 'error');
    e.target.reset();
});


// =================================================================
// INITIALIZATION
// =================================================================
document.addEventListener('DOMContentLoaded', initSession);
