// src/handlers/adminCommandHandler.js
'use strict';
const fs = require('fs');
const { getDb } = require('../db/sqlite');
const { saveGroupConfig } = require('../db/models');
const { setMessagesAdminsOnlyHelper } = require('../services/whatsapp/client');
const { isSenderGroupAdminHelper } = require('./guardHandler');

async function handleAdminCommandMessage(msg, {
    senderId, userMessage, textLower, isSenderHostAdmin, isGroup, shopData,
    clientInstance, ioInstance, setMessagesAdminsOnly, gConfigs, groupId
}) {
    const cmd = userMessage.toLowerCase().trim();
    const isBareDone = cmd === 'done' || cmd.startsWith('done ');
    if (!userMessage.startsWith('!') && !userMessage.startsWith('.') && !isBareDone) return false;

    // Cek otorisasi admin (Boss number, msg.fromMe, atau admin di grup)
    let isAuthorized = Boolean(isSenderHostAdmin || msg.fromMe);
    if (!isAuthorized && isGroup) {
        try {
            isAuthorized = await isSenderGroupAdminHelper(clientInstance, groupId, senderId);
        } catch(_) {}
    }
    if (!isAuthorized) return false;

    if (cmd === '.id' || cmd === '!id') {
        if (!isGroup) {
            await msg.reply(`📌 *ID Chat ini:* \`${groupId || senderId}\``);
            return true;
        }
        await msg.reply(`📌 *ID Grup WA ini:* \`${groupId}\``);
        return true;
    }

    if (cmd.startsWith('.resetpass') || cmd.startsWith('!resetpass')) {
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

    const isBukaCmd = cmd === '.buka' || cmd === '!toko buka' || cmd === '!buka' || cmd === '.open' || cmd === '!open';
    if (isBukaCmd) {
        if (!isGroup) {
            await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup WhatsApp.");
            return true;
        }
        try {
            const chatObj = await msg.getChat();
            try { await chatObj.sendSeen(); } catch(_) {}
            try { await chatObj.sendStateTyping(); } catch(_) {}
            await new Promise(r => setTimeout(r, 1000));
            
            await setMessagesAdminsOnlyHelper(clientInstance, groupId, false);
            
            const cfg = gConfigs && gConfigs[groupId];
            const openText = (cfg && cfg.groupOpenText && cfg.groupOpenText.trim() !== '')
                ? cfg.groupOpenText
                : "🔓 *Pemberitahuan:* Toko telah dibuka. Semua anggota dapat mengirim pesan.";
            await msg.reply(openText);
        } catch (err) {
            const emsg = (err && err.message) ? err.message : String(err);
            const cleanMsg = emsg.replace(/^Evaluation failed:\s*/i, '');
            await msg.reply(`❌ Gagal membuka grup:\n${cleanMsg}`);
        }
        return true;
    }

    const isTutupCmd = cmd === '.tutup' || cmd === '!toko tutup' || cmd === '!tutup' || cmd === '.close' || cmd === '!close';
    if (isTutupCmd) {
        if (!isGroup) {
            await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup WhatsApp.");
            return true;
        }
        try {
            const chatObj = await msg.getChat();
            try { await chatObj.sendSeen(); } catch(_) {}
            try { await chatObj.sendStateTyping(); } catch(_) {}
            await new Promise(r => setTimeout(r, 1000));
            
            await setMessagesAdminsOnlyHelper(clientInstance, groupId, true);
            
            const cfg = gConfigs && gConfigs[groupId];
            const closeText = (cfg && cfg.groupCloseText && cfg.groupCloseText.trim() !== '')
                ? cfg.groupCloseText
                : "🔒 *Pemberitahuan:* Toko telah ditutup. Hanya Admin yang dapat mengirim pesan.";
            await msg.reply(closeText);
        } catch (err) {
            const emsg = (err && err.message) ? err.message : String(err);
            const cleanMsg = emsg.replace(/^Evaluation failed:\s*/i, '');
            await msg.reply(`❌ Gagal menutup grup:\n${cleanMsg}`);
        }
        return true;
    }

    // .done / done / .proses — Invoice / Konfirmasi Pesanan
    const isProcessCmd = cmd.startsWith('.proses') || cmd.startsWith('.process');
    const isDoneCmd    = cmd.startsWith('.done')   || cmd.startsWith('.doen') || isBareDone;
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
            let participantId = null;

            if (msg._data) {
                if (typeof msg._data.quotedParticipant === 'string') {
                    participantId = msg._data.quotedParticipant;
                } else if (msg._data.quotedParticipant && msg._data.quotedParticipant._serialized) {
                    participantId = msg._data.quotedParticipant._serialized;
                } else if (msg._data.quotedMsg) {
                    participantId = msg._data.quotedMsg.author || (msg._data.quotedMsg.from && !msg._data.quotedMsg.from.endsWith('@g.us') ? msg._data.quotedMsg.from : null);
                }
            }

            try {
                const quotedMsg = await msg.getQuotedMessage();
                if (quotedMsg) {
                    if (!participantId) {
                        participantId = quotedMsg.author || (quotedMsg.from && !quotedMsg.from.endsWith('@g.us') ? quotedMsg.from : null);
                    }
                    quotedText = quotedMsg.body || '';

                    try {
                        const contact = await quotedMsg.getContact();
                        if (contact) {
                            customerName = contact.pushname || contact.name || contact.shortName || '';
                            const num = contact.number || (contact.id && contact.id.user) || '';
                            if (num) customerNumber = num.replace(/\D/g, '');
                        }
                    } catch (_) {}
                }
            } catch (_) {}

            if (participantId) {
                targetId = participantId;
                if (!customerNumber) {
                    customerNumber = (participantId.split('@')[0] || '').replace(/\D/g, '');
                }

                if (!customerName && clientInstance && typeof clientInstance.getContactById === 'function') {
                    try {
                        const c = await clientInstance.getContactById(participantId);
                        if (c) {
                            customerName = c.pushname || c.name || c.shortName || '';
                        }
                    } catch (_) {}
                }
            }

            if (quotedText) {
                const lowerQuoted = quotedText.toLowerCase();
                if (lowerQuoted.startsWith('pesan:') || lowerQuoted.startsWith('pesan ')) {
                    orderDetails = quotedText.substring(6).trim();
                } else if (lowerQuoted.startsWith('beli:') || lowerQuoted.startsWith('beli ')) {
                    orderDetails = quotedText.substring(5).trim();
                } else {
                    orderDetails = quotedText.length > 100 ? quotedText.substring(0, 100) + '...' : quotedText;
                }
            }
        } else {
            // Jika tidak me-reply pesan, cek apakah ada mention atau nomor HP di pesan admin
            try {
                const mentions = await msg.getMentions();
                if (mentions && mentions.length > 0) {
                    const contact = mentions[0];
                    targetId = (contact.id && contact.id._serialized) ? contact.id._serialized : String(contact.id);
                    customerName = contact.pushname || contact.name || contact.shortName || '';
                    customerNumber = (contact.number || (contact.id && contact.id.user) || '').replace(/\D/g, '');
                }
            } catch (_) {}

            if (!targetId) {
                const phoneMatch = extraNote.match(/(08\d{8,12}|628\d{8,12})/);
                if (phoneMatch) {
                    let rawNum = phoneMatch[0];
                    if (rawNum.startsWith('08')) rawNum = '628' + rawNum.substring(2);
                    targetId = `${rawNum}@c.us`;
                    customerNumber = rawNum;
                }
            }
        }

        // Cek database shop_customers sebagai fallback jika nama kontak belum ada
        if (customerNumber && (!customerName || customerName === 'Pelanggan')) {
            try {
                const db = getDb();
                if (db) {
                    const existingCust = await db.get("SELECT name FROM shop_customers WHERE phone LIKE ?", `%${customerNumber}%`);
                    if (existingCust && existingCust.name && existingCust.name !== 'Pelanggan') {
                        customerName = existingCust.name;
                    }
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

        // Tampilan tag murni pelanggan (tanpa tambahan nama kontak yang disimpan)
        const customerDisplay = customerNumber ? `@${customerNumber}` : (targetId ? `@${targetId.split('@')[0]}` : '(tidak diketahui)');

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
👤 *Pelanggan* : ${customerDisplay}
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
👤 *Pelanggan* : ${customerDisplay}
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

        // Update status order di DB berdasarkan nomor customer atau buat transaksi baru jika belum ada
        if (targetId) {
            try {
                const db = getDb();
                const customerPhone = targetId.split('@')[0].replace(/\D/g, '');
                const newStatus = isDoneCmd ? 'DONE' : 'PROCESS';
                
                // 1. Coba update order PENDING/PROCESS yang ada
                const updateRes = await db.run(
                    `UPDATE orders SET status = ?
                     WHERE id = (
                       SELECT id FROM orders
                       WHERE customer_number LIKE ?
                         AND status IN ('PENDING','PROCESS')
                       ORDER BY created_at DESC
                       LIMIT 1
                     )`,
                    newStatus, `%${customerPhone}%`
                );

                // 2. Jika tidak ada order gantung yang di-update, OTOMATIS TAMBAHKAN TRANSAKSI BARU KE DASBOR!
                if (!updateRes || updateRes.changes === 0) {
                    const finalCustomerName = customerName || `@${customerPhone}`;
                    const finalDetails = orderDetails || (isDoneCmd ? 'Transaksi Pembelian (Manual via Chat)' : 'Pesanan Dalam Proses');
                    
                    await db.run(
                        `INSERT INTO orders (customer_number, customer_name, details, status, created_at)
                         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                        [customerPhone, finalCustomerName, finalDetails, newStatus]
                    );

                    try {
                        await db.run(
                            `INSERT OR REPLACE INTO invoices (id, customer_number, customer_name, status, details, created_at)
                             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                            [invoiceNo, customerPhone, finalCustomerName, newStatus, finalDetails]
                        );
                    } catch(_) {}

                    console.log(`[Order DB] Transaksi BARU berhasil dibuat di Dasbor: ${invoiceNo} | ${finalCustomerName} | Status: ${newStatus}`);
                } else {
                    console.log(`[Order DB] Status order customer ${customerPhone} di-update \u2192 ${newStatus}`);
                }
            } catch(dbErr) {
                console.warn('[Order DB] Gagal update/insert transaksi:', dbErr.message);
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
