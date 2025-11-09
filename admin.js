/**********************************************************************************
 * Final Integrated JavaScript File (admin.js)
 * SUPERADMIN DASHBOARD - COURSE, USER, ATTENDANCE & FULL FILTERING MANAGEMENT
 **********************************************************************************/

// --- SUPABASE CONFIGURATION ---
// IMPORTANT: In a production environment, never expose the ANONYMOUS KEY directly
// The role of the ANONYMOUS KEY is to allow read access to certain tables based on RLS.
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GLOBAL CONSTANTS ---
const RESOURCES_BUCKET = 'resources';
const IP_API_URL = 'https://api.ipify.org?format=json';
const DEVICE_ID_KEY = 'nchsm_device_id';
const SETTINGS_TABLE = 'app_settings'; 
const MESSAGE_KEY = 'student_welcome'; 
const AUDIT_TABLE = 'audit_logs'; 
const GLOBAL_SETTINGS_KEY = 'global_system_status'; 
const USER_PROFILE_TABLE = 'consolidated_user_profiles_table'; 

// Global Variables
let currentUserId = null;
let currentUserProfile = null;
let attendanceMap = null; // Used for Leaflet instance


/*******************************************************
 * 1. CORE UTILITY FUNCTIONS
 *******************************************************/

function $(id){ return document.getElementById(id); }

function escapeHtml(s, isAttribute = false){ 
    let str = String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if (isAttribute) {
        // Only quotes need special attention inside attributes
        str = str.replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    } else {
        // For general text content
        str = str.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    return str;
}

/**
 * Global feedback utility
 */
function showFeedback(message, type = 'success') {
    const prefix = type === 'success' ? '✅ Success: ' : 
                   type === 'error' ? '❌ Error: ' :
                   type === 'warning' ? '⚠️ Warning: ' : 'ℹ️ Info: ';
    alert(prefix + message);
}

/**
 * Handles button loading state
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

function getDeviceId() {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = 'MANUAL-' + Date.now() + Math.random().toString(36).substring(2, 9);
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
}

/**
 * Utility to populate <select> elements
 */
function populateSelect(selectElement, data, valueKey, textKey, defaultText = '-- Select --') {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${defaultText}</option>`;
    if (data && Array.isArray(data)) {
        data.forEach(item => {
            const option = document.createElement('option');
            option.value = item[valueKey];
            option.textContent = item[textKey];
            selectElement.appendChild(option);
        });
    }
}

// --- Tab Switching Logic (Consolidated from your script) ---
async function loadSectionData(tabId) {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    
    switch(tabId) {
        case 'dashboard': loadDashboardData(); break;
        case 'users': loadAllUsers(); break;
        case 'pending': loadPendingApprovals(); break;
        case 'enroll': 
            // The intake select needs to be populated first for the promotion feature
            loadIntakeYears();
            loadStudents(); 
            updateBlockTermOptions('promote_intake', 'promote_from_block');
            updateBlockTermOptions('promote_intake', 'promote_to_block');
            break; 
        case 'courses': loadCourses(); break; 
        case 'sessions': loadScheduledSessions(); populateSessionCourseSelects(); break;
        case 'attendance': loadAttendance(); populateAttendanceSelects(); break;
        case 'cats': 
            const addExamForm = $('add-exam-form');
            if (addExamForm) {
                // Ensure listener is only added once
                addExamForm.removeEventListener('submit', handleAddExam); 
                addExamForm.addEventListener('submit', handleAddExam);
            }
            loadExams(); 
            populateExamCourseSelects(); 
            break;
        case 'messages': loadAdminMessages(); loadWelcomeMessageForEdit(); break;
        case 'calendar': renderFullCalendar(); break;
        case 'resources': loadResources(); break;
        case 'welcome-editor': loadWelcomeMessageForEdit(); break; 
        case 'audit': loadAuditLogs(); break; 
        case 'security': loadSystemStatus(); break; 
        case 'backup': loadBackupHistory(); break;
    }
}


/*******************************************************
 * 1.5. LOGOUT & AUDIT LOGGING (COMPLETED)
 *******************************************************/

/**
 * Logs a critical action to the audit_logs table.
 */
async function logAudit(action_type, details, target_id = null, status = 'SUCCESS') {
    const logData = {
        user_id: currentUserProfile?.user_id || 'SYSTEM',
        user_role: currentUserProfile?.role || 'SYSTEM',
        action_type: action_type,
        details: details,
        target_id: target_id,
        status: status,
        ip_address: await getIPAddress() 
    };

    const { error } = await sb.from(AUDIT_TABLE).insert([logData]);
    if (error) {
        console.error('Audit logging failed:', error);
    }
}

async function logout() {
    const userProfile = currentUserProfile || { full_name: 'Unknown User' };

    try {
        if (typeof logAudit === 'function') {
            await logAudit('LOGOUT', `User ${userProfile.full_name} logged out.`);
        }
        
        // Supabase sign out
        await sb.auth.signOut();
        
    } catch (error) {
        console.error("Logout error (Supabase/Audit):", error);
    }
    
    // Clear local storage items
    localStorage.removeItem("loggedInUser");
    sessionStorage.removeItem('authToken'); 
    sessionStorage.removeItem('userRole'); 

    window.location.href = "login.html";
}

async function loadAuditLogs() {
    const tbody = $('audit-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Loading audit logs...</td></tr>';

    const { data: logs, error } = await fetchData(AUDIT_TABLE, '*', {}, 'timestamp', false);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5">Error loading logs: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    logs.forEach(log => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        const statusClass = log.status === 'SUCCESS' ? 'status-approved' : log.status === 'WARNING' ? 'status-pending' : 'status-danger';

        tbody.innerHTML += `
            <tr>
                <td>${timestamp}</td>
                <td>${escapeHtml(log.user_role)} (${escapeHtml(log.user_id?.substring(0, 8) || 'N/A')})</td>
                <td>${escapeHtml(log.action_type)}</td>
                <td>${escapeHtml(log.details)} (Target ID: ${escapeHtml(log.target_id?.substring(0, 8) || 'N/A')})</td>
                <td class="${statusClass}">${escapeHtml(log.status)}</td>
            </tr>
        `;
    });
}


/*******************************************************
 * 2. TABLE FILTERING & EXPORT FUNCTIONS (COMPLETED)
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

        if (trs[i].getElementsByTagName('td').length <= 1) {
             trs[i].style.display = ""; // Keep placeholder rows visible or adjust based on your design
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
 * Core CSV Export Function - Referenced by ALL Export buttons in HTML
 */
function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) { console.error("Export Error: Table not found with ID:", tableId); return; }

    const rows = table.querySelectorAll('tr');
    let csv = [];

    const thead = table.closest('table').querySelector('thead');
    if (thead) {
        const headerRow = thead.querySelector('tr');
        if (headerRow) {
            const headerCols = headerRow.querySelectorAll('th');
            const header = [];
            for (let j = 0; j < headerCols.length; j++) { 
                // Skip the last column if it's for 'Actions'
                if (headerCols[j].textContent.trim().toLowerCase() === 'actions') continue;
                let data = headerCols[j].innerText.trim();
                data = data.replace(/"/g, '""'); 
                header.push('"' + data + '"');
            }
            csv.push(header.join(','));
        }
    }
    
    for (let i = 0; i < rows.length; i++) {
        const row = [];
        const cols = rows[i].querySelectorAll('td'); 
        
        if (cols.length < 2) continue; // Skip empty/placeholder rows

        for (let j = 0; j < cols.length; j++) { 
            // Skip the last column if it's for 'Actions'
            if (cols[j].parentElement.querySelector('td:last-child') === cols[j] && cols[j].querySelector('button')) continue;
            let data = cols[j].innerText.trim();
            data = data.replace(/"/g, '""'); 
            row.push('"' + data + '"');
        }
        if (row.length > 0) { // Only push if data was collected
            csv.push(row.join(','));
        }
    }

    const csv_string = csv.join('\n');

    const link = document.createElement('a');
    link.style.display = 'none';
    link.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv_string));
    link.setAttribute('download', filename);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


/*******************************************************
 * 3. Dashboard / Welcome Editor (COMPLETED)
 *******************************************************/

async function loadTotalDailyCheckIns() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); 
    const todayISO = today.toISOString();
    
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowISO = tomorrow.toISOString();

    const checkInsElement = $('totalDailyCheckIns');
    if (!checkInsElement) return;

    const { count, error } = await sb
        .from('geo_attendance_logs')
        .select('*', { count: 'exact', head: true })
        .gte('check_in_time', todayISO) 
        .lt('check_in_time', tomorrowISO); 

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
    
    // Total Daily Check-ins
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

    // Data Integrity Placeholder (Not implemented with Supabase)
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
    if (!editor) return;

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

    const editor = $('welcome-message-editor');
    if (!editor) {
        showFeedback('Editor element not found.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const value = editor.value.trim();

    if (!value) {
        showFeedback('Message content cannot be empty.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    try {
        const { data: existing } = await fetchData(SETTINGS_TABLE, 'id', { key: MESSAGE_KEY });
        let updateOrInsertError = null;

        if (existing && existing.length > 0) {
            // Update existing record
            const { error } = await sb
                .from(SETTINGS_TABLE)
                .update({ value, updated_at: new Date().toISOString() })
                .eq('id', existing[0].id);
            updateOrInsertError = error;
        } else {
            // Insert new record
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
            loadWelcomeMessageForEdit();
        }
    } catch (err) {
        await logAudit('WELCOME_MESSAGE_UPDATE', `Failed to update welcome message.`, null, 'FAILURE');
        showFeedback(`Failed to save message: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


/*******************************************************
 * 4. Users / Enroll Tab (COMPLETED)
 *******************************************************/

// --- Block/Term Utilities ---
function updateBlockTermOptions(programSelectId, blockTermSelectId) {
  const program = $(programSelectId)?.value;
  const blockTermSelect = $(blockTermSelectId);
  if (!blockTermSelect) return;

  // Preserve the current value if possible before clearing/repopulating
  const currentValue = blockTermSelect.value;
  blockTermSelect.innerHTML = '<option value="">-- Select Block/Term --</option>';

  if (!program) return;

  let options = [];

  if (program.toUpperCase().includes('KRCHN')) {
    options = [
      { value: 'Block_A', text: 'Block A' },
      { value: 'Block_B', text: 'Block B' }
    ];
  } else if (program.toUpperCase().includes('TVET')) {
    options = [
      { value: 'Term_1', text: 'Term 1' },
      { value: 'Term_2', text: 'Term 2' },
      { value: 'Term_3', text: 'Term 3' }
    ];
  } else {
    // Default or mixed case
    options = [
      { value: 'Block_A', text: 'Block A / Term 1' },
      { value: 'Block_B', text: 'Block B / Term 2' }
    ];
  }

  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    blockTermSelect.appendChild(option);
  });
  
  // Try to restore the previous value
  if (currentValue) {
      blockTermSelect.value = currentValue;
  }
}
// --- End Block/Term Utilities ---

