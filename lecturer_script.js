// =================================================================
// === 1. CONFIGURATION, CLIENT SETUP, & GLOBAL VARIABLES (LECTURER DASHBOARD) ===
// =================================================================

// NCHSM LECTURER DASHBOARD SCRIPT

// --- ⚠️ IMPORTANT: SUPABASE CONFIGURATION (Using your provided live keys) ---
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';

// --- Global Supabase Client ---
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Table and Bucket Constants ---
const USER_PROFILE_TABLE = 'consolidated_user_profiles_table'; // Confirmed
const COURSES_TABLE = 'courses'; 
const EXAMS_TABLE = 'exams_cats'; 
const SESSIONS_TABLE = 'scheduled_sessions'; 
const ATTENDANCE_TABLE = 'geo_attendance_logs'; 
const STUDENT_GRADES_TABLE = 'student_grades'; 
const MESSAGES_TABLE = 'messages'; 
const RESOURCES_TABLE = 'shared_resources'; 
const LECTURER_ASSIGNMENTS_TABLE = 'lecturer_course_assignments'; 

const RESOURCES_BUCKET = 'resources'; 

// --- Global Variables & Shorthand ---
let currentUserProfile = null;
let attendanceMap = null; 

// --- Academic Structure Constants ---
const ACADEMIC_STRUCTURE = {
    'KRCHN': ['Block A', 'Block B'],
    'TVET': ['Term 1', 'Term 2', 'Term 3']
};

// =================================================================
// === 2. CORE UTILITY FUNCTIONS ===
// =================================================================

/**
 * Global shorthand for document.getElementById
 */
function $(id){ return document.getElementById(id); }

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
 * Utility to filter table rows. (Retained)
 */
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

/**
 * Sets the loading state of a button. (Retained)
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
 * Displays a non-intrusive feedback message. (Retained)
 */
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


/**
 * Generic data fetching utility. (Retained)
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
 * Reverse Geocoding using Nominatim. (Retained)
 */
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
// === 3. CORE NAVIGATION & AUTHENTICATION (Initialization) ===
// =================================================================

// --- Initialization Entry Point ---
document.addEventListener('DOMContentLoaded', () => {
    initSession(); 
});

async function initSession() {
    // --- 1. Get Supabase Session ---
    const { data: { session }, error: sessionError } = await sb.auth.getSession();
    
    // --- 2. Handle Authentication and Mock/Live Profile Loading ---
    let user;
    if (sessionError || !session) {
        // Fallback/Mock Auth (for development without full login flow)
        console.warn("No active Supabase session found. Using mock lecturer profile.");
        currentUserProfile = { 
            user_id: '5445fb2c-5df5-4c72-954f-f75ffc1c98a7', 
            role: 'lecturer', 
            full_name: 'Dr. Jane Smith (MOCK)',
            employee_id: 'L1023',
            email: 'jane.smith@nchsm.edu',
            phone: '+254712345678',
            department: 'Maternal Health',
            join_date: '2020-08-15'
        };
        // Skip profile fetch since we used mock data
    } else {
         // Live Auth: Fetch profile data from the consolidated table
         user = session.user;
         const { data: profile, error: profileError } = await sb.from(USER_PROFILE_TABLE).select('*').eq('user_id', user.id).single();
         
         if (profile && !profileError && profile.role === 'lecturer') {
             currentUserProfile = profile;
         } else {
             // Handle unauthorized role or missing profile (Production flow)
             console.error(`Access Denied. User role is ${profile?.role}. Redirecting to login.`);
             // await sb.auth.signOut();
             // window.location.href = "login.html"; 
             // return;
             
             // For development, you might still force the mock profile if auth fails
             console.warn("Live profile check failed. Falling back to mock profile.");
             currentUserProfile = { /* ... (Same mock data as above) ... */ }; 
         }
    }

    // --- 3. Initialize Dashboard ---
    if (currentUserProfile) {
        document.querySelector('header h1').textContent = `Welcome, ${currentUserProfile.full_name || 'Lecturer'}!`;
        loadSectionData('profile'); 
        setupEventListeners();
    } else {
        alert("Failed to load user profile. Please log in again.");
    }
}

/**
 * Tab switching logic: Handles active link class, active content section, and triggers data load.
 */
