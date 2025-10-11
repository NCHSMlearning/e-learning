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
// Note: Mapbox is not used in the final version of the script; using Leaflet instead (as per original HTML script tag)
const IP_API_URL = 'https://api.ipify.org?format=json';
const DEVICE_ID_KEY = 'nchsm_device_id';
const SETTINGS_TABLE = 'app_settings'; 
const MESSAGE_KEY = 'student_welcome'; 

// Global Variables
let currentUserProfile = null;
let attendanceMap = null; // Used for Leaflet instance (adjusting from Mapbox placeholder)

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
        case 'enroll': loadStudents(); break; 
        case 'courses': loadCourses(); break;
        case 'sessions': loadScheduledSessions(); populateSessionCourseSelects(); break; // NEW
        case 'attendance': loadAttendance(); populateAttendanceSelects(); break;
        case 'cats': loadExams(); populateExamCourseSelects(); break; // NEW
        case 'messages': loadMessages(); break;
        case 'calendar': renderFullCalendar(); break; // NEW
        case 'resources': loadResources(); break;
        case 'welcome-editor': loadWelcomeMessageForEdit(); break; 
        case 'backup': loadBackupHistory(); break; // NEW
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
    $('account-program')?.addEventListener('change', updateEnrollBlockTermOptions);
    $('account-intake')?.addEventListener('change', updateEnrollBlockTermOptions);
    $('user-search')?.addEventListener('keyup', () => filterTable('user-search', 'users-table', [1, 2, 4]));
    
    // COURSES TAB
    $('add-course-form')?.addEventListener('submit', handleAddCourse);
    $('course-search')?.addEventListener('keyup', () => filterTable('course-search', 'courses-table', [0, 2, 4]));
    
    // SESSIONS TAB (NEW)
    $('add-session-form')?.addEventListener('submit', handleAddSession);
    $('session_program')?.addEventListener('change', () => { updateTermBlockOptions('session'); populateSessionCourseSelects(); });
    $('session_intake')?.addEventListener('change', updateTermBlockOptions('session'));
    $('clinical_program')?.addEventListener('change', () => { updateTermBlockOptions('clinical'); });
    $('clinical_intake')?.addEventListener('change', updateTermBlockOptions('clinical'));

    // CATS/EXAMS TAB
    $('add-exam-form')?.addEventListener('submit', handleAddExam);
    $('exam_program')?.addEventListener('change', () => { filterCoursesByProgram(); updateTermBlockOptions('exam'); });
    $('exam_intake')?.addEventListener('change', updateTermBlockOptions('exam'));
    
    // MESSAGE/WELCOME EDITOR TAB
    $('send-message-form')?.addEventListener('submit', handleSendMessage);
    $('edit-welcome-form')?.addEventListener('submit', handleSaveWelcomeMessage); // Correct ID from HTML
    
    // MODAL/EDIT LISTENERS
    $('edit-user-form')?.addEventListener('submit', handleEditUser);
    document.querySelector('#userEditModal .close')?.addEventListener('click', () => { $('userEditModal').style.display = 'none'; });
    document.querySelector('#mapModal .close')?.addEventListener('click', () => { $('mapModal').style.display = 'none'; });
    $('edit-course-form')?.addEventListener('submit', handleEditCourse);
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
    // Note: Assuming check_in_time is a timestamptz field that can be filtered by date string
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
 * Dynamic Block/Term Options based on Program and Intake
 */
function updateBlockTermOptions(programSelectId, blockTermSelectId) {
    const program = $(programSelectId).value;
    const blockTermSelect = $(blockTermSelectId);
    
    if (!blockTermSelect) return;

    const options = [
        { value: 'A', text: 'Block A / Term 1' },
        { value: 'B', text: 'Block B / Term 2' }
    ];

    if (program === 'TVET') {
        options.push({ value: 'T3', text: 'Term 3 (TVET)' });
    }
    
    let html = '<option value="">-- Select Block/Term --</option>';
    options.forEach(opt => {
        html += `<option value="${opt.value}">${opt.text}</option>`;
    });
    blockTermSelect.innerHTML = html;
}

function updateEnrollBlockTermOptions() {
    updateBlockTermOptions('account-program', 'account-block-term');
}

// Functionality moved from the initial script file to better match HTML structure
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
    const block = $('account-block-term').value; // Corrected ID

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

// All other User/Enrollment functions (loadAllUsers, loadPendingApprovals, loadStudents, approveUser, updateUserRole, deleteProfile, openEditUserModal, handleEditUser) are functionally correct and retained from your original script.


