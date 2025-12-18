// NurseIQ Admin Panel - SIMPLE WORKING VERSION

// ============================================
// REPLACE THESE WITH YOUR ACTUAL SUPABASE CREDENTIALS
// ============================================
const SUPABASE_URL = 'https://lwhtjozfsmbyihenfunw.supabase.co';  // CHANGE THIS
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';  // CHANGE THIS
// ============================================

// Initialize Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Global variables
let currentTab = 'dashboard';
let assessments = [];
let courses = [];
let users = [];

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Starting NurseIQ Admin Panel...');
    initializeAdmin();
});

async function initializeAdmin() {
    try {
        updateLoaderMessage('Connecting to database...');
        
        // Test connection
        await testConnection();
        
        // Show admin interface
        showAdminInterface();
        
        // Load initial data
        await loadInitialData();
        
        console.log('✅ Admin panel ready!');
        
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        showError('Failed to initialize', error.message);
    }
}

async function testConnection() {
    updateLoaderMessage('Testing database connection...');
    
    try {
        // Try to connect to medical_assessments table
        const { error } = await supabase
            .from('medical_assessments')
            .select('id')
            .limit(1);
        
        if (error && error.code !== 'PGRST116') {
            // Try courses table if assessments doesn't exist
            const { error: courseError } = await supabase
                .from('courses')
                .select('id')
                .limit(1);
            
            if (courseError) {
                throw new Error(`Database error: ${courseError.message}`);
            }
        }
        
        console.log('✅ Database connection successful');
        return true;
        
    } catch (error) {
        console.error('❌ Connection failed:', error);
        throw error;
    }
}

function showAdminInterface() {
    // Hide loader
    const loader = document.getElementById('config-loader');
    if (loader) {
        loader.style.display = 'none';
    }
    
    // Show admin container
    const container = document.querySelector('.admin-container');
    if (container) {
        container.style.display = 'block';
    }
    
    // Update status
    updateConnectionStatus('connected');
    
    // Setup event listeners
    setupEventListeners();
    
    showNotification('Connected to database!', 'success');
}

async function loadInitialData() {
    try {
        // Load data in sequence
        await loadDashboardData();
        await loadCourses();
        await loadAssessments();
        await loadUsers();
        
        console.log('✅ All data loaded');
        
    } catch (error) {
        console.error('❌ Error loading data:', error);
        showNotification('Some data failed to load', 'warning');
    }
}

function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            switchTab(tabId);
        });
    });
    
    // Search input
    const searchInput = document.getElementById('search-assessments');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterAssessments, 300));
    }
    
    // Filter changes
    ['filter-course', 'filter-difficulty', 'filter-status'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', filterAssessments);
        }
    });
    
    // User search
    const userSearch = document.getElementById('search-users');
    if (userSearch) {
        userSearch.addEventListener('input', debounce(filterUsers, 300));
    }
    
    // Form submissions
    const assessmentForm = document.getElementById('assessment-form');
    if (assessmentForm) {
        assessmentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveAssessment();
        });
    }
    
    const courseForm = document.getElementById('course-form');
    if (courseForm) {
        courseForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveCourse();
        });
    }
}

