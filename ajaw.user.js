// ==UserScript==
// @name         Ajaw
// @namespace    Reeyz
// @version      0.1.2
// @description  A Wplace utility tool
// @author       Reeyz
// @updateURL    https://github.com/Reeyz/Wplace-Ajaw/raw/main/ajaw.user.js
// @downloadURL  https://github.com/Reeyz/Wplace-Ajaw/raw/main/ajaw.user.js
// @match        https://wplace.live/*
// @icon         
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const WPlacePlusPlus = {
        config: {
            version: '0.8.3',
            longPressDelay: 400,
            dragSmoothness: 0.08
        },

        state: {
            uiOpen: false,
            isDragging: false,
            isLongPressing: false,
            longPressTimer: null,
            buttonPos: null,
            currentTheme: 'liberty_wplace',
            currentUITheme: 'default',
            buttonOpacity: 1,
            dragState: {
                startX: 0,
                startY: 0,
                currentX: 0,
                currentY: 0,
                targetX: 0,
                targetY: 0,
                rafId: null
            },
            touchMoved: false
        },

        themesMap: {
            liberty_wplace: {
                url: 'https://maps.wplace.live/styles/liberty',
                name: 'Liberty Wplace'
            },
            bright_wplace: {
                url: 'https://maps.wplace.live/styles/bright',
                name: 'Bright Wplace'
            },
            dark_black_wplace: {
                url: 'https://maps.wplace.live/styles/dark',
                name: 'Dark Black Wplace'
            },
            dark_blue_wplace: {
                url: 'https://maps.wplace.live/styles/fiord',
                name: 'Dark Blue Wplace'
            }
        },

        uiThemes: {
            'default': {
                display: 'Default',
                css: '',
                buttonBg: '#ffffff',
                buttonIcon: '#000000',
                menuBg: '#ffffff',
                menuText: '#1f2937'
            },
            'ctp-mocha': {
                display: 'Dark',
                css: `:root { --color-base-100: #1e1e2e; --color-base-content: white; --color-base-200: #181825; --color-base-300: #11111b; --fx-noise:; }`,
                buttonBg: '#000000',
                buttonIcon: '#ffffff',
                menuBg: '#2a2a3e',
                menuText: '#e0e0e0'
            }
        },

        log(level, ...args) {
            const colors = { err: 'red', inf: 'lime', wrn: 'yellow', dbg: 'orange' };
            const color = colors[level] || 'white';
            console.log(`%c[wPlace++] %c[${level}]`, 'color: pink', `color: ${color}`, ...args);
        },

        getTheme() {
            const stored = localStorage.getItem('MapTheme');
            const themeId = stored && this.themesMap[stored] ? stored : 'liberty_wplace';
            return themeId;
        },

        getUITheme() {
            const stored = localStorage.getItem('wpp_ui_theme');
            const themeId = stored && this.uiThemes[stored] ? stored : 'default';
            return themeId;
        },

        getButtonOpacity() {
            const stored = localStorage.getItem('wpp_button_opacity');
            return stored ? parseFloat(stored) : 1;
        },

        setTheme(themeId) {
            if (!this.themesMap[themeId]) {
                this.log('err', `Theme ${themeId} does not exist`);
                return;
            }

            localStorage.setItem('MapTheme', themeId);
            this.state.currentTheme = themeId;
            this.log('inf', `Theme changed to: ${themeId}`);

            // Reload to apply theme
            location.reload();
        },

        setUITheme(themeId) {
            if (!this.uiThemes.hasOwnProperty(themeId)) {
                this.log('err', `UI theme ${themeId} does not exist`);
                return;
            }

            localStorage.setItem('wpp_ui_theme', themeId);
            this.state.currentUITheme = themeId;
            this.updateButtonAppearance();
            this.updateMenuAppearance();
            this.updateUIStyle();
            this.log('inf', `UI theme changed to: ${themeId}`);
        },

        setButtonOpacity(opacity) {
            const value = Math.max(0, Math.min(1, opacity));
            localStorage.setItem('wpp_button_opacity', value);
            this.state.buttonOpacity = value;
            this.updateButtonAppearance();
            this.log('inf', `Button opacity changed to: ${(value * 100).toFixed(0)}%`);
        },

        updateButtonAppearance() {
            const theme = this.uiThemes[this.state.currentUITheme];
            const button = document.getElementById('wpp-button');

            if (button) {
                button.style.backgroundColor = theme.buttonBg;
                button.style.borderColor = theme.buttonBg;
                button.style.opacity = this.state.buttonOpacity;
                const svg = button.querySelector('svg');
                if (svg) {
                    svg.style.fill = theme.buttonIcon;
                }
            }

            // Update CSS variables for dynamic styling
            document.documentElement.style.setProperty('--wpp-button-bg', theme.buttonBg);
            document.documentElement.style.setProperty('--wpp-button-icon', theme.buttonIcon);
            document.documentElement.style.setProperty('--wpp-button-opacity', this.state.buttonOpacity);
        },

        updateMenuAppearance() {
            const theme = this.uiThemes[this.state.currentUITheme];
            const menuContent = document.getElementById('wpp-menu-content');

            if (menuContent) {
                menuContent.style.backgroundColor = theme.menuBg;
                menuContent.style.color = theme.menuText;
            }
        },

        updateUIStyle() {
            const styleEl = document.getElementById('wpp-ui-style');
            const theme = this.uiThemes[this.state.currentUITheme];
            if (styleEl) {
                styleEl.innerHTML = theme.css;
            }
        },

        loadButtonPosition() {
            const saved = localStorage.getItem('wpp_button_pos');
            if (saved) {
                try {
                    this.state.buttonPos = JSON.parse(saved);
                } catch (e) {
                    this.state.buttonPos = { bottom: 20, right: 20 };
                }
            } else {
                this.state.buttonPos = { bottom: 20, right: 20 };
            }
        },

        saveButtonPosition() {
            localStorage.setItem('wpp_button_pos', JSON.stringify(this.state.buttonPos));
        },

        easeInOutQuad(t) {
            return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        },

        animateDrag() {
            if (!this.state.isDragging) return;

            const container = document.getElementById('wpp-button-container');
            if (!container) return;

            const ds = this.state.dragState;

            // Smooth easing for gentle acceleration/deceleration
            const dx = ds.targetX - ds.currentX;
            const dy = ds.targetY - ds.currentY;
            const distance = Math.hypot(dx, dy);

            if (distance > 0.5) {
                // Use easing for smooth motion
                const easeAmount = Math.min(this.config.dragSmoothness, distance / 100);
                const easedAmount = this.easeInOutQuad(easeAmount);

                ds.currentX += dx * easedAmount;
                ds.currentY += dy * easedAmount;
            } else {
                // Snap to target when very close
                ds.currentX = ds.targetX;
                ds.currentY = ds.targetY;
            }

            const rect = container.getBoundingClientRect();
            const buttonWidth = rect.width;
            const buttonHeight = rect.height;

            const right = window.innerWidth - ds.currentX - buttonWidth;
            const bottom = window.innerHeight - ds.currentY - buttonHeight;

            container.style.right = `${Math.max(0, Math.min(right, window.innerWidth - buttonWidth))}px`;
            container.style.bottom = `${Math.max(0, Math.min(bottom, window.innerHeight - buttonHeight))}px`;

            ds.rafId = requestAnimationFrame(() => this.animateDrag());
        },        setupDraggable() {
            const button = document.getElementById('wpp-button');
            const container = document.getElementById('wpp-button-container');
            if (!button || !container) return;

            let touchIdentifier = null;

            const startLongPress = () => {
                if (this.state.isDragging || this.state.isLongPressing) return;

                this.state.isLongPressing = true;
                this.state.longPressTimer = setTimeout(() => {
                    this.state.isDragging = true;
                    this.state.isLongPressing = false;
                    container.classList.add('dragging');

                    const rect = container.getBoundingClientRect();
                    this.state.dragState.currentX = rect.left;
                    this.state.dragState.currentY = rect.top;
                    this.state.dragState.targetX = rect.left;
                    this.state.dragState.targetY = rect.top;

                    this.animateDrag();
                }, this.config.longPressDelay);
            };

            const cancelLongPress = () => {
                if (this.state.longPressTimer) {
                    clearTimeout(this.state.longPressTimer);
                    this.state.longPressTimer = null;
                }
                this.state.isLongPressing = false;
            };

            const updateDragPosition = (clientX, clientY) => {
                if (!this.state.isDragging) return;

                const container = document.getElementById('wpp-button-container');
                if (!container) return;

                const rect = container.getBoundingClientRect();
                const buttonWidth = rect.width;
                const buttonHeight = rect.height;

                // Instant target update (no delay)
                this.state.dragState.targetX = clientX - buttonWidth / 2;
                this.state.dragState.targetY = clientY - buttonHeight / 2;
            };

            const endDrag = () => {
                cancelLongPress();

                if (this.state.isDragging) {
                    if (this.state.dragState.rafId) {
                        cancelAnimationFrame(this.state.dragState.rafId);
                        this.state.dragState.rafId = null;
                    }

                    const rect = container.getBoundingClientRect();
                    this.state.buttonPos = {
                        bottom: window.innerHeight - rect.bottom,
                        right: window.innerWidth - rect.right
                    };
                    this.saveButtonPosition();

                    container.classList.remove('dragging');

                    setTimeout(() => {
                        this.state.isDragging = false;
                    }, 100);
                }
            };

            // Mouse events
            button.addEventListener('mousedown', (e) => {
                e.preventDefault();
                startLongPress();
            });

            document.addEventListener('mousemove', (e) => {
                if (this.state.isDragging) {
                    e.preventDefault();
                    updateDragPosition(e.clientX, e.clientY);
                }
            });

            document.addEventListener('mouseup', () => {
                endDrag();
            });

            // Touch events - FIXED for mobile
            button.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                touchIdentifier = touch.identifier;
                this.state.touchMoved = false;
                startLongPress();
            }, { passive: true });

            document.addEventListener('touchmove', (e) => {
                this.state.touchMoved = true;
                
                if (this.state.isDragging) {
                    e.preventDefault();
                    const touch = Array.from(e.touches).find(t => t.identifier === touchIdentifier);
                    if (touch) {
                        updateDragPosition(touch.clientX, touch.clientY);
                    }
                }
            }, { passive: false });

            document.addEventListener('touchend', (e) => {
                const wasTap = !this.state.touchMoved && !this.state.isDragging;
                
                endDrag();
                touchIdentifier = null;
                
                // If it was a tap (no movement, no drag), open the menu
                if (wasTap) {
                    this.toggleMenu();
                }
                
                this.state.touchMoved = false;
            });

            document.addEventListener('touchcancel', () => {
                endDrag();
                touchIdentifier = null;
                this.state.touchMoved = false;
            });

            // Click event for mouse (desktop)
            button.addEventListener('click', (e) => {
                if (!this.state.isDragging && !this.state.isLongPressing) {
                    this.toggleMenu();
                }
            });
        },

        injectStyles() {
            const theme = this.uiThemes[this.state.currentUITheme];
            const style = document.createElement('style');
            style.id = 'wpp-styles';
            style.innerHTML = `
                :root {
                    --wpp-button-bg: ${theme.buttonBg};
                    --wpp-button-icon: ${theme.buttonIcon};
                    --wpp-button-opacity: ${this.state.buttonOpacity};
                    --wpp-menu-bg: ${theme.menuBg};
                    --wpp-menu-text: ${theme.menuText};
                }

                @keyframes wpp-pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }

                #wpp-button-container {
                    position: fixed;
                    bottom: ${this.state.buttonPos.bottom}px;
                    right: ${this.state.buttonPos.right}px;
                    z-index: 5000;
                    will-change: bottom, right;
                }

                #wpp-button-container.dragging {
                    opacity: 0.9;
                    cursor: grabbing !important;
                    animation: wpp-pulse 0.4s ease-in-out;
                }

                #wpp-button {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    border: 2px solid var(--wpp-button-bg);
                    background-color: var(--wpp-button-bg);
                    opacity: var(--wpp-button-opacity);
                    cursor: grab;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    transition: box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                                filter 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    user-select: none;
                    -webkit-user-select: none;
                    touch-action: none;
                }

                #wpp-button:hover:not(.dragging #wpp-button) {
                    box-shadow: 0 0 0 3px rgba(0, 105, 255, 0.4),
                                0 4px 12px rgba(0, 105, 255, 0.25);
                    filter: drop-shadow(0 0 8px rgba(0, 105, 255, 0.5));
                }

                #wpp-button:active {
                    transform: scale(0.95);
                }

                .dragging #wpp-button {
                    cursor: grabbing !important;
                    box-shadow: 0 0 0 4px rgba(0, 105, 255, 0.5),
                                0 8px 24px rgba(0, 105, 255, 0.4);
                }

                #wpp-button svg {
                    width: 22px;
                    height: 22px;
                    transition: transform 0.2s ease;
                    fill: var(--wpp-button-icon);
                }

                #wpp-button:hover svg {
                    transform: rotate(45deg);
                }

                #wpp-menu-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    z-index: 5001;
                    display: none;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                    align-items: center;
                    justify-content: center;
                }

                #wpp-menu-overlay.active {
                    display: flex;
                    opacity: 1;
                }

                #wpp-menu-content {
                    background: var(--wpp-menu-bg);
                    color: var(--wpp-menu-text);
                    border-radius: 16px;
                    padding: 24px;
                    max-width: 420px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    animation: wpp-menu-appear 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    transition: background-color 0.2s ease, color 0.2s ease;
                }

                @keyframes wpp-menu-appear {
                    from {
                        opacity: 0;
                        transform: scale(0.9) translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }

                #wpp-menu-title {
                    color: var(--wpp-menu-text);
                    margin: 0 0 20px 0;
                    font-size: 1.5em;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                }

                .wpp-menu-section {
                    margin-bottom: 20px;
                    padding-bottom: 20px;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                }

                .wpp-menu-section:last-child {
                    border-bottom: none;
                    margin-bottom: 0;
                    padding-bottom: 0;
                }

                .wpp-menu-section h4 {
                    margin: 0 0 12px 0;
                    color: var(--wpp-menu-text);
                    opacity: 0.7;
                    font-size: 0.75em;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                }

                .wpp-menu-section select {
                    width: 100%;
                    padding: 10px 12px;
                    background: rgba(0, 0, 0, 0.1);
                    color: var(--wpp-menu-text);
                    border: 1px solid rgba(0, 0, 0, 0.15);
                    border-radius: 8px;
                    font-size: 0.95em;
                    cursor: pointer;
                    font-family: inherit;
                    transition: all 0.2s ease;
                }

                .wpp-menu-section select:hover {
                    background: rgba(0, 0, 0, 0.15);
                    border-color: rgba(0, 0, 0, 0.25);
                }

                .wpp-menu-section select:focus {
                    outline: none;
                    border-color: #0069ff;
                    box-shadow: 0 0 0 3px rgba(0, 105, 255, 0.1);
                    background: rgba(0, 0, 0, 0.05);
                }
                                .wpp-slider-container {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-top: 8px;
                }

                .wpp-slider {
                    flex: 1;
                    height: 6px;
                    border-radius: 3px;
                    background: rgba(0, 0, 0, 0.1);
                    outline: none;
                    cursor: pointer;
                    -webkit-appearance: none;
                    appearance: none;
                }

                .wpp-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #0069ff;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 6px rgba(0, 105, 255, 0.3);
                }

                .wpp-slider::-webkit-slider-thumb:hover {
                    transform: scale(1.2);
                    box-shadow: 0 4px 12px rgba(0, 105, 255, 0.5);
                }

                .wpp-slider::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #0069ff;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 6px rgba(0, 105, 255, 0.3);
                }

                .wpp-slider::-moz-range-thumb:hover {
                    transform: scale(1.2);
                    box-shadow: 0 4px 12px rgba(0, 105, 255, 0.5);
                }

                .wpp-opacity-label {
                    font-size: 0.85em;
                    color: var(--wpp-menu-text);
                    opacity: 0.8;
                    min-width: 35px;
                    text-align: right;
                    font-weight: 500;
                }

                .wpp-radio-group {
                    display: flex;
                    gap: 8px;
                    margin-top: 8px;
                }

                .wpp-radio-group label {
                    flex: 1;
                    padding: 8px 12px;
                    background: rgba(0, 0, 0, 0.1);
                    border: 2px solid rgba(0, 0, 0, 0.15);
                    border-radius: 6px;
                    text-align: center;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.2s ease;
                    color: var(--wpp-menu-text);
                }

                .wpp-radio-group input[type="radio"] {
                    display: none;
                }

                .wpp-radio-group input[type="radio"]:checked + label {
                    background: #0069ff;
                    color: white;
                    border-color: #0069ff;
                }

                .wpp-radio-group label:hover {
                    border-color: #0069ff;
                    background: rgba(0, 105, 255, 0.1);
                }

                .wpp-menu-section button {
                    width: 100%;
                    padding: 10px 16px;
                    background: #0069ff;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.95em;
                    font-weight: 600;
                    cursor: pointer;
                    font-family: inherit;
                    transition: all 0.2s ease;
                }

                .wpp-menu-section button:hover {
                    background: #0052cc;
                    box-shadow: 0 4px 12px rgba(0, 105, 255, 0.3);
                }

                .wpp-menu-section button:active {
                    transform: scale(0.98);
                }

                .wpp-menu-section p {
                    font-size: 0.8em;
                    color: var(--wpp-menu-text);
                    opacity: 0.7;
                    margin: 8px 0 0 0;
                }

                #wpp-menu-content::-webkit-scrollbar {
                    width: 8px;
                }

                #wpp-menu-content::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 4px;
                }

                #wpp-menu-content::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 4px;
                }

                #wpp-menu-content::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 0, 0, 0.3);
                }
            `;
            document.head.appendChild(style);
        },

        injectUI() {
            this.log('inf', 'Injecting UI');

            const buttonContainer = document.createElement('div');
            buttonContainer.id = 'wpp-button-container';

            const button = document.createElement('button');
            button.id = 'wpp-button';
            button.title = 'wPlace++ Settings';
            button.innerHTML = '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z"/></svg>';

            buttonContainer.appendChild(button);
            document.body.appendChild(buttonContainer);

            const overlay = document.createElement('div');
            overlay.id = 'wpp-menu-overlay';

            const menuContent = document.createElement('div');
            menuContent.id = 'wpp-menu-content';

            const currentTheme = this.state.currentTheme;
            const currentUITheme = this.state.currentUITheme;
            const opacityPercent = Math.round(this.state.buttonOpacity * 100);

            menuContent.innerHTML = `
                <h3 id="wpp-menu-title">wPlace++</h3>

                <div class="wpp-menu-section">
                    <h4>Map Theme</h4>
                    <select id="wpp-theme-select">
                        ${Object.entries(this.themesMap).map(([id, t]) =>
                            `<option value="${id}" ${id === currentTheme ? 'selected' : ''}>${t.name}</option>`
                        ).join('')}
                    </select>
                </div>

                <div class="wpp-menu-section">
                    <h4>Theme</h4>
                    <div class="wpp-radio-group">
                        ${Object.entries(this.uiThemes).map(([id, theme]) =>
                            `<input type="radio" id="theme-${id}" name="ui-theme" value="${id}" ${id === currentUITheme ? 'checked' : ''}>
                             <label for="theme-${id}">${theme.display}</label>`
                        ).join('')}
                    </div>
                </div>

                <div class="wpp-menu-section">
                    <h4>Button Opacity</h4>
                    <div class="wpp-slider-container">
                        <input type="range" id="wpp-opacity-slider" class="wpp-slider" min="0" max="100" value="${opacityPercent}">
                        <span class="wpp-opacity-label" id="wpp-opacity-value">${opacityPercent}%</span>
                    </div>
                </div>

                <div class="wpp-menu-section">
                    <button id="wpp-close-btn">Close</button>
                </div>
            `;

            overlay.appendChild(menuContent);
            document.body.appendChild(overlay);

            document.getElementById('wpp-theme-select').addEventListener('change', (e) => {
                this.setTheme(e.target.value);
            });

            document.querySelectorAll('input[name="ui-theme"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    this.setUITheme(e.target.value);
                });
            });

            const opacitySlider = document.getElementById('wpp-opacity-slider');
            const opacityLabel = document.getElementById('wpp-opacity-value');
            opacitySlider.addEventListener('input', (e) => {
                const value = e.target.value / 100;
                this.setButtonOpacity(value);
                opacityLabel.textContent = e.target.value + '%';
            });

            document.getElementById('wpp-close-btn').addEventListener('click', () => {
                this.toggleMenu(false);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.toggleMenu(false);
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.toggleMenu(false);
                }
            });

            this.setupDraggable();
        },

        toggleMenu(force) {
            const overlay = document.getElementById('wpp-menu-overlay');
            if (!overlay) return;

            const shouldOpen = force !== undefined ? force : !overlay.classList.contains('active');
            overlay.classList.toggle('active', shouldOpen);
            this.state.uiOpen = shouldOpen;
        },

        init() {
            this.log('inf', `Initializing v${this.config.version}`);

            this.state.currentTheme = this.getTheme();
            this.state.currentUITheme = this.getUITheme();
            this.state.buttonOpacity = this.getButtonOpacity();
            this.loadButtonPosition();

            const uiThemeStyle = document.createElement('style');
            uiThemeStyle.id = 'wpp-ui-style';
            uiThemeStyle.innerHTML = this.uiThemes[this.state.currentUITheme].css;
            document.head.appendChild(uiThemeStyle);

            this.injectStyles();
            this.injectUI();
            this.updateButtonAppearance();
            this.updateMenuAppearance();
        }
    };

    // Fetch override (from new script)
    const originalThemeUrl = 'https://maps.wplace.live/styles/liberty';
    const __ufetch = unsafeWindow.fetch;

    unsafeWindow.fetch = function (configArg, ...restArg) {
        const url =
            (typeof configArg === 'string' && configArg) ||
            (configArg && configArg.url) ||
            '';

        const stored = localStorage.getItem('MapTheme');
        const currentTheme = stored && WPlacePlusPlus.themesMap[stored] ? stored : 'liberty_wplace';
        const selectedTheme = WPlacePlusPlus.themesMap[currentTheme];

        if (url === originalThemeUrl) {
            return __ufetch(selectedTheme.url);
        }
        return __ufetch(configArg, ...restArg);
    };

    WPlacePlusPlus.init();
    window.WPlacePlusPlus = WPlacePlusPlus;
})();
