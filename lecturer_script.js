// =================================================================
// === 1. CONFIGURATION, CLIENT SETUP, & GLOBAL VARIABLES ===
// =================================================================

// NCHSM LECTURER DASHBOARD SCRIPT - LIVE SUPABASE INTEGRATION

// --- ⚠️ IMPORTANT: SUPABASE CONFIGURATION ---
// REPLACE WITH YOUR ACTUAL SUPABASE DETAILS
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
const RESOURCES_TABLE = 'shared_resources'; 

const RESOURCES_BUCKET = 'resources'; 

// --- Global Variables & Caches ---
let currentUserProfile = null;
let attendanceMap = null; 
let allCourses = []; 
let allStudents = []; 
let lecturerTargetProgram = null; // Cache the program filter based on the lecturer's department

// --- CORRECTED INTAKE YEARS (UP TO 2028) ---
let allIntakes = [
    { id: '2024', name: '2024' },
    { id: '2025', name: '2025' },
    { id: '2026', name: '2026' },
    { id: '2027', name: '2027' },
    { id: '2028', name: '2028' }
]; 

// --- Academic Structure Constants (Used for filtering) ---
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
// === 3. CORE NAVIGATION, AUTH & INITIALIZATION (MOCK REMOVED) ===
// =================================================================

// --- Initialization Entry Point ---
document.addEventListener('DOMContentLoaded', () => {
    initSession(); 
});

