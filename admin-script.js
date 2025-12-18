// NurseIQ Admin Panel - Complete Working Version
class NurseIQAdmin {
    constructor() {
        this.supabase = null;
        this.config = {
            // ============================================
            // ============================================
            // ADD YOUR SUPABASE CREDENTIALS HERE
            // ============================================
            supabaseUrl: 'https://lwhtjozfsmbyihenfunw.supabase.co',
            supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk',
            // ============================================
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
            // First check if credentials are already set
            if (this.config.supabaseUrl && this.config.supabaseKey) {
                console.log('✅ Using direct credentials from code');
                this.config.loaded = true;
                return;
            }
            
            // Try to load from localStorage
            const saved = localStorage.getItem('nurseiq_admin_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.config.supabaseUrl = parsed.supabaseUrl || '';
                this.config.supabaseKey = parsed.supabaseKey || '';
                console.log('✅ Using saved credentials');
                this.config.loaded = true;
                return;
            }
            
            // If no credentials, prompt user
            await this.promptForConfiguration();
            
        } catch (error) {
            console.error('❌ Configuration error:', error);
            throw error;
        }
    }
    
    async promptForConfiguration() {
        return new Promise((resolve, reject) => {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;
            
            modal.innerHTML = `
                <div style="background: white; border-radius: 10px; padding: 30px; max-width: 500px; width: 90%;">
                    <h2 style="color: #4f46e5; margin-top: 0;">
                        <i class="fas fa-cog"></i> Setup Required
                    </h2>
                    <p>Enter your Supabase credentials:</p>
                    
                    <div style="margin: 20px 0;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold;">
                            Supabase URL *
                        </label>
                        <input type="text" id="config-url" 
                               style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 6px;"
                               placeholder="https://your-project.supabase.co">
                    </div>
                    
                    <div style="margin: 20px 0;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold;">
                            Supabase Anon Key *
                        </label>
                        <input type="password" id="config-key" 
                               style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 6px;"
                               placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...">
                    </div>
                    
                    <div style="background: #dbeafe; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 14px;">
                        <i class="fas fa-info-circle"></i>
                        Get these from your Supabase project: Settings → API
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="config-cancel" 
                                style="padding: 10px 20px; border: 2px solid #e5e7eb; background: white; border-radius: 6px; cursor: pointer;">
                            Cancel
                        </button>
                        <button id="config-save" 
                                style="padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            Connect
                        </button>
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
                
                if (!url || !key) {
                    this.showNotification('Please fill in all required fields', 'error');
                    return;
                }
                
                this.config.supabaseUrl = url;
                this.config.supabaseKey = key;
                this.config.loaded = true;
                
                // Save to localStorage
                localStorage.setItem('nurseiq_admin_config', JSON.stringify({
                    supabaseUrl: url,
                    supabaseKey: key,
                    timestamp: new Date().toISOString()
                }));
                
                document.body.removeChild(modal);
                resolve();
            });
            
            modal.querySelector('#config-cancel').addEventListener('click', () => {
                document.body.removeChild(modal);
                reject(new Error('Configuration cancelled'));
            });
        });
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
                        persistSession: false
                    },
                    global: {
                        headers: {
                            'X-Client-Info': 'nurseiq-admin/1.0'
                        }
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
            // Try to connect to medical_assessments table
            const { error } = await this.supabase
                .from('medical_assessments')
                .select('id')
                .limit(1);
            
            if (error && error.code !== 'PGRST116') {
                // Try courses table if assessments doesn't exist
                const { error: courseError } = await this.supabase
                    .from('courses')
                    .select('id')
                    .limit(1);
                
                if (courseError) {
                    throw new Error(`Database error: ${courseError.message}`);
                }
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
            loader.style.display = 'none';
        }
        
        // Show admin container
        const container = document.querySelector('.admin-container');
        if (container) {
            container.style.display = 'block';
        }
        
        this.showNotification('Connected to database successfully!', 'success');
    }
    
    async loadInitialData() {
        try {
            // Setup event listeners first
            this.setupEventListeners();
            
            // Load dashboard data
            await this.loadDashboardData();
            
            // Load courses for dropdowns
            await this.loadCourses();
            
            // Load assessments
            await this.loadAssessments();
            
            // Load users
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
        
        // Search assessments
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
        
        // Close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
        
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal();
            }
        });
    }
    
    // ==================== DASHBOARD TAB ====================
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
            const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD
            
            const { data: progress } = await this.supabase
                .from('user_assessment_progress')
                .select('user_id')
                .gte('completed_at', thirtyDaysAgoStr);
            
            const uniqueUsers = new Set(progress?.map(u => u.user_id) || []);
            document.getElementById('active-users').textContent = uniqueUsers.size;
            
            // Load completion rate - using a simpler approach
            const { data: allProgress } = await this.supabase
                .from('user_assessment_progress')
                .select('is_correct')
                .limit(1000); // Limit to avoid huge queries
            
            if (allProgress && allProgress.length > 0) {
                const correctCount = allProgress.filter(p => p.is_correct).length;
                const completionRate = Math.round((correctCount / allProgress.length) * 100);
                document.getElementById('completion-rate').textContent = `${completionRate}%`;
            }
            
            // Load recent activity
            await this.loadRecentActivity();
            
        } catch (error) {
            console.error('Error loading dashboard:', error);
            // Set defaults on error
            document.getElementById('total-assessments').textContent = '0';
            document.getElementById('total-courses').textContent = '0';
            document.getElementById('active-users').textContent = '0';
            document.getElementById('completion-rate').textContent = '0%';
        }
    }
    
    async loadRecentActivity() {
        try {
            // Simplified query - get basic progress data
            const { data: activity } = await this.supabase
                .from('user_assessment_progress')
                .select('completed_at, is_correct, assessment_id')
                .order('completed_at', { ascending: false })
                .limit(10);
            
            const activityList = document.getElementById('activity-list');
            if (!activityList) return;
            
            if (!activity || activity.length === 0) {
                activityList.innerHTML = '<div class="activity-item">No recent activity</div>';
                return;
            }
            
            // Get assessment details for each activity item
            const activityWithDetails = await Promise.all(
                activity.map(async (item) => {
                    if (item.assessment_id) {
                        const { data: assessment } = await this.supabase
                            .from('medical_assessments')
                            .select('topic')
                            .eq('id', item.assessment_id)
                            .single();
                        return { ...item, topic: assessment?.topic };
                    }
                    return item;
                })
            );
            
            activityList.innerHTML = activityWithDetails.map(item => {
                const timeAgo = this.formatTimeAgo(item.completed_at);
                const topic = item.topic ? item.topic.substring(0, 30) + '...' : 'an assessment';
                
                return `
                    <div class="activity-item">
                        <i class="fas fa-${item.is_correct ? 'check-circle' : 'times-circle'}"></i>
                        <span>${topic} was ${item.is_correct ? 'correct' : 'incorrect'} (${timeAgo})</span>
                    </div>
                `;
            }).join('');
            
        } catch (error) {
            console.error('Error loading activity:', error);
            const activityList = document.getElementById('activity-list');
            if (activityList) {
                activityList.innerHTML = '<div class="activity-item">Error loading activity</div>';
            }
        }
    }
    
    // ==================== ASSESSMENTS TAB ====================
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
                    created_at
                `)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            this.assessments = assessments || [];
            
            // Get course names separately
            if (this.assessments.length > 0) {
                const courseIds = [...new Set(this.assessments.map(a => a.course_id).filter(Boolean))];
                if (courseIds.length > 0) {
                    const { data: courses } = await this.supabase
                        .from('courses')
                        .select('id, course_name, unit_code')
                        .in('id', courseIds);
                    
                    // Map course info to assessments
                    const courseMap = {};
                    courses?.forEach(course => {
                        courseMap[course.id] = course;
                    });
                    
                    this.assessments = this.assessments.map(assessment => ({
                        ...assessment,
                        course: courseMap[assessment.course_id]
                    }));
                }
            }
            
            // Update course filter
            const courseFilter = document.getElementById('filter-course');
            if (courseFilter && this.courses.length > 0) {
                const activeCourses = this.courses.filter(c => c.status === 'Active');
                courseFilter.innerHTML = '<option value="all">All Courses</option>' +
                    activeCourses.map(course => 
                        `<option value="${course.course_name}">${course.course_name}</option>`
                    ).join('');
            }
            
            // Render table
            this.renderAssessmentsTable();
            
            this.showNotification(`Loaded ${this.assessments.length} assessments`, 'success');
            
        } catch (error) {
            console.error('Error loading assessments:', error);
            this.showNotification('Failed to load assessments', 'error');
            this.assessments = [];
            this.renderAssessmentsTable();
        }
    }
    
