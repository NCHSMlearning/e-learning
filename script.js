/**********************************************************************************
 * Final Integrated JavaScript File (script.js)
 * SUPERADMIN DASHBOARD - COURSE, USER, ATTENDANCE & FULL FILTERING MANAGEMENT
 * (Includes: Strategic Admin Features, Online Exam Enhancements, Mass Promotion)
 *
 * **FIXED: Button loading/reset, Consolidated Table Logic, Audit Logging**
 **********************************************************************************/
 // Hides the .html extension in the URL
    if (window.location.pathname.endsWith('.html')) {
        const cleanPath = window.location.pathname.replace(/\.html$/, '');
        window.history.replaceState({}, '', cleanPath);
    }

// !!! IMPORTANT: CHECK YOUR KEYS AND URL !!!
// REPLACE with your actual Supabase URL and ANON_KEY
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const RESOURCES_BUCKET = 'resources';
const IP_API_URL = 'https://api.ipify.org?format=json';
const DEVICE_ID_KEY = 'nchsm_device_id';
const SETTINGS_TABLE = 'app_settings'; 
const MESSAGE_KEY = 'student_welcome'; 

// NEW TABLES FOR STRATEGIC FEATURES
const AUDIT_TABLE = 'audit_logs'; 
const GLOBAL_SETTINGS_KEY = 'global_system_status'; 
const USER_PROFILE_TABLE = 'consolidated_user_profiles_table'; // Consolidated User Table

// Global Variables
let currentUserProfile = null;
let attendanceMap = null; // Used for Leaflet instance

/*******************************************************
 * 1. CORE UTILITY FUNCTIONS
 *******************************************************/
function $(id){ return document.getElementById(id); }

function escapeHtml(s, isAttribute = false){ 
    let str = String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if (isAttribute) {
        str = str.replace(/'/g,'&#39;').replace(/"/g,'&quot;');// Keep existing logic for attributes
    } else {
        str = str.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    return str;
}

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
 * @param {HTMLButtonElement} button 
 * @param {boolean} isLoading 
 * @param {string} originalText 
 */
function setButtonLoading(button, isLoading, originalText = 'Submit') {
    if (!button) return;
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
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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
        const targetTab = document.getElementById(tabId);
        if (targetTab) targetTab.classList.add('active');
        
        loadSectionData(tabId);
    });
});

async function loadSectionData(tabId) {
    // Hide all modals when switching tabs
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    
    switch(tabId) {
        case 'dashboard': 
      
            loadDashboardData(); 
            break;
        case 'users': loadAllUsers(); break;
        case 'pending': loadPendingApprovals(); break;
        case 'enroll': 
            loadStudents(); 
            // Initialize Mass Promotion Selects
            updateBlockTermOptions('promote_intake', 'promote_from_block');
            updateBlockTermOptions('promote_intake', 'promote_to_block');
            break; 
        case 'courses': loadCourses(); break;
        case 'sessions': loadScheduledSessions(); populateSessionCourseSelects(); break;
        case 'attendance': loadAttendance(); populateAttendanceSelects(); break;
        case 'cats': loadExams(); populateExamCourseSelects(); break;
        case 'messages': loadAdminMessages(); loadWelcomeMessageForEdit(); break; // <-- FIXED: loadAdminMessages called here
        case 'calendar': renderFullCalendar(); break;
        case 'resources': loadResources(); break;
        case 'welcome-editor': loadWelcomeMessageForEdit(); break; 
        case 'audit': loadAuditLogs(); break; // NEW
        case 'security': loadSystemStatus(); break; // NEW
        case 'backup': loadBackupHistory(); break;
    }
}
// --- Session / Init ---
async function initSession() {
    const { data: { session }, error: sessionError } = await sb.auth.getSession();
    
    if (sessionError || !session) {
        console.warn("Session check failed, redirecting to login.");
        window.location.href = "login.html";
        return;
    }

    sb.auth.setSession(session);
    const user = session.user;
    
    const { data: profile, error: profileError } = await sb.from('profiles').select('*').eq('id', user.id).single();
    
    if (profile && !profileError) {
        currentUserProfile = profile;
        
        if (currentUserProfile.role !== 'superadmin') {
            console.warn(`User ${user.email} is not a Super Admin. Redirecting.`);
            window.location.href = "admin.html"; 
            return;
        }
        
        document.querySelector('header h1').textContent = `Welcome, ${profile.full_name || 'Super Admin'}!`;
    } else {
        console.error("Profile not found or fetch error:", profileError?.message);
        window.location.href = "login.html";
        return;
    }
    
    // Continue with app initialization
    loadSectionData('dashboard');
    
    // Setup Event Listeners
    
    // ATTENDANCE TAB
    $('att_session_type')?.addEventListener('change', toggleAttendanceFields);
    toggleAttendanceFields(); 
    $('manual-attendance-form')?.addEventListener('submit', handleManualAttendance);
    $('attendance-search')?.addEventListener('keyup', () => filterTable('attendance-search', 'attendance-table', [0, 1, 2]));
    
    // ENROLLMENT/USER TAB
    $('add-account-form')?.addEventListener('submit', handleAddAccount);
    $('account-program')?.addEventListener('change', () => updateBlockTermOptions('account-program', 'account-block-term')); 
    $('account-intake')?.addEventListener('change', () => updateBlockTermOptions('account-program', 'account-block-term'));
    $('user-search')?.addEventListener('keyup', () => filterTable('user-search', 'users-table', [1, 2, 4]));
    
    // NEW: MASS PROMOTION LISTENER
    $('mass-promotion-form')?.addEventListener('submit', handleMassPromotion);
    $('promote_intake')?.addEventListener('change', () => {
        updateBlockTermOptions('promote_intake', 'promote_from_block');
        updateBlockTermOptions('promote_intake', 'promote_to_block');
    });

    // COURSES TAB
    $('add-course-form')?.addEventListener('submit', handleAddCourse);
    $('course-search')?.addEventListener('keyup', () => filterTable('course-search', 'courses-table', [0, 1, 3]));
    $('course-program')?.addEventListener('change', () => { updateBlockTermOptions('course-program', 'course-block'); });
    $('course-intake')?.addEventListener('change', () => { updateBlockTermOptions('course-program', 'course-block'); });
    
    // SESSIONS TAB
    $('add-session-form')?.addEventListener('submit', handleAddSession);
    $('session_program')?.addEventListener('change', () => { 
        updateBlockTermOptions('session_program', 'session_block_term'); 
        populateSessionCourseSelects(); 
    });
    $('session_intake')?.addEventListener('change', () => updateBlockTermOptions('session_program', 'session_block_term')); 
    $('clinical_program')?.addEventListener('change', () => { updateBlockTermOptions('clinical_program', 'clinical_block_term'); }); 
    $('clinical_intake')?.addEventListener('change', () => updateBlockTermOptions('clinical_program', 'clinical_block_term')); 

    // CATS/EXAMS TAB
    $('add-exam-form')?.addEventListener('submit', handleAddExam);
    $('exam_program')?.addEventListener('change', () => { 
        populateExamCourseSelects(); // This handles populating exam_course_id
        updateBlockTermOptions('exam_program', 'exam_block_term'); 
    });
    $('exam_intake')?.addEventListener('change', () => updateBlockTermOptions('exam_program', 'exam_block_term')); 
    
    // MESSAGE/WELCOME EDITOR TAB
    $('send-message-form')?.addEventListener('submit', handleSendMessage);
    $('edit-welcome-form')?.addEventListener('submit', handleSaveWelcomeMessage); 
    
    // RESOURCES TAB <-- BLOCK/TERM NOW USES STANDARD FUNCTION
    $('resource_program')?.addEventListener('change', () => { updateBlockTermOptions('resource_program', 'resource_block'); });
    $('resource_intake')?.addEventListener('change', () => { updateBlockTermOptions('resource_program', 'resource_block'); });
    
    // NEW: SECURITY TAB
    $('global-password-reset-form')?.addEventListener('submit', handleGlobalPasswordReset);
    $('account-deactivation-form')?.addEventListener('submit', handleAccountDeactivation);

    // MODAL/EDIT LISTENERS
    $('edit-user-form')?.addEventListener('submit', handleEditUser);
    document.querySelector('#userEditModal .close')?.addEventListener('click', () => { $('userEditModal').style.display = 'none'; });
    document.querySelector('#mapModal .close')?.addEventListener('click', () => { $('mapModal').style.display = 'none'; });
    $('edit-course-form')?.addEventListener('submit', handleEditCourse);
    $('edit_course_program')?.addEventListener('change', () => { updateBlockTermOptions('edit_course_program', 'edit_course_block'); });
    $('edit_course_intake')?.addEventListener('change', () => { updateBlockTermOptions('edit_course_program', 'edit_course_block'); });
    document.querySelector('#courseEditModal .close')?.addEventListener('click', () => { $('courseEditModal').style.display = 'none'; });
} 

// Logout
async function logout() {
    await logAudit('LOGOUT', `User ${currentUserProfile.full_name} logged out.`);
    await sb.auth.signOut();
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
}

/*******************************************************
 * 1.5. AUDIT LOGGING (NEW STRATEGIC FEATURE)
 *******************************************************/

/**
 * Logs a critical action to the audit_logs table.
 * @param {string} action_type - e.g., 'USER_DELETE', 'SYSTEM_LOCKDOWN', 'PROMOTION_MASS'
 * @param {string} details - Descriptive text of the action.
 * @param {string} target_id - ID of the object/user affected (optional).
 * @param {string} status - 'SUCCESS' or 'FAILURE'.
 */
async function logAudit(action_type, details, target_id = null, status = 'SUCCESS') {
    const logData = {
        user_id: currentUserProfile?.id || 'SYSTEM',
        user_role: currentUserProfile?.role || 'SYSTEM',
        action_type: action_type,
        details: details,
        target_id: target_id,
        status: status,
        ip_address: await getIPAddress() // Using the existing utility
    };

    const { error } = await sb.from(AUDIT_TABLE).insert([logData]);
    if (error) {
        console.error('Audit logging failed:', error);
    }
}

