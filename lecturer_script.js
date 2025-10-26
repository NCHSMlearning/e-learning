// =================================================================
// === NCHSM LECTURER DASHBOARD SCRIPT - FINAL INTEGRATED & CORRECTED VERSION ===
// =================================================================

// === 1. CONFIGURATION, CLIENT SETUP, & GLOBAL VARIABLES ===

if (window.location.pathname.endsWith('.html')) {
    const cleanPath = window.location.pathname.replace(/\.html$/, '');
    window.history.replaceState({}, '', cleanPath);
}
// --- ⚠️ IMPORTANT: SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co'; 
// *** CRITICAL: REPLACE THIS PLACEHOLDER WITH YOUR LIVE ANON KEY ***
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk'; 

// --- Global Supabase Client ---
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Table and Bucket Constants ---
const USER_PROFILE_TABLE = 'consolidated_user_profiles_table';
const COURSES_TABLE = 'courses';
const EXAMS_TABLE = 'cats_exams';  
const SESSIONS_TABLE = 'scheduled_sessions';
const ATTENDANCE_TABLE = 'geo_attendance_logs';
const MESSAGES_TABLE = 'messages'; 
const RESOURCES_TABLE = 'resources';
// --- Storage Buckets ---
const RESOURCES_BUCKET = 'resources'; 

// --- Global Variables & Caches ---
let currentUserProfile = null;
let currentUserId = null; 
let attendanceMap = null; 
let allCourses = []; 
let allStudents = []; // Contains students filtered by lecturerTargetProgram
let lecturerTargetProgram = null; 

// --- Academic Structure Constants (Used for filtering) ---
const ACADEMIC_STRUCTURE = {
    'KRCHN': ['Block A', 'Block B'],
    'TVET': ['Term 1', 'Term 2', 'Term 3']
};

let allIntakes = [
    { id: '2024', name: '2024' },
    { id: '2025', name: '2025' },
    { id: '2026', name: '2026' },
    { id: '2027', name: '2027' },
    { id: '2028', name: '2028' }
]; 

// --- Program Field Mapping (Centralized for fetchDataForLecturer) ---
const PROGRAM_FIELD_MAP = {
    [USER_PROFILE_TABLE]: 'program',
    'student_lecturer_view': 'program',
    [EXAMS_TABLE]: 'target_program',
    [SESSIONS_TABLE]: 'target_program',
    [RESOURCES_TABLE]: 'program_type'
};

// =================================================================
// === 2. CORE UTILITY FUNCTIONS (FINAL VERSION) ===
// =================================================================

const $ = (id) => document.getElementById(id);

function populateSelect(selectElement, data, valueKey, textKey, defaultText) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">-- ${defaultText} --</option>`;
    data?.forEach(item => {
        const text = item[textKey] || item[valueKey];
        const option = document.createElement('option');
        option.value = item[valueKey];
        option.textContent = text;
        option.title = text; // Added title for better UX on long names
        selectElement.appendChild(option);
    });
}

function filterTable(inputId, tableId, columnsToSearch = [0]) {
    const filter = $(inputId)?.value.toUpperCase() || '';
    const tbody = $(tableId);
    if (!tbody) return;

    const trs = tbody.getElementsByTagName('tr');

    for (let i = 0; i < trs.length; i++) {
        let rowMatches = false;
        if (trs[i].getElementsByTagName('td').length <= 1) { 
            trs[i].style.display = "";
            continue;
        }

        for (const colIndex of columnsToSearch) {
            const td = trs[i].getElementsByTagName('td')[colIndex];
            if (td) {
                const txtValue = td.textContent || td.innerText;
                if (txtValue.toUpperCase().indexOf(filter) > -1) {
                    rowMatches = true;
                    break; 
                }
            }
        }
        trs[i].style.display = rowMatches ? "" : "none";
    }
}

function setButtonLoading(button, isLoading, originalText = 'Submit') {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalText = button.dataset.originalText || button.textContent;
        button.textContent = 'Processing...';
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || originalText;
        delete button.dataset.originalText;
    }
}

function showFeedback(message, type) {
    const feedbackEl = $('feedback-message'); 
    if (!feedbackEl) {
        console.warn(`Feedback element not found. Message: [${type.toUpperCase()}] ${message}`);
        alert(message);
        return;
    }

    feedbackEl.textContent = message;
    feedbackEl.className = ''; 
    feedbackEl.classList.add(`feedback-${type}`);
    feedbackEl.style.display = 'block';

    if (type !== 'error') {
        setTimeout(() => {
            feedbackEl.style.display = 'none';
        }, 5000);
    }
}

