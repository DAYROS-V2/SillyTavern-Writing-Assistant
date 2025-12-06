import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "QuickFormatting";

// DYNAMIC PATH RESOLUTION
const scriptUrl = import.meta.url;
const extensionFolderPath = scriptUrl.substring(0, scriptUrl.lastIndexOf('/'));

// Default Config
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
    // Enhancer Settings
    enhancerEnabled: true,
    btnColor: 'white', // Default White
    apiProvider: 'openrouter',
    apiBase: 'https://openrouter.ai/api/v1',
    // Keys per provider
    apiKeyOpenRouter: '',
    apiKeyOpenAI: '',
    
    apiModel: '',
    contextLimit: 5,
    systemPrompt: 'You are a professional editor. Correct grammar, improve flow, and enhance the prose of the user input. Keep the tone consistent with the roleplay context provided. Do not add commentary, just output the enhanced text.',
    // Generation Params
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
let isDragging = false;
let undoBuffer = null; 
let preventApplyStyles = false; // Prevent position overrides during manual positioning

// API Control
let abortController = null;
let isGenerating = false;
let dragTarget = null;

// --- API HELPER ---
function getActiveKey() {
    const settings = extension_settings[extensionName];
    if (settings.apiProvider === 'openai') return settings.apiKeyOpenAI;
    return settings.apiKeyOpenRouter;
}

function updateKeyDisplay() {
    const settings = extension_settings[extensionName];
    const key = getActiveKey();
    
    $('#qf_api_key').val(key || '');
    if (key) $('#qf_clear_key').show();
    else $('#qf_clear_key').hide();
    
    if (settings.apiProvider === 'openai') {
        $('#qf_fetch_container').hide();
        $('#qf_api_base').attr('placeholder', '');
    } else {
        $('#qf_fetch_container').show();
        $('#qf_api_base').attr('placeholder', 'https://openrouter.ai/api/v1');
    }
}