// ==================== DASHBOARD FUNCTIONS ====================
async function loadDashboardData() {
    try {
        // Load total assessments
        const { count: assessmentsCount } = await supabase
            .from('medical_assessments')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);
        
        document.getElementById('total-assessments').textContent = assessmentsCount || 0;
        
        // Load total courses
        const { count: coursesCount } = await supabase
            .from('courses')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'Active');
        
        document.getElementById('total-courses').textContent = coursesCount || 0;
        
        // Load active users (simplified)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: progress } = await supabase
            .from('user_assessment_progress')
            .select('user_id')
            .gte('completed_at', thirtyDaysAgo.toISOString());
        
        const uniqueUsers = new Set(progress?.map(u => u.user_id) || []);
        document.getElementById('active-users').textContent = uniqueUsers.size;
        
        // Load completion rate
        const { data: allProgress } = await supabase
            .from('user_assessment_progress')
            .select('is_correct');
        
        if (allProgress && allProgress.length > 0) {
            const correctCount = allProgress.filter(p => p.is_correct).length;
            const completionRate = Math.round((correctCount / allProgress.length) * 100);
            document.getElementById('completion-rate').textContent = `${completionRate}%`;
        }
        
        // Load recent activity
        await loadRecentActivity();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function loadRecentActivity() {
    try {
        const { data: activity } = await supabase
            .from('user_assessment_progress')
            .select(`
                completed_at,
                is_correct,
                medical_assessments!inner(topic)
            `)
            .order('completed_at', { ascending: false })
            .limit(10);
        
        const activityList = document.getElementById('activity-list');
        if (!activityList) return;
        
        if (!activity || activity.length === 0) {
            activityList.innerHTML = '<div class="activity-item">No recent activity</div>';
            return;
        }
        
        activityList.innerHTML = activity.map(item => `
            <div class="activity-item">
                <i class="fas fa-${item.is_correct ? 'check-circle' : 'times-circle'}"></i>
                <span>Question "${item.medical_assessments?.topic?.substring(0, 30) || 'unknown'}" was ${item.is_correct ? 'correct' : 'incorrect'}</span>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading activity:', error);
    }
}

// ==================== ASSESSMENTS FUNCTIONS ====================
async function loadAssessments() {
    try {
        const { data, error } = await supabase
            .from('medical_assessments')
            .select(`
                id,
                topic,
                course_id,
                difficulty,
                is_published,
                is_active,
                created_at,
                courses!inner(course_name)
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        assessments = data || [];
        renderAssessmentsTable();
        
        // Update course filter
        const courseFilter = document.getElementById('filter-course');
        if (courseFilter) {
            const courseNames = [...new Set(assessments
                .map(a => a.courses?.course_name)
                .filter(Boolean)
                .sort())];
            
            courseFilter.innerHTML = '<option value="all">All Courses</option>' +
                courseNames.map(name => `<option value="${name}">${name}</option>`).join('');
        }
        
        showNotification(`Loaded ${assessments.length} assessments`, 'success');
        
    } catch (error) {
        console.error('Error loading assessments:', error);
        showNotification('Failed to load assessments', 'error');
    }
}

function renderAssessmentsTable() {
    const tableBody = document.querySelector('#assessments-table tbody');
    if (!tableBody) return;
    
    if (assessments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No assessments found</td></tr>';
        return;
    }
    
    tableBody.innerHTML = assessments.map(assessment => {
        const date = new Date(assessment.created_at);
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        let statusBadge = '';
        if (!assessment.is_active) {
            statusBadge = '<span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">Inactive</span>';
        } else if (!assessment.is_published) {
            statusBadge = '<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">Draft</span>';
        } else {
            statusBadge = '<span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">Published</span>';
        }
        
        return `
            <tr>
                <td>${assessment.id.substring(0, 8)}...</td>
                <td>${assessment.topic || 'No topic'}</td>
                <td>${assessment.courses?.course_name || 'No course'}</td>
                <td>${assessment.difficulty || 'medium'}</td>
                <td>${statusBadge}</td>
                <td>${formattedDate}</td>
                <td>
                    <button onclick="editAssessment('${assessment.id}')" style="background: none; border: none; color: #4f46e5; cursor: pointer;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteAssessment('${assessment.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; margin-left: 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterAssessments() {
    const searchTerm = document.getElementById('search-assessments')?.value.toLowerCase() || '';
    const courseFilter = document.getElementById('filter-course')?.value || 'all';
    const difficultyFilter = document.getElementById('filter-difficulty')?.value || 'all';
    const statusFilter = document.getElementById('filter-status')?.value || 'all';
    
    const rows = document.querySelectorAll('#assessments-table tbody tr');
    
    rows.forEach(row => {
        if (row.cells.length < 7) return;
        
        const topic = row.cells[1].textContent.toLowerCase();
        const course = row.cells[2].textContent;
        const difficulty = row.cells[3].textContent.toLowerCase();
        const status = row.cells[4].textContent.toLowerCase();
        
        const matchesSearch = !searchTerm || topic.includes(searchTerm);
        const matchesCourse = courseFilter === 'all' || course === courseFilter;
        const matchesDifficulty = difficultyFilter === 'all' || difficulty.includes(difficultyFilter);
        const matchesStatus = statusFilter === 'all' || status.includes(statusFilter);
        
        row.style.display = matchesSearch && matchesCourse && matchesDifficulty && matchesStatus ? '' : 'none';
    });
}

async function saveAssessment() {
    try {
        const formData = {
            question_text: document.getElementById('question-text').value,
            course_id: document.getElementById('assessment-course').value,
            difficulty: document.getElementById('assessment-difficulty').value,
            topic: document.getElementById('assessment-topic').value || null,
            marks: parseInt(document.getElementById('assessment-marks').value) || 1,
            question_type: document.getElementById('assessment-type').value,
            is_published: document.getElementById('assessment-published').checked,
            is_active: true,
            curriculum: 'KRCHN',
            created_at: new Date().toISOString()
        };
        
        if (!formData.question_text || !formData.course_id) {
            showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        const { error } = await supabase
            .from('medical_assessments')
            .insert([formData]);
        
        if (error) throw error;
        
        showNotification('Assessment saved successfully!', 'success');
        closeModal();
        await loadAssessments();
        await loadDashboardData();
        
    } catch (error) {
        console.error('Error saving assessment:', error);
        showNotification('Failed to save assessment', 'error');
    }
}

// ==================== COURSES FUNCTIONS ====================
async function loadCourses() {
    try {
        const { data, error } = await supabase
            .from('courses')
            .select('*')
            .order('course_name');
        
        if (error) throw error;
        
        courses = data || [];
        renderCoursesTable();
        
        // Populate course dropdown in assessment form
        const courseSelect = document.getElementById('assessment-course');
        if (courseSelect) {
            courseSelect.innerHTML = '<option value="">Select Course</option>' +
                courses
                    .filter(c => c.status === 'Active')
                    .map(course => `
                        <option value="${course.id}">
                            ${course.course_name} (${course.unit_code || 'No code'})
                        </option>
                    `).join('');
        }
        
    } catch (error) {
        console.error('Error loading courses:', error);
        showNotification('Failed to load courses', 'error');
    }
}

function renderCoursesTable() {
    const tableBody = document.querySelector('#courses-table tbody');
    if (!tableBody) return;
    
    if (courses.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No courses found</td></tr>';
        return;
    }
    
    tableBody.innerHTML = courses.map(course => {
        return `
            <tr>
                <td>${course.id.substring(0, 8)}...</td>
                <td>${course.course_name}</td>
                <td>${course.unit_code || 'N/A'}</td>
                <td>${course.target_program || 'All'}</td>
                <td>${course.intake_year || 'All'}</td>
                <td>
                    <span style="background: ${course.status === 'Active' ? '#10b981' : '#ef4444'}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">
                        ${course.status}
                    </span>
                </td>
                <td>
                    <button onclick="editCourse('${course.id}')" style="background: none; border: none; color: #4f46e5; cursor: pointer;">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function saveCourse() {
    try {
        const formData = {
            course_name: document.getElementById('course-name').value,
            unit_code: document.getElementById('course-code').value,
            color: document.getElementById('course-color').value,
            description: document.getElementById('course-description').value || null,
            target_program: document.getElementById('course-program').value || null,
            intake_year: parseInt(document.getElementById('course-year').value) || null,
            status: 'Active',
            created_at: new Date().toISOString()
        };
        
        if (!formData.course_name || !formData.unit_code) {
            showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        const { error } = await supabase
            .from('courses')
            .insert([formData]);
        
        if (error) throw error;
        
        showNotification('Course saved successfully!', 'success');
        closeModal();
        await loadCourses();
        await loadDashboardData();
        
    } catch (error) {
        console.error('Error saving course:', error);
        showNotification('Failed to save course', 'error');
    }
}

// ==================== USERS FUNCTIONS ====================
async function loadUsers() {
    try {
        // Try to load users from profiles table
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .limit(50);
        
        if (error) {
            console.warn('Could not load users:', error.message);
            users = [];
            return;
        }
        
        users = data || [];
        renderUsersTable();
        
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function renderUsersTable() {
    const tableBody = document.querySelector('#users-table tbody');
    if (!tableBody) return;
    
    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No users found</td></tr>';
        return;
    }
    
    tableBody.innerHTML = users.map(user => {
        return `
            <tr>
                <td>
                    <div>
                        <strong>${user.full_name || 'Unknown User'}</strong>
                        <div style="color: #6b7280; font-size: 12px;">${user.email || ''}</div>
                    </div>
                </td>
                <td>${user.program || user.department || 'N/A'}</td>
                <td>0</td>
                <td>0%</td>
                <td>0m</td>
                <td>Never</td>
                <td>
                    <button onclick="viewUserProgress('${user.id}')" style="background: none; border: none; color: #4f46e5; cursor: pointer;">
                        <i class="fas fa-chart-line"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterUsers() {
    const searchTerm = document.getElementById('search-users')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('#users-table tbody tr');
    
    rows.forEach(row => {
        if (row.cells.length < 7) return;
        
        const userName = row.cells[0].textContent.toLowerCase();
        const matches = !searchTerm || userName.includes(searchTerm);
        row.style.display = matches ? '' : 'none';
    });
}

// ==================== UTILITY FUNCTIONS ====================
function switchTab(tabId) {
    currentTab = tabId;
    
    // Update active tab button
    document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    
    // Update active tab content
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabId}-tab`).classList.add('active');
}

function updateLoaderMessage(message) {
    const messageEl = document.getElementById('loader-message');
    if (messageEl) {
        messageEl.textContent = message;
    }
}

function updateConnectionStatus(status) {
    const indicator = document.querySelector('.status-indicator');
    if (indicator) {
        const dot = indicator.querySelector('.status-dot');
        const text = indicator.querySelector('span:last-child');
        
        if (dot) {
            dot.className = 'status-dot';
            dot.classList.add(status);
        }
        
        if (text) {
            text.textContent = status === 'connected' ? 'Connected' : 'Error';
        }
    }
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    `;
    
    notification.innerHTML = `
        <div>
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span style="margin-left: 10px;">${message}</span>
        </div>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer;">
            &times;
        </button>
    `;
    
    container.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function showError(title, message) {
    const loader = document.getElementById('config-loader');
    if (loader) {
        loader.innerHTML = `
            <div style="text-align: center; color: white; max-width: 500px; padding: 40px;">
                <div style="font-size: 60px; color: #ff6b6b; margin-bottom: 20px;">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3 style="margin-bottom: 10px;">${title}</h3>
                <p style="margin-bottom: 30px;">${message}</p>
                <div>
                    <button onclick="location.reload()" style="background: white; color: #4f46e5; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-right: 10px;">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                    <button onclick="showHelp()" style="background: transparent; color: white; border: 1px solid white; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
                        <i class="fas fa-question-circle"></i> Get Help
                    </button>
                </div>
            </div>
        `;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== MODAL FUNCTIONS ====================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
    
    // Reset forms
    const forms = ['assessment-form', 'course-form'];
    forms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) form.reset();
    });
}

function openAddAssessmentModal() {
    openModal('add-assessment-modal');
}

function openAddCourseModal() {
    openModal('add-course-modal');
}

// ==================== PLACEHOLDER FUNCTIONS ====================
function openImportModal() {
    showNotification('Import feature coming soon!', 'info');
}

function generateReport() {
    showNotification('Report generation coming soon!', 'info');
}

function testConnection() {
    showNotification('Connection test coming soon!', 'info');
}

function showConnectionDetails() {
    alert(`Connection Details:\nURL: ${SUPABASE_URL}\nKey: ${SUPABASE_KEY.substring(0, 20)}...`);
}

function clearCache() {
    localStorage.clear();
    showNotification('Cache cleared!', 'success');
}

function exportData() {
    showNotification('Export feature coming soon!', 'info');
}

function resetSettings() {
    if (confirm('Reset all settings?')) {
        localStorage.clear();
        location.reload();
    }
}

function refreshAssessments() {
    loadAssessments();
}

function refreshCourses() {
    loadCourses();
}

function refreshUsers() {
    loadUsers();
}

function editAssessment(id) {
    showNotification(`Edit assessment ${id.substring(0, 8)}...`, 'info');
}

function deleteAssessment(id) {
    if (confirm('Delete this assessment?')) {
        showNotification(`Deleted assessment ${id.substring(0, 8)}...`, 'success');
    }
}

function editCourse(id) {
    showNotification(`Edit course ${id.substring(0, 8)}...`, 'info');
}

function viewUserProgress(id) {
    showNotification(`View user ${id.substring(0, 8)}...`, 'info');
}

function showHelp() {
    alert(`
HOW TO SETUP NURSEIQ ADMIN:

1. Replace the Supabase credentials at the TOP of admin-script.js:
   - SUPABASE_URL: Your Supabase project URL
   - SUPABASE_KEY: Your Supabase anon key

2. Get your credentials from:
   - Supabase Dashboard → Project Settings → API
   - Copy "Project URL" and "anon public" key

3. Save the files and open nurseiq-admin.html in your browser

Need help? Contact support.
    `);
}

// Make functions available globally
window.openAddAssessmentModal = openAddAssessmentModal;
window.openAddCourseModal = openAddCourseModal;
window.openImportModal = openImportModal;
window.generateReport = generateReport;
window.testConnection = testConnection;
window.showConnectionDetails = showConnectionDetails;
window.clearCache = clearCache;
window.exportData = exportData;
window.resetSettings = resetSettings;
window.refreshAssessments = refreshAssessments;
window.refreshCourses = refreshCourses;
window.refreshUsers = refreshUsers;
window.closeModal = closeModal;
window.editAssessment = editAssessment;
window.deleteAssessment = deleteAssessment;
window.editCourse = editCourse;
window.viewUserProgress = viewUserProgress;
window.showHelp = showHelp;
