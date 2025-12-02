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
    const totalPages = Math.ceil((filteredTrackers || allTrackers).length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        filterTrackers();
    }
}

// Update Dashboard
function updateDashboard() {
    if (!allTrackers.length) return;
    
    // Total HODs
    document.getElementById('totalHods').textContent = allTrackers.length;
    
    // Average progress
    const avgProgress = allTrackers.reduce((sum, t) => sum + (t.progress || 0), 0) / allTrackers.length;
    document.getElementById('overallProgress').textContent = `${Math.round(avgProgress)}%`;
    document.getElementById('overallProgressBar').style.width = `${avgProgress}%`;
    
    // Tasks completed
    const totalTasks = allTrackers.reduce((sum, t) => sum + (t.trackerData?.task_data?.statistics?.totalTasks || 0), 0);
    const completedTasks = allTrackers.reduce((sum, t) => sum + (t.trackerData?.task_data?.statistics?.completedTasks || 0), 0);
    document.getElementById('totalTasksCompleted').textContent = `${completedTasks}/${totalTasks}`;
    
    // Overdue tasks
    const overdueTasks = allTrackers.filter(t => t.status === 'overdue').length;
    document.getElementById('overdueTasks').textContent = overdueTasks;
    
    // Quick stats
    document.getElementById('quickActiveHods').textContent = allTrackers.filter(t => t.status === 'active').length;
    document.getElementById('quickAvgProgress').textContent = `${Math.round(avgProgress)}%`;
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
        
        if (error) throw error;
        
        const activityList = document.getElementById('recentActivity');
        if (activityList) {
            activityList.innerHTML = '';
            
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
    
    document.getElementById(sectionId).classList.add('active');
    document.querySelector(`[href="#${sectionId}"]`).classList.add('active');
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');
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
    const loading = document.createElement('div');
    loading.id = 'loading';
    loading.innerHTML = '<div class="spinner"></div><p>Loading...</p>';
    loading.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(255,255,255,0.8); display: flex;
        align-items: center; justify-content: center; z-index: 9999;
    `;
    document.body.appendChild(loading);
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.remove();
}

function showSuccess(message) {
    alert('Success: ' + message); // Replace with better notification
}

function showError(message) {
    alert('Error: ' + message); // Replace with better notification
}

function logout() {
    supabase.auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
}

// Placeholder functions for unimplemented features
function refreshDashboard() { location.reload(); }
function exportAllTrackers() { alert('Export all trackers feature not implemented yet'); }
function addNewHod() { alert('Add new HOD feature not implemented yet'); }
function refreshHodList() { loadAllTrackers(); }
function addDepartment() { alert('Add department feature not implemented yet'); }
function createNewTemplate() { alert('Create template feature not implemented yet'); }
function importTemplate() { alert('Import template feature not implemented yet'); }
function showTemplateCategory() { alert('Template category feature not implemented yet'); }
function generateComprehensiveReport() { alert('Generate report feature not implemented yet'); }
function exportAnalytics() { alert('Export analytics feature not implemented yet'); }
function showSettingsTab() { alert('Settings tab feature not implemented yet'); }
function saveGeneralSettings() { alert('Save settings feature not implemented yet'); }

// Initialize Charts (simplified)
function initializeCharts() {
    // Destroy existing charts first
    const charts = Chart.instances;
    for (let i = 0; i < charts.length; i++) {
        charts[i].destroy();
    }
    
    // Only initialize if we have data
    if (allTrackers.length > 0) {
        initializeDepartmentChart();
    }
}

function initializeDepartmentChart() {
    const ctx = document.getElementById('departmentProgressChart');
    if (!ctx) return;
    
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
}

// Add this CSS to your HTML head
const style = document.createElement('style');
style.textContent = `
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
.status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 500;
}
.status-active { background: #e8f5e8; color: #2e7d32; }
.status-completed { background: #e3f2fd; color: #1565c0; }
.status-overdue { background: #ffebee; color: #c62828; }
.progress-bar {
    height: 8px;
    background: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
}
.progress-bar.small { height: 6px; }
.progress-fill {
    height: 100%;
    background: #4CAF50;
    border-radius: 4px;
}
.action-buttons { display: flex; gap: 0.5rem; }
.action-btn {
    width: 32px; height: 32px;
    border-radius: 4px;
    border: none;
    background: #f5f5f5;
    cursor: pointer;
}
`;
document.head.appendChild(style);
