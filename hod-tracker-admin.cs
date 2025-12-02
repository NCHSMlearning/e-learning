* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: #f5f7fa;
    color: #333;
}

.admin-container {
    display: flex;
    min-height: 100vh;
}

/* Header Styles */
.admin-header {
    background: linear-gradient(135deg, #1a237e, #283593);
    color: white;
    padding: 1rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: fixed;
    width: 100%;
    top: 0;
    z-index: 100;
    height: 70px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
}

.admin-header-left h1 {
    font-size: 1.5rem;
    margin-bottom: 0.25rem;
}

.admin-header-left p {
    font-size: 0.9rem;
    opacity: 0.9;
}

.admin-user-info {
    display: flex;
    align-items: center;
    gap: 1rem;
}

/* Sidebar Styles */
.admin-sidebar {
    width: 250px;
    background: white;
    position: fixed;
    top: 70px;
    left: 0;
    height: calc(100vh - 70px);
    overflow-y: auto;
    box-shadow: 2px 0 10px rgba(0,0,0,0.1);
    z-index: 99;
}

.sidebar-header {
    padding: 1.5rem 1rem;
    border-bottom: 1px solid #eee;
    text-align: center;
}

.sidebar-logo {
    width: 60px;
    height: 60px;
    margin-bottom: 1rem;
}

.sidebar-nav {
    padding: 1rem 0;
}

.nav-link {
    display: flex;
    align-items: center;
    padding: 0.8rem 1.5rem;
    color: #555;
    text-decoration: none;
    transition: all 0.3s;
    border-left: 4px solid transparent;
}

.nav-link:hover {
    background: #f8f9fa;
    color: #1a237e;
}

.nav-link.active {
    background: #e8eaf6;
    color: #1a237e;
    border-left-color: #1a237e;
}

.nav-icon {
    margin-right: 0.75rem;
    font-size: 1.2rem;
}

.sidebar-footer {
    padding: 1rem;
    border-top: 1px solid #eee;
    margin-top: auto;
}

.quick-stats {
    display: flex;
    justify-content: space-around;
}

.quick-stat {
    text-align: center;
}

.stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: bold;
    color: #1a237e;
}

.stat-label {
    font-size: 0.8rem;
    color: #666;
}

/* Main Content Styles */
.admin-main {
    margin-left: 250px;
    margin-top: 70px;
    padding: 2rem;
    flex: 1;
    overflow-y: auto;
}

.admin-section {
    display: none;
    animation: fadeIn 0.3s ease;
}

.admin-section.active {
    display: block;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
}

.section-header h2 {
    color: #1a237e;
}

/* Button Styles */
.btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.3s;
}

.btn-primary {
    background: #1a237e;
    color: white;
}

.btn-primary:hover {
    background: #283593;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(26, 35, 126, 0.2);
}

.btn-secondary {
    background: #e8eaf6;
    color: #1a237e;
}

.btn-secondary:hover {
    background: #d1d5f0;
}

.btn-danger {
    background: #d32f2f;
    color: white;
}

.btn-danger:hover {
    background: #c62828;
}

/* Summary Cards */
.summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.summary-card {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    transition: transform 0.3s;
}

.summary-card:hover {
    transform: translateY(-5px);
}

.summary-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.card-icon {
    font-size: 2rem;
}

.summary-card-value {
    font-size: 2.5rem;
    font-weight: bold;
    color: #1a237e;
    margin-bottom: 0.5rem;
}

.summary-card-trend {
    font-size: 0.9rem;
    color: #666;
}

/* Table Styles */
.table-container {
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.data-table {
    width: 100%;
    border-collapse: collapse;
}

.data-table th {
    background: #f8f9fa;
    padding: 1rem;
    text-align: left;
    font-weight: 600;
    color: #555;
    border-bottom: 2px solid #eee;
}

.data-table td {
    padding: 1rem;
    border-bottom: 1px solid #eee;
}

.data-table tbody tr:hover {
    background: #f8f9fa;
}

/* Progress Bar */
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
    background: linear-gradient(90deg, #4CAF50, #8BC34A);
    border-radius: 4px;
    transition: width 0.3s ease;
}

/* Status Badges */
.status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 500;
}

