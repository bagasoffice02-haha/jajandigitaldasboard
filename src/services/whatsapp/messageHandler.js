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
    const shopData = await getShopData();

    // 1. Guard check (termasuk auto-CRM save, auto-vcard, checking bot active settings)
    const { shouldIgnore, isSenderHostAdmin } = await checkAndProcessGuards(msg, {
        chatId, senderId, userMessage, isGroup, shopData, clientInstance
    });

    if (shouldIgnore) return;

    // Auto-prefix dot for invoice command
    if (isSenderHostAdmin && msg.hasQuotedMsg) {
        const cleanMsg = userMessage.toLowerCase().trim();
        const foundKw = ['done', 'doen', 'proses', 'process'].find(kw => cleanMsg.startsWith(kw));
        if (foundKw && !cleanMsg.startsWith('.')) {
            userMessage = '.' + userMessage;
            console.log(`[Auto-Command] Mengubah pesan admin "${cleanMsg}" menjadi "${userMessage}"`);
        }
    }

    const textLower = userMessage.toLowerCase().trim();

    // 2. AUTO-ORDER DETECTOR
    const orderHandled = await handleOrderMessage(msg, {
        senderId, chatId, userMessage, textLower, isGroup, clientInstance, ioInstance
    });
    if (orderHandled) return;

    // 3. ADMIN MENU HANDLER
    const adminMenuHandled = await handleAdminMenuMessage(msg, {
        senderId, userMessage, textLower, isSenderHostAdmin, isGroup, shopData,
        clientInstance, ioInstance, setMessagesAdminsOnly: setMessagesAdminsOnlyHelper
    });
    if (adminMenuHandled) return;

    // 4. ADMIN & BOSS QUICK COMMANDS
    const { group_configs: gConfigs } = await getGroupConfigs();
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

    // 5. MEDIA HANDLING (PDF & PICTURES) (Only for Host Admin/Boss)
    const mediaHandled = await handleMediaMessage(msg, {
        chatId, userMessage, isSenderHostAdmin, ioInstance, activeLocks
    });
    if (mediaHandled) return;

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
        chatId, senderId, userMessage, isSenderHostAdmin, ioInstance, activeLocks
    });
    if (bossAiHandled) return;

    // 7. CUSTOMER SERVICE AI FALLBACK FOR CLIENTS & INTERACTIVE NAV
    const customerHandled = await handleCustomerMessage(msg, {
        chatId, senderId, userMessage, textLower, isGroup, clientInstance, ioInstance,
        activeCfg, configGroupId, gConfigs, customerMenuStates, activeLocks
    });
    if (customerHandled) return;

    // 8. UNIFIED AI CLASSIFICATION AND DISPATCHER FOR BOSS
    if (isSenderHostAdmin) {
        await handleUnifiedAiDispatcher(msg, {
            chatId, userMessage, ioInstance, activeLocks
        });
    }
}

module.exports = {
    initMessageHandler,
    handleIncomingMessage
};
