/*******************************************************
 * NCHSM LECTURER DASHBOARD SCRIPT
 * Adapted from Super Admin Codebase
 *******************************************************/

// !!! IMPORTANT: CHECK YOUR KEYS AND URL !!!
// Use the same Supabase configuration
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const USER_PROFILE_TABLE = 'consolidated_user_profiles_table'; // Used to fetch lecturer/student data
const COURSES_TABLE = 'courses'; // Assuming a courses table exists
const SESSIONS_TABLE = 'scheduled_sessions'; // Assuming a sessions table exists
const ATTENDANCE_TABLE = 'geo_attendance_logs'; // Used for check-in
const EXAMS_TABLE = 'exams_cats'; // Used for assessments
const RESOURCES_BUCKET = 'resources';
const MESSAGES_TABLE = 'messages'; // Used for messaging

// ADDED: Hypothetical table for storing student marks
const STUDENT_GRADES_TABLE = 'student_grades'; 

// Global Variables
let currentUserProfile = null;
let attendanceMap = null; // Used for Leaflet instance

/*******************************************************
 * CORE UTILITY FUNCTIONS
 *******************************************************/
function $(id){ return document.getElementById(id); }

/**
 * @param {string} message 
 * @param {'success'|'error'|'warning'|'info'} type 
 */
function showFeedback(message, type = 'success') {
    const prefix = type === 'success' ? '✅ Success: ' : 
                   type === 'error' ? '❌ Error: ' :
                   type === 'warning' ? '⚠️ Warning: ' : 'ℹ️ Info: ';
    alert(prefix + message);
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
 * Utility to populate select/dropdown elements (Simplified)
 */
function populateSelect(selectElement, data, valueKey, textKey, defaultText) {
    selectElement.innerHTML = `<option value="">-- ${defaultText} --</option>`;
    data?.forEach(item => {
        const text = item[textKey] || item[valueKey];
        const option = document.createElement('option');
        option.value = item[valueKey];
        option.textContent = text;
        selectElement.appendChild(option);
    });
}

/**
 * Core CSV Export Function (Retained as is)
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
            // Exclude the last column ('Actions')
            for (let j = 0; j < headerCols.length - 1; j++) { 
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

        // Exclude the last column ('Actions')
        for (let j = 0; j < cols.length - 1; j++) { 
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

/**
 * Generic function to filter table rows (Retained as is)
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


// Tab switching logic (Modified to call lecturer-specific loaders)
function showTab(tabId) { // Added for the onclick events on dashboard cards
    const link = document.querySelector(`.nav a[data-tab="${tabId}"]`);
    if (link) {
        document.querySelectorAll('.nav a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
    }
    
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    
    loadSectionData(tabId);
}

async function loadSectionData(tabId) {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    
    // Only load sections relevant to the Lecturer HTML
    switch(tabId) {
        case 'dashboard': loadLecturerDashboardData(); break;
        case 'my-courses': loadLecturerCourses(); loadLecturerStudents(); break;
        case 'sessions': loadLecturerSessions(); populateSessionFormSelects(); break;
        case 'attendance': loadAttendanceSelects(); break;
        case 'cats': loadLecturerExams(); populateExamFormSelects(); break;
        case 'resources': loadLecturerResources(); populateResourceFormSelects(); break;
        case 'messages': loadLecturerMessages(); populateMessageFormSelects(); break;
        case 'calendar': renderFullCalendar(); break;
    }
}

// Logout (Retained as is, simplified by removing Audit Log if not implemented)
async function logout() {
    await sb.auth.signOut();
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
}


/**
 * Sets the loading state of a button (REQUIRED UTILITY)
 */
function setButtonLoading(button, isLoading, originalText) {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.textContent = 'Processing...';
        // Store original text if not already stored
        button.dataset.originalText = originalText || button.textContent;
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || originalText || 'Submit';
        delete button.dataset.originalText; // Clean up
    }
}


/*******************************************************
 * 2. LECTURER INITIALIZATION & DATA LOADING
 * (Focus on fetching data assigned to the current lecturer)
 *******************************************************/

