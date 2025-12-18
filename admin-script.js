
class NurseIQAdmin {
    constructor() {
        this.supabase = null;
        this.config = {
            supabaseUrl: '',
            supabaseKey: '',
            environment: 'production',
            loaded: false,
            currentUser: null
        };
        
        this.currentTab = 'dashboard';
        this.assessments = [];
        this.courses = [];
        this.users = [];
        
        this.initialize();
    }
    
    async initialize() {
        try {
            console.log('🚀 Initializing NurseIQ Admin Panel...');
            
            // Step 1: Load configuration
            await this.loadConfiguration();
            
            // Step 2: Initialize Supabase
            await this.initializeSupabase();
            
            // Step 3: Verify connection
            await this.verifyConnection();
            
            // Step 4: Show admin interface
            this.showAdminInterface();
            
            // Step 5: Load initial data
            await this.loadInitialData();
            
            console.log('✅ Admin panel initialized successfully!');
            
        } catch (error) {
            console.error('❌ Failed to initialize:', error);
            this.showError('Initialization failed', error.message);
        }
    }
    
    async loadConfiguration() {
        this.showLoader('Loading configuration...');
        
        try {
            // Try multiple configuration sources
            const sources = [
                this.loadFromGitHubSecrets.bind(this),
                this.loadFromEnvironment.bind(this),
                this.loadFromLocalStorage.bind(this),
                this.loadFromURL.bind(this),
                this.promptForConfiguration.bind(this)
            ];
            
            for (const source of sources) {
                try {
                    await source();
                    if (this.config.supabaseUrl && this.config.supabaseKey) {
                        console.log('✅ Configuration loaded');
                        this.config.loaded = true;
                        return;
                    }
                } catch (error) {
                    console.warn(`⚠️ ${source.name}:`, error.message);
                }
            }
            
            throw new Error('Could not load configuration');
            
        } catch (error) {
            console.error('❌ Configuration error:', error);
            throw error;
        }
    }
    
    async loadFromGitHubSecrets() {
        // GitHub Pages injects secrets
        if (window.GITHUB_SECRETS) {
            console.log('📁 Loading from GitHub Secrets');
            this.config.supabaseUrl = window.GITHUB_SECRETS.supabaseUrl || '';
            this.config.supabaseKey = window.GITHUB_SECRETS.supabaseKey || '';
            this.config.environment = window.GITHUB_SECRETS.environment || 'production';
            return;
        }
        
        // Check for GitHub Actions injected secrets
        if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
            this.config.supabaseUrl = window.SUPABASE_URL;
            this.config.supabaseKey = window.SUPABASE_ANON_KEY;
            return;
        }
        
