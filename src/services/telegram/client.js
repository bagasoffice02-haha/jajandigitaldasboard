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

    if (!config.telegram_bot_token || config.telegram_bot_enabled === false) {
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
        console.log('[Telegram] Memulai inisialisasi bot Telegram...');
        botInstance = new TelegramBot(config.telegram_bot_token, { polling: false });

        // 1. Bersihkan Webhook lama jika ada (mencegah Error 409 Conflict getUpdates)
        try {
            await botInstance.deleteWebHook();
            console.log('[Telegram] Webhook lama dibersihkan.');
        } catch (whErr) {
            console.warn('[Telegram] Warning deleteWebHook:', whErr.message);
        }

        // 2. Mulai Polling secara resmi
        await botInstance.startPolling({
            interval: 300,
            params: { timeout: 10 }
        });

        // 3. Tangani error polling
        botInstance.on('polling_error', async (err) => {
            const msg = err.message || '';
            console.error('[Telegram Polling Error]:', msg);

            if (msg.includes('ETELEGRAM: 401') || msg.includes('Unauthorized')) {
                console.error('[Telegram] Token bot tidak valid!');
                if (io) io.emit('telegram_status', { status: 'ERROR', message: 'Token tidak valid' });
            } else if (msg.includes('409') || msg.includes('Conflict')) {
                console.warn('[Telegram] Terdeteksi 409 Conflict, mencoba hapus webhook ulang...');
                try { await botInstance.deleteWebHook(); } catch (_) {}
            }
        });

        // 4. Daftarkan handler pesan
        const { registerMessageHandlers } = require('./messageHandler');
        registerMessageHandlers(botInstance, io);

        // 5. Daftarkan slash commands
        await registerCommands();

        // 6. Emit status sukses ke dasbor
        if (io) io.emit('telegram_status', { status: 'CONNECTED' });

        const me = await botInstance.getMe();
        console.log(`[Telegram] ✅ Bot Telegram BERHASIL AKTIF: @${me.username} (${me.first_name})`);

    } catch (err) {
        console.error('[Telegram] ❌ Gagal menginisialisasi bot:', err.message);
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
            if (botInstance.isPolling()) {
                await botInstance.stopPolling({ cancel: true });
            }
        } catch (_) {}
        botInstance = null;
        await new Promise(r => setTimeout(r, 500));
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