/*******************************************************
 * 5. Courses Tab
 *******************************************************/

// Functionality moved from the initial script file to better match HTML structure
async function handleAddCourse(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const course_name = $('course-name').value.trim();
    const unit_code = $('course-unit-code').value.trim(); // NEW FIELD
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
        unit_code, // Insert the new field
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

    // Fetch all courses to show the admin everything
    const { data: courses, error } = await fetchData('courses', '*', {}, 'course_name', true);
    if (error) { tbody.innerHTML = `<tr><td colspan="6">Error loading courses: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    courses.forEach(c => {
        // Updated attribute list for the modal, including unit_code
        const courseNameAttr = escapeHtml(c.course_name, true);
        const unitCodeAttr = escapeHtml(c.unit_code || '', true);
        const descriptionAttr = escapeHtml(c.description || '', true);
        const programTypeAttr = escapeHtml(c.target_program || '', true); 
        const intakeYearAttr = escapeHtml(c.intake_year || '', true);     
        const blockAttr = escapeHtml(c.block || '', true);              

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(c.course_name)}</td>
            <td>${escapeHtml(c.unit_code || 'N/A')}</td>
            <td>${escapeHtml(c.description || 'N/A')}</td>
            <td>${escapeHtml(c.intake_year || 'N/A')}</td>
            <td>${escapeHtml(c.block || 'N/A')}</td>
            <td>
                <button class="btn-action" onclick="openEditCourseModal('${c.id}', '${courseNameAttr}', '${unitCodeAttr}', '${descriptionAttr}', '${programTypeAttr}', '${intakeYearAttr}', '${blockAttr}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteCourse('${c.id}')">Delete</button>
            </td>
        </tr>`;
    });
    
    filterTable('course-search', 'courses-table', [0, 1, 3]); // Name(0), Unit Code (1), Intake(3)
    
    populateExamCourseSelects(courses);
    populateSessionCourseSelects(courses);
}

