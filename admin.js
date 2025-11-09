/**********************************************************************************
 * Final Integrated JavaScript File (admin.js)
 * SUPERADMIN DASHBOARD - COURSE, USER, ATTENDANCE & FULL FILTERING MANAGEMENT
 **********************************************************************************/

// --- SUPABASE CONFIGURATION ---
// !!! IMPORTANT: CHECK YOUR KEYS AND URL !!!
// REPLACE with your actual Supabase URL and ANON_KEY if different from the ones you provided
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
// Use your provided consolidated table name
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
        str = str.replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    } else {
        str = str.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    return str;
}

/**
 * Global feedback utility
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
 * Handles button loading state
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

// Utility functions for IP/Device ID (included in your original script)
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

// --- Tab Switching Logic (Consolidated from your script) ---
async function loadSectionData(tabId) {
    // Hide all modals when switching tabs
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    
    switch(tabId) {
        case 'dashboard': loadDashboardData(); break;
        case 'users': loadAllUsers(); break;
        case 'pending': loadPendingApprovals(); break;
        case 'enroll': 
            loadStudents(); 
            // Initialize Mass Promotion Selects
            updateBlockTermOptions('promote_intake', 'promote_from_block');
            updateBlockTermOptions('promote_intake', 'promote_to_block');
            break; 
        case 'courses': loadCourses(); break; // <<< ADDED
        case 'sessions': loadScheduledSessions(); populateSessionCourseSelects(); break;
        case 'attendance': loadAttendance(); populateAttendanceSelects(); break;
        case 'cats': 
            const addExamForm = $('add-exam-form');
            if (addExamForm) {
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
 * 1.5. LOGOUT & AUDIT LOGGING
 *******************************************************/

/**
 * Logs a critical action to the audit_logs table.
 */
