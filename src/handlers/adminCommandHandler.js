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

    const isProcessCmd = cmd.startsWith('.proses') || cmd.startsWith('.process');
    const isDoneCmd = cmd.startsWith('.done') || cmd.startsWith('.doen');
    if (isProcessCmd || isDoneCmd) {
        if (msg.hasQuotedMsg) {
            try {
                let quotedMsg = null;
                let customerId = null;
                let details = 'Tidak ada detail';
                
                try {
                    quotedMsg = await msg.getQuotedMessage();
                    customerId = quotedMsg.author || quotedMsg.from;
                    details = quotedMsg.body || (quotedMsg.hasMedia ? '[Bukti Gambar/Media]' : '') || 'Tidak ada detail';
                } catch (quoteErr) {
                    console.warn('[Invoice Warning] Gagal memanggil getQuotedMessage(), menggunakan data mentah:', quoteErr.message);
                    customerId = msg.quotedParticipant || (msg._data && msg._data.quotedParticipant) || (msg._data && msg._data.quotedMsg && (msg._data.quotedMsg.author || msg._data.quotedMsg.from));
                    const rawQuoted = msg.quotedMsg || (msg._data && msg._data.quotedMsg);
                    if (rawQuoted) {
                        details = rawQuoted.body || (rawQuoted.type === 'image' || rawQuoted.type === 'video' ? '[Bukti Gambar/Media]' : '') || 'Tidak ada detail';
                    }
                }
                
                if (!customerId) {
                    throw new Error('Tidak dapat mendeteksi nomor pengirim bukti pembayaran.');
                }
                
                const customerNumber = customerId.split('@')[0];
                
                let customerName = 'Pelanggan';
                try {
                    const contact = await clientInstance.getContactById(customerId);
                    customerName = contact.pushname || contact.name || `Pelanggan`;
                } catch (contactErr) {
                    console.warn('[Invoice Warning] Gagal mendapatkan nama kontak, menggunakan default:', contactErr.message);
                }
                
                const now = new Date();
                const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' };
                const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' };
                const waktuStr = now.toLocaleTimeString('id-ID', timeOptions) + ' WIB';
                const tanggalStr = now.toLocaleDateString('id-ID', dateOptions);
                
                const statusVal = isProcessCmd ? '🔴 PROSES' : '🟢 LUNAS / DONE';
                const statusKey = isProcessCmd ? 'PROSES' : 'SELESAI';
                const invoiceId = 'INV-' + Date.now().toString().substring(6);
                
                const db = getDb();
                if (db) {
                    await db.run(
                        'INSERT OR REPLACE INTO invoices (id, customer_number, customer_name, status, details) VALUES (?, ?, ?, ?, ?)',
                        invoiceId,
                        customerNumber,
                        customerName,
                        statusKey,
                        details
                    );
                    
                    if (ioInstance) {
                        ioInstance.emit('invoice_created', {
                            id: invoiceId,
                            customer_number: customerNumber,
                            customer_name: customerName,
                            status: statusKey,
                            details: details,
                            created_at: now.toISOString()
                        });
                    }
                }
                
                const invoiceText = `╭───────────────\n` +
                                    `📄 *INVOICE PEMBAYARAN*\n` +
                                    `╰───────────────\n` +
                                    `╭───────────────\n` +
                                    `👤 *Nama:* ${customerName} (@${customerNumber})\n` +
                                    `🆔 *Nomor ID:* ${invoiceId}\n` +
                                    `📌 *Status:* *${statusVal}*\n` +
                                    `📅 *Tanggal:* ${tanggalStr}\n` +
                                    `⏰ *Waktu:* ${waktuStr}\n` +
                                    `╰───────────────\n` +
                                    `╭───────────────\n` +
                                    `┊ _Terima kasih atas pembayaran Anda!_\n` +
                                    `┊ _Pesanan Anda telah diverifikasi oleh admin._\n` +
                                    `╰───────────────`;
                                     
                try {
                    if (quotedMsg) {
                        await quotedMsg.reply(invoiceText, null, {
                            mentions: [customerId]
                        });
                    } else {
                        await msg.reply(invoiceText, null, {
                            mentions: [customerId]
                        });
                    }
                } catch (replyErr) {
                    console.warn('[Invoice Warning] Gagal mereply quoted msg, kirim langsung:', replyErr.message);
                    await msg.reply(invoiceText, null, {
                        mentions: [customerId]
                    });
                }
            } catch(err) {
                await msg.reply("❌ Gagal memproses invoice: " + err.message);
            }
        } else {
            await msg.reply("⚠️ Balas/quote pesan bukti pembayaran dari pelanggan dengan mengetik *.proses* atau *.done* / *.doen*");
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
