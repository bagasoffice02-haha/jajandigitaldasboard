if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {};
}

const { config } = require('../../config/config');
const { getGroupConfigs, getShopData } = require('../../db/models');

const setMessagesAdminsOnlyHelper = (...args) => require('./client').setMessagesAdminsOnlyHelper(...args);

// Import dari helper module
const { normalizePhone } = require('../../handlers/helpers');

// Import dari modular handler files
const { checkAndProcessGuards } = require('../../handlers/guardHandler');
const { handleOrderMessage } = require('../../handlers/orderHandler');
const { handleAdminMenuMessage } = require('../../handlers/adminMenuHandler');
const { handleAdminCommandMessage } = require('../../handlers/adminCommandHandler');
const { handleMediaMessage } = require('../../handlers/mediaHandler');
const { handleBossAiMessage, handleUnifiedAiDispatcher } = require('../../handlers/bossAiHandler');
const { handleCustomerMessage } = require('../../handlers/customerHandler');

let clientInstance = null;
let ioInstance = null;

const activeLocks = new Set();
const customerMenuStates = new Map();
const pendingTransactions = new Map();
const groupCommandCooldowns = new Map();

// ─── Anti-Spam: Per-User Cooldown & Flood Protection ───────────────────────
const userLastReplyTime = new Map();   // senderId → timestamp balasan terakhir
const userMsgBucket = new Map();       // senderId → [timestamps] dalam 1 menit
const USER_REPLY_COOLDOWN_MS  = 3000;  // 3 detik min antar balasan ke 1 user
const USER_MAX_MSG_PER_MINUTE = 15;    // max pesan diproses per user per menit
const USER_FLOOD_WARN_AT      = 10;    // kirim peringatan sekali di pesan ke-10

function checkUserAntiSpam(senderId) {
    const now = Date.now();

    // 1. Flood protection: hitung pesan dalam 60 detik terakhir
    const bucket = (userMsgBucket.get(senderId) || []).filter(t => now - t < 60000);
    bucket.push(now);
    userMsgBucket.set(senderId, bucket);

    if (bucket.length > USER_MAX_MSG_PER_MINUTE) {
        console.log(`[AntiSpam] FLOOD: ${senderId} (${bucket.length} msg/mnt) — diabaikan`);
        return { blocked: true, reason: 'flood' };
    }
    if (bucket.length === USER_FLOOD_WARN_AT) {
        return { blocked: false, warn: true }; // kirim peringatan tapi tetap proses
    }

    // 2. Per-user cooldown
    const lastReply = userLastReplyTime.get(senderId) || 0;
    if (now - lastReply < USER_REPLY_COOLDOWN_MS) {
        console.log(`[AntiSpam] COOLDOWN: ${senderId} (${now - lastReply}ms < ${USER_REPLY_COOLDOWN_MS}ms) — diabaikan`);
        return { blocked: true, reason: 'cooldown' };
    }

    return { blocked: false };
}

function markUserReplied(senderId) {
    userLastReplyTime.set(senderId, Date.now());
}

function initMessageHandler(client, io) {
    clientInstance = client;
    ioInstance = io;
}

