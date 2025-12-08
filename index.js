import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "QuickFormatting";
const scriptUrl = import.meta.url;
const extensionFolderPath = scriptUrl.substring(0, scriptUrl.lastIndexOf('/'));

// --- DEFAULTS ---
const defaultSettings = {
    enabled: true, mobileStyle: 'docked', x: '50%', y: '0px', zIndex: 2000, scale: 1.0,
    hiddenButtons: { 'btn_ooc': true, 'btn_code': true },
    
    // --- LAYOUT MODE ---
    groupedWidgets: false, // NEW: Toggles the 2x2 Grid
    quadX: '10%', quadY: '200px', // Coordinates for the grid

    // --- POSITIONS (Individual) ---
    moodBtnEnabled: true, moodX: '85%', moodY: '0px',
    replyBtnEnabled: true, replyX: '15%', replyY: '0px',
    toolsBtnEnabled: true, 
    spellX: '15%', spellY: '50px',
    undoX: '25%', undoY: '50px',

    // Global Toggle
    useGlobalApi: true, 

    // --- API SETTINGS (Truncated for brevity, same as before) ---
    globalProvider: 'openrouter', globalBase: 'https://openrouter.ai/api/v1', globalKeyOR: '', globalKeyOA: '', globalModel: '',
    globalStream: true, globalContext: 5, globalTokens: 0,
    globalTemp: 1.0, globalFreqPen: 0.0, globalPresPen: 0.0, globalRepPen: 1.0,
    globalTopK: 0, globalTopP: 1.0, globalMinP: 0.0, globalTopA: 0.0, globalSeed: -1,

    spellProvider: 'openrouter', spellBase: 'https://openrouter.ai/api/v1', spellKeyOR: '', spellKeyOA: '', spellModel: '', 
    spellStream: true, spellContext: 5, spellTokens: 0,
    spellTemp: 1.0, spellFreqPen: 0.0, spellPresPen: 0.0, spellRepPen: 1.0,
    spellTopK: 0, spellTopP: 1.0, spellMinP: 0.0, spellTopA: 0.0, spellSeed: -1,
    spellPrompt: 'Correct grammar and spelling.',

    moodProvider: 'openrouter', moodBase: 'https://openrouter.ai/api/v1', moodKeyOR: '', moodKeyOA: '', moodModel: '',
    moodStream: true, moodContext: 5, moodTokens: 0,
    moodTemp: 1.2, moodFreqPen: 0.0, moodPresPen: 0.0, moodRepPen: 1.0,
    moodTopK: 0, moodTopP: 1.0, moodMinP: 0.0, moodTopA: 0.0, moodSeed: -1,
    moodUniversalPrompt: 'You will edit the text sent to match the tone provided:',

    replyProvider: 'openrouter', replyBase: 'https://openrouter.ai/api/v1', replyKeyOR: '', replyKeyOA: '', replyModel: '',
    replyStream: true, replyContext: 10, replyTokens: 200,
    replyTemp: 0.8, replyFreqPen: 0.5, replyPresPen: 0.0, replyRepPen: 1.1,
    replyTopK: 40, replyTopP: 0.9, replyMinP: 0.0, replyTopA: 0.0, replySeed: -1,
    replyPrompt: 'Write a creative response.',

    moods: [
        { id: 'formal', label: 'Formal', icon: 'fa-user-tie', prompt: 'Tone: Formal, eloquent, and polite.' },
        { id: 'angry', label: 'Angry', icon: 'fa-fire', prompt: 'Tone: Aggressive, furious, and short-tempered.' },
        { id: 'flirty', label: 'Flirty', icon: 'fa-heart', prompt: 'Tone: Charming, playful, and romantic.' },
        { id: 'sad', label: 'Sad', icon: 'fa-face-sad-tear', prompt: 'Tone: Melancholic, hopeless, and emotional.' }
    ]
};

const formattingButtons = [
    { id: 'btn_action', label: '*', start: '*', end: '*', title: 'Action' },
    { id: 'btn_quote', label: '"', start: '"', end: '"', title: 'Dialogue' },
    { id: 'btn_ooc', label: '(OOC)', start: '(OOC: ', end: ')', title: 'OOC' },
    { id: 'btn_code', label: '```', start: '```', end: '```', title: 'Thoughts/Code' }
];

