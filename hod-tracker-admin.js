// Supabase Configuration
const supabaseUrl = 'https://lwhtjozfsmbyihenfunw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk';

let supabase;
let currentAdmin = null;
let allTrackers = [];
let currentPage = 1;
const itemsPerPage = 10;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeAdminApp();
});

// Initialize Admin Application
async function initializeAdminApp() {
    try {
        // Initialize Supabase
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        
        // Check authentication
        await checkAdminAuth();
        
        // Load all data
        await loadAllData();
        
        // Initialize charts
        initializeCharts();
        
        // Set up event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('Error initializing admin app:', error);
        showError('Failed to initialize admin panel');
    }
}

// Check Admin Authentication
async function checkAdminAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        // Redirect to login
        window.location.href = 'admin-login.html';
        return;
    }
    
    currentAdmin = session.user;
    
    // Verify admin role (you need to implement this based on your user roles)
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentAdmin.id)
        .single();
    
    if (!profile || profile.role !== 'superadmin') {
        alert('Unauthorized access. Redirecting...');
        window.location.href = 'index.html';
    }
    
    document.getElementById('adminName').textContent = session.user.email;
}

// Load All Data
async function loadAllData() {
    try {
        // Show loading state
        showLoading();
        
        // Load HODs and their trackers
        await loadAllTrackers();
        
        // Load department data
        await loadDepartments();
        
        // Load recent activity
        await loadRecentActivity();
        
        // Update dashboard
        updateDashboard();
        
        // Hide loading
        hideLoading();
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load data');
    }
}

