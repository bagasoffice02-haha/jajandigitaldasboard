// src/handlers/customerHandler.js
'use strict';
const fs = require('fs');
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
        await new Promise(resolve => setTimeout(resolve, 2000));
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
     
    // QRIS/PAYMENT TRIGGER
    const paymentKeywords = ['bayar', 'qris', 'pembayaran', 'cara bayar'];
    if (paymentKeywords.includes(text)) {
        await simulateTyping(msg, 2000);
        const pType = activeCfg.paymentType || 'qris';
        const pText = activeCfg.paymentText || `💵 *QRIS PEMBAYARAN RESMI JAJAN DIGITAL* 💵\n\nSilakan scan QRIS di atas untuk melakukan pembayaran.\n\n*⚠️ Penting:* Setelah melakukan pembayaran, silakan kirimkan bukti transfer/pembayaran berupa foto/screenshot di grup ini.`;
        const pMedia = activeCfg.paymentMedia !== undefined ? activeCfg.paymentMedia : 'Qris.jpeg';

        if (pType === 'qris' && pMedia) {
            const mediaPath = path.join(__dirname, '../../media', pMedia);
            if (fs.existsSync(mediaPath)) {
                try {
                    const fileData = fs.readFileSync(mediaPath);
                    const base64Data = fileData.toString('base64');
                    const mimeType = getMimeType(mediaPath);
                    const mediaObj = new MessageMedia(mimeType, base64Data, path.basename(mediaPath));
                    await msg.reply(pText);
                    await clientInstance.sendMessage(chatId, mediaObj, { quotedMessageId: msg.id._serialized });
                    if (ioInstance) ioInstance.emit('message_log', { chatId: chatId, body: `[Media Pembayaran dikirim ke ${senderId.split('@')[0]}]`, type: 'outgoing', timestamp: Date.now() });
                    return true;
                } catch (err) { console.error('Gagal mengirim media pembayaran:', err.message); }
            }
        }

        await msg.reply(pText);
        if (ioInstance) ioInstance.emit('message_log', { chatId: chatId, body: pText, type: 'outgoing', timestamp: Date.now() });
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

    // AI Fallback dinonaktifkan sepenuhnya agar bot hanya membalas triger menu terkonfigurasi
    const canUseGroupAi = false;
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
            if (isMentioned) {
                shouldTriggerAi = true;
            }
        } else {
            shouldTriggerAi = true;
        }
        
        if (shouldTriggerAi) {
            activeLocks.add(chatId);
            try {
                try {
                    const chat = await msg.getChat();
                    await chat.sendStateTyping();
                } catch (chatErr) { console.warn('[CS AI Warning] Gagal mengirim status typing:', chatErr.message); }
                const knowledge = getGroupKnowledgeContext(activeCfg ? activeCfg.allowedKnowledgeFiles : [], path.join(__dirname, '../../knowledge'));
                
                const serializeMenuTree = (node, depth = 0) => {
                    if (!node) return '';
                    const typeLabel = node.type === 'category' ? 'Kategori' : 'Produk';
                    const statusLabel = node.status ? ` [Status: ${node.status}]` : '';
                    const promoLabel = node.isPromo ? ' [🔥 PROMO]' : '';
                    let res = '  '.repeat(depth) + `- ${node.name} (${typeLabel})${statusLabel}${promoLabel}`;
                    if (node.text) res += `: ${node.text.replace(/\n/g, ' ')}`;
                    res += '\n';
                    if (node.children && node.children.length > 0) {
                        node.children.forEach(child => { res += serializeMenuTree(child, depth + 1); });
                    }
                    return res;
                };
                const serializedMenu = activeCfg ? serializeMenuTree(activeCfg.menuTree) : 'Belum ada menu produk terkonfigurasi.';
                
                const schedule = activeCfg && activeCfg.autoCloseSchedule ? activeCfg.autoCloseSchedule : { enabled: false };
                let scheduleText = 'Toko buka 24 jam.';
                if (schedule.enabled) {
                    const daysMap = { 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu', 0: 'Minggu', 7: 'Minggu' };
                    const activeDaysStr = schedule.activeDays ? schedule.activeDays.map(d => daysMap[d]).join(', ') : 'Setiap Hari';
                    scheduleText = `Toko buka & beroperasi pada hari: ${activeDaysStr} mulai jam ${schedule.openTime || '08:00'} sampai ${schedule.closeTime || '22:00'} WIB. Di luar jam operasional tersebut sistem toko tutup/offline otomatis.`;
                }
                
                const contact = await msg.getContact();
                const customerName = contact.pushname || contact.name || 'Kakak';
                
                const customerPrompt = `
Tugas Anda adalah menjadi Asisten Pelayanan Pelanggan (Customer Service) yang sangat ramah, sopan, dan sigap untuk toko kami "Jajan Digital" yang menyediakan berbagai APK premium murah dan terpercaya.
Pelanggan yang Anda hadapi saat ini bernama: ${customerName}.

[PANDUAN UTAMA CS JAJAN DIGITAL]
1. Sapa pelanggan dengan panggilan "Kak", "Kakak", atau "Kak ${customerName}". JANGAN PERNAH panggil mereka "Bos".
2. INFORMASI PRODUK & HARGA: Anda sangat dipersilakan untuk membaca [DAFTAR MENU & PRODUK AKTIF SAAT INI] serta [DOKUMEN PENDUKUNG / PENGETAHUAN TOKO] di bawah. Gunakan data tersebut untuk menjawab pertanyaan pelanggan secara langsung, detail, dan akurat mengenai ketersediaan produk, harga, paket, spesifikasi akun, maupun status stoknya. JANGAN PERNAH merekomendasikan, menawarkan, atau mengarang produk/aplikasi premium yang tidak ada pada daftar menu aktif di bawah (misalnya Disney+ atau produk lainnya jika tidak tertera di daftar). Jika produk tidak tertera di daftar, katakan bahwa produk tersebut belum tersedia.
3. JAWAB LANGSUNG: Jika pelanggan menanyakan produk tertentu (misal: "Ada Netflix?", "Berapa harga Canva?", dll), jawablah secara langsung dengan detail harga dan deskripsi dari database di bawah. Jangan memaksa mereka untuk mengetik perintah "list" jika mereka bertanya langsung, tetapi Anda tetap boleh menawarkan perintah "list" sebagai info tambahan untuk melihat seluruh produk.
4. Alur Pemesanan Cepat (Terangkan jika pelanggan ingin order):
   - Pertama: Pelanggan melihat produk (baik bertanya langsung kepada Anda atau mengetik perintah *list*).
   - Kedua: Pelanggan memilih produk untuk melihat harga dan detail paket.
   - Ketiga: Pelanggan mengetik perintah *bayar* untuk menampilkan barcode QRIS pembayaran resmi toko kami.
   - Keempat: Pelanggan melakukan pembayaran lalu mengirimkan Foto Bukti Transfer ke dalam grup ini.
   - Kelima: Setelah pembayaran diverifikasi oleh Admin, produk/detail akun premium akan dikirim oleh Admin secara pribadi via Chat Pribadi (PC).
5. FAQ Penting:
   - Jika ditanya perbedaan "Private" dan "Sharing", jelaskan bahwa Private = 1 akun baru khusus 1 pembeli (bisa multi-device), sedangkan Sharing = 1 akun bersama pembeli lain (lebih murah, max login 1 device).
   - Durasi 25 - 30 hari dihitung penuh sebagai 1 Bulan.
6. Jawablah secara singkat, ramah, padat, dan hindari penjelasan bertele-tele.

[JADWAL OPERASIONAL TOKO]
${scheduleText}

[DAFTAR MENU & PRODUK AKTIF SAAT INI]
${serializedMenu}

[DOKUMEN PENDUKUNG / PENGETAHUAN TOKO]
${knowledge}
`.trim();

                console.log(`[CS AI] Memproses pesan pelanggan ${chatId}: "${userMessage}" menggunakan config grup: "${activeCfg ? activeCfg.groupName : 'Tanpa Grup'}" (${configGroupId}) dengan ${activeCfg && activeCfg.menuTree && activeCfg.menuTree.children ? activeCfg.menuTree.children.length : 0} produk.`);
                const response = await generateGroupAiResponse(userMessage, customerPrompt, chatId);
                const aiReply = response.reply || 'Ada yang bisa saya bantu, Kak?';
                await msg.reply(aiReply);
                
                if (ioInstance) ioInstance.emit('message_log', { chatId, body: aiReply, type: 'outgoing', timestamp: Date.now() });
            } catch (err) {
                console.error('Gagal menjalankan CS AI Fallback:', err.message);
                await msg.reply('Maaf Kak, saat ini sistem CS sedang sibuk. Silakan coba beberapa saat lagi.');
            } finally {
                activeLocks.delete(chatId);
            }
            return true;
        }
    }

    return false;
}

module.exports = { handleCustomerMessage };
