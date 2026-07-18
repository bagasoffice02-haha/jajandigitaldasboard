// src/services/telegram/client.js
// Inisialisasi dan manajemen instance Bot Telegram
'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { config } = require('../../config/config');

let botInstance = null;
let telegramIo = null;

/**
 * Ambil instance bot yang sedang aktif
 */
function getTelegramBot() {
    return botInstance;
}

/**
 * Ambil status koneksi bot Telegram
 */
function getTelegramStatus() {
    if (!config.telegram_bot_enabled || !config.telegram_bot_token) return 'DISABLED';
    return botInstance ? 'CONNECTED' : 'DISCONNECTED';
}

/**
 * Kirim pesan dengan simulasi "sedang mengetik" (setara anti-ban WA)
 * @param {number|string} chatId - Telegram Chat ID
 * @param {string} text - Teks pesan
 * @param {Object} options - Opsi tambahan (parse_mode, reply_markup, dll)
 */
async function sendWithTyping(chatId, text, options = {}) {
    if (!botInstance) return;
    try {
        await botInstance.sendChatAction(chatId, 'typing');
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
        return await botInstance.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
    } catch (err) {
        // Fallback jika HTML parse error: kirim sebagai teks biasa agar pesan tetap terkirim
        console.warn('[Telegram] Warning: Gagal kirim mode HTML, fallback ke plain text:', err.message);
        const plainText = text.replace(/<[^>]*>/g, '');
        const cleanOpts = { ...options };
        delete cleanOpts.parse_mode;
        return await botInstance.sendMessage(chatId, plainText, cleanOpts).catch(e => console.error('[Telegram] Error kirim fallback:', e.message));
    }
}

/**
 * Kirim foto dengan simulasi "sedang mengunggah foto"
 * @param {number|string} chatId - Telegram Chat ID
 * @param {string|Buffer} photo - Path file atau Buffer
 * @param {Object} options - Opsi tambahan
 */
async function sendPhotoWithAction(chatId, photo, options = {}) {
    if (!botInstance) return;
    try {
        await botInstance.sendChatAction(chatId, 'upload_photo');
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 1000));
    return botInstance.sendPhoto(chatId, photo, { ...options }).catch(e => console.error('[Telegram] Error kirim foto:', e.message));
}

/**
 * Daftarkan semua slash commands ke BotFather secara otomatis
 */
async function registerCommands() {
    if (!botInstance) return;
    try {
        await botInstance.setMyCommands([
            { command: 'start',   description: 'Mulai & perkenalan bot' },
            { command: 'menu',    description: 'Tampilkan menu produk' },
            { command: 'promo',   description: 'Lihat daftar promo aktif' },
            { command: 'qris',    description: 'Info QRIS & cara pembayaran' },
            { command: 'status',  description: 'Cek status bot & layanan' },
            { command: 'reset',   description: 'Reset sesi percakapan AI' },
            { command: 'help',    description: 'Tampilkan daftar perintah' },
            { command: 'boton',   description: '[Admin] Aktifkan bot di grup ini' },
            { command: 'botoff',  description: '[Admin] Nonaktifkan bot di grup ini' },
            { command: 'infogrup',description: '[Admin] Info konfigurasi bot di grup ini' },
        ]);
        console.log('[Telegram] Slash commands terdaftar di BotFather.');
    } catch (err) {
        console.error('[Telegram] Gagal mendaftarkan commands:', err.message);
    }
}

/**
 * Inisialisasi bot Telegram
 * @param {Object} io - Socket.io instance (untuk emit log ke dasbor)
 */
async function initTelegramBot(io) {
    telegramIo = io;

    if (!config.telegram_bot_token || !config.telegram_bot_enabled) {
        console.log('[Telegram] Bot Telegram dinonaktifkan atau token belum diatur.');
        if (io) io.emit('telegram_status', { status: 'DISABLED' });
        return;
    }

    if (botInstance) {
        console.log('[Telegram] Bot sudah berjalan.');
        if (io) io.emit('telegram_status', { status: 'CONNECTED' });
        return;
    }

    try {
        botInstance = new TelegramBot(config.telegram_bot_token, {
            polling: {
                interval: 300,
                autoStart: true,
                params: { timeout: 10 }
            }
        });

        // Tangani error polling agar tidak crash server
        botInstance.on('polling_error', (err) => {
            const msg = err.message || '';
            if (msg.includes('ETELEGRAM: 401')) {
                console.error('[Telegram] Token bot tidak valid! Periksa konfigurasi token.');
                if (io) io.emit('telegram_status', { status: 'ERROR', message: 'Token tidak valid' });
            } else if (!msg.includes('EFATAL')) {
                console.warn('[Telegram] Polling error (minor):', msg);
            }
        });

        // Daftarkan handler pesan dari messageHandler.js
        const { registerMessageHandlers } = require('./messageHandler');
        registerMessageHandlers(botInstance, io);

        // Daftarkan slash commands
        await registerCommands();

        // Emit status ke dasbor
        if (io) io.emit('telegram_status', { status: 'CONNECTED' });

        const me = await botInstance.getMe();
        console.log(`[Telegram] ✅ Bot Telegram aktif: @${me.username} (${me.first_name})`);

    } catch (err) {
        console.error('[Telegram] Gagal menginisialisasi bot:', err.message);
        botInstance = null;
        if (io) io.emit('telegram_status', { status: 'ERROR', message: err.message });
    }
}

/**
 * Hentikan bot Telegram dengan bersih
 */
async function stopTelegramBot() {
    if (botInstance) {
        try {
            await botInstance.stopPolling();
        } catch (_) {}
        botInstance = null;
        console.log('[Telegram] Bot Telegram dihentikan.');
        if (telegramIo) telegramIo.emit('telegram_status', { status: 'DISCONNECTED' });
    }
}

/**
 * Restart bot Telegram (hentikan lalu inisialisasi ulang dengan token/config baru)
 */
async function restartTelegramBot(io) {
    await stopTelegramBot();
    await initTelegramBot(io);
}

module.exports = {
    getTelegramBot,
    getTelegramStatus,
    initTelegramBot,
    stopTelegramBot,
    restartTelegramBot,
    sendWithTyping,
    sendPhotoWithAction
};

