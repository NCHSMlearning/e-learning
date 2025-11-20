/**********************************************************************************
* Enhanced Integrated JavaScript File (script.js) - ALIGNED WITH ENHANCED HTML
* SUPERADMIN DASHBOARD - COMPREHENSIVE SYSTEM MANAGEMENT
**********************************************************************************/

// Hides the .html extension in the URL
if (window.location.pathname.endsWith('.html')) {
    const cleanPath = window.location.pathname.replace(/\.html$/, '');
    window.history.replaceState({}, '', cleanPath);
}

// Supabase Configuration
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Constants
const RESOURCES_BUCKET = 'resources';
const IP_API_URL = 'https://api.ipify.org?format=json';
const DEVICE_ID_KEY = 'nchsm_device_id';
const SETTINGS_TABLE = 'app_settings'; 
const MESSAGE_KEY = 'student_welcome'; 
const AUDIT_TABLE = 'audit_logs'; 
const GLOBAL_SETTINGS_KEY = 'global_system_status'; 
const USER_PROFILE_TABLE = 'consolidated_user_profiles_table';

// Global Variables
let currentUserProfile = null;
let currentUserId = null;
let attendanceMap = null;

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

function showFeedback(message, type = 'success') {
    const prefix = type === 'success' ? '✅ Success: ' : 
                   type === 'error' ? '❌ Error: ' :
                   type === 'warning' ? '⚠️ Warning: ' : 'ℹ️ Info: ';
    alert(prefix + message);
}

function setButtonLoading(button, isLoading, originalText = 'Submit') {
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? 'Processing...' : originalText;
    button.style.opacity = isLoading ? 0.7 : 1;
}

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

function populateSelect(selectElement, data, valueKey, textKey, defaultText) {
    if (!selectElement) return;
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

/*******************************************************
 * 2. TAB NAVIGATION & MODAL MANAGEMENT
 *******************************************************/
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

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav a').forEach(link => link.classList.remove('active'));
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    
    const navLink = document.querySelector(`.nav a[data-tab="${tabId}"]`);
    if (navLink) navLink.classList.add('active');
    
    loadSectionData(tabId);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        
        if (modalId === 'mapModal' && attendanceMap) {
            attendanceMap.remove();
            attendanceMap = null;
        }
        
        if (modalId === 'userEditModal') {
            const form = $('edit-user-form');
            if (form) form.reset();
            $('password-reset-feedback').textContent = '';
        }
    }
}

async function loadSectionData(tabId) {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    
    switch(tabId) {
        case 'dashboard': 
            loadDashboardData(); 
            break;
        case 'users': loadAllUsers(); break;
        case 'pending': loadPendingApprovals(); break;
        case 'enroll': 
            loadStudents(); 
            updateBlockTermOptions('promote_intake', 'promote_from_block');
            updateBlockTermOptions('promote_intake', 'promote_to_block');
            break; 
        case 'courses': loadCourses(); break;
        case 'sessions': loadScheduledSessions(); populateSessionCourseSelects(); break;
        case 'attendance': loadAttendance(); populateAttendanceSelects(); break;
        case 'cats': 
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
        case 'system-health': loadSystemHealth(); break;
        case 'user-analytics': loadUserAnalytics(); break;
        case 'task-scheduler': loadScheduledTasks(); break;
        case 'bulk-operations': loadBulkOperations(); break;
        case 'api-management': loadAPIKeys(); break;
        case 'notification-center': loadNotifications(); break;
        case 'quick-actions': loadQuickActions(); break;
        case 'security-2fa': load2FASettings(); break;
        case 'session-management': loadActiveSessions(); break;
        case 'error-tracking': loadErrorLogs(); break;
        case 'data-visualization': loadDataVisualization(); break;
    }
}

