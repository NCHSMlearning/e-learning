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
const MAPBOX_ACCESS_TOKEN = 'pk.cbe61eae35ecbe1d1d682c347d81381c'; 
const DEVICE_ID_KEY = 'nchsm_device_id';
const SETTINGS_TABLE = 'app_settings'; 
const MESSAGE_KEY = 'student_welcome'; 

// Global Variables
let currentUserProfile = null;
let attendanceMap = null; // Used for Mapbox instance

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
        if (filters[key] !== undefined && filters[key] !== null) {
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
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
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
            loadStudentWelcomeMessage(); 
            break;
        case 'users': loadAllUsers(); break;
        case 'pending': loadPendingApprovals(); break;
        case 'enroll': loadStudents(); break; 
        case 'courses': loadCourses(); break;
        case 'attendance': loadAttendance(); populateAttendanceSelects(); break;
        case 'cats': loadExams(); populateAttendanceSelects(); break;
        case 'messages': loadMessages(); break;
        case 'calendar': $('calendar').innerHTML = '<p>Simple calendar placeholder - Exam and Clinical dates will show here. (Integration coming soon)</p>'; break;
        case 'resources': loadResources(); break;
        case 'welcome-editor': loadWelcomeMessageForEdit(); break; 
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
            // Redirect non-superadmins if this is a superadmin panel
            window.location.href = "admin.html"; 
            return;
        }
        document.querySelector('header h1').textContent = `Welcome, ${profile.full_name || 'Super Admin'}!`;
    } else {
        window.location.href = "login.html";
        return;
    }
    
    loadSectionData('dashboard');
    populateAttendanceSelects();
    
    // Setup Event Listeners
    $('att_session_type')?.addEventListener('change', toggleAttendanceFields);
    toggleAttendanceFields(); 
    
    $('edit-user-form')?.addEventListener('submit', handleEditUser);
    document.querySelector('#userEditModal .close')?.addEventListener('click', () => { $('userEditModal').style.display = 'none'; });
    
    document.querySelector('#mapModal .close')?.addEventListener('click', () => { $('mapModal').style.display = 'none'; });
    
    document.querySelector('#courseEditModal .close')?.addEventListener('click', () => { $('courseEditModal').style.display = 'none'; });
    
    $('edit-course-form')?.addEventListener('submit', handleEditCourse);
    
    // Setup LIVE FILTER Listeners (onkeyup)
    // NOTE: Filter functions are called here instead of in the HTML to consolidate logic
    $('user-search')?.addEventListener('keyup', () => filterTable('user-search', 'users-table', [1, 2, 4]));
    $('student-search')?.addEventListener('keyup', () => filterTable('student-search', 'students-table', [1, 3, 5]));
    $('course-search')?.addEventListener('keyup', () => filterTable('course-search', 'courses-table', [0, 2, 4]));
    $('attendance-search')?.addEventListener('keyup', () => filterTable('attendance-search', 'attendance-table', [0, 1, 2]));
    // *** NEW FILTERS FOR EXAMS AND RESOURCES ***
    $('exam-search')?.addEventListener('keyup', () => filterTable('exam-search', 'exams-table', [0, 1, 3]));
    $('resource-search')?.addEventListener('keyup', () => filterTable('resource-search', 'resources-table', [0])); 
}

// Logout
async function logout() {
    await sb.auth.signOut();
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
}

/*******************************************************
 * 2. TABLE FILTERING FUNCTION
 *******************************************************/

/**
 * Generic function to filter table rows based on text input and specific columns.
 * @param {string} inputId - ID of the text input element (e.g., 'user-search').
 * @param {string} tableId - ID of the table body element (e.g., 'users-table').
 * @param {number[]} columnsToSearch - Array of 0-indexed column numbers to check (e.g., [1, 2] for Name and Email).
 */