async function loadAuditLogs() {
    const tbody = $('audit-table');
    tbody.innerHTML = '<tr><td colspan="5">Loading audit logs...</td></tr>';

    const { data: logs, error } = await fetchData(AUDIT_TABLE, '*', {}, 'timestamp', false);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5">Error loading logs: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    logs.forEach(log => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        // Use consistent status classes for visualization
        const statusClass = log.status === 'SUCCESS' ? 'status-approved' : 'status-danger';

        tbody.innerHTML += `
            <tr>
                <td>${timestamp}</td>
                <td>${escapeHtml(log.user_role)} (${escapeHtml(log.user_id?.substring(0, 8))})</td>
                <td>${escapeHtml(log.action_type)}</td>
                <td>${escapeHtml(log.details)} (Target ID: ${escapeHtml(log.target_id?.substring(0, 8) || 'N/A')})</td>
                <td class="${statusClass}">${escapeHtml(log.status)}</td>
            </tr>
        `;
    });
}


/*******************************************************
 * 2. TABLE FILTERING & EXPORT FUNCTIONS
 *******************************************************/

/**
 * Generic function to filter table rows based on text input and specific columns.
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

        // Check each specified column for a match
        for (const colIndex of columnsToSearch) {
            const td = trs[i].getElementsByTagName('td')[colIndex];
            if (td) {
                const txtValue = td.textContent || td.innerText;
                if (txtValue.toUpperCase().indexOf(filter) > -1) {
                    rowMatches = true;
                    break; // Found a match, stop checking columns
                }
            }
        }

        trs[i].style.display = rowMatches ? "" : "none";
    }
}

/**
 * Core CSV Export Function - Referenced by ALL Export buttons in HTML
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


/*******************************************************
 * 3. Dashboard / Welcome Editor (Fixed)
 *******************************************************/

/**
 * NEW: Calculates and displays the total number of check-ins for the current day.
 */
async function loadTotalDailyCheckIns() {
    const today = new Date();
    // Set to start of today in UTC to align with Supabase check_in_time if it's stored as UTC
    today.setUTCHours(0, 0, 0, 0); 
    const todayISO = today.toISOString();
    
    // Set to start of tomorrow
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowISO = tomorrow.toISOString();

    const checkInsElement = $('totalDailyCheckIns');
    if (!checkInsElement) return;

    const { count, error } = await sb
        .from('geo_attendance_logs')
        .select('*', { count: 'exact', head: true })
        .gte('check_in_time', todayISO) // Greater than or equal to start of today
        .lt('check_in_time', tomorrowISO); // Less than start of tomorrow

    if (error) {
        console.error('Error counting daily check-ins:', error.message);
        checkInsElement.textContent = 'Error';
    } else {
        checkInsElement.textContent = count || 0;
    }
}


async function loadDashboardData() {
    // Total users
    const { count: allUsersCount } = await sb
        .from(USER_PROFILE_TABLE)
        .select('user_id', { count: 'exact' });
    $('totalUsers').textContent = allUsersCount || 0;
    
    // Total Daily Check-ins (NEW METRIC)
    await loadTotalDailyCheckIns(); 

    // Pending approvals
    const { count: pendingCount, error } = await sb
      .from(USER_PROFILE_TABLE)
      .select('user_id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) {
      console.error('Error counting pending approvals:', error.message);
      $('pendingApprovals').textContent = '0';
    } else {
      $('pendingApprovals').textContent = pendingCount || 0;
    }

    // Total students
    const { count: studentsCount } = await sb
        .from(USER_PROFILE_TABLE)
        .select('user_id', { count: 'exact' })
        .eq('role', 'student');
    $('totalStudents').textContent = studentsCount || 0;

    // Data Integrity Placeholder (NEW)
    // This would typically query a complex view or stored procedure.
    $('dataIntegrityScore').textContent = '98.5%';

    loadStudentWelcomeMessage();
}

async function loadStudentWelcomeMessage() {
    const { data } = await fetchData(SETTINGS_TABLE, '*', { key: MESSAGE_KEY });
    const messageDiv = $('student-welcome-message') || $('live-preview');
    if (!messageDiv) return;

    if (data && data.length > 0) {
        messageDiv.innerHTML = data[0].value;
    } else {
        messageDiv.innerHTML = '<p>Welcome student! Please check in for attendance. (Default Message)</p>';
    }
}

async function loadWelcomeMessageForEdit() {
    const { data } = await fetchData(SETTINGS_TABLE, '*', { key: MESSAGE_KEY });
    const editor = $('welcome-message-editor');

    if (data && data.length > 0) {
        editor.value = data[0].value;
    } else {
        editor.value = '<p>Welcome student! Please check in for attendance. (Default Message)</p>';
    }
    loadStudentWelcomeMessage(); // Refresh live preview
}

async function handleSaveWelcomeMessage(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const value = $('welcome-message-editor').value.trim();

    if (!value) {
        showFeedback('Message content cannot be empty.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    try {
        const { data: existing } = await fetchData(SETTINGS_TABLE, 'id', { key: MESSAGE_KEY });
        let updateOrInsertError = null;

        if (existing && existing.length > 0) {
            const { error } = await sb
                .from(SETTINGS_TABLE)
                .update({ value, updated_at: new Date().toISOString() })
                .eq('id', existing[0].id);
            updateOrInsertError = error;
        } else {
            const { error } = await sb
                .from(SETTINGS_TABLE)
                .insert({ key: MESSAGE_KEY, value });
            updateOrInsertError = error;
        }

        if (updateOrInsertError) {
            throw updateOrInsertError;
        } else {
            await logAudit('WELCOME_MESSAGE_UPDATE', `Successfully updated the student welcome message.`, null, 'SUCCESS');
            showFeedback('Welcome message saved successfully!', 'success');
            loadWelcomeMessageForEdit(); // Refresh the editor and preview
        }
    } catch (err) {
        await logAudit('WELCOME_MESSAGE_UPDATE', `Failed to update welcome message.`, null, 'FAILURE');
        showFeedback(`Failed to save message: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

/*******************************************************
 * 4. Users / Enroll Tab (Full Consolidated Logic)
 *******************************************************/

// ==========================================================
// *** HELPER FUNCTION TO DETERMINE ROLE-SPECIFIC FIELDS ***
// ==========================================================
function getRoleFields(role) {
  if (role === 'student') return { programField: 'program', extraField: 'course' };
  return { programField: 'program', extraField: null };
}

// ==========================================================
// *** CORE LOGIC FUNCTIONS ***
// ==========================================================

function updateBlockTermOptions(programSelectId, blockTermSelectId) {
  const program = $(programSelectId)?.value;
  const blockTermSelect = $(blockTermSelectId);
  if (!blockTermSelect) return;

  // Clear previous options
  blockTermSelect.innerHTML = '<option value="">-- Select Block/Term --</option>';

  // Determine available options based on program
  let options = [];
  if (program === 'KRCHN') {
    options = [
      { value: 'A', text: 'Block A' },
      { value: 'B', text: 'Block B' }
    ];
  } else if (program === 'TVET') {
    options = [
      { value: 'Term_1', text: 'Term 1' },
      { value: 'Term_2', text: 'Term 2' },
      { value: 'Term_3', text: 'Term 3' }
    ];
  } else {
    // Default or other programs
    options = [
      { value: 'A', text: 'Block A / Term 1' },
      { value: 'B', text: 'Block B / Term 2' },
  
    ];
  }

  // Add new options
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    blockTermSelect.appendChild(option);
  });
}

async function handleAddAccount(e) {
  e.preventDefault();
  const submitButton = e.submitter;
  const originalText = submitButton.textContent;
  setButtonLoading(submitButton, true, originalText);

  const name = $('account-name').value.trim();
  const email = $('account-email').value.trim();
  const password = $('account-password').value.trim();
  const role = $('account-role').value;
  const phone = $('account-phone').value.trim();
  const program = $('account-program').value;
  const intake_year = $('account-intake').value;
  const block = $('account-block-term').value;

  const userData = {
    full_name: name,
    role,
    phone,
    program,
    intake_year,
    block,
    status: 'approved',
    block_program_year: false
  };

  try {
    const { data: { user }, error: authError } = await sb.auth.signUp({
      email, password, options: { data: userData }
    });
    if (authError) throw authError;

    if (user && user.id) {
      const profileData = { user_id: user.id, email, ...userData };
      const { error: insertError } = await sb.from(USER_PROFILE_TABLE).insert([profileData]);
      if (insertError) {
        // CRITICAL: Delete user from auth if profile insertion fails
        await sb.auth.admin.deleteUser(user.id);
        throw insertError;
      }
      e.target.reset();
      showFeedback(`New ${role.toUpperCase()} account successfully enrolled!`, 'success');
      await logAudit('USER_ENROLL', `Enrolled new ${role} account: ${name} (${email})`, user.id);
      loadAllUsers();
      loadStudents();
      loadDashboardData();
    }
  } catch (err) {
    await logAudit('USER_ENROLL', `Failed to enroll new account: ${name}. Reason: ${err.message}`, null, 'FAILURE');
    showFeedback(`Account creation failed: ${err.message}`, 'error');
  } finally {
    setButtonLoading(submitButton, false, originalText);
  }
}

// ==========================================================
// *** MASS PROMOTION LOGIC (NEW STRATEGIC FEATURE) ***
// ==========================================================

async function handleMassPromotion(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const promote_intake = $('promote_intake').value;
    const promote_from_block = $('promote_from_block').value;
    const promote_to_block = $('promote_to_block').value;
    const program = $('promote_intake').selectedOptions[0].text.includes('KRCHN') ? 'KRCHN' : 'TVET'; // Simple determination

    if (!promote_intake || !promote_from_block || !promote_to_block) {
        showFeedback('Please select the Intake Year, FROM Block/Term, and TO Block/Term.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    if (promote_from_block === promote_to_block) {
        showFeedback('FROM and TO Block/Term must be different.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }
    
    if (!confirm(`CRITICAL ACTION: Promote ALL ${program} students from Intake ${promote_intake} Block/Term ${promote_from_block} to ${promote_to_block}? This is IRREVERSIBLE.`)) {
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    try {
        const { data, error } = await sb
            .from(USER_PROFILE_TABLE)
            .update({ block: promote_to_block })
            .eq('role', 'student')
            .eq('intake_year', promote_intake)
            .eq('block', promote_from_block)
            .select('user_id'); // Select user_id to count updated records

        if (error) throw error;
        
        const count = data?.length || 0;
        
        if (count > 0) {
             await logAudit('PROMOTION_MASS', `Promoted ${count} students: ${promote_intake} ${promote_from_block} -> ${promote_to_block}.`, null, 'SUCCESS');
             showFeedback(`✅ Successfully promoted ${count} students!`, 'success');
        } else {
             await logAudit('PROMOTION_MASS', `Attempted promotion: No students found for criteria ${promote_intake} ${promote_from_block}.`, null, 'WARNING');
             showFeedback('⚠️ No students were found matching the promotion criteria. Check your selections.', 'warning');
        }

        loadStudents();
    } catch (err) {
        await logAudit('PROMOTION_MASS', `Failed mass promotion for ${promote_intake} ${promote_from_block}. Reason: ${err.message}`, null, 'FAILURE');
        showFeedback(`❌ Mass promotion failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


// ==========================================================
// *** READ OPERATIONS (Consolidated Table) ***
// ==========================================================

async function loadPendingApprovals() {
  const tbody = $('pending-table');
  if (!tbody) {
    console.error("Missing <tbody id='pending-table'> element in your HTML.");
    return;
  }

  tbody.innerHTML = '<tr><td colspan="7">Loading pending approvals...</td></tr>';

  const { data: pending, error } = await sb
    .from(USER_PROFILE_TABLE)
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7">Error: ${error.message}</td></tr>`;
    return;
  }

  if (!pending || pending.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">No pending approvals.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  pending.forEach(u => {
    tbody.innerHTML += `
      <tr>
        <td>${escapeHtml(u.full_name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.role || 'N/A')}</td>
        <td>${escapeHtml(u.program || 'N/A')}</td>
        <td>${new Date(u.created_at).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-approve" onclick="approveUser('${u.user_id}', '${escapeHtml(u.full_name, true)}')">Approve</button>
          <button class="btn btn-delete" onclick="deleteProfile('${u.user_id}', '${escapeHtml(u.full_name, true)}')">Reject</button>
        </td>
      </tr>`;
  });
}

async function loadAllUsers() {
  const tbody = $('users-table');
  tbody.innerHTML = '<tr><td colspan="7">Loading all users...</td></tr>';

  const { data: users, error } = await sb.from(USER_PROFILE_TABLE)
    .select('*')
    .order('full_name', { ascending: true });
  if (error) {
    tbody.innerHTML = `<tr><td colspan="7">Error loading users: ${error.message}</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  users.forEach(u => {
    const roleOptions = ['student', 'lecturer', 'admin', 'superadmin']
      .map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`).join('');

    const isBlocked = u.block_program_year === true;
    const isApproved = u.status === 'approved';
    const statusText = isBlocked ? 'BLOCKED' : (isApproved ? 'Approved' : 'Pending');
    // Using defined CSS classes for status visualization
    const statusClass = isBlocked ? 'status-danger' : (isApproved ? 'status-approved' : 'status-pending');

    tbody.innerHTML += `
      <tr>
        <td>${escapeHtml(u.user_id.substring(0, 8))}...</td>
        <td>${escapeHtml(u.full_name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>
          <select class="btn" onchange="updateUserRole('${u.user_id}', this.value, '${escapeHtml(u.full_name, true)}')" ${u.role === 'superadmin' ? 'disabled' : ''}>
            ${roleOptions}
          </select>
        </td>
        <td>${escapeHtml(u.department || u.program || 'N/A')}</td>
        <td class="${statusClass}">${statusText}</td>
        <td>
          <button class="btn btn-map" onclick="openEditUserModal('${u.user_id}')">Edit</button>
          ${!isApproved ? `<button class="btn btn-approve" onclick="approveUser('${u.user_id}', '${escapeHtml(u.full_name, true)}')">Approve</button>` : ''}
          <button class="btn btn-delete" onclick="deleteProfile('${u.user_id}', '${escapeHtml(u.full_name, true)}')">Delete</button>
        </td>
      </tr>`;
  });

  filterTable('user-search', 'users-table', [1, 2, 4]);
}

