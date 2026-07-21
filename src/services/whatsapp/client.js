const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const { config } = require('../../config/config');
const { addAdmin, getShopData } = require('../../db/models');
const { handleIncomingMessage, initMessageHandler } = require('./messageHandler');
let client = null;
let currentStatus = 'DISCONNECTED';
let currentQrCode = null;
let isRestarting = false;
let isExplicitRestart = false;
let initWatchdogTimer = null;
let ioInstance = null;
let syncInterval = null;

// Puppeteer Arguments for RAM stability
const puppeteerOptions = {
    handleSIGINT: true,
    handleSIGTERM: true,
    handleSIGHUP: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-extensions'
    ]
};

// Automatic detection of Android platform (Termux) or custom path in config.json
if (process.platform === 'android') {
    const termuxChromiumPath = '/data/data/com.termux/files/usr/bin/chromium';
    if (fs.existsSync(termuxChromiumPath)) {
        puppeteerOptions.executablePath = termuxChromiumPath;
        console.log(`[WhatsApp] Terdeteksi berjalan di Termux. Menggunakan chromium: ${termuxChromiumPath}`);
    } else {
        console.warn(`[WhatsApp] Peringatan: Berjalan di Termux tetapi chromium tidak ditemukan di ${termuxChromiumPath}.`);
    }
} else if (config.puppeteer_executable_path && config.puppeteer_executable_path.trim() !== '') {
    const customPath = config.puppeteer_executable_path.trim();
    if (fs.existsSync(customPath)) {
        puppeteerOptions.executablePath = customPath;
        console.log(`[WhatsApp] Menggunakan custom puppeteer executablePath: ${puppeteerOptions.executablePath}`);
    } else {
        console.warn(`[WhatsApp] Custom puppeteer executablePath tidak ditemukan di: "${customPath}". Menggunakan Chromium bawaan.`);
    }
}

function cleanupChromeCache(sessionPath) {
    const cacheDirs = [
        path.join(sessionPath, 'Default', 'Cache'),
        path.join(sessionPath, 'Default', 'Code Cache'),
        path.join(sessionPath, 'Default', 'GPUCache')
    ];
    cacheDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log(`[Cleanup Cache] Berhasil menghapus cache: ${path.basename(dir)}`);
            } catch (err) {
                // Abaikan jika sedang dikunci
            }
        }
    });
}

