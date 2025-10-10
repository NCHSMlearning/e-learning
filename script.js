/***********************************
 * JavaScript Functionality (script.js)
 ***********************************/

// !!! IMPORTANT: CHECK YOUR KEYS AND URL !!!
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const RESOURCES_BUCKET = 'resources';
const IP_API_URL = 'https://api.ipify.org?format=json';

// --- Global API Keys and Settings ---
const MAPBOX_ACCESS_TOKEN = 'pk.cbe61eae35ecbe1d1d682c347d81381c'; 
const DEVICE_ID_KEY = 'nchsm_device_id';

// Global Variables
let currentUserProfile = null;
let attendanceMap = null;

// Settings Keys
const SETTINGS_TABLE = 'app_settings'; 
const MESSAGE_KEY = 'student_welcome'; 

/*******************************************************
 * 1. CORE UTILITY FUNCTIONS
 *******************************************************/
function $(id){ return document.getElementById(id); }

// Escapes HTML for safety, with an option to handle quotes for inline attributes
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
        if (filters[key] !== undefined) {
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

async function reverseGeocode(lat, lng) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.features && data.features.length > 0) {
            return data.features[0].place_name; 
        }
        return 'Reverse Geocoding Failed';
    } catch (error) {
        console.error('Reverse Geocoding Error:', error);
        return 'Geocoding API Network Error';
    }
}

function getGeoLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve(position.coords),
            (error) => reject(new Error(error.message)),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    });
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
        document.getElementById(tabId).classList.add('active');
        loadSectionData(tabId);
    });
});

function showTab(tabId) {
     const link = document.querySelector(`.nav a[data-tab="${tabId}"]`);
     if (link) link.click();
}

async function loadSectionData(tabId) {
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
    
    // Attach the change listener for session type
    $('att_session_type')?.addEventListener('change', toggleAttendanceFields);
    toggleAttendanceFields(); // Initial call to set correct state
}

// Logout
async function logout() {
    await sb.auth.signOut();
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
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
    const { data: checkinData } = await sb.from('geo_attendance_logs').select('id').gte('check_in_time', today);
    $('todayCheckins').textContent = checkinData?.length || 0;
    
    loadStudentWelcomeMessage(); 
}

async function loadStudentWelcomeMessage() {
    const { data, error } = await fetchData(SETTINGS_TABLE, '*', { setting_key: MESSAGE_KEY });
    const messageDiv = $('student-welcome-message');

    if (error) {
        messageDiv.innerHTML = `<p class="error-text">Error loading welcome message: ${error.message}</p>`;
    } else if (data && data.length > 0) {
        // Use innerHTML to display the saved message (assuming it's formatted HTML)
        messageDiv.innerHTML = data[0].setting_value;
    } else {
        messageDiv.innerHTML = '<p>Welcome student! Please check in for attendance. (Default Message)</p>';
    }
}


/*******************************************************
 * 2. Users/Enroll Tab (Approvals Logic)
 *******************************************************/
