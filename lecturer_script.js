// =================================================================
// === 1. CONFIGURATION, CLIENT SETUP, & GLOBAL VARIABLES ===
// =================================================================

// NCHSM LECTURER DASHBOARD SCRIPT - LIVE SUPABASE INTEGRATION

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
const STUDENT_GRADES_TABLE = 'student_grades'; 
const MESSAGES_TABLE = 'messages'; 
const RESOURCES_TABLE = 'shared_resources'; 
const LECTURER_ASSIGNMENTS_TABLE = 'lecturer_course_assignments'; 

const RESOURCES_BUCKET = 'resources'; 

// --- Global Variables & Caches ---
let currentUserProfile = null;
let attendanceMap = null; 
let allCourses = []; 
let allStudents = []; 

// --- 🎯 CORRECTED INTAKE YEARS (UP TO 2028) ---
let allIntakes = [
    { id: '2024', name: '2024' },
    { id: '2025', name: '2025' },
    { id: '2026', name: '2026' },
    { id: '2027', name: '2027' },
    { id: '2028', name: '2028' }
]; 

// --- Academic Structure Constants ---
const ACADEMIC_STRUCTURE = {
    'KRCHN': ['Block A', 'Block B'],
    'TVET': ['Term 1', 'Term 2', 'Term 3']
};


// =================================================================
// === 2. CORE UTILITY FUNCTIONS ===
// =================================================================

/** Global shorthand for document.getElementById */
function $(id){ return document.getElementById(id); }

/** Utility to populate select/dropdown elements. */
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

/** Utility to filter table rows. */
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

/** Sets the loading state of a button. */
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

/** Displays a non-intrusive feedback message. */
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

/** Generic data fetching utility. */
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

/** Reverse Geocoding using Nominatim. */
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
// === 3. CORE NAVIGATION & AUTHENTICATION ===
// =================================================================

// --- Initialization Entry Point ---
document.addEventListener('DOMContentLoaded', () => {
    initSession(); 
});

async function initSession() {
    const { data: { session }, error: sessionError } = await sb.auth.getSession();
    let authFailed = false;

    if (sessionError || !session) {
        console.warn("No active Supabase session found. Using mock lecturer profile for development.");
        authFailed = true;
    } else {
        const { data: profile, error: profileError } = await sb.from(USER_PROFILE_TABLE).select('*').eq('user_id', session.user.id).single();
        
        if (profile && !profileError && profile.role === 'lecturer') {
            currentUserProfile = profile;
        } else {
            console.error(`Access Denied. User role is ${profile?.role || 'unknown'}. Falling back to mock.`);
            authFailed = true;
        }
    }

    // --- MOCK PROFILE for DEV ---
    if (authFailed) {
        currentUserProfile = { 
            user_id: '5445fb2c-5df5-4c72-954f-f75ffc1c98a7', 
            role: 'lecturer', 
            full_name: 'Dr. Jane Smith (MOCK)',
            employee_id: 'L1023',
            email: 'jane.smith@nchsm.edu',
            phone: '+254712345678',
            // Set to 'Maternal Health' for KRCHN filter test. Change to 'Clinical Medicine' for TVET test.
            department: 'Maternal Health', 
            join_date: '2020-08-15',
            avatar_url: null // Added for profile photo logic
        };
    }

    // --- Initialize Dashboard ---
    if (currentUserProfile) {
        document.querySelector('header h1').textContent = `Welcome, ${currentUserProfile.full_name || 'Lecturer'}!`;
        await fetchGlobalDataCaches(); 
        // Start on the Dashboard, as requested (Profile is now the second tab)
        loadSectionData('dashboard'); 
        setupEventListeners();
    } else {
        alert("Failed to load user profile. Please log in again.");
    }
}

/** Caches global data (e.g., all courses and all students) needed by forms. */
async function fetchGlobalDataCaches() {
    // 1. Fetch Courses
    const { data: courses } = await fetchData(COURSES_TABLE, 'course_id, course_name', {}, 'course_name', true);
    allCourses = courses || [];

    // 2. Fetch All Students (for manual attendance/messaging selectors)
    const { data: students } = await fetchData(USER_PROFILE_TABLE, 'user_id, full_name', { role: 'student' }, 'full_name', true);
    allStudents = students || [];
}

