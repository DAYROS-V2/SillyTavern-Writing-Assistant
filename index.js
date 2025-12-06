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
let dragEl = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartLeft = 0;
let dragStartTop = 0;

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
    
    // Update UI
    $('#qf_pos_x').val(50); $('#qf_pos_x_val').text('50%');
    $('#qf_pos_y').val(50); $('#qf_pos_y_val').text('50%');
    $('#qf_ui_scale').val(1.0); $('#qf_ui_scale_val').text('1.0');
    
    // Force DOM reset
    if(container) {
        container.setAttribute('style', ''); // Wipe all inline styles
        applyStyles(); // Reapply defaults
    }
    toastr.info('Position Reset');
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
        container.style.transform = `translate(-50%, -50%) scale(${s.scale})`;
        
        // Update Buttons
        const color = s.btnColor || 'white';
        $('.qf-enhance-btn').removeClass('qf-btn-white qf-btn-gold qf-btn-purple qf-btn-green').addClass(`qf-btn-${color}`);
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
            b.style.transform = `translate(-50%, -50%) scale(${s.scale})`;
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

    // Click Action
    btn.addEventListener('pointerdown', (e) => {
        if (isEditing && !isFree) e.stopPropagation(); // Stop edit drag
    });
    btn.onclick = (e) => {
        if (isEditing) return;
        if (cfg.action) cfg.action();
        else insertTag(cfg.start, cfg.end);
    };

    return btn;
}

function createEditControls() {
    const div = document.createElement('div');
    div.className = 'quick-format-controls';
    
    const minus = document.createElement('button'); minus.innerText = '-'; minus.className = 'qf-control-btn zoom'; 
    minus.onclick = (e) => { e.stopPropagation(); updateSetting('scale', Math.max(0.5, (extension_settings[extensionName].scale - 0.1).toFixed(1))); };
    div.appendChild(minus);

    const save = document.createElement('button'); save.innerText = 'SAVE'; save.className = 'qf-control-btn save';
    save.onclick = (e) => { e.stopPropagation(); toggleEdit(false); };
    div.appendChild(save);

    const plus = document.createElement('button'); plus.innerText = '+'; plus.className = 'qf-control-btn zoom';
    plus.onclick = (e) => { e.stopPropagation(); updateSetting('scale', Math.min(2.0, (extension_settings[extensionName].scale + 0.1).toFixed(1))); };
    div.appendChild(plus);

    return div;
}

// --- POINTER EVENTS (DRAG) ---

function addDragListeners(el, isFreeBtn = false) {
    el.addEventListener('pointerdown', (e) => {
        if (!isEditing) return;
        if (e.target.closest('.qf-control-btn')) return; // Ignore controls
        
        e.preventDefault(); // Critical for mobile
        e.stopPropagation();

        dragEl = el;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        // Get current computed pixel position
        const rect = el.getBoundingClientRect();
        // Since we use transform: translate(-50%, -50%), the "visual" center is rect.left + width/2
        // But style.left is positioned at that center.
        
        // Let's grab the current style values (which might be %) and convert to px for the drag start
        // Actually, easiest is to just work in offsets from the CURRENT style.left/top
        // But since we want to move the ELEMENT, let's look at its center.
        
        dragStartLeft = rect.left + (rect.width / 2);
        dragStartTop = rect.top + (rect.height / 2);
        
        el.setPointerCapture(e.pointerId);
        
        el.onpointermove = (ev) => handleDragMove(ev);
        el.onpointerup = (ev) => handleDragEnd(ev, isFreeBtn);
    });
}

function handleDragMove(e) {
    if (!dragEl) return;
    e.preventDefault();
    
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    
    const newLeft = dragStartLeft + dx;
    const newTop = dragStartTop + dy;
    
    // Apply as pixels during drag for performance
    dragEl.style.left = newLeft + 'px';
    dragEl.style.top = newTop + 'px';
}

function handleDragEnd(e, isFreeBtn) {
    if (!dragEl) return;
    dragEl.onpointermove = null;
    dragEl.onpointerup = null;
    dragEl.releasePointerCapture(e.pointerId);

    // Convert final Pixel position to Percentage
    const rect = dragEl.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    
    const pctX = (centerX / window.innerWidth) * 100;
    const pctY = (centerY / window.innerHeight) * 100;
    
    const finalX = pctX.toFixed(2) + '%';
    const finalY = pctY.toFixed(2) + '%';
    
    // Save
    if (isFreeBtn) {
        const id = dragEl.dataset.id;
        if (!extension_settings[extensionName].freePositions) extension_settings[extensionName].freePositions = {};
        extension_settings[extensionName].freePositions[id] = { x: finalX, y: finalY };
    } else {
        extension_settings[extensionName].x = finalX;
        extension_settings[extensionName].y = finalY;
        
        // Update sliders if open
        $('#qf_pos_x').val(pctX); $('#qf_pos_x_val').text(finalX);
        $('#qf_pos_y').val(pctY); $('#qf_pos_y_val').text(finalY);
    }
    
    saveSettingsDebounced();
    
    // Re-apply as percentage
    dragEl.style.left = finalX;
    dragEl.style.top = finalY;
    
    dragEl = null;
}

