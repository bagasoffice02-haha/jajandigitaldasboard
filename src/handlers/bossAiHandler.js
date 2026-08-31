// src/handlers/bossAiHandler.js
'use strict';
const fs = require('fs');
const path = require('path');
const { config } = require('../config/config');
const { addReminder } = require('../db/models');
const { generateUnifiedAiResponse, appendToMemory } = require('../services/ai/aiService');
const { parseReminderTime } = require('./helpers');

async function handleBossAiMessage(msg, {
    chatId, senderId, userMessage, isSenderHostAdmin, ioInstance, activeLocks
}) {
    if (!isSenderHostAdmin) return false;

    // Check if it matches memory update (#akubosmu)
    if (userMessage.toLowerCase().startsWith('#akubosmu')) {
        const memoryText = userMessage.substring('#akubosmu'.length).trim();
        if (!memoryText) {
            await msg.reply('❌ Memori tidak boleh kosong Bos. Contoh: #akubosmu Sandi wifi kantor adalah "admin123"');
            return true;
        }
        
        activeLocks.add(chatId);
        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping();
        } catch (chatErr) { console.warn('[Boss AI Typing Warning] Failed to send state typing:', chatErr.message); }
        
        try {
            appendToMemory(memoryText);
            const replyMsg = `✅ Memori berhasil disimpan, Bos!\n\n🧠 *Memori Baru*:\n"${memoryText}"\n\nSaya akan mengingat hal ini dalam tugas-tugas saya.`;
            await msg.reply(replyMsg);
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `Memori disimpan: "${memoryText}"`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        } catch (err) {
            console.error('Gagal menyimpan memori otomatis:', err.message);
            await msg.reply(`❌ Gagal menyimpan memori: ${err.message}`);
        } finally {
            activeLocks.delete(chatId);
        }
        return true;
    }

    // Check if it matches report time config (#jadwallaporan)
    if (userMessage.toLowerCase().startsWith('#jadwallaporan')) {
        const timeInput = userMessage.substring('#jadwallaporan'.length).trim();
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(timeInput)) {
            await msg.reply('❌ Format waktu salah Bos. Harap gunakan format HH:MM (24 jam). Contoh: *#jadwallaporan 17:00*');
            return true;
        }

        activeLocks.add(chatId);
        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping();
        } catch (chatErr) { console.warn('[Boss AI Typing Warning] Failed to send state typing:', chatErr.message); }
        
        try {
            config.report_time = timeInput;
            const projectRootConfigPath = path.join(__dirname, '../../config.json');
            fs.writeFileSync(projectRootConfigPath, JSON.stringify(config, null, 2), 'utf-8');
            
            const replyMsg = `✅ Jadwal laporan harian berhasil diubah, Bos!\n\n🕒 *Waktu Baru*: *${timeInput} WIB*\n\nLaporan berikutnya akan dikirim otomatis setiap hari pada jam tersebut.`;
            await msg.reply(replyMsg);
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `Jadwal laporan diubah ke ${timeInput} WIB`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        } catch (err) {
            console.error('Gagal memperbarui jadwal laporan via WA:', err.message);
            await msg.reply(`❌ Gagal memperbarui jadwal: ${err.message}`);
        } finally {
            activeLocks.delete(chatId);
        }
        return true;
    }

    // Check if it matches add reminder (#ingatkan)
    if (userMessage.toLowerCase().startsWith('#ingatkan')) {
        const content = userMessage.substring('#ingatkan'.length).trim();
        let timePart = '';
        let messagePart = '';
        const parts = content.split('|');
        if (parts.length >= 2) {
            timePart = parts[0].trim();
            messagePart = parts.slice(1).join('|').trim();
        } else {
            await msg.reply('❌ Format salah Bos. Gunakan format: *#ingatkan [waktu] | [keterangan]*\nContoh: *#ingatkan jam 15:30 | Telepon Klien*');
            return true;
        }

        const targetDate = parseReminderTime(timePart);
        if (!targetDate) {
            await msg.reply('❌ Gagal membaca format waktu Bos. Contoh waktu yang didukung:\n- *15:30* (hari ini)\n- *besok 09:00*\n- *lusa 10:00*\n- *20/06 jam 14:00*');
            return true;
        }

        activeLocks.add(chatId);
        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping();
        } catch (chatErr) { console.warn('[Boss AI Typing Warning] Failed to send state typing:', chatErr.message); }

        try {
            await addReminder(chatId, messagePart, targetDate.toISOString());

            const formattedTime = targetDate.toLocaleString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Jakarta'
            }) + ' WIB';

            const replyMsg = `✅ Pengingat berhasil dijadwalkan, Bos!\n\n🔔 *Detail Pengingat*:\n- *Pengingat*: ${messagePart}\n- *Waktu*: ${formattedTime}\n\nSaya akan mengirim pesan WhatsApp kepada Bos secara otomatis pada waktu tersebut.`;
            await msg.reply(replyMsg);

            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `Menjadwalkan Pengingat: "${messagePart}" untuk ${formattedTime}`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        } catch (err) {
            console.error('Gagal menambahkan pengingat:', err.message);
            await msg.reply(`❌ Gagal menambahkan pengingat: ${err.message}`);
        } finally {
            activeLocks.delete(chatId);
        }
        return true;
    }

    // Check if it matches help/bantuan
    const helpKeywords = ['help', 'bantuan', 'menu', '#bantuan', '/help'];
    if (helpKeywords.includes(userMessage.toLowerCase().trim())) {
        activeLocks.add(chatId);
        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping();
        } catch (chatErr) { console.warn('[Boss AI Typing Warning] Failed to send state typing:', chatErr.message); }
        
        const helpMsg = `💼 *Asisten Manager Pribadi*
Halo Bos! Saya siap membantu mencatat Keuangan & Agenda Anda ke Google Spreadsheet.

👉 *Bahasa Alami (Tanpa Template)*:
Ketik obrolan seperti biasa, AI akan mendeteksi otomatis!
- Contoh: *"kemarin bayar listrik 150rb"*
- Contoh: *"tolong jadwalkan rapat besok jam 10 pagi"*
(Setelah mengetik, cukup balas *YA* untuk mengonfirmasi)

👉 *Pintasan Catat Keuangan*:
- Pemasukan: \`+ [nominal] [keterangan]\` atau \`masuk [nominal] [keterangan]\`
- Pengeluaran: \`- [nominal] [keterangan]\` atau \`keluar [nominal] [keterangan]\`
- Contoh: \`+ 100rb Uang proyek\` atau \`- 25k Beli bensin\`
(Mendukung nominal singkatan: rb / k / jt)

👉 *Pintasan Catat Agenda*:
- Format: \`#agenda [waktu] | [nama acara]\`
- Contoh: \`#agenda Besok jam 10 pagi | Rapat Direksi\`

👉 *Membaca Foto Kuitansi*:
- Cukup kirim foto kuitansi/nota belanja ke sini. Saya akan mengekstrak total nominal dan tujuan belanjanya secara otomatis!

👉 *Trigger Memori*:
- Format: \`#akubosmu [informasi]\`
- Contoh: \`#akubosmu Sandi wifi kantor adalah "admin123"\`
(Saya akan mengingat fakta ini untuk menjawab pertanyaan Anda nantinya)

👉 *Mengatur Jadwal Laporan*:
- Format: \`#jadwallaporan [HH:MM]\`
- Contoh: \`#jadwallaporan 20:00\`
(Untuk mengatur waktu pengiriman laporan harian otomatis kapan saja)

👉 *Pintasan Buat Pengingat*:
- Format: \`#ingatkan [waktu] | [keterangan]\`
- Contoh: \`#ingatkan besok jam 09:00 | Bayar gaji karyawan\`
(Untuk membuat pengingat WhatsApp otomatis kapan saja)`;

        await msg.reply(helpMsg);
        if (ioInstance) {
            ioInstance.emit('message_log', {
                chatId,
                body: helpMsg,
                type: 'outgoing',
                timestamp: Date.now()
            });
        }
        activeLocks.delete(chatId);
        return true;
    }

    return false;
}