let container = null; 
let moodContainer = null;
let replyContainer = null;
let spellContainer = null; 
let undoContainer = null; 
let quadContainer = null; // NEW: The Grid Container

let isEditing = false;
let isGenerating = false;
let abortController = null;
let undoBuffer = null; 
let activeDragEl = null;
let dragStartCoords = { x: 0, y: 0 };
let dragStartPos = { x: 0, y: 0, keyX: 'x', keyY: 'y' }; 
let resizeObserver = null;

// --- INITIALIZATION ---
jQuery(async () => {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
        const link = document.createElement("link");
        link.href = `${extensionFolderPath}/style.css`;
        link.type = "text/css";
        link.rel = "stylesheet";
        document.head.appendChild(link);
    } catch (e) { console.error(e); }
    loadSettings();
    initSettingsListeners();
    setTimeout(() => { renderUI(); }, 1000);
});

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
    if (['mobileStyle', 'enabled', 'moodBtnEnabled', 'replyBtnEnabled', 'toolsBtnEnabled', 'useGlobalApi', 'groupedWidgets'].includes(key)) {
        renderUI(true);
        if (key === 'useGlobalApi') syncSettingsToUI();
    } else {
        updateContainerStyles();
    }
}

// --- SETTINGS SYNC ---
function syncSettingsToUI() {
    const s = extension_settings[extensionName];
    
    $('#qf_global_enabled').prop('checked', s.enabled);
    $('#qf_use_global').prop('checked', s.useGlobalApi);
    $('#qf_mood_enabled').prop('checked', s.moodBtnEnabled);
    $('#qf_reply_enabled').prop('checked', s.replyBtnEnabled);
    $('#qf_tools_enabled').prop('checked', s.toolsBtnEnabled);
    $('#qf_grouped_widgets').prop('checked', s.groupedWidgets); // NEW

    if (s.useGlobalApi) { $('#qf_section_global_api').show(); $('.qf-specific-api').hide(); } 
    else { $('#qf_section_global_api').hide(); $('.qf-specific-api').show(); }

    // (Standard API sync logic omitted for brevity, same as previous)
    ['global', 'spell', 'mood', 'reply'].forEach(p => {
        $(`#qf_${p}_provider`).val(s[`${p}Provider`]);
        $(`#qf_${p}_base`).val(s[`${p}Base`]);
        const isOA = s[`${p}Provider`] === 'openai';
        $(`#qf_${p}_key`).val(isOA ? s[`${p}KeyOA`] : s[`${p}KeyOR`]);
        $(`#qf_${p}_stream`).prop('checked', s[`${p}Stream`]);
        $(`#qf_${p}_context`).val(s[`${p}Context`]);
        $(`#qf_${p}_tokens`).val(s[`${p}Tokens`]);
        $(`#qf_${p}_seed`).val(s[`${p}Seed`]);
        $(`#qf_${p}_temp`).val(s[`${p}Temp`]);
        $(`#qf_${p}_freq_pen`).val(s[`${p}FreqPen`]);
        $(`#qf_${p}_pres_pen`).val(s[`${p}PresPen`]);
        $(`#qf_${p}_rep_pen`).val(s[`${p}RepPen`]);
        $(`#qf_${p}_top_k`).val(s[`${p}TopK`]);
        $(`#qf_${p}_top_p`).val(s[`${p}TopP`]);
        $(`#qf_${p}_min_p`).val(s[`${p}MinP`]);
        $(`#qf_${p}_top_a`).val(s[`${p}TopA`]);

        const modelSel = $(`#qf_${p}_model`);
        const savedModel = s[`${p}Model`];
        if (savedModel && modelSel.find(`option[value="${savedModel}"]`).length === 0) {
            modelSel.append(new Option(savedModel, savedModel, true, true));
        }
        modelSel.val(savedModel);
    });

    $('#qf_buttons_list').empty();
    formattingButtons.forEach(btn => {
        $('#qf_buttons_list').append(`
            <label class="checkbox_label">
                <input class="qf-btn-toggle" data-id="${btn.id}" type="checkbox" ${!s.hiddenButtons[btn.id] ? 'checked' : ''} />
                <span>${btn.label} <small>(${btn.title})</small></span>
            </label>
        `);
    });

    $('#qf_spell_prompt').val(s.spellPrompt);
    $('#qf_reply_prompt').val(s.replyPrompt);
    $('#qf_mood_universal').val(s.moodUniversalPrompt);
    $('#qf_mobile_style').val(s.mobileStyle);
    $('#qf_pos_x').val(parseFloat(s.x)); $('#qf_pos_x_val').text(s.x);
    $('#qf_pos_y').val(parseFloat(s.y)); $('#qf_pos_y_val').text(s.y);
    $('#qf_z_index').val(s.zIndex); $('#qf_z_index_num').val(s.zIndex);
    $('#qf_ui_scale').val(s.scale);
    
    renderMoodSettingsList();
}

