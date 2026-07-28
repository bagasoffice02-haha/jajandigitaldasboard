// src/handlers/adminCommandHandler.js
'use strict';
const fs = require('fs');
const { getDb } = require('../db/sqlite');
const { saveGroupConfig } = require('../db/models');

/**
 * setGroupAnnounce — Set mode hanya-admin (tutup) atau semua (buka) di grup.
 * Mencari modul secara DINAMIS — tidak hardcode nama modul yang bisa berubah
 * setiap WhatsApp Web update. Juga scan Store.Chat.models untuk ID grup format baru.
 */
async function setGroupAnnounce(client, groupId, announce, attempt = 1) {
    const userPart = (groupId.split('@')[0] || '').replace(/\D/g, '');

    const result = await client.pupPage.evaluate(async (groupId, userPart, announce) => {
        try {
            // ── 1. Cari chat object ───────────────────────────────────────────
            let chat = null;

            // Metode A: WWebJS standar
            try {
                const c = await window.WWebJS.getChat(groupId, { getAsModel: false });
                if (c) chat = c;
            } catch(_) {}

            // Metode B: Scan Store.Chat.models
            if (!chat && window.Store && window.Store.Chat) {
                const models = window.Store.Chat.models
                    || (typeof window.Store.Chat.getModels === 'function' ? window.Store.Chat.getModels() : [])
                    || [];
                chat = models.find(c => {
                    if (!c || !c.id) return false;
                    const cu = String(c.id.user || c.id._serialized || '').replace(/\D/g, '');
                    return cu === userPart || (c.id._serialized || '') === groupId;
                }) || null;
            }

            // Metode C: Store.GroupMetadata
            if (!chat && window.Store && window.Store.GroupMetadata) {
                chat = window.Store.GroupMetadata.get(groupId) || null;
            }

            if (!chat) return { ok: false, error: `NOTFOUND:Grup tidak ditemukan (id: ${groupId})` };

            // ── 2. Cari modul setGroupProperty SECARA DINAMIS ─────────────────
            // Tidak hardcode nama modul karena WA Web sering update & rename
            let setPropertyFn = null;
            const knownNames = [
                'WAWebSetPropertyGroupAction',
                'WAWebGroupSetPropertyAction',
                'WAWebSetGroupPropertyAction',
            ];

            // Coba nama yang diketahui dulu (lebih cepat)
            for (const name of knownNames) {
                try {
                    const m = window.require(name);
                    if (m && typeof m.setGroupProperty === 'function') {
                        setPropertyFn = (c, prop, val) => m.setGroupProperty(c, prop, val);
                        break;
                    }
                } catch(_) {}
            }

            // Jika tidak ada, scan SEMUA modul webpack
            if (!setPropertyFn) {
                try {
                    const moduleMap = window.require.m || {};
                    for (const key of Object.keys(moduleMap)) {
                        try {
                            const m = window.require(key);
                            if (m && typeof m.setGroupProperty === 'function') {
                                setPropertyFn = (c, prop, val) => m.setGroupProperty(c, prop, val);
                                break;
                            }
                        } catch(_) {}
                    }
                } catch(_) {}
            }

            if (!setPropertyFn) return { ok: false, error: 'NOTFOUND:Modul setGroupProperty tidak ditemukan di WA Web.' };

            // ── 3. Jalankan ──────────────────────────────────────────────────
            try {
                await setPropertyFn(chat, 'announcement', announce ? 1 : 0);
                return { ok: true };
            } catch(e) {
                const name = (e && e.name)    ? e.name    : '';
                const emsg = (e && e.message) ? e.message : String(e);
                if (name === 'ServerStatusCodeError') return { ok: false, error: 'NOTADMIN:Bot bukan Admin di grup ini.' };
                if (emsg === 'r' || emsg.length <= 2) return { ok: false, error: 'RETRY:WA server belum siap, coba lagi.' };
                return { ok: false, error: emsg };
            }

        } catch(outerErr) {
            const emsg = outerErr.message || String(outerErr);
            if (emsg === 'r' || emsg.length <= 2) return { ok: false, error: 'RETRY:WA error sementara.' };
            return { ok: false, error: emsg };
        }
    }, groupId, userPart, announce);

    // ── Retry logic ──────────────────────────────────────────────────────────
    if (result.ok) return true;

    const errMsg = result.error || '';
    console.log(`[setGroupAnnounce] attempt=${attempt} → ${errMsg}`);

    if (errMsg.startsWith('RETRY:') && attempt <= 5) {
        console.log(`[setGroupAnnounce] Retry ${attempt}/5 dalam 3 detik...`);
        await new Promise(r => setTimeout(r, 3000));
        return setGroupAnnounce(client, groupId, announce, attempt + 1);
    }

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
            await msg.reply(`📌 *ID Grup WA ini:* \`${groupId}\``);
            return true;
        }
        await msg.reply(`📌 *ID Grup WA ini:* \`${groupId}\``);
        return true;
    }

    if (cmd.startsWith('.resetpass')) {
        const parts = userMessage.trim().split(/\s+/);
        const newPass = parts[1];
        if (!newPass || newPass.length < 6) {
            await msg.reply("⚠️ Format salah! Gunakan: `.resetpass <password_baru>` (minimal 6 karakter)");
            return true;
        }
        try {
            const { updateConfig } = require('../config/config');
            updateConfig({ admin_password: newPass });
            await msg.reply(`✅ *BERHASIL RESET PASSWORD ADMIN*\n\nPassword baru dasbor Anda adalah:\n\`${newPass}\`\n\nGunakan password ini untuk masuk ke Web Dasbor.`);
        } catch (err) {
            await msg.reply("❌ Gagal mereset password: " + err.message);
        }
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

        // Fix 3: Update status order di DB berdasarkan nomor customer
        if (targetId) {
            try {
                const db = getDb();
                const customerPhone = targetId.split('@')[0].replace(/\D/g, '');
                const newStatus = isDoneCmd ? 'DONE' : 'PROCESS';
                // Update order PENDING/PROCESS terbaru dari customer ini
                await db.run(
                    `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = (
                       SELECT id FROM orders
                       WHERE customer_number LIKE ?
                         AND status IN ('PENDING','PROCESS')
                       ORDER BY created_at DESC
                       LIMIT 1
                     )`,
                    newStatus, `%${customerPhone}%`
                );
                console.log(`[Order DB] Status order customer ${customerPhone} \u2192 ${newStatus}`);
            } catch(dbErr) {
                console.warn('[Order DB] Gagal update status order:', dbErr.message);
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