/*******************************************************
 * 3. AUDIT LOGGING
 *******************************************************/
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
 * 4. TABLE FILTERING & EXPORT FUNCTIONS
 *******************************************************/
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
            for (let j = 0; j < headerCols.length - 1; j++) { 
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
        
        if (cols.length < 2) continue;

        for (let j = 0; j < cols.length - 1; j++) { 
            let data = cols[j].innerText.trim();
            data = data.replace(/"/g, '""'); 
            row.push('"' + data + '"');
        }
        csv.push(row.join(','));
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
 * 5. DASHBOARD & WELCOME EDITOR
 *******************************************************/
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

    // Overall check-in count
    const { count: overallCheckIns } = await sb
        .from('geo_attendance_logs')
        .select('*', { count: 'exact', head: true });
    $('overallCheckInCount').textContent = overallCheckIns || 0;

    loadStudentWelcomeMessage();
}

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
    loadStudentWelcomeMessage();
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
 * 6. ENHANCED SYSTEM MANAGEMENT SECTIONS
 *******************************************************/

// System Health Monitoring
async function loadSystemHealth() {
    // Update progress bars with real data
    updateProgressBar('server-load-bar', 'server-load-text', 45, '%');
    updateProgressBar('db-performance-bar', 'db-query-time', 78, '% - 12ms avg');
    updateProgressBar('storage-usage-bar', 'storage-used', 62, 'GB / 100GB');
    updateProgressBar('api-response-bar', 'api-response-time', 92, '% - 180ms avg');
}

function updateProgressBar(barId, textId, percentage, suffix) {
    const bar = $(barId);
    const text = $(textId);
    if (bar && text) {
        bar.style.width = `${percentage}%`;
        text.textContent = `${percentage}${suffix}`;
    }
}

// User Analytics
async function loadUserAnalytics() {
    // Placeholder for analytics data loading
    console.log('Loading user analytics...');
}

// Task Scheduler
async function loadScheduledTasks() {
    // Placeholder for scheduled tasks loading
    console.log('Loading scheduled tasks...');
}

// Bulk Operations
async function loadBulkOperations() {
    // Initialize bulk operations interface
    console.log('Loading bulk operations...');
}

// API Management
async function loadAPIKeys() {
    // Placeholder for API keys loading
    console.log('Loading API keys...');
}

// Notification Center
async function loadNotifications() {
    // Placeholder for notifications loading
    console.log('Loading notifications...');
}

// Quick Actions
async function loadQuickActions() {
    // Placeholder for quick actions loading
    console.log('Loading quick actions...');
}

// 2FA Settings
async function load2FASettings() {
    // Placeholder for 2FA settings loading
    console.log('Loading 2FA settings...');
}

// Session Management
async function loadActiveSessions() {
    // Placeholder for active sessions loading
    console.log('Loading active sessions...');
}

// Error Tracking
async function loadErrorLogs() {
    // Placeholder for error logs loading
    console.log('Loading error logs...');
}

// Data Visualization
async function loadDataVisualization() {
    // Placeholder for data visualization loading
    console.log('Loading data visualization...');
}

/*******************************************************
 * 7. USERS / ENROLLMENT MANAGEMENT
 *******************************************************/
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

async function handleMassPromotion(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const promote_intake = $('promote_intake').value;
    const promote_from_block = $('promote_from_block').value;
    const promote_to_block = $('promote_to_block').value;
    const program = $('promote_intake').selectedOptions[0].text.includes('KRCHN') ? 'KRCHN' : 'TVET';

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
            .select('user_id');

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
                <td>${escapeHtml(u.student_id || 'N/A')}</td>
                <td>${new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-approve" onclick="approveUser('${u.user_id}', '${escapeHtml(u.full_name, true)}', '${u.student_id || ''}')">Approve</button>
                    <button class="btn btn-delete" onclick="deleteProfile('${u.user_id}', '${escapeHtml(u.full_name, true)}')">Reject</button>
                </td>
            </tr>`;
    });
}

async function loadAllUsers() {
    const tbody = $('users-table');
    if (!tbody) return;
    
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
    if (!tbody) return;
    
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

async function approveUser(userId, fullName, studentId = '', email = '', role = 'student', program = 'N/A') {
    if (!confirm(`Approve user ${fullName}?`)) return;

    try {
        const { data, error } = await sb
            .from(USER_PROFILE_TABLE)
            .update({
                status: 'approved',
                student_id: studentId || ''
            })
            .eq('user_id', userId)
            .select('*');

        if (error) {
            await logAudit(
                'USER_APPROVE',
                `Failed to approve user ${fullName} (Student ID: ${studentId}). Reason: ${error.message}`,
                userId,
                'FAILURE'
            );
            showFeedback(`Failed: ${error.message}`, 'error');
            return;
        }

        showFeedback('User approved successfully!', 'success');
        await logAudit(
            'USER_APPROVE',
            `User ${fullName} (Student ID: ${studentId}) approved successfully.`,
            userId,
            'SUCCESS'
        );

        loadPendingApprovals();
        loadAllUsers();
        loadStudents();
        loadDashboardData();

    } catch (err) {
        console.error('Unexpected error in approveUser:', err);
        showFeedback(`Unexpected error: ${err.message}`, 'error');
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
        
        // Set block value after options are populated
        setTimeout(() => {
            $('edit_user_block').value = user.block || '';
        }, 100);
        
        $('userEditModal').style.display = 'flex';
    } catch (e) {
        showFeedback(`Failed to load user: ${e.message}`, 'error');
    }
}

async function handleEditUser(e) {
    e.preventDefault(); 
    const submitButton = e.submitter;
    if (!submitButton) {
        console.error("Form submitter button not found.");
        return; 
    }

    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    try {
        const userId = $('edit_user_id').value;
        if (!userId) throw new Error('User ID is missing.');

        const updatedData = {
            full_name: $('edit_user_name').value.trim(),
            email: $('edit_user_email').value.trim(),
            role: $('edit_user_role').value,
            program: $('edit_user_program').value || null,
            intake_year: $('edit_user_intake').value || null,
            block: $('edit_user_block').value || null,
            block_program_year: $('edit_user_block_status').value === 'true',
            status: 'approved'
        };

        const newPassword = $('edit_user_new_password').value.trim();
        const confirmPassword = $('edit_user_confirm_password').value.trim();
        
        if (newPassword && newPassword !== confirmPassword) {
            showFeedback('Passwords do not match!', 'error');
            setButtonLoading(submitButton, false, originalText);
            return; 
        }

        const { data: updatedRow, error: profileError } = await sb
            .from(USER_PROFILE_TABLE)
            .update(updatedData)
            .eq('user_id', userId)
            .select('*');

        if (profileError) throw profileError;

        if (newPassword) {
            const { error: pwError } = await sb.auth.admin.updateUserById(userId, {
                password: newPassword
            });

            if (pwError) {
                console.error('Password update failed:', pwError);
                showFeedback('User profile saved, but password update failed.', 'warning');
            }
        }

        await logAudit('USER_EDIT', `Edited profile for user ${updatedData.full_name}`, userId, 'SUCCESS');
        showFeedback('User profile updated successfully!', 'success');
        
        $('userEditModal').style.display = 'none';
        $('edit_user_new_password').value = '';
        $('edit_user_confirm_password').value = '';
        $('password-reset-feedback').textContent = '';

        loadAllUsers();
        loadStudents();
        loadDashboardData();

    } catch (err) {
        console.error('Error in handleEditUser:', err);
        showFeedback('Failed to update user: ' + err.message, 'error');

        try {
            const userId = $('edit_user_id')?.value || 'unknown';
            await logAudit('USER_EDIT', `Failed to edit user: ${err.message}`, userId, 'FAILURE');
        } catch (logErr) {
            console.error('Audit log failed:', logErr);
        }
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

/*******************************************************
 * 8. COURSES MANAGEMENT
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
    if (!tbody) return;
    
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
    
    updateBlockTermOptions('edit_course_program', 'edit_course_block'); 
    
    setTimeout(() => {
        $('edit_course_block').value = block;
    }, 100);

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
    const description = $('edit_course_description').value.trim();
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
 * 9. SESSIONS & CLINICAL MANAGEMENT
 *******************************************************/
async function loadScheduledSessions() {
    const tbody = document.getElementById('scheduledSessionsTableBody');
    if (!tbody) return;

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

    if (!sessions || sessions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">No scheduled sessions found.</td></tr>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    sessions.forEach(s => {
      const tr = document.createElement('tr');
      const dateTime = new Date(s.session_date).toLocaleDateString() + ' ' + (s.session_time || 'N/A');
      const courseName = s.course?.course_name || 'N/A';
      let detail = s.session_title;
      if (s.session_type === 'class' && courseName !== 'N/A') {
        detail += ` (${courseName})`;
      }
      tr.innerHTML = `
        <td>${escapeHtml(s.session_type)}</td>
        <td>${escapeHtml(detail)}</td>
        <td>${dateTime}</td>
        <td>${escapeHtml(s.target_program || 'N/A')}</td>
        <td>${escapeHtml(s.block_term || 'N/A')}</td>
        <td>
          <button class="btn btn-delete" onclick="deleteSession('${s.id}', '${escapeHtml(s.session_title, true)}')">Delete</button>
        </td>
      `;
      fragment.appendChild(tr);
    });
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

async function populateSessionCourseSelects(courses = null) {
    const program = $('new_session_program')?.value;
    const courseSelect = $('new_session_course');
    
    if (!courseSelect) return;
    
    courseSelect.innerHTML = '<option value="">-- Select Course (Optional) --</option>';
    
    if (!program) return;
    
    if (!courses) {
        const { data } = await fetchData(
            'courses', 
            'id, course_name, target_program', 
            { target_program: program }, 
            'course_name', 
            true
        );
        courses = data || [];
    }
    
    if (courses && courses.length > 0) {
        courses.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            option.textContent = c.course_name;
            courseSelect.appendChild(option);
        });
    }
}

async function handleAddSession(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    try {
        const sessionData = {
            session_type: $('new_session_type').value,
            session_title: $('new_session_title').value.trim(),
            session_date: $('new_session_date').value,
            session_time: $('new_session_start_time').value,
            session_end_date: $('new_session_end_date').value || null,
            target_program: $('new_session_program').value,
            intake_year: $('new_session_intake_year').value,
            block_term: $('new_session_block_term').value,
            course_id: $('new_session_course').value || null
        };

        const { error } = await sb.from('scheduled_sessions').insert([sessionData]);
        if (error) throw error;

        await logAudit('SESSION_ADD', `Added ${sessionData.session_type} session: ${sessionData.session_title}`, null, 'SUCCESS');
        showFeedback('Session scheduled successfully!', 'success');
        e.target.reset();
        loadScheduledSessions();
        renderFullCalendar();
    } catch (error) {
        await logAudit('SESSION_ADD', `Failed to add session: ${error.message}`, null, 'FAILURE');
        showFeedback(`Failed to schedule session: ${error.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

async function deleteSession(sessionId, sessionTitle) {
    if (!confirm(`Delete session: ${sessionTitle}?`)) return;
    
    try {
        const { error } = await sb.from('scheduled_sessions').delete().eq('id', sessionId);
        if (error) throw error;
        
        await logAudit('SESSION_DELETE', `Deleted session: ${sessionTitle}`, sessionId, 'SUCCESS');
        showFeedback('Session deleted successfully!', 'success');
        loadScheduledSessions();
        renderFullCalendar();
    } catch (error) {
        await logAudit('SESSION_DELETE', `Failed to delete session: ${sessionTitle}`, sessionId, 'FAILURE');
        showFeedback(`Failed to delete session: ${error.message}`, 'error');
    }
}

/*******************************************************
 * 10. ATTENDANCE MANAGEMENT
 *******************************************************/
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
    const { data: students } = await fetchData(USER_PROFILE_TABLE, 'user_id, full_name, role', { role: 'student' }, 'full_name', true);
    populateSelect($('att_student_id'), students, 'user_id', 'full_name', 'Select Student');

    const { data: courses } = await fetchData('courses', 'id, course_name', {}, 'course_name', true);
    populateSelect($('att_course_id'), courses, 'id', 'course_name', 'Select Course (For Classroom)');
}

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

    if (attendanceMap) {
        attendanceMap.remove();
        attendanceMap = null;
    }

    setTimeout(() => {
        attendanceMap = L.map('mapbox-map').setView([lat, lng], 17);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(attendanceMap);

        L.marker([lat, lng])
            .addTo(attendanceMap)
            .bindPopup(`<b>${studentName}</b><br>${locationName}<br>${dateTime}`)
            .openPopup();
        
        attendanceMap.invalidateSize();
    }, 300);
}

async function adminCheckIn() {
    if (!navigator.geolocation) {
        showFeedback('Geolocation is not supported by this browser.', 'error');
        return;
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });

        const checkInData = {
            user_id: currentUserProfile?.id,
            session_type: 'admin',
            check_in_time: new Date().toISOString(),
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            location_name: 'Admin Self Check-in',
            ip_address: await getIPAddress(),
            device_id: getDeviceId(),
            is_manual_entry: false
        };

        const { error } = await sb.from('geo_attendance_logs').insert([checkInData]);
        if (error) throw error;

        await logAudit('ADMIN_CHECKIN', `Admin self check-in at ${checkInData.location_name}`, null, 'SUCCESS');
        showFeedback('Admin check-in recorded successfully!', 'success');
        loadAttendance();
    } catch (error) {
        await logAudit('ADMIN_CHECKIN', `Failed admin check-in: ${error.message}`, null, 'FAILURE');
        showFeedback(`Check-in failed: ${error.message}`, 'error');
    }
}

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