function cleanupHeadlessChrome() {
    return new Promise((resolve) => {
        const sessionPath = path.join(__dirname, '../../../session');
        const absoluteSessionPath = path.resolve(sessionPath);

        if (process.platform !== 'win32') {
            // Linux: bunuh proses chrome terkait sessionPath dan hapus lock files
            const killCmd = `pkill -9 -f "${absoluteSessionPath}"`;
            exec(killCmd, () => {
                setTimeout(() => {
                    if (fs.existsSync(sessionPath)) {
                        const removeLocks = (dir) => {
                            try {
                                const entries = fs.readdirSync(dir, { withFileTypes: true });
                                for (const entry of entries) {
                                    const fullPath = path.join(dir, entry.name);
                                    if (entry.isDirectory()) {
                                        removeLocks(fullPath);
                                    } else if (entry.name === 'LOCK' || entry.name === 'SingletonLock') {
                                        try { fs.unlinkSync(fullPath); } catch(_) {}
                                    }
                                }
                            } catch(_) {}
                        };
                        removeLocks(sessionPath);
                        cleanupChromeCache(sessionPath);
                        console.log('[Cleanup Linux] Chrome dihentikan & semua file LOCK sesi dihapus.');
                    }
                    resolve();
                }, 1500);
            });
            return;
        }
        
        // Escape backslashes for PowerShell
        const pathBackslashes = absoluteSessionPath.replace(/\\/g, '\\\\');
        const pathForwardSlashes = absoluteSessionPath.replace(/\\/g, '/');
        
        // Escape single quotes just in case
        const p1 = pathBackslashes.replace(/'/g, "''");
        const p2 = pathForwardSlashes.replace(/'/g, "''");
        
        const killCmd = `powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'chrome.exe'\\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*${p1}*' -or $_.CommandLine -like '*${p2}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`;
        
        exec(killCmd, () => {
            setTimeout(() => {
                if (fs.existsSync(sessionPath)) {
                    const removeLocks = (dir) => {
                        try {
                            const entries = fs.readdirSync(dir, { withFileTypes: true });
                            for (const entry of entries) {
                                const fullPath = path.join(dir, entry.name);
                                if (entry.isDirectory()) {
                                    removeLocks(fullPath);
                                } else if (entry.name === 'LOCK') {
                                    try { fs.unlinkSync(fullPath); } catch(_) {}
                                }
                            }
                        } catch(_) {}
                    };
                    removeLocks(sessionPath);
                    cleanupChromeCache(sessionPath);
                    console.log('[Cleanup] Chrome dihentikan & semua file LOCK sesi dihapus.');
                } else {
                    console.log('[Cleanup] Chrome dihentikan (folder sesi belum ada).');
                }
                resolve();
            }, 1500);
        });
    });
}


function attachClientListeners() {
    client.on('qr', (qr) => {
        console.log('\n======================================================');
        console.log('SILAKAN SCAN QR CODE BERIKUT DENGAN APLIKASI WHATSAPP:');
        console.log('======================================================\n');
        qrcode.generate(qr, { small: true });
        
        isRestarting = false;
        if (initWatchdogTimer) { clearTimeout(initWatchdogTimer); initWatchdogTimer = null; }

        currentStatus = 'QR_RECEIVED';
        currentQrCode = qr;
        if (ioInstance) {
            ioInstance.emit('whatsapp_status', { status: currentStatus });
            ioInstance.emit('qr', qr);
        }
    });

    client.on('loading_screen', (percent, message) => {
        console.log(`Menginisialisasi WhatsApp: ${percent}% - ${message}`);
        currentStatus = 'INITIALIZING';
        if (ioInstance) {
            ioInstance.emit('whatsapp_status', { status: currentStatus });
        }
    });

    client.on('ready', () => {
        console.log('\n======================================================');
        console.log('Chatbot WhatsApp AI Lokal (Qwen) Berhasil Tersambung!');
        console.log('======================================================\n');

        isRestarting = false;
        isExplicitRestart = false;
        if (initWatchdogTimer) { clearTimeout(initWatchdogTimer); initWatchdogTimer = null; }

        currentStatus = 'CONNECTED';
        currentQrCode = null;
        if (ioInstance) {
            ioInstance.emit('whatsapp_status', { status: currentStatus });
        }
        
        if (syncInterval) clearInterval(syncInterval);

        if (global.wasDisconnected) {
            setTimeout(async () => {
                try {
                    const reconnectMsg = `⚠️ *NOTIFIKASI SISTEM BOT* ⚠️\n\n` +
                                         `Koneksi bot WhatsApp sempat *TERPUTUS* pada *${global.disconnectTime || 'waktu tidak diketahui'}*.\n\n` +
                                         `🟢 Saat ini bot telah *BERHASIL TERHUBUNG KEMBALI* dan aktif merespon obrolan.`;
                    
                    const adminTargets = new Set();
                    const cleanBoss = config.boss_number ? (config.boss_number.replace(/\D/g, '') + '@c.us') : '';
                    if (cleanBoss) adminTargets.add(cleanBoss);
                    
                    const shopData = await getShopData();
                    (shopData.host_admins || []).forEach(admin => {
                        adminTargets.add(admin.replace(/\D/g, '') + '@c.us');
                    });
                    
                    for (const adminTarget of adminTargets) {
                        try {
                            await client.sendMessage(adminTarget, reconnectMsg);
                        } catch(err) {
                            console.error('Gagal mengirim notifikasi reconnect ke admin:', err.message);
                        }
                    }
                    global.wasDisconnected = false;
                    global.disconnectTime = null;
                } catch(err) {
                    console.error('Gagal memproses notifikasi reconnect:', err.message);
                }
            }, 5000);
        }
    });

    client.on('disconnected', async (reason) => {
        console.log('Koneksi WhatsApp terputus:', reason);
        isRestarting = false;
        currentStatus = 'DISCONNECTED';
        currentQrCode = null;
        if (ioInstance) {
            ioInstance.emit('whatsapp_status', { status: currentStatus });
            ioInstance.emit('qr', '');
        }
        
        global.wasDisconnected = true;
        global.disconnectTime = new Date().toLocaleString('id-ID');

        if (!isExplicitRestart) {
            console.log('[WA] Menginisialisasi ulang WhatsApp client secara otomatis...');
            await new Promise(r => setTimeout(r, 3000));
            restartClient(false);
        }
    });

    // Handler untuk menyambut anggota baru (Welcome Message)
    client.on('group_join', async (notification) => {
        await handleGroupParticipantUpdate(notification, true);
    });

    // Handler untuk melepas anggota keluar (Goodbye Message)
    client.on('group_leave', async (notification) => {
        await handleGroupParticipantUpdate(notification, false);
    });

    // Fungsi pemroses event masuk/keluar anggota grup
    async function handleGroupParticipantUpdate(notification, isJoin) {
        try {
            const groupId = typeof notification.chatId === 'object' 
                ? (notification.chatId._serialized || `${notification.chatId.user}@${notification.chatId.server}`) 
                : notification.chatId;

            console.log(`[WA Group Update] Mendapat event update participant. Grup JID: ${groupId}. Tipe: ${isJoin ? 'Join (Masuk)' : 'Leave (Keluar)'}`);
            console.log(`[WA Group Update] Raw Notification payload:`, JSON.stringify(notification));

            const { group_configs: gConfigs } = await getGroupConfigs();
            const cfg = gConfigs[groupId];
            if (!cfg) {
                console.warn(`[WA Group Update] Konfigurasi grup untuk ${groupId} tidak ditemukan di database. Mengabaikan event.`);
                return;
            }
            if (!cfg.enabled) {
                console.log(`[WA Group Update] Bot dinonaktifkan untuk grup ${groupId}. Mengabaikan event.`);
                return;
            }
            
            // Pilih template pesan berdasarkan event
            let template = '';
            if (isJoin) {
                template = cfg.welcomeMessage || "Halo @user, selamat bergabung! Disini kami menyediakan berbagai apk paket premium yang murah untuk anda. Ketik *list* untuk melihat produk kami.";
            } else {
                template = cfg.goodbyeMessage || "Selamat tinggal @user, terima kasih atas waktu Anda!";
            }

            if (!template || template.trim() === '') {
                console.log(`[WA Group Update] Template pesan untuk ${isJoin ? 'Join' : 'Leave'} kosong. Mengabaikan.`);
                return;
            }

            let groupChat = null;
            try { groupChat = await client.getChatById(groupId); } catch(_) {}
            
            // Ekstrak target JIDs secara robust dari berbagai kemungkinan properti
            let targetIds = [];
            if (notification.recipientIds && notification.recipientIds.length > 0) {
                targetIds = notification.recipientIds.map(id => typeof id === 'object' ? id._serialized : id);
            } else if (notification.id && notification.id.participant) {
                const part = notification.id.participant;
                targetIds = [typeof part === 'object' ? part._serialized : part];
            } else if (notification.author) {
                const auth = notification.author;
                targetIds = [typeof auth === 'object' ? auth._serialized : auth];
            }
            
            if (!Array.isArray(targetIds) || targetIds.length === 0) {
                console.warn('[WA Group Update] Gagal mendeteksi JID anggota yang masuk/keluar dari notification payload.');
                return;
            }
            
            console.log(`[WA Group Update] Memproses ${isJoin ? 'penyambutan' : 'perpisahan'} untuk target JIDs:`, targetIds);
            
            for (const participantId of targetIds) {
                let displayName = '';
                try {
                    const contact = await client.getContactById(participantId);
                    displayName = contact.pushname || contact.name || '';
                } catch (contactErr) {
                    console.warn('[Welcome/Goodbye Warning] Gagal mendapatkan profil kontak untuk pushname:', contactErr.message);
                }
                
                if (!displayName && groupChat && groupChat.participants) {
                    const participant = groupChat.participants.find(p => 
                        p.id && p.id._serialized === participantId
                    );
                    if (participant && participant.name) {
                        displayName = participant.name;
                    }
                }
                
                const userMentionId = participantId.split('@')[0];
                const userTag = `@${userMentionId}`;
                
                let finalMessage = template;
                if (finalMessage.includes('@user')) {
                    finalMessage = finalMessage.replace(/@user/g, userTag);
                }
                if (finalMessage.includes('@nama')) {
                    finalMessage = finalMessage.replace(/@nama/g, displayName || 'Pelanggan');
                }
                
                console.log(`[WA Group Update] Mengirim pesan ke ${groupId} dengan isi: "${finalMessage}"`);
                // Kirim pesan ke grup dengan mention JID string langsung agar robust & anti-error
                await client.sendMessage(groupId, finalMessage, {
                    mentions: [participantId]
                });
            }
        } catch (err) {
            console.error('Gagal mengirim pesan welcome/goodbye:', err);
        }
    }

    client.on('message_create', handleIncomingMessage);
}

function createNewClient(io) {
    ioInstance = io;
    
    if (isRestarting) {
        console.log('[WA] Inisialisasi sudah berjalan, permintaan duplikat diabaikan.');
        return;
    }
    isRestarting = true;

    if (initWatchdogTimer) {
        clearTimeout(initWatchdogTimer);
        initWatchdogTimer = null;
    }

    const sessionPath = path.join(__dirname, '../../../session');
    client = new Client({
        authStrategy: new LocalAuth({ dataPath: sessionPath }),
        puppeteer: puppeteerOptions
    });

    // Override sendMessage — random read 1-2s + random typing 2-5s (hanya untuk DM, bukan grup)
    // Ditambah dengan auto-mention @semua / @everyone untuk pesan grup.
    const originalSendMessage = client.sendMessage.bind(client);
    client.sendMessage = async function(chatId, content, options) {
        const isGroupChat = typeof chatId === 'string' && chatId.endsWith('@g.us');
        let sendOptions = options || {};

        try {
            // Typing & read indicator hanya untuk DM (bukan grup)
            // Di grup: typing muncul ke semua anggota = terlihat seperti bot
            if (!isGroupChat) {
                const chat = await client.getChatById(chatId);

                // 1. Fase Read — random 1000–2000ms
                try { await chat.sendSeen(); } catch (_) {}
                const readDelay = 1000 + Math.floor(Math.random() * 1000);
                await new Promise(resolve => setTimeout(resolve, readDelay));

                // 2. Fase Typing — random 3000–6000ms (3-6 detik)
                try { await chat.sendStateTyping(); } catch (_) {}
                const typingDelay = 3000 + Math.floor(Math.random() * 3000);
                await new Promise(resolve => setTimeout(resolve, typingDelay));

                // Hentikan typing state
                try { await chat.clearState(); } catch (_) {}
            }
        } catch (err) {
            console.warn('[Anti-Ban/Mention Everyone Warning] Gagal memproses pesan:', err.message);
        }

        // Kirim pesan asli
        return await originalSendMessage(chatId, content, sendOptions);
    };
    
    initMessageHandler(client, io);
    attachClientListeners();
    client.initialize();

    // 180 seconds Watchdog Timer for restarting initial connection hangs
    initWatchdogTimer = setTimeout(async () => {
        if (currentStatus === 'INITIALIZING' || currentStatus === 'DISCONNECTED') {
            console.log('[Watchdog] WhatsApp terlalu lama di status INITIALIZING. Memulai restart otomatis...');
            isRestarting = false;
            await cleanupHeadlessChrome();
            if (client) {
                try { 
                    await Promise.race([
                        client.destroy(),
                        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
                    ]); 
                } catch(_) {}
                client = null;
            }
            await new Promise(r => setTimeout(r, 1500));
            createNewClient(io);
        }
    }, 180000);
}

function getClient() {
    return client;
}

function getStatus() {
    return currentStatus;
}

function getQrCode() {
    return currentQrCode;
}

async function restartClient(clearSession = false) {
    if (isExplicitRestart) return;
    isExplicitRestart = true;
    
    console.log(`[WA] Restarting client... (clearSession: ${clearSession})`);
    
    if (initWatchdogTimer) {
        clearTimeout(initWatchdogTimer);
        initWatchdogTimer = null;
    }
    
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    
    if (client) {
        try {
            await Promise.race([
                client.destroy(),
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 5000))
            ]);
        } catch (e) {
            console.warn('[WA] Warning saat destroy client:', e.message);
        }
        client = null;
    }
    
    await cleanupHeadlessChrome();
    
    if (clearSession) {
        const sessionPath = path.join(__dirname, '../../../session');
        if (fs.existsSync(sessionPath)) {
            try {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log('[WA] Folder sesi ./session berhasil dihapus.');
            } catch (err) {
                console.error('[WA] Gagal menghapus folder sesi:', err.message);
            }
        }
    }
    
    isRestarting = false;
    currentStatus = 'DISCONNECTED';
    currentQrCode = '';
    
    if (ioInstance) {
        ioInstance.emit('whatsapp_status', { status: currentStatus });
        ioInstance.emit('qr', '');
    }
    
    isExplicitRestart = false;
    createNewClient(ioInstance);
}