async function handleUnifiedAiDispatcher(msg, {
    chatId, userMessage, ioInstance, activeLocks
}) {
    activeLocks.add(chatId);
    try {
        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping();
        } catch (chatErr) { console.warn('[Unified AI Typing Warning] Failed to send state typing:', chatErr.message); }
        
        console.log(`[Unified AI] Memproses pesan dari ${chatId}: "${userMessage}"`);
        const result = await generateUnifiedAiResponse(userMessage, chatId);
        console.log(`[Unified AI] Hasil analisis:`, JSON.stringify(result));
        
        if (result.intent === 'reminder' && result.data && result.data.waktu && result.data.pesan) {
            const data = result.data;
            const targetDate = parseReminderTime(data.waktu);
            if (targetDate) {
                await addReminder(chatId, data.pesan, targetDate.toISOString());
                const formattedTime = targetDate.toLocaleString('id-ID', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
                }) + ' WIB';
                const replyMsg = `🤖 *Pengingat Dijadwalkan Otomatis*:\n- *Pengingat*: ${data.pesan}\n- *Waktu*: ${formattedTime}\n\nSaya akan mengirimkan pesan pengingat kepada Bos pada waktu tersebut.`;
                await msg.reply(replyMsg);
                if (ioInstance) {
                    ioInstance.emit('message_log', {
                        chatId, body: `Menjadwalkan Pengingat (AI): "${data.pesan}" untuk ${formattedTime}`,
                        type: 'outgoing', timestamp: Date.now()
                    });
                }
            } else {
                const aiReply = result.reply || `Saya mengerti Bos ingin diingatkan tentang "${data.pesan}" pada "${data.waktu}". Namun saya gagal mengurai format waktunya. Harap gunakan format yang lebih spesifik seperti *besok jam 10:00* atau *15:30*.`;
                await msg.reply(aiReply);
                if (ioInstance) ioInstance.emit('message_log', { chatId, body: aiReply, type: 'outgoing', timestamp: Date.now() });
            }
        } else {
            console.log(`[AI Chat] Memproses balasan obrolan umum untuk: "${userMessage}"`);
            const aiReply = result.reply || 'Maaf Bos, saya tidak mengerti maksud pesan tersebut.';
            await msg.reply(aiReply);
            if (ioInstance) ioInstance.emit('message_log', { chatId, body: aiReply, type: 'outgoing', timestamp: Date.now() });
        }
    } catch (err) {
        console.error('Gagal menjalankan klasifikasi AI / Chat:', err.message);
        
        let providerName = 'Lokal';
        if (config.provider === 'gemini') providerName = 'Gemini';
        else if (config.provider === 'groq') providerName = 'Groq';
        else if (config.provider === 'deepseek') providerName = 'DeepSeek';
        else if (config.provider === 'qwen') providerName = 'Qwen';
        else if (config.provider === 'openrouter') providerName = 'OpenRouter';

        const errorFallbackMsg = `⚠️ *Pemberitahuan Sistem AI*\n\nMohon maaf Bos, server AI (${providerName}) sedang mengalami kendala jaringan sementara.\n\n📌 *Pintasan Perintah Tetap Aktif:*\n• Catat Keuangan: \`+ 50rb Beli bensin\`\n• Catat Agenda: \`#agenda Besok jam 10 | Rapat\`\n• Cek Panduan: Ketik *!bantuan*`;
        await msg.reply(errorFallbackMsg);
        if (ioInstance) ioInstance.emit('message_log', { chatId, body: errorFallbackMsg, type: 'outgoing', timestamp: Date.now() });
    } finally {
        activeLocks.delete(chatId);
    }
    return true;
}

module.exports = { handleBossAiMessage, handleUnifiedAiDispatcher };
