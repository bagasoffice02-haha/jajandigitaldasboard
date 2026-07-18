// src/services/telegram/scheduler.js
// Scheduler khusus Telegram: jadwal buka/tutup grup & pesan terjadwal
// Berjalan paralel dengan scheduler WA tanpa konflik
'use strict';

const { getDb } = require('../../db/sqlite');
const { getTelegramBot } = require('./client');
const { sendWithTyping } = require('./client');
const { config } = require('../../config/config');

const INTERVAL_MS = 60 * 1000; // Cek setiap 60 detik (sama dengan WA scheduler)
let schedulerInterval = null;

/**
 * Ambil waktu WIB saat ini
 */
function getWibNow() {
    const now = new Date();
    const wibOffset = 7 * 60 * 60 * 1000;
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    return new Date(utcMs + wibOffset);
}

/**
 * Cek apakah hari ini termasuk dalam daftar hari aktif
 */
function isDayActive(activeDays, nowWib) {
    if (!activeDays || activeDays.length === 0) return true;
    const todayDay = nowWib.getDay(); // 0=Minggu, 1=Senin, ..., 6=Sabtu
    return activeDays.includes(todayDay) || activeDays.includes(todayDay === 0 ? 7 : todayDay);
}

/**
 * Jalankan jadwal buka/tutup & pesan terjadwal untuk semua grup Telegram
 */
async function runTelegramScheduler() {
    const bot = getTelegramBot();
    if (!bot) return;

    const db = getDb();
    if (!db) return;

    try {
        const rows = await db.all("SELECT * FROM group_configs WHERE group_id LIKE 'tg_grp_%'");
        if (!rows || rows.length === 0) return;

        const nowWib = getWibNow();
        const currentHHMM = `${String(nowWib.getHours()).padStart(2, '0')}:${String(nowWib.getMinutes()).padStart(2, '0')}`;
        const currentDay = nowWib.getDay();

        for (const row of rows) {
            let cfg = {};
            try { cfg = JSON.parse(row.settings || '{}'); } catch (_) {}

            const telegramChatId = row.group_id.replace('tg_grp_', '');
            if (!telegramChatId) continue;

            // ── 1. Jadwal Buka/Tutup Grup ──────────────────────────────────────
            const schedule = cfg.autoCloseSchedule;
            if (schedule && schedule.enabled) {
                const dayActive = isDayActive(schedule.activeDays, nowWib);

                if (dayActive) {
                    const isCloseTime = currentHHMM === schedule.closeTime;
                    const isOpenTime  = currentHHMM === schedule.openTime;

                    if (isCloseTime) {
                        try {
                            // Kirim notifikasi penutupan
                            const closeMsg = cfg.autoCloseMessage ||
                                `🌙 *Toko Tutup*\n\nMaaf, toko sudah tutup untuk hari ini.\nKami akan kembali buka pukul *${schedule.openTime} WIB*.\n\nTerima kasih! 🙏`;
                            const sentMsg = await sendWithTyping(telegramChatId, closeMsg);

                            // Restrict semua anggota (hanya admin yang bisa kirim)
                            await bot.setChatPermissions(telegramChatId, {
                                can_send_messages: false,
                                can_send_polls: false,
                                can_send_other_messages: false,
                                can_add_web_page_previews: false,
                            });

                            // Auto-delete notifikasi jika dikonfigurasi
                            const autoDeleteSecs = config.telegram_auto_delete_schedule_seconds || 0;
                            if (autoDeleteSecs > 0 && sentMsg) {
                                setTimeout(() => {
                                    bot.deleteMessage(telegramChatId, sentMsg.message_id).catch(() => {});
                                }, autoDeleteSecs * 1000);
                            }

                            console.log(`[TG Scheduler] Grup ${telegramChatId} ditutup pukul ${currentHHMM}`);
                        } catch (err) {
                            console.warn(`[TG Scheduler] Gagal menutup grup ${telegramChatId}:`, err.message);
                        }
                    }

                    if (isOpenTime) {
                        try {
                            // Buka kembali izin grup
                            await bot.setChatPermissions(telegramChatId, {
                                can_send_messages: true,
                                can_send_polls: true,
                                can_send_other_messages: true,
                                can_add_web_page_previews: true,
                            });

                            const openMsg = cfg.autoOpenMessage ||
                                `☀️ *Toko Buka!*\n\nSelamat pagi! Toko sudah buka kembali.\nKami siap melayani Anda mulai pukul *${schedule.openTime}* s.d. *${schedule.closeTime} WIB*.\n\nSelamat berbelanja! 🛒`;
                            const sentMsg = await sendWithTyping(telegramChatId, openMsg);

                            const autoDeleteSecs = config.telegram_auto_delete_schedule_seconds || 0;
                            if (autoDeleteSecs > 0 && sentMsg) {
                                setTimeout(() => {
                                    bot.deleteMessage(telegramChatId, sentMsg.message_id).catch(() => {});
                                }, autoDeleteSecs * 1000);
                            }

                            console.log(`[TG Scheduler] Grup ${telegramChatId} dibuka pukul ${currentHHMM}`);
                        } catch (err) {
                            console.warn(`[TG Scheduler] Gagal membuka grup ${telegramChatId}:`, err.message);
                        }
                    }
                }
            }

            // ── 2. Pesan Terjadwal Otomatis ────────────────────────────────────
            const scheduledMessages = cfg.scheduledMessages;
            if (scheduledMessages && Array.isArray(scheduledMessages)) {
                for (const sched of scheduledMessages) {
                    if (!sched.enabled || !sched.time || !sched.message) continue;

                    const dayActive = isDayActive(sched.activeDays, nowWib);
                    if (!dayActive) continue;

                    if (currentHHMM !== sched.time) continue;

                    // Hindari pengiriman ganda dalam menit yang sama
                    const sentKey = `tg_sched_sent_${row.group_id}_${sched.id || sched.time}_${nowWib.toDateString()}`;
                    const alreadySent = await db.get("SELECT value FROM key_value_store WHERE key = ?", sentKey);
                    if (alreadySent) continue;

                    try {
                        const sentMsg = await sendWithTyping(telegramChatId, sched.message);

                        // Auto-pin jika dikonfigurasi
                        if (cfg.telegram_pin_scheduled_message && sentMsg) {
                            await bot.pinChatMessage(telegramChatId, sentMsg.message_id, {
                                disable_notification: true
                            }).catch(() => {});
                        }

                        // Tandai sudah dikirim
                        await db.run("INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)",
                            sentKey, '1'
                        );

                        console.log(`[TG Scheduler] Pesan terjadwal terkirim ke ${telegramChatId} pukul ${currentHHMM}`);
                    } catch (err) {
                        console.warn(`[TG Scheduler] Gagal kirim pesan terjadwal ke ${telegramChatId}:`, err.message);
                    }
                }
            }
        }
    } catch (err) {
        console.error('[TG Scheduler] Error:', err.message);
    }
}

/**
 * Mulai scheduler Telegram (dipanggil dari index.js bersamaan dengan WA scheduler)
 */
function startTelegramScheduler() {
    if (schedulerInterval) return;
    schedulerInterval = setInterval(runTelegramScheduler, INTERVAL_MS);
    console.log('[TG Scheduler] Scheduler Telegram aktif (interval 60 detik).');
}

/**
 * Hentikan scheduler Telegram
 */
function stopTelegramScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[TG Scheduler] Scheduler Telegram dihentikan.');
    }
}

module.exports = { startTelegramScheduler, stopTelegramScheduler };
