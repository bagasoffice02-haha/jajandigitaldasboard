// public/js/apikeys.js
// Modul API Key Manager (AKM) & Health Monitor
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

    const API_PROVIDER_META = {
        gemini:     { label: 'Google Gemini',   accent: '#4285F4', bg: 'rgba(66,133,244,0.08)',   borderOk: 'rgba(66,133,244,0.25)',   abbr: 'GM' },
        groq:       { label: 'Groq',            accent: '#f55036', bg: 'rgba(245,80,54,0.08)',    borderOk: 'rgba(245,80,54,0.25)',    abbr: 'GQ' },
        deepseek:   { label: 'DeepSeek',        accent: '#1e88e5', bg: 'rgba(30,136,229,0.08)',   borderOk: 'rgba(30,136,229,0.25)',   abbr: 'DS' },
        qwen:       { label: 'Alibaba Qwen',    accent: '#FF6A00', bg: 'rgba(255,106,0,0.08)',    borderOk: 'rgba(255,106,0,0.25)',    abbr: 'QW' },
        openrouter: { label: 'OpenRouter',      accent: '#7c3aed', bg: 'rgba(124,58,237,0.08)',   borderOk: 'rgba(124,58,237,0.25)',   abbr: 'OR' },
        local:      { label: 'Local LM Studio', accent: '#059669', bg: 'rgba(5,150,105,0.08)',    borderOk: 'rgba(5,150,105,0.25)',    abbr: 'LM' },
    };

    let _allKeys = [];
    let _activeFilter = 'all';
    let _activeProvider = 'gemini';
    let _deleteTarget = null;
    let _liveStatuses = {};
    let _isTestingLive = false;
    let _realtimeLogs = [];
    let _providerUsageCounts = { gemini:0, groq:0, deepseek:0, qwen:0, openrouter:0, local:0 };

    function timeAgo(iso) {
        if (!iso) return 'Belum pernah';
        const diff = Date.now() - new Date(iso).getTime();
        const s = Math.floor(diff / 1000);
        if (s < 60) return 'Baru saja';
        const m = Math.floor(s / 60);
        if (m < 60) return m + ' menit lalu';
        const h = Math.floor(m / 60);
        if (h < 24) return h + ' jam lalu';
        const d = Math.floor(h / 24);
        if (d < 30) return d + ' hari lalu';
        return Math.floor(d / 30) + ' bulan lalu';
    }

    function fmtCount(n) {
        if (!n) return '0';
        if (n >= 1000000) return (n/1000000).toFixed(1) + 'jt';
        if (n >= 1000) return (n/1000).toFixed(1) + 'rb';
        return String(n);
    }

    function escHtml(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _latencyClass(ms) {
        if (ms === undefined || ms === null) return { color: '#888', label: '—' };
        if (ms < 800)  return { color: '#10b981', label: ms + 'ms' };
        if (ms < 2000) return { color: '#f59e0b', label: ms + 'ms' };
        return { color: '#ef4444', label: ms + 'ms' };
    }

    window.loadApiKeys = async function() {
        const list = document.getElementById('akm-key-list');
        if (!list) return;
        list.innerHTML = renderSkeleton();
        try {
            const r = await fetch('/api/keys');
            const data = await r.json();
            _allKeys = data.keys || [];
            _activeProvider = data.activeProvider || 'gemini';
            renderStats();
            renderFilterTabs();
            renderKeyList();
            window.runLiveHealthCheck(true);
        } catch(e) {
            list.innerHTML = `<div class="akm-empty"><i data-lucide="wifi-off" style="width:36px;height:36px;opacity:.4"></i><p>Gagal memuat data: ${e.message}</p></div>`;
            if (window.lucide) lucide.createIcons();
        }
    };

    window.runLiveHealthCheck = async function(silent = false) {
        if (_isTestingLive) return;
        _isTestingLive = true;
        const btn = document.getElementById('akm-btn-check-live');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i data-lucide="loader" class="spin"></i> <span>Menguji Koneksi…</span>`;
            if (window.lucide) lucide.createIcons();
        }

        try {
            const r = await fetch('/api/api-status');
            const data = await r.json();
            if (data.results) {
                data.results.forEach(res => {
                    const keyId = `${res.provider}_${res.index}`;
                    _liveStatuses[keyId] = res;
                });
            }
            renderStats();
            renderKeyList();
        } catch(e) {
            console.error('[AKM Live Check] Error:', e);
            if (!silent) window.showToast && window.showToast('Gagal menguji koneksi API: ' + e.message, 'error');
        } finally {
            _isTestingLive = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="zap"></i> <span>Scan Semua API</span>`;
                if (window.lucide) lucide.createIcons();
            }
            if (!silent && Object.keys(_liveStatuses).length > 0) {
                const okCount = Object.values(_liveStatuses).filter(v => v.status === 'ok').length;
                const errCount = Object.values(_liveStatuses).filter(v => v.status !== 'ok').length;
                window.showToast && window.showToast(`Diagnosa Selesai: ${okCount} Online, ${errCount} Error/Quota`, okCount > 0 ? 'success' : 'warning');
            }
        }
    };

    function renderSkeleton() {
        return Array(3).fill(0).map((_,i) => `
        <div class="akm-skel-row" style="animation-delay:${i*0.12}s">
            <div class="akm-skel-avatar"></div>
            <div class="akm-skel-lines">
                <div class="akm-skel-line w60"></div>
                <div class="akm-skel-line w45"></div>
            </div>
            <div class="akm-skel-badge"></div>
        </div>`).join('');
    }

    function renderStats() {
        const total = _allKeys.length;
        const liveVals = Object.values(_liveStatuses);
        const okCount = liveVals.filter(v => v.status === 'ok').length;
        const quotaCount = liveVals.filter(v => v.status === 'quota').length;
        const errCount = liveVals.filter(v => v.status === 'error').length;

        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setEl('akm-stat-total', total);
        setEl('akm-stat-pool', _allKeys.filter(k => k.isPool).length);
        setEl('akm-stat-single', _allKeys.filter(k => !k.isPool).length);
        setEl('akm-stat-used', _allKeys.filter(k => k.usageCount > 0).length);
        setEl('akm-stat-active-provider', (_activeProvider || 'gemini').toUpperCase());

        const statusPill = document.getElementById('akm-stat-live-status');
        if (statusPill) {
            if (liveVals.length === 0) {
                statusPill.innerHTML = `Live: <strong>Belum dites</strong>`;
            } else {
                statusPill.innerHTML = `Live: <strong style="color:#10b981">${okCount} OK</strong>` +
                    (quotaCount > 0 ? ` · <strong style="color:#f59e0b">${quotaCount} Quota</strong>` : '') +
                    (errCount > 0 ? ` · <strong style="color:#ef4444">${errCount} Err</strong>` : '');
            }
        }
    }

    function renderFilterTabs() {
        const container = document.getElementById('akm-filter-tabs');
        if (!container) return;
        const providers = ['all', ...new Set(_allKeys.map(k => k.provider))];
        container.innerHTML = providers.map(p => {
            const info = PROVIDERS[p] || { label: 'Semua', color: 'var(--blue)' };
            const label = p === 'all' ? 'Semua Provider' : info.label;
            const count = p === 'all' ? _allKeys.length : _allKeys.filter(k => k.provider === p).length;
            const active = _activeFilter === p ? 'active' : '';
            return `<button class="akm-filter-tab ${active}" onclick="window.setAkmFilter('${p}')" style="--tab-color:${p==='all'?'var(--blue)':info.color}">
                ${label} <span class="akm-filter-count">${count}</span>
            </button>`;
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
            list.innerHTML = `<div class="akm-empty">
                <div class="akm-empty-icon"><i data-lucide="key-round"></i></div>
                <p style="font-weight:700;margin:0">Belum ada API key</p>
                <p style="font-size:.8rem;opacity:.6;margin:0">Klik "+ Tambah Key" untuk menambahkan key baru</p>
            </div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        list.innerHTML = filtered.map((key, idx) => renderKeyCard(key, idx)).join('');
        if (window.lucide) lucide.createIcons();
    }

    function renderKeyCard(key, idx) {
        const p = PROVIDERS[key.provider] || { label: key.provider, abbr: key.provider.slice(0,2).toUpperCase(), color:'#888', bg:'rgba(128,128,128,0.1)', border:'rgba(128,128,128,0.2)' };
        const keyId = `${key.provider}_${key.index}`;
        const live = _liveStatuses[keyId];

        let healthBadge = '';
        let errAlert = '';
        if (live) {
            if (live.status === 'ok') {
                healthBadge = `<span class="akm-health-badge ok" title="Koneksi lancar"><span class="akm-dot ok"></span>ONLINE ${live.latency}ms</span>`;
            } else if (live.status === 'quota') {
                healthBadge = `<span class="akm-health-badge quota" title="Batas kuota terlampaui"><span class="akm-dot quota"></span>QUOTA LIMIT (429)</span>`;
                errAlert = `<div class="akm-card-err-alert quota"><i data-lucide="alert-circle"></i> Quota Limit HTTP 429 — Auto-rotation akan lewati key ini</div>`;
            } else {
                healthBadge = `<span class="akm-health-badge error" title="${escHtml(live.error||'Error')}"><span class="akm-dot error"></span>MATI / ERROR</span>`;
                errAlert = `<div class="akm-card-err-alert error"><i data-lucide="x-circle"></i> Error: ${escHtml(live.error||'Gagal koneksi')}</div>`;
            }
        } else {
            healthBadge = `<span class="akm-health-badge untested"><span class="akm-dot untested"></span>Belum Dites</span>`;
        }

        const isActiveInPool = key.isCurrentlyActive;
        const activeBadge = isActiveInPool ? `<span class="akm-active-badge"><span class="akm-pulse-dot"></span>SEDANG DIPAKAI</span>` : '';
        const poolBadge = key.isPool ? `<span class="akm-pool-badge">Pool #${key.index + 1}</span>` : '<span class="akm-single-badge">Single</span>';
        const usageText = key.usageCount > 0 ? `${fmtCount(key.usageCount)} req · ${timeAgo(key.lastUsedAt)}` : 'Belum dipakai';
        const addedText = key.addedAt ? timeAgo(key.addedAt) : 'Manual';
        const labelBadge = key.label ? `<span class="akm-label-badge">${escHtml(key.label)}</span>` : '';

        return `<div class="akm-key-card ${isActiveInPool ? 'is-active-key' : ''}" id="akm-card-${key.provider}-${key.index}">
            <div class="akm-card-accent" style="background:${p.color}"></div>
            <div class="akm-card-body">
                <div class="akm-card-left">
                    <div class="akm-provider-avatar" style="background:${p.bg};color:${p.color};border-color:${p.border}">${p.abbr}</div>
                    <div class="akm-card-info">
                        <div class="akm-card-top-line">
                            <span class="akm-provider-label" style="color:${p.color}">${p.label}</span>
                            <span class="akm-model-chip">${escHtml(key.model || '-')}</span>
                            ${poolBadge}
                            ${healthBadge}
                            ${activeBadge}
                            ${labelBadge}
                        </div>
                        <div class="akm-key-code-row">
                            <code class="akm-key-code" title="${escHtml(key.key)}">${escHtml(key.keyMasked)}</code>
                        </div>
                        ${errAlert}
                        <div class="akm-card-sub-line">
                            <span><i data-lucide="clock" style="width:11px;height:11px"></i> ${addedText}</span>
                            <span class="akm-dot-sep">•</span>
                            <span><i data-lucide="bar-chart-2" style="width:11px;height:11px"></i> ${usageText}</span>
                            ${key.url ? `<span class="akm-dot-sep">•</span><span><i data-lucide="globe" style="width:11px;height:11px"></i> ${escHtml(key.url)}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="akm-card-right">
                    <button class="akm-action-btn akm-btn-edit" title="Edit Label" onclick="window.openEditLabel('${key.provider}', ${key.index}, '${escHtml(key.label)}')"><i data-lucide="pencil"></i> Edit</button>
                    <button class="akm-action-btn akm-btn-delete" title="Hapus Key" onclick="window.openDeleteConfirm('${key.provider}', ${key.index}, '${escHtml(key.keyMasked)}', '${p.label}')"><i data-lucide="trash-2"></i> Hapus</button>
                </div>
            </div>
        </div>`;
    }

    window.openAddKeyModal = function() {
        document.getElementById('akm-modal-add')?.classList.remove('hidden');
        document.getElementById('akm-add-key').value = '';
        document.getElementById('akm-add-label').value = '';
        document.getElementById('akm-add-model').value = '';
        document.getElementById('akm-add-url').value = '';
        document.getElementById('akm-test-result').innerHTML = '';
        document.getElementById('akm-add-url-row').style.display = 'none';
        const sel = document.getElementById('akm-add-provider');
        if (sel) { sel.value = 'gemini'; window.updateAddModelPlaceholder(); }
    };

    window.closeAddKeyModal = function() {
        document.getElementById('akm-modal-add')?.classList.add('hidden');
    };

    window.updateAddModelPlaceholder = function() {
        const provider = document.getElementById('akm-add-provider').value;
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
        if (!key) { resEl.innerHTML = '<span class="akm-test-error">Masukkan API Key terlebih dahulu</span>'; return; }
        resEl.innerHTML = '<span class="akm-test-loading"><i data-lucide="loader"></i> Menguji koneksi…</span>';
        if (window.lucide) lucide.createIcons();
        try {
            const r = await fetch('/api/test-api', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ provider, key, model, url }) });
            const d = await r.json();
            if (d.success) {
                resEl.innerHTML = `<span class="akm-test-ok"><i data-lucide="check-circle-2"></i> Berhasil! Model: ${escHtml(d.model||'')} · ${d.latency}ms</span>`;
            } else if (d.isQuota) {
                resEl.innerHTML = `<div class="akm-test-quota" style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;padding:8px 12px;border-radius:8px;font-size:0.75rem;line-height:1.4;">
                    <div style="font-weight:800;display:flex;align-items:center;gap:5px;margin-bottom:3px;"><i data-lucide="alert-triangle"></i> Key Valid! Kuota Gratis limit temporer (HTTP 429)</div>
                    API Key ini <strong>VALID (Sudah Benar)</strong>, namun kuota gratis dari Google sedang cooldown (limit sementara). <strong>Key ini TETAP BISA DISIMPAN</strong> ke stok pool untuk rotasi otomatis saat kuotanya reset!
                </div>`;
            } else {
                resEl.innerHTML = `<span class="akm-test-error"><i data-lucide="x-circle"></i> Gagal: ${escHtml(d.error||'Unknown error')}</span>`;
            }
            if (window.lucide) lucide.createIcons();
        } catch(e) {
            resEl.innerHTML = `<span class="akm-test-error">Error: ${e.message}</span>`;
        }
    };

    window.saveNewApiKey = async function() {
        const provider = document.getElementById('akm-add-provider').value;
        const key = document.getElementById('akm-add-key').value.trim();
        const model = document.getElementById('akm-add-model').value.trim();
        const label = document.getElementById('akm-add-label').value.trim();
        const url = document.getElementById('akm-add-url').value.trim();
        const resEl = document.getElementById('akm-test-result');
        if (!key) { resEl.innerHTML = '<span class="akm-test-error">API Key tidak boleh kosong</span>'; return; }
        const btn = document.getElementById('akm-save-btn');
        btn.disabled = true; btn.textContent = 'Menyimpan…';
        try {
            const r = await fetch('/api/keys', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ provider, key, model, label, url }) });
            const d = await r.json();
            if (d.success) {
                window.closeAddKeyModal();
                window.loadApiKeys();
                window.showToast && window.showToast('API Key berhasil ditambahkan!', 'success');
            } else {
                resEl.innerHTML = `<span class="akm-test-error">${escHtml(d.error||'Gagal menyimpan')}</span>`;
            }
        } catch(e) {
            resEl.innerHTML = `<span class="akm-test-error">Error: ${e.message}</span>`;
        } finally {
            btn.disabled = false; btn.textContent = 'Simpan Key';
        }
    };

    window.openDeleteConfirm = function(provider, index, keyMasked, providerLabel) {
        _deleteTarget = { provider, index };
        document.getElementById('akm-del-key-label').textContent = keyMasked;
        document.getElementById('akm-del-provider-label').textContent = providerLabel;
        document.getElementById('akm-modal-delete')?.classList.remove('hidden');
    };

    window.closeDeleteModal = function() {
        document.getElementById('akm-modal-delete')?.classList.add('hidden');
        _deleteTarget = null;
    };

    window.confirmDeleteKey = async function() {
        if (!_deleteTarget) return;
        const { provider, index } = _deleteTarget;
        const btn = document.getElementById('akm-del-confirm-btn');
        btn.disabled = true; btn.textContent = 'Menghapus…';
        try {
            const r = await fetch(`/api/keys/${provider}/${index}`, { method:'DELETE' });
            const d = await r.json();
            if (d.success) {
                window.closeDeleteModal();
                window.loadApiKeys();
                window.showToast && window.showToast('API Key berhasil dihapus', 'success');
            } else {
                alert('Gagal hapus: ' + (d.error||'Unknown'));
            }
        } catch(e) {
            alert('Error: ' + e.message);
        } finally {
            btn.disabled = false; btn.textContent = 'Ya, Hapus';
        }
    };

    window.openEditLabel = function(provider, index, currentLabel) {
        const newLabel = prompt('Masukkan nama/label untuk key ini:', currentLabel || '');
        if (newLabel === null) return;
        fetch(`/api/keys/${provider}/${index}`, {
            method: 'PATCH',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ label: newLabel })
        }).then(r => r.json()).then(d => {
            if (d.success) { window.loadApiKeys(); window.showToast && window.showToast('Label berhasil diperbarui', 'success'); }
            else alert('Gagal: ' + (d.error||'Unknown'));
        });
    };

    function handleRealtimeAiActivity(data) {
        if (!data) return;
        const provider = data.provider || 'gemini';
        const index = data.index || 0;
        const keyId = `${provider}_${index}`;

        _providerUsageCounts[provider] = (_providerUsageCounts[provider] || 0) + 1;
        renderRealtimeChart();

        const pLabel = (PROVIDERS[provider] ? PROVIDERS[provider].label : provider);
        const timeStr = new Date(data.timestamp || Date.now()).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const logItem = {
            time: timeStr,
            provider: pLabel,
            index: index + 1,
            model: data.model || '-',
            latency: data.latency || 0,
            status: data.status || 'ok',
            error: data.error || null
        };
        _realtimeLogs.unshift(logItem);
        if (_realtimeLogs.length > 8) _realtimeLogs.pop();
        renderRealtimeLogs();

        const targetCard = document.getElementById(`akm-card-${provider}-${index}`);
        if (targetCard) {
            targetCard.classList.remove('akm-card-ping');
            void targetCard.offsetWidth;
            targetCard.classList.add('akm-card-ping');

            const keyObj = _allKeys.find(k => k.provider === provider && k.index === index);
            if (keyObj) {
                keyObj.usageCount = (keyObj.usageCount || 0) + 1;
                keyObj.lastUsedAt = new Date().toISOString();
            }
        }

        _liveStatuses[keyId] = {
            provider,
            index,
            status: data.status || 'ok',
            latency: data.latency || 0,
            error: data.error || null,
            model: data.model
        };
        renderStats();
    }

    function renderRealtimeChart() {
        const container = document.getElementById('akm-chart-bars');
        if (!container) return;
        const totalReqs = Object.values(_providerUsageCounts).reduce((a,b) => a+b, 0) || 1;
        
        container.innerHTML = Object.entries(PROVIDERS).map(([pKey, pInfo]) => {
            const count = _providerUsageCounts[pKey] || 0;
            const pct = Math.round((count / totalReqs) * 100);
            return `<div class="akm-chart-row">
                <div class="akm-chart-label" style="color:${pInfo.color}">${pInfo.abbr}</div>
                <div class="akm-chart-track">
                    <div class="akm-chart-fill" style="width:${pct}%;background:${pInfo.color}"></div>
                </div>
                <div class="akm-chart-val">${count} req (${pct}%)</div>
            </div>`;
        }).join('');
    }

    function renderRealtimeLogs() {
        const container = document.getElementById('akm-live-feed-list');
        if (!container) return;
        if (_realtimeLogs.length === 0) {
            container.innerHTML = `<div class="akm-feed-empty"><i data-lucide="activity" style="width:16px;height:16px"></i> Menunggu respons AI real-time…</div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        container.innerHTML = _realtimeLogs.map(l => {
            const isOk = l.status === 'ok';
            const badgeClass = isOk ? 'ok' : 'err';
            const iconName = isOk ? 'check-circle-2' : 'x-circle';
            return `<div class="akm-feed-item">
                <span class="akm-feed-time">${l.time}</span>
                <span class="akm-feed-prov">${l.provider} #${l.index}</span>
                <span class="akm-feed-model">${l.model}</span>
                <span class="akm-feed-badge ${badgeClass}"><i data-lucide="${iconName}"></i> ${isOk ? l.latency + 'ms' : 'ERROR'}</span>
            </div>`;
        }).join('');
        if (window.lucide) lucide.createIcons();
    }

    // Attach Socket.io listener
    if (typeof socket !== 'undefined') {
        socket.on('ai_activity', function(data) {
            handleRealtimeAiActivity(data);
        });
    }
})();
