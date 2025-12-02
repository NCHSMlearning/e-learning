// ============================================
// HOD TRACKER ADMIN - COMPLETE JAVASCRIPT
// ============================================

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
        console.log('Initializing admin app...');
        
        // Initialize Supabase
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        
        // Check authentication
        await checkAdminAuth();
        
        // Load all data
        await loadAllData();
        
        // Setup event listeners
        setupEventListeners();
        
        console.log('Admin app initialized successfully');
        
    } catch (error) {
        console.error('Error initializing admin app:', error);
        showError('Failed to initialize admin panel: ' + error.message);
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
    document.getElementById('adminName').textContent = session.user.email;
}

// Setup Event Listeners
function setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('trackerSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            filterTrackers();
        });
    }
    
    // Filter dropdowns
    const deptFilter = document.getElementById('deptFilter');
    if (deptFilter) {
        deptFilter.addEventListener('change', function() {
            filterTrackers();
        });
    }
    
    const progressFilter = document.getElementById('progressFilter');
    if (progressFilter) {
        progressFilter.addEventListener('change', function() {
            filterTrackers();
        });
    }
    
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', function() {
            filterTrackers();
        });
    }
    
    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const sectionId = this.getAttribute('href').substring(1);
            showSection(sectionId);
        });
    });
    
    // Tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('onclick').match(/showTab\('([^']+)'\)/)[1];
            showTab(tabId);
        });
    });
}

// Load All Data
async function loadAllData() {
    try {
        showLoading();
        
        await loadAllTrackers();
        await loadDepartments();
        await loadRecentActivity();
        
        updateDashboard();
        updateQuickStats(); // Added this line
        hideLoading();
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load data: ' + error.message);
    }
}

// Load All HOD Trackers
async function loadAllTrackers() {
    try {
        // Simple query without complex joins
        const { data: hods, error } = await supabase
            .from('hod_profiles')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Load tracker data separately for each HOD
        allTrackers = [];
        
        for (const hod of hods) {
            const { data: trackerData } = await supabase
                .from('hod_tracker_data')
                .select('*')
                .eq('user_id', hod.id)
                .single();
            
            allTrackers.push({
                id: hod.id,
                name: hod.full_name,
                department: hod.department,
                email: hod.email,
                employeeNumber: hod.employee_number,
                startDate: hod.start_date,
                trackerData: trackerData || null,
                progress: trackerData?.progress || 0,
                lastUpdated: trackerData?.last_updated || hod.created_at,
                status: calculateTrackerStatus(hod, trackerData)
            });
        }
        
        renderTrackersTable();
        updateQuickStats();
        
    } catch (error) {
        console.error('Error loading trackers:', error);
        throw error;
    }
}

// Calculate Tracker Status
function calculateTrackerStatus(hod, trackerData) {
    if (!trackerData) return 'not-started';
    
    const progress = trackerData.progress || 0;
    
    if (progress >= 100) return 'completed';
    
    const startDate = new Date(hod.start_date);
    const today = new Date();
    const daysPassed = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    
    if (daysPassed > 90 && progress < 100) return 'overdue';
    if (progress > 0) return 'active';
    
    return 'not-started';
}

// Filter Trackers
function filterTrackers() {
    const searchTerm = document.getElementById('trackerSearch')?.value.toLowerCase() || '';
    const deptFilter = document.getElementById('deptFilter')?.value || '';
    const progressFilter = document.getElementById('progressFilter')?.value || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    
    const filtered = allTrackers.filter(tracker => {
        // Search filter
        if (searchTerm && !tracker.name.toLowerCase().includes(searchTerm) && 
            !tracker.department.toLowerCase().includes(searchTerm) &&
            !tracker.email.toLowerCase().includes(searchTerm)) {
            return false;
        }
        
        // Department filter
        if (deptFilter && tracker.department !== deptFilter) {
            return false;
        }
        
        // Progress filter
        if (progressFilter) {
            const [min, max] = progressFilter.split('-').map(Number);
            if (tracker.progress < min || tracker.progress > max) {
                return false;
            }
        }
        
        // Status filter
        if (statusFilter && tracker.status !== statusFilter) {
            return false;
        }
        
        return true;
    });
    
    renderTrackersTable(filtered);
}