function initSettingsListeners() {
    const s = extension_settings[extensionName];
    $('#qf_global_enabled').on('change', function() { updateSetting('enabled', $(this).prop('checked')); });
    $('#qf_use_global').on('change', function() { updateSetting('useGlobalApi', $(this).prop('checked')); });
    $('#qf_mood_enabled').on('change', function() { updateSetting('moodBtnEnabled', $(this).prop('checked')); });
    $('#qf_reply_enabled').on('change', function() { updateSetting('replyBtnEnabled', $(this).prop('checked')); });
    $('#qf_tools_enabled').on('change', function() { updateSetting('toolsBtnEnabled', $(this).prop('checked')); });
    $('#qf_grouped_widgets').on('change', function() { updateSetting('groupedWidgets', $(this).prop('checked')); }); // NEW

    $(document).on('change', '.qf-btn-toggle', function() {
        const id = $(this).data('id');
        if (!s.hiddenButtons) s.hiddenButtons = {};
        if ($(this).prop('checked')) delete s.hiddenButtons[id]; else s.hiddenButtons[id] = true;
        saveSettingsDebounced(); renderUI(true);
    });

    // (Standard listeners omitted for brevity, same as previous)
    ['global', 'spell', 'mood', 'reply'].forEach(p => {
        $(`#qf_${p}_provider`).on('change', function() { updateSetting(`${p}Provider`, $(this).val()); syncSettingsToUI(); });
        $(`#qf_${p}_base`).on('change', function() { updateSetting(`${p}Base`, $(this).val()); });
        $(`#qf_${p}_key`).on('change', function() {
            const provider = extension_settings[extensionName][`${p}Provider`];
            if(provider === 'openai') updateSetting(`${p}KeyOA`, $(this).val()); else updateSetting(`${p}KeyOR`, $(this).val());
        });
        $(`#qf_${p}_model`).on('change', function() { updateSetting(`${p}Model`, $(this).val()); });
        $(`#qf_${p}_fetch`).on('click', (e) => { e.preventDefault(); fetchModels(p); });
        $(`#qf_${p}_stream`).on('change', function() { updateSetting(`${p}Stream`, $(this).prop('checked')); });
        $(`#qf_${p}_context`).on('change', function() { updateSetting(`${p}Context`, parseInt($(this).val())); });
        $(`#qf_${p}_tokens`).on('change', function() { updateSetting(`${p}Tokens`, parseInt($(this).val())); });
        $(`#qf_${p}_seed`).on('change', function() { updateSetting(`${p}Seed`, parseInt($(this).val())); });
        $(`#qf_${p}_temp`).on('change', function() { updateSetting(`${p}Temp`, parseFloat($(this).val())); });
        $(`#qf_${p}_freq_pen`).on('change', function() { updateSetting(`${p}FreqPen`, parseFloat($(this).val())); });
        $(`#qf_${p}_pres_pen`).on('change', function() { updateSetting(`${p}PresPen`, parseFloat($(this).val())); });
        $(`#qf_${p}_rep_pen`).on('change', function() { updateSetting(`${p}RepPen`, parseFloat($(this).val())); });
        $(`#qf_${p}_top_k`).on('change', function() { updateSetting(`${p}TopK`, parseInt($(this).val())); });
        $(`#qf_${p}_top_p`).on('change', function() { updateSetting(`${p}TopP`, parseFloat($(this).val())); });
        $(`#qf_${p}_min_p`).on('change', function() { updateSetting(`${p}MinP`, parseFloat($(this).val())); });
        $(`#qf_${p}_top_a`).on('change', function() { updateSetting(`${p}TopA`, parseFloat($(this).val())); });
    });

    $('#qf_spell_prompt').on('change', function() { updateSetting('spellPrompt', $(this).val()); });
    $('#qf_reply_prompt').on('change', function() { updateSetting('replyPrompt', $(this).val()); });
    $('#qf_mood_universal').on('change', function() { updateSetting('moodUniversalPrompt', $(this).val()); });
    $('#qf_mobile_style').on('change', function() { updateSetting('mobileStyle', $(this).val()); });
    $('#qf_pos_x').on('input', function() { updateSetting('x', $(this).val() + '%'); });
    $('#qf_pos_y').on('input', function() { updateSetting('y', $(this).val() + 'px'); });
    $('#qf_z_index').on('input', function() { const v = $(this).val(); $('#qf_z_index_num').val(v); updateSetting('zIndex', v); });
    $('#qf_z_index_num').on('input', function() { const v = $(this).val(); $('#qf_z_index').val(v); updateSetting('zIndex', v); });
    $('#qf_ui_scale').on('input', function() { updateSetting('scale', $(this).val()); });
    
    // RESET POSITIONS (Updated)
    $('#qf_reset_pos').on('click', (e) => { 
        e.preventDefault(); 
        updateSetting('x', '50%'); updateSetting('y', '0px'); 
        updateSetting('moodX', '85%'); updateSetting('moodY', '0px'); 
        updateSetting('replyX', '15%'); updateSetting('replyY', '0px'); 
        updateSetting('spellX', '15%'); updateSetting('spellY', '50px'); 
        updateSetting('undoX', '25%'); updateSetting('undoY', '50px');
        updateSetting('quadX', '10%'); updateSetting('quadY', '200px');
        renderUI(true); 
    });

    $('#qf_add_mood_btn').on('click', function(e) {
        e.preventDefault();
        const label = $('#qf_new_mood_label').val().trim();
        const prompt = $('#qf_new_mood_prompt').val().trim();
        const icon = $('#qf_new_mood_icon').val().trim() || 'fa-star';
        if(!label || !prompt) { toastr.warning('Label & Prompt required'); return; }
        s.moods.push({ id: Date.now().toString(), label, icon, prompt });
        saveSettingsDebounced();
        $('#qf_new_mood_label').val(''); $('#qf_new_mood_prompt').val('');
        renderMoodSettingsList(); renderUI();
    });
}

