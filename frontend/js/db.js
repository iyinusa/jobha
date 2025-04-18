/**
 * Jobha - Offline Database with Dexie.js
 * Handle local storage and offline-first approach
 */

// Import Dexie from CDN if not loaded (will include in HTML)
const Dexie = window.Dexie;

// Create database instance
const db = new Dexie('JobhaDB');

// Define database schema with tables and indexes
db.version(1).stores({
    // User settings
    settings: '++id, lastSync',
    
    // Job searches and saved jobs
    jobs: '++id, jobId, title, company, location, source, dateAdded, status, isSynced',
    
    // User CVs
    cvs: '++id, title, content, lastModified, isSynced',
    
    // Cover letters
    coverLetters: '++id, title, jobId, content, created, isSynced',
    
    // Search history and preferences
    searchHistory: '++id, query, location, timestamp',
    
    // Offline actions queue (for synchronization)
    syncQueue: '++id, action, data, timestamp'
});

/**
 * JobhaDB - Database interface for the application
 * Provides methods for CRUD operations with offline support
 */
const JobhaDB = (() => {
    
    /**
     * Save user settings locally
     * @param {Object} settings - User settings object
     */
    async function saveSettings(settings) {
        settings.lastSync = new Date().toISOString();
        await db.settings.put(settings);
        
        // Add to sync queue to update server when online
        await addToSyncQueue('settings_update', settings);
        
        return settings;
    }
    
    /**
     * Get user settings
     * @returns {Object} - User settings
     */
    async function getSettings() {
        let settings = await db.settings.toArray();
        return settings[0] || { 
            notifications: true, 
            jobSources: ['linkedin', 'indeed', 'glassdoor'],
            keywords: [],
            locations: [], 
            lastSync: null 
        };
    }
    
    /**
     * Save a job to local database
     * @param {Object} job - Job object
     */
    async function saveJob(job) {
        job.dateAdded = job.dateAdded || new Date().toISOString();
        job.status = job.status || 'saved';
        job.isSynced = false;
        
        const id = await db.jobs.put(job);
        
        // Add to sync queue
        await addToSyncQueue('job_save', { ...job, id });
        
        return id;
    }
    
    /**
     * Get all saved jobs
     * @param {Object} options - Filter options
     */
    async function getJobs(options = {}) {
        let query = db.jobs;
        
        if (options.status) {
            query = query.where('status').equals(options.status);
        }
        
        if (options.company) {
            query = query.where('company').equals(options.company);
        }
        
        return await query.reverse().sortBy('dateAdded');
    }
    
    /**
     * Save or update a CV
     * @param {Object} cv - CV object with content
     */
    async function saveCV(cv) {
        cv.lastModified = new Date().toISOString();
        cv.isSynced = false;
        
        const id = await db.cvs.put(cv);
        
        // Add to sync queue
        await addToSyncQueue('cv_save', { ...cv, id });
        
        return id;
    }
    
    /**
     * Get all saved CVs
     */
    async function getCVs() {
        return await db.cvs.reverse().sortBy('lastModified');
    }
    
    /**
     * Save a cover letter
     * @param {Object} coverLetter - Cover letter object
     */
    async function saveCoverLetter(coverLetter) {
        coverLetter.created = coverLetter.created || new Date().toISOString();
        coverLetter.isSynced = false;
        
        const id = await db.coverLetters.put(coverLetter);
        
        // Add to sync queue
        await addToSyncQueue('cover_letter_save', { ...coverLetter, id });
        
        return id;
    }
    
    /**
     * Get all cover letters, optionally filtered by job ID
     * @param {string} jobId - Optional job ID to filter by
     */
    async function getCoverLetters(jobId = null) {
        if (jobId) {
            return await db.coverLetters
                .where('jobId')
                .equals(jobId)
                .reverse()
                .sortBy('created');
        }
        
        return await db.coverLetters.reverse().sortBy('created');
    }
    
    /**
     * Save search history
     * @param {string} query - Search query
     * @param {string} location - Search location
     */
    async function saveSearchHistory(query, location) {
        return await db.searchHistory.add({
            query,
            location,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Get search history
     * @param {number} limit - Max items to return
     */
    async function getSearchHistory(limit = 10) {
        return await db.searchHistory
            .reverse()
            .limit(limit)
            .sortBy('timestamp');
    }
    
    /**
     * Add an action to the sync queue for later synchronization
     * @param {string} action - Action type
     * @param {Object} data - Data to sync
     */
    async function addToSyncQueue(action, data) {
        return await db.syncQueue.add({
            action,
            data,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Process sync queue when online
     * @param {Function} apiClient - API client to use for sync
     */
    async function processSyncQueue(apiClient) {
        const queue = await db.syncQueue.toArray();
        
        for (const item of queue) {
            try {
                // Process based on action type
                switch (item.action) {
                    case 'job_save':
                        await apiClient.jobs.saveJob(item.data.jobId);
                        await db.jobs.update(item.data.id, { isSynced: true });
                        break;
                        
                    case 'cv_save':
                        // Implement server sync for CV
                        break;
                        
                    case 'cover_letter_save':
                        // Implement server sync for cover letter
                        break;
                        
                    case 'settings_update':
                        // Implement server sync for settings
                        break;
                }
                
                // Remove from queue after successful sync
                await db.syncQueue.delete(item.id);
            } catch (error) {
                console.error(`Failed to sync item ${item.id}:`, error);
                // Keep in queue for next sync attempt
            }
        }
    }
    
    /**
     * Check if user is online
     * @returns {boolean} - Online status
     */
    function isOnline() {
        return navigator.onLine;
    }
    
    /**
     * Initialize network listeners for online/offline events
     */
    function initNetworkListeners() {
        window.addEventListener('online', () => {
            console.log('App is online. Starting sync...');
            processSyncQueue(window.jobhaApi);
        });
        
        window.addEventListener('offline', () => {
            console.log('App is offline. Data will be stored locally.');
        });
    }
    
    // Public API
    return {
        saveSettings,
        getSettings,
        saveJob,
        getJobs,
        saveCV,
        getCVs,
        saveCoverLetter,
        getCoverLetters,
        saveSearchHistory,
        getSearchHistory,
        processSyncQueue,
        isOnline,
        initNetworkListeners
    };
})();

// Make database interface available globally
window.JobhaDB = JobhaDB;

// Initialize network listeners when script loads
JobhaDB.initNetworkListeners();