async function initSession() {
    let profile = null;
    let error = null;

    try {
        // 1. Get the current Supabase session
        const { data: { session }, error: sessionError } = await sb.auth.getSession();
        
        if (sessionError || !session) {
            error = sessionError || { message: "No active session found." };
        } else {
            
            // 2. Fetch the user profile using the session's user ID
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
        // Catch network or client initialization errors
        error = e;
    }
    
    // --- Initialize Dashboard or Handle Failure ---
    if (profile) {
        currentUserProfile = profile;
        
        // Cache the target program immediately
        lecturerTargetProgram = getProgramFilterFromDepartment(currentUserProfile.department);

        document.querySelector('header h1').textContent = `Welcome, ${currentUserProfile.full_name || 'Lecturer'}!`;
        await fetchGlobalDataCaches(); 
        loadSectionData('dashboard'); 
        setupEventListeners();
    } else {
        console.error("Initialization Failed:", error);
        alert(`Authentication Failed: ${error?.message || 'Could not load lecturer profile.'}\n\nPlease log in again.`);
        
        // Block UI and provide a link to reload/login
        document.body.innerHTML = `
            <div style="padding: 50px; text-align: center; color: #4C1D95;">
                <h1>Access Denied 🔒</h1>
                <p>Failed to authenticate or load lecturer profile. Session invalid or role is incorrect.</p>
                <p style="color: #EF4444;">Error details: ${error?.message || 'Unknown error.'}</p>
                <button onclick="window.location.reload()" 
                        style="background-color: #4C1D95; color: white; padding: 10px 20px; border: none; border-radius: 6px; margin-top: 20px; cursor: pointer;">
                    Go to Login Screen (Reload)
                </button>
            </div>
        `;
    }
}

/** Maps the lecturer's department to the student program they should see. */
function getProgramFilterFromDepartment(department) {
    const programMap = {
        'Nursing': 'KRCHN',
        'Maternal Health': 'KRCHN',
        'General Education': 'TVET',
        'Clinical Medicine': 'TVET'
    };
    return programMap[department] || null; 
}


/** Caches global data (courses and students filtered by program) needed by forms. */
// NOTE: This function remains unchanged as it relies on global variables set by initSession.
async function fetchGlobalDataCaches() {
    // 1. Fetch Courses
    const { data: courses } = await fetchData(COURSES_TABLE, 'course_id, course_name', {}, 'course_name', true);
    allCourses = courses || [];

    // 2. Fetch All Students (filtered by the lecturer's target program)
    const filters = { role: 'student' };
    if (lecturerTargetProgram) {
        filters.student_program = lecturerTargetProgram;
    }
    const { data: students } = await fetchData(USER_PROFILE_TABLE, 'user_id, full_name', filters, 'full_name', true);
    allStudents = students || [];
}

/** Tab switching logic. */
// NOTE: This function remains unchanged.
function loadSectionData(tabId) { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    
    if (!currentUserProfile) return; // Critical guard, though initSession should prevent this state
    
    // --- Data Load Trigger ---
    switch(tabId) {
        case 'profile': loadLecturerProfile(); break;
        case 'dashboard': loadLecturerDashboardData(); break;
        case 'my-courses': loadLecturerCourses(); loadLecturerStudents(); break;
        case 'sessions': loadLecturerSessions(); populateSessionFormSelects(); break;
        case 'attendance': loadTodaysAttendanceRecords(); loadAttendanceSelects(); break;
        case 'cats': loadLecturerExams(); populateExamFormSelects(); break;
        case 'resources': loadLecturerResources(); populateResourceFormSelects(); break;
        case 'messages': loadLecturerMessages(); populateMessageFormSelects(); break;
        case 'calendar': /* Placeholder for calendar initialization */ break;
    }
    
    // --- UI/Tab Switching Logic ---
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
}

function setupEventListeners() {
    // General UI
    $('menu-toggle')?.addEventListener('click', toggleSidebar);
    $('logout-btn')?.addEventListener('click', logout);
    
    // Profile
    $('update-photo-btn')?.addEventListener('click', () => { $('photo-upload-input').click(); });
    $('photo-upload-input')?.addEventListener('change', handleProfilePhotoChange); 

    // Attendance
    $('manual-attendance-form')?.addEventListener('submit', handleManualAttendance);
    $('attendance-search')?.addEventListener('keyup', () => filterTable('attendance-search', 'attendance-table', [0, 1, 2]));
    $('lecturer-checkin-btn')?.addEventListener('click', lecturerCheckIn); 

    // Exams/CATS & Resources (Event listeners for form population change)
    $('exam_program')?.addEventListener('change', populateExamFormSelects);
    $('resource_program')?.addEventListener('change', populateResourceFormSelects);

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
    await sb.auth.signOut();
    // In a real app, this should redirect to your login page
    alert("Logged out. Please log in to continue."); 
    window.location.reload();
}


// =================================================================
// === 4. PROFILE & IMAGE HANDLERS ===
// =================================================================

function loadLecturerProfile() {
    if (!currentUserProfile) return;
    
    const avatarUrl = currentUserProfile.avatar_url || 'default_passport.png';
    $('profile-img').src = avatarUrl;
    
    // Populating profile details
    $('profile_name').textContent = currentUserProfile.full_name || 'N/A';
    $('profile_role').textContent = currentUserProfile.role || 'N/A';
    $('profile_id').textContent = currentUserProfile.employee_id || 'N/A';
    $('profile_email').textContent = currentUserProfile.email || 'N/A';
    $('profile_phone').textContent = currentUserProfile.phone || 'N/A';
    $('profile_dept').textContent = currentUserProfile.department || 'N/A';
    $('profile_join_date').textContent = new Date(currentUserProfile.join_date).toLocaleDateString() || 'N/A';
}

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
        const { error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, file, { cacheControl: '3600', upsert: true });

        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: urlData } = sb.storage.from(RESOURCES_BUCKET).getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl;

        // Update profile table with new URL
        const { error: updateError } = await sb.from(USER_PROFILE_TABLE)
            .update({ avatar_url: publicUrl })
            .eq('user_id', userId);
            
        if (updateError) throw updateError;
        
        // Update local cache and UI
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

function openProfileUpdateModal() {
    showFeedback('Profile editing feature placeholder activated.', 'info');
}

// =================================================================
// === 5. STUDENT & COURSE DATA LOADERS ===
// =================================================================

function loadLecturerDashboardData() {
    // Placeholder logic for dashboard summary
    $('total_courses_count').textContent = allCourses.length || '0'; 
    $('total_students_count').textContent = allStudents.length || '0';
    $('recent_sessions_count').textContent = '...';
}

