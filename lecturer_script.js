// =================================================================
// === 1. CONFIGURATION, CLIENT SETUP, & GLOBAL VARIABLES (LECTURER DASHBOARD) ===
// =================================================================

// NCHSM LECTURER DASHBOARD SCRIPT
// Adapted from Super Admin Codebase

// --- ⚠️ IMPORTANT: SUPABASE CONFIGURATION (Using your provided live keys) ---
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';

// --- Global Supabase Client ---
// Note: Assuming the 'supabase' library object is globally available (via script tag in HTML)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Table and Bucket Constants (Used throughout the script) ---
const USER_PROFILE_TABLE = 'consolidated_user_profiles_table'; // Used to fetch lecturer/student data
const COURSES_TABLE = 'courses'; 
const EXAMS_TABLE = 'exams_cats'; // Used for assessments
const SESSIONS_TABLE = 'scheduled_sessions'; 
const ATTENDANCE_TABLE = 'geo_attendance_logs'; // Used for check-in
const STUDENT_GRADES_TABLE = 'student_grades'; // Used for storing student marks (Grading Logic)
const MESSAGES_TABLE = 'messages'; 
const RESOURCES_BUCKET = 'resources'; // Used for file storage (Resources Logic)


// --- Global Variables & Shorthand ---
let currentUserProfile = null;
let attendanceMap = null; // Used for Leaflet map instance

// =================================================================
// === 2. CORE UTILITY FUNCTIONS ===
// =================================================================

/**
 * Global shorthand for document.getElementById
 */
function $(id){ return document.getElementById(id); }

/**
 * Displays a critical feedback message to the user using an alert.
 * @param {string} message 
 * @param {'success'|'error'|'warning'|'info'} type 
 */
function showFeedback(message, type = 'success') {
    const prefix = type === 'success' ? '✅ Success: ' : 
                   type === 'error' ? '❌ Error: ' :
                   type === 'warning' ? '⚠️ Warning: ' : 'ℹ️ Info: ';
    // NOTE: This should ideally use a non-blocking HTML element for better UX
    alert(prefix + message);
}

/**
 * Generic data fetching utility using Supabase
 * @param {string} tableName - The name of the Supabase table.
 * @param {string} selectQuery - The select string (e.g., '*, user:user_id(full_name)').
 * @param {Object} filters - An object of key/value pairs for .eq() filters.
 * @param {string} order - Column to order by.
 * @param {boolean} ascending - True for ascending, false for descending.
 * @returns {Promise<{data: Array<Object>|null, error: Object|null}>}
 */
