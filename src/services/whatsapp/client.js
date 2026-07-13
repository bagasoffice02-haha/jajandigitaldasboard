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
    puppeteerOptions.executablePath = config.puppeteer_executable_path.trim();
    console.log(`[WhatsApp] Menggunakan custom puppeteer executablePath: ${puppeteerOptions.executablePath}`);
}

function cleanupHeadlessChrome() {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve();
        }
        const sessionPath = path.join(__dirname, '../../../session');
        const absoluteSessionPath = path.resolve(sessionPath);
        
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
                    console.log('[Cleanup] Chrome dihentikan & semua file LOCK sesi dihapus.');
                } else {
                    console.log('[Cleanup] Chrome dihentikan (folder sesi belum ada).');
                }
                resolve();
            }, 1500);
        });
    });
}

async function syncPinnedHostAdmins() {
    if (!client) return;
    try {
        const chats = await client.getChats();
        const pinnedAdmins = chats
            .filter(chat => chat.pinned && !chat.isGroup)
            .map(chat => chat.id.user + '@c.us');
        
        for (const adminPhone of pinnedAdmins) {
            await addAdmin(adminPhone, 'Pinned Host Admin');
        }
        
        console.log(`[Host Admin] Sinkronisasi ${pinnedAdmins.length} Host Admin dari chat tersemat.`);
    } catch (err) {
        console.error('[Host Admin] Gagal sinkronisasi chat tersemat:', err.message);
    }
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
        if (initWatchdogTimer) { clearTimeout(initWatchdogTimer); initWatchdogTimer = null; }

        currentStatus = 'CONNECTED';
        currentQrCode = null;
        if (ioInstance) {
            ioInstance.emit('whatsapp_status', { status: currentStatus });
        }
        
        if (syncInterval) clearInterval(syncInterval);
        syncPinnedHostAdmins();
        syncInterval = setInterval(syncPinnedHostAdmins, 120000);

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

    client.on('group_join', async (notification) => {
        try {
            const groupId = notification.chatId;
            const { group_configs: gConfigs } = await getGroupConfigs();
            const cfg = gConfigs[groupId];
            if (!cfg || !cfg.enabled) return;
            
            const welcomeTemplate = cfg.welcomeMessage || "Halo @user, selamat bergabung! Disini kami menyediakan berbagai apk paket premium yang murah untuk anda. Ketik *list* untuk melihat produk kami.";
            
            let groupChat = null;
            try { groupChat = await client.getChatById(groupId); } catch(_) {}
            
            for (const participantId of notification.recipientIds) {
                const contact = await client.getContactById(participantId);
                
                let displayName = '';
                if (groupChat && groupChat.participants) {
                    const participant = groupChat.participants.find(p => 
                        p.id && p.id._serialized === participantId
                    );
                    if (participant && participant.name) {
                        displayName = participant.name;
                    }
                }
                if (!displayName) {
                    displayName = contact.pushname || '';
                }
                
                const userMentionId = participantId.split('@')[0];
                let userTag = `@${userMentionId}`;
                if (displayName) {
                    userTag = `${displayName}`;
                }
                
                const finalMessage = welcomeTemplate.replace('@user', userTag);
                await client.sendMessage(groupId, finalMessage, {
                    mentions: [contact]
                });
            }
        } catch (err) {
            console.error('Gagal mengirim pesan selamat datang:', err.message);
        }
    });

    client.on('message', handleIncomingMessage);
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

module.exports = {
    createNewClient,
    getClient,
    getStatus,
    getQrCode,
    cleanupHeadlessChrome,
    restartClient
};