// (renderMoodSettingsList, fetchModels -> Same as before)
function renderMoodSettingsList() { const s = extension_settings[extensionName]; const list = $('#qf_mood_list'); list.empty(); s.moods.forEach((mood, index) => { list.append(`<div class="qf-mood-item"><div class="qf-mood-header"><span><i class="fa-solid ${mood.icon}"></i> <b>${mood.label}</b></span><button class="menu_button qf-del-mood" data-idx="${index}"><i class="fa-solid fa-trash"></i></button></div><div class="qf-mood-prompt">${mood.prompt}</div></div>`); }); $('.qf-del-mood').off('click').on('click', function(e) { e.preventDefault(); s.moods.splice($(this).data('idx'), 1); saveSettingsDebounced(); renderMoodSettingsList(); renderUI(); }); }
async function fetchModels(prefix) { const s = extension_settings[extensionName]; const provider = s[`${prefix}Provider`]; const key = provider === 'openai' ? s[`${prefix}KeyOA`] : s[`${prefix}KeyOR`]; const base = s[`${prefix}Base`]; if(!key) { toastr.error('API Key Missing for ' + prefix); return; } const icon = $(`#qf_${prefix}_fetch i`); icon.removeClass('fa-sync').addClass('fa-spin fa-spinner'); try { const r = await fetch(`${base}/models`, { headers: { 'Authorization': `Bearer ${key}` } }); const d = await r.json(); const models = d.data || d; const sel = $(`#qf_${prefix}_model`); sel.empty().append('<option disabled selected>Select...</option>'); models.sort((a,b)=>a.id.localeCompare(b.id)).forEach(m=>sel.append(`<option value="${m.id}">${m.id}</option>`)); toastr.success(`Fetched ${models.length} models for ${prefix}`); } catch(e) { toastr.error('Fetch Failed'); } icon.addClass('fa-sync').removeClass('fa-spin fa-spinner'); }