// --- Session / Init ---
async function initSession() {
    const { data: { session }, error: sessionError } = await sb.auth.getSession();
    
    if (sessionError || !session) {
        window.location.href = "login.html";
        return;
    }

    sb.auth.setSession(session);
    const user = session.user;
    
    const { data: profile, error: profileError } = await sb.from(USER_PROFILE_TABLE).select('*').eq('user_id', user.id).single();
    
    if (profile && !profileError) {
        currentUserProfile = profile;
        
        if (currentUserProfile.role !== 'lecturer') {
            alert(`Access Denied. You are logged in as ${currentUserProfile.role}. Redirecting.`);
            window.location.href = "login.html"; // Or relevant admin page
            return;
        }
        
        document.querySelector('header h1').textContent = `Welcome, ${profile.full_name || 'Lecturer'}!`;
        
    } else {
        console.error("Profile not found or fetch error:", profileError?.message);
        await sb.auth.signOut();
        window.location.href = "login.html";
        return;
    }
    
    // Start the Lecturer Dashboard
    loadSectionData('dashboard');
    setupEventListeners();
}

function setupEventListeners() {
    // SESSIONS TAB
    $('add-session-form')?.addEventListener('submit', handleScheduleSession);
    $('new_session_program')?.addEventListener('change', populateSessionFormSelects);
    $('new_session_intake_year')?.addEventListener('change', populateSessionFormSelects);

    // ATTENDANCE TAB
    $('manual-attendance-form')?.addEventListener('submit', handleManualAttendance);
    $('attendance-search')?.addEventListener('keyup', () => filterTable('attendance-search', 'attendance-table', [0, 1, 2]));
    
    // CATS/EXAMS TAB
    $('add-exam-form')?.addEventListener('submit', handleAddExam);
    $('exam_program')?.addEventListener('change', populateExamFormSelects);
    $('exam_intake')?.addEventListener('change', populateExamFormSelects);

    // RESOURCES TAB
    $('upload-resource-form')?.addEventListener('submit', handleUploadResource);
    $('resource-search')?.addEventListener('keyup', () => filterTable('resource-search', 'resources-list', [0, 1, 3]));
    $('resource_program')?.addEventListener('change', populateResourceFormSelects);
    $('resource_intake')?.addEventListener('change', populateResourceFormSelects);
    
    // MESSAGES TAB
    $('send-message-form')?.addEventListener('submit', handleSendMessage);
    
    // MODAL CLOSING
    document.querySelector('#gradeModal .close')?.addEventListener('click', () => { $('gradeModal').style.display = 'none'; });
}


// --- LECTURER-SPECIFIC DATA FETCHERS ---

/**
 * Helper: Gets program/block filters assigned to the lecturer.
 * In a real system, this should query a 'lecturer_assignments' table.
 * For now, we simulate by using the lecturer's own profile info.
 */
function getLecturerFilters() {
    return {
        // Assuming lecturer is assigned based on their own program/intake/block for simplicity
        program: currentUserProfile?.program || null,
        intake_year: currentUserProfile?.intake_year || null,
        block: currentUserProfile?.block || null,
        // In a real system, you'd use lecturer_id
    };
}

/**
 * Load Main Dashboard Cards
 */
async function loadLecturerDashboardData() {
    const filters = getLecturerFilters();

    // 1. My Active Courses
    const { count: coursesCount } = await sb
        .from(COURSES_TABLE)
        .select('id', { count: 'exact' })
        .eq('lecturer_id', currentUserProfile.user_id) // ASSUMPTION: Courses are linked to lecturer_id
        .eq('status', 'active');
    $('lecturerActiveCourses').textContent = coursesCount || 0;

    // 2. Pending Grading
    // Note: This filter is weak. A better system requires joining with the student_grades table.
    const { count: pendingGrading } = await sb
        .from(EXAMS_TABLE)
        .select('id', { count: 'exact' })
        .eq('lecturer_id', currentUserProfile.user_id) // ASSUMPTION: Exams are linked to lecturer_id
        .eq('status', 'Completed'); // Assuming 'Completed' means students have finished, pending grading
    $('pendingGrading').textContent = pendingGrading || 0; 

    // 3. Today's Scheduled Sessions
    const today = new Date().toISOString().split('T')[0];
    const { count: todaysSessions } = await sb
        .from(SESSIONS_TABLE)
        .select('id', { count: 'exact' })
        .eq('lecturer_id', currentUserProfile.user_id) // ASSUMPTION: Sessions linked to lecturer_id
        .eq('session_date', today);
    $('todaysSessions').textContent = todaysSessions || 0;
    
    // 4. New Messages (Simulated)
    const { count: newMessagesCount } = await sb
        .from(MESSAGES_TABLE)
        .select('id', { count: 'exact' })
        .eq('recipient_id', currentUserProfile.user_id)
        .eq('read_status', false);
    $('newMessagesCount').textContent = newMessagesCount || 0;
}


