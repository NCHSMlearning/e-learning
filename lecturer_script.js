// =================================================================
// === NCHSM LECTURER DASHBOARD SCRIPT - FINAL INTEGRATED VERSION ===
// =================================================================

// === 1. CONFIGURATION, CLIENT SETUP, & GLOBAL VARIABLES ===

// --- ⚠️ IMPORTANT: SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';

// --- Global Supabase Client ---
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Table and Bucket Constants ---
const USER_PROFILE_TABLE = 'consolidated_user_profiles_table'; 
const COURSES_TABLE = 'courses'; 
const EXAMS_TABLE = 'exams_cats'; 
const SESSIONS_TABLE = 'scheduled_sessions'; 
const ATTENDANCE_TABLE = 'geo_attendance_logs'; 
const MESSAGES_TABLE = 'announcements'; 
const RESOURCES_TABLE = 'resources'; 

const RESOURCES_BUCKET = 'resources'; 

// --- Global Variables & Caches ---
let currentUserProfile = null;
let attendanceMap = null; 
let allCourses = []; 
let allStudents = []; 
let lecturerTargetProgram = null; // e.g., 'KRCHN' or 'TVET'

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


// =================================================================
// === 2. CORE UTILITY FUNCTIONS (WITH PROGRAM-FILTERED FETCH) ===
// =================================================================

function $(id){ return document.getElementById(id); }

