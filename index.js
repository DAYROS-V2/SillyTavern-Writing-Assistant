// index.js
(function() {
    const EXTENSION_NAME = "QuickFormatting";
    const SETTINGS_KEY = "QuickFormatting_Settings";
    
    // Default config
    const buttons = [
        { label: '*', start: '*', end: '*', title: 'Action / Description' },
        { label: '""', start: '"', end: '"', title: 'Dialogue' },
        { label: '(OOC)', start: '(OOC: ', end: ')', title: 'Out Of Character' },
        { label: '```', start: '```', end: '```', title: 'Thoughts / Code' }
    ];

    let container = null;
    let isEditing = false;
    let isDragging = false;
    
    // Load saved position/scale or use defaults
    let settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {
        x: '50%',
        y: '85%',
        scale: 1.0
    };

    /**
     * Inserts text tags around selection
     */
    function insertTag(startTag, endTag) {
        if (isEditing) return; // Disable typing when dragging
        
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

        const newCursorPos = start + startTag.length + selectedText.length;

        if (start === end) {
             textarea.setSelectionRange(start + startTag.length, start + startTag.length);
        } else {
             textarea.setSelectionRange(start + startTag.length, newCursorPos);
        }

        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /**
     * Updates CSS based on current settings
     */
    function updateStyles() {
        if (!container) return;
        container.style.left = settings.x;
        container.style.top = settings.y;
        container.style.transform = `translate(-50%, -50%) scale(${settings.scale})`;
    }

    /**
     * Save settings to LocalStorage
     */
    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        console.log(`[${EXTENSION_NAME}] Settings saved.`);
    }

    /**
     * Toggle Edit Mode
     */
    function toggleEditMode(enable) {
        isEditing = enable;
        if (isEditing) {
            container.classList.add('editing');
        } else {
            container.classList.remove('editing');
            saveSettings();
        }
    }

    function createUI() {
        if (document.getElementById('quick-format-bar')) return;

        container = document.createElement('div');
        container.id = 'quick-format-bar';
        container.className = 'quick-format-container';
        
        // Initial Position
        container.style.left = settings.x;
        container.style.top = settings.y;
        container.style.transform = `translate(-50%, -50%) scale(${settings.scale})`;

        // Create Format Buttons
        buttons.forEach(btnConfig => {
            const btn = document.createElement('button');
            btn.type = 'button'; 
            btn.className = 'quick-format-btn';
            btn.innerText = btnConfig.label;
            btn.title = btnConfig.title;
            
            // Handle Click
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                insertTag(btnConfig.start, btnConfig.end);
            });
            
            // Touch/Mouse start on button should not trigger drag immediately
            const stopProp = (e) => e.stopPropagation();
            btn.addEventListener('mousedown', stopProp);
            btn.addEventListener('touchstart', stopProp);

            container.appendChild(btn);
        });

        // Create Edit Controls (Hidden by default)
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'quick-format-controls';
        
        const zoomOut = document.createElement('button');
        zoomOut.innerText = '-';
        zoomOut.className = 'qf-control-btn';
        const handleZoomOut = (e) => {
            e.stopPropagation();
            settings.scale = Math.max(0.5, settings.scale - 0.1);
            updateStyles();
        };
        zoomOut.onclick = handleZoomOut;
        zoomOut.ontouchstart = handleZoomOut;

        const zoomIn = document.createElement('button');
        zoomIn.innerText = '+';
        zoomIn.className = 'qf-control-btn';
        const handleZoomIn = (e) => {
            e.stopPropagation();
            settings.scale = Math.min(2.0, settings.scale + 0.1);
            updateStyles();
        };
        zoomIn.onclick = handleZoomIn;
        zoomIn.ontouchstart = handleZoomIn;

        const saveBtn = document.createElement('button');
        saveBtn.innerText = 'SAVE';
        saveBtn.className = 'qf-control-btn save';
        const handleSave = (e) => {
            e.stopPropagation();
            toggleEditMode(false);
        };
        saveBtn.onclick = handleSave;
        saveBtn.ontouchstart = handleSave;

        controlsDiv.append(zoomOut, zoomIn, saveBtn);
        container.append(controlsDiv);

        // --- Drag Logic (Mouse + Touch) ---
        
        container.addEventListener('dblclick', () => toggleEditMode(true));

        function handleStart(e) {
            if (!isEditing) return;
            isDragging = true;
            // Prevent page scrolling on mobile while dragging
            if(e.type === 'touchstart') document.body.style.overflow = 'hidden';
        }

        function handleMove(e) {
            if (!isDragging || !isEditing) return;
            e.preventDefault(); // Stop scrolling/selection
            
            // Get pointer position (Mouse or Touch)
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            settings.x = clientX + 'px';
            settings.y = clientY + 'px';
            
            updateStyles();
        }

        function handleEnd() {
            isDragging = false;
            document.body.style.overflow = '';
        }

        // Mouse Events
        container.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);

        // Touch Events
        container.addEventListener('touchstart', handleStart, { passive: false });
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleEnd);

        // Append to BODY
        document.body.appendChild(container);
        
        // --- Visibility Loop ---
        setInterval(() => {
            const chatExists = !!document.getElementById('send_textarea');
            container.style.display = chatExists ? 'flex' : 'none';
        }, 500);
        
        console.log(`[${EXTENSION_NAME}] Floating UI loaded.`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }
})();
