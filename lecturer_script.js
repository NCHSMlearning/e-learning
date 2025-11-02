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
    'KRCHN': ['Block A', 'Block B', 'Block C', 'Block D', 'Block E', 'Block F'],
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
        option.title = text; 
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
        if (trs[i].getElementsByTagName('td').length === 0) { 
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
        lecturerTargetProgram = getProgramFilterFromDepartment(currentUserProfile.department); 

        document.querySelector('header h1').textContent = `Welcome, ${currentUserProfile.full_name || 'Lecturer'}!`;
        
        await fetchGlobalDataCaches(); 
        
        loadSectionData('dashboard'); 
        setupEventListeners();
        
        document.body.style.display = 'block'; 

    } else {
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
    // Modify these based on your institution's department-to-program mapping
    if (!department) return null;
    const dept = department.toLowerCase();
    
    if (dept.includes('nursing') || dept.includes('midwifery') || dept.includes('maternal health')) {
        return 'KRCHN';
    }
    if (dept.includes('clinical') || dept.includes('dental') || dept.includes('tivet') || dept.includes('general education')) {
        return 'TVET';
    }
    return null; 
}


async function fetchGlobalDataCaches() {
    // 1. Fetch all courses (needed for filtering in loadLecturerCourses)
    const { data: courses, error } = await fetchData(
        COURSES_TABLE,
        'id, course_name, target_program, block, intake_year, status, unit_code',
        {}, // no filters — load all
        'course_name',
        true
    );

    if (error) {
        console.error('Error fetching courses:', error);
    }

    allCourses = courses || [];
}
async function loadStudents() {
    const STUDENT_TABLE = 'consolidated_user_profiles_table';

    try {
        let query = supabase
            .from(STUDENT_TABLE)
            .select('user_id, full_name, email, program, intake_year, block, status')
            .eq('role', 'student');

        if (lecturerTargetProgram) {
            query = query.eq('program', lecturerTargetProgram);
        } else {
            console.warn(
                `⚠️ No program assigned for department "${currentUserProfile.department}". Loading zero students.`
            );
        }

        const { data: students, error } = await query.order('full_name', { ascending: true });

        if (error) {
            console.error('Error fetching students:', error);
            showFeedback(
                'Failed to load student list. Please check the Supabase column names (program, block) and RLS policy.',
                'error'
            );
            return;
        }

        allStudents = students || [];
        console.log(
            `✅ Loaded ${allStudents.length} student(s) for program: ${lecturerTargetProgram || 'None'}`
        );

        // Update dashboard and table
        loadLecturerStudents();
        loadLecturerDashboardData();
    } catch (err) {
        console.error('Unexpected error fetching students:', err);
    }
}

// Call it
loadStudents();