/**
 * Load Lecturer's Assigned Courses (my-courses tab)
 */
async function loadLecturerCourses() {
    const tbody = $('lecturer-courses-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading your courses...</td></tr>';
    
    // In a real system, this would join a mapping table or filter courses by lecturer_id
    const { data: courses, error } = await sb.from(COURSES_TABLE)
        .select('*, program(*)') // Assuming relationship to a program table
        .eq('lecturer_id', currentUserProfile.user_id)
        .order('course_name', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error loading courses: ${error.message}</td></tr>`;
        return;
    }

    if (!courses || courses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">You are not currently assigned any courses.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    courses.forEach(c => {
        tbody.innerHTML += `
            <tr>
                <td>${c.course_name}</td>
                <td>${c.unit_code}</td>
                <td>${c.program_id || 'N/A'}</td>
                <td>${c.block || 'N/A'}</td>
                <td>${c.total_students || 0}</td>
                <td><button onclick="viewCourseStudents('${c.course_id}')" class="btn-action">View Students</button></td>
            </tr>
        `;
    });
}

/**
 * Load Students in Lecturer's Assigned Groups (my-courses tab)
 */
async function loadLecturerStudents() {
    const tbody = $('lecturer-students-table');
    tbody.innerHTML = '<tr><td colspan="8">Loading students...</td></tr>';

    const programFilter = $('lecturer_student_filter_program')?.value;
    const blockFilter = $('lecturer_student_filter_block')?.value;
    
    // Get all students
    let query = sb.from(USER_PROFILE_TABLE)
        .select('*')
        .eq('role', 'student');
        
    // Apply filters based on lecturer assignments (simulated)
    if (programFilter) query = query.eq('program', programFilter);
    if (blockFilter) query = query.eq('block', blockFilter);

    const { data: students, error } = await query.order('full_name', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="8">Error loading students: ${error.message}</td></tr>`;
        return;
    }

    // Populate filter dropdowns (simulated options)
    const mockPrograms = [{id: 'KRCHN', name: 'KRCHN'}, {id: 'TVET', name: 'TVET'}];
    const mockBlocks = [{id: 'Block_A', name: 'Block A'}, {id: 'Block_B', name: 'Block B'}, {id: 'Term_1', name: 'Term 1'}];
    
    populateSelect($('lecturer_student_filter_program'), mockPrograms, 'id', 'name', 'Filter by Program');
    populateSelect($('lecturer_student_filter_block'), mockBlocks, 'id', 'name', 'Filter by Block/Term');


    if (!students || students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No students found matching the criteria.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    students.forEach(s => {
        tbody.innerHTML += `
            <tr>
                <td>${s.full_name}</td>
                <td>${s.email}</td>
                <td>${s.program || 'N/A'}</td>
                <td>${s.intake_year || 'N/A'}</td>
                <td>${s.block || 'N/A'}</td>
                <td class="status-${s.status}">${s.status}</td>
                <td><button onclick="sendMessageToUser('${s.user_id}')" class="btn-action">Message</button></td>
            </tr>
        `;
    });
}


/*******************************************************
 * 3. SESSIONS MANAGEMENT (sessions tab)
 *******************************************************/

function populateSessionFormSelects() {
    // Mock Data for demonstration
    const programs = [{id: 'KRCHN', name: 'KRCHN'}, {id: 'TVET', name: 'TVET'}];
    const intakes = [{id: '2024', name: '2024'}, {id: '2025', name: '2025'}];
    const blocks = [{id: 'Block_A', name: 'Block A'}, {id: 'Term_1', name: 'Term 1'}];
    const courses = [{id: 'C101', name: 'Anatomy 101'}, {id: 'M202', name: 'Maternal Health'}];
    
    populateSelect($('new_session_program'), programs, 'id', 'name', 'Select Program');
    populateSelect($('new_session_intake_year'), intakes, 'id', 'name', 'Select Intake Year');
    populateSelect($('new_session_block_term'), blocks, 'id', 'name', 'Select Block/Term');
    populateSelect($('new_session_course'), courses, 'id', 'name', 'Select Course (Optional)');
}

async function handleScheduleSession(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const sessionData = {
        session_type: $('new_session_type').value,
        title: $('new_session_title').value.trim(),
        session_date: $('new_session_date').value,
        start_time: $('new_session_start_time').value,
        end_time: $('new_session_end_time').value,
        program: $('new_session_program').value,
        intake_year: $('new_session_intake_year').value,
        block: $('new_session_block_term').value,
        course_id: $('new_session_course').value || null,
        lecturer_id: currentUserProfile.user_id, // Link to current lecturer
        status: 'Scheduled'
    };

    try {
        const { error } = await sb.from(SESSIONS_TABLE).insert([sessionData]);
        
        if (error) throw error;
        
        showFeedback('Session scheduled successfully!', 'success');
        e.target.reset();
        loadLecturerSessions(); 
        // Trigger calendar refresh (function defined later)
        if (document.getElementById('fullCalendarDisplay')?.classList.contains('active')) {
            renderFullCalendar();
        }

    } catch (err) {
        showFeedback(`Failed to schedule session: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

async function loadLecturerSessions() {
    const tbody = $('scheduledSessionsTableBody');
    tbody.innerHTML = '<tr><td colspan="6">Loading your scheduled sessions...</td></tr>';
    
    // Fetch sessions assigned to the current lecturer
    const { data: sessions, error } = await sb.from(SESSIONS_TABLE)
        .select('*')
        .eq('lecturer_id', currentUserProfile.user_id)
        .order('session_date', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error loading sessions: ${error.message}</td></tr>`;
        return;
    }

    if (!sessions || sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">You have no sessions scheduled.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    sessions.forEach(s => {
        const dateTime = `${s.session_date} ${s.start_time}`;
        tbody.innerHTML += `
            <tr>
                <td>${s.session_type}</td>
                <td>${s.title}</td>
                <td>${dateTime}</td>
                <td>${s.program}</td>
                <td>${s.block}</td>
                <td>
                    <button onclick="editSession('${s.id}')" class="btn-action">Edit</button>
                    <button onclick="deleteSession('${s.id}')" class="btn-delete">Delete</button>
                </td>
            </tr>
        `;
    });
}

// Placeholder functions for CRUD actions
function editSession(id) { showFeedback(`Edit session ${id} functionality needs modal implementation.`, 'info'); }
async function deleteSession(id) {
    if (!confirm('Are you sure you want to delete this session?')) return;
    const { error } = await sb.from(SESSIONS_TABLE).delete().eq('id', id);
    if (error) {
        showFeedback(`Failed to delete session: ${error.message}`, 'error');
    } else {
        showFeedback('Session deleted.', 'success');
        loadLecturerSessions();
    }
}


/*******************************************************
 * 4. ATTENDANCE & CHECK-IN (attendance tab)
 *******************************************************/

function loadAttendanceSelects() {
    // Mock Data for demonstration
    const mockStudents = [{id: 'S123', name: 'Student A'}, {id: 'S456', name: 'Student B'}];
    const mockCourses = [{id: 'C101', name: 'Anatomy 101'}, {id: 'M202', name: 'Maternal Health'}];

    populateSelect($('att_student_id'), mockStudents, 'id', 'name', 'Select Student');
    populateSelect($('att_course_id'), mockCourses, 'id', 'name', 'Select Course (Optional)');
    
    // Load today's attendance records (optional feature for lecturer)
    loadTodaysAttendanceRecords();
}

/**
 * LECTURER SELF CHECK-IN: Needs geolocation permissions and Supabase integration
 */
async function lecturerCheckIn() {
    if (!navigator.geolocation) {
        showFeedback('Geolocation is not supported by your browser.', 'error');
        return;
    }

    showFeedback('Attempting to get your location...', 'info');

    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const checkInData = {
            user_id: currentUserProfile.user_id,
            user_role: currentUserProfile.role,
            latitude,
            longitude,
            location_details: 'Lecturer Geo Check-in',
            check_in_time: new Date().toISOString(),
            status: 'Present'
        };

        try {
            const { error } = await sb.from(ATTENDANCE_TABLE).insert([checkInData]);
            
            if (error) throw error;
            
            showFeedback('✅ Your attendance has been marked successfully!', 'success');
            // Re-fetch lecturer check-in status if implemented
        } catch (err) {
            showFeedback(`Failed to mark attendance: ${err.message}`, 'error');
        }

    }, (error) => {
        showFeedback(`Geolocation Error: ${error.message}. Check-in failed.`, 'error');
    });
}

