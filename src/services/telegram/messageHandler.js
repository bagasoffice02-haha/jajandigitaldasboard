// src/services/telegram/messageHandler.js
// Orkestrator pesan Telegram — setara penuh dengan WA messageHandler
// Menangani: chat personal, grup, welcome/goodbye, slash commands, admin commands
'use strict';

const fs = require('fs');
const path = require('path');
const { config } = require('../../config/config');
const { getGroupConfigs, saveGroupConfig, getChatSession, saveChatSession, addCustomer } = require('../../db/models');
const { generateUnifiedAiResponse, generateGroupAiResponse } = require('../ai/aiService');
const { checkRateLimit, recordAiUsage } = require('./rateLimiter');
const { sendWithTyping, sendPhotoWithAction } = require('./client');
const {
    waToTelegramHtml,
    buildMenuInlineKeyboard,
    renderTelegramMenu
} = require('./formatter');
const {
    findNodeById,
    findNodeByName,
    getAllPromoNodes,
    getStatusEmoji,
    getGroupKnowledgeContext
} = require('../../handlers/helpers');

// Session menu navigasi per user (Map: sessionKey → state)
const telegramMenuStates = new Map();

// Session cleanup: hapus state yang sudah tidak aktif > 10 menit
setInterval(() => {
    const now = Date.now();
    for (const [key, state] of telegramMenuStates.entries()) {
        if (now - state.lastActive > 10 * 60 * 1000) {
            telegramMenuStates.delete(key);
        }
    }
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Buat kunci session DB untuk Telegram (terpisah dari WA)
// ─────────────────────────────────────────────────────────────────────────────
function getTgSessionKey(userId, chatId) {
    const isGroup = String(chatId).startsWith('-');
    return isGroup ? `tg_grp_${chatId}_${userId}` : `tg_${userId}`;
}

function getTgGroupConfigKey(chatId) {
    return `tg_grp_${chatId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Cek apakah pengguna adalah admin grup Telegram
// ─────────────────────────────────────────────────────────────────────────────
async function isUserGroupAdmin(bot, chatId, userId) {
    try {
        const member = await bot.getChatMember(chatId, userId);
        return ['administrator', 'creator'].includes(member.status);
    } catch (_) {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Cek apakah pengguna ada di whitelist/blacklist
// ─────────────────────────────────────────────────────────────────────────────
function checkAccessControl(userId) {
    const telegramConfig = config.telegram_config || {};
    const whitelist = telegramConfig.whitelist || [];
    const blacklist = telegramConfig.blacklist || [];
    const whitelistMode = telegramConfig.whitelist_mode || false;

    const userIdStr = String(userId);

    // Blacklist diperiksa terlebih dahulu
    if (blacklist.length > 0 && blacklist.includes(userIdStr)) {
        return { allowed: false, reason: 'blacklisted' };
    }

    // Whitelist mode: hanya user terdaftar yang diizinkan
    if (whitelistMode && whitelist.length > 0 && !whitelist.includes(userIdStr)) {
        return { allowed: false, reason: 'not_whitelisted' };
    }

    return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Daftarkan grup baru ke database jika belum ada
// ─────────────────────────────────────────────────────────────────────────────
async function ensureGroupRegistered(chatId, chatTitle) {
    const groupConfigKey = getTgGroupConfigKey(chatId);
    const { group_configs } = await getGroupConfigs();

    if (!group_configs[groupConfigKey]) {
        await saveGroupConfig(groupConfigKey, {
            groupId: groupConfigKey,
            groupName: chatTitle || `Grup Telegram ${chatId}`,
            enabled: true,
            welcomeMessage: '',
            custom_rules: [],
            menuTree: { id: 'root', name: 'Menu Utama', type: 'category', children: [] },
            autoCloseSchedule: { enabled: false },
            scheduledMessages: [],
            telegram_response_mode: 'always',
            telegram_reply_mode: 'public',
            telegram_pin_scheduled_message: false,
            useAiFallback: true
        });
        console.log(`[TG Handler] Grup Telegram baru terdaftar: ${chatTitle} (${groupConfigKey})`);
    }

    return group_configs[groupConfigKey];
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: Slash Commands (/start, /menu, /promo, /qris, /status, /reset, /help)
// ─────────────────────────────────────────────────────────────────────────────
async function handleSlashCommand(bot, msg, io) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const command = (msg.text || '').split(' ')[0].split('@')[0].toLowerCase();
    const isGroup = msg.chat.type !== 'private';
    const sessionKey = getTgSessionKey(userId, chatId);
    const groupConfigKey = isGroup ? getTgGroupConfigKey(chatId) : null;

    const { group_configs } = await getGroupConfigs();

    // Tentukan konfigurasi grup yang dipakai (sama dengan logika WA)
    let activeCfg = null;
    let configGroupId = config.private_chat_sync_group_id;
    if (isGroup) {
        activeCfg = group_configs[groupConfigKey];
        configGroupId = groupConfigKey;
    } else {
        if (!configGroupId) {
            configGroupId = Object.keys(group_configs || {}).find(id => {
                const mTree = group_configs[id] ? group_configs[id].menuTree : null;
                return mTree && mTree.children && mTree.children.length > 0;
            }) || Object.keys(group_configs || {})[0];
        }
        activeCfg = configGroupId ? group_configs[configGroupId] : null;
    }
    if (!activeCfg && !isGroup) {
        activeCfg = {
            groupName: "Jajan Digital",
            enabled: true,
            useAiFallback: true,
            menuTree: { id: "root", name: "Menu Utama", type: "category", children: [] }
        };
    }

    switch (command) {
        case '/start': {
            const shopName = activeCfg ? activeCfg.groupName : 'Toko Kami';
            const startMsg = `👋 <b>Halo! Selamat datang di ${shopName}</b>\n\n` +
                `Saya adalah asisten virtual yang siap membantu Anda.\n\n` +
                `📋 <b>Perintah yang tersedia:</b>\n` +
                `/menu — Lihat daftar produk\n` +
                `/promo — Promo aktif hari ini\n` +
                `/qris — Cara pembayaran QRIS\n` +
                `/reset — Reset sesi percakapan\n` +
                `/help — Bantuan lengkap\n\n` +
                `_Atau ketik pertanyaan Anda langsung, saya akan bantu!_ 🤖`;
            await sendWithTyping(chatId, startMsg);
            break;
        }

        case '/help': {
            const helpMsg = `📖 <b>Panduan Bot</b>\n\n` +
                `/start — Mulai & salam perkenalan\n` +
                `/menu — Tampilkan menu produk\n` +
                `/promo — Daftar promo aktif\n` +
                `/qris — Info QRIS & cara bayar\n` +
                `/status — Status bot & layanan\n` +
                `/reset — Hapus riwayat percakapan AI\n` +
                `/help — Tampilkan bantuan ini\n\n` +
                `<b>Perintah Admin Grup:</b>\n` +
                `/boton — Aktifkan bot di grup\n` +
                `/botoff — Nonaktifkan bot di grup\n` +
                `/infogrup — Info konfigurasi bot\n` +
                `/setwelcome [pesan] — Atur pesan sambutan`;
            await sendWithTyping(chatId, helpMsg);
            break;
        }

        case '/menu': {
            telegramMenuStates.set(sessionKey, {
                currentNodeId: 'root',
                parentIds: [],
                lastActive: Date.now()
            });
            const menuNode = (activeCfg && activeCfg.menuTree) || { id: 'root', name: 'Menu Utama', type: 'category', children: [] };
            const menuText = renderTelegramMenu(menuNode, activeCfg || {});
            const keyboard = buildMenuInlineKeyboard(menuNode, activeCfg || {});
            await sendWithTyping(chatId, menuText, { reply_markup: keyboard || undefined });
            break;
        }

        case '/promo': {
            const menuTree = activeCfg ? activeCfg.menuTree : null;
            const promoNodes = menuTree ? getAllPromoNodes(menuTree) : [];
            if (promoNodes.length === 0) {
                await sendWithTyping(chatId, '🔍 <b>Tidak ada promo aktif saat ini.</b>\n\n<i>Pantau terus! Promo spesial akan segera hadir.</i> 🔔');
            } else {
                let promoText = `🔥 <b>PROMO SPESIAL</b> 🔥\n${'─'.repeat(28)}\n\n`;
                promoNodes.forEach(({ node }, idx) => {
                    const statusIcon = node.status === 'Tersedia' ? '✅' : node.status === 'Habis' ? '❌' : '⏳';
                    promoText += `${idx + 1}. 🔥 <b>${node.name}</b> ${statusIcon}\n`;
                });
                promoText += `\n${'─'.repeat(28)}\n<i>Ketik nama produk untuk detail & harga promo!</i>`;
                await sendWithTyping(chatId, promoText);
            }
            break;
        }

        case '/qris': {
            const pType = activeCfg ? (activeCfg.paymentType || 'qris') : 'qris';
            const pText = waToTelegramHtml(activeCfg ? (activeCfg.paymentText || '💵 <b>QRIS PEMBAYARAN RESMI</b>\n\nSilakan scan QRIS untuk melakukan pembayaran.\n\n<b>⚠️ Penting:</b> Setelah membayar, kirimkan bukti transfer ke grup.') : '💵 Info pembayaran belum dikonfigurasi.');
            const pMedia = (activeCfg && activeCfg.paymentMedia && activeCfg.paymentMedia.trim()) ? activeCfg.paymentMedia.trim() : 'Qris.jpeg';

            if (pType === 'qris' && pMedia) {
                const mediaPath = path.join(__dirname, '../../../media', pMedia);
                if (fs.existsSync(mediaPath)) {
                    await sendPhotoWithAction(chatId, fs.createReadStream(mediaPath), {
                        caption: pText,
                        parse_mode: 'HTML'
                    });
                    break;
                }
            }
            await sendWithTyping(chatId, pText);
            break;
        }

        case '/status': {
            const tgStatus = config.telegram_bot_enabled ? '✅ Aktif' : '❌ Nonaktif';
            await sendWithTyping(chatId,
                `📊 <b>Status Bot</b>\n\n` +
                `🤖 Bot Telegram: ${tgStatus}\n` +
                `🕐 Waktu Server: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`
            );
            break;
        }

        case '/reset': {
            await saveChatSession(getTgSessionKey(userId, chatId), []);
            telegramMenuStates.delete(sessionKey);
            await sendWithTyping(chatId, '✅ <b>Sesi percakapan berhasil direset.</b>\n\n<i>Kita mulai dari awal ya! Ada yang bisa saya bantu?</i>');
            break;
        }

        // ── Admin Commands ─────────────────────────────────────────────────────
        case '/boton':
        case '/botoff': {
            if (!isGroup) { await sendWithTyping(chatId, '⚠️ Perintah ini hanya berlaku di dalam grup.'); break; }
            const adminCheck = await isUserGroupAdmin(bot, chatId, userId);
            if (!adminCheck) { await sendWithTyping(chatId, '⛔ Hanya admin grup yang dapat menjalankan perintah ini.'); break; }
            const isEnable = command === '/boton';
            const grpCfg = group_configs[groupConfigKey] || {};
            grpCfg.enabled = isEnable;
            await saveGroupConfig(groupConfigKey, grpCfg);
            await sendWithTyping(chatId, isEnable ? '✅ <b>Bot diaktifkan di grup ini.</b>' : '🔇 <b>Bot dinonaktifkan di grup ini.</b>');
            break;
        }

        case '/infogrup': {
            if (!isGroup) { await sendWithTyping(chatId, '⚠️ Perintah ini hanya berlaku di dalam grup.'); break; }
            const grpCfg = group_configs[groupConfigKey] || {};
            const responseMode = grpCfg.telegram_response_mode || 'always';
            const replyMode = grpCfg.telegram_reply_mode || 'public';
            const schedCfg = grpCfg.autoCloseSchedule || { enabled: false };
            await sendWithTyping(chatId,
                `⚙️ <b>Info Konfigurasi Bot di Grup Ini</b>\n\n` +
                `📛 Nama Grup: <b>${grpCfg.groupName || '-'}</b>\n` +
                `🤖 Status Bot: <b>${grpCfg.enabled !== false ? '✅ Aktif' : '❌ Nonaktif'}</b>\n` +
                `💬 Mode Respons: <b>${responseMode}</b>\n` +
                `📨 Mode Balas: <b>${replyMode}</b>\n` +
                `🧠 AI Fallback: <b>${grpCfg.useAiFallback ? '✅ Aktif' : '❌ Nonaktif'}</b>\n` +
                `👋 Pesan Sambutan: <b>${grpCfg.welcomeMessage ? '✅ Ada' : '❌ Belum diatur'}</b>\n` +
                `👋 Pesan Perpisahan: <b>${grpCfg.goodbyeMessage ? '✅ Ada' : '❌ Belum diatur'}</b>\n` +
                `🕐 Jadwal: <b>${schedCfg.enabled ? `${schedCfg.openTime} - ${schedCfg.closeTime}` : 'Tidak Aktif'}</b>`
            );
            break;
        }

        case '/setwelcome': {
            if (!isGroup) { await sendWithTyping(chatId, '⚠️ Perintah ini hanya berlaku di dalam grup.'); break; }
            const adminCheck = await isUserGroupAdmin(bot, chatId, userId);
            if (!adminCheck) { await sendWithTyping(chatId, '⛔ Hanya admin grup yang dapat menjalankan perintah ini.'); break; }
            const newWelcome = (msg.text || '').replace('/setwelcome', '').replace('@' + (await bot.getMe().catch(() => ({username: ''})).then(m => m.username || '')), '').trim();
            if (!newWelcome) {
                await sendWithTyping(chatId,
                    '⚠️ Format: <code>/setwelcome [pesan sambutan]</code>\n\n' +
                    'Variabel yang tersedia:\n' +
                    '<code>{nama}</code> — Nama anggota baru\n' +
                    '<code>{username}</code> — Username (@handle)\n' +
                    '<code>{grup}</code> — Nama grup'
                );
                break;
            }
            const grpCfg = group_configs[groupConfigKey] || {};
            grpCfg.welcomeMessage = newWelcome;
            await saveGroupConfig(groupConfigKey, grpCfg);
            await sendWithTyping(chatId, `✅ <b>Pesan sambutan berhasil diperbarui!</b>\n\nPreview:\n${newWelcome}`);
            break;
        }

        case '/setgoodbye': {
            if (!isGroup) { await sendWithTyping(chatId, '⚠️ Perintah ini hanya berlaku di dalam grup.'); break; }
            const adminCheck = await isUserGroupAdmin(bot, chatId, userId);
            if (!adminCheck) { await sendWithTyping(chatId, '⛔ Hanya admin grup yang dapat menjalankan perintah ini.'); break; }
            const newGoodbye = (msg.text || '').replace('/setgoodbye', '').replace('@' + (await bot.getMe().catch(() => ({username: ''})).then(m => m.username || '')), '').trim();
            if (!newGoodbye) {
                await sendWithTyping(chatId,
                    '⚠️ Format: <code>/setgoodbye [pesan perpisahan]</code>\n\n' +
                    'Variabel yang tersedia:\n' +
                    '<code>{nama}</code> — Nama anggota keluar\n' +
                    '<code>{username}</code> — Username (@handle)\n' +
                    '<code>{grup}</code> — Nama grup'
                );
                break;
            }
            const grpCfg = group_configs[groupConfigKey] || {};
            grpCfg.goodbyeMessage = newGoodbye;
            await saveGroupConfig(groupConfigKey, grpCfg);
            await sendWithTyping(chatId, `✅ <b>Pesan perpisahan berhasil diperbarui!</b>\n\nPreview:\n${newGoodbye}`);
            break;
        }

        case '/kick': {
            if (!isGroup) { await sendWithTyping(chatId, '⚠️ Perintah ini hanya berlaku di dalam grup.'); break; }
            const adminCheck = await isUserGroupAdmin(bot, chatId, userId);
            if (!adminCheck) { await sendWithTyping(chatId, '⛔ Hanya admin grup yang dapat menggunakan /kick.'); break; }

            // Harus reply ke pesan member yang ingin di-kick
            const replyMsg = msg.reply_to_message;
            if (!replyMsg || !replyMsg.from) {
                await sendWithTyping(chatId,
                    '⚠️ Cara pakai: <b>Reply</b> ke pesan anggota yang ingin dikeluarkan, lalu ketik <code>/kick</code>\n\n' +
                    'Contoh: Reply pesan seseorang → /kick'
                );
                break;
            }

            const targetUser = replyMsg.from;
            if (targetUser.is_bot) { await sendWithTyping(chatId, '⚠️ Tidak dapat mengeluarkan bot.'); break; }
            if (targetUser.id === userId) { await sendWithTyping(chatId, '⚠️ Kamu tidak bisa mengeluarkan dirimu sendiri.'); break; }

            // Cek apakah target juga admin
            const targetIsAdmin = await isUserGroupAdmin(bot, chatId, targetUser.id);
            if (targetIsAdmin) { await sendWithTyping(chatId, '⛔ Tidak dapat mengeluarkan admin grup.'); break; }

            try {
                // banChatMember → unbanChatMember (kick tanpa blacklist permanen)
                await bot.banChatMember(chatId, targetUser.id);
                await bot.unbanChatMember(chatId, targetUser.id);
                const targetName = targetUser.first_name || targetUser.username || String(targetUser.id);
                await sendWithTyping(chatId, `✅ <b>${targetName}</b> telah dikeluarkan dari grup.`);
            } catch (kickErr) {
                console.error('[TG Kick] Gagal kick:', kickErr.message);
                await sendWithTyping(chatId, `❌ Gagal mengeluarkan anggota: ${kickErr.message}\n\n<i>Pastikan bot sudah menjadi admin grup dengan hak "Hapus Anggota".</i>`);
            }
            break;
        }

        case '/ban': {
            if (!isGroup) { await sendWithTyping(chatId, '⚠️ Perintah ini hanya berlaku di dalam grup.'); break; }
            const adminCheck = await isUserGroupAdmin(bot, chatId, userId);
            if (!adminCheck) { await sendWithTyping(chatId, '⛔ Hanya admin grup yang dapat menggunakan /ban.'); break; }

            const replyMsg = msg.reply_to_message;
            if (!replyMsg || !replyMsg.from) {
                await sendWithTyping(chatId, '⚠️ Cara pakai: <b>Reply</b> ke pesan anggota yang ingin di-ban, lalu ketik <code>/ban</code>');
                break;
            }

            const targetUser = replyMsg.from;
            if (targetUser.is_bot) { await sendWithTyping(chatId, '⚠️ Tidak dapat mem-ban bot.'); break; }
            const targetIsAdmin = await isUserGroupAdmin(bot, chatId, targetUser.id);
            if (targetIsAdmin) { await sendWithTyping(chatId, '⛔ Tidak dapat mem-ban admin grup.'); break; }

            try {
                await bot.banChatMember(chatId, targetUser.id);
                const targetName = targetUser.first_name || targetUser.username || String(targetUser.id);
                await sendWithTyping(chatId, `🚫 <b>${targetName}</b> telah di-ban dari grup secara permanen.`);
            } catch (banErr) {
                await sendWithTyping(chatId, `❌ Gagal mem-ban anggota: ${banErr.message}`);
            }
            break;
        }

        default:
            break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: Pesan Teks Biasa (Personal & Grup)
// ─────────────────────────────────────────────────────────────────────────────
async function handleTextMessage(bot, msg, io) {
    const chatId = msg.chat.id;
    const userId = msg.from ? msg.from.id : null;
    if (!userId) return;

    const isGroup = msg.chat.type !== 'private';
    const userMessage = msg.text || '';
    const textLower = userMessage.toLowerCase().trim();
    const sessionKey = getTgSessionKey(userId, chatId);
    const groupConfigKey = isGroup ? getTgGroupConfigKey(chatId) : null;
    const telegramCfg = config.telegram_config || {};

    // 1. Abaikan pesan kosong atau terlalu pendek
    if (!userMessage || userMessage.length === 0) return;

    // 2. Access Control (whitelist/blacklist)
    const accessCheck = checkAccessControl(userId);
    if (!accessCheck.allowed) return;

    // 3. Rate Limiting
    const maxPerMin = telegramCfg.rate_limit_per_minute || 5;
    const aiCooldown = telegramCfg.ai_cooldown_seconds || 10;
    const rateCheck = checkRateLimit(userId, maxPerMin, aiCooldown);
    if (!rateCheck.allowed) {
        if (rateCheck.isAiCooldown) {
            await bot.sendMessage(chatId, `⏳ Tunggu ${rateCheck.remainingSeconds} detik sebelum mengirim pertanyaan lagi ya.`, {
                reply_to_message_id: msg.message_id
            });
        } else {
            await bot.sendMessage(chatId, `🚫 Terlalu banyak pesan. Tunggu ${rateCheck.remainingSeconds} detik.`, {
                reply_to_message_id: msg.message_id
            });
        }
        return;
    }

    // 4. Load konfigurasi grup
    const { group_configs } = await getGroupConfigs();
    let activeCfg = null;
    let configGroupId = config.private_chat_sync_group_id;

    if (isGroup) {
        activeCfg = await ensureGroupRegistered(chatId, msg.chat.title);
        activeCfg = group_configs[groupConfigKey] || activeCfg;
        configGroupId = groupConfigKey;

        // Cek apakah bot diaktifkan di grup ini
        if (activeCfg && activeCfg.enabled === false) return;

        // Cek Mode Respons Grup
        const responseMode = (activeCfg && activeCfg.telegram_response_mode) || 'always';
        const botUsername = (await bot.getMe().catch(() => ({ username: '' }))).username;
        const isMentioned = msg.text && (
            msg.text.includes(`@${botUsername}`) ||
            (msg.entities && msg.entities.some(e => e.type === 'mention'))
        );

        if (responseMode === 'mention_only' && !isMentioned) return;
        if (responseMode === 'command_only') return; // Hanya slash commands yang diproses
        if (responseMode === 'keyword_only') {
            // Akan diproses lebih lanjut di bagian keyword matching
        }
    } else {
        // Chat Personal
        if (config.telegram_private_bot_enabled === false) return;
        if (!configGroupId) {
            configGroupId = Object.keys(group_configs || {}).find(id => {
                const mTree = group_configs[id] ? group_configs[id].menuTree : null;
                return mTree && mTree.children && mTree.children.length > 0;
            }) || Object.keys(group_configs || {})[0];
        }
        activeCfg = configGroupId ? group_configs[configGroupId] : null;
    }

    if (!activeCfg && !isGroup) {
        activeCfg = {
            groupName: "Jajan Digital",
            enabled: true,
            useAiFallback: true,
            menuTree: { id: "root", name: "Menu Utama", type: "category", children: [] }
        };
    }

    // 5. Trigger Menu
    const triggerPrefixes = ['menu', 'bantuan', 'help', '/menu', '#menu', '#', 'list'];
    const isTrigger = activeCfg && activeCfg.triggerPrefix
        ? textLower === activeCfg.triggerPrefix.toLowerCase()
        : triggerPrefixes.includes(textLower);

    if (isTrigger && activeCfg) {
        telegramMenuStates.set(sessionKey, {
            currentNodeId: 'root', parentIds: [], lastActive: Date.now()
        });
        const menuNode = activeCfg.menuTree || { id: 'root', name: 'Menu Utama', type: 'category', children: [] };
        const menuText = renderTelegramMenu(menuNode, activeCfg);
        const keyboard = buildMenuInlineKeyboard(menuNode, activeCfg);
        await bot.sendChatAction(chatId, 'typing');
        await new Promise(r => setTimeout(r, 1000));
        await bot.sendMessage(chatId, menuText, {
            parse_mode: 'HTML',
            reply_markup: keyboard || undefined,
            reply_to_message_id: isGroup ? msg.message_id : undefined
        });
        if (io) io.emit('message_log', { chatId: `tg_${chatId}`, body: '[TG Menu Utama terkirim]', type: 'outgoing', timestamp: Date.now() });
        return;
    }

    // 6. Keyword Promo
    const promoKeywords = ['promo', 'promosi', 'diskon', 'sale'];
    if (promoKeywords.includes(textLower) && activeCfg) {
        const promoNodes = getAllPromoNodes(activeCfg.menuTree);
        if (promoNodes.length === 0) {
            await sendWithTyping(chatId, '🔍 <b>Tidak ada promo aktif saat ini.</b>');
        } else {
            let promoText = `🔥 <b>PROMO SPESIAL</b> 🔥\n${'─'.repeat(28)}\n\n`;
            promoNodes.forEach(({ node }, idx) => {
                promoText += `${idx + 1}. 🔥 <b>${node.name}</b>\n`;
            });
            promoText += `\n<i>Ketik nama produk untuk detail!</i>`;
            await sendWithTyping(chatId, promoText);
        }
        return;
    }

    // 7. Keyword QRIS/Pembayaran
    const paymentKeywords = ['bayar', 'qris', 'pembayaran', 'cara bayar'];
    if (paymentKeywords.includes(textLower) && activeCfg) {
        const pType = activeCfg.paymentType || 'qris';
        const pText = waToTelegramHtml(activeCfg.paymentText || '💵 <b>QRIS PEMBAYARAN RESMI</b>\n\nSilakan scan QRIS untuk melakukan pembayaran.\n\n<b>⚠️ Penting:</b> Setelah membayar, kirimkan bukti transfer ke grup.');
        const pMedia = (activeCfg.paymentMedia && activeCfg.paymentMedia.trim()) ? activeCfg.paymentMedia.trim() : 'Qris.jpeg';

        if (pType === 'qris' && pMedia) {
            const mediaPath = path.join(__dirname, '../../../media', pMedia);
            if (fs.existsSync(mediaPath)) {
                await sendPhotoWithAction(chatId, fs.createReadStream(mediaPath), {
                    caption: pText,
                    parse_mode: 'HTML'
                });
                return;
            }
        }
        await sendWithTyping(chatId, pText);
        return;
    }

    // 8. Navigasi Menu lewat Angka (session aktif)
    const session = telegramMenuStates.get(sessionKey);
    const isSessionActive = session && (Date.now() - session.lastActive < 120000);

    if (isSessionActive && activeCfg) {
        session.lastActive = Date.now();

        // Kembali ke parent
        if (textLower === '0') {
            const parentId = session.parentIds.length > 0 ? session.parentIds.pop() : 'root';
            session.currentNodeId = parentId;
            const node = findNodeById(activeCfg.menuTree, parentId) || activeCfg.menuTree;
            const menuText = renderTelegramMenu(node, activeCfg);
            const keyboard = buildMenuInlineKeyboard(node, activeCfg);
            await bot.sendMessage(chatId, menuText, { parse_mode: 'HTML', reply_markup: keyboard || undefined });
            return;
        }

        // Kembali ke root
        if (textLower === '#') {
            session.currentNodeId = 'root';
            session.parentIds = [];
            const node = activeCfg.menuTree;
            const menuText = renderTelegramMenu(node, activeCfg);
            const keyboard = buildMenuInlineKeyboard(node, activeCfg);
            await bot.sendMessage(chatId, menuText, { parse_mode: 'HTML', reply_markup: keyboard || undefined });
            return;
        }

        // Pilih nomor menu
        if (activeCfg.enableNumberNavigation !== false) {
            const numberMatch = textLower.match(/\b\d+\b/);
            if (numberMatch) {
                const choiceIndex = parseInt(numberMatch[0], 10) - 1;
                const currentNode = findNodeById(activeCfg.menuTree, session.currentNodeId) || activeCfg.menuTree;

                if (currentNode && currentNode.children) {
                    const sortedChildren = [...currentNode.children].sort((a, b) =>
                        (a.name || '').localeCompare(b.name || '', 'id', { sensitivity: 'base' })
                    );

                    if (choiceIndex >= 0 && choiceIndex < sortedChildren.length) {
                        const chosenNode = sortedChildren[choiceIndex];
                        if (chosenNode.type === 'category') {
                            session.parentIds.push(session.currentNodeId);
                            session.currentNodeId = chosenNode.id;
                            const menuText = renderTelegramMenu(chosenNode, activeCfg);
                            const keyboard = buildMenuInlineKeyboard(chosenNode, activeCfg);
                            await bot.sendMessage(chatId, menuText, { parse_mode: 'HTML', reply_markup: keyboard || undefined });
                        } else {
                            const icon = chosenNode.isPromo ? '🔥' : '📦';
                            const statusSuffix = getStatusEmoji(chosenNode.status);
                            let replyText = `${icon} <b>${chosenNode.name}</b>${statusSuffix}\n\n`;
                            if (chosenNode.isPromo) replyText = `⚠️ <b>PROMO SPESIAL!</b>\n\n` + replyText;
                            replyText += waToTelegramHtml(chosenNode.text || '');
                            replyText += `\n\n<i>Ketik 0 untuk kembali atau /menu untuk Menu Utama.</i>`;
                            await sendWithTyping(chatId, replyText);

                            // Kirim media produk jika ada
                            if (chosenNode.media && chosenNode.media.trim()) {
                                const mediaPath = path.join(__dirname, '../../../media', chosenNode.media.trim());
                                if (fs.existsSync(mediaPath)) {
                                    await sendPhotoWithAction(chatId, fs.createReadStream(mediaPath));
                                }
                            }
                        }
                        return;
                    }
                }
            }
        }
    }

    // 9. Direct Name Match (pencarian nama produk langsung)
    if (activeCfg && activeCfg.menuTree) {
        const matchResult = findNodeByName(activeCfg.menuTree, userMessage);
        if (matchResult) {
            const { node: matchedNode } = matchResult;
            if (matchedNode.type === 'category') {
                telegramMenuStates.set(sessionKey, { currentNodeId: matchedNode.id, parentIds: [], lastActive: Date.now() });
                const menuText = renderTelegramMenu(matchedNode, activeCfg);
                const keyboard = buildMenuInlineKeyboard(matchedNode, activeCfg);
                await bot.sendMessage(chatId, menuText, { parse_mode: 'HTML', reply_markup: keyboard || undefined });
            } else {
                const icon = matchedNode.isPromo ? '🔥' : '📦';
                let replyText = `${icon} <b>${matchedNode.name}</b>\n\n${waToTelegramHtml(matchedNode.text || '')}`;
                replyText += `\n\n<i>Ketik /menu untuk kembali ke Menu Utama.</i>`;
                await sendWithTyping(chatId, replyText);
                if (matchedNode.media && matchedNode.media.trim()) {
                    const mediaPath = path.join(__dirname, '../../../media', matchedNode.media.trim());
                    if (fs.existsSync(mediaPath)) await sendPhotoWithAction(chatId, fs.createReadStream(mediaPath));
                }
            }
            return;
        }
    }

    // 10. Extra Triggers (keyword kustom dari konfigurasi grup)
    if (activeCfg && activeCfg.extraTriggers && Array.isArray(activeCfg.extraTriggers)) {
        const matchedTrigger = activeCfg.extraTriggers.find(t => {
            if (!t.keyword) return false;
            const kw = t.keyword.toLowerCase().trim();
            if (textLower !== kw) return false;
            const scope = t.scope || 'all';
            if (scope === 'private') return !isGroup;
            if (scope === 'group') return isGroup;
            return true;
        });

        if (matchedTrigger) {
            await sendWithTyping(chatId, waToTelegramHtml(matchedTrigger.reply));
            if (matchedTrigger.media && matchedTrigger.media.trim()) {
                const mediaPath = path.join(__dirname, '../../../media', matchedTrigger.media.trim());
                if (fs.existsSync(mediaPath)) await sendPhotoWithAction(chatId, fs.createReadStream(mediaPath));
            }
            return;
        }
    }

    // 11. AI Fallback
    const canUseAi = isGroup
        ? (config.group_ai_enabled !== false && activeCfg && activeCfg.useAiFallback)
        : (config.private_ai_enabled !== false);

    let shouldTriggerAi = false;
    if (isGroup && canUseAi) {
        // Cek apakah bot di-mention atau ada nama bot dalam pesan
        const responseMode = (activeCfg && activeCfg.telegram_response_mode) || 'always';
        if (responseMode === 'always') {
            shouldTriggerAi = true;
        } else if (responseMode === 'mention_only') {
            const botInfo = await bot.getMe().catch(() => ({ username: '' }));
            shouldTriggerAi = msg.text && msg.text.includes(`@${botInfo.username}`);
        } else if (responseMode === 'keyword_only') {
            const aiNames = (activeCfg && activeCfg.aiNames) ? activeCfg.aiNames.split(',').map(n => n.trim().toLowerCase()) : ['bot', 'ai'];
            shouldTriggerAi = aiNames.some(name => textLower.includes(name));
        }
    } else if (!isGroup && canUseAi) {
        shouldTriggerAi = true;
    }

    if (shouldTriggerAi) {
        try {
            await bot.sendChatAction(chatId, 'typing');

            // Tentukan apakah reply via DM atau publik
            const replyMode = (activeCfg && activeCfg.telegram_reply_mode) || 'public';
            const targetChatId = (isGroup && replyMode === 'private_dm') ? userId : chatId;

            if (isGroup && replyMode === 'private_dm') {
                await bot.sendMessage(chatId, '💬 Saya sudah kirimkan jawaban ke DM Anda.', {
                    reply_to_message_id: msg.message_id
                });
            }

            let aiReply = '';

            if (isGroup && activeCfg) {
                // Gunakan generateGroupAiResponse seperti WA (dengan konteks CS)
                const knowledge = getGroupKnowledgeContext(
                    activeCfg.allowedKnowledgeFiles || [],
                    path.join(__dirname, '../../../knowledge')
                );

                const serializeMenuTree = (node, depth = 0) => {
                    if (!node) return '';
                    let res = '  '.repeat(depth) + `- ${node.name} (${node.type === 'category' ? 'Kategori' : 'Produk'})`;
                    if (node.text) res += `: ${node.text.replace(/\n/g, ' ')}`;
                    res += '\n';
                    if (node.children) node.children.forEach(c => { res += serializeMenuTree(c, depth + 1); });
                    return res;
                };

                const customerPrompt = `Anda adalah Asisten Pelayanan Pelanggan (CS) untuk toko "${activeCfg.groupName || 'Toko Kami'}".\nSapa pelanggan dengan "Kak". Jawab singkat, ramah, dan akurat berdasarkan data di bawah.\n\n[PRODUK AKTIF]\n${serializeMenuTree(activeCfg.menuTree)}\n\n[PENGETAHUAN TOKO]\n${knowledge}`.trim();

                const result = await generateGroupAiResponse(userMessage, customerPrompt, sessionKey);
                aiReply = result.reply || 'Ada yang bisa saya bantu, Kak?';
            } else {
                // Gunakan generateUnifiedAiResponse untuk chat personal (sama dengan WA PM)
                const result = await generateUnifiedAiResponse(userMessage, sessionKey);
                aiReply = result.reply || 'Ada yang bisa saya bantu?';
            }

            recordAiUsage(userId);

            await sendWithTyping(targetChatId, waToTelegramHtml(aiReply));

            if (io) io.emit('message_log', {
                chatId: `tg_${chatId}`,
                body: aiReply,
                type: 'outgoing',
                timestamp: Date.now()
            });

        } catch (err) {
            console.error('[TG AI Fallback] Gagal:', err.message);
            await bot.sendMessage(chatId, 'Maaf, sistem sedang sibuk. Coba beberapa saat lagi ya.', {
                reply_to_message_id: isGroup ? msg.message_id : undefined
            });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: Callback Query (Inline Keyboard klik tombol menu)
// ─────────────────────────────────────────────────────────────────────────────
async function handleCallbackQuery(bot, query, io) {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data || '';
    const sessionKey = getTgSessionKey(userId, chatId);
    const isGroup = query.message.chat.type !== 'private';

    await bot.answerCallbackQuery(query.id).catch(() => {});

    const { group_configs } = await getGroupConfigs();
    let configGroupId = config.private_chat_sync_group_id;
    let activeCfg = null;

    if (isGroup) {
        const groupConfigKey = getTgGroupConfigKey(chatId);
        activeCfg = group_configs[groupConfigKey];
        configGroupId = groupConfigKey;
    } else {
        if (!configGroupId) {
            configGroupId = Object.keys(group_configs).find(id => !id.startsWith('tg_grp_')) || Object.keys(group_configs)[0];
        }
        activeCfg = configGroupId ? group_configs[configGroupId] : null;
    }

    if (!activeCfg) return;

    let session = telegramMenuStates.get(sessionKey);
    if (!session) {
        session = { currentNodeId: 'root', parentIds: [], lastActive: Date.now() };
        telegramMenuStates.set(sessionKey, session);
    }
    session.lastActive = Date.now();

    if (data === 'menu_root') {
        session.currentNodeId = 'root';
        session.parentIds = [];
        const node = activeCfg.menuTree;
        const menuText = renderTelegramMenu(node, activeCfg);
        const keyboard = buildMenuInlineKeyboard(node, activeCfg);
        await bot.editMessageText(menuText, {
            chat_id: chatId, message_id: query.message.message_id,
            parse_mode: 'HTML', reply_markup: keyboard
        }).catch(() => {});
        return;
    }

    if (data === 'menu_back') {
        const parentId = session.parentIds.length > 0 ? session.parentIds.pop() : 'root';
        session.currentNodeId = parentId;
        const node = findNodeById(activeCfg.menuTree, parentId) || activeCfg.menuTree;
        const menuText = renderTelegramMenu(node, activeCfg);
        const keyboard = buildMenuInlineKeyboard(node, activeCfg);
        await bot.editMessageText(menuText, {
            chat_id: chatId, message_id: query.message.message_id,
            parse_mode: 'HTML', reply_markup: keyboard
        }).catch(() => {});
        return;
    }

    if (data.startsWith('menu_')) {
        const nodeId = data.replace('menu_', '');
        const node = findNodeById(activeCfg.menuTree, nodeId);
        if (!node) return;

        if (node.type === 'category') {
            session.parentIds.push(session.currentNodeId);
            session.currentNodeId = node.id;
            const menuText = renderTelegramMenu(node, activeCfg);
            const keyboard = buildMenuInlineKeyboard(node, activeCfg);
            await bot.editMessageText(menuText, {
                chat_id: chatId, message_id: query.message.message_id,
                parse_mode: 'HTML', reply_markup: keyboard
            }).catch(() => {});
        } else {
            const icon = node.isPromo ? '🔥' : '📦';
            let replyText = `${icon} <b>${node.name}</b>\n\n${waToTelegramHtml(node.text || '')}`;
            replyText += `\n\n<i>Klik tombol di bawah untuk navigasi.</i>`;

            const navKeyboard = {
                inline_keyboard: [[
                    { text: '🔙 Kembali', callback_data: 'menu_back' },
                    { text: '🏠 Menu Utama', callback_data: 'menu_root' }
                ]]
            };

            await bot.editMessageText(replyText, {
                chat_id: chatId, message_id: query.message.message_id,
                parse_mode: 'HTML', reply_markup: navKeyboard
            }).catch(() => {});

            if (node.media && node.media.trim()) {
                const mediaPath = path.join(__dirname, '../../../media', node.media.trim());
                if (fs.existsSync(mediaPath)) {
                    await sendPhotoWithAction(chatId, mediaPath);
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT: Daftarkan semua event handler ke instance bot
// ─────────────────────────────────────────────────────────────────────────────
function registerMessageHandlers(bot, io) {
    // ── Pesan Teks ──
    bot.on('message', async (msg) => {
        try {
            if (!msg || !msg.from) return;
            if (msg.from.is_bot) return; // Abaikan pesan dari bot lain

            console.log(`[Telegram Recv] Pesan dari ${msg.from.first_name || msg.from.id} (${msg.chat.id}): "${msg.text || ''}"`);

            // Welcome/Goodbye member (event khusus Telegram)
            if (msg.new_chat_members) {
                await handleNewMembers(bot, msg, io);
                return;
            }
            if (msg.left_chat_member) {
                await handleLeftMember(bot, msg, io);
                return;
            }

            const text = msg.text || '';

            // ── .kick plain text command (alternatif /kick) ──
            if (text.trim().toLowerCase() === '.kick') {
                const isGroup = msg.chat.type !== 'private';
                if (isGroup) {
                    const fakeMsg = { ...msg, text: '/kick' };
                    await handleSlashCommand(bot, { ...fakeMsg, text: '/kick' }, io);
                    return;
                }
            }

            // Slash Commands
            if (text.startsWith('/')) {
                await handleSlashCommand(bot, msg, io);
                return;
            }

            // Pesan Teks Biasa
            await handleTextMessage(bot, msg, io);
        } catch (err) {
            console.error('[TG Handler] Error pada event message:', err.message);
        }
    });

    // ── Inline Keyboard Callback ──
    bot.on('callback_query', async (query) => {
        try {
            await handleCallbackQuery(bot, query, io);
        } catch (err) {
            console.error('[TG Handler] Error pada callback_query:', err.message);
        }
    });

    console.log('[TG Handler] Semua event handler Telegram terdaftar.');
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: Welcome Member Baru
// ─────────────────────────────────────────────────────────────────────────────
async function handleNewMembers(bot, msg, io) {
    const chatId = msg.chat.id;
    const groupConfigKey = getTgGroupConfigKey(chatId);
    await ensureGroupRegistered(chatId, msg.chat.title);
    const { group_configs } = await getGroupConfigs();
    const cfg = group_configs[groupConfigKey];

    if (!cfg || cfg.enabled === false) return;

    const welcomeMsg = cfg.welcomeMessage ||
        `👋 Halo {nama}, selamat datang di {grup}! 🎉\n\nSilakan ketik /menu untuk melihat produk kami.`;

    for (const newMember of msg.new_chat_members) {
        if (newMember.is_bot) continue;
        const name = newMember.first_name || newMember.username || 'Anggota Baru';
        const personalizedMsg = welcomeMsg
            .replace(/\{nama\}/gi, name)
            .replace(/\{username\}/gi, newMember.username ? `@${newMember.username}` : name)
            .replace(/\{grup\}/gi, msg.chat.title || 'Grup Ini');

        try {
            const sentMsg = await sendWithTyping(chatId, waToTelegramHtml(personalizedMsg));

            // Auto-delete welcome message jika dikonfigurasi
            const telegramCfg = config.telegram_config || {};
            const autoDeleteSecs = telegramCfg.auto_delete_welcome_seconds || 0;
            if (autoDeleteSecs > 0 && sentMsg) {
                setTimeout(() => {
                    bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {});
                }, autoDeleteSecs * 1000);
            }
        } catch (err) {
            console.error('[TG Welcome] Gagal kirim pesan sambutan:', err.message);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER: Goodbye Member Keluar
// ─────────────────────────────────────────────────────────────────────────────
async function handleLeftMember(bot, msg, io) {
    const chatId = msg.chat.id;
    const groupConfigKey = getTgGroupConfigKey(chatId);

    try {
        await ensureGroupRegistered(chatId, msg.chat.title);
        const { group_configs } = await getGroupConfigs();
        const cfg = group_configs[groupConfigKey];

        if (!cfg || cfg.enabled === false) return;

        const goodbyeMsg = cfg.goodbyeMessage ||
            `👋 Sampai jumpa, {nama}! Semoga kita bertemu lagi. 🙏`;

        const member = msg.left_chat_member;
        if (member.is_bot) return;
        const name = member.first_name || member.username || 'Anggota';

        const personalizedMsg = goodbyeMsg
            .replace(/\{nama\}/gi, name)
            .replace(/\{username\}/gi, member.username ? `@${member.username}` : name)
            .replace(/\{grup\}/gi, msg.chat.title || 'Grup Ini');

        await sendWithTyping(chatId, waToTelegramHtml(personalizedMsg));
    } catch (err) {
        console.error('[TG Goodbye] Gagal kirim pesan perpisahan:', err.message);
    }
}

module.exports = { registerMessageHandlers };
