// NurseIQ Admin Panel JavaScript - GitHub Secrets Integration

// Configuration variables (will be loaded from GitHub Secrets)
let supabase = null;
let config = {
    supabaseUrl: '',
    supabaseKey: '',
    environment: 'production',
    debug: false
};

// DOM Elements
let currentTab = 'dashboard';

// Main initialization
async function initializeAdmin() {
    try {
        console.log('🚀 Initializing NurseIQ Admin Panel...');
        
        // Step 1: Load configuration from environment/GitHub Secrets
        await loadConfiguration();
        
        // Step 2: Initialize Supabase client
        await initializeSupabase();
        
        // Step 3: Verify database connection
        await verifyConnection();
        
        // Step 4: Show admin interface
        showAdminInterface();
        
        // Step 5: Load initial data
        await loadInitialData();
        
        console.log('✅ Admin panel initialized successfully!');
        
    } catch (error) {
        console.error('❌ Failed to initialize admin panel:', error);
        showConfigError(error.message);
    }
}

// Load configuration from GitHub Secrets/environment
async function loadConfiguration() {
    showLoader('Loading configuration from GitHub Secrets...');
    
    try {
        // Method 1: Try to get from window object (if set by GitHub Pages)
        if (window.GITHUB_SECRETS) {
            config = { ...config, ...window.GITHUB_SECRETS };
            console.log('📁 Configuration loaded from window.GITHUB_SECRETS');
        }
        
        // Method 2: Try to get from environment variables (Netlify, Vercel, etc.)
        if (window.process?.env) {
            config.supabaseUrl = window.process.env.SUPABASE_URL || config.supabaseUrl;
            config.supabaseKey = window.process.env.SUPABASE_ANON_KEY || config.supabaseKey;
            console.log('📁 Configuration loaded from environment variables');
        }
        
        // Method 3: Try to fetch from config endpoint
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const data = await response.json();
                config = { ...config, ...data };
                console.log('📁 Configuration loaded from API endpoint');
            }
        } catch (e) {
            // API endpoint might not exist, that's okay
        }
        
        // Method 4: Check for config in localStorage (for development)
        const localConfig = localStorage.getItem('nurseiq_admin_config');
        if (localConfig && (config.supabaseUrl === '' || config.supabaseKey === '')) {
            const parsed = JSON.parse(localConfig);
            config.supabaseUrl = parsed.supabaseUrl || config.supabaseUrl;
            config.supabaseKey = parsed.supabaseKey || config.supabaseKey;
            console.log('📁 Configuration loaded from localStorage');
        }
        
        // Method 5: Prompt user if still missing
        if (!config.supabaseUrl || !config.supabaseKey) {
            console.log('⚠️ Configuration missing, prompting user...');
            await promptForConfiguration();
        }
        
        // Validate configuration
        if (!config.supabaseUrl) {
            throw new Error('SUPABASE_URL is required');
        }
        if (!config.supabaseKey) {
            throw new Error('SUPABASE_ANON_KEY is required');
        }
        
        // Sanitize URLs
        config.supabaseUrl = config.supabaseUrl.trim();
        if (!config.supabaseUrl.startsWith('https://')) {
            config.supabaseUrl = 'https://' + config.supabaseUrl;
        }
        
        console.log('✅ Configuration loaded successfully:', {
            supabaseUrl: config.supabaseUrl.substring(0, 20) + '...',
            supabaseKey: config.supabaseKey.substring(0, 10) + '...',
            environment: config.environment
        });
        
        // Save to localStorage for future use
        localStorage.setItem('nurseiq_admin_config', JSON.stringify({
            supabaseUrl: config.supabaseUrl,
            supabaseKey: config.supabaseKey,
            timestamp: new Date().toISOString()
        }));
        
    } catch (error) {
        console.error('❌ Failed to load configuration:', error);
        throw new Error(`Configuration error: ${error.message}`);
    }
}