async function loadLecturerStudents() {
    if (!currentUserProfile) return;

    const tbody = $('lecturer-students-table');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7">Loading assigned students...</td></tr>';
    
    const targetProgram = lecturerTargetProgram; 

    if (!targetProgram) {
        tbody.innerHTML = `<tr><td colspan="7">No student program is assigned to the lecturer's department: ${currentUserProfile.department}.</td></tr>`;
        return;
    }

    // Since allStudents cache is already filtered by targetProgram, we use it
    const students = allStudents.map(s => {
        // Find the full student profile details (assuming allStudents has enough data from cache)
        const profile = s; 
        return `
            <tr>
                <td>${profile.full_name || 'N/A'}</td>
                <td>${profile.email || 'N/A'}</td>
                <td>${profile.student_program || 'N/A'}</td>
                <td>${profile.intake_year || 'N/A'}</td>
                <td>${profile.block_term || 'N/A'}</td>
                <td>${profile.status || 'Active'}</td>
                <td><button class="btn-action" onclick="showSendMessageModal('${profile.user_id}', '${profile.full_name}')">Message</button></td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = students.length > 0 ? students : `<tr><td colspan="7">No ${targetProgram} students found.</td></tr>`;
}

// Placeholder for other essential data loaders:
async function loadLecturerCourses() { $('lecturer-courses-list').innerHTML = '<li>Loading assigned courses... (Placeholder)</li>'; }
async function loadLecturerSessions() { $('sessions-table').innerHTML = '<tr><td colspan="6">Loading sessions... (Placeholder)</td></tr>'; }
async function loadLecturerExams() { $('exams-table').innerHTML = '<tr><td colspan="6">Loading exams/CATS... (Placeholder)</td></tr>'; }
async function loadLecturerResources() { $('resources-list').innerHTML = '<tr><td colspan="4">Loading resources... (Placeholder)</td></tr>'; }
async function loadLecturerMessages() { $('messages-table').innerHTML = '<tr><td colspan="5">Loading messages... (Placeholder)</td></tr>'; }


// =================================================================
// === 6. ATTENDANCE & MAP LOGIC (FIXED) ===
// =================================================================

function loadAttendanceSelects() {
    // allStudents is already filtered to the lecturer's program
    populateSelect($('att_student_id'), allStudents, 'user_id', 'full_name', 'Select Student');
    populateSelect($('att_course_id'), allCourses, 'course_id', 'course_name', 'Select Course (Optional)');
}

async function lecturerCheckIn() {
    // Logic for lecturer self check-in using geolocation
    const button = $('lecturer-checkin-btn');
    setButtonLoading(button, true, 'Mark My Attendance');
    // ... (rest of the check-in logic using navigator.geolocation)
    showFeedback('Placeholder: Checking your location...', 'info');
    setButtonLoading(button, false, 'Mark My Attendance'); // Mock end
}

async function handleManualAttendance(e) {
    e.preventDefault();
    // Logic for manually marking a student's attendance
    showFeedback('Placeholder: Manual attendance entry submitted.', 'info');
    e.target.reset();
    loadTodaysAttendanceRecords();
}

/** Loads attendance logs for the current day, joining user names. */
async function loadTodaysAttendanceRecords() {
    const tbody = $('attendance-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Loading today\'s records...</td></tr>';
    
    const today = new Date().toISOString().split('T')[0];
    
    const { data: logs, error } = await sb.from(ATTENDANCE_TABLE)
        .select(`*, user:user_id(full_name, student_program)`) // Fetch user info
        .gte('check_in_time', today)
        .order('check_in_time', { ascending: false });
        
    if (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading logs: ${error.message}</td></tr>`;
        return;
    }

    // Filter logs to only show records relevant to the lecturer's program
    const filteredLogs = logs.filter(l => 
        l.user?.student_program === lecturerTargetProgram || l.user_role === 'lecturer' // Include own check-ins
    );

    if (!filteredLogs || filteredLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No relevant attendance records found for today.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filteredLogs.forEach(l => {
        const userName = l.user?.full_name || 'N/A';
        const target = l.course_id || 'General';
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
                <td>${l.status}</td>
                <td>
                    <button onclick="viewCheckInMap('${l.latitude}', '${l.longitude}', '${userName}', '${geoId}')" 
                            class="btn-action" 
                            ${!l.latitude || !l.longitude ? 'disabled title="No Geo-location recorded"' : ''}>
                        View Map
                    </button>
                </td>
            </tr>
        `;
        tbody.innerHTML += rowHtml;

        // Attempt reverse geocoding for coordinates
        if (l.latitude && l.longitude && locationText.includes('Lat:')) {
            reverseGeocodeAndDisplay(l.latitude, l.longitude, geoId);
        }
    });
}

function viewCheckInMap(lat, lng, name, locationElementId) {
    // Logic to initialize and display Leaflet map in the modal
    const mapModal = $('mapModal');
    mapModal.style.display = 'block';
    
    // ... (rest of the map rendering logic including Leaflet fix)
}


// =================================================================
// === 7. PROGRAM-SPECIFIC FORM POPULATION ===
// =================================================================

function populateExamFormSelects() {
    const targetProgram = lecturerTargetProgram;
    // Only one program is allowed (KRCHN or TVET)
    const programs = targetProgram ? [{ id: targetProgram, name: targetProgram }] : [];
    
    populateSelect($('exam_program'), programs, 'id', 'name', 'Select Program');
    populateSelect($('exam_course_id'), allCourses, 'course_id', 'course_name', 'Select Course');
    populateSelect($('exam_intake'), allIntakes, 'id', 'name', 'Select Intake Year');

    // Automatically select the lecturer's program and disable the select
    const examProgramSelect = $('exam_program');
    if (targetProgram) {
        examProgramSelect.value = targetProgram;
        examProgramSelect.disabled = true;
    } else {
        examProgramSelect.disabled = false;
    }

    const selectedProgram = targetProgram; 
    const blockSelect = $('exam_block_term');

    // Filter blocks/terms based on the selected program (KRCHN or TVET)
    if (selectedProgram && ACADEMIC_STRUCTURE[selectedProgram]) {
        const blocks = ACADEMIC_STRUCTURE[selectedProgram].map(name => ({ id: name, name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${selectedProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }
}

function populateResourceFormSelects() {
    const targetProgram = lecturerTargetProgram;
    // Only one program is allowed (KRCHN or TVET)
    const programs = targetProgram ? [{ id: targetProgram, name: targetProgram }] : [];
    
    populateSelect($('resource_program'), programs, 'id', 'name', 'Select Target Program');
    populateSelect($('resource_intake'), allIntakes, 'id', 'name', 'Select Target Intake');

    // Automatically select the lecturer's program and disable the select
    const resourceProgramSelect = $('resource_program');
    if (targetProgram) {
        resourceProgramSelect.value = targetProgram;
        resourceProgramSelect.disabled = true;
    } else {
        resourceProgramSelect.disabled = false;
    }

    const selectedProgram = targetProgram;
    const blockSelect = $('resource_block');
    
    // Filter blocks/terms based on the selected program (KRCHN or TVET)
    if (selectedProgram && ACADEMIC_STRUCTURE[selectedProgram]) {
        const blocks = ACADEMIC_STRUCTURE[selectedProgram].map(name => ({ id: name, name: name }));
        populateSelect(blockSelect, blocks, 'id', 'name', `Select ${selectedProgram} Block/Term`);
    } else {
        blockSelect.innerHTML = '<option value="">-- Select Program First --</option>';
    }
}

function populateMessageFormSelects() {
    const targetProgram = lecturerTargetProgram;

    const groups = [];
    if (targetProgram) {
        // Add option to message all students in the lecturer's program
        groups.push({ id: 'all_program', name: `All ${targetProgram} Students` });
        
        // Add specific block/term groups for the lecturer's program
        if (ACADEMIC_STRUCTURE[targetProgram]) {
            ACADEMIC_STRUCTURE[targetProgram].forEach(block => {
                groups.push({ id: `${targetProgram}_${block}`, name: `Group: ${targetProgram} - ${block}` });
            });
        }
        // Add individual students from the cached list (which is already filtered)
        groups.push(...allStudents.map(s => ({ id: s.user_id, name: `Student: ${s.full_name}` })));
    } else {
        groups.push({ id: 'none', name: 'No target program defined' });
    }
    
    populateSelect($('msg_target'), groups, 'id', 'name', 'Select Target Group or Student');
}

// Placeholder functions for form submission handlers:
async function handleAddExam(e) { e.preventDefault(); showFeedback('Placeholder: Exam form submitted.', 'info'); }
async function handleUploadResource(e) { e.preventDefault(); showFeedback('Placeholder: Resource uploaded.', 'info'); }
async function handleSendMessage(e) { e.preventDefault(); showFeedback('Placeholder: Message sent.', 'info'); }
function showSendMessageModal(userId, userName) { showFeedback(`Placeholder: Messaging modal for ${userName} opened.`, 'info'); }
function populateSessionFormSelects() { /* Placeholder function for sessions form selects */ }
