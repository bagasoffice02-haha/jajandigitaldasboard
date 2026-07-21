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
                
                const participant = chatObj.groupMetadata.participants.find(p => {
                    if (!p.id) return false;
                    return p.id._serialized === userId || p.id.user === userId.split('@')[0];
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

    const isSenderBoss = (() => {
        if (!config.boss_number || config.boss_number.trim() === '') return false;
        const cleanBoss = normalizePhone(config.boss_number);
        const cleanSender = normalizePhone(senderId);
        const cleanContact = contactPhone ? normalizePhone(contactPhone) : '';
        return cleanSender === cleanBoss || cleanContact === cleanBoss;
    })();

    // Di dalam grup, isSenderHostAdmin bernilai true HANYA jika pengirim adalah Boss (Owner) ATAU Admin Grup WA tersebut
    let isSenderHostAdmin = isSenderBoss;
    if (isGroup) {
        try {
            const isGroupAdmin = await isSenderGroupAdminHelper(clientInstance, chatId, senderId);
            isSenderHostAdmin = isSenderBoss || isGroupAdmin;
        } catch (chatErr) {
            console.warn('[Guard Warning] Gagal memverifikasi status admin grup, fallback ke false:', chatErr.message);
            isSenderHostAdmin = isSenderBoss;
        }
    }

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
