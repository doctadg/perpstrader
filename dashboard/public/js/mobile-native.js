/**
 * Mobile-Native JavaScript for PerpsTrader Dashboard
 * Native app interactions: bottom sheets, pull-to-refresh, swipe gestures, etc.
 * Version: 2.0
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    swipeThreshold: 50,
    swipeVelocity: 0.3,
    pullToRefreshThreshold: 80,
    longPressDuration: 500,
    doubleTapDelay: 300,
    debounceDelay: 150,
    throttleDelay: 100
  };

  // ============================================
  // DEVICE DETECTION
  // ============================================
  const Device = {
    isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    isMobile: window.matchMedia('(max-width: 768px)').matches,
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    isAndroid: /Android/.test(navigator.userAgent),
    isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
    isStandalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone,
    supportsVibration: 'vibrate' in navigator,
    supportsShare: 'share' in navigator,
    supportsBiometric: 'PublicKeyCredential' in window,
    
    getType() {
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
  // UTILITY FUNCTIONS
  // ============================================
  const Utils = {
    debounce(fn, delay = CONFIG.debounceDelay) {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    throttle(fn, delay = CONFIG.throttleDelay) {
      let lastTime = 0;
      return (...args) => {
        const now = Date.now();
        if (now - lastTime >= delay) {
          lastTime = now;
          fn.apply(this, args);
        }
      };
    },

    once(fn) {
      let called = false;
      return (...args) => {
        if (!called) {
          called = true;
          return fn.apply(this, args);
        }
      };
    },

    formatCurrency(value, decimals = 2) {
      const num = parseFloat(value) || 0;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(num);
    },

    formatNumber(value) {
      return new Intl.NumberFormat('en-US').format(value);
    },

    formatPercent(value, decimals = 1) {
      return `${(parseFloat(value) || 0).toFixed(decimals)}%`;
    },

    timeAgo(date) {
      const seconds = Math.floor((new Date() - new Date(date)) / 1000);
      if (seconds < 60) return 'just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    }
  };

  // ============================================
  // HAPTIC FEEDBACK
  // ============================================
  const Haptic = {
    enabled: Device.supportsVibration && (Device.isIOS || Device.isAndroid),

    light() {
      if (this.enabled) navigator.vibrate(10);
    },

    medium() {
      if (this.enabled) navigator.vibrate(20);
    },

    heavy() {
      if (this.enabled) navigator.vibrate(30);
    },

    success() {
      if (this.enabled) navigator.vibrate([10, 50, 10]);
    },

    error() {
      if (this.enabled) navigator.vibrate([30, 50, 30]);
    },

    warning() {
      if (this.enabled) navigator.vibrate([20, 30, 20]);
    }
  };

  // ============================================
  // TOAST NOTIFICATIONS
  // ============================================
  const Toast = {
    container: null,
    queue: [],
    isShowing: false,

    init() {
      if (this.container) return;
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 3000) {
      this.init();
      this.queue.push({ message, type, duration });
      if (!this.isShowing) this.processQueue();
    },

    success(message, duration) {
      this.show(message, 'success', duration);
    },

    error(message, duration) {
      this.show(message, 'error', duration);
      Haptic.error();
    },

    warning(message, duration) {
      this.show(message, 'warning', duration);
      Haptic.warning();
    },

    info(message, duration) {
      this.show(message, 'info', duration);
    },

    processQueue() {
      if (this.queue.length === 0) {
        this.isShowing = false;
        return;
      }

      this.isShowing = true;
      const { message, type, duration } = this.queue.shift();

      const toast = document.createElement('div');
      toast.className = `app-toast ${type}`;
      toast.innerHTML = `
        <span>${this.getIcon(type)}</span>
        <span>${message}</span>
      `;

      this.container.appendChild(toast);

      // Force reflow
      toast.offsetHeight;
      toast.classList.add('show');

      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          toast.remove();
          this.processQueue();
        }, 300);
      }, duration);
    },

    getIcon(type) {
      const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
      };
      return icons[type] || '•';
    }
  };

  // ============================================
  // BOTTOM SHEET COMPONENT
  // ============================================
  class BottomSheet {
    constructor(options = {}) {
      this.options = {
        title: options.title || '',
        content: options.content || '',
        snapPoints: options.snapPoints || [25, 50, 75, 100],
        initialSnap: options.initialSnap || 1,
        showHandle: options.showHandle !== false,
        dismissible: options.dismissible !== false,
        onOpen: options.onOpen || (() => {}),
        onClose: options.onClose || (() => {}),
        onSnap: options.onSnap || (() => {})
      };

      this.element = null;
      this.overlay = null;
      this.currentSnap = this.options.initialSnap;
      this.isOpen = false;
      this.startY = 0;
      this.currentY = 0;
      this.isDragging = false;
    }

    create() {
      // Create overlay
      this.overlay = document.createElement('div');
      this.overlay.className = 'bottom-sheet-overlay';
      
      // Create sheet
      this.element = document.createElement('div');
      this.element.className = 'bottom-sheet';
      this.element.setAttribute('data-snap', this.options.snapPoints[this.currentSnap]);

      let html = '';
      
      if (this.options.showHandle) {
        html += '<div class="bottom-sheet-handle"></div>';
      }

      if (this.options.title) {
        html += `
          <div class="bottom-sheet-header">
            <div class="bottom-sheet-title">${this.options.title}</div>
          </div>
        `;
      }

      html += `<div class="bottom-sheet-content">${this.options.content}</div>`;
      this.element.innerHTML = html;

      // Setup interactions
      this.setupDrag();
      this.setupDismiss();

      return this;
    }

    setupDrag() {
      const handle = this.element.querySelector('.bottom-sheet-handle') || this.element;
      
      handle.addEventListener('touchstart', (e) => {
        this.startY = e.touches[0].clientY;
        this.isDragging = true;
        this.element.style.transition = 'none';
      }, { passive: true });

      document.addEventListener('touchmove', (e) => {
        if (!this.isDragging) return;
        
        this.currentY = e.touches[0].clientY;
        const deltaY = this.currentY - this.startY;
        
        if (deltaY > 0) {
          this.element.style.transform = `translateY(${deltaY}px)`;
        }
      }, { passive: true });

      document.addEventListener('touchend', () => {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        this.element.style.transition = '';
        
        const deltaY = this.currentY - this.startY;
        
        if (deltaY > 150) {
          this.close();
        } else {
          this.element.style.transform = '';
        }
      });
    }

    setupDismiss() {
      if (this.options.dismissible) {
        this.overlay.addEventListener('click', () => this.close());
      }
    }

    snapTo(index) {
      if (index < 0 || index >= this.options.snapPoints.length) return;
      this.currentSnap = index;
      this.element.setAttribute('data-snap', this.options.snapPoints[index]);
      this.options.onSnap(index, this.options.snapPoints[index]);
    }

    open() {
      if (this.isOpen) return;
      
      if (!this.element) this.create();
      
      document.body.appendChild(this.overlay);
      document.body.appendChild(this.element);
      document.body.classList.add('modal-open');
      
      // Force reflow
      this.element.offsetHeight;
      
      requestAnimationFrame(() => {
        this.overlay.classList.add('visible');
        this.element.classList.add('visible');
      });
      
      this.isOpen = true;
      this.options.onOpen();
      Haptic.medium();
    }

    close() {
      if (!this.isOpen) return;
      
      this.overlay.classList.remove('visible');
      this.element.classList.remove('visible');
      
      setTimeout(() => {
        this.overlay.remove();
        this.element.remove();
        document.body.classList.remove('modal-open');
      }, 300);
      
      this.isOpen = false;
      this.options.onClose();
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
        threshold: options.threshold || CONFIG.pullToRefreshThreshold,
        maxPull: options.maxPull || 120,
        onRefresh: options.onRefresh || (() => {}),
        ...options
      };

      this.indicator = null;
      this.isPulling = false;
      this.isRefreshing = false;
      this.startY = 0;
      this.currentY = 0;

      this.init();
    }

    init() {
      // Create indicator
      this.indicator = document.createElement('div');
      this.indicator.className = 'ptr-indicator';
      this.indicator.innerHTML = '↻';

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
        this.indicator.style.transform = `translateX(-50%) translateY(${pullDistance}px) rotate(${pullDistance * 2}deg)`;

        if (pullDistance >= this.options.threshold) {
          this.indicator.classList.add('pulling');
          this.indicator.innerHTML = '↑';
        } else {
          this.indicator.classList.remove('pulling');
          this.indicator.innerHTML = '↻';
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
        this.reset();
      }

      this.isPulling = false;
    }

    async refresh() {
      this.isRefreshing = true;
      this.indicator.classList.add('refreshing');
      this.indicator.innerHTML = '↻';
      this.indicator.style.transform = `translateX(-50%) translateY(${this.options.threshold * 0.5}px)`;

      Toast.info('Refreshing...');
      Haptic.medium();

      try {
        await this.options.onRefresh();
        Toast.success('Updated');
        Haptic.success();
      } catch (err) {
        console.error('Refresh failed:', err);
        Toast.error('Refresh failed');
        Haptic.error();
      }

      this.reset();
      this.isRefreshing = false;
    }

    reset() {
      this.indicator.classList.remove('refreshing', 'pulling');
      this.indicator.style.transform = 'translateX(-50%) translateY(-50px)';
      this.indicator.innerHTML = '↻';
    }

    destroy() {
      this.indicator.remove();
    }
  }

  // ============================================
  // SWIPE GESTURES
  // ============================================
  class SwipeHandler {
    constructor(element, options = {}) {
      this.element = element || document.body;
      this.options = {
        threshold: options.threshold || CONFIG.swipeThreshold,
        velocity: options.velocity || CONFIG.swipeVelocity,
        preventDefault: options.preventDefault !== false,
        ...options
      };

      this.startX = 0;
      this.startY = 0;
      this.startTime = 0;
      this.isSwiping = false;
      this.direction = null;

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
    }

    handleMove(e) {
      if (!this.isSwiping) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - this.startX;
      const deltaY = touch.clientY - this.startY;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.direction = deltaX > 0 ? 'right' : 'left';
      } else {
        this.direction = deltaY > 0 ? 'down' : 'up';
      }

      this.dispatch('swipeprogress', { direction: this.direction, deltaX, deltaY });
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
        const eventType = deltaX > 0 ? 'swiperight' : 'swipeleft';
        this.dispatch(eventType, { deltaX, deltaY, velocity });
        Haptic.light();
      }

      this.dispatch('swipeend', { direction: this.direction, deltaX, deltaY });
      this.isSwiping = false;
    }

    handleCancel() {
      this.isSwiping = false;
      this.dispatch('swipecancel', {});
    }

    dispatch(type, detail) {
      const event = new CustomEvent(type, { detail, bubbles: true });
      this.element.dispatchEvent(event);
    }
  }

  // ============================================
  // LONG PRESS HANDLER
  // ============================================
  class LongPressHandler {
    constructor(element, options = {}) {
      this.element = element;
      this.options = {
        duration: options.duration || CONFIG.longPressDuration,
        onStart: options.onStart || (() => {}),
        onEnd: options.onEnd || (() => {}),
        onLongPress: options.onLongPress || (() => {})
      };

      this.timer = null;
      this.isPressed = false;

      this.init();
    }

    init() {
      this.element.addEventListener('touchstart', this.handleStart.bind(this), { passive: true });
      this.element.addEventListener('touchend', this.handleEnd.bind(this));
      this.element.addEventListener('touchmove', this.handleMove.bind(this));
      this.element.addEventListener('touchcancel', this.handleEnd.bind(this));
    }

    handleStart(e) {
      this.isPressed = true;
      this.options.onStart(e);

      this.timer = setTimeout(() => {
        if (this.isPressed) {
          this.options.onLongPress(e);
          Haptic.heavy();
        }
      }, this.options.duration);
    }

    handleEnd(e) {
      this.isPressed = false;
      clearTimeout(this.timer);
      this.options.onEnd(e);
    }

    handleMove() {
      // Cancel if moved too much
      clearTimeout(this.timer);
    }
  }

  // ============================================
  // RIPPLE EFFECT
  // ============================================
  function createRipple(event) {
    const button = event.currentTarget;
    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    const rect = button.getBoundingClientRect();
    
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - rect.left - radius}px`;
    circle.style.top = `${event.clientY - rect.top - radius}px`;
    circle.classList.add('ripple-effect');

    const ripple = button.getElementsByClassName('ripple-effect')[0];
    if (ripple) ripple.remove();

    button.appendChild(circle);
  }

  // ============================================
  // BOTTOM NAVIGATION
  // ============================================
  function createBottomNav() {
    if (!Device.isMobile) return;
    if (document.querySelector('.bottom-tab-nav')) return;

    const currentPath = window.location.pathname;
    const navItems = [
      { path: '/', label: 'Dash', icon: '◈' },
      { path: '/news', label: 'News', icon: '◆' },
      { path: '/heatmap', label: 'Markets', icon: '▣' },
      { path: '/funding-arbitrage', label: 'Arb', icon: '⚡' },
      { path: '/predictions', label: 'More', icon: '◊' }
    ];

    const nav = document.createElement('nav');
    nav.className = 'bottom-tab-nav';
    nav.innerHTML = navItems.map(item => {
      const isActive = currentPath === item.path || 
                       (item.path !== '/' && currentPath.startsWith(item.path));
      return `
        <a href="${item.path}" class="bottom-tab-item ${isActive ? 'active' : ''}">
          <span class="bottom-tab-icon">${item.icon}</span>
          <span class="bottom-tab-label">${item.label}</span>
        </a>
      `;
    }).join('');

    document.body.appendChild(nav);

    // Add haptic feedback
    nav.querySelectorAll('.bottom-tab-item').forEach(item => {
      item.addEventListener('touchstart', () => Haptic.light(), { passive: true });
    });
  }

  // ============================================
  // APP HEADER
  // ============================================
  function createAppHeader(title, options = {}) {
    if (!Device.isMobile) return;
    if (document.querySelector('.app-header')) return;

    const header = document.createElement('header');
    header.className = 'app-header mobile-only';
    header.innerHTML = `
      <div class="app-header-left">
        ${options.showMenu ? `<button class="app-icon-btn" id="menuBtn">☰</button>` : ''}
        ${options.backUrl ? `<a href="${options.backUrl}" class="app-icon-btn">←</a>` : ''}
      </div>
      <div class="app-header-center">
        <div class="app-title">${title}</div>
      </div>
      <div class="app-header-right">
        ${options.showNotifications ? `
          <button class="app-icon-btn has-badge" id="notifBtn">
            🔔
            <span class="badge"></span>
          </button>
        ` : ''}
        ${options.actions ? options.actions.join('') : ''}
      </div>
    `;

    document.body.insertBefore(header, document.body.firstChild);

    // Setup menu button
    if (options.showMenu) {
      document.getElementById('menuBtn')?.addEventListener('click', () => {
        Haptic.light();
        options.onMenuClick?.();
      });
    }
  }

  // ============================================
  // FAB (Floating Action Button)
  // ============================================
  function createFAB(options = {}) {
    if (!Device.isMobile) return;

    const fab = document.createElement('button');
    fab.className = `app-fab ${options.secondary ? 'secondary' : ''}`;
    fab.innerHTML = options.icon || '+';
    fab.id = 'appFAB';

    document.body.appendChild(fab);

    fab.addEventListener('click', (e) => {
      Haptic.medium();
      createRipple(e);
      options.onClick?.();
    });

    return fab;
  }

  // ============================================
  // PAGE NAVIGATOR (Swipe between pages)
  // ============================================
  class PageNavigator {
    constructor() {
      this.pages = [
        { path: '/', label: 'Dashboard' },
        { path: '/news', label: 'News' },
        { path: '/heatmap', label: 'Markets' },
        { path: '/predictions', label: 'Predictions' },
        { path: '/pools', label: 'Pools' }
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
      if (!Device.isMobile) return;

      new SwipeHandler(document.body, { threshold: 100, preventDefault: false });

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
        this.showSwipeIndicator(index > this.currentIndex ? 'left' : 'right');
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
        color: var(--color-primary);
        z-index: 9999;
        pointer-events: none;
        animation: fadeOut 0.3s ease-out 0.1s forwards;
        opacity: 0.7;
      `;
      indicator.textContent = direction === 'left' ? '›' : '‹';
      document.body.appendChild(indicator);
      setTimeout(() => indicator.remove(), 400);
    }
  }

  // ============================================
  // TABLE TO CARDS CONVERSION
  // ============================================
  function convertTablesToCards() {
    if (!Device.isMobile) return;

    document.querySelectorAll('.terminal-table, .data-table').forEach(table => {
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
  // COLLAPSIBLE SECTIONS
  // ============================================
  function initCollapsibleSections() {
    document.querySelectorAll('.collapsible-section').forEach(section => {
      const header = section.querySelector('.collapsible-header');
      if (!header) return;

      header.addEventListener('click', () => {
        section.classList.toggle('collapsed');
        Haptic.light();

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

  // ============================================
  // VIRTUAL SCROLL
  // ============================================
  class VirtualScroll {
    constructor(container, options = {}) {
      this.container = container;
      this.options = {
        itemHeight: options.itemHeight || 80,
        bufferSize: options.bufferSize || 5,
        renderItem: options.renderItem || (() => ''),
        ...options
      };

      this.items = options.items || [];
      this.visibleItems = new Map();
      this.scrollTop = 0;
      this.containerHeight = 0;

      this.init();
    }

    init() {
      this.container.style.position = 'relative';
      this.container.style.overflow = 'auto';
      
      this.spacer = document.createElement('div');
      this.spacer.style.height = `${this.items.length * this.options.itemHeight}px`;
      this.container.appendChild(this.spacer);

      this.container.addEventListener('scroll', Utils.throttle(this.handleScroll.bind(this), 16));
      this.handleScroll();
    }

    handleScroll() {
      this.scrollTop = this.container.scrollTop;
      this.containerHeight = this.container.clientHeight;

      const startIndex = Math.max(0, Math.floor(this.scrollTop / this.options.itemHeight) - this.options.bufferSize);
      const endIndex = Math.min(
        this.items.length,
        Math.ceil((this.scrollTop + this.containerHeight) / this.options.itemHeight) + this.options.bufferSize
      );

      this.renderVisibleItems(startIndex, endIndex);
    }

    renderVisibleItems(startIndex, endIndex) {
      const visibleRange = new Set();

      for (let i = startIndex; i < endIndex; i++) {
        visibleRange.add(i);
        
        if (!this.visibleItems.has(i)) {
          const el = document.createElement('div');
          el.style.position = 'absolute';
          el.style.top = `${i * this.options.itemHeight}px`;
          el.style.left = '0';
          el.style.right = '0';
          el.style.height = `${this.options.itemHeight}px`;
          el.innerHTML = this.options.renderItem(this.items[i], i);
          
          this.container.appendChild(el);
          this.visibleItems.set(i, el);
        }
      }

      // Remove items outside visible range
      for (const [index, el] of this.visibleItems) {
        if (!visibleRange.has(index)) {
          el.remove();
          this.visibleItems.delete(index);
        }
      }
    }

    setItems(items) {
      this.items = items;
      this.spacer.style.height = `${this.items.length * this.options.itemHeight}px`;
      this.handleScroll();
    }
  }

  // ============================================
  // PUSH NOTIFICATION UI
  // ============================================
  const PushNotificationUI = {
    async requestPermission() {
      if (!('Notification' in window)) {
        Toast.info('Push notifications not supported');
        return false;
      }

      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;

      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        Toast.success('Notifications enabled');
        Haptic.success();
        return true;
      }
      return false;
    },

    show(title, options = {}) {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          ...options
        });
      }
    }
  };

  // ============================================
  // BIOMETRIC AUTH PLACEHOLDER
  // ============================================
  const BiometricAuth = {
    async isAvailable() {
      return Device.supportsBiometric && window.PublicKeyCredential;
    },

    async authenticate() {
      Toast.info('Biometric authentication not yet implemented');
      return false;
    }
  };

  // ============================================
  // INITIALIZATION
  // ============================================
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
    } else {
      initialize();
    }
  }

  function initialize() {
    // Only initialize mobile features on mobile devices
    if (!Device.isMobile) {
      console.log('[MobileNative] Desktop detected, skipping mobile initialization');
      return;
    }

    console.log('[MobileNative] Initializing for:', Device.getType());

    // Create bottom navigation
    createBottomNav();

    // Initialize page navigator with swipe gestures
    new PageNavigator();

    // Convert tables to mobile-friendly cards
    convertTablesToCards();

    // Initialize collapsible sections
    initCollapsibleSections();

    // Add ripple effects to buttons
    document.querySelectorAll('button, .app-icon-btn, .bottom-tab-item').forEach(el => {
      el.classList.add('ripple');
      el.addEventListener('touchstart', createRipple);
    });

    // Add haptic feedback
    document.querySelectorAll('button, a, .nav-item, .filter-btn').forEach(el => {
      el.addEventListener('touchstart', () => Haptic.light(), { passive: true });
    });

    // Handle resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        Device.isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (Device.isMobile) {
          createBottomNav();
        }
      }, 250);
    });

    // Prevent double-tap zoom on iOS
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });

    // Initialize pull-to-refresh on scrollable containers
    document.querySelectorAll('.feed-container, .app-card-body').forEach(container => {
      new PullToRefresh(container, {
        onRefresh: async () => {
          window.dispatchEvent(new CustomEvent('app-refresh'));
          await new Promise(r => setTimeout(r, 1000));
        }
      });
    });

    console.log('[MobileNative] Initialization complete');
  }

  // ============================================
  // PUBLIC API
  // ============================================
  window.MobileNative = {
    // Core utilities
    Device,
    Utils,
    Haptic,
    Toast,
    
    // Components
    BottomSheet,
    PullToRefresh,
    SwipeHandler,
    LongPressHandler,
    VirtualScroll,
    PageNavigator,
    
    // Features
    PushNotificationUI,
    BiometricAuth,
    
    // Helpers
    createAppHeader,
    createFAB,
    createBottomNav,
    convertTablesToCards,
    createRipple,
    
    // Config
    CONFIG,
    
    // Initialize
    init
  };

  // Auto-init
  init();

})();