    renderAssessmentsTable() {
        const tableBody = document.querySelector('#assessments-table tbody');
        if (!tableBody) return;
        
        if (this.assessments.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No assessments found</td></tr>';
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
                statusBadge = '<span class="badge" style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">Inactive</span>';
            } else if (!assessment.is_published) {
                statusBadge = '<span class="badge" style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">Draft</span>';
            } else {
                statusBadge = '<span class="badge" style="background: #10b981; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">Published</span>';
            }
            
            const courseName = assessment.course?.course_name || 'No course';
            
            return `
                <tr>
                    <td>${assessment.id.substring(0, 8)}...</td>
                    <td>${assessment.topic || 'No topic'}</td>
                    <td>${courseName}</td>
                    <td>
                        <span class="difficulty-badge ${assessment.difficulty}">
                            ${assessment.difficulty || 'medium'}
                        </span>
                    </td>
                    <td>${statusBadge}</td>
                    <td>${formattedDate}</td>
                    <td>
                        <button onclick="admin.editAssessment('${assessment.id}')" class="btn-action" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="admin.toggleAssessmentStatus('${assessment.id}')" class="btn-action" title="${assessment.is_published ? 'Unpublish' : 'Publish'}">
                            <i class="fas ${assessment.is_published ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button onclick="admin.deleteAssessment('${assessment.id}')" class="btn-action" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
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
            
            row.style.display = matchesSearch && matchesCourse && matchesDifficulty && matchesStatus ? '' : 'none';
        });
    }
    
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
                created_at: new Date().toISOString(),
                option_a: 'Option A',
                option_b: 'Option B',
                option_c: 'Option C',
                option_d: 'Option D',
                correct_answer: 'A',
                explanation: 'Explanation will be added here',
                estimated_time: 2
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
            
            // Refresh data
            await this.loadAssessments();
            await this.loadDashboardData();
            
            // Trigger real-time update for students
            this.triggerStudentUpdate();
            
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
            
            // Set course dropdown
            const courseSelect = document.getElementById('assessment-course');
            if (courseSelect) {
                courseSelect.value = assessment.course_id || '';
            }
            
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
            form.dataset.editId = assessmentId;
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
            
            // Refresh data
            await this.loadAssessments();
            
            // Trigger real-time update for students
            this.triggerStudentUpdate();
            
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
            
            // Refresh data
            await this.loadAssessments();
            await this.loadDashboardData();
            
            // Trigger real-time update for students
            this.triggerStudentUpdate();
            
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
            
            // Refresh data
            await this.loadAssessments();
            
            // Trigger real-time update for students
            this.triggerStudentUpdate();
            
        } catch (error) {
            console.error('Error toggling assessment status:', error);
            this.showNotification('Failed to update assessment status', 'error');
        }
    }
    
    // ==================== COURSES TAB ====================
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
            if (courseSelect && this.courses.length > 0) {
                const activeCourses = this.courses.filter(c => c.status === 'Active');
                courseSelect.innerHTML = '<option value="">Select Course</option>' +
                    activeCourses.map(course => `
                        <option value="${course.id}">
                            ${course.course_name} (${course.unit_code || 'No code'})
                        </option>
                    `).join('');
            }
            
        } catch (error) {
            console.error('Error loading courses:', error);
            this.showNotification('Failed to load courses', 'error');
            this.courses = [];
            this.renderCoursesTable();
        }
    }
    
    renderCoursesTable() {
        const tableBody = document.querySelector('#courses-table tbody');
        if (!tableBody) return;
        
        if (this.courses.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No courses found</td></tr>';
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
                        <span style="background: ${course.status === 'Active' ? '#10b981' : '#ef4444'}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">
                            ${course.status}
                        </span>
                    </td>
                    <td>
                        <button onclick="admin.editCourse('${course.id}')" class="btn-action" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="admin.toggleCourseStatus('${course.id}')" class="btn-action" title="${course.status === 'Active' ? 'Deactivate' : 'Activate'}">
                            <i class="fas fa-power-off"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
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
            
            // Refresh data
            await this.loadCourses();
            await this.loadDashboardData();
            
            // Refresh assessments to update course dropdown
            await this.loadAssessments();
            
            // Trigger real-time update for students
            this.triggerStudentUpdate();
            
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
            form.dataset.editId = courseId;
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
            
            // Refresh data
            await this.loadCourses();
            
            // Refresh assessments to update course dropdown
            await this.loadAssessments();
            
            // Trigger real-time update for students
            this.triggerStudentUpdate();
            
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
            
            // Refresh data
            await this.loadCourses();
            await this.loadDashboardData();
            
            // Refresh assessments to update course dropdown
            await this.loadAssessments();
            
            // Trigger real-time update for students
            this.triggerStudentUpdate();
            
        } catch (error) {
            console.error('Error toggling course status:', error);
            this.showNotification('Failed to update course status', 'error');
        }
    }
    
    // ==================== USERS TAB ====================
    async loadUsers() {
        try {
            // Try to load users from profiles table
            const { data: users, error } = await this.supabase
                .from('profiles')
                .select('*')
                .limit(50);
            
            if (error) {
                console.warn('Could not load users:', error.message);
                this.users = [];
                this.renderUsersTable();
                return;
            }
            
            this.users = users || [];
            await this.renderUsersTable();
            
        } catch (error) {
            console.error('Error loading users:', error);
            this.users = [];
            this.renderUsersTable();
        }
    }
    
    async renderUsersTable() {
        const tableBody = document.querySelector('#users-table tbody');
        if (!tableBody) return;
        
        if (this.users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No users found</td></tr>';
            return;
        }
        
        // Simple rendering without progress data to avoid errors
        tableBody.innerHTML = this.users.map(user => {
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
                        <button onclick="admin.viewUserProgress('${user.id}')" class="btn-action" title="View Progress">
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
            const matches = !searchTerm || userName.includes(searchTerm);
            row.style.display = matches ? '' : 'none';
        });
    }
    
    // ==================== SETTINGS TAB ====================
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
    
    // ==================== UTILITY FUNCTIONS ====================
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
    
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }
    
    closeModal() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
        document.body.style.overflow = 'auto';
        
        // Reset forms
        const assessmentForm = document.getElementById('assessment-form');
        if (assessmentForm) {
            assessmentForm.reset();
            delete assessmentForm.dataset.editId;
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
            delete courseForm.dataset.editId;
            courseForm.onsubmit = (e) => {
                e.preventDefault();
                this.saveCourse();
            };
            document.querySelector('#add-course-modal h3').innerHTML = `
                <i class="fas fa-book-medical"></i> Add New Course
            `;
        }
    }
    
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
        if (!container) {
            // Create container if it doesn't exist
            const containerDiv = document.createElement('div');
            containerDiv.id = 'notification-container';
            containerDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                max-width: 400px;
            `;
            document.body.appendChild(containerDiv);
        }
        