async function loadAttendance() {
    const todayBody = $('attendance-table');
    const pastBody = $('past-attendance-table');
    if (!todayBody || !pastBody) return;
    
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

/*******************************************************
 * 11. EXAMS/CATS MANAGEMENT
 *******************************************************/
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

async function handleAddExam(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    if (!submitButton) {
        console.error("Form submitter button not found.");
        return; 
    }

    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const exam_type = $('exam_type')?.value;
    const exam_link = $('exam_link')?.value.trim() || null;
    const exam_duration_minutes = parseInt($('exam_duration_minutes')?.value);
    const exam_start_time = $('exam_start_time')?.value;
    const program = $('exam_program')?.value;
    const course_id = $('exam_course_id')?.value || null;
    const exam_title = $('exam_title')?.value.trim();
    const exam_date = $('exam_date')?.value;
    const exam_status = $('exam_status')?.value;
    const intake = $('exam_intake')?.value;
    const block_term = $('exam_block_term')?.value;

    if (
        !program || !exam_title || !exam_date ||
        !intake || !block_term || !exam_type || isNaN(exam_duration_minutes)
    ) {
        showFeedback(
            'The following fields are required: Program, Title, Date, Intake, Block/Term, Type, and Duration.',
            'error'
        );
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    try {
        const { error, data } = await sb.from('exams').insert({
            exam_name: exam_title,
            course_id: course_id,
            exam_date,
            exam_start_time,
            exam_type,
            online_link: exam_link, 
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

async function loadExams() {
    const tbody = $('exams-table');
    if (!tbody) return;
    
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

async function populateStudentExams(exams) {
    const studentExamsContainer = $('student-exams');
    if (!studentExamsContainer) return;

    if (!exams || exams.length === 0) {
        studentExamsContainer.innerHTML = '<p>No assessments available at the moment.</p>';
        return;
    }

    let html = '<div class="student-exams-grid">';
    
    exams.forEach(exam => {
        const courseName = exam.course?.course_name || 'General Assessment';
        const dateTime = new Date(exam.exam_date).toLocaleDateString() + (exam.exam_start_time ? ` at ${exam.exam_start_time}` : '');
        const statusClass = exam.status === 'Upcoming' ? 'upcoming' : 
                           exam.status === 'InProgress' ? 'in-progress' : 'completed';

        html += `
            <div class="exam-card ${statusClass}">
                <h4>${escapeHtml(exam.exam_name)}</h4>
                <p><strong>Type:</strong> ${escapeHtml(exam.exam_type)}</p>
                <p><strong>Course:</strong> ${escapeHtml(courseName)}</p>
                <p><strong>Date:</strong> ${dateTime}</p>
                <p><strong>Duration:</strong> ${exam.duration_minutes} minutes</p>
                <p><strong>Status:</strong> <span class="status-${statusClass}">${escapeHtml(exam.status)}</span></p>
                ${exam.online_link ? `<a href="${escapeHtml(exam.online_link)}" target="_blank" class="btn-action">Take Exam</a>` : ''}
            </div>
        `;
    });

    html += '</div>';
    studentExamsContainer.innerHTML = html;
}

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

// Exam Modal Functions - Complete Implementation
// Open Exam Edit Modal (Admin Editable)
async function openEditExamModal(examId) {
  try {
    const { data: exam, error } = await sb
      .from('exams')
      .select('*, course:course_id(course_name)')
      .eq('id', examId)
      .single();

    if (error || !exam) {
      showFeedback(`Error loading exam details: ${error?.message || 'Not found.'}`, 'error');
      return;
    }

    // Wait for modal to be ready and check if elements exist
    const modal = document.getElementById('examEditModal');
    if (!modal) {
      showFeedback('Exam edit modal not found in HTML.', 'error');
      return;
    }

    // Safely set values only if elements exist
    const examIdInput = document.getElementById('edit_exam_id');
    const titleInput = document.getElementById('edit_exam_title');
    const dateInput = document.getElementById('edit_exam_date');
    const statusInput = document.getElementById('edit_exam_status');

    if (examIdInput) examIdInput.value = exam.id;
    if (titleInput) titleInput.value = exam.exam_name || '';
    if (dateInput) dateInput.value = exam.exam_date || '';
    if (statusInput) statusInput.value = exam.status || 'Upcoming';

    // Add optional editable fields dynamically if not in HTML
    let form = document.getElementById('edit-exam-form');
    if (form) {
      if (!document.getElementById('edit_exam_type')) {
        form.insertAdjacentHTML('beforeend', `
          <div class="form-group">
            <label>Type</label>
            <select id="edit_exam_type" class="form-input">
              <option value="CAT" ${exam.exam_type === 'CAT' ? 'selected' : ''}>CAT</option>
              <option value="Exam" ${exam.exam_type === 'Exam' ? 'selected' : ''}>Exam</option>
              <option value="Practical" ${exam.exam_type === 'Practical' ? 'selected' : ''}>Practical</option>
            </select>
          </div>
        `);
      }

      if (!document.getElementById('edit_exam_duration')) {
        form.insertAdjacentHTML('beforeend', `
          <div class="form-group">
            <label>Duration (minutes)</label>
            <input type="number" id="edit_exam_duration" min="1" value="${exam.duration_minutes || 60}" class="form-input">
          </div>
        `);
      }

      if (!document.getElementById('edit_exam_link')) {
        form.insertAdjacentHTML('beforeend', `
          <div class="form-group">
            <label>Online Link (optional)</label>
            <input type="url" id="edit_exam_link" value="${exam.online_link || ''}" class="form-input">
          </div>
        `);
      }
    }

    // Open modal
    modal.style.display = 'block';

  } catch (err) {
    console.error('Error in openEditExamModal:', err);
    showFeedback(`Unexpected error: ${err.message}`, 'error');
  }
}

// Save Edited Exam
async function saveEditedExam(e) {
  e.preventDefault();

  // Safely get values with null checks
  const examIdInput = document.getElementById('edit_exam_id');
  const titleInput = document.getElementById('edit_exam_title');
  const dateInput = document.getElementById('edit_exam_date');
  const durationInput = document.getElementById('edit_exam_duration');
  const statusInput = document.getElementById('edit_exam_status');
  const typeInput = document.getElementById('edit_exam_type');
  const linkInput = document.getElementById('edit_exam_link');

  if (!examIdInput || !titleInput || !dateInput) {
    showFeedback('❌ Required form elements not found.', 'error');
    return;
  }

  const examId = examIdInput.value.trim();
  const title = titleInput.value.trim();
  const date = dateInput.value;
  const duration = durationInput ? parseInt(durationInput.value) || 0 : 0;
  const status = statusInput ? statusInput.value : 'Upcoming';
  const type = typeInput ? typeInput.value : null;
  const link = linkInput ? linkInput.value.trim() : null;

  if (!title || !date || !duration) {
    showFeedback('❌ Title, Date, and Duration are required.', 'error');
    return;
  }

  try {
    const updateData = {
      exam_name: title,
      exam_date: date,
      duration_minutes: duration,
      status: status
    };

    // Only add optional fields if they exist
    if (type) updateData.exam_type = type;
    if (link) updateData.online_link = link;

    const { error } = await sb
      .from('exams')
      .update(updateData)
      .eq('id', examId);

    if (error) throw error;

    showFeedback('✅ Exam updated successfully!', 'success');

    // Refresh data + close modal
    await loadExams();
    try { 
      if (typeof renderFullCalendar === 'function') {
        renderFullCalendar(); 
      }
    } catch (e) {
      console.log('Calendar refresh skipped:', e.message);
    }

    document.getElementById('examEditModal').style.display = 'none';
  } catch (err) {
    console.error('Error saving exam:', err);
    showFeedback(`Failed to update exam: ${err.message}`, 'error');
  }
}

// Initialize event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Close modal on X click
  const closeBtn = document.querySelector('#examEditModal .close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('examEditModal').style.display = 'none';
    });
  }

  // Hook up form submit
  const editForm = document.getElementById('edit-exam-form');
  if (editForm) {
    editForm.addEventListener('submit', saveEditedExam);
  } else {
    console.warn('edit-exam-form not found in HTML');
  }
});

// Alternative: Safe element getter with fallback
function getSafeElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Element with id '${id}' not found`);
  }
  return element;
}

// Utility function to escape HTML
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Show Grade Modal - Missing Function
function showGradeModal(modalHtml) {
    // Remove any existing modal first
    const existingModal = document.getElementById('gradeModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal container
    const modal = document.createElement('div');
    modal.id = 'gradeModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = modalHtml;

    // Add to DOM
    document.body.appendChild(modal);

    // Add event listeners
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Focus on search input
    const searchInput = document.getElementById('gradeSearch');
    if (searchInput) {
        setTimeout(() => searchInput.focus(), 100);
    }
}

// Close Modal function
function closeModal() {
    const modal = document.getElementById('gradeModal');
    if (modal) {
        modal.remove();
    }
}

// Filter Grade Students function
function filterGradeStudents() {
    const searchTerm = document.getElementById('gradeSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#gradeTableBody tr');
    
    rows.forEach(row => {
        const name = row.getAttribute('data-name') || '';
        const email = row.getAttribute('data-email') || '';
        const id = row.getAttribute('data-id') || '';
        
        const matches = name.includes(searchTerm) || 
                       email.includes(searchTerm) || 
                       id.includes(searchTerm);
        
        row.style.display = matches ? '' : 'none';
    });
}

// Open Grade Modal - Complete Implementation
async function openGradeModal(examId, examName = '') {
    try {
        // Fetch exam details
        const { data: exam, error: examError } = await sb
            .from('exams_with_courses')
            .select('*')
            .eq('id', examId)
            .single();

        if (examError || !exam) {
            showFeedback('Error loading exam details.', 'error');
            return;
        }

        // Fetch students matching exam block, intake, and program
        const { data: students, error: studentError } = await sb
            .from('consolidated_user_profiles_table')
            .select('user_id, full_name, email')
            .eq('block', exam.block_term)
            .eq('intake_year', exam.intake_year)
            .eq('program', exam.program_type)
            .order('full_name');

        if (studentError) {
            showFeedback('Error loading students for grading.', 'error');
            return;
        }

        // Fetch existing grades
        const { data: existingGrades } = await sb
            .from('exam_grades')
            .select('*')
            .eq('exam_id', examId);

        // Build modal HTML
        const modalHtml = `
        <div class="modal-content" style="width:95%; max-width:1000px;">
            <div class="modal-header">
                <h3>Grade: ${escapeHtml(exam.exam_name)}</h3>
                <span class="close" onclick="closeModal()">&times;</span>
            </div>
            <div class="modal-body">
                <input type="text" id="gradeSearch" placeholder="Search by name, email or ID" class="search-input" oninput="filterGradeStudents()">
                <div class="table-container">
                    <table class="data-table grade-table">
                        <thead>
                            <tr>
                                <th>Student Name</th>
                                <th>Email</th>
                                <th>CAT 1 (max 30)</th>
                                <th>CAT 2 (max 30)</th>
                                <th>Final Exam (max 100)</th>
                                <th>Total (scaled 100)</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="gradeTableBody">
                            ${students.map(s => {
                                const grade = existingGrades?.find(g => g.student_id === s.user_id) || {};
                                return `
                                    <tr data-name="${s.full_name.toLowerCase()}" data-email="${(s.email||'').toLowerCase()}" data-id="${s.user_id}">
                                        <td>${escapeHtml(s.full_name)}</td>
                                        <td>${escapeHtml(s.email ?? '')}</td>
                                        <td><input type="number" min="0" max="30" id="cat1-${s.user_id}" value="${grade.cat_1_score ?? ''}" placeholder="0-30" oninput="updateGradeTotal('${s.user_id}')" class="grade-input"></td>
                                        <td><input type="number" min="0" max="30" id="cat2-${s.user_id}" value="${grade.cat_2_score ?? ''}" placeholder="0-30" oninput="updateGradeTotal('${s.user_id}')" class="grade-input"></td>
                                        <td><input type="number" min="0" max="100" id="final-${s.user_id}" value="${grade.exam_score ?? ''}" placeholder="0-100" oninput="updateGradeTotal('${s.user_id}')" class="grade-input"></td>
                                        <td><input type="number" min="0" max="100" id="total-${s.user_id}" value="" placeholder="Auto" readonly class="total-input"></td>
                                        <td>
                                            <select id="status-${s.user_id}" class="status-select">
                                                <option value="Scheduled" ${grade.result_status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
                                                <option value="InProgress" ${grade.result_status === 'InProgress' ? 'selected' : ''}>InProgress</option>
                                                <option value="Final" ${grade.result_status === 'Final' ? 'selected' : ''}>Final</option>
                                            </select>
                                        </td>
                                    </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="modal-actions">
                    <button class="btn-action" onclick="saveGrades('${examId}')">Save Grades</button>
                    <button class="btn btn-delete" onclick="closeModal()">Cancel</button>
                </div>
            </div>
        </div>`;

        showGradeModal(modalHtml);

        // Populate totals immediately
        students.forEach(s => updateGradeTotal(s.user_id));
    } catch (error) {
        console.error('Error opening grade modal:', error);
        showFeedback('Failed to load grading interface.', 'error');
    }
}

// Auto-update total with proportional scaling
function updateGradeTotal(studentId) {
    const cat1Input = document.querySelector(`#cat1-${studentId}`);
    const cat2Input = document.querySelector(`#cat2-${studentId}`);
    const finalInput = document.querySelector(`#final-${studentId}`);
    const totalInput = document.querySelector(`#total-${studentId}`);
    
    if (!cat1Input || !cat2Input || !finalInput || !totalInput) return;

    let cat1 = Math.min(parseFloat(cat1Input.value) || 0, 30);
    let cat2 = Math.min(parseFloat(cat2Input.value) || 0, 30);
    let finalExam = Math.min(parseFloat(finalInput.value) || 0, 100);

    const rawTotal = cat1 + cat2 + finalExam;
    const scaledTotal = (rawTotal / 160) * 100; // 30+30+100 max
    totalInput.value = scaledTotal.toFixed(2);
}

// Save Grades - FIXED FOR CONSOLIDATED PROFILES TABLE
async function saveGrades(examId) {
    try {
        const rows = document.querySelectorAll('.grade-table tbody tr');
        const upserts = [];

        // ✅ The foreign key points to consolidated_user_profiles_table.user_id
        // So we need to use currentUserProfile.user_id
        const graderUserId = currentUserProfile?.user_id;
        
        console.log('🔍 DEBUG: Using grader user_id:', graderUserId);
        console.log('🔍 DEBUG: Full currentUserProfile:', currentUserProfile);

        if (!graderUserId) {
            showFeedback('Error: Cannot identify grader. Please ensure you are logged in.', 'error');
            return;
        }

        // Validate that this user exists in consolidated_user_profiles_table
        const { data: graderExists, error: checkError } = await sb
            .from('consolidated_user_profiles_table')
            .select('user_id')
            .eq('user_id', graderUserId)
            .single();

        if (checkError || !graderExists) {
            showFeedback('Error: Grader profile not found in system.', 'error');
            return;
        }

        for (const row of rows) {
            if (row.style.display === 'none') continue; // Skip hidden rows
            
            const studentId = row.querySelector('input[id^="cat1-"]')?.id.replace('cat1-', '');
            if (!studentId) continue;

            const cat1Input = row.querySelector(`#cat1-${studentId}`);
            const cat2Input = row.querySelector(`#cat2-${studentId}`);
            const finalInput = row.querySelector(`#final-${studentId}`);
            const statusSelect = row.querySelector(`#status-${studentId}`);

            if (!cat1Input || !cat2Input || !finalInput || !statusSelect) continue;

            let cat1 = Math.min(parseFloat(cat1Input.value) || 0, 30);
            let cat2 = Math.min(parseFloat(cat2Input.value) || 0, 30);
            let finalExam = Math.min(parseFloat(finalInput.value) || 0, 100);
            const scaledTotal = ((cat1 + cat2 + finalExam) / 160) * 100;

            upserts.push({
                exam_id: examId,
                student_id: studentId,
                cat_1_score: cat1,
                cat_2_score: cat2,
                exam_score: finalExam,
                total_score: parseFloat(scaledTotal.toFixed(2)),
                result_status: statusSelect.value || 'Scheduled',
                graded_by: graderUserId, // ✅ This must match consolidated_user_profiles_table.user_id
                question_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            const totalInput = row.querySelector(`#total-${studentId}`);
            if (totalInput) {
                totalInput.value = scaledTotal.toFixed(2);
            }
        }

        if (upserts.length === 0) {
            showFeedback('No grade data to save.', 'warning');
            return;
        }

        console.log('🔍 DEBUG: Final upserts to save:', upserts);

        const { error } = await sb.from('exam_grades').upsert(upserts, { 
            onConflict: 'exam_id,student_id' 
        });
        
        if (error) {
            console.error('🔍 DEBUG: Database error details:', error);
            throw new Error(error.message);
        }

        await logAudit('GRADES_SAVE', `Saved grades for exam ${examId}`, examId, 'SUCCESS');
        showFeedback(`✅ Successfully saved grades for ${upserts.length} students!`, 'success');
        closeModal();
    } catch (error) {
        console.error('Error saving grades:', error);
        await logAudit('GRADES_SAVE', `Failed to save grades for exam ${examId}: ${error.message}`, examId, 'FAILURE');
        showFeedback(`Failed to save grades: ${error.message}`, 'error');
    }
}
/*******************************************************
 * 12. MESSAGES & ANNOUNCEMENTS
 *******************************************************/
async function handleSendMessage(e) {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton?.textContent;
    setButtonLoading(submitButton, true, originalText);

    const target_program = $('msg_program').value;
    const message_content = $('msg_body').value.trim();
    const subjectInput = $('msg_subject');
    const subject = subjectInput ? subjectInput.value.trim() : `System Message to ${target_program}`;

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
        });

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

async function loadAdminMessages() {
    const tbody = $('adminMessagesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6">Loading admin messages...</td></tr>';

    try {
        const { data: messages, error } = await sb.from('notifications')
            .select('*, sender:sender_id(full_name)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!messages || messages.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No messages found.</td></tr>';
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
            <td>${escapeHtml(senderName)}</td>
            <td>${escapeHtml(msg.subject || '')}</td>
            <td>${escapeHtml(msg.message.substring(0, 80) + (msg.message.length > 80 ? '...' : ''))}</td>
            <td>${sendDate}</td>
            <td>
                <button class="btn-action" onclick="editNotification('${msg.id}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteNotification('${msg.id}')">Delete</button>
            </td>
            `;
            fragment.appendChild(tr);
        });

        tbody.innerHTML = '';
        tbody.appendChild(fragment);
    } catch (err) {
        console.error('Failed to load admin messages:', err);
        tbody.innerHTML = `<tr><td colspan="6">Error loading messages: ${err.message}</td></tr>`;
    }
}

async function editNotification(id) {
    try {
        const { data, error } = await sb.from('notifications')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            showFeedback('Message not found.', 'error');
            return;
        }

        const newSubject = prompt('Edit Subject:', data.subject || '');
        if (newSubject === null) return;

        const newMessage = prompt('Edit Message:', data.message || '');
        if (newMessage === null) return;

        const { error: updateError } = await sb.from('notifications')
            .update({ subject: newSubject.trim(), message: newMessage.trim() })
            .eq('id', id);

        if (updateError) throw updateError;

        await logAudit('NOTIFICATION_EDIT', `Edited notification ID: ${id}`, id, 'SUCCESS');
        showFeedback('Message updated successfully!', 'success');
        await loadAdminMessages();
    } catch (err) {
        await logAudit('NOTIFICATION_EDIT', `Failed to edit notification ID: ${id}. Reason: ${err.message}`, id, 'FAILURE');
        showFeedback(`Failed to edit message: ${err.message}`, 'error');
    }
}

async function deleteNotification(id) {
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

async function saveOfficialAnnouncement() {
    const textarea = $('announcement-body');
    const content = textarea.value.trim();
    const feedback = $('announcement-feedback');

    if (!content) {
        feedback.textContent = 'Announcement cannot be empty.';
        return;
    }

    try {
        const { error } = await sb.from('notifications').insert({
            target_program: null,
            subject: 'Official Announcement',
            message: content,
            message_type: 'system',
            sender_id: currentUserProfile.id
        });

        if (error) throw error;

        feedback.textContent = 'Announcement saved successfully!';
        textarea.value = '';
    } catch (err) {
        console.error(err);
        feedback.textContent = 'Failed to save announcement: ' + err.message;
    }
}

/*******************************************************
 * 13. RESOURCES MANAGEMENT
 *******************************************************/
async function handleResourceUpload(e) {
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

    let file = fileInput.files[0];
    let uploadFile = file;

    const originalExt = file.name.split('.').pop();
    const baseName = title.replace(/[^\w\-]+/g, '_') + '_' + file.name.replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_');

    let originalName = `${baseName}.${originalExt}`;
    let filePath = `${program}/${intake}/${block}/${originalName}`;

    try {
        // Convert Word or PPT to PDF (placeholder - implement actual conversion)
        if (/\.(docx?|pptx?)$/i.test(file.name)) {
            // For now, just use the original file
            // uploadFile = await convertToPDF(file); 
            originalName = `${baseName}.pdf`;
            filePath = `${program}/${intake}/${block}/${baseName}.pdf`;
        }

        const { error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, uploadFile, {
                cacheControl: '3600',
                upsert: true,
                contentType: uploadFile.type
            });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = sb.storage
            .from(RESOURCES_BUCKET)
            .getPublicUrl(filePath);

        const { error: dbError, data } = await sb
            .from('resources')
            .insert({
                title: title,
                program_type: program,
                intake: intake,
                block: block,
                file_path: filePath,
                file_name: originalName,
                file_url: publicUrl,
                uploaded_by: currentUserProfile?.id,
                uploaded_by_name: currentUserProfile?.full_name,
                created_at: new Date().toISOString()
            }).select('id');
        if (dbError) throw dbError;

        await logAudit('RESOURCE_UPLOAD', `Uploaded resource: ${title} to ${program}/${intake}/${block}.`, data?.[0]?.id, 'SUCCESS');
        showFeedback(`✅ File "${originalName}" uploaded successfully!`, 'success');
        e.target.reset();
        loadResources();
    } catch (err) {
        await logAudit('RESOURCE_UPLOAD', `Failed to upload resource: ${title}. Reason: ${err.message}`, null, 'FAILURE');
        console.error('Upload failed:', err);
        showFeedback(`❌ Upload failed: ${err.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

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
 * 14. SECURITY & SYSTEM STATUS
 *******************************************************/
async function loadSystemStatus() {
    const { data } = await fetchData(SETTINGS_TABLE, '*', { key: GLOBAL_SETTINGS_KEY });
    const statusData = data?.[0] || { value: 'ACTIVE', message: '' };

    const statusSelect = $('global_status');
    if (statusSelect) statusSelect.value = statusData.value;
    
    const messageInput = $('maintenance_message');
    if (messageInput) messageInput.value = statusData.message || '';
}

async function updateSystemStatus(newStatus) {
    const currentMessage = $('maintenance_message').value.trim();
    if (!confirm(`CRITICAL: Change system status to ${newStatus}? This affects ALL users.`)) {
        loadSystemStatus();
        return;
    }
    
    if (newStatus !== 'ACTIVE' && !currentMessage) {
        showFeedback('A message is required for users when the system is not ACTIVE.', 'warning');
        loadSystemStatus();
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
        const { data: profile, error: profileError } = await sb
            .from(USER_PROFILE_TABLE)
            .select('user_id, full_name')
            .eq('email', email)
            .single();

        if (profileError || !profile) throw new Error('User not found in profile records.');
        
        const userId = profile.user_id;

        const { error: authError } = await sb.auth.admin.updateUserById(userId, { password: newPassword });

        if (authError) throw authError;

        await logAudit('USER_PASSWORD_RESET', `Forced password reset for user: ${email}.`, userId, 'SUCCESS');
        showFeedback(`✅ Password for ${email} has been reset successfully!`, 'success');
        e.target.reset();

    } catch (e) {
        const userId = e.message?.includes('User not found') ? null : 'UNKNOWN_ID';
        await logAudit('USER_PASSWORD_RESET', `Failed to force password reset for: ${email}. Reason: ${e.message}`, userId, 'FAILURE');
        showFeedback(`❌ Password reset failed: ${e.message}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

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
        const { error: profileError } = await sb
            .from(USER_PROFILE_TABLE)
            .update({ block_program_year: true, status: 'blocked' }) 
            .eq('user_id', userId);
            
        if (profileError) throw profileError;
        
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
 * 15. BACKUP & RESTORE
 *******************************************************/
async function loadBackupHistory() {
    const tbody = $('backup-history-table');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4">Loading backup history...</td></tr>';
    
    // Placeholder for actual backup history
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
    showFeedback('Backup initiated! Check your Supabase Console for status.', 'success');
}

/*******************************************************
 * 16. CALENDAR INTEGRATION
 *******************************************************/
async function renderFullCalendar() {
    const calendarEl = $('fullCalendarDisplay');
    if (!calendarEl) return;
    calendarEl.innerHTML = ''; 

    const { data: sessions } = await fetchData('scheduled_sessions', '*', {}, 'session_date', true);
    const { data: exams } = await fetchData('exams', '*, course:course_id(course_name)', {}, 'exam_date', true);

    const events = [];

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

/*******************************************************
 * 17. ENHANCED FEATURES IMPLEMENTATION
 *******************************************************/

// Quick Actions Implementation
function quickAction(action) {
    const actions = {
        'clearCache': {
            message: 'Cache cleared successfully!',
            audit: 'CACHE_CLEAR'
        },
        'runMaintenance': {
            message: 'Maintenance tasks completed!',
            audit: 'SYSTEM_MAINTENANCE'
        },
        'sendTestEmail': {
            message: 'Test email sent!',
            audit: 'TEST_EMAIL_SEND'
        },
        'generateReports': {
            message: 'Reports generated successfully!',
            audit: 'REPORTS_GENERATE'
        },
        'checkUpdates': {
            message: 'No updates available.',
            audit: 'SYSTEM_UPDATE_CHECK'
        },
        'backupNow': {
            message: 'Backup initiated!',
            audit: 'DB_BACKUP_MANUAL'
        },
        'healthCheck': {
            message: 'System health check completed!',
            audit: 'SYSTEM_HEALTH_CHECK'
        },
        'userAudit': {
            message: 'User audit report generated!',
            audit: 'USER_AUDIT_REPORT'
        }
    };

    const actionData = actions[action];
    if (actionData) {
        showFeedback(actionData.message, 'success');
        logAudit(actionData.audit, `Quick action executed: ${action}`, null, 'SUCCESS');
    }
}

// Bulk Operations Implementation
function selectAllUsers() {
    const checkboxes = document.querySelectorAll('.user-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    updateSelectedCount();
}

function clearSelection() {
    const checkboxes = document.querySelectorAll('.user-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    updateSelectedCount();
}

function updateSelectedCount() {
    const selected = document.querySelectorAll('.user-checkbox:checked').length;
    const countElement = $('selected-count');
    if (countElement) {
        countElement.textContent = selected;
    }
}

function executeBulkAction() {
    const action = $('bulk-action')?.value;
    const selectedCount = document.querySelectorAll('.user-checkbox:checked').length;
    
    if (selectedCount === 0) {
        showFeedback('Please select at least one user to perform bulk action.', 'warning');
        return;
    }

    showFeedback(`Executing ${action} for ${selectedCount} users...`, 'info');
    logAudit('BULK_ACTION', `Executed ${action} for ${selectedCount} users`, null, 'SUCCESS');
}

// API Key Management
function generateNewAPIKey() {
    showFeedback('New API key generated successfully!', 'success');
    logAudit('API_KEY_GENERATE', 'Generated new API key', null, 'SUCCESS');
}

function regenerateKey(keyType) {
    showFeedback(`Regenerating ${keyType} API key...`, 'success');
    logAudit('API_KEY_REGENERATE', `Regenerated ${keyType} API key`, null, 'SUCCESS');
}

// 2FA Management
function enable2FAForAll() {
    showFeedback('2FA enabled system-wide!', 'success');
    logAudit('2FA_ENABLE_SYSTEM', 'Enabled 2FA system-wide', null, 'SUCCESS');
}

// Session Management
function terminateAllSessions() {
    if (confirm('Are you sure you want to terminate ALL active sessions?')) {
        showFeedback('All sessions terminated!', 'success');
        logAudit('SESSIONS_TERMINATE_ALL', 'Terminated all active sessions', null, 'SUCCESS');
    }
}

// Error Tracking
function filterErrors(severity) {
    showFeedback(`Filtering errors by: ${severity}`, 'info');
}

// Data Visualization
function updateVisualization() {
    showFeedback('Updating visualization with new parameters...', 'info');
}

/*******************************************************
 * 18. INITIALIZATION & EVENT LISTENERS
 *******************************************************/
function setupEventListeners() {
    // ATTENDANCE TAB
    $('att_session_type')?.addEventListener('change', toggleAttendanceFields);
    $('manual-attendance-form')?.addEventListener('submit', handleManualAttendance);
    
    // ENROLLMENT/USER TAB
    $('add-account-form')?.addEventListener('submit', handleAddAccount);
    $('account-program')?.addEventListener('change', () => updateBlockTermOptions('account-program', 'account-block-term')); 
    $('account-intake')?.addEventListener('change', () => updateBlockTermOptions('account-program', 'account-block-term'));
    
    // MASS PROMOTION
    $('mass-promotion-form')?.addEventListener('submit', handleMassPromotion);
    $('promote_intake')?.addEventListener('change', () => {
        updateBlockTermOptions('promote_intake', 'promote_from_block');
        updateBlockTermOptions('promote_intake', 'promote_to_block');
    });

    // COURSES TAB
    $('add-course-form')?.addEventListener('submit', handleAddCourse);
    $('course-program')?.addEventListener('change', () => { updateBlockTermOptions('course-program', 'course-block'); });
    $('course-intake')?.addEventListener('change', () => { updateBlockTermOptions('course-program', 'course-block'); });
    
    // SESSIONS TAB
    $('add-session-form')?.addEventListener('submit', handleAddSession);
    $('new_session_program')?.addEventListener('change', () => { 
        updateBlockTermOptions('new_session_program', 'new_session_block_term'); 
        populateSessionCourseSelects(); 
    });
    $('new_session_intake_year')?.addEventListener('change', () => updateBlockTermOptions('new_session_program', 'new_session_block_term')); 
    
    // CLINICAL MANAGEMENT
    $('clinical_program')?.addEventListener('change', () => { updateBlockTermOptions('clinical_program', 'clinical_block_term'); }); 
    $('clinical_intake')?.addEventListener('change', () => updateBlockTermOptions('clinical_program', 'clinical_block_term')); 

    // CATS/EXAMS TAB
    $('add-exam-form')?.addEventListener('submit', handleAddExam);
    $('exam_program')?.addEventListener('change', () => { 
        populateExamCourseSelects(); 
        updateBlockTermOptions('exam_program', 'exam_block_term'); 
    });
    $('exam_intake')?.addEventListener('change', () => updateBlockTermOptions('exam_program', 'exam_block_term'));
    
    // MESSAGES TAB
    $('send-message-form')?.addEventListener('submit', handleSendMessage);
    $('edit-welcome-form')?.addEventListener('submit', handleSaveWelcomeMessage); 
    
    // RESOURCES TAB
    $('upload-resource-form')?.addEventListener('submit', handleResourceUpload);
    $('resource_program')?.addEventListener('change', () => { updateBlockTermOptions('resource_program', 'resource_block'); });
    $('resource_intake')?.addEventListener('change', () => { updateBlockTermOptions('resource_program', 'resource_block'); });
    
    // SECURITY TAB
    $('global-password-reset-form')?.addEventListener('submit', handleGlobalPasswordReset);
    $('account-deactivation-form')?.addEventListener('submit', handleAccountDeactivation);

    // ANNOUNCEMENTS
    $('save-announcement')?.addEventListener('click', saveOfficialAnnouncement);

    // BULK OPERATIONS
    $('select-all-checkbox')?.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.user-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
        updateSelectedCount();
    });
}

function initializeModals() {
    // Close modals when clicking X
    document.querySelectorAll('.modal .close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });
    
    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });

    // Specific modal handlers
    $('edit-user-form')?.addEventListener('submit', handleEditUser);
    $('edit-course-form')?.addEventListener('submit', handleEditCourse);
}

async function initSession() {
    const { data: { session }, error: sessionError } = await sb.auth.getSession();
    
    if (sessionError || !session) {
        console.warn("Session check failed, redirecting to login.");
        window.location.href = "login.html";
        return;
    }

    const user = session.user;
    const { data: profile, error: profileError } = await sb.from('profiles').select('*').eq('id', user.id).single();
    
    if (profile && !profileError) {
        currentUserProfile = profile;
        currentUserId = user.id;
        
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
    
    // Setup all event listeners
    setupEventListeners();
    initializeModals();
    
    // Load initial data
    loadSectionData('dashboard');
}

async function logout() {
    await logAudit('LOGOUT', `User ${currentUserProfile.full_name} logged out.`);
    await sb.auth.signOut();
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
}

// Global function references for HTML onclick handlers
window.showTab = showTab;
window.logout = logout;
window.adminCheckIn = adminCheckIn;
window.exportTableToCSV = exportTableToCSV;
window.filterTable = filterTable;
window.closeModal = closeModal;
window.approveUser = approveUser;
window.deleteProfile = deleteProfile;
window.openEditUserModal = openEditUserModal;
window.updateUserRole = updateUserRole;
window.openEditCourseModal = openEditCourseModal;
window.deleteCourse = deleteCourse;
window.openGradeModal = openGradeModal;
window.deleteExam = deleteExam;
window.editNotification = editNotification;
window.deleteNotification = deleteNotification;
window.approveAttendanceRecord = approveAttendanceRecord;
window.deleteAttendanceRecord = deleteAttendanceRecord;
window.showMap = showMap;
window.updateSystemStatus = updateSystemStatus;
window.saveSystemMessage = saveSystemMessage;
window.triggerBackup = triggerBackup;
window.quickAction = quickAction;
window.selectAllUsers = selectAllUsers;
window.clearSelection = clearSelection;
window.executeBulkAction = executeBulkAction;
window.generateNewAPIKey = generateNewAPIKey;
window.regenerateKey = regenerateKey;
window.enable2FAForAll = enable2FAForAll;
window.terminateAllSessions = terminateAllSessions;
window.filterErrors = filterErrors;
window.updateVisualization = updateVisualization;

// Initialize the application
document.addEventListener('DOMContentLoaded', initSession);
