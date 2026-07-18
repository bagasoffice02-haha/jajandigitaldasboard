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

module.exports = router;

