// ==========================================
// API KEY MANAGER & LIVE HEALTH MONITOR
// ==========================================
'use strict';

(function() {
    const PROVIDERS = {
        gemini:     { label: 'Google Gemini',   abbr: 'GM', color: '#4285f4', bg: 'rgba(66,133,244,0.12)', border: 'rgba(66,133,244,0.3)',  defaultModel: 'gemini-2.0-flash', pool: true },
        groq:       { label: 'Groq',            abbr: 'GQ', color: '#f55036', bg: 'rgba(245,80,54,0.12)',  border: 'rgba(245,80,54,0.3)',   defaultModel: 'llama-3.3-70b-versatile', pool: true },
        deepseek:   { label: 'DeepSeek',        abbr: 'DS', color: '#2563eb', bg: 'rgba(37,99,235,0.12)',  border: 'rgba(37,99,235,0.3)',   defaultModel: 'deepseek-chat', pool: false },
        qwen:       { label: 'Qwen / Alibaba',  abbr: 'QW', color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)',  defaultModel: 'qwen-plus', pool: false },
        openrouter: { label: 'OpenRouter',      abbr: 'OR', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.3)',  defaultModel: 'meta-llama/llama-3.3-70b-instruct', pool: false },
        local:      { label: 'LM Studio',       abbr: 'LM', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)',  defaultModel: 'local-model', pool: false },
    };

    let _allKeys = [];
    let _activeFilter = 'all';
    let _activeProvider = 'gemini';
    let _liveStatuses = {};
    let _isTestingLive = false;

    function timeAgo(iso) {
        if (!iso) return 'Baru ditambahkan';
        try {
            const diff = Date.now() - new Date(iso).getTime();
            const s = Math.floor(diff / 1000);
            if (s < 60) return 'Baru saja';
            const m = Math.floor(s / 60);
            if (m < 60) return m + 'm lalu';
            const h = Math.floor(m / 60);
            if (h < 24) return h + 'j lalu';
            const d = Math.floor(h / 24);
            return d + 'h lalu';
        } catch(e) {
            return 'Baru ditambahkan';
        }
    }

    function escHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    window.loadApiKeys = async function() {
        const list = document.getElementById('akm-key-list');
        if (!list) return;

        list.innerHTML = `
            <div class="col-span-full text-center py-8 text-slate-500 text-xs flex items-center justify-center gap-2">
                <div class="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                <span>Memuat daftar API Key...</span>
            </div>
        `;

        try {
            const r = await fetch('/api/keys');
            if (!r.ok) throw new Error('Gagal mengambil data API Key');
            const data = await r.json();
            _allKeys = data.keys || [];
            _activeProvider = data.activeProvider || 'gemini';
            
            renderStats();
            renderFilterTabs();
            renderKeyList();

            // Run initial health check in background
            window.runLiveHealthCheck(true);
        } catch(e) {
            console.error('[AKM] Error loadApiKeys:', e);
            list.innerHTML = `
                <div class="akm-empty">
                    <i data-lucide="wifi-off" class="w-8 h-8 text-rose-400"></i>
                    <p class="font-bold text-xs text-white">Gagal Memuat API Key</p>
                    <p class="text-[11px] text-slate-400">${e.message}</p>
                    <button onclick="loadApiKeys()" class="mt-2 px-3 py-1.5 rounded-xl bg-white/10 text-xs font-semibold">Coba Lagi</button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    };

    window.runLiveHealthCheck = async function(silent = false) {
        if (_isTestingLive) return;
        _isTestingLive = true;
        
        const btn = document.getElementById('akm-btn-check-live');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<div class="w-3.5 h-3.5 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin"></div> <span>Menguji...</span>`;
        }

        try {
            const r = await fetch('/api/api-status');
            if (r.ok) {
                const data = await r.json();
                if (data.results && Array.isArray(data.results)) {
                    data.results.forEach(res => {
                        const keyId = `${res.provider}_${res.index}`;
                        _liveStatuses[keyId] = res;
                    });
                }
                renderStats();
                renderKeyList();

                if (!silent && window.showToast) {
                    const okCount = Object.values(_liveStatuses).filter(v => v.status === 'ok').length;
                    const errCount = Object.values(_liveStatuses).filter(v => v.status !== 'ok').length;
                    window.showToast('success', `Diagnosa Selesai: ${okCount} Aktif / Online, ${errCount} Error`);
                }
            }
        } catch(e) {
            console.error('[AKM Live Check] Error:', e);
            if (!silent && window.showToast) {
                window.showToast('error', 'Gagal memeriksa kesehatan API: ' + e.message);
            }
        } finally {
            _isTestingLive = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="zap" class="w-3.5 h-3.5"></i> <span>Scan Semua API</span>`;
                if (window.lucide) lucide.createIcons();
            }
        }
    };

    function renderStats() {
        const total = _allKeys.length;
        const setEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setEl('akm-stat-total', total);
        setEl('akm-stat-pool', _allKeys.filter(k => k.isPool).length);
        setEl('akm-stat-single', _allKeys.filter(k => !k.isPool).length);
        setEl('akm-stat-used', _allKeys.filter(k => k.usageCount > 0).length);
    }

    function renderFilterTabs() {
        const container = document.getElementById('akm-filter-tabs');
        if (!container) return;

        const uniqueProviders = ['all', ...new Set(_allKeys.map(k => k.provider))];
        container.innerHTML = uniqueProviders.map(p => {
            const info = PROVIDERS[p] || { label: 'Semua Provider', color: '#6366f1' };
            const label = p === 'all' ? 'Semua Provider' : info.label;
            const count = p === 'all' ? _allKeys.length : _allKeys.filter(k => k.provider === p).length;
            const active = _activeFilter === p ? 'active' : '';
            return `
                <button class="akm-filter-tab ${active}" onclick="window.setAkmFilter('${p}')">
                    <span>${label}</span>
                    <span class="akm-filter-count">${count}</span>
                </button>
            `;
        }).join('');
    }

    window.setAkmFilter = function(provider) {
        _activeFilter = provider;
        renderFilterTabs();
        renderKeyList();
    };

    function renderKeyList() {
        const list = document.getElementById('akm-key-list');
        if (!list) return;

        const filtered = _activeFilter === 'all' ? _allKeys : _allKeys.filter(k => k.provider === _activeFilter);

        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="akm-empty">
                    <i data-lucide="key-round" class="w-8 h-8 text-slate-600"></i>
                    <p class="font-bold text-xs text-white">Belum Ada API Key</p>
                    <p class="text-[11px] text-slate-400">Tambahkan API key untuk mengaktifkan kecerdasan AI.</p>
                    <button onclick="openAddKeyModal()" class="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm">
                        + Tambah Key Baru
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        list.innerHTML = filtered.map((key, idx) => renderKeyCard(key, idx)).join('');
        if (window.lucide) lucide.createIcons();
    }

    function renderKeyCard(key, idx) {
        const p = PROVIDERS[key.provider] || {
            label: key.provider,
            abbr: key.provider.slice(0, 2).toUpperCase(),
            color: '#888',
            bg: 'rgba(128,128,128,0.1)',
            border: 'rgba(128,128,128,0.2)'
        };
        const keyId = `${key.provider}_${key.index}`;
        const live = _liveStatuses[keyId];

        let healthBadge = '';
        if (live) {
            if (live.status === 'ok') {
                healthBadge = `<span class="akm-health-badge ok"><span class="akm-dot ok"></span>ONLINE ${live.latency || 0}ms</span>`;
            } else if (live.status === 'quota') {
                healthBadge = `<span class="akm-health-badge quota"><span class="akm-dot quota"></span>LIMIT 429</span>`;
            } else {
                healthBadge = `<span class="akm-health-badge error"><span class="akm-dot error"></span>ERROR</span>`;
            }
        } else {
            healthBadge = `<span class="akm-health-badge untested"><span class="akm-dot untested"></span>Belum Dites</span>`;
        }

        const poolBadge = key.isPool
            ? `<span class="akm-pool-badge">Pool #${key.index + 1}</span>`
            : '<span class="akm-single-badge">Single</span>';

        const labelBadge = key.label
            ? `<span class="akm-label-badge">${escHtml(key.label)}</span>`
            : '';

        return `
            <div class="akm-key-card" id="akm-card-${key.provider}-${key.index}">
                <div class="akm-card-accent" style="background: ${p.color}"></div>
                
                <div class="akm-card-body">
                    <div class="akm-card-left">
                        <div class="akm-provider-avatar" style="background: ${p.bg}; color: ${p.color}; border-color: ${p.border}">
                            ${p.abbr}
                        </div>
                        <div class="akm-card-info">
                            <div class="akm-card-top-line">
                                <span class="akm-provider-label" style="color: ${p.color}">${p.label}</span>
                                <span class="akm-model-chip">${escHtml(key.model || p.defaultModel)}</span>
                                ${poolBadge}
                                ${healthBadge}
                                ${labelBadge}
                            </div>
                            
                            <div class="akm-key-code-row">
                                <code class="akm-key-code">${escHtml(key.keyMasked || key.key || '••••••••')}</code>
                                <button onclick="window.copyKeyToClipboard('${escHtml(key.key)}')" class="text-slate-400 hover:text-white text-xs p-1" title="Salin API Key">
                                    <i data-lucide="copy" class="w-3 h-3"></i>
                                </button>
                            </div>

                            <div class="akm-card-sub-line">
                                <span>Ditambahkan: ${timeAgo(key.addedAt)}</span>
                                <span class="akm-dot-sep">•</span>
                                <span>Terpakai: ${key.usageCount || 0}x</span>
                            </div>
                        </div>
                    </div>

                    <div class="akm-card-right">
                        <button class="akm-action-btn akm-btn-edit" onclick="window.openEditLabel('${key.provider}', ${key.index}, '${escHtml(key.label || '')}')" title="Edit Label">
                            <i data-lucide="pencil" class="w-3 h-3"></i>
                            <span class="hidden sm:inline">Edit</span>
                        </button>
                        <button class="akm-action-btn akm-btn-delete" onclick="window.openDeleteConfirm('${key.provider}', ${key.index}, '${escHtml(key.keyMasked || '')}', '${p.label}')" title="Hapus Key">
                            <i data-lucide="trash-2" class="w-3 h-3"></i>
                            <span class="hidden sm:inline">Hapus</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    window.copyKeyToClipboard = function(text) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            if (window.showToast) window.showToast('success', 'API Key berhasil disalin ke clipboard!');
        }).catch(err => {
            console.error('Copy failed:', err);
        });
    };

    window.openAddKeyModal = function() {
        const modal = document.getElementById('akm-modal-add');
        if (modal) modal.classList.remove('hidden');
        
        const keyInput = document.getElementById('akm-add-key');
        const labelInput = document.getElementById('akm-add-label');
        const modelInput = document.getElementById('akm-add-model');
        const urlInput = document.getElementById('akm-add-url');
        const testRes = document.getElementById('akm-test-result');

        if (keyInput) keyInput.value = '';
        if (labelInput) labelInput.value = '';
        if (modelInput) modelInput.value = '';
        if (urlInput) urlInput.value = '';
        if (testRes) testRes.innerHTML = '';

        const sel = document.getElementById('akm-add-provider');
        if (sel) {
            sel.value = 'gemini';
            window.updateAddModelPlaceholder();
        }
        if (window.lucide) lucide.createIcons();
    };

    window.closeAddKeyModal = function() {
        const modal = document.getElementById('akm-modal-add');
        if (modal) modal.classList.add('hidden');
    };

    window.updateAddModelPlaceholder = function() {
        const providerSel = document.getElementById('akm-add-provider');
        const provider = providerSel ? providerSel.value : 'gemini';
        const p = PROVIDERS[provider];
        const modelInput = document.getElementById('akm-add-model');
        if (p && modelInput) modelInput.placeholder = p.defaultModel;

        const urlRow = document.getElementById('akm-add-url-row');
        if (urlRow) urlRow.style.display = provider === 'local' ? 'block' : 'none';
    };

    window.testApiKeyBeforeAdd = async function() {
        const provider = document.getElementById('akm-add-provider').value;
        const key = document.getElementById('akm-add-key').value.trim();
        const model = document.getElementById('akm-add-model').value.trim() || PROVIDERS[provider]?.defaultModel || '';
        const url = document.getElementById('akm-add-url').value.trim();
        const resEl = document.getElementById('akm-test-result');

        if (!key) {
            if (resEl) resEl.innerHTML = '<span class="text-rose-400 font-semibold">Masukkan API Key terlebih dahulu!</span>';
            return;
        }

        if (resEl) {
            resEl.innerHTML = '<span class="text-sky-400 flex items-center gap-1.5"><div class="w-3 h-3 border-2 border-sky-400/20 border-t-sky-400 rounded-full animate-spin"></div> Menguji koneksi API...</span>';
        }

        try {
            const r = await fetch('/api/test-api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, key, model, url })
            });
            const d = await r.json();
            if (d.success) {
                resEl.innerHTML = `<span class="text-emerald-400 font-semibold flex items-center gap-1"><i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Berhasil! Model: ${escHtml(d.model || model)} (${d.latency}ms)</span>`;
            } else if (d.isQuota) {
                resEl.innerHTML = '<span class="text-amber-400 font-semibold">Batas kuota terlampaui (HTTP 429 Quota Exceeded).</span>';
            } else {
                resEl.innerHTML = `<span class="text-rose-400 font-semibold">Gagal: ${escHtml(d.error || 'Koneksi ditolak')}</span>`;
            }
            if (window.lucide) lucide.createIcons();
        } catch(err) {
            if (resEl) resEl.innerHTML = `<span class="text-rose-400">Error: ${err.message}</span>`;
        }
    };

    window.saveNewApiKey = async function() {
        const provider = document.getElementById('akm-add-provider').value;
        const key = document.getElementById('akm-add-key').value.trim();
        const model = document.getElementById('akm-add-model').value.trim();
        const url = document.getElementById('akm-add-url').value.trim();
        const label = document.getElementById('akm-add-label').value.trim();

        if (!key) {
            alert('Masukkan API Key terlebih dahulu!');
            return;
        }

        const saveBtn = document.getElementById('akm-save-btn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Menyimpan...';
        }

        try {
            const r = await fetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, key, model, url, label })
            });

            if (r.ok) {
                window.closeAddKeyModal();
                if (window.showToast) window.showToast('success', 'API Key berhasil ditambahkan!');
                await window.loadApiKeys();
            } else {
                throw new Error(await r.text());
            }
        } catch(err) {
            alert('Gagal menyimpan API Key: ' + err.message);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Simpan Key';
            }
        }
    };

    window.openEditLabel = async function(provider, index, currentLabel) {
        const newLabel = prompt(`Edit label untuk key ${provider.toUpperCase()} (#${index + 1}):`, currentLabel || '');
        if (newLabel === null) return;

        try {
            const r = await fetch('/api/keys/label', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, index, label: newLabel.trim() })
            });
            if (r.ok) {
                if (window.showToast) window.showToast('success', 'Label berhasil diperbarui!');
                await window.loadApiKeys();
            } else {
                throw new Error(await r.text());
            }
        } catch(err) {
            alert('Gagal mengedit label: ' + err.message);
        }
    };

    window.openDeleteConfirm = async function(provider, index, masked, providerLabel) {
        if (!confirm(`Apakah Anda yakin ingin menghapus API Key ${providerLabel} (${masked})?`)) return;

        try {
            const r = await fetch('/api/keys', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, index })
            });
            if (r.ok) {
                if (window.showToast) window.showToast('success', 'API Key berhasil dihapus.');
                await window.loadApiKeys();
            } else {
                throw new Error(await r.text());
            }
        } catch(err) {
            alert('Gagal menghapus API Key: ' + err.message);
        }
    };

    // Auto load saat DOM selesai
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (window.loadApiKeys) window.loadApiKeys();
        }, 500);
    });

})();
