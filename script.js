/**********************************************************************************
 * Final Integrated JavaScript File (script.js)
 * SUPERADMIN DASHBOARD - COURSE, USER, ATTENDANCE & FULL FILTERING MANAGEMENT
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
        case 'enroll': loadStudents(); updateBlockTermOptions('account'); break; // Ensure enroll options are set
        case 'courses': loadCourses(); updateBlockTermOptions('course'); break; // Ensure course options are set
        case 'sessions': loadScheduledSessions(); populateSessionCourseSelects(); updateBlockTermOptions('session'); updateBlockTermOptions('clinical'); break;
        case 'attendance': loadAttendance(); populateAttendanceSelects(); break;
        case 'cats': loadExams(); populateExamCourseSelects(); updateBlockTermOptions('exam'); break;
        case 'messages': loadMessages(); break;
        case 'calendar': renderFullCalendar(); break;
        case 'resources': loadResources(); updateBlockTermOptions('resource'); break; 
        case 'welcome-editor': loadWelcomeMessageForEdit(); break; 
        case 'backup': loadBackupHistory(); break;
        default: break;
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
    $('account-program')?.addEventListener('change', () => updateBlockTermOptions('account'));
    
    $('user-search')?.addEventListener('keyup', () => filterTable('user-search', 'users-table', [1, 2, 4]));
    
    // COURSES TAB
    $('add-course-form')?.addEventListener('submit', handleAddCourse);
    $('course-search')?.addEventListener('keyup', () => filterTable('course-search', 'courses-table', [0, 1, 3]));
    $('course-program')?.addEventListener('change', () => { updateBlockTermOptions('course'); });
    
    // SESSIONS TAB
    $('add-session-form')?.addEventListener('submit', handleAddSession);
    $('session_program')?.addEventListener('change', () => { updateBlockTermOptions('session'); populateSessionCourseSelects(); });
    $('session_intake')?.addEventListener('change', () => updateTermBlockOptions('session')); // Note: updateTermBlockOptions is now updateBlockTermOptions
    $('clinical_program')?.addEventListener('change', () => { updateBlockTermOptions('clinical'); });
    $('clinical_intake')?.addEventListener('change', () => updateTermBlockOptions('clinical')); // Note: updateTermBlockOptions is now updateBlockTermOptions

    // CATS/EXAMS TAB
    $('add-exam-form')?.addEventListener('submit', handleAddExam);
    $('exam_program')?.addEventListener('change', () => { filterCoursesByProgram(); updateBlockTermOptions('exam'); });
    $('exam_intake')?.addEventListener('change', () => updateTermBlockOptions('exam')); // Note: updateTermBlockOptions is now updateBlockTermOptions
    
    // MESSAGE/WELCOME EDITOR TAB
    $('send-message-form')?.addEventListener('submit', handleSendMessage);
    $('edit-welcome-form')?.addEventListener('submit', handleSaveWelcomeMessage); 
    
    // RESOURCES TAB
    $('resource_program')?.addEventListener('change', () => { updateBlockTermOptions('resource'); });

    // MODAL/EDIT LISTENERS
    $('edit-user-form')?.addEventListener('submit', handleEditUser);
    document.querySelector('#userEditModal .close')?.addEventListener('click', () => { $('userEditModal').style.display = 'none'; });
    $('edit_user_program')?.addEventListener('change', () => { updateBlockTermOptions('edit_user'); }); // Added listener for dynamic options
    
    document.querySelector('#mapModal .close')?.addEventListener('click', () => { $('mapModal').style.display = 'none'; });
    $('edit-course-form')?.addEventListener('submit', handleEditCourse);
    $('edit_course_program')?.addEventListener('change', () => { updateBlockTermOptions('course'); }); // Updated to use universal func
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
 * @param {string} context - The ID prefix of the related selects (e.g., 'account', 'course', 'edit_user', 'session')
 * @param {string|null} selectedProgram - Optional: The program type, used when context select is not yet loaded (e.g., inside modal population).
 */
