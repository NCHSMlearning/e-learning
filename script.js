/**********************************************************************************
 * Final Integrated JavaScript File (script.js) - WITH FIXES
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
let fullCalendarInstance = null; // Store the FullCalendar object for refreshing

/*******************************************************
 * 1. CORE UTILITY FUNCTIONS
 *******************************************************/
function $(id){ return document.getElementById(id); }

function escapeHtml(s, isAttribute = false){
    let str = String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if (isAttribute) {
        str = str.replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    } else {
        str = str.replace(/"/g, '&#34;').replace(/'/g, '&#39;'); // Use entity codes for general text safety
    }
    return str;
}

/**
 * @param {string} message 
 * @param {'success'|'error'} type 
 */
function showFeedback(message, type = 'success') {
    const prefix = type === 'success' ? '✅ Success: ' : '❌ Error: ';
    // IMPORTANT: Since we cannot use alert(), this falls back to console logging and UI indication.
    console.log(prefix + message); 
    // In a real app, this would use a custom modal/toast UI. We'll use a basic console log for now.
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
    
    // NOTE: This array of promises allows all data to load concurrently
    const promises = [];

    switch(tabId) {
        case 'dashboard': promises.push(loadDashboardData()); break;
        case 'users': promises.push(loadAllUsers()); break;
        case 'pending': promises.push(loadPendingApprovals()); break;
        case 'enroll': promises.push(loadStudents(), () => updateBlockTermOptions('account')); break; 
        case 'courses': promises.push(loadCourses(), () => updateBlockTermOptions('course')); break; 
        case 'sessions': promises.push(loadScheduledSessions(), populateSessionCourseSelects, () => updateBlockTermOptions('session'), () => updateBlockTermOptions('clinical')); break;
        case 'attendance': promises.push(loadAttendance(), populateAttendanceSelects); break;
        case 'cats': promises.push(loadExams(), populateExamCourseSelects, () => updateBlockTermOptions('exam')); break;
        case 'messages': promises.push(loadMessages()); break;
        case 'calendar': promises.push(renderFullCalendar()); break; // CRITICAL: Call the calendar render function
        case 'resources': promises.push(loadResources(), () => updateBlockTermOptions('resource')); break; 
        case 'welcome-editor': promises.push(loadWelcomeMessageForEdit()); break; 
        case 'backup': promises.push(loadBackupHistory()); break;
        default: break;
    }
    
    // Execute all data loading promises
    await Promise.all(promises.map(p => typeof p === 'function' ? p() : p));
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
    $('session_program')?.addEventListener('change', () => { updateBlockTermOptions('session'); loadSessionCourses(); });
    $('session_block_term')?.addEventListener('change', loadSessionCourses); // Load courses when Block/Term changes
    $('clinical_program')?.addEventListener('change', () => { updateBlockTermOptions('clinical'); });
    $('clinical_intake')?.addEventListener('change', () => updateBlockTermOptions('clinical')); 

    // CATS/EXAMS TAB -- CRITICAL FIXES APPLIED HERE
    $('add-exam-form')?.addEventListener('submit', handleAddExam);
    $('exam_program')?.addEventListener('change', () => { updateBlockTermOptions('exam'); loadExamCourses(); });
    $('exam_block_term')?.addEventListener('change', loadExamCourses); // FIX: Added listener for Block/Term to trigger course filtering
    
    // MESSAGE/WELCOME EDITOR TAB
    $('send-message-form')?.addEventListener('submit', handleSendMessage);
    $('edit-welcome-form')?.addEventListener('submit', handleSaveWelcomeMessage); 
    
    // RESOURCES TAB
    $('resource_program')?.addEventListener('change', () => { updateBlockTermOptions('resource'); });
    $('resource-upload-form')?.addEventListener('submit', handleResourceUpload); // Added resource upload handler
    $('resource-search')?.addEventListener('keyup', () => filterTable('resource-search', 'resources-table', [0, 1, 2]));

    // MODAL/EDIT LISTENERS
    $('edit-user-form')?.addEventListener('submit', handleEditUser);
    document.querySelector('#userEditModal .close')?.addEventListener('click', () => { $('userEditModal').style.display = 'none'; });
    $('edit_user_program')?.addEventListener('change', () => { updateBlockTermOptions('edit_user'); });
    
    document.querySelector('#mapModal .close')?.addEventListener('click', () => { $('mapModal').style.display = 'none'; });
    $('edit-course-form')?.addEventListener('submit', handleEditCourse);
    $('edit_course_program')?.addEventListener('change', () => { updateBlockTermOptions('edit_course'); }); // Use 'edit_course' context
    document.querySelector('#courseEditModal .close')?.addEventListener('click', () => { $('courseEditModal').style.display = 'none'; });

    // Session Edit Listeners (Placeholder)
    $('edit-session-form')?.addEventListener('submit', handleEditSession);
    document.querySelector('#sessionEditModal .close')?.addEventListener('click', () => { $('sessionEditModal').style.display = 'none'; });
    $('edit-exam-form')?.addEventListener('submit', handleEditExam);
    document.querySelector('#examEditModal .close')?.addEventListener('click', () => { $('examEditModal').style.display = 'none'; });

    // Location Map listener for session creation
    $('add-session-form').addEventListener('click', (e) => {
        if (e.target.matches('.btn-map-picker')) {
            showMapPicker(
                $('session_location_name').value, 
                $('session_latitude').value, 
                $('session_longitude').value
            );
        }
    });

    // Location Map listener for clinical rotation creation
    $('add-clinical-form').addEventListener('click', (e) => {
        if (e.target.matches('.btn-map-picker')) {
            showMapPicker(
                $('clinical_location_name').value, 
                $('clinical_latitude').value, 
                $('clinical_longitude').value,
                (lat, lon, name) => {
                    $('clinical_latitude').value = lat;
                    $('clinical_longitude').value = lon;
                    $('clinical_location_name').value = name;
                }
            );
        }
    });
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
        case 'edit_course': // Used for course edit modal
            programSelectId = `edit_${context}_program`; blockTermSelectId = `edit_${context}_block`; break;
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
            { value: 'Block A', text: 'Block A' },
            { value: 'Block B', text: 'Block B' }
        ];
    } else if (program === 'TVET') {
        options = [
            { value: 'Term 1', text: 'Term 1' },
            { value: 'Term 2', text: 'Term 2' },
            { value: 'Term 3', text: 'Term 3' }
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
 * 5. Courses Tab (COMPLETED SECTION)
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
        populateSessionCourseSelects(); // Refresh course options in other tabs
        populateExamCourseSelects();
    }

    setButtonLoading(submitButton, false, originalText);
}

