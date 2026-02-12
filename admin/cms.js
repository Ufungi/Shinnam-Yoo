/**
 * cms.js — in-page admin overlay for Shinnam Yoo site
 * Included at the bottom of every page. Only activates if a GitHub PAT
 * is stored in localStorage (i.e., the owner is logged in via /admin/).
 */
(function () {
    'use strict';

    const PAT = localStorage.getItem('adminPat');
    if (!PAT) return;

    const OWNER  = 'Ufungi';
    const REPO   = 'Shinnam-Yoo';
    const BRANCH = 'main';
    const API    = 'https://api.github.com';

    /* ── Detect current file path in repo ──────── */
    function getRepoPath() {
        let p = location.pathname
            .replace(/^\/Shinnam-Yoo/, '')   // strip GitHub Pages prefix if any
            .replace(/^\//, '');             // strip leading slash
        if (!p.endsWith('.html')) {
            p = (p ? p.replace(/\/?$/, '/') : '') + 'index.html';
        }
        return p;
    }
    const REPO_PATH  = getRepoPath();
    const IS_GALLERY = REPO_PATH === 'gallery/index.html';
    const IS_PUBS    = REPO_PATH === 'publications/index.html';

    // Path back to admin/ from current page
    const ADMIN_PREFIX = REPO_PATH.includes('/') ? '../admin/' : 'admin/';

    /* ── GitHub API helpers ─────────────────────── */
    function gh(apiPath, opts = {}) {
        return fetch(API + apiPath, {
            ...opts,
            headers: {
                'Authorization': 'token ' + PAT,
                'Accept':        'application/vnd.github.v3+json',
                ...(opts.headers || {})
            }
        });
    }

    function b64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    function encodePath(p) {
        return p.split('/').map(encodeURIComponent).join('/');
    }

    async function getFile(path) {
        const r = await gh('/repos/' + OWNER + '/' + REPO + '/contents/' + encodePath(path) + '?ref=' + BRANCH);
        if (!r.ok) throw new Error(path + ': HTTP ' + r.status);
        return r.json();
    }

    async function putFile(path, content, sha, msg) {
        const r = await gh('/repos/' + OWNER + '/' + REPO + '/contents/' + encodePath(path), {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ message: msg, content: b64(content), sha, branch: BRANCH })
        });
        if (!r.ok) {
            const e = await r.json().catch(() => ({}));
            const hint = r.status === 404 ? ' (PAT lacks write scope)' : r.status === 422 ? ' (SHA conflict)' : '';
            throw new Error('HTTP ' + r.status + hint + ': ' + (e.message || 'unknown'));
        }
        return r.json();
    }

    async function putFileBin(path, b64content, sha, msg) {
        const body = { message: msg, content: b64content, branch: BRANCH };
        if (sha) body.sha = sha;
        const r = await gh('/repos/' + OWNER + '/' + REPO + '/contents/' + encodePath(path), {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body)
        });
        if (!r.ok) {
            const e = await r.json().catch(() => ({}));
            throw new Error('Upload HTTP ' + r.status + ': ' + (e.message || 'unknown'));
        }
    }

    async function deleteFile(path, sha, msg) {
        const r = await gh('/repos/' + OWNER + '/' + REPO + '/contents/' + encodePath(path), {
            method:  'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ message: msg, sha, branch: BRANCH })
        });
        if (!r.ok) {
            const e = await r.json().catch(() => ({}));
            throw new Error('Delete HTTP ' + r.status + ': ' + (e.message || 'unknown'));
        }
    }

    /* ── Styles ─────────────────────────────────── */
    function injectStyles() {
        const s = document.createElement('style');
        s.id = 'cms-styles';
        s.textContent = `
        #cms-bar {
            position: fixed; bottom: 1.25rem; right: 1.25rem; z-index: 9999;
            display: flex; align-items: center; gap: 0.45rem;
            background: rgba(20,10,4,0.97);
            border: 1px solid rgba(193,154,107,0.5);
            border-radius: 10px; padding: 0.5rem 0.85rem;
            font-family: 'Segoe UI', system-ui, sans-serif; font-size: 0.8rem;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 24px rgba(0,0,0,0.65);
        }
        #cms-bar-label { color: #c19a6b; font-weight: 700; letter-spacing: 0.04em; margin-right: 0.2rem; }
        .cms-btn {
            padding: 0.28rem 0.65rem; border-radius: 5px;
            border: 1px solid rgba(193,154,107,0.3);
            background: rgba(193,154,107,0.1); color: #f0ebe0;
            cursor: pointer; font-size: 0.78rem; font-family: inherit;
            transition: background 0.15s; white-space: nowrap; text-decoration: none;
        }
        .cms-btn:hover:not(:disabled) { background: rgba(193,154,107,0.25); }
        .cms-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .cms-btn.cms-active { background: rgba(193,154,107,0.35); border-color: rgba(193,154,107,0.75); }
        #cms-status {
            font-size: 0.75rem; color: #c4aa88;
            max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        body.cms-edit {
            caret-color: #c19a6b;
        }
        body.cms-edit img.cms-img-replace {
            outline: 2px dashed rgba(107,154,193,0.6);
            cursor: zoom-in !important;
        }
        body.cms-edit img.cms-img-replace:hover {
            outline: 2px solid #6b9ac1;
        }
        .gallery-item { position: relative; }
        .cms-trash, .cms-rotate, .cms-rename {
            position: absolute; top: 0.4rem;
            width: 28px; height: 28px; border-radius: 50%;
            background: rgba(20,10,4,0.88);
            cursor: pointer; display: none;
            align-items: center; justify-content: center;
            z-index: 20; padding: 0; line-height: 1;
            transition: background 0.15s; font-size: 0.78rem;
        }
        .cms-trash {
            right: 0.4rem;
            border: 1px solid rgba(201,107,107,0.55); color: #e8a0a0;
        }
        .cms-trash:hover { background: rgba(201,107,107,0.5); }
        .cms-rotate {
            right: 2.4rem;
            border: 1px solid rgba(193,154,107,0.5); color: #c19a6b; font-size: 1rem;
        }
        .cms-rotate:hover { background: rgba(193,154,107,0.3); }
        .cms-rotate:disabled { opacity: 0.4; cursor: not-allowed; }
        .cms-rename {
            right: 4.4rem;
            border: 1px solid rgba(107,193,154,0.5); color: #6bc19a; font-size: 0.9rem;
        }
        .cms-rename:hover { background: rgba(107,193,154,0.3); }
        body.cms-admin .gallery-item .cms-trash,
        body.cms-admin .gallery-item .cms-rotate,
        body.cms-admin .gallery-item .cms-rename { display: flex; }
        .gallery-item[draggable="true"] { cursor: grab; }
        .gallery-item.drag-over { outline: 3px dashed rgba(193,154,107,0.8); opacity: 0.75; }
        .cms-add-btn {
            display: none; width: 100%; margin-top: 0.75rem;
            padding: 0.75rem 1rem;
            border: 2px dashed rgba(193,154,107,0.3); border-radius: 10px;
            background: rgba(193,154,107,0.04); color: #c19a6b;
            font-size: 0.85rem; font-family: 'Karla', sans-serif;
            cursor: pointer; text-align: center;
            transition: background 0.2s, border-color 0.2s;
        }
        .cms-add-btn:hover { background: rgba(193,154,107,0.12); border-color: rgba(193,154,107,0.6); }
        body.cms-admin .cms-add-btn { display: block; }
        .cms-pub-del {
            position: absolute; top: 0.3rem; right: 0.3rem;
            width: 22px; height: 22px; border-radius: 50%;
            background: rgba(20,10,4,0.85);
            border: 1px solid rgba(201,107,107,0.55); color: #e8a0a0;
            cursor: pointer; font-size: 0.7rem; line-height: 1;
            display: flex; align-items: center; justify-content: center;
            z-index: 10;
        }
        .cms-pub-del:hover { background: rgba(201,107,107,0.5); }
        .cms-add-pub { margin: 1rem 0; display: block; width: 100%; }
        #cms-color-panel {
            position: absolute; bottom: 3.5rem; right: 0;
            background: rgba(20,10,4,0.98);
            border: 1px solid rgba(193,154,107,0.5);
            padding: 1rem 1.2rem; border-radius: 10px;
            z-index: 10001; min-width: 230px;
            font-family: 'Segoe UI', system-ui, sans-serif; font-size: 0.82rem;
            color: #c4aa88;
            box-shadow: 0 8px 32px rgba(0,0,0,0.7);
        }
        #cms-color-panel label {
            display: flex; align-items: center; justify-content: space-between;
            gap: 0.75rem; margin-bottom: 0.6rem; color: #c4aa88;
        }
        #cms-color-panel input[type="color"] {
            width: 40px; height: 26px;
            border: 1px solid rgba(193,154,107,0.4);
            border-radius: 4px; padding: 1px; cursor: pointer; background: none;
        }
        #cms-color-panel .cp-row { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
        `;
        document.head.appendChild(s);
    }

    /* ── Admin bar ──────────────────────────────── */
    function setStatus(msg) {
        const el = document.getElementById('cms-status');
        if (el) el.textContent = msg;
    }

    function injectBar() {
        const bar = document.createElement('div');
        bar.id = 'cms-bar';
        bar.style.position = 'relative';

        let editControls = '';
        if (IS_GALLERY) {
            editControls =
                '<button class="cms-btn" id="cms-gallery-save" onclick="cmsGallerySave()" style="display:none">&#8593; Save Order</button>';
        } else {
            editControls =
                '<button class="cms-btn" id="cms-edit-btn" onclick="cmsToggleEdit()">&#9998; Edit</button>' +
                '<button class="cms-btn" id="cms-save-btn" onclick="cmsSave()" style="display:none">&#8593; Save</button>' +
                '<button class="cms-btn" id="cms-color-btn" onclick="cmsToggleColors()" title="Edit colors">&#127912;</button>' +
                '<div id="cms-color-panel" style="display:none"></div>';
        }

        bar.innerHTML =
            '<span id="cms-bar-label">&#9881; Admin</span>' +
            editControls +
            '<span id="cms-status"></span>' +
            '<a href="' + ADMIN_PREFIX + 'index.html" class="cms-btn">Panel</a>';

        document.body.appendChild(bar);
        document.body.classList.add('cms-admin');
    }

    /* ── Text editing (non-gallery pages) ──────── */
    let editMode = false;

    window.cmsToggleEdit = function () {
        editMode = !editMode;
        document.body.classList.toggle('cms-edit', editMode);
        const editBtn = document.getElementById('cms-edit-btn');
        const saveBtn = document.getElementById('cms-save-btn');
        if (editBtn) editBtn.classList.toggle('cms-active', editMode);
        if (saveBtn) saveBtn.style.display = editMode ? '' : 'none';

        if (editMode) {
            // Native browser editing mode — makes entire page editable
            document.designMode = 'on';
            // Lock out UI chrome from being edited
            document.querySelectorAll('#cms-bar, nav, footer').forEach(el => {
                el.contentEditable = 'false';
            });
            initImgReplace();
        } else {
            document.designMode = 'off';
            document.querySelectorAll('#cms-bar, nav, footer').forEach(el => {
                el.removeAttribute('contenteditable');
            });
            document.querySelectorAll('img.cms-img-replace').forEach(img => {
                img.classList.remove('cms-img-replace');
                img.removeAttribute('contenteditable');
                img.removeEventListener('click', handleImgReplace);
            });
        }

        // Publications: add/delete controls
        if (IS_PUBS) {
            if (editMode) {
                document.querySelectorAll('.pub-item').forEach(entry => {
                    entry.style.position = 'relative';
                    const btn = document.createElement('button');
                    btn.className = 'cms-pub-del';
                    btn.innerHTML = '&#10005;';
                    btn.title = 'Delete this publication';
                    btn.contentEditable = 'false';
                    btn.addEventListener('click', () => entry.remove());
                    entry.appendChild(btn);
                });
                const addBtn = document.createElement('button');
                addBtn.className = 'cms-btn cms-add-pub';
                addBtn.id = 'cms-add-pub-btn';
                addBtn.contentEditable = 'false';
                addBtn.textContent = '+ Add Publication';
                addBtn.addEventListener('click', cmsAddPublication);
                document.querySelector('.pub-list')?.after(addBtn);
            } else {
                document.querySelectorAll('.cms-pub-del').forEach(b => b.remove());
                document.getElementById('cms-add-pub-btn')?.remove();
                document.querySelectorAll('.pub-item').forEach(e => e.style.position = '');
            }
        }

        setStatus(editMode ? 'Click anywhere to edit text — double-click image to replace' : '');
    };

    /* ── Image replacement (non-gallery) ───────── */
    function initImgReplace() {
        document.querySelectorAll('img:not(#cms-bar *):not(nav *)')
            .forEach(img => {
                img.classList.add('cms-img-replace');
                // contentEditable=false prevents browser's resize-handle UI in designMode
                // while still allowing our click handler to fire
                img.contentEditable = 'false';
                img.removeEventListener('dblclick', handleImgReplace);
                img.addEventListener('dblclick', handleImgReplace);
            });
    }

    async function handleImgReplace(e) {
        if (!editMode) return;
        e.stopPropagation();
        const img = e.currentTarget;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const b64content = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload  = () => res(r.result.split(',')[1]);
                r.onerror = rej;
                r.readAsDataURL(file);
            });
            const relSrc = img.getAttribute('src');
            const repoImgPath = resolveRepoPath(REPO_PATH, relSrc);
            setStatus('Uploading…');
            try {
                let sha = null;
                try { const f = await getFile(repoImgPath); sha = f.sha; } catch (_) {}
                await putFileBin(repoImgPath, b64content, sha, 'admin: replace ' + repoImgPath.split('/').pop());
                img.src = img.src.split('?')[0] + '?t=' + Date.now();
                setStatus('Image replaced!');
            } catch (err) {
                setStatus('Error: ' + err.message);
            }
        };
        input.click();
    }

    function resolveRepoPath(repoFilePath, relImgSrc) {
        // Resolve relative img src against the repo directory of the current page
        const parts = repoFilePath.split('/');
        parts.pop(); // remove filename, keep directory
        relImgSrc.split('/').forEach(seg => {
            if (seg === '..') parts.pop();
            else if (seg !== '.') parts.push(seg);
        });
        return parts.join('/');
    }

    /* ── Color picker ───────────────────────────── */
    const COLOR_VARS = [
        { label: 'Background', v: '--bg-dark' },
        { label: 'Section bg',  v: '--bg-section' },
        { label: 'Accent',     v: '--accent' },
        { label: 'Text',       v: '--text-primary' }
    ];

    window.cmsToggleColors = function () {
        const panel = document.getElementById('cms-color-panel');
        if (!panel) return;
        if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }

        const cs = getComputedStyle(document.documentElement);
        panel.innerHTML = COLOR_VARS.map(c => {
            const raw = cs.getPropertyValue(c.v).trim();
            const hex = rgbToHex(raw) || raw;
            return '<label>' + c.label +
                '<input type="color" data-var="' + c.v + '" value="' + hex + '"></label>';
        }).join('') +
        '<div class="cp-row">' +
        '<button class="cms-btn" onclick="cmsApplyColors()">Apply</button>' +
        '<button class="cms-btn" onclick="cmsApplyColorsSave()">Apply &amp; Save</button>' +
        '</div>';
        panel.style.display = '';
    };

    function rgbToHex(rgb) {
        const m = rgb.match(/\d+/g);
        if (!m || m.length < 3) return null;
        return '#' + [0,1,2].map(i => parseInt(m[i]).toString(16).padStart(2,'0')).join('');
    }

    function applyColorsToDom() {
        const panel = document.getElementById('cms-color-panel');
        if (!panel) return;
        panel.querySelectorAll('input[type="color"]').forEach(input => {
            document.documentElement.style.setProperty(input.dataset.var, input.value);
        });
    }

    window.cmsApplyColors = function () {
        applyColorsToDom();
        setStatus('Colors applied (not saved)');
    };

    window.cmsApplyColorsSave = async function () {
        applyColorsToDom();
        const panel = document.getElementById('cms-color-panel');
        if (!panel) return;
        setStatus('Saving colors…');
        try {
            const file = await getFile(REPO_PATH);
            let html = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
            panel.querySelectorAll('input[type="color"]').forEach(input => {
                const v = input.dataset.var.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                html = html.replace(
                    new RegExp('(' + v + '\\s*:\\s*)([^;]+)(;)'),
                    '$1' + input.value + '$3'
                );
            });
            await putFile(REPO_PATH, html, file.sha, 'admin: update colors ' + REPO_PATH);
            setStatus('Colors saved!');
        } catch (err) {
            setStatus('Error: ' + err.message);
        }
    };

    /* ── Save page (non-gallery) ────────────────── */
    window.cmsSave = async function () {
        const btn = document.getElementById('cms-save-btn');
        if (btn) btn.disabled = true;
        setStatus('Saving…');
        try {
            const clone = document.documentElement.cloneNode(true);
            clone.querySelector('#cms-bar')?.remove();
            clone.querySelector('#cms-styles')?.remove();
            clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
            clone.querySelectorAll('.cms-pub-del, #cms-add-pub-btn').forEach(el => el.remove());
            clone.querySelectorAll('.pub-item').forEach(e => e.style.position = '');
            clone.querySelectorAll('img.cms-img-replace').forEach(img => img.classList.remove('cms-img-replace'));
            clone.classList.remove('cms-admin', 'cms-edit');

            const newHtml = '<!DOCTYPE html>\n' + clone.outerHTML;
            const file = await getFile(REPO_PATH);
            await putFile(REPO_PATH, newHtml, file.sha, 'admin: update ' + REPO_PATH);

            setStatus('Saved!');
            editMode = false;
            document.designMode = 'off';
            document.body.classList.remove('cms-edit');
            document.getElementById('cms-edit-btn')?.classList.remove('cms-active');
            if (btn) btn.style.display = 'none';
            document.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
            document.querySelectorAll('.cms-pub-del, #cms-add-pub-btn').forEach(el => el.remove());
            document.querySelectorAll('img.cms-img-replace').forEach(img => {
                img.classList.remove('cms-img-replace');
            });
        } catch (e) {
            setStatus(e.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    };

    /* ── Publications: add entry ────────────────── */
    function cmsAddPublication() {
        const list = document.querySelector('.pub-list');
        if (!list) return;
        const li = document.createElement('li');
        li.className = 'pub-item';
        li.style.position = 'relative';
        li.innerHTML =
            '<span class="pub-num" aria-hidden="true"></span>' +
            '<div class="pub-body">' +
            '<div class="pub-authors">Author, A. &amp; Author, B.</div>' +
            '<div class="pub-title">Paper title here</div>' +
            '<div class="pub-meta"><em>Journal</em> (Year)</div>' +
            '</div>';
        const delBtn = document.createElement('button');
        delBtn.className = 'cms-pub-del';
        delBtn.innerHTML = '&#10005;';
        delBtn.title = 'Delete this publication';
        delBtn.contentEditable = 'false';
        delBtn.addEventListener('click', () => li.remove());
        li.appendChild(delBtn);
        list.appendChild(li);
        li.querySelector('[contenteditable]')?.focus();
    }

    /* ── Gallery admin ──────────────────────────── */
    const SECTION_MAP = {
        mushroomGrid: {
            key:  'mushroom',
            dir:  'images/Mushrooms',
            arr:  'mushroomImages',
            src:  '../images/Mushrooms/',
            thumb:'../images/Mushrooms/thumbs/'
        },
        animalGrid: {
            key:  'animal',
            dir:  'images/Animals',
            arr:  'animalImages',
            src:  '../images/Animals/',
            thumb: null
        },
        samplingGrid: {
            key:  'sampling',
            dir:  'images/Sampling',
            arr:  'samplingImages',
            src:  '../images/Sampling/',
            thumb: null
        }
    };

    /* ── Gallery drag-and-drop ───────────────────── */
    let dragSrc = null;

    function makeDraggable(item) {
        item.setAttribute('draggable', 'true');
        item.addEventListener('dragstart', e => {
            dragSrc = item;
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => { item.style.opacity = '0.4'; }, 0);
        });
        item.addEventListener('dragend', () => {
            item.style.opacity = '';
            document.querySelectorAll('.gallery-item').forEach(i => i.classList.remove('drag-over'));
        });
        item.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (item !== dragSrc) item.classList.add('drag-over');
        });
        item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
        item.addEventListener('drop', e => {
            e.preventDefault();
            item.classList.remove('drag-over');
            if (dragSrc && dragSrc !== item) {
                const targetGrid = item.closest('.masonry-grid');
                if (targetGrid) {
                    targetGrid.insertBefore(dragSrc, item);
                    const saveBtn = document.getElementById('cms-gallery-save');
                    if (saveBtn) saveBtn.style.display = '';
                }
            }
        });
    }

    window.cmsGallerySave = async function () {
        const btn = document.getElementById('cms-gallery-save');
        if (btn) btn.disabled = true;
        setStatus('Saving order…');
        try {
            const getFilenames = gridId => [...document.querySelectorAll('#' + gridId + ' .gallery-item img')]
                .map(img => decodeURIComponent(img.getAttribute('src').split('/').pop().split('?')[0]));

            const file = await getFile('gallery/index.html');
            let html = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));

            function replaceArr(h, arrName, files) {
                const items = files.map(f => "            '" + f.replace(/'/g, "\\'") + "'").join(',\n');
                return h.replace(
                    new RegExp('(const ' + arrName + '\\s*=\\s*\\[)([\\s\\S]*?)(\\];)'),
                    '$1\n' + items + '\n        $3'
                );
            }

            html = replaceArr(html, 'mushroomImages', getFilenames('mushroomGrid'));
            html = replaceArr(html, 'animalImages',   getFilenames('animalGrid'));
            html = replaceArr(html, 'samplingImages', getFilenames('samplingGrid'));

            await putFile('gallery/index.html', html, file.sha, 'admin: reorder gallery photos');
            if (btn) btn.style.display = 'none';
            setStatus('Order saved!');
        } catch (e) {
            setStatus(e.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    };

    function getItemFilename(item) {
        return item.dataset.cmsFilename || '';
    }

    function getItemInfo(item) {
        const grid = item.closest('.masonry-grid');
        return SECTION_MAP[grid?.id] || null;
    }

    function addGalleryButtons(item) {
        // Trash
        const trash = document.createElement('button');
        trash.className = 'cms-trash';
        trash.innerHTML = '&#128465;';
        trash.addEventListener('click', e => {
            e.stopPropagation();
            cmsDeletePhoto(item, getItemFilename(item), getItemInfo(item));
        });
        item.appendChild(trash);

        // Rotate
        const rotate = document.createElement('button');
        rotate.className = 'cms-rotate';
        rotate.title = 'Rotate 90° clockwise';
        rotate.innerHTML = '&#8635;';
        rotate.addEventListener('click', e => {
            e.stopPropagation();
            cmsRotatePhoto(item, rotate, getItemFilename(item), getItemInfo(item));
        });
        item.appendChild(rotate);

        // Rename
        const rename = document.createElement('button');
        rename.className = 'cms-rename';
        rename.title = 'Rename';
        rename.innerHTML = '&#9998;';
        rename.addEventListener('click', e => {
            e.stopPropagation();
            cmsRenamePhoto(item, getItemFilename(item), getItemInfo(item));
        });
        item.appendChild(rename);
    }

    function initGallery() {
        document.querySelectorAll('.gallery-item').forEach(item => {
            const grid = item.closest('.masonry-grid');
            const info = SECTION_MAP[grid?.id];
            if (!info) return;
            const img = item.querySelector('img');
            if (!img) return;
            const filename = decodeURIComponent(img.getAttribute('src').split('/').pop().split('?')[0]);
            item.dataset.cmsFilename = filename;
            addGalleryButtons(item);
            makeDraggable(item);
        });

        // Add "+" button after each section's masonry grid
        Object.entries(SECTION_MAP).forEach(([gridId, info]) => {
            const grid = document.getElementById(gridId);
            if (!grid) return;
            const btn = document.createElement('button');
            btn.className = 'cms-add-btn';
            btn.textContent = '+ Add photo';
            btn.addEventListener('click', () => cmsUploadPhoto(info, grid));
            grid.parentElement.appendChild(btn);
        });
    }

    async function cmsRenamePhoto(item, oldName, info) {
        if (!oldName || !info) return;
        const ext = oldName.split('.').pop();
        const base = oldName.replace(/\.[^.]+$/, '');
        const newBase = prompt('Rename "' + oldName + '" to (without extension):', base);
        if (!newBase || newBase.trim() === '' || newBase.trim() === base) return;
        const newName = newBase.trim() + '.' + ext;
        setStatus('Renaming…');
        try {
            const oldPath = info.dir + '/' + oldName;
            const newPath = info.dir + '/' + newName;
            const oldFile = await getFile(oldPath);
            const content = oldFile.content.replace(/\n/g, '');
            // Create new file, delete old
            await putFileBin(newPath, content, null, 'admin: rename ' + oldName + ' to ' + newName);
            await deleteFile(oldPath, oldFile.sha, 'admin: rename (del) ' + oldName);

            // Rename thumbnail for Mushrooms
            if (info.key === 'mushroom') {
                const oldThumbName = oldName.replace(/\.\w+$/, '.jpg');
                const newThumbName = newBase.trim() + '.jpg';
                try {
                    const tf = await getFile('images/Mushrooms/thumbs/' + oldThumbName);
                    await putFileBin('images/Mushrooms/thumbs/' + newThumbName, tf.content.replace(/\n/g, ''), null, 'admin: rename thumb');
                    await deleteFile('images/Mushrooms/thumbs/' + oldThumbName, tf.sha, 'admin: rename thumb (del)');
                } catch (_) {}
            }

            // Update gallery/index.html array
            const gf = await getFile('gallery/index.html');
            let html = decodeURIComponent(escape(atob(gf.content.replace(/\n/g, ''))));
            const escOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "\\'");
            html = html.replace(new RegExp("'" + escOld + "'", 'g'), "'" + newName.replace(/'/g, "\\'") + "'");
            await putFile('gallery/index.html', html, gf.sha, 'admin: rename ' + oldName + ' to ' + newName);

            // Update DOM
            item.dataset.cmsFilename = newName;
            const img = item.querySelector('img');
            if (img) {
                const newSrc = img.getAttribute('src').replace(
                    encodeURIComponent(oldName),
                    encodeURIComponent(newName)
                );
                img.src = newSrc.split('?')[0] + '?t=' + Date.now();
            }

            setStatus('Renamed to ' + newName);
        } catch (err) {
            setStatus('Error: ' + err.message);
        }
    }

    async function cmsRotatePhoto(item, btn, filename, info) {
        btn.disabled = true;
        setStatus('Rotating…');
        try {
            const fullSrc = info.src + encodeURIComponent(filename) + '?t=' + Date.now();
            const img = await new Promise((res, rej) => {
                const i = new Image();
                i.crossOrigin = 'anonymous';
                i.onload = () => res(i);
                i.onerror = () => rej(new Error('Could not load image for rotation'));
                i.src = fullSrc;
            });

            const canvas = document.createElement('canvas');
            canvas.width  = img.naturalHeight;
            canvas.height = img.naturalWidth;
            const ctx = canvas.getContext('2d');
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

            const b64content = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];

            const filePath = info.dir + '/' + filename;
            const f = await getFile(filePath);
            await putFileBin(filePath, b64content, f.sha, 'admin: rotate ' + filename);

            if (info.key === 'mushroom') {
                const THUMB_MAX = 400;
                const scale = THUMB_MAX / Math.max(canvas.width, canvas.height);
                const tc = document.createElement('canvas');
                tc.width  = Math.round(canvas.width  * scale);
                tc.height = Math.round(canvas.height * scale);
                tc.getContext('2d').drawImage(canvas, 0, 0, tc.width, tc.height);
                const thumbB64 = tc.toDataURL('image/jpeg', 0.8).split(',')[1];
                const thumbName = filename.replace(/\.\w+$/, '.jpg');
                const tp = 'images/Mushrooms/thumbs/' + thumbName;
                let thumbSha = '';
                try { const tf = await getFile(tp); thumbSha = tf.sha; } catch (_) {}
                await putFileBin(tp, thumbB64, thumbSha, 'admin: rotate thumb ' + thumbName);
            }

            const displayImg = item.querySelector('img');
            if (displayImg) {
                const base = displayImg.getAttribute('src').split('?')[0];
                displayImg.src = base + '?t=' + Date.now();
            }

            setStatus('Rotated!');
        } catch (e) {
            setStatus(e.message);
        } finally {
            btn.disabled = false;
        }
    }

    async function cmsDeletePhoto(item, filename, info) {
        if (!filename || !info) return;
        if (!confirm('Delete "' + filename + '" from gallery?\nThis cannot be undone.')) return;
        setStatus('Deleting…');
        try {
            const filePath = info.dir + '/' + filename;
            const f = await getFile(filePath);
            await deleteFile(filePath, f.sha, 'admin: delete ' + filename);

            if (info.key === 'mushroom') {
                try {
                    const thumbName = filename.replace(/\.\w+$/, '.jpg');
                    const tp = 'images/Mushrooms/thumbs/' + thumbName;
                    const tf = await getFile(tp);
                    await deleteFile(tp, tf.sha, 'admin: delete thumb ' + thumbName);
                } catch (_) {}
            }

            await updateGalleryArr(info.arr, filename, 'remove');
            item.remove();

            const countIds = { mushroomImages: 'mushroomCount', animalImages: 'animalCount', samplingImages: 'samplingCount' };
            const countEl = document.getElementById(countIds[info.arr]);
            if (countEl) {
                const gridEl = document.getElementById(info.arr.replace('Images', 'Grid'));
                const n = gridEl?.querySelectorAll('.gallery-item').length;
                if (n !== undefined) countEl.textContent = n + ' photos';
            }
            setStatus('Deleted.');
        } catch (e) {
            setStatus(e.message);
        }
    }

    async function cmsUploadPhoto(info, grid) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file) return;
            setStatus('Uploading…');
            try {
                const b64content = await new Promise((res, rej) => {
                    const reader = new FileReader();
                    reader.onload  = () => res(reader.result.split(',')[1]);
                    reader.onerror = rej;
                    reader.readAsDataURL(file);
                });

                const filename = file.name;
                const filePath = info.dir + '/' + filename;

                let sha = '';
                try { const ex = await getFile(filePath); sha = ex.sha; } catch (_) {}

                await putFileBin(filePath, b64content, sha, 'admin: add ' + filename);
                await updateGalleryArr(info.arr, filename, 'add');

                const item = document.createElement('div');
                item.className = 'gallery-item';
                item.dataset.cmsFilename = filename;
                const img = document.createElement('img');
                img.src = (info.thumb || info.src) + encodeURIComponent(filename);
                img.loading = 'lazy';
                item.appendChild(img);
                addGalleryButtons(item);
                makeDraggable(item);
                grid.appendChild(item);

                const countIds = { mushroomImages: 'mushroomCount', animalImages: 'animalCount', samplingImages: 'samplingCount' };
                const countEl = document.getElementById(countIds[info.arr]);
                if (countEl) countEl.textContent = grid.querySelectorAll('.gallery-item').length + ' photos';

                setStatus('Uploaded!');
            } catch (e) {
                setStatus(e.message);
            }
        });
        input.click();
    }

    async function updateGalleryArr(arrName, filename, action) {
        const file = await getFile('gallery/index.html');
        let html = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
        const re = new RegExp('(const ' + arrName + '\\s*=\\s*\\[)([\\s\\S]*?)(\\];)');
        html = html.replace(re, (_, pre, content, post) => {
            const esc = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "\\'");
            if (action === 'remove') {
                content = content
                    .replace(new RegExp(",\\s*'" + esc + "'", 'g'), '')
                    .replace(new RegExp("'" + esc + "',\\s*", 'g'), '')
                    .replace(new RegExp("'" + esc + "'", 'g'), '');
            } else {
                content = content.trimEnd() + ",\n            '" + filename + "'\n        ";
            }
            return pre + content + post;
        });
        await putFile('gallery/index.html', html, file.sha, 'admin: ' + action + ' ' + filename);
    }

    /* ── Init ───────────────────────────────────── */
    function init() {
        injectStyles();
        injectBar();
        if (IS_GALLERY) initGallery();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
