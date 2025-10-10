/***********************************
 * JavaScript Functionality (script.js)
 ***********************************/

// !!! IMPORTANT: CHECK YOUR KEYS AND URL !!!
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const RESOURCES_BUCKET = 'resources';
const IP_API_URL = 'https://api.ipify.org?format=json';

// --- Global API Keys and Settings ---
const MAPBOX_ACCESS_TOKEN = 'pk.cbe61eae35ecbe1d1d682c347d81381c';
const DEVICE_ID_KEY = 'nchsm_device_id';

// Global Variables
let currentUserProfile = null;
let attendanceMap = null;

// Settings Keys
const SETTINGS_TABLE = 'app_settings';
const MESSAGE_KEY = 'student_welcome';

/*******************************************************
 * 1. CORE UTILITY FUNCTIONS
 *******************************************************/
function $(id){ return document.getElementById(id); }

// Escapes HTML for safety, with an option to handle quotes for inline attributes
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
 * @param {string} message
 * @param {'success'|'error'} type
 */
function showFeedback(message, type = 'success') {
    // simple alert-based feedback for now
    const prefix = type === 'success' ? '✅ Success: ' : '❌ Error: ';
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
 * @param {string} tableName
 * @param {string} selectQuery
 * @param {Object} filters - exact equality filters
 * @param {string} order
 * @param {boolean} ascending
 */
async function fetchData(tableName, selectQuery = '*', filters = {}, order = 'created_at', ascending = false) {
    try {
        let query = sb.from(tableName).select(selectQuery);

        for (const key in filters) {
            if (filters[key] !== undefined && filters[key] !== '') {
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
    } catch (e) {
        console.error(`Exception while loading ${tableName}:`, e);
        return { data: null, error: e };
    }
}

/**
 * Utility to populate select/dropdown elements
 * @param {HTMLSelectElement} selectElement
 * @param {Array} data
 * @param {string} valueKey
 * @param {string} textKey
 * @param {string} defaultText
 */
function populateSelect(selectElement, data, valueKey, textKey, defaultText) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">-- ${escapeHtml(defaultText)} --</option>`;
    if (!data || !Array.isArray(data)) return;
    data.forEach(item => {
        const text = item[textKey] || item[valueKey] || '';
        const value = item[valueKey] || '';
        selectElement.innerHTML += `<option value="${escapeHtml(value, true)}">${escapeHtml(text)}</option>`;
    });
}

function generateUUID() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
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

async function reverseGeocode(lat, lng) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.features && data.features.length > 0) {
            return data.features[0].place_name;
        }
        return 'Reverse Geocoding Failed';
    } catch (error) {
        console.error('Reverse Geocoding Error:', error);
        return 'Geocoding API Network Error';
    }
}

function getGeoLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve(position.coords),
            (error) => reject(new Error(error.message)),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    });
}

/*******************************************************
 * Tab switching logic
 *******************************************************/
function showTab(tabId) {
    // helper to be used by cards etc.
    const link = document.querySelector(`.nav a[data-tab="${tabId}"]`);
    if (link) link.click();
}

const navLinks = document.querySelectorAll('.nav a');
const tabs = document.querySelectorAll('.tab-content');
navLinks.forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        tabs.forEach(tab => tab.classList.remove('active'));
        const tabId = link.dataset.tab;
        const target = document.getElementById(tabId);
        if (target) target.classList.add('active');
        loadSectionData(tabId);
    });
});

async function loadSectionData(tabId) {
    switch(tabId) {
        case 'dashboard':
            await loadDashboardData();
            await loadStudentWelcomeMessage();
            break;
        case 'users': await loadAllUsers(); break;
        case 'pending': await loadPendingApprovals(); break;
        case 'enroll': await loadStudents(); break;
        case 'courses': await loadCourses(); break;
        case 'attendance': await loadAttendance(); await populateAttendanceSelects(); break;
        case 'cats': await loadExams(); await populateAttendanceSelects(); break;
        case 'messages': await loadMessages(); break;
        case 'calendar':
            if ($('calendar')) $('calendar').innerHTML = '<p>Simple calendar placeholder - Exam and Clinical dates will show here. (Integration coming soon)</p>';
            break;
        case 'resources': await loadResources(); break;
        case 'welcome-editor': await loadWelcomeMessageForEdit(); break;
    }
}

/*******************************************************
 * --- Session / Init
 *******************************************************/