async function fetchModels() {
    const settings = extension_settings[extensionName];
    const baseUrl = settings.apiBase.replace(/\/$/, '') || 'https://openrouter.ai/api/v1';
    const key = getActiveKey();

    if (!key) {
        toastr.error('Please enter an API Key for ' + settings.apiProvider + ' first.');
        return;
    }

    const btn = $('#qf_fetch_models');
    const originalIcon = btn.html();
    btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Fetching...');

    try {
        const response = await fetch(`${baseUrl}/models`, {
            headers: {
                'Authorization': `Bearer ${key}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'SillyTavern Quick Format'
            }
        });

        if (!response.ok) throw new Error('Failed to fetch models');
        
        const data = await response.json();
        const models = data.data || [];
        
        const select = $('#qf_api_model');
        select.empty();
        select.append('<option value="" disabled selected>Select a model...</option>');
        
        models.sort((a, b) => a.id.localeCompare(b.id)).forEach(m => {
            select.append(`<option value="${m.id}">${m.name || m.id}</option>`);
        });

        if (settings.apiModel) {
            select.val(settings.apiModel);
        }
        
        toastr.success(`Fetched ${models.length} models.`);
    } catch (e) {
        console.error(e);
        toastr.error('Error fetching models. Check console.');
    } finally {
        btn.html(originalIcon);
    }
}

async function enhanceText() {
    if (isGenerating && abortController) {
        abortController.abort();
        abortController = null;
        isGenerating = false;
        updateEnhanceButtonState(false);
        toastr.info('Enhancement stopped.');
        return;
    }

    const textarea = document.getElementById('send_textarea');
    if (!textarea || !textarea.value.trim()) {
        toastr.info('Type something to enhance first.');
        return;
    }

    const settings = extension_settings[extensionName];
    const key = getActiveKey();
    
    if (!key || !settings.apiModel) {
        toastr.error('Please configure API Key and Model in settings.');
        return;
    }

    undoBuffer = textarea.value;
    updateUndoButtonState();

    isGenerating = true;
    abortController = new AbortController();
    updateEnhanceButtonState(true);

    try {
        const context = getContext();
        const history = context.chat || [];
        const limit = parseInt(settings.contextLimit) || 0;
        
        const messages = [
            { role: 'system', content: settings.systemPrompt }
        ];

        if (settings.reasoningEffort && !settings.apiModel.includes('o1')) {
             messages[0].content += `\n\nPlease use ${settings.reasoningEffort} reasoning effort.`;
        }

        const relevantHistory = history.slice(-limit);
        relevantHistory.forEach(msg => {
            messages.push({
                role: msg.is_user ? 'user' : 'assistant',
                content: msg.mes 
            });
        });

        messages.push({ role: 'user', content: textarea.value });

        const baseUrl = (settings.apiBase && settings.apiBase.trim()) 
            ? settings.apiBase.replace(/\/$/, '') 
            : (settings.apiProvider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1');
        
        const payload = {
            model: settings.apiModel,
            messages: messages,
            stream: settings.stream
        };

        if (settings.maxTokens > 0) payload.max_tokens = parseInt(settings.maxTokens);
        if (settings.temperature >= 0) payload.temperature = parseFloat(settings.temperature);
        if (settings.frequencyPenalty !== 0) payload.frequency_penalty = parseFloat(settings.frequencyPenalty);
        if (settings.presencePenalty !== 0) payload.presence_penalty = parseFloat(settings.presencePenalty);
        if (settings.repetitionPenalty !== 1) payload.repetition_penalty = parseFloat(settings.repetitionPenalty);
        if (settings.topP < 1) payload.top_p = parseFloat(settings.topP);
        if (settings.topK > 0) payload.top_k = parseInt(settings.topK);
        if (settings.minP > 0) payload.min_p = parseFloat(settings.minP);
        if (settings.topA > 0) payload.top_a = parseFloat(settings.topA);
        if (settings.seed !== -1) payload.seed = parseInt(settings.seed);

        if (settings.reasoningEffort && settings.apiModel.includes('o1')) {
            payload.reasoning_effort = settings.reasoningEffort;
        }

        console.log('Chat Completion request:', {
            messages: payload.messages,
            model: payload.model,
            temperature: payload.temperature,
            max_tokens: payload.max_tokens,
            stream: payload.stream,
            presence_penalty: payload.presence_penalty,
            frequency_penalty: payload.frequency_penalty,
            top_p: payload.top_p,
            top_k: payload.top_k,
            seed: payload.seed,
            reasoning: settings.reasoningEffort ? { effort: settings.reasoningEffort } : undefined
        });

        const response = await fetch(`${baseUrl}/chat/completions`, {
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

        if (!response.ok) {
            const err = await response.text();
            throw new Error(err);
        }

        if (settings.stream) {
            console.log('Streaming request in progress');
            textarea.value = ""; 
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                
                const lines = buffer.split('\n');
                buffer = lines.pop(); 

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.trim() === 'data: [DONE]') continue;
                    
                    if (line.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(line.substring(6));
                            const delta = json.choices[0]?.delta?.content;
                            if (delta) {
                                textarea.value += delta;
                                textarea.scrollTop = textarea.scrollHeight; 
                                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        } catch (e) {
                            // ignore
                        }
                    }
                }
            }
            console.log('Streaming request finished');
        } else {
            const data = await response.json();
            const result = data.choices[0]?.message?.content;
            console.log('Request finished. Response:', result);
            if (result) {
                textarea.value = result;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error(e);
            toastr.error('Enhancement failed. See console.');
        }
    } finally {
        isGenerating = false;
        abortController = null;
        updateEnhanceButtonState(false);
    }
}

function updateEnhanceButtonState(generating) {
    const btns = document.querySelectorAll('.qf-enhance-btn');
    btns.forEach(b => {
        if (generating) {
            b.innerHTML = '<i class="fa-solid fa-stop"></i>';
            b.classList.add('generating');
            b.title = "Stop Generating";
        } else {
            b.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
            b.classList.remove('generating');
            b.title = "Enhance";
        }
    });
}

function restoreUndo() {
    if (undoBuffer === null) return;
    const textarea = document.getElementById('send_textarea');
    if (textarea) {
        textarea.value = undoBuffer;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        undoBuffer = null;
        updateUndoButtonState();
        toastr.info('Text restored.');
    }
}

function updateUndoButtonState() {
    const btns = document.querySelectorAll('.qf-undo-btn');
    btns.forEach(b => {
        b.style.opacity = undoBuffer ? '1' : '0.3';
        b.style.cursor = undoBuffer ? 'pointer' : 'default';
    });
}

// --- SETTINGS MANAGEMENT ---

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    for (const key in defaultSettings) {
        if (typeof extension_settings[extensionName][key] === 'undefined') {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
    const settings = extension_settings[extensionName];

    if (settings.y === '85%') {
         settings.y = '50%';
         extension_settings[extensionName].y = '50%';
         saveSettingsDebounced();
    }

    $('#qf_global_enabled').prop('checked', settings.enabled);
    $('#qf_layout_mode').val(settings.layoutMode || 'grouped');
    
    formattingButtons.forEach(btn => {
        if (!settings.hiddenButtons) settings.hiddenButtons = {};
        const isHidden = settings.hiddenButtons[btn.id] === true;
        $(`#qf_toggle_${btn.id}`).prop('checked', !isHidden);
    });

    $('#qf_enhancer_enabled').prop('checked', settings.enhancerEnabled);
    $('#qf_btn_color').val(settings.btnColor || 'white');
    
    // Sliders
    $('#qf_ui_scale').val(settings.scale || 1.0);
    $('#qf_ui_scale_val').text(settings.scale || 1.0);
    
    $('#qf_pos_x').val(parseFloat(settings.x) || 50);
    $('#qf_pos_x_val').text((parseFloat(settings.x) || 50) + '%');
    
    $('#qf_pos_y').val(parseFloat(settings.y) || 50);
    $('#qf_pos_y_val').text((parseFloat(settings.y) || 50) + '%');

    $('#qf_z_index').val(settings.zIndex || 800);
    $('#qf_z_index_val').text(settings.zIndex || 800);
    
    $('#qf_api_provider').val(settings.apiProvider);
    $('#qf_api_base').val(settings.apiBase);
    
    updateKeyDisplay(); 

    // Params
    $('#qf_reasoning_effort').val(settings.reasoningEffort);
    $('#qf_context_limit').val(settings.contextLimit);
    $('#qf_system_prompt').val(settings.systemPrompt);
    $('#qf_stream').prop('checked', settings.stream);
    $('#qf_max_tokens').val(settings.maxTokens);
    $('#qf_temp').val(settings.temperature);
    $('#qf_freq_pen').val(settings.frequencyPenalty);
    $('#qf_pres_pen').val(settings.presencePenalty);
    $('#qf_rep_pen').val(settings.repetitionPenalty);
    $('#qf_top_k').val(settings.topK);
    $('#qf_top_p').val(settings.topP);
    $('#qf_min_p').val(settings.minP);
    $('#qf_top_a').val(settings.topA);
    $('#qf_seed').val(settings.seed);
    $('#qf_reasoning_effort').val(settings.reasoningEffort);
    
    if(settings.apiModel) {
        if ($('#qf_api_model option[value="' + settings.apiModel + '"]').length === 0) {
            $('#qf_api_model').append(new Option(settings.apiModel, settings.apiModel, true, true));
        }
        $('#qf_api_model').val(settings.apiModel);
    }
    
    if (!settings.x || !settings.y) {
        updateSetting('x', '50%');
        updateSetting('y', '50%');
    }

    renderUI(true); 
}

function updateSetting(key, value) {
    extension_settings[extensionName][key] = value;
    saveSettingsDebounced();
    
    const rebuildRequired = 
        key === 'layoutMode' || 
        key === 'enabled' || 
        key === 'enhancerEnabled';

    if (rebuildRequired) {
        renderUI(true);
    } else {
        applyStyles(); 
    }
}

function toggleButtonVisibility(btnId, isVisible) {
    if (!extension_settings[extensionName].hiddenButtons) {
        extension_settings[extensionName].hiddenButtons = {};
    }
    if (isVisible) delete extension_settings[extensionName].hiddenButtons[btnId];
    else extension_settings[extensionName].hiddenButtons[btnId] = true;
    
    saveSettingsDebounced();
    renderUI(true);
}

function adjustScale(delta) {
    const settings = extension_settings[extensionName];
    let newScale = (parseFloat(settings.scale) || 1.0) + delta;
    newScale = Math.max(0.5, Math.min(2.0, newScale));
    newScale = Math.round(newScale * 10) / 10;
    
    $('#qf_ui_scale').val(newScale);
    $('#qf_ui_scale_val').text(newScale);
    updateSetting('scale', newScale);
}

// --- UI RENDERING ---

function applyStyles() {
    const settings = extension_settings[extensionName];
    
    if (container) {
        // Calculate actual pixel positions from percentages
        const pctX = parseFloat(settings.x) || 50;
        const pctY = parseFloat(settings.y) || 50;
        
        // Use margin to center instead of transform
        const leftPx = `${pctX}%`;
        const topPx = `${pctY}%`;
        
        // Don't override position if we're manually positioning
        if (!preventApplyStyles) {
            console.log('[QF Mobile Debug] applyStyles setting position to:', leftPx, topPx);
            container.style.left = leftPx;
            container.style.top = topPx;
            container.style.marginLeft = '0';
            container.style.marginTop = '0';
        } else {
            console.log('[QF Mobile Debug] applyStyles blocked by preventApplyStyles flag');
        }
        
        // Only apply scale transform
        container.style.transform = `scale(${settings.scale})`;
        container.style.transformOrigin = '0 0'; // Transform from top-left corner
        
        // Apply Z-Index (Override if editing)
        container.style.zIndex = isEditing ? '20000' : (settings.zIndex || 800);
    }
    
    // Update Button Colors
    const enhanceBtns = document.querySelectorAll('.qf-enhance-btn');
    enhanceBtns.forEach(btn => {
        btn.classList.remove('qf-btn-white', 'qf-btn-gold', 'qf-btn-purple', 'qf-btn-green');
        btn.classList.add('qf-btn-' + (settings.btnColor || 'white'));
    });
    
    if (settings.layoutMode === 'free') {
        const freeBtns = document.querySelectorAll('.qf-free-mode-btn');
        freeBtns.forEach(btn => {
            btn.style.transform = `translate(-50%, -50%) scale(${settings.scale || 1})`;
            btn.style.zIndex = isEditing ? '20000' : (settings.zIndex || 800);
        });
    }
}

function renderUI(forceRebuild = false) {
    const settings = extension_settings[extensionName];
    
    if (forceRebuild) {
        if (container) container.remove();
        if (freeContainer) freeContainer.remove();
        container = null;
        freeContainer = null;
    } else if (container || freeContainer) {
        applyStyles();
        return; 
    }

    if (!settings.enabled || !document.getElementById('send_textarea')) return;

    if (settings.layoutMode === 'free') {
        renderFree();
    } else {
        renderGrouped();
    }
    applyStyles();
}

function insertTag(startTag, endTag) {
    if (isEditing) return;
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;
    textarea.focus();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const fullText = textarea.value;
    const selectedText = fullText.substring(start, end);
    const replacement = startTag + selectedText + endTag;
    
    if (typeof textarea.setRangeText === 'function') {
        textarea.setRangeText(replacement, start, end, 'select');
    } else {
        textarea.value = fullText.substring(0, start) + replacement + fullText.substring(end);
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function createBtn(cfg, isFree = false) {
    const settings = extension_settings[extensionName];
    const btn = document.createElement('button');
    btn.className = 'quick-format-btn';
    btn.dataset.id = cfg.id;
    
    if (cfg.icon) btn.innerHTML = cfg.icon;
    else btn.innerText = cfg.label;
    
    btn.title = cfg.title;
    
    if (cfg.isEnhance) {
        const color = settings.btnColor || 'white';
        btn.classList.add('qf-enhance-btn');
        if (color === 'purple') btn.classList.add('qf-btn-purple');
        else if (color === 'green') btn.classList.add('qf-btn-green');
        else if (color === 'white') btn.classList.add('qf-btn-white');
    }
    if (cfg.isUndo) {
        btn.classList.add('qf-undo-btn');
    }

    if (!isFree) {
        btn.onclick = (e) => { 
            e.preventDefault(); 
            if(!isEditing) cfg.action(); 
        };
    } else {
        btn.classList.add('qf-free-mode-btn');
        const pos = settings.freePositions?.[cfg.id] || { x: '50%', y: '50%' };
        btn.style.left = pos.x;
        btn.style.top = pos.y;
        
        btn.onclick = (e) => {
            if(!isEditing) { e.preventDefault(); cfg.action(); }
        };
        
        btn.addEventListener('mousedown', (e) => handleFreeStart(e, btn));
        btn.addEventListener('touchstart', (e) => handleFreeStart(e, btn), { passive: false });
        btn.addEventListener('dblclick', (e) => {
            isEditing = !isEditing;
            toggleEditMode(isEditing);
            e.stopPropagation();
        });
    }

    btn.onmousedown = (e) => { if(isEditing && !isFree) e.stopPropagation(); }; 
    btn.ontouchstart = (e) => { if(isEditing && !isFree) e.stopPropagation(); };

    return btn;
}

function createControls(isFree = false) {
    const controls = document.createElement('div');
    controls.className = 'quick-format-controls';
    if(isFree) controls.classList.add('qf-free-save-btn');

    const minusBtn = document.createElement('button');
    minusBtn.innerText = '-';
    minusBtn.className = 'qf-control-btn zoom';
    minusBtn.onclick = (e) => { e.stopPropagation(); adjustScale(-0.1); };
    controls.appendChild(minusBtn);

    const doneBtn = document.createElement('button');
    doneBtn.innerText = 'SAVE';
    doneBtn.className = 'qf-control-btn save';
    doneBtn.onclick = (e) => { e.stopPropagation(); toggleEditMode(false); };
    controls.appendChild(doneBtn);

    const plusBtn = document.createElement('button');
    plusBtn.innerText = '+';
    plusBtn.className = 'qf-control-btn zoom';
    plusBtn.onclick = (e) => { e.stopPropagation(); adjustScale(0.1); };
    controls.appendChild(plusBtn);

    return controls;
}

function renderGrouped() {
    const settings = extension_settings[extensionName];
    container = document.createElement('div');
    container.id = 'quick-format-bar';
    container.className = 'quick-format-container';
    if (settings.layoutMode === 'vertical') {
        container.classList.add('vertical');
    }
    
    // Initial positioning - will be updated by applyStyles
    container.style.left = settings.x;
    container.style.top = settings.y;
    container.style.position = 'fixed';
    container.style.touchAction = 'none'; // Prevent browser touch gestures from interfering

    formattingButtons.forEach(cfg => {
        if (settings.hiddenButtons[cfg.id]) return;
        container.appendChild(createBtn({
            ...cfg,
            action: () => insertTag(cfg.start, cfg.end)
        }));
    });

    if (settings.enhancerEnabled) {
        const div = document.createElement('div');
        div.className = 'qf-divider';
        container.appendChild(div);

        container.appendChild(createBtn({
            id: 'qf_btn_enhance',
            icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>',
            title: 'Enhance',
            isEnhance: true,
            action: enhanceText
        }));

        container.appendChild(createBtn({
            id: 'qf_btn_undo',
            icon: '<i class="fa-solid fa-rotate-left"></i>',
            title: 'Undo',
            isUndo: true,
            action: restoreUndo
        }));
    }

    container.appendChild(createControls(false));
    container.addEventListener('dblclick', () => toggleEditMode(true));
    container.addEventListener('mousedown', handleGroupStart);
    container.addEventListener('touchstart', handleGroupStart, { passive: false });

    document.body.appendChild(container);
    if(undoBuffer) updateUndoButtonState();
}

function toggleEditMode(enabled) {
    isEditing = enabled;
    if(container) {
        if(enabled) container.classList.add('editing');
        else container.classList.remove('editing');
        applyStyles(); // Updates z-index for edit mode
    }
    if(freeContainer) {
        if(enabled) freeContainer.classList.add('editing');
        else freeContainer.classList.remove('editing');
    }
}

let startX, startY, initialX, initialY;

function handleGroupStart(e) {
    if(!isEditing) return;
    if(e.target.closest('.qf-control-btn')) return;

    e.preventDefault();
    e.stopPropagation();
    
    isDragging = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    startX = clientX;
    startY = clientY;
    
    console.log('[QF Mobile Debug] Drag started at clientX:', clientX, 'clientY:', clientY);
    
    const rect = container.getBoundingClientRect();
    initialX = rect.left + rect.width/2;
    initialY = rect.top + rect.height/2;
    
    console.log('[QF Mobile Debug] Initial center at X:', initialX, 'Y:', initialY);
    
    // Prevent any browser default behaviors
    if (e.touches) {
        document.body.style.overflow = 'hidden'; // Prevent scrolling during drag
    }

    document.addEventListener('mousemove', handleGroupMove);
    document.addEventListener('touchmove', handleGroupMove, { passive: false });
    document.addEventListener('mouseup', handleGroupEnd);
    document.addEventListener('touchend', handleGroupEnd);
}

function handleGroupMove(e) {
    if(!isDragging) return;
    e.preventDefault();
    e.stopPropagation(); // Stop event bubbling
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const dx = clientX - startX;
    const dy = clientY - startY;
    
    console.log('[QF Mobile Debug] Moving - dx:', dx, 'dy:', dy, 'clientY:', clientY, 'startY:', startY);
    
    const newLeft = (initialX + dx) + 'px';
    const newTop = (initialY + dy) + 'px';
    
    container.style.left = newLeft;
    container.style.top = newTop;
    
    console.log('[QF Mobile Debug] Set position to:', newLeft, newTop);
    
    // On-screen debug display
    showDebugInfo(`dx: ${dx.toFixed(0)}, dy: ${dy.toFixed(0)}<br>Top: ${newTop}<br>clientY: ${clientY.toFixed(0)}`);
}

function showDebugInfo(html) {
    let debugDiv = document.getElementById('qf-debug-display');
    if (!debugDiv) {
        debugDiv = document.createElement('div');
        debugDiv.id = 'qf-debug-display';
        debugDiv.style.cssText = 'position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.9); color: lime; padding: 10px; font-family: monospace; font-size: 12px; z-index: 99999; border: 2px solid lime; max-width: 300px;';
        document.body.appendChild(debugDiv);
    }
    debugDiv.innerHTML = html;
}

function handleGroupEnd() {
    if(isDragging) {
        isDragging = false;
        preventApplyStyles = true;
        
        // Restore body scrolling
        document.body.style.overflow = '';
        
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const rect = container.getBoundingClientRect();
        
        // Use top-left corner instead of center since we're not using translate
        const pctX = (rect.left / winW) * 100;
        const pctY = (rect.top / winH) * 100;
        
        console.log('[QF Mobile Debug] Drag ended at:', { pctX, pctY, winW, winH, rectLeft: rect.left, rectTop: rect.top });
        
        showDebugInfo(`DRAG END<br>X: ${pctX.toFixed(1)}%<br>Y: ${pctY.toFixed(1)}%<br>Saved!`);
        
        // Update settings
        extension_settings[extensionName].x = pctX.toFixed(2) + '%';
        extension_settings[extensionName].y = pctY.toFixed(2) + '%';
        
        console.log('[QF Mobile Debug] Settings updated to:', extension_settings[extensionName].x, extension_settings[extensionName].y);
        
        saveSettingsDebounced();
        
        // Sync sliders
        $('#qf_pos_x').val(pctX);
        $('#qf_pos_x_val').text(pctX.toFixed(0) + '%');
        $('#qf_pos_y').val(pctY);
        $('#qf_pos_y_val').text(pctY.toFixed(0) + '%');

        // Force repaint on next frame
        requestAnimationFrame(() => {
            container.style.left = extension_settings[extensionName].x;
            container.style.top = extension_settings[extensionName].y;
            console.log('[QF Mobile Debug] Applied final position:', container.style.left, container.style.top);
            void container.offsetHeight;
            
            setTimeout(() => {
                preventApplyStyles = false;
                console.log('[QF Mobile Debug] preventApplyStyles cleared');
                setTimeout(() => {
                    const debugDiv = document.getElementById('qf-debug-display');
                    if (debugDiv) debugDiv.remove();
                }, 2000);
            }, 100);
        });
        
        document.removeEventListener('mousemove', handleGroupMove);
        document.removeEventListener('mouseup', handleGroupEnd);
        document.removeEventListener('touchmove', handleGroupMove);
        document.removeEventListener('touchend', handleGroupEnd);
    }
}

function renderFree() {
    const settings = extension_settings[extensionName];
    freeContainer = document.createElement('div');
    freeContainer.className = 'qf-free-container';
    
    formattingButtons.forEach(cfg => {
        if (settings.hiddenButtons[cfg.id]) return;
        freeContainer.appendChild(createBtn({
            ...cfg,
            action: () => insertTag(cfg.start, cfg.end)
        }, true));
    });

    if (settings.enhancerEnabled) {
        freeContainer.appendChild(createBtn({
            id: 'qf_btn_enhance',
            icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>',
            title: 'Enhance',
            isEnhance: true,
            action: enhanceText
        }, true));

        freeContainer.appendChild(createBtn({
            id: 'qf_btn_undo',
            icon: '<i class="fa-solid fa-rotate-left"></i>',
            title: 'Undo',
            isUndo: true,
            action: restoreUndo
        }, true));
    }
    
    const controls = createControls(true);
    controls.style.left = settings.x;
    controls.style.top = settings.y;
    controls.style.transform = 'translate(-50%, -50%)'; 
    freeContainer.appendChild(controls);
    
    document.body.appendChild(freeContainer);
    if(isEditing) freeContainer.classList.add('editing');
}

function handleFreeStart(e, btn) {
    if(!isEditing) return;
    e.stopPropagation();
    dragTarget = btn;
    isDragging = true;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    startX = clientX;
    startY = clientY;
    
    const rect = btn.getBoundingClientRect();
    initialX = rect.left + rect.width/2;
    initialY = rect.top + rect.height/2;

    document.addEventListener('mousemove', handleFreeMove);
    document.addEventListener('touchmove', handleFreeMove, { passive: false });
    document.addEventListener('mouseup', handleFreeEnd);
    document.addEventListener('touchend', handleFreeEnd);
}

function handleFreeMove(e) {
    if(!isDragging || !dragTarget) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const dx = clientX - startX;
    const dy = clientY - startY;
    
    dragTarget.style.left = (initialX + dx) + 'px';
    dragTarget.style.top = (initialY + dy) + 'px';
}

function handleFreeEnd() {
    if(isDragging && dragTarget) {
        isDragging = false;
        
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const rect = dragTarget.getBoundingClientRect();
        const cx = rect.left + rect.width/2;
        const cy = rect.top + rect.height/2;
        
        const pctX = (cx / winW) * 100;
        const pctY = (cy / winH) * 100;
        
        const id = dragTarget.dataset.id;
        if (!extension_settings[extensionName].freePositions) extension_settings[extensionName].freePositions = {};
        
        const newPos = {
            x: pctX.toFixed(2) + '%',
            y: pctY.toFixed(2) + '%'
        };
        
        extension_settings[extensionName].freePositions[id] = newPos;
        
        saveSettingsDebounced();
        
        // Force update style to percent immediately
        dragTarget.style.left = newPos.x;
        dragTarget.style.top = newPos.y;
        
        dragTarget = null;
        
        document.removeEventListener('mousemove', handleFreeMove);
        document.removeEventListener('mouseup', handleFreeEnd);
        document.removeEventListener('touchmove', handleFreeMove);
        document.removeEventListener('touchend', handleFreeEnd);
    }
}

jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
    } catch (e) {
        console.error('[QuickFormatting] Failed to load settings.html', e);
    }

    const buttonList = $('#qf_buttons_container');
    formattingButtons.forEach(btn => {
        buttonList.append(`
            <label class="checkbox_label">
                <input id="qf_toggle_${btn.id}" type="checkbox" checked />
                <span>${btn.label} <small>(${btn.title})</small></span>
            </label>
        `);
        $(document).on('change', `#qf_toggle_${btn.id}`, function() {
            toggleButtonVisibility(btn.id, $(this).prop('checked'));
        });
    });

    $('#qf_global_enabled').on('change', function() { updateSetting('enabled', $(this).prop('checked')); });
    $('#qf_layout_mode').on('change', function() { updateSetting('layoutMode', $(this).val()); });
    
    // Position Sliders
    $('#qf_pos_x').on('input', function() {
        const val = $(this).val();
        $('#qf_pos_x_val').text(val + '%');
        
        preventApplyStyles = true;
        updateSetting('x', val + '%');
        
        if (container) {
            requestAnimationFrame(() => {
                container.style.left = val + '%';
                void container.offsetHeight;
                
                setTimeout(() => {
                    preventApplyStyles = false;
                }, 100);
            });
        }
    });
    
    $('#qf_pos_y').on('input', function() {
        const val = $(this).val();
        $('#qf_pos_y_val').text(val + '%');
        
        preventApplyStyles = true; // Prevent override during manual adjustment
        updateSetting('y', val + '%');
        
        // Force immediate update on mobile
        if (container) {
            requestAnimationFrame(() => {
                container.style.top = val + '%';
                void container.offsetHeight; // Force reflow
                
                // Re-enable after delay
                setTimeout(() => {
                    preventApplyStyles = false;
                }, 100);
            });
        }
    });

    $('#qf_z_index').on('input', function() {
        const val = $(this).val();
        $('#qf_z_index_val').text(val);
        updateSetting('zIndex', val);
    });

    $('#qf_reset_pos').on('click', function() {
        // Reset Logic
        updateSetting('x', '50%');
        updateSetting('y', '50%');
        updateSetting('scale', 1.0);
        updateSetting('zIndex', 800);
        updateSetting('freePositions', {});
        
        // Reset Slider UI
        $('#qf_pos_x').val(50); $('#qf_pos_x_val').text('50%');
        $('#qf_pos_y').val(50); $('#qf_pos_y_val').text('50%');
        $('#qf_ui_scale').val(1.0); $('#qf_ui_scale_val').text('1.0');
        $('#qf_z_index').val(800); $('#qf_z_index_val').text('800');

        // Force immediate rebuild
        renderUI(true);
        
        toastr.info('Position & Size reset.');
    });

    $('#qf_enhancer_enabled').on('change', function() { updateSetting('enhancerEnabled', $(this).prop('checked')); });
    $('#qf_btn_color').on('change', function() { updateSetting('btnColor', $(this).val()); });
    
    $('#qf_ui_scale').on('input', function() { 
        $('#qf_ui_scale_val').text($(this).val());
        updateSetting('scale', $(this).val());
    });
    
    $('#qf_api_provider').on('change', function() { 
        const newProvider = $(this).val();
        updateSetting('apiProvider', newProvider);
        
        // Handle Base URL Defaults
        const currentBase = $('#qf_api_base').val();
        if (newProvider === 'openai') {
            if (currentBase === 'https://openrouter.ai/api/v1') {
                updateSetting('apiBase', '');
                $('#qf_api_base').val('');
            }
        } else {
            if (!currentBase) {
                updateSetting('apiBase', 'https://openrouter.ai/api/v1');
                $('#qf_api_base').val('https://openrouter.ai/api/v1');
            }
        }
        updateKeyDisplay();
    });
    $('#qf_api_base').on('change', function() { updateSetting('apiBase', $(this).val()); });
    
    $('#qf_api_key').on('change', function() { 
        const val = $(this).val();
        const settings = extension_settings[extensionName];
        const isOA = settings.apiProvider === 'openai';
        updateSetting(isOA ? 'apiKeyOpenAI' : 'apiKeyOpenRouter', val);
        if (val) $('#qf_clear_key').show();
        else $('#qf_clear_key').hide();
    });

    $('#qf_clear_key').on('click', function() {
        const settings = extension_settings[extensionName];
        const isOA = settings.apiProvider === 'openai';
        updateSetting(isOA ? 'apiKeyOpenAI' : 'apiKeyOpenRouter', '');
        $('#qf_api_key').val('');
        $(this).hide();
        toastr.info('API Key cleared for ' + settings.apiProvider);
    });

    $('#qf_api_model').on('change', function() { updateSetting('apiModel', $(this).val()); });
    $('#qf_context_limit').on('change', function() { updateSetting('contextLimit', $(this).val()); });
    $('#qf_system_prompt').on('input', function() { updateSetting('systemPrompt', $(this).val()); });
    
    $('#qf_stream').on('change', function() { updateSetting('stream', $(this).prop('checked')); });
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

    $('#qf_fetch_models').on('click', fetchModels);

    loadSettings();
    
    setInterval(() => {
        const textarea = document.getElementById('send_textarea');
        const isVisible = textarea && (textarea.offsetParent !== null || document.body.offsetParent !== null);
        
        if (container) {
            container.style.display = isVisible ? 'flex' : 'none';
        }
        if (freeContainer) {
            freeContainer.style.display = isVisible ? 'block' : 'none';
        }
    }, 500);
});