// --- CORE UI ---
function initTracker() {
    if (resizeObserver) resizeObserver.disconnect();
    const textArea = document.getElementById('send_textarea');
    if (!textArea) return;
    resizeObserver = new ResizeObserver(() => updatePosition());
    resizeObserver.observe(textArea);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    updatePosition();
}

function updatePosition() {
    const textArea = document.getElementById('send_textarea'); if (!textArea) return; 
    const rect = textArea.getBoundingClientRect();
    const s = extension_settings[extensionName];
    
    const applyPos = (el, xKey, yKey) => {
        if (!el) return;
        let y = parseFloat(s[yKey]) || 0;
        if (s.mobileStyle === 'docked' && yKey === 'y') y = -2;
        el.style.left = (window.innerWidth * ((parseFloat(s[xKey])||50)/100)) + 'px';
        el.style.top = (rect.top - y) + 'px';
        el.style.transform = `translate(-50%, -100%) scale(${s.scale})`;
        el.style.zIndex = isEditing ? '2147483647' : (s.zIndex || 2000);
    };
    
    // Main Bar
    applyPos(container, 'x', 'y');

    if (s.groupedWidgets) {
        // If Grouped, update the Quad Container
        applyPos(quadContainer, 'quadX', 'quadY');
    } else {
        // If Separate, update individual containers
        applyPos(moodContainer, 'moodX', 'moodY');
        applyPos(replyContainer, 'replyX', 'replyY');
        applyPos(spellContainer, 'spellX', 'spellY');
        applyPos(undoContainer, 'undoX', 'undoY');
    }
}

function updateContainerStyles() { updatePosition(); }

function renderUI(force = false) {
    if (container) container.remove(); 
    if (moodContainer) moodContainer.remove(); 
    if (replyContainer) replyContainer.remove();
    if (spellContainer) spellContainer.remove();
    if (undoContainer) undoContainer.remove();
    if (quadContainer) quadContainer.remove();

    $('#qf-mood-dropdown').remove();
    const s = extension_settings[extensionName];
    if (!s.enabled) { if (resizeObserver) resizeObserver.disconnect(); return; }

    // 1. MAIN FORMATTING BAR
    container = document.createElement('div');
    container.className = `quick-format-container style-${s.mobileStyle || 'docked'}`;
    container.dataset.kX = 'x'; container.dataset.kY = 'y';
    formattingButtons.forEach(b => { if(!s.hiddenButtons[b.id]) container.appendChild(createBtn(b)); });
    document.body.appendChild(container);

    // --- CHECK GROUPED MODE ---
    if (s.groupedWidgets) {
        // CREATE QUAD GRID
        quadContainer = document.createElement('div');
        quadContainer.className = 'quick-format-container qf-quad-container';
        quadContainer.dataset.kX = 'quadX'; quadContainer.dataset.kY = 'quadY';

        // Add buttons in the requested order:
        // Row 1: Spell | Moods
        // Row 2: Reply | Undo
        
        // 1. Spell
        if (s.toolsBtnEnabled) {
            quadContainer.appendChild(createBtn({
                id: 'enhancer', icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>', title: 'Spellcheck', 
                action: () => processAI('spell'), isEnhance: true
            }));
        }
        
        // 2. Mood
        if (s.moodBtnEnabled) {
            quadContainer.appendChild(createBtn({ 
                id: 'btn_mood', icon: '<i class="fa-solid fa-brain"></i>', title: 'Moods', action: toggleMoodDropdown 
            }));
        }

        // 3. Reply
        if (s.replyBtnEnabled) {
            quadContainer.appendChild(createBtn({ 
                id: 'btn_reply', icon: '<i class="fa-solid fa-comment"></i>', title: 'Auto Reply', action: () => processAI('reply'), isEnhance: true 
            }));
        }

        // 4. Undo
        if (s.toolsBtnEnabled) {
            quadContainer.appendChild(createBtn({
                id: 'undo', icon: '<i class="fa-solid fa-rotate-left"></i>', title: 'Return text', 
                action: restoreUndo, isUndo: true
            }));
        }

        document.body.appendChild(quadContainer);
        addDragListeners(quadContainer);
        quadContainer.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); toggleEdit(!isEditing); });

    } else {
        // RENDER INDIVIDUAL FLOATING BUTTONS
        
        if (s.moodBtnEnabled) {
            moodContainer = document.createElement('div');
            moodContainer.className = 'quick-format-container style-floating qf-mood-container';
            moodContainer.dataset.kX = 'moodX'; moodContainer.dataset.kY = 'moodY';
            moodContainer.appendChild(createBtn({ id: 'btn_mood', icon: '<i class="fa-solid fa-brain"></i>', title: 'Moods', action: toggleMoodDropdown }));
            document.body.appendChild(moodContainer);
            addDragListeners(moodContainer);
            moodContainer.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); toggleEdit(!isEditing); });
        }

        if (s.replyBtnEnabled) {
            replyContainer = document.createElement('div');
            replyContainer.className = 'quick-format-container style-floating qf-reply-container';
            replyContainer.dataset.kX = 'replyX'; replyContainer.dataset.kY = 'replyY';
            replyContainer.appendChild(createBtn({ id: 'btn_reply', icon: '<i class="fa-solid fa-comment"></i>', title: 'Auto Reply', action: () => processAI('reply'), isEnhance: true }));
            document.body.appendChild(replyContainer);
            addDragListeners(replyContainer);
            replyContainer.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); toggleEdit(!isEditing); });
        }

        if (s.toolsBtnEnabled) {
            spellContainer = document.createElement('div');
            spellContainer.className = 'quick-format-container style-floating qf-tools-container';
            spellContainer.dataset.kX = 'spellX'; spellContainer.dataset.kY = 'spellY';
            spellContainer.appendChild(createBtn({
                id: 'enhancer', icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>', title: 'Spellcheck', 
                action: () => processAI('spell'), isEnhance: true
            }));
            document.body.appendChild(spellContainer);
            addDragListeners(spellContainer);
            spellContainer.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); toggleEdit(!isEditing); });

            undoContainer = document.createElement('div');
            undoContainer.className = 'quick-format-container style-floating qf-tools-container';
            undoContainer.dataset.kX = 'undoX'; undoContainer.dataset.kY = 'undoY';
            undoContainer.appendChild(createBtn({
                id: 'undo', icon: '<i class="fa-solid fa-rotate-left"></i>', title: 'Return text', 
                action: restoreUndo, isUndo: true
            }));
            document.body.appendChild(undoContainer);
            addDragListeners(undoContainer);
            undoContainer.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); toggleEdit(!isEditing); });
        }
    }

    addDragListeners(container);
    container.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); toggleEdit(!isEditing); });
    initTracker();
}

