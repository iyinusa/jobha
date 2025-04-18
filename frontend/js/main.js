/**
 * Jobha - Job Agent Main JavaScript
 * Handle UI interactions and functionality for the Job Agent platform
 */

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Mobile Menu Toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    const authButtons = document.querySelector('.auth-buttons');
    
    if(menuToggle) {
        menuToggle.addEventListener('click', function() {
            // Create mobile menu if it doesn't exist
            let mobileMenu = document.querySelector('.mobile-menu');
            
            if (!mobileMenu) {
                mobileMenu = document.createElement('div');
                mobileMenu.classList.add('mobile-menu');
                
                // Clone navigation links and auth buttons for mobile menu
                const navLinksClone = navLinks.cloneNode(true);
                const authButtonsClone = authButtons.cloneNode(true);
                
                mobileMenu.appendChild(navLinksClone);
                mobileMenu.appendChild(authButtonsClone);
                
                // Insert after navbar
                const navbar = document.querySelector('.navbar');
                navbar.parentNode.insertBefore(mobileMenu, navbar.nextSibling);
            } else {
                mobileMenu.classList.toggle('active');
            }
        });
    }
    
    // Smooth Scrolling for Anchor Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            
            // Skip if it's just "#"
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80, // Offset for fixed header
                    behavior: 'smooth'
                });
                
                // Close mobile menu if open
                const mobileMenu = document.querySelector('.mobile-menu');
                if (mobileMenu && mobileMenu.classList.contains('active')) {
                    mobileMenu.classList.remove('active');
                }
            }
        });
    });
    
    // Video Player Modal
    const playButton = document.querySelector('.play-button');
    
    if (playButton) {
        playButton.addEventListener('click', function() {
            // Create modal overlay
            const modal = document.createElement('div');
            modal.classList.add('video-modal');
            modal.innerHTML = `
                <div class="modal-content">
                    <span class="close-modal">&times;</span>
                    <div class="video-container">
                        <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            document.body.style.overflow = 'hidden'; // Prevent scrolling
            
            // Handle close button click
            modal.querySelector('.close-modal').addEventListener('click', function() {
                document.body.removeChild(modal);
                document.body.style.overflow = '';
            });
            
            // Close modal when clicking outside content
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    document.body.style.overflow = '';
                }
            });
        });
    }
    
    // Simple form validation for demo purposes
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            let isValid = true;
            const requiredFields = form.querySelectorAll('[required]');
            
            requiredFields.forEach(field => {
                if (!field.value.trim()) {
                    isValid = false;
                    field.classList.add('error');
                } else {
                    field.classList.remove('error');
                }
            });
            
            if (isValid) {
                // Show success message
                const successMessage = document.createElement('div');
                successMessage.classList.add('success-message');
                successMessage.textContent = 'Form submitted successfully! We will be in touch soon.';
                
                form.appendChild(successMessage);
                form.reset();
                
                // Remove success message after 3 seconds
                setTimeout(() => {
                    form.removeChild(successMessage);
                }, 3000);
            }
        });
    });
    
    // API Connection Example (for demonstration)
    function fetchJobsExample() {
        const jobsSection = document.querySelector('#jobs-list');
        
        if (!jobsSection) return;
        
        // Show loading state
        jobsSection.innerHTML = '<div class="loading">Loading latest job opportunities...</div>';
        
        // Simulate API call with timeout
        setTimeout(() => {
            // In a real implementation, this would be fetched from the backend
            const mockJobs = [
                {
                    title: 'Senior Frontend Developer',
                    company: 'Tech Innovators',
                    location: 'Remote',
                    salary: '$110K - $140K',
                    posted: '2 days ago'
                },
                {
                    title: 'Data Scientist',
                    company: 'Analytics Pro',
                    location: 'New York, NY',
                    salary: '$130K - $160K',
                    posted: '1 day ago'
                },
                {
                    title: 'UX/UI Designer',
                    company: 'Creative Solutions',
                    location: 'San Francisco, CA',
                    salary: '$90K - $120K',
                    posted: 'Just now'
                }
            ];
            
            let jobsHTML = '';
            mockJobs.forEach(job => {
                jobsHTML += `
                    <div class="job-card">
                        <h3>${job.title}</h3>
                        <div class="job-company">${job.company}</div>
                        <div class="job-details">
                            <span><i class="fas fa-map-marker-alt"></i> ${job.location}</span>
                            <span><i class="fas fa-money-bill-alt"></i> ${job.salary}</span>
                            <span><i class="fas fa-clock"></i> ${job.posted}</span>
                        </div>
                        <a href="#" class="btn btn-primary">Apply Now</a>
                    </div>
                `;
            });
            
            jobsSection.innerHTML = jobsHTML;
        }, 1500);
    }
    
    // Initialize any components that need to run on page load
    function initializeComponents() {
        // Add any initialization code here
        console.log('Jobha frontend initialized');
    }
    
    // Call initialization function
    initializeComponents();
});