.status-active { background: #e8f5e8; color: #2e7d32; }
.status-completed { background: #e3f2fd; color: #1565c0; }
.status-overdue { background: #ffebee; color: #c62828; }

/* Action Buttons */
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
    color: #555;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.action-btn:hover {
    background: #e0e0e0;
    color: #1a237e;
}

/* Charts Section */
.charts-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 2rem;
    margin-bottom: 2rem;
}

.chart-container {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.chart-container h3 {
    margin-bottom: 1rem;
    color: #1a237e;
}

/* Activity List */
.activity-section {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.activity-list {
    max-height: 300px;
    overflow-y: auto;
}

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

/* Filters Bar */
.filters-bar {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    display: flex;
    gap: 2rem;
    align-items: center;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.filter-group label {
    font-weight: 500;
    color: #555;
}

.filter-group select {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    min-width: 150px;
}

/* Search Box */
.search-box {
    position: relative;
    min-width: 300px;
}

.search-box input {
    width: 100%;
    padding: 0.5rem 2.5rem 0.5rem 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.search-icon {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    color: #666;
}

/* Bulk Actions */
.bulk-actions {
    background: #e8eaf6;
    padding: 1rem;
    border-radius: 8px;
    margin-top: 1rem;
    animation: slideUp 0.3s ease;
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.bulk-actions-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.bulk-buttons {
    display: flex;
    gap: 0.5rem;
}

/* Pagination */
.pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 2rem;
}

.pagination-btn {
    padding: 0.5rem 1rem;
    border: 1px solid #ddd;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.3s;
}

.pagination-btn:hover {
    background: #f5f5f5;
}

.page-numbers {
    display: flex;
    gap: 0.5rem;
}

.page-number {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.3s;
}

.page-number.active {
    background: #1a237e;
    color: white;
}

.page-number:hover:not(.active) {
    background: #f5f5f5;
}

/* Department Cards */
.department-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.department-card {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    transition: transform 0.3s;
}

.department-card:hover {
    transform: translateY(-5px);
}

.department-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.department-progress {
    margin: 1rem 0;
}

.department-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-top: 1rem;
}

.department-stat {
    text-align: center;
}

.department-stat-value {
    display: block;
    font-size: 1.2rem;
    font-weight: bold;
    color: #1a237e;
}

.department-stat-label {
    font-size: 0.85rem;
    color: #666;
}

/* Report Cards */
.report-types {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.report-card {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.report-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
}

.report-card-icon {
    font-size: 2.5rem;
    margin-bottom: 1rem;
}

/* Modal Styles */
.modal {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 1000;
    align-items: center;
    justify-content: center;
}

.modal.active {
    display: flex;
}

.modal-content {
    background: white;
    border-radius: 8px;
    max-width: 800px;
    max-height: 90vh;
    overflow-y: auto;
    animation: modalSlideIn 0.3s ease;
}

@keyframes modalSlideIn {
    from {
        opacity: 0;
        transform: translateY(-50px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Responsive Design */
@media (max-width: 1024px) {
    .admin-sidebar {
        width: 200px;
    }
    
    .admin-main {
        margin-left: 200px;
    }
    
    .charts-section {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 768px) {
    .admin-sidebar {
        width: 70px;
    }
    
    .sidebar-header h3,
    .nav-link span {
        display: none;
    }
    
    .nav-link {
        justify-content: center;
        padding: 1rem;
    }
    
    .nav-icon {
        margin-right: 0;
    }
    
    .admin-main {
        margin-left: 70px;
    }
    
    .summary-cards {
        grid-template-columns: 1fr;
    }
    
    .section-header {
        flex-direction: column;
        gap: 1rem;
        align-items: flex-start;
    }
    
    .filters-bar {
        flex-direction: column;
        gap: 1rem;
    }
}

/* Loading Spinner */
.spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #1a237e;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

/* Empty State */
.empty-state {
    text-align: center;
    padding: 3rem;
    color: #666;
}

.empty-state-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.5;
}

/* Tooltip */
.tooltip {
    position: relative;
    display: inline-block;
}

.tooltip .tooltip-text {
    visibility: hidden;
    width: 200px;
    background-color: #333;
    color: white;
    text-align: center;
    border-radius: 4px;
    padding: 0.5rem;
    position: absolute;
    z-index: 1;
    bottom: 125%;
    left: 50%;
    transform: translateX(-50%);
    opacity: 0;
    transition: opacity 0.3s;
    font-size: 0.85rem;
}

.tooltip:hover .tooltip-text {
    visibility: visible;
    opacity: 1;
}
