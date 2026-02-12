/**
 * Universal Navigation System for PerpsTrader Dashboard
 * Provides consistent navigation across all dashboard pages
 */

(function() {
    'use strict';

    // Navigation configuration
    const NAV_CONFIG = {
        brand: {
            title: 'PERPS_TRADER',
            subtitle: '// NAV',
            icon: '◈'
        },
        sections: [
            {
                id: 'main',
                title: 'Command',
                items: [
                    { id: 'dashboard', label: 'Dashboard', path: '/', icon: '◈', shortcut: 'D', desc: 'Main control terminal' },
                    { id: 'trace', label: 'Trace Viewer', path: '/trace', icon: '◉', shortcut: 'T', desc: 'Cycle traces & logs' },
                ]
            },
            {
                id: 'intelligence',
                title: 'Intelligence',
                items: [
                    { id: 'news', label: 'News Feed', path: '/news', icon: '◆', shortcut: 'N', desc: 'Real-time news stream' },
                    { id: 'heatmap', label: 'Heatmap', path: '/heatmap', icon: '▣', shortcut: 'H', desc: 'Event visualization' },
                    { id: 'enhanced-heatmap', label: 'Enhanced Heatmap', path: '/enhanced-heatmap', icon: '◈', shortcut: 'E', desc: 'Advanced heat analysis' },
                    { id: 'market-bubbles', label: 'Market Bubbles', path: '/heatmap-bubbles', icon: '●', shortcut: 'B', desc: 'Market-based bubble view' },
                ]
            },
            {
                id: 'markets',
                title: 'Markets',
                items: [
                    { id: 'predictions', label: 'Predictions', path: '/predictions', icon: '◊', shortcut: 'P', desc: 'Prediction markets' },
                    { id: 'funding-arbitrage', label: 'Funding Arbitrage', path: '/funding-arbitrage.html', icon: '💰', shortcut: 'F', desc: 'Funding rate opportunities' },
                    { id: 'pools', label: 'Safekeeping Pools', path: '/pools.html', icon: '◐', shortcut: 'S', desc: 'Yield & safekeeping' },
                    { id: 'pumpfun', label: 'PumpFun Analyzer', path: '/pumpfun', icon: '●', shortcut: 'U', desc: 'Token analysis' },
                ]
            }
        ],
        quickActions: [
            { id: 'emergency', label: 'EMERGENCY STOP', action: 'emergencyStop', icon: '◉', class: 'danger' },
            { id: 'refresh', label: 'Refresh Data', action: 'refreshData', icon: '↻', class: 'secondary' },
        ]
    };

    // State
    let isCollapsed = false;
    let isMobile = window.innerWidth < 1024;
    let socket = null;

    // Initialize navigation
    function init() {
        injectStyles();
        renderNavigation();
        setupEventListeners();
        setupKeyboardShortcuts();
        highlightCurrentPage();
        
        // Try to connect to socket for live status
        try {
            socket = io();
            socket.on('connect', () => updateConnectionStatus(true));
            socket.on('disconnect', () => updateConnectionStatus(false));
        } catch (e) {
            console.log('Socket not available');
        }
    }

    // Inject CSS styles
    function injectStyles() {
        if (document.getElementById('universal-nav-styles')) return;

        const styles = `
            /* Universal Navigation System */
            :root {
                --nav-width: 260px;
                --nav-width-collapsed: 60px;
                --nav-bg: rgba(8, 8, 12, 0.98);
                --nav-border: rgba(0, 242, 255, 0.15);
                --nav-accent: #00f2ff;
                --nav-accent-secondary: #00ff9d;
                --nav-text: #a0a0a0;
                --nav-text-hover: #ffffff;
                --nav-section-bg: rgba(0, 242, 255, 0.03);
                --nav-danger: #ff3e3e;
                --nav-font-mono: 'JetBrains Mono', monospace;
                --nav-transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            /* Push content when nav is open */
            body.has-nav {
                padding-left: var(--nav-width);
                transition: var(--nav-transition);
            }

            body.has-nav.nav-collapsed {
                padding-left: var(--nav-width-collapsed);
            }

            /* Mobile: overlay instead of push */
            @media (max-width: 1024px) {
                body.has-nav,
                body.has-nav.nav-collapsed {
                    padding-left: 0;
                }
            }

            /* Navigation Container */
            #universal-nav {
                position: fixed;
                top: 0;
                left: 0;
                width: var(--nav-width);
                height: 100vh;
                background: var(--nav-bg);
                border-right: 1px solid var(--nav-border);
                backdrop-filter: blur(20px);
                z-index: 9999;
                display: flex;
                flex-direction: column;
                transition: var(--nav-transition);
                font-family: var(--nav-font-mono);
                font-size: 13px;
            }

            #universal-nav.collapsed {
                width: var(--nav-width-collapsed);
            }

            /* Mobile overlay mode */
            @media (max-width: 1024px) {
                #universal-nav {
                    transform: translateX(-100%);
                    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
                }

                #universal-nav.open {
                    transform: translateX(0);
                }

                #universal-nav.collapsed {
                    transform: translateX(-100%);
                    width: var(--nav-width);
                }
            }

            /* Nav Header */
            .nav-header {
                padding: 20px 16px;
                border-bottom: 1px solid var(--nav-border);
                display: flex;
                align-items: center;
                gap: 12px;
                min-height: 70px;
            }

            .nav-brand-icon {
                width: 36px;
                height: 36px;
                background: linear-gradient(135deg, var(--nav-accent), var(--nav-accent-secondary));
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                color: #000;
                flex-shrink: 0;
                box-shadow: 0 0 15px rgba(0, 242, 255, 0.3);
            }

            .nav-brand-text {
                display: flex;
                flex-direction: column;
                overflow: hidden;
                transition: var(--nav-transition);
            }

            .collapsed .nav-brand-text {
                opacity: 0;
                width: 0;
            }

            .nav-brand-title {
                font-weight: 700;
                font-size: 14px;
                color: #fff;
                letter-spacing: 1px;
            }

            .nav-brand-subtitle {
                font-size: 10px;
                color: var(--nav-accent);
                letter-spacing: 2px;
            }

            /* Toggle Button */
            .nav-toggle {
                position: absolute;
                right: -12px;
                top: 24px;
                width: 24px;
                height: 24px;
                background: var(--nav-bg);
                border: 1px solid var(--nav-border);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: var(--nav-accent);
                font-size: 10px;
                transition: var(--nav-transition);
                z-index: 10;
            }

            .nav-toggle:hover {
                background: var(--nav-accent);
                color: #000;
            }

            .collapsed .nav-toggle {
                transform: rotate(180deg);
            }

            @media (max-width: 1024px) {
                .nav-toggle {
                    display: none;
                }
            }

            /* Nav Content */
            .nav-content {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 12px 8px;
            }

            .nav-content::-webkit-scrollbar {
                width: 4px;
            }

            .nav-content::-webkit-scrollbar-track {
                background: transparent;
            }

            .nav-content::-webkit-scrollbar-thumb {
                background: var(--nav-border);
                border-radius: 2px;
            }

            /* Nav Section */
            .nav-section {
                margin-bottom: 8px;
            }

            .nav-section-title {
                padding: 8px 12px;
                font-size: 10px;
                color: var(--nav-accent);
                text-transform: uppercase;
                letter-spacing: 2px;
                opacity: 0.7;
                transition: var(--nav-transition);
                white-space: nowrap;
            }

            .collapsed .nav-section-title {
                opacity: 0;
                height: 0;
                padding: 0;
                overflow: hidden;
            }

            /* Nav Items */
            .nav-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 12px;
                margin: 2px 0;
                border-radius: 8px;
                color: var(--nav-text);
                text-decoration: none;
                transition: var(--nav-transition);
                cursor: pointer;
                position: relative;
                overflow: hidden;
            }

            .nav-item::before {
                content: '';
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 3px;
                background: var(--nav-accent);
                opacity: 0;
                transition: opacity 0.2s;
            }

            .nav-item:hover,
            .nav-item.active {
                background: var(--nav-section-bg);
                color: var(--nav-text-hover);
            }

            .nav-item.active::before {
                opacity: 1;
            }

            .nav-item-icon {
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                flex-shrink: 0;
                color: var(--nav-accent);
            }

            .nav-item-content {
                display: flex;
                flex-direction: column;
                overflow: hidden;
                flex: 1;
                transition: var(--nav-transition);
            }

            .collapsed .nav-item-content {
                opacity: 0;
                width: 0;
            }

            .nav-item-label {
                font-weight: 500;
                white-space: nowrap;
            }

            .nav-item-desc {
                font-size: 10px;
                color: #666;
                white-space: nowrap;
                transition: color 0.2s;
            }

            .nav-item:hover .nav-item-desc {
                color: #888;
            }

            .nav-item-shortcut {
                font-size: 10px;
                color: var(--nav-accent);
                opacity: 0.5;
                padding: 2px 6px;
                background: rgba(0, 242, 255, 0.1);
                border-radius: 4px;
                transition: var(--nav-transition);
            }

            .collapsed .nav-item-shortcut {
                display: none;
            }

            /* Tooltip for collapsed mode */
            .nav-item[data-tooltip]::after {
                content: attr(data-tooltip);
                position: absolute;
                left: 100%;
                top: 50%;
                transform: translateY(-50%);
                margin-left: 12px;
                padding: 8px 12px;
                background: rgba(0, 0, 0, 0.9);
                border: 1px solid var(--nav-border);
                border-radius: 6px;
                color: #fff;
                font-size: 12px;
                white-space: nowrap;
                opacity: 0;
                visibility: hidden;
                transition: all 0.2s;
                z-index: 10000;
                pointer-events: none;
            }

            .collapsed .nav-item[data-tooltip]:hover::after {
                opacity: 1;
                visibility: visible;
            }

            /* Status Bar */
            .nav-status {
                padding: 12px;
                border-top: 1px solid var(--nav-border);
                background: rgba(0, 0, 0, 0.3);
            }

            .nav-status-item {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 11px;
                color: var(--nav-text);
                margin-bottom: 6px;
            }

            .nav-status-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: var(--nav-accent-secondary);
                box-shadow: 0 0 8px var(--nav-accent-secondary);
                animation: pulse 2s infinite;
            }

            .nav-status-dot.disconnected {
                background: var(--nav-danger);
                box-shadow: 0 0 8px var(--nav-danger);
                animation: none;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
            }

            .collapsed .nav-status-item span:last-child {
                display: none;
            }

            /* Quick Actions */
            .nav-actions {
                padding: 12px;
                border-top: 1px solid var(--nav-border);
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .nav-action-btn {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 12px;
                border: 1px solid var(--nav-border);
                border-radius: 6px;
                background: transparent;
                color: var(--nav-text);
                font-family: var(--nav-font-mono);
                font-size: 12px;
                cursor: pointer;
                transition: var(--nav-transition);
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            .nav-action-btn:hover {
                background: var(--nav-section-bg);
                border-color: var(--nav-accent);
                color: var(--nav-text-hover);
            }

            .nav-action-btn.danger {
                border-color: rgba(255, 62, 62, 0.3);
                color: var(--nav-danger);
            }

            .nav-action-btn.danger:hover {
                background: rgba(255, 62, 62, 0.1);
                border-color: var(--nav-danger);
            }

            .collapsed .nav-action-btn span {
                display: none;
            }

            .collapsed .nav-action-btn {
                justify-content: center;
                padding: 10px;
            }

            /* Mobile Menu Button */
            .nav-mobile-btn {
                display: none;
                position: fixed;
                top: 20px;
                left: 20px;
                z-index: 10000;
                width: 40px;
                height: 40px;
                background: var(--nav-bg);
                border: 1px solid var(--nav-border);
                border-radius: 8px;
                color: var(--nav-accent);
                font-size: 18px;
                cursor: pointer;
                backdrop-filter: blur(10px);
            }

            @media (max-width: 1024px) {
                .nav-mobile-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
            }

            /* Mobile Overlay */
            .nav-overlay {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 9998;
                opacity: 0;
                transition: opacity 0.3s;
            }

            @media (max-width: 1024px) {
                .nav-overlay.active {
                    display: block;
                    opacity: 1;
                }
            }

            /* Page Content Adjustment */
            .top-bar {
                padding-left: 280px !important;
            }

            body.nav-collapsed .top-bar {
                padding-left: 80px !important;
            }

            @media (max-width: 1024px) {
                .top-bar {
                    padding-left: 70px !important;
                }

                body.nav-collapsed .top-bar {
                    padding-left: 70px !important;
                }
            }
        `;

        const styleEl = document.createElement('style');
        styleEl.id = 'universal-nav-styles';
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    // Render navigation HTML
    function renderNavigation() {
        if (document.getElementById('universal-nav')) return;

        // Add body class
        document.body.classList.add('has-nav');

        // Create mobile menu button
        const mobileBtn = document.createElement('button');
        mobileBtn.className = 'nav-mobile-btn';
        mobileBtn.innerHTML = '☰';
        mobileBtn.onclick = toggleMobile;
        document.body.appendChild(mobileBtn);

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'nav-overlay';
        overlay.onclick = closeMobile;
        document.body.appendChild(overlay);

        // Create navigation container
        const nav = document.createElement('nav');
        nav.id = 'universal-nav';
        
        // Build nav HTML
        let navHTML = `
            <div class="nav-toggle" onclick="window.UniversalNav.toggle()">◀</div>
            
            <div class="nav-header">
                <div class="nav-brand-icon">${NAV_CONFIG.brand.icon}</div>
                <div class="nav-brand-text">
                    <span class="nav-brand-title">${NAV_CONFIG.brand.title}</span>
                    <span class="nav-brand-subtitle">${NAV_CONFIG.brand.subtitle}</span>
                </div>
            </div>

            <div class="nav-content">
        `;

        // Add sections
        NAV_CONFIG.sections.forEach(section => {
            navHTML += `
                <div class="nav-section">
                    <div class="nav-section-title">${section.title}</div>
            `;

            section.items.forEach(item => {
                const tooltip = `${item.label} [${item.shortcut}]`;
                navHTML += `
                    <a href="${item.path}" class="nav-item" data-id="${item.id}" data-tooltip="${tooltip}">
                        <span class="nav-item-icon">${item.icon}</span>
                        <div class="nav-item-content">
                            <span class="nav-item-label">${item.label}</span>
                            <span class="nav-item-desc">${item.desc}</span>
                        </div>
                        <span class="nav-item-shortcut">${item.shortcut}</span>
                    </a>
                `;
            });

            navHTML += `</div>`;
        });

        navHTML += `</div>`; // End nav-content

        // Add status
        navHTML += `
            <div class="nav-status">
                <div class="nav-status-item">
                    <span class="nav-status-dot" id="nav-status-dot"></span>
                    <span id="nav-status-text">Connected</span>
                </div>
            </div>
        `;

        // Add quick actions
        navHTML += `<div class="nav-actions">`;
        NAV_CONFIG.quickActions.forEach(action => {
            navHTML += `
                <button class="nav-action-btn ${action.class}" onclick="window.UniversalNav.${action.action}()">
                    <span>${action.icon}</span>
                    <span>${action.label}</span>
                </button>
            `;
        });
        navHTML += `</div>`;

        nav.innerHTML = navHTML;
        document.body.appendChild(nav);
    }

    // Setup event listeners
    function setupEventListeners() {
        // Handle window resize
        window.addEventListener('resize', () => {
            const newIsMobile = window.innerWidth < 1024;
            if (newIsMobile !== isMobile) {
                isMobile = newIsMobile;
                if (!isMobile) {
                    closeMobile();
                }
            }
        });

        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeMobile();
            }
        });
    }

    // Setup keyboard shortcuts
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only handle if not in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Handle Alt + key shortcuts
            if (e.altKey) {
                const key = e.key.toUpperCase();
                
                NAV_CONFIG.sections.forEach(section => {
                    section.items.forEach(item => {
                        if (item.shortcut === key) {
                            e.preventDefault();
                            window.location.href = item.path;
                        }
                    });
                });

                // Special shortcuts
                if (key === 'M') {
                    e.preventDefault();
                    toggleMobile();
                }
                if (key === 'B') {
                    e.preventDefault();
                    toggle();
                }
            }
        });
    }

    // Highlight current page
    function highlightCurrentPage() {
        const currentPath = window.location.pathname;
        const items = document.querySelectorAll('.nav-item');
        
        items.forEach(item => {
            const itemPath = item.getAttribute('href');
            if (currentPath === itemPath || 
                (itemPath !== '/' && currentPath.startsWith(itemPath)) ||
                (currentPath === '/' && itemPath === '/')) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // Toggle navigation collapsed state
    function toggle() {
        isCollapsed = !isCollapsed;
        const nav = document.getElementById('universal-nav');
        
        if (isCollapsed) {
            nav.classList.add('collapsed');
            document.body.classList.add('nav-collapsed');
        } else {
            nav.classList.remove('collapsed');
            document.body.classList.remove('nav-collapsed');
        }

        // Save preference
        localStorage.setItem('navCollapsed', isCollapsed);
    }

    // Toggle mobile menu
    function toggleMobile() {
        const nav = document.getElementById('universal-nav');
        const overlay = document.querySelector('.nav-overlay');
        
        nav.classList.toggle('open');
        overlay.classList.toggle('active');
    }

    // Close mobile menu
    function closeMobile() {
        const nav = document.getElementById('universal-nav');
        const overlay = document.querySelector('.nav-overlay');
        
        nav.classList.remove('open');
        overlay.classList.remove('active');
    }

    // Update connection status
    function updateConnectionStatus(connected) {
        const dot = document.getElementById('nav-status-dot');
        const text = document.getElementById('nav-status-text');
        
        if (connected) {
            dot.classList.remove('disconnected');
            text.textContent = 'Connected';
        } else {
            dot.classList.add('disconnected');
            text.textContent = 'Disconnected';
        }
    }

    // Emergency stop action
    function emergencyStop() {
        if (confirm('⚠️ EMERGENCY STOP\n\nClose ALL positions and cancel ALL orders?\n\nThis action cannot be undone.')) {
            fetch('/api/emergency-stop', { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                    alert('Emergency stop executed: ' + data.message);
                })
                .catch(err => {
                    alert('Emergency stop failed: ' + err.message);
                });
        }
    }

    // Refresh data action
    function refreshData() {
        // Dispatch custom event for pages to handle
        window.dispatchEvent(new CustomEvent('nav-refresh-data'));
        
        // Show brief feedback
        const btn = document.querySelector('.nav-action-btn:not(.danger)');
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '<span>↻</span><span>Refreshing...</span>';
            setTimeout(() => {
                btn.innerHTML = original;
            }, 1000);
        }
    }

    // Restore saved preferences
    function restorePreferences() {
        const savedCollapsed = localStorage.getItem('navCollapsed');
        if (savedCollapsed === 'true') {
            isCollapsed = true;
            const nav = document.getElementById('universal-nav');
            if (nav) {
                nav.classList.add('collapsed');
                document.body.classList.add('nav-collapsed');
            }
        }
    }

    // Expose API
    window.UniversalNav = {
        toggle,
        toggleMobile,
        closeMobile,
        emergencyStop,
        refreshData,
        init,
        updateConnectionStatus
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            init();
            restorePreferences();
        });
    } else {
        init();
        restorePreferences();
    }
})();
