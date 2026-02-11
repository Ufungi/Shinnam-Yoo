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

    async function getFile(path) {
        const r = await gh('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURIComponent(path) + '?ref=' + BRANCH);
        if (!r.ok) throw new Error(path + ': HTTP ' + r.status);
        return r.json();
    }

    async function putFile(path, content, sha, msg) {
        const r = await gh('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURIComponent(path), {
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
        const r = await gh('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURIComponent(path), {
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
        const r = await gh('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURIComponent(path), {
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
        /* Admin bar */
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
        /* Edit mode: highlight editable elements */
        body.cms-edit [data-cmseditable] {
            outline: 2px dashed rgba(193,154,107,0.5); cursor: text; border-radius: 3px;
        }
        body.cms-edit [data-cmseditable]:focus {
            outline: 2px solid #c19a6b; outline-offset: 2px;
        }
        /* Gallery: trash button on each photo */
        .gallery-item { position: relative; }
        .cms-trash {
            position: absolute; top: 0.4rem; right: 0.4rem;
            width: 28px; height: 28px; border-radius: 50%;
            background: rgba(20,10,4,0.88);
            border: 1px solid rgba(201,107,107,0.55);
            color: #e8a0a0; font-size: 0.78rem;
            cursor: pointer; display: none;
            align-items: center; justify-content: center;
            z-index: 20; padding: 0; line-height: 1;
            transition: background 0.15s;
        }
        .cms-trash:hover { background: rgba(201,107,107,0.5); }
        body.cms-admin .gallery-item .cms-trash { display: flex; }
        /* Gallery: add photo button */
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

        const editControls = IS_GALLERY ? '' :
            '<button class="cms-btn" id="cms-edit-btn" onclick="cmsToggleEdit()">✏ Edit</button>' +
            '<button class="cms-btn" id="cms-save-btn" onclick="cmsSave()" style="display:none">↑ Save</button>';

        bar.innerHTML =
            '<span id="cms-bar-label">⚙ Admin</span>' +
            editControls +
            '<span id="cms-status"></span>' +
            '<a href="' + ADMIN_PREFIX + 'index.html" class="cms-btn">Panel</a>';

        document.body.appendChild(bar);
        document.body.classList.add('cms-admin');
    }

    /* ── Text editing (non-gallery pages) ──────── */
    let editMode = false;

    // Selectors for editable text blocks on each page
    const EDIT_SELECTORS = [
        '.bio-text',
        '.hero-tagline',
        '.course-description',
        '.course-title',
        '.course-details li',
        '.research-block p',
        '.research-block h3',
        '.section-intro',
        'h1.page-title',
    ].join(',');

    window.cmsToggleEdit = function () {
        editMode = !editMode;
        document.body.classList.toggle('cms-edit', editMode);
        const editBtn = document.getElementById('cms-edit-btn');
        const saveBtn = document.getElementById('cms-save-btn');
        if (editBtn) editBtn.classList.toggle('cms-active', editMode);
        if (saveBtn) saveBtn.style.display = editMode ? '' : 'none';

        document.querySelectorAll(EDIT_SELECTORS).forEach(el => {
            if (editMode) {
                el.setAttribute('data-cmseditable', '1');
                el.contentEditable = 'true';
            } else {
                el.removeAttribute('data-cmseditable');
                el.contentEditable = 'false';
            }
        });
        setStatus(editMode ? 'Click text to edit' : '');
    };

    /* ── Save page (non-gallery) ────────────────── */
    window.cmsSave = async function () {
        const btn = document.getElementById('cms-save-btn');
        if (btn) btn.disabled = true;
        setStatus('Saving…');
        try {
            // Clone DOM, strip admin artifacts
            const clone = document.documentElement.cloneNode(true);
            clone.querySelector('#cms-bar')?.remove();
            clone.querySelector('#cms-styles')?.remove();
            clone.querySelectorAll('[data-cmseditable]').forEach(el => {
                el.removeAttribute('data-cmseditable');
                el.removeAttribute('contenteditable');
            });
            clone.classList.remove('cms-admin', 'cms-edit');

            const newHtml = '<!DOCTYPE html>\n' + clone.outerHTML;
            const file = await getFile(REPO_PATH);
            await putFile(REPO_PATH, newHtml, file.sha, 'admin: update ' + REPO_PATH);

            setStatus('Saved!');
            editMode = false;
            document.body.classList.remove('cms-edit');
            document.getElementById('cms-edit-btn')?.classList.remove('cms-active');
            if (btn) btn.style.display = 'none';
            document.querySelectorAll('[data-cmseditable]').forEach(el => {
                el.removeAttribute('data-cmseditable');
                el.contentEditable = 'false';
            });
        } catch (e) {
            setStatus(e.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    };

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

    function initGallery() {
        // Add trash button to each existing gallery item
        document.querySelectorAll('.gallery-item').forEach(item => {
            const grid = item.closest('.masonry-grid');
            const info = SECTION_MAP[grid?.id];
            if (!info) return;
            const img = item.querySelector('img');
            if (!img) return;
            // Extract filename from src (works for both thumb and direct paths)
            const filename = decodeURIComponent(img.getAttribute('src').split('/').pop().split('?')[0]);
            addTrashBtn(item, filename, info);
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

    function addTrashBtn(item, filename, info) {
        const btn = document.createElement('button');
        btn.className = 'cms-trash';
        btn.title = 'Delete ' + filename;
        btn.innerHTML = '&#128465;';
        btn.addEventListener('click', e => {
            e.stopPropagation();
            cmsDeletePhoto(item, filename, info);
        });
        item.appendChild(btn);
    }

    async function cmsDeletePhoto(item, filename, info) {
        if (!confirm('Delete "' + filename + '" from gallery?\nThis cannot be undone.')) return;
        setStatus('Deleting…');
        try {
            const filePath = info.dir + '/' + filename;
            const f = await getFile(filePath);
            await deleteFile(filePath, f.sha, 'admin: delete ' + filename);

            // Also delete thumbnail if mushroom section
            if (info.key === 'mushroom') {
                try {
                    const thumbName = filename.replace(/\.\w+$/, '.jpg');
                    const tp = 'images/Mushrooms/thumbs/' + thumbName;
                    const tf = await getFile(tp);
                    await deleteFile(tp, tf.sha, 'admin: delete thumb ' + thumbName);
                } catch (_) { /* thumb may not exist */ }
            }

            await updateGalleryArr(info.arr, filename, 'remove');
            item.remove();

            // Update count
            const countIds = { mushroomImages: 'mushroomCount', animalImages: 'animalCount', samplingImages: 'samplingCount' };
            const grid = document.querySelector('[id$="Grid"]');
            if (grid) {
                const countEl = document.getElementById(countIds[info.arr]);
                if (countEl) {
                    const n = document.getElementById(info.arr.replace('Images', 'Grid'))?.querySelectorAll('.gallery-item').length;
                    if (n !== undefined) countEl.textContent = n + ' photos';
                }
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

                // Get existing SHA if file already exists
                let sha = '';
                try { const ex = await getFile(filePath); sha = ex.sha; } catch (_) {}

                await putFileBin(filePath, b64content, sha, 'admin: add ' + filename);
                await updateGalleryArr(info.arr, filename, 'add');

                // Add item to DOM
                const item = document.createElement('div');
                item.className = 'gallery-item';
                const img = document.createElement('img');
                img.src = (info.thumb || info.src) + encodeURIComponent(filename);
                img.loading = 'lazy';
                item.appendChild(img);
                addTrashBtn(item, filename, info);
                grid.appendChild(item);

                // Update count
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
                // Remove ", 'filename'" or "'filename'," or just "'filename'"
                content = content
                    .replace(new RegExp(",\\s*'" + esc + "'", 'g'), '')
                    .replace(new RegExp("'" + esc + "',\\s*", 'g'), '')
                    .replace(new RegExp("'" + esc + "'", 'g'), '');
            } else {
                // Append at end of array
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