function populateSelect(selectElement, data, valueKey, textKey, defaultText) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">-- ${defaultText} --</option>`;
    data?.forEach(item => {
        const text = item[textKey] || item[valueKey];
        const option = document.createElement('option');
        option.value = item[valueKey];
        option.textContent = text;
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

// NOTE: This remains the generic fetch for non-program-specific tables (like messages/courses)
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
 * CRITICAL: Program-Filtered Data Fetching Utility for Lecturers.
 * Applies the lecturer's 'lecturerTargetProgram' (KRCHN/TVET) filter 
 * to relevant tables (Students, Exams, Sessions, Resources).
 */
async function fetchDataForLecturer(tableName, selectQuery = '*', filters = {}, order = 'created_at', ascending = false) {
    let query = sb.from(tableName).select(selectQuery);
    
    const isProgramTable = [
        USER_PROFILE_TABLE, 'student_lecturer_view', // Students
        EXAMS_TABLE,        // Exams/Cats
        SESSIONS_TABLE,     // Sessions
        RESOURCES_TABLE,    // Shared Resources
        ATTENDANCE_TABLE    // Attendance
    ].includes(tableName);

    // Apply the lecturer's target program filter if it exists and the table is relevant
    if (isProgramTable && lecturerTargetProgram) {
        let programFieldName = '';
        if (tableName === USER_PROFILE_TABLE || tableName === 'student_lecturer_view') {
            programFieldName = 'student_program';
        } else if (tableName === EXAMS_TABLE || tableName === SESSIONS_TABLE || tableName === RESOURCES_TABLE) {
            programFieldName = 'program';
        } else if (tableName === ATTENDANCE_TABLE) {
            // Attendance filtering is often done post-query on related student profile, 
            // but we can try filtering on the profile link if Supabase allows it.
            // For now, we apply profile-link filter in the attendance load function itself 
            // for simplicity, but we keep the logic here for other program tables.
        }
        
        if (programFieldName) {
            // Apply the program filter, unless a specific program filter was already provided
            if (!filters[programFieldName]) {
                 query = query.eq(programFieldName, lecturerTargetProgram);
            }
        }
    }
    
    // Apply existing filters
    for (const key in filters) {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
            query = query.eq(key, filters[key]);
        }
    }
    
    query = query.order(order, { ascending });

    const { data, error } = await query;
    if (error) {
        console.error(`Error loading ${tableName} (Program Filter Applied: ${lecturerTargetProgram}):`, error);
        return { data: null, error };
    }
    return { data, error: null };
}

async function reverseGeocodeAndDisplay(lat, lng, elementId) {
    const el = $(elementId);
    if (!el) return;
    el.textContent = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} (Fetching address...)`;

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.display_name) {
            el.textContent = data.display_name;
        } else {
            el.textContent = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} (Address not found)`;
        }
    } catch (error) {
        console.error("Reverse Geocoding Error:", error);
        el.textContent = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} (Geocoding failed)`;
    }
}


// =================================================================
// === 3. CORE NAVIGATION, AUTH & INITIALIZATION ===
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    initSession(); 
});

async function initSession() {
    let profile = null;
    let error = null;

    try {
        const { data: { session }, error: sessionError } = await sb.auth.getSession();
        
        if (sessionError || !session) {
            error = sessionError || { message: "No active session found." };
        } else {
            const { data: userProfile, error: profileError } = await sb.from(USER_PROFILE_TABLE)
                .select('*')
                .eq('user_id', session.user.id)
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
        lecturerTargetProgram = getProgramFilterFromDepartment(currentUserProfile.department);

        document.querySelector('header h1').textContent = `Welcome, ${currentUserProfile.full_name || 'Lecturer'}!`;
        await fetchGlobalDataCaches(); 
        loadSectionData('dashboard'); 
        setupEventListeners();
    } else {
        console.error("Initialization Failed, Redirecting to Login:", error);
        alert("Authentication Failed: No active session found.\n\nPlease log in again.");
        window.location.reload(); 
    }
}

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
    // All courses are fetched without program filtering
    const { data: courses } = await fetchData(COURSES_TABLE, 'course_id, course_name', {}, 'course_name', true);
    allCourses = courses || [];

    // CRITICAL: Filter students by program using the new function
    const { data: students } = await fetchDataForLecturer(
        USER_PROFILE_TABLE, 
        'user_id, full_name, email, student_program, intake_year, block_term, status', 
        { role: 'student' },
        'full_name', 
        true
    );
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
        window.location.reload(); 
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
// === 5. STUDENT, COURSE & DASHBOARD LOADERS ===
// =================================================================

async function loadLecturerDashboardData() {
    $('total_courses_count').textContent = allCourses.length || '0'; 
    $('total_students_count').textContent = allStudents.length || '0';
    
    const today = new Date().toISOString().split('T')[0];
    
    // Use fetchDataForLecturer to ensure program filtering on sessions
    const { data: recentSessions } = await fetchDataForLecturer(SESSIONS_TABLE, 'id', { 
        lecturer_id: currentUserProfile.user_id,
        session_date: today 
    });
    
    $('recent_sessions_count').textContent = recentSessions?.length || '0';
}

async function loadLecturerStudents() {
    if (!currentUserProfile || !lecturerTargetProgram) {
        $('lecturer-students-table').innerHTML = `<tr><td colspan="7">No student program is assigned to your department.</td></tr>`;
        return;
    }

    const tbody = $('lecturer-students-table');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7">Loading assigned students...</td></tr>';
    
    // Students are already filtered by program in allStudents cache (see fetchGlobalDataCaches)
    const studentsHtml = allStudents.map(profile => {
        return `
            <tr>
                <td>${profile.full_name || 'N/A'}</td>
                <td>${profile.email || 'N/A'}</td>
                <td>${profile.student_program || 'N/A'}</td>
                <td>${profile.intake_year || 'N/A'}</td>
                <td>${profile.block_term || 'N/A'}</td>
                <td><span style="color:${profile.status === 'Active' ? '#10B981' : '#F59E0B'}">${profile.status || 'Active'}</span></td>
                <td><button class="btn-action" onclick="showSendMessageModal('${profile.user_id}', '${profile.full_name}')">Message</button></td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = studentsHtml.length > 0 
        ? studentsHtml 
        : `<tr><td colspan="7">No ${lecturerTargetProgram} students found.</td></tr>`;
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
            program: formData.program, // Filtered by program
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
                <td>${s.program}/${s.block_term}</td>
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
        showFeedback('Selected student profile not found in cache.', 'error');
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
    
    // Fetch all attendance logs for today. We filter them locally using the cached student profiles.
    const { data: logs, error } = await sb.from(ATTENDANCE_TABLE)
        .select(`*, user:user_id(full_name, student_program)`)
        .gte('check_in_time', today)
        .order('check_in_time', { ascending: false });
        
    if (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading logs: ${error.message}</td></tr>`;
        return;
    }

    // Filter logs to only show records for students in the lecturer's program or the lecturer's own check-ins
    const filteredLogs = logs.filter(l => 
        l.user?.student_program === lecturerTargetProgram || l.user_role === 'lecturer'
    );

    if (!filteredLogs || filteredLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No relevant attendance records found for today.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filteredLogs.forEach(l => {
        const userName = l.user?.full_name || (l.user_role === 'lecturer' ? currentUserProfile.full_name : 'N/A');
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
                <td><span style="color:${l.status === 'Present' ? '#10B981' : '#EF4444'}">${l.status}</span></td>
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

        if (l.latitude && l.longitude && locationText.includes('Lat:') && locationText.includes('Lng:')) {
            reverseGeocodeAndDisplay(l.latitude, l.longitude, geoId);
        }
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
// === 8. EXAMS/CATS IMPLEMENTATION ===
// =================================================================

function populateExamFormSelects() {
    const targetProgram = lecturerTargetProgram;
    const programs = targetProgram ? [{ id: targetProgram, name: targetProgram }] : [];
    
    const examProgramSelect = $('exam_program');
    populateSelect(examProgramSelect, programs, 'id', 'name', 'Select Program');
    if (targetProgram) {
        examProgramSelect.value = targetProgram;
        examProgramSelect.disabled = true;
    } else {
        examProgramSelect.disabled = false;
    }

    populateSelect($('exam_course_id'), allCourses, 'course_id', 'course_name', 'Select Course');
    populateSelect($('exam_intake'), allIntakes, 'id', 'name', 'Select Intake Year');

    const blockSelect = $('exam_block_term');
    const selectedProgram = targetProgram; 

    if (selectedProgram && ACADEMIC_STRUCTURE[selectedProgram]) {
        const blocks = ACADEMIC_STRUCTURE[selectedProgram].map(name => ({ id: name, name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${selectedProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }
}

async function handleAddExam(e) {
    e.preventDefault();
    const button = e.submitter;
    setButtonLoading(button, true, 'Create Exam Record');

    const formData = {
        name: $('exam_name').value,
        date: $('exam_date').value,
        type: $('exam_type').value,
        program: $('exam_program').value,
        intake: $('exam_intake').value,
        block_term: $('exam_block_term').value,
        course_id: $('exam_course_id').value
    };

    if (Object.values(formData).some(v => !v)) {
        showFeedback('Please fill in all exam details.', 'error');
        setButtonLoading(button, false);
        return;
    }

    try {
        const { error } = await sb.from(EXAMS_TABLE).insert({
            exam_name: formData.name,
            exam_date: formData.date,
            exam_type: formData.type,
            program: formData.program, // Filtered by program
            intake: formData.intake,
            block_term: formData.block_term,
            course_id: formData.course_id,
            lecturer_id: currentUserProfile.user_id,
            status: 'Pending Grading'
        });

        if (error) throw error;

        showFeedback(`✅ Exam "${formData.name}" created successfully!`, 'success');
        e.target.reset();
        loadLecturerExams(); 
    } catch (error) {
        console.error('Exam creation failed:', error);
        showFeedback(`Exam creation failed: ${error.message}`, 'error');
    } finally {
        setButtonLoading(button, false);
    }
}

async function loadLecturerExams() { 
    const tbody = $('exams-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading your exams/CATS...</td></tr>';
    
    // CRITICAL: Filtered by lecturer_id AND program via fetchDataForLecturer
    const { data: exams, error } = await fetchDataForLecturer(
        EXAMS_TABLE, 
        '*', 
        { lecturer_id: currentUserProfile.user_id }, 
        'exam_date', 
        false
    );
    
    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`;
        return;
    }

    if (exams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No exam/CAT records found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = exams.map(e => {
        const courseName = allCourses.find(c => c.course_id === e.course_id)?.course_name || e.course_id;
        return `
            <tr>
                <td>${e.exam_name}</td>
                <td>${courseName}</td>
                <td>${new Date(e.exam_date).toLocaleDateString()}</td>
                <td>${e.exam_type}</td>
                <td>${e.program} (${e.block_term})</td>
                <td><button class="btn-action" onclick="openGradeModal('${e.id}', '${e.exam_name}')">Grade/Action</button></td>
            </tr>
        `;
    }).join('');
}


