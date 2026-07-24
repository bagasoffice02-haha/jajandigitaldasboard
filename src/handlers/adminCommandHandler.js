// src/handlers/adminCommandHandler.js
'use strict';
const fs = require('fs');
const { getDb } = require('../db/sqlite');
const { saveGroupConfig } = require('../db/models');

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
            await setMessagesAdminsOnly(clientInstance, groupId, false);
            const cfg = gConfigs && gConfigs[groupId];
            const openText = (cfg && cfg.groupOpenText && cfg.groupOpenText.trim() !== '') 
                ? cfg.groupOpenText 
                : "🔓 *Pemberitahuan:* Toko telah dibuka kembali. Grup dibuka untuk umum!";
            await msg.reply(openText);
        } catch (err) {
            const errMsg = err.message || String(err);
            if (errMsg === 'r' || errMsg.includes('Evaluation failed') || errMsg.trim().length <= 3) {
                await msg.reply("❌ Gagal membuka grup: Terjadi kesalahan browser WhatsApp Web. Pastikan bot adalah Admin di grup ini.");
            } else {
                await msg.reply("❌ Gagal membuka grup: " + errMsg);
            }
        }
        return true;
    }

    if (cmd === '.tutup' || cmd === '!toko tutup') {
        if (!isGroup) {
            await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup.");
            return true;
        }
        try {
            await setMessagesAdminsOnly(clientInstance, groupId, true);
            const cfg = gConfigs && gConfigs[groupId];
            const closeText = (cfg && cfg.groupCloseText && cfg.groupCloseText.trim() !== '') 
                ? cfg.groupCloseText 
                : "🔒 *Pemberitahuan:* Toko telah ditutup. Hanya Admin yang dapat mengirim pesan.";
            await msg.reply(closeText);
        } catch (err) {
            const errMsg = err.message || String(err);
            if (errMsg === 'r' || errMsg.includes('Evaluation failed') || errMsg.trim().length <= 3) {
                await msg.reply("❌ Gagal menutup grup: Terjadi kesalahan browser WhatsApp Web. Pastikan bot adalah Admin di grup ini.");
            } else {
                await msg.reply("❌ Gagal menutup grup: " + errMsg);
            }
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