// (Mood Toggle, AI Process, etc. remain the same)
function toggleMoodDropdown() {
    const existing = $('#qf-mood-dropdown');
    if (existing.length) { existing.remove(); return; }
    const s = extension_settings[extensionName];
    if (!s.moods || !s.moods.length) { toastr.info('No moods configured.'); return; }
    
    // Position relatively to whichever container called it
    let rect;
    if (s.groupedWidgets && quadContainer) rect = quadContainer.getBoundingClientRect();
    else if (moodContainer) rect = moodContainer.getBoundingClientRect();
    else return;

    const dropdown = $(`<div id="qf-mood-dropdown"></div>`);
    s.moods.forEach(mood => {
        const item = $(`<div class="qf-dropdown-item"><i class="fa-solid ${mood.icon}"></i> ${mood.label}</div>`);
        item.on('click', () => { processAI('mood', mood.prompt); dropdown.remove(); });
        dropdown.append(item);
    });
    $('body').append(dropdown);
    dropdown.css({ position: 'fixed', left: rect.left + 'px', bottom: (window.innerHeight - rect.top + 5) + 'px', zIndex: 2005, transform: 'translateX(-50%)' });
    setTimeout(() => { $(document).on('click.qfClose', (e) => { if (!$(e.target).closest('#qf-mood-dropdown, .qf-mood-container, .qf-quad-container').length) { dropdown.remove(); $(document).off('click.qfClose'); } }); }, 100);
}

