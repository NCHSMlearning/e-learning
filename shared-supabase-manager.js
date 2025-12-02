// shared-supabase-manager.js - For both pages
const SUPABASE_CONFIG = {
    url: 'https://lwhtjozfsmbyihenfunw.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3aHRqb3pmc21ieWloZW5mdW53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2NTgxMjcsImV4cCI6MjA3NTIzNDEyN30.7Z8AYvPQwTAEEEhODlW6Xk-IR1FK3Uj5ivZS7P17Wpk'
};

class SharedSupabaseManager {
    constructor() {
        if (!window.supabase) {
            console.error('Supabase not initialized. Load supabase-js first.');
            return;
        }
        
        this.supabase = window.supabase;
        this.channels = {};
        this.subscriptions = new Map();
    }
    
    // ========== SHARED SETTINGS ==========
    
    // Admin: Save settings that affect hod-tracker.html
    async saveDisplaySettings(settings) {
        try {
            const updates = Object.entries(settings).map(async ([key, value]) => {
                const { error } = await this.supabase
                    .from('shared_settings')
                    .upsert({
                        setting_type: 'display',
                        setting_key: key,
                        setting_value: value,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'setting_type,setting_key'
                    });
                    
                if (error) throw error;
            });
            
            await Promise.all(updates);
            console.log('Display settings saved');
            return true;
        } catch (error) {
            console.error('Error saving display settings:', error);
            return false;
        }
    }
    
    // Display page: Get settings
    async getDisplaySettings() {
        try {
            const { data, error } = await this.supabase
                .from('shared_settings')
                .select('*')
                .eq('setting_type', 'display');
                
            if (error) throw error;
            
            const settings = {};
            data.forEach(item => {
                settings[item.setting_key] = item.setting_value;
            });
            
            return settings;
        } catch (error) {
            console.error('Error loading display settings:', error);
            return null;
        }
    }
    
    // ========== REAL-TIME UPDATES ==========
    
    // Admin: Broadcast changes to all display pages
    async broadcastTrackerUpdate(hodId, updateType, data) {
        try {
            // Save to broadcast channel
            const { error } = await this.supabase
                .from('broadcast_messages')
                .insert({
                    message_type: 'tracker_update',
                    target_hod_id: hodId,
                    update_type: updateType,
                    update_data: data,
                    created_at: new Date().toISOString()
                });
                
            if (error) throw error;
            
            // Also update shared cache for immediate access
            await this.supabase
                .from('shared_cache')
                .upsert({
                    cache_key: `hod_${hodId}`,
                    cache_value: data,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'cache_key'
                });
                
            return true;
        } catch (error) {
            console.error('Error broadcasting update:', error);
            return false;
        }
    }
    
    // Display page: Listen for admin updates
    subscribeToAdminUpdates(hodId, callback) {
        const channel = this.supabase
            .channel(`admin-updates-${hodId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'broadcast_messages',
                    filter: `target_hod_id=eq.${hodId}`
                },
                (payload) => {
                    console.log('Admin update received:', payload);
                    callback(payload.new);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'shared_settings'
                },
                (payload) => {
                    console.log('Settings changed:', payload);
                    callback(payload.new);
                }
            )
            .subscribe();
            
        this.channels[hodId] = channel;
        return channel;
    }
    
    // ========== DIRECT EDIT SYNC ==========
    
    // When admin edits a tracker in real-time
    async syncTrackerEdit(hodId, field, value) {
        try {
            // Get current session
            const { data: { session } } = await this.supabase.auth.getSession();
            
            // Create edit log
            const { error } = await this.supabase
                .from('real_time_edits')
                .insert({
                    hod_id: hodId,
                    edited_field: field,
                    new_value: value,
                    edited_by: session?.user?.id || null,
                    edited_at: new Date().toISOString()
                });
                
            if (error) throw error;
            
            // Update cache for immediate access
            await this.supabase
                .from('hod_tracker_cache')
                .upsert({
                    hod_id: hodId,
                    last_edit: {
                        field: field,
                        value: value,
                        timestamp: new Date().toISOString(),
                        editor: session?.user?.email || 'admin'
                    },
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'hod_id'
                });
                
            return true;
        } catch (error) {
            console.error('Error syncing edit:', error);
            return false;
        }
    }
    
    // ========== QUICK SYNC METHODS ==========
    
    // Quick method for admin to push updates
    async pushUpdateToDisplay(updateData) {
        const { hodId, action, data } = updateData;
        
        // Multiple sync methods for reliability
        const methods = [
            this.broadcastTrackerUpdate(hodId, action, data),
            this.syncTrackerEdit(hodId, 'bulk_update', data),
            this.updateCache(hodId, data)
        ];
        
        try {
            await Promise.all(methods);
            return true;
        } catch (error) {
            console.error('Error pushing update:', error);
            return false;
        }
    }
    
    async updateCache(hodId, data) {
        const { error } = await this.supabase
            .from('hod_tracker_cache')
            .upsert({
                hod_id: hodId,
                cache_data: data,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'hod_id'
            });
            
        return !error;
    }
    
    // ========== CLEANUP ==========
    
    unsubscribe(hodId) {
        if (this.channels[hodId]) {
            this.supabase.removeChannel(this.channels[hodId]);
            delete this.channels[hodId];
        }
    }
    
    unsubscribeAll() {
        Object.keys(this.channels).forEach(hodId => {
            this.unsubscribe(hodId);
        });
    }
}

// Initialize once
if (!window.sharedSupabaseManager) {
    window.sharedSupabaseManager = new SharedSupabaseManager();
}