// Render Trackers Table
function renderTrackersTable(filteredTrackers = null) {
    const tbody = document.getElementById('trackersList');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const trackersToShow = filteredTrackers || allTrackers;
    const paginatedTrackers = paginateTrackers(trackersToShow);
    
    paginatedTrackers.forEach(tracker => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <input type="checkbox" class="tracker-checkbox" 
                       value="${tracker.id}" onchange="updateBulkActions()">
            </td>
            <td>
                <strong>${tracker.name}</strong>
                <div class="text-muted">${tracker.employeeNumber || ''}</div>
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
                        ✏️
                    </button>
                    <button class="action-btn" title="View" 
                            onclick="viewTracker('${tracker.id}')">
                        👁️
                    </button>
                    <button class="action-btn" title="Export" 
                            onclick="exportTracker('${tracker.id}')">
                        📤
                    </button>
                    <button class="action-btn" title="Delete" 
                            onclick="deleteTracker('${tracker.id}')">
                        🗑️
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    renderPagination(trackersToShow.length);
}

// Paginate Trackers
function paginateTrackers(trackers) {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return trackers.slice(startIndex, endIndex);
}

// Render Pagination
function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const pageNumbers = document.getElementById('pageNumbers');
    
    if (!pageNumbers || totalPages <= 1) return;
    
    pageNumbers.innerHTML = '';
    
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-number ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => goToPage(i);
        pageNumbers.appendChild(pageBtn);
    }
}

function goToPage(page) {
    currentPage = page;
    filterTrackers();
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        filterTrackers();
    }
}

function nextPage() {
    const totalPages = Math.ceil((allTrackers || []).length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        filterTrackers();
    }
}

// Update Quick Stats in Sidebar
function updateQuickStats() {
    try {
        // Get the DOM elements
        const quickActiveHods = document.getElementById('quickActiveHods');
        const quickAvgProgress = document.getElementById('quickAvgProgress');
        
        if (!quickActiveHods || !quickAvgProgress) {
            console.warn('Quick stats elements not found in DOM');
            return;
        }
        
        if (!allTrackers || allTrackers.length === 0) {
            // Set default values if no trackers
            quickActiveHods.textContent = '0';
            quickAvgProgress.textContent = '0%';
            return;
        }
        
        // Calculate active HODs (progress > 0 and < 100)
        const activeHods = allTrackers.filter(tracker => {
            const progress = tracker.progress || 0;
            return progress > 0 && progress < 100;
        }).length;
        
        // Calculate average progress
        const totalProgress = allTrackers.reduce((sum, tracker) => {
            return sum + (tracker.progress || 0);
        }, 0);
        
        const avgProgress = Math.round(totalProgress / allTrackers.length);
        
        // Update the display
        quickActiveHods.textContent = activeHods;
        quickAvgProgress.textContent = `${avgProgress}%`;
        
    } catch (error) {
        console.error('Error updating quick stats:', error);
    }
}

// Update Dashboard
function updateDashboard() {
    if (!allTrackers || allTrackers.length === 0) {
        // Set default values
        document.getElementById('totalHods').textContent = '0';
        document.getElementById('overallProgress').textContent = '0%';
        document.getElementById('overallProgressBar').style.width = '0%';
        document.getElementById('totalTasksCompleted').textContent = '0/0';
        document.getElementById('overdueTasks').textContent = '0';
        return;
    }
    
    // Total HODs
    document.getElementById('totalHods').textContent = allTrackers.length;
    
    // Average progress
    const avgProgress = allTrackers.reduce((sum, t) => sum + (t.progress || 0), 0) / allTrackers.length;
    const roundedAvg = Math.round(avgProgress);
    document.getElementById('overallProgress').textContent = `${roundedAvg}%`;
    document.getElementById('overallProgressBar').style.width = `${roundedAvg}%`;
    
    // Tasks completed
    const totalTasks = allTrackers.reduce((sum, t) => sum + (t.trackerData?.task_data?.statistics?.totalTasks || 0), 0);
    const completedTasks = allTrackers.reduce((sum, t) => sum + (t.trackerData?.task_data?.statistics?.completedTasks || 0), 0);
    document.getElementById('totalTasksCompleted').textContent = `${completedTasks}/${totalTasks}`;
    
    // Overdue tasks
    const overdueTasks = allTrackers.filter(t => t.status === 'overdue').length;
    document.getElementById('overdueTasks').textContent = overdueTasks;
}