// Initialize Supabase client
async function initializeSupabase() {
    showLoader('Initializing Supabase connection...');
    
    try {
        // Import Supabase client dynamically
        const { createClient } = window.supabase;
        
        // Create Supabase client
        supabase = createClient(config.supabaseUrl, config.supabaseKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            },
            global: {
                headers: {
                    'X-Client-Info': 'nurseiq-admin-panel'
                }
            }
        });
        
        console.log('✅ Supabase client initialized');
        
    } catch (error) {
        console.error('❌ Failed to initialize Supabase:', error);
        throw new Error(`Supabase initialization failed: ${error.message}`);
    }
}

// Verify database connection
async function verifyConnection() {
    showLoader('Verifying database connection...');
    
    try {
        // Test connection by fetching a simple query
        const { data, error } = await supabase
            .from('medical_assessments')
            .select('id')
            .limit(1);
        
        if (error) {
            // If medical_assessments doesn't exist, try courses
            const { error: courseError } = await supabase
                .from('courses')
                .select('id')
                .limit(1);
            
            if (courseError) {
                throw new Error(`Database connection failed: ${courseError.message}`);
            }
        }
        
        console.log('✅ Database connection verified');
        
        // Get server info
        const { data: serverInfo } = await supabase.rpc('get_server_info');
        if (serverInfo) {
            console.log('📊 Server info:', serverInfo);
        }
        
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw new Error(`Connection verification failed: ${error.message}`);
    }
}

// Show admin interface
function showAdminInterface() {
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
        container.classList.add('reveal');
    }
    
    // Update status indicator
    updateStatusIndicator('connected');
    
    // Show success notification
    showConfigStatus('Connected to database successfully!', 'success');
}

// Load initial data
async function loadInitialData() {
    try {
        // Initialize tabs
        initializeTabs();
        
        // Load dashboard data
        await loadDashboardData();
        
        // Load assessments
        await loadAssessments();
        
        // Load courses
        await loadCourses();
        
        // Load users
        await loadUsers();
        
        // Initialize modals
        initModals();
        
        // Set up event listeners
        setupEventListeners();
        
        console.log('✅ All initial data loaded');
        
    } catch (error) {
        console.error('❌ Error loading initial data:', error);
        showNotification('Some data failed to load. Please refresh.', 'warning');
    }
}