async function fetchData(tableName, selectQuery = '*', filters = {}, order = 'created_at', ascending = false) {
    let query = sb.from(tableName).select(selectQuery);

    for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') {
            query = query.eq(key, value);
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
 * CRITICAL: Program-Filtered Data Fetching Utility for Lecturers.
 * Used for fetching sessions, exams, resources, etc., based on the lecturer's program.
 */
async function fetchDataForLecturer(
    tableName,
    selectQuery = '*',
    filters = {},
    order = 'created_at',
    ascending = false
) {
    let query = sb.from(tableName).select(selectQuery);

    const programFieldName = PROGRAM_FIELD_MAP[tableName];

    // Apply program filter if table supports it and lecturerTargetProgram is set
    if (programFieldName && lecturerTargetProgram) {
        // Apply filter unless already provided in the filters object
        if (!filters[programFieldName]) {
            query = query.eq(programFieldName, lecturerTargetProgram);
        }
    }

    // Apply additional filters
    for (const key in filters) {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
            query = query.eq(key, filters[key]);
        }
    }

    // Apply sorting
    query = query.order(order, { ascending });

    const { data, error } = await query;
    if (error) {
        console.error(`Error loading ${tableName} (Program Filter Applied: ${lecturerTargetProgram}):`, error);
        return { data: null, error }; 
    }
    return { data, error: null };
}

// =================================================================
// === 3. CORE NAVIGATION, AUTH & INITIALIZATION (FINAL VERSION) ===
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    initSession(); 
});

async function initSession() {
    // Hide the body instantly to prevent content flicker on auth failure
    document.body.style.display = 'none'; 
    
    let profile = null;
    let error = null;

    try {
        const { data: { session: currentSession }, error: sessionError } = await sb.auth.getSession();
        
        if (sessionError || !currentSession) {
            error = sessionError || { message: "No active session found." };
        } else {
            currentUserId = currentSession.user.id; 
            
            const { data: userProfile, error: profileError } = await sb.from(USER_PROFILE_TABLE)
                .select('*')
                .eq('user_id', currentUserId)
                .single();
            
            if (profileError) {
                error = profileError;
            } else if (userProfile.role !== 'lecturer') {
                error = { message: `Access Denied. User role is '${userProfile.role}', expected 'lecturer'.` };
            } else {
                profile = userProfile;
            }
        }

    } catch (e) {
        error = e;
    }
    
    if (profile) {
        currentUserProfile = profile;
        // CRITICAL: Sets the program filter variable (e.g., 'KRCHN')
        lecturerTargetProgram = getProgramFilterFromDepartment(currentUserProfile.department); 

        document.querySelector('header h1').textContent = `Welcome, ${currentUserProfile.full_name || 'Lecturer'}!`;
        
        // Load all data caches based on the new program filter
        await fetchGlobalDataCaches(); 
        
        loadSectionData('dashboard'); 
        setupEventListeners();
        
        // Only show the content if authentication was successful
        document.body.style.display = 'block'; 

    } else {
        // Centralized, graceful failure handling and redirection
        showAuthFailure(error);
    }
}

function showAuthFailure(error) {
    console.error("Initialization Failed, Redirecting to Login:", error);
    
    const errorMessage = error?.message || "No active session found.";
    
    alert(`Authentication Failed: ${errorMessage}\n\nPlease log in again.`);
    
    localStorage.clear(); 

    window.location.assign('/login'); 
}

/**
 * Maps the lecturer's department to the student's program code.
 */
function getProgramFilterFromDepartment(department) {
    if (['Nursing', 'Maternal Health'].includes(department)) {
        return 'KRCHN';
    }
    if (['General Education', 'Clinical Medicine'].includes(department)) {
        return 'TVET';
    }
    return null; 
}


