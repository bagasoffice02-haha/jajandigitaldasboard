if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {};
}

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { MessageMedia } = require('whatsapp-web.js');

const { config } = require('../../config/config');
const { getDb } = require('../../db/sqlite');
const { 
    getGroupConfigs, 
    saveGroupConfig, 
    addAdmin, 
    removeAdmin, 
    addCustomer, 
    removeCustomer, 
    getLogHistory, 
    saveLogHistory, 
    addReminder,
    getShopData
} = require('../../db/models');

const { 
    performOCR, 
    isReceiptText, 
    localParseFinanceMessage, 
    parseShortcutMessage, 
    parseNominal,
    extractReceiptDetails
} = require('../ocr/ocrService');

const { sendToGoogleSheets, fetchSheetsSummary } = require('../sheets/sheetsService');
const { 
    generateUnifiedAiResponse, 
    generateGroupAiResponse, 
    appendToMemory,
    getCurrentTimeString
} = require('../ai/aiService');

const FITUR_KEUANGAN = false;

let clientInstance = null;
let ioInstance = null;

const activeLocks = new Set();
const pendingTransactions = new Map();
const customerMenuStates = new Map();

function normalizePhone(phone) {
    if (!phone) return '';
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
        clean = '62' + clean.slice(1);
    }
    return clean;
}

function initMessageHandler(client, io) {
    clientInstance = client;
    ioInstance = io;
}

// Helper: Tentukan Mime-Type file
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.txt': 'text/plain',
        '.zip': 'application/zip',
        '.rar': 'application/vnd.rar',
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript'
    };
    return mimeMap[ext] || 'application/octet-stream';
}

function parseReminderTime(timeStr) {
    const now = new Date();
    const wibOffset = 7 * 60 * 60 * 1000;
    const nowUtc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const nowWib = new Date(nowUtc + wibOffset);

    let targetDate = new Date(nowWib);
    const cleanStr = timeStr.toLowerCase().trim();

    const timeMatch = cleanStr.match(/([01]\d|2[0-3])[:.]([0-5]\d)/);
    if (!timeMatch) return null;

    const hh = parseInt(timeMatch[1], 10);
    const mm = parseInt(timeMatch[2], 10);

    targetDate.setHours(hh, mm, 0, 0);

    if (cleanStr.includes('besok')) {
        targetDate.setDate(targetDate.getDate() + 1);
    } else if (cleanStr.includes('lusa')) {
        targetDate.setDate(targetDate.getDate() + 2);
    } else {
        const dateMatch = cleanStr.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?/);
        if (dateMatch) {
            const day = parseInt(dateMatch[1], 10);
            const month = parseInt(dateMatch[2], 10) - 1;
            const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : targetDate.getFullYear();
            
            targetDate.setDate(day);
            targetDate.setMonth(month);
            targetDate.setFullYear(year);
        } else {
            if (targetDate.getTime() <= nowWib.getTime()) {
                targetDate.setDate(targetDate.getDate() + 1);
            }
        }
    }

    const diff = targetDate.getTime() - nowWib.getTime();
    return new Date(now.getTime() + diff);
}

async function addHistoryLog(type, entry) {
    const newEntry = {
        ...entry,
        tanggal: new Date().toISOString()
    };
    
    const historyLog = await getLogHistory();
    if (type === 'finance') {
        if (!historyLog.finance) historyLog.finance = [];
        historyLog.finance.unshift(newEntry);
        if (historyLog.finance.length > 15) historyLog.finance.pop();
    } else if (type === 'agenda') {
        if (!historyLog.agenda) historyLog.agenda = [];
        historyLog.agenda.unshift(newEntry);
        if (historyLog.agenda.length > 15) historyLog.agenda.pop();
    }
    await saveLogHistory(historyLog);
    if (ioInstance) {
        ioInstance.emit('history_updated', historyLog);
    }
}

function findNodeById(node, id) {
    if (node.id === id) return node;
    if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
            const found = findNodeById(child, id);
            if (found) return found;
        }
    }
    return null;
}

function findNodeByName(node, name, parentPath = []) {
    const searchName = name.toLowerCase().trim();
    const nodeName = node && node.name ? node.name.toLowerCase().trim() : '';
    
    if (nodeName === searchName) {
        return { node, parentPath };
    }
    
    if (node && Array.isArray(node.aliases)) {
        const hasAlias = node.aliases.some(a => a.toLowerCase().trim() === searchName);
        if (hasAlias) {
            return { node, parentPath };
        }
    }
    
    if (node && node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
            const path = [...parentPath, node.id];
            const result = findNodeByName(child, name, path);
            if (result) return result;
        }
    }
    return null;
}

async function getAllContentNodes() {
    const list = [];
    const { group_configs: gConfigs } = await getGroupConfigs();
    const groupIds = Object.keys(gConfigs);
    for (const gId of groupIds) {
        const cfg = gConfigs[gId];
        if (!cfg) continue;
        
        const collect = (node, groupName) => {
            if (!node) return;
            if (node.type === 'content') {
                list.push({
                    groupId: gId,
                    groupName,
                    nodeId: node.id,
                    name: node.name,
                    status: node.status || '',
                    text: node.text || '',
                    isPromo: node.isPromo || false
                });
            }
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach(child => collect(child, groupName));
            }
        };
        
        if (cfg.menuTree) {
            collect(cfg.menuTree, cfg.groupName || gId);
        }
    }
    return list;
}

function getAllPromoNodes(menuTree, categoryPath = []) {
    const results = [];
    
    const collect = (node, path) => {
        if (!node) return;
        
        if (node.type === 'content' && node.isPromo) {
            results.push({
                node: node,
                categoryPath: path
            });
        }
        
        if (node.type === 'category' && node.children) {
            const childPath = node.id === 'root' ? path : [...path, node.name];
            node.children.forEach(child => collect(child, childPath));
        }
    };
    if (menuTree) collect(menuTree, categoryPath);
    return results;
}

function getStatusEmoji(status) {
    if (!status) return '';
    const s = status.trim().toLowerCase();
    if (s === 'tersedia' || s === 'sedia' || s === 'ready') return ' ✅';
    if (s === 'habis' || s === 'kosong' || s === 'tidak tersedia') return ' ❌';
    if (s === 'pre-order' || s === 'preorder' || s === 'po') return ' ⏳';
    return '';
}

function renderGroupMenuMessage(node, cfg = {}) {
    const catEmoji = cfg.categoryEmoji || '📁';
    const conEmoji = cfg.contentEmoji || '📄';
    const showNumber = cfg.enableNumberNavigation !== false;
    
    let msg = '';
    
    if (cfg.universalHeader && cfg.universalHeader.trim() !== '') {
        msg += `${cfg.universalHeader.trim()}\n\n`;
    }
    
    msg += `${catEmoji} *${node.name}*\n\n`;
    
    if (node.text && node.text.trim() !== '') {
        msg += `${node.text.trim()}\n\n`;
    }
    
    if (node.type === 'category' && node.children && node.children.length > 0) {
        const optionIntro = cfg.categoryFooter || "Silakan pilih menu dengan mengetik angkanya:";
        msg += `${optionIntro}\n\n`;
        
        const sortedChildren = [...node.children].sort((a, b) => {
            return (a.name || '').localeCompare(b.name || '', 'id', { sensitivity: 'base' });
        });
        
        const numMap = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
        const getNumberEmoji = (num) => {
            return num.toString().split('').map(digit => numMap[parseInt(digit, 10)] || digit).join('');
        };
        
        sortedChildren.forEach((child, index) => {
            const numEmoji = showNumber ? `${getNumberEmoji(index + 1)} ` : '🔹 ';
            const emoji = child.type === 'category' ? catEmoji : (child.isPromo ? '🔥' : conEmoji);
            const statusSuffix = child.type === 'content' ? getStatusEmoji(child.status) : '';
            const promoBadge = child.isPromo ? ' 🔥' : '';
            msg += `${numEmoji}${emoji} *${child.name}*${promoBadge}${statusSuffix}\n`;
        });
        
        if (node.id !== 'root') {
            msg += `\n${showNumber ? '0️⃣ ' : '🔙 '}*Kembali ke Menu Sebelumnya*`;
            msg += `\n${showNumber ? '#️⃣ ' : '🏠 '}*Kembali ke Menu Utama*`;
        }
    }
    
    if (cfg.universalFooter && cfg.universalFooter.trim() !== '') {
        msg += `\n\n${cfg.universalFooter.trim()}`;
    }
    
    return msg;
}

function getGroupKnowledgeContext(allowedFiles) {
    if (!allowedFiles || allowedFiles.length === 0) {
        return 'Gunakan pengetahuan umum lembaga yang ramah.';
    }
    let context = '';
    allowedFiles.forEach(file => {
        if (file.startsWith('secret_') || file.startsWith('admin_')) return;
        const filePath = path.join(__dirname, '../../../knowledge', file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            context += `\n[BERKAS: ${file}]\n${content}\n`;
        }
    });
    return context || 'Gunakan pengetahuan umum lembaga yang ramah.';
}

async function sendGroupDetailMenu(msg, groupId, senderId) {
    const { group_configs: gConfigs } = await getGroupConfigs();
    const gCfg = gConfigs[groupId];
    if (!gCfg) {
        await msg.reply("⚠️ Konfigurasi grup tidak ditemukan.");
        if (global.adminMenuStates) global.adminMenuStates.delete(senderId);
        return;
    }
    
    const botStatus = gCfg.enabled ? "🟢 AKTIF" : "🔴 NONAKTIF";
    const schedInfo = (gCfg.autoCloseSchedule && gCfg.autoCloseSchedule.enabled)
        ? `🟢 AKTIF (${gCfg.autoCloseSchedule.openTime} - ${gCfg.autoCloseSchedule.closeTime})`
        : "🔴 NONAKTIF";
        
    let detailText = `⚙️ *PENGATURAN GRUP: ${gCfg.groupName || groupId}* ⚙️\n\n` +
                     `🔌 Status Bot: *${botStatus}*\n` +
                     `⏰ Jadwal Otomatis: *${schedInfo}*\n\n` +
                     `Pilih opsi berikut dengan mengetik angkanya:\n\n` +
                     `1️⃣ 🔌 *Toggle Status Bot* (Aktif/Nonaktif)\n` +
                     `2️⃣ 🔓 *Buka Grup* (Manual khusus grup ini)\n` +
                     `3️⃣ 🔒 *Tutup Grup* (Manual khusus grup ini)\n` +
                     `4️⃣ ⏰ *Kelola Jadwal Otomatis*\n` +
                     `5️⃣ ➕ *Tambah Trigger Baru* (Khusus grup ini)\n\n` +
                     `_Ketik *0* untuk kembali ke pilihan grup, atau *batal* untuk keluar._`;
                      
    await msg.reply(detailText);
}