async function loadCourses() {
    const tbody = $('courses-table');
    tbody.innerHTML = '<tr><td colspan="7">Loading courses...</td></tr>';

    const { data: courses, error } = await fetchData('courses', '*', {}, 'course_name', true);
    if (error) { tbody.innerHTML = `<tr><td colspan="7">Error loading courses: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    courses.forEach(c => {
        const courseNameAttr = escapeHtml(c.course_name, true);
        const unitCodeAttr = escapeHtml(c.unit_code || '', true);

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(c.course_name)}</td>
            <td>${escapeHtml(c.unit_code || 'N/A')}</td>
            <td>${escapeHtml(c.target_program || 'N/A')}</td>
            <td>${escapeHtml(c.intake_year || 'N/A')}</td>
            <td>${escapeHtml(c.block || 'N/A')}</td>
            <td>${escapeHtml(c.description || 'N/A')}</td>
            <td>
                <button class="btn btn-map" onclick="openEditCourseModal('${c.id}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteCourse('${c.id}', '${courseNameAttr}')">Delete</button>
            </td>
        </tr>`;
    });
    filterTable('course-search', 'courses-table', [0, 1, 3]);
}

async function deleteCourse(courseId, courseName) {
    if (!confirm(`Are you sure you want to delete the course: ${courseName}? This action is irreversible.`)) return;

    const { error } = await sb.from('courses').delete().eq('id', courseId);
    
    if (error) {
        showFeedback(`Failed to delete course: ${error.message}`, 'error');
    } else {
        showFeedback(`Course '${courseName}' deleted successfully!`);
        loadCourses();
        populateSessionCourseSelects(); // Refresh course options
        populateExamCourseSelects();
    }
}