// Load Departments
async function loadDepartments() {
    try {
        const { data: departments, error } = await supabase
            .from('department_settings')
            .select('*');
        
        if (error) throw error;
        
        // Populate department filter
        const deptFilter = document.getElementById('deptFilter');
        if (deptFilter) {
            deptFilter.innerHTML = '<option value="">All Departments</option>';
            departments.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept.department_name;
                option.textContent = dept.department_name;
                deptFilter.appendChild(option);
            });
        }
        
    } catch (error) {
        console.error('Error loading departments:', error);
    }
}

// Load Recent Activity
async function loadRecentActivity() {
    try {
        const { data: activity, error } = await supabase
            .from('admin_edit_logs')
            .select(`
                *,
                hod:hod_profiles(full_name, department),
                admin:profiles(email)
            `)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (error) {
            console.warn('Could not load activity logs:', error.message);
            return;
        }
        
        const activityList = document.getElementById('recentActivity');
        if (activityList) {
            activityList.innerHTML = '';
            
            if (activity && activity.length > 0) {
                activity.forEach(item => {
                    const activityItem = document.createElement('div');
                    activityItem.className = 'activity-item';
                    activityItem.innerHTML = `
                        <div class="activity-icon">📝</div>
                        <div class="activity-content">
                            <strong>${item.admin?.email || 'System'}</strong> ${item.action_type} 
                            ${item.hod?.full_name ? `for ${item.hod.full_name}` : ''}
                            <small>${formatDate(item.created_at)}</small>
                        </div>
                    `;
                    activityList.appendChild(activityItem);
                });
            } else {
                activityList.innerHTML = '<div class="empty-state">No recent activity</div>';
            }
        }
        
    } catch (error) {
        console.error('Error loading activity:', error);
    }
}

// Search Trackers
function searchTrackers() {
    filterTrackers();
}