// Configuration prompt modal
async function promptForConfiguration() {
    return new Promise((resolve) => {
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'config-modal';
        modal.innerHTML = `
            <div class="config-modal-content">
                <div class="config-modal-header">
                    <h3><i class="fas fa-cog"></i> Configuration Required</h3>
                    <p>Please enter your Supabase credentials</p>
                </div>
                <div class="config-modal-body">
                    <div class="form-group">
                        <label>Supabase URL *</label>
                        <input type="text" id="config-url" class="form-control" 
                               placeholder="https://your-project.supabase.co"
                               value="${config.supabaseUrl}">
                        <small class="form-text">Get this from your Supabase project settings</small>
                    </div>
                    <div class="form-group">
                        <label>Supabase Anon Key *</label>
                        <input type="password" id="config-key" class="form-control" 
                               placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                               value="${config.supabaseKey}">
                        <small class="form-text">Get this from your Supabase project settings</small>
                    </div>
                    <div class="form-group">
                        <label>Environment</label>
                        <select id="config-env" class="form-control">
                            <option value="production" ${config.environment === 'production' ? 'selected' : ''}>Production</option>
                            <option value="development" ${config.environment === 'development' ? 'selected' : ''}>Development</option>
                        </select>
                    </div>
                </div>
                <div class="config-modal-footer">
                    <button id="config-cancel" class="btn btn-outline">Cancel</button>
                    <button id="config-save" class="btn btn-primary">Save & Connect</button>
                </div>
            </div>
        `;
        
        // Add styles
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
            animation: fadeIn 0.3s ease;
        `;
        
        const content = modal.querySelector('.config-modal-content');
        content.style.cssText = `
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            animation: slideUp 0.4s ease;
        `;
        
        document.body.appendChild(modal);
        
        // Set up event listeners
        modal.querySelector('#config-save').addEventListener('click', () => {
            config.supabaseUrl = document.getElementById('config-url').value.trim();
            config.supabaseKey = document.getElementById('config-key').value.trim();
            config.environment = document.getElementById('config-env').value;
            
            if (!config.supabaseUrl || !config.supabaseKey) {
                alert('Please fill in all required fields');
                return;
            }
            
            document.body.removeChild(modal);
            resolve();
        });
        
        modal.querySelector('#config-cancel').addEventListener('click', () => {
            document.body.removeChild(modal);
            throw new Error('Configuration cancelled by user');
        });
    });
}

// Show loader with message
function showLoader(message) {
    const loader = document.getElementById('config-loader');
    if (loader) {
        const messageEl = loader.querySelector('p');
        if (messageEl) {
            messageEl.textContent = message;
        }
    }
}

// Show configuration status
function showConfigStatus(message, type = 'success') {
    // Remove any existing status
    const existing = document.querySelector('.config-status');
    if (existing) existing.remove();
    
    // Create new status
    const status = document.createElement('div');
    status.className = `config-status ${type}`;
    status.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(status);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (status.parentElement) {
            status.remove();
        }
    }, 5000);
}

// Update status indicator
function updateStatusIndicator(status) {
    const indicator = document.querySelector('.status-indicator');
    if (!indicator) return;
    
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('span:last-child');
    
    if (dot) {
        dot.className = 'status-dot';
        dot.classList.add(status);
    }
    
    if (text) {
        const messages = {
            connected: 'Connected to Database',
            connecting: 'Connecting...',
            error: 'Connection Error'
        };
        text.textContent = messages[status] || status;
    }
}

// Show configuration error
function showConfigError(errorMessage) {
    const loader = document.getElementById('config-loader');
    if (loader) {
        loader.innerHTML = `
            <div class="error-content">
                <div class="error-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Configuration Error</h3>
                <p>${errorMessage}</p>
                <div class="error-actions">
                    <button onclick="location.reload()" class="btn btn-primary">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                    <button onclick="showConfigHelp()" class="btn btn-outline">
                        <i class="fas fa-question-circle"></i> Get Help
                    </button>
                </div>
                <div class="error-debug">
                    <small>Check browser console for details</small>
                </div>
            </div>
        `;
        
        // Add error styles
        loader.querySelector('.error-content').style.cssText = `
            text-align: center;
            color: white;
            max-width: 500px;
            padding: 40px;
        `;
        
        loader.querySelector('.error-icon').style.cssText = `
            font-size: 60px;
            color: #ff6b6b;
            margin-bottom: 20px;
        `;
    }
}

// Configuration help
function showConfigHelp() {
    alert(`
How to configure NurseIQ Admin:

1. Get your Supabase credentials:
   - Go to your Supabase project
   - Click on Settings → API
   - Copy "Project URL" as SUPABASE_URL
   - Copy "anon public" key as SUPABASE_ANON_KEY

2. For GitHub Pages deployment:
   - Add these as GitHub Secrets:
     - SUPABASE_URL
     - SUPABASE_ANON_KEY
   - They will be available as window.GITHUB_SECRETS

3. For local development:
   - Credentials will be saved in localStorage
   - Or set them in the configuration prompt

Need help? Contact support.
    `);
}

// Export configuration for debugging
window.getConfig = () => ({ ...config });

// Export Supabase client for debugging
window.getSupabase = () => supabase;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 NurseIQ Admin Panel loaded');
    initializeAdmin();
});

// Keep all other existing functions (loadAssessments, loadCourses, etc.)
// They remain the same as in the previous version