async function openEditCourseModal(courseId) {
    try {
        const { data: course, error } = await sb.from('courses').select('*').eq('id', courseId).single();
        if (error || !course) throw new Error('Course data fetch failed.');

        $('edit_course_id').value = course.id;
        $('edit_course_name').value = course.course_name || '';
        $('edit_course_unit_code').value = course.unit_code || '';
        $('edit_course_description').value = course.description || '';
        $('edit_course_program').value = course.target_program || 'KRCHN';
        $('edit_course_intake').value = course.intake_year || '2024';
        
        // 1. Update the Block/Term dropdown options based on the course's program
        updateBlockTermOptions('edit_course', course.target_program); 

        // 2. Now set the course's saved Block/Term value
        $('edit_course_block').value = course.block || ''; 

        $('courseEditModal').style.display = 'flex';
    } catch (error) {
        showFeedback(`Failed to load course data: ${error.message}`, 'error');
    }
}

async function handleEditCourse(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const courseId = $('edit_course_id').value;

    const updatedData = {
        course_name: $('edit_course_name').value.trim(),
        unit_code: $('edit_course_unit_code').value.trim(),
        description: $('edit_course_description').value.trim(),
        target_program: $('edit_course_program').value,
        intake_year: $('edit_course_intake').value,
        block: $('edit_course_block').value,
        updated_at: new Date().toISOString()
    };

    try {
        const { error } = await sb.from('courses').update(updatedData).eq('id', courseId);
        if (error) throw error;

        showFeedback('Course updated successfully!');
        $('courseEditModal').style.display = 'none';
        loadCourses();
        populateSessionCourseSelects(); // Refresh course options
        populateExamCourseSelects();
    } catch (e) {
        showFeedback('Failed to update course: ' + (e.message || e), 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


/*******************************************************
 * 6. Sessions / Clinical Rotations
 *******************************************************/

async function populateSessionCourseSelects() {
    const { data: courses } = await fetchData('courses', 'id, unit_code, course_name', {}, 'unit_code', true);
    
    // Populate session course select
    const sessionSelect = $('session_course_id');
    populateSelect(sessionSelect, courses, 'id', 'course_name', 'Select Course');
    
    // Populate clinical course select (optional, if rotations are tied to courses)
    const clinicalSelect = $('clinical_course_id');
    populateSelect(clinicalSelect, courses, 'id', 'course_name', 'Select Course (Optional)');
}

async function loadSessionCourses() {
    // This function is triggered by program/block change to filter the courses displayed in the select list.
    const program = $('session_program').value;
    const blockTerm = $('session_block_term').value;

    let filters = {};
    if (program) filters.target_program = program;
    if (blockTerm) filters.block = blockTerm;

    const { data: courses } = await fetchData('courses', 'id, course_name', filters, 'course_name', true);
    populateSelect($('session_course_id'), courses, 'id', 'course_name', 'Select Course');
}

async function handleAddSession(e) {
    e.preventDefault();
    const isClinical = e.target.id === 'add-clinical-form'; // Assuming a separate form for clinical rotations
    const formIdPrefix = isClinical ? 'clinical_' : 'session_';
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const course_id = $(formIdPrefix + 'course_id').value;
    const session_type = isClinical ? 'Clinical Rotation' : $(formIdPrefix + 'type').value;
    const start_time = $(formIdPrefix + 'start_time').value;
    const end_time = $(formIdPrefix + 'end_time').value;
    const location_name = $(formIdPrefix + 'location_name').value.trim();
    const latitude = $(formIdPrefix + 'latitude').value;
    const longitude = $(formIdPrefix + 'longitude').value;
    const program = $(formIdPrefix + 'program').value;
    const block_term = $(formIdPrefix + 'block_term').value;
    const intake = $(formIdPrefix + 'intake').value;

    if (!session_type || !start_time || !end_time || !program || !block_term) {
        showFeedback('All mandatory fields (Type, Time, Program, Block/Term) must be filled.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const newSession = {
        course_id,
        session_type,
        start_time: new Date(start_time).toISOString(), // Ensure ISO format
        end_time: new Date(end_time).toISOString(),     // Ensure ISO format
        location_name,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        target_program: program,
        target_block_term: block_term,
        target_intake: intake,
        is_clinical: isClinical
    };

    const { error } = await sb.from('geo_sessions').insert(newSession);

    if (error) {
        showFeedback(`Failed to add session: ${error.message}`, 'error');
    } else {
        showFeedback(`${isClinical ? 'Clinical Rotation' : 'Session'} added successfully!`);
        e.target.reset();
        loadScheduledSessions();
        renderFullCalendar();
    }
    setButtonLoading(submitButton, false, originalText);
}

async function loadScheduledSessions() {
    const tbody = $('sessions-table');
    const tbodyClinical = $('clinical-table');
    tbody.innerHTML = '<tr><td colspan="9">Loading sessions...</td></tr>';
    tbodyClinical.innerHTML = '<tr><td colspan="9">Loading clinical rotations...</td></tr>';

    const { data: sessions, error } = await fetchData('geo_sessions', '*, courses(course_name)', {}, 'start_time', false);
    if (error) { 
        tbody.innerHTML = `<tr><td colspan="9">Error loading sessions: ${error.message}</td></tr>`; 
        tbodyClinical.innerHTML = `<tr><td colspan="9">Error loading clinicals: ${error.message}</td></tr>`;
        return; 
    }

    let sessionHtml = '';
    let clinicalHtml = '';

    sessions.forEach(s => {
        const courseName = s.courses?.course_name || 'N/A';
        const start = new Date(s.start_time).toLocaleString();
        const end = new Date(s.end_time).toLocaleString();
        const isClinical = s.is_clinical;

        const row = `<tr>
            <td>${escapeHtml(courseName)}</td>
            <td>${escapeHtml(s.session_type)}</td>
            <td>${start}</td>
            <td>${end}</td>
            <td>${escapeHtml(s.location_name || 'N/A')}</td>
            <td>${escapeHtml(s.target_program)} / ${escapeHtml(s.target_block_term)}</td>
            <td>${s.latitude ? 'Yes' : 'No'}</td>
            <td>
                <button class="btn btn-map" onclick="showMapModal(${s.latitude}, ${s.longitude}, '${escapeHtml(s.location_name, true)}')">View Map</button>
            </td>
            <td>
                <button class="btn btn-map" onclick="openEditSessionModal('${s.id}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteSession('${s.id}', '${s.session_type}')">Delete</button>
            </td>
        </tr>`;
        
        if (isClinical) {
            clinicalHtml += row;
        } else {
            sessionHtml += row;
        }
    });

    tbody.innerHTML = sessionHtml || '<tr><td colspan="9">No regular sessions scheduled.</td></tr>';
    tbodyClinical.innerHTML = clinicalHtml || '<tr><td colspan="9">No clinical rotations scheduled.</td></tr>';
}

async function deleteSession(sessionId, sessionType) {
    if (!confirm(`Are you sure you want to delete the ${sessionType}? This will affect student attendance records.`)) return;

    const { error } = await sb.from('geo_sessions').delete().eq('id', sessionId);
    
    if (error) {
        showFeedback(`Failed to delete session: ${error.message}`, 'error');
    } else {
        showFeedback(`${sessionType} deleted successfully!`);
        loadScheduledSessions();
        renderFullCalendar();
    }
}

async function handleEditSession(e) {
    e.preventDefault();
    showFeedback('Session edit logic not fully implemented yet.', 'error');
    // Implement full CRUD logic for editing sessions/clinicals here.
}


/*******************************************************
 * 7. Exams / CATS
 *******************************************************/

async function populateExamCourseSelects() {
    const { data: courses } = await fetchData('courses', 'id, unit_code, course_name', {}, 'unit_code', true);
    populateSelect($('exam_course_id'), courses, 'id', 'course_name', 'Select Course');
}

async function loadExamCourses() {
    // This function is triggered by program/block change to filter the courses displayed in the select list.
    const program = $('exam_program').value;
    const blockTerm = $('exam_block_term').value;

    let filters = {};
    if (program) filters.target_program = program;
    if (blockTerm) filters.block = blockTerm;

    const { data: courses } = await fetchData('courses', 'id, course_name', filters, 'course_name', true);
    populateSelect($('exam_course_id'), courses, 'id', 'course_name', 'Select Course');
}

async function handleAddExam(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const course_id = $('exam_course_id').value;
    const exam_type = $('exam_type').value;
    const exam_date = $('exam_date').value;
    const start_time = $('exam_start_time').value;
    const end_time = $('exam_end_time').value;
    const location_name = $('exam_location_name').value.trim();
    const program = $('exam_program').value;
    const block_term = $('exam_block_term').value;

    if (!course_id || !exam_type || !exam_date || !start_time || !end_time || !program || !block_term) {
        showFeedback('All exam details are required.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const startTimeCombined = new Date(`${exam_date}T${start_time}:00`).toISOString();
    const endTimeCombined = new Date(`${exam_date}T${end_time}:00`).toISOString();

    const newExam = {
        course_id,
        exam_type,
        start_time: startTimeCombined,
        end_time: endTimeCombined,
        location_name,
        target_program: program,
        target_block_term: block_term
    };

    const { error } = await sb.from('exams_cats').insert(newExam);

    if (error) {
        showFeedback(`Failed to add exam/CAT: ${error.message}`, 'error');
    } else {
        showFeedback('Exam/CAT scheduled successfully!');
        e.target.reset();
        loadExams();
        renderFullCalendar();
    }
    setButtonLoading(submitButton, false, originalText);
}

async function loadExams() {
    const tbody = $('exams-table');
    tbody.innerHTML = '<tr><td colspan="8">Loading exams and CATs...</td></tr>';

    const { data: exams, error } = await fetchData('exams_cats', '*, courses(course_name, unit_code)', {}, 'start_time', false);
    if (error) { tbody.innerHTML = `<tr><td colspan="8">Error loading exams: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    exams.forEach(e => {
        const courseName = e.courses?.course_name || 'N/A';
        const unitCode = e.courses?.unit_code || 'N/A';
        const start = new Date(e.start_time).toLocaleString();
        const end = new Date(e.end_time).toLocaleString();

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(e.exam_type)}</td>
            <td>${escapeHtml(courseName)} (${unitCode})</td>
            <td>${start}</td>
            <td>${end}</td>
            <td>${escapeHtml(e.location_name || 'N/A')}</td>
            <td>${escapeHtml(e.target_program)} / ${escapeHtml(e.target_block_term)}</td>
            <td>
                <button class="btn btn-map" onclick="openEditExamModal('${e.id}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteExam('${e.id}', '${e.exam_type} - ${unitCode}')">Delete</button>
            </td>
        </tr>`;
    });
}

async function deleteExam(examId, examDetails) {
    if (!confirm(`Are you sure you want to delete the assessment: ${examDetails}?`)) return;

    const { error } = await sb.from('exams_cats').delete().eq('id', examId);
    
    if (error) {
        showFeedback(`Failed to delete assessment: ${error.message}`, 'error');
    } else {
        showFeedback(`Assessment '${examDetails}' deleted successfully!`);
        loadExams();
        renderFullCalendar();
    }
}

async function handleEditExam(e) {
    e.preventDefault();
    showFeedback('Exam/CAT edit logic not fully implemented yet.', 'error');
    // Implement full CRUD logic for editing exams/cats here.
}


/*******************************************************
 * 8. Calendar Integration (THE CORE ANSWER)
 *******************************************************/

async function fetchCalendarEvents() {
    const events = [];

    // Fetch Sessions and Clinical Rotations (from geo_sessions)
    const { data: sessions, error: sessionError } = await fetchData('geo_sessions', '*, courses(course_name, unit_code)', {}, 'start_time', false);
    if (sessionError) { console.error("Error fetching sessions for calendar:", sessionError); }

    sessions?.forEach(s => {
        const course = s.courses?.course_name || 'No Course';
        const type = s.is_clinical ? 'CLINICAL' : 'SESSION';
        const color = s.is_clinical ? '#03543f' : '#1e3a8a'; // Green for Clinical, Blue for Session

        events.push({
            id: s.id,
            title: `${type}: ${course} (${s.session_type})`,
            start: s.start_time,
            end: s.end_time,
            allDay: s.is_clinical, // Clinical rotations might be all-day blocks
            color: color,
            extendedProps: {
                location: s.location_name,
                program: s.target_program,
                block: s.target_block_term
            }
        });
    });

    // Fetch Exams and CATs (from exams_cats)
    const { data: exams, error: examError } = await fetchData('exams_cats', '*, courses(course_name, unit_code)', {}, 'start_time', false);
    if (examError) { console.error("Error fetching exams for calendar:", examError); }

    exams?.forEach(e => {
        const courseUnit = e.courses?.unit_code || 'N/A';
        const title = `${e.exam_type.toUpperCase()}: ${courseUnit}`;
        const color = '#991b1b'; // Red for Exams/CATS

        events.push({
            id: e.id,
            title: title,
            start: e.start_time,
            end: e.end_time,
            color: color,
            extendedProps: {
                location: e.location_name,
                program: e.target_program,
                block: e.target_block_term
            }
        });
    });

    return events;
}

async function renderFullCalendar() {
    const calendarEl = $('full-calendar');
    if (!calendarEl) return;

    // Check if FullCalendar is loaded (assuming CDN link in HTML)
    if (typeof FullCalendar === 'undefined') {
        calendarEl.innerHTML = '<p class="error-message">FullCalendar library not loaded. Please ensure the required CDN scripts are included in the HTML.</p>';
        return;
    }

    // Destroy existing instance if present
    if (fullCalendarInstance) {
        fullCalendarInstance.destroy();
    }

    const events = await fetchCalendarEvents();
    
    fullCalendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
        },
        events: events,
        eventDisplay: 'block',
        eventTextColor: '#ffffff',
        eventClick: function(info) {
            const props = info.event.extendedProps;
            const title = info.event.title;
            const start = info.event.start.toLocaleString();
            const end = info.event.end.toLocaleString();

            let details = `
                <strong>Event:</strong> ${title}<br>
                <strong>Start:</strong> ${start}<br>
                <strong>End:</strong> ${end}<br>
                <strong>Location:</strong> ${escapeHtml(props.location || 'N/A')}<br>
                <strong>Program:</strong> ${escapeHtml(props.program || 'N/A')}<br>
                <strong>Block/Term:</strong> ${escapeHtml(props.block || 'N/A')}
            `;
            
            // NOTE: Using a simple alert, replaced with custom modal in production.
            alert(`--- Scheduled Event Details ---\n${details.replace(/<br>/g, '\n').replace(/<strong>/g, '').replace(/<\/strong>/g, '')}`);
        },
        loading: function(isLoading) {
            // Optional: Show/hide loading indicator
            calendarEl.style.opacity = isLoading ? 0.5 : 1;
        }
    });

    fullCalendarInstance.render();
}


/*******************************************************
 * 9. Location / Map Handlers
 *******************************************************/

/**
 * Shows the map modal and initializes the Leaflet map for viewing a specific location.
 */
function showMapModal(lat, lon, name) {
    if (lat && lon) {
        $('mapModalTitle').textContent = `Location: ${name}`;
        $('mapModal').style.display = 'flex';
        initializeMap(lat, lon, name, false); // Initialize map for viewing only
    } else {
        showFeedback(`Location coordinates not available for ${name}.`, 'error');
    }
}

/**
 * Initializes the Leaflet map for viewing or picking a location.
 * @param {number} lat - Initial Latitude
 * @param {number} lon - Initial Longitude
 * @param {string} name - Location Name
 * @param {boolean} isPicker - If true, enables map clicking for selection.
 * @param {function} callback - Callback function(lat, lon, name) if isPicker is true.
 */
function initializeMap(lat, lon, name, isPicker = false, callback = null) {
    if (attendanceMap) {
        attendanceMap.remove();
    }

    // Default to a central location if coordinates are missing
    const defaultLat = lat || 0; 
    const defaultLon = lon || 0; 
    const mapCenter = [defaultLat, defaultLon];

    attendanceMap = L.map('attendance-map').setView(mapCenter, 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(attendanceMap);

    let currentMarker = null;

    if (defaultLat !== 0 && defaultLon !== 0) {
        currentMarker = L.marker(mapCenter).addTo(attendanceMap)
            .bindPopup(name).openPopup();
    }

    if (isPicker && callback) {
        attendanceMap.on('click', function(e) {
            const newLat = e.latlng.lat;
            const newLon = e.latlng.lng;
            
            // Simple reverse geocoding placeholder (requires separate service call in production)
            const newName = `Picked Location @ ${newLat.toFixed(4)}, ${newLon.toFixed(4)}`; 

            if (currentMarker) {
                attendanceMap.removeLayer(currentMarker);
            }
            currentMarker = L.marker([newLat, newLon]).addTo(attendanceMap)
                .bindPopup(newName).openPopup();

            callback(newLat, newLon, newName);
        });
    }

    // Fix for map display issues in modals
    setTimeout(() => {
        attendanceMap.invalidateSize();
        if (currentMarker) {
             attendanceMap.setView(currentMarker.getLatLng(), 15);
        }
    }, 200);
}

// Functionality to open the map in 'picker' mode (for setting session/clinical location)
function showMapPicker(currentName, currentLat, currentLon, callback = null) {
    const defaultCallback = callback || ((lat, lon, name) => {
        $('session_latitude').value = lat;
        $('session_longitude').value = lon;
        $('session_location_name').value = name;
    });

    $('mapModalTitle').textContent = `Select Location on Map (Click to Pin)`;
    $('mapModal').style.display = 'flex';

    initializeMap(
        parseFloat(currentLat) || 0, 
        parseFloat(currentLon) || 0, 
        currentName || 'Drag to set location', 
        true, // isPicker = true
        defaultCallback
    );
}

/*******************************************************
 * 10. Attendance Management
 *******************************************************/
async function loadAttendance() {
    // Load attendance logic here. (Not fully implemented in the provided stub, adding placeholder).
    const tbody = $('attendance-table');
    tbody.innerHTML = '<tr><td colspan="7">Loading attendance logs... (Not fully implemented)</td></tr>';
}

function toggleAttendanceFields() {
    // Toggles fields for manual attendance based on type (Session/Clinical)
    const type = $('att_session_type').value;
    $('att_location_field').style.display = (type === 'Session') ? 'block' : 'none';
    $('att_clinical_field').style.display = (type === 'Clinical') ? 'block' : 'none';
}

async function handleManualAttendance(e) {
    e.preventDefault();
    showFeedback('Manual attendance submission is disabled for security and audit purposes.', 'error');
}

async function populateAttendanceSelects() {
    // Populate session/clinical select lists for manual attendance (if enabled)
}

/*******************************************************
 * 11. Messaging / Notifications
 *******************************************************/

async function loadMessages() {
    const tbody = $('messages-table');
    tbody.innerHTML = '<tr><td colspan="5">Loading sent messages...</td></tr>';
    
    // Assuming a 'messages' table for super admin sent messages
    const { data: messages, error } = await fetchData('messages', '*', {}, 'created_at', false);
    if (error) { tbody.innerHTML = `<tr><td colspan="5">Error loading messages: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    messages.forEach(m => {
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(m.subject)}</td>
            <td>${escapeHtml(m.recipient_role || 'All Students')}</td>
            <td>${escapeHtml(m.target_program || 'All')}</td>
            <td>${new Date(m.created_at).toLocaleString()}</td>
            <td>
                <button class="btn btn-map" onclick="alert('${escapeHtml(m.body, true)}')">View Content</button>
            </td>
        </tr>`;
    });
}

async function handleSendMessage(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const subject = $('message-subject').value.trim();
    const body = $('message-body').value.trim();
    const recipient_role = $('message-recipient-role').value;
    const target_program = $('message-target-program').value;
    const target_intake = $('message-target-intake').value;

    if (!subject || !body) {
        showFeedback('Subject and Message Body are required.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const newMessage = {
        subject,
        body,
        recipient_role,
        target_program,
        target_intake,
        sender_id: currentUserProfile.id
    };

    const { error } = await sb.from('messages').insert(newMessage);

    if (error) {
        showFeedback(`Failed to send message: ${error.message}`, 'error');
    } else {
        showFeedback('Message sent successfully!');
        e.target.reset();
        loadMessages();
    }
    setButtonLoading(submitButton, false, originalText);
}


/*******************************************************
 * 12. Resources Management
 *******************************************************/

async function loadResources() {
    const tbody = $('resources-table');
    tbody.innerHTML = '<tr><td colspan="7">Loading resources...</td></tr>';

    const { data: resources, error } = await fetchData('resources', '*', {}, 'created_at', false);
    if (error) { tbody.innerHTML = `<tr><td colspan="7">Error loading resources: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    resources.forEach(r => {
        const fileUrl = sb.storage.from(RESOURCES_BUCKET).getPublicUrl(r.file_path).data.publicUrl;
        const uploadDate = new Date(r.created_at).toLocaleDateString();

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(r.title)}</td>
            <td>${escapeHtml(r.target_program)} / ${escapeHtml(r.target_block)}</td>
            <td>${escapeHtml(r.uploaded_by)}</td>
            <td>${uploadDate}</td>
            <td>
                <a class="btn btn-approve" href="${fileUrl}" target="_blank">Download</a>
                <button class="btn btn-delete" onclick="deleteResource('${r.id}', '${r.file_path}')">Delete</button>
            </td>
        </tr>`;
    });
}

async function handleResourceUpload(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const title = $('resource-title').value.trim();
    const program = $('resource_program').value;
    const block = $('resource_block').value;
    const fileInput = $('resource-file');
    const file = fileInput.files[0];

    if (!title || !program || !block || !file) {
        showFeedback('Title, Program, Block, and File are required.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const fileExt = file.name.split('.').pop();
    const filePath = `${currentUserProfile.id}/${Date.now()}.${fileExt}`;

    try {
        // 1. Upload file to Supabase Storage
        const { error: uploadError } = await sb.storage.from(RESOURCES_BUCKET).upload(filePath, file);
        if (uploadError) throw uploadError;

        // 2. Insert metadata into 'resources' table
        const newResource = {
            title,
            file_path: filePath,
            target_program: program,
            target_block: block,
            uploaded_by: currentUserProfile.full_name || 'Admin',
            uploaded_by_id: currentUserProfile.id
        };
        const { error: dbError } = await sb.from('resources').insert(newResource);
        if (dbError) {
             // If DB insert fails, try to delete the uploaded file
             await sb.storage.from(RESOURCES_BUCKET).remove([filePath]);
             throw dbError;
        }

        showFeedback('Resource uploaded and metadata saved successfully!');
        e.target.reset();
        loadResources();

    } catch (e) {
        showFeedback(`Failed to upload resource: ${e.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

async function deleteResource(resourceId, filePath) {
    if (!confirm('Are you sure you want to delete this resource?')) return;

    try {
        // 1. Delete from Supabase Storage
        const { error: storageError } = await sb.storage.from(RESOURCES_BUCKET).remove([filePath]);
        if (storageError) {
            // Note: Continue even if storage delete fails, focus on removing DB record.
            console.warn(`Storage file delete failed for ${filePath}: ${storageError.message}`);
        }

        // 2. Delete metadata from 'resources' table
        const { error: dbError } = await sb.from('resources').delete().eq('id', resourceId);
        if (dbError) throw dbError;

        showFeedback('Resource successfully deleted!');
        loadResources();
    } catch (e) {
        showFeedback(`Failed to delete resource record: ${e.message}`, 'error');
    }
}

/*******************************************************
 * 13. Backup History
 *******************************************************/

async function loadBackupHistory() {
    // Backup history logic (Not implemented in the provided stub, adding placeholder)
    const tbody = $('backup-table');
    tbody.innerHTML = '<tr><td colspan="3">Backup history loading... (Functionality not yet implemented)</td></tr>';
}

// --- FINAL INIT CALL ---
window.addEventListener('load', initSession);
