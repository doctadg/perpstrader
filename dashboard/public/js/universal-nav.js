/**
 * Universal Navigation System for PerpsTrader Dashboard
 * Bloomberg-terminal style sidebar — minimal, professional
 */

(function() {
    'use strict';

    const NAV_CONFIG = {
        brand: {
            title: 'VEX CAPITAL',
            subtitle: 'PerpsTrader v1'
        },
        sections: [
            {
                title: 'Command',
                items: [
                    { id: 'dashboard', label: 'Dashboard', path: '/', icon: '\u25A1', shortcut: 'D' },
                    { id: 'trace', label: 'Trace Viewer', path: '/trace', icon: '\u25C9', shortcut: 'T' },
                    { id: 'research', label: 'Research Lab', path: '/research', icon: '\u25C6', shortcut: 'R' },
                ]
            },
            {
                title: 'Intelligence',
                items: [
                    { id: 'news', label: 'News Feed', path: '/news', icon: '\u25A0', shortcut: 'N' },
                    { id: 'heatmap', label: 'Heatmap', path: '/heatmap', icon: '\u25B3', shortcut: 'H' },
                ]
            },
            {
                title: 'Markets',
                items: [
                    { id: 'predictions', label: 'Predictions', path: '/predictions', icon: '\u25CB', shortcut: 'P' },
                    { id: 'funding-arbitrage', label: 'Funding Arb', path: '/funding-arbitrage', icon: '\u00A4', shortcut: 'F' },
                    { id: 'safekeeping', label: 'Safekeeping', path: '/safekeeping', icon: '\u25C7', shortcut: 'S' },
                    { id: 'pumpfun', label: 'PumpFun', path: '/pumpfun', icon: '\u25CF', shortcut: 'U' },
                ]
            }
        ],
        quickActions: [
            { id: 'emergency', label: 'E-STOP', action: 'emergencyStop', class: 'danger' },
            { id: 'refresh', label: 'Refresh', action: 'refreshData', class: 'secondary' },
        ]
    };

    let isCollapsed = false;
    let isMobile = window.innerWidth < 1024;
    let socket = null;

    function init() {
        injectStyles();
        renderNavigation();
        setupEventListeners();
        setupKeyboardShortcuts();
        highlightCurrentPage();
        try {
            socket = io();
            socket.on('connect', () => updateConnectionStatus(true));
            socket.on('disconnect', () => updateConnectionStatus(false));
        } catch (e) { /* no socket */ }
    }

    function injectStyles() {
        if (document.getElementById('universal-nav-styles')) return;

        const styles = `
            :root {
                --nav-w: 200px;
                --nav-w-c: 48px;
                --nav-bg: rgba(0, 0, 0, 0.98);
                --nav-border: rgba(255, 255, 255, 0.06);
                --nav-accent: #3b82f6;
                --nav-good: #4ade80;
                --nav-danger: #f87171;
                --nav-text: rgba(255, 255, 255, 0.45);
                --nav-text-hover: rgba(255, 255, 255, 0.9);
                --nav-font: 'Inter', -apple-system, sans-serif;
                --nav-mono: 'JetBrains Mono', monospace;
                --nav-t: all 0.15s ease;
            }

            body.has-nav { padding-left: var(--nav-w); transition: var(--nav-t); }
            body.has-nav.nav-collapsed { padding-left: var(--nav-w-c); }
            @media (max-width: 1024px) {
                body.has-nav, body.has-nav.nav-collapsed { padding-left: 0; }
            }

            /* === SIDEBAR === */
            #universal-nav {
                position: fixed; top: 0; left: 0;
                width: var(--nav-w); height: 100vh;
                background: var(--nav-bg);
                border-right: 1px solid var(--nav-border);
                z-index: 9999;
                display: flex; flex-direction: column;
                transition: var(--nav-t);
                font-family: var(--nav-font);
            }
            #universal-nav.collapsed { width: var(--nav-w-c); }

            @media (max-width: 1024px) {
                #universal-nav { transform: translateX(-100%); width: var(--nav-w); }
                #universal-nav.open { transform: translateX(0); }
                #universal-nav.collapsed { transform: translateX(-100%); }
            }

            /* Header */
            .nav-header {
                padding: 14px 12px 12px;
                border-bottom: 1px solid var(--nav-border);
                min-height: 52px;
                display: flex; align-items: center; gap: 8px;
            }
            .nav-brand-icon {
                width: 26px; height: 26px;
                border: 1px solid rgba(59, 130, 246, 0.25);
                border-radius: 4px;
                display: flex; align-items: center; justify-content: center;
                font-size: 11px; color: var(--nav-accent); flex-shrink: 0;
                background: rgba(59, 130, 246, 0.06);
            }
            .nav-brand-text { overflow: hidden; transition: var(--nav-t); }
            .collapsed .nav-brand-text { opacity: 0; width: 0; }
            .nav-brand-title {
                font-weight: 600; font-size: 11px;
                color: rgba(255,255,255,0.85);
                letter-spacing: 0.06em;
                text-transform: uppercase;
            }
            .nav-brand-sub {
                font-size: 9px; color: #555;
                letter-spacing: 0.04em;
                font-family: var(--nav-mono);
            }

            /* Toggle */
            .nav-toggle {
                position: absolute; right: -11px; top: 18px;
                width: 20px; height: 20px;
                background: #111; border: 1px solid var(--nav-border);
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; color: #555; font-size: 8px;
                transition: var(--nav-t); z-index: 10;
            }
            .nav-toggle:hover { color: #aaa; border-color: rgba(255,255,255,0.15); }
            .collapsed .nav-toggle { transform: rotate(180deg); }
            @media (max-width: 1024px) { .nav-toggle { display: none; } }

            /* Content */
            .nav-content {
                flex: 1; overflow-y: auto; overflow-x: hidden;
                padding: 6px;
            }
            .nav-content::-webkit-scrollbar { width: 2px; }
            .nav-content::-webkit-scrollbar-track { background: transparent; }
            .nav-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.04); }

            /* Section titles */
            .nav-section { margin-bottom: 2px; }
            .nav-section-title {
                padding: 10px 8px 4px;
                font-size: 9px; color: #444;
                text-transform: uppercase; letter-spacing: 0.1em;
                font-weight: 600; transition: var(--nav-t);
                white-space: nowrap;
            }
            .collapsed .nav-section-title { opacity: 0; height: 0; padding: 0; overflow: hidden; }

            /* Nav items */
            .nav-item {
                display: flex; align-items: center; gap: 8px;
                padding: 6px 8px; margin: 1px 0;
                border-radius: 4px;
                color: var(--nav-text);
                text-decoration: none;
                transition: var(--nav-t);
                cursor: pointer;
                position: relative;
                font-size: 12px;
            }
            .nav-item::before {
                content: ''; position: absolute;
                left: 0; top: 4px; bottom: 4px; width: 2px;
                background: var(--nav-accent);
                opacity: 0; transition: opacity 0.15s ease;
                border-radius: 1px;
            }
            .nav-item:hover { background: rgba(255,255,255,0.03); color: var(--nav-text-hover); }
            .nav-item.active { background: rgba(59, 130, 246, 0.06); color: var(--nav-text-hover); }
            .nav-item.active::before { opacity: 1; }

            .nav-item-icon {
                width: 16px; height: 16px;
                display: flex; align-items: center; justify-content: center;
                font-size: 10px; flex-shrink: 0;
                color: #555; transition: color 0.15s ease;
            }
            .nav-item:hover .nav-item-icon { color: #888; }
            .nav-item.active .nav-item-icon { color: var(--nav-accent); }

            .nav-item-label {
                font-weight: 500; font-size: 12px; white-space: nowrap;
                overflow: hidden; text-overflow: ellipsis;
            }
            .collapsed .nav-item-label { opacity: 0; width: 0; overflow: hidden; }

            .nav-item-shortcut {
                margin-left: auto;
                font-size: 9px; color: #333;
                font-family: var(--nav-mono);
                transition: var(--nav-t);
            }
            .collapsed .nav-item-shortcut { display: none; }
            .nav-item:hover .nav-item-shortcut { color: #555; }

            /* Tooltips (collapsed only) */
            .nav-item[data-tooltip]::after {
                content: attr(data-tooltip);
                position: absolute; left: calc(100% + 8px); top: 50%;
                transform: translateY(-50%);
                padding: 5px 8px;
                background: rgba(0,0,0,0.95);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 4px;
                color: rgba(255,255,255,0.85);
                font-size: 11px; font-weight: 500;
                white-space: nowrap;
                opacity: 0; visibility: hidden;
                transition: all 0.15s ease;
                z-index: 10000; pointer-events: none;
            }
            .collapsed .nav-item[data-tooltip]:hover::after { opacity: 1; visibility: visible; }

            /* Status */
            .nav-status {
                padding: 8px 10px;
                border-top: 1px solid var(--nav-border);
                display: flex; align-items: center; gap: 6px;
            }
            .nav-status-dot {
                width: 5px; height: 5px; border-radius: 50%;
                background: var(--nav-good);
                animation: nav-pulse 2s infinite;
                flex-shrink: 0;
            }
            .nav-status-dot.off { background: var(--nav-danger); animation: none; }
            .nav-status-text {
                font-size: 10px; color: #444;
                font-family: var(--nav-mono);
            }
            .collapsed .nav-status-text { display: none; }
            @keyframes nav-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

            /* Actions */
            .nav-actions {
                padding: 8px;
                border-top: 1px solid var(--nav-border);
                display: flex; flex-direction: column; gap: 4px;
            }
            .nav-action-btn {
                display: flex; align-items: center; gap: 6px;
                padding: 6px 8px;
                border: 1px solid var(--nav-border);
                border-radius: 4px; background: transparent;
                color: var(--nav-text);
                font-family: var(--nav-mono);
                font-size: 10px; font-weight: 500;
                cursor: pointer; transition: var(--nav-t);
                letter-spacing: 0.03em;
            }
            .nav-action-btn:hover {
                background: rgba(255,255,255,0.03);
                border-color: rgba(255,255,255,0.12);
                color: var(--nav-text-hover);
            }
            .nav-action-btn.danger {
                border-color: rgba(248, 113, 113, 0.15);
                color: rgba(248, 113, 113, 0.7);
            }
            .nav-action-btn.danger:hover {
                background: rgba(248, 113, 113, 0.06);
                border-color: rgba(248, 113, 113, 0.35);
                color: var(--nav-danger);
            }
            .collapsed .nav-action-btn span:last-child { display: none; }
            .collapsed .nav-action-btn { justify-content: center; padding: 6px; }

            /* Mobile */
            .nav-mobile-btn {
                display: none;
                position: fixed; top: 12px; left: 12px; z-index: 10000;
                width: 32px; height: 32px;
                background: var(--nav-bg); border: 1px solid var(--nav-border);
                border-radius: 4px; color: #666; font-size: 14px;
                cursor: pointer;
            }
            @media (max-width: 1024px) {
                .nav-mobile-btn { display: flex; align-items: center; justify-content: center; }
            }

            .nav-overlay {
                display: none; position: fixed; inset: 0;
                background: rgba(0,0,0,0.5); z-index: 9998;
                opacity: 0; transition: opacity 0.15s ease;
            }
            @media (max-width: 1024px) {
                .nav-overlay.active { display: block; opacity: 1; }
            }

            /* top-bar offset */
            .top-bar { padding-left: calc(var(--nav-w) + 16px) !important; }
            body.nav-collapsed .top-bar { padding-left: calc(var(--nav-w-c) + 16px) !important; }
            @media (max-width: 1024px) {
                .top-bar { padding-left: 52px !important; }
                body.nav-collapsed .top-bar { padding-left: 52px !important; }
            }
        `;

        const styleEl = document.createElement('style');
        styleEl.id = 'universal-nav-styles';
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    function renderNavigation() {
        if (document.getElementById('universal-nav')) return;
        document.body.classList.add('has-nav');

        // Mobile button
        const mobileBtn = document.createElement('button');
        mobileBtn.className = 'nav-mobile-btn';
        mobileBtn.innerHTML = '\u2630';
        mobileBtn.onclick = toggleMobile;
        document.body.appendChild(mobileBtn);

        // Overlay
        const overlay = document.createElement('div');
        overlay.className = 'nav-overlay';
        overlay.onclick = closeMobile;
        document.body.appendChild(overlay);

        // Nav
        const nav = document.createElement('nav');
        nav.id = 'universal-nav';

        let html = `
            <div class="nav-toggle" onclick="window.UniversalNav.toggle()">\u25C0</div>
            <div class="nav-header">
                <div class="nav-brand-icon">VC</div>
                <div class="nav-brand-text">
                    <div class="nav-brand-title">${NAV_CONFIG.brand.title}</div>
                    <div class="nav-brand-sub">${NAV_CONFIG.brand.subtitle}</div>
                </div>
            </div>
            <div class="nav-content">
        `;

        NAV_CONFIG.sections.forEach(section => {
            html += `<div class="nav-section"><div class="nav-section-title">${section.title}</div>`;
            section.items.forEach(item => {
                html += `
                    <a href="${item.path}" class="nav-item" data-id="${item.id}" data-tooltip="${item.label} [${item.shortcut}]">
                        <span class="nav-item-icon">${item.icon}</span>
                        <span class="nav-item-label">${item.label}</span>
                        <span class="nav-item-shortcut">${item.shortcut}</span>
                    </a>`;
            });
            html += `</div>`;
        });

        html += `</div>`; // nav-content

        html += `
            <div class="nav-status">
                <span class="nav-status-dot" id="nav-status-dot"></span>
                <span class="nav-status-text" id="nav-status-text">CONNECTED</span>
            </div>
            <div class="nav-actions">
                <button class="nav-action-btn danger" onclick="window.UniversalNav.emergencyStop()">
                    <span>\u25A0</span><span>ESTOP</span>
                </button>
                <button class="nav-action-btn" onclick="window.UniversalNav.refreshData()">
                    <span>\u21BB</span><span>REFRESH</span>
                </button>
            </div>`;

        nav.innerHTML = html;
        document.body.appendChild(nav);
    }

    function setupEventListeners() {
        window.addEventListener('resize', () => {
            const was = isMobile;
            isMobile = window.innerWidth < 1024;
            if (was && !isMobile) closeMobile();
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobile(); });
    }

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (!e.altKey) return;
            const key = e.key.toUpperCase();
            NAV_CONFIG.sections.forEach(s => s.items.forEach(item => {
                if (item.shortcut === key) { e.preventDefault(); window.location.href = item.path; }
            }));
            if (key === 'M') { e.preventDefault(); toggleMobile(); }
            if (key === 'B') { e.preventDefault(); toggle(); }
        });
    }

    function highlightCurrentPage() {
        const path = window.location.pathname;
        document.querySelectorAll('.nav-item').forEach(item => {
            const href = item.getAttribute('href');
            const match = path === href ||
                (href !== '/' && path.startsWith(href)) ||
                (path === '/' && href === '/');
            item.classList.toggle('active', match);
        });
    }

    function toggle() {
        isCollapsed = !isCollapsed;
        document.getElementById('universal-nav').classList.toggle('collapsed', isCollapsed);
        document.body.classList.toggle('nav-collapsed', isCollapsed);
        localStorage.setItem('navCollapsed', isCollapsed);
    }

    function toggleMobile() {
        document.getElementById('universal-nav').classList.toggle('open');
        document.querySelector('.nav-overlay').classList.toggle('active');
    }

    function closeMobile() {
        document.getElementById('universal-nav').classList.remove('open');
        document.querySelector('.nav-overlay').classList.remove('active');
    }

    function updateConnectionStatus(connected) {
        const dot = document.getElementById('nav-status-dot');
        const text = document.getElementById('nav-status-text');
        if (connected) { dot.classList.remove('off'); text.textContent = 'CONNECTED'; }
        else { dot.classList.add('off'); text.textContent = 'DISCONNECTED'; }
    }

    function emergencyStop() {
        if (confirm('EMERGENCY STOP\n\nClose ALL positions and cancel ALL orders?\n\nThis cannot be undone.')) {
            fetch('/api/emergency-stop', { method: 'POST' })
                .then(r => r.json())
                .then(d => alert('Emergency stop: ' + d.message))
                .catch(e => alert('Failed: ' + e.message));
        }
    }

    function refreshData() {
        window.dispatchEvent(new CustomEvent('nav-refresh-data'));
    }

    function restorePreferences() {
        if (localStorage.getItem('navCollapsed') === 'true') {
            isCollapsed = true;
            const nav = document.getElementById('universal-nav');
            if (nav) { nav.classList.add('collapsed'); document.body.classList.add('nav-collapsed'); }
        }
    }

    window.UniversalNav = { toggle, toggleMobile, closeMobile, emergencyStop, refreshData, init, updateConnectionStatus };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { init(); restorePreferences(); });
    } else {
        init(); restorePreferences();
    }
})();