async function handleManualAttendance(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);
    
    const student_id = $('att_student_id').value;
    const session_type = $('att_session_type').value;
    const department = $('att_department').value;
    const course_id = $('att_course_id').value || null;
    const location = $('att_location').value;
    const date = $('att_date').value;
    const time = $('att_time').value;

    const checkInData = {
        user_id: student_id,
        user_role: 'student',
        location_details: `${location || department}`,
        check_in_time: `${date}T${time || '08:00:00.000Z'}`,
        session_type: session_type,
        course_id: course_id,
        marked_by_id: currentUserProfile.user_id, // Who marked it
        status: 'Present (Manual)'
    };
    
    try {
        const { error } = await sb.from(ATTENDANCE_TABLE).insert([checkInData]);
        if (error) throw error;
        
        showFeedback(`Attendance manually marked for student ${student_id}.`, 'success');
        e.target.reset();
        loadTodaysAttendanceRecords();
        
    } catch (err) {
        showFeedback(`Manual attendance failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

async function loadTodaysAttendanceRecords() {
    const tbody = $('attendance-table');
    tbody.innerHTML = '<tr><td colspan="7">Loading today\'s records...</td></tr>';
    
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch today's records for students who are in the lecturer's groups
    // This is complex and requires joining tables; simplifying for this script.
    // ASSUMPTION: Fetch all today's attendance logs and let the lecturer filter.
    const { data: logs, error } = await sb.from(ATTENDANCE_TABLE)
        .select(`*, user:user_id(${USER_PROFILE_TABLE} (full_name))`)
        .gte('check_in_time', today)
        .order('check_in_time', { ascending: false });
        
    if (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading logs: ${error.message}</td></tr>`;
        return;
    }

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No attendance records found for today.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    logs.forEach(l => {
        const studentName = l.user?.full_name || 'Unknown Student';
        const target = l.course_id || 'Clinical/General';
        const dateTime = new Date(l.check_in_time).toLocaleTimeString();
        
        tbody.innerHTML += `
            <tr>
                <td>${studentName}</td>
                <td>${l.session_type || 'N/A'}</td>
                <td>${target}</td>
                <td>${l.location_details || 'N/A'}</td>
                <td>${dateTime}</td>
                <td>${l.status}</td>
                <td><button onclick="viewCheckInMap(${l.latitude}, ${l.longitude}, '${studentName}')" class="btn-action">View Map</button></td>
            </tr>
        `;
    });
}