async function loadAllUsers() {
    const tbody = $('users-table');
    tbody.innerHTML = '<tr><td colspan="7">Loading all users...</td></tr>';
    
    const { data: users, error } = await fetchData('profiles', '*', {}, 'full_name', true);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading users: ${error.message}</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    users.forEach(u => {
        const roleOptions = ['student', 'admin', 'superadmin']
            .map(role => `<option value="${role}" ${u.role === role ? 'selected' : ''}>${role}</option>`).join('');
        
        const statusText = u.approved ? 'Approved' : 'Pending';

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
            <td>${statusText}</td>
            <td>
                ${!u.approved ? `<button class="btn btn-approve" onclick="approveUser('${u.id}')">Approve</button>` : ''}
                <button class="btn btn-delete" onclick="deleteProfile('${u.id}')">Delete</button>
            </td>
        </tr>`;
    });
}

async function loadPendingApprovals() {
    const tbody = $('pending-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading pending users...</td></tr>';
    
    const { data: pending, error } = await fetchData('profiles', '*', { approved: false }, 'created_at', true);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error loading pending list: ${error.message}</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    if (pending.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">No pending approvals!</td></tr>`;
        return;
    }
    
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
    tbody.innerHTML = '<tr><td colspan="9">Loading students...</td></tr>';
    
    const { data: students, error } = await fetchData('profiles', '*', { role: 'student' }, 'full_name', true);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="9">Error loading students: ${error.message}</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    students.forEach(s => {
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(s.id.substring(0, 8))}...</td>
            <td>${escapeHtml(s.full_name)}</td>
            <td>${escapeHtml(s.email)}</td>
            <td>${escapeHtml(s.program_type || 'N/A')}</td>
            <td>${escapeHtml(s.intake_year || 'N/A')}</td>
            <td>${escapeHtml(s.block || 'N/A')}</td>
            <td>${escapeHtml(s.phone)}</td>
            <td>${s.approved ? 'Approved' : 'Pending'}</td>
            <td><button class="btn btn-delete" onclick="deleteProfile('${s.id}')">Delete</button></td>
        </tr>`;
    });
}

async function approveUser(userId) {
    if (!confirm('Are you sure you want to approve this user?')) return;

    const { error } = await sb.from('profiles')
        .update({ approved: true })
        .eq('id', userId);

    if (error) {
        showFeedback(`Failed to approve user: ${error.message}`, 'error');
    } else {
        showFeedback('User approved successfully!');
        loadPendingApprovals(); 
        loadAllUsers(); 
        loadDashboardData(); 
    }
}

async function updateUserRole(userId, newRole) {
    if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;

    const { error } = await sb.from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

    if (error) {
        showFeedback(`Failed to update role: ${error.message}`, 'error');
    } else {
        showFeedback(`User role updated to ${newRole} successfully!`);
        loadAllUsers(); 
    }
}

async function deleteProfile(userId) {
    if (!confirm('WARNING: Deleting the profile is an irreversible action. Are you absolutely sure?')) return;

    const { error: profileError } = await sb.from('profiles').delete().eq('id', userId);

    if (profileError) {
        showFeedback(`Failed to delete profile: ${profileError.message}`, 'error');
        return;
    }
    
    showFeedback('User profile deleted successfully! (Note: Auth user deletion may require server-side action)', 'success');
    loadAllUsers(); 
    loadPendingApprovals();
    loadStudents();
    loadDashboardData();
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
    const approved = true; 

    // Prepare metadata for Supabase Auth and Profiles table
    const userData = { 
        full_name: name, 
        role: role, 
        phone: phone, 
        program_type: program_type, 
        intake_year: intake_year, 
        block: block, 
        approved: approved 
    };

    const { data: { user }, error: authError } = await sb.auth.signUp({
        email: email,
        password: password,
        options: {
            data: userData
        }
    });

    if (authError) {
        showFeedback(`Account Enrollment Error: ${authError.message}`, 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }
    
    if (user && user.id) {
        e.target.reset();
        showFeedback(`New ${role.toUpperCase()} account successfully enrolled and approved!`, 'success');
        loadStudents(); 
        loadAllUsers();
        loadDashboardData();
    } else {
        showFeedback('Enrollment succeeded but Auth user object was not returned. Please check the logs.', 'error');
    }

    setButtonLoading(submitButton, false, originalText);
});


/*******************************************************
 * 3. Courses Tab - WITH EDIT FUNCTIONALITY
 *******************************************************/

async function loadCourses() {
    const tbody = $('courses-table');
    tbody.innerHTML = '<tr><td colspan="5">Loading courses...</td></tr>';

    const { data: courses, error } = await fetchData('courses', '*', {}, 'course_name', true);
    if (error) {
        tbody.innerHTML = `<tr><td colspan="5">Error loading courses: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    courses.forEach(c => {
        const courseNameAttr = escapeHtml(c.course_name, true);
        const descriptionAttr = escapeHtml(c.description || '', true);

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(c.course_name)}</td>
            <td>${escapeHtml(c.description || 'N/A')}</td>
            <td>${escapeHtml(c.intake_year || 'N/A')}</td>
            <td>${escapeHtml(c.block || 'N/A')}</td>
            <td>
                <button class="btn-action" onclick="openEditCourseModal('${c.id}', '${courseNameAttr}', '${descriptionAttr}', '${c.intake_year || ''}', '${c.block || ''}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteCourse('${c.id}')">Delete</button>
            </td>
        </tr>`;
    });
    
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
    const intake_year = $('course-intake').value; 
    const block = $('course-block').value; 

    const { error } = await sb.from('courses').insert({ course_name, description, intake_year, block });

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

    if (error) {
        showFeedback(`Failed to delete course: ${error.message}`, 'error');
    } else {
        showFeedback('Course deleted successfully!');
        loadCourses();
    }
}

/** Opens the modal and populates it with course data */
function openEditCourseModal(id, name, description, intake_year, block) {
    $('edit_course_id').value = id;
    $('edit_course_name').value = name; 
    $('edit_course_description').value = description;

    // You would need to add intake_year/block fields to your 'courseEditModal' HTML
    
    $('courseEditModal').style.display = 'flex'; 
}

/** Handles the submission of the edit course form */
$('edit-course-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const id = $('edit_course_id').value;
    const name = $('edit_course_name').value.trim();
    const description = $('edit_course_description').value.trim();
    
    try {
        const updateData = { course_name: name, description: description };
        
        const { error } = await sb
            .from('courses')
            .update(updateData)
            .eq('id', id); 

        if (error) throw error;

        showFeedback('Course updated successfully!');
        $('courseEditModal').style.display = 'none';
        loadCourses(); 
    } catch (e) {
        showFeedback('Failed to update course: ' + (e.message || e), 'error');
        console.error('Error updating course:', e);
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});


/*******************************************************
 * 4. Attendance Tab
 *******************************************************/

async function populateAttendanceSelects() {
    const { data: students } = await fetchData('profiles', 'id, full_name', { role: 'student', approved: true }, 'full_name', true);
    
    const attStudentSelect = $('att_student_id');
    if (students) {
        populateSelect(attStudentSelect, students, 'id', 'full_name', 'Select Student');
    }
}

/**
 * Toggles the visibility and requirement of the Department/Area and Course fields
 * based on the selected Session Type.
 */
function toggleAttendanceFields() {
    const sessionType = $('att_session_type').value;
    const departmentInput = $('att_department');
    const courseSelect = $('att_course_id');
    
    const departmentLabel = document.querySelector('label[for="att_department"]'); // Assuming you have labels or wrap inputs
    const courseLabel = document.querySelector('label[for="att_course_id"]');

    if (sessionType === 'clinical') {
        departmentInput.style.display = 'inline-block';
        departmentInput.required = true;
        departmentInput.placeholder = "Required: Clinical Department/Area";
        
        courseSelect.style.display = 'none';
        courseSelect.required = false;
        courseSelect.value = ""; // Clear value
        
        // You might need to adjust the visibility of their wrappers/labels if they exist
        // if (departmentLabel) departmentLabel.style.display = 'inline';
        // if (courseLabel) courseLabel.style.display = 'none';
        
    } else if (sessionType === 'classroom') {
        departmentInput.style.display = 'none';
        departmentInput.required = false;
        departmentInput.value = ""; // Clear value
        
        courseSelect.style.display = 'inline-block';
        courseSelect.required = true;
        
        // if (departmentLabel) departmentLabel.style.display = 'none';
        // if (courseLabel) courseLabel.style.display = 'inline';
    } else {
        // Default or other types ('virtual', 'call', etc.) - hide both, make both optional
        departmentInput.style.display = 'inline-block';
        departmentInput.required = false;
        departmentInput.placeholder = "Optional Location/Detail";
        
        courseSelect.style.display = 'none';
        courseSelect.required = false;
        courseSelect.value = "";
        
        // if (departmentLabel) departmentLabel.style.display = 'inline';
        // if (courseLabel) courseLabel.style.display = 'none';
    }
}

async function loadAttendance() {
    const tbody = $('attendance-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading records...</td></tr>';
    
    // Fetch records, including nested profiles and courses
    const { data: records, error } = await fetchData(
        'geo_attendance_logs', 
        '*, profile:student_id(full_name, program_type), course:course_id(course_name)', 
        {}, 
        'check_in_time', 
        false 
    );

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error loading attendance: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    records.forEach(r => {
        const studentName = r.profile?.full_name || 'N/A';
        const dateTime = new Date(r.check_in_time).toLocaleString();
        
        let locationDetail;
        if (r.session_type === 'clinical') {
            // Show Department
            locationDetail = escapeHtml(r.department || 'N/A Department');
        } else if (r.session_type === 'classroom') {
            // Show Course Name
            locationDetail = escapeHtml(r.course?.course_name || 'N/A Course');
        } else {
            // Show location name for others (virtual, call, etc.)
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
}

function filterAttendanceTable() {
    const filter = $('attendance-search').value.toUpperCase();
    const trs = $('attendance-table').getElementsByTagName('tr');

    for (let i = 0; i < trs.length; i++) {
        const td = trs[i].getElementsByTagName('td')[0]; // Check only the Student Name column
        if (td) {
            const txtValue = td.textContent || td.innerText;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                trs[i].style.display = "";
            } else {
                trs[i].style.display = "none";
            }
        }       
    }
}

$('manual-attendance-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const student_id = $('att_student_id').value;
    const session_type = $('att_session_type').value;
    const date = $('att_date').value;
    const time = $('att_time').value;

    let department = null;
    let course_id = null;
    let location_name = $('att_location').value.trim() || 'Manual Entry';

    // --- NEW VALIDATION AND FIELD SELECTION LOGIC ---
    if (session_type === 'clinical') {
        department = $('att_department').value.trim();
        if (!department) {
            showFeedback('Department/Area is required for Clinical sessions.', 'error');
            setButtonLoading(submitButton, false, originalText);
            return;
        }
        location_name = `Clinical: ${department}`;
    } else if (session_type === 'classroom') {
        course_id = $('att_course_id').value;
        if (!course_id) {
            showFeedback('Course is required for Classroom sessions.', 'error');
            setButtonLoading(submitButton, false, originalText);
            return;
        }
        department = 'Classroom'; // Default department for clarity
    } else if (!student_id || !session_type || !date) {
        showFeedback('Please fill out all required fields (Student, Session Type, Date).', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }
    // --- END NEW LOGIC ---

    // Combine date and time to create ISO timestamp
    const check_in_time = time ? `${date}T${time}:00.000Z` : `${date}T00:00:00.000Z`;
    
    const record = {
        student_id,
        session_type,
        department,     // Contains Department for Clinical, 'Classroom' for Classroom, or null
        course_id,      // Contains Course ID for Classroom, or null
        location_name,  // Populated by Department/Course or manual input
        check_in_time,
        ip_address: await getIPAddress(),
        device_id: getDeviceId(),
    };

    const { error } = await sb.from('geo_attendance_logs').insert([record]);

    if (error) {
        showFeedback(`Manual Mark Error: ${error.message}`, 'error');
    } else {
        showFeedback('Manual attendance marked successfully!', 'success');
        e.target.reset();
        loadAttendance();
        loadDashboardData();
        toggleAttendanceFields(); // Reset fields after submission
    }
    setButtonLoading(submitButton, false, originalText);
});

async function deleteAttendanceRecord(recordId) {
    if (!confirm('Are you sure you want to delete this attendance record?')) return;

    const { error } = await sb.from('geo_attendance_logs').delete().eq('id', recordId);

    if (error) {
        showFeedback(`Failed to delete record: ${error.message}`, 'error');
    } else {
        showFeedback('Attendance record deleted successfully!');
        loadAttendance();
        loadDashboardData();
    }
}

function showMap(lat, lng, locationName, studentName, dateTime) {
    const modal = $('mapModal');
    modal.style.display = 'flex'; 

    $('mapInfo').innerHTML = `**Student:** ${studentName} | **Time:** ${dateTime} | **Location:** ${locationName}`;

    if (attendanceMap) {
        attendanceMap.remove();
    }
    
    const mapElement = $('attendanceMap');
    mapElement.style.visibility = 'visible'; 
    
    // Check if L (Leaflet) is defined before trying to initialize map
    if (typeof L !== 'undefined') {
        attendanceMap = L.map('attendanceMap').setView([lat, lng], 16);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(attendanceMap);

        L.marker([lat, lng])
            .addTo(attendanceMap)
            .bindPopup(`<b>${studentName}</b><br>${locationName}`).openPopup();
            
        setTimeout(() => {
            attendanceMap.invalidateSize();
        }, 100);
    } else {
         $('mapInfo').innerHTML = 'Map loading failed. Check if Leaflet CSS/JS is included.';
    }
}

document.querySelector('#mapModal .close')?.addEventListener('click', () => {
    $('mapModal').style.display = 'none';
});


/*******************************************************
 * 5. CATS / Exams Tab
 *******************************************************/

async function loadExams() {
    const tbody = $('exams-table');
    tbody.innerHTML = '<tr><td colspan="8">Loading exams...</td></tr>';
    
    const { data: exams, error } = await fetchData(
        'cats_exams', 
        '*, course:course_id(course_name)', 
        {}, 
        'exam_date', 
        false 
    );

    if (error) {
        tbody.innerHTML = `<tr><td colspan="8">Error loading exams: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    exams.forEach(e => {
        const courseName = e.course?.course_name || 'N/A';
        const examDate = new Date(e.exam_date).toLocaleDateString();
        
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(e.program_type)}</td>
            <td>${escapeHtml(courseName)}</td>
            <td>${escapeHtml(e.exam_title)}</td>
            <td>${examDate}</td>
            <td>${escapeHtml(e.exam_status)}</td>
            <td>${escapeHtml(e.intake_year || 'N/A')}</td>
            <td>${escapeHtml(e.block || 'N/A')}</td>
            <td>
                <button class="btn btn-delete" onclick="deleteExam('${e.id}')">Delete</button>
            </td>
        </tr>`;
    });
}

$('add-exam-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const exam_program = $('exam_program').value;
    const course_id = $('exam_course_id').value;
    const exam_title = $('exam_title').value.trim();
    const exam_date = $('exam_date').value;
    const exam_status = $('exam_status').value;
    const intake_year = $('exam_intake').value; 
    const block = $('exam_block').value; 
    
    const { error } = await sb.from('cats_exams').insert([{ 
        program_type: exam_program,
        course_id: course_id,
        exam_title: exam_title,
        exam_date: exam_date,
        exam_status: exam_status,
        intake_year: intake_year, 
        block: block 
    }]);

    if (error) {
        showFeedback(`Failed to add exam: ${error.message}`, 'error');
    } else {
        showFeedback('Exam added successfully!', 'success');
        e.target.reset();
        loadExams();
    }

    setButtonLoading(submitButton, false, originalText);
});

async function deleteExam(examId) {
    if (!confirm('Are you sure you want to delete this exam/CAT?')) return;

    const { error } = await sb.from('cats_exams').delete().eq('id', examId);

    if (error) {
        showFeedback(`Failed to delete exam: ${error.message}`, 'error');
    } else {
        showFeedback('Exam deleted successfully!');
        loadExams();
    }
}


/*******************************************************
 * 6. Messages Tab
 *******************************************************/

async function loadMessages() {
    const tbody = $('messages-table');
    tbody.innerHTML = '<tr><td colspan="3">Loading messages...</td></tr>';

    const { data: messages, error } = await fetchData('messages', '*', {}, 'created_at', false);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="3">Error loading messages: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    messages.forEach(m => {
        const messageDate = new Date(m.created_at).toLocaleString();
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(m.program_type)}</td>
            <td>${escapeHtml(m.message_body.substring(0, 100))}...</td>
            <td>${messageDate}</td>
        </tr>`;
    });
}

$('send-message-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const program_type = $('msg_program').value;
    const message_body = $('msg_body').value.trim();
    
    if (!program_type || !message_body) {
        showFeedback('Please select a program and enter a message.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const { error } = await sb.from('messages').insert([{ 
        sender_id: currentUserProfile.id,
        program_type: program_type,
        message_body: message_body,
    }]);

    if (error) {
        showFeedback(`Failed to send message: ${error.message}`, 'error');
    } else {
        showFeedback(`Message sent to ${program_type} students successfully!`, 'success');
        e.target.reset();
        loadMessages();
    }

    setButtonLoading(submitButton, false, originalText);
});