// Load All HOD Trackers
async function loadAllTrackers() {
    try {
        // Fetch HOD profiles with their tracker data
        const { data: hods, error } = await supabase
            .from('hod_profiles')
            .select(`
                *,
                tracker_data:hod_tracker_data(
                    task_data,
                    last_updated,
                    progress
                )
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        allTrackers = hods.map(hod => ({
            id: hod.id,
            name: hod.full_name,
            department: hod.department,
            email: hod.email,
            employeeNumber: hod.employee_number,
            startDate: hod.start_date,
            trackerData: hod.tracker_data?.[0] || null,
            progress: hod.tracker_data?.[0]?.progress || 0,
            lastUpdated: hod.tracker_data?.[0]?.last_updated || hod.updated_at,
            status: calculateTrackerStatus(hod)
        }));
        
        // Render trackers table
        renderTrackersTable();
        
        // Update quick stats
        updateQuickStats();
        
    } catch (error) {
        console.error('Error loading trackers:', error);
        throw error;
    }
}

// Calculate Tracker Status
function calculateTrackerStatus(hod) {
    if (!hod.tracker_data || hod.tracker_data.length === 0) {
        return 'not-started';
    }
    
    const tracker = hod.tracker_data[0];
    const progress = tracker.progress || 0;
    
    if (progress >= 100) return 'completed';
    
    const startDate = new Date(hod.start_date);
    const today = new Date();
    const daysPassed = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    
    if (daysPassed > 90 && progress < 100) return 'overdue';
    if (progress > 0) return 'active';
    
    return 'not-started';
}

// Render Trackers Table
function renderTrackersTable() {
    const tbody = document.getElementById('trackersList');
    tbody.innerHTML = '';
    
    const filteredTrackers = filterTrackers();
    const paginatedTrackers = paginateTrackers(filteredTrackers);
    
    paginatedTrackers.forEach(tracker => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <input type="checkbox" class="tracker-checkbox" 
                       value="${tracker.id}" onchange="updateBulkActions()">
            </td>
            <td>
                <strong>${tracker.name}</strong>
                <div class="text-muted">${tracker.employeeNumber}</div>
            </td>
            <td>${tracker.department}</td>
            <td>${tracker.email}</td>
            <td>
                <div class="progress-container">
                    <div class="progress-bar small">
                        <div class="progress-fill" 
                             style="width: ${tracker.progress}%"></div>
                    </div>
                    <span>${Math.round(tracker.progress)}%</span>
                </div>
            </td>
            <td>
                ${calculateDaysRemaining(tracker.startDate)}
            </td>
            <td>
                ${formatDate(tracker.lastUpdated)}
            </td>
            <td>
                <span class="status-badge status-${getStatusClass(tracker.status)}">
                    ${getStatusText(tracker.status)}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn" title="Edit" 
                            onclick="editTracker('${tracker.id}')">
                        <i>✏️</i>
                    </button>
                    <button class="action-btn" title="View" 
                            onclick="viewTracker('${tracker.id}')">
                        <i>👁️</i>
                    </button>
                    <button class="action-btn" title="Export" 
                            onclick="exportTracker('${tracker.id}')">
                        <i>📤</i>
                    </button>
                    <button class="action-btn" title="Delete" 
                            onclick="deleteTracker('${tracker.id}')">
                        <i>🗑️</i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    renderPagination(filteredTrackers.length);
}

// Edit Tracker
async function editTracker(trackerId) {
    try {
        // Open the main tracker in edit mode
        const editUrl = `hod-tracker.html?edit_hod_id=${trackerId}&admin_mode=true`;
        window.open(editUrl, '_blank');
        
        // Log admin action
        await logAdminAction('edit_tracker', trackerId);
        
    } catch (error) {
        console.error('Error editing tracker:', error);
        showError('Failed to open tracker for editing');
    }
}

// View Tracker
function viewTracker(trackerId) {
    const viewUrl = `hod-tracker.html?view_hod_id=${trackerId}&admin_mode=true`;
    window.open(viewUrl, '_blank');
}

// Export Tracker
async function exportTracker(trackerId) {
    try {
        const tracker = allTrackers.find(t => t.id === trackerId);
        if (!tracker) throw new Error('Tracker not found');
        
        // Fetch full tracker data
        const { data: trackerData } = await supabase
            .from('hod_tracker_data')
            .select('*')
            .eq('user_id', trackerId)
            .single();
        
        // Create export object
        const exportData = {
            metadata: {
                exportedAt: new Date().toISOString(),
                exportedBy: currentAdmin.email,
                hodName: tracker.name,
                department: tracker.department
            },
            profile: {
                name: tracker.name,
                department: tracker.department,
                email: tracker.email,
                employeeNumber: tracker.employeeNumber,
                startDate: tracker.startDate
            },
            trackerData: trackerData?.task_data || {},
            progress: tracker.progress,
            lastUpdated: tracker.lastUpdated
        };
        
        // Download as JSON
        downloadJSON(exportData, `hod-tracker-${tracker.name}-${Date.now()}.json`);
        
        await logAdminAction('export_tracker', trackerId);
        
    } catch (error) {
        console.error('Error exporting tracker:', error);
        showError('Failed to export tracker');
    }
}

// Delete Tracker
async function deleteTracker(trackerId) {
    if (!confirm('Are you sure you want to delete this tracker? This action cannot be undone.')) {
        return;
    }
    
    try {
        // Delete tracker data
        const { error: trackerError } = await supabase
            .from('hod_tracker_data')
            .delete()
            .eq('user_id', trackerId);
        
        if (trackerError) throw trackerError;
        
        // Delete HOD profile
        const { error: profileError } = await supabase
            .from('hod_profiles')
            .delete()
            .eq('id', trackerId);
        
        if (profileError) throw profileError;
        
        // Update UI
        allTrackers = allTrackers.filter(t => t.id !== trackerId);
        renderTrackersTable();
        updateDashboard();
        
        showSuccess('Tracker deleted successfully');
        
        await logAdminAction('delete_tracker', trackerId);
        
    } catch (error) {
        console.error('Error deleting tracker:', error);
        showError('Failed to delete tracker');
    }
}

// Bulk Actions
function updateBulkActions() {
    const selectedCount = document.querySelectorAll('.tracker-checkbox:checked').length;
    const bulkActions = document.getElementById('bulkActions');
    const selectedCountSpan = document.getElementById('selectedCount');
    
    if (selectedCount > 0) {
        bulkActions.style.display = 'block';
        selectedCountSpan.textContent = `${selectedCount} item${selectedCount > 1 ? 's' : ''} selected`;
    } else {
        bulkActions.style.display = 'none';
    }
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.tracker-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    updateBulkActions();
}

async function sendBulkNotification() {
    const selectedIds = getSelectedTrackerIds();
    if (selectedIds.length === 0) return;
    
    const message = prompt('Enter notification message:');
    if (!message) return;
    
    try {
        // Send notifications to selected HODs
        for (const trackerId of selectedIds) {
            await supabase
                .from('notifications')
                .insert({
                    user_id: trackerId,
                    message: message,
                    type: 'admin_reminder',
                    created_by: currentAdmin.id
                });
        }
        
        showSuccess(`Notification sent to ${selectedIds.length} HOD(s)`);
        
    } catch (error) {
        console.error('Error sending notifications:', error);
        showError('Failed to send notifications');
    }
}

// Update Dashboard
function updateDashboard() {
    // Update summary cards
    document.getElementById('totalHods').textContent = allTrackers.length;
    
    const avgProgress = allTrackers.length > 0 
        ? allTrackers.reduce((sum, t) => sum + (t.progress || 0), 0) / allTrackers.length
        : 0;
    document.getElementById('overallProgress').textContent = `${Math.round(avgProgress)}%`;
    document.getElementById('overallProgressBar').style.width = `${avgProgress}%`;
    
    const totalTasks = allTrackers.reduce((sum, t) => 
        sum + (t.trackerData?.task_data?.statistics?.totalTasks || 0), 0);
    const completedTasks = allTrackers.reduce((sum, t) => 
        sum + (t.trackerData?.task_data?.statistics?.completedTasks || 0), 0);
    
    document.getElementById('totalTasksCompleted').textContent = 
        `${completedTasks}/${totalTasks}`;
    
    const overdueTasks = allTrackers.filter(t => t.status === 'overdue').length;
    document.getElementById('overdueTasks').textContent = overdueTasks;
    
    // Update quick stats
    document.getElementById('quickActiveHods').textContent = 
        allTrackers.filter(t => t.status === 'active').length;
    document.getElementById('quickAvgProgress').textContent = `${Math.round(avgProgress)}%`;
}

// Initialize Charts
function initializeCharts() {
    // Department Progress Chart
    const deptCtx = document.getElementById('departmentProgressChart').getContext('2d');
    new Chart(deptCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Average Progress',
                data: [],
                backgroundColor: '#1a237e'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// Navigation
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.add('active');
    
    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${sectionId}`) {
            link.classList.add('active');
        }
    });
}

// Helper Functions
function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function calculateDaysRemaining(startDate) {
    if (!startDate) return 'N/A';
    const start = new Date(startDate);
    const today = new Date();
    const daysPassed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
    const daysLeft = Math.max(0, 90 - daysPassed);
    return `${daysLeft} days`;
}

function getStatusClass(status) {
    const statusMap = {
        'active': 'active',
        'completed': 'completed',
        'overdue': 'overdue',
        'not-started': 'overdue'
    };
    return statusMap[status] || 'active';
}

function getStatusText(status) {
    const textMap = {
        'active': 'Active',
        'completed': 'Completed',
        'overdue': 'Overdue',
        'not-started': 'Not Started'
    };
    return textMap[status] || 'Active';
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showLoading() {
    // Implement loading indicator
}

function hideLoading() {
    // Hide loading indicator
}

function showSuccess(message) {
    // Show success notification
    alert(message); // Replace with better notification
}

function showError(message) {
    // Show error notification
    alert(`Error: ${message}`); // Replace with better notification
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// Initialize app
initializeAdminApp();
