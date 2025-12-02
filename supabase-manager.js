// supabase-manager.js - Shared between both pages

class SupabaseManager {
    constructor() {
        // Supabase is initialized in HTML
        this.supabase = window.supabase;
        this.subscription = null;
    }
    
    // ========== ADMIN FUNCTIONS ==========
    
    // Save settings (admin page)
    async saveSettings(key, value) {
        try {
            const { data, error } = await this.supabase
                .from('settings')
                .upsert({
                    setting_key: key,
                    setting_value: value,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'setting_key'
                });
                
            if (error) throw error;
            console.log(`Settings "${key}" saved successfully`);
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }
    
    // Save all HOD data
    async saveHODData(departments, hods) {
        await this.saveSettings('departments', departments);
        await this.saveSettings('hods', hods);
        await this.saveSettings('last_updated', { 
            timestamp: new Date().toISOString(),
            updated_by: 'admin'
        });
    }
    
    // ========== DISPLAY FUNCTIONS ==========
    
    // Load settings (display page)
    async loadSettings(key) {
        try {
            const { data, error } = await this.supabase
                .from('settings')
                .select('setting_value')
                .eq('setting_key', key)
                .single();
                
            if (error) throw error;
            return data.setting_value;
        } catch (error) {
            console.error(`Error loading "${key}":`, error);
            return null;
        }
    }
    
    // Load all data for display
    async loadAllData() {
        try {
            const { data, error } = await this.supabase
                .from('settings')
                .select('setting_key, setting_value');
                
            if (error) throw error;
            
            // Convert array to object
            const result = {};
            data.forEach(item => {
                result[item.setting_key] = item.setting_value;
            });
            
            return result;
        } catch (error) {
            console.error('Error loading all data:', error);
            return null;
        }
    }
    
    // ========== REAL-TIME UPDATES ==========
    
    // Subscribe to changes (display page)
    subscribeToUpdates(callback) {
        this.subscription = this.supabase
            .channel('settings-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',  // INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'settings'
                },
                (payload) => {
                    console.log('Settings updated:', payload);
                    callback(payload);
                }
            )
            .subscribe();
        
        console.log('Subscribed to real-time updates');
    }
    
    // Unsubscribe
    unsubscribe() {
        if (this.subscription) {
            this.supabase.removeChannel(this.subscription);
        }
    }
    
    // ========== HELPER FUNCTIONS ==========
    
    // Check connection
    async testConnection() {
        try {
            const { data, error } = await this.supabase
                .from('settings')
                .select('count', { count: 'exact', head: true });
            
            return !error;
        } catch (error) {
            return false;
        }
    }
}

// Create global instance
window.supabaseManager = new SupabaseManager();
