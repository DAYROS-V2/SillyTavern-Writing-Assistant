import { extension_settings, getContext } from "../../../extensions.js"; 
import { saveSettingsDebounced } from "../../../../script.js"; 

const extensionName = "QuickFormatting"; 
const scriptUrl = import.meta.url; 
const extensionFolderPath = scriptUrl.substring(0, scriptUrl.lastIndexOf('/')); 

// --- DEFAULTS --- 
const defaultSettings = { 
    enabled: true, mobileStyle: 'docked', x: '50%', y: '0px', zIndex: 2000, scale: 1.0, 
    hiddenButtons: { 'btn_ooc': true, 'btn_code': true }, 
    
    // Layout
    moodBtnEnabled: true, moodX: '85%', moodY: '0px', 
    replyBtnEnabled: true, replyX: '15%', replyY: '0px', 

    // Global Toggle
    useGlobalApi: true, 

    // --- 1. GLOBAL SETTINGS --- 
    globalProvider: 'openrouter', globalBase: 'https://openrouter.ai/api/v1', globalKeyOR: '', globalKeyOA: '', globalModel: '', 
    globalStream: true, globalContext: 5, globalTokens: 0, 
    globalTemp: 1.0, globalFreqPen: 0.0, globalPresPen: 0.0, globalRepPen: 1.0, 
    globalTopK: 0, globalTopP: 1.0, globalMinP: 0.0, globalTopA: 0.0, globalSeed: -1, 

    // --- 2. SPELLCHECKER SETTINGS --- 
    spellProvider: 'openrouter', spellBase: 'https://openrouter.ai/api/v1', spellKeyOR: '', spellKeyOA: '', spellModel: '', 
    spellStream: true, spellContext: 5, spellTokens: 0, 
    spellTemp: 1.0, spellFreqPen: 0.0, spellPresPen: 0.0, spellRepPen: 1.0, 
    spellTopK: 0, spellTopP: 1.0, spellMinP: 0.0, spellTopA: 0.0, spellSeed: -1, 
    
    // NEW SYSTEM PROMPT: SPELLCHECKER
    spellPrompt: `You are a purely functional Line Editor and Ghostwriter. Your task is to polish the User's input for grammar, syntax, and flow while maintaining absolute fidelity to the original meaning, tone, and formatting.

### INSTRUCTIONS:
1. **Formatting Integrity:** You must preserve the exact Markdown style used by the user.
   - If the user uses asterisks (*) for actions, keep them.
   - If the user uses quotes (") for dialogue, keep them.
   - Do not merge paragraphs if they are separated.
   - Do not edit any for mating like (\`\`\`, ~, (), etc...)

2. **Grammar & Flow:** Correct typos, punctuation errors, and awkward phrasing. Enhance the prose to be more immersive, but keep it grounded.

3. **Narrative Voice:** Use the provided Chat History and User Persona to ensure the edit sounds exactly like the character. If the character is rude/blunt, do not make them polite. If they are uneducated, do not give them a high vocabulary.

4. **NO CENSORSHIP / NO EUPHEMISMS:**
   - You are an editor, not a moral compass.
   - If the input contains explicit, vulgar, or anatomical terms, **preserve them exactly**.
   - Do NOT replace raw language with poetic metaphors, medical terminology, or "purple prose."
   - Do NOT soften the intensity of the scene.

5. **Output:** Output ONLY the edited text. Do not provide notes, greetings, or "Here is the edited text."`, 

    // --- 3. MOOD SETTINGS --- 
    moodProvider: 'openrouter', moodBase: 'https://openrouter.ai/api/v1', moodKeyOR: '', moodKeyOA: '', moodModel: '', 
    moodStream: true, moodContext: 5, moodTokens: 0, 
    moodTemp: 1.2, moodFreqPen: 0.0, moodPresPen: 0.0, moodRepPen: 1.0, 
    moodTopK: 0, moodTopP: 1.0, moodMinP: 0.0, moodTopA: 0.0, moodSeed: -1, 
    
    // NEW SYSTEM PROMPT: MOODS
    moodUniversalPrompt: `You are an expert Ghostwriter and Narrative Tone Shifter. Your task is to rewrite {{user}}'s input text to perfectly embody a specific emotional TONE while adhering strictly to {{user}}'s Persona and the ongoing Chat History.

### DIRECTIVES:
1. **Structural Flexibility:** You have full license to completely rewrite sentences, change pacing, or swap vocabulary if necessary to achieve the perfect tone.
   - Do not feel bound to the original sentence structure if it holds back the emotion.
   - **CRITICAL:** While the structure changes, the core **Intent, Action, and Meaning** must remain recognizable. Do not change what {{user}} is actually doing, only *how* they are doing it.

2. **Tone Integration:** Deeply infuse the requested TONE into the text.
   - Adjust sentence length (e.g., short/choppy for 'Angry', flowing for 'Romantic').
   - Modify vocabulary (e.g., crude for 'Vulgar', elevated for 'Formal').
   - Alter physical actions to match the mood (e.g., 'slamming' vs 'placing' a cup).

3. **Persona Fidelity:** You have been provided with {{user}}'s Name and Persona. You MUST write in a voice that matches this character.
   - If {{user}} is shy, do not make the 'Angry' tone sound like a dominant warrior; make it sound like a shy person snapping.
   - Maintain established quirks and speech patterns found in {{user}}'s history.

4. **No Censorship / Raw Fidelity:**
   - You are a neutral editing tool. Do not sanitize the content.
   - If the input or tone requires explicit, vulgar, or anatomical language, **use it**.
   - Do NOT replace raw terms with euphemisms. Do NOT soften the intensity of the scene.

5. **Formatting Preservation:**
   - Maintain the exact Markdown style used (asterisks for actions, quotes for speech).

6. **Output:** Provide ONLY the rewritten text. Do not add "Here is the text in [Tone]" or any conversational filler.

The Target Tone is:`, 

    // --- 4. AUTO-REPLY SETTINGS --- 
    replyProvider: 'openrouter', replyBase: 'https://openrouter.ai/api/v1', replyKeyOR: '', replyKeyOA: '', replyModel: '', 
    replyStream: true, replyContext: 10, replyTokens: 200, 
    replyTemp: 0.8, replyFreqPen: 0.5, replyPresPen: 0.0, replyRepPen: 1.1, 
    replyTopK: 40, replyTopP: 0.9, replyMinP: 0.0, replyTopA: 0.0, replySeed: -1, 
    
    // NEW SYSTEM PROMPT: AUTO REPLY
    replyPrompt: `You are a mirror-echo scribe, legally bound to embody {{user}}'s specific Persona. Your singular duty is to generate the next logical step in the narrative exclusively from {{user}}'s perspective.

### NEGATIVE CONSTRAINT:
- **ABSOLUTE PROHIBITION:** You are FORBIDDEN from writing dialogue, actions, thoughts, or reactions for {{char}}.
- If the narrative requires {{char}} to react, you must stop typing immediately before that happens.
- You exist only inside {{user}}'s body and mind.

### CORE DIRECTIVES:
1. **Impersonation Fidelity:** Analyze {{user}}'s persona (traits, speech style, kinks) and the Chat History. Mimic their voice precisely.
   - If {{user}} writes short/lazy, write short/lazy.
   - If {{user}} is verbose and poetic, match that prose.

2. **Contextual Flow:** Reference the immediate dialogue and unspoken tension. React to what just happened, but do not resolve the scene.
   - **Open-Ended Hooks:** Never wrap up the story. End on an action, a line of dialogue, or an internal thought that invites {{char}} to respond.

3. **Output Purity:**
   - Return ONLY the narrative text.
   - No preambles ("Here is the response...").
   - No meta-commentary.

4. **NO CENSORSHIP:**
   - You are representing a private persona.
   - If the scene is erotic, violent, or vulgar, dive in **raw**.
   - Use specific anatomical terms that fits {{user}}'s established vibe. Do not sanitize the experience.

5. **Length:** Aim for 25–200 words (or match {{user}}'s average length from history).

GENERATE RESPONSE AS {{user}}:`, 

    // Mood List
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
    if (['mobileStyle', 'enabled', 'moodBtnEnabled', 'replyBtnEnabled', 'useGlobalApi'].includes(key)) { 
        renderUI(true); 
        if (key === 'useGlobalApi') syncSettingsToUI(); 
    } else { 
        updateContainerStyles(); 
    } 
} 