/** Tab switching logic. */
function loadSectionData(tabId) { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    
    if (!currentUserProfile) return;
    
    // --- Data Load Trigger ---
    switch(tabId) {
        case 'profile': loadLecturerProfile(); break; // Loads the profile info
        case 'dashboard': loadLecturerDashboardData(); break;
        case 'my-courses': loadLecturerCourses(); loadLecturerStudents(); break;
        case 'sessions': loadLecturerSessions(); populateSessionFormSelects(); break;
        case 'attendance': loadAttendanceData(); loadAttendanceSelects(); break;
        case 'cats': loadLecturerExams(); populateExamFormSelects(); break;
        case 'resources': loadLecturerResources(); populateResourceFormSelects(); break;
        case 'messages': loadLecturerMessages(); populateMessageFormSelects(); break;
        case 'calendar': /* renderFullCalendar(); */ break;
    }
    
    // --- UI/Tab Switching Logic (Hides all, shows one) ---
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
    $('menu-toggle')?.addEventListener('click', toggleSidebar);
    $('logout-btn')?.addEventListener('click', logout);
    
    // PROFILE PHOTO TAB
    $('update-photo-btn')?.addEventListener('click', () => {
        $('photo-upload-input').click();
    });
    $('photo-upload-input')?.addEventListener('change', handleProfilePhotoChange); 

    // ATTENDANCE TAB
    $('manual-attendance-form')?.addEventListener('submit', handleManualAttendance);
    $('attendance-search')?.addEventListener('keyup', () => filterTable('attendance-search', 'attendance-table', [0, 1, 2]));
    $('lecturer-checkin-btn')?.addEventListener('click', lecturerCheckIn); 

    // CATS/EXAMS TAB 
    $('add-exam-form')?.addEventListener('submit', handleAddExam);
    $('exam-search')?.addEventListener('keyup', () => filterTable('exam-search', 'exams-table', [0, 1, 2, 5]));
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
// === 4. DATA LOADERS (Live Supabase Implementation) ===
// =================================================================

function loadLecturerProfile() {
    if (!currentUserProfile) return;
    
    // Display Profile Picture
    const avatarUrl = currentUserProfile.avatar_url || 'default_passport.png';
    $('profile-img').src = avatarUrl;
    
    // Display Details
    $('profile_name').textContent = currentUserProfile.full_name || 'N/A';
    $('profile_role').textContent = currentUserProfile.role || 'N/A';
    $('profile_id').textContent = currentUserProfile.employee_id || 'N/A';
    $('profile_email').textContent = currentUserProfile.email || 'N/A';
    $('profile_phone').textContent = currentUserProfile.phone || 'N/A';
    $('profile_dept').textContent = currentUserProfile.department || 'N/A';
    $('profile_join_date').textContent = new Date(currentUserProfile.join_date).toLocaleDateString() || 'N/A';
}

function loadLecturerDashboardData() {
    // NOTE: Card count logic requires Supabase functions for accurate aggregates.
    $('total_courses_count').textContent = '...'; 
    $('total_students_count').textContent = '...';
    $('recent_sessions_count').textContent = '...';
}

// --- Dynamic Student Filtering Logic (Matches department to program) ---
function getProgramFilterFromDepartment(department) {
    // This maps the lecturer's department to the student program they should see.
    const programMap = {
        'Nursing': 'KRCHN',
        'Maternal Health': 'KRCHN',
        'General Education': 'TVET',
        'Clinical Medicine': 'TVET'
    };
    return programMap[department] || null; 
}


// --- Student Loader (Filtered by Lecturer Department) ---
async function loadLecturerStudents() {
    if (!currentUserProfile) return;

    const tbody = $('lecturer-students-table');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7">Loading assigned students from Supabase...</td></tr>';
    
    const targetProgram = getProgramFilterFromDepartment(currentUserProfile.department);

    if (!targetProgram) {
        tbody.innerHTML = `<tr><td colspan="7">No specific student program is assigned to the lecturer's department: ${currentUserProfile.department}.</td></tr>`;
        return;
    }

    // Live Supabase Query: Filters students by role and the target program
    const { data: students, error } = await sb.from(USER_PROFILE_TABLE)
        .select(`full_name, email, student_program, intake_year, block_term, status`)
        .eq('role', 'student')
        .eq('student_program', targetProgram) 
        .order('full_name', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading students: ${error.message}</td></tr>`;
        return;
    }

    if (!students || students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">No ${targetProgram} students found in the database.</td></tr>`;
        return;
    }

    // Dynamic Table Population
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

// Placeholder for other essential data loaders:
async function loadLecturerCourses() { $('lecturer-courses-list').innerHTML = '<li>Loading assigned courses... (Implementation needed)</li>'; }
async function loadLecturerSessions() { $('sessions-table').innerHTML = '<tr><td colspan="6">Loading sessions... (Implementation needed)</td></tr>'; }
async function loadLecturerExams() { $('exams-table').innerHTML = '<tr><td colspan="6">Loading exams/CATS... (Implementation needed)</td></tr>'; }
async function loadLecturerResources() { $('resources-list').innerHTML = '<tr><td colspan="4">Loading resources... (Implementation needed)</td></tr>'; }
async function loadLecturerMessages() { $('messages-table').innerHTML = '<tr><td colspan="5">Loading messages... (Implementation needed)</td></tr>'; }


// =================================================================
// === 5. PROFILE PHOTO HANDLERS & UPLOAD LOGIC ===
// =================================================================

/** Handles file selection and sets up the file for upload. */
function handleProfilePhotoChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 1. Display temporary image preview
    const reader = new FileReader();
    reader.onload = (e) => {
        $('profile-img').src = e.target.result;
    };
    reader.readAsDataURL(file);

    // 2. Trigger the upload process
    handlePhotoUpload(file);
}


/** Mock implementation for handling the Supabase photo upload. */
async function handlePhotoUpload(file) {
    const userId = currentUserProfile.user_id;
    if (!userId) {
        showFeedback('Error: User ID not found.', 'error');
        return;
    }

    const fileExtension = file.name.split('.').pop();
    const filePath = `avatars/${userId}.${fileExtension}`; 
    
    showFeedback(`Uploading photo: ${file.name}...`, 'info');

    try {
        // --- Supabase Storage Upload (Using 'resources' bucket placeholder) ---
        const { error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true // Overwrite existing file for this user
            });

        if (uploadError) throw uploadError;
        
        // 3. Get the public URL and update the user profile
        const { data: urlData } = sb.storage.from(RESOURCES_BUCKET).getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl;

        const { error: updateError } = await sb.from(USER_PROFILE_TABLE)
            .update({ avatar_url: publicUrl })
            .eq('user_id', userId);
            
        if (updateError) throw updateError;
        
        // Update the current profile cache and UI
        currentUserProfile.avatar_url = publicUrl;
        $('profile-img').src = publicUrl; 
        
        showFeedback('✅ Profile photo updated successfully!', 'success');
        
    } catch (error) {
        console.error('Photo Upload Error:', error);
        showFeedback(`Photo upload failed: ${error.message}`, 'error');
        // Reload original profile image if upload fails
        loadLecturerProfile(); 
    }
}

