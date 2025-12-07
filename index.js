import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "QuickFormatting";
const scriptUrl = import.meta.url;
const extensionFolderPath = scriptUrl.substring(0, scriptUrl.lastIndexOf('/'));

// --- DEFAULTS ---
const defaultSettings = {
    enabled: true,
    layoutMode: 'grouped', 
    mobileStyle: 'floating',
    x: '50%',
    y: '50%', // On Mobile, this now acts as "Offset Pixels"
    zIndex: 10005,
    scale: 1.0,
    hiddenButtons: { 'btn_ooc': true, 'btn_code': true },
    enhancerEnabled: true,
    btnColor: 'white', 
    apiProvider: 'openrouter',
    apiBase: 'https://openrouter.ai/api/v1',
    apiKeyOpenRouter: '',
    apiKeyOpenAI: '',
    apiModel: '',
    contextLimit: 5,
    systemPrompt: 'You are a professional editor. Correct grammar.',
    stream: true,
    maxTokens: 0,
    temperature: 1
};

const formattingButtons = [
    { id: 'btn_action', label: '*', start: '*', end: '*', title: 'Action' },
    { id: 'btn_quote', label: '"', start: '"', end: '"', title: 'Dialogue' },
    { id: 'btn_ooc', label: '(OOC)', start: '(OOC: ', end: ')', title: 'OOC' },
    { id: 'btn_code', label: '```', start: '```', end: '```', title: 'Thoughts/Code' }
];

let container = null;
let freeContainer = null;
let isEditing = false;
let isGenerating = false;
let abortController = null;
let undoBuffer = null; 
let activeDragEl = null;
let dragStartCoords = { x: 0, y: 0 };
let dragStartPos = { x: 0, y: 0 }; 

// --- INITIALIZATION ---
jQuery(async () => {
    console.log('[QuickFormatting] Initializing...');
    
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
    } catch (e) {
        console.error('[QuickFormatting] Failed to load settings.html', e);
    }

    loadSettings();
    initSettingsListeners();
    setTimeout(() => { renderUI(); }, 1000);
    $(window).on('resize', () => { renderUI(true); });
});