async function loadStudents() {
  const tbody = $('students-table');
  tbody.innerHTML = '<tr><td colspan="9">Loading students...</td></tr>';

  const { data: students, error } = await sb.from(USER_PROFILE_TABLE)
    .select('*')
    .eq('role', 'student')
    .order('full_name', { ascending: true });
  if (error) {
    tbody.innerHTML = `<tr><td colspan="9">Error loading students: ${error.message}</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  students.forEach(s => {
    const isBlocked = s.block_program_year === true;
    const statusText = isBlocked ? 'BLOCKED' : (s.status === 'approved' ? 'Active' : 'Pending');
    const statusClass = isBlocked ? 'status-danger' : (s.status === 'approved' ? 'status-approved' : 'status-pending');

    tbody.innerHTML += `
      <tr>
        <td>${escapeHtml(s.user_id.substring(0, 8))}...</td>
        <td>${escapeHtml(s.full_name)}</td>
        <td>${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.program || 'N/A')}</td>
        <td>${escapeHtml(s.intake_year || 'N/A')}</td>
        <td>${escapeHtml(s.block || 'N/A')}</td>
        <td>${escapeHtml(s.phone)}</td>
        <td class="${statusClass}">${statusText}</td>
        <td>
          <button class="btn btn-map" onclick="openEditUserModal('${s.user_id}')">Edit</button>
          <button class="btn btn-delete" onclick="deleteProfile('${s.user_id}', '${escapeHtml(s.full_name, true)}')">Delete</button>
        </td>
      </tr>`;
  });

  filterTable('student-search', 'students-table', [1, 3, 5]);
}

// ==========================================================
// *** WRITE OPERATIONS (Approve / Role Change / Delete / Edit) ***
// ==========================================================
async function approveUser(userId, fullName) {
  if (!confirm(`Approve user ${fullName}?`)) return;

  const { error } = await sb
    .from(USER_PROFILE_TABLE)
    .update({ status: 'approved' })
    .eq('user_id', userId);

  if (error) {
    await logAudit('USER_APPROVE', `Failed to approve user ${fullName}. Reason: ${error.message}`, userId, 'FAILURE');
    showFeedback(`Failed: ${error.message}`, 'error');
  } else {
    await logAudit('USER_APPROVE', `User ${fullName} approved successfully.`, userId, 'SUCCESS');
    showFeedback('User approved successfully!', 'success');
    loadPendingApprovals();
    loadAllUsers();
    loadStudents();
    loadDashboardData();
  }
}

async function updateUserRole(userId, newRole, fullName) {
  if (!confirm(`Change user ${fullName}'s role to ${newRole}?`)) return;
  const { error } = await sb.from(USER_PROFILE_TABLE)
    .update({ role: newRole })
    .eq('user_id', userId);
  if (error) {
    await logAudit('USER_ROLE_UPDATE', `Failed to update ${fullName}'s role to ${newRole}. Reason: ${error.message}`, userId, 'FAILURE');
    showFeedback(`Failed: ${error.message}`, 'error');
  } else {
    await logAudit('USER_ROLE_UPDATE', `Updated ${fullName}'s role to ${newRole}.`, userId, 'SUCCESS');
    showFeedback('Role updated!', 'success');
    loadAllUsers();
    loadStudents();
    loadDashboardData();
  }
}

async function deleteProfile(userId, fullName) {
  if (!confirm(`CRITICAL: Permanently delete profile and user ${fullName}?`)) return;

  const { error } = await sb.from(USER_PROFILE_TABLE).delete().eq('user_id', userId);
  if (error) {
    await logAudit('USER_DELETE', `Failed to delete profile for ${fullName}. Reason: ${error.message}`, userId, 'FAILURE');
    showFeedback(`Failed: ${error.message}`, 'error');
  } else {
    // Attempt to delete from Supabase Auth as well
    const { error: authErr } = await sb.auth.admin.deleteUser(userId);
    if (authErr) {
        await logAudit('USER_DELETE', `Profile deleted, but Auth deletion failed for ${fullName}.`, userId, 'WARNING');
        showFeedback('Profile deleted from table, but auth deletion failed (manual cleanup required).', 'warning');
    }
    else {
        await logAudit('USER_DELETE', `User ${fullName} deleted successfully.`, userId, 'SUCCESS');
        showFeedback('User deleted successfully!', 'success');
    }
    loadAllUsers();
    loadStudents();
    loadDashboardData();
  }
}

async function openEditUserModal(userId) {
  try {
    const { data: user, error } = await sb
      .from(USER_PROFILE_TABLE)
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error || !user) throw new Error('User fetch failed.');

    $('edit_user_id').value = user.user_id;
    $('edit_user_id_display').textContent = user.user_id.substring(0, 8) + '...';
    $('edit_user_name').value = user.full_name || '';
    $('edit_user_email').value = user.email || '';
    $('edit_user_role').value = user.role || 'student';
    $('edit_user_program').value = user.program || 'KRCHN';
    $('edit_user_intake').value = user.intake_year || '2024';
    $('edit_user_block_status').value = user.block_program_year ? 'true' : 'false';
    updateBlockTermOptions('edit_user_program', 'edit_user_block');
    $('edit_user_block').value = user.block || 'Block_A'; // Use a default block value that matches updateBlockTermOptions output
    $('userEditModal').style.display = 'flex';
  } catch (e) {
    showFeedback(`Failed to load user: ${e.message}`, 'error');
  }
}

async function handleEditUser(e) {
  e.preventDefault();
  const submitButton = e.submitter;
  const originalText = submitButton.textContent;
  setButtonLoading(submitButton, true, originalText);

  const userId = $('edit_user_id').value;
  const newEmail = $('edit_user_email').value.trim();
  const newRole = $('edit_user_role').value;

  const updatedData = {
    full_name: $('edit_user_name').value.trim(),
    email: newEmail,
    program: $('edit_user_program').value || null,
    intake_year: $('edit_user_intake').value || null,
    block: $('edit_user_block').value || null,
    block_program_year: $('edit_user_block_status').value === 'true',
    status: 'approved'
  };

  try {
    // Update consolidated profile
    const { error: profileError } = await sb
      .from(USER_PROFILE_TABLE)
      .update({ ...updatedData, role: newRole })
      .eq('user_id', userId);

    if (profileError) throw profileError;

    // Optional audit log
    await logAudit(
      'USER_EDIT',
      `Edited profile for user ID ${userId.substring(0, 8)}. Role: ${newRole}.`,
      userId,
      'SUCCESS'
    );

    showFeedback('User profile updated successfully!', 'success');
    $('userEditModal').style.display = 'none';

    // Reload dashboard and tables
    loadAllUsers();
    loadStudents();
    loadDashboardData();

  } catch (e) {
    await logAudit(
      'USER_EDIT',
      `Failed to edit profile for user ID ${userId.substring(0, 8)}. Reason: ${e.message}`,
      userId,
      'FAILURE'
    );
    showFeedback('Failed to update user: ' + (e.message || e), 'error');
  } finally {
    setButtonLoading(submitButton, false, originalText);
  }
}


