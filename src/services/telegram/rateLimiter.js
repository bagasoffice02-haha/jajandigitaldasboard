// src/services/telegram/rateLimiter.js
// Anti-flood & Rate Limiter per pengguna Telegram
'use strict';

// Map: userId → { count, resetTime, lastAiTime }
const userLimits = new Map();

/**
 * Cek apakah pengguna masih dalam batas rate limit
 * @param {string|number} userId - Telegram User ID
 * @param {number} maxPerMinute - Maksimum pesan per menit (default: 5)
 * @param {number} aiCooldownSeconds - Jeda minimum antar permintaan AI (default: 10)
 * @returns {{ allowed: boolean, isAiCooldown: boolean, remainingSeconds: number }}
 */
function checkRateLimit(userId, maxPerMinute = 5, aiCooldownSeconds = 10) {
    const now = Date.now();
    const key = String(userId);

    if (!userLimits.has(key)) {
        userLimits.set(key, { count: 0, resetTime: now + 60000, lastAiTime: 0 });
    }

    const limit = userLimits.get(key);

    // Reset counter jika sudah 1 menit
    if (now > limit.resetTime) {
        limit.count = 0;
        limit.resetTime = now + 60000;
    }

    // Cek AI cooldown
    const timeSinceLastAi = (now - limit.lastAiTime) / 1000;
    if (timeSinceLastAi < aiCooldownSeconds && limit.lastAiTime > 0) {
        return {
            allowed: false,
            isAiCooldown: true,
            remainingSeconds: Math.ceil(aiCooldownSeconds - timeSinceLastAi)
        };
    }

    // Cek batas pesan per menit
    if (limit.count >= maxPerMinute) {
        const remainingMs = limit.resetTime - now;
        return {
            allowed: false,
            isAiCooldown: false,
            remainingSeconds: Math.ceil(remainingMs / 1000)
        };
    }

    limit.count++;
    return { allowed: true, isAiCooldown: false, remainingSeconds: 0 };
}

/**
 * Catat waktu penggunaan AI terakhir oleh pengguna (dipanggil setelah AI digunakan)
 * @param {string|number} userId - Telegram User ID
 */
function recordAiUsage(userId) {
    const key = String(userId);
    if (!userLimits.has(key)) {
        userLimits.set(key, { count: 0, resetTime: Date.now() + 60000, lastAiTime: 0 });
    }
    userLimits.get(key).lastAiTime = Date.now();
}

/**
 * Bersihkan data limit pengguna yang sudah tidak aktif (>5 menit)
 * Dipanggil periodik untuk mencegah memory leak
 */
function cleanupStaleEntries() {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 menit
    for (const [key, data] of userLimits.entries()) {
        if (now - data.resetTime > staleThreshold) {
            userLimits.delete(key);
        }
    }
}

// Auto-cleanup setiap 5 menit
setInterval(cleanupStaleEntries, 5 * 60 * 1000);

module.exports = { checkRateLimit, recordAiUsage };