// --- SETTINGS SYNC --- 
function syncSettingsToUI() { 
    const s = extension_settings[extensionName]; 
    
    // Toggles
    $('#qf_global_enabled').prop('checked', s.enabled); 
    $('#qf_use_global').prop('checked', s.useGlobalApi); 
    $('#qf_mood_enabled').prop('checked', s.moodBtnEnabled); 
    $('#qf_reply_enabled').prop('checked', s.replyBtnEnabled); 
    
    // Visibility
    if (s.useGlobalApi) { $('#qf_section_global_api').show(); $('.qf-specific-api').hide(); } 
    else { $('#qf_section_global_api').hide(); $('.qf-specific-api').show(); } 

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

    $(document).on('change', '.qf-btn-toggle', function() { 
        const id = $(this).data('id'); 
        if (!s.hiddenButtons) s.hiddenButtons = {}; 
        if ($(this).prop('checked')) delete s.hiddenButtons[id]; else s.hiddenButtons[id] = true; 
        saveSettingsDebounced(); renderUI(true); 
    }); 

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
    $('#qf_reset_pos').on('click', (e) => { 
        e.preventDefault(); 
        updateSetting('x', '50%'); updateSetting('y', '0px'); 
        updateSetting('moodX', '85%'); updateSetting('moodY', '0px'); 
        updateSetting('replyX', '15%'); updateSetting('replyY', '0px'); 
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

function renderMoodSettingsList() { 
    const s = extension_settings[extensionName]; 
    const list = $('#qf_mood_list'); list.empty(); 
    s.moods.forEach((mood, index) => { 
        list.append(`
            <div class="qf-mood-item">
                <div class="qf-mood-header">
                    <span><i class="fa-solid ${mood.icon}"></i> <b>${mood.label}</b></span>
                    <button class="menu_button qf-del-mood" data-idx="${index}"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="qf-mood-prompt">${mood.prompt}</div>
            </div>`); 
    }); 
    $('.qf-del-mood').off('click').on('click', function(e) { 
        e.preventDefault(); s.moods.splice($(this).data('idx'), 1); 
        saveSettingsDebounced(); renderMoodSettingsList(); renderUI(); 
    }); 
} 

async function fetchModels(prefix) { 
    const s = extension_settings[extensionName]; 
    const provider = s[`${prefix}Provider`]; 
    const key = provider === 'openai' ? s[`${prefix}KeyOA`] : s[`${prefix}KeyOR`]; 
    const base = s[`${prefix}Base`]; 

    if(!key) { toastr.error('API Key Missing for ' + prefix); return; } 
    const icon = $(`#qf_${prefix}_fetch i`); 
    icon.removeClass('fa-sync').addClass('fa-spin fa-spinner'); 

    try { 
        const r = await fetch(`${base}/models`, { headers: { 'Authorization': `Bearer ${key}` } }); 
        const d = await r.json(); 
        const models = d.data || d; 
        const sel = $(`#qf_${prefix}_model`); 
        sel.empty().append('<option disabled selected>Select...</option>'); 
        models.sort((a,b)=>a.id.localeCompare(b.id)).forEach(m=>sel.append(`<option value="${m.id}">${m.id}</option>`)); 
        toastr.success(`Fetched ${models.length} models for ${prefix}`); 
    } catch(e) { toastr.error('Fetch Failed'); } 
    icon.addClass('fa-sync').removeClass('fa-spin fa-spinner'); 
} 

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
    applyPos(container, 'x', 'y'); 
    applyPos(moodContainer, 'moodX', 'moodY'); 
    applyPos(replyContainer, 'replyX', 'replyY'); 
} 

function updateContainerStyles() { updatePosition(); } 

function renderUI(force = false) { 
    if (container) container.remove(); if (moodContainer) moodContainer.remove(); if (replyContainer) replyContainer.remove(); 
    $('#qf-mood-dropdown').remove(); 
    const s = extension_settings[extensionName]; 
    if (!s.enabled) { if (resizeObserver) resizeObserver.disconnect(); return; } 

    container = document.createElement('div'); 
    container.className = `quick-format-container style-${s.mobileStyle || 'docked'}`; 
    container.dataset.kX = 'x'; container.dataset.kY = 'y'; 
    formattingButtons.forEach(b => { if(!s.hiddenButtons[b.id]) container.appendChild(createBtn(b)); }); 
    
    container.appendChild(createBtn({ 
        id: 'enhancer', icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>', title: 'Spellcheck', 
        action: () => processAI('spell'), isEnhance: true
    })); 
    container.appendChild(createBtn({id: 'undo', icon: '<i class="fa-solid fa-rotate-left"></i>', title: 'Undo', action: restoreUndo, isUndo: true})); 
    document.body.appendChild(container); 

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

    addDragListeners(container); 
    container.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); toggleEdit(!isEditing); }); 
    initTracker(); 
} 