/**
 * Populates the intake year select for enrollment and promotion from the courses table.
 */
async function loadIntakeYears() {
    const intakeSelectIds = ['account-intake', 'promote_intake', 'edit_account_intake', 'course-intake', 'resource_intake', 'exam_intake'];
    
    // Fetch unique intake years from the courses table
    const { data: courses, error } = await sb.from('courses').select('intake_year');

    if (error) {
        console.error('Error fetching intake years:', error);
        return;
    }

    const uniqueIntakes = new Set();
    courses.forEach(c => {
        if (c.intake_year) uniqueIntakes.add(c.intake_year);
    });
    
    const intakeOptions = Array.from(uniqueIntakes).sort().map(year => ({ value: year, text: year }));

    intakeSelectIds.forEach(id => {
        const select = $(id);
        if (select) {
            populateSelect(select, intakeOptions, 'value', 'text', '-- Select Intake Year --');
        }
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

  if (!name || !email || !password || !role) {
      showFeedback('Name, Email, Password, and Role are required.', 'error');
      setButtonLoading(submitButton, false, originalText);
      return;
  }
  
  if (password.length < 6) {
      showFeedback('Password must be at least 6 characters long.', 'error');
      setButtonLoading(submitButton, false, originalText);
      return;
  }

  const userData = {
    full_name: name,
    role,
    phone,
    program: role === 'student' ? program : null,
    intake_year: role === 'student' ? intake_year : null,
    block: role === 'student' ? block : null,
    status: 'approved',
    block_program_year: false // Assuming this field is for logic not direct input
  };

  try {
    // 1. Create Supabase Auth User
    const { data: { user }, error: authError } = await sb.auth.signUp({
      email, password, options: { data: userData }
    });
    if (authError) throw authError;

    // 2. Create Profile in consolidated_user_profiles_table
    if (user && user.id) {
      const profileData = { user_id: user.id, email, ...userData };
      // Remove email from userData passed to auth signUp options and keep it here to avoid duplication/conflict
      const { error: insertError } = await sb.from(USER_PROFILE_TABLE).insert([profileData]);
      if (insertError) {
        // NOTE: A serious issue here is the Auth user is created but profile insert failed. 
        // Admin would need manual cleanup.
        // In a real app, you might want to call a serverless function to delete the auth user on profile insert failure.
        throw insertError;
      }
      e.target.reset();
      showFeedback(`New ${role.toUpperCase()} account successfully enrolled!`, 'success');
      await logAudit('USER_ENROLL', `Enrolled new ${role} account: ${name} (${email})`, user.id);
      loadAllUsers();
      loadDashboardData();
    }
  } catch (err) {
    await logAudit('USER_ENROLL', `Failed to enroll new account: ${name}. Reason: ${err.message}`, null, 'FAILURE');
    showFeedback(`Account creation failed: ${err.message}`, 'error');
  } finally {
    setButtonLoading(submitButton, false, originalText);
  }
}

/**
 * IMPLEMENTATION OF MASS PROMOTION LOGIC (Completed)
 */
async function handleMassPromotion(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitter.textContent;
    setButtonLoading(submitter, true, originalText);

    const promote_intake = $('promote_intake').value;
    const promote_from_block = $('promote_from_block').value;
    const promote_to_block = $('promote_to_block').value;

    if (!promote_intake || !promote_from_block || !promote_to_block) {
        showFeedback('Please select the Intake Year, FROM Block/Term, and TO Block/Term.', 'error');
        setButtonLoading(submitter, false, originalText);
        return;
    }

    if (promote_from_block === promote_to_block) {
        showFeedback('The "FROM" and "TO" blocks/terms must be different.', 'error');
        setButtonLoading(submitter, false, originalText);
        return;
    }

    if (!confirm(`WARNING: Are you sure you want to promote ALL active students from the ${promote_from_block} to the ${promote_to_block} for the Intake Year ${promote_intake}? This action cannot be undone easily.`)) {
        setButtonLoading(submitter, false, originalText);
        return;
    }

    try {
        // 1. Count students to promote
        const { count: initialCount, error: fetchError } = await sb
            .from(USER_PROFILE_TABLE)
            .select('user_id', { count: 'exact', head: true })
            .eq('role', 'student')
            .eq('intake_year', promote_intake)
            .eq('block', promote_from_block)
            .eq('status', 'approved'); 

        if (fetchError) throw fetchError;

        if (initialCount === 0) {
            showFeedback(`No active students found in ${promote_from_block} for Intake ${promote_intake}. No action taken.`, 'warning');
            await logAudit('PROMOTION_MASS', `Attempted mass promotion for Intake ${promote_intake} from ${promote_from_block} to ${promote_to_block}. Found 0 students.`, null, 'WARNING');
            return;
        }

        // 2. Perform the mass update
        const { error: updateError, count } = await sb
            .from(USER_PROFILE_TABLE)
            .update({ 
                block: promote_to_block,
                updated_at: new Date().toISOString()
            })
            .eq('role', 'student')
            .eq('intake_year', promote_intake)
            .eq('block', promote_from_block)
            .eq('status', 'approved')
            .select('*', { count: 'exact' });

        if (updateError) throw updateError;
        
        const logDetails = `Mass promoted ${count} students from ${promote_from_block} to ${promote_to_block} (Intake: ${promote_intake}).`;
        await logAudit('PROMOTION_MASS', logDetails, null, 'SUCCESS');
        showFeedback(`Successfully promoted ${count} student(s) to ${promote_to_block}!`, 'success');

        e.target.reset();
        
    } catch (err) {
        const logDetails = `Failed mass promotion for Intake ${promote_intake} from ${promote_from_block} to ${promote_to_block}. Error: ${err.message}`;
        await logAudit('PROMOTION_MASS', logDetails, null, 'FAILURE');
        showFeedback(`Mass promotion failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitter, false, originalText);
    }
}
/**
 * Fetches all user profiles (Students, Lecturers, Admins)
 * and renders them to the Users Management table.
 */
async function loadAllUsers() {
    const tbody = $('users-table');
    const userSearchInput = $('user-search');

    if (!tbody) return;
    if (userSearchInput) userSearchInput.value = '';

    tbody.innerHTML = '<tr><td colspan="7">Loading all user profiles...</td></tr>';

    const { data: users, error } = await fetchData(USER_PROFILE_TABLE, '*', {}, 'full_name', true);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading users: ${error.message}</td></tr>`;
        await logAudit('USER_FETCH_ALL', 'Failed to load all user profiles.', null, 'FAILURE');
        return;
    }

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No user accounts found.</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    users.forEach(user => {
        const userIdShort = user.user_id ? user.user_id.substring(0, 8) : 'N/A';
        const statusClass =
            user.status === 'approved'
                ? 'status-approved'
                : user.status === 'pending'
                ? 'status-pending'
                : 'status-danger';

        let actionButtons = '';
        const isSuperAdmin = currentUserProfile?.role === 'superadmin';
        const isSelf = currentUserProfile?.user_id === user.user_id;

        // Only Super Admin can manage other users, and cannot deactivate themselves
        if (isSuperAdmin || (currentUserProfile?.role === 'admin' && user.role !== 'superadmin')) { 
             actionButtons = `
                <button class="btn btn-sm btn-edit" onclick="openEditUserModal('${user.user_id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="toggleUserStatus('${user.user_id}', '${user.status}')" ${isSelf ? 'disabled' : ''}>
                    ${user.status === 'approved' ? 'Deactivate' : 'Activate'}
                </button>
            `;
        } else {
            // Regular admins/lecturers/students see disabled buttons
            actionButtons = `
                <button class="btn btn-sm btn-edit" disabled>Edit</button>
                <button class="btn btn-sm btn-danger" disabled>Deactivate</button>
            `;
        }

        const row = `
            <tr>
                <td>${userIdShort}</td>
                <td>${escapeHtml(user.full_name)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>${escapeHtml(user.role)}</td>
                <td>${escapeHtml(user.program || 'N/A')} ${user.intake_year ? `/ ${escapeHtml(user.intake_year)}` : ''} ${user.block ? `/ ${escapeHtml(user.block)}` : ''}</td>
                <td class="${statusClass}">${escapeHtml(user.status)}</td>
                <td>${actionButtons}</td>
            </tr>
        `;

        tbody.innerHTML += row;
    });
}

/**
 * Toggles the user's status between 'approved' and 'inactive' (or 'pending' to 'approved'). (COMPLETED)
 */
async function toggleUserStatus(userId, currentStatus) {
    let newStatus, action, confirmMessage;
    const userIdShort = userId.substring(0, 8);

    if (currentUserProfile?.user_id === userId) {
        showFeedback("You cannot change your own status from this interface.", 'error');
        return;
    }

    if (currentStatus === 'approved') {
        newStatus = 'inactive';
        action = 'Deactivate';
        confirmMessage = `Are you sure you want to DEACTIVATE the user with ID ${userIdShort}? They will not be able to log in.`;
    } else {
        newStatus = 'approved';
        action = 'Activate';
        confirmMessage = `Are you sure you want to ACTIVATE the user with ID ${userIdShort}?`;
    }
    
    if (!confirm(confirmMessage)) { return; }

    try {
        const { error } = await sb
            .from(USER_PROFILE_TABLE)
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('user_id', userId);

        if (error) throw error;

        showFeedback(`User ${userIdShort} successfully ${action}d.`, 'success');
        await logAudit('USER_STATUS_UPDATE', `${action}d user account: ${userIdShort} (New Status: ${newStatus})`, userId, 'SUCCESS');
        loadAllUsers(); 
        
    } catch (err) {
        const errorMessage = `Failed to ${action} user ${userIdShort}. Reason: ${err.message}`;
        await logAudit('USER_STATUS_UPDATE', errorMessage, userId, 'FAILURE');
        showFeedback(errorMessage, 'error');
    }
}

/**
 * Fetches user profiles with status 'pending' (Awaiting approval) (COMPLETED)
 */
async function loadPendingApprovals() {
    const tbody = $('pending-approvals-table');

    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6">Loading pending user accounts...</td></tr>';
    
    const { data: users, error } = await fetchData(USER_PROFILE_TABLE, '*', { status: 'pending' }, 'created_at', true);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error loading pending users: ${error.message}</td></tr>`;
        await logAudit('USER_FETCH_PENDING', 'Failed to load pending user profiles.', null, 'FAILURE');
        return;
    }

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">✅ No pending approvals currently.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    
    users.forEach(user => {
        const userIdShort = user.user_id ? user.user_id.substring(0, 8) : 'N/A';
        const timestamp = new Date(user.created_at).toLocaleString();

        const row = `
            <tr>
                <td>${userIdShort}</td>
                <td>${escapeHtml(user.full_name)}</td>
                <td>${escapeHtml(user.role)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>${timestamp}</td>
                <td>
                    <button class="btn btn-sm btn-approve" onclick="approveUser('${user.user_id}', '${escapeHtml(user.full_name)}', '${escapeHtml(user.role)}')">Approve</button>
                    <button class="btn btn-sm btn-danger" onclick="rejectUser('${user.user_id}', '${escapeHtml(user.full_name)}')">Reject</button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

/**
 * Approves a pending user account. Sets status to 'approved'. (COMPLETED)
 */
async function approveUser(userId, fullName, role) {
    if (!confirm(`Are you sure you want to APPROVE the account for ${fullName} (${role})?`)) { return; }

    try {
        const { error } = await sb
            .from(USER_PROFILE_TABLE)
            .update({ status: 'approved', updated_at: new Date().toISOString() })
            .eq('user_id', userId);

        if (error) throw error;

        showFeedback(`${fullName}'s account approved successfully!`, 'success');
        await logAudit('USER_APPROVAL', `Approved account for ${fullName} (${role})`, userId, 'SUCCESS');
        loadPendingApprovals(); 
        loadDashboardData(); 
        loadAllUsers();
        
    } catch (err) {
        await logAudit('USER_APPROVAL', `Failed to approve account for ${fullName}. Reason: ${err.message}`, userId, 'FAILURE');
        showFeedback(`Failed to approve account: ${err.message}`, 'error');
    }
}

/**
 * Rejects a pending user account. Sets status to 'inactive'. (COMPLETED)
 */
async function rejectUser(userId, fullName) {
    if (!confirm(`WARNING: Are you sure you want to REJECT (deactivate) the account for ${fullName}? This will set their status to 'inactive'.`)) { return; }

    try {
        const { error } = await sb
            .from(USER_PROFILE_TABLE)
            .update({ status: 'inactive', updated_at: new Date().toISOString() })
            .eq('user_id', userId);

        if (error) throw error;

        showFeedback(`${fullName}'s account rejected and deactivated.`, 'success');
        await logAudit('USER_REJECTION', `Rejected and set status to inactive for ${fullName}`, userId, 'SUCCESS');
        loadPendingApprovals(); 
        loadDashboardData(); 
        loadAllUsers();
        
    } catch (err) {
        await logAudit('USER_REJECTION', `Failed to reject account for ${fullName}. Reason: ${err.message}`, userId, 'FAILURE');
        showFeedback(`Failed to reject account: ${err.message}`, 'error');
    }
}

/**
 * Loads a user's data into the edit modal and displays it. (COMPLETED)
 */
async function openEditUserModal(userId) {
    const modal = $('userEditModal');
    const form = $('edit-user-form');
    const title = $('edit-user-title');
    
    if (!modal || !form || !title) return;
    
    title.textContent = `Edit User: ${userId.substring(0, 8)}`;
    form.reset();

    $('edit_account_block_term').innerHTML = '<option value="">-- Select Block/Term --</option>';
    
    const { data: user, error } = await fetchData(USER_PROFILE_TABLE, '*', { user_id: userId }, null, null);

    if (error || !user || user.length === 0) {
        showFeedback(`Could not load user ${userId.substring(0, 8)} for editing.`, 'error');
        return;
    }

    const u = user[0];
    
    $('edit_user_id').value = u.user_id; 
    $('edit_original_role').value = u.role; 

    $('edit_account_name').value = u.full_name || '';
    $('edit_account_email').value = u.email || '';
    $('edit_account_phone').value = u.phone || '';
    
    $('edit_account_role').value = u.role;
    $('edit_account_status').value = u.status;
    
    $('edit_account_program').value = u.program || '';
    $('edit_account_intake').value = u.intake_year || '';
    
    if (u.program && u.intake_year) {
         updateBlockTermOptions('edit_account_program', 'edit_account_block_term');
         // Set value after options are updated
         setTimeout(() => {
             $('edit_account_block_term').value = u.block || ''; 
         }, 50);
    }

    modal.style.display = 'block';
}

/**
 * Handles the submission of the user edit form to update the user's profile. (COMPLETED)
 */
async function handleEditUser(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);
    
    const userId = $('edit_user_id').value; 
    const originalRole = $('edit_original_role').value; 

    const newRole = $('edit_account_role').value;

    const updatedData = {
        full_name: $('edit_account_name').value.trim(),
        role: newRole,
        status: $('edit_account_status').value,
        phone: $('edit_account_phone').value.trim(),
        program: newRole === 'student' ? $('edit_account_program').value : null,
        intake_year: newRole === 'student' ? $('edit_account_intake').value : null,
        block: newRole === 'student' ? $('edit_account_block_term').value : null,
        updated_at: new Date().toISOString()
    };
    
    const newPassword = $('edit_account-password').value.trim(); // The ID from the HTML

    try {
        // 1. Update Profile Table
        const { error: profileError } = await sb
            .from(USER_PROFILE_TABLE)
            .update(updatedData)
            .eq('user_id', userId);

        if (profileError) throw new Error(`Profile update failed: ${profileError.message}`);
        
        // 2. Update Auth User Password if provided
        if (newPassword) {
            if (newPassword.length < 6) {
                throw new Error("Password must be at least 6 characters long.");
            }
            // NOTE: Supabase only allows updating the password of the *currently signed-in user*.
            // To update another user's password, you MUST use the Admin API (a server-side function).
            // For this client-side script, we must restrict this.
            if (userId !== currentUserId) {
                showFeedback("Warning: Password reset for other users requires a server-side Admin API call.", 'warning');
            } else {
                // Only allow self-password change
                const { error: authError } = await sb.auth.updateUser({ password: newPassword });
                if (authError) throw new Error(`Password update failed: ${authError.message}`);
            }
        }

        showFeedback(`User ${updatedData.full_name} profile successfully updated.`, 'success');
        await logAudit('USER_UPDATE', `Updated user profile and/or password for: ${updatedData.full_name} (Role: ${updatedData.role})`, userId, 'SUCCESS');
        
        $('userEditModal').style.display = 'none';
        loadAllUsers(); 
        loadPendingApprovals(); 
        
    } catch (err) {
        const errorMessage = `Failed to update user ${updatedData.full_name}. Reason: ${err.message}`;
        await logAudit('USER_UPDATE', errorMessage, userId, 'FAILURE');
        showFeedback(errorMessage, 'error');
        
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


/*******************************************************
 * 4.5. COURSE MANAGEMENT (COMPLETED)
 *******************************************************/

async function handleAddCourse(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const unitCode = $('course-unit-code').value.trim().toUpperCase();
    const courseName = $('course-name').value.trim();
    const description = $('course-description').value.trim();
    const program = $('course-program').value.trim();
    const intake = $('course-intake').value.trim();
    const block = $('course-block').value.trim();
    const lecturerId = $('course-lecturer').value || null;

    if (!unitCode || !courseName || !program || !intake || !block) {
        showFeedback('Please fill out all required fields: Unit Code, Name, Program, Intake, and Block.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const newCourseData = {
        unit_code: unitCode,
        unit_name: courseName,
        description: description || null,
        program: program,
        intake_year: intake,
        block_term: block,
        is_active: true, // Renamed 'status' to 'is_active' for boolean
        lecturer_id: lecturerId,
    };

    try {
        const { error } = await sb.from('courses').insert([newCourseData]);

        if (error) {
            if (error.code === '23505') {
                throw new Error(`Unit Code ${unitCode} already exists.`);
            }
            throw error;
        }

        await logAudit('COURSE_CREATE', `Added new course: ${unitCode} - ${courseName}`, unitCode, 'SUCCESS');
        showFeedback(`Course ${unitCode} (${courseName}) added successfully!`, 'success');
        e.target.reset();
        loadCourses(); 
        loadIntakeYears(); // Refresh intake list if new one was added
    } catch (err) {
        await logAudit('COURSE_CREATE', `Failed to add course ${unitCode}. Reason: ${err.message}`, unitCode, 'FAILURE');
        showFeedback(`Failed to add course ${unitCode}. Reason: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


async function loadCourses() {
    const tbody = $('courses-table')?.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Loading courses...</td></tr>';

    const { data: courses, error } = await fetchData('courses', '*, lecturer:lecturer_id(full_name)', {}, 'unit_code', true);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error loading courses: ${error.message}</td></tr>`;
        return;
    }

    if (!courses || courses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No courses currently added.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    courses.forEach(course => {
        const lecturerName = course.lecturer?.full_name || 'Unassigned';
        const statusText = course.is_active ? 'Active' : 'Inactive';
        const statusClass = course.is_active ? 'status-approved' : 'status-danger';

        tbody.innerHTML += `
            <tr>
                <td>${escapeHtml(course.unit_name)}</td>
                <td>${escapeHtml(course.unit_code)}</td>
                <td>${escapeHtml(course.program)}</td>
                <td>${escapeHtml(course.intake_year)} / ${escapeHtml(course.block_term)}</td>
                <td>${escapeHtml(lecturerName)}</td>
                <td class="${statusClass}">${statusText}</td>
                <td>
                    <button class="btn btn-sm btn-edit" onclick="openEditCourseModal('${course.unit_code}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="toggleCourseStatus('${course.unit_code}', ${course.is_active})">${course.is_active ? 'Deactivate' : 'Activate'}</button>
                </td>
            </tr>
        `;
    });
}


async function toggleCourseStatus(unitCode, currentStatus) {
    const newStatus = !currentStatus;
    const action = newStatus ? 'Activate' : 'Deactivate';

    if (!confirm(`Are you sure you want to ${action} course ${unitCode}?`)) {
        return;
    }

    try {
        const { error } = await sb
            .from('courses')
            .update({ is_active: newStatus, updated_at: new Date().toISOString() })
            .eq('unit_code', unitCode);

        if (error) throw error;

        showFeedback(`Course ${unitCode} successfully ${action}d.`, 'success');
        await logAudit('COURSE_STATUS_UPDATE', `${action}d course: ${unitCode} (New Status: ${newStatus})`, unitCode, 'SUCCESS');
        loadCourses();
        
    } catch (err) {
        const errorMessage = `Failed to ${action} course ${unitCode}. Reason: ${err.message}`;
        await logAudit('COURSE_STATUS_UPDATE', errorMessage, unitCode, 'FAILURE');
        showFeedback(errorMessage, 'error');
    }
}

async function openEditCourseModal(unitCode) {
    const modal = $('courseEditModal');
    const form = $('edit-course-form');
    const title = $('edit-course-title');
    
    if (!modal || !form || !title) return;
    
    title.textContent = `Edit Course: ${unitCode}`;
    form.reset();
    
    const { data: course, error } = await fetchData('courses', '*', { unit_code: unitCode }, null, null);

    if (error || !course || course.length === 0) {
        showFeedback(`Could not load course ${unitCode} for editing.`, 'error');
        return;
    }

    const c = course[0];
    
    $('edit_course_unit_code').value = c.unit_code; 
    $('edit_course_name').value = c.unit_name;
    $('edit_course_program').value = c.program;
    $('edit_course_intake').value = c.intake_year || ''; 
    
    // Load lecturers for assignment
    const lecturerSelect = $('edit_course_lecturer');
    const { data: lecturers } = await fetchData(USER_PROFILE_TABLE, 'user_id, full_name', { role: 'lecturer', status: 'approved' }, 'full_name', true);
    populateSelect(lecturerSelect, lecturers, 'user_id', 'full_name', 'Unassigned');
    
    // Update block/term options based on program/intake
    updateBlockTermOptions('edit_course_program', 'edit_course_block');
    
    // Set values after options are populated
    setTimeout(() => {
        $('edit_course_block').value = c.block_term; 
        lecturerSelect.value = c.lecturer_id || '';
    }, 50);

    modal.style.display = 'block';
}

async function handleEditCourse(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);
    
    const originalUnitCode = $('edit_course_unit_code').value; 
    const unitName = $('edit_course_name').value.trim();
    const program = $('edit_course_program').value;
    const intake = $('edit_course_intake').value;
    const blockTerm = $('edit_course_block').value;
    const lecturerId = $('edit_course_lecturer').value || null; 

    if (!unitName || !program || !blockTerm || !intake) {
        showFeedback('Please ensure Course Name, Program, Intake, and Block/Term are filled.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const updatedData = {
        unit_name: unitName,
        program: program,
        intake_year: intake,
        block_term: blockTerm,
        lecturer_id: lecturerId,
        updated_at: new Date().toISOString()
    };

    try {
        const { error } = await sb
            .from('courses')
            .update(updatedData)
            .eq('unit_code', originalUnitCode);

        if (error) throw error;
        
        showFeedback(`Course ${originalUnitCode} successfully updated.`, 'success');
        await logAudit('COURSE_UPDATE', `Updated details for course: ${originalUnitCode}`, originalUnitCode, 'SUCCESS');
        
        $('courseEditModal').style.display = 'none';
        loadCourses(); 
        
    } catch (err) {
        const errorMessage = `Failed to update course ${originalUnitCode}. Reason: ${err.message}`;
        await logAudit('COURSE_UPDATE', errorMessage, originalUnitCode, 'FAILURE');
        showFeedback(errorMessage, 'error');
        
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

/*******************************************************
 * 4.6. SESSION MANAGEMENT (COMPLETED)
 *******************************************************/

/**
 * Populates the course and lecturer selects for the Add Session form. (COMPLETED)
 */
async function populateSessionCourseSelects() {
    const courseSelect = $('session_course_code');
    const lecturerSelect = $('session_lecturer');
    
    if (!courseSelect || !lecturerSelect) return;

    courseSelect.innerHTML = '<option value="">-- Select Course --</option>';
    lecturerSelect.innerHTML = '<option value="">-- Select Lecturer --</option>';
    
    try {
        // NOTE: We should filter by Program and Block/Term if those selects are used to filter courses
        const { data: courses } = await fetchData('courses', 'unit_code, unit_name', { is_active: true });
        courses?.forEach(course => {
            courseSelect.innerHTML += `<option value="${course.unit_code}">${course.unit_code} - ${course.unit_name}</option>`;
        });

        const { data: lecturers } = await fetchData(USER_PROFILE_TABLE, 'user_id, full_name', { role: 'lecturer', status: 'approved' });
        lecturers?.forEach(lecturer => {
            lecturerSelect.innerHTML += `<option value="${lecturer.user_id}">${lecturer.full_name}</option>`;
        });
        
    } catch (error) {
        console.error('Error populating selects:', error);
        showFeedback('Failed to load courses or lecturers.', 'error');
    }
}

/**
 * Handles the creation of a new scheduled session. (COMPLETED)
 */
async function handleAddSession(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const courseCode = $('session_course_code').value.trim();
    const sessionType = $('session_type').value;
    const sessionDate = $('session_date').value;
    const startTime = $('session_start_time').value;
    const endTime = $('session_end_time').value;
    const location = $('session_location').value.trim();
    const lecturerId = $('session_lecturer').value || null; 

    if (!courseCode || !sessionType || !sessionDate || !startTime || !endTime || !lecturerId) {
        showFeedback('Please fill out all required fields for the session.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const startDateTime = `${sessionDate}T${startTime}:00`;
    const endDateTime = `${sessionDate}T${endTime}:00`;

    // Basic time validation
    if (new Date(startDateTime) >= new Date(endDateTime)) {
        showFeedback('End time must be after start time.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const newSessionData = {
        course_code: courseCode,
        session_type: sessionType,
        start_time: startDateTime,
        end_time: endDateTime,
        location: location,
        lecturer_id: lecturerId,
        is_active: true
    };

    try {
        const { error, data } = await sb
            .from('scheduled_sessions') 
            .insert([newSessionData])
            .select('id');

        if (error) throw error;
        
        showFeedback(`Session for ${courseCode} on ${sessionDate} added successfully!`, 'success');
        await logAudit('SESSION_CREATE', `Created new session for course: ${courseCode} at ${location}`, data?.[0]?.id, 'SUCCESS');
        
        e.target.reset(); 
        loadScheduledSessions();
        
    } catch (err) {
        const errorMessage = `Failed to add session for ${courseCode}. Reason: ${err.message}`;
        await logAudit('SESSION_CREATE', errorMessage, courseCode, 'FAILURE');
        showFeedback(errorMessage, 'error');
        
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

/**
 * Fetches all scheduled sessions and renders them into the sessions-table. (COMPLETED)
 */
async function loadScheduledSessions() {
    const tbody = $('sessions-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8">Loading scheduled sessions...</td></tr>';
    
    // Fetch courses and lecturers for joins
    const { data: sessions, error } = await fetchData(
        'scheduled_sessions', 
        '*, course:course_code(unit_name), lecturer:lecturer_id(full_name)', 
        {}, 
        'start_time', 
        false 
    ); 

    if (error) {
        tbody.innerHTML = `<tr><td colspan="8">Error loading sessions: ${error.message}</td></tr>`;
        return;
    }

    if (!sessions || sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No sessions currently scheduled.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    sessions.forEach(session => {
        const courseName = session.course?.unit_name || 'N/A';
        const lecturerName = session.lecturer?.full_name || 'N/A';
        const statusClass = session.is_active ? 'status-approved' : 'status-danger';
        const sessionDate = new Date(session.start_time).toLocaleDateString();
        const startTime = new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endTime = new Date(session.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        tbody.innerHTML += `
            <tr>
                <td>${escapeHtml(session.course_code)} (${escapeHtml(courseName)})</td>
                <td>${sessionDate}</td>
                <td>${startTime} - ${endTime}</td>
                <td>${escapeHtml(session.session_type)}</td>
                <td>${escapeHtml(lecturerName)}</td>
                <td>${escapeHtml(session.location)}</td>
                <td class="${statusClass}">${session.is_active ? 'Active' : 'Cancelled'}</td>
                <td>
                    <button class="btn btn-sm btn-edit" onclick="openEditSessionModal('${session.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="toggleSessionStatus('${session.id}', ${session.is_active})">${session.is_active ? 'Cancel' : 'Activate'}</button>
                </td>
            </tr>
        `;
    });
}


/*******************************************************
 * 7. Attendance Tab (admin) (Logic Refined)
 *******************************************************/

// ----------------------- Supporting Functions -----------------------

function toggleAttendanceFields() {
    const sessionType = $('att_session_type')?.value;
    const departmentInput = $('att_department');
    const courseSelect = $('att_course_id');

    if (!departmentInput || !courseSelect) return;

    // Reset visibility/requirements
    departmentInput.placeholder = "Location/Detail (Optional)";
    departmentInput.required = false;
    courseSelect.required = false;

    if (sessionType === 'clinical') {
        departmentInput.placeholder = "Clinical Department/Area (Required)";
        departmentInput.required = true;
    } else if (sessionType === 'classroom') {
        departmentInput.placeholder = "Classroom Location/Room (Optional)";
        courseSelect.required = true;
    } 
    // If not selected or another type, they are optional/default
}

async function populateAttendanceSelects() {
    // Populate Student Select
    const { data: students } = await fetchData(USER_PROFILE_TABLE, 'user_id, full_name, role', { role: 'student', status: 'approved' }, 'full_name', true);
    populateSelect($('att_student_id'), students, 'user_id', 'full_name', '-- Select Student --');

    // Populate Course Select
    // NOTE: Using 'unit_code' as the value to link to the course, but need to check if schema uses 'id' instead. 
    // Assuming 'unit_code' for simplicity here based on other code.
    const { data: courses } = await fetchData('courses', 'unit_code, unit_name', { is_active: true }, 'unit_name', true);
    populateSelect($('att_course_id'), courses.map(c => ({ id: c.unit_code, course_name: `${c.unit_code} - ${c.unit_name}` })), 'id', 'course_name', '-- Select Course (For Classroom) --');
}


// ----------------------- Admin Actions -----------------------

async function approveAttendanceRecord(recordId) {
    if (!currentUserProfile?.user_id) {
        showFeedback('Error: Admin ID not found for verification.', 'error');
        return;
    }
    if (!confirm('Approve this attendance record?')) return;

    try {
        const { error } = await sb
            .from('geo_attendance_logs')
            .update({
                is_verified: true,
                verified_by_id: currentUserProfile.user_id,
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
    if (!modal || !mapContainer || !mapDetails || !L) {
        showFeedback('Map functionality is unavailable (Leaflet library is missing or elements are not found).', 'error');
        return;
    }

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
    const course_code = session_type === 'classroom' ? $('att_course_id').value : null; // Use course_code for consistency
    const department = $('att_department').value.trim() || null;
    const location_name = $('att_location').value.trim() || 'Manual Admin Entry';

    let check_in_time = new Date().toISOString();
    if (date && time) check_in_time = new Date(`${date}T${time}`).toISOString();
    else if (date) check_in_time = new Date(date).toISOString();
    
    // Get the display name for logging and the target_name column
    const studentName = $('att_student_id')?.selectedOptions[0]?.text || student_id;
    const courseName = $('att_course_id')?.selectedOptions[0]?.text || null;
    const target_name = session_type === 'clinical' ? department : courseName;

    if (!student_id || (session_type === 'classroom' && !course_code) || (session_type === 'clinical' && !department)) {
        showFeedback('Please select a student and fill out required fields based on session type.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }
    
    // Check if the timestamp is in the future
    if (new Date(check_in_time) > new Date()) {
         showFeedback('Attendance time cannot be in the future.', 'error');
         setButtonLoading(submitButton, false, originalText);
         return;
    }

    const attendanceData = {
        student_id,
        session_type,
        check_in_time,
        department,
        course_code, // Use course_code
        is_manual_entry: true,
        latitude: null,
        longitude: null,
        location_name,
        ip_address: await getIPAddress(),
        device_id: getDeviceId(),
        target_name: target_name 
    };

    try {
        const { error, data } = await sb.from('geo_attendance_logs').insert([attendanceData]).select('id');
        if (error) throw error;
        
        await logAudit('ATTENDANCE_MANUAL', `Recorded manual attendance for student ${studentName} for ${session_type}.`, data?.[0]?.id, 'SUCCESS');
        showFeedback('Manual attendance recorded successfully!', 'success'); 
        e.target.reset(); 
        loadAttendance(); 
        toggleAttendanceFields(); // Reset the fields based on selection

    } catch (error) {
        await logAudit('ATTENDANCE_MANUAL', `Failed manual attendance for student ${studentName}. Reason: ${error.message}`, student_id, 'FAILURE');
        showFeedback(`Failed to record attendance: ${error.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

// ----------------------- Load Attendance -----------------------

async function loadAttendance() {
    const todayBody = $('attendance-table');
    const pastBody = $('past-attendance-table');
    if (!todayBody || !pastBody) return;

    todayBody.innerHTML = '<tr><td colspan="7">Loading today\'s records...</td></tr>';
    pastBody.innerHTML = '<tr><td colspan="6">Loading history...</td></tr>';

    // Get today's date in local time, then convert to ISO start of day for comparison
    const now = new Date();
    const todayISO = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0,10);

    const { data: allRecords, error } = await sb
        .from('geo_attendance_logs')
        .select(`
            id, check_in_time, session_type, is_verified, latitude, longitude, target_name, location_name, department, is_manual_entry,
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
        const checkInDate = new Date(r.check_in_time);
        const dateTime = checkInDate.toLocaleString();
        
        // Target name logic
        const targetDetail = r.target_name || r.department || r.location_name || 'N/A Target';
        const locationDisplay = r.location_name || r.department || 'N/A Location';
        const geoStatus = (r.is_manual_entry)?'No (Manual)':'Yes (Geo-Logged)';

        let actionsHtml = '';
        const mapAvailable = r.latitude && r.longitude;
        // NOTE: Escape single quotes in the strings passed to the function!
        const mapAction = mapAvailable ? `showMap(${r.latitude},${r.longitude},'${locationDisplay.replace(/'/g,"\\'")}','${userName.replace(/'/g,"\\'")}','${dateTime.replace(/'/g,"\\'")}')` : '';

        actionsHtml += `<button class="btn btn-map btn-small" ${mapAvailable?'':'disabled'} onclick="${mapAction}">View Map</button>`;

        // Check if the record date matches today's date string
        const isToday = checkInDate.toISOString().slice(0,10) === todayISO;
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


/*******************************************************
 * 5. INITIALIZATION AND LISTENERS (FIXED VERSION)
 *******************************************************/
async function initSession() {
    // Check if Supabase client is available (should be due to DOMContentLoaded wait)
    if (typeof sb === 'undefined') {
        console.error("Supabase client is not defined.");
        window.location.href = "login.html";
        return;
    }

    const { data: { session }, error: sessionError } = await sb.auth.getSession();

    if (sessionError || !session) {
        console.warn("Session check failed, redirecting to login.");
        window.location.href = "login.html";
        return;
    }

    // Explicitly setting the session after a successful getSession
    sb.auth.setSession(session);
    const user = session.user;

    const { data: profile, error: profileError } = await sb
        .from(USER_PROFILE_TABLE)
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (profile && !profileError) {
        currentUserProfile = profile;
        currentUserId = user.id;

        // ✅ Role-based access handling
        const role = currentUserProfile.role?.toLowerCase() || 'student';
        const currentPath = window.location.pathname.toLowerCase();

        if (currentPath.includes('superadmin.html') && role !== 'superadmin') {
            console.warn(`User ${user.email} is not a Super Admin. Redirecting.`);
            window.location.href = 'admin.html';
            return;
        }

        if (currentPath.includes('admin.html') && !['admin', 'superadmin'].includes(role)) {
            console.warn(`User ${user.email} is not an Admin. Redirecting.`);
            window.location.href = 'index.html'; // Assuming index.html is the student/lecturer default
            return;
        }

        const headerTitle = document.querySelector('header h1');
        if (headerTitle) {
             headerTitle.textContent =
                `Welcome, ${profile.full_name || (role === 'superadmin' ? 'Super Admin' : 'Admin')}!`;
        } else {
             console.warn('Header title element not found.');
        }

    } else {
        console.error("Profile not found or fetch error:", profileError?.message);
        await sb.auth.signOut();
        window.location.href = "login.html";
        return;
    }

    setupEventListeners();
    loadSectionData('dashboard');
}

function setupEventListeners() {
    // --- Global Nav ---
    const navLinks = document.querySelectorAll('.nav a');
    const tabs = document.querySelectorAll('.tab-content'); 
    navLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault(); 
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const tabId = link.dataset.tab;
            tabs.forEach(tab => tab.classList.remove('active'));
            const targetTab = document.getElementById(tabId);
            if (targetTab) targetTab.classList.add('active');
            
            loadSectionData(tabId);
        });
    });

    // Logout listener
    $('logout-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    // --- Tab Listeners ---

    // ATTENDANCE TAB
    $('att_session_type')?.addEventListener('change', toggleAttendanceFields);
    $('manual-attendance-form')?.addEventListener('submit', handleManualAttendance);
    $('attendance-search')?.addEventListener('keyup', () => filterTable('attendance-search', 'attendance-table', [0, 1, 2]));
    
    // ENROLLMENT/USER TAB
    $('add-account-form')?.addEventListener('submit', handleAddAccount);
    // Use blur for intake/program change to trigger options update
    $('account-program')?.addEventListener('change', () => updateBlockTermOptions('account-program', 'account-block-term'));
    $('account-intake')?.addEventListener('change', () => updateBlockTermOptions('account-program', 'account-block-term'));
    $('user-search')?.addEventListener('keyup', () => filterTable('user-search', 'users-table', [1, 2, 4]));
    
    // MASS PROMOTION LISTENER
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
        populateSessionCourseSelects(); // Re-populate courses based on program/block if implemented
    });
    $('session_intake')?.addEventListener('change', () => updateBlockTermOptions('session_program', 'session_block_term')); 

    // CATS/EXAMS TAB
    $('exam_program')?.addEventListener('change', () => { 
        populateExamCourseSelects(); 
        updateBlockTermOptions('exam_program', 'exam_block_term'); 
    });
    $('exam_intake')?.addEventListener('change', () => updateBlockTermOptions('exam_program', 'exam_block_term'));
    
    // MESSAGE/WELCOME EDITOR TAB
    $('send-message-form')?.addEventListener('submit', handleSendMessage);
    $('edit-welcome-form')?.addEventListener('submit', handleSaveWelcomeMessage); 
    
    // RESOURCES TAB
    $('resource_program')?.addEventListener('change', () => { updateBlockTermOptions('resource_program', 'resource_block'); });
    $('resource_intake')?.addEventListener('change', () => { updateBlockTermOptions('resource_program', 'resource_block'); });
    
    // SECURITY TAB
    $('global-password-reset-form')?.addEventListener('submit', handleGlobalPasswordReset);
    $('account-deactivation-form')?.addEventListener('submit', handleAccountDeactivation);

    // --- MODAL/EDIT LISTENERS ---
    $('edit-user-form')?.addEventListener('submit', handleEditUser);
    $('edit_account_program')?.addEventListener('change', () => { updateBlockTermOptions('edit_account_program', 'edit_account_block_term'); });
    $('edit_account_intake')?.addEventListener('change', () => { updateBlockTermOptions('edit_account_program', 'edit_account_block_term'); });
    
    $('edit-course-form')?.addEventListener('submit', handleEditCourse);
    
    // Modal close listeners 
    document.querySelector('#userEditModal .close')?.addEventListener('click', () => { $('userEditModal').style.display = 'none'; });
    document.querySelector('#mapModal .close')?.addEventListener('click', () => { $('mapModal').style.display = 'none'; });
    document.querySelector('#courseEditModal .close')?.addEventListener('click', () => { $('courseEditModal').style.display = 'none'; });
}


// --- Remaining Placeholder Functions ---
async function loadStudents() { 
    console.log("Fetching students for enrollment tab..."); 
    // Example: Populate a student list in the enroll tab 
    const { data: students } = await fetchData(USER_PROFILE_TABLE, 'user_id, full_name, role', { role: 'student', status: 'approved' }, 'full_name', true);
    // You would then render this data to a list in the enroll tab 
}

// Attendance load and populate are already implemented above

async function loadExams() { 
    console.log("Fetching exams..."); 
    const tbody = $('exams-table');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5">Loading exam records... (Placeholder)</td></tr>';
    const { data: exams, error } = await fetchData('exams', '*', {}, 'exam_date', false);
    // Render logic would go here
}

async function populateExamCourseSelects() { 
    console.log("Populating exam courses..."); 
    const courseSelect = $('exam_course_code');
    const { data: courses } = await fetchData('courses', 'unit_code, unit_name', { is_active: true });
    populateSelect(courseSelect, courses.map(c => ({ value: c.unit_code, text: `${c.unit_code} - ${c.unit_name}` })), 'value', 'text', '-- Select Course --');
}

async function handleAddExam(e) { 
    e.preventDefault(); 
    console.log("Add exam handler..."); 
    showFeedback('Exam added successfully! (Placeholder)', 'success');
    loadExams();
}

async function loadAdminMessages() { 
    console.log("Loading admin messages..."); 
    const messageDiv = $('admin-messages-list');
    if (messageDiv) messageDiv.innerHTML = '<p>No system-wide broadcast messages currently (Placeholder).</p>';
}

async function handleSendMessage(e) { 
    e.preventDefault(); 
    console.log("Send message handler..."); 
    showFeedback('Message broadcast initiated (Placeholder)', 'success');
}

async function renderFullCalendar() { 
    console.log("Rendering calendar..."); 
    const calendarDiv = $('calendar-view');
    if (calendarDiv) calendarDiv.innerHTML = '<h3>Calendar View (Requires FullCalendar JS Library)</h3><p>Sessions would be displayed here.</p>';
}

async function loadResources() { 
    console.log("Loading resources..."); 
    const resourceList = $('resources-list');
    if (resourceList) resourceList.innerHTML = '<li>Resource 1 (Placeholder)</li><li>Resource 2 (Placeholder)</li>';
}

async function loadSystemStatus() { 
    console.log("Loading system status..."); 
    const { data } = await fetchData(SETTINGS_TABLE, '*', { key: GLOBAL_SETTINGS_KEY });
    const statusDiv = $('system-status-display');
    const status = data?.[0]?.value || 'Online';
    if (statusDiv) statusDiv.textContent = `Current Status: ${status}`;
    $('system-status-input').value = status;
}

async function loadBackupHistory() { 
    console.log("Loading backup history..."); 
    const backupTable = $('backup-history-table');
    if (backupTable) backupTable.innerHTML = '<tr><td colspan="4">No backup history available (Requires external service or storage).</td></tr>';
}

async function handleGlobalPasswordReset(e) { 
    e.preventDefault(); 
    console.log("Global password reset..."); 
    if (confirm('WARNING: Are you sure you want to perform a GLOBAL PASSWORD RESET? This is a highly critical action.')) {
        // This is a client-side function and MUST NOT attempt a global reset.
        showFeedback("Global Password Reset is disabled for client-side security.", 'error');
        await logAudit('GLOBAL_RESET', 'Attempted Global Password Reset (Blocked on client-side).', null, 'FAILURE');
    }
}

async function handleAccountDeactivation(e) { 
    e.preventDefault(); 
    console.log("Account deactivation..."); 
    const targetEmail = $('deactivate-email').value;
     if (confirm(`Confirm deactivation of account: ${targetEmail}?`)) {
        // Find user ID by email and then deactivate
        const { data: users } = await fetchData(USER_PROFILE_TABLE, 'user_id', { email: targetEmail }, null, null);
        if (users?.length > 0) {
            await toggleUserStatus(users[0].user_id, 'approved');
            showFeedback(`Deactivation process initiated for ${targetEmail}.`, 'success');
            e.target.reset();
        } else {
            showFeedback(`Account not found for email: ${targetEmail}`, 'error');
        }
    }
}

async function openEditSessionModal(sessionId) { 
    console.log(`Opening edit session modal for ID: ${sessionId}`); 
    showFeedback(`Edit Session functionality for ID: ${sessionId} is pending full implementation.`, 'warning');
    // Implementation would involve fetching session data and populating a modal form.
}

async function toggleSessionStatus(sessionId, currentStatus) { 
    const newStatus = !currentStatus;
    const action = newStatus ? 'Activate' : 'Cancel';

    if (!confirm(`Are you sure you want to ${action} session ID ${sessionId}?`)) {
        return;
    }
    
    try {
        const { error } = await sb
            .from('scheduled_sessions')
            .update({ is_active: newStatus, updated_at: new Date().toISOString() })
            .eq('id', sessionId);

        if (error) throw error;

        showFeedback(`Session ${sessionId} successfully ${action}d.`, 'success');
        await logAudit('SESSION_STATUS_UPDATE', `${action}d session: ${sessionId}`, sessionId, 'SUCCESS');
        loadScheduledSessions();
        
    } catch (err) {
        const errorMessage = `Failed to ${action} session ${sessionId}. Reason: ${err.message}`;
        await logAudit('SESSION_STATUS_UPDATE', errorMessage, sessionId, 'FAILURE');
        showFeedback(errorMessage, 'error');
    }
}


// Global script execution start
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for the Supabase library to be loaded from the CDN
    const maxWait = 20; // 2 seconds (20 × 100ms)
    let waitCount = 0;

    // Check for the global 'supabase' object
    while (typeof supabase === 'undefined' && waitCount < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
    }

    if (typeof supabase !== 'undefined') {
        try {
            await initSession(); 
        } catch (err) {
            console.error('Error initializing session:', err);
            // Fallback redirect if initSession fails
            window.location.href = 'login.html';
        }
    } else {
        console.error("❌ SUPABASE LIBRARY MISSING: Ensure the Supabase CDN link is included in admin.html");
        alert('Supabase library failed to load. Please refresh the page.');
    }
});
