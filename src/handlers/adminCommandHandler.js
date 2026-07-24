// src/handlers/adminCommandHandler.js
'use strict';
const fs = require('fs');
const { getDb } = require('../db/sqlite');
const { saveGroupConfig } = require('../db/models');

/**
 * setGroupAnnounce — Set mode hanya-admin (tutup) atau semua (buka) di grup.
 * Menggunakan Puppeteer langsung dengan scan Store.Chat.models untuk mendukung
 * format group ID baru WhatsApp (120363xxxxxxx@g.us) yang gagal di WWebJS.getChat().
 */
async function setGroupAnnounce(client, groupId, announce) {
    const userPart = (groupId.split('@')[0] || '').replace(/\D/g, '');
    
    const result = await client.pupPage.evaluate(async (groupId, userPart, announce) => {
        try {
            // Cari chat via metode standar dulu
            let chat = null;
            try {
                chat = await window.WWebJS.getChat(groupId, { getAsModel: false });
            } catch(_) {}
            
            // Jika gagal, scan semua chat di Store
            if (!chat && window.Store && window.Store.Chat) {
                const models = window.Store.Chat.models || window.Store.Chat.getModels?.() || [];
                chat = models.find(c => {
                    if (!c.id) return false;
                    const cUser = String(c.id.user || c.id._serialized || '').replace(/\D/g, '');
                    return cUser === userPart || (c.id._serialized || '') === groupId;
                });
            }
            
            if (!chat) return { ok: false, error: `Grup tidak ditemukan di Store (id: ${groupId})` };
            
            // Coba WAWebSetPropertyGroupAction
            try {
                const mod = window.require('WAWebSetPropertyGroupAction');
                const res = await mod.setGroupProperty(chat, 'announcement', announce ? 1 : 0);
                // ServerStatusCodeError.name === 'ServerStatusCodeError' → bot bukan admin
                return { ok: true };
            } catch(e) {
                const name = e && e.name ? e.name : '';
                const msg = e && e.message ? e.message : String(e);
                if (name === 'ServerStatusCodeError' || msg === 'r' || msg.length <= 2) {
                    return { ok: false, error: 'Bot bukan Admin di grup ini, atau WhatsApp menolak permintaan.' };
                }
                return { ok: false, error: msg };
            }
        } catch(outerErr) {
            return { ok: false, error: outerErr.message || String(outerErr) };
        }
    }, groupId, userPart, announce);
    
    if (!result.ok) throw new Error(result.error);
    return true;
}