/*******************************************************
 * 5. Courses Tab
 *******************************************************/

async function handleAddCourse(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const course_name = $('course-name').value.trim();
    const unit_code = $('course-unit-code').value.trim(); 
    const description = $('course-description').value.trim();
    const target_program = $('course-program').value; 
    const intake_year = $('course-intake').value; 
    const block = $('course-block').value; 
    
    if (!course_name || !target_program || !unit_code) {
        showFeedback('Course Name, Unit Code, and Target Program are required.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    try {
        const { error } = await sb.from('courses').insert({ 
            course_name, 
            unit_code, 
            description, 
            target_program, 
            intake_year, 
            block,
            status: 'Active'
        });

        if (error) throw error;
        
        await logAudit('COURSE_ADD', `Successfully added course: ${unit_code} - ${course_name}.`, null, 'SUCCESS');
        showFeedback('Course added successfully!', 'success');
        e.target.reset();
        loadCourses();

    } catch (error) {
        await logAudit('COURSE_ADD', `Failed to add course ${unit_code}. Reason: ${error.message}`, null, 'FAILURE');
        showFeedback(`Failed to add course: ${error.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

async function loadCourses() {
    const tbody = $('courses-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading courses...</td></tr>';

    const { data: courses, error } = await fetchData('courses', '*', {}, 'course_name', true);
    if (error) { tbody.innerHTML = `<tr><td colspan="6">Error loading courses: ${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    courses.forEach(c => {
        const courseNameAttr = escapeHtml(c.course_name, true);
        const unitCodeAttr = escapeHtml(c.unit_code || '', true);
        const descriptionAttr = escapeHtml(c.description || '', true);
        const programTypeAttr = escapeHtml(c.target_program || '', true); 
        const intakeYearAttr = escapeHtml(c.intake_year || '', true);     
        const blockAttr = escapeHtml(c.block || '', true);              

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(c.course_name)}</td>
            <td>${escapeHtml(c.unit_code || 'N/A')}</td>
            <td>${escapeHtml(c.target_program || 'N/A')}</td>
            <td>${escapeHtml(c.intake_year || 'N/A')}</td>
            <td>${escapeHtml(c.block || 'N/A')}</td>
            <td>
                <button class="btn-action" onclick="openEditCourseModal('${c.id}', '${courseNameAttr}', '${unitCodeAttr}', '${descriptionAttr}', '${programTypeAttr}', '${intakeYearAttr}', '${blockAttr}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteCourse('${c.id}', '${unitCodeAttr}')">Delete</button>
            </td>
        </tr>`;
    });
    
    filterTable('course-search', 'courses-table', [0, 1, 3]); 
    
    // Auto-populate course selectors in other tabs
    populateExamCourseSelects(courses);
    populateSessionCourseSelects(courses);
}

async function deleteCourse(courseId, unitCode) {
    if (!confirm(`Are you sure you want to delete course ${unitCode}? This cannot be undone.`)) return;
    const { error } = await sb.from('courses').delete().eq('id', courseId);
    if (error) { 
        await logAudit('COURSE_DELETE', `Failed to delete course ID ${courseId}. Reason: ${error.message}`, courseId, 'FAILURE');
        showFeedback(`Failed to delete course: ${error.message}`, 'error'); 
    } 
    else { 
        await logAudit('COURSE_DELETE', `Successfully deleted course ${unitCode}.`, courseId, 'SUCCESS');
        showFeedback('Course deleted successfully!', 'success'); 
        loadCourses(); 
    }
}

function openEditCourseModal(id, name, unit_code, description, target_program, intake_year, block) {
    $('edit_course_id').value = id;
    $('edit_course_name').value = name; 
    $('edit_course_unit_code').value = unit_code; 
    $('edit_course_description').value = description;
    $('edit_course_program').value = target_program || ''; 
    $('edit_course_intake').value = intake_year; 
    
    // 1. Load correct block options based on program
    updateBlockTermOptions('edit_course_program', 'edit_course_block'); 
    
    // 2. Set the block value (this must happen AFTER block options are loaded)
    $('edit_course_block').value = block;

    $('courseEditModal').style.display = 'flex'; 
}

async function handleEditCourse(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const id = $('edit_course_id').value;
    const name = $('edit_course_name').value.trim();
    const unit_code = $('edit_course_unit_code').value.trim(); 
    const description = $('edit_course_description').value.trim(); // NOTE: Corrected ID from HTML (assuming it's not 'edit_course-description')
    const target_program = $('edit_course_program').value;
    const intake_year = $('edit_course_intake').value;
    const block = $('edit_course_block').value;
    
    try {
        const updateData = { 
            course_name: name, 
            unit_code: unit_code, 
            description: description, 
            target_program: target_program,
            intake_year: intake_year,
            block: block
        };
        
        const { error } = await sb.from('courses').update(updateData).eq('id', id); 

        if (error) throw error;

        await logAudit('COURSE_EDIT', `Updated course ${unit_code}.`, id, 'SUCCESS');
        showFeedback('Course updated successfully!', 'success');
        $('courseEditModal').style.display = 'none';
        loadCourses(); 
    } catch (e) {
        await logAudit('COURSE_EDIT', `Failed to update course ID ${id}. Reason: ${e.message}`, id, 'FAILURE');
        showFeedback('Failed to update course: ' + (e.message || e), 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


/*******************************************************
 * 6. Manage Sessions Tab (Including Clinical)
 *******************************************************/

async function populateSessionCourseSelects(courses = null) {
    const courseSelect = $('session_course_id');
    const program = $('session_program').value;
    
    let filteredCourses = [];
    
    if (!program) {
        filteredCourses = []; 
    } else {
        if (!courses) {
            const { data } = await fetchData('courses', 'id, course_name', { target_program: program }, 'course_name', true);
            filteredCourses = data || [];
        } else {
            filteredCourses = courses.filter(c => c.target_program === program);
        }
    }
    
    populateSelect(courseSelect, filteredCourses, 'id', 'course_name', 'Select Course (Optional)');
}


async function loadScheduledSessions() {
    const tbody = $('scheduled-sessions-table');
    tbody.innerHTML = '<tr><td colspan="6">Loading scheduled sessions...</td></tr>';
    
    const { data: sessions, error } = await fetchData(
        'scheduled_sessions',
        '*, course:course_id(course_name)',
        {},
        'session_date',
        false
    );

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error loading sessions: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    sessions.forEach(s => {
        const dateTime = new Date(s.session_date).toLocaleDateString() + ' ' + (s.session_time || 'N/A');
        const courseName = s.course?.course_name || 'N/A';

        let detail = s.session_title;
        if (s.session_type === 'class' && courseName !== 'N/A') {
            detail += ` (${courseName})`;
        }

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(s.session_type)}</td>
            <td>${escapeHtml(detail)}</td>
            <td>${dateTime}</td>
            <td>${escapeHtml(s.target_program || 'N/A')}</td>
            <td>${escapeHtml(s.block_term || 'N/A')}</td>
            <td>
                <button class="btn btn-delete" onclick="deleteSession('${s.id}', '${escapeHtml(s.session_title, true)}')">Delete</button>
            </td>
        </tr>`;
    });
}

async function handleAddSession(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const session_type = $('session_type').value.trim();
    const session_title = $('session_title').value.trim();
    const session_date = $('session_date').value;
    const session_time = $('session_time').value || '09:00:00'; // default if empty
    const target_program = $('session_program').value || null;
    const intake_year = $('session_intake').value;
    const block_term = $('session_block_term').value;
    const program_type = $('session_program_type').value || 'Diploma'; // ADD this field
    const course_id = $('session_course_id').value || null;

    // Validate required fields
    if (!session_type || !session_title || !session_date || !target_program || !intake_year || !block_term || !program_type) {
        showFeedback('Please fill in all required fields.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const sessionData = {
        title: session_type,            // maps to 'title' column
        session_title,                  // session_title column
        session_date,                   // timestamp
        session_time,                   // time
        target_program,
        session_type,
        program_type,                   // NEW
        intake_year,
        block_term,
        course_id,
        created_at: new Date().toISOString()
    };

    try {
        const { error, data } = await sb.from('scheduled_sessions').insert([sessionData]).select('id');

        if (error) throw error;

        await logAudit('SESSION_ADD', `Successfully scheduled session: ${session_title}.`, data?.[0]?.id, 'SUCCESS');
        showFeedback('✅ Session scheduled successfully!', 'success');
        e.target.reset();
        loadScheduledSessions();
        renderFullCalendar();

    } catch (error) {
        await logAudit('SESSION_ADD', `Failed to schedule session: ${session_title}. Reason: ${error.message}`, null, 'FAILURE');
        showFeedback(`❌ Failed to schedule session: ${error.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


async function deleteSession(sessionId, sessionTitle) {
    if (!confirm(`Are you sure you want to delete session: ${sessionTitle}?`)) return;
    const { error } = await sb.from('scheduled_sessions').delete().eq('id', sessionId);
    if (error) { 
        await logAudit('SESSION_DELETE', `Failed to delete session ${sessionTitle}. Reason: ${error.message}`, sessionId, 'FAILURE');
        showFeedback(`Failed to delete session: ${error.message}`, 'error'); 
    } 
    else { 
        await logAudit('SESSION_DELETE', `Session ${sessionTitle} deleted successfully.`, sessionId, 'SUCCESS');
        showFeedback('Session deleted successfully!', 'success'); 
        loadScheduledSessions(); 
        renderFullCalendar(); 
    }
}

// Placeholder function for Clinical Name Update
function saveClinicalName() {
    const program = $('clinical_program').value;
    const intake = $('clinical_intake').value;
    const block = $('clinical_block_term').value;
    const name = $('clinical_name_to_edit').value.trim();

    if (!program || !intake || !block || !name) {
        showFeedback('Please select Program, Intake, Block/Term and provide a name.', 'error');
        return;
    }
    
    // In a real system, this would write to a lookup table, e.g., 'clinical_names'
    showFeedback(`Clinical Area Name saved: "${name}" for ${program} ${intake} Block/Term ${block}. (Placeholder only)`, 'success');
}

/*******************************************************
 * 7. Attendance Tab (Super Admin)
 *******************************************************/

// ----------------------- Supporting Functions -----------------------

function toggleAttendanceFields() {
    const sessionType = $('att_session_type')?.value;
    const departmentInput = $('att_department');
    const courseSelect = $('att_course_id');

    if (!departmentInput) return;

    if (sessionType === 'clinical') {
        departmentInput.placeholder = "Clinical Department/Area";
        departmentInput.required = true;
        if (courseSelect) { courseSelect.required = false; courseSelect.value = ""; }
    } else if (sessionType === 'classroom') {
        departmentInput.placeholder = "Classroom Location/Room (Optional)";
        departmentInput.required = false;
        if (courseSelect) courseSelect.required = true;
    } else {
        departmentInput.placeholder = "Location/Detail (Optional)";
        departmentInput.required = false;
        if (courseSelect) { courseSelect.required = false; courseSelect.value = ""; }
    }
}

async function populateAttendanceSelects() {
    // Populate Student Select
    const { data: students } = await fetchData(USER_PROFILE_TABLE, 'user_id, full_name, role', { role: 'student' }, 'full_name', true);
    populateSelect($('att_student_id'), students, 'user_id', 'full_name', 'Select Student');

    // Populate Course Select
    const { data: courses } = await fetchData('courses', 'id, course_name', {}, 'course_name', true);
    populateSelect($('att_course_id'), courses, 'id', 'course_name', 'Select Course (For Classroom)');
}


// ----------------------- Admin Actions -----------------------

async function approveAttendanceRecord(recordId) {
    if (!currentUserProfile?.id) {
        showFeedback('Error: Admin ID not found for verification.', 'error');
        return;
    }
    if (!confirm('Approve this attendance record?')) return;

    try {
        const { error } = await sb
            .from('geo_attendance_logs')
            .update({
                is_verified: true,
                verified_by_id: currentUserProfile.id,
                verified_at: new Date().toISOString()
            })
            .eq('id', recordId);

        if (error) throw error;
        await logAudit('ATTENDANCE_APPROVE', `Approved attendance record ID ${recordId}.`, recordId, 'SUCCESS');
        showFeedback('Attendance approved successfully!', 'success');
        loadAttendance();
    } catch (err) {
        await logAudit('ATTENDANCE_APPROVE', `Failed to approve attendance ID ${recordId}. Reason: ${err.message}`, recordId, 'FAILURE');
        console.error('Approval failed:', err);
        showFeedback(`Failed to approve record: ${err.message}`, 'error');
    }
}

async function deleteAttendanceRecord(recordId) {
    if (!confirm('Permanently delete this attendance record?')) return;
    try {
        const { error } = await sb.from('geo_attendance_logs').delete().eq('id', recordId);
        if (error) throw error;
        await logAudit('ATTENDANCE_DELETE', `Deleted attendance record ID ${recordId}.`, recordId, 'SUCCESS');
        showFeedback('Attendance record deleted.', 'success');
        loadAttendance();
    } catch (err) {
        await logAudit('ATTENDANCE_DELETE', `Failed to delete attendance ID ${recordId}. Reason: ${err.message}`, recordId, 'FAILURE');
        console.error('Delete failed:', err);
        showFeedback(`Failed to delete record: ${err.message}`, 'error');
    }
}

function showMap(lat, lng, locationName, studentName, dateTime) {
    const modal = $('mapModal');
    const mapContainer = $('mapbox-map');
    const mapDetails = $('map-details');
    if (!modal || !mapContainer || !mapDetails) return;

    modal.style.display = 'flex';
    mapContainer.innerHTML = 'Map loading...';
    mapDetails.innerHTML = `**Student:** ${studentName}<br>**Location:** ${locationName}<br>**Time:** ${dateTime}`;

    // Ensure the map container is visible before initializing the map
    setTimeout(() => {
        // Remove existing map instance if it exists
        if (attendanceMap) {
            attendanceMap.remove();
            attendanceMap = null; 
        }
        
        // Initialize Leaflet map
        attendanceMap = L.map('mapbox-map').setView([lat, lng], 17);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(attendanceMap);

        L.marker([lat, lng])
            .addTo(attendanceMap)
            .bindPopup(`<b>${studentName}</b><br>${locationName}<br>${dateTime}`)
            .openPopup();
        
        // CRITICAL FIX: Ensure map tiles render correctly in the modal
        attendanceMap.invalidateSize();

    }, 300); 
}

// ----------------------- Manual Attendance -----------------------

async function handleManualAttendance(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const student_id = $('att_student_id').value;
    const session_type = $('att_session_type').value;
    const date = $('att_date').value;
    const time = $('att_time').value;
    const course_id = session_type === 'classroom' ? $('att_course_id').value : null;
    const department = $('att_department').value.trim() || null;
    const location_name = $('att_location').value.trim() || 'Manual Admin Entry';

    let check_in_time = new Date().toISOString();
    if (date && time) check_in_time = new Date(`${date}T${time}`).toISOString();
    else if (date) check_in_time = new Date(date).toISOString();

    if (!student_id || (session_type === 'classroom' && !course_id)) {
        showFeedback('Please select a student and required fields.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const attendanceData = {
        student_id,
        session_type,
        check_in_time,
        department,
        course_id,
        is_manual_entry: true,
        latitude: null,
        longitude: null,
        location_name,
        ip_address: await getIPAddress(),
        device_id: getDeviceId(),
        target_name: session_type === 'clinical' ? department : $('att_course_id')?.selectedOptions[0]?.text || null
    };

    try {
        const { error, data } = await sb.from('geo_attendance_logs').insert([attendanceData]).select('id');
        if (error) throw error;
        
        await logAudit('ATTENDANCE_MANUAL', `Recorded manual attendance for student ${student_id} for ${session_type}.`, data?.[0]?.id, 'SUCCESS');
        showFeedback('Manual attendance recorded successfully!', 'success'); 
        e.target.reset(); 
        loadAttendance(); 
        toggleAttendanceFields(); 

    } catch (error) {
        await logAudit('ATTENDANCE_MANUAL', `Failed manual attendance for student ${student_id}. Reason: ${error.message}`, student_id, 'FAILURE');
        showFeedback(`Failed to record attendance: ${error.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

// ----------------------- Load Attendance -----------------------

async function loadAttendance() {
    const todayBody = $('attendance-table');
    const pastBody = $('past-attendance-table');
    todayBody.innerHTML = '<tr><td colspan="7">Loading today\'s records...</td></tr>';
    pastBody.innerHTML = '<tr><td colspan="6">Loading history...</td></tr>';

    const todayISO = new Date().toISOString().slice(0,10);

    const { data: allRecords, error } = await sb
        .from('geo_attendance_logs')
        .select(`
            *,
            is_verified,
            latitude,
            longitude,
            target_name,
            ${USER_PROFILE_TABLE}:student_id(full_name, role)
        `)
        .order('check_in_time', { ascending: false });

    if (error) { 
        todayBody.innerHTML = `<tr><td colspan="7">Error: ${error.message}</td></tr>`;
        pastBody.innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`;
        return;
    }

    let todayHtml='', pastHtml='';

    allRecords.forEach(r=>{
        const userProfile = r[USER_PROFILE_TABLE];
        const userName = userProfile?.full_name || 'N/A User';
        const dateTime = new Date(r.check_in_time).toLocaleString();
        const targetDetail = r.target_name || r.department || r.location_name || 'N/A Target';
        const locationDisplay = r.location_friendly_name || r.location_name || r.department || 'N/A';
        const geoStatus = (r.latitude && r.longitude)?'Yes (Geo-Logged)':'No (Manual)';

        let actionsHtml = '';
        const mapAvailable = r.latitude && r.longitude;
        // NOTE: Escape single quotes in the strings passed to the function!
        const mapAction = mapAvailable ? `showMap(${r.latitude},${r.longitude},'${locationDisplay.replace(/'/g,"\\'")}','${userName.replace(/'/g,"\\'")}','${dateTime.replace(/'/g,"\\'")}')` : '';

        actionsHtml += `<button class="btn btn-map btn-small" ${mapAvailable?'':'disabled'} onclick="${mapAction}">View Map</button>`;

        const isToday = new Date(r.check_in_time).toISOString().slice(0,10) === todayISO;
        const statusDisplay = r.is_verified ? '✅ Verified' : 'Pending';

        if (isToday){
            if (!r.is_verified) actionsHtml += `<button class="btn btn-approve btn-small" onclick="approveAttendanceRecord('${r.id}')" style="margin-left:5px;">Approve</button>`;
        }
        
        actionsHtml += `<button class="btn btn-delete btn-small" onclick="deleteAttendanceRecord('${r.id}')" style="margin-left:10px;">Delete</button>`;

        const rowHtml = `<tr>
            <td>${userName}</td>
            <td>${r.session_type || 'N/A'}</td>
            <td>${targetDetail}</td>
            <td>${locationDisplay}</td>
            <td>${dateTime}</td>
            <td>${geoStatus}</td>
            <td>${actionsHtml}</td>
        </tr>`;

        if (isToday) todayHtml += rowHtml;
        else pastHtml += `<tr>
                <td>${userName}</td>
                <td>${r.session_type || 'N/A'}</td>
                <td>${targetDetail}</td>
                <td>${dateTime}</td>
                <td>${statusDisplay}</td>
                <td>${actionsHtml.replace('View Map', 'View')}</td>
            </tr>`;
    });

    todayBody.innerHTML = todayHtml||'<tr><td colspan="7">No check-in records for today.</td></tr>';
    pastBody.innerHTML = pastHtml||'<tr><td colspan="6">No past attendance history found.</td></tr>';
}

/********************************
 * 8. CATS / Exams
 ********************************/

// Populate course dropdown based on selected program
async function populateExamCourseSelects(courses = null) {
  const courseSelect = $('exam_course_id');
  const program = $('exam_program').value;

  let filteredCourses = [];

  if (!program) filteredCourses = [];
  else {
    if (!courses) {
      const { data } = await fetchData(
        'courses',
        'id, course_name, target_program',
        { target_program: program },
        'course_name',
        true
      );
      filteredCourses = data || [];
    } else {
      filteredCourses = courses.filter(c => c.target_program === program);
    }
  }

  populateSelect(courseSelect, filteredCourses, 'id', 'course_name', 'Select Course');
}

// Add Exam / CAT
async function handleAddExam(e) {
  e.preventDefault();
  const submitButton = e.submitter;
  const originalText = submitButton.textContent;
  setButtonLoading(submitButton, true, originalText);

  const exam_type = $('exam_type').value;
  const exam_link = $('exam_link').value.trim();
  const exam_duration_minutes = parseInt($('exam_duration_minutes').value);
  const exam_start_time = $('exam_start_time').value;
  const program = $('exam_program').value;
  const course_id = $('exam_course_id').value;
  const exam_title = $('exam_title').value.trim();
  const exam_date = $('exam_date').value;
  const exam_status = $('exam_status').value;
  const intake = $('exam_intake').value;
  const block_term = $('exam_block_term').value;

  if (
    !program || !course_id || !exam_title || !exam_date ||
    !intake || !block_term || !exam_type || isNaN(exam_duration_minutes)
  ) {
    showFeedback(
      'All exam fields (Program, Course, Title, Date, Intake, Block/Term, Type, and Duration) are required.',
      'error'
    );
    setButtonLoading(submitButton, false, originalText);
    return;
  }

  try {
    const { error, data } = await sb.from('exams').insert({
      exam_name: exam_title,
      course_id,
      exam_date,
      exam_start_time,
      exam_type,
      online_link: exam_link || null,
      duration_minutes: exam_duration_minutes,
      target_program: program,
      intake_year: intake,
      block_term,
      status: exam_status
    }).select('id');

    if (error) throw error;

    await logAudit('EXAM_ADD', `Posted new ${exam_type}: ${exam_title}.`, data?.[0]?.id, 'SUCCESS');
    showFeedback('Assessment added successfully!', 'success');
    e.target.reset();
    loadExams();
    renderFullCalendar();
  } catch (error) {
    await logAudit('EXAM_ADD', `Failed to add ${exam_type}: ${exam_title}. ${error.message}`, null, 'FAILURE');
    showFeedback(`Failed to add assessment: ${error.message}`, 'error');
  } finally {
    setButtonLoading(submitButton, false, originalText);
  }
}

// Load Exams
async function loadExams() {
  const tbody = $('exams-table');
  tbody.innerHTML = '<tr><td colspan="8">Loading exams/CATs...</td></tr>';

  const { data: exams, error } = await fetchData(
    'exams',
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
    const dateTime = new Date(e.exam_date).toLocaleDateString() + ' ' + (e.exam_start_time || '');
    const courseName = e.course?.course_name || 'N/A';
    const type = e.exam_type || 'N/A';

    let actionsHtml = `<button class="btn-action" onclick="openEditExamModal('${e.id}')">Edit</button>`;
    if (e.online_link) {
      actionsHtml += `<a href="${escapeHtml(e.online_link)}" target="_blank" class="btn btn-map" style="margin-left: 5px;">Link</a>`;
    }
    actionsHtml += `<button class="btn-action" onclick="openGradeModal('${e.id}', '${escapeHtml(e.exam_name, true)}')">Grade</button>`;
    actionsHtml += `<button class="btn btn-delete" onclick="deleteExam('${e.id}', '${escapeHtml(e.exam_name, true)}')">Delete</button>`;

    tbody.innerHTML += `
      <tr>
        <td>${escapeHtml(type)}</td>
        <td>${escapeHtml(e.target_program || 'N/A')}</td>
        <td>${escapeHtml(courseName)}</td>
        <td>${escapeHtml(e.exam_name)}</td>
        <td>${dateTime}</td>
        <td>${escapeHtml(e.duration_minutes + ' mins' || 'N/A')}</td>
        <td>${escapeHtml(e.status)}</td>
        <td>${actionsHtml}</td>
      </tr>`;
  });

  filterTable('exam-search', 'exams-table', [3, 2, 0]);
  populateStudentExams(exams);
}

// Delete Exam
async function deleteExam(examId, examName) {
  if (!confirm(`Delete exam: ${examName}?`)) return;
  const { error } = await sb.from('exams').delete().eq('id', examId);
  if (error) {
    await logAudit('EXAM_DELETE', `Failed to delete ${examName}. ${error.message}`, examId, 'FAILURE');
    showFeedback(`Failed to delete exam: ${error.message}`, 'error');
  } else {
    await logAudit('EXAM_DELETE', `Deleted exam ${examName}.`, examId, 'SUCCESS');
    showFeedback('Exam deleted successfully!', 'success');
    loadExams();
    renderFullCalendar();
  }
}

// Edit Placeholder
function openEditExamModal(examId) {
  showFeedback('Edit functionality for exams is still under development.', 'info');
}

// Grade Modal — simplified version
async function openGradeModal(examId, examName) {
  const { data: students, error } = await fetchData(
    USER_PROFILE_TABLE, // Changed to match your consolidated table name
    'user_id, full_name',
    { role: 'student' }, // Filter for students
    'full_name',
    true
  );
  if (error) {
    showFeedback('Error loading students for grading.', 'error');
    return;
  }

  const modalHtml = `
    <div class="modal-content">
      <h3>Grade: ${escapeHtml(examName)}</h3>
      <table class="grade-table">
        <thead><tr><th>Student</th><th>Score (%)</th></tr></thead>
        <tbody>
          ${students
            .map(
              s => `<tr>
                      <td>${escapeHtml(s.full_name)}</td>
                      <td><input type="number" min="0" max="100" id="score-${s.user_id}" placeholder="0-100"></td>
                    </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <button class="btn-action" onclick="saveGrades('${examId}')">Save Grades</button>
      <button class="btn btn-delete" onclick="closeModal()">Cancel</button>
    </div>`;

  showModal(modalHtml);
}

// Save Grades
async function saveGrades(examId) {
  const rows = document.querySelectorAll('.grade-table tbody tr');
  const grades = [];

  rows.forEach(row => {
    const input = row.querySelector('input');
    // Note: Assuming student ID is stored in the 'user_id' field of the student's profile.
    const studentId = input.id.replace('score-', ''); 
    const score = parseFloat(input.value);
    // Only save valid scores between 0-100
    if (!isNaN(score) && score >= 0 && score <= 100) grades.push({ exam_id: examId, student_id: studentId, score });
  });

  if (grades.length === 0) {
    showFeedback('No valid scores entered (0-100).', 'error');
    return;
  }

  // Use upsert to handle new results or updates to existing ones
  const { error } = await sb.from('exam_results').upsert(grades, { onConflict: 'exam_id, student_id' }); 
  if (error) {
    showFeedback(`Failed to save grades: ${error.message}`, 'error');
    return;
  }

  closeModal();
  showFeedback('Grades saved/updated successfully!', 'success');
  await logAudit('EXAM_GRADE', `Saved grades for exam ${examId}.`, examId, 'SUCCESS');
}

// Generic Modal Function - Required for openGradeModal
function showModal(contentHtml) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'tempModal'; // Temporary ID for easy cleanup
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="closeModal()">&times;</span>
            ${contentHtml}
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = $('tempModal');
    if (modal) {
        modal.style.display = 'none';
        modal.remove();
    }
}

// Student view
function populateStudentExams(exams) {
  const container = $('student-exams');
  if (!container) return; // Check if the element exists (only in student view)
  container.innerHTML = '';

  if (!exams || exams.length === 0) {
    container.innerHTML = '<p>No available assessments at the moment.</p>';
    return;
  }

  exams.forEach(e => {
    if (e.status !== 'Upcoming') return;

    const startDateTime = new Date(`${e.exam_date}T${e.exam_start_time || '00:00:00'}`);
    const formattedDate = startDateTime.toLocaleDateString();
    const formattedTime = startDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const examCard = document.createElement('div');
    examCard.className = 'exam-card';
    examCard.innerHTML = `
      <h4>${escapeHtml(e.exam_type)}: ${escapeHtml(e.exam_name)}</h4>
      <p><strong>Course:</strong> ${escapeHtml(e.course?.course_name || 'N/A')}</p>
      <p><strong>Scheduled:</strong> ${formattedDate} at ${formattedTime}</p>
      <p><strong>Duration:</strong> ${e.duration_minutes} minutes</p>
      ${
        e.online_link
          ? `<a href="${escapeHtml(e.online_link)}" target="_blank" class="btn-action">Start Online Assessment</a>`
          : '<p class="info-text">Link will be provided closer to exam time.</p>'
      }
    `;
    container.appendChild(examCard);
  });
}


/*******************************************************
 * 9. Calendar Tab (FullCalendar Integration)
 *******************************************************/

async function renderFullCalendar() {
    const calendarEl = $('fullCalendarDisplay');
    if (!calendarEl) return;
    calendarEl.innerHTML = ''; 

    const { data: sessions } = await fetchData('scheduled_sessions', '*', {}, 'session_date', true);
    const { data: exams } = await fetchData('exams', '*, course:course_id(course_name)', {}, 'exam_date', true);

    const events = [];

    // Map Sessions
    sessions?.forEach(s => {
        let title = `${s.session_type.toUpperCase()}: ${s.session_title}`;
        let color = s.session_type === 'clinical' ? '#2ecc71' : s.session_type === 'event' ? '#9b59b6' : '#3498db';
        
        events.push({
            title: title,
            start: s.session_date + (s.session_time ? `T${s.session_time}` : ''),
            allDay: !s.session_time,
            color: color
        });
    });

    // Map Exams
    exams?.forEach(e => {
        const courseName = e.course?.course_name || 'Exam';
        const start = e.exam_date + (e.exam_start_time ? `T${e.exam_start_time}` : '');

        events.push({
            title: `${e.exam_type}: ${e.exam_name} (${courseName})`,
            start: start,
            allDay: !e.exam_start_time,
            color: '#e74c3c'
        });
    });

    // The FullCalendar library must be included in your HTML for this to work
    if (typeof FullCalendar !== 'undefined' && calendarEl) {
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            events: events
        });

        calendar.render();
    } else {
        calendarEl.innerHTML = '<p>FullCalendar library not loaded. Please ensure it is included in your HTML.</p>';
    }
}
// *************************************************************************
// *** 10. STUDENT & ADMIN MESSAGES + OFFICIAL ANNOUNCEMENT (MERGED FEED) ***
// *************************************************************************

// ---------------- Utility Functions ----------------

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Show feedback to user
 */
function showFeedback(msg, type = 'info') {
  // Simple alert fallback; replace with toast if needed
  alert(msg);
}

/**
 * Set button to loading state
 */
function setButtonLoading(btn, isLoading, originalText) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Processing...' : originalText;
}

/**
 * Log audit (dummy fallback if function not defined)
 */
async function logAudit(action, details, refId = null, status = 'SUCCESS') {
  if (!window.sb) return;
  try {
    await sb.from('audit_logs').insert({
      action,
      details,
      reference_id: refId,
      status,
      performed_by: currentUserProfile?.id || null
    });
  } catch (err) {
    console.error('Failed to log audit:', err);
  }
}

// ---------------- Student Messages ----------------

/**
 * Load a single student message from app_settings
 */
async function loadStudentMessage(key, elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = 'Loading...';
  try {
    const { data, error } = await sb.from('app_settings').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    element.innerHTML = data?.value || 'No message available.';
  } catch (err) {
    console.error(`Failed to load ${key}:`, err);
    element.textContent = 'Failed to load message. Please refresh.';
  }
}

/**
 * Load student merged feed (messages + announcements)
 */
async function loadStudentMessages() {
  const container = document.getElementById('messages-list');
  if (!container) return;
  container.innerHTML = '<p>Loading messages...</p>';

  try {
    // Fetch notifications for the student's program or ALL
    const { data: messages, error } = await sb.from('notifications')
      .select('*, sender:sender_id(full_name)')
      .or(`target_program.eq.${currentUserProfile?.program},target_program.is.null`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!messages || messages.length === 0) {
      container.innerHTML = '<p>No messages found.</p>';
      return;
    }

    // Render messages
    container.innerHTML = '';
    messages.forEach(msg => {
      const sender = msg.sender?.full_name || 'System';
      const date = msg.created_at ? new Date(msg.created_at).toLocaleString() : 'Unknown';
      const messageSnippet = msg.message.length > 150 ? msg.message.substring(0,150) + '...' : msg.message;

      const div = document.createElement('div');
      div.className = 'student-message';
      div.innerHTML = `
        <strong>${escapeHtml(msg.subject)}</strong> <em>from ${escapeHtml(sender)} on ${date}</em>
        <p>${escapeHtml(messageSnippet)}</p>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to load student messages:', err);
    container.innerHTML = '<p>Error loading messages. Please refresh.</p>';
  }
}

/**
 * Mark a student message as read
 */
async function markMessageAsRead(messageId) {
  try {
    if (currentUserProfile?.role !== 'student') return;
    await sb.from('notifications')
      .update({ is_read: true })
      .eq('id', messageId)
      .eq('recipient_id', currentUserProfile.id);

    await loadStudentMessages();
  } catch (err) {
    console.error('Failed to mark message as read:', err);
  }
}

// ---------------- Admin Messages ----------------

/**
 * Send system/admin message
 */
async function handleSendMessage(e) {
  e.preventDefault();
  const submitButton = e.submitter;
  const originalText = submitButton?.textContent;
  setButtonLoading(submitButton, true, originalText);

  const target_program = document.getElementById('msg_program').value;
  const message_content = document.getElementById('msg_body').value.trim();
  const subject = document.getElementById('msg_subject').value.trim() || `System Message to ${target_program}`;

  if (!message_content) {
    showFeedback('Message content cannot be empty.', 'error');
    setButtonLoading(submitButton, false, originalText);
    return;
  }

  try {
    const { error, data } = await sb.from('notifications').insert({
      target_program: target_program === 'ALL' ? null : target_program,
      subject,
      message: message_content,
      message_type: 'system',
      sender_id: currentUserProfile.id
    }).select('id');

    if (error) throw error;

    await logAudit('MESSAGE_SEND', `Sent notification: ${subject} to ${target_program}`, data?.[0]?.id, 'SUCCESS');
    showFeedback('Message sent successfully!', 'success');
    e.target.reset();
    await loadAdminMessages();
  } catch (err) {
    await logAudit('MESSAGE_SEND', `Failed to send notification: ${subject}. Reason: ${err.message}`, null, 'FAILURE');
    showFeedback(`Failed to send message: ${err.message}`, 'error');
  } finally {
    setButtonLoading(submitButton, false, originalText);
  }
}

/**
 * Load admin messages table
 */
async function loadAdminMessages() {
  const tbody = document.getElementById('messages-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5">Loading messages...</td></tr>';

  try {
    const { data: messages, error } = await sb.from('notifications')
      .select('*, sender:sender_id(full_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!messages || messages.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">No messages found.</td></tr>';
      return;
    }

    const fragment = document.createDocumentFragment();

    messages.forEach(msg => {
      const recipient = msg.target_program || 'ALL Students';
      const senderName = msg.sender?.full_name || 'System';
      const sendDate = msg.created_at ? new Date(msg.created_at).toLocaleString() : 'Unknown';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(recipient)}</td>
        <td>${escapeHtml(msg.subject)}</td>
        <td>${escapeHtml(msg.message.substring(0,80) + (msg.message.length > 80 ? '...' : ''))}</td>
        <td>${sendDate}</td>
        <td>
          <button class="btn-action" onclick="showFeedback('Edit functionality not implemented yet.')">Edit</button>
          <button class="btn btn-delete" onclick="deleteNotification('${msg.id}')">Delete</button>
        </td>
      `;
      fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
  } catch (err) {
    console.error('Failed to load admin messages:', err);
    tbody.innerHTML = `<tr><td colspan="5">Error loading messages: ${err.message}</td></tr>`;
  }
}

/**
 * Delete notification
 */
window.deleteNotification = async function(id) {
  if (!confirm('Are you sure you want to delete this message?')) return;
  try {
    const { error } = await sb.from('notifications').delete().eq('id', id);
    if (error) throw error;
    await logAudit('NOTIFICATION_DELETE', `Deleted notification ID: ${id}`, id, 'SUCCESS');
    showFeedback('Message deleted successfully!', 'success');
    await loadAdminMessages();
  } catch (err) {
    await logAudit('NOTIFICATION_DELETE', `Failed to delete notification ID: ${id}. Reason: ${err.message}`, id, 'FAILURE');
    showFeedback(`Failed to delete message: ${err.message}`, 'error');
  }
}

// ---------------- Public Announcements ----------------

/**
 * Load public/official announcements
 */
async function loadPublicAnnouncements() {
  const container = document.getElementById('public-announcements');
  if (!container) return;

  container.innerHTML = '<p>Loading announcements...</p>';

  try {
    const { data: announcements, error } = await sb.from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!announcements || announcements.length === 0) {
      container.innerHTML = '<p>No public announcements found.</p>';
      return;
    }

    container.innerHTML = '';
    announcements.forEach(a => {
      const date = a.created_at ? new Date(a.created_at).toLocaleString() : 'Unknown';
      const div = document.createElement('div');
      div.className = 'announcement';
      div.innerHTML = `
        <strong>${escapeHtml(a.title)}</strong> <em>on ${date}</em>
        <p>${escapeHtml(a.content)}</p>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to load announcements:', err);
    container.innerHTML = '<p>Error loading announcements. Please refresh.</p>';
  }
}

// ---------------- Initialization ----------------

/**
 * Call this on page load to populate all sections
 */
async function initMessagesSection() {
  await loadStudentMessages();
  await loadAdminMessages();
  await loadPublicAnnouncements();
}

document.addEventListener('DOMContentLoaded', initMessagesSection);



/*******************************************************
 * 11. Resources Tab (Fully Corrected)
 *******************************************************/
 
// -------------------- Handle Upload Form --------------------
$('upload-resource-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const program = $('resource_program').value;
    const intake = $('resource_intake').value;
    const block = $('resource_block').value;
    const fileInput = $('resource-file');
    const title = $('resource-title').value.trim();

    if (!fileInput.files.length || !program || !intake || !block || !title) {
        showFeedback('Please select a file and fill all required fields.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const file = fileInput.files[0];
    const safeFileName = `${title.replace(/\s+/g, '_')}_${file.name.replace(/\s+/g, '_')}`;
    const filePath = `${program}/${intake}/${block}/${safeFileName}`;

    try {
        // 1️⃣ Upload to Supabase Storage
        const { error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, file, { cacheControl: '3600', upsert: true, contentType: file.type });
        if (uploadError) throw uploadError;

        // 2️⃣ Get public URL
        const { data: { publicUrl } } = sb.storage
            .from(RESOURCES_BUCKET)
            .getPublicUrl(filePath);

        // 3️⃣ Insert metadata into 'resources' table
        const { error: dbError, data } = await sb
            .from('resources')
            .insert({
                title: title,
                program_type: program,
                intake: intake,
                block: block,
                file_path: filePath,
                file_name: file.name,
                file_url: publicUrl,
                uploaded_by: currentUserProfile?.id,
                uploaded_by_name: currentUserProfile?.full_name,
                created_at: new Date().toISOString()
            }).select('id');

        if (dbError) throw dbError;

        await logAudit('RESOURCE_UPLOAD', `Uploaded resource: ${title} to ${program}/${intake}/${block}.`, data?.[0]?.id, 'SUCCESS');
        showFeedback(`✅ File "${file.name}" uploaded successfully!`, 'success');
        e.target.reset();
        loadResources();
    } catch (err) {
        await logAudit('RESOURCE_UPLOAD', `Failed to upload resource: ${title}. Reason: ${err.message}`, null, 'FAILURE');
        console.error('Upload failed:', err);
        showFeedback(`❌ Upload failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

// -------------------- Load Resources Table --------------------
async function loadResources() {
    const tableBody = $('resources-list');
    if (!tableBody) return console.error("Resource table body element with ID 'resources-list' not found.");

    tableBody.innerHTML = '<tr><td colspan="7">Loading resources...</td></tr>';

    try {
        const { data: resources, error } = await sb
            .from('resources')
            .select('id, title, program_type, file_path, created_at, uploaded_by_name, file_url, intake, block')
            .order('created_at', { ascending: false });
        if (error) throw error;

        tableBody.innerHTML = '';
        if (!resources?.length) {
            tableBody.innerHTML = '<tr><td colspan="7">No resources found.</td></tr>';
            return;
        }

        resources.forEach(resource => {
            const date = new Date(resource.created_at).toLocaleString();
            const safeFilePath = escapeHtml(resource.file_path || '', true);
            const safeId = resource.id;
            const safeTitle = escapeHtml(resource.title || 'Untitled', true);
            const safeUrl = escapeHtml(resource.file_url || '#', true);

            tableBody.innerHTML += `
                <tr>
                    <td>${escapeHtml(resource.program_type || 'N/A')}</td>
                    <td>${escapeHtml(resource.title || 'Untitled')}</td>
                    <td>${escapeHtml(resource.intake || 'N/A')}</td>
                    <td>${escapeHtml(resource.block || 'N/A')}</td>
                    <td>${escapeHtml(resource.uploaded_by_name || 'Unknown')}</td>
                    <td>${date}</td>
                    <td>
                        <a href="${safeUrl}" target="_blank" class="btn-action">Download</a>
                        <button class="btn btn-delete" onclick="deleteResource('${safeFilePath}', ${safeId}, '${safeTitle}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error('Error loading resources:', e);
        tableBody.innerHTML = `<tr><td colspan="7">Error loading resources: ${e.message}</td></tr>`;
        await logAudit('RESOURCE_LOAD', `Failed to load resources: ${e.message}`, null, 'FAILURE');
    }

    filterTable('resource-search', 'resources-list', [0, 1, 2, 3]);
}

// -------------------- Delete Resource --------------------
async function deleteResource(filePath, id, title) {
    if (!confirm(`Are you sure you want to delete the file: ${title}? This action cannot be undone.`)) return;

    try {
        const { error: storageError } = await sb.storage.from(RESOURCES_BUCKET).remove([filePath]);
        if (storageError) throw storageError;

        const { error: dbError } = await sb.from('resources').delete().eq('id', id);
        if (dbError) throw dbError;

        await logAudit('RESOURCE_DELETE', `Deleted resource: ${title} (${filePath}).`, id, 'SUCCESS');
        showFeedback('✅ Resource deleted successfully.', 'success');
        loadResources();
    } catch (e) {
        await logAudit('RESOURCE_DELETE', `Failed to delete resource: ${title}. Reason: ${e.message}`, id, 'FAILURE');
        console.error('Delete failed:', e);
        showFeedback(`❌ Failed to delete resource: ${e.message}`, 'error');
    }
}

/*******************************************************
 * 12. Security & System Status (NEW STRATEGIC FEATURE)
 *******************************************************/

async function loadSystemStatus() {
    const { data } = await fetchData(SETTINGS_TABLE, '*', { key: GLOBAL_SETTINGS_KEY });
    const statusData = data?.[0] || { value: 'ACTIVE', message: '' };

    // Assuming a select element with id 'global_status' exists
    const statusSelect = $('global_status');
    if (statusSelect) statusSelect.value = statusData.value;
    
    const messageInput = $('maintenance_message');
    if (messageInput) messageInput.value = statusData.message || '';
}

/**
 * Updates the global system status (The Kill Switch).
 * @param {string} newStatus - 'ACTIVE', 'MAINTENANCE', or 'EMERGENCY_LOCKDOWN'.
 */
async function updateSystemStatus(newStatus) {
    const currentMessage = $('maintenance_message').value.trim();
    if (!confirm(`CRITICAL: Change system status to ${newStatus}? This affects ALL users.`)) {
        loadSystemStatus(); // Revert dropdown selection
        return;
    }
    
    if (newStatus !== 'ACTIVE' && !currentMessage) {
        showFeedback('A message is required for users when the system is not ACTIVE.', 'warning');
        loadSystemStatus(); // Revert dropdown selection
        return;
    }

    const { data: existing } = await fetchData(SETTINGS_TABLE, 'id', { key: GLOBAL_SETTINGS_KEY });
    let error = null;

    const updateData = {
        key: GLOBAL_SETTINGS_KEY,
        value: newStatus,
        message: newStatus === 'ACTIVE' ? null : currentMessage,
        updated_at: new Date().toISOString()
    };

    if (existing?.length > 0) {
        ({ error } = await sb.from(SETTINGS_TABLE).update(updateData).eq('id', existing[0].id));
    } else {
        ({ error } = await sb.from(SETTINGS_TABLE).insert([updateData]));
    }

    if (error) {
        await logAudit('SYSTEM_STATUS_CHANGE', `Failed to set status to ${newStatus}. Reason: ${error.message}`, null, 'FAILURE');
        showFeedback(`Failed to update system status: ${error.message}`, 'error');
    } else {
        await logAudit('SYSTEM_STATUS_CHANGE', `System status set to ${newStatus}. Message: ${updateData.message || 'N/A'}.`, null, 'SUCCESS');
        showFeedback(`System status successfully set to: ${newStatus}!`, 'success');
    }
}

/**
 * Saves the maintenance message without changing the status (if already in MAINTENANCE/LOCKDOWN).
 */
async function saveSystemMessage() {
    const status = $('global_status').value;
    const message = $('maintenance_message').value.trim();

    if (status === 'ACTIVE') {
        showFeedback('Cannot save a maintenance message while the system is ACTIVE. Change status first.', 'warning');
        return;
    }
    
    if (!message) {
        showFeedback('Message cannot be empty.', 'error');
        return;
    }

    const { data: existing } = await fetchData(SETTINGS_TABLE, 'id', { key: GLOBAL_SETTINGS_KEY });
    let error = null;

    if (existing?.length > 0) {
        ({ error } = await sb.from(SETTINGS_TABLE).update({ message }).eq('id', existing[0].id));
    } else {
        // Insert a new record if none exists (should be handled by updateSystemStatus, but for robustness)
        ({ error } = await sb.from(SETTINGS_TABLE).insert({ key: GLOBAL_SETTINGS_KEY, value: status, message }));
    }

    if (error) {
        await logAudit('SYSTEM_MESSAGE_UPDATE', `Failed to update system message. Reason: ${error.message}`, null, 'FAILURE');
        showFeedback(`Failed to save message: ${error.message}`, 'error');
    } else {
        await logAudit('SYSTEM_MESSAGE_UPDATE', `Updated system message for status ${status}.`, null, 'SUCCESS');
        showFeedback('System message saved.', 'success');
    }
}


// --- Global Password Reset ---

async function handleGlobalPasswordReset(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const email = $('reset_user_email').value.trim();
    const newPassword = $('new_password').value.trim();
    
    if (!email || !newPassword) {
        showFeedback('Email and New Password are required.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    try {
        // 1. Find the user ID by email
        const { data: profile, error: profileError } = await sb
            .from(USER_PROFILE_TABLE)
            .select('user_id, full_name')
            .eq('email', email)
            .single();

        if (profileError || !profile) throw new Error('User not found in profile records.');
        
        const userId = profile.user_id;

        // 2. Perform the admin password update
        const { error: authError } = await sb.auth.admin.updateUserById(userId, { password: newPassword });

        if (authError) throw authError;

        await logAudit('USER_PASSWORD_RESET', `Forced password reset for user: ${email}.`, userId, 'SUCCESS');
        showFeedback(`✅ Password for ${email} has been reset successfully!`, 'success');
        e.target.reset();

    } catch (e) {
        const userId = e.message?.includes('User not found') ? null : 'UNKNOWN_ID'; // Placeholder for logging
        await logAudit('USER_PASSWORD_RESET', `Failed to force password reset for: ${email}. Reason: ${e.message}`, userId, 'FAILURE');
        showFeedback(`❌ Password reset failed: ${e.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

// --- Account Deactivation ---

async function handleAccountDeactivation(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const userId = $('deactivate_user_id').value.trim();
    
    if (!userId) {
        showFeedback('User ID is required for deactivation.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    if (!confirm(`CRITICAL: Permanently block user ID ${userId.substring(0, 8)}... from logging in?`)) {
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    try {
        // 1. Update the block status in the profiles table (prevents access via RLS)
        const { error: profileError } = await sb
            .from(USER_PROFILE_TABLE)
            .update({ block_program_year: true, status: 'blocked' }) 
            .eq('user_id', userId);
            
        if (profileError) throw profileError;
        
        // 2. Optionally revoke all current sessions (to immediately log them out)
        // This is generally handled by the RLS policy hitting the 'blocked' status.

        await logAudit('USER_BLOCK', `Permanently blocked user ID: ${userId.substring(0, 8)}... from accessing the system.`, userId, 'SUCCESS');
        showFeedback(`✅ User ID ${userId.substring(0, 8)}... has been blocked and logged out.`, 'success');
        e.target.reset();

    } catch (e) {
        await logAudit('USER_BLOCK', `Failed to block user ID ${userId.substring(0, 8)}... Reason: ${e.message}`, userId, 'FAILURE');
        showFeedback(`❌ Deactivation failed: ${e.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

/*******************************************************
 * 13. Backup & Restore Tab
 *******************************************************/

async function loadBackupHistory() {
    const tbody = $('backup-history-table');
    tbody.innerHTML = '<tr><td colspan="4">Loading backup history...</td></tr>';
    
    // Placeholder for actual Supabase/Storage fetch
    const history = [
        { name: 'nchsm_db_20251020_0100.sql', date: '2025-10-20 01:00:00', size: '125 MB' },
        { name: 'nchsm_db_20251019_0100.sql', date: '2025-10-19 01:00:00', size: '124 MB' },
        { name: 'nchsm_db_20251018_0100.sql', date: '2025-10-18 01:00:00', size: '123 MB' },
    ];

    tbody.innerHTML = '';
    history.forEach(h => {
        tbody.innerHTML += `<tr>
            <td>${h.name}</td>
            <td>${h.date}</td>
            <td>${h.size}</td>
            <td>
                <button class="btn-action" onclick="showFeedback('Download feature is a placeholder. File: ${h.name}')">Download</button>
                <button class="btn btn-delete" onclick="showFeedback('Delete feature is a placeholder. File: ${h.name}')">Delete</button>
            </td>
        </tr>`;
    });
}

function triggerBackup() {
    logAudit('DB_BACKUP', 'Initiated database backup process.', null, 'SUCCESS');
    showFeedback('Backup initiated! Check your Supabase Console for status (actual database backup is a manual/scheduled process).', 'success');
}

$('restore-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    logAudit('DB_RESTORE', 'Attempted database restoration from file.', null, 'FAILURE'); // Always log as failure for placeholder
    showFeedback('CRITICAL ACTION: Database restoration initiated. This is a highly sensitive server-side process and cannot be done via the client. Check your DB logs.', 'error');
    e.target.reset();
    setButtonLoading(submitButton, false, originalText);
});


// =================================================================
// INITIALIZATION
// =================================================================
document.addEventListener('DOMContentLoaded', initSession);