async function setMessagesAdminsOnlyHelper(client, groupId, adminsOnly) {
    try {
        if (!client) throw new Error('WhatsApp client tidak terhubung.');
        
        let chat = null;
        try {
            chat = await client.getChatById(groupId);
        } catch (chatErr) {
            console.warn('[setMessagesAdminsOnlyHelper] Gagal memanggil getChatById, menggunakan fallback:', chatErr.message);
            chat = { 
                isGroup: true, 
                groupMetadata: { announce: !adminsOnly } 
            };
        }

        if (chat && !chat.isGroup) {
            throw new Error('ID tersebut bukan sebuah grup.');
        }

        // Check if the bot is admin using Puppeteer evaluation (robust for LIDs and aliases)
        let isBotAdmin = false;
        try {
            isBotAdmin = await client.pupPage.evaluate(async (chatId) => {
                const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
                if (!chat || !chat.groupMetadata || !chat.groupMetadata.participants) return false;
                const meWid = window.Store.Conn.wid;
                const participant = chat.groupMetadata.participants.find(p => {
                    if (!p.id) return false;
                    if (p.id.equals) return p.id.equals(meWid);
                    return p.id._serialized === meWid._serialized || p.id.user === meWid.user;
                });
                return !!(participant && (participant.isAdmin || participant.isSuperAdmin));
            }, groupId);
        } catch (evalErr) {
            console.warn('[setMessagesAdminsOnlyHelper] Gagal memverifikasi status admin via browser:', evalErr.message);
            // Fallback to basic node-side check
            const botId = client.info && client.info.wid && client.info.wid._serialized;
            if (botId && chat && chat.participants) {
                const participant = chat.participants.find(p => p.id._serialized === botId || p.id.user === botId.split('@')[0]);
                isBotAdmin = !!(participant && (participant.isAdmin || participant.isSuperAdmin));
            } else {
                // If everything fails, assume true to let the browser attempt setting it
                isBotAdmin = true;
            }
        }

        if (!isBotAdmin) {
            throw new Error('Bot bukan admin di grup ini. Silakan jadikan bot sebagai admin grup terlebih dahulu.');
        }

        const result = await client.pupPage.evaluate(async (chatId, adminsOnly) => {
            try {
                let chatObj = null;
                if (window.Store && window.Store.Chat) {
                    chatObj = window.Store.Chat.get(chatId);
                    if (!chatObj && typeof window.Store.Chat.find === 'function') {
                        try {
                            chatObj = await window.Store.Chat.find(chatId);
                        } catch (_) {}
                    }
                }
                
                if (!chatObj) {
                    chatObj = await window.WWebJS.getChat(chatId, { getAsModel: false });
                }
                
                if (!chatObj) {
                    return { success: false, error: 'Chat tidak ditemukan di browser.' };
                }
                
                let setGroupPropAction = null;
                try {
                    setGroupPropAction = window.require('WAWebSetPropertyGroupAction');
                } catch (_) {}
                
                if (!setGroupPropAction) {
                    if (window.Store) {
                        const keys = Object.keys(window.Store);
                        const matchKey = keys.find(k => k.toLowerCase().includes('setgroupproperty') || k.toLowerCase().includes('groupaction'));
                        return { 
                            success: false, 
                            error: `Modul WAWebSetPropertyGroupAction tidak ditemukan. Store keys: ${matchKey || 'tidak ada'}` 
                        };
                    }
                    return { success: false, error: 'Modul WAWebSetPropertyGroupAction tidak ditemukan di WhatsApp Web.' };
                }
                
                await setGroupPropAction.setGroupProperty(chatObj, 'announcement', adminsOnly ? 1 : 0);
                return { success: true };
            } catch (err) {
                return { 
                    success: false, 
                    error: err.message || String(err), 
                    name: err.name || 'Error',
                    stack: err.stack || '' 
                };
            }
        }, groupId, adminsOnly);

        if (!result.success) {
            console.error(`[Browser Error Debug] Gagal mengubah setelan grup ${groupId}:`, result.error, result.stack);
            
            if (result.name === 'ServerStatusCodeError' || result.error.includes('403') || result.error.includes('401') || result.error.includes('ServerStatusCodeError')) {
                throw new Error('Ditolak oleh WhatsApp: Bot tidak memiliki izin admin di grup ini.');
            }
            throw new Error(`Kesalahan browser WhatsApp Web: ${result.error}`);
        }
        
        if (chat && chat.groupMetadata) {
            chat.groupMetadata.announce = adminsOnly;
        }
        return true;
    } catch (err) {
        console.error(`[setMessagesAdminsOnlyHelper] Exception:`, err);
        throw err;
    }
}

module.exports = {
    createNewClient,
    getClient,
    getStatus,
    getQrCode,
    cleanupHeadlessChrome,
    restartClient,
    setMessagesAdminsOnlyHelper
};