async function handleAdminCommandMessage(msg, {
    senderId, userMessage, textLower, isSenderHostAdmin, isGroup, shopData,
    clientInstance, ioInstance, setMessagesAdminsOnly, gConfigs, groupId
}) {
    if (!isSenderHostAdmin) return false;
    if (!userMessage.startsWith('!') && !userMessage.startsWith('.')) return false;

    const cmd = userMessage.toLowerCase().trim();

    if (cmd === '.id') {
        if (!isGroup) {
            await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup.");
            return true;
        }
        await msg.reply(`📌 *ID Grup WA ini:* \`${groupId}\``);
        return true;
    }

    if (cmd === '.buka' || cmd === '!toko buka') {
        if (!isGroup) {
            await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup.");
            return true;
        }
        try {
            await setGroupAnnounce(clientInstance, groupId, false);
            const cfg = gConfigs && gConfigs[groupId];
            const openText = (cfg && cfg.groupOpenText && cfg.groupOpenText.trim() !== '')
                ? cfg.groupOpenText
                : "🔓 *Pemberitahuan:* Toko telah dibuka. Semua anggota dapat mengirim pesan.";
            await msg.reply(openText);
        } catch (err) {
            await msg.reply("❌ Gagal membuka grup: " + ((err && err.message) ? err.message : String(err)));
        }
        return true;
    }

    if (cmd === '.tutup' || cmd === '!toko tutup') {
        if (!isGroup) {
            await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup.");
            return true;
        }
        try {
            await setGroupAnnounce(clientInstance, groupId, true);
            const cfg = gConfigs && gConfigs[groupId];
            const closeText = (cfg && cfg.groupCloseText && cfg.groupCloseText.trim() !== '')
                ? cfg.groupCloseText
                : "🔒 *Pemberitahuan:* Toko telah ditutup. Hanya Admin yang dapat mengirim pesan.";
            await msg.reply(closeText);
        } catch (err) {
            await msg.reply("❌ Gagal menutup grup: " + ((err && err.message) ? err.message : String(err)));
        }
        return true;
    }

    // .done / .proses — Konfirmasi status pesanan sederhana
    const isProcessCmd = cmd.startsWith('.proses') || cmd.startsWith('.process');
    const isDoneCmd = cmd.startsWith('.done') || cmd.startsWith('.doen');
    if (isProcessCmd || isDoneCmd) {
        const extraNote = userMessage.trim().split(/\s+/).slice(1).join(' '); // teks setelah perintah
        let replyText;
        if (isProcessCmd) {
            replyText = `⏳ *Status Pesanan: DIPROSES*\n`;
            replyText += `Pesanan Anda sedang kami proses. Mohon tunggu sebentar ya! 🙏`;
        } else {
            replyText = `✅ *Status Pesanan: SELESAI / LUNAS*\n`;
            replyText += `Pesanan Anda telah dikonfirmasi dan sudah diproses. Terima kasih! 🎉`;
        }
        if (extraNote) replyText += `\n\n📝 _Catatan Admin: ${extraNote}_`;

        const hasQuote = msg.hasQuotedMsg || Boolean(msg.quotedMsg) || Boolean(msg._data && (msg._data.quotedMsg || msg._data.quotedParticipant));
        if (hasQuote) {
            try {
                const quotedMsg = await msg.getQuotedMessage();
                const targetId = quotedMsg.author || quotedMsg.from;
                await msg.reply(replyText, null, { mentions: targetId ? [targetId] : [] });
            } catch (_) {
                await msg.reply(replyText);
            }
        } else {
            await msg.reply(replyText);
        }
        return true;
    }

    if (cmd === '.kick') {
        if (!isGroup) {
            await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup.");
            return true;
        }
        if (msg.hasQuotedMsg) {
            try {
                const quotedMsg = await msg.getQuotedMessage();
                const participantId = quotedMsg.author || quotedMsg.from;
                const chat = await msg.getChat();
                await chat.removeParticipants([participantId]);
                await msg.reply(`✅ Berhasil mengeluarkan user @${participantId.split('@')[0]} dari grup.`, null, {
                    mentions: [participantId]
                });
            } catch(err) {
                await msg.reply("❌ Gagal mengeluarkan anggota: " + err.message);
            }
        } else {
            await msg.reply("⚠️ Balas/quote salah satu pesan anggota yang ingin di-kick dengan mengetik *.kick*");
        }
        return true;
    }

    if (cmd === '.promote' || cmd === '.demote') {
        if (!isGroup) {
            await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup.");
            return true;
        }
        if (msg.hasQuotedMsg) {
            try {
                const quotedMsg = await msg.getQuotedMessage();
                const participantId = quotedMsg.author || quotedMsg.from;
                const chat = await msg.getChat();
                if (cmd === '.promote') {
                    await chat.promoteParticipants([participantId]);
                    await msg.reply(`✅ Berhasil menjadikan @${participantId.split('@')[0]} sebagai Admin.`, null, { mentions: [participantId] });
                } else {
                    await chat.demoteParticipants([participantId]);
                    await msg.reply(`✅ Berhasil mencopot jabatan Admin dari @${participantId.split('@')[0]}.`, null, { mentions: [participantId] });
                }
            } catch(err) {
                await msg.reply("❌ Gagal merubah jabatan admin: " + err.message);
            }
        } else {
            await msg.reply(`⚠️ Balas/quote pesan anggota dengan mengetik *${cmd}*`);
        }
        return true;
    }



    if (cmd === '!bot on') {
        if (!gConfigs[groupId]) {
            gConfigs[groupId] = {
                groupName: groupId,
                enabled: true,
                useAiFallback: true,
                triggerPrefix: '',
                allowedKnowledgeFiles: [],
                categoryFooter: 'Silakan pilih menu dengan mengetik angkanya:',
                contentFooter: 'Ketik *0* untuk kembali ke menu sebelumnya, atau *#* untuk kembali ke menu utama.',
                menuTree: { id: "root", name: "Menu Utama", type: "category", text: "Silakan pilih salah satu opsi di bawah ini:", children: [] }
            };
        } else {
            gConfigs[groupId].enabled = true;
        }
        await saveGroupConfig(groupId, gConfigs[groupId]);
        await msg.reply("✅ *Bot Diaktifkan:* Bot WhatsApp sekarang aktif merespons di grup ini.");
        return true;
    } else if (cmd === '!bot off') {
        if (gConfigs[groupId]) {
            gConfigs[groupId].enabled = false;
            await saveGroupConfig(groupId, gConfigs[groupId]);
        }
        await msg.reply("⚠️ *Bot Dinonaktifkan:* Bot WhatsApp berhenti merespons di grup ini.");
        return true;
    } else if (cmd === '!pelanggan') {
        let replyText = "👥 *Daftar Pelanggan Toko:*\n\n";
        if (shopData.customers && shopData.customers.length > 0) {
            shopData.customers.forEach((c, idx) => {
                replyText += `${idx + 1}. *${c.name}* (${c.phone})\n`;
            });
        } else {
            replyText += "Belum ada pelanggan terdaftar.";
        }
        await msg.reply(replyText);
        return true;
    }

    return false;
}

module.exports = { handleAdminCommandMessage };