function toggleEdit(val) {
    isEditing = val;
    if(container) {
        if(val) container.classList.add('editing');
        else container.classList.remove('editing');
        applyStyles();
    }
    if(freeContainer) {
        if(val) freeContainer.classList.add('editing');
        else freeContainer.classList.remove('editing');
        // Update free buttons z-index
        applyStyles();
    }
}

// --- TEXT & API UTILS ---

function insertTag(start, end) {
    const el = document.getElementById('send_textarea');
    if(!el) return;
    const s = el.selectionStart; const e = el.selectionEnd;
    const val = el.value;
    el.value = val.substring(0,s) + start + val.substring(s,e) + end + val.substring(e);
    el.selectionStart = s + start.length; 
    el.selectionEnd = s + start.length + (e-s);
    el.focus();
    el.dispatchEvent(new Event('input', {bubbles:true}));
}

function updateKeyDisplay() {
    const s = extension_settings[extensionName];
    const key = s.apiProvider === 'openai' ? s.apiKeyOpenAI : s.apiKeyOpenRouter;
    $('#qf_api_key').val(key || '');
    $('#qf_clear_key').toggle(!!key);
    $('#qf_fetch_container').toggle(s.apiProvider === 'openrouter');
}

async function fetchModels() {
    // ... (Same fetch logic as before) ...
    const settings = extension_settings[extensionName];
    const key = settings.apiProvider === 'openai' ? settings.apiKeyOpenAI : settings.apiKeyOpenRouter;
    if(!key) return toastr.error('Missing API Key');
    
    const btn = $('#qf_fetch_models');
    btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Fetching...');
    try {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` }
        });
        const data = await res.json();
        const sel = $('#qf_api_model').empty().append('<option disabled selected>Select...</option>');
        data.data.sort((a,b)=>a.id.localeCompare(b.id)).forEach(m => {
            sel.append(new Option(m.name || m.id, m.id));
        });
        toastr.success(`Fetched ${data.data.length} models`);
    } catch(e) {
        toastr.error('Fetch failed');
    } finally {
        btn.html('<i class="fa-solid fa-sync"></i> Fetch Models');
    }
}

async function enhanceText() {
    if (isGenerating) {
        if(abortController) abortController.abort();
        return;
    }
    const el = document.getElementById('send_textarea');
    if (!el || !el.value.trim()) return toastr.info('Empty input');
    
    const s = extension_settings[extensionName];
    const key = s.apiProvider === 'openai' ? s.apiKeyOpenAI : s.apiKeyOpenRouter;
    if (!key) return toastr.error('Missing API Key');
    
    undoBuffer = el.value;
    updateUndoButtonState();
    
    isGenerating = true;
    updateEnhanceBtn(true);
    abortController = new AbortController();
    
    try {
        const context = getContext();
        const msgs = [ { role: 'system', content: s.systemPrompt } ];
        
        // Add History
        const hist = context.chat.slice(-(s.contextLimit || 5));
        hist.forEach(h => msgs.push({ role: h.is_user ? 'user' : 'assistant', content: h.mes }));
        msgs.push({ role: 'user', content: el.value });
        
        const payload = {
            model: s.apiModel,
            messages: msgs,
            stream: s.stream,
            temperature: parseFloat(s.temperature),
            max_tokens: parseInt(s.maxTokens) || undefined,
            // ... add other params
        };

        const url = s.apiBase || (s.apiProvider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1');
        
        // PowerShell Log
        console.log('Chat Completion request:', payload);
        
        const res = await fetch(`${url.replace(/\/$/,'')}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'SillyTavern Quick Format'
            },
            body: JSON.stringify(payload),
            signal: abortController.signal
        });
        
        if(!res.ok) throw new Error(await res.text());
        
        if (s.stream) {
            el.value = '';
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            while(true) {
                const {done, value} = await reader.read();
                if(done) break;
                const chunk = dec.decode(value);
                const lines = chunk.split('\n');
                for(const line of lines) {
                    if(line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const json = JSON.parse(line.substring(6));
                            const txt = json.choices[0]?.delta?.content || '';
                            el.value += txt;
                            el.dispatchEvent(new Event('input', {bubbles:true}));
                        } catch(e){}
                    }
                }
            }
        } else {
            const json = await res.json();
            el.value = json.choices[0]?.message?.content || el.value;
            el.dispatchEvent(new Event('input', {bubbles:true}));
        }
    } catch (e) {
        if(e.name !== 'AbortError') toastr.error('Error: ' + e.message);
    } finally {
        isGenerating = false;
        abortController = null;
        updateEnhanceBtn(false);
    }
}

function restoreUndo() {
    if(!undoBuffer) return;
    const el = document.getElementById('send_textarea');
    el.value = undoBuffer;
    el.dispatchEvent(new Event('input', {bubbles:true}));
    undoBuffer = null;
    updateUndoButtonState();
}

function updateEnhanceBtn(active) {
    $('.qf-enhance-btn').each((_, btn) => {
        if(active) {
            btn.innerHTML = '<i class="fa-solid fa-stop"></i>';
            btn.classList.add('generating');
        } else {
            btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
            btn.classList.remove('generating');
        }
    });
}

function updateUndoButtonState() {
    $('.qf-undo-btn').css({opacity: undoBuffer ? 1 : 0.3, cursor: undoBuffer ? 'pointer' : 'default'});
}