async function logAudit(action_type, details, target_id = null, status = 'SUCCESS') {
    const logData = {
        user_id: currentUserProfile?.id || 'SYSTEM',
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
        
        await sb.auth.signOut();
        
    } catch (error) {
        console.error("Logout error (Supabase/Audit):", error);
    }
    
    // Client-side Cleanup
    localStorage.removeItem("loggedInUser");
    sessionStorage.removeItem('authToken'); 
    sessionStorage.removeItem('userRole'); 

    // Redirect
    window.location.href = "login.html";
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
 * Core CSV Export Function - Referenced by ALL Export buttons in HTML
 */
function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) { console.error("Export Error: Table not found with ID:", tableId); return; }

    const rows = table.querySelectorAll('tr');
    let csv = [];

    // 1. Extract Header Row
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
    
    // 2. Extract Data Rows
    for (let i = 0; i < rows.length; i++) {
        const row = [];
        const cols = rows[i].querySelectorAll('td'); 
        
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
 * 3. Dashboard / Welcome Editor
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

    // NOTE: Using 'geo_attendance_logs' as per your original script
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

    // Data Integrity Placeholder 
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

// --- Block/Term Utilities (Copied from your script) ---
function updateBlockTermOptions(programSelectId, blockTermSelectId) {
  const program = $(programSelectId)?.value;
  const blockTermSelect = $(blockTermSelectId);
  if (!blockTermSelect) return;

  blockTermSelect.innerHTML = '<option value="">-- Select Block/Term --</option>';

  if (!program) return;

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
    options = [
      { value: 'A', text: 'Block A / Term 1' },
      { value: 'B', text: 'Block B / Term 2' }
    ];
  }

  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    blockTermSelect.appendChild(option);
  });
}
// --- End Block/Term Utilities ---


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
    // Assuming block_program_year is a calculated field or placeholder
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
        // NOTE: Supabase Admin API may be required for this in RLS-enabled environments
        // For simplicity here, we assume admin has the right permissions:
        // await sb.auth.admin.deleteUser(user.id); 
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
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const promote_intake = $('promote_intake').value;
    const promote_from_block = $('promote_from_block').value;
    const promote_to_block = $('promote_to_block').value;
    // Simple determination based on KRCHN/TVET logic from updateBlockTermOptions
    const program = $('promote_intake').selectedOptions[0]?.text.includes('KRCHN') ? 'KRCHN' : 'TVET'; 

    if (!promote_intake || !promote_from_block || !promote_to_block) {
        showFeedback('Please select the Intake Year, FROM Block/Term, and TO Block/Term.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    if (promote_from_block === promote_to_block) {
        showFeedback('The "FROM" and "TO" blocks/terms must be different.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    if (!confirm(`WARNING: Are you sure you want to promote ALL active students from the ${promote_from_block} to the ${promote_to_block} for the Intake Year ${promote_intake}? This action cannot be undone easily.`)) {
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    try {
        // First check how many students are affected (optional but good for logging)
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

        // --- CORE SUPABASE UPDATE ---
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
        
        // --- Success Handling ---
        const logDetails = `Mass promoted ${count} students from ${promote_from_block} to ${promote_to_block} (Intake: ${promote_intake}, Program: ${program}).`;
        await logAudit('PROMOTION_MASS', logDetails, null, 'SUCCESS');
        showFeedback(`Successfully promoted ${count} student(s) to ${promote_to_block}!`, 'success');

        e.target.reset();
        // loadStudents(); // Refresh the enrollment table
        
    } catch (err) {
        const logDetails = `Failed mass promotion for Intake ${promote_intake} from ${promote_from_block} to ${promote_to_block}. Error: ${err.message}`;
        await logAudit('PROMOTION_MASS', logDetails, null, 'FAILURE');
        showFeedback(`Mass promotion failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


/*******************************************************
 * 4.5. COURSE MANAGEMENT (CREATE, READ, UPDATE STATUS, EDIT READ)
 *******************************************************/

/**
 * Handles the creation of a new course/unit and inserts it into the 'courses' table.
 */
async function handleAddCourse(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const unitCode = $('course-unit-code').value.trim().toUpperCase();
    const unitName = $('course-name').value.trim();
    const program = $('course-program').value;
    const blockTerm = $('course-block').value;
    const lecturerId = $('course-lecturer').value || null; 

    if (!unitCode || !unitName || !program || !blockTerm) {
        showFeedback('Please fill out all required course fields (Code, Name, Program, Block/Term).', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const newCourseData = {
        unit_code: unitCode,
        unit_name: unitName,
        program: program,
        block_term: blockTerm,
        lecturer_id: lecturerId,
        is_active: true
    };

    try {
        const { error } = await sb
            .from('courses')
            .insert([newCourseData]);

        if (error) {
            if (error.code === '23505') { 
                throw new Error(`Unit Code ${unitCode} already exists.`);
            }
            throw error;
        }
        
        showFeedback(`Course ${unitCode} (${unitName}) added successfully!`, 'success');
        await logAudit('COURSE_CREATE', `Created new course: ${unitCode} - ${unitName}`, unitCode, 'SUCCESS');
        
        e.target.reset(); 
        loadCourses(); 
        
    } catch (err) {
        const errorMessage = `Failed to add course ${unitCode}. Reason: ${err.message}`;
        await logAudit('COURSE_CREATE', errorMessage, unitCode, 'FAILURE');
        showFeedback(errorMessage, 'error');
        
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}


/**
 * Fetches all courses and renders them into the courses-table.
 */
async function loadCourses() {
    const tbody = $('courses-table');
    tbody.innerHTML = '<tr><td colspan="7">Loading courses...</td></tr>';
    
    // Select with inner join to get lecturer full name (assuming lecturer_id links to user_profiles)
    const { data: courses, error } = await fetchData('courses', '*, lecturer:lecturer_id(full_name)', {}, 'unit_code', true); 

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading courses: ${error.message}</td></tr>`;
        return;
    }

    if (!courses || courses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No courses currently added.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    courses.forEach(course => {
        const lecturerName = course.lecturer ? escapeHtml(course.lecturer.full_name) : 'N/A';
        const statusClass = course.is_active ? 'status-approved' : 'status-danger';

        tbody.innerHTML += `
            <tr>
                <td>${escapeHtml(course.unit_code)}</td>
                <td>${escapeHtml(course.unit_name)}</td>
                <td>${escapeHtml(course.program)}</td>
                <td>${escapeHtml(course.block_term)}</td>
                <td>${lecturerName}</td>
                <td class="${statusClass}">${course.is_active ? 'Active' : 'Inactive'}</td>
                <td>
                    <button class="btn btn-sm btn-edit" onclick="openEditCourseModal('${course.unit_code}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="toggleCourseStatus('${course.unit_code}', ${course.is_active})">${course.is_active ? 'Deactivate' : 'Activate'}</button>
                </td>
            </tr>
        `;
    });
}


/**
 * Toggles the 'is_active' status of a course.
 */
async function toggleCourseStatus(unitCode, currentStatus) {
    const newStatus = !currentStatus;
    const action = newStatus ? 'Activate' : 'Deactivate';

    if (!confirm(`Are you sure you want to ${action} course ${unitCode}?`)) {
        return;
    }

    try {
        const { error } = await sb
            .from('courses')
            .update({ 
                is_active: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq('unit_code', unitCode);

        if (error) throw error;

        showFeedback(`Course ${unitCode} successfully ${action}d.`, 'success');
        await logAudit('COURSE_STATUS_UPDATE', `${action}d course: ${unitCode}`, unitCode, 'SUCCESS');
        loadCourses();
        
    } catch (err) {
        const errorMessage = `Failed to ${action} course ${unitCode}. Reason: ${err.message}`;
        await logAudit('COURSE_STATUS_UPDATE', errorMessage, unitCode, 'FAILURE');
        showFeedback(errorMessage, 'error');
    }
}


/**
 * Loads course data into the edit modal and displays it.
 */
async function openEditCourseModal(unitCode) {
    const modal = $('courseEditModal');
    const form = $('edit-course-form');
    const title = $('edit-course-title');
    
    title.textContent = `Edit Course: ${unitCode}`;
    form.reset();
    
    // Fetch data for the specific course
    const { data: course, error } = await fetchData('courses', '*', { unit_code: unitCode }, null, null);

    if (error || !course || course.length === 0) {
        showFeedback(`Could not load course ${unitCode} for editing.`, 'error');
        return;
    }

    const c = course[0];
    
    // Set hidden field for reference
    $('edit_course_unit_code').value = c.unit_code; 

    // Pre-fill fields
    $('edit_course_name').value = c.unit_name;
    $('edit_course_program').value = c.program;
    $('edit_course_intake').value = c.intake_year || ''; 
    
    // Populate Block/Term options (needed for dropdowns)
    updateBlockTermOptions('edit_course_program', 'edit_course_block');
    
    // Set the specific Block/Term for this course (must be done AFTER populating options)
    $('edit_course_block').value = c.block_term; 
    
    // Set Lecturer (Assuming 'course-lecturer' dropdown exists in the modal)
    // You would need a function to load lecturers into this select beforehand
    // $('edit_course_lecturer').value = c.lecturer_id; 

    modal.style.display = 'block';
}

/**
 * Handles the submission of the course edit form to update the course in the database.
 */
async function handleEditCourse(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);
    
    const originalUnitCode = $('edit_course_unit_code').value; // Hidden field used for WHERE clause
    const unitName = $('edit_course_name').value.trim();
    const program = $('edit_course_program').value;
    const blockTerm = $('edit_course_block').value;
    const lecturerId = $('edit_course_lecturer').value || null; 

    if (!unitName || !program || !blockTerm) {
        showFeedback('Please ensure all required fields are filled.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const updatedData = {
        unit_name: unitName,
        program: program,
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
 * 5. INITIALIZATION AND LISTENERS
 *******************************************************/

// --- Session / Init (FIXED for instant logout) ---
async function initSession() {
    // Hide the .html extension in the URL
    if (window.location.pathname.endsWith('.html')) {
        const cleanPath = window.location.pathname.replace(/\.html$/, '');
        window.history.replaceState({}, '', cleanPath);
    }

    const { data: { session }, error: sessionError } = await sb.auth.getSession();
    
    if (sessionError || !session) {
        console.warn("Session check failed, redirecting to login.");
        window.location.href = "login.html";
        return;
    }

    sb.auth.setSession(session);
    const user = session.user;
    
    // CRITICAL FIX: Use the consolidated table and 'user_id'
    const { data: profile, error: profileError } = await sb
        .from(USER_PROFILE_TABLE) 
        .select('*')
        .eq('user_id', user.id) // Use 'user_id' or 'id' based on your table's foreign key
        .single();
    
    if (profile && !profileError) {
        currentUserProfile = profile;
        currentUserId = user.id;
        
        // Role Check
        if (currentUserProfile.role !== 'superadmin') { 
            console.warn(`User ${user.email} is not a Super Admin. Redirecting.`);
            window.location.href = "admin.html"; // Redirect to standard admin view
            return;
        }
        
        document.querySelector('header h1').textContent = `Welcome, ${profile.full_name || 'Super Admin'}!`;
    } else {
        console.error("Profile not found or fetch error:", profileError?.message);
        // Clean redirect on failure to find profile
        await sb.auth.signOut(); 
        window.location.href = "login.html";
        return;
    }
    
    // Continue with app initialization
    setupEventListeners();
    loadSectionData('dashboard');
}

function setupEventListeners() {
    // Tab switching logic (Uses the global loadSectionData)
    const navLinks = document.querySelectorAll('.nav a');
    const tabs = document.querySelectorAll('.tab-content'); 
    navLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault(); // Prevents full page refresh on tab click
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

    // ATTENDANCE TAB
    $('att_session_type')?.addEventListener('change', () => {/* toggleAttendanceFields logic */});
    $('manual-attendance-form')?.addEventListener('submit', handleManualAttendance);
    $('attendance-search')?.addEventListener('keyup', () => filterTable('attendance-search', 'attendance-table', [0, 1, 2]));
    
    // ENROLLMENT/USER TAB
    $('add-account-form')?.addEventListener('submit', handleAddAccount);
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
        populateSessionCourseSelects(); 
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

    // MODAL/EDIT LISTENERS
    $('edit-user-form')?.addEventListener('submit', handleEditUser);
    $('edit-course-form')?.addEventListener('submit', handleEditCourse);
    
    // Modal close listeners 
    document.querySelector('#userEditModal .close')?.addEventListener('click', () => { $('userEditModal').style.display = 'none'; });
    document.querySelector('#mapModal .close')?.addEventListener('click', () => { $('mapModal').style.display = 'none'; });
    document.querySelector('#courseEditModal .close')?.addEventListener('click', () => { $('courseEditModal').style.display = 'none'; });
}


// --- Placeholder Functions (These need specific table schemas to be fully implemented) ---
async function loadAllUsers() { console.log("Fetching all users..."); /* ... implementation ... */ }
async function loadPendingApprovals() { console.log("Fetching pending approvals..."); /* ... implementation ... */ }
async function loadStudents() { console.log("Fetching students for enrollment tab..."); /* ... implementation ... */ }
async function loadScheduledSessions() { console.log("Fetching sessions..."); /* ... implementation ... */ }
async function populateSessionCourseSelects() { console.log("Populating session courses..."); /* ... implementation ... */ }
async function loadAttendance() { console.log("Fetching attendance..."); /* ... implementation ... */ }
async function populateAttendanceSelects() { console.log("Populating attendance selects..."); /* ... implementation ... */ }
async function handleManualAttendance(e) { e.preventDefault(); console.log("Manual attendance handler..."); /* ... implementation ... */ }
async function loadExams() { console.log("Fetching exams..."); /* ... implementation ... */ }
async function populateExamCourseSelects() { console.log("Populating exam courses..."); /* ... implementation ... */ }
async function handleAddExam(e) { e.preventDefault(); console.log("Add exam handler..."); /* ... implementation ... */ }
async function loadAdminMessages() { console.log("Loading admin messages..."); /* ... implementation ... */ }
async function handleSendMessage(e) { e.preventDefault(); console.log("Send message handler..."); /* ... implementation ... */ }
async function renderFullCalendar() { console.log("Rendering calendar..."); /* ... implementation ... */ }
async function loadResources() { console.log("Loading resources..."); /* ... implementation ... */ }
async function loadSystemStatus() { console.log("Loading system status..."); /* ... implementation ... */ }
async function loadBackupHistory() { console.log("Loading backup history..."); /* ... implementation ... */ }
async function handleGlobalPasswordReset(e) { e.preventDefault(); console.log("Global password reset..."); /* ... implementation ... */ }
async function handleAccountDeactivation(e) { e.preventDefault(); console.log("Account deactivation..."); /* ... implementation ... */ }
async function handleEditUser(e) { e.preventDefault(); console.log("Edit user handler..."); /* ... implementation ... */ }
async function handleAddSession(e) { e.preventDefault(); console.log("Add session handler..."); /* ... implementation ... */ }


// Global script execution start
document.addEventListener('DOMContentLoaded', () => {
    // Check if Supabase client is defined before initializing
    if (typeof supabase !== 'undefined') {
        initSession();
    } else {
        console.error("❌ SUPABASE LIBRARY MISSING: Ensure the Supabase CDN link is included in your admin.html.");
        document.querySelector('.main header h1').textContent = "⚠️ CONFIGURATION ERROR ⚠️";
        document.querySelector('.main header p').textContent = "Supabase library not loaded.";
    }
});