function loadSectionData(tabId) { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    
    if (!currentUserProfile) return;
    
    // --- Data Load Trigger ---
    switch(tabId) {
        case 'profile': loadLecturerProfile(); break;
        case 'dashboard': loadLecturerDashboardData(); break;
        case 'my-courses': loadLecturerCourses(); loadLecturerStudents(); break;
        case 'sessions': loadLecturerSessions(); populateSessionFormSelects(); break;
        case 'attendance': loadAttendanceData(); loadAttendanceSelects(); break;
        case 'cats': loadLecturerExams(); populateExamFormSelects(); break;
        case 'resources': loadLecturerResources(); populateResourceFormSelects(); break;
        case 'messages': loadLecturerMessages(); populateMessageFormSelects(); break;
        case 'calendar': renderFullCalendar(); break;
    }
    
    // --- UI/Tab Switching Logic (Ensures correct display) ---
    // 1. Hide all content sections (using the .tab-content class)
    document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.remove('active');
    });
    
    // 2. Show the selected section (using the required ID format)
    const targetSection = $(tabId + '-content');
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // 3. Update active class in sidebar
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
    $('menu-toggle')?.addEventListener('click', toggleSidebar);
    $('logout-btn')?.addEventListener('click', logout);
    
    // ATTENDANCE TAB
    $('manual-attendance-form')?.addEventListener('submit', handleManualAttendance);
    $('attendance-search')?.addEventListener('keyup', () => filterTable('attendance-search', 'attendance-table', [0, 1, 2]));
    $('lecturer-checkin-btn')?.addEventListener('click', lecturerCheckIn); // Mark My Attendance Button

    // CATS/EXAMS TAB 
    $('add-exam-form')?.addEventListener('submit', handleAddExam);
    $('exam-search')?.addEventListener('keyup', () => filterTable('exam-search', 'exams-table', [0, 1, 2, 5]));
    // Rerun populate selects when program/intake changes
    $('exam_program')?.addEventListener('change', populateExamFormSelects);
    $('exam_intake')?.addEventListener('change', populateExamFormSelects);

    // RESOURCES TAB 
    $('upload-resource-form')?.addEventListener('submit', handleUploadResource);
    $('resource-search')?.addEventListener('keyup', () => filterTable('resource-search', 'resources-list', [0, 1, 3]));
    // Rerun populate selects when program/intake changes
    $('resource_program')?.addEventListener('change', populateResourceFormSelects);
    $('resource_intake')?.addEventListener('change', populateResourceFormSelects);
    
    // MESSAGES TAB 
    $('send-message-form')?.addEventListener('submit', handleSendMessage);
    
    // MODAL CLOSING
    document.querySelector('#gradeModal .close')?.addEventListener('click', () => { $('gradeModal').style.display = 'none'; });
    document.querySelector('#mapModal .close')?.addEventListener('click', () => { $('mapModal').style.display = 'none'; });
    window.addEventListener('click', (event) => {
        if (event.target === $('gradeModal')) { $('gradeModal').style.display = 'none'; }
        if (event.target === $('mapModal')) { $('mapModal').style.display = 'none'; }
    });
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const body = document.body;
    sidebar.classList.toggle('active');
    body.classList.toggle('no-scroll');
}

async function logout() {
    await sb.auth.signOut();
    window.location.href = "login.html";
}


// =================================================================
// === X. CORE TAB DATA LOADERS (Live Supabase Implementation) ===
// =================================================================

/**
 * Maps the lecturer's department to the student program they supervise.
 * In a real system, this would be fetched from a database table.
 */
function getProgramFilterFromDepartment(department) {
    // This implements your specific business rule:
    if (department === 'Nursing') {
        return 'KRCHN';
    }
    // Add other rules here (e.g., 'Clinical Medicine' -> 'TVET')
    // else if (department === 'Clinical Medicine') {
    //     return 'TVET';
    // }
    return null; // Return null if the department isn't assigned to a specific program
}