// =================================================================
// === 9. RESOURCES IMPLEMENTATION ===
// =================================================================

function populateResourceFormSelects() {
    const targetProgram = lecturerTargetProgram;
    const programs = targetProgram ? [{ id: targetProgram, name: targetProgram }] : [];
    
    const resourceProgramSelect = $('resource_program');
    populateSelect(resourceProgramSelect, programs, 'id', 'name', 'Select Target Program');
    if (targetProgram) {
        resourceProgramSelect.value = targetProgram;
        resourceProgramSelect.disabled = true;
    } else {
        resourceProgramSelect.disabled = false;
    }

    populateSelect($('resource_intake'), allIntakes, 'id', 'name', 'Select Target Intake');

    const blockSelect = $('resource_block');
    const selectedProgram = targetProgram;
    
    if (selectedProgram && ACADEMIC_STRUCTURE[selectedProgram]) {
        const blocks = ACADEMIC_STRUCTURE[selectedProgram].map(name => ({ id: name, name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${selectedProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }
}

async function handleUploadResource(e) {
    e.preventDefault();
    const button = e.submitter;
    setButtonLoading(button, true, 'Upload Resource');

    const file = $('resource_file').files[0];
    const formData = {
        title: $('resource_title').value,
        program: $('resource_program').value,
        intake: $('resource_intake').value,
        block: $('resource_block').value
    };

    if (Object.values(formData).some(v => !v) || !file) {
        showFeedback('Please fill in all details and select a file.', 'error');
        setButtonLoading(button, false);
        return;
    }
    
    const filePath = `documents/${formData.program}/${formData.block}/${Date.now()}_${file.name}`; 

    try {
        // 1. Upload file to Storage
        const { error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, file);

        if (uploadError) throw uploadError;
        
        // 2. Get Public URL
        const { data: urlData } = sb.storage.from(RESOURCES_BUCKET).getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl;

        // 3. Insert record into the database

const { error: dbError } = await sb.from(RESOURCES_TABLE).insert({
  title: formData.title,
  program_type: formData.program,     // ✅ matches actual column name
  block_term: formData.block,         // ✅ matches your table
  intake_year: formData.intake,       // ✅ matches your table
  file_url: publicUrl,
  file_name: file.name,
  uploaded_by: currentUserProfile.user_id,  // ✅ use correct column
  allow_download: true,               // optional: include if your schema needs it
});
            
        if (dbError) throw dbError;
        
        showFeedback(`✅ Resource "${formData.title}" uploaded successfully!`, 'success');
        e.target.reset();
        loadLecturerResources();
        
    } catch (error) {
        console.error('Resource Upload Error:', error);
        showFeedback(`Upload failed: ${error.message}`, 'error');
    } finally {
        setButtonLoading(button, false);
    }
}

async function loadLecturerResources() { 
    const tbody = $('resources-list');
    tbody.innerHTML = '<tr><td colspan="4">Loading shared resources...</td></tr>';

    // CRITICAL: Filtered by program via fetchDataForLecturer
    const { data: resources, error } = await fetchDataForLecturer(
        RESOURCES_TABLE, 
        '*', 
        {}, // Filtered by program in fetchDataForLecturer
        'created_at', 
        false
    );

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4">Error: ${error.message}</td></tr>`;
        return;
    }

    if (resources.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">No resources shared for this program yet.</td></tr>';
        return;
    }

    tbody.innerHTML = resources.map(r => `
        <tr>
            <td><a href="${r.file_url}" target="_blank" style="color: #4C1D95; text-decoration: underline;">${r.title}</a></td>
            <td>${r.course_id || 'General'}</td>
            <td>${r.program}/${r.block_term} (${r.intake_year})</td>
            <td>${new Date(r.created_at).toLocaleDateString()}</td>
        </tr>
    `).join('');
}


// =================================================================
// === 10. MESSAGING IMPLEMENTATION ===
// =================================================================

function populateMessageFormSelects() {
    const targetProgram = lecturerTargetProgram;

    const groups = [];
    if (targetProgram) {
        groups.push({ id: 'all_program', name: `All ${targetProgram} Students` });
        
        if (ACADEMIC_STRUCTURE[targetProgram]) {
            ACADEMIC_STRUCTURE[targetProgram].forEach(block => {
                groups.push({ id: `${targetProgram}_${block}`, name: `Group: ${targetProgram} - ${block}` });
            });
        }
        // Add individual students filtered by the lecturer's program (from allStudents cache)
        groups.push(...allStudents.map(s => ({ id: s.user_id, name: `Student: ${s.full_name}` })));
    } else {
        groups.push({ id: 'none', name: 'No target program defined' });
    }
    
    populateSelect($('msg_target'), groups, 'id', 'name', 'Select Target Group or Student');
}

async function handleSendMessage(e) {
    e.preventDefault();
    const button = e.submitter;
    setButtonLoading(button, true, 'Send Message');

    const formData = {
        target: $('msg_target').value,
        subject: $('msg_subject').value,
        body: $('msg_body').value
    };

    if (Object.values(formData).some(v => !v)) {
        showFeedback('Please fill in all message fields.', 'error');
        setButtonLoading(button, false);
        return;
    }
    
    const isStudentTarget = formData.target.length === 36; // Assuming Supabase UUID length for user_id
    const targetGroupName = isStudentTarget ? null : formData.target;
    const targetUserId = isStudentTarget ? formData.target : null;

    try {
        const { error } = await sb.from(MESSAGES_TABLE).insert({
            sender_id: currentUserProfile.user_id,
            sender_name: currentUserProfile.full_name,
            target_group: targetGroupName,
            target_user_id: targetUserId,
            subject: formData.subject,
            body: formData.body,
            program: lecturerTargetProgram, // Tag message with program
            status: 'Sent'
        });

        if (error) throw error;

        showFeedback(`✅ Message sent to ${formData.target} successfully!`, 'success');
        e.target.reset();
        loadLecturerMessages();
    } catch (error) {
        console.error('Message sending failed:', error);
        showFeedback(`Message failed: ${error.message}`, 'error');
    } finally {
        setButtonLoading(button, false);
    }
}

async function loadLecturerMessages() { 
    const tbody = $('messages-table');
    tbody.innerHTML = '<tr><td colspan="5">Loading sent messages...</td></tr>';
    
    // Fetch messages sent by this lecturer
    const { data: messages, error } = await fetchData(MESSAGES_TABLE, '*', { sender_id: currentUserProfile.user_id }, 'created_at', false);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5">Error: ${error.message}</td></tr>`;
        return;
    }

    if (messages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No sent messages found.</td></tr>';
        return;
    }

    tbody.innerHTML = messages.map(m => {
        let targetText;
        if (m.target_group === 'all_program') {
            targetText = `All ${lecturerTargetProgram} Students`;
        } else if (m.target_group) {
            targetText = `Group: ${m.target_group}`;
        } else if (m.target_user_id) {
             const student = allStudents.find(s => s.user_id === m.target_user_id);
             targetText = `Student: ${student?.full_name || m.target_user_id.substring(0, 8) + '...'}`;
        } else {
            targetText = 'N/A';
        }
        
        return `
            <tr>
                <td>${new Date(m.created_at).toLocaleString()}</td>
                <td>${m.subject}</td>
                <td>${targetText}</td>
                <td><span style="color: #10B981;">${m.status}</span></td>
                <td><button class="btn-action" style="background-color:#F59E0B;" onclick="showFeedback('Viewing details for message ${m.id}...', 'info')">View</button></td>
            </tr>
        `;
    }).join('');
}


// =================================================================
// === 11. MODAL/ACTION PLACEHOLDERS ===
// =================================================================

function openGradeModal(examId, examName) {
    const modal = $('gradeModal');
    modal.querySelector('h2').textContent = `Grade Submission: ${examName}`;
    modal.querySelector('p').innerHTML = `
        You are grading Exam ID **${examId}**. <br>
        <p style="margin-top: 15px;">
            Here you would typically load a list of students assigned to the course/program/intake for this exam,
            which is already filtered by your assigned program (${lecturerTargetProgram}).
        </p>
        <button class="btn-action" style="margin-top: 15px;" onclick="showFeedback('Grading workflow started for ${examId}', 'info')">Start Grading</button>
    `;
    modal.style.display = 'block';
}

function showSendMessageModal(userId, userName) {
    const modal = $('gradeModal'); 
    modal.querySelector('h2').textContent = `Send Message to ${userName}`;
    modal.querySelector('p').innerHTML = `
        <p>This button would take you to the Messaging tab with the recipient pre-selected.</p>
        <p>Recipient: **${userName}**</p>
        <button class="btn-action" style="margin-top: 15px;" 
            onclick="loadSectionData('messages'); 
                     $('msg_target').value = '${userId}'; 
                     this.closest('.modal').style.display='none';">
            Go to Message Form
        </button>
    `;
    modal.style.display = 'block';
}
