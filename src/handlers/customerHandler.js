// src/handlers/customerHandler.js
'use strict';
const fs = require('fs');
const groupAiCooldowns = new Map();
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { config } = require('../config/config');
const { generateGroupAiResponse } = require('../services/ai/aiService');
const {
    getMimeType,
    findNodeById,
    findNodeByName,
    getAllPromoNodes,
    getStatusEmoji,
    getSortedGroupedChildren,
    renderGroupMenuMessage,
    getGroupKnowledgeContext
} = require('./helpers');

async function simulateTyping(msg, delayMs = 2000) {
    try {
        const chat = await msg.getChat();
        try { await chat.sendSeen(); } catch (_) {}
        await chat.sendStateTyping();
        // Jangan clearState() — WhatsApp otomatis stop indikator "mengetik" 
        // saat pesan dikirim. clearState() sebelum reply malah bikin jeda kosong.
        await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (_) {}
}

async function handleCustomerMessage(msg, {
    chatId, senderId, userMessage, textLower, isGroup, clientInstance, ioInstance,
    activeCfg, configGroupId, gConfigs, customerMenuStates, activeLocks
}) {
    if (activeLocks && activeLocks.has(chatId)) {
        console.log(`[Rate Limit Guard] Chat ID ${chatId} sedang diproses. Mengabaikan pesan beruntun.`);
        return true;
    }

    const sessionKey = `${chatId}_${senderId}`;
    const text = textLower;

    const isTrigger = activeCfg.triggerPrefix ? 
        (text === activeCfg.triggerPrefix.toLowerCase()) : 
        (['menu', 'bantuan', 'help', '/menu', '#menu', '#', 'list'].includes(text));
        
    if (isTrigger) {
        await simulateTyping(msg, 2000);
        customerMenuStates.set(sessionKey, {
            currentNodeId: 'root',
            parentIds: [],
            lastActive: Date.now()
        });
        
        const rootNode = activeCfg.menuTree || { id: "root", name: "Menu Utama", type: "category", children: [] };
        const replyMsg = renderGroupMenuMessage(rootNode, activeCfg);
        await msg.reply(replyMsg);
        
        if (ioInstance) {
            ioInstance.emit('message_log', {
                chatId: chatId,
                body: `[Menu Utama dikirim ke ${senderId.split('@')[0]}]`,
                type: 'outgoing',
                timestamp: Date.now()
            });
        }
        return true;
    }

    // PROMO SPECIAL
    const promoKeywords = ['promo', 'promosi', 'diskon', 'sale', 'promo spesial', 'daftar promo'];
    if (promoKeywords.includes(text)) {
        await simulateTyping(msg, 2000);
        const promoNodes = getAllPromoNodes(activeCfg.menuTree);

        if (promoNodes.length === 0) {
            await msg.reply(`🔍 *Tidak ada promo aktif saat ini.*\n\n_Pantau terus! Promo spesial akan segera hadir._ 🔔`);
            return true;
        }

        promoNodes.sort((a, b) => (a.node.name || '').localeCompare(b.node.name || '', 'id', { sensitivity: 'base' }));

        const numMap = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
        const getNumEmoji = (n) => n.toString().split('').map(d => numMap[parseInt(d,10)] || d).join('');
        const statusEmoji = (s) => s === 'Tersedia' ? '✅' : s === 'Habis' ? '❌' : s === 'Pre-order' ? '⏳' : '❔';

        let promoText = `🔥 *PROMO SPESIAL* 🔥\n`;
        promoText += `━━━━━━━━━━━━━━━━━━━━\n`;
        promoText += `✨ Penawaran terbatas — jangan sampai ketinggalan!\n`;
        promoText += `━━━━━━━━━━━━━━━━━━━━\n\n`;

        promoNodes.forEach(({ node, categoryPath }, idx) => {
            const catLabel = categoryPath && categoryPath.length > 0 ? `_[${categoryPath.join(' › ')}]_\n   ` : '';
            promoText += `${getNumEmoji(idx + 1)} 🔥 *${node.name}* ${statusEmoji(node.status)}\n`;
            if (catLabel) promoText += `   ${catLabel}\n`;
        });

        promoText += `\n━━━━━━━━━━━━━━━━━━━━\n`;
        promoText += `📌 Ketik *nama produk* untuk detail & harga promo!\n`;
        promoText += `🛒 Hubungi admin untuk order sekarang.`;

        await msg.reply(promoText);

        if (ioInstance) {
            ioInstance.emit('message_log', {
                chatId: chatId, body: `[Daftar Promo dikirim ke ${senderId.split('@')[0]}]`,
                type: 'outgoing', timestamp: Date.now()
            });
        }
        return true;
    }

    // Direct Menu Name Matching
    const matchResult = findNodeByName(activeCfg.menuTree || { id: "root", name: "Menu Utama", type: "category", children: [] }, userMessage);
    
    if (matchResult) {
        await simulateTyping(msg, 2000);
        const { node: matchedNode, parentPath } = matchResult;
        
        customerMenuStates.set(sessionKey, {
            currentNodeId: matchedNode.type === 'category' ? matchedNode.id : parentPath[parentPath.length - 1] || 'root',
            parentIds: matchedNode.type === 'category' ? parentPath : parentPath.slice(0, -1),
            lastActive: Date.now()
        });
        
        if (matchedNode.type === 'category') {
            const replyMsg = renderGroupMenuMessage(matchedNode, activeCfg);
            await msg.reply(replyMsg);
        } else {
            const conEmoji = matchedNode.isPromo ? '🔥' : (activeCfg.contentEmoji || '📄');
            const statusSuffix = getStatusEmoji(matchedNode.status);
            const promoHeader = matchedNode.isPromo ? `⚠️ *PROMO SPESIAL HARI INI!* ⚠️\n\n` : '';
            let headerPrefix = (activeCfg.universalHeader && activeCfg.universalHeader.trim() !== '') ? `${activeCfg.universalHeader.trim()}\n\n` : '';
            let replyText = `${headerPrefix}${conEmoji} *${matchedNode.name}*${statusSuffix}\n\n${promoHeader}${matchedNode.text}`;
            const footerText = activeCfg.contentFooter || `_Ketik *0* untuk kembali ke menu sebelumnya, atau *#* untuk kembali ke menu utama._`;
            replyText += `\n\n${footerText}`;
            
            await msg.reply(replyText);
            
            if (matchedNode.media && matchedNode.media.trim() !== '') {
                const mediaPath = path.join(__dirname, '../../media', matchedNode.media.trim());
                if (fs.existsSync(mediaPath)) {
                    const fileData = fs.readFileSync(mediaPath);
                    const base64Data = fileData.toString('base64');
                    const mimeType = getMimeType(mediaPath);
                    const mediaObj = new MessageMedia(mimeType, base64Data, path.basename(mediaPath));
                    await clientInstance.sendMessage(chatId, mediaObj, { quotedMessageId: msg.id._serialized });
                }
            }
        }
        
        if (ioInstance) ioInstance.emit('message_log', { chatId: chatId, body: `[Direct Match: ${matchedNode.name}]`, type: 'outgoing', timestamp: Date.now() });
        return true;
    }

    // Extra triggers matching
    let matchedTrigger = null;
    if (activeCfg.extraTriggers && Array.isArray(activeCfg.extraTriggers)) {
        matchedTrigger = activeCfg.extraTriggers.find(t => {
            if (!t.keyword) return false;
            const kw = t.keyword.toLowerCase().trim();
            if (text !== kw) return false;
            const scope = t.scope || 'all';
            if (scope === 'private') return !isGroup;
            else if (scope === 'group') return isGroup;
            return true;
        });
    }

    // Fallback untuk chat pribadi
    if (!matchedTrigger && !isGroup) {
        for (const gid of Object.keys(gConfigs || {})) {
            if (gid === configGroupId) continue;
            const otherCfg = gConfigs[gid];
            if (otherCfg && otherCfg.extraTriggers && Array.isArray(otherCfg.extraTriggers)) {
                matchedTrigger = otherCfg.extraTriggers.find(t => {
                    if (!t.keyword) return false;
                    const kw = t.keyword.toLowerCase().trim();
                    if (text !== kw) return false;
                    return t.scope === 'private';
                });
                if (matchedTrigger) break;
            }
        }
    }

    if (matchedTrigger) {
        await simulateTyping(msg, 2000);
        await msg.reply(matchedTrigger.reply);
        
        if (matchedTrigger.media && matchedTrigger.media.trim() !== '') {
            const mediaPath = path.join(__dirname, '../../media', matchedTrigger.media.trim());
            if (fs.existsSync(mediaPath)) {
                try {
                    const fileData = fs.readFileSync(mediaPath);
                    const base64Data = fileData.toString('base64');
                    const mimeType = getMimeType(mediaPath);
                    const mediaObj = new MessageMedia(mimeType, base64Data, path.basename(mediaPath));
                    await clientInstance.sendMessage(chatId, mediaObj);
                } catch(err) { console.error('Gagal mengirim media extra trigger:', err.message); }
            }
        }
        
        if (ioInstance) ioInstance.emit('message_log', { chatId: chatId, body: `[Extra Trigger: ${matchedTrigger.keyword}]`, type: 'outgoing', timestamp: Date.now() });
        return true;
    }
    
    // Interactive menu choices navigation
    const session = customerMenuStates.get(sessionKey);
    const isSessionActive = session && (Date.now() - session.lastActive < 120000);
    
    if (isSessionActive) {
        session.lastActive = Date.now();
        
        if (text === '0') {
            await simulateTyping(msg, 2000);
            if (session.parentIds.length > 0) {
                const parentId = session.parentIds.pop();
                session.currentNodeId = parentId;
            } else {
                session.currentNodeId = 'root';
            }
            const currentNode = findNodeById(activeCfg.menuTree, session.currentNodeId) || activeCfg.menuTree;
            const replyMsg = renderGroupMenuMessage(currentNode, activeCfg);
            await msg.reply(replyMsg);
            return true;
        }
        
        if (text === '#') {
            await simulateTyping(msg, 2000);
            session.currentNodeId = 'root';
            session.parentIds = [];
            const replyMsg = renderGroupMenuMessage(activeCfg.menuTree, activeCfg);
            await msg.reply(replyMsg);
            return true;
        }
        
        if (activeCfg.enableNumberNavigation !== false) {
            const numberMatch = text.match(/\b\d+\b/);
            const parsedNum = numberMatch ? numberMatch[0] : text;
            const choiceIndex = parseInt(parsedNum, 10) - 1;
            const currentNode = findNodeById(activeCfg.menuTree, session.currentNodeId) || activeCfg.menuTree;
            
            if (currentNode && currentNode.children) {
                const { flatList: sortedChildren } = getSortedGroupedChildren(currentNode.children);

                if (choiceIndex >= 0 && choiceIndex < sortedChildren.length) {
                    await simulateTyping(msg, 2000);
                    const chosenNode = sortedChildren[choiceIndex];
                    
                    if (chosenNode.type === 'category') {
                        session.parentIds.push(session.currentNodeId);
                        session.currentNodeId = chosenNode.id;
                        const replyMsg = renderGroupMenuMessage(chosenNode, activeCfg);
                        await msg.reply(replyMsg);
                    } else {
                        const conEmoji = chosenNode.isPromo ? '🔥' : (activeCfg.contentEmoji || '📄');
                        const statusSuffix = getStatusEmoji(chosenNode.status);
                        const promoHeader = chosenNode.isPromo ? `⚠️ *PROMO SPESIAL HARI INI!* ⚠️\n\n` : '';
                        let headerPrefix = (activeCfg.universalHeader && activeCfg.universalHeader.trim() !== '') ? `${activeCfg.universalHeader.trim()}\n\n` : '';
                        let replyText = `${headerPrefix}${conEmoji} *${chosenNode.name}*${statusSuffix}\n\n${promoHeader}${chosenNode.text}`;
                        const footerText = activeCfg.contentFooter || `_Ketik *0* untuk kembali ke menu sebelumnya, atau *#* untuk kembali ke menu utama._`;
                        replyText += `\n\n${footerText}`;
                        
                        await msg.reply(replyText);
                        
                        if (chosenNode.media && chosenNode.media.trim() !== '') {
                            const mediaPath = path.join(__dirname, '../../media', chosenNode.media.trim());
                            if (fs.existsSync(mediaPath)) {
                                const fileData = fs.readFileSync(mediaPath);
                                const base64Data = fileData.toString('base64');
                                const mimeType = getMimeType(mediaPath);
                                const mediaObj = new MessageMedia(mimeType, base64Data, path.basename(mediaPath));
                                // Delay 1.5s antar pesan teks & gambar agar tidak instan bersamaan
                                await new Promise(r => setTimeout(r, 1500));
                                await clientInstance.sendMessage(chatId, mediaObj, { quotedMessageId: msg.id._serialized });
                            }
                        }
                    }
                    return true;
                } else {
                    const matchedChild = sortedChildren.find(c => {
                        const cName = c.name ? c.name.toLowerCase().trim() : '';
                        const cAliases = Array.isArray(c.aliases) ? c.aliases : [];
                        return cName === text || cAliases.some(a => a.toLowerCase().trim() === text);
                    });

                    if (matchedChild) {
                        await simulateTyping(msg, 2000);
                        if (matchedChild.type === 'category') {
                            session.parentIds.push(session.currentNodeId);
                            session.currentNodeId = matchedChild.id;
                            const replyMsg = renderGroupMenuMessage(matchedChild, activeCfg);
                            await msg.reply(replyMsg);
                        } else {
                            const conEmoji = matchedChild.isPromo ? '🔥' : (activeCfg.contentEmoji || '📄');
                            const statusSuffix = getStatusEmoji(matchedChild.status);
                            const promoHeader = matchedChild.isPromo ? `⚠️ *PROMO SPESIAL HARI INI!* ⚠️\n\n` : '';
                            let headerPrefix = (activeCfg.universalHeader && activeCfg.universalHeader.trim() !== '') ? `${activeCfg.universalHeader.trim()}\n\n` : '';
                            let replyText = `${headerPrefix}${conEmoji} *${matchedChild.name}*${statusSuffix}\n\n${promoHeader}${matchedChild.text}`;
                            const footerText = activeCfg.contentFooter || `_Ketik *0* untuk kembali ke menu sebelumnya, atau *#* untuk kembali ke menu utama._`;
                            replyText += `\n\n${footerText}`;
                            
                            await msg.reply(replyText);
                            
                            if (matchedChild.media && matchedChild.media.trim() !== '') {
                                const mediaPath = path.join(__dirname, '../../media', matchedChild.media.trim());
                                if (fs.existsSync(mediaPath)) {
                                    const fileData = fs.readFileSync(mediaPath);
                                    const base64Data = fileData.toString('base64');
                                    const mimeType = getMimeType(mediaPath);
                                    const mediaObj = new MessageMedia(mimeType, base64Data, path.basename(mediaPath));
                                    // Delay 1.5s antar pesan teks & gambar agar tidak instan bersamaan
                                    await new Promise(r => setTimeout(r, 1500));
                                    await clientInstance.sendMessage(chatId, mediaObj, { quotedMessageId: msg.id._serialized });
                                }
                            }
                        }
                        return true;
                    }

                    if (/^\d+$/.test(parsedNum)) {
                        await msg.reply(`⚠️ Pilihan tidak valid. Silakan ketik angka (1-${sortedChildren.length}), ketik *0* untuk kembali, atau *#* untuk ke menu utama.`);
                        return true;
                    }
                }
            }
        }
    }
    
    // Check if the customer has muted the AI bot
    let isAiMutedForCustomer = false;
    try {
        const { getDb } = require('../db/sqlite');
        const db = getDb();
        const customerRow = await db.get('SELECT mute_ai FROM shop_customers WHERE phone = ?', senderId.split('@')[0]);
        if (customerRow && customerRow.mute_ai === 1) {
            isAiMutedForCustomer = true;
        }
    } catch (dbErr) {
        console.error('[CRM Check Mute AI Error]:', dbErr.message);
    }

    // AI CS diijinkan merespon di dalam Grup HANYA jika nama/nomor bot disebut/dimention
    const canUseGroupAi = !isAiMutedForCustomer && isGroup && config.group_ai_enabled !== false && activeCfg && activeCfg.useAiFallback;
    const canUsePrivateAi = false;
    
    if (canUseGroupAi || canUsePrivateAi) {
        let shouldTriggerAi = false;
        
        if (isGroup) {
            const getDigits = (str) => str ? str.replace(/\D/g, '') : '';
            const botDigits = clientInstance.info ? getDigits(clientInstance.info.wid.user) : null;
            
            const defaultNames = ['bot', 'ai'];
            const customNames = activeCfg.aiNames ? activeCfg.aiNames.split(',').map(n => n.trim().toLowerCase()).filter(n => n) : defaultNames;
            const escapedNames = customNames.map(n => n.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
            const nameRegex = new RegExp(`(\\b(${escapedNames.join('|')})\\b)`, 'gi');

            const isMentioned = botDigits && (
                (msg.mentionedIds && msg.mentionedIds.some(id => getDigits(id).includes(botDigits))) ||
                msg.body.includes('@' + botDigits) ||
                msg.body.includes(botDigits) ||
                nameRegex.test(msg.body)
            );

            let isReplyToBot = false;
            if (msg.hasQuotedMsg) {
                try {
                    const quotedMsg = await msg.getQuotedMessage();
                    if (quotedMsg && (quotedMsg.fromMe || (botDigits && quotedMsg.author && getDigits(quotedMsg.author).includes(botDigits)))) {
                        isReplyToBot = true;
                    }
                } catch (quoteErr) {
                    console.warn('[Quote Check Warning] Gagal memeriksa pesan kutipan:', quoteErr.message);
                }
            }

            if (isMentioned || isReplyToBot) {
                shouldTriggerAi = true;
            }
        } else {
            shouldTriggerAi = true;
        }
        
        if (shouldTriggerAi) {
            if (isGroup) {
                const lastAiTime = groupAiCooldowns.get(chatId) || 0;
                const now = Date.now();
                if (now - lastAiTime < 5000) {
                    console.log(`[Cooldown Guard] Mengabaikan pemicu AI Grup ${chatId} karena spamming (5s cooldown).`);
                    return true;
                }
                groupAiCooldowns.set(chatId, now);
            }
            activeLocks.add(chatId);
            // Safety Guard: Hapus lock otomatis dalam 45 detik jika AI hang/timeout tanpa respon
            const lockAutoRelease = setTimeout(() => {
                if (activeLocks.has(chatId)) {
                    activeLocks.delete(chatId);
                    console.warn(`[Lock Guard] Lock untuk grup ${chatId} dilepas otomatis setelah 45 detik timeout.`);
                }
            }, 45000);

            let typingInterval = null; // Fix 2: typing loop
            try {
                // Fix 2: Loop typing indicator setiap 4 detik selama AI berpikir
                try {
                    const chatForTyping = await msg.getChat();
                    await chatForTyping.sendStateTyping();
                    typingInterval = setInterval(async () => {
                        try { await chatForTyping.sendStateTyping(); } catch(_) {}
                    }, 4000);
                } catch (chatErr) { console.warn('[CS AI Warning] Gagal typing:', chatErr.message); }

                const knowledge = getGroupKnowledgeContext(activeCfg ? activeCfg.allowedKnowledgeFiles : [], path.join(__dirname, '../../knowledge'));

                // Serialisasi menu RINGKAS (nama + status saja, tanpa teks panjang)
                const serializeMenuCompact = (node, depth = 0) => {
                    if (!node) return '';
                    const statusLabel = node.status ? ` [${node.status}]` : '';
                    const promoLabel  = node.isPromo ? ' 🔥' : '';
                    let res = '  '.repeat(depth) + `- ${node.name}${statusLabel}${promoLabel}\n`;
                    if (node.children && node.children.length > 0) {
                        node.children.forEach(child => { res += serializeMenuCompact(child, depth + 1); });
                    }
                    return res;
                };
                const compactMenu = activeCfg ? serializeMenuCompact(activeCfg.menuTree) : 'Belum ada produk.';

                const schedule = activeCfg && activeCfg.autoCloseSchedule ? activeCfg.autoCloseSchedule : { enabled: false };
                let scheduleText = 'Toko buka 24 jam.';
                if (schedule.enabled) {
                    const daysMap = { 1:'Senin',2:'Selasa',3:'Rabu',4:'Kamis',5:'Jumat',6:'Sabtu',0:'Minggu',7:'Minggu' };
                    const activeDaysStr = schedule.activeDays ? schedule.activeDays.map(d => daysMap[d]).join(', ') : 'Setiap Hari';
                    scheduleText = `Buka: ${activeDaysStr} jam ${schedule.openTime||'08:00'}–${schedule.closeTime||'22:00'} WIB.`;
                }

                const contact = await msg.getContact();
                const customerName = contact.pushname || contact.name || 'Kakak';

                // Fix 4: Cek posisi menu aktif user (jika sedang navigasi)
                const sessionKey = `${chatId}_${senderId}`;
                const activeSession = customerMenuStates.get(sessionKey);
                let sessionContext = '';
                if (activeSession && (Date.now() - activeSession.lastActive < 120000)) {
                    const currentNode = findNodeById(activeCfg.menuTree, activeSession.currentNodeId);
                    if (currentNode) {
                        sessionContext = `\n[POSISI MENU USER SAAT INI]\nUser sedang berada di menu: "${currentNode.name}" (${currentNode.type === 'category' ? 'Kategori' : 'Produk'}). Pertimbangkan konteks ini saat menjawab.`;
                    }
                }

                // ── PROMPT: output JSON terstruktur ──────────────────────────
                const customerPrompt = `
Kamu adalah CS toko digital "Jajan Digital" yang ramah dan sigap.
Panggil pelanggan dengan "Kak" atau "Kak ${customerName}".

[FORMAT OUTPUT — WAJIB, TIDAK BOLEH DILANGGAR]
Balas HANYA dengan JSON berikut, tidak ada teks lain di luar JSON:
{
  "reply": "<isi sesuai aturan di bawah>",
  "show_node": "<nama produk/kategori PERSIS dari daftar, atau 'root', atau null>"
}

[ATURAN show_node — SANGAT PENTING]
WAJIB isi show_node (BUKAN null) jika pesan user mengandung:
- Nama produk apapun dari daftar → gunakan nama PERSIS dari daftar
- Kata "list", "daftar", "semua", "apa aja", "produk apa" → gunakan "root"
- "mau X", "pesan X", "beli X", "ada X?", "X dong", "X min", "harga X", "X berapa", "info X" → nama X dari daftar
- CONTOH: "mau capcut dong" → show_node: "Capcut"
- CONTOH: "ada netflix?" → show_node: "Netflix"
- CONTOH: "list dong min" → show_node: "root"
- CONTOH: "harga spotify" → show_node: "Spotify"

Isi null jika user salam, terima kasih, atau pertanyaan umum (cara order, bedanya paket, dll).

[ATURAN PANJANG reply — BERBEDA BERDASARKAN JENIS PERTANYAAN]
▶ Jika show_node DIISI (ada produk yang ditampilkan):
  → reply = 1-2 kalimat pendek saja sebagai pengantar
  → JANGAN tulis detail harga/produk — sudah ditampilkan otomatis dari database
  → Contoh: "Boleh Kak! Ini detail Capcut untuk Kak ${customerName} 👇"

▶ Jika show_node NULL (pertanyaan umum: cara order, FAQ, dll):
  → reply = jawaban LENGKAP dan DETAIL sesuai kebutuhan
  → Boleh panjang, pakai nomor/poin jika perlu
  → Gunakan info dari [PANDUAN] dan [DOKUMEN PENDUKUNG] di bawah
  → Contoh untuk "cara ordernya gimana?": jelaskan semua langkah pemesanan secara detail

[PANDUAN TOKO]
- Alur order: 1) Pilih produk → 2) Ketik "bayar" untuk QRIS → 3) Bayar → 4) Upload foto bukti transfer di portal web link: /upload-bukti → 5) Salin & tempelkan link bukti ke grup ini → 6) Admin verifikasi manual & kirim akun via chat pribadi
- Paket Private: 1 akun baru khusus 1 pembeli, bisa multi-device
- Paket Sharing: 1 akun bersama, lebih murah, max 1 device login
- Durasi 25-30 hari = 1 bulan penuh

[DAFTAR PRODUK (gunakan nama PERSIS ini untuk show_node)]
${compactMenu}

[JADWAL]
${scheduleText}
${sessionContext}
[DOKUMEN PENDUKUNG]
${knowledge}
`.trim();

                console.log(`[CS AI] Proses pesan: "${userMessage}" | grup: "${activeCfg ? activeCfg.groupName : '-'}"`);
                const response = await generateGroupAiResponse(userMessage, customerPrompt, chatId);
                const rawReply = response.reply || '{}';

                // ── Parse JSON dari AI ────────────────────────────────────────
                let aiIntro   = null;
                let showNode  = null;
                try {
                    // Ekstrak JSON dari respons (kadang AI tambah markdown ```json)
                    const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        aiIntro  = parsed.reply   || null;
                        showNode = parsed.show_node || null;
                    }
                } catch(_) {
                    // Jika AI tidak patuh format JSON, gunakan raw sebagai intro
                    aiIntro  = rawReply;
                    showNode = null;
                }

                // Fallback intro jika kosong
                if (!aiIntro || aiIntro.trim() === '') {
                    aiIntro = 'Ada yang bisa saya bantu, Kak? 😊';
                }

                // ── Kirim intro AI ────────────────────────────────────────────
                await msg.reply(aiIntro);

                // ── Kirim menu dari DB jika AI minta tampilkan node ───────────
                // Guard anti-spam: cek apakah show_node masuk akal untuk pesan ini
                const msgLower = userMessage.toLowerCase();
                const isProductQuery = /list|daftar|menu|produk|harga|beli|mau|pesan|ada |dong|berapa|info|promo/.test(msgLower);
                const shouldShowMenu = showNode
                    && typeof showNode === 'string'
                    && showNode !== 'null'
                    && showNode.trim() !== ''
                    // Kalau show_node=root tapi pesan tidak ada kata tanya produk → skip
                    && !(showNode.toLowerCase() === 'root' && !isProductQuery);

                if (shouldShowMenu) {
                    await new Promise(r => setTimeout(r, 800)); // jeda kecil antar pesan
                    const menuTree = activeCfg && activeCfg.menuTree ? activeCfg.menuTree : null;
                    if (menuTree) {
                        let targetNode = null;
                        if (showNode.toLowerCase() === 'root') {
                            targetNode = menuTree;
                        } else {
                            const found = findNodeByName(menuTree, showNode);
                            // Jika nama tidak ditemukan di DB, JANGAN fallback ke root
                            // (mencegah spam menu saat AI salah tebak nama produk)
                            targetNode = found ? found.node : null;
                        }
                        if (targetNode) {
                            const menuMsg = renderGroupMenuMessage(targetNode, activeCfg);
                            await msg.reply(menuMsg);

                            // Kirim media jika ada di node produk
                            if (targetNode.type !== 'category' && targetNode.media && targetNode.media.trim()) {
                                const mediaPath = path.join(__dirname, '../../media', targetNode.media.trim());
                                if (fs.existsSync(mediaPath)) {
                                    try {
                                        const { getMimeType: gmt } = require('./helpers');
                                        const mimeType = gmt(mediaPath);
                                        const { MessageMedia: MM } = require('whatsapp-web.js');
                                        const mediaObj = new MM(mimeType, fs.readFileSync(mediaPath).toString('base64'), path.basename(mediaPath));
                                        await new Promise(r => setTimeout(r, 500));
                                        await msg.reply(mediaObj);
                                    } catch(_) {}
                                }
                            }
                        }
                    }
                }

                if (ioInstance) ioInstance.emit('message_log', { chatId, body: aiIntro, type: 'outgoing', timestamp: Date.now() });
            } catch (err) {
                console.error('Gagal menjalankan CS AI Fallback:', err.message);
                await msg.reply('Maaf Kak, saat ini sistem CS sedang sibuk. Silakan coba beberapa saat lagi.');
            } finally {
                // Stop typing loop & release lock & clear safety timer
                if (lockAutoRelease) clearTimeout(lockAutoRelease);
                if (typingInterval) clearInterval(typingInterval);
                activeLocks.delete(chatId);
            }
            return true;
        }

    }

    return false;
}

module.exports = { handleCustomerMessage };
