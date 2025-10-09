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

async function loadSectionData(tabId) {
    switch(tabId) {
        case 'dashboard': 
            loadDashboardData(); 
            loadStudentWelcomeMessage(); // Load student-facing message
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
    tbody.innerHTML = '<tr><td colspan="7">Loading students...</td></tr>';
    
    const { data: students, error } = await fetchData('profiles', '*', { role: 'student' }, 'full_name', true);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading students: ${error.message}</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    students.forEach(s => {
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(s.id.substring(0, 8))}...</td>
            <td>${escapeHtml(s.full_name)}</td>
            <td>${escapeHtml(s.email)}</td>
            <td>${escapeHtml(s.program_type || 'N/A')}</td>
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
    const approved = true; 

    const { data: { user }, error: authError } = await sb.auth.signUp({
        email: email,
        password: password,
        options: {
            data: { full_name: name, role: role, phone: phone, program_type: program_type, approved: approved }
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
    tbody.innerHTML = '<tr><td colspan="3">Loading courses...</td></tr>';

    const { data: courses, error } = await fetchData('courses', '*', {}, 'course_name', true);
    if (error) {
        tbody.innerHTML = `<tr><td colspan="3">Error loading courses: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    courses.forEach(c => {
        // Use escapeHtml(..., true) for string parameters in inline JS calls
        const courseNameAttr = escapeHtml(c.course_name, true);
        const descriptionAttr = escapeHtml(c.description || '', true);

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(c.course_name)}</td>
            <td>${escapeHtml(c.description || 'N/A')}</td>
            <td>
                <button class="btn-action" onclick="openEditCourseModal('${c.id}', '${courseNameAttr}', '${descriptionAttr}')">Edit</button>
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

    const { error } = await sb.from('courses').insert({ course_name, description });

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
function openEditCourseModal(id, name, description) {
    $('edit_course_id').value = id;
    $('edit_course_name').value = name; 
    $('edit_course_description').value = description;

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
        const { error } = await sb
            .from('courses')
            .update({ course_name: name, description: description })
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

async function loadAttendance() {
    const tbody = $('attendance-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading records...</td></tr>';
    
    const { data: records, error } = await fetchData(
        'geo_attendance_logs', 
        '*, profile:student_id(full_name, program_type)', 
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
        
        let locationText;
        let mapButton = '';
        if (r.latitude && r.longitude) {
            locationText = `Geo-Log: ${r.location_name || 'Coordinates'}`;
            mapButton = `<button class="btn btn-map" onclick="showMap('${r.latitude}', '${r.longitude}', '${escapeHtml(r.location_name || 'Check-in Location', true)}', '${escapeHtml(studentName, true)}', '${dateTime}')">View Map</button>`;
        } else {
            locationText = `Manual: ${r.location_name || 'N/A'}`;
        }
        
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(studentName)}</td>
            <td>${escapeHtml(r.session_type || 'N/A')}</td>
            <td>${locationText}</td>
            <td>${dateTime}</td>
            <td>${r.latitude ? 'Yes' : 'No'}</td>
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
        const td = trs[i].getElementsByTagName('td')[0];
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
    const course_id = $('att_course_id').value || null;
    const location_name = $('att_location').value.trim() || 'Manual Entry';
    const date = $('att_date').value;
    const time = $('att_time').value;
    
    const check_in_time = time ? `${date}T${time}:00.000Z` : `${date}T00:00:00.000Z`;
    
    const record = {
        student_id,
        session_type,
        course_id,
        location_name,
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
    }
    setButtonLoading(submitButton, false, originalText);
});

async function markMyAttendance() {
    const button = document.querySelector('.btn-attendance');
    const originalText = button.textContent;
    setButtonLoading(button, true, 'Getting Location...');
    
    try {
        const coords = await getGeoLocation();
        const { latitude, longitude, accuracy } = coords;
        
        const location_name = await reverseGeocode(latitude, longitude);

        const record = {
            student_id: currentUserProfile.id,
            session_type: 'office', 
            location_name,
            latitude,
            longitude,
            accuracy,
            check_in_time: new Date().toISOString(),
            ip_address: await getIPAddress(),
            device_id: getDeviceId(),
        };

        const { error } = await sb.from('geo_attendance_logs').insert([record]);

        if (error) {
            showFeedback(`Geo-Log Error: ${error.message}`, 'error');
        } else {
            showFeedback(`Your location successfully logged at: ${location_name}`, 'success');
            loadAttendance();
            loadDashboardData();
        }
        
    } catch (error) {
        showFeedback(`Failed to get location: ${error.message}`, 'error');
    }

    setButtonLoading(button, false, originalText);
}

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
}


/*******************************************************
 * 5. CATS / Exams Tab
 *******************************************************/

async function loadExams() {
    const tbody = $('exams-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading exams...</td></tr>';
    
    const { data: exams, error } = await fetchData(
        'cats_exams', 
        '*, course:course_id(course_name)', 
        {}, 
        'exam_date', 
        false 
    );

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error loading exams: ${error.message}</td></tr>`;
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
    
    const { error } = await sb.from('cats_exams').insert([{ 
        program_type: exam_program,
        course_id: course_id,
        exam_title: exam_title,
        exam_date: exam_date,
        exam_status: exam_status
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
 * 7. Resources Tab
 *******************************************************/

async function loadResources() {
    const tbody = $('resources-list');
    tbody.innerHTML = '<tr><td colspan="5">Loading resources...</td></tr>';

    const { data: resources, error } = await fetchData('resources', '*', {}, 'created_at', false);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5">Error loading resources: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    resources.forEach(r => {
        const uploadDate = new Date(r.created_at).toLocaleDateString();
        const fileNameLink = `<a href="${r.file_url}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.file_title || r.file_name)}</a>`;
        
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(r.program_type)}</td>
            <td>${fileNameLink}</td>
            <td>${escapeHtml(r.uploaded_by_name || 'Admin')}</td>
            <td>${uploadDate}</td>
            <td>
                <button class="btn btn-delete" onclick="deleteResource('${r.id}', '${escapeHtml(r.file_name, true)}')">Delete</button>
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
    const file_title = $('resourceTitle').value.trim();

    if (!fileInput.files.length || !program_type || !file_title) {
        showFeedback('Please select a program, enter a title, and select a file.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const file = fileInput.files[0];
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = `${program_type}/${fileName}`;

    try {
        // 1. Upload file to storage bucket
        const { error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Get the public URL for the file
        const { data: { publicUrl } } = sb.storage
            .from(RESOURCES_BUCKET)
            .getPublicUrl(filePath);

        // 3. Insert record into the database
        const { error: dbError } = await sb.from('resources').insert([{
            program_type: program_type,
            file_name: fileName,
            file_title: file_title,
            file_url: publicUrl,
            uploaded_by_id: currentUserProfile.id,
            uploaded_by_name: currentUserProfile.full_name || 'Admin'
        }]);

        if (dbError) throw dbError;

        showFeedback(`Resource "${file_title}" uploaded successfully!`, 'success');
        document.getElementById('upload-resource-form').reset();
        loadResources();

    } catch (e) {
        showFeedback(`Resource Upload Failed: ${e.message}`, 'error');
        console.error('Resource upload error:', e);
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

async function deleteResource(resourceId, fileName) {
    if (!confirm('Are you sure you want to delete this resource file and record?')) return;

    try {
        // 1. Delete the record from the database
        const { error: dbError } = await sb.from('resources').delete().eq('id', resourceId);

        if (dbError) throw dbError;

        // Note: Actual file deletion from storage is omitted here for simplicity but should be handled server-side/via an edge function for security/accuracy.
        
        showFeedback('Resource record deleted successfully!', 'success');
        loadResources();

    } catch (e) {
        showFeedback(`Failed to delete resource: ${e.message}`, 'error');
    }
}


/*******************************************************
 * 8. Welcome Message Editor Tab
 *******************************************************/

/** Loads the welcome message into the student dashboard view */
async function loadStudentWelcomeMessage() {
    try {
        const targetElement = document.getElementById('student-welcome-message');
        if (!targetElement) return;

        const { data } = await sb
            .from(SETTINGS_TABLE)
            .select('value')
            .eq('key', MESSAGE_KEY)
            .single();

        if (data) {
            targetElement.innerHTML = data.value;
        } else {
            targetElement.innerHTML = '<p style="color: gray;">(Welcome message not yet set.)</p>';
        }

    } catch (e) {
        console.error('Error in loadStudentWelcomeMessage:', e);
    }
}

/** Loads the welcome message into the Admin editor textarea and preview */
async function loadWelcomeMessageForEdit() {
    const editor = $('welcome-message-editor');
    const preview = $('live-preview');
    if (!editor || !preview) return;
    
    await loadStudentWelcomeMessage(); 

    try {
        const { data } = await sb
            .from(SETTINGS_TABLE)
            .select('value')
            .eq('key', MESSAGE_KEY)
            .single();

        if (data) {
            editor.value = data.value;
            preview.innerHTML = data.value;
        } else {
            const defaultMessage = '<h1>Welcome to the Student Portal!</h1><p>Customize this message here. **HTML is supported!**</p>';
            editor.value = defaultMessage;
            preview.innerHTML = defaultMessage;
        }

    } catch (e) {
        console.error('Error loading message for edit:', e);
    }
}

// Update the live preview as admin types
$('welcome-message-editor')?.addEventListener('input', () => {
    $('live-preview').innerHTML = $('welcome-message-editor').value;
});

// Save the message to Supabase
$('edit-welcome-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    const newContent = $('welcome-message-editor').value;
    const statusDiv = $('editor-status');
    setButtonLoading(submitButton, true, originalText);

    try {
        const { error } = await sb
            .from(SETTINGS_TABLE)
            .upsert({ key: MESSAGE_KEY, value: newContent }, { onConflict: 'key' });

        if (error) throw error;

        statusDiv.style.color = 'green';
        statusDiv.textContent = 'Welcome Message saved successfully!';
        loadStudentWelcomeMessage(); 

        setTimeout(() => statusDiv.textContent = '', 3000);

    } catch (e) {
        statusDiv.style.color = 'red';
        statusDiv.textContent = 'Error saving message: ' + (e.message || e);
        console.error(e);
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

// Basic modal close functionality for the course edit modal and map modal
window.onclick = function(event) {
    const courseModal = $('courseEditModal');
    const mapModal = $('mapModal');
    if (event.target === courseModal) {
        courseModal.style.display = "none";
    }
    if (event.target === mapModal) {
        mapModal.style.display = "none";
    }
}


// --- INITIALIZATION CALLS ---
document.addEventListener('DOMContentLoaded', initSession);
