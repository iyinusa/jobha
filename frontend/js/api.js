/**
 * Jobha - Job Agent API JavaScript
 * Handle connections to the backend API
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
            return apiRequest('/users/register', {
                method: 'POST',
                body: JSON.stringify(userData)
            });
        },
        
        /**
         * Login a user
         * @param {Object} credentials - User login credentials
         */
        login: async (credentials) => {
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
            return apiRequest('/users/profile', {
                method: 'GET'
            });
        },
        
        /**
         * Update the user's profile
         * @param {Object} profileData - Profile data to update
         */
        updateProfile: async (profileData) => {
            return apiRequest('/users/profile', {
                method: 'PUT',
                body: JSON.stringify(profileData)
            });
        },
        
        /**
         * Upload a CV file
         * @param {File} file - The CV file to upload
         */
        uploadCV: async (file) => {
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
            const queryParams = new URLSearchParams({
                keyword,
                ...(location ? { location } : {}),
                ...filters,
                page: filters.page || 1,
                limit: filters.limit || 10
            });
            
            return apiRequest(`/jobs/search?${queryParams.toString()}`, {
                method: 'GET'
            });
        },
        
        /**
         * Get trending skills in the job market
         */
        getTrendingSkills: async () => {
            return apiRequest('/jobs/trending-skills', {
                method: 'GET'
            });
        },
        
        /**
         * Save a job for later viewing
         * @param {string} jobId - ID of the job to save
         */
        saveJob: async (jobId) => {
            return apiRequest('/jobs/save', {
                method: 'POST',
                body: JSON.stringify({ job_id: jobId })
            });
        },
        
        /**
         * Set up job notifications
         * @param {Array} keywords - Keywords to watch for
         * @param {Array} locations - Locations to watch for
         * @param {string} frequency - Notification frequency
         */
        setupNotifications: async (keywords, locations, frequency = 'daily') => {
            return apiRequest('/jobs/notifications/setup', {
                method: 'POST',
                body: JSON.stringify({ keywords, locations, frequency })
            });
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
         */
        optimizeCV: async (cvText, jobDescription, skillsToHighlight = []) => {
            return apiRequest('/cv/optimize', {
                method: 'POST',
                body: JSON.stringify({
                    cv_text: cvText,
                    job_description: jobDescription,
                    skills_to_highlight: skillsToHighlight
                })
            });
        },
        
        /**
         * Generate a cover letter
         * @param {Object} coverLetterData - Data for cover letter generation
         */
        generateCoverLetter: async (coverLetterData) => {
            return apiRequest('/cv/cover-letter', {
                method: 'POST',
                body: JSON.stringify(coverLetterData)
            });
        },
        
        /**
         * Analyze a job description for key skills and requirements
         * @param {string} jobDescription - The job description to analyze
         */
        analyzeJobDescription: async (jobDescription) => {
            return apiRequest('/cv/analyze-job', {
                method: 'POST',
                body: JSON.stringify({ job_description: jobDescription })
            });
        }
    };
    
    // Return the public API
    return {
        auth,
        profile,
        jobs,
        cv
    };
})();

// Make API available globally
window.jobhaApi = jobhaApi;