/**
 * MAP MODAL LOGIC
 */
function viewCheckInMap(lat, lng, name) {
    const mapModal = $('mapModal');
    const mapContainer = $('mapbox-map');
    
    mapModal.style.display = 'block';
    
    // Ensure the map container is visible and has dimensions before initializing/invalidating size
    setTimeout(() => {
        if (attendanceMap) {
            attendanceMap.remove(); // Remove previous instance
            attendanceMap = null;
        }

        attendanceMap = L.map(mapContainer).setView([lat, lng], 15);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(attendanceMap);
        
        L.marker([lat, lng]).addTo(attendanceMap)
            .bindPopup(`<b>${name}</b><br>Location recorded here.`)
            .openPopup();
            
        $('map-details').textContent = `Check-in location for ${name} at Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
        
        // This is crucial for Leaflet inside a modal
        attendanceMap.invalidateSize(); 
    }, 10); 
}


/*******************************************************
 * 5. CATS / EXAMS (cats tab)
 *******************************************************/

function populateExamFormSelects() {
    // Mock Data for demonstration
    const programs = [{id: 'KRCHN', name: 'KRCHN'}, {id: 'TVET', name: 'TVET'}];
    const courses = [{id: 'C101', name: 'Anatomy 101'}, {id: 'M202', name: 'Maternal Health'}];
    const intakes = [{id: '2024', name: '2024'}, {id: '2025', name: '2025'}];
    const blocks = [{id: 'Block_A', name: 'Block A'}, {id: 'Term_1', name: 'Term 1'}];

    populateSelect($('exam_program'), programs, 'id', 'name', 'Select Program');
    populateSelect($('exam_course_id'), courses, 'id', 'name', 'Select Course');
    populateSelect($('exam_intake'), intakes, 'id', 'name', 'Select Intake Year');
    populateSelect($('exam_block_term'), blocks, 'id', 'name', 'Select Block/Term');
}

async function handleAddExam(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);
    
    const examData = {
        type: $('exam_type').value,
        program: $('exam_program').value,
        course_id: $('exam_course_id').value,
        title: $('exam_title').value.trim(),
        online_link: $('exam_link').value || null,
        duration_minutes: parseInt($('exam_duration_minutes').value),
        exam_date: $('exam_date').value,
        start_time: $('exam_start_time').value,
        status: $('exam_status').value,
        intake_year: $('exam_intake').value,
        block: $('exam_block_term').value,
        lecturer_id: currentUserProfile.user_id // Link to current lecturer
    };

    try {
        const { error } = await sb.from(EXAMS_TABLE).insert([examData]);
        
        if (error) throw error;
        
        showFeedback('Assessment posted successfully!', 'success');
        e.target.reset();
        loadLecturerExams(); 

    } catch (err) {
        showFeedback(`Failed to post assessment: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

async function loadLecturerExams() {
    const tbody = $('exams-table');
    tbody.innerHTML = '<tr><td colspan="7">Loading your assessments...</td></tr>';
    
    const { data: exams, error } = await sb.from(EXAMS_TABLE)
        .select('*')
        .eq('lecturer_id', currentUserProfile.user_id)
        .order('exam_date', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading exams: ${error.message}</td></tr>`;
        return;
    }

    if (!exams || exams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">You have not posted any assessments.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    exams.forEach(e => {
        const dateTime = `${e.exam_date} ${e.start_time}`;
        const statusClass = e.status === 'Completed' ? 'status-danger' : (e.status === 'Upcoming' ? 'status-approved' : 'status-pending');
        
        tbody.innerHTML += `
            <tr>
                <td>${e.type}</td>
                <td>${e.course_id}</td>
                <td>${e.title}</td>
                <td>${dateTime}</td>
                <td>${e.duration_minutes} min</td>
                <td class="${statusClass}">${e.status}</td>
                <td>
                    <button onclick="openGradeModal('${e.id}', '${e.title}')" class="btn-action">Grade</button>
                    <button onclick="deleteExam('${e.id}')" class="btn-delete">Delete</button>
                </td>
            </tr>
        `;
    });
}

function openGradeModal(examId, title) {
    const modal = $('gradeModal');
    const gradeExamTitle = $('gradeExamTitle');
    const gradeStudentsList = $('grade-students-list');
    
    gradeExamTitle.innerHTML = `Assessment: <em>${title}</em> (ID: ${examId.substring(0, 8)})`;
    gradeStudentsList.innerHTML = '<p>Loading enrolled students for grading...</p>';
    
    modal.style.display = 'block';
    
    // Logic to fetch students associated with the exam's program/intake/block goes here
    // For now, simple mock students
    const mockStudents = [{id: 'S123', name: 'Student A', grade: ''}, {id: 'S456', name: 'Student B', grade: '85'}];
    
    let studentHTML = '';
    mockStudents.forEach(s => {
        studentHTML += `
            <label>${s.name} (ID: ${s.id}):</label>
            <input type="number" name="grade_${s.id}" value="${s.grade}" placeholder="Enter Grade (e.g. 75)" min="0" max="100">
            <br><br>
        `;
    });
    gradeStudentsList.innerHTML = studentHTML;
    
    // Setup form submit listener for grading
    $('grade-form').onsubmit = (e) => handleGradeSubmission(e, examId);
}

// Function to handle grade submission (COMPLETED)
async function handleGradeSubmission(e, examId) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);
    
    // Logic to collect and save grades (usually to a 'student_grades' table)
    const formData = new FormData(e.target);
    const gradeRecords = [];
    const timestamp = new Date().toISOString();
    const lecturerId = currentUserProfile.user_id;

    for (const [key, value] of formData.entries()) {
        if (key.startsWith('grade_')) {
            const student_id = key.substring(6); // Extract ID from 'grade_STUDENTID'
            const grade = parseInt(value, 10);

            // Only process valid grades
            if (!isNaN(grade) && grade >= 0) {
                gradeRecords.push({
                    exam_id: examId,
                    student_id: student_id,
                    grade: grade,
                    graded_by_id: lecturerId,
                    updated_at: timestamp,
                });
            }
        }
    }
    
    if (gradeRecords.length === 0) {
        showFeedback('No valid grades were entered or processed.', 'warning');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    try {
        // Use upsert to insert new grades or update existing ones
        // Assuming 'exam_id' and 'student_id' form a unique composite key for upsert
        const { error } = await sb.from(STUDENT_GRADES_TABLE)
            .upsert(gradeRecords, { onConflict: 'exam_id, student_id' }); 
        
        if (error) throw error;
        
        // Update the EXAMS_TABLE status after grading
        await sb.from(EXAMS_TABLE).update({ status: 'Graded', updated_at: timestamp }).eq('id', examId);
        
        showFeedback(`Successfully saved ${gradeRecords.length} grades and updated assessment status.`, 'success');
        
        // Close modal and refresh list
        $('gradeModal').style.display = 'none';
        loadLecturerExams(); 

    } catch (err) {
        showFeedback(`Failed to submit grades: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


async function deleteExam(id) {
    if (!confirm('Are you sure you want to delete this assessment?')) return;
    const { error } = await sb.from(EXAMS_TABLE).delete().eq('id', id);
    if (error) {
        showFeedback(`Failed to delete assessment: ${error.message}`, 'error');
    } else {
        showFeedback('Assessment deleted.', 'success');
        loadLecturerExams();
    }
}


/*******************************************************
 * 6. RESOURCES (resources tab)
 *******************************************************/

function populateResourceFormSelects() {
    const mockPrograms = [{id: 'KRCHN', name: 'KRCHN'}, {id: 'TVET', name: 'TVET'}];
    const mockIntakes = [{id: '2024', name: '2024'}, {id: '2025', name: '2025'}];
    const mockCourses = [{id: 'C101', name: 'Anatomy 101'}, {id: 'M202', name: 'Maternal Health'}];

    populateSelect($('resource_program'), mockPrograms, 'id', 'name', 'Select Target Program');
    populateSelect($('resource_intake'), mockIntakes, 'id', 'name', 'Select Target Intake');
    populateSelect($('resource_course_id'), mockCourses, 'id', 'name', 'Select Related Course (Optional)');
}

async function handleUploadResource(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const fileInput = $('resource_file');
    const file = fileInput.files[0];
    
    if (!file) {
        showFeedback('Please select a file to upload.', 'warning');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const resourceTitle = $('resource_title').value.trim();
    const resourceProgram = $('resource_program').value;
    const resourceCourse = $('resource_course_id').value || 'general';
    const resourceType = $('resource_type').value;

    if (!resourceTitle || !resourceProgram) {
        showFeedback('Title and Program are required.', 'warning');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const filePath = `${currentUserProfile.user_id}/${resourceCourse}/${Date.now()}_${file.name}`;
    
    try {
        // 1. Upload file to Supabase Storage Bucket
        const { data: fileData, error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        // 2. Insert metadata into a 'resources' table (Hypothetical Table)
        const { data: resourceMetadata, error: dbError } = await sb.from('resources').insert([
            {
                title: resourceTitle,
                file_path: filePath,
                file_size: file.size,
                file_type: file.type,
                program: resourceProgram,
                course_id: resourceCourse,
                type: resourceType,
                uploaded_by_id: currentUserProfile.user_id
            }
        ]);
        
        if (dbError) {
            // Rollback: Attempt to delete the file if metadata insert fails
            await sb.storage.from(RESOURCES_BUCKET).remove([filePath]);
            throw dbError;
        }

        showFeedback('Resource uploaded and linked successfully!', 'success');
        e.target.reset();
        loadLecturerResources(); 

    } catch (err) {
        showFeedback(`Upload failed: ${err.message}`, 'error');
        console.error("Upload/DB Error:", err);
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

async function loadLecturerResources() {
    const tbody = $('resources-list');
    tbody.innerHTML = '<tr><td colspan="5">Loading shared resources...</td></tr>';
    
    // Assuming a 'resources' table exists
    const { data: resources, error } = await sb.from('resources')
        .select('*, uploader:uploaded_by_id(full_name)')
        .eq('uploaded_by_id', currentUserProfile.user_id) // Show only resources uploaded by this lecturer
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5">Error loading resources: ${error.message}</td></tr>`;
        return;
    }

    if (!resources || resources.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">You have not uploaded any resources.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    resources.forEach(r => {
        const fileLink = sb.storage.from(RESOURCES_BUCKET).getPublicUrl(r.file_path).data.publicUrl;
        
        tbody.innerHTML += `
            <tr>
                <td>${r.title}</td>
                <td>${r.program}</td>
                <td>${r.course_id}</td>
                <td>${r.type}</td>
                <td>
                    <a href="${fileLink}" target="_blank" class="btn-action">Download</a>
                    <button onclick="deleteResource('${r.id}', '${r.file_path}')" class="btn-delete">Delete</button>
                </td>
            </tr>
        `;
    });
}

async function deleteResource(id, filePath) {
    if (!confirm('Are you sure you want to delete this resource (file and metadata)?')) return;
    
    try {
        // 1. Delete from storage
        const { error: storageError } = await sb.storage.from(RESOURCES_BUCKET).remove([filePath]);
        if (storageError) console.warn("Storage deletion warning (may already be gone):", storageError.message);

        // 2. Delete metadata from table
        const { error: dbError } = await sb.from('resources').delete().eq('id', id);
        if (dbError) throw dbError;

        showFeedback('Resource deleted successfully.', 'success');
        loadLecturerResources();
        
    } catch (err) {
        showFeedback(`Failed to delete resource: ${err.message}`, 'error');
    }
}


/*******************************************************
 * 7. MESSAGING (messages tab)
 *******************************************************/

function populateMessageFormSelects() {
    // Mock Data for demonstration
    const mockStudents = [{id: 'S123', name: 'Student A'}, {id: 'S456', name: 'Student B'}];
    const mockGroups = [{id: 'KRCHN_2024', name: 'KRCHN 2024 Intake'}, {id: 'TVET_BlockA', name: 'TVET Block A'}];

    populateSelect($('message_recipient_user'), mockStudents, 'id', 'name', 'Select Individual Student');
    populateSelect($('message_recipient_group'), mockGroups, 'id', 'name', 'Select Group/Class');
}

async function handleSendMessage(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const recipientUser = $('message_recipient_user').value;
    const recipientGroup = $('message_recipient_group').value;
    const messageSubject = $('message_subject').value.trim();
    const messageBody = $('message_body').value.trim();

    const recipientId = recipientUser || recipientGroup;
    const recipientType = recipientUser ? 'user' : (recipientGroup ? 'group' : null);

    if (!recipientId || !messageBody) {
        showFeedback('Please select a recipient and enter a message body.', 'warning');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const messageData = {
        sender_id: currentUserProfile.user_id,
        sender_role: currentUserProfile.role,
        recipient_id: recipientId,
        recipient_type: recipientType, // 'user' or 'group'
        subject: messageSubject,
        body: messageBody,
        read_status: false
    };

    try {
        // NOTE: Group messaging would require a trigger/function on Supabase to fan-out to individual user records
        const { error } = await sb.from(MESSAGES_TABLE).insert([messageData]);
        
        if (error) throw error;
        
        showFeedback('Message sent successfully!', 'success');
        e.target.reset();
        loadLecturerMessages(); 

    } catch (err) {
        showFeedback(`Failed to send message: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

async function loadLecturerMessages() {
    const tbody = $('inbox-list');
    tbody.innerHTML = '<tr><td colspan="4">Loading inbox...</td></tr>';
    
    // Fetch messages where the current user is the recipient
    const { data: messages, error } = await sb.from(MESSAGES_TABLE)
        .select('*, sender:sender_id(full_name)')
        .eq('recipient_id', currentUserProfile.user_id)
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4">Error loading messages: ${error.message}</td></tr>`;
        return;
    }

    if (!messages || messages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">Your inbox is empty.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    messages.forEach(m => {
        const senderName = m.sender?.full_name || 'System/Admin';
        const readClass = m.read_status ? '' : 'message-unread';
        
        tbody.innerHTML += `
            <tr class="${readClass}" onclick="viewMessageDetails('${m.id}')">
                <td>${senderName}</td>
                <td>${m.subject}</td>
                <td>${new Date(m.created_at).toLocaleString()}</td>
                <td>${m.read_status ? 'Read' : 'Unread'}</td>
            </tr>
        `;
    });
}

function viewMessageDetails(id) {
    showFeedback(`Viewing message ${id}. Functionality to mark as read and display body needs modal implementation.`, 'info');
    // Implement a modal here to display the full body and mark as read via Supabase update.
}

// Placeholder for full calendar rendering (requires FullCalendar library)
function renderFullCalendar() {
    const calendarEl = $('fullCalendarDisplay');
    if (!calendarEl || typeof FullCalendar === 'undefined') {
        // If FullCalendar is not loaded, just skip this section or show a message
        calendarEl.innerHTML = '<p>Calendar library (FullCalendar) not loaded. Cannot display calendar.</p>';
        return;
    }
    
    // Mock event data based on scheduled sessions (simplified for this script)
    const mockEvents = [
        { title: 'Anatomy 101 Lecture', start: new Date().toISOString().split('T')[0] + 'T09:00:00', end: new Date().toISOString().split('T')[0] + 'T11:00:00' },
        { title: 'TVET Block B CAT', start: '2025-10-25' }
    ];

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: mockEvents,
        // Add Supabase event fetching logic here to pull from SESSIONS_TABLE
    });

    calendar.render();
}
// End of script.