async function loadLecturerStudents() {
    if (!currentUserProfile) return;

    const tbody = $('lecturer-students-table');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7">Loading assigned students from Supabase...</td></tr>';
    
    const targetProgram = getProgramFilterFromDepartment(currentUserProfile.department);

    if (!targetProgram) {
        tbody.innerHTML = '<tr><td colspan="7">No specific student program is assigned to this lecturer\'s department.</td></tr>';
        return;
    }

    // --- 🎯 Supabase Query: Filter students by role and the target program ---
    const { data: students, error } = await sb.from(USER_PROFILE_TABLE)
        .select(`full_name, email, student_program, intake_year, block_term, status`)
        .eq('role', 'student')
        .eq('student_program', targetProgram) // Filters to 'KRCHN' if department is 'Nursing'
        .order('full_name', { ascending: true });

    if (error) {
        console.error("Error loading students:", error);
        tbody.innerHTML = `<tr><td colspan="7">Error loading students: ${error.message}</td></tr>`;
        return;
    }

    if (!students || students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">No ${targetProgram} students found in the database.</td></tr>`;
        return;
    }

    // --- Dynamic Table Population ---
    tbody.innerHTML = students.map(s => `
        <tr>
            <td>${s.full_name || 'N/A'}</td>
            <td>${s.email || 'N/A'}</td>
            <td>${s.student_program || 'N/A'}</td>
            <td>${s.intake_year || 'N/A'}</td>
            <td>${s.block_term || 'N/A'}</td>
            <td>${s.status || 'Active'}</td>
            <td><button class="btn-action">Message</button></td>
        </tr>
    `).join('');

    console.log(`Successfully loaded ${students.length} ${targetProgram} students.`);
}

// =================================================================
// === 4. ATTENDANCE & CHECK-IN (Updated Select Logic) ===
// =================================================================

function loadAttendanceSelects() {
    const mockStudents = [{id: 'S123', name: 'Student A'}, {id: 'S456', name: 'Student B'}];
    const mockCourses = [{id: 'C101', name: 'Anatomy 101'}, {id: 'M202', name: 'Maternal Health'}];

    populateSelect($('att_student_id'), mockStudents, 'id', 'name', 'Select Student');
    populateSelect($('att_course_id'), mockCourses, 'id', 'name', 'Select Course (Optional)');
}