        const finalContainer = document.getElementById('notification-container');
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
            animation: slideIn 0.3s ease;
        `;
        
        notification.innerHTML = `
            <div>
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span style="margin-left: 10px;">${message}</span>
            </div>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; padding: 0 5px;">
                &times;
            </button>
        `;
        
        finalContainer.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
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
                text.textContent = status === 'connected' ? 'Connected' : 'Error';
            }
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
    
    // ==================== REAL-TIME UPDATES ====================
    
    // This function triggers updates in the student view
    triggerStudentUpdate() {
        console.log('🔄 Triggering student view update...');
        
        // Method 1: Broadcast via localStorage (works within same browser)
        const updateEvent = {
            type: 'nurseiq_update',
            timestamp: new Date().toISOString(),
            message: 'New assessments available'
        };
        
        localStorage.setItem('nurseiq_last_update', JSON.stringify(updateEvent));
        
        // Method 2: Dispatch a storage event (works across tabs)
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'nurseiq_last_update',
            newValue: JSON.stringify(updateEvent)
        }));
        
        // Method 3: Set a flag that student view can check
        sessionStorage.setItem('force_refresh_nurseiq', 'true');
        
        this.showNotification('Student view will be updated automatically', 'success');
    }
    
    showError(title, message) {
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
                    </div>
                </div>
            `;
        }
    }
    
    // ==================== GLOBAL FUNCTIONS ====================
    
    openAddAssessmentModal() {
        this.openModal('add-assessment-modal');
    }
    
    openAddCourseModal() {
        this.openModal('add-course-modal');
    }
    
    viewUserProgress(userId) {
        this.showNotification(`Viewing progress for user ${userId.substring(0, 8)}...`, 'info');
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
    
    showConnectionDetails() {
        alert(`Connection Details:\nURL: ${this.config.supabaseUrl}\nEnvironment: ${this.config.environment}`);
    }
    
    clearCache() {
        localStorage.clear();
        this.showNotification('Cache cleared!', 'success');
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
        if (confirm('Reset all settings?')) {
            localStorage.clear();
            location.reload();
        }
    }
    
    generateReport() {
        this.showNotification('Report generation coming soon!', 'info');
    }
    
    openImportModal() {
        this.showNotification('Import feature coming soon!', 'info');
    }
}
    // ==================== MISSING FUNCTIONS ====================
    
    showLoader(message) {
        const loader = document.getElementById('config-loader');
        if (loader) {
            const messageEl = loader.querySelector('p');
            if (messageEl && message) {
                messageEl.textContent = message;
            }
        }
    }
    
    showError(title, message) {
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
                text.textContent = status === 'connected' ? 'Connected' : 'Error';
            }
        }
    }
// Initialize admin panel when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.admin = new NurseIQAdmin();
});

// Make functions globally available
window.openAddAssessmentModal = () => window.admin.openAddAssessmentModal();
window.openAddCourseModal = () => window.admin.openAddCourseModal();
window.openImportModal = () => window.admin.openImportModal();
window.generateReport = () => window.admin.generateReport();
window.testConnection = () => window.admin.testConnection();
window.showConnectionDetails = () => window.admin.showConnectionDetails();
window.clearCache = () => window.admin.clearCache();
window.exportData = () => window.admin.exportData();
window.resetSettings = () => window.admin.resetSettings();
window.refreshAssessments = () => window.admin.refreshAssessments();
window.refreshCourses = () => window.admin.refreshCourses();
window.refreshUsers = () => window.admin.refreshUsers();
window.closeModal = () => window.admin.closeModal();