function toggleMoodDropdown() { 
    const existing = $('#qf-mood-dropdown'); 
    if (existing.length) { existing.remove(); return; } 
    const s = extension_settings[extensionName]; 
    if (!s.moods || !s.moods.length) { toastr.info('No moods configured.'); return; } 
    
    const rect = moodContainer.getBoundingClientRect(); 
    const dropdown = $(`<div id="qf-mood-dropdown"></div>`); 
    s.moods.forEach(mood => { 
        const item = $(`<div class="qf-dropdown-item"><i class="fa-solid ${mood.icon}"></i> ${mood.label}</div>`); 
        item.on('click', () => { processAI('mood', mood.prompt); dropdown.remove(); }); 
        dropdown.append(item); 
    }); 
    $('body').append(dropdown); 
    dropdown.css({ position: 'fixed', left: rect.left + 'px', bottom: (window.innerHeight - rect.top + 5) + 'px', zIndex: 2005, transform: 'translateX(-50%)' }); 
    setTimeout(() => { $(document).on('click.qfClose', (e) => { if (!$(e.target).closest('#qf-mood-dropdown, .qf-mood-container').length) { dropdown.remove(); $(document).off('click.qfClose'); } }); }, 100); 
} 

// --- AI LOGIC --- 
async function processAI(mode, customPrompt = null) { 
    if (isGenerating) { if (abortController) abortController.abort(); isGenerating = false; renderGeneratingState(false); toastr.info('Stopped'); return; } 
    
    const textarea = document.getElementById('send_textarea'); 
    let text = textarea ? textarea.value.trim() : ''; 
    
    // Reply mode allows empty text
    if (!text && mode !== 'reply') { toastr.warning('No text to process'); return; } 
    
    undoBuffer = text; updateUndoButtonState(); 
    
    const s = extension_settings[extensionName]; 
    const useGlobal = s.useGlobalApi; 
    const p = useGlobal ? 'global' : mode; 

    const provider = s[`${p}Provider`]; 
    const key = provider === 'openai' ? s[`${p}KeyOA`] : s[`${p}KeyOR`]; 
    const base = s[`${p}Base`]; 
    const model = s[`${p}Model`]; 
    
    const params = { 
        model: model || 'gpt-3.5-turbo', 
        stream: s[`${p}Stream`], 
        temperature: parseFloat(s[`${p}Temp`]), 
        max_tokens: parseInt(s[`${p}Tokens`]) || undefined, 
        frequency_penalty: parseFloat(s[`${p}FreqPen`]), 
        presence_penalty: parseFloat(s[`${p}PresPen`]), 
        top_p: parseFloat(s[`${p}TopP`]), 
    }; 

    const seed = parseInt(s[`${p}Seed`]); 
    if (seed !== -1) params.seed = seed; 

    if(s[`${p}TopK`] > 0) params.top_k = parseInt(s[`${p}TopK`]); 
    if(s[`${p}RepPen`] !== 1) params.repetition_penalty = parseFloat(s[`${p}RepPen`]); 
    if(s[`${p}MinP`] > 0) params.min_p = parseFloat(s[`${p}MinP`]); 
    if(s[`${p}TopA`] > 0) params.top_a = parseFloat(s[`${p}TopA`]); 

    if (!key) { toastr.error(`API Key Missing for ${p.toUpperCase()}`); return; } 

    let sys = ''; 
    if (mode === 'spell') sys = s.spellPrompt; 
    else if (mode === 'reply') sys = s.replyPrompt; 
    else if (mode === 'mood') { 
        const universal = s.moodUniversalPrompt ? s.moodUniversalPrompt.trim() + '\n' : ''; 
        sys = universal + customPrompt; 
    } 

    const userName = typeof name2 !== 'undefined' ? name2 : 'User'; 
    const charName = typeof name1 !== 'undefined' ? name1 : 'Character'; 

    // --- MACRO REPLACEMENT FOR NEW PROMPTS ---
    // This allows {{user}} and {{char}} to work in the prompts
    if (sys.includes('{{user}}')) sys = sys.replace(/{{user}}/g, userName);
    if (sys.includes('{{char}}')) sys = sys.replace(/{{char}}/g, charName);

    let persona = ''; 
    if (typeof power_user !== 'undefined' && power_user.persona_description) { 
        persona = power_user.persona_description; 
    } 
    
    if (persona) { 
        sys += `\n\n### User Information\nName: ${userName}\nPersona: ${persona}\n`; 
    } 

    renderGeneratingState(true); isGenerating = true; abortController = new AbortController(); 

    try { 
        const context = getContext(); const history = []; 
        const limit = parseInt(s[`${p}Context`]); 
        if (limit > 0 && context.chat && context.chat.length) { 
            context.chat.slice(-limit).forEach(msg => history.push({ role: msg.is_user ? 'user' : 'assistant', content: msg.mes })); 
        } 

        const messages = [{ role: "system", content: sys }, ...history]; 
        
        if (mode === 'reply') { 
            messages.push({ role: "system", content: "Generate the next response now." }); 
        } else { 
            if (text) messages.push({ role: "user", content: text }); 
        } 

        params.messages = messages; 

        const response = await fetch(`${base}/chat/completions`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, 
            body: JSON.stringify(params), 
            signal: abortController.signal
        }); 

        if (!response.ok) throw new Error(`API: ${response.status}`); 

        if (params.stream) { 
            textarea.value = ''; 
            const reader = response.body.getReader(); const decoder = new TextDecoder(); 
            while (true) { 
                const { done, value } = await reader.read(); if (done) break; 
                const lines = decoder.decode(value).split('\n'); 
                for (const line of lines) { if (line.startsWith('data: ')) { try { const json = JSON.parse(line.slice(6)); if (json.choices[0]?.delta?.content) { textarea.value += json.choices[0].delta.content; textarea.scrollTop = textarea.scrollHeight; } } catch (e) {} } } 
            } 
        } else { 
            const data = await response.json(); 
            if (data.choices[0]?.message?.content) textarea.value = data.choices[0].message.content; 
        } 
        textarea.dispatchEvent(new Event('input', { bubbles: true })); 
    } catch (e) { if (e.name !== 'AbortError') toastr.error(e.message); } 
    finally { isGenerating = false; renderGeneratingState(false); } 
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
                // FIXED: Use touchstart for mobile responsiveness
                const lockBtn = $('<button class="qf-lock-btn"><i class="fa-solid fa-lock"></i></button>'); 
                lockBtn.on('click touchstart', (e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    toggleEdit(false); 
                }); 
                $(this).append(lockBtn); 
            } 
        }); 
        toastr.info('Edit Mode Unlocked'); 
    } else { 
        $('.qf-lock-btn').remove(); 
        toastr.info('Locked'); 
    } 
    
    updateContainerStyles(); 
} 

