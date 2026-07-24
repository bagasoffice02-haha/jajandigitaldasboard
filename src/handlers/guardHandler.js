// src/handlers/guardHandler.js
'use strict';
const { config } = require('../config/config');
const { addCustomer, touchCustomer } = require('../db/models');
const { normalizePhone } = require('./helpers');

async function isSenderGroupAdminHelper(client, groupId, senderId) {
    if (!client || !client.pupPage) return false;
    try {
        const isGroupAdmin = await client.pupPage.evaluate(async (chatId, userId) => {
            try {
                let chatObj = null;
                if (window.Store && window.Store.Chat) {
                    chatObj = window.Store.Chat.get(chatId);
                    if (!chatObj && typeof window.Store.Chat.find === 'function') {
                        try {
                            chatObj = await window.Store.Chat.find(chatId);
                        } catch (_) {}
                    }
                }
                
                if (!chatObj) {
                    chatObj = await window.WWebJS.getChat(chatId, { getAsModel: false });
                }
                
                if (!chatObj || !chatObj.groupMetadata || !chatObj.groupMetadata.participants) {
                    return false;
                }
                
                const getDigits = (str) => {
                    if (!str) return '';
                    if (typeof str === 'object') {
                        return (str._serialized || str.user || '').replace(/\D/g, '');
                    }
                    return String(str).replace(/\D/g, '');
                };
                
                const targetDigits = getDigits(userId);
                if (!targetDigits) return false;

                const participant = chatObj.groupMetadata.participants.find(p => {
                    if (!p.id) return false;
                    const pIdStr = typeof p.id === 'object' ? (p.id._serialized || p.id.user) : p.id;
                    return getDigits(pIdStr) === targetDigits;
                });
                
                return !!(participant && (participant.isAdmin || participant.isSuperAdmin));
            } catch (browserErr) {
                console.error('[Browser Guard Error] Gagal mengecek admin:', browserErr.message);
                return false;
            }
        }, groupId, senderId);
        return !!isGroupAdmin;
    } catch (err) {
        console.warn('[Guard Warning] Gagal memeriksa status admin via browser:', err.message);
        return false;
    }
}

async function checkAndProcessGuards(msg, {
    chatId, senderId, userMessage, isGroup, shopData, clientInstance
}) {
    const senderPhone = senderId.split('@')[0];

    // 1. Resolve isSenderHostAdmin status
    let contactPhone = '';
    try {
        const contact = await msg.getContact();
        contactPhone = contact.number || (contact.id && contact.id.user);
    } catch (e) {
        console.warn('[Guard Warning] Gagal mendapatkan detail kontak pengirim:', e.message);
    }

    // ─── Cek apakah pengirim adalah Admin/Boss ─────────────────────────────────
    // Cukup cocokkan digits boss_number ATAU boss_lid (untuk format LID baru WhatsApp)
    const bossDigits = (config.boss_number || '').replace(/\D/g, '');
    const bossLid    = (config.boss_lid    || '').replace(/\D/g, '');
    const contactDigits     = (contactPhone || '').replace(/\D/g, '');
    const senderPartDigits  = (senderId.split('@')[0] || '').replace(/\D/g, '');

    const matchDigits = (a, b) => !!a && !!b && (a === b || a.endsWith(b) || b.endsWith(a));

    const isSenderBoss =
        (bossDigits && (matchDigits(contactDigits, bossDigits) || matchDigits(senderPartDigits, bossDigits))) ||
        (bossLid    && (matchDigits(senderPartDigits, bossLid) || matchDigits(contactDigits, bossLid)));

    // ─── Auto-simpan LID Boss jika belum tersimpan ──────────────────────────────
    // Jika boss dikenali lewat nomor HP dan pengirim pakai format LID baru (@lid),
    // otomatis simpan LID-nya supaya Kakak tidak perlu input manual.
    if (isSenderBoss && senderId.endsWith('@lid')) {
        const currentLid = (config.boss_lid || '').replace(/\D/g, '');
        if (!currentLid || currentLid !== senderPartDigits) {
            try {
                const { updateConfig } = require('../config/config');
                updateConfig({ boss_lid: senderPartDigits });
                console.log(`[Guard] ✅ Auto-simpan boss_lid: "${senderPartDigits}" (dari pesan boss via LID format)`);
            } catch(saveErr) {
                console.warn('[Guard] Gagal auto-simpan boss_lid:', saveErr.message);
            }
        }
    }

    console.log(`[Guard] boss="${bossDigits}" lid="${bossLid}" | contact="${contactDigits}" sender="${senderPartDigits}" | isBoss=${!!isSenderBoss}`);

    // Tidak ada cek async getChatById/Puppeteer — langsung pakai hasil di atas
    const isSenderHostAdmin = !!isSenderBoss;

    // Touch customer to update last interaction time
    if (!isSenderHostAdmin && senderId !== 'status@broadcast' && !msg.fromMe) {
        (async () => {
            try {
                await touchCustomer(senderPhone);
            } catch (err) {
                console.error('[CRM Touch Warning] Gagal meng-update interaksi terakhir:', err.message);
            }
        })();
    }

    // 2. Check if bot is disabled in this scope
    if (!isGroup && config.private_chat_bot_enabled === false && !isSenderHostAdmin) {
        return { shouldIgnore: true, isSenderHostAdmin };
    }
    if (isGroup && config.group_chat_bot_enabled === false && !isSenderHostAdmin) {
        return { shouldIgnore: true, isSenderHostAdmin };
    }

    // 3. Auto-save customer to CRM (SQLite) silently (zero risk of WA ban)
    const rawSenderId = msg.author || msg.from;
    if (!msg.fromMe && rawSenderId && (rawSenderId.endsWith('@c.us') || rawSenderId.endsWith('@lid'))) {
        (async () => {
            try {
                const customerExists = (shopData.customers || []).some(c => c.phone.replace(/\D/g, '') === senderPhone);
                if (!customerExists && !isSenderHostAdmin && senderId !== 'status@broadcast') {
                    const contact = await msg.getContact();
                    const phone = contact.number || contact.id.user;
                    const name = contact.pushname || contact.name || `Pelanggan ${senderPhone}`;
                    if (phone && phone.length > 5) {
                        await addCustomer(phone, name);
                        console.log(`[CRM Passive Log] Berhasil menyimpan pelanggan baru ke database: ${senderPhone}`);
                    }
                }
            } catch (crmErr) {
                console.error('[CRM Auto-Save Warning] Gagal menyimpan pelanggan otomatis:', crmErr.message);
            }
        })();
    }

    return { shouldIgnore: false, isSenderHostAdmin, isSenderBoss };
}

module.exports = { checkAndProcessGuards };
