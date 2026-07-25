// src/handlers/adminCommandHandler.js
'use strict';
const fs = require('fs');
const { getDb } = require('../db/sqlite');
const { saveGroupConfig } = require('../db/models');

/**
 * setGroupAnnounce — Set mode hanya-admin (tutup) atau semua (buka) di grup.
 * Menggunakan Puppeteer langsung dengan scan Store.Chat.models untuk mendukung
 * format group ID baru WhatsApp (120363xxxxxxx@g.us) yang gagal di WWebJS.getChat().
 * Dilengkapi retry otomatis (max 3x, jeda 2 detik) untuk handle kondisi WA belum siap.
 */
async function setGroupAnnounce(client, groupId, announce, attempt = 1) {
    const userPart = (groupId.split('@')[0] || '').replace(/\D/g, '');

    const result = await client.pupPage.evaluate(async (groupId, userPart, announce) => {
        // ── Helper: cari chat object ─────────────────────────────────────────
        const findChat = async () => {
            // Metode 1: WWebJS standar
            try {
                const c = await window.WWebJS.getChat(groupId, { getAsModel: false });
                if (c) return c;
            } catch(_) {}

            // Metode 2: Scan Store.Chat.models
            if (window.Store && window.Store.Chat) {
                const models = window.Store.Chat.models
                    || (typeof window.Store.Chat.getModels === 'function' ? window.Store.Chat.getModels() : [])
                    || [];
                const found = models.find(c => {
                    if (!c || !c.id) return false;
                    const cu = String(c.id.user || c.id._serialized || '').replace(/\D/g, '');
                    return cu === userPart || (c.id._serialized || '') === groupId;
                });
                if (found) return found;
            }

            // Metode 3: Store.GroupMetadata (fallback terakhir)
            if (window.Store && window.Store.GroupMetadata) {
                const gm = window.Store.GroupMetadata.get(groupId);
                if (gm) return gm;
            }

            return null;
        };

        try {
            const chat = await findChat();
            if (!chat) return { ok: false, error: `NOTFOUND:Grup tidak ditemukan di Store (id: ${groupId})` };

            // ── Coba set properti grup ───────────────────────────────────────
            try {
                const mod = window.require('WAWebSetPropertyGroupAction');
                await mod.setGroupProperty(chat, 'announcement', announce ? 1 : 0);
                return { ok: true };
            } catch(e) {
                const name  = (e && e.name)    ? e.name    : '';
                const emsg  = (e && e.message) ? e.message : String(e);
                const isTransient = emsg === 'r' || emsg.length <= 2; // error sementara WA
                const isNotAdmin  = name === 'ServerStatusCodeError';

                if (isNotAdmin) return { ok: false, error: 'NOTADMIN:Bot bukan Admin di grup ini.' };
                if (isTransient) return { ok: false, error: 'RETRY:WhatsApp belum siap, coba lagi.' };
                return { ok: false, error: emsg };
            }
        } catch(outerErr) {
            return { ok: false, error: outerErr.message || String(outerErr) };
        }
    }, groupId, userPart, announce);

    // ── Handle hasil ────────────────────────────────────────────────────────
    if (result.ok) return true;

    const errMsg = result.error || '';

    // Error sementara (WA belum siap) → retry max 3x dengan jeda 2 detik
    if (errMsg.startsWith('RETRY:') && attempt <= 3) {
        console.log(`[setGroupAnnounce] Percobaan ${attempt}/3 gagal (WA belum siap), retry dalam 2 detik...`);
        await new Promise(r => setTimeout(r, 2000));
        return setGroupAnnounce(client, groupId, announce, attempt + 1);
    }

    // Error lainnya → lempar langsung
    const cleanMsg = errMsg.replace(/^(RETRY:|NOTFOUND:|NOTADMIN:)/, '');
    throw new Error(cleanMsg);
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
            const chatObj = await msg.getChat();
            try { await chatObj.sendSeen(); } catch(_) {}
            try { await chatObj.sendStateTyping(); } catch(_) {}
            await new Promise(r => setTimeout(r, 2000));
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
            const chatObj = await msg.getChat();
            try { await chatObj.sendSeen(); } catch(_) {}
            try { await chatObj.sendStateTyping(); } catch(_) {}
            await new Promise(r => setTimeout(r, 1200));
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

    // .done / .proses — Invoice / Konfirmasi Pesanan
    const isProcessCmd = cmd.startsWith('.proses') || cmd.startsWith('.process');
    const isDoneCmd    = cmd.startsWith('.done')   || cmd.startsWith('.doen');
    if (isProcessCmd || isDoneCmd) {
        // Tampilkan typing indicator dulu
        try {
            const chatObj = await msg.getChat();
            try { await chatObj.sendSeen(); } catch(_) {}
            try { await chatObj.sendStateTyping(); } catch(_) {}
            await new Promise(r => setTimeout(r, 2000));
        } catch(_) {}

        const extraNote = userMessage.trim().split(/\s+/).slice(1).join(' ');

        // Ambil data dari pesan yang dikutip
        let customerName = '';
        let customerNumber = '';
        let orderDetails = '';
        let quotedText = '';
        let targetId = null;

        const hasQuote = msg.hasQuotedMsg || Boolean(msg._data && (msg._data.quotedMsg || msg._data.quotedParticipant));
        if (hasQuote) {
            try {
                const quotedMsg = await msg.getQuotedMessage();
                targetId = quotedMsg.author || quotedMsg.from;
                quotedText = quotedMsg.body || '';

                // Ambil nama pelanggan dari kontak
                try {
                    const contact = await quotedMsg.getContact();
                    customerName = contact.pushname || contact.name || '';
                    customerNumber = (contact.number || (contact.id && contact.id.user) || '').replace(/\D/g, '');
                } catch(_) {}

                if (!customerNumber && targetId) {
                    customerNumber = (targetId.split('@')[0] || '').replace(/\D/g, '');
                }

                // Ekstrak detail pesanan dari teks kutipan
                // Format: "pesan: Netflix 1 bulan" atau "beli: Spotify"
                const lowerQuoted = quotedText.toLowerCase();
                if (lowerQuoted.startsWith('pesan:') || lowerQuoted.startsWith('pesan ')) {
                    orderDetails = quotedText.substring(6).trim();
                } else if (lowerQuoted.startsWith('beli:') || lowerQuoted.startsWith('beli ')) {
                    orderDetails = quotedText.substring(5).trim();
                } else {
                    // Ambil maksimal 100 karakter pertama sebagai ringkasan
                    orderDetails = quotedText.length > 100 ? quotedText.substring(0, 100) + '...' : quotedText;
                }
            } catch (_) {}
        }

        // Nomor invoice otomatis: INV-YYYYMMDD-HHMMSS (zona waktu Jakarta)
        const nowJkt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
        const pad = n => String(n).padStart(2, '0');
        const invDate = `${nowJkt.getFullYear()}${pad(nowJkt.getMonth()+1)}${pad(nowJkt.getDate())}`;
        const invTime = `${pad(nowJkt.getHours())}${pad(nowJkt.getMinutes())}${pad(nowJkt.getSeconds())}`;
        const invoiceNo = `INV-${invDate}-${invTime}`;

        // Format tanggal Indonesia — zona waktu Jakarta (WIB)
        const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
        const tglStr = `${nowJkt.getDate()} ${bulan[nowJkt.getMonth()]} ${nowJkt.getFullYear()}, ${pad(nowJkt.getHours())}:${pad(nowJkt.getMinutes())} WIB`;

        // Nama toko dari config atau default
        const { config: botConfig } = require('../config/config');
        const storeName = (botConfig && botConfig.store_name) ? botConfig.store_name : 'Jajan Digital';

        let replyText;

        if (isDoneCmd) {
            replyText =
`🧾 ━━━━━━━━━━━━━━━━━━━━
   *INVOICE PEMBAYARAN*
━━━━━━━━━━━━━━━━━━━━━━

🏪 *Toko* : ${storeName}
📋 *No. Invoice* : ${invoiceNo}
📅 *Tanggal* : ${tglStr}

━━━━━━━━━━━━━━━━━━━━━━
👤 *Pelanggan* : ${targetId ? `@${targetId.split('@')[0]}` : '(tidak diketahui)'}
━━━━━━━━━━━━━━━━━━━━━━
✅ *STATUS : LUNAS / SELESAI*
━━━━━━━━━━━━━━━━━━━━━━
${extraNote ? `📝 _Catatan: ${extraNote}_\n\n` : ''}🎉 Terima kasih atas kepercayaan Anda!
Produk/akses akan segera dikirim. 🚀`;

        } else {
            replyText =
`📋 ━━━━━━━━━━━━━━━━━━━━
   *UPDATE STATUS PESANAN*
━━━━━━━━━━━━━━━━━━━━━━

🏪 *Toko* : ${storeName}
📋 *No. Ref* : ${invoiceNo}
📅 *Update* : ${tglStr}

━━━━━━━━━━━━━━━━━━━━━━
👤 *Pelanggan* : ${targetId ? `@${targetId.split('@')[0]}` : '(tidak diketahui)'}
━━━━━━━━━━━━━━━━━━━━━━
⏳ *STATUS : SEDANG DIPROSES*
━━━━━━━━━━━━━━━━━━━━━━
${extraNote ? `📝 _Catatan: ${extraNote}_\n\n` : ''}🙏 Mohon tunggu sebentar, pesanan Anda sedang kami kerjakan!`;
        }

        try {
            await msg.reply(replyText, null, { mentions: targetId ? [targetId] : [] });
        } catch(_) {
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
