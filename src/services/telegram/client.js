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
    return botInstance.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
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
    return botInstance.sendPhoto(chatId, photo, { ...options });
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
        return;
    }

    if (botInstance) {
        console.log('[Telegram] Bot sudah berjalan, skip inisialisasi ulang.');
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
        console.log(`[Telegram] Bot aktif: @${me.username} (${me.first_name})`);

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

module.exports = {
    getTelegramBot,
    getTelegramStatus,
    initTelegramBot,
    stopTelegramBot,
    sendWithTyping,
    sendPhotoWithAction
};