async function fetchGlobalDataCaches() {
    // 1. Fetch all courses (no filtering required here)
    const { data: courses } = await fetchData(COURSES_TABLE, 'course_id, course_name', {}, 'course_name', true);
    allCourses = courses || [];

    // 2. RE-ESTABLISHED SECURE STUDENT FETCH (Server-side filtering for RLS)
    let studentQuery = sb.from(USER_PROFILE_TABLE)
        .select('user_id, full_name, email, program, intake_year, block_term, status')
        .eq('role', 'student');

    // CRITICAL: Apply the program filter to the student's 'program' column at the DB level.
    if (lecturerTargetProgram) {
        studentQuery = studentQuery.eq('program', lecturerTargetProgram);
    }
    
    const { data: students, error: studentError } = await studentQuery.order('full_name', { ascending: true });
    
    if (studentError) {
        console.error("Error fetching filtered students:", studentError);
    }
    
    // allStudents cache now contains only students matching the lecturer's target program (if RLS allows).
    allStudents = students || [];
}


function loadSectionData(tabId) { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    if (!currentUserProfile) return;
    
    switch(tabId) {
        case 'profile': loadLecturerProfile(); break;
        case 'dashboard': loadLecturerDashboardData(); break;
        case 'my-courses': loadLecturerStudents(); break;
        case 'sessions': loadLecturerSessions(); populateSessionFormSelects(); break;
        case 'attendance': loadTodaysAttendanceRecords(); loadAttendanceSelects(); break;
        case 'cats': loadLecturerExams(); populateExamFormSelects(); break;
        case 'resources': loadLecturerResources(); populateResourceFormSelects(); break;
        case 'messages': loadLecturerMessages(); populateMessageFormSelects(); break;
    }
    
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = $(tabId + '-content');
    if (targetSection) {
        targetSection.classList.add('active');
    }

    document.querySelectorAll('.nav a').forEach(link => {
        link.classList.remove('active');
    });
    const activeLink = document.querySelector(`.nav a[data-tab="${tabId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
    
    const sidebar = document.querySelector('.sidebar');
    if (sidebar.classList.contains('active')) {
        toggleSidebar();
    }
}

function setupEventListeners() {
    // General UI
    $('menu-toggle')?.addEventListener('click', toggleSidebar);
    $('logout-btn')?.addEventListener('click', logout);
    
    // Profile
    $('update-photo-btn')?.addEventListener('click', () => { $('photo-upload-input').click(); });
    $('photo-upload-input')?.addEventListener('change', handleProfilePhotoChange); 

    // Forms
    $('add-session-form')?.addEventListener('submit', handleAddSession);
    $('add-exam-form')?.addEventListener('submit', handleAddExam);
    $('upload-resource-form')?.addEventListener('submit', handleUploadResource);
    $('send-message-form')?.addEventListener('submit', handleSendMessage);
    
    // Attendance
    $('manual-attendance-form')?.addEventListener('submit', handleManualAttendance);
    $('attendance-search')?.addEventListener('keyup', () => filterTable('attendance-search', 'attendance-table', [0, 1, 2]));
    $('lecturer-checkin-btn')?.addEventListener('click', lecturerCheckIn); 

    // Resources Edit
    $('edit-resource-form')?.addEventListener('submit', saveResourceEdits);
    $('closeEditResourceModal')?.addEventListener('click', closeEditResourceModal);

    // Search Filters
    $('student-search')?.addEventListener('keyup', () => filterTable('student-search', 'lecturer-students-table', [0, 1]));
    $('exam-search')?.addEventListener('keyup', () => filterTable('exam-search', 'exams-table', [0, 1, 4]));
    $('resource-search')?.addEventListener('keyup', () => filterTable('resource-search', 'resources-list', [0, 1, 2]));


    // Modal closing (simplified)
    document.querySelectorAll('.modal .close').forEach(btn => {
        btn.addEventListener('click', (e) => e.target.closest('.modal').style.display = 'none');
    });
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) { event.target.style.display = 'none'; }
    });
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const body = document.body;
    sidebar.classList.toggle('active');
    body.classList.toggle('no-scroll');
}

async function logout() {
    const { error } = await sb.auth.signOut();
    
    if (error) {
        console.error('Logout error:', error);
        showFeedback('Logout failed. Please try again.', 'error');
    } else {
        // Redirect to /login on logout
        window.location.assign('/login'); 
    }
}

// =================================================================
// === 4. PROFILE & IMAGE HANDLERS ===
// =================================================================

function loadLecturerProfile() {
    if (!currentUserProfile) return;
    
    const avatarUrl = currentUserProfile.avatar_url || 'default_passport.png';
    $('profile-img').src = avatarUrl;
    
    $('profile_name').textContent = currentUserProfile.full_name || 'N/A';
    $('profile_role').textContent = currentUserProfile.role || 'N/A';
    $('profile_id').textContent = currentUserProfile.employee_id || 'N/A';
    $('profile_email').textContent = currentUserProfile.email || 'N/A';
    $('profile_phone').textContent = currentUserProfile.phone || 'N/A';
    $('profile_dept').textContent = currentUserProfile.department || 'N/A';
    $('profile_join_date').textContent = new Date(currentUserProfile.join_date).toLocaleDateString() || 'N/A';
    $('profile_program_focus').textContent = lecturerTargetProgram || 'N/A (No Program Assigned)';
}

function handleProfilePhotoChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => { $('profile-img').src = e.target.result; };
    reader.readAsDataURL(file);

    handlePhotoUpload(file);
}

async function handlePhotoUpload(file) {
    const userId = currentUserProfile.user_id;
    if (!userId) { showFeedback('Error: User ID not found.', 'error'); return; }

    const fileExtension = file.name.split('.').pop();
    const filePath = `avatars/${userId}.${fileExtension}`; 
    
    showFeedback(`Uploading photo: ${file.name}...`, 'info');

    try {
        const { error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, file, { cacheControl: '3600', upsert: true });

        if (uploadError) throw uploadError;
        
        const { data: urlData } = sb.storage.from(RESOURCES_BUCKET).getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl;

        const { error: updateError } = await sb.from(USER_PROFILE_TABLE)
            .update({ avatar_url: publicUrl })
            .eq('user_id', userId);
            
        if (updateError) throw updateError;
        
        currentUserProfile.avatar_url = publicUrl;
        $('profile-img').src = publicUrl; 
        
        showFeedback('✅ Profile photo updated successfully!', 'success');
        
    } catch (error) {
        console.error('Photo Upload Error:', error);
        showFeedback(`Photo upload failed: ${error.message}`, 'error');
        loadLecturerProfile(); 
    }
}

// =================================================================
// === 5. STUDENT, COURSE & DASHBOARD LOADERS (FIXED UI TEXT) ===
// =================================================================

async function loadLecturerDashboardData() {
    $('total_courses_count').textContent = allCourses.length || '0'; 
    $('total_students_count').textContent = allStudents.length || '0';
    
    // FIX: Dynamically update the dashboard filter info text
    const filterInfoEl = $('dashboard-filter-info');
    if (filterInfoEl && lecturerTargetProgram) { 
        filterInfoEl.textContent = `This dashboard is filtered to your assigned program: ${lecturerTargetProgram}. All sections below pertain only to your assignment.`;
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Fetch today's sessions for this lecturer
    const { data: recentSessions } = await fetchDataForLecturer(
        SESSIONS_TABLE,
        'id',
        { lecturer_id: currentUserProfile.user_id, session_date: today }
    );
    
    $('recent_sessions_count').textContent = recentSessions?.length || '0';
}

/**
 * Renders the allStudents cache, which is already filtered by fetchGlobalDataCaches.
 */
async function loadLecturerStudents() {
    const tbody = $('lecturer-students-table');
    if (!tbody) return;

    if (!currentUserProfile || !lecturerTargetProgram) {
        tbody.innerHTML = `
            <tr><td colspan="7">No student program is assigned to your department.</td></tr>`;
        return;
    }
    
    // The allStudents cache is already filtered by fetchGlobalDataCaches via the DB query.
    if (allStudents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">No **${lecturerTargetProgram}** students found in the database matching your department.</td></tr>`;
        return;
    }

    const studentsHtml = allStudents.map(profile => `
        <tr>
            <td>${profile.full_name || 'N/A'}</td>
            <td>${profile.email || 'N/A'}</td>
            <td>${profile.program || 'N/A'}</td>
            <td>${profile.intake_year || 'N/A'}</td>
            <td>${profile.block_term || 'N/A'}</td>
            <td>
                <span class="status status-${(profile.status || 'Active').toLowerCase()}">
                    ${profile.status || 'Active'}
                </span>
            </td>
            <td>
                <button class="btn-action" 
                        onclick="showSendMessageModal('${profile.user_id}', '${profile.full_name}')">
                    Message
                </button>
            </td>
        </tr>
    `).join('');

    tbody.innerHTML = studentsHtml;
}