function insertText(s, e) { const t = document.getElementById('send_textarea'); const start = t.selectionStart; t.value = t.value.substring(0, start) + s + t.value.substring(start, t.selectionEnd) + e + t.value.substring(t.selectionEnd); t.focus(); t.dispatchEvent(new Event('input', { bubbles: true })); } 
function renderGeneratingState(active) { $('.qf-enhance-btn').html(active ? '<i class="fa-solid fa-square"></i>' : (i,h) => h.includes('comment') ? '<i class="fa-solid fa-comment"></i>' : h.includes('brain') ? '<i class="fa-solid fa-brain"></i>' : '<i class="fa-solid fa-wand-magic-sparkles"></i>'); } 
function restoreUndo() { const t = document.getElementById('send_textarea'); if (t && undoBuffer) { t.value = undoBuffer; t.dispatchEvent(new Event('input', { bubbles: true })); undoBuffer = null; updateUndoButtonState(); toastr.success('Restored'); } } 
function updateUndoButtonState() { $('.qf-undo-btn').css({opacity: undoBuffer?'1':'0.3', cursor: undoBuffer?'pointer':'default'}); } 
function addDragListeners(el) { el.addEventListener('mousedown',e=>handleDragStart(e,el)); el.addEventListener('touchstart',e=>handleDragStart(e,el),{passive:false,capture:true}); } 