// (lecturerCheckIn, handleManualAttendance, loadTodaysAttendanceRecords, viewCheckInMap logic remain here)
async function lecturerCheckIn() {
    const button = $('lecturer-checkin-btn');
    setButtonLoading(button, true, 'Mark My Attendance');
    
    if (!navigator.geolocation) {
        showFeedback('Geolocation is not supported by your browser.', 'error');
        setButtonLoading(button, false, 'Mark My Attendance');
        return;
    }

    showFeedback('Attempting to get your location...', 'info');

    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        let locationDetails = `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
            const data = await response.json();
            if (data.display_name) {
                locationDetails = data.display_name;
            }
        } catch (e) {
            console.warn("Reverse geocoding failed, using coordinates.", e);
        }

        const checkInData = {
            user_id: currentUserProfile.user_id,
            user_role: currentUserProfile.role,
            latitude,
            longitude,
            location_details: locationDetails,
            check_in_time: new Date().toISOString(),
            status: 'Present (Lecturer)'
        };

        try {
            const { error } = await sb.from(ATTENDANCE_TABLE).insert([checkInData]);
            
            if (error) throw error;
            
            showFeedback('✅ Your attendance has been marked successfully!', 'success');
            loadTodaysAttendanceRecords();
        } catch (err) {
            showFeedback(`Failed to mark attendance: ${err.message}`, 'error');
        } finally {
            setButtonLoading(button, false, 'Mark My Attendance');
        }

    }, (error) => {
        showFeedback(`Geolocation Error: ${error.message}. Check-in failed.`, 'error');
        setButtonLoading(button, false, 'Mark My Attendance');
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
        location_details: `${location || department} (Manual Entry)`,
        check_in_time: `${date}T${time || '08:00:00.000Z'}`,
        session_type: session_type,
        course_id: course_id,
        marked_by_id: currentUserProfile.user_id,
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
        const studentName = l.user?.full_name || 'Unknown User';
        const target = l.course_id || 'Clinical/General';
        const dateTime = new Date(l.check_in_time).toLocaleTimeString();
        const locationText = l.location_details || 'N/A';
        
        const geoId = `geo-${l.id}`;

        let rowHtml = `
            <tr>
                <td>${studentName}</td>
                <td>${l.session_type || 'N/A'}</td>
                <td>${target}</td>
                <td id="${geoId}">${locationText}</td> 
                <td>${dateTime}</td>
                <td>${l.status}</td>
                <td>
                    <button onclick="viewCheckInMap('${l.latitude}', '${l.longitude}', '${studentName}', '${geoId}')" 
                            class="btn-action" 
                            ${!l.latitude || !l.longitude ? 'disabled title="No Geo-location recorded"' : ''}>
                        View Map
                    </button>
                </td>
            </tr>
        `;
        tbody.innerHTML += rowHtml;

        if (l.latitude && l.longitude && (locationText === 'Lecturer Geo Check-in' || locationText.includes('Lat:'))) {
            reverseGeocodeAndDisplay(l.latitude, l.longitude, geoId);
        }
    });
}

function viewCheckInMap(lat, lng, name, locationElementId) {
    if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
        showFeedback('No valid geolocation data available for this record.', 'warning');
        return;
    }
    const mapModal = $('mapModal');
    const mapContainer = $('mapbox-map');
    
    mapModal.style.display = 'block';
    
    const locationDetails = $(locationElementId)?.textContent || `Lat: ${parseFloat(lat).toFixed(4)}, Lng: ${parseFloat(lng).toFixed(4)}`;
    $('map-details').textContent = `Check-in location for ${name}: ${locationDetails}`;

    setTimeout(() => {
        if (attendanceMap) {
            attendanceMap.remove(); 
            attendanceMap = null;
        }

        if (typeof L !== 'undefined') {
            const parsedLat = parseFloat(lat);
            const parsedLng = parseFloat(lng);
            
            attendanceMap = L.map(mapContainer).setView([parsedLat, parsedLng], 15);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(attendanceMap);
            
            L.marker([parsedLat, parsedLng]).addTo(attendanceMap)
                .bindPopup(`<b>${name}</b><br>Location recorded here.`)
                .openPopup();
                
            attendanceMap.invalidateSize(); 
        } else {
            $('map-details').textContent = `Map library not loaded. Coordinates: Lat: ${parsedLat.toFixed(4)}, Lng: ${parsedLng.toFixed(4)}`;
        }
    }, 10); 
}


// =================================================================
// === 5. CATS / EXAMS (Updated Select Logic) ===
// =================================================================

function populateExamFormSelects() {
    // Programs are manually defined or fetched from a Programs table (Mocked here)
    const programs = [{id: 'KRCHN', name: 'KRCHN'}, {id: 'TVET', name: 'TVET'}];
    const courses = [{id: 'C101', name: 'Anatomy 101'}, {id: 'M202', name: 'Maternal Health'}];
    const intakes = [{id: '2024', name: '2024'}, {id: '2025', name: '2025'}];

    populateSelect($('exam_program'), programs, 'id', 'name', 'Select Program');
    populateSelect($('exam_course_id'), courses, 'id', 'name', 'Select Course');
    populateSelect($('exam_intake'), intakes, 'id', 'name', 'Select Intake Year');

    // Dynamic Block/Term based on selected Program
    const selectedProgram = $('exam_program').value;
    const blockSelect = $('exam_block_term');

    if (selectedProgram && ACADEMIC_STRUCTURE[selectedProgram]) {
        const blocks = ACADEMIC_STRUCTURE[selectedProgram].map(name => ({ id: name.replace(' ', '_'), name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${selectedProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }
}
// (handleAddExam, loadLecturerExams, openGradeModal, handleGradeSubmission, deleteExam logic remain here)


// =================================================================
// === 6. RESOURCES (Updated Select Logic) ===
// =================================================================

function populateResourceFormSelects() {
    const mockPrograms = [{id: 'KRCHN', name: 'KRCHN'}, {id: 'TVET', name: 'TVET'}];
    const mockIntakes = [{id: '2024', name: '2024'}, {id: '2025', name: '2025'}];

    populateSelect($('resource_program'), mockPrograms, 'id', 'name', 'Select Target Program');
    populateSelect($('resource_intake'), mockIntakes, 'id', 'name', 'Select Target Intake');

    // Dynamic Block/Term based on selected Program
    const selectedProgram = $('resource_program').value;
    const blockSelect = $('resource_block');
    
    if (selectedProgram && ACADEMIC_STRUCTURE[selectedProgram]) {
        const blocks = ACADEMIC_STRUCTURE[selectedProgram].map(name => ({ id: name.replace(' ', '_'), name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${selectedProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }
}
// (handleUploadResource, loadLecturerResources, deleteResource logic remain here)


// =================================================================
// === 7. MESSAGES (Updated Select Logic) ===
// =================================================================

function populateMessageFormSelects() {
    // Generate mock groups based on the ACADEMIC_STRUCTURE
    const groups = [];
    for (const program in ACADEMIC_STRUCTURE) {
        ACADEMIC_STRUCTURE[program].forEach(block => {
            const groupName = `${program} - ${block}`;
            groups.push({ id: `${program}_${block.replace(' ', '_')}`, name: groupName });
        });
    }

    populateSelect($('msg_program'), groups, 'id', 'name', 'Select Target Program/Group');
}
// (handleSendMessage logic remains here)