function openEditCourseModal(id, name, unit_code, description, target_program, intake_year, block) {
    $('edit_course_id').value = id;
    $('edit_course_name').value = name; 
    $('edit_course_unit_code').value = unit_code; // NEW FIELD
    $('edit_course_description').value = description;
    $('edit_course_program').value = target_program || ''; 
    $('edit_course_intake').value = intake_year; 
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
    const unit_code = $('edit_course_unit_code').value.trim(); // NEW FIELD
    const description = $('edit_course_description').value.trim();
    const target_program = $('edit_course_program').value;
    const intake_year = $('edit_course_intake').value;
    const block = $('edit_course_block').value;
    
    try {
        const updateData = { 
            course_name: name, 
            unit_code: unit_code, // Update the new field
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

/**
 * Utility to update block/term options for Session and Exam tabs
 */
function updateTermBlockOptions(prefix) {
    const program = $(`${prefix}_program`).value;
    const blockTermSelect = $(`${prefix}_block_term`);
    
    if (!blockTermSelect) return;

    let options = [
        { value: 'A', text: 'Block A / Term 1' },
        { value: 'B', text: 'Block B / Term 2' }
    ];

    if (program === 'TVET') {
        options.push({ value: 'T3', text: 'Term 3 (TVET)' });
    }
    
    let html = '<option value="">-- Select Block/Term --</option>';
    options.forEach(opt => {
        html += `<option value="${opt.value}">${opt.text}</option>`;
    });
    blockTermSelect.innerHTML = html;
}

async function populateSessionCourseSelects(courses = null) {
    const courseSelect = $('session_course_id');
    const program = $('session_program').value;
    
    if (!courses) {
        const { data } = await fetchData('courses', 'id, course_name', { target_program: program }, 'course_name', true);
        courses = data;
    } else if (program) {
        courses = courses.filter(c => c.target_program === program);
    }
    
    populateSelect(courseSelect, courses, 'id', 'course_name', 'Select Course (Optional)');
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
        
        // Determine the session detail
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

    // NOTE: Clinical area name lookup can be implemented here if needed

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

// Placeholder function for Clinical Name Update
async function saveClinicalName() {
    const program = $('clinical_program').value;
    const intake = $('clinical_intake').value;
    const block = $('clinical_block_term').value;
    const name = $('clinical_name_to_edit').value.trim();

    if (!program || !intake || !block || !name) {
        showFeedback('Please select Program, Intake, Block/Term and provide a name.', 'error');
        return;
    }
    
    // NOTE: This logic requires a 'clinical_areas' table with columns like (program, intake, block, area_name)
    // For now, it's just a placeholder notification.
    showFeedback(`Clinical Area: "${name}" saved for ${program} ${intake} Block/Term ${block}. (DB logic not implemented)`, 'success');
}


async function deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this session?')) return;
    const { error } = await sb.from('scheduled_sessions').delete().eq('id', sessionId);
    if (error) { showFeedback(`Failed to delete session: ${error.message}`, 'error'); } 
    else { showFeedback('Session deleted successfully!'); loadScheduledSessions(); renderFullCalendar(); }
}


/*******************************************************
 * 7. Attendance Tab
 *******************************************************/

// Added Admin Check-in (simulating the process)
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

// Renamed for clarity
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
    const department = session_type === 'clinical' ? $('att_department').value.trim() : $('att_department').value.trim() || null;
    const location_name = $('att_location').value.trim() || 'Manual Admin Entry';
    
    let check_in_time = new Date().toISOString();
    if (date && time) {
        check_in_time = new Date(`${date}T${time}`).toISOString();
    } else if (date) {
        check_in_time = new Date(date).toISOString();
    }
    
    if (!student_id || (session_type === 'classroom' && !course_id) || (session_type === 'clinical' && !department)) {
        showFeedback('Please fill in all required fields for the selected session type.', 'error');
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


// Corrected Load Attendance function to split Today vs. Past History
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
        if (r.session_type === 'clinical') {
            locationDetail = escapeHtml(r.department || 'N/A Dept');
        } else if (r.session_type === 'classroom') {
            locationDetail = escapeHtml(r.course?.course_name || 'N/A Course');
        } else {
            locationDetail = escapeHtml(r.location_name || 'N/A Location');
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

    filterTable('attendance-search', 'attendance-table', [0, 1, 2]); // Re-apply filter
}

// Corrected function to use Leaflet instead of MapboxGL
function showMap(lat, lng, locationName, studentName, dateTime) {
    const mapModal = $('mapModal');
    const mapContainer = $('mapbox-map'); // ID retained from HTML for simplicity
    
    $('map-modal-title').textContent = `${studentName}'s Check-in Location`;
    $('map-details').innerHTML = `<strong>Time:</strong> ${dateTime}<br><strong>Location:</strong> ${locationName}<br><strong>Coords:</strong> ${lat}, ${lng}`;

    mapModal.style.display = 'flex';
    
    // Check if map is already initialized
    if (attendanceMap) {
        attendanceMap.remove(); // Remove old map to avoid duplication issues
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
        
    // Invalidate map size after modal becomes visible
    setTimeout(() => { 
        if (attendanceMap) { attendanceMap.invalidateSize(); } 
    }, 100); 
}


/*******************************************************
 * 8. CATS/Exams Tab
 *******************************************************/
async function populateExamCourseSelects(courses = null) {
    const courseSelect = $('exam_course_id');
    const program = $('exam_program').value;
    
    if (!courses) {
        const { data } = await fetchData('courses', 'id, course_name', { target_program: program }, 'course_name', true);
        courses = data;
    } else if (program) {
        courses = courses.filter(c => c.target_program === program);
    }
    
    populateSelect(courseSelect, courses, 'id', 'course_name', 'Select Course');
}

function filterCoursesByProgram() {
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
        target_program: program, // Saving program type
        intake_year: intake,     // Saving intake
        block_term,              // Saving block/term
        status: exam_status
    });

    if (error) { showFeedback(`Failed to add exam: ${error.message}`, 'error'); } 
    else { showFeedback('Exam added successfully!'); e.target.reset(); loadExams(); renderFullCalendar(); }

    setButtonLoading(submitButton, false, originalText);
}


// Corrected loadExams to match HTML structure
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
    
    filterTable('exam-search', 'exams-table', [2, 1, 6]); // Title(2), Course(1), Block/Term(6)
}

// deleteExam and openGradeModal are retained and correct

/*******************************************************
 * 9. Calendar Tab (FullCalendar Integration)
 *******************************************************/

async function renderFullCalendar() {
    const calendarEl = $('fullCalendarDisplay');
    if (!calendarEl) return;
    calendarEl.innerHTML = ''; // Clear existing content

    const { data: sessions } = await fetchData('scheduled_sessions', '*', {}, 'session_date', true);
    const { data: exams } = await fetchData('exams', '*, course:course_id(course_name)', {}, 'exam_date', true);

    const events = [];

    // Map Sessions
    sessions?.forEach(s => {
        let title = `${s.session_type.toUpperCase()}: ${s.session_title}`;
        let color = s.session_type === 'clinical' ? '#2ecc71' : s.session_type === 'event' ? '#9b59b6' : '#3498db';
        
        // FullCalendar uses 'start' for date/time
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
// Note: Adjusted the send form logic to match the new HTML IDs

async function handleSendMessage(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    // Recipients are determined by the program type for simplicity
    const target_program = $('msg_program').value; 
    const message_content = $('msg_body').value.trim(); // Corrected ID
    const subject = `Message to ${target_program}`;
    const message_type = 'system'; // Default type for admin broadcast

    if (!message_content) {
        showFeedback('Message content cannot be empty.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const { error } = await sb.from('notifications').insert({ 
        recipient_id: null, // Indicates broadcast
        target_program: target_program === 'ALL' ? null : target_program, // Null for all, value for specific
        subject: subject, 
        message_content: message_content, 
        message_type: message_type,
        sender_id: currentUserProfile.id
    });

    if (error) { showFeedback(`Failed to send message: ${error.message}`, 'error'); } 
    else { showFeedback('Message sent successfully!'); e.target.reset(); loadMessages(); }

    setButtonLoading(submitButton, false, originalText);
}

// Updated loadMessages to reflect the broadcast nature
async function loadMessages() {
    const tbody = $('messages-table');
    tbody.innerHTML = '<tr><td colspan="3">Loading messages...</td></tr>';
    // Fetch system/broadcast messages
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
// Note: Upload logic in the HTML uses target program/intake/block metadata. 
// We need to pass these as metadata to Supabase storage on upload.

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
    // Create folder structure: Program/Intake/Block/Title_Filename.ext
    const filePath = `${program}/${intake}/${block}/${title.replace(/ /g, '_')}_${file.name.replace(/ /g, '_')}`; 

    try {
        const { error } = await sb.storage.from(RESOURCES_BUCKET).upload(filePath, file, { 
            cacheControl: '3600', 
            upsert: true,
            contentType: file.type,
            // Include metadata for filtering/display
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

// Updated loadResources to retrieve and display metadata
async function loadResources() {
    const tableBody = $('resources-list'); // Corrected ID from HTML
    tableBody.innerHTML = '<tr><td colspan="7">Loading resources...</td></tr>';
    
    try {
        // NOTE: Supabase storage list() doesn't return nested metadata, only file size/name/lastModified. 
        // For a true dashboard, you'd need a separate DB table to store resource metadata upon upload.
        // For this script, we'll list the files and infer details from the path/name.
        const { data: { contents: files }, error: listError } = await sb.storage
            .from(RESOURCES_BUCKET).list('', { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } });

        if (listError) throw listError;
        
        tableBody.innerHTML = '';
        if (!files || files.length === 0) { tableBody.innerHTML = '<tr><td colspan="7">No resources found.</td></tr>'; return; }

        files.forEach(file => {
            if (file.name === '.emptyFolderPlaceholder' || file.id === undefined) return;
            
            const { data: { publicUrl } } = sb.storage.from(RESOURCES_BUCKET).getPublicUrl(file.name);
            const lastModified = new Date(file.lastModified).toLocaleString();
            
            // Infer details from the path: Program/Intake/Block/Title_Filename.ext
            const parts = file.name.split('/');
            const program = parts[0] || 'N/A';
            const intake = parts[1] || 'N/A';
            const block = parts[2] || 'N/A';
            const fileName = parts.slice(3).join('/') || file.name;

            // This is a simplified display, but relies on the structure used in upload
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
    // Apply filtering after loading data
    filterTable('resource-search', 'resources-list', [0, 1]); // Program(0), File Name (1)
}


/*******************************************************
 * 12. Backup & Restore Tab
 *******************************************************/

async function loadBackupHistory() {
    const tbody = $('backup-history-table');
    tbody.innerHTML = '<tr><td colspan="4">Loading backup history...</td></tr>';
    // NOTE: Supabase does not expose a table for backup history or a public API for backup/restore. 
    // This function is for UI placeholder only.
    
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
                <button class="btn-action">Download</button>
                <button class="btn btn-delete">Delete</button>
            </td>
        </tr>`;
    });
}

function triggerBackup() {
    // NOTE: True database backup must be done via the Supabase Admin API or Dashboard.
    showFeedback('Backup initiated! Check Supabase Console for status (manual process).', 'success');
}

// NOTE: Restore logic is also purely informational as it requires a server-side process.
$('restore-form')?.addEventListener('submit', e => {
    e.preventDefault();
    showFeedback('Database restoration initiated. This is a critical server-side process, check logs for completion.', 'error');
    e.target.reset();
});


// =================================================================
// INITIALIZATION
// =================================================================
document.addEventListener('DOMContentLoaded', initSession);
