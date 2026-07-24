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

    // ─── Deteksi apakah pengirim adalah Boss/Owner ───────────────────────────────
    // Strategi: cek dari banyak sumber sekaligus agar tidak gagal karena format ID
    const isSenderBoss = (() => {
        if (!config.boss_number || config.boss_number.trim() === '') return false;
        // Ambil hanya digit dari boss_number yang tersimpan
        const bossDigits = (config.boss_number || '').replace(/\D/g, '');
        if (!bossDigits) return false;
        
        // Sumber 1: contactPhone (nomor telepon asli dari kontak WA - paling akurat)
        const contactDigits = contactPhone ? contactPhone.replace(/\D/g, '') : '';
        // Sumber 2: senderId (bisa berformat @c.us atau @lid)
        const senderPart = (senderId || '').split('@')[0];
        const senderDigits = senderPart.replace(/\D/g, '');
        // Sumber 3: senderPhone (sudah di-split dari senderId)
        const senderPhoneDigits = (senderPhone || '').replace(/\D/g, '');
        
        // Cocokkan: cukup salah satu sumber cocok dengan boss
        // Gunakan endsWith agar 62xxx cocok dengan xxx (berbeda kode negara)
        const isMatch = (a, b) => {
            if (!a || !b) return false;
            return a === b || a.endsWith(b) || b.endsWith(a);
        };
        
        const matched = isMatch(contactDigits, bossDigits) || 
                       isMatch(senderDigits, bossDigits) ||
                       isMatch(senderPhoneDigits, bossDigits);
        
        console.log(`[Guard] BossCheck: boss="${bossDigits}" | contact="${contactDigits}" | senderPart="${senderDigits}" | matched=${matched}`);
        return matched;
    })();

    // ─── Deteksi apakah pengirim adalah Admin Grup WA ────────────────────────────
    let isSenderHostAdmin = isSenderBoss;
    if (isGroup && !isSenderBoss) {
        try {
            // Gunakan native getChatById().participants (tanpa Puppeteer - lebih andal)
            const chat = await clientInstance.getChatById(chatId);
            if (chat && chat.participants && chat.participants.length > 0) {
                const contactDigits = contactPhone ? contactPhone.replace(/\D/g, '') : '';
                const senderDigits = (senderId.split('@')[0] || '').replace(/\D/g, '');
                
                const participant = chat.participants.find(p => {
                    if (!p.id) return false;
                    const pDigits = (p.id.user || p.id._serialized || '').replace(/\D/g, '');
                    return pDigits === senderDigits || 
                           pDigits === contactDigits ||
                           (contactDigits && pDigits.endsWith(contactDigits)) ||
                           (contactDigits && contactDigits.endsWith(pDigits));
                });
                
                const isGroupAdmin = !!(participant && (participant.isAdmin || participant.isSuperAdmin));
                console.log(`[Guard] GroupAdminCheck: senderId="${senderId}" | isGroupAdmin=${isGroupAdmin}`);
                isSenderHostAdmin = isGroupAdmin;
            } else {
                // Fallback: jika tidak bisa ambil participants, percaya pada cek boss_number
                isSenderHostAdmin = isSenderBoss;
            }
        } catch (chatErr) {
            console.warn('[Guard] Gagal cek admin grup via getChatById:', chatErr.message);
            // Jika gagal, pakai Puppeteer sebagai last resort
            try {
                const isGroupAdmin = await isSenderGroupAdminHelper(clientInstance, chatId, senderId);
                isSenderHostAdmin = isGroupAdmin;
            } catch (_) {
                isSenderHostAdmin = isSenderBoss;
            }
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
