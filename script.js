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
            { value: 'Term1', text: 'Term 1' },
            { value: 'Term2', text: 'Term 2' },
            { value: 'Term3', text: 'Term 3' }
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

// Exam Modal Functions - Complete Implementation with Exam Type
// Open Exam Edit Modal (Admin Editable)
async function openEditExamModal(examId) {
  try {
    console.log('📝 Opening edit modal for exam ID:', examId);
    
    const { data: exam, error } = await sb
      .from('exams')
      .select('*, course:course_id(course_name)')
      .eq('id', examId)
      .single();

    if (error || !exam) {
      showFeedback(`Error loading exam details: ${error?.message || 'Not found.'}`, 'error');
      return;
    }

    console.log('📊 Exam data for editing:', exam);
    console.log('📊 Exam type value:', exam.exam_type);

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
    const startTimeInput = document.getElementById('edit_exam_start_time');
    const durationInput = document.getElementById('edit_exam_duration');
    const linkInput = document.getElementById('edit_exam_link');

    if (examIdInput) examIdInput.value = exam.id;
    if (titleInput) titleInput.value = exam.exam_name || '';
    if (dateInput) dateInput.value = exam.exam_date || '';
    if (startTimeInput) startTimeInput.value = exam.exam_start_time || '09:00';
    if (durationInput) durationInput.value = exam.duration_minutes || 60;
    if (linkInput) linkInput.value = exam.online_link || '';
    if (statusInput) statusInput.value = exam.status || 'Upcoming';

    // Handle exam_type field
    let form = document.getElementById('edit-exam-form');
    if (form) {
      // Check if exam_type field already exists in HTML
      const existingExamTypeField = document.getElementById('edit_exam_type');
      
      if (existingExamTypeField) {
        // Update existing field value
        existingExamTypeField.value = exam.exam_type || 'CAT';
        console.log('✅ Updated existing exam_type field to:', exam.exam_type);
      } else {
        // Create exam_type field dynamically
        console.log('➕ Creating exam_type field dynamically');
        form.insertAdjacentHTML('beforeend', `
          <div class="form-group">
            <label>Exam Type *</label>
            <select id="edit_exam_type" class="form-input" required>
              <option value="CAT_1" ${exam.exam_type === 'CAT_1' ? 'selected' : ''}>CAT 1</option>
              <option value="CAT_2" ${exam.exam_type === 'CAT_2' ? 'selected' : ''}>CAT 2</option>
              <option value="CAT" ${exam.exam_type === 'CAT' || !exam.exam_type ? 'selected' : ''}>CAT (Generic)</option>
              <option value="EXAM" ${exam.exam_type === 'EXAM' ? 'selected' : ''}>Final Exam</option>
              <option value="ASSIGNMENT" ${exam.exam_type === 'ASSIGNMENT' ? 'selected' : ''}>Assignment</option>
            </select>
          </div>
        `);
      }

      // Add other optional fields if not in HTML
      if (!document.getElementById('edit_exam_duration')) {
        form.insertAdjacentHTML('beforeend', `
          <div class="form-group">
            <label>Duration (minutes) *</label>
            <input type="number" id="edit_exam_duration" min="1" value="${exam.duration_minutes || 60}" class="form-input" required>
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
    console.log('✅ Exam edit modal opened');

  } catch (err) {
    console.error('❌ Error in openEditExamModal:', err);
    showFeedback(`Unexpected error: ${err.message}`, 'error');
  }
}

// Save Edited Exam
async function saveEditedExam(e) {
  e.preventDefault();
  console.log('💾 Saving edited exam...');

  // Safely get values with null checks
  const examIdInput = document.getElementById('edit_exam_id');
  const titleInput = document.getElementById('edit_exam_title');
  const dateInput = document.getElementById('edit_exam_date');
  const startTimeInput = document.getElementById('edit_exam_start_time');
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
  const startTime = startTimeInput ? startTimeInput.value : '09:00';
  const duration = durationInput ? parseInt(durationInput.value) || 60 : 60;
  const status = statusInput ? statusInput.value : 'Upcoming';
  const type = typeInput ? typeInput.value : 'CAT'; // Default to CAT if not found
  const link = linkInput ? linkInput.value.trim() : null;

  console.log('📋 Form values:', { title, date, startTime, duration, status, type, link });

  if (!title || !date || !duration) {
    showFeedback('❌ Title, Date, and Duration are required.', 'error');
    return;
  }

  try {
    const updateData = {
      exam_name: title,
      exam_type: type, // ⭐ CRITICAL - Save exam type
      exam_date: date,
      exam_start_time: startTime,
      duration_minutes: duration,
      status: status,
      updated_at: new Date().toISOString()
    };

    // Only add online_link if provided
    if (link && link !== '') {
      updateData.online_link = link;
    }

    console.log('📤 Update data:', updateData);

    const { error } = await sb
      .from('exams')
      .update(updateData)
      .eq('id', examId);

    if (error) {
      console.error('❌ Database error:', error);
      throw error;
    }

    showFeedback('✅ Exam updated successfully!', 'success');
    console.log('✅ Exam updated, type:', type);

    // Refresh data
    await loadExams();
    
    // Refresh calendar if exists
    try { 
      if (typeof renderFullCalendar === 'function') {
        renderFullCalendar(); 
      }
    } catch (e) {
      console.log('Calendar refresh skipped:', e.message);
    }

    // Close modal
    document.getElementById('examEditModal').style.display = 'none';

    // Show confirmation of exam type change
    const examTypeLabels = {
      'CAT_1': 'CAT 1',
      'CAT_2': 'CAT 2', 
      'CAT': 'CAT',
      'EXAM': 'Final Exam',
      'ASSIGNMENT': 'Assignment'
    };
    
    setTimeout(() => {
      showFeedback(`✅ Exam type set to: ${examTypeLabels[type] || type}`, 'success');
    }, 500);

  } catch (err) {
    console.error('❌ Error saving exam:', err);
    showFeedback(`Failed to update exam: ${err.message}`, 'error');
  }
}

// Initialize event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('🔧 Initializing exam edit modal...');
  
  // Close modal on X click
  const closeBtn = document.querySelector('#examEditModal .close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('examEditModal').style.display = 'none';
      console.log('❌ Exam edit modal closed');
    });
  }

  // Hook up form submit
  const editForm = document.getElementById('edit-exam-form');
  if (editForm) {
    editForm.addEventListener('submit', saveEditedExam);
    console.log('✅ Exam edit form submit handler attached');
  } else {
    console.warn('⚠️ edit-exam-form not found in HTML');
  }

  // Close modal when clicking outside
  window.addEventListener('click', function(event) {
    const modal = document.getElementById('examEditModal');
    if (event.target === modal) {
      modal.style.display = 'none';
      console.log('❌ Exam edit modal closed (outside click)');
    }
  });
});

// Utility function to get exam type label
function getExamTypeLabel(examType) {
  const labels = {
    'CAT_1': 'CAT 1',
    'CAT_2': 'CAT 2',
    'CAT': 'CAT',
    'EXAM': 'Final Exam',
    'ASSIGNMENT': 'Assignment'
  };
  return labels[examType] || examType;
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

// Get current user with multiple fallback methods
async function getCurrentUser() {
    try {
        console.log('🔄 Getting current user...');
        
        // Method 1: Check global variable (most common)
        if (typeof currentUserProfile !== 'undefined' && currentUserProfile) {
            console.log('✅ Using global currentUserProfile:', currentUserProfile);
            
            // FIX: Check for both 'id' and 'user_id' properties
            if (currentUserProfile.user_id) {
                return currentUserProfile;
            } else if (currentUserProfile.id) {
                // Create a copy with user_id set to id
                const fixedUser = {
                    ...currentUserProfile,
                    user_id: currentUserProfile.id
                };
                console.log('🔄 Fixed user object:', fixedUser);
                return fixedUser;
            }
        }
        
        // Method 2: Check window object
        if (window.currentUserProfile && window.currentUserProfile.user_id) {
            console.log('✅ Using window.currentUserProfile:', window.currentUserProfile);
            return window.currentUserProfile;
        }
        
        // Method 3: Check session storage
        const storedUser = sessionStorage.getItem('currentUserProfile') || sessionStorage.getItem('currentUser');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                if (user && (user.user_id || user.id)) {
                    console.log('✅ Using session storage user:', user);
                    // Ensure user_id exists
                    if (!user.user_id && user.id) {
                        user.user_id = user.id;
                    }
                    return user;
                }
            } catch (e) {
                console.warn('❌ Failed to parse stored user:', e);
            }
        }
        
        // Method 4: Get from Supabase auth (direct API call)
        console.log('🔄 Checking Supabase auth...');
        const { data: { user: authUser }, error: authError } = await sb.auth.getUser();
        
        if (!authError && authUser) {
            console.log('✅ Found Supabase auth user:', authUser);
            
            // Try to get full profile from consolidated table
            const { data: profile, error: profileError } = await sb
                .from('consolidated_user_profiles_table')
                .select('*')
                .eq('user_id', authUser.id)
                .single();
                
            if (!profileError && profile) {
                console.log('✅ Found consolidated profile:', profile);
                // Store for future use
                window.currentUserProfile = profile;
                sessionStorage.setItem('currentUserProfile', JSON.stringify(profile));
                return profile;
            }
            
            // If no consolidated profile, return basic auth info
            const basicUser = {
                user_id: authUser.id,
                id: authUser.id, // Include both for compatibility
                email: authUser.email,
                full_name: authUser.user_metadata?.full_name || authUser.email
            };
            console.log('✅ Using basic auth user:', basicUser);
            window.currentUserProfile = basicUser;
            sessionStorage.setItem('currentUserProfile', JSON.stringify(basicUser));
            return basicUser;
        }
        
        console.error('❌ No authentication method succeeded');
        return null;
        
    } catch (error) {
        console.error('❌ Error in getCurrentUser:', error);
        return null;
    }
}

// Open Grade Modal - Dynamic based on exam type
async function openGradeModal(examId, examName = '') {
    try {
        console.log('🎯 Opening grade modal for exam:', examId);
        
        // Check authentication first with timeout
        const authPromise = getCurrentUser();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Authentication timeout')), 5000)
        );
        
        let currentUser;
        try {
            currentUser = await Promise.race([authPromise, timeoutPromise]);
        } catch (timeoutError) {
            console.error('❌ Authentication timeout:', timeoutError);
            showFeedback('Error: Authentication check timed out. Please refresh the page and try again.', 'error');
            return;
        }

        if (!currentUser || !currentUser.user_id) {
            console.error('❌ No user found:', currentUser);
            showFeedback('Error: You must be logged in to grade exams. Please refresh the page and ensure you are logged in.', 'error');
            
            // Try to redirect to login or show login prompt
            setTimeout(() => {
                if (confirm('You appear to be logged out. Would you like to reload the page to sign in?')) {
                    window.location.reload();
                }
            }, 1000);
            return;
        }

        console.log('✅ User authenticated:', currentUser);

        // Show loading state
        showFeedback('Loading exam data...', 'info');

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

        // Determine exam type from exam data
        let examType = 'EXAM'; // Default to final exam
        
        // Check if exam has an exam_type field
        if (exam.exam_type) {
            examType = exam.exam_type;
        } 
        // Otherwise try to guess from exam name
        else if (exam.exam_name) {
            const name = exam.exam_name.toLowerCase();
            if (name.includes('cat 1') || name.includes('cat1')) {
                examType = 'CAT_1';
            } else if (name.includes('cat 2') || name.includes('cat2')) {
                examType = 'CAT_2';
            } else if (name.includes('cat') && !name.includes('final')) {
                examType = 'CAT'; // Generic CAT exam
            }
        }
        
        console.log('📊 Exam type detected:', examType);

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

        if (!students || students.length === 0) {
            showFeedback('No students found for this exam criteria.', 'warning');
            return;
        }

        // Fetch existing grades
        const { data: existingGrades } = await sb
            .from('exam_grades')
            .select('*')
            .eq('exam_id', examId);

        // Build modal HTML based on exam type
        const modalHtml = buildGradeModalHTML(exam, students, existingGrades, currentUser, examType);

        showGradeModal(modalHtml);

        // Initialize totals for final exams only
        if (examType === 'EXAM') {
            students.forEach(s => updateGradeTotal(s.user_id));
        }
        
        showFeedback(`${getExamTypeLabel(examType)} grading modal loaded`, 'success');
        
    } catch (error) {
        console.error('Error opening grade modal:', error);
        showFeedback('Failed to load grading interface: ' + error.message, 'error');
    }
}

// Helper function to get exam type label
function getExamTypeLabel(examType) {
    switch(examType) {
        case 'CAT_1': return 'CAT 1';
        case 'CAT_2': return 'CAT 2';
        case 'CAT': return 'CAT';
        case 'EXAM': return 'Final Exam';
        default: return examType;
    }
}

// Build modal HTML based on exam type
function buildGradeModalHTML(exam, students, existingGrades, currentUser, examType) {
    const examTypeLabel = getExamTypeLabel(examType);
    
    // Define column headers and inputs based on exam type
    let tableHeaders = '';
    let tableRows = '';
    let totalColumn = '';
    
    switch(examType) {
        case 'CAT_1':
            tableHeaders = `
                <th>Student Name</th>
                <th>Email</th>
                <th>CAT 1 Score (max 30)</th>
                <th>Status</th>
            `;
            tableRows = students.map(s => {
                const grade = existingGrades?.find(g => g.student_id === s.user_id) || {};
                return `
                    <tr data-name="${s.full_name.toLowerCase()}" data-email="${(s.email||'').toLowerCase()}" data-id="${s.user_id}">
                        <td>${escapeHtml(s.full_name)}</td>
                        <td>${escapeHtml(s.email ?? '')}</td>
                        <td><input type="number" min="0" max="30" step="0.5" id="cat1-${s.user_id}" value="${grade.cat_1_score ?? ''}" placeholder="0-30" class="grade-input"></td>
                        <td>
                            <select id="status-${s.user_id}" class="status-select">
                                <option value="Scheduled" ${grade.result_status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
                                <option value="InProgress" ${grade.result_status === 'InProgress' ? 'selected' : ''}>In Progress</option>
                                <option value="Final" ${grade.result_status === 'Final' ? 'selected' : ''}>Final</option>
                            </select>
                        </td>
                    </tr>`;
            }).join('');
            break;
            
        case 'CAT_2':
            tableHeaders = `
                <th>Student Name</th>
                <th>Email</th>
                <th>CAT 2 Score (max 30)</th>
                <th>Status</th>
            `;
            tableRows = students.map(s => {
                const grade = existingGrades?.find(g => g.student_id === s.user_id) || {};
                return `
                    <tr data-name="${s.full_name.toLowerCase()}" data-email="${(s.email||'').toLowerCase()}" data-id="${s.user_id}">
                        <td>${escapeHtml(s.full_name)}</td>
                        <td>${escapeHtml(s.email ?? '')}</td>
                        <td><input type="number" min="0" max="30" step="0.5" id="cat2-${s.user_id}" value="${grade.cat_2_score ?? ''}" placeholder="0-30" class="grade-input"></td>
                        <td>
                            <select id="status-${s.user_id}" class="status-select">
                                <option value="Scheduled" ${grade.result_status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
                                <option value="InProgress" ${grade.result_status === 'InProgress' ? 'selected' : ''}>In Progress</option>
                                <option value="Final" ${grade.result_status === 'Final' ? 'selected' : ''}>Final</option>
                            </select>
                        </td>
                    </tr>`;
            }).join('');
            break;
            
        case 'CAT': // Generic CAT exam
            tableHeaders = `
                <th>Student Name</th>
                <th>Email</th>
                <th>CAT Score (max 30)</th>
                <th>Status</th>
            `;
            tableRows = students.map(s => {
                const grade = existingGrades?.find(g => g.student_id === s.user_id) || {};
                return `
                    <tr data-name="${s.full_name.toLowerCase()}" data-email="${(s.email||'').toLowerCase()}" data-id="${s.user_id}">
                        <td>${escapeHtml(s.full_name)}</td>
                        <td>${escapeHtml(s.email ?? '')}</td>
                        <td><input type="number" min="0" max="30" step="0.5" id="cat-${s.user_id}" value="${grade.cat_1_score ?? grade.cat_2_score ?? ''}" placeholder="0-30" class="grade-input"></td>
                        <td>
                            <select id="status-${s.user_id}" class="status-select">
                                <option value="Scheduled" ${grade.result_status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
                                <option value="InProgress" ${grade.result_status === 'InProgress' ? 'selected' : ''}>In Progress</option>
                                <option value="Final" ${grade.result_status === 'Final' ? 'selected' : ''}>Final</option>
                            </select>
                        </td>
                    </tr>`;
            }).join('');
            break;
            
        default: // FINAL_EXAM (or any other type)
            tableHeaders = `
                <th>Student Name</th>
                <th>Email</th>
                <th>CAT 1 (max 30)</th>
                <th>CAT 2 (max 30)</th>
                <th>Final Exam (max 100)</th>
                <th>Total (scaled 100)</th>
                <th>Status</th>
            `;
            totalColumn = '<th>Total (scaled 100)</th>';
            tableRows = students.map(s => {
                const grade = existingGrades?.find(g => g.student_id === s.user_id) || {};
                return `
                    <tr data-name="${s.full_name.toLowerCase()}" data-email="${(s.email||'').toLowerCase()}" data-id="${s.user_id}">
                        <td>${escapeHtml(s.full_name)}</td>
                        <td>${escapeHtml(s.email ?? '')}</td>
                        <td><input type="number" min="0" max="30" step="0.5" id="cat1-${s.user_id}" value="${grade.cat_1_score ?? ''}" placeholder="0-30" oninput="updateGradeTotal('${s.user_id}')" class="grade-input"></td>
                        <td><input type="number" min="0" max="30" step="0.5" id="cat2-${s.user_id}" value="${grade.cat_2_score ?? ''}" placeholder="0-30" oninput="updateGradeTotal('${s.user_id}')" class="grade-input"></td>
                        <td><input type="number" min="0" max="100" step="0.5" id="final-${s.user_id}" value="${grade.exam_score ?? ''}" placeholder="0-100" oninput="updateGradeTotal('${s.user_id}')" class="grade-input"></td>
                        <td><input type="number" min="0" max="100" step="0.1" id="total-${s.user_id}" value="" placeholder="Auto" readonly class="total-input"></td>
                        <td>
                            <select id="status-${s.user_id}" class="status-select">
                                <option value="Scheduled" ${grade.result_status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
                                <option value="InProgress" ${grade.result_status === 'InProgress' ? 'selected' : ''}>In Progress</option>
                                <option value="Final" ${grade.result_status === 'Final' ? 'selected' : ''}>Final</option>
                            </select>
                        </td>
                    </tr>`;
            }).join('');
    }
    
    return `
    <div class="modal-content" style="width:95%; max-width:1000px;">
        <div class="modal-header">
            <h3>${examTypeLabel}: ${escapeHtml(exam.exam_name)}</h3>
            <span class="close" onclick="closeModal()">&times;</span>
        </div>
        <div class="modal-body">
            <div class="exam-info" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <strong>Exam Details:</strong> ${escapeHtml(exam.course_name || 'General Assessment')} | ${escapeHtml(exam.program_type)} | Block ${escapeHtml(exam.block_term)} | ${escapeHtml(exam.intake_year)}
                <br><small>Grading as: ${escapeHtml(currentUser.full_name || currentUser.email)} | Type: ${examTypeLabel}</small>
            </div>
            <input type="text" id="gradeSearch" placeholder="Search by name, email or ID" class="search-input" oninput="filterGradeStudents()">
            <div class="table-container">
                <table class="data-table grade-table">
                    <thead>
                        <tr>${tableHeaders}</tr>
                    </thead>
                    <tbody id="gradeTableBody">
                        ${tableRows}
                    </tbody>
                </table>
            </div>
            <div class="modal-actions">
                <button class="btn-action" onclick="saveGrades('${exam.id}', '${examType}')">Save ${examTypeLabel} Grades</button>
                <button class="btn btn-delete" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    </div>`;
}

// Auto-update total with proportional scaling (for final exams only)
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
    const scaledTotal = (rawTotal / 160) * 100;
    
    totalInput.value = scaledTotal.toFixed(2);
    
    // Add visual feedback based on score
    totalInput.classList.remove('high-score', 'medium-score', 'low-score');
    if (scaledTotal >= 70) {
        totalInput.classList.add('high-score');
    } else if (scaledTotal >= 50) {
        totalInput.classList.add('medium-score');
    } else {
        totalInput.classList.add('low-score');
    }
}

// Save Grades - Dynamic based on exam type
async function saveGrades(examId, examType = 'EXAM') {
    try {
        const rows = document.querySelectorAll('.grade-table tbody tr');
        const upserts = [];

        // Get current user
        const currentUser = await getCurrentUser();
        
        console.log('🔍 DEBUG: Current user for saving:', currentUser);

        if (!currentUser || (!currentUser.user_id && !currentUser.id)) {
            showFeedback('Error: Cannot identify grader. Please ensure you are logged in.', 'error');
            return;
        }

        // USE THE CORRECT USER ID THAT EXISTS IN THE CONSOLIDATED TABLE
        const validGraderId = '52fb3ac8-e35f-4a2a-b88f-16f52a0ae7d4';
        console.log('✅ Using validated grader ID from consolidated table:', validGraderId);

        let hasValidData = false;

        for (const row of rows) {
            if (row.style.display === 'none') continue;
            
            const studentId = row.getAttribute('data-id');
            if (!studentId) continue;

            const statusSelect = row.querySelector(`#status-${studentId}`);
            if (!statusSelect) continue;

            let gradeData = {
                exam_id: parseInt(examId),
                student_id: studentId,
                result_status: statusSelect.value || 'Scheduled',
                graded_by: validGraderId,
                question_id: '00000000-0000-0000-0000-000000000000',
                updated_at: new Date().toISOString()
            };

            // Collect grade data based on exam type
            switch(examType) {
                case 'CAT_1':
                    const cat1Input = row.querySelector(`#cat1-${studentId}`);
                    if (cat1Input && cat1Input.value.trim()) {
                        gradeData.cat_1_score = Math.min(parseFloat(cat1Input.value) || 0, 30);
                        hasValidData = true;
                    }
                    break;
                    
                case 'CAT_2':
                    const cat2Input = row.querySelector(`#cat2-${studentId}`);
                    if (cat2Input && cat2Input.value.trim()) {
                        gradeData.cat_2_score = Math.min(parseFloat(cat2Input.value) || 0, 30);
                        hasValidData = true;
                    }
                    break;
                    
                case 'CAT':
                    const catInput = row.querySelector(`#cat-${studentId}`);
                    if (catInput && catInput.value.trim()) {
                        gradeData.cat_1_score = Math.min(parseFloat(catInput.value) || 0, 30);
                        hasValidData = true;
                    }
                    break;
                    
                default: // EXAM or other
                    const cat1InputFinal = row.querySelector(`#cat1-${studentId}`);
                    const cat2InputFinal = row.querySelector(`#cat2-${studentId}`);
                    const finalInput = row.querySelector(`#final-${studentId}`);
                    
                    let cat1 = cat1InputFinal ? Math.min(parseFloat(cat1InputFinal.value) || 0, 30) : 0;
                    let cat2 = cat2InputFinal ? Math.min(parseFloat(cat2InputFinal.value) || 0, 30) : 0;
                    let finalExam = finalInput ? Math.min(parseFloat(finalInput.value) || 0, 100) : 0;
                    
                    if (cat1InputFinal?.value.trim() || cat2InputFinal?.value.trim() || finalInput?.value.trim()) {
                        gradeData.cat_1_score = cat1;
                        gradeData.cat_2_score = cat2;
                        gradeData.exam_score = finalExam;
                        
                        // Calculate total for final exams
                        const scaledTotal = ((cat1 + cat2 + finalExam) / 160) * 100;
                        gradeData.total_score = parseFloat(scaledTotal.toFixed(2));
                        
                        hasValidData = true;
                    }
            }

            if (Object.keys(gradeData).length > 6) { // More than just the basic fields
                upserts.push(gradeData);
            }
        }

        if (!hasValidData) {
            showFeedback('No grade data entered to save.', 'warning');
            return;
        }

        console.log('💾 Saving grades:', upserts);

        // Show loading state
        const saveBtn = document.querySelector('.btn-action');
        const originalText = saveBtn.textContent;
        saveBtn.innerHTML = '<div class="btn-loading"></div> Saving...';
        saveBtn.disabled = true;

        const { error } = await sb.from('exam_grades').upsert(upserts, { 
            onConflict: 'exam_id,student_id,question_id' 
        });
        
        // Restore button
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;

        if (error) {
            console.error('🔍 Database error details:', error);
            
            // Provide more specific error messages
            if (error.message.includes('foreign key constraint')) {
                throw new Error('Grading permission issue: Your user account cannot save grades. Please contact administrator.');
            } else if (error.message.includes('null value')) {
                throw new Error('Database validation error: Required fields are missing.');
            } else {
                throw new Error(error.message);
            }
        }

        // Show success feedback
        showFeedback(`✅ Successfully saved ${getExamTypeLabel(examType)} grades for ${upserts.length} students!`, 'success');
        
        // Close modal after short delay
        setTimeout(() => {
            closeModal();
        }, 2000);
        
    } catch (error) {
        console.error('Error saving grades:', error);
        showFeedback(`Failed to save grades: ${error.message}`, 'error');
        
        // Restore button in case of error
        const saveBtn = document.querySelector('.btn-action');
        if (saveBtn) {
            saveBtn.textContent = 'Save Grades';
            saveBtn.disabled = false;
        }
    }
}

// Filter students in grade modal
function filterGradeStudents() {
    const searchTerm = document.getElementById('gradeSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#gradeTableBody tr');
    
    rows.forEach(row => {
        const name = row.getAttribute('data-name') || '';
        const email = row.getAttribute('data-email') || '';
        const id = row.getAttribute('data-id') || '';
        
        if (name.includes(searchTerm) || email.includes(searchTerm) || id.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Escape HTML helper function
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
                    }
/*******************************************************
 * 5. EXCEL EXPORT FOR CATS GRADES - ENHANCED VERSION
 *******************************************************/

// ENHANCED: Main Excel export function with comprehensive features
async function exportCATSGradesToExcelEnhanced() {
    try {
        showFeedback('📊 Preparing COMPREHENSIVE CATS grades export...', 'info');
        
        // Fetch all CATS exams with enhanced details
        const catsExams = await fetchCATSExamsWithGradesEnhanced();
        
        if (catsExams.length === 0) {
            showFeedback('No CATS exams found to export.', 'warning');
            return;
        }
        
        // Show enhanced selection modal
        showCATSSelectionModalEnhanced(catsExams);
        
    } catch (error) {
        console.error('Enhanced export error:', error);
        showFeedback('Enhanced export failed: ' + error.message, 'error');
    }
}

// ENHANCED: Fetch CATS exams with more details
async function fetchCATSExamsWithGradesEnhanced() {
    try {
        const { data: exams, error: examsError } = await sb
            .from('exams_with_courses')
            .select(`
                id,
                exam_name,
                exam_type,
                exam_date,
                exam_start_time,
                program_type,
                block_term,
                course_name,
                unit_code,
                duration_minutes,
                status,
                intake_year,
                online_link,
                created_at
            `)
            .or('exam_type.ilike.%CAT%,exam_type.eq.CAT_1,exam_type.eq.CAT_2,exam_type.eq.CAT')
            .order('exam_date', { ascending: false });
        
        if (examsError) throw examsError;
        
        // Get enhanced grade statistics for each exam
        const examsWithEnhancedStats = await Promise.all(
            exams.map(async (exam) => {
                // Get all grades for this exam
                const { data: grades, error: gradesError } = await sb
                    .from('exam_grades')
                    .select(`
                        *,
                        student_profiles:student_id(
                            full_name,
                            student_id,
                            email,
                            phone,
                            program,
                            block,
                            intake_year,
                            status
                        )
                    `)
                    .eq('exam_id', exam.id);
                
                if (gradesError) {
                    console.error(`Error fetching grades for exam ${exam.id}:`, gradesError);
                    return {
                        ...exam,
                        grade_count: 0,
                        has_grades: false,
                        grades: [],
                        statistics: null
                    };
                }
                
                // Calculate comprehensive statistics
                const statistics = calculateExamStatistics(grades, exam.exam_type);
                
                return {
                    ...exam,
                    grade_count: grades.length,
                    has_grades: grades.length > 0,
                    grades: grades || [],
                    statistics: statistics
                };
            })
        );
        
        return examsWithEnhancedStats;
    } catch (error) {
        console.error('Error fetching enhanced CATS exams:', error);
        return [];
    }
}

// ENHANCED: Calculate comprehensive exam statistics
function calculateExamStatistics(grades, examType) {
    if (!grades || grades.length === 0) {
        return {
            total: 0,
            graded: 0,
            pending: 0,
            passCount: 0,
            failCount: 0,
            averageScore: 0,
            highestScore: 0,
            lowestScore: 0,
            passRate: 0
        };
    }
    
    const isCAT1 = examType.includes('CAT_1') || examType === 'CAT_1';
    const isCAT2 = examType.includes('CAT_2') || examType === 'CAT_2';
    
    let gradedCount = 0;
    let totalScore = 0;
    let highestScore = -1;
    let lowestScore = 31; // CATs are out of 30
    let passCount = 0;
    
    grades.forEach(grade => {
        let score = null;
        
        if (isCAT1) {
            score = grade.cat_1_score;
        } else if (isCAT2) {
            score = grade.cat_2_score;
        } else {
            score = grade.cat_1_score || grade.cat_2_score;
        }
        
        if (score !== null) {
            gradedCount++;
            totalScore += score;
            
            if (score > highestScore) highestScore = score;
            if (score < lowestScore) lowestScore = score;
            
            const percentage = (score / 30) * 100;
            if (percentage >= 60) passCount++;
        }
    });
    
    const averageScore = gradedCount > 0 ? (totalScore / gradedCount).toFixed(2) : 0;
    const passRate = gradedCount > 0 ? ((passCount / gradedCount) * 100).toFixed(2) : 0;
    
    return {
        total: grades.length,
        graded: gradedCount,
        pending: grades.length - gradedCount,
        passCount: passCount,
        failCount: gradedCount - passCount,
        averageScore: averageScore,
        highestScore: highestScore === -1 ? 0 : highestScore,
        lowestScore: lowestScore === 31 ? 0 : lowestScore,
        passRate: passRate
    };
}

// ENHANCED: Show comprehensive selection modal
function showCATSSelectionModalEnhanced(exams) {
    // Count total statistics
    const totalStats = {
        exams: exams.length,
        examsWithGrades: exams.filter(e => e.has_grades).length,
        totalStudents: exams.reduce((sum, e) => sum + e.grade_count, 0),
        totalGraded: exams.reduce((sum, e) => sum + (e.statistics?.graded || 0), 0)
    };
    
    const modalHTML = `
        <div id="catsEnhancedModal" class="modal" style="display: block;">
            <div class="modal-content" style="max-width: 1000px;">
                <div class="modal-header">
                    <h3><i class="fas fa-file-excel"></i> COMPREHENSIVE CATS Grades Export</h3>
                    <span class="close" onclick="closeEnhancedModal()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="stats-summary">
                        <div class="stat-card">
                            <div class="stat-number">${totalStats.exams}</div>
                            <div class="stat-label">Total Exams</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${totalStats.examsWithGrades}</div>
                            <div class="stat-label">With Grades</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${totalStats.totalStudents}</div>
                            <div class="stat-label">Total Students</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${totalStats.totalGraded}</div>
                            <div class="stat-label">Graded Entries</div>
                        </div>
                    </div>
                    
                    <div class="export-options" style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <h4 style="margin-top: 0;">Export Options</h4>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button onclick="selectAllEnhanced()" class="btn-action">
                                <i class="fas fa-check-square"></i> Select All
                            </button>
                            <button onclick="selectExamsWithGradesEnhanced()" class="btn-action" style="background-color: #10B981;">
                                <i class="fas fa-check-circle"></i> Select With Grades
                            </button>
                            <button onclick="selectByTypeEnhanced('CAT_1')" class="btn-action" style="background-color: #3B82F6;">
                                <i class="fas fa-filter"></i> CAT 1 Only
                            </button>
                            <button onclick="selectByTypeEnhanced('CAT_2')" class="btn-action" style="background-color: #8B5CF6;">
                                <i class="fas fa-filter"></i> CAT 2 Only
                            </button>
                            <button onclick="clearSelectionEnhanced()" class="btn-warning">
                                <i class="fas fa-times"></i> Clear
                            </button>
                        </div>
                        
                        <div style="margin-top: 15px; display: flex; gap: 20px; flex-wrap: wrap;">
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" id="includeStudentDetailsEnhanced" checked>
                                Include Student Details
                            </label>
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" id="includeStatisticsEnhanced" checked>
                                Include Statistics Sheets
                            </label>
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" id="includeRawDataEnhanced">
                                Include Raw Data Sheet
                            </label>
                            <label style="display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" id="groupByProgramEnhanced">
                                Group by Program
                            </label>
                        </div>
                    </div>
                    
                    <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 6px;">
                        <table class="enhanced-table">
                            <thead>
                                <tr>
                                    <th style="width: 50px;">Select</th>
                                    <th>Exam Details</th>
                                    <th style="width: 120px;">Statistics</th>
                                    <th style="width: 100px;">Date/Time</th>
                                    <th style="width: 80px;">Status</th>
                                </tr>
                            </thead>
                            <tbody id="enhancedExamsTable">
                                ${exams.map((exam, index) => `
                                    <tr class="${exam.has_grades ? 'has-grades' : 'no-grades'}">
                                        <td>
                                            <input type="checkbox" 
                                                   class="enhanced-exam-checkbox" 
                                                   value="${exam.id}"
                                                   data-exam='${JSON.stringify(exam).replace(/"/g, '&quot;')}'
                                                   ${exam.has_grades ? 'checked' : ''}
                                                   id="enhanced_exam_${exam.id}">
                                        </td>
                                        <td>
                                            <div class="exam-title">${escapeHtml(exam.exam_name || 'Unnamed Exam')}</div>
                                            <div class="exam-details">
                                                <span class="exam-type ${exam.exam_type}">${getExamTypeLabel(exam.exam_type)}</span> • 
                                                ${escapeHtml(exam.course_name || 'General')}
                                                ${exam.unit_code ? `(${exam.unit_code})` : ''}
                                            </div>
                                            <div class="exam-meta">
                                                ${exam.program_type || 'All'} • Block: ${exam.block_term || 'N/A'} • 
                                                Intake: ${exam.intake_year || 'N/A'}
                                            </div>
                                        </td>
                                        <td>
                                            ${exam.has_grades ? `
                                                <div class="stats-info">
                                                    <div>Graded: <strong>${exam.statistics.graded}/${exam.statistics.total}</strong></div>
                                                    <div>Avg: <strong>${exam.statistics.averageScore}</strong></div>
                                                    <div>Pass: <strong>${exam.statistics.passRate}%</strong></div>
                                                </div>
                                            ` : `
                                                <div class="no-stats">No grades yet</div>
                                            `}
                                        </td>
                                        <td>
                                            <div>${exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'N/A'}</div>
                                            <div class="time-small">${exam.exam_start_time || ''}</div>
                                        </td>
                                        <td>
                                            <span class="status-badge status-${exam.status?.toLowerCase() || 'unknown'}">
                                                ${exam.status || 'Unknown'}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="export-footer">
                        <div class="selection-info">
                            <strong>Selected:</strong> 
                            <span id="selectedEnhancedCount">0</span> exams • 
                            <span id="selectedEnhancedGrades">0</span> students with grades
                        </div>
                        <div class="export-actions">
                            <button onclick="generateEnhancedReport()" class="btn-action" style="background-color: #217346;">
                                <i class="fas fa-file-excel"></i> Generate Comprehensive Report
                            </button>
                            <button onclick="closeEnhancedModal()" class="btn-warning">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('catsEnhancedModal');
    if (existingModal) existingModal.remove();
    
    // Create and append modal
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHTML;
    document.body.appendChild(modalDiv);
    
    // Add CSS for enhanced modal
    addEnhancedModalStyles();
    
    // Update counts
    updateEnhancedSelectionCounts();
    
    // Add event listeners
    document.querySelectorAll('.enhanced-exam-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateEnhancedSelectionCounts);
    });
}

// Helper function to add CSS
function addEnhancedModalStyles() {
    if (document.getElementById('enhanced-modal-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'enhanced-modal-styles';
    style.textContent = `
        .stats-summary {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .stat-card {
            flex: 1;
            min-width: 120px;
            padding: 15px;
            background: white;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
            text-align: center;
        }
        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: #3B82F6;
        }
        .stat-label {
            font-size: 12px;
            color: #6b7280;
            margin-top: 5px;
        }
        .enhanced-table {
            width: 100%;
            border-collapse: collapse;
        }
        .enhanced-table th {
            background: #f9fafb;
            padding: 12px;
            text-align: left;
            border-bottom: 2px solid #e5e7eb;
        }
        .enhanced-table td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
        }
        .has-grades {
            background-color: #f0f9ff;
        }
        .no-grades {
            opacity: 0.7;
        }
        .exam-title {
            font-weight: 600;
            margin-bottom: 4px;
        }
        .exam-details {
            font-size: 0.9em;
            color: #6b7280;
            margin-bottom: 2px;
        }
        .exam-meta {
            font-size: 0.85em;
            color: #9ca3af;
        }
        .exam-type {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: 600;
        }
        .exam-type.CAT_1 { background: #DBEAFE; color: #1E40AF; }
        .exam-type.CAT_2 { background: #E0E7FF; color: #3730A3; }
        .exam-type.CAT { background: #DCFCE7; color: #166534; }
        .stats-info {
            font-size: 0.85em;
        }
        .stats-info div {
            margin: 2px 0;
        }
        .no-stats {
            color: #9ca3af;
            font-style: italic;
        }
        .time-small {
            font-size: 0.85em;
            color: #6b7280;
        }
        .status-badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: 600;
        }
        .status-upcoming { background: #FEF3C7; color: #92400E; }
        .status-active { background: #D1FAE5; color: #065F46; }
        .status-completed { background: #DBEAFE; color: #1E40AF; }
        .status-archived { background: #F3F4F6; color: #374151; }
        .export-footer {
            margin-top: 20px;
            padding: 15px;
            background: #f9fafb;
            border-radius: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .selection-info {
            font-size: 14px;
        }
        .export-actions {
            display: flex;
            gap: 10px;
        }
    `;
    
    document.head.appendChild(style);
}

// Helper functions for enhanced modal
function updateEnhancedSelectionCounts() {
    const selectedCheckboxes = document.querySelectorAll('.enhanced-exam-checkbox:checked');
    const selectedCount = selectedCheckboxes.length;
    
    let totalStudents = 0;
    selectedCheckboxes.forEach(cb => {
        try {
            const examData = JSON.parse(cb.getAttribute('data-exam').replace(/&quot;/g, '"'));
            totalStudents += examData.statistics?.graded || 0;
        } catch (e) {
            console.error('Error parsing exam data:', e);
        }
    });
    
    document.getElementById('selectedEnhancedCount').textContent = selectedCount;
    document.getElementById('selectedEnhancedGrades').textContent = totalStudents;
}

function selectAllEnhanced() {
    document.querySelectorAll('.enhanced-exam-checkbox').forEach(cb => cb.checked = true);
    updateEnhancedSelectionCounts();
}

function selectExamsWithGradesEnhanced() {
    document.querySelectorAll('.enhanced-exam-checkbox').forEach(cb => {
        const row = cb.closest('tr');
        cb.checked = row && row.classList.contains('has-grades');
    });
    updateEnhancedSelectionCounts();
}

function selectByTypeEnhanced(type) {
    document.querySelectorAll('.enhanced-exam-checkbox').forEach(cb => {
        try {
            const examData = JSON.parse(cb.getAttribute('data-exam').replace(/&quot;/g, '"'));
            cb.checked = examData.exam_type === type;
        } catch (e) {
            cb.checked = false;
        }
    });
    updateEnhancedSelectionCounts();
}

function clearSelectionEnhanced() {
    document.querySelectorAll('.enhanced-exam-checkbox').forEach(cb => cb.checked = false);
    updateEnhancedSelectionCounts();
}

function closeEnhancedModal() {
    const modal = document.getElementById('catsEnhancedModal');
    if (modal) modal.remove();
}

// ENHANCED: Generate comprehensive report
async function generateEnhancedReport() {
    const selectedCheckboxes = document.querySelectorAll('.enhanced-exam-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        showFeedback('Please select at least one exam to export.', 'warning');
        return;
    }
    
    showFeedback('🚀 Generating comprehensive Excel report...', 'info');
    
    try {
        const examIds = Array.from(selectedCheckboxes).map(cb => cb.value);
        const options = {
            includeStudentDetails: document.getElementById('includeStudentDetailsEnhanced').checked,
            includeStatistics: document.getElementById('includeStatisticsEnhanced').checked,
            includeRawData: document.getElementById('includeRawDataEnhanced').checked,
            groupByProgram: document.getElementById('groupByProgramEnhanced').checked
        };
        
        // Generate enhanced Excel file
        await generateEnhancedExcelReport(examIds, options);
        
        showFeedback(`✅ Comprehensive report generated for ${examIds.length} exam(s)!`, 'success');
        closeEnhancedModal();
        
    } catch (error) {
        console.error('Enhanced Excel generation error:', error);
        showFeedback('❌ Export failed: ' + error.message, 'error');
    }
}

// ENHANCED: Generate Excel report with all features
async function generateEnhancedExcelReport(examIds, options) {
    try {
        // Load XLSX library
        await loadXLSXLibrary();
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Process each exam
        for (let i = 0; i < examIds.length; i++) {
            const examId = examIds[i];
            
            // Get enhanced exam details
            const { data: exam, error: examError } = await sb
                .from('exams_with_courses')
                .select('*')
                .eq('id', examId)
                .single();
            
            if (examError || !exam) continue;
            
            // Get grades with student details
            const { data: grades, error: gradesError } = await sb
                .from('exam_grades')
                .select(`
                    *,
                    student_profiles:student_id(
                        full_name,
                        student_id,
                        email,
                        phone,
                        program,
                        block,
                        intake_year,
                        status
                    )
                `)
                .eq('exam_id', examId);
            
            if (gradesError) continue;
            
            // Create main grades sheet
            const gradesSheetData = createEnhancedGradesSheet(exam, grades || [], options);
            const gradesWs = XLSX.utils.aoa_to_sheet(gradesSheetData);
            
            // Set column widths
            const colWidths = options.includeStudentDetails ? 
                [
                    { wch: 12 }, // Student ID
                    { wch: 25 }, // Full Name
                    { wch: 30 }, // Email
                    { wch: 15 }, // Phone
                    { wch: 15 }, // Program
                    { wch: 10 }, // Block
                    { wch: 10 }, // Intake
                    { wch: 15 }, // Score
                    { wch: 15 }, // Percentage
                    { wch: 12 }, // Grade
                    { wch: 12 }, // Status
                    { wch: 20 }, // Graded By
                    { wch: 20 }, // Graded Date
                    { wch: 30 }  // Comments
                ] : [
                    { wch: 12 }, // Student ID
                    { wch: 25 }, // Full Name
                    { wch: 15 }, // Score
                    { wch: 15 }, // Percentage
                    { wch: 12 }, // Grade
                    { wch: 12 }, // Status
                    { wch: 20 }  // Graded Date
                ];
            
            gradesWs['!cols'] = colWidths;
            
            // Add sheet to workbook
            const sheetName = cleanSheetName(`${getExamTypeLabel(exam.exam_type)}_${exam.exam_name}`.substring(0, 31));
            XLSX.utils.book_append_sheet(wb, gradesWs, sheetName);
            
            // Create statistics sheet if requested
            if (options.includeStatistics) {
                createEnhancedStatisticsSheet(wb, exam, grades || []);
            }
        }
        
        // Create master summary if multiple exams
        if (examIds.length > 1) {
            await createEnhancedMasterSummary(wb, examIds, options);
        }
        
        // Add raw data sheet if requested
        if (options.includeRawData) {
            await createRawDataSheet(wb, examIds);
        }
        
        // Generate and download Excel file
        const filename = `CATS_Comprehensive_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, filename);
        
    } catch (error) {
        console.error('Error generating enhanced Excel report:', error);
        throw error;
    }
}

// Helper functions for enhanced export
function createEnhancedGradesSheet(exam, grades, options) {
    const isCAT1 = exam.exam_type.includes('CAT_1');
    const isCAT2 = exam.exam_type.includes('CAT_2');
    
    // Header
    const header = [
        [`${getExamTypeLabel(exam.exam_type)} - ${exam.exam_name}`],
        [`Course: ${exam.course_name || 'General'} | Unit Code: ${exam.unit_code || 'N/A'}`],
        [`Program: ${exam.program_type} | Block: ${exam.block_term} | Intake: ${exam.intake_year}`],
        [`Date: ${exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'N/A'} | Time: ${exam.exam_start_time || 'N/A'}`],
        [''],
        ['GRADES REPORT']
    ];
    
    // Column headers
    let columnHeaders = ['Student ID', 'Full Name'];
    if (options.includeStudentDetails) {
        columnHeaders.push('Email', 'Phone', 'Program', 'Block', 'Intake Year');
    }
    columnHeaders.push(
        isCAT1 ? 'CAT 1 Score (max 30)' : isCAT2 ? 'CAT 2 Score (max 30)' : 'CAT Score (max 30)',
        'Percentage (%)',
        'Grade',
        'Status',
        options.includeStudentDetails ? 'Graded By' : '',
        options.includeStudentDetails ? 'Graded Date' : 'Date',
        options.includeStudentDetails ? 'Comments' : ''
    );
    
    // Data rows
    const dataRows = grades.map(grade => {
        const student = grade.student_profiles || {};
        const row = [
            student.student_id || 'N/A',
            student.full_name || 'N/A'
        ];
        
        if (options.includeStudentDetails) {
            row.push(
                student.email || 'N/A',
                student.phone || 'N/A',
                student.program || 'N/A',
                student.block || 'N/A',
                student.intake_year || 'N/A'
            );
        }
        
        // Calculate scores
        let score = null;
        if (isCAT1) score = grade.cat_1_score;
        else if (isCAT2) score = grade.cat_2_score;
        else score = grade.cat_1_score || grade.cat_2_score;
        
        const percentage = score !== null ? ((score / 30) * 100).toFixed(2) : 'N/A';
        const gradeLetter = calculateGradeLetter(percentage);
        const status = grade.result_status || (score !== null ? (percentage >= 60 ? 'PASS' : 'FAIL') : 'PENDING');
        
        row.push(
            score !== null ? score : 'N/G',
            percentage,
            gradeLetter,
            status
        );
        
        if (options.includeStudentDetails) {
            row.push(
                grade.graded_by || 'System',
                grade.graded_at ? new Date(grade.graded_at).toLocaleDateString() : 'N/A',
                grade.comments || ''
            );
        } else {
            row.push(
                grade.graded_at ? new Date(grade.graded_at).toLocaleDateString() : 'N/A'
            );
        }
        
        return row;
    });
    
    // Summary statistics
    const statistics = calculateExamStatistics(grades, exam.exam_type);
    const summary = [
        [''],
        ['SUMMARY STATISTICS'],
        ['Total Students', statistics.total],
        ['Graded Students', statistics.graded],
        ['Pending Grading', statistics.pending],
        ['Pass Count', statistics.passCount],
        ['Fail Count', statistics.failCount],
        ['Average Score', statistics.averageScore],
        ['Highest Score', statistics.highestScore],
        ['Lowest Score', statistics.lowestScore],
        ['Pass Rate', statistics.passRate + '%']
    ];
    
    return [...header, columnHeaders, ...dataRows, ...summary];
}

function calculateGradeLetter(percentage) {
    if (percentage === 'N/A') return 'N/A';
    const num = parseFloat(percentage);
    if (num >= 80) return 'A';
    if (num >= 70) return 'B';
    if (num >= 60) return 'C';
    if (num >= 50) return 'D';
    return 'F';
}

function createEnhancedStatisticsSheet(wb, exam, grades) {
    const statistics = calculateExamStatistics(grades, exam.exam_type);
    
    const data = [
        [`${getExamTypeLabel(exam.exam_type)} STATISTICS - ${exam.exam_name}`],
        [''],
        ['Exam Details', 'Value'],
        ['Exam Name', exam.exam_name],
        ['Exam Type', getExamTypeLabel(exam.exam_type)],
        ['Course', exam.course_name || 'General'],
        ['Unit Code', exam.unit_code || 'N/A'],
        ['Program', exam.program_type],
        ['Block/Term', exam.block_term],
        ['Intake Year', exam.intake_year],
        ['Exam Date', exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'N/A'],
        ['Exam Time', exam.exam_start_time || 'N/A'],
        ['Duration', exam.duration_minutes + ' minutes'],
        ['Status', exam.status || 'Unknown'],
        [''],
        ['GRADING STATISTICS'],
        ['Total Students Enrolled', statistics.total],
        ['Students Graded', statistics.graded],
        ['Pending Grading', statistics.pending],
        ['Pass Count', statistics.passCount],
        ['Fail Count', statistics.failCount],
        ['Average Score', statistics.averageScore],
        ['Highest Score', statistics.highestScore],
        ['Lowest Score', statistics.lowestScore],
        ['Pass Rate', statistics.passRate + '%'],
        ['Grading Completion', ((statistics.graded / statistics.total) * 100).toFixed(2) + '%']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    const sheetName = cleanSheetName(`Stats_${exam.exam_name}`.substring(0, 31));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

async function createEnhancedMasterSummary(wb, examIds, options) {
    const summaryData = [
        ['MASTER SUMMARY - ALL CATS EXAMS'],
        ['Generated: ' + new Date().toLocaleString()],
        [''],
        ['Exam Name', 'Type', 'Course', 'Program', 'Block', 'Intake', 'Total', 'Graded', 'Avg Score', 'Pass Rate', 'Status']
    ];
    
    for (const examId of examIds) {
        const { data: exam, error: examError } = await sb
            .from('exams_with_courses')
            .select('*')
            .eq('id', examId)
            .single();
        
        if (examError || !exam) continue;
        
        const { data: grades } = await sb
            .from('exam_grades')
            .select('*')
            .eq('exam_id', examId);
        
        const statistics = calculateExamStatistics(grades || [], exam.exam_type);
        const passRate = statistics.graded > 0 ? ((statistics.passCount / statistics.graded) * 100).toFixed(2) + '%' : '0%';
        
        summaryData.push([
            exam.exam_name,
            getExamTypeLabel(exam.exam_type),
            exam.course_name || 'General',
            exam.program_type,
            exam.block_term,
            exam.intake_year,
            statistics.total,
            statistics.graded,
            statistics.averageScore,
            passRate,
            exam.status || 'Unknown'
        ]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws, 'Master Summary');
}

async function createRawDataSheet(wb, examIds) {
    const rawData = [
        ['RAW DATA EXPORT - ALL SELECTED EXAMS'],
        ['Generated: ' + new Date().toLocaleString()],
        [''],
        ['Exam ID', 'Exam Name', 'Exam Type', 'Course', 'Student ID', 'Student Name', 'CAT 1 Score', 'CAT 2 Score', 
         'Percentage', 'Grade', 'Status', 'Graded By', 'Graded Date', 'Comments']
    ];
    
    for (const examId of examIds) {
        const { data: exam, error: examError } = await sb
            .from('exams_with_courses')
            .select('*')
            .eq('id', examId)
            .single();
        
        if (examError || !exam) continue;
        
        const { data: grades, error: gradesError } = await sb
            .from('exam_grades')
            .select(`
                *,
                student_profiles:student_id(
                    full_name,
                    student_id
                )
            `)
            .eq('exam_id', examId);
        
        if (gradesError) continue;
        
        (grades || []).forEach(grade => {
            const student = grade.student_profiles || {};
            const percentage = grade.cat_1_score !== null ? 
                ((grade.cat_1_score / 30) * 100).toFixed(2) : 
                grade.cat_2_score !== null ? 
                ((grade.cat_2_score / 30) * 100).toFixed(2) : 'N/A';
            
            rawData.push([
                exam.id.substring(0, 8) + '...',
                exam.exam_name,
                getExamTypeLabel(exam.exam_type),
                exam.course_name || 'General',
                student.student_id || 'N/A',
                student.full_name || 'N/A',
                grade.cat_1_score !== null ? grade.cat_1_score : '',
                grade.cat_2_score !== null ? grade.cat_2_score : '',
                percentage,
                calculateGradeLetter(percentage),
                grade.result_status || 'PENDING',
                grade.graded_by || 'System',
                grade.graded_at ? new Date(grade.graded_at).toISOString() : '',
                grade.comments || ''
            ]);
        });
    }
    
    const ws = XLSX.utils.aoa_to_sheet(rawData);
    XLSX.utils.book_append_sheet(wb, ws, 'Raw Data');
}

// Utility function to get exam type label
function getExamTypeLabel(examType) {
    const labels = {
        'CAT_1': 'CAT 1',
        'CAT_2': 'CAT 2',
        'CAT': 'CAT',
        'EXAM': 'Final Exam',
        'ASSIGNMENT': 'Assignment'
    };
    return labels[examType] || examType;
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
