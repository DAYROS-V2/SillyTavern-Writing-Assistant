import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "QuickFormatting";
const scriptUrl = import.meta.url;
const extensionFolderPath = scriptUrl.substring(0, scriptUrl.lastIndexOf('/'));

// --- DEFAULTS ---
const defaultSettings = {
    enabled: true,
    layoutMode: 'grouped', 
    x: '50%',
    y: '50%',
    zIndex: 800,
    scale: 1.0,
    hiddenButtons: {
        'btn_ooc': true,
        'btn_code': true
    },
    freePositions: {}, 
    // AI
    enhancerEnabled: true,
    btnColor: 'white', 
    apiProvider: 'openrouter',
    apiBase: 'https://openrouter.ai/api/v1',
    apiKeyOpenRouter: '',
    apiKeyOpenAI: '',
    apiModel: '',
    contextLimit: 5,
    systemPrompt: 'You are a professional editor. Correct grammar, improve flow, and enhance the prose of the user input. Keep the tone consistent with the roleplay context provided. Do not add commentary, just output the enhanced text.',
    // Gen Params
    stream: true,
    maxTokens: 0,
    temperature: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    repetitionPenalty: 1,
    topK: 0,
    topP: 1,
    minP: 0,
    topA: 0,
    seed: -1,
    reasoningEffort: ''
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

// --- DRAG STATE ---
// We use a simpler, cleaner drag state to prevent mobile issues
let activeDragEl = null;
let dragStartCoords = { x: 0, y: 0 };
let dragStartPos = { x: 0, y: 0 }; // Percentages

// --- INITIALIZATION ---
jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
    } catch (e) {
        console.error('[QuickFormatting] Failed to load settings.html', e);
    }

    loadSettings();
    initSettingsListeners();
    renderUI();

    // Visibility Loop
    setInterval(() => {
        const textarea = document.getElementById('send_textarea');
        const isVisible = textarea && (textarea.offsetParent !== null);
        if (container) container.style.display = isVisible ? 'flex' : 'none';
        if (freeContainer) freeContainer.style.display = isVisible ? 'block' : 'none';
    }, 500);
});