function filterTable(inputId, tableId, columnsToSearch = [0]) {
    const filter = $(inputId)?.value.toUpperCase() || '';
    const tbody = $(tableId);
    if (!tbody) return;

    const trs = tbody.getElementsByTagName('tr');

    for (let i = 0; i < trs.length; i++) {
        let rowMatches = false;

        // Check if the row is a header row (it should always be visible)
        if (trs[i].querySelector('th')) {
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


/*******************
 * Dashboard Data
 *******************/
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
    const messageDiv = $('student-welcome-message');
    if (data && data.length > 0) {
        messageDiv.innerHTML = data[0].setting_value;
    } else {
        messageDiv.innerHTML = '<p>Welcome student! Please check in for attendance. (Default Message)</p>';
    }
}


/*******************************************************
 * 3. Users/Enroll Tab (Approvals, EDIT, Delete Logic)
 *******************************************************/
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
    // Apply filtering after loading data
    filterTable('user-search', 'users-table', [1, 2, 4]); // Name(1), Email(2), Program(4)
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
    // Apply filtering after loading data
    filterTable('student-search', 'students-table', [1, 3, 5]); // Name(1), Program(3), Block(5)
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

$('add-account-form')?.addEventListener('submit', async e => {
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
    const block = $('account-block').value; 

    const userData = { 
        full_name: name, role: role, phone: phone, program_type: program_type, 
        intake_year: intake_year, block: block, approved: true, block_program_year: false 
    };

    // NOTE: Supabase Auth.signUp should ideally be done on a trusted server for Superadmin/Admin creation 
    // to avoid RLS/security issues, but is done here for a simple frontend script example.
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
});

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
 * 4. Courses Tab - WITH FILTERING FIELDS
 *******************************************************/

async function loadCourses() {
    const tbody = $('courses-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading courses...</td></tr>';

    // Fetch all courses to show the admin everything
    const { data: courses, error } = await fetchData('courses', '*', {}, 'course_name', true);
    if (error) { tbody.innerHTML = `<tr><td colspan="6">Error loading courses: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    courses.forEach(c => {
        // Use the fields that are CRITICAL for student filtering
        const courseNameAttr = escapeHtml(c.course_name, true);
        const descriptionAttr = escapeHtml(c.description || '', true);
        const programTypeAttr = escapeHtml(c.target_program || '', true); // *** target_program ***
        const intakeYearAttr = escapeHtml(c.intake_year || '', true);     // *** intake_year ***
        const blockAttr = escapeHtml(c.block || '', true);               // *** block ***

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(c.course_name)}</td>
            <td>${escapeHtml(c.description || 'N/A')}</td>
            <td>${escapeHtml(c.target_program || 'N/A')}</td> 
            <td>${escapeHtml(c.intake_year || 'N/A')}</td>
            <td>${escapeHtml(c.block || 'N/A')}</td>
            <td>
                <button class="btn-action" onclick="openEditCourseModal('${c.id}', '${courseNameAttr}', '${descriptionAttr}', '${programTypeAttr}', '${intakeYearAttr}', '${blockAttr}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteCourse('${c.id}')">Delete</button>
            </td>
        </tr>`;
    });
    
    // Apply filtering after loading data
    filterTable('course-search', 'courses-table', [0, 2, 4]); // Name(0), Program(2), Block(4)
    
    // Refresh course selects in other tabs
    const courseSelects = document.querySelectorAll('#att_course_id, #exam_course_id');
    courseSelects.forEach(select => populateSelect(select, courses, 'id', 'course_name', 'Select Course'));
}

$('add-course-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const course_name = $('course-name').value.trim();
    const description = $('course-description').value.trim();
    // Fields critical for student dashboard filtering
    const target_program = $('course-program').value; 
    const intake_year = $('course-intake').value; 
    const block = $('course-block').value; 
    
    if (!course_name || !target_program) {
        showFeedback('Course Name and Target Program are required.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    // CRITICAL INSERTION LOGIC
    const { error } = await sb.from('courses').insert({ 
        course_name, 
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
});

async function deleteCourse(courseId) {
    if (!confirm('Are you sure you want to delete this course? This cannot be undone.')) return;
    const { error } = await sb.from('courses').delete().eq('id', courseId);
    if (error) { showFeedback(`Failed to delete course: ${error.message}`, 'error'); } 
    else { showFeedback('Course deleted successfully!'); loadCourses(); }
}

function openEditCourseModal(id, name, description, target_program, intake_year, block) {
    $('edit_course_id').value = id;
    $('edit_course_name').value = name; 
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
    const description = $('edit_course_description').value.trim();
    const target_program = $('edit_course_program').value;
    const intake_year = $('edit_course_intake').value;
    const block = $('edit_course_block').value;
    
    try {
        const updateData = { 
            course_name: name, 
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
 * 5. Attendance Tab
 *******************************************************/

async function populateAttendanceSelects() {
    // Only get approved students
    const { data: students } = await fetchData('profiles', 'id, full_name', { role: 'student', approved: true }, 'full_name', true);
    const attStudentSelect = $('att_student_id');
    if (students) { populateSelect(attStudentSelect, students, 'id', 'full_name', 'Select Student'); }
}

function toggleAttendanceFields() {
    const sessionType = $('att_session_type').value;
    const departmentInput = $('att_department');
    const courseSelect = $('att_course_id');
    
    if (sessionType === 'clinical') {
        departmentInput.style.display = 'inline-block';
        departmentInput.required = true;
        departmentInput.placeholder = "Required: Clinical Department/Area";
        courseSelect.style.display = 'none';
        courseSelect.required = false;
        courseSelect.value = ""; 
    } else if (sessionType === 'classroom') {
        departmentInput.style.display = 'none';
        departmentInput.required = false;
        departmentInput.value = ""; 
        courseSelect.style.display = 'inline-block';
        courseSelect.required = true;
    } else {
        departmentInput.style.display = 'inline-block';
        departmentInput.required = false;
        departmentInput.placeholder = "Optional Location/Detail";
        courseSelect.style.display = 'none';
        courseSelect.required = false;
        courseSelect.value = "";
    }
}

async function loadAttendance() {
    const tbody = $('attendance-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading records...</td></tr>';
    
    const { data: records, error } = await fetchData(
        'geo_attendance_logs', 
        '*, profile:student_id(full_name, program_type), course:course_id(course_name)', 
        {}, 'check_in_time', false 
    );

    if (error) { tbody.innerHTML = `<tr><td colspan="6">Error loading attendance: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    records.forEach(r => {
        const studentName = r.profile?.full_name || 'N/A';
        const dateTime = new Date(r.check_in_time).toLocaleString();
        
        let locationDetail;
        if (r.session_type === 'clinical') {
            locationDetail = escapeHtml(r.department || 'N/A Department');
        } else if (r.session_type === 'classroom') {
            locationDetail = escapeHtml(r.course?.course_name || 'N/A Course');
        } else {
            locationDetail = escapeHtml(r.location_name || 'N/A Location');
        }
        
        let geoStatus;
        let mapButton = '';
        if (r.latitude && r.longitude) {
            geoStatus = 'Yes (Geo-Logged)';
            mapButton = `<button class="btn btn-map" onclick="showMap('${r.latitude}', '${r.longitude}', '${escapeHtml(r.location_name || 'Check-in Location', true)}', '${escapeHtml(studentName, true)}', '${dateTime}')">View Map</button>`;
        } else {
            geoStatus = 'No (Manual)';
        }
        
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(studentName)}</td>
            <td>${escapeHtml(r.session_type || 'N/A')}</td>
            <td>${locationDetail}</td>
            <td>${dateTime}</td>
            <td>${geoStatus}</td>
            <td>
                ${mapButton}
                <button class="btn btn-delete" onclick="deleteAttendanceRecord('${r.id}')">Delete</button>
            </td>
        </tr>`;
    });
    // Apply filtering after loading data
    filterTable('attendance-search', 'attendance-table', [0, 1, 2]); // Student Name(0), Session Type(1), Location Detail(2)
}

$('manual-attendance-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const student_id = $('att_student_id').value;
    const session_type = $('att_session_type').value;
    
    const course_id = session_type === 'classroom' ? $('att_course_id').value : null;
    const department = session_type === 'clinical' ? $('att_department').value.trim() : null;
    const check_in_time_value = $('att_check_in_time')?.value; 
    const check_in_time = check_in_time_value ? new Date(check_in_time_value).toISOString() : new Date().toISOString(); 
    
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
        location_name: 'Manual Admin Entry',
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
});


function showMap(lat, lng, locationName, studentName, dateTime) {
    const mapModal = $('mapModal');
    const mapContainer = $('mapbox-map');
    
    $('map-modal-title').textContent = `${studentName}'s Check-in Location`;
    $('map-details').innerHTML = `<strong>Time:</strong> ${dateTime}<br><strong>Location:</strong> ${locationName}<br><strong>Coords:</strong> ${lat}, ${lng}`;

    mapModal.style.display = 'flex';
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
    
    if (!attendanceMap) {
        attendanceMap = new mapboxgl.Map({
            container: mapContainer.id,
            style: 'mapbox://styles/mapbox/streets-v11', 
            center: [lng, lat],
            zoom: 15
        });
        attendanceMap.on('load', () => { attendanceMap.resize(); });
    } else {
        const markers = document.querySelectorAll('.mapboxgl-marker');
        markers.forEach(m => m.remove());
        attendanceMap.flyTo({ center: [lng, lat], zoom: 15 });
    }

    new mapboxgl.Marker().setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup().setHTML(`<h5>${locationName}</h5><p>${studentName}</p>`))
        .addTo(attendanceMap);
        
    setTimeout(() => { if (attendanceMap) { attendanceMap.resize(); } }, 100); 
}

async function deleteAttendanceRecord(recordId) {
    if (!confirm('Are you sure you want to delete this attendance record?')) return;
    const { error } = await sb.from('geo_attendance_logs').delete().eq('id', recordId);
    if (error) { showFeedback(`Failed to delete record: ${error.message}`, 'error'); } 
    else { showFeedback('Attendance record deleted successfully!'); loadAttendance(); }
}


/*******************************************************
 * 6. CATS/Exams Tab
 *******************************************************/
async function loadExams() {
    const tbody = $('exams-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading exams/CATs...</td></tr>';
    const { data: exams, error } = await fetchData('exams', '*, course:course_id(course_name)', {}, 'exam_date', false);
    if (error) { tbody.innerHTML = `<tr><td colspan="6">Error loading exams: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    exams.forEach(e => {
        const examDate = new Date(e.exam_date).toLocaleDateString();
        const courseName = e.course?.course_name || 'N/A';
        const isGraded = e.is_graded ? 'Yes' : 'No';

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(e.exam_name)}</td>
            <td>${escapeHtml(courseName)}</td>
            <td>${examDate}</td>
            <td>${escapeHtml(e.term_block)}</td>
            <td>${isGraded}</td>
            <td>
                <button class="btn-action" onclick="openGradeModal('${e.id}', '${escapeHtml(e.exam_name, true)}')">Grade</button>
                <button class="btn btn-delete" onclick="deleteExam('${e.id}')">Delete</button>
            </td>
        </tr>`;
    });
    // Apply filtering after loading data
    filterTable('exam-search', 'exams-table', [0, 1, 3]); // Exam Name(0), Course Name(1), Term/Block(3)
}

$('add-exam-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const exam_name = $('exam-name').value.trim();
    const course_id = $('exam_course_id').value;
    const exam_date = $('exam-date').value;
    const term_block = $('exam-term-block').value;
    const is_graded = $('exam-is-graded').checked;

    if (!exam_name || !course_id || !exam_date) {
        showFeedback('Exam Name, Course, and Date are required.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const { error } = await sb.from('exams').insert({ exam_name, course_id, exam_date, term_block, is_graded });

    if (error) { showFeedback(`Failed to add exam: ${error.message}`, 'error'); } 
    else { showFeedback('Exam added successfully!'); e.target.reset(); loadExams(); }

    setButtonLoading(submitButton, false, originalText);
});

async function deleteExam(examId) {
    if (!confirm('Are you sure you want to delete this exam? This cannot be undone.')) return;
    const { error } = await sb.from('exams').delete().eq('id', examId);
    if (error) { showFeedback(`Failed to delete exam: ${error.message}`, 'error'); } 
    else { showFeedback('Exam deleted successfully!'); loadExams(); }
}

function openGradeModal(examId, examName) {
    showFeedback(`Grading functionality for: ${examName} (ID: ${examId}) is pending implementation.`, 'success');
}

/*******************************************************
 * 7. Messages Tab (Notifications)
 *******************************************************/
async function loadMessages() {
    const tbody = $('messages-table');
    tbody.innerHTML = '<tr><td colspan="4">Loading messages...</td></tr>';
    const { data: messages, error } = await fetchData('notifications', '*, profile:recipient_id(full_name)', {}, 'created_at', false);
    
    if (error) { tbody.innerHTML = `<tr><td colspan="4">Error loading messages: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    messages.forEach(m => {
        const recipientName = m.recipient_id === null ? 'All Students' : (m.profile?.full_name || 'N/A');
        const sendDate = new Date(m.created_at).toLocaleString();

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(recipientName)}</td>
            <td>${escapeHtml(m.subject)}</td>
            <td>${escapeHtml(m.message_type)}</td>
            <td>${sendDate}</td>
        </tr>`;
    });
}

$('send-message-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const recipient_id = $('msg-recipient-id').value || null; 
    const subject = $('msg-subject').value.trim();
    const message_content = $('msg-content').value.trim();
    const message_type = $('msg-type').value;

    if (!subject || !message_content) {
        showFeedback('Subject and Message Content are required.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const { error } = await sb.from('notifications').insert({ recipient_id, subject, message_content, message_type });

    if (error) { showFeedback(`Failed to send message: ${error.message}`, 'error'); } 
    else { showFeedback('Message sent successfully!'); e.target.reset(); loadMessages(); }

    setButtonLoading(submitButton, false, originalText);
});


/*******************************************************
 * 8. Resources Tab
 *******************************************************/
async function loadResources() {
    const tableBody = $('resources-table');
    tableBody.innerHTML = '<tr><td colspan="4">Loading resources...</td></tr>';
    
    try {
        const { data: { contents: files }, error: listError } = await sb.storage
            .from(RESOURCES_BUCKET).list('', { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });

        if (listError) throw listError;
        
        tableBody.innerHTML = '';
        if (!files || files.length === 0) { tableBody.innerHTML = '<tr><td colspan="4">No resources found.</td></tr>'; return; }

        files.forEach(file => {
            if (file.name === '.emptyFolderPlaceholder') return;
            
            const { data: { publicUrl } } = sb.storage.from(RESOURCES_BUCKET).getPublicUrl(file.name);
            const lastModified = new Date(file.lastModified).toLocaleString();

            tableBody.innerHTML += `<tr>
                <td>${escapeHtml(file.name)}</td>
                <td>${(file.metadata.size / 1024 / 1024).toFixed(2)} MB</td>
                <td>${lastModified}</td>
                <td>
                    <a href="${publicUrl}" target="_blank" class="btn-action">Download</a>
                    <button class="btn btn-delete" onclick="deleteResource('${escapeHtml(file.name, true)}')">Delete</button>
                </td>
            </tr>`;
        });
    } catch (e) {
        tableBody.innerHTML = `<tr><td colspan="4">Error listing resources: ${e.message}</td></tr>`;
    }
    // Apply filtering after loading data
    filterTable('resource-search', 'resources-table', [0]); // File Name (0)
}

$('upload-resource-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const fileInput = $('resource-file');
    if (fileInput.files.length === 0) { showFeedback('Please select a file to upload.', 'error'); setButtonLoading(submitButton, false, originalText); return; }

    const file = fileInput.files[0];
    const filePath = file.name.replace(/ /g, '_'); 

    try {
        const { error } = await sb.storage.from(RESOURCES_BUCKET).upload(filePath, file, { cacheControl: '3600', upsert: true });
        if (error) throw error;
        showFeedback(`File "${file.name}" uploaded successfully!`);
        e.target.reset(); loadResources();
    } catch (e) {
        showFeedback(`File upload failed: ${e.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

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
 * 9. Welcome Message Editor Tab
 *******************************************************/
async function loadWelcomeMessageForEdit() {
    const { data } = await fetchData(SETTINGS_TABLE, '*', { setting_key: MESSAGE_KEY });
    const editor = $('welcome-message-editor');

    if (data && data.length > 0) {
        editor.value = data[0].setting_value;
        editor.disabled = false;
    } else {
        editor.value = '<p>Welcome student! Please check in for attendance. (Default Message)</p>';
        editor.disabled = false;
    }
}

$('welcome-editor-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const setting_value = $('welcome-message-editor').value.trim();

    if (!setting_value) { showFeedback('Message content cannot be empty.', 'error'); setButtonLoading(submitButton, false, originalText); return; }
    
    const { data: existing } = await fetchData(SETTINGS_TABLE, 'id', { setting_key: MESSAGE_KEY });

    let updateOrInsertError = null;

    if (existing && existing.length > 0) {
        const { error } = await sb.from(SETTINGS_TABLE).update({ setting_value }).eq('id', existing[0].id);
        updateOrInsertError = error;
    } else {
        const { error } = await sb.from(SETTINGS_TABLE).insert({ setting_key: MESSAGE_KEY, setting_value: setting_value });
        updateOrInsertError = error;
    }

    if (updateOrInsertError) {
        showFeedback(`Failed to save message: ${updateOrInsertError.message}`, 'error');
    } else {
        showFeedback('Welcome message saved successfully!');
        loadStudentWelcomeMessage(); 
    }

    setButtonLoading(submitButton, false, originalText);
});


// =================================================================
// INITIALIZATION
// =================================================================
document.addEventListener('DOMContentLoaded', initSession);
