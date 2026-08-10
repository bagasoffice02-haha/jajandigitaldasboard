// src/routes/configRoute.js — API Routes untuk Config Bot
const express = require('express');
const router = express.Router();
const { config, updateConfig: saveConfig } = require('../config/config');

router.get('/config', (req, res) => {
    res.json(config);
});

router.post('/config', async (req, res) => {
    try {
        const newConfig = req.body;
        // Jangan timpa api_key jika yang dikirim adalah placeholder atau kosong
        const isPlaceholder = (v) => !v || v.includes('YOUR_LOCAL') || v.includes('TOKEN');
        if (isPlaceholder(newConfig.api_key)) {
            delete newConfig.api_key;
        }

        // Proteksi token bot telegram agar tidak terhapus jika string kosong / placeholder titik
        if (newConfig.telegram_bot_token !== undefined) {
            const tok = (newConfig.telegram_bot_token || '').trim();
            if (!tok || /^\.+$/.test(tok) || tok.includes('YOUR_') || tok.includes('TOKEN')) {
                delete newConfig.telegram_bot_token;
            }
        }

        Object.assign(config, newConfig);
        saveConfig(config);

        // Auto restart/start Bot Telegram jika enabled
        const io = req.app.get('io');
        if (config.telegram_bot_enabled && config.telegram_bot_token) {
            try {
                const { restartTelegramBot } = require('../services/telegram/client');
                const { startTelegramScheduler } = require('../services/telegram/scheduler');
                await restartTelegramBot(io);
                startTelegramScheduler();
            } catch (tgErr) {
                console.error('[Telegram] Error saat auto-restart bot:', tgErr.message);
            }
        } else {
            try {
                const { stopTelegramBot } = require('../services/telegram/client');
                await stopTelegramBot();
            } catch (_) {}
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// ─── Test Koneksi Token Bot Telegram ─────────────────────────────────────────
router.post('/telegram/test-connection', async (req, res) => {
    const { token } = req.body;
    if (!token || token.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Token tidak boleh kosong.' });
    }

    // Cek apakah package sudah terinstall di server
    let TelegramBot;
    try {
        const pkg = require('node-telegram-bot-api');
        // Package bisa mengekspor class langsung atau via .default (ES module wrapper)
        TelegramBot = (typeof pkg === 'function') ? pkg : (pkg.default || pkg.TelegramBot);
        if (typeof TelegramBot !== 'function') throw new Error('NOT_INSTALLED');
    } catch (pkgErr) {
        return res.json({
            success: false,
            error: 'Package node-telegram-bot-api belum terinstall di server. Jalankan: npm install di VPS lalu restart.'
        });
    }

    try {
        // Buat instance sementara hanya untuk validasi token (tanpa polling)
        const testBot = new TelegramBot(token.trim(), { polling: false });
        const me = await testBot.getMe();
        res.json({
            success: true,
            username: me.username,
            first_name: me.first_name,
            id: me.id
        });
    } catch (err) {
        const errMsg = err.message || '';
        res.json({
            success: false,
            error: errMsg.includes('401') || errMsg.includes('Unauthorized')
                ? 'Token tidak valid atau sudah kadaluarsa. Periksa kembali token dari @BotFather.'
                : errMsg.includes('ETELEGRAM') || errMsg.includes('ENOTFOUND')
                    ? 'Tidak dapat terhubung ke server Telegram. Periksa koneksi internet server VPS.'
                    : errMsg
        });
    }
});


// ─── Status Bot Telegram saat ini ────────────────────────────────────────────
router.get('/telegram/status', (req, res) => {
    try {
        // Cek apakah bot Telegram aktif dan instance-nya berjalan
        if (!config.telegram_bot_enabled || !config.telegram_bot_token) {
            return res.json({ status: 'DISABLED' });
        }
        // Coba ambil instance bot (jika sudah diinisialisasi)
        try {
            const { getTelegramStatus } = require('../services/telegram/client');
            const status = getTelegramStatus();
            return res.json({ status });
        } catch (_) {
            // Modul telegram belum di-require (bot belum pernah diaktifkan di sesi ini)
            return res.json({ status: config.telegram_bot_enabled ? 'DISCONNECTED' : 'DISABLED' });
        }
    } catch (err) {
        res.status(500).json({ status: 'ERROR', error: err.message });
    }
});



// ─── Test / Health Check API Keys ─────────────────────────────────────────────
// Helper: mask key for safe display
function maskKey(key = '') {
    if (!key || key.length < 8) return '***';
    return key.substring(0, 6) + '...' + key.substring(key.length - 4);
}

// Helper: parse error response
function parseApiError(err) {
    if (err.response && err.response.data) {
        const d = err.response.data;
        if (d.error && d.error.message) return { code: d.error.code || err.response.status, message: d.error.message };
        if (d.error && typeof d.error === 'string') return { code: err.response.status, message: d.error };
        return { code: err.response.status, message: JSON.stringify(d).substring(0, 200) };
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return { code: 'TIMEOUT', message: 'Request timeout — server lambat atau tidak merespons' };
    if (err.code === 'ECONNREFUSED') return { code: 'CONN_REFUSED', message: 'Koneksi ditolak — pastikan server/URL sudah benar' };
    if (err.code === 'ENOTFOUND') return { code: 'DNS_ERROR', message: 'URL tidak ditemukan — periksa alamat endpoint' };
    return { code: 'UNKNOWN', message: err.message || 'Error tidak diketahui' };
}

// POST /api/test-api — Test satu API key tertentu
router.post('/test-api', async (req, res) => {
    const axios = require('axios');
    const { provider, key, model, url: customUrl } = req.body;

    if (!provider || !key || !key.trim()) {
        return res.status(400).json({ success: false, error: 'provider dan key wajib diisi.' });
    }

    const startTime = Date.now();

    try {
        let result = {};

        if (provider === 'gemini') {
            let modelName = model;
            if (!modelName || !modelName.toLowerCase().startsWith('gemini')) {
                modelName = getGeminiModel();
            }
            const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key.trim()}`;
            const resp = await axios.post(testUrl, {
                contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
                generationConfig: { maxOutputTokens: 5 }
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });

            if (resp.data && resp.data.candidates) {
                result = {
                    success: true,
                    model: modelName,
                    latency: Date.now() - startTime,
                    info: `Model: ${modelName} | Token input: ${resp.data.usageMetadata?.promptTokenCount || '-'}`
                };
            } else {
                result = { success: false, error: 'Respon tidak valid dari Gemini' };
            }
        }

        // ── GROQ ───────────────────────────────────────────────
        else if (provider === 'groq') {
            const modelName = model || config.groq_model || 'llama-3.3-70b-versatile';
            const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: modelName,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 5
            }, {
                headers: { 'Authorization': `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
                timeout: 15000
            });

            result = {
                success: true,
                model: resp.data.model || modelName,
                latency: Date.now() - startTime,
                info: `Model: ${resp.data.model || modelName} | Tokens: ${resp.data.usage?.total_tokens || '-'}`
            };
        }

        // ── DEEPSEEK ───────────────────────────────────────────
        else if (provider === 'deepseek') {
            const modelName = model || config.deepseek_model || 'deepseek-chat';
            const resp = await axios.post('https://api.deepseek.com/v1/chat/completions', {
                model: modelName,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 5
            }, {
                headers: { 'Authorization': `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
                timeout: 15000
            });

            result = {
                success: true,
                model: resp.data.model || modelName,
                latency: Date.now() - startTime,
                info: `Model: ${resp.data.model || modelName} | Tokens: ${resp.data.usage?.total_tokens || '-'}`
            };
        }

        // ── QWEN (Alibaba) ─────────────────────────────────────
        else if (provider === 'qwen') {
            const modelName = model || config.qwen_model || 'qwen-plus';
            const resp = await axios.post('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
                model: modelName,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 5
            }, {
                headers: { 'Authorization': `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
                timeout: 15000
            });

            result = {
                success: true,
                model: resp.data.model || modelName,
                latency: Date.now() - startTime,
                info: `Model: ${resp.data.model || modelName} | Tokens: ${resp.data.usage?.total_tokens || '-'}`
            };
        }

        // ── OPENROUTER ─────────────────────────────────────────
        else if (provider === 'openrouter') {
            const modelName = model || config.openrouter_model || 'meta-llama/llama-3.3-70b-instruct';
            const resp = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: modelName,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 5
            }, {
                headers: {
                    'Authorization': `Bearer ${key.trim()}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/jajandigi',
                    'X-Title': 'JajanDigital Bot'
                },
                timeout: 20000
            });

            result = {
                success: true,
                model: resp.data.model || modelName,
                latency: Date.now() - startTime,
                info: `Model: ${resp.data.model || modelName} | Tokens: ${resp.data.usage?.total_tokens || '-'}`
            };
        }

        // ── LOCAL LM / Custom URL ──────────────────────────────
        else if (provider === 'local') {
            let endpoint = customUrl || config.api_url || 'http://localhost:1234/v1/chat/completions';
            if (!endpoint.includes('/chat/completions') && !endpoint.includes('/api/chat')) {
                endpoint = endpoint.replace(/\/+$/, '') + '/v1/chat/completions';
            }

            const modelName = model || config.model_name || 'local-model';
            const resp = await axios.post(endpoint, {
                model: modelName,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 5,
                stream: false
            }, {
                headers: {
                    'Authorization': `Bearer ${key.trim() || 'lm-studio'}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            result = {
                success: true,
                model: resp.data.model || modelName,
                latency: Date.now() - startTime,
                info: `Endpoint: ${endpoint} | Model: ${resp.data.model || modelName}`
            };
        } else {
            return res.status(400).json({ success: false, error: `Provider '${provider}' tidak dikenali.` });
        }

        res.json(result);
    } catch (err) {
        const errInfo = parseApiError(err);
        res.json({
            success: false,
            latency: Date.now() - startTime,
            errorCode: errInfo.code,
            error: errInfo.message
        });
    }
});


// GET /api/api-status — Cek status semua API key dari config saat ini
router.get('/api-status', async (req, res) => {
    const axios = require('axios');
    const results = [];

    async function testKey(provider, key, model, url) {
        const start = Date.now();
        try {
            let endpoint, payload, headers;

            if (provider === 'gemini') {
                const m = model || 'gemini-2.0-flash';
                endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
                payload = { contents: [{ role: 'user', parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 5 } };
                headers = { 'Content-Type': 'application/json' };
            } else if (provider === 'groq') {
                endpoint = 'https://api.groq.com/openai/v1/chat/completions';
                payload = { model: model || 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 };
                headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
            } else if (provider === 'deepseek') {
                endpoint = 'https://api.deepseek.com/v1/chat/completions';
                payload = { model: model || 'deepseek-chat', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 };
                headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
            } else if (provider === 'qwen') {
                endpoint = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
                payload = { model: model || 'qwen-plus', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 };
                headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
            } else if (provider === 'openrouter') {
                endpoint = 'https://openrouter.ai/api/v1/chat/completions';
                payload = { model: model || 'meta-llama/llama-3.3-70b-instruct', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 };
                headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com', 'X-Title': 'JajanDigital' };
            } else if (provider === 'local') {
                endpoint = url || 'http://localhost:1234/v1/chat/completions';
                payload = { model: model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5, stream: false };
                headers = { 'Authorization': `Bearer ${key || 'lm-studio'}`, 'Content-Type': 'application/json' };
            }

            const resp = await axios.post(endpoint, payload, { headers, timeout: 12000 });
            const latency = Date.now() - start;
            return { status: 'ok', latency };
        } catch (err) {
            const latency = Date.now() - start;
            const errInfo = parseApiError(err);
            // Quota/rate limit = warning (not dead, just limited)
            const isQuota = errInfo.code === 429 || (errInfo.message || '').toLowerCase().includes('quota') || (errInfo.message || '').toLowerCase().includes('rate limit') || (errInfo.message || '').toLowerCase().includes('exhausted');
            return { status: isQuota ? 'quota' : 'error', latency, error: errInfo.message, errorCode: errInfo.code };
        }
    }

    const jobs = [];

    // Gemini keys
    const geminiKeys = (config.gemini_api_keys || []).filter(k => k && k.trim());
    const gModel = getGeminiModel();
    geminiKeys.forEach((key, i) => {
        jobs.push(testKey('gemini', key, gModel).then(r => results.push({
            provider: 'gemini', index: i, keyMasked: maskKey(key), model: gModel, ...r
        })));
    });


    // Groq keys
    const groqKeys = (config.groq_api_keys || []).filter(k => k && k.trim());
    groqKeys.forEach((key, i) => {
        jobs.push(testKey('groq', key, config.groq_model).then(r => results.push({
            provider: 'groq', index: i, keyMasked: maskKey(key), model: config.groq_model || 'llama-3.3-70b-versatile', ...r
        })));
    });

    // DeepSeek
    if (config.deepseek_api_key && config.deepseek_api_key.trim()) {
        jobs.push(testKey('deepseek', config.deepseek_api_key, config.deepseek_model).then(r => results.push({
            provider: 'deepseek', index: 0, keyMasked: maskKey(config.deepseek_api_key), model: config.deepseek_model || 'deepseek-chat', ...r
        })));
    }

    // Qwen
    if (config.qwen_api_key && config.qwen_api_key.trim()) {
        jobs.push(testKey('qwen', config.qwen_api_key, config.qwen_model).then(r => results.push({
            provider: 'qwen', index: 0, keyMasked: maskKey(config.qwen_api_key), model: config.qwen_model || 'qwen-plus', ...r
        })));
    }

    // OpenRouter
    if (config.openrouter_api_key && config.openrouter_api_key.trim()) {
        jobs.push(testKey('openrouter', config.openrouter_api_key, config.openrouter_model).then(r => results.push({
            provider: 'openrouter', index: 0, keyMasked: maskKey(config.openrouter_api_key), model: config.openrouter_model || 'meta-llama/llama-3.3-70b-instruct', ...r
        })));
    }

    // Local LM
    if (config.api_url && config.api_url.trim() && !config.api_url.includes('YOUR_')) {
        jobs.push(testKey('local', config.api_key, config.model_name, config.api_url).then(r => results.push({
            provider: 'local', index: 0, keyMasked: maskKey(config.api_key), model: config.model_name || 'local-model',
            url: config.api_url, ...r
        })));
    }

    await Promise.allSettled(jobs);

    // Sort by provider then index
    results.sort((a, b) => a.provider.localeCompare(b.provider) || a.index - b.index);

    res.json({
        activeProvider: config.provider || 'gemini',
        checkedAt: new Date().toISOString(),
        results
    });
});

// ═══════════════════════════════════════════════════════════
// API KEY MANAGER — CRUD Endpoints
// ═══════════════════════════════════════════════════════════

function getGeminiModel() {
    if (config.gemini_model && config.gemini_model.trim()) return config.gemini_model.trim();
    if (config.model_name && config.model_name.toLowerCase().startsWith('gemini')) return config.model_name.trim();
    return 'gemini-2.0-flash';
}

const PROVIDER_CONFIG_MAP = {
    gemini:     { arrayField: 'gemini_api_keys',  modelField: 'gemini_model',      single: false },
    groq:       { arrayField: 'groq_api_keys',    modelField: 'groq_model',        single: false },
    deepseek:   { keyField:   'deepseek_api_key', modelField: 'deepseek_model',    single: true  },
    qwen:       { keyField:   'qwen_api_key',     modelField: 'qwen_model',        single: true  },
    openrouter: { keyField:   'openrouter_api_key', modelField: 'openrouter_model', single: true },
    local:      { keyField:   'api_key',          modelField: 'model_name',        single: true, urlField: 'api_url' },
};


function getMetaKey(provider, index) {
    return `${provider}_${index}`;
}

function ensureMetadata() {
    if (!config.key_metadata) config.key_metadata = {};
}

// GET /api/keys — Daftar semua key dengan metadata
router.get('/keys', (req, res) => {
    ensureMetadata();
    const keys = [];

    const { getGeminiKey } = require('../config/config');
    let geminiActiveIdx = 0;
    try {
        const gk = getGeminiKey();
        if (gk) geminiActiveIdx = gk.index;
    } catch (_) {}

    let groqActiveIdx = 0;
    try {
        const { getCurrentGroqIndex } = require('../services/ai/aiService');
        if (getCurrentGroqIndex) groqActiveIdx = getCurrentGroqIndex();
    } catch (_) {}

    const activeProvider = config.provider || 'gemini';

    Object.entries(PROVIDER_CONFIG_MAP).forEach(([provider, cfg]) => {
        if (cfg.single) {
            const keyVal = config[cfg.keyField];
            if (keyVal && keyVal.trim() && !keyVal.includes('YOUR_LOCAL') && !keyVal.includes('TOKEN')) {
                const mk = getMetaKey(provider, 0);
                const meta = config.key_metadata[mk] || {};
                const isCurrentlyActive = (provider === activeProvider);
                keys.push({
                    provider,
                    index: 0,
                    key: keyVal,
                    keyMasked: keyVal.length > 10 ? keyVal.slice(0, 6) + '…' + keyVal.slice(-4) : '••••••',
                    model: config[cfg.modelField] || '',
                    url: cfg.urlField ? config[cfg.urlField] : undefined,
                    label: meta.label || '',
                    addedAt: meta.addedAt || null,
                    usageCount: meta.usageCount || 0,
                    lastUsedAt: meta.lastUsedAt || null,
                    isPool: false,
                    isCurrentlyActive,
                });
            }
        } else {
            const arr = config[cfg.arrayField] || [];
            const activeIdxForProvider = provider === 'gemini' ? geminiActiveIdx : (provider === 'groq' ? groqActiveIdx : 0);
            arr.forEach((keyVal, idx) => {
                if (!keyVal || !keyVal.trim()) return;
                const mk = getMetaKey(provider, idx);
                const meta = config.key_metadata[mk] || {};
                const isCurrentlyActive = (provider === activeProvider && idx === activeIdxForProvider);
                keys.push({
                    provider,
                    index: idx,
                    key: keyVal,
                    keyMasked: keyVal.length > 10 ? keyVal.slice(0, 6) + '…' + keyVal.slice(-4) : '••••••',
                    model: provider === 'gemini' ? getGeminiModel() : (config[cfg.modelField] || ''),
                    label: meta.label || '',

                    addedAt: meta.addedAt || null,
                    usageCount: meta.usageCount || 0,
                    lastUsedAt: meta.lastUsedAt || null,
                    isPool: true,
                    poolTotal: arr.length,
                    isCurrentlyActive,
                });
            });
        }
    });

    res.json({
        activeProvider,
        geminiActiveIndex: geminiActiveIdx,
        groqActiveIndex: groqActiveIdx,
        keys
    });
});

// POST /api/keys — Tambah key baru
router.post('/keys', async (req, res) => {
    try {
        const { provider, key, model, url, label } = req.body;
        if (!provider || !key) return res.status(400).json({ error: 'Provider dan key wajib diisi' });

        const cfg = PROVIDER_CONFIG_MAP[provider];
        if (!cfg) return res.status(400).json({ error: 'Provider tidak dikenal' });

        ensureMetadata();
        let newIndex = 0;

        if (cfg.single) {
            config[cfg.keyField] = key.trim();
            if (model) config[cfg.modelField] = model.trim();
            if (url && cfg.urlField) config[cfg.urlField] = url.trim();
            newIndex = 0;
            // Reset metadata for single-key provider
            delete config.key_metadata[getMetaKey(provider, 0)];
        } else {
            if (!Array.isArray(config[cfg.arrayField])) config[cfg.arrayField] = [];
            // Cek duplikat
            const trimmed = key.trim();
            if (config[cfg.arrayField].includes(trimmed)) {
                return res.status(409).json({ error: 'API key ini sudah ada' });
            }
            config[cfg.arrayField].push(trimmed);
            newIndex = config[cfg.arrayField].length - 1;
            if (model) config[cfg.modelField] = model.trim();
        }

        // Set metadata
        config.key_metadata[getMetaKey(provider, newIndex)] = {
            label: (label || '').trim(),
            addedAt: new Date().toISOString(),
            usageCount: 0,
            lastUsedAt: null,
        };

        saveConfig(config);
        res.json({ success: true, index: newIndex, provider });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/keys/:provider/:index — Hapus key
router.delete('/keys/:provider/:index', (req, res) => {
    try {
        const { provider, index } = req.params;
        const idx = parseInt(index, 10);
        if (isNaN(idx)) return res.status(400).json({ error: 'Index tidak valid' });

        const cfg = PROVIDER_CONFIG_MAP[provider];
        if (!cfg) return res.status(400).json({ error: 'Provider tidak dikenal' });

        ensureMetadata();

        if (cfg.single) {
            config[cfg.keyField] = '';
            delete config.key_metadata[getMetaKey(provider, 0)];
        } else {
            const arr = config[cfg.arrayField] || [];
            if (idx < 0 || idx >= arr.length) return res.status(404).json({ error: 'Key tidak ditemukan' });

            // Remove the key
            arr.splice(idx, 1);
            config[cfg.arrayField] = arr;

            // Re-index metadata: shift down all indexes after deleted index
            const newMeta = {};
            Object.entries(config.key_metadata).forEach(([mk, v]) => {
                const parts = mk.split('_');
                const mProvider = parts.slice(0, -1).join('_');
                const mIdx = parseInt(parts[parts.length - 1], 10);
                if (mProvider === provider) {
                    if (mIdx < idx) newMeta[mk] = v;
                    else if (mIdx > idx) newMeta[getMetaKey(provider, mIdx - 1)] = v;
                    // mIdx === idx is deleted
                } else {
                    newMeta[mk] = v;
                }
            });
            config.key_metadata = newMeta;
        }

        saveConfig(config);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/keys/:provider/:index — Update label/nickname
router.patch('/keys/:provider/:index', (req, res) => {
    try {
        const { provider, index } = req.params;
        const { label } = req.body;
        const idx = parseInt(index, 10);
        if (isNaN(idx)) return res.status(400).json({ error: 'Index tidak valid' });

        ensureMetadata();
        const mk = getMetaKey(provider, idx);
        if (!config.key_metadata[mk]) config.key_metadata[mk] = { addedAt: new Date().toISOString(), usageCount: 0, lastUsedAt: null };
        config.key_metadata[mk].label = (label || '').trim();
        saveConfig(config);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/keys/increment-usage — Dipanggil oleh aiService untuk tracking
router.post('/keys/increment-usage', (req, res) => {
    try {
        const { provider, index } = req.body;
        if (!provider) return res.status(400).json({ error: 'Provider wajib' });
        ensureMetadata();
        const mk = getMetaKey(provider, index || 0);
        if (!config.key_metadata[mk]) config.key_metadata[mk] = { addedAt: null, usageCount: 0, lastUsedAt: null };
        config.key_metadata[mk].usageCount = (config.key_metadata[mk].usageCount || 0) + 1;
        config.key_metadata[mk].lastUsedAt = new Date().toISOString();
        saveConfig(config);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