// --- SETTINGS MANAGEMENT ---
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    for (const key in defaultSettings) {
        if (typeof extension_settings[extensionName][key] === 'undefined') {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
    syncSettingsToUI();
}

function updateSetting(key, value) {
    extension_settings[extensionName][key] = value;
    saveSettingsDebounced();
    if (['layoutMode', 'mobileStyle', 'enabled', 'enhancerEnabled'].includes(key)) {
        renderUI(true);
    } else {
        applyStyles(); 
    }
}

function syncSettingsToUI() {
    const s = extension_settings[extensionName];
    $('#qf_global_enabled').prop('checked', s.enabled);
    $('#qf_layout_mode').val(s.layoutMode);
    $('#qf_mobile_style').val(s.mobileStyle);
    
    const isMobile = window.innerWidth <= 1000;
    
    // Hide Desktop-only rows on mobile
    $('#row_desktop_layout').toggle(!isMobile); 
    // Hide Mobile-only rows on desktop
    $('#row_mobile_style').toggle(isMobile); 
    
    // Update labels for context
    if(isMobile) $('label[for="qf_pos_y"]').text("Vertical Offset (px)");
    else $('label[for="qf_pos_y"]').text("Position Y (Vertical)");
    
    $('#qf_buttons_container').empty();
    formattingButtons.forEach(btn => {
        $('#qf_buttons_container').append(`
            <label class="checkbox_label">
                <input id="qf_toggle_${btn.id}" type="checkbox" ${!s.hiddenButtons[btn.id] ? 'checked' : ''} />
                <span>${btn.label} <small>(${btn.title})</small></span>
            </label>
        `);
        $(document).on('change', `#qf_toggle_${btn.id}`, function() {
            if (!s.hiddenButtons) s.hiddenButtons = {};
            if ($(this).prop('checked')) delete s.hiddenButtons[btn.id];
            else s.hiddenButtons[btn.id] = true;
            saveSettingsDebounced();
            renderUI(true);
        });
    });

    $('#qf_enhancer_enabled').prop('checked', s.enhancerEnabled);
    $('#qf_btn_color').val(s.btnColor);
    
    $('#qf_pos_x').val(parseFloat(s.x) || 50); $('#qf_pos_x_val').text(s.x);
    $('#qf_pos_y').val(parseFloat(s.y) || 50); $('#qf_pos_y_val').text(s.y);
    $('#qf_z_index').val(s.zIndex); $('#qf_z_index_val').text(s.zIndex);
    $('#qf_ui_scale').val(s.scale); $('#qf_ui_scale_val').text(s.scale);
    
    $('#qf_api_provider').val(s.apiProvider);
    $('#qf_api_base').val(s.apiBase);
    updateKeyDisplay();
    $('#qf_stream').prop('checked', s.stream);
    $('#qf_system_prompt').val(s.systemPrompt);
    $('#qf_context_limit').val(s.contextLimit);
    $('#qf_max_tokens').val(s.maxTokens);
    $('#qf_temp').val(s.temperature);
}

function initSettingsListeners() {
    $('#qf_global_enabled').on('change', function() { updateSetting('enabled', $(this).prop('checked')); });
    $('#qf_layout_mode').on('change', function() { updateSetting('layoutMode', $(this).val()); });
    $('#qf_mobile_style').on('change', function() { updateSetting('mobileStyle', $(this).val()); });
    
    $('#qf_pos_x').on('input', function() { const v = $(this).val(); $('#qf_pos_x_val').text(v + '%'); updateSetting('x', v + '%'); });
    $('#qf_pos_y').on('input', function() { const v = $(this).val(); $('#qf_pos_y_val').text(v + '%'); updateSetting('y', v + '%'); });
    $('#qf_z_index').on('input', function() { const v = $(this).val(); $('#qf_z_index_val').text(v); updateSetting('zIndex', v); });
    $('#qf_ui_scale').on('input', function() { const v = $(this).val(); $('#qf_ui_scale_val').text(v); updateSetting('scale', v); });

    $('#qf_reset_pos').on('click', (e) => { e.preventDefault(); resetPosition(); });
    $('#qf_enhancer_enabled').on('change', function() { updateSetting('enhancerEnabled', $(this).prop('checked')); });
    $('#qf_btn_color').on('change', function() { updateSetting('btnColor', $(this).val()); });
    
    $('#qf_api_provider').on('change', function() { updateSetting('apiProvider', $(this).val()); updateKeyDisplay(); });
    $('#qf_api_key').on('change', function() {
        const s = extension_settings[extensionName];
        if(s.apiProvider === 'openai') updateSetting('apiKeyOpenAI', $(this).val());
        else updateSetting('apiKeyOpenRouter', $(this).val());
        updateKeyDisplay();
    });
    $('#qf_clear_key').on('click', function() {
        const s = extension_settings[extensionName];
        if(s.apiProvider === 'openai') updateSetting('apiKeyOpenAI', '');
        else updateSetting('apiKeyOpenRouter', '');
        updateKeyDisplay();
    });
}

function resetPosition() {
    updateSetting('x', '50%');
    updateSetting('y', '50%');
    updateSetting('scale', 1.0);
    renderUI(true);
    toastr.info('Position Reset');
}

function updateKeyDisplay() {
    const s = extension_settings[extensionName];
    const isOA = s.apiProvider === 'openai';
    const key = isOA ? s.apiKeyOpenAI : s.apiKeyOpenRouter;
    $('#qf_api_key').val(key || '');
    $('#qf_clear_key').toggle(!!key);
}

// --- RENDER LOGIC ---
function applyStyles() {
    const s = extension_settings[extensionName];
    const isMobile = window.innerWidth <= 1000;
    
    if (container) {
        if (isMobile) {
            // MOBILE:
            // 1. Position X (Left)
            container.style.left = s.x;
            // 2. Vertical Offset (Use Y value as Pixels)
            // Default css is bottom: 100%. We add margin-bottom to push it up.
            const offsetPx = parseFloat(s.y) || 0; 
            container.style.marginBottom = offsetPx + 'px';
            
            // 3. Z-Index and Scale
            container.style.zIndex = s.zIndex;
            container.style.transformOrigin = 'bottom center';
            container.style.transform = `translateX(-50%) scale(${s.scale})`;
            return;
        }

        // DESKTOP:
        container.style.marginBottom = '0'; // Reset margin
        container.style.position = 'fixed';
        container.style.left = s.x;
        container.style.top = s.y;
        container.style.zIndex = isEditing ? '20000' : s.zIndex;
        container.style.transform = `translate(-50%, -50%) scale(${s.scale})`;
        
        const color = s.btnColor || 'white';
        $('.qf-enhance-btn').removeClass('qf-btn-white qf-btn-gold qf-btn-purple qf-btn-green').addClass('qf-btn-' + color);
    }
}

function renderUI(force = false) {
    if (force) {
        if(container) container.remove();
        container = null; 
    }
    const s = extension_settings[extensionName];
    if (!s.enabled) return;

    syncSettingsToUI();

    const isMobile = window.innerWidth <= 1000;

    container = document.createElement('div');
    container.id = 'qf-main-container';
    container.className = 'quick-format-container';
    
    formattingButtons.forEach(b => {
        if(!s.hiddenButtons[b.id]) container.appendChild(createBtn(b));
    });

    if(s.enhancerEnabled) {
        const div = document.createElement('div');
        div.className = 'qf-divider';
        container.appendChild(div);
        container.appendChild(createBtn({id: 'enhancer', icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>', title: 'Enhance', action: enhanceText, isEnhance: true}));
        container.appendChild(createBtn({id: 'undo', icon: '<i class="fa-solid fa-rotate-left"></i>', title: 'Undo', action: restoreUndo, isUndo: true}));
    }

    if (isMobile) {
        container.classList.add('mobile-docked');
        const styleMode = s.mobileStyle || 'floating';
        container.classList.add(`mobile-style-${styleMode}`);
        
        const textArea = document.getElementById('send_textarea');
        if (textArea && textArea.parentElement) {
            textArea.parentElement.style.position = 'relative'; 
            textArea.parentElement.insertBefore(container, textArea);
        } else {
            document.body.appendChild(container);
        }
        applyStyles();
        console.log(`[QuickFormatting] Mobile Mode: ${styleMode}`);
        
    } else {
        if(s.layoutMode === 'vertical') container.classList.add('vertical');
        const controls = createEditControls();
        container.appendChild(controls);
        container.addEventListener('dblclick', () => toggleEdit(true));
        addDragListeners(container);
        document.body.appendChild(container);
        applyStyles();
        console.log('[QuickFormatting] Desktop Mode: Floating');
    }

    if(undoBuffer) updateUndoButtonState();
}

function createBtn(cfg) {
    const btn = document.createElement('button');
    btn.className = 'quick-format-btn';
    if (cfg.isEnhance) btn.classList.add('qf-enhance-btn');
    if (cfg.isUndo) btn.classList.add('qf-undo-btn');
    if (cfg.icon) btn.innerHTML = cfg.icon;
    else btn.innerText = cfg.label;
    btn.title = cfg.title;
    if(cfg.action) btn.onclick = (e) => { e.preventDefault(); cfg.action(); };
    else btn.onclick = (e) => { e.preventDefault(); insertText(cfg.start, cfg.end); };
    btn.onmousedown = (e) => e.preventDefault();
    return btn;
}

function createEditControls() {
    const div = document.createElement('div');
    div.className = 'qf-edit-controls';
    const minus = document.createElement('button'); minus.innerText = '-'; minus.className = 'qf-control-btn'; 
    minus.onclick = () => updateSetting('scale', Math.max(0.5, (extension_settings[extensionName].scale - 0.1).toFixed(1)));
    div.appendChild(minus);
    const save = document.createElement('button'); save.innerText = 'SAVE'; save.className = 'qf-control-btn save';
    save.onclick = (e) => { e.stopPropagation(); toggleEdit(false); };
    div.appendChild(save);
    const plus = document.createElement('button'); plus.innerText = '+'; plus.className = 'qf-control-btn';
    plus.onclick = () => updateSetting('scale', Math.min(2.0, (extension_settings[extensionName].scale + 0.1).toFixed(1)));
    div.appendChild(plus);
    return div;
}

function addDragListeners(el) { el.addEventListener('mousedown', (e) => handleDragStart(e, el)); }
function handleDragStart(e, el) {
    if (!isEditing) return;
    if (e.target.tagName === 'BUTTON' && !el.classList.contains('quick-format-container')) return; 
    e.preventDefault(); activeDragEl = el; dragStartCoords = { x: e.clientX, y: e.clientY };
    const rect = el.getBoundingClientRect();
    dragStartPos = { x: ((rect.left + rect.width / 2) / window.innerWidth) * 100, y: ((rect.top + rect.height / 2) / window.innerHeight) * 100 };
    document.addEventListener('mousemove', handleDragMove); document.addEventListener('mouseup', handleDragEnd);
}
function handleDragMove(e) {
    if (!activeDragEl) return; e.preventDefault();
    const dPctX = ((e.clientX - dragStartCoords.x) / window.innerWidth) * 100;
    const dPctY = ((e.clientY - dragStartCoords.y) / window.innerHeight) * 100;
    activeDragEl.style.left = (dragStartPos.x + dPctX) + '%'; activeDragEl.style.top = (dragStartPos.y + dPctY) + '%';
}
function handleDragEnd(e) {
    if (!activeDragEl) return;
    updateSetting('x', activeDragEl.style.left); updateSetting('y', activeDragEl.style.top);
    $('#qf_pos_x').val(parseFloat(activeDragEl.style.left)); $('#qf_pos_y').val(parseFloat(activeDragEl.style.top));
    activeDragEl = null; document.removeEventListener('mousemove', handleDragMove); document.removeEventListener('mouseup', handleDragEnd);
}

function toggleEdit(val) { isEditing = val; if (container) container.classList.toggle('editing', val); applyStyles(); }

function insertText(start, end) {
    const textarea = document.getElementById('send_textarea'); if (!textarea) return;
    const s = textarea.selectionStart; const e = textarea.selectionEnd; const val = textarea.value;
    textarea.value = val.substring(0, s) + start + val.substring(s, e) + end + val.substring(e);
    textarea.selectionStart = s + start.length; textarea.selectionEnd = e + start.length;
    textarea.focus(); textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function enhanceText() {
    if (isGenerating) { if (abortController) abortController.abort(); isGenerating = false; renderGeneratingState(false); toastr.info('Generation Stopped'); return; }
    const textarea = document.getElementById('send_textarea'); const text = textarea ? textarea.value.trim() : '';
    if (!text) { toastr.warning('No text to enhance'); return; }
    undoBuffer = text; updateUndoButtonState();
    const s = extension_settings[extensionName]; const key = s.apiProvider === 'openai' ? s.apiKeyOpenAI : s.apiKeyOpenRouter;
    if (!key) { toastr.error('API Key Missing'); return; }
    renderGeneratingState(true); isGenerating = true; abortController = new AbortController();
    try {
        const context = getContext(); const history = [];
        if (s.contextLimit > 0 && context.chat && context.chat.length) {
            context.chat.slice(-parseInt(s.contextLimit)).forEach(msg => history.push({ role: msg.is_user ? 'user' : 'assistant', content: msg.mes }));
        }
        const response = await fetch(`${s.apiBase}/chat/completions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model: s.apiModel || 'gpt-3.5-turbo', messages: [{ role: "system", content: s.systemPrompt }, ...history, { role: "user", content: text }], stream: s.stream, temperature: parseFloat(s.temperature), max_tokens: parseInt(s.maxTokens) || undefined }),
            signal: abortController.signal
        });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        if (s.stream) {
            textarea.value = ''; const reader = response.body.getReader(); const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read(); if (done) break;
                const lines = decoder.decode(value).split('\n');
                for (const line of lines) { if (line.startsWith('data: ')) { try { const json = JSON.parse(line.slice(6)); if (json.choices[0]?.delta?.content) { textarea.value += json.choices[0].delta.content; textarea.scrollTop = textarea.scrollHeight; } } catch (e) {} } }
            }
        } else { const data = await response.json(); if (data.choices[0]?.message?.content) textarea.value = data.choices[0].message.content; }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) { if (e.name !== 'AbortError') toastr.error('Generation Failed: ' + e.message); } finally { isGenerating = false; renderGeneratingState(false); }
}

function renderGeneratingState(active) { document.querySelectorAll('.qf-enhance-btn').forEach(btn => btn.innerHTML = active ? '<i class="fa-solid fa-square"></i>' : '<i class="fa-solid fa-wand-magic-sparkles"></i>'); }
function restoreUndo() { const t = document.getElementById('send_textarea'); if (t && undoBuffer) { t.value = undoBuffer; t.dispatchEvent(new Event('input', { bubbles: true })); undoBuffer = null; updateUndoButtonState(); toastr.success('Text Restored'); } }
function updateUndoButtonState() { const btns = document.querySelectorAll('.qf-undo-btn'); btns.forEach(b => { b.style.opacity = undoBuffer ? '1' : '0.3'; b.style.cursor = undoBuffer ? 'pointer' : 'default'; }); }