// =================================================================
// === 6. SESSIONS IMPLEMENTATION ===
// =================================================================

function populateSessionFormSelects() {
    const targetProgram = lecturerTargetProgram;
    const programs = targetProgram ? [{ id: targetProgram, name: targetProgram }] : [];
    
    const programSelect = $('session_program');
    populateSelect(programSelect, programs, 'id', 'name', 'Select Program');
    if (targetProgram) {
        programSelect.value = targetProgram;
        programSelect.disabled = true;
    } else {
        programSelect.disabled = false;
    }

    const blockSelect = $('session_block_term');
    if (targetProgram && ACADEMIC_STRUCTURE[targetProgram]) {
        const blocks = ACADEMIC_STRUCTURE[targetProgram].map(name => ({ id: name, name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${targetProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }

    populateSelect($('session_course_id'), allCourses, 'course_id', 'course_name', 'Select Course');
}

async function handleAddSession(e) {
    e.preventDefault();
    const button = e.submitter;
    setButtonLoading(button, true, 'Schedule Session & Notify Students');
    
    const formData = {
        topic: $('session_topic').value,
        date: $('session_date').value,
        time: $('session_time').value,
        program: $('session_program').value,
        block_term: $('session_block_term').value,
        course_id: $('session_course_id').value
    };

    if (Object.values(formData).some(v => !v)) {
        showFeedback('Please fill in all session details.', 'error');
        setButtonLoading(button, false);
        return;
    }

    try {
        const { error } = await sb.from(SESSIONS_TABLE).insert({
            session_topic: formData.topic,
            session_date: formData.date,
            session_time: formData.time,
            target_program: formData.program, // Matches 'target_program' in SESSIONS_TABLE
            block_term: formData.block_term,
            course_id: formData.course_id,
            lecturer_id: currentUserProfile.user_id,
            lecturer_name: currentUserProfile.full_name
        });

        if (error) throw error;

        showFeedback(`✅ Session "${formData.topic}" scheduled successfully!`, 'success');
        e.target.reset();
        loadLecturerSessions(); 
    } catch (error) {
        console.error('Session scheduling failed:', error);
        showFeedback(`Scheduling failed: ${error.message}`, 'error');
    } finally {
        setButtonLoading(button, false);
    }
}

async function loadLecturerSessions() { 
    const tbody = $('sessions-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading your scheduled sessions...</td></tr>';
    
    // CRITICAL: Filtered by lecturer_id AND program via fetchDataForLecturer
    const { data: sessions, error } = await fetchDataForLecturer(
        SESSIONS_TABLE, 
        '*', 
        { lecturer_id: currentUserProfile.user_id }, 
        'session_date', 
        true
    );
    
    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`;
        return;
    }

    if (sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No scheduled sessions found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = sessions.map(s => {
        const courseName = allCourses.find(c => c.course_id === s.course_id)?.course_name || s.course_id;
        const dateTime = `${new Date(s.session_date).toLocaleDateString()} @ ${s.session_time}`;
        return `
            <tr>
                <td>${s.session_topic}</td>
                <td>${dateTime}</td>
                <td>${courseName}</td>
                <td>${s.target_program}/${s.block_term}</td>
                <td><a href="#" onclick="navigator.clipboard.writeText('Session URL for ${s.id}').then(() => showFeedback('Attendance Link Copied!', 'info'))">Copy Link</a></td>
                <td><button class="btn-action" style="background-color:#F59E0B;" onclick="showFeedback('Editing session ${s.id}...', 'info')">Edit</button></td>
            </tr>
        `;
    }).join('');
}

// =================================================================
// === 7. ATTENDANCE & MAP LOGIC ===
// =================================================================

function loadAttendanceSelects() {
    // Uses allStudents cache which is already program-filtered
    populateSelect($('att_student_id'), allStudents, 'user_id', 'full_name', 'Select Student');
    populateSelect($('att_course_id'), allCourses, 'course_id', 'course_name', 'Select Course (Optional)');
}

async function lecturerCheckIn() {
    const button = $('lecturer-checkin-btn');
    setButtonLoading(button, true, 'Mark My Attendance Now');

    if (!navigator.geolocation) {
        showFeedback('Geolocation is not supported by your browser.', 'error');
        setButtonLoading(button, false);
        return;
    }
    
    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const checkinTime = new Date().toISOString();
        const locationDetails = `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
        
        try {
            const { error } = await sb.from(ATTENDANCE_TABLE).insert({
                user_id: currentUserProfile.user_id,
                user_role: currentUserProfile.role,
                session_type: 'Lecturer Check-in',
                check_in_time: checkinTime,
                latitude: latitude,
                longitude: longitude,
                location_details: locationDetails,
                status: 'Present'
            });
            
            if (error) throw error;
            
            showFeedback('✅ Your attendance has been logged successfully!', 'success');
            loadTodaysAttendanceRecords();
            
        } catch (error) {
            console.error('Check-in failed:', error);
            showFeedback(`Check-in failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(button, false);
        }
    }, (error) => {
        console.error('Geolocation Error:', error);
        showFeedback(`Geolocation failed: ${error.message}. Please enable location services.`, 'error');
        setButtonLoading(button, false);
    });
}

async function handleManualAttendance(e) {
    e.preventDefault();
    const button = e.submitter;
    setButtonLoading(button, true, 'Manually Mark Student Present');
    
    const formData = {
        student_id: $('att_student_id').value,
        session_type: $('att_session_type').value,
        course_id: $('att_course_id').value,
        location: $('att_location').value,
        date: $('att_date').value,
        time: $('att_time').value
    };

    if (!formData.student_id || !formData.session_type || !formData.date) {
        showFeedback('Please fill in Student, Session Type, and Date.', 'error');
        setButtonLoading(button, false);
        return;
    }
    
    const studentProfile = allStudents.find(s => s.user_id === formData.student_id);
    if (!studentProfile) {
        showFeedback('Selected student profile not found in cache. Reload the page.', 'error');
        setButtonLoading(button, false);
        return;
    }

    const checkinDateTime = `${formData.date}T${formData.time || '12:00'}:00.000Z`;

    try {
        const { error } = await sb.from(ATTENDANCE_TABLE).insert({
            user_id: formData.student_id,
            user_role: 'student', 
            session_type: formData.session_type,
            check_in_time: checkinDateTime,
            course_id: formData.course_id || null,
            location_details: `MANUAL ENTRY: ${formData.location || 'N/A'} (By ${currentUserProfile.full_name})`,
            status: 'Present',
            recorded_by_id: currentUserProfile.user_id, 
            recorded_by_name: currentUserProfile.full_name 
        });

        if (error) throw error;

        showFeedback(`✅ Attendance for ${studentProfile.full_name} marked present successfully!`, 'success');
        e.target.reset();
        loadTodaysAttendanceRecords();
    } catch (error) {
        console.error('Manual attendance failed:', error);
        showFeedback(`Manual attendance failed: ${error.message}`, 'error');
    } finally {
        setButtonLoading(button, false);
    }
}

async function loadTodaysAttendanceRecords() {
    const tbody = $('attendance-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Loading today\'s records...</td></tr>';
    
    const today = new Date().toISOString().split('T')[0];
    
    // FIX: Using Supabase's .or() filter to efficiently fetch only relevant logs.
    // It filters for logs where the user_role is 'lecturer' OR the user's program matches the lecturerTargetProgram.
    const { data: logs, error } = await sb
      .from(ATTENDANCE_TABLE)
      // Select attendance logs, and join to get the user's name and program
      .select(`*, user:user_id(full_name, program)`)   
      // CRITICAL: Filter logs to lecturer's own or students in their target program
      // NOTE: This assumes RLS is configured to allow the lecturer to see logs where user.program matches lecturerTargetProgram
      .or(`user_role.eq.lecturer,user.program.eq.${lecturerTargetProgram}`) 
      .gte('check_in_time', today)
      .order('check_in_time', { ascending: false });

    if (error) {
      tbody.innerHTML = `<tr><td colspan="7">Error loading logs: ${error.message}</td></tr>`;
      return;
    }

    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7">No relevant attendance records found for today.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    logs.forEach(l => {
        // Only use currentUserProfile.full_name if the log is THIS lecturer's check-in
        const userName = l.user?.full_name || (l.user_role === 'lecturer' && l.user_id === currentUserProfile.user_id ? currentUserProfile.full_name : 'N/A');
        const target = allCourses.find(c => c.course_id === l.course_id)?.course_name || l.course_id || 'General';
        const dateTime = new Date(l.check_in_time).toLocaleTimeString();
        const locationText = l.location_details || 'N/A';
        const geoId = `geo-${l.id}`;

        let rowHtml = `
            <tr>
                <td>${userName}</td>
                <td>${l.session_type || 'N/A'}</td>
                <td>${target}</td>
                <td id="${geoId}">${locationText}</td> 
                <td>${dateTime}</td>
                <td><span class="status status-${(l.status || 'N/A').toLowerCase()}">${l.status}</span></td>
                <td>
                    <button onclick="viewCheckInMap(${l.latitude}, ${l.longitude}, '${userName}', '${geoId}')" 
                            class="btn-action" 
                            ${!l.latitude || !l.longitude ? 'disabled title="No Geo-location recorded"' : ''}>
                        View Map
                    </button>
                </td>
            </tr>
        `;
        tbody.innerHTML += rowHtml;
    });
}

function viewCheckInMap(lat, lng, name, locationElementId) {
    const mapModal = $('mapModal');
    mapModal.style.display = 'block';

    if (attendanceMap) {
        attendanceMap.remove();
    }

    const locationText = $(locationElementId)?.textContent || 'N/A';
    $('map-details').textContent = `Location for ${name}: ${locationText}`;
    
    // NOTE: This assumes you have the Leaflet.js library (L.map) included in your HTML
    attendanceMap = L.map('mapbox-map').setView([lat, lng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(attendanceMap);

    L.marker([lat, lng]).addTo(attendanceMap)
        .bindPopup(`<b>${name}'s Check-in Location</b><br>${locationText}`).openPopup();
        
    setTimeout(() => {
        attendanceMap.invalidateSize();
    }, 300); 
}

// =================================================================
// === 8. EXAMS, RESOURCES, MESSAGING (PLACEHOLDER FUNCTIONS) ===
// =================================================================

// NOTE: Implementations for these sections need to be added using the fetchDataForLecturer utility.
// These are included to complete the flow outlined in loadSectionData.

async function loadLecturerExams() {
    const { data: exams } = await fetchDataForLecturer(EXAMS_TABLE, '*', { lecturer_id: currentUserProfile.user_id }, 'exam_date', false);
    const tbody = $('exams-table');
    if (tbody) {
        tbody.innerHTML = exams?.length ? exams.map(e => `
            <tr>
                <td>${e.exam_name}</td>
                <td>${allCourses.find(c => c.course_id === e.course_id)?.course_name || e.course_id}</td>
                <td>${e.target_program}/${e.block_term}</td>
                <td>${new Date(e.exam_date).toLocaleDateString()}</td>
                <td>${e.total_marks}</td>
                <td><button class="btn-action" onclick="showFeedback('Upload results for ${e.id}', 'info')">Upload Results</button></td>
            </tr>
        `).join('') : '<tr><td colspan="6">No exams found for your program.</td></tr>';
    }
}
function populateExamFormSelects() { /* Implementation required */ }
function handleAddExam(e) { /* Implementation required */ }

async function loadLecturerResources() {
    const { data: resources } = await fetchDataForLecturer(RESOURCES_TABLE, '*', null, 'uploaded_at', false);
    const list = $('resources-list');
    if (list) {
        list.innerHTML = resources?.length ? resources.map(r => `
            <li class="resource-item">
                <span>${r.title} (${r.program_type})</span>
                <div>
                    <a href="${r.file_url}" target="_blank" class="btn-action view">View</a>
                    <button class="btn-action edit" onclick="showFeedback('Editing ${r.id}', 'info')">Edit</button>
                </div>
            </li>
        `).join('') : '<li>No resources found for your program.</li>';
    }
}
function populateResourceFormSelects() { /* Implementation required */ }
function handleUploadResource(e) { /* Implementation required */ }
function saveResourceEdits() { /* Implementation required */ }
function closeEditResourceModal() { $('editResourceModal').style.display = 'none'; }


async function loadLecturerMessages() {
    const { data: messages } = await fetchData(MESSAGES_TABLE, '*', { receiver_id: currentUserProfile.user_id }, 'sent_at', false);
    const tbody = $('messages-table');
    if (tbody) {
        tbody.innerHTML = messages?.length ? messages.map(m => `
            <tr>
                <td>${m.sender_name}</td>
                <td>${m.subject}</td>
                <td>${new Date(m.sent_at).toLocaleString()}</td>
                <td><button class="btn-action" onclick="showFeedback('Viewing message ${m.id}', 'info')">View</button></td>
            </tr>
        `).join('') : '<tr><td colspan="4">No messages found.</td></tr>';
    }
}
function populateMessageFormSelects() { /* Implementation required */ }
function handleSendMessage(e) { /* Implementation required */ }
function showSendMessageModal(userId, fullName) { /* Implementation required */ }