// Main Handler Pesan Masuk
async function handleIncomingMessage(msg) {
    const chatId = msg.from;
    let userMessage = msg.body ? msg.body.trim() : '';
    console.log(`[DEBUG CHAT] Pesan: "${userMessage}" | Dari: ${chatId} | Author: ${msg.author || 'N/A'} | fromMe: ${msg.fromMe} | hasQuoted: ${msg.hasQuotedMsg}`);

    if (chatId === 'status@broadcast') return;

    const senderId = msg.fromMe ? (clientInstance && clientInstance.info ? clientInstance.info.wid._serialized : (msg.author || msg.from)) : (msg.author || msg.from);

    // Jika pesan dari nomor bot sendiri, abaikan jika bukan command/shortcut
    if (msg.fromMe) {
        const cleanMsg = userMessage.toLowerCase().trim();
        const isCommand = userMessage.startsWith('!') || 
                          userMessage.startsWith('.') || 
                          cleanMsg.startsWith('#agenda');
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

        if (typeof content === 'string' && (content.includes('@user') || content.includes('@nama'))) {
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
    const { group_configs: gConfigs } = await getGroupConfigs();
    const shopData = await getShopData();

    // 1. Guard check (termasuk auto-CRM save, auto-vcard, checking bot active settings)
    const { shouldIgnore, isSenderHostAdmin, isSenderBoss } = await checkAndProcessGuards(msg, {
        chatId, senderId, userMessage, isGroup, shopData, clientInstance
    });

    if (shouldIgnore) return;

    // Jika bukan grup dan bukan admin, abaikan chat pribadi sepenuhnya (100% matikan bot/AI di Japri)
    if (!isGroup && !isSenderHostAdmin) {
        return;
    }

    // Untuk pesan di Grup dari anggota biasa (non-admin): abaikan segera jika tidak ada kaitan dengan bot (hemat CPU & memori)
    if (isGroup && !isSenderHostAdmin) {
        const cleanMsg = userMessage.toLowerCase().trim();
        const isMenuTrigger = ['menu', 'bantuan', 'help', '#', 'list'].includes(cleanMsg);
        const isCommand = userMessage.startsWith('!') || userMessage.startsWith('.') || userMessage.startsWith('#');
        
        const getDigits = (str) => str ? str.replace(/\D/g, '') : '';
        const botDigits = clientInstance && clientInstance.info ? getDigits(clientInstance.info.wid.user) : null;
        
        const defaultNames = ['bot', 'ai'];
        const activeCfg = gConfigs[chatId] || {};
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
        const hasQuote = msg.hasQuotedMsg || Boolean(msg.quotedMsg) || Boolean(msg._data && (msg._data.quotedMsg || msg._data.quotedParticipant));
        if (hasQuote) {
            try {
                const quotedMsg = await msg.getQuotedMessage();
                if (quotedMsg && (quotedMsg.fromMe || (botDigits && quotedMsg.author && getDigits(quotedMsg.author).includes(botDigits)))) {
                    isReplyToBot = true;
                }
            } catch (quoteErr) {
                console.warn('[Early Quote Check Warning] Gagal:', quoteErr.message);
            }
        }

        // Cek pencarian produk/kategori langsung secara sensitif/kasus (Direct Product Name/Alias Match)
        const { findNodeByName } = require('../../handlers/helpers');
        const isProductMatch = activeCfg.menuTree ? !!findNodeByName(activeCfg.menuTree, userMessage) : false;

        if (!isMenuTrigger && !isCommand && !isMentioned && !isReplyToBot && !isProductMatch) {
            return;
        }
    }

    const textLower = userMessage.toLowerCase().trim();

    // 2. AUTO-ORDER DETECTOR
    const orderHandled = await handleOrderMessage(msg, {
        senderId, chatId, userMessage, textLower, isGroup, clientInstance, ioInstance
    });
    if (orderHandled) return;

    // Cooldown untuk perintah grup (Mencegah spam perintah dari anggota grup biasa)
    if (isGroup && !isSenderHostAdmin) {
        const cleanMsg = userMessage.toLowerCase().trim();
        const isCmd = cleanMsg.startsWith('.') || cleanMsg.startsWith('!');
        if (isCmd) {
            const lastCmdTime = groupCommandCooldowns.get(chatId) || 0;
            const now = Date.now();
            if (now - lastCmdTime < 5000) { // Cooldown 5 detik
                console.log(`[Cooldown Guard] Mengabaikan perintah grup "${userMessage}" karena spamming (5s cooldown).`);
                return;
            }
            groupCommandCooldowns.set(chatId, now);
        }

        // ─── Per-user anti-spam (cooldown + flood) ───────────────────────
        const spamCheck = checkUserAntiSpam(senderId);
        if (spamCheck.blocked) return; // abaikan diam-diam
        if (spamCheck.warn) {
            // Peringatan sekali saat mendekati limit
            try {
                await msg.reply(
                    `⚠️ _Hei, sepertinya kamu mengirim pesan terlalu cepat!_\n` +
                    `_Mohon tunggu sebentar sebelum mengirim pesan lagi ya. 🙏_`
                );
            } catch(_) {}
        }
    }

    // 3. ADMIN MENU HANDLER
    const adminMenuHandled = await handleAdminMenuMessage(msg, {
        senderId, userMessage, textLower, isSenderHostAdmin, isGroup, shopData,
        clientInstance, ioInstance, setMessagesAdminsOnly: setMessagesAdminsOnlyHelper
    });
    if (adminMenuHandled) return;

    const groupId = chatId;
    const adminCommandHandled = await handleAdminCommandMessage(msg, {
        senderId, userMessage, textLower, isSenderHostAdmin, isGroup, shopData,
        clientInstance, ioInstance, setMessagesAdminsOnly: setMessagesAdminsOnlyHelper,
        gConfigs, groupId
    });
    if (adminCommandHandled) return;

    // Dapatkan konfigurasi grup aktif untuk navigasi menu client
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

    if (isGroup && (!activeCfg || !activeCfg.enabled)) {
        return;
    }

    // 5. MEDIA HANDLING (PDF & PICTURES) (Only untuk Boss)
    // Di grup, hanya respon media jika bot disebut/tag agar tidak salah respon chat kiriman foto biasa.
    let shouldProcessMedia = isSenderBoss;
    if (isGroup && isSenderBoss) {
        const getDigits = (str) => str ? str.replace(/\D/g, '') : '';
        const botDigits = clientInstance && clientInstance.info ? getDigits(clientInstance.info.wid.user) : null;
        
        const defaultNames = ['bot', 'ai'];
        const activeCfg = gConfigs[chatId] || {};
        const customNames = activeCfg.aiNames ? activeCfg.aiNames.split(',').map(n => n.trim().toLowerCase()).filter(n => n) : defaultNames;
        const escapedNames = customNames.map(n => n.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
        const nameRegex = new RegExp(`(\\b(${escapedNames.join('|')})\\b)`, 'gi');

        const isMentioned = botDigits && (
            (msg.mentionedIds && msg.mentionedIds.some(id => getDigits(id).includes(botDigits))) ||
            msg.body.includes('@' + botDigits) ||
            msg.body.includes(botDigits) ||
            nameRegex.test(msg.body)
        );
        shouldProcessMedia = isMentioned;
    }

    if (shouldProcessMedia) {
        const mediaHandled = await handleMediaMessage(msg, {
            chatId, userMessage, isSenderHostAdmin: isSenderBoss, ioInstance, activeLocks
        });
        if (mediaHandled) return;
    }

    // Command interrupt check for finance / agenda
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

    // 6. BOSS AI & COMMANDS (#akubosmu, #jadwallaporan, #ingatkan, help/bantuan)
    const bossAiHandled = await handleBossAiMessage(msg, {
        chatId, senderId, userMessage, isSenderHostAdmin: isSenderBoss, ioInstance, activeLocks
    });
    if (bossAiHandled) return;

    // 7. CUSTOMER SERVICE AI FALLBACK FOR CLIENTS & INTERACTIVE NAV
    const customerHandled = await handleCustomerMessage(msg, {
        chatId, senderId, userMessage, textLower, isGroup, clientInstance, ioInstance,
        activeCfg, configGroupId, gConfigs, customerMenuStates, activeLocks
    });
    if (customerHandled) {
        // Tandai waktu balasan terakhir ke user ini (untuk per-user cooldown)
        if (!isSenderHostAdmin) markUserReplied(senderId);
        return;
    }

    // 8. UNIFIED AI CLASSIFICATION AND DISPATCHER FOR BOSS
    // Di grup, hanya jalankan asisten AI jika Bos menyebut nama/tag bot agar tidak menjawab pengumuman biasa.
    let shouldTriggerBossAi = isSenderBoss;
    if (isGroup && isSenderBoss) {
        const getDigits = (str) => str ? str.replace(/\D/g, '') : '';
        const botDigits = clientInstance && clientInstance.info ? getDigits(clientInstance.info.wid.user) : null;
        
        const defaultNames = ['bot', 'ai'];
        const activeCfg = gConfigs[chatId] || {};
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
            } catch (_) {}
        }

        shouldTriggerBossAi = isMentioned || isReplyToBot;
    }

    if (shouldTriggerBossAi) {
        await handleUnifiedAiDispatcher(msg, {
            chatId, userMessage, ioInstance, activeLocks
        });
    }
}

module.exports = {
    initMessageHandler,
    handleIncomingMessage
};