function handleDragStart(e, el) { 
    if (!isEditing) return; 
    // FIXED: Ignore drag if touching the lock button
    if (e.target.closest('.qf-lock-btn')) return; 

    e.preventDefault(); e.stopPropagation(); activeDragEl = el; const t = e.touches?e.touches[0]:e; dragStartCoords = {x:t.clientX, y:t.clientY}; const s = extension_settings[extensionName]; dragStartPos={xPct:parseFloat(s[el.dataset.kX])||50, yPx:parseFloat(s[el.dataset.kY])||0, kX:el.dataset.kX, kY:el.dataset.kY}; document.addEventListener('mousemove', handleDragMove); document.addEventListener('mouseup', handleDragEnd); document.addEventListener('touchmove', handleDragMove, {passive:false,capture:true}); document.addEventListener('touchend', handleDragEnd, {capture:true}); 
} 

function handleDragMove(e) { if(!activeDragEl)return; e.preventDefault(); e.stopPropagation(); const t = e.touches?e.touches[0]:e; const dx = t.clientX-dragStartCoords.x; const s = extension_settings[extensionName]; if(s.mobileStyle!=='docked'||dragStartPos.kX!=='x'){const dy = dragStartCoords.y-t.clientY; let ny=dragStartPos.yPx+dy; if(ny<0)ny=0; s[dragStartPos.kY]=ny+'px';} s[dragStartPos.kX]=(dragStartPos.xPct+((dx/window.innerWidth)*100))+'%'; requestAnimationFrame(updatePosition); } 
function handleDragEnd() { if(!activeDragEl)return; saveSettingsDebounced(); activeDragEl=null; document.removeEventListener('mousemove', handleDragMove); document.removeEventListener('mouseup', handleDragEnd); document.removeEventListener('touchmove', handleDragMove); document.removeEventListener('touchend', handleDragEnd); }