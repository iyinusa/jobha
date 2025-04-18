/**
 * Jobha - Job Agent Animation JavaScript
 * Handle scroll-based animations and interactive effects
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize animations when DOM is fully loaded
    initScrollAnimations();
    
    // Apply initial animations to elements already in viewport
    triggerAnimationsInViewport();
    
    // Add scroll listener to trigger animations as elements come into view
    window.addEventListener('scroll', function() {
        triggerAnimationsInViewport();
    });
    
    /**
     * Initialize animation elements and prepare them for scroll animations
     */
    function initScrollAnimations() {
        // Convert elements with static animation classes to scroll-triggered
        const animatedElements = document.querySelectorAll('.fade-in, .slide-in-left, .slide-in-right, .zoom-in, .bounce-in');
        
        animatedElements.forEach(element => {
            // Store original animation class for later use
            const originalClass = Array.from(element.classList).find(className => 
                ['fade-in', 'slide-in-left', 'slide-in-right', 'zoom-in', 'bounce-in'].includes(className)
            );
            
            if (originalClass) {
                // Set animation class as a data attribute
                element.setAttribute('data-animation', originalClass);
                
                // Remove the animation class and add scroll-trigger
                element.classList.remove(originalClass);
                element.classList.add('scroll-trigger');
                
                // Keep any delay attribute
                const delay = element.getAttribute('data-delay');
                if (delay) {
                    element.style.transitionDelay = (parseInt(delay) / 1000) + 's';
                }
            }
        });
    }
    
    /**
     * Check which elements are in viewport and trigger their animations
     */
    function triggerAnimationsInViewport() {
        const scrollTriggers = document.querySelectorAll('.scroll-trigger:not(.visible)');
        
        scrollTriggers.forEach(element => {
            if (isElementInViewport(element)) {
                // Add the visible class to trigger the base transition
                element.classList.add('visible');
                
                // Get the original animation class and apply it
                const animationClass = element.getAttribute('data-animation');
                if (animationClass) {
                    setTimeout(() => {
                        element.classList.add(animationClass);
                    }, 50); // Small delay for better performance
                }
            }
        });
    }
    
    /**
     * Check if an element is in the viewport
     * @param {HTMLElement} element - The element to check
     * @returns {boolean} - True if element is in viewport
     */
    function isElementInViewport(element) {
        const rect = element.getBoundingClientRect();
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        
        // Consider element in viewport if top is in view or element is partially visible
        // This can be adjusted to change when animations trigger
        const topVisible = rect.top <= windowHeight * 0.85; // Trigger when top 85% of viewport
        const notScrolledPast = rect.bottom > 0; // Element not scrolled past
        
        return topVisible && notScrolledPast;
    }
    
    /**
     * Add interactive hover animations to specific elements
     */
    function initHoverAnimations() {
        // Feature cards hover effects
        const featureCards = document.querySelectorAll('.feature-card');
        
        featureCards.forEach(card => {
            card.addEventListener('mouseenter', function() {
                const icon = this.querySelector('.feature-icon');
                if (icon) {
                    icon.classList.add('animated');
                }
            });
            
            card.addEventListener('mouseleave', function() {
                const icon = this.querySelector('.feature-icon');
                if (icon) {
                    icon.classList.remove('animated');
                }
            });
        });
    }
    
    // Call hover animations init
    initHoverAnimations();
    
    /**
     * Animate counting up for statistics
     */
    function initCounters() {
        const counters = document.querySelectorAll('.counter');
        
        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-count'), 10);
            const duration = 2000; // Animation duration in milliseconds
            const increment = target / (duration / 16); // Update every 16ms (60fps approx)
            
            let current = 0;
            
            const updateCounter = () => {
                current += increment;
                
                if (current < target) {
                    counter.textContent = Math.round(current);
                    requestAnimationFrame(updateCounter);
                } else {
                    counter.textContent = target; // Ensure final value is exact
                }
            };
            
            // Start counter animation when element comes into view
            const observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    updateCounter();
                    observer.disconnect();
                }
            }, { threshold: 0.5 });
            
            observer.observe(counter);
        });
    }
    
    // Initialize counters if they exist
    if (document.querySelector('.counter')) {
        initCounters();
    }
    
    /**
     * Add parallax scrolling effect to header background
     */
    function initParallaxEffect() {
        const header = document.querySelector('header');
        
        if (!header) return;
        
        window.addEventListener('scroll', function() {
            const scrolled = window.scrollY;
            
            if (scrolled < window.innerHeight) {
                header.style.backgroundPositionY = -(scrolled * 0.15) + 'px';
            }
        });
    }
    
    // Initialize parallax effect
    initParallaxEffect();
});