        throw new Error('GitHub secrets not found');
    }
    
    async loadFromEnvironment() {
        // Netlify, Vercel, etc.
        if (typeof process !== 'undefined' && process.env) {
            console.log('📁 Loading from environment variables');
            this.config.supabaseUrl = process.env.SUPABASE_URL || '';
            this.config.supabaseKey = process.env.SUPABASE_ANON_KEY || '';
        }
        
        // Check for global environment
        if (window.__ENV__) {
            this.config.supabaseUrl = window.__ENV__.SUPABASE_URL || this.config.supabaseUrl;
            this.config.supabaseKey = window.__ENV__.SUPABASE_ANON_KEY || this.config.supabaseKey;
        }
        
        if (this.config.supabaseUrl && this.config.supabaseKey) {
            return;
        }
        
        throw new Error('Environment variables not found');
    }
    
    async loadFromLocalStorage() {
        const saved = localStorage.getItem('nurseiq_admin_config');
        if (saved) {
            console.log('📁 Loading from localStorage');
            const parsed = JSON.parse(saved);
            
            // Check if config is less than 7 days old
            const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            const savedTime = new Date(parsed.timestamp).getTime();
            
            if (savedTime > weekAgo) {
                this.config.supabaseUrl = parsed.supabaseUrl || '';
                this.config.supabaseKey = parsed.supabaseKey || '';
                this.config.environment = parsed.environment || 'production';
                return;
            } else {
                console.log('⚠️ Saved configuration expired');
                localStorage.removeItem('nurseiq_admin_config');
            }
        }
        
        throw new Error('No valid configuration in localStorage');
    }
    
    async loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const url = params.get('supabase_url');
        const key = params.get('supabase_key');
        
        if (url && key) {
            console.log('📁 Loading from URL parameters');
            this.config.supabaseUrl = decodeURIComponent(url);
            this.config.supabaseKey = decodeURIComponent(key);
            
            // Save for future use
            this.saveToLocalStorage();
            return;
        }
        
        throw new Error('No configuration in URL');
    }
    
    async promptForConfiguration() {
        return new Promise((resolve, reject) => {
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-cog"></i> Configuration Required</h3>
                    </div>
                    <div class="modal-body">
                        <p>Please enter your Supabase credentials:</p>
                        <div class="form-group">
                            <label>Supabase URL *</label>
                            <input type="text" id="config-url" class="form-control" 
                                   placeholder="https://your-project.supabase.co"
                                   value="${this.config.supabaseUrl}">
                        </div>
                        <div class="form-group">
                            <label>Supabase Anon Key *</label>
                            <input type="password" id="config-key" class="form-control" 
                                   placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                                   value="${this.config.supabaseKey}">
                        </div>
                        <div class="form-group">
                            <label>Environment</label>
                            <select id="config-env" class="form-control">
                                <option value="production" ${this.config.environment === 'production' ? 'selected' : ''}>Production</option>
                                <option value="development" ${this.config.environment === 'development' ? 'selected' : ''}>Development</option>
                            </select>
                        </div>
                        <div class="alert alert-info" style="margin-top: 1rem; padding: 0.75rem; background: #dbeafe; border-radius: 0.375rem; font-size: 0.875rem;">
                            <i class="fas fa-info-circle"></i> Get these from your Supabase project: Settings → API
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="config-cancel" class="btn btn-outline">Cancel</button>
                        <button id="config-save" class="btn btn-primary">Connect</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Focus on first input
            setTimeout(() => document.getElementById('config-url')?.focus(), 100);
            
            // Event listeners
            modal.querySelector('#config-save').addEventListener('click', () => {
                const url = document.getElementById('config-url').value.trim();
                const key = document.getElementById('config-key').value.trim();
                const env = document.getElementById('config-env').value;
                
                if (!url || !key) {
                    this.showNotification('Please fill in all required fields', 'error');
                    return;
                }
                
                if (!url.startsWith('https://')) {
                    this.showNotification('URL must start with https://', 'error');
                    return;
                }
                
                this.config.supabaseUrl = url;
                this.config.supabaseKey = key;
                this.config.environment = env;
                
                this.saveToLocalStorage();
                document.body.removeChild(modal);
                resolve();
            });
            
            modal.querySelector('#config-cancel').addEventListener('click', () => {
                document.body.removeChild(modal);
                reject(new Error('Configuration cancelled'));
            });
            
            // Close on escape
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    document.body.removeChild(modal);
                    reject(new Error('Configuration cancelled'));
                }
            });
        });
    }
    
    saveToLocalStorage() {
        const config = {
            supabaseUrl: this.config.supabaseUrl,
            supabaseKey: this.config.supabaseKey,
            environment: this.config.environment,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('nurseiq_admin_config', JSON.stringify(config));
    }
    
    async initializeSupabase() {
        this.showLoader('Connecting to Supabase...');
        
        try {
            const { createClient } = window.supabase;
            
            this.supabase = createClient(
                this.config.supabaseUrl,
                this.config.supabaseKey,
                {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true
                    },
                    global: {
                        headers: {
                            'X-Client-Info': 'nurseiq-admin/1.0'
                        }
                    },
                    db: {
                        schema: 'public'
                    }
                }
            );
            
            console.log('✅ Supabase client initialized');
            
        } catch (error) {
            console.error('❌ Supabase initialization failed:', error);
            throw new Error(`Failed to initialize Supabase: ${error.message}`);
        }
    }
    
    async verifyConnection() {
        this.showLoader('Verifying database connection...');
        
        try {
            // Test connection with a simple query
            const { data, error } = await this.supabase
                .from('medical_assessments')
                .select('count')
                .limit(1)
                .single();
            
            if (error && error.code !== 'PGRST116') {
                // Try courses table instead
                const { error: courseError } = await this.supabase
                    .from('courses')
                    .select('id')
                    .limit(1);
                
                if (courseError) throw courseError;
            }
            
            console.log('✅ Database connection verified');
            this.updateConnectionStatus('connected');
            
        } catch (error) {
            console.error('❌ Connection verification failed:', error);
            this.updateConnectionStatus('error');
            throw new Error(`Database connection failed: ${error.message}`);
        }
    }
    
    showAdminInterface() {
        // Hide loader
        const loader = document.getElementById('config-loader');
        if (loader) {
            loader.classList.add('hidden');
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }
        
        // Show admin container
        const container = document.querySelector('.admin-container');
        if (container) {
            container.style.display = 'block';
            setTimeout(() => {
                container.classList.add('reveal');
            }, 100);
        }
        
        this.showNotification('Connected to database successfully!', 'success');
    }
    
    async loadInitialData() {
        try {
            // Setup event listeners first
            this.setupEventListeners();
            
            // Load data in parallel
            await Promise.all([
                this.loadDashboardData(),
                this.loadCourses(),
                this.loadAssessments()
            ]);
            
            // Load users separately
            await this.loadUsers();
            
            console.log('✅ All initial data loaded');
            
        } catch (error) {
            console.error('❌ Error loading initial data:', error);
            this.showNotification('Some data failed to load', 'warning');
        }
    }
    
    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                this.switchTab(tabId);
            });
        });
        
        // Search and filter events
        const searchInput = document.getElementById('search-assessments');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => {
                this.filterAssessments();
            }, 300));
        }
        
        // Filter changes
        ['filter-course', 'filter-difficulty', 'filter-status'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => this.filterAssessments());
            }
        });
        
        // User search
        const userSearch = document.getElementById('search-users');
        if (userSearch) {
            userSearch.addEventListener('input', this.debounce(() => {
                this.filterUsers();
            }, 300));
        }
        
        // Form submissions
        const assessmentForm = document.getElementById('assessment-form');
        if (assessmentForm) {
            assessmentForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveAssessment();
            });
        }
        
        const courseForm = document.getElementById('course-form');
        if (courseForm) {
            courseForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveCourse();
            });
        }
        
        // Settings changes
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                this.setTheme(e.target.value);
            });
        }
        
        // Close modals on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
        
        // Close modals on outside click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal();
            }
        });
    }
    
    switchTab(tabId) {
        this.currentTab = tabId;
        
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
    
    async loadDashboardData() {
        try {
            // Load total assessments
            const { count: assessmentsCount } = await this.supabase
                .from('medical_assessments')
                .select('*', { count: 'exact', head: true })
                .eq('is_active', true);
            
            document.getElementById('total-assessments').textContent = assessmentsCount || 0;
            
            // Load total courses
            const { count: coursesCount } = await this.supabase
                .from('courses')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Active');
            
            document.getElementById('total-courses').textContent = coursesCount || 0;
            
            // Load active users (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const { data: progress } = await this.supabase
                .from('user_assessment_progress')
                .select('user_id')
                .gte('completed_at', thirtyDaysAgo.toISOString());
            
            const uniqueUsers = new Set(progress?.map(u => u.user_id) || []);
            document.getElementById('active-users').textContent = uniqueUsers.size;
            
            // Load average completion rate
            const { data: allProgress } = await this.supabase
                .from('user_assessment_progress')
                .select('is_correct');
            
            if (allProgress && allProgress.length > 0) {
                const correctCount = allProgress.filter(p => p.is_correct).length;
                const completionRate = Math.round((correctCount / allProgress.length) * 100);
                document.getElementById('completion-rate').textContent = `${completionRate}%`;
            }
            
            // Load recent activity
            await this.loadRecentActivity();
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            throw error;
        }
    }
    
    async loadRecentActivity() {
        try {
            const { data: activity, error } = await this.supabase
                .from('user_assessment_progress')
                .select(`
                    completed_at,
                    is_correct,
                    medical_assessments!inner(topic),
                    profiles!inner(full_name)
                `)
                .order('completed_at', { ascending: false })
                .limit(10);
            
            if (error) throw error;
            
            const activityList = document.getElementById('activity-list');
            if (!activityList) return;
            
            if (!activity || activity.length === 0) {
                activityList.innerHTML = `
                    <div class="activity-item">
                        <i class="fas fa-info-circle"></i>
                        <span>No recent activity</span>
                    </div>
                `;
                return;
            }
            
            activityList.innerHTML = activity.map(item => `
                <div class="activity-item">
                    <i class="fas fa-${item.is_correct ? 'check-circle text-success' : 'times-circle text-danger'}"></i>
                    <span>
                        <strong>${item.profiles.full_name || 'User'}</strong>
                        ${item.is_correct ? 'correctly answered' : 'attempted'}
                        "${item.medical_assessments.topic?.substring(0, 30) || 'question'}"
                    </span>
                    <span class="text-muted" style="margin-left: auto; font-size: 0.75rem;">
                        ${this.formatTimeAgo(item.completed_at)}
                    </span>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error loading recent activity:', error);
            document.getElementById('activity-list').innerHTML = `
                <div class="activity-item">
                    <i class="fas fa-exclamation-triangle text-warning"></i>
                    <span>Failed to load activity</span>
                </div>
            `;
        }
    }
    
    async loadAssessments() {
        try {
            this.showLoader('Loading assessments...');
            
            const { data: assessments, error } = await this.supabase
                .from('medical_assessments')
                .select(`
                    id,
                    topic,
                    course_id,
                    difficulty,
                    is_published,
                    is_active,
                    created_at,
                    courses!inner(course_name, unit_code)
                `)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            this.assessments = assessments || [];
            
            // Update course filter
            const courseFilter = document.getElementById('filter-course');
            if (courseFilter) {
                const courses = [...new Set(assessments
                    .map(a => a.courses?.course_name)
                    .filter(Boolean)
                    .sort())];
                
                courseFilter.innerHTML = '<option value="all">All Courses</option>' +
                    courses.map(course => `<option value="${course}">${course}</option>`).join('');
            }
            
            // Render table
            this.renderAssessmentsTable();
            
            this.showNotification(`Loaded ${this.assessments.length} assessments`, 'success');
            
        } catch (error) {
            console.error('Error loading assessments:', error);
            this.showNotification('Failed to load assessments', 'error');
            
            const tableBody = document.querySelector('#assessments-table tbody');
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center">
                            <i class="fas fa-exclamation-triangle"></i>
                            Failed to load assessments: ${error.message}
                        </td>
                    </tr>
                `;
            }
        }
    }
    
    renderAssessmentsTable() {
        const tableBody = document.querySelector('#assessments-table tbody');
        if (!tableBody) return;
        
        if (this.assessments.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">
                        <i class="fas fa-info-circle"></i>
                        No assessments found
                    </td>
                </tr>
            `;
            return;
        }
        
        tableBody.innerHTML = this.assessments.map(assessment => {
            const date = new Date(assessment.created_at);
            const formattedDate = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            
            let statusBadge = '';
            if (!assessment.is_active) {
                statusBadge = '<span class="badge" style="background: #ef4444; color: white;">Inactive</span>';
            } else if (!assessment.is_published) {
                statusBadge = '<span class="badge" style="background: #f59e0b; color: white;">Draft</span>';
            } else {
                statusBadge = '<span class="badge" style="background: #10b981; color: white;">Published</span>';
            }
            
            return `
                <tr>
                    <td>${assessment.id.substring(0, 8)}...</td>
                    <td>${assessment.topic || 'No topic'}</td>
                    <td>${assessment.courses?.course_name || 'No course'}</td>
                    <td>
                        <span class="difficulty-badge ${assessment.difficulty}">
                            ${assessment.difficulty || 'medium'}
                        </span>
                    </td>
                    <td>${statusBadge}</td>
                    <td>${formattedDate}</td>
                    <td>
                        <div class="btn-group">
                            <button class="btn-action" onclick="admin.editAssessment('${assessment.id}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-action" onclick="admin.toggleAssessmentStatus('${assessment.id}')" 
                                    title="${assessment.is_published ? 'Unpublish' : 'Publish'}">
                                <i class="fas ${assessment.is_published ? 'fa-eye-slash' : 'fa-eye'}"></i>
                            </button>
                            <button class="btn-action" onclick="admin.deleteAssessment('${assessment.id}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    filterAssessments() {
        const searchTerm = document.getElementById('search-assessments')?.value.toLowerCase() || '';
        const courseFilter = document.getElementById('filter-course')?.value || 'all';
        const difficultyFilter = document.getElementById('filter-difficulty')?.value || 'all';
        const statusFilter = document.getElementById('filter-status')?.value || 'all';
        
        const rows = document.querySelectorAll('#assessments-table tbody tr');
        let visibleCount = 0;
        
        rows.forEach(row => {
            if (row.cells.length < 7) return;
            
            const topic = row.cells[1].textContent.toLowerCase();
            const course = row.cells[2].textContent;
            const difficulty = row.cells[3].querySelector('.difficulty-badge')?.className || '';
            const status = row.cells[4].textContent.toLowerCase();
            
            const matchesSearch = !searchTerm || topic.includes(searchTerm);
            const matchesCourse = courseFilter === 'all' || course === courseFilter;
            const matchesDifficulty = difficultyFilter === 'all' || difficulty.includes(difficultyFilter);
            const matchesStatus = statusFilter === 'all' || 
                (statusFilter === 'published' && status.includes('published')) ||
                (statusFilter === 'draft' && status.includes('draft')) ||
                (statusFilter === 'inactive' && status.includes('inactive'));
            
            const shouldShow = matchesSearch && matchesCourse && matchesDifficulty && matchesStatus;
            row.style.display = shouldShow ? '' : 'none';
            if (shouldShow) visibleCount++;
        });
        
        // Update pagination info
        const paginationInfo = document.querySelector('.pagination-info');
        if (paginationInfo) {
            paginationInfo.textContent = `Showing ${visibleCount} of ${rows.length} assessments`;
        }
    }
    
    async loadCourses() {
        try {
            const { data: courses, error } = await this.supabase
                .from('courses')
                .select('*')
                .order('course_name');
            
            if (error) throw error;
            
            this.courses = courses || [];
            this.renderCoursesTable();
            
            // Populate course dropdown in assessment form
            const courseSelect = document.getElementById('assessment-course');
            if (courseSelect) {
                courseSelect.innerHTML = '<option value="">Select Course</option>' +
                    this.courses
                        .filter(c => c.status === 'Active')
                        .map(course => `
                            <option value="${course.id}">
                                ${course.course_name} (${course.unit_code || 'No code'})
                            </option>
                        `).join('');
            }
            
        } catch (error) {
            console.error('Error loading courses:', error);
            this.showNotification('Failed to load courses', 'error');
        }
    }
    
    renderCoursesTable() {
        const tableBody = document.querySelector('#courses-table tbody');
        if (!tableBody) return;
        
        if (this.courses.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">
                        <i class="fas fa-info-circle"></i>
                        No courses found
                    </td>
                </tr>
            `;
            return;
        }
        
        tableBody.innerHTML = this.courses.map(course => {
            return `
                <tr>
                    <td>${course.id.substring(0, 8)}...</td>
                    <td>${course.course_name}</td>
                    <td>${course.unit_code || 'N/A'}</td>
                    <td>${course.target_program || 'All'}</td>
                    <td>${course.intake_year || 'All'}</td>
                    <td>
                        <span class="badge ${course.status === 'Active' ? 'bg-success' : 'bg-danger'}">
                            ${course.status}
                        </span>
                    </td>
                    <td>
                        <div class="btn-group">
                            <button class="btn-action" onclick="admin.editCourse('${course.id}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-action" onclick="admin.toggleCourseStatus('${course.id}')" 
                                    title="${course.status === 'Active' ? 'Deactivate' : 'Activate'}">
                                <i class="fas fa-power-off"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    async loadUsers() {
        try {
            // This is a simplified version - adjust based on your user table
            const { data: users, error } = await this.supabase
                .from('consolidated_user_profiles_table')
                .select('*')
                .limit(10000);
            
            if (error) {
                console.warn('Could not load users:', error.message);
                this.users = [];
                return;
            }
            
            this.users = users || [];
            this.renderUsersTable();
            
        } catch (error) {
            console.error('Error loading users:', error);
            this.showNotification('Failed to load users', 'warning');
        }
    }
    
    async renderUsersTable() {
        const tableBody = document.querySelector('#users-table tbody');
        if (!tableBody) return;
        
        if (this.users.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">
                        <i class="fas fa-info-circle"></i>
                        No users found
                    </td>
                </tr>
            `;
            return;
        }
        
        // Load progress for each user
        const usersWithProgress = await Promise.all(
            this.users.map(async (user) => {
                const { data: progress } = await this.supabase
                    .from('user_assessment_progress')
                    .select('is_correct, time_spent, completed_at')
                    .eq('user_id', user.id);
                
                const completed = progress?.length || 0;
                const correct = progress?.filter(p => p.is_correct).length || 0;
                const accuracy = completed > 0 ? Math.round((correct / completed) * 100) : 0;
                const totalTime = progress?.reduce((sum, p) => sum + (p.time_spent || 0), 0) || 0;
                const avgTime = completed > 0 ? Math.round(totalTime / completed / 60) : 0;
                
                const lastProgress = progress?.sort((a, b) => 
                    new Date(b.completed_at) - new Date(a.completed_at)
                )[0];
                
                return {
                    ...user,
                    completed,
                    accuracy,
                    avgTime,
                    lastActive: lastProgress?.completed_at || null
                };
            })
        );
        
        tableBody.innerHTML = usersWithProgress.map(user => {
            const lastActive = user.lastActive 
                ? this.formatTimeAgo(user.lastActive)
                : 'Never';
            
            return `
                <tr>
                    <td>
                        <div>
                            <strong>${user.full_name || 'Unknown User'}</strong>
                            <div class="text-muted" style="font-size: 0.75rem;">${user.email || ''}</div>
                        </div>
                    </td>
                    <td>${user.program || user.department || 'N/A'}</td>
                    <td>${user.completed}</td>
                    <td>
                        <span class="${user.accuracy >= 70 ? 'text-success' : user.accuracy >= 50 ? 'text-warning' : 'text-danger'}">
                            ${user.accuracy}%
                        </span>
                    </td>
                    <td>${user.avgTime}m</td>
                    <td>${lastActive}</td>
                    <td>
                        <button class="btn-action" onclick="admin.viewUserProgress('${user.id}')" title="View Progress">
                            <i class="fas fa-chart-line"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    filterUsers() {
        const searchTerm = document.getElementById('search-users')?.value.toLowerCase() || '';
        const rows = document.querySelectorAll('#users-table tbody tr');
        
        rows.forEach(row => {
            if (row.cells.length < 7) return;
            
            const userName = row.cells[0].textContent.toLowerCase();
            const userEmail = row.cells[0].querySelector('.text-muted')?.textContent.toLowerCase() || '';
            const program = row.cells[1].textContent.toLowerCase();
            
            const matches = !searchTerm || 
                userName.includes(searchTerm) || 
                userEmail.includes(searchTerm) ||
                program.includes(searchTerm);
            
            row.style.display = matches ? '' : 'none';
        });
    }
    
    // Assessment CRUD Operations
    async saveAssessment() {
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
                this.showNotification('Please fill in all required fields', 'error');
                return;
            }
            
            const { error } = await this.supabase
                .from('medical_assessments')
                .insert([formData]);
            
            if (error) throw error;
            
            this.showNotification('Assessment saved successfully!', 'success');
            this.closeModal();
            await this.loadAssessments();
            await this.loadDashboardData();
            
        } catch (error) {
            console.error('Error saving assessment:', error);
            this.showNotification('Failed to save assessment', 'error');
        }
    }
    
    async editAssessment(assessmentId) {
        try {
            const { data: assessment, error } = await this.supabase
                .from('medical_assessments')
                .select('*')
                .eq('id', assessmentId)
                .single();
            
            if (error) throw error;
            
            // Populate form
            document.getElementById('question-text').value = assessment.question_text || '';
            document.getElementById('assessment-course').value = assessment.course_id || '';
            document.getElementById('assessment-difficulty').value = assessment.difficulty || 'medium';
            document.getElementById('assessment-topic').value = assessment.topic || '';
            document.getElementById('assessment-marks').value = assessment.marks || 1;
            document.getElementById('assessment-type').value = assessment.question_type || 'multiple_choice';
            document.getElementById('assessment-published').checked = assessment.is_published;
            
            // Update modal title
            document.querySelector('#add-assessment-modal h3').innerHTML = `
                <i class="fas fa-edit"></i> Edit Assessment
            `;
            
            // Update form submission
            const form = document.getElementById('assessment-form');
            form.onsubmit = async (e) => {
                e.preventDefault();
                await this.updateAssessment(assessmentId);
            };
            
            this.openModal('add-assessment-modal');
            
        } catch (error) {
            console.error('Error loading assessment:', error);
            this.showNotification('Failed to load assessment', 'error');
        }
    }
    
    async updateAssessment(assessmentId) {
        try {
            const formData = {
                question_text: document.getElementById('question-text').value,
                course_id: document.getElementById('assessment-course').value,
                difficulty: document.getElementById('assessment-difficulty').value,
                topic: document.getElementById('assessment-topic').value || null,
                marks: parseInt(document.getElementById('assessment-marks').value) || 1,
                question_type: document.getElementById('assessment-type').value,
                is_published: document.getElementById('assessment-published').checked,
                updated_at: new Date().toISOString()
            };
            
            const { error } = await this.supabase
                .from('medical_assessments')
                .update(formData)
                .eq('id', assessmentId);
            
            if (error) throw error;
            
            this.showNotification('Assessment updated successfully!', 'success');
            this.closeModal();
            await this.loadAssessments();
            
        } catch (error) {
            console.error('Error updating assessment:', error);
            this.showNotification('Failed to update assessment', 'error');
        }
    }
    
    async deleteAssessment(assessmentId) {
        if (!confirm('Are you sure you want to delete this assessment? This action cannot be undone.')) {
            return;
        }
        
        try {
            const { error } = await this.supabase
                .from('medical_assessments')
                .delete()
                .eq('id', assessmentId);
            
            if (error) throw error;
            
            this.showNotification('Assessment deleted successfully!', 'success');
            await this.loadAssessments();
            await this.loadDashboardData();
            
        } catch (error) {
            console.error('Error deleting assessment:', error);
            this.showNotification('Failed to delete assessment', 'error');
        }
    }
    
    async toggleAssessmentStatus(assessmentId) {
        try {
            // Get current status
            const { data: assessment, error: fetchError } = await this.supabase
                .from('medical_assessments')
                .select('is_published')
                .eq('id', assessmentId)
                .single();
            
            if (fetchError) throw fetchError;
            
            const newStatus = !assessment.is_published;
            
            const { error } = await this.supabase
                .from('medical_assessments')
                .update({ is_published: newStatus })
                .eq('id', assessmentId);
            
            if (error) throw error;
            
            this.showNotification(
                `Assessment ${newStatus ? 'published' : 'unpublished'} successfully!`,
                'success'
            );
            
            await this.loadAssessments();
            
        } catch (error) {
            console.error('Error toggling assessment status:', error);
            this.showNotification('Failed to update assessment status', 'error');
        }
    }
    
    // Course CRUD Operations
    async saveCourse() {
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
                this.showNotification('Please fill in all required fields', 'error');
                return;
            }
            
            const { error } = await this.supabase
                .from('courses')
                .insert([formData]);
            
            if (error) throw error;
            
            this.showNotification('Course saved successfully!', 'success');
            this.closeModal();
            await this.loadCourses();
            await this.loadDashboardData();
            
        } catch (error) {
            console.error('Error saving course:', error);
            this.showNotification('Failed to save course', 'error');
        }
    }
    
    async editCourse(courseId) {
        try {
            const { data: course, error } = await this.supabase
                .from('courses')
                .select('*')
                .eq('id', courseId)
                .single();
            
            if (error) throw error;
            
            // Populate form
            document.getElementById('course-name').value = course.course_name || '';
            document.getElementById('course-code').value = course.unit_code || '';
            document.getElementById('course-color').value = course.color || '#4f46e5';
            document.getElementById('course-description').value = course.description || '';
            document.getElementById('course-program').value = course.target_program || '';
            document.getElementById('course-year').value = course.intake_year || '2024';
            
            // Update modal title
            document.querySelector('#add-course-modal h3').innerHTML = `
                <i class="fas fa-edit"></i> Edit Course
            `;
            
            // Update form submission
            const form = document.getElementById('course-form');
            form.onsubmit = async (e) => {
                e.preventDefault();
                await this.updateCourse(courseId);
            };
            
            this.openModal('add-course-modal');
            
        } catch (error) {
            console.error('Error loading course:', error);
            this.showNotification('Failed to load course', 'error');
        }
    }
    
    async updateCourse(courseId) {
        try {
            const formData = {
                course_name: document.getElementById('course-name').value,
                unit_code: document.getElementById('course-code').value,
                color: document.getElementById('course-color').value,
                description: document.getElementById('course-description').value || null,
                target_program: document.getElementById('course-program').value || null,
                intake_year: parseInt(document.getElementById('course-year').value) || null,
                updated_at: new Date().toISOString()
            };
            
            const { error } = await this.supabase
                .from('courses')
                .update(formData)
                .eq('id', courseId);
            
            if (error) throw error;
            
            this.showNotification('Course updated successfully!', 'success');
            this.closeModal();
            await this.loadCourses();
            
        } catch (error) {
            console.error('Error updating course:', error);
            this.showNotification('Failed to update course', 'error');
        }
    }
    
    async toggleCourseStatus(courseId) {
        try {
            const { data: course, error: fetchError } = await this.supabase
                .from('courses')
                .select('status')
                .eq('id', courseId)
                .single();
            
            if (fetchError) throw fetchError;
            
            const newStatus = course.status === 'Active' ? 'Inactive' : 'Active';
            
            const { error } = await this.supabase
                .from('courses')
                .update({ status: newStatus })
                .eq('id', courseId);
            
            if (error) throw error;
            
            this.showNotification(
                `Course ${newStatus.toLowerCase()}d successfully!`,
                'success'
            );
            
            await this.loadCourses();
            await this.loadDashboardData();
            
        } catch (error) {
            console.error('Error toggling course status:', error);
            this.showNotification('Failed to update course status', 'error');
        }
    }
    
    // User Operations
    async viewUserProgress(userId) {
        this.showNotification(`Viewing progress for user ${userId.substring(0, 8)}...`, 'info');
        // You would implement a detailed progress view here
    }
    
    // Modal Functions
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }
    
    closeModal() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = 'auto';
        
        // Reset forms
        const assessmentForm = document.getElementById('assessment-form');
        if (assessmentForm) {
            assessmentForm.reset();
            assessmentForm.onsubmit = (e) => {
                e.preventDefault();
                this.saveAssessment();
            };
            document.querySelector('#add-assessment-modal h3').innerHTML = `
                <i class="fas fa-plus-circle"></i> Add New Assessment
            `;
        }
        
        const courseForm = document.getElementById('course-form');
        if (courseForm) {
            courseForm.reset();
            courseForm.onsubmit = (e) => {
                e.preventDefault();
                this.saveCourse();
            };
            document.querySelector('#add-course-modal h3').innerHTML = `
                <i class="fas fa-book-medical"></i> Add New Course
            `;
        }
    }
    
    openAddAssessmentModal() {
        this.openModal('add-assessment-modal');
    }
    
    openAddCourseModal() {
        this.openModal('add-course-modal');
    }
    
    openImportModal() {
        this.showNotification('Import feature coming soon!', 'info');
    }
    
    // Utility Functions
    showLoader(message) {
        const loader = document.getElementById('config-loader');
        if (loader) {
            const messageEl = loader.querySelector('p');
            if (messageEl && message) {
                messageEl.textContent = message;
            }
        }
    }
    
    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
            </div>
            <button class="notification-close" onclick="this.parentElement.remove()">&times;</button>
        `;
        
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
    
    getNotificationIcon(type) {
        switch (type) {
            case 'success': return 'check-circle';
            case 'error': return 'exclamation-circle';
            case 'warning': return 'exclamation-triangle';
            default: return 'info-circle';
        }
    }
    
    showError(title, message) {
        const loader = document.getElementById('config-loader');
        if (loader) {
            loader.innerHTML = `
                <div class="error-content">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>${title}</h3>
                    <p>${message}</p>
                    <div class="error-actions">
                        <button onclick="location.reload()" class="btn btn-primary">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                        <button onclick="admin.showHelp()" class="btn btn-outline">
                            <i class="fas fa-question-circle"></i> Get Help
                        </button>
                    </div>
                </div>
            `;
        }
    }
    
    updateConnectionStatus(status) {
        const indicator = document.querySelector('.status-indicator');
        if (indicator) {
            const dot = indicator.querySelector('.status-dot');
            const text = indicator.querySelector('span:last-child');
            
            if (dot) {
                dot.className = 'status-dot';
                dot.classList.add(status);
            }
            
            if (text) {
                const messages = {
                    connecting: 'Connecting...',
                    connected: 'Connected',
                    error: 'Connection Error'
                };
                text.textContent = messages[status] || status;
            }
        }
        
        // Update settings tab
        const connectionStatus = document.getElementById('connection-status');
        if (connectionStatus) {
            connectionStatus.className = `status-badge ${status}`;
            connectionStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        }
        
        const connectionUrl = document.getElementById('connection-url');
        if (connectionUrl && this.config.supabaseUrl) {
            connectionUrl.textContent = this.config.supabaseUrl;
        }
        
        const lastCheck = document.getElementById('last-check');
        if (lastCheck) {
            lastCheck.textContent = new Date().toLocaleTimeString();
        }
    }
    
    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }
    
    debounce(func, wait) {
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
    
    // Settings Functions
    async testConnection() {
        try {
            this.showNotification('Testing connection...', 'info');
            
            const { error } = await this.supabase
                .from('medical_assessments')
                .select('id')
                .limit(1);
            
            if (error) throw error;
            
            this.showNotification('Connection test successful!', 'success');
            this.updateConnectionStatus('connected');
            
        } catch (error) {
            console.error('Connection test failed:', error);
            this.showNotification('Connection test failed', 'error');
            this.updateConnectionStatus('error');
        }
    }
    
    showConnectionDetails() {
        alert(`
