/**
 * Style Inspector - Figma-like visual style inspector
 * Type "flow" to toggle on/off
 * Click on elements to see their styles in a visual Figma-style panel
 * 
 * STRUCTURE:
 * 1. CONFIGURATION - Design tokens and constants
 * 2. STATE - All state variables
 * 3. UTILITIES - Helper functions
 * 4. DOM CREATION - UI element factories
 * 5. UI BUILDERS - Tooltip content generators
 * 6. CORE FUNCTIONS - Main update logic
 * 7. EVENT HANDLERS - User interaction handlers
 * 8. MODE MANAGEMENT - Inspector mode switching
 * 9. INITIALIZATION - Setup and event binding
 */

console.log('Style Inspector loaded');

(function () {
    if (!window.location.href.includes('.webflow.io')) return;

    'use strict';

    // =========================================================================
    // 1. CONFIGURATION
    // =========================================================================

    const CONFIG = {
        colors: {
            primary: '#0d99ff',
            primaryBg: 'rgba(13, 153, 255, 0.1)',
            primaryLabel: 'rgba(13, 153, 255, 0.9)',
            text: '#333',
            textMuted: '#999',
            textLight: '#afafafff',
            border: '#e5e5e5',
            borderLight: '#f0f0f0',
            background: '#ffffff',
            backgroundMuted: '#fafafa',
            dark: '#000000',
            white: '#ffffff',
        },
        spacing: {
            xs: 4,
            sm: 8,
            md: 16,
            lg: 24,
        },
        typography: {
            fontFamily: "'CustomFont', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            systemFont: "system-ui, -apple-system, sans-serif",
            fontSize: { xs: 10, sm: 11, md: 13, lg: 14 },
        },
        zIndex: {
            highlight: 999998,
            tooltip: 999999,
            modal: 1000000,
        },
        animation: {
            fast: '0.1s',
            normal: '0.2s',
            slow: '0.3s',
        },
        fontUrl: 'https://wf-style-check.vercel.app/font.ttf',
    };

    // Tag name to friendly display name mapping
    const TAG_NAMES = {
        a: 'Link', img: 'Image', svg: 'Icon', p: 'Paragraph',
        h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', h5: 'H5', h6: 'H6',
        div: 'Div', span: 'Span', button: 'Button', input: 'Input', form: 'Form',
    };

    // =========================================================================
    // 2. STATE
    // =========================================================================

    let isActive = false;
    let tooltip = null;
    let highlightOverlay = null;
    let layerBar = null;
    let currentElement = null;
    let isPinned = false;
    let pinnedElement = null;
    let lastTooltipPosition = { left: 0, top: 0, side: 'right' };
    let typedChars = '';
    let typingTimer = null;
    let activelyEditingElement = null;
    let currentMode = 'inspect'; // 'inspect', 'edit', 'skim'
    let skimProperties = new Set(['fontSize']);
    let skimUpdateTimer = null;
    let skimLabelsContainer = null;
    let skimModal = null;
    let skimButton = null;
    let measurementOverlay = null;
    let measurementRAFId = null;
    let lastMeasuredSource = null;
    let lastMeasuredTarget = null;

    // =========================================================================
    // 3. UTILITIES
    // =========================================================================

    // Load custom font
    const fontFace = new FontFace('CustomFont', `url(${CONFIG.fontUrl})`);
    fontFace.load().then(font => {
        document.fonts.add(font);
    }).catch(err => {
        console.warn('Failed to load custom font:', err);
    });

    // Get friendly name for HTML tag
    function tagNameToFriendlyName(tagName) {
        const tag = tagName.toLowerCase();
        return TAG_NAMES[tag] || tag.charAt(0).toUpperCase() + tag.slice(1);
    }

    // Create tooltip element
    function createTooltip() {
        const div = document.createElement('div');
        div.id = 'style-inspector-tooltip';
        div.style.cssText = `
      position: absolute;
      background: #ffffff;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      padding: 0;
      font-family: 'CustomFont', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 11px;
      color: #333;
      pointer-events: none;
      z-index: 999999;
      display: none;
      width: 280px;
      max-height: 420px;
      overflow-y: auto;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      transition: left 0.2s ease-out, top 0.2s ease-out;
    `;

        // Custom scrollbar styles
        const style = document.createElement('style');
        style.textContent = `
      #style-inspector-tooltip::-webkit-scrollbar {
        width: 4px;
      }
      #style-inspector-tooltip::-webkit-scrollbar-track {
        background: transparent;
      }
      #style-inspector-tooltip::-webkit-scrollbar-thumb {
        background: #d1d1d1;
        border-radius: 2px;
        height: 16px;
      }
      #style-inspector-tooltip::-webkit-scrollbar-thumb:hover {
        background: #b1b1b1;
      }
      
      @keyframes marquee-scroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
      
      .marquee-content {
        display: flex;
        gap: 12px;
        animation: marquee-scroll 10s linear infinite;
      }
      
      @keyframes measurement-fade-in {
        0% { opacity: 0; transform: scale(0.9); }
        100% { opacity: 1; transform: scale(1); }
      }
      
      .measurement-label {
        animation: measurement-fade-in 0.08s ease-out forwards;
      }
      
      .measurement-line {
        animation: measurement-fade-in 0.05s ease-out forwards;
      }
    `;
        document.head.appendChild(style);

        // Create close button
        const closeBtn = document.createElement('div');
        closeBtn.id = 'style-inspector-close';
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      background: transparent;
      color: #999;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
      pointer-events: auto;
      z-index: 10;
    `;
        closeBtn.onmouseover = () => {
            closeBtn.style.background = '#f0f0f0';
            closeBtn.style.color = '#333';
        };
        closeBtn.onmouseout = () => {
            closeBtn.style.background = 'transparent';
            closeBtn.style.color = '#999';
        };
        closeBtn.onclick = unpinTooltip;

        div.appendChild(closeBtn);
        document.body.appendChild(div);
        return div;
    }

    // Create highlight overlay
    function createHighlightOverlay() {
        const div = document.createElement('div');
        div.id = 'style-inspector-highlight';
        div.style.cssText = `
      position: absolute;
      border: 2px solid #0d99ff;
      background: rgba(13, 153, 255, 0.1);
      pointer-events: none;
      z-index: 999998;
      display: none;
      transition: all 0.1s ease;
    `;

        // Create label
        const label = document.createElement('div');
        label.id = 'style-inspector-label';
        label.style.cssText = `
            position: absolute;
            bottom: 100%;
            left: -2px;
            background: rgba(13, 153, 255, 0.9);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            padding: 4px 8px;
            border-radius: 4px 4px 0 0;
            color: white;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 10px;
            font-weight: 500;
            white-space: nowrap;
            pointer-events: none;
            display: flex;
            align-items: center;
            gap: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
        div.appendChild(label);

        document.body.appendChild(div);
        return div;
    }

    // Create measurement overlay
    function createMeasurementOverlay() {
        const div = document.createElement('div');
        div.id = 'style-inspector-measurement';
        div.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 999997;
            display: none;
            overflow: hidden;
        `;
        document.body.appendChild(div);
        return div;
    }

    // Create layer navigation bar
    function createLayerBar() {
        const div = document.createElement('div');
        div.id = 'style-inspector-layer-bar';
        div.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        gap: 6px;
        max-width: 600px;
        width: auto;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        padding: 8px 16px;
        font-family: 'CustomFont', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 11px;
        color: #333;
        z-index: 999999;
        display: none;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        -ms-overflow-style: none;
        transition: opacity 0.3s ease, height 0.3s ease, width 0.25s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    `;

        // Hide scrollbar for Chrome/Safari/Opera
        const styleId = 'layer-bar-scrollbar-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
            #style-inspector-layer-bar::-webkit-scrollbar {
                display: none;
            }
        `;
            document.head.appendChild(style);
        }

        document.body.appendChild(div);
        return div;
    }
    // Get element label
    function getElementLabel(element) {
        if (!element || element === document.body) return 'body';
        if (element === document.documentElement) return 'html';

        const tag = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const classes = element.className && typeof element.className === 'string'
            ? `.${element.className.split(' ').filter(c => c).slice(0, 2).join('.')}`
            : '';

        return `${tag}${id}${classes}`;
    }

    // Select element helper
    function selectElement(element) {
        if (!element || !isActive) return;

        currentElement = element;

        // Get element position for tooltip
        const rect = element.getBoundingClientRect();
        const mouseX = rect.left + rect.width / 2;
        const mouseY = rect.top + rect.height / 2;

        if (isPinned) {
            pinnedElement = element;
            updateTooltip(element, mouseX, mouseY, true);
        } else {
            updateTooltip(element, mouseX, mouseY, false);
        }

        updateHighlight(element);
        updateLayerBar(element);
    }

    // Update layer bar
    function updateLayerBar(element) {
        if (!layerBar || !isActive) return;

        // Build hierarchy path
        const path = [];
        let current = element;
        let depth = 0;

        while (current && current !== document.body && depth < 5) {
            path.unshift(current);
            current = current.parentElement;
            depth++;
        }

        // Clear existing content
        layerBar.innerHTML = '';

        // Add ellipsis
        const ellipsis = document.createElement('span');
        ellipsis.textContent = '...';
        ellipsis.style.color = '#999';
        ellipsis.style.marginRight = '6px';
        layerBar.appendChild(ellipsis);

        path.forEach((el, index) => {
            const label = getElementLabel(el);
            const isLast = index === path.length - 1;

            const span = document.createElement('span');
            span.textContent = label;
            span.style.cursor = 'pointer';
            span.style.transition = 'color 0.2s ease';

            if (isLast) {
                span.style.color = '#333';
                span.style.fontWeight = '600';

                // Even for the last element, ensure highlight stays correct
                span.onmouseover = () => { updateHighlight(el); };
                span.onmouseout = () => { updateHighlight(currentElement); };
            } else {
                span.style.color = '#afafafff';

                // Hover effect for non-active elements + mirror highlight
                span.onmouseover = () => {
                    span.style.color = '#333';
                    updateHighlight(el);
                };
                span.onmouseout = () => {
                    span.style.color = '#afafafff';
                    updateHighlight(currentElement);
                };
            }

            // Click handler
            span.onclick = (e) => {
                e.stopPropagation();
                selectElement(el);
            };

            layerBar.appendChild(span);

            if (!isLast) {
                const separator = document.createElement('span');
                separator.textContent = '/';
                separator.style.color = '#999';
                separator.style.margin = '0 6px';
                layerBar.appendChild(separator);
            }
        });

        layerBar.style.display = 'flex';

        // Scroll to end to show current element
        requestAnimationFrame(() => {
            layerBar.scrollLeft = layerBar.scrollWidth;
        });
    }

    // Parse color to hex
    function rgbToHex(rgb) {
        if (!rgb) return '#000000';
        if (rgb.startsWith('#')) return rgb;

        const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return rgb;

        const r = parseInt(match[1]).toString(16).padStart(2, '0');
        const g = parseInt(match[2]).toString(16).padStart(2, '0');
        const b = parseInt(match[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`.toUpperCase();
    }

    // Parse spacing values
    function parseSpacing(value) {
        if (!value || value === '0px') return null;
        const parts = value.split(' ').map(v => parseInt(v) || 0);
        if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
        if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
        if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
        if (parts.length === 4) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
        return null;
    }

    // Get computed styles
    function getComputedStyles(element) {
        return window.getComputedStyle(element);
    }

    // Get original CSS value (source of truth from stylesheet/class)
    function getOriginalCSSValue(element, property) {
        let foundValue = null;

        // Check inline styles first - these have highest priority
        const inlineValue = element.style.getPropertyValue(property);
        if (inlineValue) {
            return inlineValue;
        }

        // Check matched CSS rules from stylesheets
        try {
            const sheets = document.styleSheets;
            for (let i = 0; i < sheets.length; i++) {
                try {
                    const rules = sheets[i].cssRules || sheets[i].rules;
                    if (!rules) continue;

                    for (let j = 0; j < rules.length; j++) {
                        const rule = rules[j];
                        if (rule.style && rule.selectorText) {
                            try {
                                if (element.matches(rule.selectorText)) {
                                    const value = rule.style.getPropertyValue(property);
                                    if (value) {
                                        foundValue = value;
                                    }
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (e) {
            // Error accessing stylesheets
        }

        return foundValue;
    }

    // =========================================================================
    // 4. DOM CREATION - UI Element Factories
    // =========================================================================

    // Icons map
    const ICONS = {
        'Height': `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 14H0V13H14V14Z" fill="black" fill-opacity="0.8"/><path d="M14 1H0V0H14V1Z" fill="black" fill-opacity="0.8"/><path d="M7.00047 1.29235L9.85402 4.1459L9.14692 4.85301L7.50047 3.20656L7.50047 10.7923L9.14692 9.1459L9.85402 9.85301L7.00047 12.7066L4.14692 9.85301L4.85402 9.1459L6.50047 10.7923L6.50047 3.20656L4.85402 4.85301L4.14692 4.1459L7.00047 1.29235Z" fill="black" fill-opacity="0.8"/></svg>`,
        'Width': `<svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 13.9999L0.0564339 0L1.05643 0.00403099L0.999992 14.0039L0 13.9999Z" fill="black" fill-opacity="0.8"/><path d="M12.9999 14.0523L13.0563 0.0524029L14.0563 0.0564339L13.9999 14.0563L12.9999 14.0523Z" fill="black" fill-opacity="0.8"/><path d="M9.87077 9.89359L9.1666 9.18371L10.8197 7.54388L3.23383 7.5133L4.87366 9.16641L4.16379 9.87058L1.3218 7.00559L4.18679 4.1636L4.89097 4.87347L3.23786 6.51331L10.8237 6.54389L9.1839 4.89078L9.89378 4.1866L12.7358 7.0516L9.87077 9.89359Z" fill="black" fill-opacity="0.8"/></svg>`,
        'Font Size': `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.85995 12.4999L2.73795 10.0279H6.26595L7.14395 12.4999H8.25195L5.04795 3.77295H3.95695L0.751953 12.4999H1.85995ZM3.06995 9.08995L4.46795 5.15295H4.53595L5.93395 9.09095H3.06995V9.08995ZM13.726 7.52495H14.851C14.606 6.10795 13.395 5.12795 11.826 5.12795C9.94395 5.12795 8.56995 6.54495 8.56995 8.86795C8.56995 11.1679 9.90495 12.5989 11.876 12.5989C13.64 12.5989 14.901 11.4419 14.901 9.60595V8.77795H12.043V9.68395H13.839C13.815 10.8559 13.04 11.5979 11.876 11.5979C10.594 11.5979 9.65995 10.6279 9.65995 8.85995C9.65995 7.09895 10.6 6.12995 11.833 6.12995C12.799 6.12995 13.453 6.66195 13.726 7.52495Z" fill="black" fill-opacity="0.8"/></svg>`,
        'Margin': `<svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.35352 7.35449L1.70703 11.001H4V12.001H0V8.00098H1V10.2939L4.64648 6.64746L5.35352 7.35449ZM11 10.293V8H12V12H8V11H10.293L6.64648 7.35352L7.35352 6.64648L11 10.293ZM4.00098 1H1.70801L5.35449 4.64648L4.64746 5.35352L1.00098 1.70703V4H0.000976562V0H4.00098V1ZM12.001 4H11.001V1.70703L7.35449 5.35352L6.64746 4.64648L10.2939 1H8.00098V0H12.001V4Z" fill="black" fill-opacity="0.8"/></svg>`,
        'Padding': `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.35352 12.3535H4.35352V10.0605L0.707031 13.707L0 13L3.64648 9.35352H1.35352V8.35352H5.35352V12.3535ZM12.3535 9.35352H10.0605L13.707 13L13 13.707L9.35352 10.0605V12.3535H8.35352V8.35352H12.3535V9.35352ZM4.35352 3.64648V1.35352H5.35352V5.35352H1.35352V4.35352H3.64648L0 0.707031L0.707031 0L4.35352 3.64648ZM13.707 0.707031L10.0605 4.35352H12.3535V5.35352H8.35352V1.35352H9.35352V3.64648L13 0L13.707 0.707031Z" fill="black" fill-opacity="0.8"/></svg>`,
        'Font': `<svg width="14" height="14" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 12.5H14V16M20 12.5H26V16M20 12.5V27.5M20 27.5H23.5M20 27.5H16.5" stroke="black" stroke-opacity="0.8"/></svg>`,
        'default': `<svg width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M15.5 14.7929V10H16.5V14.7929L19.6464 11.6464L20.3536 12.3536L17.2071 15.5H22V16.5H17.2071L20.3536 19.6464L19.6464 20.3536L16.5 17.2071V22H15.5V17.2071L12.3536 20.3536L11.6464 19.6464L14.7929 16.5H10V15.5H14.7929L11.6464 12.3536L12.3536 11.6464L15.5 14.7929Z" fill="black" fill-opacity="0.8"/></svg>`
    };

    function getIcon(label) {
        return ICONS[label] || ICONS['default'];
    }

    // Shared compact row builder
    function createCompactRow(label, value, isColor = false, colorValue = '', isEditable = false, property = '') {
        const icon = getIcon(label);
        const labelWithIcon = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; opacity: 0.8;">
                    ${icon}
                </div>
                <span style="color: #999; font-size: 13px;">${label}:</span>
            </div>
        `;

        if (isEditable && isColor) {
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 0px;">
                    ${labelWithIcon}
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="editable-color" data-property="${property}" style="width: 16px; height: 16px; background: ${colorValue}; border: 1px solid #e5e5e5; border-radius: 2px; cursor: pointer;"></div>
                        <input type="text" class="editable-value" data-property="${property}" value="${value}" style="color: #333; font-size: 13px; font-weight: 500; border: none; background: transparent; width: 70px; cursor: pointer; text-align: right;" />
                    </div>
                </div>
            `;
        } else if (isEditable) {
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 0px;">
                    ${labelWithIcon}
                    <input type="text" class="editable-value" data-property="${property}" value="${value}" style="color: #333; font-size: 13px; font-weight: 500; border: none; background: transparent; width: 60px; cursor: pointer; text-align: right;" />
                </div>
            `;
        } else {
            // Special handling for Font row to support marquee
            if (label === 'Font') {
                return `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 0px; gap: 24px;">
                    ${labelWithIcon}
                    <div class="font-value-container" style="overflow: hidden; max-width: 140px; mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);">
                        <div class="font-value-wrapper" style="white-space: nowrap; color: #333; font-size: 13px; font-weight: 500;">
                            ${value}
                        </div>
                    </div>
                </div>
            `;
            }

            return `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 0px;">
                    ${labelWithIcon}
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${isColor ? `<div style="width: 16px; height: 16px; background: ${colorValue}; border: 1px solid #e5e5e5; border-radius: 2px;"></div>` : ''}
                        <span style="color: #333; font-size: 13px; font-weight: 500;">${value}</span>
                    </div>
                </div>
            `;
        }
    }

    // =========================================================================
    // 5. UI BUILDERS - Tooltip Content Generators
    // =========================================================================

    // Build Full Mode UI (compact style matching hover mode)
    function buildFigmaUI(element) {
        const computed = getComputedStyles(element);
        const rect = element.getBoundingClientRect();
        const elementName = tagNameToFriendlyName(element.tagName);

        // Get class name
        const className = element.className && typeof element.className === 'string' && element.className.trim()
            ? `.${element.className.split(' ').filter(c => c).join('.')}`
            : '';

        let html = `
            <div style="padding: 16px 20px; min-width: 200px; max-width: 320px;">
                <div style="font-size: 14px; font-weight: 500; color: #333; margin-bottom: 16px;">
                    ${elementName}${className ? ' <span style="color: #999;">' + className + '</span>' : ''}
                </div>
        `;

        // Width & Height with source of truth
        const originalHeight = getOriginalCSSValue(element, 'height');
        const heightDisplay = originalHeight && originalHeight !== 'auto' && originalHeight !== `${Math.round(rect.height)}px`
            ? `${Math.round(rect.height)}px (${originalHeight})`
            : `${Math.round(rect.height)}px`;

        const originalWidth = getOriginalCSSValue(element, 'width');
        const widthDisplay = originalWidth && originalWidth !== 'auto' && originalWidth !== `${Math.round(rect.width)}px`
            ? `${Math.round(rect.width)}px (${originalWidth})`
            : `${Math.round(rect.width)}px`;

        html += createCompactRow('Height', heightDisplay);
        html += createCompactRow('Width', widthDisplay);

        // Display & Position
        html += createCompactRow('Display', computed.display);
        html += createCompactRow('Position', computed.position);

        // Typography
        if (computed.fontSize) {
            const fontFamily = computed.fontFamily.split(',')[0].replace(/['\"]/g, '');
            html += createCompactRow('Font', fontFamily);
            html += createCompactRow('Font Size', computed.fontSize, false, '', true, 'font-size');
            html += createCompactRow('Font Weight', computed.fontWeight);

            // Text Color (editable)
            if (computed.color && computed.color !== 'rgba(0, 0, 0, 0)') {
                const hexColor = rgbToHex(computed.color);
                html += createCompactRow('Color', hexColor, true, computed.color, true, 'color');
            }
        }

        // Background Color
        if (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)') {
            const hexBg = rgbToHex(computed.backgroundColor);
            html += createCompactRow('Background', hexBg, true, computed.backgroundColor);
        }

        // Border (simplified)
        if (computed.borderWidth && computed.borderWidth !== '0px') {
            html += createCompactRow('Border', computed.borderWidth);
            if (computed.borderRadius && computed.borderRadius !== '0px') {
                html += createCompactRow('Radius', computed.borderRadius);
            }
        }

        // Padding & Margin (simplified)
        const padding = parseSpacing(computed.padding);
        if (padding && (padding.top || padding.right || padding.bottom || padding.left)) {
            const paddingStr = `${padding.top || 0} ${padding.right || 0} ${padding.bottom || 0} ${padding.left || 0} `;
            html += createCompactRow('Padding', paddingStr);
        }

        const margin = parseSpacing(computed.margin);
        if (margin && (margin.top || margin.right || margin.bottom || margin.left)) {
            const marginStr = `${margin.top || 0} ${margin.right || 0} ${margin.bottom || 0} ${margin.left || 0} `;
            html += createCompactRow('Margin', marginStr);
        }

        html += `</div > `;

        return html;
    }

    // Build Hover UI (Compact Mode)
    function buildHoverUI(element) {
        const computed = getComputedStyles(element);
        const rect = element.getBoundingClientRect();
        const elementName = tagNameToFriendlyName(element.tagName);

        // Get class name
        const className = element.className && typeof element.className === 'string' && element.className.trim()
            ? `.${element.className.split(' ').filter(c => c).join('.')} `
            : '';

        let html = `
            <div style="padding: 16px 20px; min-width: 200px; max-width: 320px;">
                <div style="font-size: 14px; font-weight: 500; color: #333; margin-bottom: 12px;">
                    ${elementName}${className ? ' <span style="color: #999;">' + className + '</span>' : ''}
                </div>
        `;

        // Height & Width with source of truth
        const originalHeight = getOriginalCSSValue(element, 'height');
        const heightDisplay = originalHeight && originalHeight !== 'auto' && originalHeight !== `${Math.round(rect.height)}px`
            ? `${Math.round(rect.height)}px (${originalHeight})`
            : `${Math.round(rect.height)}px`;

        const originalWidth = getOriginalCSSValue(element, 'width');
        const widthDisplay = originalWidth && originalWidth !== 'auto' && originalWidth !== `${Math.round(rect.width)}px`
            ? `${Math.round(rect.width)}px (${originalWidth})`
            : `${Math.round(rect.width)}px`;

        html += createCompactRow('Height', heightDisplay);
        html += createCompactRow('Width', widthDisplay);

        // Color (Text or Background)
        if (computed.color && computed.color !== 'rgba(0, 0, 0, 0)') {
            html += createCompactRow('Color', rgbToHex(computed.color), true, computed.color);
        } else if (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)') {
            html += createCompactRow('Color', rgbToHex(computed.backgroundColor), true, computed.backgroundColor);
        }

        // Font Info
        if (computed.fontSize) {
            const fontFamily = computed.fontFamily.split(',')[0].replace(/['"]/g, '');
            html += createCompactRow('Font', fontFamily);
            html += createCompactRow('Font Size', computed.fontSize);
        }

        // Close main container
        html += `</div>`;

        return html;
    }

    // Update tooltip content and position
    function updateTooltip(element, mouseX, mouseY, pinned = false) {
        if (!tooltip) return;

        // Get close button reference before clearing innerHTML
        const closeBtn = tooltip.querySelector('#style-inspector-close');

        // Generate content based on mode
        let contentDiv = document.createElement('div');

        if (pinned) {
            // Full Mode
            contentDiv.innerHTML = buildFigmaUI(element);
            tooltip.style.width = '280px';
            tooltip.style.padding = '0';
        } else {
            // Hover Mode
            contentDiv.innerHTML = buildHoverUI(element);
            tooltip.style.width = 'auto'; // Let it fit content
            tooltip.style.padding = '0';
        }

        tooltip.innerHTML = '';
        if (closeBtn) tooltip.appendChild(closeBtn);
        tooltip.appendChild(contentDiv);
        tooltip.style.display = 'block';

        // Handle Font Marquee
        const fontContainer = tooltip.querySelector('.font-value-container');
        const fontWrapper = tooltip.querySelector('.font-value-wrapper');

        if (fontContainer && fontWrapper) {
            // Check if content overflows
            if (fontWrapper.scrollWidth > fontContainer.clientWidth) {
                const text = fontWrapper.textContent.trim();
                // Duplicate content for smooth marquee
                fontWrapper.innerHTML = `<span>${text}</span><span>${text}</span>`;
                fontWrapper.classList.add('marquee-content');
            } else {
                // Ensure text is aligned right if not overflowing
                fontWrapper.style.textAlign = 'right';
                fontWrapper.style.width = '100%';
            }
        }

        // Handle editable values in Full Mode
        if (pinned) {
            const editableInputs = tooltip.querySelectorAll('.editable-value');
            editableInputs.forEach(input => {
                input.onfocus = () => {
                    input.select();
                };

                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        input.blur();
                    }
                };

                input.onblur = () => {
                    const property = input.getAttribute('data-property');
                    const value = input.value;

                    // Apply the style change
                    element.style.setProperty(property, value);

                    // Update the tooltip to reflect changes
                    updateTooltip(element, 0, 0, true);
                };
            });

            // Handle color picker clicks
            const colorSwatches = tooltip.querySelectorAll('.editable-color');
            colorSwatches.forEach(swatch => {
                swatch.onclick = () => {
                    const property = swatch.getAttribute('data-property');
                    const input = document.createElement('input');
                    input.type = 'color';
                    input.value = rgbToHex(getComputedStyles(element)[property]);
                    input.style.position = 'absolute';
                    input.style.opacity = '0';
                    input.style.pointerEvents = 'none';
                    document.body.appendChild(input);

                    input.onchange = () => {
                        element.style.setProperty(property, input.value);
                        updateTooltip(element, 0, 0, true);
                        document.body.removeChild(input);
                    };

                    input.click();
                };
            });
        }

        // If pinned, enable pointer events and show close button
        if (pinned) {
            tooltip.style.pointerEvents = 'auto';
            if (closeBtn) closeBtn.style.display = 'flex';
        } else {
            // For hover mode, enable pointer events so "more..." link is clickable
            tooltip.style.pointerEvents = 'auto';
            if (closeBtn) closeBtn.style.display = 'none';
        }

        // Position tooltip relative to element with smart positioning
        // Check all 4 sides and pick the best one
        const rect = element.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        const GAP = 16; // Gap between element and tooltip

        // Calculate potential positions for all 4 sides
        const positions = {
            right: {
                left: rect.right + window.scrollX + GAP,
                top: rect.top + window.scrollY,
                side: 'right'
            },
            left: {
                left: rect.left + window.scrollX - tooltipRect.width - GAP,
                top: rect.top + window.scrollY,
                side: 'left'
            },
            bottom: {
                left: rect.left + window.scrollX,
                top: rect.bottom + window.scrollY + GAP,
                side: 'bottom'
            },
            top: {
                left: rect.left + window.scrollX,
                top: rect.top + window.scrollY - tooltipRect.height - GAP,
                side: 'top'
            }
        };

        // Function to check if position fits in viewport
        const fitsInViewport = (pos) => {
            const wouldBeLeft = pos.left;
            const wouldBeTop = pos.top;
            const wouldBeRight = wouldBeLeft + tooltipRect.width;
            const wouldBeBottom = wouldBeTop + tooltipRect.height;

            return wouldBeLeft >= window.scrollX &&
                wouldBeRight <= window.innerWidth + window.scrollX &&
                wouldBeTop >= window.scrollY &&
                wouldBeBottom <= window.innerHeight + window.scrollY;
        };

        // Function to calculate available space for a position
        const getAvailableSpace = (pos) => {
            const wouldBeLeft = pos.left;
            const wouldBeTop = pos.top;
            const wouldBeRight = wouldBeLeft + tooltipRect.width;
            const wouldBeBottom = wouldBeTop + tooltipRect.height;

            // Calculate how much space is available (negative = overflow)
            const spaceRight = (window.innerWidth + window.scrollX) - wouldBeRight;
            const spaceLeft = wouldBeLeft - window.scrollX;
            const spaceBottom = (window.innerHeight + window.scrollY) - wouldBeBottom;
            const spaceTop = wouldBeTop - window.scrollY;

            // Return minimum space (the constraining dimension)
            return Math.min(spaceRight, spaceLeft, spaceBottom, spaceTop);
        };

        // Try to use the same side as last time if it still fits
        let chosenPosition = null;

        if (lastTooltipPosition.side && positions[lastTooltipPosition.side]) {
            const sameAsLast = positions[lastTooltipPosition.side];
            if (fitsInViewport(sameAsLast)) {
                chosenPosition = sameAsLast;
            }
        }

        // If same side doesn't work, try all sides in priority order
        if (!chosenPosition) {
            const priorityOrder = ['right', 'left', 'bottom', 'top'];

            for (const side of priorityOrder) {
                if (fitsInViewport(positions[side])) {
                    chosenPosition = positions[side];
                    break;
                }
            }
        }

        // If nothing fits perfectly, pick the side with most available space
        if (!chosenPosition) {
            let bestSide = 'right';
            let bestSpace = getAvailableSpace(positions['right']);

            for (const side of ['left', 'bottom', 'top']) {
                const space = getAvailableSpace(positions[side]);
                if (space > bestSpace) {
                    bestSpace = space;
                    bestSide = side;
                }
            }

            chosenPosition = positions[bestSide];
        }

        // Final adjustments to ensure it's within viewport bounds
        let finalLeft = chosenPosition.left;
        let finalTop = chosenPosition.top;

        // Constrain horizontally
        if (finalLeft + tooltipRect.width > window.innerWidth + window.scrollX) {
            finalLeft = window.innerWidth + window.scrollX - tooltipRect.width - 16;
        }
        if (finalLeft < window.scrollX) {
            finalLeft = window.scrollX + 16;
        }

        // Constrain vertically
        if (finalTop + tooltipRect.height > window.innerHeight + window.scrollY) {
            finalTop = window.innerHeight + window.scrollY - tooltipRect.height - 16;
        }
        if (finalTop < window.scrollY) {
            finalTop = window.scrollY + 16;
        }

        // Apply position with smooth transition
        tooltip.style.left = finalLeft + 'px';
        tooltip.style.top = finalTop + 'px';

        // Remember this position
        lastTooltipPosition = { left: finalLeft, top: finalTop, side: chosenPosition.side };
    }


    // Update highlight overlay
    function updateHighlight(element) {
        if (!highlightOverlay || !isActive) return;

        const rect = element.getBoundingClientRect();
        highlightOverlay.style.display = 'block';
        highlightOverlay.style.left = (rect.left + window.scrollX) + 'px';
        highlightOverlay.style.top = (rect.top + window.scrollY) + 'px';
        highlightOverlay.style.width = rect.width + 'px';
        highlightOverlay.style.height = rect.height + 'px';

        // Update label
        const label = highlightOverlay.querySelector('#style-inspector-label');
        if (label) {
            const friendlyName = tagNameToFriendlyName(element.tagName);

            // Get class name (handle SVG animated string)
            let className = '';
            if (element.classList && element.classList.length > 0) {
                className = '.' + Array.from(element.classList).join('.');
            }

            // Truncate classes if too long
            const maxClassLen = 30;
            const displayClasses = className.length > maxClassLen ? className.substring(0, maxClassLen) + '...' : className;

            label.innerHTML = `<span style="opacity: 0.9">${friendlyName}</span><span style="opacity: 0.6; font-weight: 400">${displayClasses}</span>`;

            // Adjust label position if it goes off screen top
            if (rect.top < 30) {
                label.style.bottom = 'auto';
                label.style.top = '100%';
                label.style.borderRadius = '0 0 4px 4px';
            } else {
                label.style.bottom = '100%';
                label.style.top = 'auto';
                label.style.borderRadius = '4px 4px 0 0';
            }
        }
    }

    // =========================================================================
    // 7. EVENT HANDLERS
    // =========================================================================


    // Draw measurement lines between two elements
    function updateMeasurements(sourceEl, targetEl) {
        if (!measurementOverlay || !isActive) return;

        // Prevent re-rendering if elements haven't changed (fixes flickering animation)
        if (sourceEl === lastMeasuredSource && targetEl === lastMeasuredTarget) {
            return;
        }

        lastMeasuredSource = sourceEl;
        lastMeasuredTarget = targetEl;

        measurementOverlay.innerHTML = '';
        measurementOverlay.style.display = 'block';

        const sRect = sourceEl.getBoundingClientRect();
        const tRect = targetEl.getBoundingClientRect();

        const scrollX = window.scrollX;
        const scrollY = window.scrollY;

        const s = {
            top: sRect.top + scrollY,
            bottom: sRect.bottom + scrollY,
            left: sRect.left + scrollX,
            right: sRect.right + scrollX,
            width: sRect.width,
            height: sRect.height,
            centerX: sRect.left + scrollX + sRect.width / 2,
            centerY: sRect.top + scrollY + sRect.height / 2
        };

        const t = {
            top: tRect.top + scrollY,
            bottom: tRect.bottom + scrollY,
            left: tRect.left + scrollX,
            right: tRect.right + scrollX,
            width: tRect.width,
            height: tRect.height,
            centerX: tRect.left + scrollX + tRect.width / 2,
            centerY: tRect.top + scrollY + tRect.height / 2
        };

        const COLOR = '#cf56e6';

        // Helper to create line
        function createLine(x, y, w, h, isDashed = false) {
            const line = document.createElement('div');
            line.className = 'measurement-line';
            line.style.cssText = `
                position: absolute;
                left: ${Math.round(x)}px;
                top: ${Math.round(y)}px;
                width: ${w}px;
                height: ${h}px;
                background: ${isDashed ? 'transparent' : COLOR};
                border-left: ${isDashed && w === 1 ? `1px dashed ${COLOR}` : 'none'};
                border-top: ${isDashed && h === 1 ? `1px dashed ${COLOR}` : 'none'};
                opacity: 0.9;
            `;
            measurementOverlay.appendChild(line);
        }

        // Helper to create label
        function createLabel(text, x, y) {
            const label = document.createElement('div');
            label.className = 'measurement-label';
            label.textContent = Math.round(text);
            label.style.cssText = `
                position: absolute;
                left: ${Math.round(x)}px;
                top: ${Math.round(y)}px;
                transform: translate(-50%, -50%);
                background: rgba(207, 86, 230, 0.95);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                color: white;
                font-size: 10px;
                font-weight: 600;
                font-family: system-ui, -apple-system, sans-serif;
                padding: 4px 8px;
                min-width: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                line-height: 1;
                text-align: center;
                border-radius: 10px;
                z-index: 10;
                box-shadow: 0 2px 8px rgba(207, 86, 230, 0.4), 0 1px 3px rgba(0,0,0,0.2);
            `;
            measurementOverlay.appendChild(label);
        }


        // --- Logic to determine relationships ---

        // Vertical relationship (one is strictly above the other)
        const isAbove = s.bottom < t.top;
        const isBelow = s.top > t.bottom;
        const isLeft = s.right < t.left;
        const isRight = s.left > t.right;

        // Overlaps
        const overlapsX = s.right > t.left && s.left < t.right;
        const overlapsY = s.bottom > t.top && s.top < t.bottom;

        // Inside detection
        const sInsideT = s.top >= t.top && s.bottom <= t.bottom && s.left >= t.left && s.right <= t.right;
        const tInsideS = t.top >= s.top && t.bottom <= s.bottom && t.left >= s.left && t.right <= s.right;
        const isInside = sInsideT || tInsideS;

        if (isInside) {
            // Measure distance to edges (Padding-like)
            const outer = sInsideT ? t : s;
            const inner = sInsideT ? s : t;

            // Top
            createLine(inner.centerX, outer.top, 1, inner.top - outer.top); // Line
            createLabel(inner.top - outer.top, inner.centerX, outer.top + (inner.top - outer.top) / 2);

            // Bottom
            createLine(inner.centerX, inner.bottom, 1, outer.bottom - inner.bottom);
            createLabel(outer.bottom - inner.bottom, inner.centerX, inner.bottom + (outer.bottom - inner.bottom) / 2);

            // Left
            createLine(outer.left, inner.centerY, inner.left - outer.left, 1);
            createLabel(inner.left - outer.left, outer.left + (inner.left - outer.left) / 2, inner.centerY);

            // Right
            createLine(inner.right, inner.centerY, outer.right - inner.right, 1);
            createLabel(outer.right - inner.right, inner.right + (outer.right - inner.right) / 2, inner.centerY);

            return;
        }

        // Standard Spacing (Margin-like)

        if (isAbove && overlapsX) {
            // Source is above Target
            // Draw line from source bottom to target top
            const dist = t.top - s.bottom;
            // Find shared X center or clamp to overlap
            const overlapLeft = Math.max(s.left, t.left);
            const overlapRight = Math.min(s.right, t.right);
            const x = overlapLeft + (overlapRight - overlapLeft) / 2;

            createLine(x, s.bottom, 1, dist);
            createLabel(dist, x, s.bottom + dist / 2);

            // Dashed guidelines
            createLine(overlapLeft, s.bottom, overlapRight - overlapLeft, 1, true); // at source
            createLine(overlapLeft, t.top, overlapRight - overlapLeft, 1, true); // at target
        }
        else if (isBelow && overlapsX) {
            // Source is below Target
            const dist = s.top - t.bottom;
            const overlapLeft = Math.max(s.left, t.left);
            const overlapRight = Math.min(s.right, t.right);
            const x = overlapLeft + (overlapRight - overlapLeft) / 2;

            createLine(x, t.bottom, 1, dist);
            createLabel(dist, x, t.bottom + dist / 2);

            createLine(overlapLeft, t.bottom, overlapRight - overlapLeft, 1, true);
            createLine(overlapLeft, s.top, overlapRight - overlapLeft, 1, true);
        }

        if (isLeft && overlapsY) {
            // Source is Left of Target
            const dist = t.left - s.right;
            const overlapTop = Math.max(s.top, t.top);
            const overlapBottom = Math.min(s.bottom, t.bottom);
            const y = overlapTop + (overlapBottom - overlapTop) / 2;

            createLine(s.right, y, dist, 1);
            createLabel(dist, s.right + dist / 2, y);

            createLine(s.right, overlapTop, 1, overlapBottom - overlapTop, true);
            createLine(t.left, overlapTop, 1, overlapBottom - overlapTop, true);
        }
        else if (isRight && overlapsY) {
            // Source is Right of Target
            const dist = s.left - t.right;
            const overlapTop = Math.max(s.top, t.top);
            const overlapBottom = Math.min(s.bottom, t.bottom);
            const y = overlapTop + (overlapBottom - overlapTop) / 2;

            createLine(t.right, y, dist, 1);
            createLabel(dist, t.right + dist / 2, y);

            createLine(t.right, overlapTop, 1, overlapBottom - overlapTop, true);
            createLine(s.left, overlapTop, 1, overlapBottom - overlapTop, true);
        }
    }

    // Mouse move handler
    function handleMouseMove(e) {
        const playground = document.getElementById('playground');

        // Auto-enable/disable based on playground hover
        if (playground) {
            // Check if mouse is inside playground OR inside any inspector UI
            const isInsidePlayground = playground.contains(e.target) || e.target === playground;

            // Check if inside inspector UI (to prevent flickering when hovering UI elements)
            const isInsideUI = (tooltip && tooltip.contains(e.target)) ||
                (layerBar && layerBar.contains(e.target)) ||
                (skimButton && skimButton.contains(e.target)) ||
                (skimModal && skimModal.contains(e.target)) ||
                e.target.closest('#style-inspector-skim-wrapper');

            if (isInsidePlayground || isInsideUI) {
                if (!isActive) enableInspector();
            } else {
                if (isActive && !isPinned) disableInspector(); // Only disable if not pinned? Or just disable.
                // Assuming strict "active if cursor on playground" means we disable if it leaves.
                if (isActive && !isPinned) disableInspector();
            }
        }

        if (!isActive) return;

        // Cancel any pending RAF to avoid stacking
        if (measurementRAFId) {
            cancelAnimationFrame(measurementRAFId);
            measurementRAFId = null;
        }

        // Use RAF for smoother performance
        measurementRAFId = requestAnimationFrame(() => {
            processMouseMove(e);
        });
    }

    // Actual mouse move processing (called via RAF)
    function processMouseMove(e) {
        if (!isActive) return;

        const element = e.target;

        // Ignore inspector UI elements
        if (element === tooltip || (tooltip && tooltip.contains(element))) return;
        if (element === highlightOverlay) return;
        if (element === layerBar || (layerBar && layerBar.contains(element))) return;
        if (element.closest('#style-inspector-skim-wrapper')) return;
        if (element.closest('#style-inspector-measurement')) return;

        // Handle pinned mode measurements
        if (isPinned) {
            if (element !== pinnedElement && element !== document.body && element !== document.documentElement) {
                // Show measurements between pinned element and hovered element
                updateMeasurements(pinnedElement, element);
            } else {
                if (measurementOverlay) measurementOverlay.style.display = 'none';
            }
            return;
        }

        if (currentMode !== 'inspect') return; // Only inspect in inspect mode

        currentElement = element;
        updateTooltip(element, e.clientX, e.clientY, false);
        updateHighlight(element);
        updateLayerBar(element);

        // Hide measurements in normal hover mode
        if (measurementOverlay) measurementOverlay.style.display = 'none';
    }



    // Click handler to pin tooltip
    function handleClick(e) {
        if (!isActive) return;

        // Prevent link navigation when inspector is active
        if (e.target.tagName === 'A' || e.target.closest('a')) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (currentMode === 'edit') {
            const editableElement = findEditableElement(e.target);

            // Only proceed if we found an editable text element
            if (!editableElement) return;

            // Ignore inspector UI
            if (editableElement.closest('#style-inspector-skim-wrapper')) return;

            // Edit Mode Click
            e.preventDefault();
            e.stopPropagation();
            handleDoubleClick(e); // Reuse double click logic for single click in edit mode
            return;
        }

        if (currentMode !== 'inspect') return; // Disable pinning in other modes

        const element = e.target;
        if (element === tooltip || tooltip.contains(element)) return;
        if (element === highlightOverlay) return;
        if (element === layerBar || (layerBar && layerBar.contains(element))) return;
        if (element.closest('#style-inspector-skim-wrapper')) return; // Ignore skim UI

        // Pin the tooltip
        isPinned = true;
        pinnedElement = element;
        currentElement = element;

        updateTooltip(element, e.clientX, e.clientY, true);
        updateHighlight(element);
        updateLayerBar(element);

        // Make highlight persistent
        if (highlightOverlay) {
            highlightOverlay.style.pointerEvents = 'none';
        }
    }

    // Unpin tooltip - switch back to hover mode while maintaining highlight
    function unpinTooltip() {
        if (!isPinned) return;

        const lastElement = pinnedElement || currentElement;
        isPinned = false;
        pinnedElement = null;

        if (measurementOverlay) measurementOverlay.style.display = 'none';

        if (tooltip) {
            tooltip.style.pointerEvents = 'none';
            const closeBtn = tooltip.querySelector('#style-inspector-close');
            if (closeBtn) closeBtn.style.display = 'none';

            // Switch to hover mode tooltip if we have an element
            if (lastElement && isActive && currentMode === 'inspect') {
                const rect = lastElement.getBoundingClientRect();
                updateTooltip(lastElement, rect.left + rect.width / 2, rect.top + rect.height / 2, false);
                updateHighlight(lastElement);
                updateLayerBar(lastElement);
            }
        }
    }

    // =========================================================================
    // 8. MODE MANAGEMENT
    // =========================================================================

    // Enable inspector
    function enableInspector() {
        if (isActive) return;
        isActive = true;

        // console.log('🔍 Style Inspector: ENABLED');
        if (!tooltip) tooltip = createTooltip();
        if (!highlightOverlay) highlightOverlay = createHighlightOverlay();
        if (!measurementOverlay) measurementOverlay = createMeasurementOverlay();
        if (!layerBar) layerBar = createLayerBar();
        if (!skimButton) skimButton = createSkimButton();
        else skimButton.style.display = 'flex';

        window.addEventListener('scroll', throttleSkimUpdate);
        window.addEventListener('resize', throttleSkimUpdate);
    }

    // Disable inspector
    function disableInspector() {
        if (!isActive) return;
        isActive = false;

        // console.log('🔍 Style Inspector: DISABLED');
        unpinTooltip();
        if (tooltip) tooltip.style.display = 'none';
        if (highlightOverlay) highlightOverlay.style.display = 'none';
        if (measurementOverlay) measurementOverlay.style.display = 'none';
        if (layerBar) layerBar.style.display = 'none';
        if (skimButton) skimButton.style.display = 'none';
        if (skimModal) skimModal.style.display = 'none';
        if (skimLabelsContainer) { skimLabelsContainer.remove(); skimLabelsContainer = null; }
        skimProperties.clear();

        window.removeEventListener('scroll', throttleSkimUpdate);
        window.removeEventListener('resize', throttleSkimUpdate);
    }

    // Toggle inspector
    function toggleInspector() {
        if (isActive) disableInspector();
        else enableInspector();
    }

    // Double click handler to edit text

    // Helper to determine if an element should be editable in Edit Mode
    function isEditableTextElement(el) {
        // Skip inspector UI
        if (el.id && el.id.startsWith('style-inspector')) return false;
        if (el.closest('#style-inspector-skim-wrapper')) return false;

        const tagName = el.tagName.toLowerCase();

        // Explicit text elements
        const textTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'li', 'label', 'button', 'td', 'th', 'blockquote', 'figcaption']);
        if (textTags.has(tagName)) return true;

        // Div or section - only if it contains direct text content
        if (tagName === 'div' || tagName === 'section' || tagName === 'article' || tagName === 'aside') {
            // Check if it has direct text nodes (not just children with text)
            for (let i = 0; i < el.childNodes.length; i++) {
                const node = el.childNodes[i];
                if (node.nodeType === 3 && node.textContent.trim().length > 0) {
                    return true; // Has direct text content
                }
            }
        }

        return false;
    }

    // Find the best text element to edit (walk up the tree if needed)
    function findEditableElement(target) {
        let current = target;
        let depth = 0;
        const maxDepth = 5; // Don't go too far up

        while (current && current !== document.body && depth < maxDepth) {
            if (isEditableTextElement(current)) {
                return current;
            }
            current = current.parentElement;
            depth++;
        }

        return null;
    }

    function handleDoubleClick(e) {
        if (!isActive) return;

        // Skip inspector UI elements - they should not be editable
        if (e.target.closest('#style-inspector-tooltip')) return;
        if (e.target.closest('#style-inspector-highlight')) return;
        if (e.target.closest('#style-inspector-layer-bar')) return;
        if (e.target.closest('#style-inspector-skim-wrapper')) return;
        if (e.target.closest('#skim-labels-container')) return;
        if (e.target.id && (e.target.id.startsWith('style-inspector') || e.target.id.startsWith('skim-'))) return;

        const element = findEditableElement(e.target);

        if (!element) return; // Not a text element

        // If in inspect or skim mode, switch to edit mode first
        if (currentMode === 'inspect' || currentMode === 'skim') {
            setMode('edit');
        }

        // Only allow editing in edit mode
        if (currentMode !== 'edit') return;

        // If already editing another element, save and restore it first
        if (activelyEditingElement && activelyEditingElement !== element) {
            activelyEditingElement.contentEditable = 'false';
            activelyEditingElement.style.outline = '';
            activelyEditingElement.style.outlineOffset = '';
            activelyEditingElement.style.cursor = '';
            activelyEditingElement.style.userSelect = '';
        }

        // Prevent editing if already editing this element
        if (element.contentEditable === 'true') return;

        activelyEditingElement = element;
        element.contentEditable = 'true';
        element.style.outline = '2px solid #0d99ff';
        element.style.outlineOffset = '2px';
        element.style.cursor = 'text';
        element.style.userSelect = 'text';
        element.focus();

        // Select all text
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        const cleanup = () => {
            element.contentEditable = 'false';
            element.style.outline = '';
            element.style.outlineOffset = '';
            element.style.cursor = '';
            element.style.userSelect = '';
            activelyEditingElement = null;
        };

        const saveOnBlur = () => {
            cleanup();
            element.removeEventListener('blur', saveOnBlur);
            element.removeEventListener('keydown', handleKey);
        };

        const handleKey = (evt) => {
            if (evt.key === 'Escape') {
                evt.preventDefault();
                cleanup();
                element.removeEventListener('blur', saveOnBlur);
                element.removeEventListener('keydown', handleKey);
            } else if (evt.key === 'Enter' && !evt.shiftKey) {
                // For single-line elements, save on Enter
                const singleLineTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'label']);
                if (singleLineTags.has(element.tagName.toLowerCase())) {
                    evt.preventDefault();
                    element.blur();
                }
            }
        };

        element.addEventListener('blur', saveOnBlur);
        element.addEventListener('keydown', handleKey);
    }

    // Keyboard handler
    function handleKeyPress(e) {
        // ESC to close pinned tooltip
        if (e.key === 'Escape' && isPinned) {
            e.preventDefault();
            unpinTooltip();
            return;
        }

        // ESC in edit mode (when not actively editing) - switch back to inspect mode
        if (e.key === 'Escape' && currentMode === 'edit' && !activelyEditingElement) {
            e.preventDefault();
            setMode('inspect');
            return;
        }

        // Arrow key navigation when inspector is active (disabled when editing)
        if (isActive && currentElement && !activelyEditingElement && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();

            let newElement = null;

            if (e.key === 'ArrowUp') {
                // Navigate to parent - but not above body
                if (currentElement === document.body) {
                    return; // Don't navigate above body
                }
                newElement = currentElement.parentElement;
            } else if (e.key === 'ArrowDown') {
                // Navigate to first child
                newElement = currentElement.children[0];
            } else if (e.key === 'ArrowLeft') {
                // Navigate to previous sibling
                newElement = currentElement.previousElementSibling;
            } else if (e.key === 'ArrowRight') {
                // Navigate to next sibling
                newElement = currentElement.nextElementSibling;
            }

            if (newElement && newElement !== tooltip && newElement !== highlightOverlay && newElement !== layerBar) {
                selectElement(newElement);
            }

            return;
        }

        // Skip if in input fields
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
            return;
        }

        // Only track letter keys
        if (e.key.length === 1 && e.key.match(/[a-z]/i)) {
            typedChars += e.key.toLowerCase();

            // Keep only last 4 characters
            if (typedChars.length > 4) {
                typedChars = typedChars.slice(-4);
            }

            // Check if "test" was typed
            if (typedChars === 'flow') {
                e.preventDefault();
                toggleInspector();
                typedChars = ''; // Reset
            }

            // Clear typed chars after 1 second of no typing
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                typedChars = '';
            }, 1000);
        }
    }

    // =========================================================================
    // 9. INITIALIZATION
    // =========================================================================

    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('dblclick', handleDoubleClick, true);


    // Shake detection for mobile devices
    let lastShakeTime = 0;
    let shakeCount = 0;
    const SHAKE_THRESHOLD = 15; // Acceleration threshold
    const SHAKE_TIMEOUT = 1000; // Time window for shake count
    const SHAKES_REQUIRED = 3; // Number of shakes required to toggle

    function handleShake(event) {
        const acceleration = event.accelerationIncludingGravity;
        if (!acceleration) return;

        const { x, y, z } = acceleration;
        const totalAcceleration = Math.sqrt(x * x + y * y + z * z);

        // Detect significant movement
        if (totalAcceleration > SHAKE_THRESHOLD) {
            const now = Date.now();

            // Reset shake count if too much time has passed
            if (now - lastShakeTime > SHAKE_TIMEOUT) {
                shakeCount = 0;
            }

            // Only count if enough time between shakes (debounce)
            if (now - lastShakeTime > 100) {
                shakeCount++;
                lastShakeTime = now;

                // Toggle inspector after required shakes
                if (shakeCount >= SHAKES_REQUIRED) {
                    toggleInspector();
                    shakeCount = 0;
                }
            }
        }
    }

    // Request permission for motion events on iOS 13+
    function requestMotionPermission() {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('devicemotion', handleShake);
                        console.log('🔍 Shake detection enabled!');
                    }
                })
                .catch(console.error);
        } else if ('DeviceMotionEvent' in window) {
            // Non-iOS devices
            window.addEventListener('devicemotion', handleShake);
            console.log('🔍 Shake detection enabled!');
        }
    }

    // 3-finger tap detection (works without any permission on iOS!)
    let multiTouchTimer = null;
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 3) {
            // Start timer on 3-finger touch
            multiTouchTimer = setTimeout(() => {
                multiTouchTimer = null;
            }, 300);
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        // If 3 fingers were lifted quickly (within 300ms), toggle inspector
        if (multiTouchTimer !== null && e.touches.length === 0) {
            clearTimeout(multiTouchTimer);
            multiTouchTimer = null;
            toggleInspector();
        }
    }, { passive: true });

    // Auto-enable on non-iOS devices, use touch to request on iOS
    if (typeof DeviceMotionEvent !== 'undefined') {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            // iOS 13+ requires user gesture to request permission
            document.addEventListener('touchend', function enableShake() {
                requestMotionPermission();
                document.removeEventListener('touchend', enableShake);
            }, { once: true });
            console.log('🔍 Style Inspector loaded! Type "test", 3-finger tap, or shake to toggle.');
        } else {
            requestMotionPermission();
            console.log('🔍 Style Inspector loaded! Type "test", 3-finger tap, or shake to toggle.');
        }
    } else {
        console.log('🔍 Style Inspector loaded! Type "test" to toggle.');
    }

    // -------------------------------------------------------------------------
    // SKIM MODE
    // -------------------------------------------------------------------------

    const SKIM_OPTIONS = [
        { id: 'fontSize', label: 'Font Size', short: 'FS', type: 'computed', prop: 'fontSize', isText: true },
        { id: 'color', label: 'Font Color', short: 'FC', type: 'computed', prop: 'color', isText: true },
        { id: 'width', label: 'Width', short: 'W', type: 'rect', prop: 'width', isText: false },
        { id: 'height', label: 'Height', short: 'H', type: 'rect', prop: 'height', isText: false },
        { id: 'backgroundColor', label: 'Background', short: 'BG', type: 'computed', prop: 'backgroundColor', isText: false },
        { id: 'padding', label: 'Padding', short: 'P', type: 'computed', prop: 'padding', isText: false },
        { id: 'margin', label: 'Margin', short: 'M', type: 'computed', prop: 'margin', isText: false }
    ];

    function createSkimButton() {
        // Wrapper Container (Above Layer Bar - Bottom Center)
        const wrapper = document.createElement('div');
        wrapper.id = 'style-inspector-skim-wrapper';
        wrapper.style.cssText = `
            position: fixed; bottom: 64px; left: 50%; transform: translateX(-50%);
            z-index: 1000000; font-family: system-ui, -apple-system, sans-serif;
            display: flex; align-items: center; flex-direction: column; gap: 0;
        `;

        // Skim Options Panel (slides out from bar)
        const skimOptionsPanel = document.createElement('div');
        skimOptionsPanel.id = 'skim-options-panel';
        skimOptionsPanel.style.cssText = `
            background: #000000; padding: 12px 16px; border-radius: 12px;
            display: flex; flex-direction: column; gap: 8px;
            max-height: 0; overflow-y: auto; overflow-x: hidden; opacity: 0;
            transition: max-height 0.3s ease, opacity 0.2s ease, padding 0.3s ease, margin 0.3s ease;
            pointer-events: none; margin-bottom: 0;
        `;

        // Add header
        const header = document.createElement('div');
        header.textContent = 'Select Properties (Max 3)';
        header.style.cssText = `
            font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
            color: rgba(255,255,255,0.5); font-weight: 600; margin-bottom: 4px;
        `;
        skimOptionsPanel.appendChild(header);

        // Add checkboxes
        SKIM_OPTIONS.forEach(opt => {
            const row = document.createElement('label');
            row.style.cssText = `
                display: flex; align-items: center; gap: 10px;
                cursor: pointer; font-size: 13px; color: rgba(255,255,255,0.8);
                padding: 4px 0; transition: color 0.15s;
            `;
            row.onmouseenter = () => row.style.color = '#fff';
            row.onmouseleave = () => row.style.color = 'rgba(255,255,255,0.8)';

            const checkbox = document.createElement('div');
            checkbox.style.cssText = `
                width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.4);
                border-radius: 4px; display: flex; align-items: center; justify-content: center;
                transition: all 0.15s; flex-shrink: 0;
            `;

            const checkmark = document.createElement('div');
            checkmark.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            checkmark.style.cssText = `opacity: 0; transition: opacity 0.15s;`;
            checkbox.appendChild(checkmark);

            const updateCheckboxState = () => {
                const isChecked = skimProperties.has(opt.id);
                checkbox.style.background = isChecked ? '#0d99ff' : 'transparent';
                checkbox.style.borderColor = isChecked ? '#0d99ff' : 'rgba(255,255,255,0.4)';
                checkmark.style.opacity = isChecked ? '1' : '0';
            };
            updateCheckboxState();

            const text = document.createElement('span');
            text.textContent = opt.label;

            row.onclick = (e) => {
                e.preventDefault();
                if (skimProperties.has(opt.id)) {
                    skimProperties.delete(opt.id);
                } else {
                    if (skimProperties.size >= 3) return; // Max 3
                    skimProperties.add(opt.id);
                }
                updateCheckboxState();
                updateSkimLabels();
                updateLayerBarForMode('skim'); // Update layer bar status
                // Update all checkboxes in panel
                skimOptionsPanel.querySelectorAll('label').forEach((lbl, i) => {
                    const cb = lbl.querySelector('div');
                    const cm = cb?.querySelector('div');
                    if (cb && cm) {
                        const isChecked = skimProperties.has(SKIM_OPTIONS[i].id);
                        cb.style.background = isChecked ? '#0d99ff' : 'transparent';
                        cb.style.borderColor = isChecked ? '#0d99ff' : 'rgba(255,255,255,0.4)';
                        cm.style.opacity = isChecked ? '1' : '0';
                    }
                });
            };

            row.appendChild(checkbox);
            row.appendChild(text);
            skimOptionsPanel.appendChild(row);
        });

        // Tooltip label (appears on hover for non-skim modes)
        const tooltipLabel = document.createElement('div');
        tooltipLabel.id = 'mode-tooltip-label';
        tooltipLabel.style.cssText = `
            background: rgba(0, 0, 0, 0.9); color: white; padding: 6px 12px;
            border-radius: 6px; font-size: 12px; font-weight: 500;
            opacity: 0; transform: translateY(4px); position: absolute; bottom: 60px;
            transition: opacity 0.15s ease, transform 0.15s ease;
            pointer-events: none; white-space: nowrap;
        `;
        tooltipLabel.textContent = '';

        // Control Bar (The "Tab" design)
        const bar = document.createElement('div');
        bar.style.cssText = `
            background: #000000; padding: 4px; border-radius: 12px;
            display: flex; gap: 0; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            align-items: center; position: relative;
        `;

        // Icons (larger 24x24)
        const iconEdit = `<svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M23.8887 12.3682C24.6697 11.5871 25.9367 11.5871 26.7178 12.3682L28.1318 13.7822C28.9128 14.5632 28.9127 15.8293 28.1318 16.6104L17.5254 27.2168L17.3115 27.4316L17.0146 27.4912L13.4785 28.1982L12.0078 28.4922L12.3018 27.0215L13.0088 23.4854L13.0684 23.1885L23.8887 12.3682ZM13.9893 23.6816L13.4951 26.1553L13.2822 27.2168L14.3447 27.0049L16.8184 26.5098L25.0605 18.2676L22.2314 15.4385L13.9893 23.6816ZM26.0107 13.0752C25.6203 12.6847 24.9872 12.6849 24.5967 13.0752L22.9395 14.7314L25.7676 17.5596L27.4248 15.9033C27.8151 15.5128 27.8152 14.8797 27.4248 14.4893L26.0107 13.0752Z" fill="currentColor"/></svg>`;

        const iconInspect = `<svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.0694 26.5L14.3867 13.5L25.613 20.2865L20.2119 21.7523L17.0694 26.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>`;

        const iconSkim = `<svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M25.3467 25.3281H23.8281L22.7256 22.4951H17.6211L16.5195 25.3281H15L19.4053 14H20.9414L25.3467 25.3281ZM18.1719 21.0791H22.1748L20.1729 15.9316L18.1719 21.0791Z" fill="currentColor"/><path d="M25.5163 18.0566V18.002C25.5201 17.6459 25.5555 17.3626 25.6225 17.152C25.6915 16.9414 25.7891 16.771 25.9155 16.6408C26.0418 16.5106 26.194 16.3919 26.3721 16.2847C26.4869 16.2119 26.5903 16.1306 26.6822 16.0406C26.7741 15.9506 26.8469 15.8472 26.9005 15.7305C26.9541 15.6137 26.9809 15.4844 26.9809 15.3428C26.9809 15.1724 26.9407 15.025 26.8603 14.9005C26.7799 14.7761 26.6727 14.6803 26.5386 14.6133C26.4065 14.5444 26.2591 14.51 26.0964 14.51C25.949 14.51 25.8083 14.5406 25.6742 14.6018C25.5402 14.6631 25.4292 14.7588 25.3411 14.889C25.253 15.0173 25.2023 15.1829 25.1889 15.3858H24.3159C24.3293 15.0412 24.4164 14.7502 24.5772 14.5128C24.738 14.2735 24.9506 14.0926 25.2148 13.9701C25.4809 13.8475 25.7747 13.7863 26.0964 13.7863C26.4487 13.7863 26.7569 13.8523 27.0211 13.9844C27.2853 14.1146 27.4901 14.2974 27.6357 14.5329C27.7831 14.7665 27.8568 15.0393 27.8568 15.3514C27.8568 15.5658 27.8233 15.7592 27.7563 15.9315C27.6893 16.1019 27.5935 16.2541 27.4691 16.3881C27.3466 16.5221 27.1991 16.6408 27.0268 16.7442C26.8641 16.8457 26.732 16.951 26.6305 17.0601C26.531 17.1692 26.4582 17.2984 26.4123 17.4478C26.3663 17.5971 26.3414 17.7818 26.3376 18.002V18.0566H25.5163ZM25.9499 19.8026C25.7929 19.8026 25.658 19.7471 25.545 19.636C25.4321 19.5231 25.3756 19.3872 25.3756 19.2283C25.3756 19.0713 25.4321 18.9373 25.545 18.8262C25.658 18.7133 25.7929 18.6568 25.9499 18.6568C26.105 18.6568 26.239 18.7133 26.352 18.8262C26.4668 18.9373 26.5243 19.0713 26.5243 19.2283C26.5243 19.3336 26.4975 19.4302 26.4439 19.5183C26.3922 19.6045 26.3233 19.6734 26.2371 19.7251C26.151 19.7768 26.0552 19.8026 25.9499 19.8026Z" fill="currentColor"/></svg>`;

        // Mode labels
        const modeLabels = {
            'edit': 'Edit Text',
            'inspect': 'Inspect',
            'skim': 'Skim'
        };

        // Show/hide skim options panel
        let skimPanelVisible = false;
        const showSkimPanel = () => {
            skimOptionsPanel.style.maxHeight = '400px';
            skimOptionsPanel.style.opacity = '1';
            skimOptionsPanel.style.padding = '12px 16px';
            skimOptionsPanel.style.marginBottom = '8px';
            skimOptionsPanel.style.pointerEvents = 'auto';
            skimPanelVisible = true;
        };
        const hideSkimPanel = () => {
            skimOptionsPanel.style.maxHeight = '0';
            skimOptionsPanel.style.opacity = '0';
            skimOptionsPanel.style.padding = '0 16px';
            skimOptionsPanel.style.marginBottom = '0';
            skimOptionsPanel.style.pointerEvents = 'none';
            skimPanelVisible = false;
        };

        // Scroll handler - hide panel on scroll
        let scrollTimeout;
        const handleScroll = () => {
            if (currentMode === 'skim' && skimPanelVisible) {
                hideSkimPanel();
            }
            clearTimeout(scrollTimeout);
        };

        // Helper to create buttons
        function createBtn(icon, mode) {
            const b = document.createElement('div');
            b.innerHTML = icon;
            b.style.cssText = `
                width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
                border-radius: 8px; cursor: pointer; transition: all 0.2s;
                color: rgba(255,255,255,0.6);
            `;
            b.onclick = (e) => {
                e.stopPropagation();
                setMode(mode);
                if (mode === 'skim') {
                    if (skimPanelVisible) {
                        hideSkimPanel();
                    } else {
                        showSkimPanel();
                    }
                } else {
                    hideSkimPanel();
                }
            };
            // Hover effect with label
            b.onmouseenter = () => {
                if (currentMode !== mode) b.style.color = 'rgba(255,255,255,1)';

                // Show skim panel on hover if in skim mode
                if (mode === 'skim' && currentMode === 'skim') {
                    showSkimPanel();
                }

                // Show tooltip for other modes
                if (mode !== 'skim' || currentMode !== 'skim') {
                    tooltipLabel.textContent = modeLabels[mode];
                    tooltipLabel.style.opacity = '1';
                    tooltipLabel.style.transform = 'translateY(0)';
                }
            };
            b.onmouseleave = () => {
                if (currentMode !== mode) b.style.color = 'rgba(255,255,255,0.6)';

                // Hide tooltip
                tooltipLabel.style.opacity = '0';
                tooltipLabel.style.transform = 'translateY(4px)';
            };
            return b;
        }

        const btnEdit = createBtn(iconEdit, 'edit');
        const btnInspect = createBtn(iconInspect, 'inspect');
        const btnSkim = createBtn(iconSkim, 'skim');

        // Initial State
        function updateActiveState() {
            [btnEdit, btnInspect, btnSkim].forEach(b => {
                b.style.background = 'transparent';
                b.style.color = 'rgba(255,255,255,0.6)';
            });
            const activeBtn = currentMode === 'edit' ? btnEdit : (currentMode === 'skim' ? btnSkim : btnInspect);
            activeBtn.style.background = '#ffffff';
            activeBtn.style.color = '#000000';

            // Show/hide skim panel based on mode
            if (currentMode === 'skim') {
                showSkimPanel();
            } else {
                hideSkimPanel();
            }
        }

        // Expose update function and scroll handler
        wrapper.updateActiveState = updateActiveState;
        wrapper.handleScroll = handleScroll;
        wrapper.showSkimPanel = showSkimPanel;

        // Wrapper hover to show panel when in skim mode
        wrapper.onmouseenter = () => {
            if (currentMode === 'skim' && !skimPanelVisible) {
                showSkimPanel();
            }
        };

        bar.appendChild(btnEdit);
        bar.appendChild(btnInspect);
        bar.appendChild(btnSkim);
        wrapper.appendChild(skimOptionsPanel);
        wrapper.appendChild(bar);
        wrapper.appendChild(tooltipLabel);

        document.body.appendChild(wrapper);

        // Add scroll listener
        window.addEventListener('scroll', handleScroll, { passive: true });

        // Initialize
        updateActiveState();

        return wrapper;
    }

    function setMode(mode) {
        currentMode = mode;
        const wrapper = document.getElementById('style-inspector-skim-wrapper');
        if (wrapper && wrapper.updateActiveState) wrapper.updateActiveState();

        // Reset States
        if (tooltip) tooltip.style.display = 'none';
        if (highlightOverlay) highlightOverlay.style.display = 'none';
        if (measurementOverlay) measurementOverlay.style.display = 'none';
        if (skimLabelsContainer) { skimLabelsContainer.remove(); skimLabelsContainer = null; }

        // Update layer bar for the mode
        updateLayerBarForMode(mode);

        if (mode === 'inspect') {
            // Normal behavior will resume on mouse move
        } else if (mode === 'skim') {
            // Ensure at least one property is selected if empty
            if (skimProperties.size === 0) {
                skimProperties.add('fontSize');
            }
            updateSkimLabels();
        } else if (mode === 'edit') {
            // Edit mode logic handled in click handlers
        }
    }

    function updateLayerBarForMode(mode) {
        if (!layerBar) return;

        // Fade out
        layerBar.style.opacity = '0';

        setTimeout(() => {
            layerBar.innerHTML = '';
            layerBar.style.display = 'flex';

            if (mode === 'edit') {
                // Edit Mode: Show instruction text
                const text = document.createElement('div');
                text.textContent = 'Select Text to Update (Read Only)';
                text.style.cssText = `
                    color: #999; font-size: 11px; font-style: italic;
                    white-space: nowrap; text-align: center; width: 100%;
                `;
                layerBar.appendChild(text);
            } else if (mode === 'skim') {
                // Skim Mode: Show selected properties info
                const text = document.createElement('div');
                const count = skimProperties.size;
                const props = Array.from(skimProperties).map(id => {
                    const opt = SKIM_OPTIONS.find(o => o.id === id);
                    return opt ? opt.short : id;
                }).join(', ');
                text.textContent = count > 0 ? `Showing: ${props}` : 'Select properties from panel above';
                text.style.cssText = `
                    color: ${count > 0 ? '#333' : '#999'}; font-size: 11px;
                    font-style: ${count > 0 ? 'normal' : 'italic'};
                    white-space: nowrap;
                `;
                layerBar.appendChild(text);
            } else if (mode === 'inspect') {
                // Inspect Mode: Show element hierarchy (existing behavior)
                // This will be updated when hovering/selecting elements via updateLayerBar()
                const text = document.createElement('div');
                text.textContent = 'Hover over elements to inspect';
                text.style.cssText = 'color: #999; font-size: 11px; font-style: italic;';
                layerBar.appendChild(text);
            }

            // Fade in
            requestAnimationFrame(() => {
                layerBar.style.opacity = '1';
            });
        }, 150); // Half of transition time
    }

    function updateSkimLabels() {
        if (currentMode !== 'skim') return;

        // Clear existing
        if (skimLabelsContainer) {
            skimLabelsContainer.remove();
            skimLabelsContainer = null;
        }

        if (skimProperties.size > 0) {
            // Hide normal inspector UI
            if (tooltip) tooltip.style.display = 'none';
            if (highlightOverlay) highlightOverlay.style.display = 'none';
            if (layerBar) layerBar.style.display = 'none';
            isPinned = false; // Disable pinning

            skimLabelsContainer = document.createElement('div');
            skimLabelsContainer.id = 'skim-labels-container';
            skimLabelsContainer.style.cssText = `
                position: absolute; top: 0; left: 0; width: 100%;
                height: ${Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)}px;
                pointer-events: none; z-index: 999997; overflow: hidden;
            `;

            const elements = document.querySelectorAll('body *');
            const textTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'li', 'label', 'button', 'input', 'textarea', 'b', 'strong', 'i', 'em', 'mark', 'small', 'blockquote', 'cite', 'code']);
            const visualTags = new Set(['img', 'svg', 'video', 'canvas', 'hr', 'br', 'iframe']);

            elements.forEach(el => {
                // Skip all inspector UI elements
                if (el.id && (el.id.startsWith('style-inspector') || el.id.startsWith('skim-') || el.id === 'mode-tooltip-label')) return;
                if (el.closest('#style-inspector-skim-wrapper')) return;
                if (el.closest('#style-inspector-tooltip')) return;
                if (el.closest('#style-inspector-highlight')) return;
                if (el.closest('#style-inspector-layer-bar')) return;
                if (el.closest('#skim-labels-container')) return;

                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                const computed = window.getComputedStyle(el);
                if (computed.display === 'none' || computed.visibility === 'hidden') return;

                let labelText = [];
                const tagName = el.tagName.toLowerCase();

                skimProperties.forEach(propId => {
                    const opt = SKIM_OPTIONS.find(o => o.id === propId);

                    // --- SMART LOGIC ---
                    if (opt.isText) {
                        if (visualTags.has(tagName)) return;
                        if (!textTags.has(tagName)) {
                            let hasDirectText = false;
                            for (let i = 0; i < el.childNodes.length; i++) {
                                if (el.childNodes[i].nodeType === 3 && el.childNodes[i].textContent.trim().length > 0) {
                                    hasDirectText = true; break;
                                }
                            }
                            if (!hasDirectText) return;
                        }
                    }
                    // -------------------

                    let val = opt.type === 'rect' ? Math.round(rect[opt.prop]) + 'px' : computed[opt.prop];
                    if (!val || val === '0px' || val === 'rgba(0, 0, 0, 0)' || val === 'none' || val === 'auto') return;
                    if (val.startsWith('rgb')) val = rgbToHex(val);

                    // Add color swatch for FC and BG
                    let displayVal = val;
                    if (opt.id === 'color' || opt.id === 'backgroundColor') {
                        displayVal = `<span style="display:inline-block; width:8px; height:8px; background:${val}; margin-right:3px; border-radius:1px; vertical-align:middle; border:1px solid rgba(255,255,255,0.2);"></span>${val}`;
                    }

                    labelText.push(`<span style="opacity:0.6">${opt.short}:</span> ${displayVal}`);
                });

                if (labelText.length > 0) {
                    const label = document.createElement('div');
                    label.innerHTML = labelText.join(' <span style="opacity:0.3">|</span> ');
                    label.style.cssText = `
                        position: absolute;
                        left: ${rect.left + window.scrollX}px;
                        top: ${rect.top + window.scrollY}px;
                        background: rgba(0, 0, 0, 0.85); color: white;
                        padding: 2px 5px; border-radius: 3px; font-size: 10px;
                        font-family: monospace; white-space: nowrap; z-index: 1;
                        pointer-events: none; transform: translateY(-100%);
                    `;
                    skimLabelsContainer.appendChild(label);
                }
            });
            document.body.appendChild(skimLabelsContainer);
        }
    }

    function throttleSkimUpdate() {
        if (skimUpdateTimer) return;
        skimUpdateTimer = setTimeout(() => {
            if (isActive && currentMode === 'skim') updateSkimLabels();
            skimUpdateTimer = null;
        }, 100);
    }

    // Initialize Skim Button
    if (isActive) {
        createSkimButton();
    }

    // Hook into toggleInspector to show/hide button
    const originalToggle = toggleInspector;
    // We can't easily wrap the internal function from here without rewriting it.
    // Instead, I'll modify the toggleInspector function in the next tool call if needed, 
    // or just rely on the fact that I'm appending this code to the end of the IIFE.
    // Wait, I am replacing the end of the file. I should update toggleInspector to handle the button visibility.

})();
