/**
 * Mobile Enhancements for PerpsTrader Dashboard
 * Device detection, swipe gestures, bottom sheets, pull-to-refresh
 */

(function() {
  'use strict';

  // ============================================
  // DEVICE DETECTION
  // ============================================
  const MobileDetect = {
    isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    isMobile: window.innerWidth <= 768,
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    isAndroid: /Android/.test(navigator.userAgent),
    isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
    isStandalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone,
    
    getDeviceType() {
      const width = window.innerWidth;
      if (width <= 375) return 'phone-small';
      if (width <= 414) return 'phone';
      if (width <= 768) return 'tablet-portrait';
      if (width <= 1024) return 'tablet-landscape';
      return 'desktop';
    },

    getOrientation() {
      return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    }
  };

  // ============================================
  // SWIPE GESTURE HANDLER
  // ============================================
  class SwipeHandler {
    constructor(element, options = {}) {
      this.element = element || document.body;
      this.options = {
        threshold: options.threshold || 50,
        velocity: options.velocity || 0.3,
        preventDefault: options.preventDefault !== false,
        ...options
      };
      
      this.startX = 0;
      this.startY = 0;
      this.startTime = 0;
      this.isSwiping = false;
      
      this.init();
    }

    init() {
      this.element.addEventListener('touchstart', this.handleStart.bind(this), { passive: !this.options.preventDefault });
      this.element.addEventListener('touchmove', this.handleMove.bind(this), { passive: !this.options.preventDefault });
      this.element.addEventListener('touchend', this.handleEnd.bind(this));
      this.element.addEventListener('touchcancel', this.handleCancel.bind(this));
    }

    handleStart(e) {
      const touch = e.touches[0];
      this.startX = touch.clientX;
      this.startY = touch.clientY;
      this.startTime = Date.now();
      this.isSwiping = true;
      this.startDeltaX = 0;
      this.startDeltaY = 0;
    }

    handleMove(e) {
      if (!this.isSwiping) return;
      
      const touch = e.touches[0];
      const deltaX = touch.clientX - this.startX;
      const deltaY = touch.clientY - this.startY;
      
      // Determine swipe direction
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.direction = deltaX > 0 ? 'right' : 'left';
      } else {
        this.direction = deltaY > 0 ? 'down' : 'up';
      }

      // Dispatch swipe progress event
      this.dispatchEvent('swipeprogress', { 
        direction: this.direction, 
        deltaX, 
        deltaY,
        progress: Math.min(Math.abs(deltaX) / this.options.threshold, 1)
      });
    }

    handleEnd(e) {
      if (!this.isSwiping) return;
      
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - this.startX;
      const deltaY = touch.clientY - this.startY;
      const deltaTime = Date.now() - this.startTime;
      const velocity = Math.abs(deltaX) / deltaTime;
      
      const isSwipe = Math.abs(deltaX) > this.options.threshold || velocity > this.options.velocity;
      
      if (isSwipe) {
        if (deltaX > 0) {
          this.dispatchEvent('swiperight', { deltaX, deltaY, velocity });
        } else {
          this.dispatchEvent('swipeleft', { deltaX, deltaY, velocity });
        }
        
        if (deltaY > 0) {
          this.dispatchEvent('swipedown', { deltaX, deltaY, velocity });
        } else {
          this.dispatchEvent('swipeup', { deltaX, deltaY, velocity });
        }
      }
      
      this.dispatchEvent('swipeend', { direction: this.direction, deltaX, deltaY });
      this.isSwiping = false;
    }

    handleCancel() {
      this.isSwiping = false;
      this.dispatchEvent('swipecancel', {});
    }

    dispatchEvent(type, detail) {
      const event = new CustomEvent(type, { detail, bubbles: true });
      this.element.dispatchEvent(event);
    }
  }

  // ============================================
  // BOTTOM SHEET COMPONENT
  // ============================================
  class BottomSheet {
    constructor(options = {}) {
      this.options = {
        maxHeight: options.maxHeight || '90vh',
        minHeight: options.minHeight || '200px',
        snapPoints: options.snapPoints || ['30%', '60%', '90%'],
        ...options
      };
      
      this.element = null;
      this.overlay = null;
      this.isOpen = false;
      this.currentSnap = 0;
    }

    create(content) {
      // Create overlay
      this.overlay = document.createElement('div');
      this.overlay.className = 'bottom-sheet-overlay';
      this.overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9998;
        opacity: 0;
        transition: opacity 0.3s;
      `;

      // Create sheet
      this.element = document.createElement('div');
      this.element.className = 'bottom-sheet';
      this.element.style.cssText = `
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(12, 12, 18, 0.98);
        border-top: 1px solid rgba(0, 242, 255, 0.3);
        border-radius: 20px 20px 0 0;
        z-index: 9999;
        transform: translateY(100%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        max-height: ${this.options.maxHeight};
        display: flex;
        flex-direction: column;
      `;

      // Handle bar
      const handle = document.createElement('div');
      handle.style.cssText = `
        width: 40px;
        height: 4px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
        margin: 12px auto;
        flex-shrink: 0;
      `;

      // Content container
      const contentContainer = document.createElement('div');
      contentContainer.className = 'bottom-sheet-content';
      contentContainer.style.cssText = `
        overflow-y: auto;
        padding: 16px;
        flex: 1;
        -webkit-overflow-scrolling: touch;
      `;
      contentContainer.innerHTML = content;

      this.element.appendChild(handle);
      this.element.appendChild(contentContainer);

      // Add swipe to dismiss
      this.setupSwipeToDismiss();

      return this;
    }

    setupSwipeToDismiss() {
      let startY = 0;
      let currentY = 0;

      this.element.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
      }, { passive: true });

      this.element.addEventListener('touchmove', (e) => {
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        
        if (deltaY > 0 && this.element.scrollTop === 0) {
          e.preventDefault();
          this.element.style.transform = `translateY(${deltaY}px)`;
        }
      }, { passive: false });

      this.element.addEventListener('touchend', () => {
        const deltaY = currentY - startY;
        if (deltaY > 100) {
          this.close();
        } else {
          this.element.style.transform = 'translateY(0)';
        }
      });

      this.overlay.addEventListener('click', () => this.close());
    }

    open() {
      if (!this.element) return;
      
      document.body.appendChild(this.overlay);
      document.body.appendChild(this.element);
      document.body.classList.add('modal-open');
      
      // Force reflow
      this.element.offsetHeight;
      
      requestAnimationFrame(() => {
        this.overlay.style.opacity = '1';
        this.element.style.transform = 'translateY(0)';
      });
      
      this.isOpen = true;
    }

    close() {
      if (!this.isOpen) return;
      
      this.overlay.style.opacity = '0';
      this.element.style.transform = 'translateY(100%)';
      
      setTimeout(() => {
        this.overlay.remove();
        this.element.remove();
        document.body.classList.remove('modal-open');
      }, 300);
      
      this.isOpen = false;
    }

    destroy() {
      this.close();
      this.overlay = null;
      this.element = null;
    }
  }

  // ============================================
  // PULL TO REFRESH
  // ============================================
  class PullToRefresh {
    constructor(element, options = {}) {
      this.element = element;
      this.options = {
        threshold: options.threshold || 80,
        maxPull: options.maxPull || 120,
        onRefresh: options.onRefresh || (() => {}),
        ...options
      };
      
      this.indicator = null;
      this.isPulling = false;
      this.startY = 0;
      this.currentY = 0;
      this.isRefreshing = false;
      
      this.init();
    }

    init() {
      // Create indicator
      this.indicator = document.createElement('div');
      this.indicator.className = 'ptr-indicator';
      this.indicator.innerHTML = '↻';
      
      // Make element position relative if not already
      const style = window.getComputedStyle(this.element);
      if (style.position === 'static') {
        this.element.style.position = 'relative';
      }
      
      this.element.insertBefore(this.indicator, this.element.firstChild);
      
      // Touch events
      this.element.addEventListener('touchstart', this.handleStart.bind(this), { passive: true });
      this.element.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
      this.element.addEventListener('touchend', this.handleEnd.bind(this));
    }

    handleStart(e) {
      if (this.isRefreshing) return;
      if (this.element.scrollTop > 0) return;
      
      this.isPulling = true;
      this.startY = e.touches[0].clientY;
    }

    handleMove(e) {
      if (!this.isPulling || this.isRefreshing) return;
      if (this.element.scrollTop > 0) {
        this.isPulling = false;
        return;
      }

      this.currentY = e.touches[0].clientY;
      const deltaY = this.currentY - this.startY;
      
      if (deltaY > 0) {
        e.preventDefault();
        const pullDistance = Math.min(deltaY * 0.5, this.options.maxPull);
        this.indicator.style.transform = `translateX(-50%) translateY(${pullDistance}px)`;
        
        if (pullDistance >= this.options.threshold) {
          this.indicator.classList.add('pulling');
        } else {
          this.indicator.classList.remove('pulling');
        }
      }
    }

    handleEnd() {
      if (!this.isPulling || this.isRefreshing) return;
      
      const deltaY = this.currentY - this.startY;
      const pullDistance = Math.min(deltaY * 0.5, this.options.maxPull);
      
      if (pullDistance >= this.options.threshold) {
        this.refresh();
      } else {
        this.indicator.style.transform = 'translateX(-50%) translateY(-50px)';
      }
      
      this.isPulling = false;
    }

    async refresh() {
      this.isRefreshing = true;
      this.indicator.classList.add('refreshing');
      this.indicator.style.transform = `translateX(-50%) translateY(${this.options.threshold * 0.5}px)`;
      
      try {
        await this.options.onRefresh();
      } catch (err) {
        console.error('Refresh failed:', err);
      }
      
      this.indicator.classList.remove('refreshing', 'pulling');
      this.indicator.style.transform = 'translateX(-50%) translateY(-50px)';
      this.isRefreshing = false;
    }

    destroy() {
      this.indicator.remove();
    }
  }

  // ============================================
  // PAGE NAVIGATION SWIPE
  // ============================================
  class PageNavigator {
    constructor() {
      this.pages = [
        { path: '/', label: 'Dashboard', icon: '◈' },
        { path: '/news', label: 'News', icon: '◆' },
        { path: '/heatmap', label: 'Heatmap', icon: '▣' },
        { path: '/predictions', label: 'Predictions', icon: '◊' },
        { path: '/pools', label: 'Pools', icon: '◐' },
      ];
      
      this.currentIndex = this.getCurrentPageIndex();
      this.init();
    }

    getCurrentPageIndex() {
      const currentPath = window.location.pathname;
      return this.pages.findIndex(p => 
        currentPath === p.path || currentPath.startsWith(p.path + '/')
      );
    }

    init() {
      if (!MobileDetect.isMobile) return;
      
      new SwipeHandler(document.body, {
        threshold: 80,
        preventDefault: false
      });

      document.body.addEventListener('swipeleft', () => this.navigateNext());
      document.body.addEventListener('swiperight', () => this.navigatePrev());
    }

    navigateNext() {
      if (this.currentIndex < this.pages.length - 1) {
        this.navigate(this.currentIndex + 1);
      }
    }

    navigatePrev() {
      if (this.currentIndex > 0) {
        this.navigate(this.currentIndex - 1);
      }
    }

    navigate(index) {
      const page = this.pages[index];
      if (page) {
        // Show swipe indicator
        this.showSwipeIndicator(index > this.currentIndex ? 'left' : 'right');
        
        // Delay for visual feedback
        setTimeout(() => {
          window.location.href = page.path;
        }, 150);
      }
    }

    showSwipeIndicator(direction) {
      const indicator = document.createElement('div');
      indicator.style.cssText = `
        position: fixed;
        top: 50%;
        ${direction === 'left' ? 'right' : 'left'}: 20px;
        transform: translateY(-50%);
        font-size: 2em;
        color: rgba(0, 242, 255, 0.5);
        z-index: 9999;
        pointer-events: none;
        animation: fadeOut 0.3s ease-out 0.1s forwards;
      `;
      indicator.textContent = direction === 'left' ? '›' : '‹';
      document.body.appendChild(indicator);
      
      setTimeout(() => indicator.remove(), 400);
    }
  }

  // ============================================
  // TOAST NOTIFICATIONS
  // ============================================
  const Toast = {
    container: null,
    
    init() {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      this.container.style.cssText = `
        position: fixed;
        bottom: calc(64px + env(safe-area-inset-bottom, 0px) + 16px);
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      `;
      document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 3000) {
      if (!this.container) this.init();
      
      const toast = document.createElement('div');
      toast.className = `mobile-toast ${type}`;
      toast.textContent = message;
      toast.style.pointerEvents = 'auto';
      
      this.container.appendChild(toast);
      
      // Force reflow
      toast.offsetHeight;
      toast.classList.add('show');
      
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },

    success(message, duration) {
      this.show(message, 'success', duration);
    },

    error(message, duration) {
      this.show(message, 'error', duration);
    },

    info(message, duration) {
      this.show(message, 'info', duration);
    }
  };

  // ============================================
  // COLLAPSIBLE SECTIONS
  // ============================================
  class CollapsibleManager {
    constructor() {
      this.init();
    }

    init() {
      document.querySelectorAll('.collapsible-section').forEach(section => {
        const header = section.querySelector('.collapsible-header');
        if (!header) return;
        
        header.addEventListener('click', () => {
          section.classList.toggle('collapsed');
          
          // Save state
          const id = section.id || section.dataset.section;
          if (id) {
            localStorage.setItem(`collapsible-${id}`, section.classList.contains('collapsed'));
          }
        });
        
        // Restore state
        const id = section.id || section.dataset.section;
        if (id && localStorage.getItem(`collapsible-${id}`) === 'true') {
          section.classList.add('collapsed');
        }
      });
    }
  }

  // ============================================
  // VIEWPORT LOCK FOR MODALS
  // ============================================
  const ViewportLock = {
    scrollPosition: 0,
    
    lock() {
      this.scrollPosition = window.pageYOffset;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${this.scrollPosition}px`;
      document.body.style.width = '100%';
    },
    
    unlock() {
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('width');
      window.scrollTo(0, this.scrollPosition);
    }
  };

  // ============================================
  // BOTTOM NAVIGATION BAR
  // ============================================
  function createBottomNav() {
    if (!MobileDetect.isMobile) return;
    if (document.querySelector('.bottom-nav')) return;

    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.innerHTML = `
      <a href="/" class="bottom-nav-item ${location.pathname === '/' ? 'active' : ''}" data-page="dashboard">
        <span class="bottom-nav-icon">◈</span>
        <span class="bottom-nav-label">Dash</span>
      </a>
      <a href="/news" class="bottom-nav-item ${location.pathname === '/news' ? 'active' : ''}" data-page="news">
        <span class="bottom-nav-icon">◆</span>
        <span class="bottom-nav-label">News</span>
      </a>
      <a href="/heatmap" class="bottom-nav-item ${location.pathname.includes('heatmap') ? 'active' : ''}" data-page="heatmap">
        <span class="bottom-nav-icon">▣</span>
        <span class="bottom-nav-label">Heat</span>
      </a>
      <a href="/predictions" class="bottom-nav-item ${location.pathname === '/predictions' ? 'active' : ''}" data-page="predictions">
        <span class="bottom-nav-icon">◊</span>
        <span class="bottom-nav-label">Pred</span>
      </a>
      <a href="/pools" class="bottom-nav-item ${location.pathname === '/pools' || location.pathname === '/pools.html' ? 'active' : ''}" data-page="pools">
        <span class="bottom-nav-icon">◐</span>
        <span class="bottom-nav-label">Pools</span>
      </a>
    `;

    document.body.appendChild(nav);
    document.body.classList.add('has-mobile-nav');
  }

  // ============================================
  // HAPTIC FEEDBACK
  // ============================================
  const Haptic = {
    enabled: MobileDetect.isTouch && (MobileDetect.isIOS || MobileDetect.isAndroid),
    
    light() {
      if (!this.enabled) return;
      if (navigator.vibrate) navigator.vibrate(10);
      if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(10);
    },
    
    medium() {
      if (!this.enabled) return;
      if (navigator.vibrate) navigator.vibrate(20);
    },
    
    heavy() {
      if (!this.enabled) return;
      if (navigator.vibrate) navigator.vibrate(30);
    },
    
    success() {
      if (!this.enabled) return;
      if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
    },
    
    error() {
      if (!this.enabled) return;
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    }
  };

  // ============================================
  // MOBILE TABLE TRANSFORMATION
  // ============================================
  function transformTablesForMobile() {
    if (!MobileDetect.isMobile) return;

    document.querySelectorAll('.terminal-table').forEach(table => {
      const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
      
      table.querySelectorAll('tbody tr').forEach(row => {
        row.querySelectorAll('td').forEach((cell, index) => {
          if (headers[index]) {
            cell.setAttribute('data-label', headers[index]);
          }
        });
      });
    });
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  function init() {
    // Wait for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
    } else {
      initialize();
    }
  }

  function initialize() {
    // Create bottom nav for mobile
    createBottomNav();
    
    // Initialize page navigator with swipe gestures
    new PageNavigator();
    
    // Initialize collapsible sections
    new CollapsibleManager();
    
    // Transform tables
    transformTablesForMobile();
    
    // Add haptic to interactive elements
    if (MobileDetect.isTouch) {
      document.querySelectorAll('button, a, .nav-item, .filter-btn').forEach(el => {
        el.addEventListener('touchstart', () => Haptic.light(), { passive: true });
      });
    }
    
    // Add pull-to-refresh to feed containers
    if (MobileDetect.isMobile) {
      document.querySelectorAll('.feed-container, .heatmap-container').forEach(container => {
        new PullToRefresh(container, {
          onRefresh: async () => {
            // Trigger data refresh
            window.dispatchEvent(new CustomEvent('nav-refresh-data'));
            Toast.success('Refreshing...');
            await new Promise(r => setTimeout(r, 1000));
          }
        });
      });
    }
    
    // Handle resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        MobileDetect.isMobile = window.innerWidth <= 768;
        if (MobileDetect.isMobile) {
          createBottomNav();
        } else {
          const bottomNav = document.querySelector('.bottom-nav');
          if (bottomNav) {
            bottomNav.remove();
            document.body.classList.remove('has-mobile-nav');
          }
        }
      }, 250);
    });

    console.log('[MobileEnhancements] Initialized for:', MobileDetect.getDeviceType());
  }

  // ============================================
  // EXPOSE API
  // ============================================
  window.MobileEnhancements = {
    detect: MobileDetect,
    SwipeHandler,
    BottomSheet,
    PullToRefresh,
    Toast,
    ViewportLock,
    Haptic,
    init,
    
    // Quick helpers
    showToast: Toast.show.bind(Toast),
    lockViewport: ViewportLock.lock.bind(ViewportLock),
    unlockViewport: ViewportLock.unlock.bind(ViewportLock)
  };

  // Auto-init
  init();

})();