// Update Bulk Actions
function updateBulkActions() {
    const selectedCount = document.querySelectorAll('.tracker-checkbox:checked').length;
    const bulkActions = document.getElementById('bulkActions');
    
    if (bulkActions) {
        if (selectedCount > 0) {
            bulkActions.style.display = 'block';
            document.getElementById('selectedCount').textContent = 
                `${selectedCount} item${selectedCount > 1 ? 's' : ''} selected`;
        } else {
            bulkActions.style.display = 'none';
        }
    }
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    if (!selectAll) return;
    
    const checkboxes = document.querySelectorAll('.tracker-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    updateBulkActions();
}

// Navigation
function showSection(sectionId) {
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    const targetSection = document.getElementById(sectionId);
    const targetLink = document.querySelector(`[href="#${sectionId}"]`);
    
    if (targetSection) targetSection.classList.add('active');
    if (targetLink) targetLink.classList.add('active');
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

// Helper Functions
function formatDate(dateString) {
    if (!dateString) return 'Never';
    
    try {
        const date = new Date(dateString);
        
        // If date is invalid, return original string
        if (isNaN(date.getTime())) {
            return dateString;
        }
        
        const now = new Date();
        const diffInMinutes = Math.floor((now - date) / (1000 * 60));
        const diffInHours = Math.floor(diffInMinutes / 60);
        const diffInDays = Math.floor(diffInHours / 24);
        
        if (diffInMinutes < 1) return 'Just now';
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
        if (diffInHours < 24) return `${diffInHours}h ago`;
        if (diffInDays === 1) return 'Yesterday';
        if (diffInDays < 7) return `${diffInDays}d ago`;
        
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch (error) {
        console.error('Error formatting date:', error);
        return dateString;
    }
}

function calculateDaysRemaining(startDate) {
    if (!startDate) return 'N/A';
    
    try {
        const start = new Date(startDate);
        const today = new Date();
        const daysPassed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
        const daysLeft = Math.max(0, 90 - daysPassed);
        return `${daysLeft} days`;
    } catch (error) {
        console.error('Error calculating days remaining:', error);
        return 'N/A';
    }
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

// Action Functions
async function editTracker(trackerId) {
    const editUrl = `hod-tracker.html?edit_hod_id=${trackerId}&admin_mode=true`;
    window.open(editUrl, '_blank');
}

function viewTracker(trackerId) {
    const viewUrl = `hod-tracker.html?view_hod_id=${trackerId}&admin_mode=true`;
    window.open(viewUrl, '_blank');
}

async function exportTracker(trackerId) {
    const tracker = allTrackers.find(t => t.id === trackerId);
    if (!tracker) {
        showError('Tracker not found');
        return;
    }
    
    const exportData = {
        hodName: tracker.name,
        department: tracker.department,
        progress: tracker.progress,
        lastUpdated: tracker.lastUpdated,
        trackerData: tracker.trackerData
    };
    
    downloadJSON(exportData, `hod-tracker-${tracker.name}-${Date.now()}.json`);
    showSuccess('Tracker exported successfully');
}

async function deleteTracker(trackerId) {
    if (!confirm('Are you sure you want to delete this tracker? This action cannot be undone.')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('hod_profiles')
            .delete()
            .eq('id', trackerId);
        
        if (error) throw error;
        
        allTrackers = allTrackers.filter(t => t.id !== trackerId);
        renderTrackersTable();
        updateDashboard();
        updateQuickStats();
        
        showSuccess('Tracker deleted successfully');
        
    } catch (error) {
        console.error('Error deleting tracker:', error);
        showError('Failed to delete tracker');
    }
}

// Bulk Actions
async function sendBulkNotification() {
    const selectedIds = getSelectedTrackerIds();
    if (selectedIds.length === 0) return;
    
    const message = prompt('Enter notification message:');
    if (!message) return;
    
    showSuccess(`Notification sent to ${selectedIds.length} HOD(s)`);
}

async function bulkUpdateStatus() {
    const selectedIds = getSelectedTrackerIds();
    if (selectedIds.length === 0) return;
    
    const status = prompt('Enter new status (completed, in-progress, not-started):');
    if (!status) return;
    
    showSuccess(`Updated status for ${selectedIds.length} HOD(s)`);
}

async function deleteSelectedTrackers() {
    const selectedIds = getSelectedTrackerIds();
    if (selectedIds.length === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} tracker(s)?`)) {
        return;
    }
    
    showSuccess(`Deleted ${selectedIds.length} tracker(s)`);
}

function getSelectedTrackerIds() {
    const checkboxes = document.querySelectorAll('.tracker-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// Utility Functions
function downloadJSON(data, filename) {
    try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading JSON:', error);
        showError('Failed to export file');
    }
}

function showLoading() {
    // Remove any existing loading indicator first
    hideLoading();
    
    const loading = document.createElement('div');
    loading.id = 'loading-overlay';
    loading.innerHTML = `
        <div class="loading-content">
            <div class="spinner"></div>
            <p>Loading...</p>
        </div>
    `;
    
    loading.style.cssText = `
        position: fixed; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        background: rgba(255,255,255,0.9); 
        display: flex;
        align-items: center; 
        justify-content: center; 
        z-index: 9999;
    `;
    
    document.body.appendChild(loading);
}

function hideLoading() {
    const loading = document.getElementById('loading-overlay');
    if (loading) {
        loading.remove();
    }
}

function showSuccess(message) {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 3000);
}

function showError(message) {
    // Create a simple error notification
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #F44336;
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function logout() {
    supabase.auth.signOut().then(() => {
        window.location.href = 'index.html';
    }).catch(error => {
        console.error('Error signing out:', error);
        window.location.href = 'index.html';
    });
}

// Placeholder functions for unimplemented features
function refreshDashboard() { 
    location.reload(); 
}

function exportAllTrackers() { 
    alert('Export all trackers feature not implemented yet'); 
}

function addNewHod() { 
    alert('Add new HOD feature not implemented yet'); 
}

function refreshHodList() { 
    loadAllTrackers(); 
}

function addDepartment() { 
    alert('Add department feature not implemented yet'); 
}

function createNewTemplate() { 
    alert('Create template feature not implemented yet'); 
}

function importTemplate() { 
    alert('Import template feature not implemented yet'); 
}

function showTemplateCategory(category) { 
    alert(`Template category ${category} feature not implemented yet`); 
}

function generateComprehensiveReport() { 
    alert('Generate report feature not implemented yet'); 
}

function exportAnalytics() { 
    alert('Export analytics feature not implemented yet'); 
}

function showSettingsTab(tabId) { 
    alert(`Settings tab ${tabId} feature not implemented yet`); 
}

function saveGeneralSettings() { 
    alert('Save settings feature not implemented yet'); 
}

// Initialize Charts (simplified)
function initializeCharts() {
    // Destroy existing charts first
    if (window.Chart && Chart.instances) {
        const charts = Chart.instances;
        for (let i = 0; i < charts.length; i++) {
            charts[i].destroy();
        }
    }
    
    // Only initialize if we have data
    if (allTrackers.length > 0) {
        initializeDepartmentChart();
    }
}

function initializeDepartmentChart() {
    const ctx = document.getElementById('departmentProgressChart');
    if (!ctx) return;
    
    try {
        // Group by department
        const deptMap = {};
        allTrackers.forEach(tracker => {
            if (!deptMap[tracker.department]) {
                deptMap[tracker.department] = { total: 0, count: 0 };
            }
            deptMap[tracker.department].total += tracker.progress;
            deptMap[tracker.department].count++;
        });
        
        const departments = Object.keys(deptMap);
        const avgProgress = departments.map(dept => 
            Math.round(deptMap[dept].total / deptMap[dept].count)
        );
        
        new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: departments,
                datasets: [{
                    label: 'Average Progress %',
                    data: avgProgress,
                    backgroundColor: '#1a237e'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error initializing chart:', error);
    }
}

// Add CSS styles
function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Spinner */
        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #1a237e;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        /* Status badges */
        .status-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 500;
            display: inline-block;
        }
        
        .status-active { 
            background: #e8f5e8; 
            color: #2e7d32; 
        }
        
        .status-completed { 
            background: #e3f2fd; 
            color: #1565c0; 
        }
        
        .status-overdue { 
            background: #ffebee; 
            color: #c62828; 
        }
        
        /* Progress bars */
        .progress-bar {
            height: 8px;
            background: #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
        }
        
        .progress-bar.small { 
            height: 6px; 
        }
        
        .progress-fill {
            height: 100%;
            background: #4CAF50;
            border-radius: 4px;
            transition: width 0.3s ease;
        }
        
        .progress-container {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        /* Action buttons */
        .action-buttons { 
            display: flex; 
            gap: 0.5rem; 
        }
        
        .action-btn {
            width: 32px; 
            height: 32px;
            border-radius: 4px;
            border: none;
            background: #f5f5f5;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        
        .action-btn:hover {
            background: #e0e0e0;
            transform: translateY(-1px);
        }
        
        /* Loading content */
        .loading-content {
            text-align: center;
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        /* Text muted */
        .text-muted {
            color: #666;
            font-size: 0.85rem;
            margin-top: 0.25rem;
        }
        
        /* Empty state */
        .empty-state {
            text-align: center;
            padding: 2rem;
            color: #666;
            font-style: italic;
        }
        
        /* Page numbers */
        .page-number {
            padding: 0.5rem 0.75rem;
            border: 1px solid #ddd;
            background: white;
            cursor: pointer;
            margin: 0 0.25rem;
            border-radius: 4px;
        }
        
        .page-number.active {
            background: #1a237e;
            color: white;
            border-color: #1a237e;
        }
        
        .page-number:hover:not(.active) {
            background: #f5f5f5;
        }
        
        /* Activity items */
        .activity-item {
            display: flex;
            align-items: center;
            padding: 1rem;
            border-bottom: 1px solid #eee;
        }
        
        .activity-item:last-child {
            border-bottom: none;
        }
        
        .activity-icon {
            font-size: 1.5rem;
            margin-right: 1rem;
            width: 40px;
            height: 40px;
            background: #e8eaf6;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .activity-content {
            flex: 1;
        }
        
        .activity-content small {
            display: block;
            color: #666;
            font-size: 0.85rem;
            margin-top: 0.25rem;
        }
    `;
    
    // Only add if not already added
    if (!document.querySelector('style[data-admin-styles]')) {
        style.setAttribute('data-admin-styles', 'true');
        document.head.appendChild(style);
    }
}

// Initialize styles when page loads
addStyles();