async function initSession() {
    try {
        const { data } = await sb.auth.getUser();
        const user = data?.user;
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        const { data: profile, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (error) {
            console.error('Error fetching profile:', error);
            window.location.href = "login.html";
            return;
        }

        if (profile) {
            currentUserProfile = profile;
            if (currentUserProfile.role !== 'superadmin') {
                window.location.href = "admin.html";
                return;
            }
            const headerH1 = document.querySelector('header h1');
            if (headerH1) headerH1.textContent = `Welcome, ${profile.full_name || 'Super Admin'}!`;
        } else {
            // if no profile, redirect to login (or create profile logic)
            window.location.href = "login.html";
            return;
        }

        await loadSectionData('dashboard');
        await populateAttendanceSelects();
    } catch (e) {
        console.error('initSession error:', e);
        window.location.href = "login.html";
    }
}

// Logout
async function logout() {
    await sb.auth.signOut();
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
}

/*******************
 * Dashboard Data
 *******************/
async function loadDashboardData() {
    try {
        const { count: allUsersCount } = await sb.from('profiles').select('id', { count: 'exact' });
        if ($('totalUsers')) $('totalUsers').textContent = allUsersCount || 0;

        const { count: pendingCount } = await sb.from('profiles').select('id', { count: 'exact' }).eq('approved', false);
        if ($('pendingApprovals')) $('pendingApprovals').textContent = pendingCount || 0;

        const { count: studentsCount } = await sb.from('profiles').select('id', { count: 'exact' }).eq('role', 'student');
        if ($('totalStudents')) $('totalStudents').textContent = studentsCount || 0;

        const today = new Date().toISOString().slice(0, 10);
        const { data: checkinData } = await sb.from('geo_attendance_logs').select('id').gte('check_in_time', today);
        if ($('todayCheckins')) $('todayCheckins').textContent = (checkinData?.length) || 0;
    } catch (e) {
        console.error('loadDashboardData error:', e);
    }
}

/*******************************************************
 * 2. Users/Enroll Tab (Approvals Logic) + Student Edit
 *******************************************************/

/** Load all user accounts (admins/students) */
async function loadAllUsers() {
    const tbody = $('users-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Loading all users...</td></tr>';

    const { data: users, error } = await fetchData('profiles', '*', {}, 'full_name', true);

    if (error || !users) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading users: ${escapeHtml(error?.message || 'Unknown')}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    users.forEach(u => {
        const roleOptions = ['student', 'admin', 'superadmin']
            .map(role => `<option value="${escapeHtml(role, true)}" ${u.role === role ? 'selected' : ''}>${escapeHtml(role)}</option>`).join('');

        const statusText = u.approved ? 'Approved' : 'Pending';

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(String(u.id).substring(0, 8))}...</td>
            <td>${escapeHtml(u.full_name || '')}</td>
            <td>${escapeHtml(u.email || '')}</td>
            <td>
                <select class="btn" onchange="updateUserRole('${escapeHtml(u.id, true)}', this.value)" ${u.role === 'superadmin' ? 'disabled' : ''}>
                    ${roleOptions}
                </select>
            </td>
            <td>${escapeHtml(u.program_type || u.program || 'N/A')}</td>
            <td>${escapeHtml(statusText)}</td>
            <td>
                ${!u.approved ? `<button class="btn btn-approve" onclick="approveUser('${escapeHtml(u.id, true)}')">Approve</button>` : ''}
                <button class="btn-action" onclick="openEditStudentModalFromUser('${escapeHtml(u.id, true)}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteProfile('${escapeHtml(u.id, true)}')">Delete</button>
            </td>
        </tr>`;
    });
}

/** Load pending approvals */
async function loadPendingApprovals() {
    const tbody = $('pending-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Loading pending users...</td></tr>';

    const { data: pending, error } = await fetchData('profiles', '*', { approved: false }, 'created_at', true);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error loading pending list: ${escapeHtml(error.message)}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    if (!pending || pending.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">No pending approvals!</td></tr>`;
        return;
    }

    pending.forEach(p => {
        const registeredDate = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A';
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(p.full_name)}</td>
            <td>${escapeHtml(p.email)}</td>
            <td>${escapeHtml(p.role)}</td>
            <td>${escapeHtml(p.program_type || p.program || 'N/A')}</td>
            <td>${escapeHtml(registeredDate)}</td>
            <td>
                <button class="btn btn-approve" onclick="approveUser('${escapeHtml(p.id, true)}')">Approve</button>
                <button class="btn btn-reject" onclick="deleteProfile('${escapeHtml(p.id, true)}')">Reject & Delete</button>
            </td>
        </tr>`;
    });
}

/** Load students list (with intake + block columns) */
async function loadStudents() {
    const tbody = $('students-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9">Loading students...</td></tr>';

    const { data: students, error } = await fetchData('profiles', '*', { role: 'student' }, 'full_name', true);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="9">Error loading students: ${escapeHtml(error.message)}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    students.forEach(s => {
        const intake = s.intake || s.account_intake || s.intake_year || 'N/A';
        const block = s.block || s.account_block || 'N/A';
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(String(s.id).substring(0, 8))}...</td>
            <td>${escapeHtml(s.full_name)}</td>
            <td>${escapeHtml(s.email)}</td>
            <td>${escapeHtml(s.program_type || s.program || 'N/A')}</td>
            <td>${escapeHtml(intake)}</td>
            <td>${escapeHtml(block)}</td>
            <td>${escapeHtml(s.phone || '')}</td>
            <td>${s.approved ? 'Approved' : 'Pending'}</td>
            <td>
                <button class="btn-action" onclick="openEditStudentModal('${escapeHtml(s.id, true)}', '${escapeHtml(s.full_name, true)}', '${escapeHtml(s.email, true)}', '${escapeHtml(s.phone || '', true)}', '${escapeHtml(s.program_type || s.program || '', true)}', '${escapeHtml(intake, true)}', '${escapeHtml(block, true)}')">Edit</button>
                <button class="btn" onclick="sendPasswordReset('${escapeHtml(s.email, true)}')">Reset Password</button>
                <button class="btn btn-delete" onclick="deleteProfile('${escapeHtml(s.id, true)}')">Delete</button>
            </td>
        </tr>`;
    });
}

/** Approve user */
async function approveUser(userId) {
    if (!confirm('Are you sure you want to approve this user?')) return;

    const { error } = await sb.from('profiles')
        .update({ approved: true })
        .eq('id', userId);

    if (error) {
        showFeedback(`Failed to approve user: ${error.message}`, 'error');
    } else {
        showFeedback('User approved successfully!');
        await loadPendingApprovals();
        await loadAllUsers();
        await loadDashboardData();
    }
}

/** Update user role */
async function updateUserRole(userId, newRole) {
    if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;

    const { error } = await sb.from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

    if (error) {
        showFeedback(`Failed to update role: ${error.message}`, 'error');
    } else {
        showFeedback(`User role updated to ${newRole} successfully!`);
        await loadAllUsers();
    }
}

/** Delete profile */
async function deleteProfile(userId) {
    if (!confirm('WARNING: Deleting the profile is an irreversible action. Are you absolutely sure?')) return;

    const { error: profileError } = await sb.from('profiles').delete().eq('id', userId);

    if (profileError) {
        showFeedback(`Failed to delete profile: ${profileError.message}`, 'error');
        return;
    }

    showFeedback('User profile deleted successfully! (Note: Auth user deletion may require server-side action)', 'success');
    await loadAllUsers();
    await loadPendingApprovals();
    await loadStudents();
    await loadDashboardData();
}

/** Enroll account form submit */
$('add-account-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const name = $('account-name').value.trim();
    const email = $('account-email').value.trim();
    const password = $('account-password').value.trim();
    const role = $('account-role').value;
    const phone = $('account-phone').value.trim();
    const program_type = $('account-program').value;
    const intake = $('account-intake')?.value || null;
    const block = $('account-block')?.value || null;
    const approved = true;

    try {
        const { data: signUpData, error: authError } = await sb.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { full_name: name, role: role, phone: phone, program_type: program_type, approved: approved }
            }
        });

        if (authError) {
            showFeedback(`Account Enrollment Error: ${authError.message}`, 'error');
            setButtonLoading(submitButton, false, originalText);
            return;
        }

        // signUp returns user if auto-confirmed; but we should create a matching profile record in 'profiles' table
        // Use the returned user id if available; otherwise try to insert with email and rely on server sync later.
        const userId = signUpData?.user?.id || null;
        // create profile record
        const profilePayload = {
            id: userId,
            full_name: name,
            email,
            role,
            phone,
            program_type,
            intake,
            block,
            approved
        };

        // Only insert if we have userId, otherwise insert without id if allowed by DB
        let insertPayload = profilePayload;
        if (!userId) {
            // Remove id to let DB generate uuid if configured
            delete insertPayload.id;
        }

        const { error: dbError } = await sb.from('profiles').insert(insertPayload);

        if (dbError) {
            // If profile insert fails, still notify but continue
            console.error('Profile insert error:', dbError);
            showFeedback(`Account created but failed to create profile: ${dbError.message}`, 'error');
        } else {
            showFeedback(`New ${role.toUpperCase()} account successfully enrolled and approved!`, 'success');
        }

        e.target.reset();
        await loadStudents();
        await loadAllUsers();
        await loadDashboardData();
    } catch (err) {
        console.error('Sign up error:', err);
        showFeedback(`Enrollment error: ${err.message || err}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

/*******************************************************
 * 3. Courses Tab - WITH EDIT FUNCTIONALITY (added intake/block)
 *******************************************************/
async function loadCourses() {
    const tbody = $('courses-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Loading courses...</td></tr>';

    const { data: courses, error } = await fetchData('courses', '*', {}, 'course_name', true);
    if (error) {
        tbody.innerHTML = `<tr><td colspan="5">Error loading courses: ${escapeHtml(error.message)}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    courses.forEach(c => {
        const intake = c.intake || 'N/A';
        const block = c.block || 'N/A';
        const courseNameAttr = escapeHtml(c.course_name || '', true);
        const descriptionAttr = escapeHtml(c.description || '', true);
        const intakeAttr = escapeHtml(intake, true);
        const blockAttr = escapeHtml(block, true);

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(c.course_name)}</td>
            <td>${escapeHtml(c.description || 'N/A')}</td>
            <td>${escapeHtml(intake)}</td>
            <td>${escapeHtml(block)}</td>
            <td>
                <button class="btn-action" onclick="openEditCourseModal('${escapeHtml(c.id, true)}', '${courseNameAttr}', '${descriptionAttr}', '${intakeAttr}', '${blockAttr}')">Edit</button>
                <button class="btn btn-delete" onclick="deleteCourse('${escapeHtml(c.id, true)}')">Delete</button>
            </td>
        </tr>`;
    });

    const courseSelects = document.querySelectorAll('#att_course_id, #exam_course_id, #course-id-select');
    courseSelects.forEach(select => populateSelect(select, courses, 'id', 'course_name', 'Select Course'));
}

$('add-course-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const course_name = $('course-name').value.trim();
    const description = $('course-description').value.trim();
    const intake = $('course-intake')?.value || null;
    const block = $('course-block')?.value || null;

    try {
        const { error } = await sb.from('courses').insert({ course_name, description, intake, block });
        if (error) {
            showFeedback(`Failed to add course: ${error.message}`, 'error');
        } else {
            showFeedback('Course added successfully!');
            e.target.reset();
            await loadCourses();
        }
    } catch (err) {
        console.error('add course error:', err);
        showFeedback(`Failed to add course: ${err.message || err}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

async function deleteCourse(courseId) {
    if (!confirm('Are you sure you want to delete this course? This cannot be undone.')) return;

    const { error } = await sb.from('courses').delete().eq('id', courseId);

    if (error) {
        showFeedback(`Failed to delete course: ${error.message}`, 'error');
    } else {
        showFeedback('Course deleted successfully!');
        await loadCourses();
    }
}

/** Opens the course edit modal and populates fields */
function openEditCourseModal(id, name, description, intake = '', block = '') {
    const modal = $('courseEditModal');
    if (!modal) return;
    $('edit_course_id').value = id || '';
    $('edit_course_name').value = name || '';
    $('edit_course_description').value = description || '';

    // if you want to include intake/block in edit form, you can add fields in the modal HTML.
    // For now, we'll keep what's in HTML. If intake/block fields are present, set them:
    if ($('edit_course_intake')) $('edit_course_intake').value = intake || '';
    if ($('edit_course_block')) $('edit_course_block').value = block || '';

    modal.style.display = 'flex';
}

/** Handles submission of the edit course form */
$('edit-course-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const id = $('edit_course_id').value;
    const name = $('edit_course_name').value.trim();
    const description = $('edit_course_description').value.trim();
    const intake = $('edit_course_intake')?.value || null;
    const block = $('edit_course_block')?.value || null;

    try {
        const { error } = await sb
            .from('courses')
            .update({ course_name: name, description, intake, block })
            .eq('id', id);

        if (error) throw error;

        showFeedback('Course updated successfully!');
        $('courseEditModal').style.display = 'none';
        await loadCourses();
    } catch (err) {
        showFeedback('Failed to update course: ' + (err.message || err), 'error');
        console.error('Error updating course:', err);
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

/*******************************************************
 * 4. Attendance Tab
 *******************************************************/
async function populateAttendanceSelects() {
    try {
        const { data: students } = await fetchData('profiles', 'id, full_name', { role: 'student', approved: true }, 'full_name', true);
        const attStudentSelect = $('att_student_id');
        if (students && attStudentSelect) {
            populateSelect(attStudentSelect, students, 'id', 'full_name', 'Select Student');
        }
    } catch (e) {
        console.error('populateAttendanceSelects error:', e);
    }
}

async function loadAttendance() {
    const tbody = $('attendance-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Loading records...</td></tr>';

    const { data: records, error } = await fetchData(
        'geo_attendance_logs',
        '*, profile:student_id(full_name, program_type)',
        {},
        'check_in_time',
        false
    );

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6">Error loading attendance: ${escapeHtml(error.message)}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    (records || []).forEach(r => {
        const studentName = r.profile?.full_name || 'N/A';
        const dateTime = r.check_in_time ? new Date(r.check_in_time).toLocaleString() : 'N/A';

        let locationText = '';
        let mapButton = '';
        if (r.latitude && r.longitude) {
            locationText = `Geo-Log: ${escapeHtml(r.location_name || 'Coordinates')}`;
            mapButton = `<button class="btn btn-map" onclick="showMap('${escapeHtml(String(r.latitude), true)}', '${escapeHtml(String(r.longitude), true)}', '${escapeHtml(r.location_name || 'Check-in Location', true)}', '${escapeHtml(studentName, true)}', '${escapeHtml(dateTime, true)}')">View Map</button>`;
        } else {
            locationText = `Manual: ${escapeHtml(r.location_name || 'N/A')}`;
        }

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(studentName)}</td>
            <td>${escapeHtml(r.session_type || 'N/A')}</td>
            <td>${locationText}</td>
            <td>${escapeHtml(dateTime)}</td>
            <td>${r.latitude ? 'Yes' : 'No'}</td>
            <td>
                ${mapButton}
                <button class="btn btn-delete" onclick="deleteAttendanceRecord('${escapeHtml(r.id, true)}')">Delete</button>
            </td>
        </tr>`;
    });
}

function filterAttendanceTable() {
    const filter = $('attendance-search')?.value.toUpperCase() || '';
    const trs = $('attendance-table')?.getElementsByTagName('tr') || [];

    for (let i = 0; i < trs.length; i++) {
        const td = trs[i].getElementsByTagName('td')[0];
        if (td) {
            const txtValue = td.textContent || td.innerText || '';
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                trs[i].style.display = "";
            } else {
                trs[i].style.display = "none";
            }
        }
    }
}

$('manual-attendance-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const student_id = $('att_student_id').value;
    const session_type = $('att_session_type').value;
    const course_id = $('att_course_id').value || null;
    const department = $('att_department')?.value || '';
    const location_name = $('att_location').value.trim() || department || 'Manual Entry';
    const date = $('att_date').value;
    const time = $('att_time').value;

    const check_in_time = time ? `${date}T${time}:00.000Z` : `${date}T00:00:00.000Z`;

    const record = {
        student_id,
        session_type,
        course_id,
        location_name,
        check_in_time,
        ip_address: await getIPAddress(),
        device_id: getDeviceId(),
    };

    try {
        const { error } = await sb.from('geo_attendance_logs').insert([record]);

        if (error) {
            showFeedback(`Manual Mark Error: ${error.message}`, 'error');
        } else {
            showFeedback('Manual attendance marked successfully!', 'success');
            e.target.reset();
            await loadAttendance();
            await loadDashboardData();
        }
    } catch (err) {
        console.error('manual attendance error:', err);
        showFeedback(`Manual Mark Error: ${err.message || err}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

async function markMyAttendance() {
    const button = document.querySelector('.btn-attendance');
    if (!button) return;
    const originalText = button.textContent;
    setButtonLoading(button, true, 'Getting Location...');

    try {
        const coords = await getGeoLocation();
        const { latitude, longitude, accuracy } = coords;

        const location_name = await reverseGeocode(latitude, longitude);

        const record = {
            student_id: currentUserProfile.id,
            session_type: 'office',
            location_name,
            latitude,
            longitude,
            accuracy,
            check_in_time: new Date().toISOString(),
            ip_address: await getIPAddress(),
            device_id: getDeviceId(),
        };

        const { error } = await sb.from('geo_attendance_logs').insert([record]);

        if (error) {
            showFeedback(`Geo-Log Error: ${error.message}`, 'error');
        } else {
            showFeedback(`Your location successfully logged at: ${location_name}`, 'success');
            await loadAttendance();
            await loadDashboardData();
        }
    } catch (error) {
        showFeedback(`Failed to get location: ${error.message}`, 'error');
    }

    setButtonLoading(button, false, originalText);
}

async function deleteAttendanceRecord(recordId) {
    if (!confirm('Are you sure you want to delete this attendance record?')) return;

    const { error } = await sb.from('geo_attendance_logs').delete().eq('id', recordId);

    if (error) {
        showFeedback(`Failed to delete record: ${error.message}`, 'error');
    } else {
        showFeedback('Attendance record deleted successfully!');
        await loadAttendance();
        await loadDashboardData();
    }
}

function showMap(lat, lng, locationName, studentName, dateTime) {
    const modal = $('mapModal');
    if (!modal) return;
    modal.style.display = 'flex';

    $('mapInfo').innerHTML = `<strong>Student:</strong> ${escapeHtml(studentName)} | <strong>Time:</strong> ${escapeHtml(dateTime)} | <strong>Location:</strong> ${escapeHtml(locationName)}`;

    if (attendanceMap) {
        attendanceMap.remove();
        attendanceMap = null;
    }

    const mapElement = $('attendanceMap');
    if (!mapElement) return;
    mapElement.style.visibility = 'visible';

    attendanceMap = L.map('attendanceMap').setView([parseFloat(lat), parseFloat(lng)], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(attendanceMap);

    L.marker([parseFloat(lat), parseFloat(lng)])
        .addTo(attendanceMap)
        .bindPopup(`<b>${escapeHtml(studentName)}</b><br>${escapeHtml(locationName)}`).openPopup();

    setTimeout(() => {
        try { attendanceMap.invalidateSize(); } catch (e) { /* ignore */ }
    }, 100);
}

/*******************************************************
 * 5. CATS / Exams Tab
 *******************************************************/
async function loadExams() {
    const tbody = $('exams-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8">Loading exams...</td></tr>';

    const { data: exams, error } = await fetchData(
        'cats_exams',
        '*, course:course_id(course_name)',
        {},
        'exam_date',
        false
    );

    if (error) {
        tbody.innerHTML = `<tr><td colspan="8">Error loading exams: ${escapeHtml(error.message)}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    (exams || []).forEach(e => {
        const courseName = e.course?.course_name || 'N/A';
        const examDate = e.exam_date ? new Date(e.exam_date).toLocaleDateString() : 'N/A';
        const intake = e.intake || e.exam_intake || 'N/A';
        const block = e.block || e.exam_block || 'N/A';

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(e.program_type)}</td>
            <td>${escapeHtml(courseName)}</td>
            <td>${escapeHtml(e.exam_title)}</td>
            <td>${escapeHtml(examDate)}</td>
            <td>${escapeHtml(e.exam_status)}</td>
            <td>${escapeHtml(intake)}</td>
            <td>${escapeHtml(block)}</td>
            <td>
                <button class="btn btn-delete" onclick="deleteExam('${escapeHtml(e.id, true)}')">Delete</button>
            </td>
        </tr>`;
    });
}

$('add-exam-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const exam_program = $('exam_program').value;
    const course_id = $('exam_course_id').value;
    const exam_title = $('exam_title').value.trim();
    const exam_date = $('exam_date').value;
    const exam_status = $('exam_status').value;
    const intake = $('exam_intake')?.value || null;
    const block = $('exam_block')?.value || null;

    try {
        const { error } = await sb.from('cats_exams').insert([{
            program_type: exam_program,
            course_id: course_id,
            exam_title: exam_title,
            exam_date: exam_date,
            exam_status: exam_status,
            intake,
            block
        }]);

        if (error) {
            showFeedback(`Failed to add exam: ${error.message}`, 'error');
        } else {
            showFeedback('Exam added successfully!', 'success');
            e.target.reset();
            await loadExams();
        }
    } catch (err) {
        console.error('add exam error:', err);
        showFeedback(`Failed to add exam: ${err.message || err}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

async function deleteExam(examId) {
    if (!confirm('Are you sure you want to delete this exam/CAT?')) return;

    const { error } = await sb.from('cats_exams').delete().eq('id', examId);

    if (error) {
        showFeedback(`Failed to delete exam: ${error.message}`, 'error');
    } else {
        showFeedback('Exam deleted successfully!');
        await loadExams();
    }
}

/*******************************************************
 * 6. Messages Tab
 *******************************************************/
async function loadMessages() {
    const tbody = $('messages-table');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">Loading messages...</td></tr>';

    const { data: messages, error } = await fetchData('messages', '*', {}, 'created_at', false);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="3">Error loading messages: ${escapeHtml(error.message)}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    (messages || []).forEach(m => {
        const messageDate = m.created_at ? new Date(m.created_at).toLocaleString() : 'N/A';
        tbody.innerHTML += `<tr>
            <td>${escapeHtml(m.program_type)}</td>
            <td>${escapeHtml((m.message_body || '').substring(0, 200))}${(m.message_body && m.message_body.length > 100) ? '...' : ''}</td>
            <td>${escapeHtml(messageDate)}</td>
        </tr>`;
    });
}

$('send-message-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const program_type = $('msg_program').value;
    const message_body = $('msg_body').value.trim();

    if (!program_type || !message_body) {
        showFeedback('Please select a program and enter a message.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    try {
        const { error } = await sb.from('messages').insert([{
            sender_id: currentUserProfile.id,
            program_type,
            message_body,
        }]);

        if (error) {
            showFeedback(`Failed to send message: ${error.message}`, 'error');
        } else {
            showFeedback(`Message sent to ${program_type} students successfully!`, 'success');
            e.target.reset();
            await loadMessages();
        }
    } catch (err) {
        console.error('send message error:', err);
        showFeedback(`Failed to send message: ${err.message || err}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

/*******************************************************
 * 7. Resources Tab
 *******************************************************/
async function loadResources() {
    const tbody = $('resources-list');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Loading resources...</td></tr>';

    const { data: resources, error } = await fetchData('resources', '*', {}, 'created_at', false);

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error loading resources: ${escapeHtml(error.message)}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    (resources || []).forEach(r => {
        const uploadDate = r.created_at ? new Date(r.created_at).toLocaleDateString() : 'N/A';
        const fileUrl = r.file_url || '';
        const fileTitle = r.file_title || r.file_name || 'File';
        const intake = r.intake || 'N/A';
        const block = r.block || 'N/A';

        const fileNameLink = `<a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(fileTitle)}</a>`;

        tbody.innerHTML += `<tr>
            <td>${escapeHtml(r.program_type)}</td>
            <td>${fileNameLink}</td>
            <td>${escapeHtml(intake)}</td>
            <td>${escapeHtml(block)}</td>
            <td>${escapeHtml(r.uploaded_by_name || 'Admin')}</td>
            <td>${escapeHtml(uploadDate)}</td>
            <td>
                <button class="btn btn-delete" onclick="deleteResource('${escapeHtml(r.id, true)}', '${escapeHtml(r.file_name || '', true)}')">Delete</button>
            </td>
        </tr>`;
    });
}

async function uploadResource() {
    const submitButton = document.querySelector('#upload-resource-form button');
    if (!submitButton) return;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const fileInput = $('resourceFile');
    const program_type = $('resource_program')?.value;
    const file_title = $('resourceTitle')?.value.trim();
    const intake = $('resource_intake')?.value || null;
    const block = $('resource_block')?.value || null;

    if (!fileInput || !fileInput.files.length || !program_type || !file_title) {
        showFeedback('Please select a program, enter a title, and select a file.', 'error');
        setButtonLoading(submitButton, false, originalText);
        return;
    }

    const file = fileInput.files[0];
    const timestamp = Date.now();
    const fileNameSafe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${timestamp}_${fileNameSafe}`;
    const filePath = `${program_type}/${fileName}`;

    try {
        const { error: uploadError } = await sb.storage
            .from(RESOURCES_BUCKET)
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: publicData } = sb.storage
            .from(RESOURCES_BUCKET)
            .getPublicUrl(filePath);

        const publicUrl = publicData?.publicUrl || publicData?.public_url || '';

        const { error: dbError } = await sb.from('resources').insert([{
            program_type,
            file_name: fileName,
            file_title,
            file_url: publicUrl,
            uploaded_by_id: currentUserProfile.id,
            uploaded_by_name: currentUserProfile.full_name || 'Admin',
            intake,
            block
        }]);

        if (dbError) throw dbError;

        showFeedback(`Resource "${file_title}" uploaded successfully!`, 'success');
        document.getElementById('upload-resource-form').reset();
        await loadResources();
    } catch (e) {
        console.error('Resource upload error:', e);
        showFeedback(`Resource Upload Failed: ${e.message || e}`, 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
}

async function deleteResource(resourceId, fileName) {
    if (!confirm('Are you sure you want to delete this resource file and record?')) return;

    try {
        const { error: dbError } = await sb.from('resources').delete().eq('id', resourceId);

        if (dbError) throw dbError;

        // NOTE: Actual file deletion from storage should be handled server-side for security.
        showFeedback('Resource record deleted successfully!', 'success');
        await loadResources();
    } catch (e) {
        console.error('deleteResource error:', e);
        showFeedback(`Failed to delete resource: ${e.message || e}`, 'error');
    }
}

/*******************************************************
 * 8. Welcome Message Editor Tab
 *******************************************************/
async function loadStudentWelcomeMessage() {
    try {
        const targetElement = document.getElementById('student-welcome-message');
        if (!targetElement) return;

        const { data } = await sb
            .from(SETTINGS_TABLE)
            .select('value')
            .eq('key', MESSAGE_KEY)
            .maybeSingle();

        if (data && data.value) {
            targetElement.innerHTML = data.value;
        } else {
            targetElement.innerHTML = '<p style="color: gray;">(Welcome message not yet set.)</p>';
        }
    } catch (e) {
        console.error('Error in loadStudentWelcomeMessage:', e);
    }
}

async function loadWelcomeMessageForEdit() {
    const editor = $('welcome-message-editor');
    const preview = $('live-preview');
    if (!editor || !preview) return;

    await loadStudentWelcomeMessage();

    try {
        const { data } = await sb
            .from(SETTINGS_TABLE)
            .select('value')
            .eq('key', MESSAGE_KEY)
            .maybeSingle();

        if (data && data.value) {
            editor.value = data.value;
            preview.innerHTML = data.value;
        } else {
            const defaultMessage = '<h1>Welcome to the Student Portal!</h1><p>Customize this message here. <em>HTML is supported!</em></p>';
            editor.value = defaultMessage;
            preview.innerHTML = defaultMessage;
        }
    } catch (e) {
        console.error('Error loading message for edit:', e);
    }
}

// Update the live preview as admin types
$('welcome-message-editor')?.addEventListener('input', () => {
    const preview = $('live-preview');
    if (preview) preview.innerHTML = $('welcome-message-editor').value;
});

// Save the message to Supabase
$('edit-welcome-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    const newContent = $('welcome-message-editor').value;
    const statusDiv = $('editor-status');
    setButtonLoading(submitButton, true, originalText);

    try {
        const { error } = await sb
            .from(SETTINGS_TABLE)
            .upsert({ key: MESSAGE_KEY, value: newContent }, { onConflict: 'key' });

        if (error) throw error;

        if (statusDiv) {
            statusDiv.style.color = 'green';
            statusDiv.textContent = 'Welcome Message saved successfully!';
            setTimeout(() => { statusDiv.textContent = ''; }, 3000);
        }
        await loadStudentWelcomeMessage();
    } catch (e) {
        if (statusDiv) {
            statusDiv.style.color = 'red';
            statusDiv.textContent = 'Error saving message: ' + (e.message || e);
        }
        console.error(e);
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

// Basic modal close functionality for the course edit modal, map modal and student edit modal
window.onclick = function(event) {
    const courseModal = $('courseEditModal');
    const mapModal = $('mapModal');
    const studentModal = $('studentEditModal');
    if (event.target === courseModal) {
        courseModal.style.display = "none";
    }
    if (event.target === mapModal) {
        mapModal.style.display = "none";
    }
    if (event.target === studentModal) {
        studentModal.style.display = "none";
    }
}

/*******************************************************
 * Student Edit Modal functions (open + submit)
 ******************************************************/

/** Open student edit modal with data */
function openEditStudentModal(id, name = '', email = '', phone = '', program = '', intake = '', block = '') {
    const modal = $('studentEditModal');
    if (!modal) return;
    $('edit_student_id').value = id || '';
    $('edit_student_name').value = name || '';
    $('edit_student_email').value = email || '';
    $('edit_student_phone').value = phone || '';
    if ($('edit_student_program')) $('edit_student_program').value = program || '';
    if ($('edit_student_intake')) $('edit_student_intake').value = intake || '';
    if ($('edit_student_block')) $('edit_student_block').value = block || '';
    modal.style.display = 'flex';
}

/** helper to open modal from users-table edit button (which has only ID) */
async function openEditStudentModalFromUser(userId) {
    try {
        const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (error || !data) {
            showFeedback(`Could not load student: ${error?.message || 'Not found'}`, 'error');
            return;
        }
        openEditStudentModal(data.id, data.full_name, data.email, data.phone || '', data.program_type || data.program || '', data.intake || '', data.block || '');
    } catch (e) {
        console.error('openEditStudentModalFromUser error:', e);
    }
}

/** Handle the edit student form submission and updating profile fields */
$('edit-student-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = e.submitter;
    const originalText = submitButton.textContent;
    setButtonLoading(submitButton, true, originalText);

    const id = $('edit_student_id').value;
    const full_name = $('edit_student_name').value.trim();
    const email = $('edit_student_email').value.trim();
    const phone = $('edit_student_phone').value.trim();
    const program_type = $('edit_student_program')?.value || null;
    const intake = $('edit_student_intake')?.value || null;
    const block = $('edit_student_block')?.value || null;

    try {
        // Update profile record
        const { error } = await sb.from('profiles').update({
            full_name, email, phone, program_type, intake, block
        }).eq('id', id);

        if (error) throw error;

        showFeedback('Student profile updated successfully!');
        $('studentEditModal').style.display = 'none';
        await loadStudents();
        await loadAllUsers();
    } catch (err) {
        console.error('Error updating student:', err);
        showFeedback('Failed to update student: ' + (err.message || err), 'error');
    } finally {
        setButtonLoading(submitButton, false, originalText);
    }
});

/*******************************************************
 * Password Reset flow
 *
 * NOTE: Changing another user's password directly from the client
 * is NOT possible securely. We provide "Send password reset email" functionality.
 *******************************************************/
async function sendPasswordReset(email) {
    if (!confirm(`Send password reset email to ${email}?`)) return;

    try {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password.html'
        }); // this will send reset password email to that address

        if (error) {
            showFeedback(`Failed to send reset email: ${error.message}`, 'error');
        } else {
            showFeedback('Password reset email sent successfully (to the user).');
        }
    } catch (e) {
        console.error('sendPasswordReset error:', e);
        showFeedback('Failed to send reset email: ' + (e.message || e), 'error');
    }
}

/*******************************************************
 * Misc init
 *******************************************************/
document.addEventListener('DOMContentLoaded', initSession);