// Main Handler Pesan Masuk
async function handleIncomingMessage(msg) {
    const chatId = msg.from;
    let userMessage = msg.body ? msg.body.trim() : '';
    console.log(`[DEBUG CHAT] Pesan: "${userMessage}" | Dari: ${chatId} | Author: ${msg.author || 'N/A'} | fromMe: ${msg.fromMe} | hasQuoted: ${msg.hasQuotedMsg}`);

    if (chatId === 'status@broadcast') return;

    // Jika pesan dari nomor bot sendiri, abaikan jika bukan command/shortcut agar tidak looping respons
    if (msg.fromMe) {
        const cleanMsg = userMessage.toLowerCase().trim();
        const isCommand = userMessage.startsWith('!') || 
                          userMessage.startsWith('.') || 
                          cleanMsg.startsWith('#agenda') ||
                          (msg.hasQuotedMsg && ['done', 'doen', 'proses', 'process'].some(kw => cleanMsg.startsWith(kw)));
        if (!isCommand) return;
    }

    // Wrap msg.reply to support @user (mention) and @nama (pushname)
    const originalReply = msg.reply.bind(msg);
    msg.reply = async (content, chatIdOrOptions, options) => {
        let opt = options;
        let cid = chatIdOrOptions;
        if (chatIdOrOptions && typeof chatIdOrOptions === 'object') {
            opt = chatIdOrOptions;
            cid = undefined;
        }
        opt = opt || {};

        if (typeof content === 'string') {
            try {
                const contact = await msg.getContact();
                const pushname = contact.pushname || 'Pelanggan';
                const userMentionId = contact.id.user;
                const mentionTag = `@${userMentionId}`;
                
                let replacedContent = content;
                let mentions = [];
                
                if (replacedContent.includes('@user')) {
                    replacedContent = replacedContent.replace(/@user/g, mentionTag);
                    mentions.push(contact);
                }
                if (replacedContent.includes('@nama')) {
                    replacedContent = replacedContent.replace(/@nama/g, pushname);
                }
                
                if (mentions.length > 0) {
                    opt.mentions = (opt.mentions || []).concat(mentions);
                }
                return await originalReply(replacedContent, cid, opt);
            } catch (err) {
                console.error('Error in custom msg.reply wrapper:', err);
            }
        }
        return await originalReply(content, chatIdOrOptions, options);
    };

    const isGroup = msg.isGroupMsg || chatId.includes('@g.us');
    
    const isSenderBoss = (() => {
        if (!config.boss_number || config.boss_number.trim() === '') return false;
        const cleanBoss = normalizePhone(config.boss_number);
        const cleanSender = normalizePhone(senderId);
        return cleanSender === cleanBoss;
    })();

    let isSenderHostAdmin = false;
    const senderId = msg.fromMe ? (clientInstance && clientInstance.info ? clientInstance.info.wid._serialized : (msg.author || msg.from)) : (msg.author || msg.from);
    const sender = senderId.split('@')[0].replace(/\D/g, '') + '@c.us';
    const senderLid = senderId.split('@')[0].replace(/\D/g, '') + '@lid';
    
    const shopData = await getShopData();
    const isPinnedAdmin = (shopData.host_admins || []).some(admin => {
        const cleanAdmin = normalizePhone(admin);
        const cleanSender = normalizePhone(senderId);
        return cleanAdmin === cleanSender;
    });
    isSenderHostAdmin = isPinnedAdmin || isSenderBoss;

    if (!isSenderHostAdmin && isGroup) {
        try {
            const chat = await msg.getChat();
            if (chat.isGroup) {
                const participant = chat.participants.find(p => p.id._serialized === senderId);
                if (participant && (participant.isAdmin || participant.isSuperAdmin)) {
                    isSenderHostAdmin = true;
                }
            }
        } catch (e) {
            console.error('Gagal memverifikasi status admin grup:', e.message);
        }
    }
    
    console.log(`[DEBUG ADMIN] senderId: ${senderId} | isSenderHostAdmin: ${isSenderHostAdmin} | isSenderBoss: ${isSenderBoss}`);
    
    // Auto-prefix dot for invoice command if it's a quote/reply and matches keywords
    if (isSenderHostAdmin && msg.hasQuotedMsg) {
        const cleanMsg = userMessage.toLowerCase().trim();
        const foundKw = ['done', 'doen', 'proses', 'process'].find(kw => cleanMsg.startsWith(kw));
        if (foundKw && !cleanMsg.startsWith('.')) {
            userMessage = '.' + userMessage;
            console.log(`[Auto-Command] Mengubah pesan admin "${cleanMsg}" menjadi "${userMessage}" karena mendeteksi balasan bukti pembayaran.`);
        }
    }

    if (!global.adminMenuStates) {
        global.adminMenuStates = new Map();
    }

    const adminSession = global.adminMenuStates.get(senderId);
    const textLower = userMessage.toLowerCase().trim();

    // AUTO-ORDER DETECTOR
    const isOrderMsg = textLower.startsWith('pesan:') || 
                       textLower.startsWith('pesan ') || 
                       textLower.startsWith('beli:') || 
                       textLower.startsWith('beli ');
                       
    if (isOrderMsg) {
        let details = '';
        if (textLower.startsWith('pesan:')) details = userMessage.substring(6).trim();
        else if (textLower.startsWith('pesan ')) details = userMessage.substring(6).trim();
        else if (textLower.startsWith('beli:')) details = userMessage.substring(5).trim();
        else if (textLower.startsWith('beli ')) details = userMessage.substring(5).trim();
        
        if (details.length > 0) {
            let contactName = '';
            try {
                const contact = await msg.getContact();
                contactName = contact.pushname || contact.name || '';
            } catch (e) {}
            
            let groupName = '';
            if (isGroup) {
                try {
                    const chat = await clientInstance.getChatById(chatId);
                    groupName = chat.name || '';
                } catch(e) {}
            }
            
            const customerNumber = senderId.split('@')[0];
            let displayName = contactName || customerNumber;
            if (groupName) {
                displayName += ` (${groupName})`;
            }
            
            const db = getDb();
            if (db) {
                try {
                    await db.run(
                        'INSERT INTO orders (customer_number, customer_name, details, status) VALUES (?, ?, ?, ?)',
                        customerNumber,
                        displayName,
                        details,
                        'PENDING'
                    );
                    
                    const orderResult = await db.get('SELECT last_insert_rowid() as id');
                    const orderId = orderResult ? orderResult.id : Date.now();
                    
                    if (ioInstance) {
                        ioInstance.emit('order_created', {
                            id: orderId,
                            customer_number: customerNumber,
                            customer_name: displayName,
                            details: details,
                            status: 'PENDING',
                            created_at: new Date().toISOString()
                        });
                    }
                    
                    await msg.reply(`✅ *Pesanan Anda Telah Dicatat!*\n\n` +
                                    `📦 *Detail:* ${details}\n` +
                                    `👤 *Nama:* ${contactName || customerNumber}\n\n` +
                                    `Terima kasih! Admin kami akan segera menghubungi Bos untuk konfirmasi pembayaran.`);
                    return;
                } catch (err) {
                    console.error('Gagal mencatat order ke SQLite:', err.message);
                }
            }
        }
    }

    // Admin Menu root trigger
    if (!isGroup && isSenderHostAdmin && (textLower === '!admin' || textLower === 'admin' || textLower === 'menu admin' || textLower === 'menu' || textLower === 'bantuan' || textLower === 'help')) {
        global.adminMenuStates.set(senderId, { step: 'root', lastActive: Date.now() });
        
        let adminMenuText = `🛡️ *MENU UTAMA HOST ADMIN* 🛡️\n\n` +
                            `Silakan pilih perintah dengan mengetik angkanya:\n\n` +
                            `1️⃣ 👥 *Kelola Konfigurasi Grup WA*\n` +
                            `2️⃣ 🔓 *Buka Toko* (Semua Grup)\n` +
                            `3️⃣ 🔒 *Tutup Toko* (Semua Grup)\n` +
                            `4️⃣ 📦 *Kelola Status Stok Barang*\n` +
                            `5️⃣ 📣 *Kirim Broadcast / Siaran Massal*\n` +
                            `6️⃣ 👥 *Lihat Daftar Pelanggan*\n` +
                            `7️⃣ ➕ *Tambah Trigger Kata Kunci Baru* (Semua Grup)\n` +
                            `8️⃣ 📝 *Update Panduan & Aturan Bot*\n` +
                            `9️⃣ 🛍️ *Tambah Produk ke Menu*\n` +
                            `🔟 ✏️ *Edit / Hapus Produk Menu*\n\n` +
                            `_Ketik *batal* untuk keluar dari menu admin._`;
        
        await msg.reply(adminMenuText);
        return;
    }

    // Active Admin Menu Session
    if (!isGroup && isSenderHostAdmin && adminSession && (Date.now() - adminSession.lastActive < 300000)) {
        adminSession.lastActive = Date.now();
        
        if (textLower === 'batal' || textLower === 'keluar') {
            global.adminMenuStates.delete(senderId);
            await msg.reply("🚪 Keluar dari Menu Host Admin.");
            return;
        }

        const { group_configs: gConfigs } = await getGroupConfigs();

        if (adminSession.step === 'root') {
            if (userMessage === '1') {
                const groupIds = Object.keys(gConfigs);
                if (groupIds.length === 0) {
                    await msg.reply("⚠️ Belum ada grup WA yang dikonfigurasi.");
                    global.adminMenuStates.delete(senderId);
                    return;
                }
                
                adminSession.step = 'select_group';
                adminSession.groupIds = groupIds;
                
                let listText = `👥 *PILIH GRUP WA UNTUK DIATUR* 👥\n\n` +
                               `Ketik nomor grup yang ingin Anda atur:\n\n`;
                groupIds.forEach((gId, idx) => {
                    const gCfg = gConfigs[gId];
                    listText += `*${idx + 1}*. ${gCfg.groupName || gId}\n`;
                });
                listText += `\n_Ketik *batal* untuk membatalkan._`;
                await msg.reply(listText);
                return;
            } else if (userMessage === '2') {
                let successCount = 0;
                const groupIds = Object.keys(gConfigs);
                for (const gId of groupIds) {
                    try {
                        const chat = await clientInstance.getChatById(gId);
                        await chat.setMessagesAdminsOnly(false);
                        await clientInstance.sendMessage(gId, "🔔 *Pemberitahuan:* Toko telah dibuka kembali. Grup dibuka untuk umum!");
                        successCount++;
                    } catch (err) {
                        console.error(`Gagal membuka grup ${gId}:`, err.message);
                    }
                }
                global.adminMenuStates.delete(senderId);
                await msg.reply(`🔓 Toko dibuka! Berhasil membuka ${successCount} grup.`);
                return;
            } else if (userMessage === '3') {
                let successCount = 0;
                const groupIds = Object.keys(gConfigs);
                for (const gId of groupIds) {
                    try {
                        const chat = await clientInstance.getChatById(gId);
                        await chat.setMessagesAdminsOnly(true);
                        await clientInstance.sendMessage(gId, "🔔 *Pemberitahuan:* Toko telah ditutup. Hanya Admin yang dapat mengirim pesan.");
                        successCount++;
                    } catch (err) {
                        console.error(`Gagal menutup grup ${gId}:`, err.message);
                    }
                }
                global.adminMenuStates.delete(senderId);
                await msg.reply(`🔒 Toko ditutup! Berhasil mengunci ${successCount} grup.`);
                return;
            } else if (userMessage === '4') {
                const nodes = await getAllContentNodes();
                if (nodes.length === 0) {
                    await msg.reply("⚠️ Belum ada menu barang bertipe Konten di grup.");
                    global.adminMenuStates.delete(senderId);
                    return;
                }
                
                adminSession.step = 'manage_stock';
                adminSession.nodes = nodes;
                
                let replyText = `📦 *KELOLA STATUS STOK BARANG*\n\n` +
                                 `Pilih nomor barang untuk mengubah statusnya:\n\n`;
                nodes.forEach((n, idx) => {
                    const statusEmoji = n.status === 'Tersedia' ? '🟢' : n.status === 'Habis' ? '🔴' : n.status === 'Pre-order' ? '🟡' : '⚪';
                    replyText += `*${idx + 1}*️⃣ ${statusEmoji} *${n.name}* (${n.groupName})\n   Status: ${n.status || 'Belum Diatur'}\n`;
                });
                replyText += `\nFormat ubah: *[nomor] [status]*\n` +
                             `Pilihan status: *Tersedia*, *Habis*, *Pre-order*\n` +
                             `Contoh ketik: *1 Habis* (untuk mengubah barang nomor 1 menjadi Habis).\n\n` +
                             `_Ketik *batal* untuk membatalkan._`;
                
                await msg.reply(replyText);
                return;
            } else if (userMessage === '5') {
                adminSession.step = 'broadcast_input';
                await msg.reply("📣 *KIRIM BROADCAST MASSAL*\n\nSilakan ketik pesan siaran yang ingin dikirimkan ke seluruh grup aktif:\n\n_Ketik *batal* untuk membatalkan._");
                return;
            } else if (userMessage === '6') {
                let replyText = "👥 *DAFTAR PELANGGAN TOKO:*\n\n";
                if (shopData.customers && shopData.customers.length > 0) {
                    shopData.customers.forEach((c, idx) => {
                        replyText += `${idx + 1}. *${c.name}* (${c.phone})\n`;
                    });
                } else {
                    replyText += "Belum ada pelanggan terdaftar.";
                }
                global.adminMenuStates.delete(senderId);
                await msg.reply(replyText);
                return;
            } else if (userMessage === '7') {
                adminSession.step = 'trigger_input';
                await msg.reply("➕ *TAMBAH TRIGGER KATA KUNCI BARU*\n\nSilakan ketik pemicu dan respon dengan format:\n*[kata_kunci] | [respon_balasan]*\n\nContoh: *alamat | Toko kami berlokasi di Jl. Melati No. 5.*\n\n_Ketik *batal* untuk membatalkan._");
                return;
            } else if (userMessage === '8') {
                const memPath = path.join(__dirname, '../../../knowledge', '00_memori_otomatis.txt');
                let currentMem = '';
                try { currentMem = fs.existsSync(memPath) ? fs.readFileSync(memPath, 'utf-8').trim() : '(Kosong)'; } catch(_) {}
                adminSession.step = 'panduan_input';
                await msg.reply(`📝 *UPDATE PANDUAN & ATURAN BOT*\n\nPanduan saat ini:\n_${currentMem || '(Kosong)'}_ \n\nKetik panduan/aturan bot yang baru untuk menggantikannya.\n\nContoh: _Bot ini adalah asisten toko sepatu Bos. Balas dengan ramah, gunakan bahasa santai._\n\n_Ketik *batal* untuk membatalkan._`);
                return;
            } else if (userMessage === '9') {
                const groupIds = Object.keys(gConfigs);
                if (groupIds.length === 0) {
                    await msg.reply("⚠️ Belum ada grup WA yang dikonfigurasi. Tambahkan grup dulu lewat dashboard web.");
                    global.adminMenuStates.delete(senderId);
                    return;
                }
                adminSession.step = 'add_product_select_group';
                adminSession.groupIds = groupIds;
                let listText9 = `🛍️ *TAMBAH PRODUK KE MENU*\n\nPilih grup tujuan dengan mengetik nomornya:\n\n`;
                let idx9 = 0;
                for (const gId of groupIds) {
                    const gCfg = gConfigs[gId];
                    let displayName = gId;
                    if (gCfg.groupName && !gCfg.groupName.includes('@g.us')) {
                        displayName = gCfg.groupName;
                    } else if (clientInstance) {
                        try {
                            const chat = await clientInstance.getChatById(gId);
                            if (chat && chat.name) displayName = chat.name;
                        } catch (_) {}
                    }
                    listText9 += `${idx9 + 1}. ${displayName}\n`;
                    idx9++;
                }
                listText9 += `\n_Ketik *batal* untuk membatalkan._`;
                await msg.reply(listText9);
                return;
            } else if (userMessage === '10') {
                const groupIds = Object.keys(gConfigs);
                if (groupIds.length === 0) {
                    await msg.reply("⚠️ Belum ada grup WA yang dikonfigurasi.");
                    global.adminMenuStates.delete(senderId);
                    return;
                }
                adminSession.step = 'edit_product_select_group';
                adminSession.groupIds = groupIds;
                let listText10 = `✏️ *EDIT / HAPUS PRODUK MENU*\n\nPilih grup yang produknya ingin diedit:\n\n`;
                let idx10 = 0;
                for (const gId of groupIds) {
                    const gCfg = gConfigs[gId];
                    let displayName = gId;
                    if (gCfg.groupName && !gCfg.groupName.includes('@g.us')) {
                        displayName = gCfg.groupName;
                    } else if (clientInstance) {
                        try {
                            const chat = await clientInstance.getChatById(gId);
                            if (chat && chat.name) displayName = chat.name;
                        } catch (_) {}
                    }
                    listText10 += `${idx10 + 1}. ${displayName}\n`;
                    idx10++;
                }
                listText10 += `\n_Ketik *batal* untuk membatalkan._`;
                await msg.reply(listText10);
                return;
            } else {
                await msg.reply("⚠️ Pilihan tidak valid. Silakan ketik angka 1 sampai 10, atau ketik *batal* untuk keluar.");
                return;
            }
        }
        
        if (adminSession.step === 'select_group') {
            const idx = parseInt(userMessage.trim(), 10) - 1;
            const groupIds = adminSession.groupIds || [];
            const targetGroupId = groupIds[idx];
            if (!targetGroupId) {
                await msg.reply(`⚠️ Pilihan tidak valid. Masukkan angka antara 1 sampai ${groupIds.length}.`);
                return;
            }
            
            adminSession.step = 'group_detail';
            adminSession.selectedGroupId = targetGroupId;
            await sendGroupDetailMenu(msg, targetGroupId, senderId);
            return;
        }

        if (adminSession.step === 'group_detail') {
            const selectedGroupId = adminSession.selectedGroupId;
            const gCfg = gConfigs[selectedGroupId];
            if (!gCfg) {
                await msg.reply("⚠️ Grup tidak ditemukan.");
                global.adminMenuStates.delete(senderId);
                return;
            }
            
            if (userMessage === '0') {
                const groupIds = Object.keys(gConfigs);
                adminSession.step = 'select_group';
                adminSession.groupIds = groupIds;
                
                let listText = `👥 *PILIH GRUP WA UNTUK DIATUR* 👥\n\n` +
                               `Ketik nomor grup yang ingin Anda atur:\n\n`;
                groupIds.forEach((gId, idx) => {
                    const cfg = gConfigs[gId];
                    listText += `*${idx + 1}*. ${cfg.groupName || gId}\n`;
                });
                listText += `\n_Ketik *batal* untuk membatalkan._`;
                await msg.reply(listText);
                return;
            }
            
            if (userMessage === '1') {
                gCfg.enabled = !gCfg.enabled;
                await saveGroupConfig(selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: selectedGroupId });
                await msg.reply(`🔌 Status bot untuk grup *${gCfg.groupName || selectedGroupId}* kini *${gCfg.enabled ? 'AKTIF' : 'NONAKTIF'}*!`);
                await sendGroupDetailMenu(msg, selectedGroupId, senderId);
                return;
            } else if (userMessage === '2') {
                try {
                    const chat = await clientInstance.getChatById(selectedGroupId);
                    await chat.setMessagesAdminsOnly(false);
                    await clientInstance.sendMessage(selectedGroupId, "🔓 *Pemberitahuan:* Toko telah dibuka kembali. Grup dibuka untuk umum!");
                    await msg.reply("🔓 Berhasil membuka grup manual.");
                } catch(err) {
                    await msg.reply("❌ Gagal membuka grup: " + err.message);
                }
                await sendGroupDetailMenu(msg, selectedGroupId, senderId);
                return;
            } else if (userMessage === '3') {
                try {
                    const chat = await clientInstance.getChatById(selectedGroupId);
                    await chat.setMessagesAdminsOnly(true);
                    await clientInstance.sendMessage(selectedGroupId, "🔒 *Pemberitahuan:* Toko telah ditutup. Hanya Admin yang dapat mengirim pesan.");
                    await msg.reply("🔒 Berhasil menutup grup manual.");
                } catch(err) {
                    await msg.reply("❌ Gagal menutup grup: " + err.message);
                }
                await sendGroupDetailMenu(msg, selectedGroupId, senderId);
                return;
            } else if (userMessage === '4') {
                adminSession.step = 'group_scheduler_input';
                await msg.reply("⏰ *KELOLA JADWAL OTOMATIS* ⏰\n\nKetik konfigurasi dengan format:\n*[aktif/nonaktif] | [jam_buka] | [jam_tutup]*\n\nContoh: *aktif | 08:00 | 17:00*\nContoh: *nonaktif*\n\n_Ketik *batal* untuk membatalkan._");
                return;
            } else if (userMessage === '5') {
                adminSession.step = 'group_trigger_input';
                await msg.reply("➕ *TAMBAH TRIGGER BARU GRUP* ➕\n\nKetik trigger baru dengan format:\n*[kata_kunci] | [teks_balasan] | [nama_media_opsional]*\n\nContoh: *alamat | Toko kami di Jl. Melati No. 5*\nContoh: *brosur | Unduh brosur terbaru kami | brosur.pdf*\n\n_Ketik *batal* untuk membatalkan._");
                return;
            } else {
                await msg.reply("⚠️ Pilihan tidak valid. Silakan ketik angka 1 sampai 5, atau 0 untuk kembali.");
                return;
            }
        }

        if (adminSession.step === 'group_scheduler_input') {
            const selectedGroupId = adminSession.selectedGroupId;
            const gCfg = gConfigs[selectedGroupId];
            if (!gCfg) {
                await msg.reply("⚠️ Grup tidak ditemukan.");
                global.adminMenuStates.delete(senderId);
                return;
            }
            
            const parts = userMessage.split('|');
            const mode = parts[0].trim().toLowerCase();
            
            if (mode === 'nonaktif' || mode === 'matikan' || mode === 'off') {
                gCfg.autoCloseSchedule = gCfg.autoCloseSchedule || { enabled: false, openTime: '08:00', closeTime: '17:00', activeDays: [1,2,3,4,5] };
                gCfg.autoCloseSchedule.enabled = false;
                await saveGroupConfig(selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: selectedGroupId });
                await msg.reply("⏰ Jadwal otomatis dinonaktifkan.");
            } else {
                if (parts.length < 3) {
                    await msg.reply("⚠️ Format salah. Gunakan format:\n*aktif | [jam_buka] | [jam_tutup]*\nContoh: *aktif | 08:00 | 17:00*");
                    return;
                }
                const openTime = parts[1].trim();
                const closeTime = parts[2].trim();
                
                gCfg.autoCloseSchedule = gCfg.autoCloseSchedule || { enabled: false, openTime: '08:00', closeTime: '17:00', activeDays: [1,2,3,4,5] };
                gCfg.autoCloseSchedule.enabled = true;
                gCfg.autoCloseSchedule.openTime = openTime;
                gCfg.autoCloseSchedule.closeTime = closeTime;
                await saveGroupConfig(selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: selectedGroupId });
                await msg.reply(`⏰ Jadwal otomatis diaktifkan (${openTime} - ${closeTime}).`);
            }
            
            adminSession.step = 'group_detail';
            await sendGroupDetailMenu(msg, selectedGroupId, senderId);
            return;
        }
        
        if (adminSession.step === 'group_trigger_input') {
            const selectedGroupId = adminSession.selectedGroupId;
            const gCfg = gConfigs[selectedGroupId];
            if (!gCfg) {
                await msg.reply("⚠️ Grup tidak ditemukan.");
                global.adminMenuStates.delete(senderId);
                return;
            }
            
            const parts = userMessage.split('|');
            if (parts.length < 2) {
                await msg.reply("⚠️ Format salah. Gunakan format:\n*[kata_kunci] | [teks_balasan] | [nama_media_opsional]*");
                return;
            }
            
            const keyword = parts[0].trim();
            const reply = parts[1].trim();
            const media = parts[2] ? parts[2].trim() : '';
            
            gCfg.extraTriggers = gCfg.extraTriggers || [];
            gCfg.extraTriggers = gCfg.extraTriggers.filter(t => t.keyword.toLowerCase().trim() !== keyword.toLowerCase().trim());
            gCfg.extraTriggers.push({ keyword, reply, media });
            await saveGroupConfig(selectedGroupId, gCfg);
            if (ioInstance) ioInstance.emit('group_config_updated', { groupId: selectedGroupId });
            
            const mediaInfo = media ? ` dengan media: ${media}` : '';
            await msg.reply(`✅ Berhasil menambahkan trigger *"${keyword}"*${mediaInfo} khusus untuk grup ini.`);
            
            adminSession.step = 'group_detail';
            await sendGroupDetailMenu(msg, selectedGroupId, senderId);
            return;
        }

        if (adminSession.step === 'manage_stock') {
            const parts = userMessage.trim().split(/\s+/);
            if (parts.length < 2) {
                await msg.reply("⚠️ Format salah. Ketik dengan format: *[nomor] [status]*\nContoh: *1 Habis*");
                return;
            }
            
            const index = parseInt(parts[0], 10) - 1;
            const newStatusInput = parts.slice(1).join(' ').trim().toLowerCase();
            
            const validStatuses = {
                'tersedia': 'Tersedia',
                'habis': 'Habis',
                'pre-order': 'Pre-order',
                'preorder': 'Pre-order'
            };
            
            const newStatus = validStatuses[newStatusInput];
            if (!newStatus) {
                await msg.reply("⚠️ Status tidak valid. Pilih antara: *Tersedia*, *Habis*, *Pre-order*");
                return;
            }
            
            const nodes = adminSession.nodes || [];
            const targetNodeInfo = nodes[index];
            if (!targetNodeInfo) {
                await msg.reply(`⚠️ Nomor pilihan tidak valid. Masukkan angka antara 1 sampai ${nodes.length}.`);
                return;
            }
            
            const groupConfig = gConfigs[targetNodeInfo.groupId];
            if (groupConfig && groupConfig.menuTree) {
                const node = findNodeById(groupConfig.menuTree, targetNodeInfo.nodeId);
                if (node) {
                    node.status = newStatus;
                    await saveGroupConfig(targetNodeInfo.groupId, groupConfig);
                    if (ioInstance) ioInstance.emit('group_config_updated', { groupId: targetNodeInfo.groupId });
                    global.adminMenuStates.delete(senderId);
                    await msg.reply(`✅ Berhasil mengubah status *${targetNodeInfo.name}* menjadi *${newStatus}*!`);
                    return;
                }
            }
            
            await msg.reply("❌ Gagal memperbarui status menu.");
            global.adminMenuStates.delete(senderId);
            return;
        }
        
        if (adminSession.step === 'broadcast_input') {
            const broadcastText = userMessage.trim();
            const activeGroupIds = Object.keys(gConfigs).filter(id => gConfigs[id].enabled);
            
            if (activeGroupIds.length === 0) {
                await msg.reply("⚠️ Tidak ada grup aktif untuk dikirimi broadcast.");
                global.adminMenuStates.delete(senderId);
                return;
            }
            
            let successCount = 0;
            for (const gId of activeGroupIds) {
                try {
                    await clientInstance.sendMessage(gId, broadcastText);
                    successCount++;
                } catch (err) {
                    console.error(`Gagal mengirim broadcast admin ke ${gId}:`, err.message);
                }
            }
            
            global.adminMenuStates.delete(senderId);
            await msg.reply(`📣 Broadcast massal berhasil terkirim ke ${successCount} dari ${activeGroupIds.length} grup aktif!`);
            return;
        }
        
        if (adminSession.step === 'trigger_input') {
            const parts = userMessage.split('|');
            if (parts.length < 2) {
                await msg.reply("⚠️ Format salah. Gunakan tanda pembatas pipa (|).\nContoh: *alamat | Jl. Melati No. 5*");
                return;
            }
            
            const keyword = parts[0].trim();
            const reply = parts.slice(1).join('|').trim();
            
            if (!keyword || !reply) {
                await msg.reply("⚠️ Kata kunci dan respon balasan tidak boleh kosong!");
                return;
            }
            
            const groupIds = Object.keys(gConfigs);
            let updateCount = 0;
            for (const gId of groupIds) {
                const gCfg = gConfigs[gId];
                if (gCfg) {
                    gCfg.extraTriggers = gCfg.extraTriggers || [];
                    gCfg.extraTriggers = gCfg.extraTriggers.filter(t => t.keyword.toLowerCase().trim() !== keyword.toLowerCase().trim());
                    gCfg.extraTriggers.push({ keyword, reply });
                    await saveGroupConfig(gId, gCfg);
                    updateCount++;
                }
            }
            
            if (ioInstance) ioInstance.emit('group_config_updated', {});
            global.adminMenuStates.delete(senderId);
            await msg.reply(`✅ Berhasil menambahkan trigger kata kunci *"${keyword}"* ke ${updateCount} grup!`);
            return;
        }

        if (adminSession.step === 'panduan_input') {
            const newPanduan = userMessage.trim();
            const memPath = path.join(__dirname, '../../../knowledge', '00_memori_otomatis.txt');
            try {
                fs.writeFileSync(memPath, newPanduan, 'utf-8');
                if (ioInstance) ioInstance.emit('memory_updated', {});
                global.adminMenuStates.delete(senderId);
                await msg.reply(`✅ *Panduan & Aturan Bot berhasil diperbarui!*\n\nPanduan baru:\n_${newPanduan}_`);
            } catch(err) {
                await msg.reply(`❌ Gagal menyimpan panduan: ${err.message}`);
                global.adminMenuStates.delete(senderId);
            }
            return;
        }

        // ADD NEW PRODUCT FLOW
        if (adminSession.step === 'add_product_select_group') {
            const idx = parseInt(userMessage.trim(), 10) - 1;
            const groupIds = adminSession.groupIds || [];
            const targetGroupId = groupIds[idx];
            if (!targetGroupId) {
                await msg.reply(`⚠️ Pilihan tidak valid. Masukkan angka 1 sampai ${groupIds.length}.`);
                return;
            }
            adminSession.selectedGroupId = targetGroupId;
            const gCfg = gConfigs[targetGroupId];
            const menuTree = gCfg.menuTree || { children: [] };

            const categories = [];
            const collectCats = (node) => {
                if (node.type === 'category') {
                    categories.push({ id: node.id, name: node.name, ref: node });
                    if (node.children) node.children.forEach(collectCats);
                }
            };
            collectCats(menuTree);
            adminSession.categories = categories;

            let catText = `📂 *PILIH KATEGORI*\n\nKetik nomor kategori tujuan produk baru:\n\n`;
            categories.forEach((c, i) => { catText += `${i + 1}. ${c.name}\n`; });
            catText += `${categories.length + 1}. ➕ *Buat Kategori Baru*\n\n_Ketik *batal* untuk membatalkan._`;
            adminSession.step = 'add_product_select_cat';
            await msg.reply(catText);
            return;
        }

        if (adminSession.step === 'add_product_select_cat') {
            const categories = adminSession.categories || [];
            const idx = parseInt(userMessage.trim(), 10) - 1;

            if (idx === categories.length) {
                adminSession.step = 'add_product_new_cat_name';
                await msg.reply(`📂 *BUAT KATEGORI BARU*\n\nKetik nama kategori baru:\n\n_Ketik *batal* untuk membatalkan._`);
                return;
            }

            if (!categories[idx]) {
                await msg.reply(`⚠️ Pilihan tidak valid. Masukkan angka 1 sampai ${categories.length + 1}.`);
                return;
            }
            adminSession.selectedCatId = categories[idx].id;
            adminSession.step = 'add_product_name';
            await msg.reply(`✏️ *NAMA PRODUK*\n\nKetik nama produk yang ingin ditambahkan:\n\n_Ketik *batal* untuk membatalkan._`);
            return;
        }

        if (adminSession.step === 'add_product_new_cat_name') {
            const newCatName = userMessage.trim();
            if (!newCatName) {
                await msg.reply('⚠️ Nama kategori tidak boleh kosong.');
                return;
            }
            const newCatId = 'cat_' + Date.now();
            const newCatNode = { id: newCatId, name: newCatName, type: 'category', text: '', children: [] };
            const gCfg = gConfigs[adminSession.selectedGroupId];
            gCfg.menuTree = gCfg.menuTree || { id: 'root', name: 'Menu Utama', type: 'category', text: '', children: [] };
            gCfg.menuTree.children = gCfg.menuTree.children || [];
            gCfg.menuTree.children.push(newCatNode);
            await saveGroupConfig(adminSession.selectedGroupId, gCfg);
            if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
            adminSession.selectedCatId = newCatId;
            adminSession.step = 'add_product_name';
            await msg.reply(`✅ Kategori *${newCatName}* berhasil dibuat!\n\n✏️ *NAMA PRODUK*\n\nKetik nama produk yang ingin ditambahkan:\n\n_Ketik *batal* untuk membatalkan._`);
            return;
        }

        if (adminSession.step === 'add_product_name') {
            adminSession.newProduct = { name: userMessage.trim() };
            adminSession.step = 'add_product_desc';
            await msg.reply(`📝 *DESKRIPSI / ISI PRODUK*\n\nKetik deskripsi lengkap produk *${adminSession.newProduct.name}*:\n_(Bisa gunakan format WA: *tebal*, _miring_, ~coret~)_\n\n_Ketik *batal* untuk membatalkan._`);
            return;
        }

        if (adminSession.step === 'add_product_desc') {
            adminSession.newProduct.text = userMessage.trim();
            adminSession.step = 'add_product_status';
            await msg.reply(`📊 *STATUS KETERSEDIAAN*\n\nKetik status produk *${adminSession.newProduct.name}*:\n\n1. ✅ Tersedia\n2. ❌ Habis\n3. ⏳ Pre-order\n\n_Ketik *batal* untuk membatalkan._`);
            return;
        }

        if (adminSession.step === 'add_product_status') {
            const statusMap = { '1': 'Tersedia', '2': 'Habis', '3': 'Pre-order', 'tersedia': 'Tersedia', 'habis': 'Habis', 'pre-order': 'Pre-order', 'preorder': 'Pre-order' };
            const status = statusMap[userMessage.trim().toLowerCase()];
            if (!status) {
                await msg.reply('⚠️ Pilihan tidak valid. Ketik 1 (Tersedia), 2 (Habis), atau 3 (Pre-order).');
                return;
            }
            adminSession.newProduct.status = status;
            adminSession.step = 'add_product_promo';
            await msg.reply(`🔥 *PROMO SPESIAL?*\n\nApakah produk *${adminSession.newProduct.name}* merupakan promo spesial?\n\n1. Ya — tandai sebagai 🔥 Promo\n2. Tidak\n\n_Ketik *batal* untuk membatalkan._`);
            return;
        }

        if (adminSession.step === 'add_product_promo') {
            const isPromoMap = { '1': true, 'ya': true, 'yes': true, 'y': true, '2': false, 'tidak': false, 'no': false, 'n': false };
            const isPromo = isPromoMap[userMessage.trim().toLowerCase()];
            if (isPromo === undefined) {
                await msg.reply('⚠️ Ketik 1 (Ya) atau 2 (Tidak).');
                return;
            }
            adminSession.newProduct.isPromo = isPromo;

            const p = adminSession.newProduct;
            const promoStr = isPromo ? '🔥 Ya' : 'Tidak';
            const statusEmoji = { 'Tersedia': '✅', 'Habis': '❌', 'Pre-order': '⏳' }[p.status] || '';
            const confirmText = `📋 *KONFIRMASI PRODUK BARU*\n\n` +
                `*Nama:* ${p.name}\n` +
                `*Status:* ${statusEmoji} ${p.status}\n` +
                `*Promo:* ${promoStr}\n` +
                `*Deskripsi:*\n${p.text}\n\n` +
                `Ketik *simpan* untuk menyimpan, atau *batal* untuk membatalkan.`;
            adminSession.step = 'add_product_confirm';
            await msg.reply(confirmText);
            return;
        }

        if (adminSession.step === 'add_product_confirm') {
            if (textLower !== 'simpan') {
                await msg.reply('❌ Penambahan produk dibatalkan.');
                global.adminMenuStates.delete(senderId);
                return;
            }
            const p = adminSession.newProduct;
            const newProductNode = {
                id: 'prod_' + Date.now(),
                name: p.name,
                type: 'content',
                text: p.text,
                status: p.status,
                isPromo: p.isPromo || false,
                media: ''
            };
            const gCfg = gConfigs[adminSession.selectedGroupId];
            const catNode = findNodeById(gCfg.menuTree, adminSession.selectedCatId);
            if (!catNode) {
                await msg.reply('❌ Kategori tidak ditemukan. Silakan coba lagi dari awal.');
                global.adminMenuStates.delete(senderId);
                return;
            }
            catNode.children = catNode.children || [];
            catNode.children.push(newProductNode);
            await saveGroupConfig(adminSession.selectedGroupId, gCfg);
            if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
            global.adminMenuStates.delete(senderId);
            await msg.reply(`✅ *Produk berhasil ditambahkan!*\n\n🛍️ *${p.name}* telah masuk ke menu grup *${gCfg.groupName || adminSession.selectedGroupId}*.\n\nPelanggan bisa lihat dengan mengetik *list* di grup.`);
            return;
        }

        // EDIT / DELETE PRODUCT FLOW
        if (adminSession.step === 'edit_product_select_group') {
            const idx = parseInt(userMessage.trim(), 10) - 1;
            const groupIds = adminSession.groupIds || [];
            const targetGroupId = groupIds[idx];
            if (!targetGroupId) { await msg.reply(`⚠️ Pilihan tidak valid. Masukkan angka 1 sampai ${groupIds.length}.`); return; }
            adminSession.selectedGroupId = targetGroupId;
            const gCfg = gConfigs[targetGroupId];

            const allProducts = (await getAllContentNodes()).filter(n => n.groupId === targetGroupId);
            if (allProducts.length === 0) {
                await msg.reply('⚠️ Belum ada produk di grup ini. Tambah produk dulu dengan opsi 9.');
                global.adminMenuStates.delete(senderId);
                return;
            }
            adminSession.editProducts = allProducts;

            const numMap = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
            const getN = (n) => n.toString().split('').map(d => numMap[parseInt(d,10)]||d).join('');
            const stEmoji = (s) => s==='Tersedia'?'✅':s==='Habis'?'❌':s==='Pre-order'?'⏳':'❔';

            let prodList = `✏️ *DAFTAR PRODUK — ${gCfg.groupName || targetGroupId}*\n\nKetik nomor produk yang ingin diedit:\n\n`;
            allProducts.forEach((p, i) => {
                const promo = p.isPromo ? ' 🔥' : '';
                prodList += `${getN(i+1)} *${p.name}*${promo} ${stEmoji(p.status)}\n`;
            });
            prodList += `\n_Ketik *batal* untuk membatalkan._`;
            adminSession.step = 'edit_product_pick';
            await msg.reply(prodList);
            return;
        }

        if (adminSession.step === 'edit_product_pick') {
            const idx = parseInt(userMessage.trim(), 10) - 1;
            const allProducts = adminSession.editProducts || [];
            if (!allProducts[idx]) { await msg.reply(`⚠️ Pilihan tidak valid. Masukkan angka 1 sampai ${allProducts.length}.`); return; }
            adminSession.editTargetProduct = allProducts[idx];
            const p = allProducts[idx];
            const stEmoji = (s) => s==='Tersedia'?'✅':s==='Habis'?'❌':s==='Pre-order'?'⏳':'❔';
            const detail = `✏️ *${p.name}* ${p.isPromo?'🔥':''} ${stEmoji(p.status)}\n\n_${p.text ? p.text.substring(0,120)+'...' : '(kosong)'}_\n\nPilih yang ingin diedit:\n\n1️⃣ Ubah Nama\n2️⃣ Ubah Deskripsi / Konten\n3️⃣ Ubah Status Ketersediaan\n4️⃣ Toggle Promo (${p.isPromo ? 'Promo AKTIF → Nonaktifkan' : 'Promo NONAKTIF → Aktifkan'})\n5️⃣ Hapus Produk Ini\n\n0️⃣ Kembali ke Daftar Produk\n\n_Ketik *batal* untuk keluar._`;
            adminSession.step = 'edit_product_action';
            await msg.reply(detail);
            return;
        }

        if (adminSession.step === 'edit_product_action') {
            const p = adminSession.editTargetProduct;
            const gCfg = gConfigs[adminSession.selectedGroupId];
            const node = findNodeById(gCfg.menuTree, p.nodeId);

            if (userMessage === '0') {
                adminSession.step = 'edit_product_select_group';
                adminSession.groupIds = [adminSession.selectedGroupId];
                const allProducts = (await getAllContentNodes()).filter(n => n.groupId === adminSession.selectedGroupId);
                adminSession.editProducts = allProducts;
                const numMap = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
                const getN = (n) => n.toString().split('').map(d => numMap[parseInt(d,10)]||d).join('');
                const stEmoji = (s) => s==='Tersedia'?'✅':s==='Habis'?'❌':s==='Pre-order'?'⏳':'❔';
                let prodList = `✏️ *DAFTAR PRODUK*\n\nKetik nomor produk yang ingin diedit:\n\n`;
                allProducts.forEach((pr, i) => prodList += `${getN(i+1)} *${pr.name}* ${stEmoji(pr.status)}${pr.isPromo?' 🔥':''}\n`);
                prodList += `\n_Ketik *batal* untuk membatalkan._`;
                adminSession.step = 'edit_product_pick';
                await msg.reply(prodList);
                return;
            }

            if (!node) { await msg.reply('❌ Produk tidak ditemukan di pohon menu. Mungkin sudah dihapus.'); global.adminMenuStates.delete(senderId); return; }

            if (userMessage === '1') {
                adminSession.editAction = 'name';
                adminSession.step = 'edit_product_input';
                await msg.reply(`✏️ *UBAH NAMA PRODUK*\n\nNama saat ini: *${node.name}*\n\nKetik nama baru:\n\n_Ketik *batal* untuk membatalkan._`);
                return;
            } else if (userMessage === '2') {
                adminSession.editAction = 'text';
                adminSession.step = 'edit_product_input';
                await msg.reply(`📝 *UBAH DESKRIPSI PRODUK*\n\nDeskripsi saat ini:\n_${node.text || '(kosong)'}_\n\nKetik deskripsi baru (bisa pakai format WA: *tebal*, _miring_, ~coret~):\n\n_Ketik *batal* untuk membatalkan._`);
                return;
            } else if (userMessage === '3') {
                adminSession.editAction = 'status';
                adminSession.step = 'edit_product_input';
                const cur = node.status || 'Tersedia';
                await msg.reply(`📊 *UBAH STATUS PRODUK*\n\nStatus saat ini: *${cur}*\n\n1. ✅ Tersedia\n2. ❌ Habis\n3. ⏳ Pre-order\n\n_Ketik *batal* untuk membatalkan._`);
                return;
            } else if (userMessage === '4') {
                node.isPromo = !node.isPromo;
                await saveGroupConfig(adminSession.selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
                const state = node.isPromo ? '🔥 *AKTIF*' : '❌ *NONAKTIF*';
                await msg.reply(`✅ Promo untuk *${node.name}* sekarang ${state}!`);
                
                adminSession.editTargetProduct.isPromo = node.isPromo;
                adminSession.step = 'edit_product_pick';
                const allProducts2 = (await getAllContentNodes()).filter(n => n.groupId === adminSession.selectedGroupId);
                adminSession.editProducts = allProducts2;
                const numMap2 = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
                const getN2 = (n) => n.toString().split('').map(d => numMap2[parseInt(d,10)]||d).join('');
                const st2 = (s) => s==='Tersedia'?'✅':s==='Habis'?'❌':s==='Pre-order'?'⏳':'❔';
                let prodList2 = `✏️ *DAFTAR PRODUK* (diperbarui)\n\nKetik nomor produk yang ingin diedit:\n\n`;
                allProducts2.forEach((pr, i) => prodList2 += `${getN2(i+1)} *${pr.name}* ${st2(pr.status)}${pr.isPromo?' 🔥':''}\n`);
                prodList2 += `\n_Ketik *batal* untuk membatalkan._`;
                await msg.reply(prodList2);
                return;
            } else if (userMessage === '5') {
                adminSession.editAction = 'delete';
                adminSession.step = 'edit_product_input';
                await msg.reply(`🗑️ *HAPUS PRODUK*\n\nAnda yakin ingin menghapus *${node.name}*?\n\nKetik *hapus* untuk konfirmasi, atau *batal* untuk membatalkan.`);
                return;
            } else {
                await msg.reply('⚠️ Pilihan tidak valid. Ketik 1-5 atau 0 untuk kembali.');
                return;
            }
        }

        if (adminSession.step === 'edit_product_input') {
            const p = adminSession.editTargetProduct;
            const gCfg = gConfigs[adminSession.selectedGroupId];
            const node = findNodeById(gCfg.menuTree, p.nodeId);
            if (!node) { await msg.reply('❌ Produk tidak ditemukan.'); global.adminMenuStates.delete(senderId); return; }

            if (adminSession.editAction === 'name') {
                const oldName = node.name;
                node.name = userMessage.trim();
                await saveGroupConfig(adminSession.selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
                global.adminMenuStates.delete(senderId);
                await msg.reply(`✅ Nama produk berhasil diubah!\n\n*${oldName}* → *${node.name}*`);
                return;
            } else if (adminSession.editAction === 'text') {
                node.text = userMessage.trim();
                await saveGroupConfig(adminSession.selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
                global.adminMenuStates.delete(senderId);
                await msg.reply(`✅ Deskripsi produk *${node.name}* berhasil diperbarui!`);
                return;
            } else if (adminSession.editAction === 'status') {
                const statusMap = { '1': 'Tersedia', '2': 'Habis', '3': 'Pre-order', 'tersedia': 'Tersedia', 'habis': 'Habis', 'pre-order': 'Pre-order', 'preorder': 'Pre-order' };
                const newStatus = statusMap[userMessage.trim().toLowerCase()];
                if (!newStatus) { await msg.reply('⚠️ Pilihan tidak valid. Ketik 1, 2, atau 3.'); return; }
                const oldStatus = node.status;
                node.status = newStatus;
                await saveGroupConfig(adminSession.selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
                global.adminMenuStates.delete(senderId);
                const stEmoji = (s) => s==='Tersedia'?'✅':s==='Habis'?'❌':s==='Pre-order'?'⏳':'❔';
                await msg.reply(`✅ Status *${node.name}* diubah: ${stEmoji(oldStatus)} ${oldStatus} → ${stEmoji(newStatus)} *${newStatus}*`);
                return;
            } else if (adminSession.editAction === 'delete') {
                if (textLower !== 'hapus') { await msg.reply('❌ Penghapusan dibatalkan.'); global.adminMenuStates.delete(senderId); return; }
                
                const deleteNode = (tree, targetId) => {
                    if (!tree.children) return false;
                    const idx = tree.children.findIndex(c => c.id === targetId);
                    if (idx >= 0) { tree.children.splice(idx, 1); return true; }
                    return tree.children.some(c => deleteNode(c, targetId));
                };
                const deleted = deleteNode(gCfg.menuTree, p.nodeId);
                if (deleted) {
                    await saveGroupConfig(adminSession.selectedGroupId, gCfg);
                    if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
                    global.adminMenuStates.delete(senderId);
                    await msg.reply(`🗑️ Produk *${p.name}* berhasil dihapus dari menu.`);
                } else {
                    await msg.reply('❌ Gagal menghapus produk.');
                    global.adminMenuStates.delete(senderId);
                }
                return;
            }
        }
    }

    const { group_configs: gConfigs } = await getGroupConfigs();
    let configGroupId = isGroup ? chatId : config.private_chat_sync_group_id;
    if (!isGroup && !configGroupId) {
        configGroupId = Object.keys(gConfigs || {}).find(id => {
            const mTree = gConfigs[id].menuTree;
            return mTree && mTree.children && mTree.children.length > 0;
        }) || Object.keys(gConfigs || {})[0];
    }
    const cfg = configGroupId ? gConfigs[configGroupId] : null;
    
    let activeCfg = cfg;
    if (!activeCfg && !isGroup) {
        activeCfg = {
            groupName: "Jajan Digital",
            enabled: true,
            useAiFallback: true,
            triggerPrefix: '',
            allowedKnowledgeFiles: [],
            categoryFooter: 'Silakan pilih menu dengan mengetik angkanya:',
            contentFooter: 'Ketik *0* untuk kembali ke menu sebelumnya, atau *#* untuk kembali ke menu utama.',
            menuTree: { id: "root", name: "Menu Utama", type: "category", text: "Silakan pilih salah satu opsi di bawah ini:", children: [] }
        };
    }

    if (isGroup && !activeCfg) {
        return;
    }

    const groupId = chatId;
    const cleanBoss = config.boss_number ? (config.boss_number.replace(/\D/g, '') + '@c.us') : '';

    // Admin/Boss quick commands interception
    if (isSenderHostAdmin && (userMessage.startsWith('!') || userMessage.startsWith('.'))) {
        const cmd = userMessage.toLowerCase().trim();
            
            if (cmd === '.buka' || cmd === '!toko buka') {
                if (!isGroup) {
                    await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup.");
                    return;
                }
                try {
                    const chat = await clientInstance.getChatById(groupId);
                    await chat.setMessagesAdminsOnly(false);
                    await msg.reply("🔓 *Pemberitahuan:* Toko telah dibuka kembali. Grup dibuka untuk umum!");
                } catch (err) {
                    await msg.reply("❌ Gagal membuka grup: " + err.message);
                }
                return;
            }
            
            if (cmd === '.tutup' || cmd === '!toko tutup') {
                if (!isGroup) {
                    await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup.");
                    return;
                }
                try {
                    const chat = await clientInstance.getChatById(groupId);
                    await chat.setMessagesAdminsOnly(true);
                    await msg.reply("🔒 *Pemberitahuan:* Toko telah ditutup. Hanya Admin yang dapat mengirim pesan.");
                } catch (err) {
                    await msg.reply("❌ Gagal menutup grup: " + err.message);
                }
                return;
            }
            
            if (cmd === '.kick') {
                if (!isGroup) {
                    await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup.");
                    return;
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
                return;
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
                        
                        const invoiceText = `📄 *INVOICE PEMBAYARAN* 📄\n` +
                                            `━━━━━━━━━━━━━━━━━━━━\n\n` +
                                            `👤 *Nama:* ${customerName} (@${customerNumber})\n` +
                                            `🆔 *Nomor ID:* ${invoiceId}\n` +
                                            `📌 *Status:* *${statusVal}*\n` +
                                            `📅 *Tanggal:* ${tanggalStr}\n` +
                                            `⏰ *Waktu:* ${waktuStr}\n\n` +
                                            `━━━━━━━━━━━━━━━━━━━━\n` +
                                            `_Terima kasih atas pembayaran Anda! Pesanan Anda telah diverifikasi oleh admin._`;
                                             
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
                return;
            }
            
            if (cmd === '.promote' || cmd === '.demote') {
                if (!isGroup) {
                    await msg.reply("❌ Perintah ini hanya dapat digunakan di dalam grup.");
                    return;
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
                return;
            }
            
            if (cmd === '.akun') {
                const filePath = './knowledge/secret_akun_dan_password.txt';
                if (!fs.existsSync(filePath)) {
                    await msg.reply("🔑 *MANAJEMEN AKUN & PASSWORD* 🔑\n\nBelum ada akun yang disimpan.");
                    return;
                }
                const content = fs.readFileSync(filePath, 'utf-8').trim();
                if (content.length === 0) {
                    await msg.reply("🔑 *MANAJEMEN AKUN & PASSWORD* 🔑\n\nBelum ada akun yang disimpan.");
                    return;
                }
                await msg.reply(`🔑 *DAFTAR AKUN & PASSWORD* 🔑\n\n${content}`);
                return;
            }

            if (cmd.startsWith('.akun ')) {
                const keyword = userMessage.substring(6).trim().toLowerCase();
                const filePath = './knowledge/secret_akun_dan_password.txt';
                if (!fs.existsSync(filePath)) {
                    await msg.reply("❌ Belum ada akun yang disimpan.");
                    return;
                }
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const matched = lines.filter(line => line.toLowerCase().includes(keyword));
                if (matched.length === 0) {
                    await msg.reply(`❌ Tidak ada akun yang cocok dengan kata kunci: *${keyword}*`);
                    return;
                }
                await msg.reply(`🔑 *HASIL PENCARIAN AKUN* 🔑\n\n${matched.join('\n')}`);
                return;
            }

            if (cmd.startsWith('.tambahakun ')) {
                const params = userMessage.substring(12).split('|').map(p => p.trim());
                if (params.length < 3) {
                    await msg.reply("⚠️ *Format salah!*\n\nGunakan: `.tambahakun NamaApp | Username/Email | Password | Keterangan (opsional)`");
                    return;
                }
                const [app, username, password, note = '-'] = params;
                const filePath = './knowledge/secret_akun_dan_password.txt';
                
                if (!fs.existsSync('./knowledge')) {
                    fs.mkdirSync('./knowledge');
                }
                
                const entry = `• [${app}] User: ${username} | Pass: ${password} | Ket: ${note}\n`;
                fs.appendFileSync(filePath, entry, 'utf-8');
                
                await msg.reply(`✅ *Akun Berhasil Disimpan!*\n\n` +
                                `📱 *Aplikasi:* ${app}\n` +
                                `👤 *Username/Email:* ${username}\n` +
                                `🔑 *Password:* ${password}\n` +
                                `📝 *Keterangan:* ${note}`);
                return;
            }

            if (cmd.startsWith('.hapusakun ')) {
                const keyword = userMessage.substring(11).trim().toLowerCase();
                const filePath = './knowledge/secret_akun_dan_password.txt';
                if (!fs.existsSync(filePath)) {
                    await msg.reply("❌ Belum ada akun yang disimpan.");
                    return;
                }
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                const remaining = lines.filter(line => line.trim() !== '' && !line.toLowerCase().includes(keyword));
                const removedCount = lines.length - remaining.length - 1;
                
                if (removedCount <= 0) {
                    await msg.reply(`❌ Tidak ada akun yang cocok dengan kata kunci: *${keyword}*`);
                    return;
                }
                
                fs.writeFileSync(filePath, remaining.join('\n') + '\n', 'utf-8');
                await msg.reply(`✅ Berhasil menghapus ${removedCount} akun yang cocok dengan kata kunci: *${keyword}*`);
                return;
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
                return;
            } else if (cmd === '!bot off') {
                if (gConfigs[groupId]) {
                    gConfigs[groupId].enabled = false;
                    await saveGroupConfig(groupId, gConfigs[groupId]);
                }
                await msg.reply("⚠️ *Bot Dinonaktifkan:* Bot WhatsApp berhenti merespons di grup ini.");
                return;
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
                return;
            }
    }

    if (isGroup && (!activeCfg || !activeCfg.enabled)) {
        return;
    }

    // Auto record customers dynamically to SQLite
    const senderPhone = senderId.split('@')[0];
    const customerExists = (shopData.customers || []).some(c => c.phone.replace(/\D/g, '') === senderPhone);
    if (!customerExists && !isSenderHostAdmin && senderId !== 'status@broadcast') {
        try {
            const contact = await msg.getContact();
            const customerName = contact.pushname || contact.name || `Pelanggan ${senderPhone}`;
            await addCustomer(senderPhone, customerName);
            
            // Auto-send business vCard to new customers
            if (config.auto_send_vcard !== false) {
                const businessName = config.vcard_name || 'CS Jajan Digital';
                const myNumber = (client && client.info && client.info.wid && client.info.wid.user) 
                    ? client.info.wid.user 
                    : '';
                
                if (myNumber) {
                    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${businessName}\nORG:${businessName}\nTEL;TYPE=CELL;waid=${myNumber}:+${myNumber}\nEND:VCARD`;
                    
                    console.log(`[Auto Save VCard] Mengirim kontak bisnis ke pelanggan baru: ${senderPhone}`);
                    await client.sendMessage(senderId, vcard);
                    await client.sendMessage(senderId, `Halo Kak! Kontak kami di atas otomatis dikirim agar Kakak bisa menyimpannya. Silakan simpan nomor kami agar tidak ketinggalan info promo menarik di status/story WhatsApp kami ya! 🙏`);
                }
            }
        } catch (err) {
            console.error('Gagal merekam data pelanggan otomatis:', err.message);
        }
    }

    // Auto order notify to host admins
    const orderKeywords = /\b(beli|pesan|order|daftar|payment|transfer|cod|harga|pembayaran|list|checkout|boking|booking)\b/i;
    if (orderKeywords.test(userMessage) && !isSenderHostAdmin && senderId !== 'status@broadcast') {
        try {
            const contact = await msg.getContact();
            const customerName = contact.pushname || contact.name || `Pelanggan ${senderPhone}`;
            const notifyText = `🔔 *Notifikasi Pesanan Masuk Baru!*\n\n` +
                               `*Pelanggan:* ${customerName} (wa.me/${senderPhone})\n` +
                               `*Grup:* ${activeCfg.groupName || groupId}\n` +
                               `*Pesan:* "${userMessage}"`;
            
            const adminTargets = new Set();
            if (cleanBoss) adminTargets.add(cleanBoss);
            (shopData.host_admins || []).forEach(admin => {
                adminTargets.add(admin.replace(/\D/g, '') + '@c.us');
            });

            for (const adminTarget of adminTargets) {
                try {
                    await clientInstance.sendMessage(adminTarget, notifyText);
                } catch (err) {
                    console.error(`Gagal mengirim notifikasi pesanan ke ${adminTarget}:`, err.message);
                }
            }
        } catch (err) {
            console.error('Gagal memproses notifikasi pesanan otomatis:', err.message);
        }
    }
    
    const sessionKey = `${groupId}_${senderId}`;
    const text = userMessage.toLowerCase().trim();
    
    const isTrigger = activeCfg.triggerPrefix ? 
        (text === activeCfg.triggerPrefix.toLowerCase()) : 
        (['menu', 'bantuan', 'help', '/menu', '#menu', '#', 'list'].includes(text));
        
    if (isTrigger) {
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
                chatId: groupId,
                body: `[Menu Utama dikirim ke ${senderId.split('@')[0]}]`,
                type: 'outgoing',
                timestamp: Date.now()
            });
        }
        return;
    }

    // PROMO SPECIAL
    const promoKeywords = ['promo', 'promosi', 'diskon', 'sale', 'promo spesial', 'daftar promo'];
    if (promoKeywords.includes(text)) {
        const promoNodes = getAllPromoNodes(activeCfg.menuTree);

        if (promoNodes.length === 0) {
            await msg.reply(
                `🔍 *Tidak ada promo aktif saat ini.*\n\n` +
                `_Pantau terus! Promo spesial akan segera hadir._ 🔔`
            );
            return;
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
            const catLabel = categoryPath && categoryPath.length > 0
                ? `_[${categoryPath.join(' › ')}]_\n   `
                : '';
            promoText += `${getNumEmoji(idx + 1)} 🔥 *${node.name}* ${statusEmoji(node.status)}\n`;
            if (catLabel) promoText += `   ${catLabel}\n`;
        });

        promoText += `\n━━━━━━━━━━━━━━━━━━━━\n`;
        promoText += `📌 Ketik *nama produk* untuk detail & harga promo!\n`;
        promoText += `🛒 Hubungi admin untuk order sekarang.`;

        await msg.reply(promoText);

        if (ioInstance) {
            ioInstance.emit('message_log', {
                chatId: groupId,
                body: `[Daftar Promo dikirim ke ${senderId.split('@')[0]}]`,
                type: 'outgoing',
                timestamp: Date.now()
            });
        }
        return;
    }
     
    // QRIS/PAYMENT TRIGGER
    const paymentKeywords = ['bayar', 'qris', 'pembayaran', 'cara bayar'];
    if (paymentKeywords.includes(text)) {
        const pType = activeCfg.paymentType || 'qris';
        const pText = activeCfg.paymentText || `💵 *QRIS PEMBAYARAN RESMI JAJAN DIGITAL* 💵\n\n` +
                                            `Silakan scan QRIS di atas untuk melakukan pembayaran.\n\n` +
                                            `*⚠️ Penting:* Setelah melakukan pembayaran, silakan kirimkan bukti transfer/pembayaran berupa foto/screenshot di grup ini.`;
        const pMedia = activeCfg.paymentMedia !== undefined ? activeCfg.paymentMedia : 'Qris.jpeg';

        if (pType === 'qris' && pMedia) {
            const mediaPath = path.join(__dirname, '../../../media', pMedia);
            if (fs.existsSync(mediaPath)) {
                try {
                    const fileData = fs.readFileSync(mediaPath);
                    const base64Data = fileData.toString('base64');
                    const mimeType = getMimeType(mediaPath);
                    const mediaObj = new MessageMedia(mimeType, base64Data, path.basename(mediaPath));
                    await msg.reply(pText);
                    await clientInstance.sendMessage(groupId, mediaObj, { quotedMessageId: msg.id._serialized });
                    
                    if (ioInstance) {
                        ioInstance.emit('message_log', {
                            chatId: groupId,
                            body: `[Media Pembayaran dikirim ke ${senderId.split('@')[0]}]`,
                            type: 'outgoing',
                            timestamp: Date.now()
                        });
                    }
                    return;
                } catch (err) {
                    console.error('Gagal mengirim media pembayaran:', err.message);
                }
            }
        }

        // Fallback or custom text-only payment info
        await msg.reply(pText);
        
        if (ioInstance) {
            ioInstance.emit('message_log', {
                chatId: groupId,
                body: pText,
                type: 'outgoing',
                timestamp: Date.now()
            });
        }
        return;
    }
    
    // Direct Menu Name Matching
    const matchResult = findNodeByName(activeCfg.menuTree || { id: "root", name: "Menu Utama", type: "category", children: [] }, userMessage);
    
    if (matchResult) {
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
            let replyText = `${conEmoji} *${matchedNode.name}*${statusSuffix}\n\n${promoHeader}${matchedNode.text}`;
            const footerText = activeCfg.contentFooter || `_Ketik *0* untuk kembali ke menu sebelumnya, atau *#* untuk kembali ke menu utama._`;
            replyText += `\n\n${footerText}`;
            
            await msg.reply(replyText);
            
            if (matchedNode.media && matchedNode.media.trim() !== '') {
                const mediaPath = path.join(__dirname, '../../../media', matchedNode.media.trim());
                if (fs.existsSync(mediaPath)) {
                    const fileData = fs.readFileSync(mediaPath);
                    const base64Data = fileData.toString('base64');
                    const mimeType = getMimeType(mediaPath);
                    const mediaObj = new MessageMedia(mimeType, base64Data, path.basename(mediaPath));
                    await clientInstance.sendMessage(groupId, mediaObj, { quotedMessageId: msg.id._serialized });
                }
            }
        }
        
        if (ioInstance) {
            ioInstance.emit('message_log', {
                chatId: groupId,
                body: `[Direct Match: ${matchedNode.name}]`,
                type: 'outgoing',
                timestamp: Date.now()
            });
        }
        return;
    }

    // Extra triggers matching
    if (activeCfg.extraTriggers && Array.isArray(activeCfg.extraTriggers)) {
        const matchedTrigger = activeCfg.extraTriggers.find(t => {
            if (!t.keyword) return false;
            const kw = t.keyword.toLowerCase().trim();
            if (text !== kw) return false;
            
            // Cek filter lingkup pemicuan (scope)
            const scope = t.scope || 'all';
            if (scope === 'private') {
                return !isGroup;
            } else if (scope === 'group') {
                return isGroup;
            }
            return true; // scope 'all' cocok untuk keduanya
        });

        if (matchedTrigger) {
            await msg.reply(matchedTrigger.reply);
            
            if (matchedTrigger.media && matchedTrigger.media.trim() !== '') {
                const mediaPath = path.join(__dirname, '../../../media', matchedTrigger.media.trim());
                if (fs.existsSync(mediaPath)) {
                    try {
                        const fileData = fs.readFileSync(mediaPath);
                        const base64Data = fileData.toString('base64');
                        const mimeType = getMimeType(mediaPath);
                        const mediaObj = new MessageMedia(mimeType, base64Data, path.basename(mediaPath));
                        await clientInstance.sendMessage(groupId, mediaObj);
                    } catch(err) {
                        console.error('Gagal mengirim media extra trigger:', err.message);
                    }
                }
            }
            
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId: groupId,
                    body: `[Extra Trigger: ${matchedTrigger.keyword}]`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
            return;
        }
    }
    
    // Interactive menu choices navigation
    const session = customerMenuStates.get(sessionKey);
    const isSessionActive = session && (Date.now() - session.lastActive < 120000);
    
    if (isSessionActive) {
        session.lastActive = Date.now();
        
        if (text === '0') {
            if (session.parentIds.length > 0) {
                const parentId = session.parentIds.pop();
                session.currentNodeId = parentId;
            } else {
                session.currentNodeId = 'root';
            }
            
            const currentNode = findNodeById(activeCfg.menuTree, session.currentNodeId) || activeCfg.menuTree;
            const replyMsg = renderGroupMenuMessage(currentNode, activeCfg);
            await msg.reply(replyMsg);
            return;
        }
        
        if (text === '#') {
            session.currentNodeId = 'root';
            session.parentIds = [];
            
            const replyMsg = renderGroupMenuMessage(activeCfg.menuTree, activeCfg);
            await msg.reply(replyMsg);
            return;
        }
        
        if (activeCfg.enableNumberNavigation !== false) {
            const numberMatch = text.match(/\b\d+\b/);
            const parsedNum = numberMatch ? numberMatch[0] : text;
            const choiceIndex = parseInt(parsedNum, 10) - 1;
            const currentNode = findNodeById(activeCfg.menuTree, session.currentNodeId) || activeCfg.menuTree;
            
            if (currentNode && currentNode.children) {
                const sortedChildren = [...currentNode.children].sort((a, b) => {
                    return (a.name || '').localeCompare(b.name || '', 'id', { sensitivity: 'base' });
                });

                if (choiceIndex >= 0 && choiceIndex < sortedChildren.length) {
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
                        let replyText = `${conEmoji} *${chosenNode.name}*${statusSuffix}\n\n${promoHeader}${chosenNode.text}`;
                        const footerText = activeCfg.contentFooter || `_Ketik *0* untuk kembali ke menu sebelumnya, atau *#* untuk kembali ke menu utama._`;
                        replyText += `\n\n${footerText}`;
                        
                        await msg.reply(replyText);
                        
                        if (chosenNode.media && chosenNode.media.trim() !== '') {
                            const mediaPath = path.join(__dirname, '../../../media', chosenNode.media.trim());
                            if (fs.existsSync(mediaPath)) {
                                const fileData = fs.readFileSync(mediaPath);
                                const base64Data = fileData.toString('base64');
                                const mimeType = getMimeType(mediaPath);
                                const mediaObj = new MessageMedia(mimeType, base64Data, path.basename(mediaPath));
                                await clientInstance.sendMessage(groupId, mediaObj, { quotedMessageId: msg.id._serialized });
                            }
                        }
                    }
                    return;
                } else {
                    const matchedChild = sortedChildren.find(c => {
                        const cName = c.name ? c.name.toLowerCase().trim() : '';
                        const cAliases = Array.isArray(c.aliases) ? c.aliases : [];
                        return cName === text || cAliases.some(a => a.toLowerCase().trim() === text);
                    });

                    if (matchedChild) {
                        if (matchedChild.type === 'category') {
                            session.parentIds.push(session.currentNodeId);
                            session.currentNodeId = matchedChild.id;
                            const replyMsg = renderGroupMenuMessage(matchedChild, activeCfg);
                            await msg.reply(replyMsg);
                        } else {
                            const conEmoji = matchedChild.isPromo ? '🔥' : (activeCfg.contentEmoji || '📄');
                            const statusSuffix = getStatusEmoji(matchedChild.status);
                            const promoHeader = matchedChild.isPromo ? `⚠️ *PROMO SPESIAL HARI INI!* ⚠️\n\n` : '';
                            let replyText = `${conEmoji} *${matchedChild.name}*${statusSuffix}\n\n${promoHeader}${matchedChild.text}`;
                            const footerText = activeCfg.contentFooter || `_Ketik *0* untuk kembali ke menu sebelumnya, atau *#* untuk kembali ke menu utama._`;
                            replyText += `\n\n${footerText}`;
                            
                            await msg.reply(replyText);
                            
                            if (matchedChild.media && matchedChild.media.trim() !== '') {
                                const mediaPath = path.join(__dirname, '../../../media', matchedChild.media.trim());
                                if (fs.existsSync(mediaPath)) {
                                    const fileData = fs.readFileSync(mediaPath);
                                    const base64Data = fileData.toString('base64');
                                    const mimeType = getMimeType(mediaPath);
                                    const mediaObj = new MessageMedia(mimeType, base64Data, path.basename(mediaPath));
                                    await clientInstance.sendMessage(groupId, mediaObj, { quotedMessageId: msg.id._serialized });
                                }
                            }
                        }
                        return;
                    }

                    if (/^\d+$/.test(parsedNum)) {
                        await msg.reply(`⚠️ Pilihan tidak valid. Silakan ketik angka (1-${sortedChildren.length}), ketik *0* untuk kembali, atau *#* untuk ke menu utama.`);
                        return;
                    }
                }
            }
        }
    }
    
    // AI Fallback inside Group
    if (isGroup) {
        if (!activeCfg || !activeCfg.useAiFallback) {
            return;
        }
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
        
        if (!isMentioned) {
            return;
        }
    }

    if (ioInstance) {
        ioInstance.emit('message_log', {
            chatId,
            body: userMessage || '[Berkas Media/Foto]',
            type: 'incoming',
            timestamp: Date.now()
        });
    }

    // 1. MEDIA HANDLING (PDF & PICTURES) (Only for Host Admin/Boss)
    if (msg.hasMedia && isSenderHostAdmin) {
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
                return;
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
                    return;
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
                    return;
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
                    return;
                }
                
                const isReceipt = FITUR_KEUANGAN && isReceiptText(ocrText);
                console.log('[Local Classifier]: isReceipt =', isReceipt);
                
                if (isReceipt) {
                    const extracted = await extractReceiptDetails(ocrText);
                    
                    if (extracted.nominal > 0) {
                        pendingTransactions.set(chatId, {
                            intent: 'finance',
                            type: 'Pengeluaran',
                            nominal: extracted.nominal,
                            keterangan: extracted.keterangan || 'Catatan Struk'
                        });
                        
                        await msg.reply(`🤖 *Terdeteksi Struk Belanja/Transaksi*:\n- Tipe: *Pengeluaran*\n- Nominal: *Rp ${extracted.nominal.toLocaleString('id-ID')}*\n- Keterangan: *${extracted.keterangan}*\n\nApakah data ini ingin disimpan ke Google Spreadsheet?\n👉 Balas *YA* untuk menyimpan atau *TIDAK* untuk membatalkannya.`);
                        
                        if (ioInstance) {
                            ioInstance.emit('message_log', {
                                chatId,
                                body: `Struk terdeteksi - Menunggu konfirmasi: Rp ${extracted.nominal.toLocaleString('id-ID')} untuk ${extracted.keterangan}`,
                                type: 'outgoing',
                                timestamp: Date.now()
                            });
                        }
                        activeLocks.delete(chatId);
                        return;
                    }
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
                await msg.reply('❌ Maaf Bos, format berkas ini belum didukung. Silakan kirimkan dokumen dalam format PDF/TXT, atau gambar dalam format foto/screenshot.');
            }
        } catch (err) {
            console.error('Gagal membaca media:', err.message);
            await msg.reply(`❌ Terjadi kesalahan saat membaca berkas media: ${err.message}`);
        } finally {
            activeLocks.delete(chatId);
        }
        return;
    }

    const isCommand = 
        userMessage.startsWith('+') || 
        userMessage.startsWith('-') || 
        userMessage.toLowerCase().startsWith('masuk') || 
        userMessage.toLowerCase().startsWith('keluar') || 
        userMessage.toLowerCase().startsWith('#agenda') || 
        userMessage.toLowerCase().startsWith('#akubosmu') || 
        userMessage.toLowerCase().startsWith('#jadwallaporan') ||
        userMessage.toLowerCase().startsWith('#ingatkan') ||
        userMessage === '!reload' ||
        ['help', 'bantuan', 'menu', '#bantuan', '/help'].includes(userMessage.toLowerCase().trim());

    if (isCommand && pendingTransactions.has(chatId)) {
        console.log(`[Command Interrupt] Membatalkan pending transaksi karena mendeteksi perintah/pintasan baru.`);
        pendingTransactions.delete(chatId);
    }

    // 2. CONFIRM PENDING TRANSACTION (YA/TIDAK)
    if (FITUR_KEUANGAN && pendingTransactions.has(chatId)) {
        activeLocks.add(chatId);
        const pending = pendingTransactions.get(chatId);
        const replyText = userMessage.toLowerCase().trim();
        
        if (replyText === 'ya' || replyText === 'yes' || replyText === 'y') {
            try {
                if (pending.intent === 'agenda') {
                    await sendToGoogleSheets({
                        action: 'add_agenda',
                        waktu: pending.waktu,
                        acara: pending.acara
                    });
                    
                    await addHistoryLog('agenda', {
                        waktu: pending.waktu,
                        acara: pending.acara
                    });
                    
                    const successMsg = `✅ Agenda berhasil dijadwalkan Bos!\n\n📅 *Detail Agenda*:\n- Waktu: ${pending.waktu}\n- Acara: ${pending.acara}`;
                    await msg.reply(successMsg);
                    
                    if (ioInstance) {
                        ioInstance.emit('message_log', {
                            chatId,
                            body: `Disimpan ke Sheets: ${pending.waktu} - ${pending.acara}`,
                            type: 'outgoing',
                            timestamp: Date.now()
                        });
                    }
                } else {
                    await sendToGoogleSheets({
                        action: 'add_finance',
                        type: pending.type,
                        nominal: pending.nominal,
                        keterangan: pending.keterangan
                    });
                    
                    await addHistoryLog('finance', {
                        tipe: pending.type,
                        nominal: pending.nominal,
                        keterangan: pending.keterangan
                    });
                    
                    const summary = await fetchSheetsSummary(true);
                    const saldoStr = summary ? `Rp ${summary.saldoKas.toLocaleString('id-ID')}` : 'Tidak diketahui';
                    
                    const successMsg = `✅ Data berhasil disimpan ke Google Spreadsheet Bos!\n\n📋 *Arus Kas Terdaftar*:\n- Tipe: ${pending.type}\n- Nominal: Rp ${pending.nominal.toLocaleString('id-ID')}\n- Keterangan: ${pending.keterangan}\n\n💼 *Saldo Kas Terbaru*: *${saldoStr}*`;
                    await msg.reply(successMsg);
                    
                    if (ioInstance) {
                        ioInstance.emit('message_log', {
                            chatId,
                            body: `Disimpan ke Sheets: Rp ${pending.nominal.toLocaleString('id-ID')} (${pending.keterangan})`,
                            type: 'outgoing',
                            timestamp: Date.now()
                        });
                    }
                }
                pendingTransactions.delete(chatId);
            } catch (err) {
                console.error('Gagal menyimpan data pending ke Sheets:', err.message);
                await msg.reply(`❌ Gagal menyimpan data ke Google Sheets: ${err.message}`);
            }
        } else if (replyText === 'tidak' || replyText === 'no' || replyText === 't') {
            pendingTransactions.delete(chatId);
            await msg.reply('❌ Pencatatan dibatalkan Bos.');
            
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `Pencatatan dibatalkan oleh pengguna`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        } else {
            await msg.reply('⚠️ Mohon balas dengan *YA* untuk menyimpan data ini, atau *TIDAK* untuk membatalkannya.');
        }
        activeLocks.delete(chatId);
        return;
    }

    // 3. ADMIN & BOSS COMMANDS (Only for Host Admin/Boss)
    if (isSenderHostAdmin) {
        if (userMessage === '!reload') {
            console.log(`[Admin Command] Melakukan pemindaian ulang folder knowledge...`);
            await msg.reply('✅ File basis pengetahuan berhasil dimuat ulang di server.');
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: '!reload (Admin Command)',
                    type: 'system-cmd',
                    timestamp: Date.now()
                });
            }
            return;
        }

        // MEMORY UPDATE (#akubosmu)
        if (userMessage.toLowerCase().startsWith('#akubosmu')) {
            const memoryText = userMessage.substring('#akubosmu'.length).trim();
            if (!memoryText) {
                await msg.reply('❌ Memori tidak boleh kosong Bos. Contoh: #akubosmu Sandi wifi kantor adalah "admin123"');
                return;
            }
            
            activeLocks.add(chatId);
            const chat = await msg.getChat();
            await chat.sendStateTyping();
            
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
            return;
        }

        // REPORT TIME CONFIG (#jadwallaporan)
        if (userMessage.toLowerCase().startsWith('#jadwallaporan')) {
            const timeInput = userMessage.substring('#jadwallaporan'.length).trim();
            const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
            
            if (!timeRegex.test(timeInput)) {
                await msg.reply('❌ Format waktu salah Bos. Harap gunakan format HH:MM (24 jam). Contoh: *#jadwallaporan 17:00*');
                return;
            }

            activeLocks.add(chatId);
            const chat = await msg.getChat();
            await chat.sendStateTyping();
            
            try {
                config.report_time = timeInput;
                const configPath = path.join(__dirname, '../../../config.json');
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
                
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
            return;
        }

        // ADD REMINDER (#ingatkan)
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
                return;
            }

            const targetDate = parseReminderTime(timePart);
            if (!targetDate) {
                await msg.reply('❌ Gagal membaca format waktu Bos. Contoh waktu yang didukung:\n- *15:30* (hari ini)\n- *besok 09:00*\n- *lusa 10:00*\n- *20/06 jam 14:00*');
                return;
            }

            activeLocks.add(chatId);
            const chat = await msg.getChat();
            await chat.sendStateTyping();

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
            return;
        }

        // HELP / BANTUAN
        const helpKeywords = ['help', 'bantuan', 'menu', '#bantuan', '/help'];
        if (helpKeywords.includes(userMessage.toLowerCase().trim())) {
            activeLocks.add(chatId);
            const chat = await msg.getChat();
            await chat.sendStateTyping();
            
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
            return;
        }
    }

    // 4. TEMPLATE FINANCE SHORTCUT
    const shortcut = FITUR_KEUANGAN ? parseShortcutMessage(userMessage) : null;
    if (shortcut) {
        if (shortcut.nominal <= 0) {
            await msg.reply('❌ Nominal uang tidak valid. Pastikan formatnya benar (contoh: 50rb, 1.5jt, 250000).');
            return;
        }

        activeLocks.add(chatId);
        try {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
            } catch (chatErr) {
                console.warn('[Finance Chat Warning] Gagal mengirim status typing:', chatErr.message);
            }

            await sendToGoogleSheets({
                action: 'add_finance',
                type: shortcut.type,
                nominal: shortcut.nominal,
                keterangan: shortcut.keterangan
            });

            await addHistoryLog('finance', {
                tipe: shortcut.type,
                nominal: shortcut.nominal,
                keterangan: shortcut.keterangan
            });

            const summary = await fetchSheetsSummary(true);
            const saldoStr = summary ? `Rp ${summary.saldoKas.toLocaleString('id-ID')}` : 'Tidak diketahui';

            const successMsg = `✅ Berhasil dicatat Bos!\n\n📋 *Rincian Arus Kas*:\n- Tipe: ${shortcut.type}\n- Nominal: Rp ${shortcut.nominal.toLocaleString('id-ID')}\n- Keterangan: ${shortcut.keterangan}\n\n💼 *Saldo Kas Terbaru*: *${saldoStr}*`;
            await msg.reply(successMsg);

            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `Dicatat: ${shortcut.type} Rp ${shortcut.nominal.toLocaleString('id-ID')} - ${shortcut.keterangan}`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        } catch (err) {
            console.error('Gagal mencatat keuangan ke Google Sheets:', err.message);
            await msg.reply(`❌ Gagal mencatat keuangan ke Google Sheets: ${err.message}`);
        } finally {
            activeLocks.delete(chatId);
        }
        return;
    }

    // 5. TEMPLATE AGENDA SHORTCUT
    if (isSenderHostAdmin && userMessage.toLowerCase().startsWith('#agenda')) {
        const content = userMessage.substring('#agenda'.length).trim();
        let waktu = '';
        let acara = '';

        const parts = content.split(/[|-]/);
        if (parts.length >= 2) {
            waktu = parts[0].trim();
            acara = parts.slice(1).join('-').trim();
        } else {
            waktu = 'Hari ini';
            acara = content;
        }

        if (!acara) {
            await msg.reply('❌ Keterangan acara tidak boleh kosong. Format: #agenda [waktu] | [nama acara]');
            return;
        }

        activeLocks.add(chatId);
        try {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
            } catch (chatErr) {
                console.warn('[Agenda Chat Warning] Gagal mengirim status typing:', chatErr.message);
            }

            await sendToGoogleSheets({
                action: 'add_agenda',
                waktu: waktu,
                acara: acara
            });

            await addHistoryLog('agenda', {
                waktu: waktu,
                acara: acara
            });

            const successMsg = `✅ Agenda berhasil dijadwalkan Bos!\n\n📅 *Detail Agenda*:\n- Waktu: ${waktu}\n- Acara: ${acara}`;
            await msg.reply(successMsg);

            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `Jadwal Baru: ${waktu} - ${acara}`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        } catch (err) {
            console.error('Gagal mencatat agenda ke Google Sheets:', err.message);
            await msg.reply(`❌ Gagal mencatat agenda ke Google Sheets: ${err.message}`);
        } finally {
            activeLocks.delete(chatId);
        }
        return;
    }

    // 6. CUSTOMER SERVICE AI FALLBACK FOR CLIENTS
    if (!isSenderHostAdmin) {
        activeLocks.add(chatId);
        try {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
            } catch (chatErr) {
                console.warn('[CS AI Warning] Gagal mengirim status typing:', chatErr.message);
            }
            const knowledge = getGroupKnowledgeContext(activeCfg ? activeCfg.allowedKnowledgeFiles : []);
            
            const serializeMenuTree = (node, depth = 0) => {
                if (!node) return '';
                const typeLabel = node.type === 'category' ? 'Kategori' : 'Produk';
                const statusLabel = node.status ? ` [Status: ${node.status}]` : '';
                const promoLabel = node.isPromo ? ' [🔥 PROMO]' : '';
                
                let res = '  '.repeat(depth) + `- ${node.name} (${typeLabel})${statusLabel}${promoLabel}`;
                if (node.text) {
                    res += `: ${node.text.replace(/\n/g, ' ')}`;
                }
                res += '\n';
                
                if (node.children && node.children.length > 0) {
                    node.children.forEach(child => {
                        res += serializeMenuTree(child, depth + 1);
                    });
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
            
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: aiReply,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        } catch (err) {
            console.error('Gagal menjalankan CS AI Fallback:', err.message);
            await msg.reply('Maaf Kak, saat ini sistem CS sedang sibuk. Silakan coba beberapa saat lagi.');
        } finally {
            activeLocks.delete(chatId);
        }
        return;
    }

    // 7. UNIFIED AI CLASSIFICATION AND DISPATCHER FOR BOSS
    activeLocks.add(chatId);
    try {
        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping();
        } catch (chatErr) {
            console.warn('[Unified AI Warning] Gagal mengirim status typing:', chatErr.message);
        }
        console.log(`[Unified AI] Memproses pesan dari ${chatId}: "${userMessage}"`);
        const result = await generateUnifiedAiResponse(userMessage, chatId);
        console.log(`[Unified AI] Hasil analisis:`, JSON.stringify(result));
        
        if (FITUR_KEUANGAN && result.intent === 'finance' && result.data && result.data.nominal > 0) {
            const data = result.data;
            pendingTransactions.set(chatId, {
                intent: 'finance',
                type: data.type || 'Pengeluaran',
                nominal: data.nominal,
                keterangan: data.keterangan || 'Catatan Keuangan'
            });
            
            const replyMsg = `🤖 *Terdeteksi Catatan Keuangan*:\n- Tipe: *${data.type || 'Pengeluaran'}*\n- Nominal: *Rp ${data.nominal.toLocaleString('id-ID')}*\n- Keterangan: *${data.keterangan || 'Catatan Keuangan'}*\n\nApakah data ini ingin disimpan ke Google Spreadsheet?\n👉 Balas *YA* untuk menyimpan atau *TIDAK* untuk membatalkannya.`;
            await msg.reply(replyMsg);
            
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `Terdeteksi keuangan (AI) - Menunggu konfirmasi: Rp ${data.nominal.toLocaleString('id-ID')} untuk ${data.keterangan}`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        } 
        else if (result.intent === 'agenda' && result.data && result.data.acara) {
            const data = result.data;
            pendingTransactions.set(chatId, {
                intent: 'agenda',
                waktu: data.waktu || 'Hari ini',
                acara: data.acara
            });
            
            const replyMsg = `🤖 *Terdeteksi Agenda Baru*:\n- Waktu: *${data.waktu || 'Hari ini'}*\n- Acara: *${data.acara}*\n\nApakah agenda ini ingin dijadwalkan ke Google Spreadsheet?\n👉 Balas *YA* untuk menyimpan atau *TIDAK* untuk membatalkannya.`;
            await msg.reply(replyMsg);
            
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `Terdeteksi agenda (AI) - Menunggu konfirmasi: ${data.waktu} - ${data.acara}`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        } 
        else if (result.intent === 'reminder' && result.data && result.data.waktu && result.data.pesan) {
            const data = result.data;
            const targetDate = parseReminderTime(data.waktu);
            if (targetDate) {
                await addReminder(chatId, data.pesan, targetDate.toISOString());

                const formattedTime = targetDate.toLocaleString('id-ID', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Jakarta'
                }) + ' WIB';

                const replyMsg = `🤖 *Pengingat Dijadwalkan Otomatis*:\n- *Pengingat*: ${data.pesan}\n- *Waktu*: ${formattedTime}\n\nSaya akan mengirimkan pesan pengingat kepada Bos pada waktu tersebut.`;
                await msg.reply(replyMsg);

                if (ioInstance) {
                    ioInstance.emit('message_log', {
                        chatId,
                        body: `Menjadwalkan Pengingat (AI): "${data.pesan}" untuk ${formattedTime}`,
                        type: 'outgoing',
                        timestamp: Date.now()
                    });
                }
            } else {
                const aiReply = result.reply || `Saya mengerti Bos ingin diingatkan tentang "${data.pesan}" pada "${data.waktu}". Namun saya gagal mengurai format waktunya. Harap gunakan format yang lebih spesifik seperti *besok jam 10:00* atau *15:30*.`;
                await msg.reply(aiReply);
                
                if (ioInstance) {
                    ioInstance.emit('message_log', {
                        chatId,
                        body: aiReply,
                        type: 'outgoing',
                        timestamp: Date.now()
                    });
                }
            }
        }
        else {
            console.log(`[AI Chat] Memproses balasan obrolan umum untuk: "${userMessage}"`);
            const aiReply = result.reply || 'Maaf Bos, saya tidak mengerti maksud pesan tersebut.';
            await msg.reply(aiReply);
            
            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: aiReply,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        }
    } catch (err) {
        console.error('Gagal menjalankan klasifikasi AI / Chat:', err.message);
        
        let providerName = 'Lokal';
        if (config.provider === 'gemini') providerName = 'Gemini';
        else if (config.provider === 'groq') providerName = 'Groq';
        else if (config.provider === 'deepseek') providerName = 'DeepSeek';
        else if (config.provider === 'qwen') providerName = 'Qwen';
        else if (config.provider === 'openrouter') providerName = 'OpenRouter';

        const errorFallbackMsg = `⚠️ Maaf Bos, server AI ${providerName} tidak merespon. Silakan gunakan pintasan berikut:\n- Catat Keuangan: \`+ 50rb Beli bensin\`\n- Catat Agenda: \`#agenda Besok jam 10 | Rapat\`\n- Atau ketik *bantuan* untuk panduan lengkap.`;
        await msg.reply(errorFallbackMsg);
        
        if (ioInstance) {
            ioInstance.emit('message_log', {
                chatId,
                body: errorFallbackMsg,
                type: 'outgoing',
                timestamp: Date.now()
            });
        }
    } finally {
        activeLocks.delete(chatId);
    }
}

module.exports = {
    initMessageHandler,
    handleIncomingMessage
};