async function fetchData(tableName, selectQuery = '*', filters = {}, order = 'created_at', ascending = false) {
    let query = sb.from(tableName).select(selectQuery);

    for (const key in filters) {
        // Only apply filter if the value is defined and not empty
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

// -----------------------------------------------------------------
// The rest of the script (Parts 3-7, including loadSectionData, 
// lecturerCheckIn, handleAddExam, etc.) follows this block.
// -----------------------------------------------------------------

/* ================================================= */
/* === 2. UTILITY FUNCTIONS (Reusable Helpers) === */
/* ================================================= */

/**
 * Utility to populate select/dropdown elements.
 */
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

/**
 * Core CSV Export Function.
 */
function exportTableToCSV(tableId, filename) {
    const table = $(tableId);
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
            for (let j = 0; j < headerCols.length - 1; j++) { // Exclude 'Actions'
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
        
        if (cols.length < 2) continue; // Skip empty/status rows

        for (let j = 0; j < cols.length - 1; j++) { // Exclude 'Actions'
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
 * Generic function to filter table rows.
 */
function filterTable(inputId, tableId, columnsToSearch = [0]) {
    const filter = $(inputId)?.value.toUpperCase() || '';
    const tbody = $(tableId);
    if (!tbody) return;

    const trs = tbody.getElementsByTagName('tr');

    for (let i = 0; i < trs.length; i++) {
        let rowMatches = false;

        // Skip rows that span the entire table (e.g., "Loading...")
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

/**
 * Sets the loading state of a button.
 */
function setButtonLoading(button, isLoading, originalText) {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.textContent = 'Processing...';
        button.dataset.originalText = originalText || button.textContent;
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || originalText || 'Submit';
        delete button.dataset.originalText;
    }
}

/**
 * Displays a non-intrusive feedback message to the user. (Added for UX)
 */
function showFeedback(message, type) {
    const feedbackEl = $('feedback-message'); 
    if (!feedbackEl) {
        console.warn(`Feedback element not found. Message: [${type.toUpperCase()}] ${message}`);
        alert(message); // Fallback to alert
        return;
    }

    feedbackEl.textContent = message;
    
    // Reset and apply classes for styling (assumes CSS styles for info, success, error, warning)
    feedbackEl.className = 'feedback-box'; 
    feedbackEl.classList.add(`feedback-${type}`);
    feedbackEl.style.display = 'block';

    // Auto-hide after 5 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            feedbackEl.style.display = 'none';
        }, 5000);
    }
}


/* ================================================= */
/* === 3. CORE NAVIGATION & AUTHENTICATION (Initialization) === */
/* ================================================= */

// --- Initialization Entry Point ---
document.addEventListener('DOMContentLoaded', () => {
    initSession(); 
});

async function initSession() {
    const { data: { session }, error: sessionError } = await sb.auth.getSession();
    
    if (sessionError || !session) {
        window.location.href = "login.html";
        return;
    }

    const user = session.user;
    
    // Fetch user profile to verify role
    const { data: profile, error: profileError } = await sb.from(USER_PROFILE_TABLE).select('*').eq('user_id', user.id).single();
    
    if (profile && !profileError) {
        currentUserProfile = profile;
        
        if (currentUserProfile.role !== 'lecturer') {
            alert(`Access Denied. You are logged in as ${currentUserProfile.role}. Redirecting.`);
            await sb.auth.signOut();
            window.location.href = "login.html"; 
            return;
        }
        
        document.querySelector('header h1').textContent = `Welcome, ${profile.full_name || 'Lecturer'}!`;
        
    } else {
        console.error("Profile not found or fetch error:", profileError?.message);
        await sb.auth.signOut();
        window.location.href = "login.html";
        return;
    }
    
    // Once profile is confirmed, load dashboard and set up listeners
    loadSectionData('dashboard');
    setupEventListeners();
}

/**
 * Tab switching logic: Handles active link class, active content section, and triggers data load.
 */
function loadSectionData(tabId) { 
    // Close any active modals when switching tabs
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    
    if (!currentUserProfile) return;
    
    // Triggers the relevant data loading function for the tab
    switch(tabId) {
        case 'dashboard': loadLecturerDashboardData(); break;
        case 'my-courses': loadLecturerCourses(); loadLecturerStudents(); break;
        case 'sessions': loadLecturerSessions(); populateSessionFormSelects(); break;
        case 'attendance': loadAttendanceData(); loadAttendanceSelects(); break;
        case 'cats': loadLecturerExams(); populateExamFormSelects(); break;
        case 'resources': loadLecturerResources(); populateResourceFormSelects(); break;
        case 'messages': loadLecturerMessages(); populateMessageFormSelects(); break;
        case 'calendar': renderFullCalendar(); break;
    }
    
    // --- UI/Tab Switching Logic ---
    // Hide all content sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });
    // Show the selected section
    const targetSection = $(tabId + '-content');
    if (targetSection) {
        targetSection.style.display = 'block';
    }

    // Update active class in sidebar
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('active');
    });
    const activeLink = document.querySelector(`.sidebar-link[onclick*="${tabId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
    
    // Hide sidebar on mobile after click
    const sidebar = document.querySelector('.sidebar');
    if (sidebar.classList.contains('active')) {
        toggleSidebar(); 
    }
}

function setupEventListeners() {
    // UI/Mobile Navigation
    $('menu-toggle')?.addEventListener('click', toggleSidebar);
    $('logout-btn')?.addEventListener('click', logout);
    
    // NOTE: Many functions below (like loadLecturerDashboardData, handleScheduleSession, etc.) are placeholders
    // or need mock data/implementation. They are not defined here to keep the script focused on your provided parts.
    
    // SESSIONS TAB (Placeholders)
    // $('add-session-form')?.addEventListener('submit', handleScheduleSession);
    // $('new_session_program')?.addEventListener('change', populateSessionFormSelects);
    // $('new_session_intake_year')?.addEventListener('change', populateSessionFormSelects);

    // ATTENDANCE TAB (Part 4)
    $('manual-attendance-form')?.addEventListener('submit', handleManualAttendance);
    $('attendance-search')?.addEventListener('keyup', () => filterTable('attendance-search', 'attendance-table', [0, 1, 2]));
    
    // CATS/EXAMS TAB (Part 5)
    $('add-exam-form')?.addEventListener('submit', handleAddExam);
    $('exam_program')?.addEventListener('change', populateExamFormSelects);
    $('exam_intake')?.addEventListener('change', populateExamFormSelects);

    // RESOURCES TAB (Part 6)
    $('upload-resource-form')?.addEventListener('submit', handleUploadResource);
    $('resource-search')?.addEventListener('keyup', () => filterTable('resource-search', 'resources-list', [0, 1, 3]));
    $('resource_program')?.addEventListener('change', populateResourceFormSelects);
    $('resource_intake')?.addEventListener('change', populateResourceFormSelects);
    
    // MESSAGES TAB (Part 7)
    $('send-message-form')?.addEventListener('submit', handleSendMessage);
    
    // MODAL CLOSING
    document.querySelector('#gradeModal .close')?.addEventListener('click', () => { $('gradeModal').style.display = 'none'; });
    document.querySelector('#mapModal .close')?.addEventListener('click', () => { $('mapModal').style.display = 'none'; });
    window.addEventListener('click', (event) => {
        if (event.target === $('gradeModal')) { $('gradeModal').style.display = 'none'; }
        if (event.target === $('mapModal')) { $('mapModal').style.display = 'none'; }
    });
    
    // Lecturer Check-in (Part 4)
    $('lecturer-checkin-btn')?.addEventListener('click', lecturerCheckIn); 

    // Placeholder for other functions used in Part 3 switch statement
    function loadLecturerDashboardData() { console.log("Dashboard data loaded (Mock)"); }
    function loadLecturerCourses() { console.log("Courses data loaded (Mock)"); }
    function loadLecturerStudents() { console.log("Students data loaded (Mock)"); }
    function loadLecturerSessions() { console.log("Sessions data loaded (Mock)"); }
    function loadAttendanceData() { console.log("Attendance overview loaded (Mock)"); }
    function populateSessionFormSelects() { console.log("Session selects populated (Mock)"); }
}

// Logout 
async function logout() {
    await sb.auth.signOut();
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
}


/* ================================================= */
/* === 4. ATTENDANCE & CHECK-IN (attendance tab) === */
/* ================================================= */

function loadAttendanceSelects() {
    // Mock Data for demonstration
    const mockStudents = [{id: 'S123', name: 'Student A'}, {id: 'S456', name: 'Student B'}];
    const mockCourses = [{id: 'C101', name: 'Anatomy 101'}, {id: 'M202', name: 'Maternal Health'}];

    populateSelect($('att_student_id'), mockStudents, 'id', 'name', 'Select Student');
    populateSelect($('att_course_id'), mockCourses, 'id', 'name', 'Select Course (Optional)');
    
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
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Loading today\'s records...</td></tr>';
    
    const today = new Date().toISOString().split('T')[0];
    
    const { data: logs, error } = await sb.from(ATTENDANCE_TABLE)
        .select(`*, user:user_id(full_name)`) 
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
                <td>
                    <button onclick="viewCheckInMap(${l.latitude}, ${l.longitude}, '${studentName}')" 
                            class="btn-action" 
                            ${!l.latitude || !l.longitude ? 'disabled title="No Geo-location recorded"' : ''}>
                        View Map
                    </button>
                </td>
            </tr>
        `;
    });
}