// --- SETTINGS MANAGEMENT ---
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    // Merge defaults
    for (const key in defaultSettings) {
        if (typeof extension_settings[extensionName][key] === 'undefined') {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
    // Migration: Fix old positions
    if (extension_settings[extensionName].y === '85%') {
        extension_settings[extensionName].y = '50%';
        saveSettingsDebounced();
    }
    syncSettingsToUI();
}

function updateSetting(key, value) {
    extension_settings[extensionName][key] = value;
    saveSettingsDebounced();
    
    // Critical Re-renders
    if (['layoutMode', 'enabled', 'enhancerEnabled'].includes(key)) {
        renderUI(true);
    } else {
        applyStyles(); // Live update for cosmetic changes
    }
}

function syncSettingsToUI() {
    const s = extension_settings[extensionName];
    $('#qf_global_enabled').prop('checked', s.enabled);
    $('#qf_layout_mode').val(s.layoutMode);
    
    // Buttons
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
    
    // Sliders
    $('#qf_pos_x').val(parseFloat(s.x) || 50); $('#qf_pos_x_val').text(s.x);
    $('#qf_pos_y').val(parseFloat(s.y) || 50); $('#qf_pos_y_val').text(s.y);
    $('#qf_z_index').val(s.zIndex); $('#qf_z_index_val').text(s.zIndex);
    $('#qf_ui_scale').val(s.scale); $('#qf_ui_scale_val').text(s.scale);
    
    // AI
    $('#qf_api_provider').val(s.apiProvider);
    $('#qf_api_base').val(s.apiBase);
    updateKeyDisplay();
    
    $('#qf_stream').prop('checked', s.stream);
    $('#qf_system_prompt').val(s.systemPrompt);
    $('#qf_context_limit').val(s.contextLimit);
    $('#qf_max_tokens').val(s.maxTokens);
    
    // Params
    $('#qf_temp').val(s.temperature);
    $('#qf_freq_pen').val(s.frequencyPenalty);
    $('#qf_pres_pen').val(s.presencePenalty);
    $('#qf_rep_pen').val(s.repetitionPenalty);
    $('#qf_top_k').val(s.topK);
    $('#qf_top_p').val(s.topP);
    $('#qf_min_p').val(s.minP);
    $('#qf_top_a').val(s.topA);
    $('#qf_seed').val(s.seed);
    $('#qf_reasoning_effort').val(s.reasoningEffort);

    if(s.apiModel) {
        if ($('#qf_api_model option[value="' + s.apiModel + '"]').length === 0) {
            $('#qf_api_model').append(new Option(s.apiModel, s.apiModel, true, true));
        }
        $('#qf_api_model').val(s.apiModel);
    }
}

function initSettingsListeners() {
    $('#qf_global_enabled').on('change', function() { updateSetting('enabled', $(this).prop('checked')); });
    $('#qf_layout_mode').on('change', function() { updateSetting('layoutMode', $(this).val()); });
    
    // Direct Slider Binding
    $('#qf_pos_x').on('input', function() { 
        const v = $(this).val(); $('#qf_pos_x_val').text(v + '%'); updateSetting('x', v + '%'); 
    });
    $('#qf_pos_y').on('input', function() { 
        const v = $(this).val(); $('#qf_pos_y_val').text(v + '%'); updateSetting('y', v + '%'); 
    });
    $('#qf_z_index').on('input', function() { 
        const v = $(this).val(); $('#qf_z_index_val').text(v); updateSetting('zIndex', v); 
    });
    $('#qf_ui_scale').on('input', function() { 
        const v = $(this).val(); $('#qf_ui_scale_val').text(v); updateSetting('scale', v); 
    });

    $('#qf_reset_pos').on('click', resetPosition);

    $('#qf_enhancer_enabled').on('change', function() { updateSetting('enhancerEnabled', $(this).prop('checked')); });
    $('#qf_btn_color').on('change', function() { updateSetting('btnColor', $(this).val()); });
    
    // AI Listeners
    $('#qf_api_provider').on('change', function() {
        updateSetting('apiProvider', $(this).val());
        updateKeyDisplay();
    });
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
    
    $('#qf_api_base').on('change', function() { updateSetting('apiBase', $(this).val()); });
    $('#qf_api_model').on('change', function() { updateSetting('apiModel', $(this).val()); });
    $('#qf_stream').on('change', function() { updateSetting('stream', $(this).prop('checked')); });
    $('#qf_fetch_models').on('click', fetchModels);
    
    // Params
    $('#qf_system_prompt').on('input', function() { updateSetting('systemPrompt', $(this).val()); });
    $('#qf_context_limit').on('change', function() { updateSetting('contextLimit', $(this).val()); });
    $('#qf_max_tokens').on('change', function() { updateSetting('maxTokens', $(this).val()); });
    $('#qf_temp').on('change', function() { updateSetting('temperature', $(this).val()); });
    $('#qf_freq_pen').on('change', function() { updateSetting('frequencyPenalty', $(this).val()); });
    $('#qf_pres_pen').on('change', function() { updateSetting('presencePenalty', $(this).val()); });
    $('#qf_rep_pen').on('change', function() { updateSetting('repetitionPenalty', $(this).val()); });
    $('#qf_top_k').on('change', function() { updateSetting('topK', $(this).val()); });
    $('#qf_top_p').on('change', function() { updateSetting('topP', $(this).val()); });
    $('#qf_min_p').on('change', function() { updateSetting('minP', $(this).val()); });
    $('#qf_top_a').on('change', function() { updateSetting('topA', $(this).val()); });
    $('#qf_seed').on('change', function() { updateSetting('seed', $(this).val()); });
    $('#qf_reasoning_effort').on('change', function() { updateSetting('reasoningEffort', $(this).val()); });
}

function resetPosition() {
    updateSetting('x', '50%');
    updateSetting('y', '50%');
    updateSetting('scale', 1.0);
    updateSetting('zIndex', 800);
    updateSetting('freePositions', {});
    
    // Update UI Sliders
    $('#qf_pos_x').val(50); $('#qf_pos_x_val').text('50%');
    $('#qf_pos_y').val(50); $('#qf_pos_y_val').text('50%');
    $('#qf_ui_scale').val(1.0); $('#qf_ui_scale_val').text('1.0');
    $('#qf_z_index').val(800); $('#qf_z_index_val').text('800');
    
    // FORCE DOM RESET
    if(container) {
        container.style.cssText = ''; // Nuke existing styles
        container.classList.remove('editing');
        isEditing = false;
        applyStyles(); // Re-apply default settings
    }
    if(freeContainer) {
        freeContainer.querySelectorAll('.qf-free-mode-btn').forEach(btn => btn.style.cssText = '');
        applyStyles();
    }
    toastr.info('Position Reset');
}

function updateKeyDisplay() {
    const s = extension_settings[extensionName];
    const isOA = s.apiProvider === 'openai';
    
    // Swap Key Input
    const key = isOA ? s.apiKeyOpenAI : s.apiKeyOpenRouter;
    $('#qf_api_key').val(key || '');
    $('#qf_clear_key').toggle(!!key);
    
    // Swap Fetch Button / Base URL Logic
    $('#qf_fetch_container').toggle(!isOA);
    
    // Base URL Logic
    if(isOA) {
         // If it's the default OpenRouter URL, clear it for OpenAI
         if(s.apiBase === 'https://openrouter.ai/api/v1') {
             updateSetting('apiBase', '');
             $('#qf_api_base').val('');
         }
    } else {
        // If empty, set to OpenRouter default
        if(!s.apiBase) {
             const def = 'https://openrouter.ai/api/v1';
             updateSetting('apiBase', def);
             $('#qf_api_base').val(def);
        }
    }
}

async function fetchModels() {
    const s = extension_settings[extensionName];
    const key = s.apiKeyOpenRouter;
    if(!key) { toastr.error('OpenRouter API Key required'); return; }
    
    const btn = $('#qf_fetch_models');
    btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Fetching...');
    
    try {
        const req = await fetch('https://openrouter.ai/api/v1/models');
        const data = await req.json();
        const models = data.data.map(m => m.id).sort();
        
        $('#qf_api_model').empty().append(new Option('Select...', '', true, true));
        models.forEach(m => {
            $('#qf_api_model').append(new Option(m, m));
        });
        toastr.success(`Fetched ${models.length} models`);
    } catch(e) {
        toastr.error('Failed to fetch models');
        console.error(e);
    } finally {
        btn.prop('disabled', false).html('<i class="fa-solid fa-sync"></i> Fetch Models');
    }
}


// --- RENDER LOGIC ---

function applyStyles() {
    const s = extension_settings[extensionName];
    if (container) {
        // Grouped Mode
        container.style.position = 'fixed';
        container.style.left = s.x;
        container.style.top = s.y;
        container.style.zIndex = isEditing ? '20000' : s.zIndex;
        container.style.transform = 'translate(-50%, -50%) scale(' + s.scale + ')';
        
        // Update Buttons
        const color = s.btnColor || 'white';
        $('.qf-enhance-btn').removeClass('qf-btn-white qf-btn-gold qf-btn-purple qf-btn-green').addClass('qf-btn-' + color);
    }
    
    if (freeContainer) {
        // Free Mode Controls
        const ctrl = freeContainer.querySelector('.qf-free-controls');
        if(ctrl) {
            ctrl.style.left = s.x;
            ctrl.style.top = s.y;
            ctrl.style.transform = 'translate(-50%, -50%)';
        }
        
        // Update Individual Buttons
        const btns = freeContainer.querySelectorAll('.qf-free-mode-btn');
        btns.forEach(b => {
            const id = b.dataset.id;
            const pos = s.freePositions?.[id] || {x: '50%', y: '50%'};
            b.style.left = pos.x;
            b.style.top = pos.y;
            b.style.transform = 'translate(-50%, -50%) scale(' + s.scale + ')';
            b.style.zIndex = isEditing ? '20000' : s.zIndex;
        });
    }
}

function renderUI(force = false) {
    if (force) {
        if(container) container.remove();
        if(freeContainer) freeContainer.remove();
        container = null; freeContainer = null;
    }
    const s = extension_settings[extensionName];
    if (!s.enabled) return;
    
    // Check if chat is ready (simple check)
    if (!document.getElementById('send_textarea')) return;

    if (s.layoutMode === 'free') {
        if (!freeContainer) createFreeUI();
    } else {
        if (!container) createGroupedUI();
    }
    applyStyles();
}

function createGroupedUI() {
    container = document.createElement('div');
    container.className = 'quick-format-container';
    if(extension_settings[extensionName].layoutMode === 'vertical') container.classList.add('vertical');
    
    const s = extension_settings[extensionName];
    
    // Add Buttons
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

    // Edit Controls
    const controls = createEditControls();
    container.appendChild(controls);

    // Event Listeners for Drag
    container.addEventListener('dblclick', () => toggleEdit(true));
    addDragListeners(container);

    document.body.appendChild(container);
    if(undoBuffer) updateUndoButtonState();
}

function createFreeUI() {
    freeContainer = document.createElement('div');
    freeContainer.className = 'qf-free-wrapper';
    const s = extension_settings[extensionName];

    // Buttons
    formattingButtons.forEach(b => {
        if(!s.hiddenButtons[b.id]) freeContainer.appendChild(createBtn(b, true));
    });
    
    if(s.enhancerEnabled) {
        freeContainer.appendChild(createBtn({id: 'enhancer', icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>', title: 'Enhance', action: enhanceText, isEnhance: true}, true));
        freeContainer.appendChild(createBtn({id: 'undo', icon: '<i class="fa-solid fa-rotate-left"></i>', title: 'Undo', action: restoreUndo, isUndo: true}, true));
    }

    // Central Save Button (Anchor)
    const controls = document.createElement('div');
    controls.className = 'qf-free-controls';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'qf-control-btn save';
    saveBtn.innerText = 'SAVE';
    saveBtn.onclick = () => toggleEdit(false);
    controls.appendChild(saveBtn);

    // Zoom btns
    const minus = document.createElement('button'); minus.innerText = '-'; minus.className = 'qf-control-btn zoom'; 
    minus.onclick = () => updateSetting('scale', Math.max(0.5, (s.scale - 0.1).toFixed(1)));
    controls.appendChild(minus);

    const plus = document.createElement('button'); plus.innerText = '+'; plus.className = 'qf-control-btn zoom';
    plus.onclick = () => updateSetting('scale', Math.min(2.0, (s.scale + 0.1).toFixed(1)));
    controls.appendChild(plus);

    freeContainer.appendChild(controls);
    document.body.appendChild(freeContainer);
    
    if(isEditing) toggleEdit(true); // Re-apply state
}

function createBtn(cfg, isFree = false) {
    const btn = document.createElement('button');
    btn.className = 'quick-format-btn';
    if (cfg.isEnhance) btn.classList.add('qf-enhance-btn');
    if (cfg.isUndo) btn.classList.add('qf-undo-btn');
    if (isFree) {
        btn.classList.add('qf-free-mode-btn');
        btn.dataset.id = cfg.id;
        addDragListeners(btn, true); // Individual drag
        btn.addEventListener('dblclick', (e) => { e.stopPropagation(); toggleEdit(!isEditing); });
    }

    if (cfg.icon) btn.innerHTML = cfg.icon;
    else btn.innerText = cfg.label;
    btn.title = cfg.title;
    
    if(cfg.action) btn.onclick = cfg.action;
    else btn.onclick = () => insertText(cfg.start, cfg.end);
    
    // Prevent focus stealing
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

// --- DRAG LOGIC (ROBUST MOBILE) ---

function addDragListeners(el, isFree = false) {
    // Mouse
    el.addEventListener('mousedown', (e) => handleDragStart(e, el, isFree));
    // Touch
    el.addEventListener('touchstart', (e) => handleDragStart(e, el, isFree), { passive: false });
}

function handleDragStart(e, el, isFree) {
    if (!isEditing) return;
    if (e.target.tagName === 'BUTTON' && !el.classList.contains('quick-format-container')) return; 
    
    e.preventDefault();
    e.stopPropagation();

    activeDragEl = el;
    
    // Get start coordinates
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    dragStartCoords = { x: clientX, y: clientY };
    
    // Get current position (parsed from style or computed)
    const rect = el.getBoundingClientRect();
    const parentW = window.innerWidth;
    const parentH = window.innerHeight;
    
    // We calculate the center point percentage
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    
    dragStartPos = {
        x: (centerX / parentW) * 100,
        y: (centerY / parentH) * 100
    };

    // Attach global listeners
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchend', handleDragEnd);
}

function handleDragMove(e) {
    if (!activeDragEl) return;
    e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const dx = clientX - dragStartCoords.x;
    const dy = clientY - dragStartCoords.y;

    // Convert delta pixels to delta percentage
    const dPctX = (dx / window.innerWidth) * 100;
    const dPctY = (dy / window.innerHeight) * 100;

    const newX = dragStartPos.x + dPctX;
    const newY = dragStartPos.y + dPctY;

    // Apply IMMEDIATELY to DOM (Synchronous) - No Saving yet
    activeDragEl.style.left = newX + '%';
    activeDragEl.style.top = newY + '%';
}

function handleDragEnd(e) {
    if (!activeDragEl) return;
    
    // Finalize position
    const finalLeft = activeDragEl.style.left;
    const finalTop = activeDragEl.style.top;
    
    // Save to settings
    const s = extension_settings[extensionName];
    if (activeDragEl.classList.contains('qf-free-mode-btn')) {
        const id = activeDragEl.dataset.id;
        if (!s.freePositions) s.freePositions = {};
        s.freePositions[id] = { x: finalLeft, y: finalTop };
        updateSetting('freePositions', s.freePositions);
    } else {
        // Main Container
        updateSetting('x', finalLeft);
        updateSetting('y', finalTop);
        
        // Update sliders if open
        $('#qf_pos_x').val(parseFloat(finalLeft)); $('#qf_pos_x_val').text(finalLeft);
        $('#qf_pos_y').val(parseFloat(finalTop)); $('#qf_pos_y_val').text(finalTop);
    }

    // Cleanup
    activeDragEl = null;
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('touchmove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchend', handleDragEnd);
}


// --- ACTIONS ---

function toggleEdit(val) {
    isEditing = val;
    if (container) {
        if (val) container.classList.add('editing');
        else container.classList.remove('editing');
    }
    if (freeContainer) {
        const btns = freeContainer.querySelectorAll('.qf-free-mode-btn');
        btns.forEach(b => b.style.zIndex = val ? '20000' : extension_settings[extensionName].zIndex);
        
        const ctrl = freeContainer.querySelector('.qf-free-controls');
        if(ctrl) ctrl.style.display = val ? 'flex' : 'none';
    }
    applyStyles(); // Updates z-indices
}

function insertText(start, end) {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;

    const s = textarea.selectionStart;
    const e = textarea.selectionEnd;
    const val = textarea.value;
    const selected = val.substring(s, e);

    textarea.value = val.substring(0, s) + start + selected + end + val.substring(e);
    textarea.selectionStart = s + start.length;
    textarea.selectionEnd = e + start.length;
    textarea.focus();
    
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function enhanceText() {
    if (isGenerating) {
        if (abortController) abortController.abort();
        isGenerating = false;
        renderGeneratingState(false);
        toastr.info('Generation Stopped');
        return;
    }

    const textarea = document.getElementById('send_textarea');
    const text = textarea ? textarea.value.trim() : '';
    
    if (!text) { toastr.warning('No text to enhance'); return; }
    
    undoBuffer = text;
    updateUndoButtonState();
    
    const s = extension_settings[extensionName];
    const key = s.apiProvider === 'openai' ? s.apiKeyOpenAI : s.apiKeyOpenRouter;
    
    if (!key) { toastr.error('API Key Missing'); return; }
    
    renderGeneratingState(true);
    isGenerating = true;
    abortController = new AbortController();

    try {
        const context = getContext(); 
        const history = [];
        
        // Build Context
        if (s.contextLimit > 0 && context.chat && context.chat.length) {
            const limit = parseInt(s.contextLimit);
            const slice = context.chat.slice(-limit);
            slice.forEach(msg => {
                history.push({ 
                    role: msg.is_user ? 'user' : 'assistant', 
                    content: msg.mes 
                });
            });
        }

        const messages = [
            { role: "system", content: s.systemPrompt },
            ...history,
            { role: "user", content: text } // Current input
        ];

        const payload = {
            model: s.apiModel || 'gpt-3.5-turbo',
            messages: messages,
            stream: s.stream,
            temperature: parseFloat(s.temperature),
            max_tokens: parseInt(s.maxTokens) || undefined,
            frequency_penalty: parseFloat(s.frequencyPenalty),
            presence_penalty: parseFloat(s.presencePenalty),
            top_p: parseFloat(s.topP),
        };
        
        // Add optional params only if non-default/supported
        if(s.seed !== -1) payload.seed = parseInt(s.seed);
        if(s.reasoningEffort) payload.reasoning_effort = s.reasoningEffort;
        // Non-standard params (OpenRouter)
        if(parseFloat(s.topK) > 0) payload.top_k = parseFloat(s.topK);
        if(parseFloat(s.minP) > 0) payload.min_p = parseFloat(s.minP);
        if(parseFloat(s.topA) > 0) payload.top_a = parseFloat(s.topA);
        if(parseFloat(s.repetitionPenalty) !== 1) payload.repetition_penalty = parseFloat(s.repetitionPenalty);

        console.log('--- QuickFormat Spell Check Request ---');
        console.log(payload);

        const response = await fetch(`${s.apiBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
                'HTTP-Referer': 'http://localhost:8000',
                'X-Title': 'SillyTavern QuickFormat'
            },
            body: JSON.stringify(payload),
            signal: abortController.signal
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        if (s.stream) {
            textarea.value = ''; // Clear for stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6);
                        if (jsonStr === '[DONE]') break;
                        try {
                            const json = JSON.parse(jsonStr);
                            const content = json.choices[0]?.delta?.content || '';
                            if (content) {
                                textarea.value += content;
                                textarea.scrollTop = textarea.scrollHeight;
                            }
                        } catch (e) {}
                    }
                }
            }
        } else {
            const data = await response.json();
            const result = data.choices[0]?.message?.content;
            if (result) textarea.value = result;
        }
        
        // Trigger input event for resizing
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

    } catch (e) {
        if (e.name !== 'AbortError') {
            toastr.error('Generation Failed: ' + e.message);
            console.error(e);
        }
    } finally {
        isGenerating = false;
        renderGeneratingState(false);
    }
}

function renderGeneratingState(active) {
    const icon = active ? '<i class="fa-solid fa-square"></i>' : '<i class="fa-solid fa-wand-magic-sparkles"></i>';
    const title = active ? 'Stop Generation' : 'Enhance';
    
    // Update all enhance buttons (free or grouped)
    document.querySelectorAll('.qf-enhance-btn').forEach(btn => {
        btn.innerHTML = icon;
        btn.title = title;
        if(active) btn.classList.add('qf-btn-white'); // Force white for stop
        else applyStyles(); // Revert to user color
    });
}

function restoreUndo() {
    if (!undoBuffer) return;
    const textarea = document.getElementById('send_textarea');
    if (textarea) {
        textarea.value = undoBuffer;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        undoBuffer = null;
        updateUndoButtonState();
        toastr.success('Text Restored');
    }
}

function updateUndoButtonState() {
    const btns = document.querySelectorAll('.qf-undo-btn');
    btns.forEach(b => {
        b.style.opacity = undoBuffer ? '1' : '0.3';
        b.style.cursor = undoBuffer ? 'pointer' : 'default';
    });
}
