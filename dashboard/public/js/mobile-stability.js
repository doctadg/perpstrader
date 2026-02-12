/**
 * Mobile Stability Fixes
 * Addresses "tweaky" mobile behavior
 * - 100vh jumping fix
 * - Touch delay elimination
 * - Overscroll bounce control
 * - Smooth scrolling optimization
 */

(function() {
  'use strict';

  // ============================================
  // VIEWPORT HEIGHT FIX (prevents jumping when address bar hides)
  // ============================================
  function setViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
  
  setViewportHeight();
  window.addEventListener('resize', debounce(setViewportHeight, 100));
  window.addEventListener('orientationchange', () => {
    setTimeout(setViewportHeight, 100);
  });

  // ============================================
  // ELIMINATE TOUCH DELAYS
  // ============================================
  // FastClick alternative - native approach
  document.addEventListener('touchstart', function() {}, {passive: true});
  
  // Remove 300ms delay on interactive elements
  const touchElements = document.querySelectorAll('a, button, [role="button"], input, select, textarea, .clickable');
  touchElements.forEach(el => {
    el.style.touchAction = 'manipulation';
  });

  // ============================================
  // OVERSCROLL BEHAVIOR (prevent bounce)
  // ============================================
  document.body.style.overscrollBehavior = 'none';
  document.documentElement.style.overscrollBehavior = 'none';

  // Prevent pull-to-refresh on Android (optional - keep if you have custom PTR)
  let touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, {passive: true});

  document.addEventListener('touchmove', (e) => {
    const touchY = e.touches[0].clientY;
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    
    // Prevent pull-to-refresh when at top
    if (scrollTop <= 0 && touchY > touchStartY) {
      e.preventDefault();
    }
  }, {passive: false});

  // ============================================
  // SMOOTH MOMENTUM SCROLLING
  // ============================================
  const scrollContainers = document.querySelectorAll('.data-strip, .scroll-container, [data-scroll]');
  scrollContainers.forEach(container => {
    container.style.webkitOverflowScrolling = 'touch';
    container.style.scrollBehavior = 'smooth';
  });

  // ============================================
  // INPUT FOCUS ZOOM PREVENTION (iOS)
  // ============================================
  const metaViewport = document.querySelector('meta[name="viewport"]');
  if (metaViewport && !metaViewport.content.includes('maximum-scale')) {
    metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
  }

  // ============================================
  // ANIMATION PERFORMANCE OPTIMIZATION
  // ============================================
  // Disable heavy animations on low-power devices
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isLowPower = navigator.connection && (navigator.connection.saveData || navigator.connection.effectiveType === '2g');
  
  if (prefersReducedMotion.matches || isLowPower) {
    document.body.classList.add('reduce-motion');
  }

  // ============================================
  // BOTTOM NAV STABILITY
  // ============================================
  // Prevent bottom nav from jumping when keyboard opens
  const bottomNav = document.querySelector('.app-bottom-nav, .mobile-nav');
  if (bottomNav) {
    const originalBottom = getComputedStyle(bottomNav).bottom;
    
    window.visualViewport?.addEventListener('resize', () => {
      const heightDiff = window.innerHeight - window.visualViewport.height;
      if (heightDiff > 150) {
        // Keyboard likely open
        bottomNav.style.transform = `translateY(${heightDiff}px)`;
        bottomNav.style.transition = 'transform 0.2s ease';
      } else {
        bottomNav.style.transform = '';
      }
    });
  }

  // ============================================
  // SCROLL PERFORMANCE OPTIMIZATION
  // ============================================
  // Use passive listeners for scroll events
  let ticking = false;
  function updateScroll() {
    ticking = false;
  }
  
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateScroll);
      ticking = true;
    }
  }, {passive: true});

  // ============================================
  // UTILITIES
  // ============================================
  function debounce(fn, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        fn(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ============================================
  // SAFARI STABILITY FIXES
  // ============================================
  // Prevent elastic scrolling on modals/drawers
  const modals = document.querySelectorAll('.modal, .drawer, .bottom-sheet');
  modals.forEach(modal => {
    modal.addEventListener('touchmove', (e) => {
      if (e.target === modal) {
        e.preventDefault();
      }
    }, {passive: false});
  });

  // ============================================
  // INITIALIZE
  // ============================================
  console.log('[MobileStability] Fixes applied');
  
  // Add CSS class for targeting
  document.body.classList.add('mobile-stable');
  
})();