/**
 * MAP MODAL LOGIC (Requires Leaflet library linked in HTML)
 */
function viewCheckInMap(lat, lng, name) {
    if (!lat || !lng) {
        showFeedback('No valid geolocation data available for this record.', 'warning');
        return;
    }
    const mapModal = $('mapModal');
    const mapContainer = $('mapbox-map');
    
    mapModal.style.display = 'block';
    
    setTimeout(() => {
        if (attendanceMap) {
            attendanceMap.remove(); 
            attendanceMap = null;
        }

        if (typeof L !== 'undefined') {
            attendanceMap = L.map(mapContainer).setView([lat, lng], 15);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(attendanceMap);
            
            L.marker([lat, lng]).addTo(attendanceMap)
                .bindPopup(`<b>${name}</b><br>Location recorded here.`)
                .openPopup();
                
            $('map-details').textContent = `Check-in location for ${name} at Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
            
            attendanceMap.invalidateSize(); 
        } else {
            $('map-details').textContent = `Map library not loaded. Coordinates: Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
        }
    }, 10); 
}


/* ================================================= */
/* === 5. CATS / EXAMS (cats tab) === */
/* ================================================= */

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
        lecturer_id: currentUserProfile.user_id 
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
    if (!tbody) return;
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
        const statusClass = e.status === 'Graded' ? 'status-approved' : (e.status === 'Completed' ? 'status-danger' : 'status-pending');
        
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
    
    // NOTE: This should fetch actual students associated with the course/program/intake
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
    
    $('grade-form').onsubmit = (e) => handleGradeSubmission(e, examId);
}