function loadSectionData(tabId) { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    if (!currentUserProfile) return;
    
    switch(tabId) {
        case 'profile': loadLecturerProfile(); break;
        case 'dashboard': loadLecturerDashboardData(); break;
        // 🛑 CRITICAL FIX: Mapping to the new tab structure
        case 'my-courses': loadLecturerCourses(); break; 
        case 'my-students': loadLecturerStudents(); break; 
        case 'sessions': loadLecturerSessions(); populateSessionFormSelects(); break;
        case 'attendance': loadTodaysAttendanceRecords(); loadAttendanceSelects(); break;
        case 'cats': loadLecturerExams(); populateExamFormSelects(); break;
        case 'resources': loadLecturerResources(); populateResourceFormSelects(); break;
        case 'messages': loadLecturerMessages(); populateMessageFormSelects(); break;
        case 'calendar': $('calendar-view').innerHTML = '<p>Academic Calendar placeholder loaded.</p>'; break;
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

    // Resources Edit Modal (must add logic for showing/populating)
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
    try {
        const { error } = await sb.auth.signOut();

        // Ignore harmless "Auth session missing" errors
        if (error && error.name !== 'AuthSessionMissingError') {
            console.error('Logout error:', error);
            showFeedback('Logout failed. Please try again.', 'error');
            return;
        }

        // Clear any cached data for safety
        localStorage.clear();
        sessionStorage.clear();

        // Redirect to login page
        window.location.assign('/login');
    } catch (err) {
        console.error('Unexpected logout error:', err);
        window.location.assign('/login');
    }
}

// =================================================================
// === 4. PROFILE & IMAGE HANDLERS ===
// =================================================================

function loadLecturerProfile() {
    if (!currentUserProfile) return;
    
  const avatarUrl = currentUserProfile.avatar_url || 'images/default_passport.png';
$('profile-img').src = avatarUrl;
    
    // ⬇️ CORRECTION: Updated IDs to match the new HTML structure ⬇️
    $('profile_name_display').textContent = currentUserProfile.full_name || 'N/A';
    $('profile_role_display').textContent = currentUserProfile.role || 'N/A';
    // ⬆️ CORRECTION ENDS ⬆️
    
    // These IDs are correct and remain the same in the new HTML <span> tags:
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

/**
 * Load lecturer dashboard summary data.
 */
async function loadLecturerDashboardData() {
    // Total courses for this lecturer's program
    const programCourses = allCourses.filter(c => c.target_program === lecturerTargetProgram && c.status === 'Active');
    $('total_courses_count').textContent = programCourses.length || '0';

    // Total students for this program
    const programStudents = allStudents.filter(s => s.program === lecturerTargetProgram);
    $('total_students_count').textContent = programStudents.length || '0';

    // Update filter info in banner
    const filterInfoEl = document.querySelector('#welcome-banner span:last-child');
    if (filterInfoEl && lecturerTargetProgram) {
        filterInfoEl.textContent = `This dashboard is filtered to your assigned program: ${lecturerTargetProgram}. All student/grade data shown is relevant to your assignment.`;
    }

    // Fetch today's sessions for this lecturer
    const today = new Date().toISOString().split('T')[0];
    const { data: recentSessions } = await fetchDataForLecturer(
        SESSIONS_TABLE,
        'id',
        { lecturer_id: currentUserProfile.user_id, session_date: today }
    );

    $('recent_sessions_count').textContent = recentSessions?.length || '0';
}

/**
 * Load the lecturer's courses table, filtered by program.
 */
async function loadLecturerCourses() {
    const tbody = $('lecturer-courses-table');
    if (!tbody) return;

    if (!currentUserProfile || !lecturerTargetProgram) {
        tbody.innerHTML = `
            <tr><td colspan="6" style="text-align:center;">No courses loaded. Your department is not assigned a program.</td></tr>`;
        return;
    }

    const filteredCourses = (allCourses || []).filter(course =>
        course.target_program === lecturerTargetProgram && course.status === 'Active'
    );

    if (filteredCourses.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" style="text-align:center; color: gray;">
                No courses currently found for program: <b>${lecturerTargetProgram}</b>.
            </td></tr>`;
        return;
    }

    const coursesHtml = filteredCourses.map(course => {
        // Count students enrolled in this course
        const studentCount = allStudents?.filter(student =>
            student.enrolled_courses?.includes(course.unit_code)
        ).length || 0;

        return `
            <tr>
                <td>${course.unit_code || 'N/A'}</td>
                <td>${course.course_name || 'N/A'}</td>
                <td>${course.target_program || 'N/A'}</td>
                <td>${course.block || 'N/A'}</td>
                <td>${studentCount}</td>
                <td>
                    <button class="btn-action" 
                        onclick="showFeedback('Viewing grades for ${course.course_name}', 'info')">
                        View Grades
                    </button>
                </td>
            </tr>`;
    }).join('');

    tbody.innerHTML = coursesHtml;
}

async function loadLecturerStudents() {
    const tbody = $('lecturer-students-table');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Loading students...</td></tr>`;

    try {
        if (!currentUserProfile || !lecturerTargetProgram) {
            console.log('No lecturer profile or target program found.');
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;">
                        No student program is assigned to your department.
                    </td>
                </tr>`;
            return;
        }

        console.log('Lecturer Target Program:', lecturerTargetProgram);
        console.log('All Students Programs:', allStudents.map(s => s.program));

        // Filter ignoring case and trimming spaces
        const programStudents = allStudents.filter(s => 
            s.program?.trim().toLowerCase() === lecturerTargetProgram?.trim().toLowerCase()
        );

        console.log('Filtered Students:', programStudents);

        if (programStudents.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;">
                        No ${lecturerTargetProgram} students found in the database matching your department.
                    </td>
                </tr>`;
            return;
        }

        const studentsHtml = programStudents.map(profile => {
            const status = (profile.status || 'Active').toLowerCase();
            return `
                <tr>
                    <td>${profile.full_name || 'N/A'}</td>
                    <td>${profile.email || 'N/A'}</td>
                    <td>${profile.program || 'N/A'}</td>
                    <td>${profile.intake_year || 'N/A'}</td>
                    <td>${profile.block || 'N/A'}</td>
                    <td>
                        <span class="status status-${status}">
                            ${profile.status || 'Active'}
                        </span>
                    </td>
                    <td>
                        <button class="btn-action" 
                                onclick="showSendMessageModal('${profile.user_id}', '${profile.full_name?.replace(/'/g, "\\'") || ''}')">
                            Message
                        </button>
                    </td>
                </tr>`;
        }).join('');

        tbody.innerHTML = studentsHtml;
    } catch (err) {
        console.error('Failed to load student list:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;">
                    Failed to load student list. Please check the Supabase column names (program, block) and RLS policy.
                </td>
            </tr>`;
    }
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
    } 

    const blockSelect = $('session_block_term');
    if (targetProgram && ACADEMIC_STRUCTURE[targetProgram]) {
        const blocks = ACADEMIC_STRUCTURE[targetProgram].map(name => ({ id: name, name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${targetProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }

    // Filter courses by the target program for a more accurate list
    const filteredCourses = allCourses.filter(c => c.program_type === lecturerTargetProgram);
    populateSelect($('session_course_id'), filteredCourses, 'course_id', 'course_name', 'Select Course');
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
            target_program: formData.program, 
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
    
    // Filtered by lecturer_id AND program via fetchDataForLecturer
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
        const attendanceLink = `${SUPABASE_URL}/attendance?session_id=${s.id}`; // Example link structure

        return `
            <tr>
                <td>${s.session_topic}</td>
                <td>${dateTime}</td>
                <td>${courseName}</td>
                <td>${s.target_program}/${s.block_term}</td>
                <td><a href="#" onclick="navigator.clipboard.writeText('${attendanceLink}').then(() => showFeedback('Attendance Link Copied!', 'info'))">Copy Link</a></td>
                <td><button class="btn-action" style="background-color:#F59E0B;" onclick="showFeedback('Editing session ${s.id}...', 'info')">Edit</button></td>
            </tr>
        `;
    }).join('');
}


// =================================================================
// === 7. ATTENDANCE & MAP LOGIC ===
// =================================================================

function loadAttendanceSelects() {
    populateSelect($('att_student_id'), allStudents, 'user_id', 'full_name', 'Select Student');
    // Filter courses by the target program for a more accurate list
    const filteredCourses = allCourses.filter(c => c.program_type === lecturerTargetProgram);
    populateSelect($('att_course_id'), filteredCourses, 'course_id', 'course_name', 'Select Course (Optional)');
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
    
    // Use the optimized query to fetch logs for this lecturer or their students
    const { data: logs, error } = await sb
      .from(ATTENDANCE_TABLE)
      .select(`*, user:user_id(full_name, program)`)   
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
        // Fallback for user name if the join fails (e.g., student was deleted)
        const student = allStudents.find(s => s.user_id === l.user_id);
        const userName = l.user?.full_name || student?.full_name || (l.user_role === 'lecturer' ? currentUserProfile.full_name : 'N/A');
        
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
    
    // Check if Leaflet map container exists
    const mapContainer = $('mapbox-map');
    if (!mapContainer) {
        showFeedback("Error: Map container not found.", "error");
        return;
    }
    
    // Prevent map from re-initializing if it already exists
    if (attendanceMap) {
        attendanceMap.remove();
    }

    const locationText = $(locationElementId)?.textContent || 'N/A';
    $('map-details').textContent = `Location for ${name}: ${locationText}`;
    
    // Initialize the map (Uses L.map from Leaflet)
    attendanceMap = L.map('mapbox-map').setView([lat, lng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(attendanceMap);

    L.marker([lat, lng]).addTo(attendanceMap)
        .bindPopup(`<b>${name}'s Check-in Location</b><br>${locationText}`).openPopup();
        
    // Fix map display issue inside modal
    setTimeout(() => {
        attendanceMap.invalidateSize();
    }, 300); 
}

// =================================================================
// === 8. EXAMS, RESOURCES, MESSAGING (PLACEHOLDER FUNCTIONS - START IMPLEMENTED) ===
// =================================================================

function populateExamFormSelects() {
    const targetProgram = lecturerTargetProgram;
    const programs = targetProgram ? [{ id: targetProgram, name: targetProgram }] : [];
    
    populateSelect($('exam_program'), programs, 'id', 'name', 'Select Program');
    if (targetProgram) {
        $('exam_program').value = targetProgram;
    }

    const blockSelect = $('exam_block_term');
    if (targetProgram && ACADEMIC_STRUCTURE[targetProgram]) {
        const blocks = ACADEMIC_STRUCTURE[targetProgram].map(name => ({ id: name, name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${targetProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }

    populateSelect($('exam_intake'), allIntakes, 'id', 'name', 'Select Intake Year');
    // Filter courses by the target program for a more accurate list
    const filteredCourses = allCourses.filter(c => c.program_type === lecturerTargetProgram);
    populateSelect($('exam_course_id'), filteredCourses, 'course_id', 'course_name', 'Select Course');
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
        block_term: $('exam_block_term').value,
        course_id: $('exam_course_id').value,
        intake: $('exam_intake').value 
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
            target_program: formData.program, // Matches DB column
            block_term: formData.block_term,
            course_id: formData.course_id,
            intake_year: formData.intake,
            lecturer_id: currentUserProfile.user_id,
            lecturer_name: currentUserProfile.full_name
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
    tbody.innerHTML = '<tr><td colspan="6">Loading exams...</td></tr>';
    
    // Filtered by lecturer_id AND program via fetchDataForLecturer
    const { data: exams, error } = await fetchDataForLecturer(EXAMS_TABLE, '*', { lecturer_id: currentUserProfile.user_id }, 'exam_date', false);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!exams || exams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No exams found for your program.</td></tr>';
        return;
    }
    
    tbody.innerHTML = exams.map(e => {
        const courseName = allCourses.find(c => c.course_id === e.course_id)?.course_name || e.course_id;
        const examDate = new Date(e.exam_date).toLocaleDateString();
        return `
            <tr>
                <td>${e.exam_name}</td>
                <td>${courseName}</td>
                <td>${examDate}</td>
                <td>${e.exam_type}</td>
                <td>${e.target_program}/${e.block_term}</td>
                <td><button class="btn-action" style="background-color:#F59E0B;" onclick="showFeedback('Upload results for ${e.id}', 'info')">Upload Grades</button></td>
            </tr>
        `;
    }).join('');
}


function populateResourceFormSelects() {
    const targetProgram = lecturerTargetProgram;
    const programs = targetProgram ? [{ id: targetProgram, name: targetProgram }] : [];
    
    populateSelect($('resource_program'), programs, 'id', 'name', 'Select Program');
    if (targetProgram) {
        $('resource_program').value = targetProgram;
    }

    const blockSelect = $('resource_block');
    if (targetProgram && ACADEMIC_STRUCTURE[targetProgram]) {
        const blocks = ACADEMIC_STRUCTURE[targetProgram].map(name => ({ id: name, name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${targetProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }

    // Filter courses by the target program for a more accurate list
    const filteredCourses = allCourses.filter(c => c.program_type === lecturerTargetProgram);
    populateSelect($('resource_intake'), filteredCourses, 'course_id', 'course_name', 'Select Course');
}

async function handleUploadResource(e) {
    e.preventDefault();
    const button = e.submitter;
    setButtonLoading(button, true, 'Upload Resource');
    
    const fileInput = $('resource_file');
    const file = fileInput.files[0];
    
    const formData = {
        title: $('resource_title').value,
        program: $('resource_program').value,
        course_id: $('resource_intake').value, // Misnamed ID in HTML, treated as course_id
        block_term: $('resource_block').value,
    };

    if (!file || Object.values(formData).some(v => !v)) {
        showFeedback('Please fill in all details and select a file.', 'error');
        setButtonLoading(button, false);
        return;
    }
    
    const filePath = `resources/${formData.program}/${formData.course_id}/${Date.now()}_${file.name}`;
    
    showFeedback(`Uploading ${file.name}...`, 'info');

    try {
        const { error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, file);

        if (uploadError) throw uploadError;
        
        const { data: urlData } = sb.storage.from(RESOURCES_BUCKET).getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl;

        const { error: insertError } = await sb.from(RESOURCES_TABLE).insert({
            title: formData.title,
            program_type: formData.program, // Matches DB column
            course_id: formData.course_id,
            block_term: formData.block_term,
            file_url: publicUrl,
            lecturer_id: currentUserProfile.user_id,
            lecturer_name: currentUserProfile.full_name
        });
            
        if (insertError) throw insertError;
        
        showFeedback('✅ Resource uploaded successfully!', 'success');
        e.target.reset();
        loadLecturerResources(); 
        
    } catch (error) {
        console.error('Resource Upload Error:', error);
        showFeedback(`Resource upload failed: ${error.message}`, 'error');
    } finally {
        setButtonLoading(button, false);
    }
}

async function loadLecturerResources() {
    const tbody = $('resources-list');
    tbody.innerHTML = '<tr><td colspan="5">Loading resources...</td></tr>';
    
    // Filtered by program via fetchDataForLecturer
    const { data: resources, error } = await fetchDataForLecturer(RESOURCES_TABLE, '*', null, 'uploaded_at', false);
    
    if (error) {
        tbody.innerHTML = `<tr><td colspan="5">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!resources || resources.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No resources found for your program.</td></tr>';
        return;
    }
    
    tbody.innerHTML = resources.map(r => {
        const courseName = allCourses.find(c => c.course_id === r.course_id)?.course_name || r.course_id;
        const uploadDate = new Date(r.uploaded_at).toLocaleDateString();
        return `
            <tr>
                <td>${r.title}</td>
                <td>${courseName}</td>
                <td>${r.program_type}/${r.block_term}</td>
                <td>${uploadDate}</td>
                <td>
                    <a href="${r.file_url}" target="_blank" class="btn-action view" style="background-color:#10B981;">View</a>
                    <button class="btn-action edit" onclick="showFeedback('Editing resource ${r.id}', 'info')" style="background-color:#F59E0B;">Edit</button>
                </td>
            </tr>
        `;
    }).join('');
}

function saveResourceEdits() { 
    showFeedback('Resource edits saved (placeholder).', 'info');
    closeEditResourceModal(); 
}
function closeEditResourceModal() { 
    $('editResourceModal').style.display = 'none'; 
}


function populateMessageFormSelects() {
    // Populate message targets
    const targetSelect = $('msg_target');
    const targetOptions = [
        { id: 'all-students', name: `All ${lecturerTargetProgram} Students` },
        { id: 'custom-user', name: 'Specific Student/User (Enter ID/Email)' },
    ];
    populateSelect(targetSelect, targetOptions, 'id', 'name', 'Select Message Target');
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
        showFeedback('Please fill in all message details.', 'error');
        setButtonLoading(button, false);
        return;
    }
    
    try {
        // Simple insert for now (more complex logic is needed for "all-students" targeting)
        const { error } = await sb.from(MESSAGES_TABLE).insert({
            sender_id: currentUserProfile.user_id,
            sender_name: currentUserProfile.full_name,
            subject: formData.subject,
            body: formData.body,
            receiver_id: 'SYSTEM', // Placeholder: Would be a specific user ID or a group tag
            target_program: lecturerTargetProgram,
            target_group: formData.target, // Storing the selected group for history
        });

        if (error) throw error;

        showFeedback(`✅ Message sent successfully!`, 'success');
        e.target.reset();
        loadLecturerMessages(); 
    } catch (error) {
        console.error('Message sending failed:', error);
        showFeedback(`Message sending failed: ${error.message}`, 'error');
    } finally {
        setButtonLoading(button, false);
    }
}

async function loadLecturerMessages() {
    const tbody = $('messages-table');
    tbody.innerHTML = '<tr><td colspan="5">Loading messages...</td></tr>';
    
    // Fetch messages sent by this lecturer (sent_messages table would be better, but using current structure)
    // Here we'll show messages sent *by* the lecturer for history, or received by them.
    const { data: sentMessages, error } = await fetchData(MESSAGES_TABLE, '*', { sender_id: currentUserProfile.user_id }, 'sent_at', false);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!sentMessages || sentMessages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No messages sent by you found.</td></tr>';
        return;
    }

    tbody.innerHTML = sentMessages.map(m => {
        const target = m.target_group === 'all-students' ? `All ${m.target_program} Students` : m.receiver_id;
        return `
            <tr>
                <td>${new Date(m.sent_at).toLocaleString()}</td>
                <td>${m.subject}</td>
                <td>${target}</td>
                <td><span class="status status-success">Sent</span></td>
                <td><button class="btn-action" style="background-color:#4C1D95;" onclick="showFeedback('Viewing message ${m.id}', 'info')">View</button></td>
            </tr>
        `;
    }).join('');
}

function showSendMessageModal(userId, fullName) { 
    showFeedback(`Direct message feature for ${fullName} (${userId}) needs implementation.`, 'info');
    // Implementation would involve setting the 'msg_target' select to the specific user.
}
