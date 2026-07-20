// src/handlers/mediaHandler.js
'use strict';
const pdfParse = require('pdf-parse');
const { MessageMedia } = require('whatsapp-web.js');
const { performOCR } = require('../services/ocr/ocrService');
const { generateUnifiedAiResponse } = require('../services/ai/aiService');

async function handleMediaMessage(msg, {
    chatId, userMessage, isSenderHostAdmin, ioInstance, activeLocks
}) {
    // Hanya izinkan media gambar/foto ('image') atau dokumen ('document')
    // Format lain seperti video, stiker, audio, atau voice note akan diabaikan secara senyap
    const allowedTypes = ['image', 'document'];
    if (!msg.hasMedia || !isSenderHostAdmin || !allowedTypes.includes(msg.type)) return false;

    activeLocks.add(chatId);
    try {
        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping();
        } catch (chatErr) {
            console.warn('[Media Chat Warning] Gagal mengirim status typing:', chatErr.message);
        }
        const media = await msg.downloadMedia();
        if (!media) {
            await msg.reply('❌ Maaf Bos, gagal mengunduh berkas media.');
            activeLocks.delete(chatId);
            return true;
        }
        
        // A. PDF Document
        if (media.mimetype === 'application/pdf') {
            await msg.reply('📄 Dokumen PDF diterima! Sedang mengekstrak teks dan menganalisis, mohon tunggu...');
            const buffer = Buffer.from(media.data, 'base64');
            const pdfData = await pdfParse(buffer);
            const docText = pdfData.text.trim();
            
            if (!docText) {
                await msg.reply('❌ Maaf Bos, tidak ada teks yang terbaca di dalam dokumen PDF tersebut.');
                activeLocks.delete(chatId);
                return true;
            }
            
            const prompt = `Bos mengirimkan berkas dokumen PDF dengan nama "${media.filename || 'Dokumen'}". Berikut adalah isi teks dokumen tersebut:\n"""\n${docText}\n"""\n\n[INSTRUKSI/PERTANYAAN BOS]: ${userMessage || 'Tolong ringkas isi dokumen di atas.'}`;
            const result = await generateUnifiedAiResponse(prompt, chatId);
            const aiReply = result.reply || result.content || 'Gagal memproses dokumen.';
            await msg.reply(aiReply);
            
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `[Dokumen PDF diproses] Ringkasan dikirim`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        }
        // B. Plain Text Document
        else if (media.mimetype === 'text/plain') {
            await msg.reply('📄 Berkas teks diterima! Sedang membaca berkas, mohon tunggu...');
            const docText = Buffer.from(media.data, 'base64').toString('utf-8').trim();
            
            if (!docText) {
                await msg.reply('❌ Maaf Bos, berkas teks tersebut kosong.');
                activeLocks.delete(chatId);
                return true;
            }
            
            const prompt = `Bos mengirimkan berkas teks dengan nama "${media.filename || 'Dokumen'}". Berikut adalah isi berkas tersebut:\n"""\n${docText}\n"""\n\n[INSTRUKSI/PERTANYAAN BOS]: ${userMessage || 'Tolong ringkas isi berkas di atas.'}`;
            const result = await generateUnifiedAiResponse(prompt, chatId);
            const aiReply = result.reply || result.content || 'Gagal memproses berkas.';
            await msg.reply(aiReply);
            
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `[Berkas teks diproses] Jawaban dikirim`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        }
        // C. Images
        else if (media.mimetype.startsWith('image/')) {
            await msg.reply('📸 Foto diterima! Sedang memproses dengan OCR lokal dan analisis, mohon tunggu...');
            const buffer = Buffer.from(media.data, 'base64');
            
            const ocrText = await performOCR(buffer);
            console.log('--- HASIL OCR TEKS ---');
            console.log(ocrText);
            
            if (!ocrText.trim()) {
                await msg.reply('❌ Maaf Bos, tidak terdeteksi teks tulisan di dalam foto tersebut.');
                activeLocks.delete(chatId);
                return true;
            }
            
            const prompt = `Bos mengirimkan sebuah foto. Hasil pembacaan teks (OCR) pada foto tersebut:\n"""\n${ocrText}\n"""\n\n[INSTRUKSI/PERTANYAAN BOS]: ${userMessage || 'Tolong bacakan atau ringkas teks pada foto di atas.'}`;
            const result = await generateUnifiedAiResponse(prompt, chatId);
            const aiReply = result.reply || result.content || 'Gagal menganalisis foto.';
            await msg.reply(aiReply);
            
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `[Foto OCR diproses] Jawaban dikirim`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        }
        else {
            // Berkas format dokumen lain tidak didukung, abaikan secara senyap tanpa membalas
            return false;
        }
    } catch (err) {
        console.error('Gagal membaca media:', err.message);
        await msg.reply(`❌ Terjadi kesalahan saat membaca berkas media: ${err.message}`);
    } finally {
        activeLocks.delete(chatId);
    }
    return true;
}

module.exports = { handleMediaMessage };