/*******************************************************
 * 7. Resources Tab - COMPLETED LOGIC
 *******************************************************/

async function loadResources() {
    const tbody = $('resources-list');
    tbody.innerHTML = '<tr><td colspan="7">Loading resources...</td></tr>';

    const { data: resources, error } = await fetchData('resources', '*', {}, 'created_at', false);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading resources: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    resources.forEach(r => {
        const uploadDate = new Date(r.created_at).toLocaleDateString();
        // Construct the full file path for deletion (Program_type/filename)
        // Ensure this logic matches the upload path structure
        const fullFilePath = `${r.program_type}/${r.intake_year || 'unknown'}_${r.block || 'unknown'}/${r.file_name}`; 
        
        const fileNameLink = `<a href="${r.file_url}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.file_title || r.file_name)}</a>`;
        
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(r.program_type)}</td>
            <td>${fileNameLink}</td>
            <td>${escapeHtml(r.intake_year || 'N/A')}</td>
            <td>${escapeHtml(r.block || 'N/A')}</td>
            <td>${escapeHtml(r.uploaded_by_name || 'Admin')}</td>
            <td>${uploadDate}</td>
            <td>
                <button class="btn btn-delete" onclick="deleteResource('${r.id}', '${escapeHtml(fullFilePath, true)}')">Delete</button>
            </td>
        </tr>`;
    });
}


async function uploadResource() {
    const submitButton = document.querySelector('#upload-resource-form button');
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);
    
    const fileInput = $('resourceFile');
    const program_type = $('resource_program').value;
    const intake_year = $('resource_intake').value; 
    const block = $('resource_block').value; 
    const file_title = $('resourceTitle').value.trim();

    if (!fileInput.files.length || !program_type || !file_title || !intake_year || !block) {
        showFeedback('Please select a program, intake, block, enter a title, and select a file.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const file = fileInput.files[0];
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}_${safeFileName}`;
    // Store in a folder path that includes program, intake, and block
    const filePath = `${program_type}/${intake_year}_${block}/${fileName}`;

    try {
        // 1. Upload file to storage bucket
        const { error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, file);

        if (uploadError) {
            throw uploadError;
        }

        // 2. Get public URL for the file
        const { data: publicUrlData } = sb.storage
            .from(RESOURCES_BUCKET)
            .getPublicUrl(filePath);

        if (!publicUrlData || !publicUrlData.publicUrl) {
            throw new Error('Failed to get public URL after upload.');
        }

        // 3. Insert record into the 'resources' table
        const { error: dbError } = await sb.from('resources').insert([{
            program_type: program_type,
            intake_year: intake_year, 
            block: block, 
            file_title: file_title,
            file_name: fileName,
            file_url: publicUrlData.publicUrl,
            uploaded_by_id: currentUserProfile.id,
            uploaded_by_name: currentUserProfile.full_name,
        }]);

        if (dbError) {
            showFeedback(`File uploaded, but failed to record in DB: ${dbError.message}. The resource may be unusable.`, 'error');
        } else {
            showFeedback('Resource uploaded and saved successfully!', 'success');
            document.getElementById('upload-resource-form').reset();
            loadResources(); 
        }

    } catch (error) {
        showFeedback(`Upload Failed: ${error.message}`, 'error');
        console.error('Resource upload process error:', error);
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

async function deleteResource(resourceId, fullFilePath) {
    if (!confirm('Are you sure you want to delete this resource? It will be removed from the database and storage.')) return;

    try {
        // 1. Delete file from storage bucket
        const { error: storageError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .remove([fullFilePath]);

        if (storageError && storageError.message !== 'The resource was not found') {
            console.warn(`Storage deletion warning: ${storageError.message}. Proceeding with DB delete.`);
        }
        
        // 2. Delete record from the 'resources' table
        const { error: dbError } = await sb.from('resources').delete().eq('id', resourceId);

        if (dbError) {
            throw dbError;
        }

        showFeedback('Resource and file deleted successfully!', 'success');
        loadResources();

    } catch (error) {
        showFeedback(`Failed to delete resource: ${error.message}`, 'error');
        console.error('Resource deletion error:', error);
    }
}


/*******************************************************
 * 8. Welcome Message Editor
 *******************************************************/

// Load the current message from settings table
async function loadWelcomeMessageForEdit() {
    const { data, error } = await fetchData(SETTINGS_TABLE, '*', { setting_key: MESSAGE_KEY });
    const editor = $('welcome-message-editor');
    const preview = $('live-preview');

    if (data && data.length > 0) {
        const messageHtml = data[0].setting_value;
        editor.value = messageHtml;
        preview.innerHTML = messageHtml;
    } else if (error) {
        showFeedback(`Failed to load welcome message: ${error.message}`, 'error');
        editor.value = '<p class="error-text">Failed to load message.</p>';
        preview.innerHTML = '<p class="error-text">Failed to load message.</p>';
    } else {
        editor.value = '<h1>Welcome Student!</h1><p>Please use the mobile app to check in for attendance. Check the Resources tab for important documents.</p>';
        preview.innerHTML = editor.value;
    }
    
    // Auto-update preview as user types
    editor.addEventListener('input', () => {
        preview.innerHTML = editor.value;
    });
}

// Save the edited message
$('edit-welcome-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);
    
    const setting_value = $('welcome-message-editor').value.trim();
    
    const { error } = await sb.from(SETTINGS_TABLE)
        .upsert({ setting_key: MESSAGE_KEY, setting_value: setting_value, updated_at: new Date().toISOString() }, { onConflict: 'setting_key' });

    if (error) {
        showFeedback(`Failed to save welcome message: ${error.message}`, 'error');
    } else {
        showFeedback('Welcome message updated successfully!', 'success');
        loadStudentWelcomeMessage(); // Refresh dashboard message
    }

    setButtonLoading(submitButton, false, originalText);
});


/*******************************************************
 * 9. INITIALIZATION AND EVENT LISTENERS
 *******************************************************/

// Event Listener for Map Modal Close
document.querySelector('#mapModal .close')?.addEventListener('click', () => {
    $('mapModal').style.display = 'none';
});

// Event Listener for Course Edit Modal Close
document.getElementById('closeCourseEditModal')?.addEventListener('click', () => {
    $('courseEditModal').style.display = 'none';
});

// Event Listener for Resource Upload Form
$('upload-resource-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    await uploadResource();
});

// Event Listener for Attendance Search/Filter
$('attendance-search')?.addEventListener('keyup', filterAttendanceTable);

// Start the application session when the script loads
document.addEventListener('DOMContentLoaded', initSession);