function updateBlockTermOptions(context, selectedProgram = null) {
    let programSelectId, blockTermSelectId;

    // Map the context to the actual HTML IDs
    switch(context) {
        case 'account': programSelectId = 'account-program'; blockTermSelectId = 'account-block-term'; break;
        case 'course': programSelectId = 'course-program'; blockTermSelectId = 'course-block'; break;
        case 'session': programSelectId = 'session_program'; blockTermSelectId = 'session_block_term'; break;
        case 'clinical': programSelectId = 'clinical_program'; blockTermSelectId = 'clinical_block_term'; break;
        case 'exam': programSelectId = 'exam_program'; blockTermSelectId = 'exam_block_term'; break;
        case 'resource': programSelectId = 'resource_program'; blockTermSelectId = 'resource_block'; break;
        case 'edit_user': // Used for user edit modal
            programSelectId = 'edit_user_program'; blockTermSelectId = 'edit_user_block'; break;
        default: return;
    }
    
    const programSelect = $(programSelectId);
    const blockTermSelect = $(blockTermSelectId);
    
    if (!blockTermSelect) return;

    // Determine the selected program
    const program = selectedProgram || (programSelect ? programSelect.value : null);

    let options = [];

    if (program === 'KRCHN') {
        options = [
            { value: 'A', text: 'Block A' },
            { value: 'B', text: 'Block B' }
        ];
    } else if (program === 'TVET') {
        options = [
            { value: 'T1', text: 'Term 1' },
            { value: 'T2', text: 'Term 2' },
            { value: 'T3', text: 'Term 3' }
        ];
    } else {
        // Default/Other (e.g., if program isn't selected or for non-student roles)
        options = []; 
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
        const roleOptions = ['student', 'lecturer', 'admin', 'superadmin']
            .map(role => `<option value="${role}" ${u.role === role ? 'selected' : ''}>${role.charAt(0).toUpperCase() + role.slice(1)}</option>`).join('');
        
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
        
        // 1. Populate standard fields
        $('edit_user_id').value = user.id;
        $('edit_user_name').value = user.full_name || '';
        $('edit_user_email').value = user.email || '';
        $('edit_user_role').value = user.role || 'student';
        $('edit_user_program').value = user.program_type || 'KRCHN';
        $('edit_user_intake').value = user.intake_year || '2024';
        
        // 2. CRITICAL FIX: Update the Block/Term dropdown options based on the user's program
        updateBlockTermOptions('edit_user', user.program_type); 

        // 3. Now set the user's saved Block/Term value (which is now a valid option)
        $('edit_user_block').value = user.block || ''; 

        // 4. Set status
        $('edit_user_block_status').value = user.block_program_year === true ? 'true' : 'false';
        
        // 5. Clear the password field (security/usability fix)
        $('edit_user_password').value = '';

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
    const newPassword = $('edit_user_password').value.trim();

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
        // 1. Update Profile Table
        const { error: profileError } = await sb.from('profiles').update(updatedData).eq('id', userId);
        if (profileError) throw profileError;

        // 2. Handle Password Reset (Auth Table)
        if (newPassword) {
            const { error: authError } = await sb.auth.admin.updateUserById(userId, { password: newPassword });
            if (authError) throw authError;
            // Note: Password reset success message is intentionally suppressed here to prevent confusion, 
            // as the main update success message covers the action.
        }

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
    
    // Update block options based on the program loaded
    updateBlockTermOptions('course', target_program); 
    
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
 * 6. Sessions Tab - Placeholder Functions
 *******************************************************/

// Placeholder functions for sections not fully provided in the prompt's context but referenced in initSession/loadSectionData
function loadScheduledSessions() {
    console.log("Loading scheduled sessions...");
    $('sessions-table').innerHTML = '<tr><td colspan="7">Loading sessions...</td></tr>';
    // Logic to fetch and render sessions goes here
}

function populateSessionCourseSelects() {
    console.log("Populating session course selects...");
    // Logic to fetch courses and populate session course dropdowns goes here
}

function handleAddSession(e) {
    e.preventDefault();
    console.log("Handling add session form submission...");
    // Logic to add a new session goes here
}

/*******************************************************
 * 7. Attendance Tab - Placeholder Functions
 *******************************************************/

function loadAttendance() {
    console.log("Loading attendance records...");
    $('attendance-table').innerHTML = '<tr><td colspan="7">Loading attendance...</td></tr>';
    // Logic to fetch and render attendance logs goes here
}

function populateAttendanceSelects() {
    console.log("Populating attendance filter selects...");
    // Logic to populate filter dropdowns goes here
}

function toggleAttendanceFields() {
    const type = $('att_session_type')?.value;
    const courseBlock = $('att_course_block');
    const clinicalBlock = $('att_clinical_block');

    if (courseBlock) courseBlock.style.display = (type === 'Course' ? 'block' : 'none');
    if (clinicalBlock) clinicalBlock.style.display = (type === 'Clinical' ? 'block' : 'none');
}

function handleManualAttendance(e) {
    e.preventDefault();
    console.log("Handling manual attendance form submission...");
    // Logic to manually log attendance goes here
}

/*******************************************************
 * 8. Exams/Cats Tab - Placeholder Functions
 *******************************************************/

function loadExams() {
    console.log("Loading exams/cats records...");
    $('exams-table').innerHTML = '<tr><td colspan="7">Loading exams...</td></tr>';
    // Logic to fetch and render exams goes here
}

function populateExamCourseSelects(courses = []) {
    console.log("Populating exam course selects...");
    // Logic to populate exam course dropdowns goes here
}

function filterCoursesByProgram() {
    console.log("Filtering courses by program for exam form...");
    // Logic to filter course list based on program goes here
}

function handleAddExam(e) {
    e.preventDefault();
    console.log("Handling add exam form submission...");
    // Logic to add a new exam/CAT goes here
}

/*******************************************************
 * 9. Messages Tab - Placeholder Functions
 *******************************************************/

function loadMessages() {
    console.log("Loading messages...");
    $('messages-list').innerHTML = '<p>Loading message history...</p>';
    // Logic to load message history goes here
}

function handleSendMessage(e) {
    e.preventDefault();
    console.log("Handling send message form submission...");
    // Logic to send a new message goes here
}

/*******************************************************
 * 10. Other Tabs - Placeholder Functions
 *******************************************************/

function renderFullCalendar() {
    console.log("Rendering Full Calendar...");
    $('calendar-container').innerHTML = '<p>Calendar component rendering...</p>';
    // Logic to render the full calendar (using a library like FullCalendar) goes here
}

function loadResources() {
    console.log("Loading resources...");
    $('resources-list').innerHTML = '<p>Loading resource list...</p>';
    // Logic to fetch and render resource files goes here
}

function loadBackupHistory() {
    console.log("Loading backup history...");
    $('backup-history').innerHTML = '<p>Loading backup history list...</p>';
    // Logic to fetch and render backup history goes here
}


// Start the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initSession);
