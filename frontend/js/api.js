/**
 * Jobha - Job Agent API JavaScript
 * Handle connections to the backend API
 * Enhanced with offline-first capabilities using IndexedDB
 */

const jobhaApi = (function() {
    // API base URL - this would be set to actual backend in production
    const API_BASE_URL = 'http://localhost:8000/api';
    
    // Store the auth token after login
    let authToken = localStorage.getItem('jobha_token');
    
    /**
     * Make an API request with appropriate headers and error handling
     */
    async function apiRequest(endpoint, options = {}) {
        // Check if online
        if (!navigator.onLine) {
            throw new Error('You are currently offline. The action will be queued for when you are back online.');
        }
        
        // Set default headers
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        // Add auth token if available
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        // Build request options
        const requestOptions = {
            ...options,
            headers
        };
        
        try {
            // Make the fetch request
            const response = await fetch(`${API_BASE_URL}${endpoint}`, requestOptions);
            
            // Handle non-2xx responses
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Request failed with status ${response.status}`);
            }
            
            // Parse JSON response
            return await response.json();
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }
    
    /**
     * Authentication API methods
     */
    const auth = {
        /**
         * Register a new user
         * @param {Object} userData - User registration data
         */
        register: async (userData) => {
            // Try online registration first
            try {
                const response = await apiRequest('/users/register', {
                    method: 'POST',
                    body: JSON.stringify(userData)
                });
                
                return response;
            } catch (error) {
                // If offline, store registration request for later
                if (!navigator.onLine) {
                    await JobhaDB.addToSyncQueue('user_register', userData);
                    return {
                        success: true,
                        message: "Your registration will be processed when you're back online",
                        offline: true
                    };
                }
                
                throw error;
            }
        },
        
        /**
         * Login a user
         * @param {Object} credentials - User login credentials
         */
        login: async (credentials) => {
            try {
                const response = await apiRequest('/users/login', {
                    method: 'POST',
                    body: JSON.stringify(credentials)
                });
                
                // Store the token if login successful
                if (response.access_token) {
                    authToken = response.access_token;
                    localStorage.setItem('jobha_token', authToken);
                }
                
                return response;
            } catch (error) {
                // If offline, provide limited offline access with previous token
                if (!navigator.onLine && authToken) {
                    return {
                        success: true,
                        access_token: authToken,
                        token_type: "bearer",
                        message: "Using cached credentials. Limited functionality available offline.",
                        offline: true
                    };
                }
                
                // For true first-time login, we can't authenticate offline
                throw error;
            }
        },
        
        /**
         * Logout the current user
         */
        logout: () => {
            authToken = null;
            localStorage.removeItem('jobha_token');
            return { success: true };
        },
        
        /**
         * Check if user is logged in
         */
        isLoggedIn: () => {
            return !!authToken;
        }
    };
    
    /**
     * User profile API methods
     */
    const profile = {
        /**
         * Get the current user's profile
         */
        getProfile: async () => {
            try {
                return await apiRequest('/users/profile', {
                    method: 'GET'
                });
            } catch (error) {
                // If offline, try to get cached profile from local storage
                if (!navigator.onLine) {
                    const cachedProfile = localStorage.getItem('jobha_user_profile');
                    if (cachedProfile) {
                        return {
                            success: true,
                            profile: JSON.parse(cachedProfile),
                            offline: true
                        };
                    }
                }
                
                throw error;
            }
        },
        
        /**
         * Update the user's profile
         * @param {Object} profileData - Profile data to update
         */
        updateProfile: async (profileData) => {
            try {
                const response = await apiRequest('/users/profile', {
                    method: 'PUT',
                    body: JSON.stringify(profileData)
                });
                
                // Cache the updated profile
                localStorage.setItem('jobha_user_profile', JSON.stringify(profileData));
                
                return response;
            } catch (error) {
                // If offline, store the update for later sync
                if (!navigator.onLine) {
                    await JobhaDB.addToSyncQueue('profile_update', profileData);
                    
                    // Update the local cache immediately
                    localStorage.setItem('jobha_user_profile', JSON.stringify(profileData));
                    
                    return {
                        success: true,
                        message: "Profile updated offline. Will sync when back online.",
                        profile: profileData,
                        offline: true
                    };
                }
                
                throw error;
            }
        },
        
        /**
         * Upload a CV file
         * @param {File} file - The CV file to upload
         */
        uploadCV: async (file) => {
            if (!navigator.onLine) {
                // Store the file locally until we're back online
                try {
                    // Read file as text
                    const text = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsText(file);
                    });
                    
                    // Store in IndexedDB
                    await JobhaDB.saveCV({
                        title: file.name,
                        content: text,
                        originalFile: file,
                        fileType: file.type
                    });
                    
                    return {
                        success: true,
                        message: "CV stored locally. Will upload when back online.",
                        offline: true
                    };
                } catch (error) {
                    console.error('Error storing CV locally:', error);
                    throw new Error('Failed to store CV locally: ' + error.message);
                }
            }
            
            const formData = new FormData();
            formData.append('file', file);
            
            return apiRequest('/cv/upload', {
                method: 'POST',
                headers: {}, // Let browser set content-type with boundary
                body: formData
            });
        }
    };
    
    /**
     * Jobs API methods
     */
    const jobs = {
        /**
         * Search for jobs
         * @param {string} keyword - Job title, skill or keyword
         * @param {string} location - Location for job search
         * @param {Object} filters - Additional filters
         */
        searchJobs: async (keyword, location = '', filters = {}) => {
            // Save search to history
            await JobhaDB.saveSearchHistory(keyword, location);
            
            const queryParams = new URLSearchParams({
                keyword,
                ...(location ? { location } : {}),
                ...filters,
                page: filters.page || 1,
                limit: filters.limit || 10
            });
            
            try {
                // Try to get from API if online
                if (navigator.onLine) {
                    const results = await apiRequest(`/jobs/search?${queryParams.toString()}`, {
                        method: 'GET'
                    });
                    
                    // Store results in local DB for offline access
                    if (results.success && results.jobs) {
                        for (const job of results.jobs) {
                            await JobhaDB.saveJob({
                                jobId: job.id,
                                title: job.title,
                                company: job.company,
                                location: job.location,
                                description: job.description,
                                salary: job.salary,
                                postedDate: job.posted_date,
                                url: job.url,
                                source: 'api',
                                searchQuery: keyword,
                                searchLocation: location
                            });
                        }
                    }
                    
                    return results;
                }
            } catch (error) {
                console.error('Online job search failed:', error);
                // Fall through to offline search
            }
            
            // Offline search using local database
            try {
                const allJobs = await JobhaDB.getJobs();
                
                // Simple filtering by keyword and location
                const filtered = allJobs.filter(job => {
                    const keywordMatch = !keyword || 
                        job.title.toLowerCase().includes(keyword.toLowerCase()) || 
                        job.description.toLowerCase().includes(keyword.toLowerCase());
                    
                    const locationMatch = !location || 
                        job.location.toLowerCase().includes(location.toLowerCase());
                    
                    return keywordMatch && locationMatch;
                });
                
                // Manual pagination
                const page = filters.page || 1;
                const limit = filters.limit || 10;
                const start = (page - 1) * limit;
                const end = start + limit;
                const paginatedJobs = filtered.slice(start, end);
                
                return {
                    success: true,
                    offline: true,
                    page: page,
                    limit: limit,
                    total: filtered.length,
                    jobs: paginatedJobs.map(job => ({
                        id: job.jobId,
                        title: job.title,
                        company: job.company,
                        location: job.location,
                        description: job.description,
                        salary: job.salary,
                        posted_date: job.postedDate,
                        url: job.url
                    }))
                };
            } catch (error) {
                console.error('Offline job search failed:', error);
                throw error;
            }
        },
        
        /**
         * Get trending skills in the job market
         */
        getTrendingSkills: async () => {
            try {
                if (navigator.onLine) {
                    const result = await apiRequest('/jobs/trending-skills', {
                        method: 'GET'
                    });
                    
                    // Cache the results
                    if (result.success && result.skills) {
                        localStorage.setItem('jobha_trending_skills', JSON.stringify(result.skills));
                    }
                    
                    return result;
                }
            } catch (error) {
                console.error('Failed to fetch trending skills:', error);
                // Fall through to cached data
            }
            
            // Use cached data if offline
            const cachedSkills = localStorage.getItem('jobha_trending_skills');
            if (cachedSkills) {
                return {
                    success: true,
                    offline: true,
                    skills: JSON.parse(cachedSkills)
                };
            }
            
            // Default skills if no cached data
            return {
                success: true,
                offline: true,
                skills: [
                    {name: "JavaScript", growth: 10, demand: "High"},
                    {name: "React", growth: 12, demand: "High"},
                    {name: "Python", growth: 15, demand: "Very High"},
                    {name: "Data Analysis", growth: 8, demand: "Medium"},
                    {name: "Cloud Computing", growth: 14, demand: "High"}
                ]
            };
        },
        
        /**
         * Save a job for later viewing
         * @param {string} jobId - ID of the job to save
         */
        saveJob: async (jobId) => {
            try {
                if (navigator.onLine) {
                    return await apiRequest('/jobs/save', {
                        method: 'POST',
                        body: JSON.stringify({ job_id: jobId })
                    });
                }
            } catch (error) {
                console.error('Failed to save job online:', error);
                // Fall through to offline save
            }
            
            // Offline save
            try {
                // Find the job in the local database
                const allJobs = await JobhaDB.getJobs();
                const jobToSave = allJobs.find(job => job.jobId === jobId);
                
                if (jobToSave) {
                    // Update status to saved
                    jobToSave.status = 'saved';
                    await JobhaDB.saveJob(jobToSave);
                    
                    return {
                        success: true,
                        offline: true,
                        message: "Job saved locally. Will sync when back online."
                    };
                } else {
                    throw new Error("Job not found in local database");
                }
            } catch (error) {
                console.error('Failed to save job offline:', error);
                throw error;
            }
        },
        
        /**
         * Set up job notifications
         * @param {Array} keywords - Keywords to watch for
         * @param {Array} locations - Locations to watch for
         * @param {string} frequency - Notification frequency
         */
        setupNotifications: async (keywords, locations, frequency = 'daily') => {
            try {
                if (navigator.onLine) {
                    return await apiRequest('/jobs/notifications/setup', {
                        method: 'POST',
                        body: JSON.stringify({ keywords, locations, frequency })
                    });
                }
            } catch (error) {
                console.error('Failed to set up notifications online:', error);
                // Fall through to offline setup
            }
            
            // Store notification settings locally
            try {
                const settings = await JobhaDB.getSettings();
                settings.notificationKeywords = keywords;
                settings.notificationLocations = locations;
                settings.notificationFrequency = frequency;
                
                await JobhaDB.saveSettings(settings);
                
                return {
                    success: true,
                    offline: true,
                    message: "Notification preferences saved locally. Will sync when back online."
                };
            } catch (error) {
                console.error('Failed to save notification settings offline:', error);
                throw error;
            }
        }
    };
    
    /**
     * CV and Cover Letter API methods
     */
    const cv = {
        /**
         * Optimize a CV for a specific job
         * @param {string} cvText - The CV text content
         * @param {string} jobDescription - Job description to optimize for
         * @param {Array} skillsToHighlight - Skills to highlight in the CV
         */
        optimizeCV: async (cvText, jobDescription, skillsToHighlight = []) => {
            try {
                if (navigator.onLine) {
                    return await apiRequest('/cv/optimize', {
                        method: 'POST',
                        body: JSON.stringify({
                            cv_text: cvText,
                            job_description: jobDescription,
                            skills_to_highlight: skillsToHighlight
                        })
                    });
                }
            } catch (error) {
                console.error('Failed to optimize CV online:', error);
                throw error;
            }
            
            // If offline, can't optimize - requires AI processing on server
            throw new Error('CV optimization requires an internet connection as it uses AI processing.');
        },
        
        /**
         * Generate a cover letter
         * @param {Object} coverLetterData - Data for cover letter generation
         */
        generateCoverLetter: async (coverLetterData) => {
            try {
                if (navigator.onLine) {
                    const response = await apiRequest('/cv/cover-letter', {
                        method: 'POST',
                        body: JSON.stringify(coverLetterData)
                    });
                    
                    // Save generated cover letter to local database
                    if (response.success && response.cover_letter) {
                        await JobhaDB.saveCoverLetter({
                            title: `Cover Letter for ${coverLetterData.job_title} at ${coverLetterData.company_name}`,
                            jobId: coverLetterData.job_id,
                            content: response.cover_letter,
                            tone: coverLetterData.tone
                        });
                    }
                    
                    return response;
                }
            } catch (error) {
                console.error('Failed to generate cover letter online:', error);
                throw error;
            }
            
            // If offline, can't generate - requires AI processing on server
            throw new Error('Cover letter generation requires an internet connection as it uses AI processing.');
        },
        
        /**
         * Analyze a job description for key skills and requirements
         * @param {string} jobDescription - The job description to analyze
         */
        analyzeJobDescription: async (jobDescription) => {
            try {
                if (navigator.onLine) {
                    return await apiRequest('/cv/analyze-job', {
                        method: 'POST',
                        body: JSON.stringify({ job_description: jobDescription })
                    });
                }
            } catch (error) {
                console.error('Failed to analyze job description online:', error);
                throw error;
            }
            
            // If offline, can't analyze - requires AI processing on server
            throw new Error('Job description analysis requires an internet connection as it uses AI processing.');
        },
        
        /**
         * Get all stored CVs
         */
        getAllCVs: async () => {
            try {
                return {
                    success: true,
                    cvs: await JobhaDB.getCVs()
                };
            } catch (error) {
                console.error('Failed to get stored CVs:', error);
                throw error;
            }
        },
        
        /**
         * Get all stored cover letters
         */
        getAllCoverLetters: async () => {
            try {
                return {
                    success: true,
                    coverLetters: await JobhaDB.getCoverLetters()
                };
            } catch (error) {
                console.error('Failed to get stored cover letters:', error);
                throw error;
            }
        }
    };
    
    // Return the public API
    return {
        auth,
        profile,
        jobs,
        cv,
        isOnline: () => navigator.onLine
    };
})();

// Make API available globally
window.jobhaApi = jobhaApi;

// Initialize offline sync when coming back online
window.addEventListener('online', () => {
    console.log('Back online. Syncing data...');
    if (window.JobhaDB) {
        window.JobhaDB.processSyncQueue(jobhaApi);
    }
});