// --- AI LOGIC (No changes needed, but included for completeness) ---
async function processAI(mode, customPrompt = null) {
    if (isGenerating) { if (abortController) abortController.abort(); isGenerating = false; renderGeneratingState(false); toastr.info('Stopped'); return; }
    const textarea = document.getElementById('send_textarea'); 
    let text = textarea ? textarea.value.trim() : '';
    if (!text && mode !== 'reply') { toastr.warning('No text to process'); return; }
    undoBuffer = text; updateUndoButtonState();
    const s = extension_settings[extensionName];
    const useGlobal = s.useGlobalApi;
    const p = useGlobal ? 'global' : mode; 
    const provider = s[`${p}Provider`];
    const key = provider === 'openai' ? s[`${p}KeyOA`] : s[`${p}KeyOR`];
    const base = s[`${p}Base`];
    const model = s[`${p}Model`];
    
    const params = { model: model || 'gpt-3.5-turbo', stream: s[`${p}Stream`], temperature: parseFloat(s[`${p}Temp`]), max_tokens: parseInt(s[`${p}Tokens`]) || undefined, frequency_penalty: parseFloat(s[`${p}FreqPen`]), presence_penalty: parseFloat(s[`${p}PresPen`]), top_p: parseFloat(s[`${p}TopP`]) };
    const seed = parseInt(s[`${p}Seed`]); if (seed !== -1) params.seed = seed;
    if(s[`${p}TopK`] > 0) params.top_k = parseInt(s[`${p}TopK`]); if(s[`${p}RepPen`] !== 1) params.repetition_penalty = parseFloat(s[`${p}RepPen`]); if(s[`${p}MinP`] > 0) params.min_p = parseFloat(s[`${p}MinP`]); if(s[`${p}TopA`] > 0) params.top_a = parseFloat(s[`${p}TopA`]);

    if (!key) { toastr.error(`API Key Missing for ${p.toUpperCase()}`); return; }

    let sys = '';
    if (mode === 'spell') sys = s.spellPrompt;
    else if (mode === 'reply') sys = s.replyPrompt;
    else if (mode === 'mood') { const universal = s.moodUniversalPrompt ? s.moodUniversalPrompt.trim() + '\n' : ''; sys = universal + customPrompt; }

    const userName = typeof name2 !== 'undefined' ? name2 : 'User';
    let persona = ''; if (typeof power_user !== 'undefined' && power_user.persona_description) { persona = power_user.persona_description; }
    if (persona) { sys += `\n\n### User Information\nName: ${userName}\nPersona: ${persona}\n`; }
    sys = sys.replace(/{{user}}/g, userName);
    if (mode === 'reply' && text) sys += " Continue the user's current input naturally.";

    renderGeneratingState(true); isGenerating = true; abortController = new AbortController();

    try {
        const context = getContext(); const history = [];
        const limit = parseInt(s[`${p}Context`]);
        if (limit > 0 && context.chat && context.chat.length) { context.chat.slice(-limit).forEach(msg => history.push({ role: msg.is_user ? 'user' : 'assistant', content: msg.mes })); }
        const messages = [{ role: "system", content: sys }, ...history];
        if (mode === 'reply') { messages.push({ role: "system", content: "Generate the next response now." }); } else { if (text) messages.push({ role: "user", content: text }); }
        params.messages = messages;

        const response = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, body: JSON.stringify(params), signal: abortController.signal });
        if (!response.ok) throw new Error(`API: ${response.status}`);

        if (params.stream) {
            textarea.value = ''; const reader = response.body.getReader(); const decoder = new TextDecoder();
            while (true) { const { done, value } = await reader.read(); if (done) break; const lines = decoder.decode(value).split('\n'); for (const line of lines) { if (line.startsWith('data: ')) { try { const json = JSON.parse(line.slice(6)); if (json.choices[0]?.delta?.content) { textarea.value += json.choices[0].delta.content; textarea.scrollTop = textarea.scrollHeight; } } catch (e) {} } } }
        } else { const data = await response.json(); if (data.choices[0]?.message?.content) textarea.value = data.choices[0].message.content; }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) { if (e.name !== 'AbortError') toastr.error(e.message); } finally { isGenerating = false; renderGeneratingState(false); }
}

function createBtn(cfg) {
    const btn = document.createElement('button'); btn.className = 'quick-format-btn';
    if (cfg.isEnhance) btn.classList.add('qf-enhance-btn'); if (cfg.isUndo) btn.classList.add('qf-undo-btn');
    if (cfg.icon) btn.innerHTML = cfg.icon; else btn.innerText = cfg.label;
    btn.title = cfg.title; btn.onclick = (e) => { e.preventDefault(); cfg.action ? cfg.action() : insertText(cfg.start, cfg.end); };
    btn.onmousedown = (e) => e.preventDefault(); return btn;
}

