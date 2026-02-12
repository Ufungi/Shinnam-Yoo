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
        /* image overlay toolbar */
        #cms-img-overlay {
            position: absolute; z-index: 9998; display: none;
            align-items: center; gap: 0.3rem;
            background: rgba(20,10,4,0.93);
            border: 1px solid rgba(193,154,107,0.4);
            border-radius: 5px; padding: 0.2rem 0.4rem;
        }
        #cms-img-overlay.cmsov-on { display: flex; }
        .cmsov-btn {
            padding: 0.18rem 0.5rem; border-radius: 4px;
            border: 1px solid rgba(193,154,107,0.3);
            background: rgba(193,154,107,0.1); color: #f0ebe0;
            cursor: pointer; font-size: 0.72rem; font-family: inherit;
            transition: background 0.15s;
        }
        .cmsov-btn:hover { background: rgba(193,154,107,0.3); }
        /* image resize handle */
        #cms-resize-handle {
            position: absolute; z-index: 9998; display: none;
            width: 13px; height: 13px;
            background: #c19a6b; border: 2px solid #1a0f07;
            border-radius: 2px; cursor: se-resize;
        }
        #cms-resize-handle.cmsov-on { display: block; }
        /* section drag handle */
        .cms-sec-draggable { position: relative; }
        .cms-sec-handle {
            position: absolute; top: 0.45rem; right: 0.45rem; z-index: 10;
            width: 1.4rem; height: 1.4rem;
            background: rgba(20,10,4,0.88);
            border: 1px solid rgba(193,154,107,0.45);
            border-radius: 3px; color: rgba(193,154,107,0.8);
            cursor: grab; font-size: 1rem; line-height: 1;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.15s; user-select: none;
        }
        .cms-sec-draggable:hover > .cms-sec-handle { opacity: 1; }
        .cms-sec-draggable.sec-drag-over { outline: 2px dashed rgba(193,154,107,0.7); border-radius: 4px; }
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
        /* upload progress toast + operation toast */
        #cms-upload-toast, #cms-op-toast {
            position: fixed; bottom: 5.5rem; right: 1.25rem; z-index: 10000;
            background: rgba(20,10,4,0.97);
            border: 1px solid rgba(193,154,107,0.5);
            border-radius: 8px; padding: 0.75rem 1rem; min-width: 215px;
            font-family: 'Segoe UI', system-ui, sans-serif; font-size: 0.82rem;
            color: #c4aa88; box-shadow: 0 4px 24px rgba(0,0,0,0.65);
        }
        #cms-upload-toast .upt-title, #cms-op-toast .upt-title { color: #f0ebe0; font-weight: 600; margin-bottom: 0.35rem; }
        #cms-upload-toast .upt-file  { font-size: 0.73rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.8; }
        #cms-upload-toast .upt-bar-bg   { margin-top: 0.5rem; height: 4px; background: rgba(193,154,107,0.18); border-radius: 2px; }
        #cms-upload-toast .upt-bar-fill { height: 100%; background: #c19a6b; border-radius: 2px; transition: width 0.25s; }
        #cms-upload-toast.done .upt-title, #cms-op-toast.done .upt-title { color: #7cba6b; }
        #cms-op-toast.error .upt-title { color: #e8a0a0; }
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

    let opToastTimer = null;
    function showOp(msg, state) {
        if (opToastTimer) { clearTimeout(opToastTimer); opToastTimer = null; }
        let el = document.getElementById('cms-op-toast');
        if (state === 'hide') { el?.remove(); return; }
        if (!el) {
            el = document.createElement('div');
            el.id = 'cms-op-toast';
            document.body.appendChild(el);
        }
        el.className = '';
        if (state === 'done') {
            el.classList.add('done');
            el.innerHTML = '<div class="upt-title">&#10003; ' + msg + '</div>';
            opToastTimer = setTimeout(() => { el.remove(); opToastTimer = null; }, 2000);
        } else if (state === 'error') {
            el.classList.add('error');
            el.innerHTML = '<div class="upt-title">&#10007; ' + msg + '</div>';
            opToastTimer = setTimeout(() => { el.remove(); opToastTimer = null; }, 3500);
        } else {
            el.innerHTML = '<div class="upt-title">&#8230; ' + msg + '</div>';
        }
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
    let imgOverlayEl   = null;
    let imgOverlayTarget = null;
    let resizeHandleEl = null;
    let secDragSrc    = null;
    let secDraggables = [];
    const secAbortCtrls = [];

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
            // Only lock the admin bar itself; nav + footer are now fully editable
            const bar = document.getElementById('cms-bar');
            if (bar) bar.contentEditable = 'false';
            initImgReplace();
            initSectionReorder();
        } else {
            document.designMode = 'off';
            const bar = document.getElementById('cms-bar');
            if (bar) bar.removeAttribute('contenteditable');
            document.querySelectorAll('img.cms-img-replace').forEach(img => {
                img.classList.remove('cms-img-replace');
                img.removeAttribute('contenteditable');
                img.removeEventListener('dblclick', handleImgReplace);
            });
            if (imgOverlayEl)  imgOverlayEl.classList.remove('cmsov-on');
            if (resizeHandleEl) resizeHandleEl.classList.remove('cmsov-on');
            cleanupSectionReorder();
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

        setStatus(editMode ? 'Click to edit · Dbl-click image to replace · ⠿ drag to reorder · corner to resize' : '');
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
            showOp('Uploading image…', 'busy');
            try {
                let sha = null;
                try { const f = await getFile(repoImgPath); sha = f.sha; } catch (_) {}
                await putFileBin(repoImgPath, b64content, sha, 'admin: replace ' + repoImgPath.split('/').pop());
                img.src = img.src.split('?')[0] + '?t=' + Date.now();
                showOp('Image replaced!', 'done');
            } catch (err) {
                showOp(err.message, 'error');
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

    /* ── Image overlay toolbar + resize ─────────── */
    function initImgOverlay() {
        // Toolbar (Replace / Rotate)
        imgOverlayEl = document.createElement('div');
        imgOverlayEl.id = 'cms-img-overlay';
        imgOverlayEl.contentEditable = 'false';
        imgOverlayEl.innerHTML =
            '<button class="cmsov-btn" id="cmsov-repl">&#8593; Replace</button>' +
            '<button class="cmsov-btn" id="cmsov-rot">&#8635; Rotate</button>';
        document.body.appendChild(imgOverlayEl);
        imgOverlayEl.querySelector('#cmsov-repl').addEventListener('click', e => {
            e.stopPropagation();
            if (imgOverlayTarget) imgOverlayTarget.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        });
        imgOverlayEl.querySelector('#cmsov-rot').addEventListener('click', e => {
            e.stopPropagation();
            if (imgOverlayTarget) cmsRotateContentImg(imgOverlayTarget);
        });

        // Resize handle (bottom-right corner of hovered image)
        resizeHandleEl = document.createElement('div');
        resizeHandleEl.id = 'cms-resize-handle';
        resizeHandleEl.contentEditable = 'false';
        resizeHandleEl.title = 'Drag to resize';
        document.body.appendChild(resizeHandleEl);

        let rsStartX, rsStartW, rsTarget;
        resizeHandleEl.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            rsTarget  = imgOverlayTarget;
            rsStartX  = e.clientX;
            rsStartW  = rsTarget ? rsTarget.offsetWidth : 0;
            const onMove = ev => {
                if (!rsTarget) return;
                const newW = Math.max(40, rsStartW + (ev.clientX - rsStartX));
                rsTarget.style.width  = newW + 'px';
                rsTarget.style.height = 'auto';
                const r = rsTarget.getBoundingClientRect();
                resizeHandleEl.style.top  = (r.bottom + window.scrollY - 7) + 'px';
                resizeHandleEl.style.left = (r.right  + window.scrollX - 7) + 'px';
                imgOverlayEl.style.top  = (r.top  + window.scrollY + 4) + 'px';
                imgOverlayEl.style.left = (r.left + window.scrollX + 4) + 'px';
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // Show/hide overlay + handle on hover
        document.addEventListener('mouseover', e => {
            if (!editMode) return;
            const img = e.target instanceof Element ? e.target.closest('img.cms-img-replace') : null;
            if (img) {
                imgOverlayTarget = img;
                const r = img.getBoundingClientRect();
                imgOverlayEl.style.top   = (r.top    + window.scrollY + 4) + 'px';
                imgOverlayEl.style.left  = (r.left   + window.scrollX + 4) + 'px';
                resizeHandleEl.style.top  = (r.bottom + window.scrollY - 7) + 'px';
                resizeHandleEl.style.left = (r.right  + window.scrollX - 7) + 'px';
                imgOverlayEl.classList.add('cmsov-on');
                resizeHandleEl.classList.add('cmsov-on');
            } else if (!e.target.closest?.('#cms-img-overlay') && !e.target.closest?.('#cms-resize-handle')) {
                imgOverlayEl.classList.remove('cmsov-on');
                resizeHandleEl.classList.remove('cmsov-on');
            }
        });
    }

    /* ── Rotate content image (non-gallery) ─────── */
    async function cmsRotateContentImg(img) {
        setStatus('Rotating…');
        try {
            const repoPath = resolveRepoPath(REPO_PATH, img.getAttribute('src').split('?')[0]);
            const loaded = await new Promise((res, rej) => {
                const i = new Image();
                i.crossOrigin = 'anonymous';
                i.onload = () => res(i);
                i.onerror = () => rej(new Error('Cannot load image for rotation'));
                i.src = img.src.split('?')[0] + '?t=' + Date.now();
            });
            const c = document.createElement('canvas');
            c.width  = loaded.naturalHeight;
            c.height = loaded.naturalWidth;
            const ctx = c.getContext('2d');
            ctx.translate(c.width / 2, c.height / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(loaded, -loaded.naturalWidth / 2, -loaded.naturalHeight / 2);
            const b64 = c.toDataURL('image/jpeg', 0.92).split(',')[1];
            const f = await getFile(repoPath);
            await putFileBin(repoPath, b64, f.sha, 'admin: rotate ' + repoPath.split('/').pop());
            img.src = img.src.split('?')[0] + '?t=' + Date.now();
            setStatus('Rotated!');
        } catch (err) {
            setStatus('Error: ' + err.message);
        }
    }

    /* ── Section drag-and-drop reordering ───────── */
    function initSectionReorder() {
        const sels = ['.paper-row', '.course-card', '.content-card'];
        if (IS_PUBS) sels.push('.pub-item');
        sels.forEach(sel =>
            document.querySelectorAll(sel).forEach(el => {
                makeSecDraggable(el);
                secDraggables.push(el);
            })
        );
    }

    function cleanupSectionReorder() {
        secAbortCtrls.forEach(ac => ac.abort());
        secAbortCtrls.length = 0;
        secDraggables.forEach(el => {
            el.classList.remove('cms-sec-draggable', 'sec-drag-over');
            el.querySelector('.cms-sec-handle')?.remove();
        });
        secDraggables = [];
        secDragSrc = null;
    }

    function makeSecDraggable(el) {
        const ac = new AbortController();
        const { signal } = ac;
        secAbortCtrls.push(ac);
        el.classList.add('cms-sec-draggable');

        const handle = document.createElement('div');
        handle.className = 'cms-sec-handle';
        handle.textContent = '⠿';
        handle.title = 'Drag to reorder';
        handle.contentEditable = 'false';
        handle.setAttribute('draggable', 'true');
        el.appendChild(handle);

        handle.addEventListener('dragstart', e => {
            secDragSrc = el;
            e.dataTransfer.effectAllowed = 'move';
            e.stopPropagation();
            setTimeout(() => { el.style.opacity = '0.45'; }, 0);
        }, { signal });

        handle.addEventListener('dragend', () => {
            el.style.opacity = '';
            document.querySelectorAll('.sec-drag-over').forEach(x => x.classList.remove('sec-drag-over'));
            secDragSrc = null;
        }, { signal });

        el.addEventListener('dragover', e => {
            if (!secDragSrc || secDragSrc === el) return;
            e.preventDefault();
            e.stopPropagation();
            el.classList.add('sec-drag-over');
        }, { signal });

        el.addEventListener('dragleave', e => {
            if (!el.contains(e.relatedTarget)) el.classList.remove('sec-drag-over');
        }, { signal });

        el.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            el.classList.remove('sec-drag-over');
            // Only allow reorder within the same parent container
            if (secDragSrc && secDragSrc !== el && secDragSrc.parentNode === el.parentNode) {
                el.parentNode.insertBefore(secDragSrc, el);
            }
        }, { signal });
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
        showOp('Saving colors…', 'busy');
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
            showOp('Colors saved!', 'done');
        } catch (err) {
            showOp(err.message, 'error');
        }
    };

    /* ── Save page (non-gallery) ────────────────── */
    window.cmsSave = async function () {
        const btn = document.getElementById('cms-save-btn');
        if (btn) btn.disabled = true;
        showOp('Saving page…', 'busy');
        try {
            const clone = document.documentElement.cloneNode(true);
            clone.querySelector('#cms-bar')?.remove();
            clone.querySelector('#cms-styles')?.remove();
            clone.querySelector('#cms-img-overlay')?.remove();
            clone.querySelector('#cms-resize-handle')?.remove();
            clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
            clone.querySelectorAll('.cms-pub-del, #cms-add-pub-btn').forEach(el => el.remove());
            clone.querySelectorAll('.pub-item').forEach(e => e.style.position = '');
            clone.querySelectorAll('img.cms-img-replace').forEach(img => img.classList.remove('cms-img-replace'));
            clone.querySelectorAll('.cms-sec-handle').forEach(el => el.remove());
            clone.querySelectorAll('.cms-sec-draggable').forEach(el => {
                el.classList.remove('cms-sec-draggable', 'sec-drag-over');
                el.style.opacity = '';
            });
            const bodyEl = clone.querySelector('body');
            if (bodyEl) bodyEl.classList.remove('cms-admin', 'cms-edit');

            // Strip browser-extension-injected content
            // 1. Remove extension <style> tags (identified by data attributes or known content)
            clone.querySelectorAll('style[data-id], style[data-emotion], style[data-s]').forEach(el => el.remove());
            clone.querySelectorAll('style').forEach(s => {
                const t = s.textContent;
                if (t.includes('immersive-translate') || t.includes('#clip_copy') || t.includes('#web-copy-btn-wk')) s.remove();
            });
            // 2. Remove extension DOM elements (custom elements + known IDs)
            ['qb-highlighter', 'qb-toolbar', 'qb-div', 'deepl-input-controller',
             'grammarly-desktop-integration', '#torrent-scanner-popup', '#__endic_crx__',
             '#immersive-translate-popup', '[data-wxt-integrated]',
             '#cms-op-toast', '#cms-upload-toast', '#page-lightbox'].forEach(sel => {
                try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch (_) {}
            });
            // 3. Remove extension attributes from <html> and <body>
            ['data-qb-installed', 'data-new-gr-c-s-check-loaded', 'data-gr-ext-installed',
             'data-new-gr-c-s-loaded'].forEach(attr => {
                clone.removeAttribute(attr);
                if (bodyEl) bodyEl.removeAttribute(attr);
            });

            const newHtml = '<!DOCTYPE html>\n' + clone.outerHTML;
            const file = await getFile(REPO_PATH);
            await putFile(REPO_PATH, newHtml, file.sha, 'admin: update ' + REPO_PATH);

            showOp('Saved!', 'done');
            setStatus('');
            editMode = false;
            document.designMode = 'off';
            document.body.classList.remove('cms-edit');
            document.getElementById('cms-edit-btn')?.classList.remove('cms-active');
            if (btn) btn.style.display = 'none';
            document.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
            document.querySelectorAll('.cms-pub-del, #cms-add-pub-btn').forEach(el => el.remove());
            document.querySelectorAll('img.cms-img-replace').forEach(img => img.classList.remove('cms-img-replace'));
            if (imgOverlayEl)  imgOverlayEl.classList.remove('cmsov-on');
            if (resizeHandleEl) resizeHandleEl.classList.remove('cmsov-on');
            cleanupSectionReorder();
        } catch (e) {
            showOp(e.message, 'error');
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
        showOp('Saving order…', 'busy');
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
            showOp('Order saved!', 'done');
        } catch (e) {
            showOp(e.message, 'error');
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
        showOp('Renaming…', 'busy');
        try {
            const oldPath = info.dir + '/' + oldName;
            const newPath = info.dir + '/' + newName;

            // Try to rename the original file; silently skip if it doesn't exist in GitHub
            try {
                const oldFile = await getFile(oldPath);
                const content = oldFile.content.replace(/\n/g, '');
                // Check if new path already exists (to get its SHA for overwrite)
                let newSha = null;
                try { const nf = await getFile(newPath); newSha = nf.sha; } catch (_) {}
                await putFileBin(newPath, content, newSha, 'admin: rename ' + oldName + ' to ' + newName);
                // Re-fetch SHA before delete to avoid 409 conflict
                const oldFileRefresh = await getFile(oldPath);
                await deleteFile(oldPath, oldFileRefresh.sha, 'admin: rename (del) ' + oldName);
            } catch (e) {
                // 404 = original not in repo (only thumbnail exists), skip silently
                if (!e.message.includes('HTTP 404')) throw e;
            }

            // Rename thumbnail for Mushrooms
            if (info.key === 'mushroom') {
                const oldThumbName = oldName.replace(/\.\w+$/, '.jpg');
                const newThumbName = newBase.trim() + '.jpg';
                const oldThumbPath = 'images/Mushrooms/thumbs/' + oldThumbName;
                try {
                    const tf = await getFile(oldThumbPath);
                    // Check if new thumb path already exists
                    let newThumbSha = null;
                    try { const ntf = await getFile('images/Mushrooms/thumbs/' + newThumbName); newThumbSha = ntf.sha; } catch (_) {}
                    await putFileBin('images/Mushrooms/thumbs/' + newThumbName, tf.content.replace(/\n/g, ''), newThumbSha, 'admin: rename thumb');
                    // Re-fetch SHA before delete to avoid 409 conflict
                    const tfRefresh = await getFile(oldThumbPath);
                    await deleteFile(oldThumbPath, tfRefresh.sha, 'admin: rename thumb (del)');
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
                const oldEncoded = encodeURIComponent(oldName);
                const newEncoded = encodeURIComponent(newName);
                const src = img.getAttribute('src');
                img.src = (src.includes(oldEncoded)
                    ? src.replace(oldEncoded, newEncoded)
                    : src.replace(oldName, newName)
                ).split('?')[0] + '?t=' + Date.now();
            }

            showOp('Renamed to ' + newName, 'done');
        } catch (err) {
            showOp(err.message, 'error');
        }
    }

    async function cmsRotatePhoto(item, btn, filename, info) {
        btn.disabled = true;
        showOp('Rotating…', 'busy');
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

            showOp('Rotated!', 'done');
        } catch (e) {
            showOp(e.message, 'error');
        } finally {
            btn.disabled = false;
        }
    }

    async function cmsDeletePhoto(item, filename, info) {
        if (!filename || !info) return;
        if (!confirm('Delete "' + filename + '" from gallery?\nThis cannot be undone.')) return;
        showOp('Deleting…', 'busy');
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
            showOp('Deleted', 'done');
        } catch (e) {
            showOp(e.message, 'error');
        }
    }

    function showUploadToast(current, total, filename, state) {
        let el = document.getElementById('cms-upload-toast');
        if (state === 'remove') { el?.remove(); return; }
        if (!el) {
            el = document.createElement('div');
            el.id = 'cms-upload-toast';
            document.body.appendChild(el);
        }
        el.className = '';
        if (state === 'done') {
            el.classList.add('done');
            el.innerHTML = '<div class="upt-title">&#10003; ' + total + ' photo' + (total !== 1 ? 's' : '') + ' uploaded</div>';
            setTimeout(() => el.remove(), 2500);
        } else {
            const pct = total > 1 ? Math.round(((current - 1) / total) * 100) : 10;
            el.innerHTML =
                '<div class="upt-title">Uploading ' + current + ' / ' + total + '</div>' +
                '<div class="upt-file">' + filename + '</div>' +
                '<div class="upt-bar-bg"><div class="upt-bar-fill" style="width:' + pct + '%"></div></div>';
        }
    }

    // Process image for upload: resize to max 1920px, add watermark, generate thumbnail
    function processForUpload(file) {
        const MAX_PX   = 1920;
        const THUMB_PX = 400;
        const WATERMARK = '\u00a9 Shinnam Yoo';
        return new Promise((res, rej) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const { naturalWidth: w, naturalHeight: h } = img;
                const scale = Math.min(1, MAX_PX / Math.max(w, h));
                const c = document.createElement('canvas');
                c.width  = Math.round(w * scale);
                c.height = Math.round(h * scale);
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, c.width, c.height);

                // Thumbnail (clean, before watermark)
                const ts = Math.min(1, THUMB_PX / Math.max(c.width, c.height));
                const tc = document.createElement('canvas');
                tc.width  = Math.round(c.width  * ts);
                tc.height = Math.round(c.height * ts);
                tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
                const thumbB64 = tc.toDataURL('image/jpeg', 0.82).split(',')[1];

                // Watermark on main image
                const sz  = Math.max(13, Math.round(c.width / 38));
                const pad = Math.round(sz * 0.65);
                ctx.font         = 'italic ' + sz + 'px Georgia, serif';
                ctx.textAlign    = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillStyle = 'rgba(0,0,0,0.38)';
                ctx.fillText(WATERMARK, c.width - pad + 1, c.height - pad + 1);
                ctx.fillStyle = 'rgba(255,255,255,0.62)';
                ctx.fillText(WATERMARK, c.width - pad, c.height - pad);

                res({ mainB64: c.toDataURL('image/jpeg', 0.88).split(',')[1], thumbB64 });
            };
            img.onerror = rej;
            img.src = url;
        });
    }

    function sanitizeFilename(name) {
        // Replace characters GitHub's git backend rejects in path components
        let safe = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
        // Truncate to 80 chars (keeping extension) to avoid GitHub path length limits
        const dotIdx = safe.lastIndexOf('.');
        const ext  = dotIdx >= 0 ? safe.slice(dotIdx) : '';
        const base = dotIdx >= 0 ? safe.slice(0, dotIdx) : safe;
        if (base.length > 80) safe = base.slice(0, 80) + ext;
        return safe || ('photo_' + Date.now() + '.jpg');
    }

    async function uploadSinglePhoto(file, info, grid) {
        const { mainB64, thumbB64 } = await processForUpload(file);
        const filename = sanitizeFilename(file.name);
        const filePath = info.dir + '/' + filename;
        let sha = '';
        try { const ex = await getFile(filePath); sha = ex.sha; } catch (_) {}
        await putFileBin(filePath, mainB64, sha, 'admin: add ' + filename);

        // Upload thumbnail for Mushrooms section
        if (info.key === 'mushroom') {
            const thumbName = filename.replace(/\.\w+$/, '.jpg');
            const thumbPath = 'images/Mushrooms/thumbs/' + thumbName;
            let thumbSha = '';
            try { const tf = await getFile(thumbPath); thumbSha = tf.sha; } catch (_) {}
            await putFileBin(thumbPath, thumbB64, thumbSha, 'admin: add thumb ' + thumbName);
        }

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
    }

    async function cmsUploadPhoto(info, grid) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.addEventListener('change', async () => {
            const files = [...input.files];
            if (!files.length) return;
            let done = 0, failed = 0;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                showUploadToast(i + 1, files.length, file.name, 'uploading');
                setStatus('Uploading ' + (i + 1) + ' / ' + files.length + '…');
                try {
                    await uploadSinglePhoto(file, info, grid);
                    done++;
                } catch (e) {
                    failed++;
                    showOp(file.name + ': ' + e.message, 'error');
                    console.error('Upload failed:', file.name, e);
                }
            }
            if (done > 0) {
                showUploadToast(null, done, '', 'done');
            } else {
                showUploadToast('remove', 0, '', 'remove');
            }
            setStatus(done + ' uploaded' + (failed ? ', ' + failed + ' failed' : ''));
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
        else initImgOverlay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
