// ==========================================
// API KEY MANAGER & ENGINE DIAGNOSTICS MODULE
// ==========================================
'use strict';

(function() {
    const PROVIDERS = {
        gemini:     { label: 'Google Gemini',   abbr: 'GM', color: '#4285f4', bg: 'rgba(66,133,244,0.12)', border: 'rgba(66,133,244,0.3)',  defaultModel: 'gemini-2.0-flash', pool: true },
        groq:       { label: 'Groq Cloud',      abbr: 'GQ', color: '#f55036', bg: 'rgba(245,80,54,0.12)',  border: 'rgba(245,80,54,0.3)',   defaultModel: 'llama-3.3-70b-versatile', pool: true },
        deepseek:   { label: 'DeepSeek AI',     abbr: 'DS', color: '#2563eb', bg: 'rgba(37,99,235,0.12)',  border: 'rgba(37,99,235,0.3)',   defaultModel: 'deepseek-chat', pool: false },
        qwen:       { label: 'Alibaba Qwen',    abbr: 'QW', color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)',  defaultModel: 'qwen-plus', pool: false },
        openrouter: { label: 'OpenRouter',      abbr: 'OR', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)', border: 'rgba(124,58,237,0.3)',  defaultModel: 'meta-llama/llama-3.3-70b-instruct', pool: false },
        local:      { label: 'LM Studio Local', abbr: 'LM', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)',  defaultModel: 'local-model', pool: false },
    };

    let _allKeys = [];
    let _activeFilter = 'all';
    let _activeProvider = 'gemini';
    let _liveStatuses = {};
    let _isTestingLive = false;

    
    function getProviderLogoSvg(provider, className = 'w-5 h-5 shrink-0') {
        switch(provider) {
            case 'gemini':
                return `<svg class="${className}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" fill="url(#gemini-grad-svg)"/>
                    <defs>
                        <linearGradient id="gemini-grad-svg" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                            <stop offset="0%" stop-color="#1BA0F2"/>
                            <stop offset="40%" stop-color="#4285F4"/>
                            <stop offset="80%" stop-color="#9B72CB"/>
                            <stop offset="100%" stop-color="#D96570"/>
                        </linearGradient>
                    </defs>
                </svg>`;
            case 'groq':
                return `<svg class="${className}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="6" fill="#F55036"/>
                    <path d="M16 12C16 14.2 14.2 16 12 16C9.8 16 8 14.2 8 12C8 9.8 9.8 8 12 8C13.6 8 14.9 8.9 15.6 10.2H12.5V12H16Z" fill="white"/>
                    <circle cx="16" cy="8" r="1.5" fill="#FFE2DC"/>
                </svg>`;
            case 'deepseek':
                return `<svg class="${className}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="6" fill="#1E40AF"/>
                    <path d="M6 14C8 10.5 11.5 9.5 15.5 10C17 7.5 19 6.5 20 6C19 8.5 18 10.5 17.5 12C19.5 14.5 17.5 17.5 14 17.5C10 17.5 7.5 15.5 6 14Z" fill="#60A5FA"/>
                    <path d="M10.5 13C12.5 11.5 14.5 12 15.5 13" stroke="white" stroke-width="1.6" stroke-linecap="round"/>
                    <circle cx="8.5" cy="12.5" r="1" fill="#1E3A8A"/>
                </svg>`;
            case 'qwen':
                return `<svg class="${className}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L20.5 7V17L12 22L3.5 17V7L12 2Z" fill="#EA580C"/>
                    <path d="M12 5.5L17.5 8.8V15.2L12 18.5L6.5 15.2V8.8L12 5.5Z" fill="#7C2D12"/>
                    <path d="M12 8L15 10V14L12 16L9 14V10L12 8Z" fill="#FDBA74"/>
                </svg>`;
            case 'openrouter':
                return `<svg class="${className}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="6" fill="#6366F1"/>
                    <path d="M6 9L12 5.5L18 9V15L12 18.5L6 15V9Z" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>
                    <path d="M12 5.5V18.5M6 9L18 15M18 9L6 15" stroke="white" stroke-width="1.2" opacity="0.6"/>
                </svg>`;
            case 'local':
                return `<svg class="${className}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="6" fill="#0D9488"/>
                    <path d="M7 8V16H17" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M7 12H13" stroke="#99F6E4" stroke-width="2.2" stroke-linecap="round"/>
                    <circle cx="16" cy="16" r="2.5" fill="#5EEAD4"/>
                </svg>`;
            default:
                return `<svg class="${className}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="6" fill="#475569"/>
                    <path d="M12 6V18M6 12H18" stroke="white" stroke-width="2" stroke-linecap="round"/>
                </svg>`;
        }
    }

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

    // ─── 1. LOAD API KEYS ──────────────────────────────────
    window.loadApiKeys = async function() {
        const list = document.getElementById('akm-key-list');
        if (!list) return;

        list.innerHTML = `
            <div class="col-span-full text-center py-10 text-[var(--text-muted)] text-xs flex items-center justify-center gap-2">
                <div class="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                <span>Memuat data API Key...</span>
            </div>
        `;

        try {
            const r = await fetch('/api/keys');
            if (!r.ok) throw new Error('Gagal mengambil data API Key');
            const data = await r.json();
            _allKeys = data.keys || [];
            _activeProvider = data.activeProvider || 'gemini';
            
            renderActiveEngineSelector();
            renderStats();
            renderFilterTabs();
            renderKeyList();

            // Jalankan diagnosa otomatis di latar belakang
            window.runLiveHealthCheck(true);
        } catch(e) {
            console.error('[AKM] Error loadApiKeys:', e);
            list.innerHTML = `
                <div class="col-span-full enterprise-card text-center py-8 space-y-2">
                    <i data-lucide="wifi-off" class="w-8 h-8 mx-auto text-rose-400"></i>
                    <p class="font-bold text-xs text-[var(--text-primary)]">Gagal Memuat API Key</p>
                    <p class="text-[11px] text-[var(--text-muted)]">${e.message}</p>
                    <button onclick="loadApiKeys()" class="enterprise-btn enterprise-btn-secondary text-xs mt-2">Coba Lagi</button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    };

    // ─── 2. ACTIVE ENGINE SELECTOR ─────────────────────────
    function renderActiveEngineSelector() {
        const container = document.getElementById('akm-engine-selector-container');
        if (!container) return;

        const engineKeys = Object.keys(PROVIDERS);
        container.innerHTML = engineKeys.map(key => {
            const p = PROVIDERS[key];
            const isActive = _activeProvider === key;
            const count = _allKeys.filter(k => k.provider === key).length;
            const activeBorder = isActive ? `border-color:${p.color}; background:${p.bg};` : '';

            return `
                <div onclick="window.setActiveProviderEngine('${key}')" class="enterprise-card p-3 cursor-pointer transition-all hover:scale-[1.01] flex items-center justify-between gap-3 ${isActive ? 'ring-2' : ''}" style="${activeBorder} ${isActive ? `--tw-ring-color:${p.color};` : ''}">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-inner overflow-hidden p-1.5" style="background:${p.bg}; border:1px solid ${p.border};">
                            ${getProviderLogoSvg(key, 'w-5 h-5')}
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-1.5">
                                <h4 class="text-xs font-bold truncate text-[var(--text-primary)]">${p.label}</h4>
                                ${isActive ? '<span class="badge-chip badge-emerald text-[9px] py-0 px-1.5">AKTIF</span>' : ''}
                            </div>
                            <p class="text-[10px] text-[var(--text-muted)] mt-0.5">${count} Key terdaftar</p>
                        </div>
                    </div>
                    <div class="shrink-0">
                        <span class="w-4 h-4 rounded-full border flex items-center justify-center ${isActive ? 'bg-indigo-600 border-indigo-600' : 'border-[var(--border-color)]'}">
                            ${isActive ? '<i data-lucide="check" class="w-2.5 h-2.5 text-[var(--text-primary)]"></i>' : ''}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    }

    window.setActiveProviderEngine = async function(provider) {
        if (_activeProvider === provider) return;
        if (window.showToast) window.showToast('info', `Mengganti Engine Utama ke ${PROVIDERS[provider]?.label || provider}...`);

        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider })
            });

            if (res.ok) {
                _activeProvider = provider;
                if (window.showToast) window.showToast('success', `Engine Utama berhasil diubah ke ${PROVIDERS[provider]?.label || provider}!`);
                renderActiveEngineSelector();
                renderStats();
                renderKeyList();
            } else {
                throw new Error(await res.text());
            }
        } catch(e) {
            if (window.showToast) window.showToast('error', 'Gagal mengganti engine: ' + e.message);
        }
    };

    // ─── 3. STATS & TABS ───────────────────────────────────
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

        const uniqueProviders = ['all', ...Object.keys(PROVIDERS)];
        container.innerHTML = uniqueProviders.map(p => {
            const info = PROVIDERS[p] || { label: 'Semua Provider', color: '#6366f1' };
            const label = p === 'all' ? 'Semua Provider' : info.label;
            const count = p === 'all' ? _allKeys.length : _allKeys.filter(k => k.provider === p).length;
            const active = _activeFilter === p ? 'active' : '';

            return `
                <button class="akm-filter-tab ${active}" onclick="window.setAkmFilter('${p}')">
                    ${p !== 'all' ? getProviderLogoSvg(p, 'w-3.5 h-3.5') : '<i data-lucide="layers" class="w-3.5 h-3.5"></i>'}
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

    // ─── 4. RENDER KEY CARDS ───────────────────────────────
    function renderKeyList() {
        const list = document.getElementById('akm-key-list');
        if (!list) return;

        const filtered = _activeFilter === 'all' ? _allKeys : _allKeys.filter(k => k.provider === _activeFilter);

        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="col-span-full enterprise-card text-center py-10 space-y-2">
                    <i data-lucide="key-round" class="w-8 h-8 mx-auto text-[var(--text-muted)]"></i>
                    <p class="font-bold text-xs text-[var(--text-primary)]">Belum Ada API Key</p>
                    <p class="text-[11px] text-[var(--text-muted)]">Tambahkan API key untuk mengaktifkan respons cerdas AI bot.</p>
                    <button onclick="openAddKeyModal()" class="enterprise-btn enterprise-btn-primary text-xs mt-2">
                        <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                        <span>Tambah Key Sekarang</span>
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
            border: 'rgba(128,128,128,0.2)',
            defaultModel: 'ai-model'
        };
        const keyId = `${key.provider}_${key.index}`;
        const live = _liveStatuses[keyId];

        let healthBadge = '';
        if (live) {
            if (live.status === 'ok') {
                healthBadge = `<span class="badge-chip badge-emerald text-[10px]"><i data-lucide="check" class="w-2.5 h-2.5"></i> ONLINE ${live.latency || 0}ms</span>`;
            } else if (live.status === 'quota') {
                healthBadge = `<span class="badge-chip badge-amber text-[10px]"><i data-lucide="alert-triangle" class="w-2.5 h-2.5"></i> LIMIT 429</span>`;
            } else {
                healthBadge = `<span class="badge-chip badge-rose text-[10px]"><i data-lucide="x" class="w-2.5 h-2.5"></i> ERROR</span>`;
            }
        } else {
            healthBadge = `<span class="badge-chip badge-slate text-[10px]">Belum Dites</span>`;
        }

        const isEngineActive = _activeProvider === key.provider;
        const isCurrentInRotation = key.isCurrentlyActive;

        return `
            <div class="enterprise-card flex flex-col justify-between space-y-3 relative overflow-hidden ${isEngineActive ? 'border-indigo-500/40' : ''}" id="akm-card-${key.provider}-${key.index}">
                <!-- Accent Line -->
                <div class="absolute top-0 left-0 right-0 h-1" style="background: ${p.color}"></div>

                <div>
                    <!-- Header Line -->
                    <div class="flex items-start justify-between gap-2 pt-1">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-inner overflow-hidden p-1.5" style="background:${p.bg}; border:1px solid ${p.border};">
                                ${getProviderLogoSvg(key.provider, 'w-5 h-5')}
                            </div>
                            <div class="min-w-0">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <h4 class="font-bold text-xs text-[var(--text-primary)]">${p.label}</h4>
                                    <span class="font-mono-num text-[10px] text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-color)]">${escHtml(key.model || p.defaultModel)}</span>
                                </div>
                                <div class="flex items-center gap-1.5 mt-0.5">
                                    ${key.isPool ? `<span class="badge-chip badge-blue text-[9px] py-0 px-1.5">Pool #${key.index + 1}</span>` : '<span class="badge-chip badge-slate text-[9px] py-0 px-1.5">Single</span>'}
                                    ${key.label ? `<span class="text-[10px] text-amber-400 font-semibold truncate max-w-[120px]">• ${escHtml(key.label)}</span>` : ''}
                                </div>
                            </div>
                        </div>

                        <div class="shrink-0 flex items-center gap-1">
                            ${isCurrentInRotation ? '<span class="badge-chip badge-purple text-[9px] py-0 px-1.5">SEDANG DIGUNAKAN</span>' : ''}
                            ${healthBadge}
                        </div>
                    </div>

                    <!-- Code Block -->
                    <div class="mt-3 p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] flex items-center justify-between gap-2">
                        <code class="font-mono-num text-xs text-indigo-300 truncate">${escHtml(key.keyMasked || key.key || '••••••••')}</code>
                        <button onclick="window.copyKeyToClipboard('${escHtml(key.key)}')" class="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]" title="Salin API Key">
                            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>

                    <!-- Metadata -->
                    <div class="flex items-center justify-between text-[10px] text-[var(--text-muted)] mt-2 font-mono-num">
                        <span>Ditambahkan: ${timeAgo(key.addedAt)}</span>
                        <span>Terpakai: ${key.usageCount || 0}x</span>
                    </div>
                </div>

                <!-- Actions Footer -->
                <div class="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
                    <button onclick="window.testSingleKey('${key.provider}', ${key.index})" class="enterprise-btn enterprise-btn-secondary text-[11px] py-1 px-2.5">
                        <i data-lucide="zap" class="w-3 h-3 text-amber-400"></i>
                        <span>Uji Key</span>
                    </button>
                    <div class="flex items-center gap-1">
                        <button onclick="window.openEditLabel('${key.provider}', ${key.index}, '${escHtml(key.label || '')}')" class="p-1.5 rounded-lg bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]" title="Edit Label">
                            <i data-lucide="pencil" class="w-3 h-3"></i>
                        </button>
                        <button onclick="window.openDeleteConfirm('${key.provider}', ${key.index}, '${escHtml(key.keyMasked || '')}', '${p.label}')" class="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20" title="Hapus Key">
                            <i data-lucide="trash-2" class="w-3 h-3"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // ─── 5. DIAGNOSTICS & SINGLE TEST ───────────────────────
    window.testSingleKey = async function(provider, index) {
        const key = _allKeys.find(k => k.provider === provider && k.index === index);
        if (!key) return;

        if (window.showToast) window.showToast('info', `Menguji koneksi ${PROVIDERS[provider]?.label || provider} (#${index + 1})...`);

        try {
            const r = await fetch('/api/test-api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, key: key.key, model: key.model, url: key.url })
            });
            const d = await r.json();
            const keyId = `${provider}_${index}`;

            if (d.success) {
                _liveStatuses[keyId] = { status: 'ok', latency: d.latency, model: d.model };
                if (window.showToast) window.showToast('success', `${PROVIDERS[provider]?.label} ONLINE (${d.latency}ms)`);
            } else if (d.isQuota) {
                _liveStatuses[keyId] = { status: 'quota' };
                if (window.showToast) window.showToast('warning', 'Batas kuota terlampaui (HTTP 429 Quota Exceeded).');
            } else {
                _liveStatuses[keyId] = { status: 'error', error: d.error };
                if (window.showToast) window.showToast('error', 'Gagal koneksi: ' + (d.error || 'Error'));
            }
            renderKeyList();
        } catch(e) {
            if (window.showToast) window.showToast('error', 'Error: ' + e.message);
        }
    };

    window.runLiveHealthCheck = async function(silent = false) {
        if (_isTestingLive) return;
        _isTestingLive = true;
        
        const btn = document.getElementById('akm-btn-check-live');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<div class="w-3 h-3 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin"></div> <span>Menguji...</span>`;
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
                renderKeyList();

                if (!silent && window.showToast) {
                    const okCount = Object.values(_liveStatuses).filter(v => v.status === 'ok').length;
                    const errCount = Object.values(_liveStatuses).filter(v => v.status !== 'ok').length;
                    window.showToast('success', `Diagnosa Selesai: ${okCount} Online, ${errCount} Error`);
                }
            }
        } catch(e) {
            if (!silent && window.showToast) window.showToast('error', 'Gagal diagnosa: ' + e.message);
        } finally {
            _isTestingLive = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="zap" class="w-3.5 h-3.5"></i> <span>Scan Semua API</span>`;
                if (window.lucide) lucide.createIcons();
            }
        }
    };

    // ─── 6. KEY CRUD ACTIONS ───────────────────────────────
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
        if (urlRow) urlRow.style.display = (provider === 'local' || provider === 'openrouter') ? 'block' : 'none';
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
            if (window.showToast) window.showToast('warning', 'Masukkan API Key terlebih dahulu!');
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
            if (window.showToast) window.showToast('error', 'Gagal menyimpan: ' + err.message);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Simpan Key';
            }
        }
    };

    window.openEditLabel = async function(provider, index, currentLabel) {
        const newLabel = prompt(`Edit label untuk key ${PROVIDERS[provider]?.label || provider} (#${index + 1}):`, currentLabel || '');
        if (newLabel === null) return;

        try {
            const r = await fetch(`/api/keys/${provider}/${index}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: newLabel.trim() })
            });
            if (r.ok) {
                if (window.showToast) window.showToast('success', 'Label berhasil diperbarui!');
                await window.loadApiKeys();
            } else {
                throw new Error(await r.text());
            }
        } catch(err) {
            if (window.showToast) window.showToast('error', 'Gagal edit label: ' + err.message);
        }
    };

    window.openDeleteConfirm = async function(provider, index, masked, providerLabel) {
        const confirmed = await window.showEnterpriseConfirm({
            title: 'Hapus API Key AI',
            message: `Apakah Anda yakin ingin menghapus API Key <strong class="text-white">${providerLabel} (${masked})</strong>?`,
            confirmText: 'Ya, Hapus Key',
            cancelText: 'Batal',
            type: 'danger',
            icon: 'trash-2'
        });

        if (!confirmed) return;

        try {
            const r = await fetch(`/api/keys/${provider}/${index}`, {
                method: 'DELETE'
            });
            if (r.ok) {
                if (window.showToast) window.showToast('success', 'API Key berhasil dihapus.');
                await window.loadApiKeys();
            } else {
                throw new Error(await r.text());
            }
        } catch(err) {
            if (window.showToast) window.showToast('error', 'Gagal menghapus key: ' + err.message);
        }
    };

    // Auto load
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (window.loadApiKeys) window.loadApiKeys();
        }, 500);
    });

})();