function toggleEdit(val) { 
    isEditing = val; 
    $('.quick-format-container').toggleClass('editing', val); 
    if (val) {
        $('.quick-format-container').each(function() {
            if ($(this).find('.qf-lock-btn').length === 0) {
                const lockBtn = $('<button class="qf-lock-btn"><i class="fa-solid fa-lock"></i></button>');
                lockBtn.on('click touchstart', (e) => { e.preventDefault(); e.stopPropagation(); toggleEdit(false); });
                $(this).append(lockBtn);
            }
        });
        toastr.info('Edit Mode Unlocked');
    } else { $('.qf-lock-btn').remove(); toastr.info('Locked'); }
    updateContainerStyles(); 
}

function insertText(startTag, endTag) {
    const textarea = document.getElementById('send_textarea'); if (!textarea) return;
    const s = textarea.selectionStart; const e = textarea.selectionEnd; const val = textarea.value;
    textarea.value = val.substring(0, s) + startTag + val.substring(s, e) + endTag + val.substring(e);
    const newCursorPos = s + startTag.length; textarea.selectionStart = newCursorPos; textarea.selectionEnd = newCursorPos + (e - s);
    textarea.focus(); textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderGeneratingState(active) { $('.qf-enhance-btn').html(active ? '<i class="fa-solid fa-square"></i>' : (i,h) => h.includes('comment') ? '<i class="fa-solid fa-comment"></i>' : h.includes('brain') ? '<i class="fa-solid fa-brain"></i>' : '<i class="fa-solid fa-wand-magic-sparkles"></i>'); }
function restoreUndo() { const t = document.getElementById('send_textarea'); if (t && undoBuffer) { t.value = undoBuffer; t.dispatchEvent(new Event('input', { bubbles: true })); undoBuffer = null; updateUndoButtonState(); toastr.success('Restored'); } }
function updateUndoButtonState() { $('.qf-undo-btn').css({opacity: undoBuffer?'1':'0.3', cursor: undoBuffer?'pointer':'default'}); }
function addDragListeners(el) { el.addEventListener('mousedown',e=>handleDragStart(e,el)); el.addEventListener('touchstart',e=>handleDragStart(e,el),{passive:false,capture:true}); }
function handleDragStart(e, el) { if (!isEditing) return; if (e.target.closest('.qf-lock-btn')) return; e.preventDefault(); e.stopPropagation(); activeDragEl = el; const t = e.touches?e.touches[0]:e; dragStartCoords = {x:t.clientX, y:t.clientY}; const s = extension_settings[extensionName]; dragStartPos={xPct:parseFloat(s[el.dataset.kX])||50, yPx:parseFloat(s[el.dataset.kY])||0, kX:el.dataset.kX, kY:el.dataset.kY}; document.addEventListener('mousemove', handleDragMove); document.addEventListener('mouseup', handleDragEnd); document.addEventListener('touchmove', handleDragMove, {passive:false,capture:true}); document.addEventListener('touchend', handleDragEnd, {capture:true}); }
function handleDragMove(e) { if(!activeDragEl)return; e.preventDefault(); e.stopPropagation(); const t = e.touches?e.touches[0]:e; const dx = t.clientX-dragStartCoords.x; const s = extension_settings[extensionName]; if(s.mobileStyle!=='docked'||dragStartPos.kX!=='x'){const dy = dragStartCoords.y-t.clientY; let ny=dragStartPos.yPx+dy; if(ny<0)ny=0; s[dragStartPos.kY]=ny+'px';} s[dragStartPos.kX]=(dragStartPos.xPct+((dx/window.innerWidth)*100))+'%'; requestAnimationFrame(updatePosition); }
function handleDragEnd() { if(!activeDragEl)return; saveSettingsDebounced(); activeDragEl=null; document.removeEventListener('mousemove', handleDragMove); document.removeEventListener('mouseup', handleDragEnd); document.removeEventListener('touchmove', handleDragMove); document.removeEventListener('touchend', handleDragEnd); }