/** Placeholder function for the 'Edit Details' button */
function openProfileUpdateModal() {
    showFeedback('Profile editing feature placeholder activated.', 'info');
}


// =================================================================
// === 6. ATTENDANCE & MAP LOGIC ===
// =================================================================

function loadAttendanceSelects() {
    populateSelect($('att_student_id'), allStudents, 'user_id', 'full_name', 'Select Student');
    populateSelect($('att_course_id'), allCourses, 'course_id', 'course_name', 'Select Course (Optional)');
}

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

/** Displays the check-in location map. Includes fix for Leaflet rendering inside modals. */
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

    // CRITICAL FIX: Increased timeout to 100ms and invalidateSize() to prevent "deferred DOM Node" error
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
    }, 100); 
}


// =================================================================
// === 7. FORM POPULATION & HANDLERS (EXAMS, RESOURCES, MESSAGES) ===
// =================================================================

function populateExamFormSelects() {
    const programs = Object.keys(ACADEMIC_STRUCTURE).map(p => ({ id: p, name: p }));
    
    populateSelect($('exam_program'), programs, 'id', 'name', 'Select Program');
    populateSelect($('exam_course_id'), allCourses, 'course_id', 'course_name', 'Select Course');
    populateSelect($('exam_intake'), allIntakes, 'id', 'name', 'Select Intake Year');

    const selectedProgram = $('exam_program').value;
    const blockSelect = $('exam_block_term');

    if (selectedProgram && ACADEMIC_STRUCTURE[selectedProgram]) {
        const blocks = ACADEMIC_STRUCTURE[selectedProgram].map(name => ({ id: name, name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${selectedProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }
}

function populateResourceFormSelects() {
    const programs = Object.keys(ACADEMIC_STRUCTURE).map(p => ({ id: p, name: p }));
    
    populateSelect($('resource_program'), programs, 'id', 'name', 'Select Target Program');
    populateSelect($('resource_intake'), allIntakes, 'id', 'name', 'Select Target Intake');

    const selectedProgram = $('resource_program').value;
    const blockSelect = $('resource_block');
    
    if (selectedProgram && ACADEMIC_STRUCTURE[selectedProgram]) {
        const blocks = ACADEMIC_STRUCTURE[selectedProgram].map(name => ({ id: name, name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${selectedProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }
}

function populateMessageFormSelects() {
    // Allows messaging all students or specific program/groups
    const groups = [
        { id: 'all', name: 'All Students' },
        ...allStudents.map(s => ({ id: s.user_id, name: s.full_name }))
    ];
    for (const program in ACADEMIC_STRUCTURE) {
        ACADEMIC_STRUCTURE[program].forEach(block => {
            groups.push({ id: `${program}_${block}`, name: `${program} - ${block}` });
        });
    }

    populateSelect($('msg_target'), groups, 'id', 'name', 'Select Target Group or Student');
}

// Placeholder functions for form submission handlers:
async function handleAddExam(e) { e.preventDefault(); showFeedback('Add Exam function not fully implemented.', 'info'); }
async function handleUploadResource(e) { e.preventDefault(); showFeedback('Upload Resource function not fully implemented.', 'info'); }
async function handleSendMessage(e) { e.preventDefault(); showFeedback('Send Message function not fully implemented.', 'info'); }

// Placeholder for sessions form selects (uses course/program data)
function populateSessionFormSelects() { 
    // This function will populate course/program selects for the 'sessions' tab.
}