Connection Details:
- URL: ${this.config.supabaseUrl}
- Environment: ${this.config.environment}
- Loaded: ${this.config.loaded ? 'Yes' : 'No'}
- User: ${this.config.currentUser?.email || 'Not authenticated'}

Check browser console for more details.
        `);
    }
    
    setTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.style.setProperty('--bg-primary', '#1f2937');
            document.documentElement.style.setProperty('--bg-secondary', '#111827');
            document.documentElement.style.setProperty('--bg-tertiary', '#374151');
            document.documentElement.style.setProperty('--text-primary', '#f9fafb');
            document.documentElement.style.setProperty('--text-secondary', '#d1d5db');
            document.documentElement.style.setProperty('--border-color', '#4b5563');
        } else {
            // Reset to light theme
            document.documentElement.style = '';
        }
        
        localStorage.setItem('nurseiq_theme', theme);
        this.showNotification(`Theme changed to ${theme}`, 'success');
    }
    
    clearCache() {
        localStorage.removeItem('nurseiq_admin_config');
        this.showNotification('Cache cleared successfully', 'success');
    }
    
    exportData() {
        const data = {
            assessments: this.assessments,
            courses: this.courses,
            users: this.users,
            exportedAt: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nurseiq-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('Data exported successfully', 'success');
    }
    
    resetSettings() {
        if (confirm('Are you sure you want to reset all settings? This will clear all saved preferences.')) {
            localStorage.clear();
            this.showNotification('Settings reset successfully. Page will reload.', 'success');
            setTimeout(() => location.reload(), 1500);
        }
    }
    
    generateReport() {
        this.showNotification('Report generation coming soon!', 'info');
    }
    
    refreshAssessments() {
        this.loadAssessments();
    }
    
    refreshCourses() {
        this.loadCourses();
    }
    
    refreshUsers() {
        this.loadUsers();
    }
    
    showHelp() {
        alert(`
NurseIQ Admin Panel Help:

1. CONFIGURATION:
   - Get Supabase URL and Key from your project: Settings → API
   - For GitHub Pages: Add as GitHub Secrets
   - For local testing: Enter in configuration prompt

2. FEATURES:
   - Dashboard: Overview of system statistics
   - Assessments: Manage all questions
   - Courses: Manage courses and programs
   - Users: View user progress
   - Settings: Configure connection and preferences

3. TROUBLESHOOTING:
   - Check browser console for errors
   - Verify Supabase credentials
   - Ensure tables exist in database
   - Clear cache if experiencing issues

4. SUPPORT:
   - Contact your system administrator
   - Check documentation
   - Report bugs with console output
        `);
    }
}

// Initialize admin panel when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.admin = new NurseIQAdmin();
});

// Make admin globally available
window.NurseIQAdmin = NurseIQAdmin;