async function handleGradeSubmission(e, examId) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);
    
    const formData = new FormData(e.target);
    const gradeRecords = [];
    const timestamp = new Date().toISOString();
    const lecturerId = currentUserProfile.user_id;

    for (const [key, value] of formData.entries()) {
        if (key.startsWith('grade_')) {
            const student_id = key.substring(6); 
            const grade = parseInt(value, 10);

            if (!isNaN(grade) && grade >= 0 && value.trim() !== "") {
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
        // Use upsert on the composite key (exam_id, student_id)
        const { error } = await sb.from(STUDENT_GRADES_TABLE)
            .upsert(gradeRecords, { onConflict: 'exam_id, student_id' }); 
        
        if (error) throw error;
        
        // Update the EXAMS_TABLE status 
        await sb.from(EXAMS_TABLE).update({ status: 'Graded', updated_at: timestamp }).eq('id', examId);
        
        showFeedback(`Successfully saved ${gradeRecords.length} grades and updated assessment status.`, 'success');
        
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


/* ================================================= */
/* === 6. RESOURCES (resources tab) === */
/* ================================================= */

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
        const { error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        // 2. Insert metadata into the 'resources' table
        const { error: dbError } = await sb.from(RESOURCES_TABLE).insert([
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
            // Rollback: Delete the file if metadata insert fails
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
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Loading shared resources...</td></tr>';
    
    const { data: resources, error } = await sb.from(RESOURCES_TABLE)
        .select('*')
        .eq('uploaded_by_id', currentUserProfile.user_id) 
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
        const { data: { publicUrl: fileLink } } = sb.storage.from(RESOURCES_BUCKET).getPublicUrl(r.file_path);
        
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
        if (storageError) console.warn("Storage deletion warning:", storageError.message);

        // 2. Delete metadata from table
        const { error: dbError } = await sb.from(RESOURCES_TABLE).delete().eq('id', id);
        if (dbError) throw dbError;

        showFeedback('Resource deleted successfully.', 'success');
        loadLecturerResources();
        
    } catch (err) {
        showFeedback(`Failed to delete resource: ${err.message}`, 'error');
    }
}


/* ================================================= */
/* === 7. MESSAGING (messages tab) === */
/* ================================================= */

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
        recipient_type: recipientType, 
        subject: messageSubject,
        body: messageBody,
        read_status: false
    };

    try {
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
    if (!tbody) return;
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
    // Implement modal for full message view and marking as read
}

// Placeholder for full calendar rendering (requires FullCalendar library)
function renderFullCalendar() {
    const calendarEl = $('fullCalendarDisplay');
    if (!calendarEl || typeof FullCalendar === 'undefined') {
        if(calendarEl) calendarEl.innerHTML = '<p>Calendar library (FullCalendar) not loaded. Cannot display calendar.</p>';
        return;
    }
    
    const mockEvents = [
        { title: 'Anatomy 101 Lecture', start: new Date().toISOString().split('T')[0] + 'T09:00:00', end: new Date().toISOString().split('T')[0] + 'T11:00:00', color: '#004a99' },
        { title: 'TVET Block B CAT', start: '2025-10-25', color: '#F59E0B' }
    ];

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: mockEvents,
    });

    calendar.render();
}
// =================================================================
// === END OF SCRIPT ===
// =================================================================
