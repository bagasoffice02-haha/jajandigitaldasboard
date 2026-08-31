// Polyfill untuk DOMMatrix yang dibutuhkan oleh pdfjs-dist / pdf-parse di Node.js
if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {};
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const { config } = require('./src/config/config');
const { initDatabase, getDb } = require('./src/db/sqlite');
const { 
    saveSystemLogToDb, 
    getRecentSystemLogsFromDb, 
    clearSystemLogsFromDb,
    saveChatLogToDb, 
    getRecentChatLogsFromDb, 
    clearChatLogsFromDb, 
    getChatAnalyticsFromDb 
} = require('./src/db/models');
const { createNewClient, getClient, getStatus, getQrCode, cleanupHeadlessChrome } = require('./src/services/whatsapp/client');
const { setSocketIo } = require('./src/services/ai/aiService');

// ─── Setup Express & Socket.io ───────────────────────────────────────────────
const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server);
const PORT = config.port || 3000;

app.use(express.json());

function getPublicUrlInfo(req) {
    const host = req.headers.host || `localhost:${PORT}`;
    const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure || !host.includes('localhost');
    const protocol = isHttps ? 'https' : 'http';
    return { protocol, host, baseUrl: `${protocol}://${host}` };
}

app.set('io', io);

// ─── Autentikasi Sesi ────────────────────────────────────────────────────────
const SESSIONS_FILE = './sessions.json';
let activeSessions = new Set();

function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            activeSessions = new Set(JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')));
        }
    } catch (e) { console.error('[Auth] Gagal memuat sesi:', e.message); }
}

function saveSessions() {
    try {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Array.from(activeSessions)), 'utf-8');
    } catch (e) { console.error('[Auth] Gagal menyimpan sesi:', e.message); }
}

loadSessions();

const ADMIN_USERNAME = config.admin_username || 'admin';
const ADMIN_PASSWORD = config.admin_password || 'bagas123';
const loginAttempts = new Map();
const resetOtpBucket = new Map();
const otpRateBucket = new Map();
const uploadRateBucket = new Map();

function checkAuth(req, res, next) {
    const publicPaths = [
        '/login', '/api/login', '/logout', '/api/logout', '/api/get-registered-admin-phone', 
        '/api/request-reset-otp', '/api/verify-reset-otp', '/upload-bukti', 
        '/api/upload-bukti', '/qris', '/q', '/u', '/favicon.ico',
        '/referral', '/leaderboard', '/affiliate',
        '/api/referrals/codes', '/api/referrals/logs'
    ];
    if (
        publicPaths.includes(req.path) || 
        req.path.startsWith('/uploads/') || 
        req.path.startsWith('/v/') || 
        req.path.startsWith('/b/') || 
        req.path.startsWith('/qris') || 
        req.path.startsWith('/q') || 
        req.path.startsWith('/u') || 
        req.path.startsWith('/media/') ||
        req.path.startsWith('/referral') ||
        req.path.startsWith('/leaderboard') ||
        req.path.startsWith('/affiliate')
    ) return next();
    let token = null;
    const cookies = req.headers.cookie;
    if (cookies) {
        for (const part of cookies.split(';')) {
            const [k, v] = part.trim().split('=');
            if (k === 'session_token') { token = v; break; }
        }
    }
    if (token && activeSessions.has(token)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
    return res.redirect('/login');
}

app.use(checkAuth);

// ─── Multer Upload Configurations ──────────────────────────────────────────
const knowledgeUpload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, path.join(__dirname, 'knowledge')), filename: (req, file, cb) => cb(null, file.originalname) }) });
const mediaUpload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, path.join(__dirname, 'media')), filename: (req, file, cb) => cb(null, file.originalname) }) });
const stickersUpload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads/stickers')), filename: (req, file, cb) => cb(null, file.originalname) }) });
const productsUpload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads/products')), filename: (req, file, cb) => cb(null, file.originalname) }) });
const paymentUpload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads/payments')), filename: (req, file, cb) => { const ext = path.extname(file.originalname) || '.jpg'; cb(null, `p_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}${ext}`); } }) });
const uploadZip = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, path.join(__dirname, 'temp')), filename: (req, file, cb) => cb(null, `restore_${Date.now()}.zip`) }) });

app.set('knowledgeUpload', knowledgeUpload);
app.set('mediaUpload', mediaUpload);
app.set('stickersUpload', stickersUpload);
app.set('productsUpload', productsUpload);
app.set('paymentUpload', paymentUpload);
app.set('uploadZip', uploadZip);

// ─── Static File Serving ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(path.join(__dirname, 'media')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ─── Mount Modular Routers ───────────────────────────────────────────────────
const publicRoutes = require('./src/routes/publicRoutes')({
    loginAttempts, activeSessions, saveSessions, config,
    ADMIN_USERNAME, ADMIN_PASSWORD, resetOtpBucket, otpRateBucket,
    getDb, getClient, getStatus, uploadRateBucket, paymentUpload, getPublicUrlInfo
});
const apiRoutes = require('./src/routes/apiRoutes');

app.use(publicRoutes);

app.post('/api/upload/knowledge', knowledgeUpload.single('file'), (req, res) => res.json({ success: true }));
app.post('/api/upload/media', mediaUpload.single('file'), (req, res) => res.json({ success: true }));
app.post('/api/upload/stickers', stickersUpload.single('file'), (req, res) => res.json({ success: true }));
app.post('/api/upload/products', productsUpload.single('file'), (req, res) => res.json({ success: true }));

app.use('/api', apiRoutes);

// ─── Real-Time Enterprise System & Error Logger ──────────────────────────────
global.recentSystemLogs = [];
const MAX_SYSTEM_LOGS = 250;

function pushSystemLog(level, message, tag = 'SISTEM') {
    const logObj = {
        id: Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        level: level || 'info', // 'info' | 'warn' | 'error' | 'ai'
        message: String(message),
        tag: tag || 'SISTEM',
        timestamp: Date.now()
    };
    global.recentSystemLogs.push(logObj);
    if (global.recentSystemLogs.length > MAX_SYSTEM_LOGS) {
        global.recentSystemLogs.shift();
    }
    saveSystemLogToDb(logObj);
    if (io) {
        io.emit('system_log', logObj);
    }
    return logObj;
}
global.pushSystemLog = pushSystemLog;

// Hook console logging to feed into live web terminal stream
const originalConsoleLog = console.log.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleError = console.error.bind(console);

console.log = (...args) => {
    originalConsoleLog(...args);
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    let tag = 'SISTEM';
    let level = 'info';
    if (msg.includes('[AI]') || msg.includes('Gemini') || msg.includes('Groq') || msg.includes('OpenAI')) {
        tag = 'AI ENGINE';
        level = 'ai';
    } else if (msg.includes('[DEBUG CHAT]')) {
        tag = 'CHAT MASUK';
        level = 'info';
    } else if (msg.includes('[Scheduler]')) {
        tag = 'SCHEDULER';
        level = 'info';
    } else if (msg.includes('[AntiSpam]')) {
        tag = 'ANTI-SPAM';
        level = 'warn';
    } else if (msg.includes('[Telegram]')) {
        tag = 'TELEGRAM';
        level = 'info';
    } else if (msg.includes('[WhatsApp]')) {
        tag = 'WHATSAPP';
        level = 'info';
    } else if (msg.includes('[Payment Upload]')) {
        tag = 'PEMBAYARAN';
        level = 'info';
    }
    pushSystemLog(level, msg, tag);
};

console.warn = (...args) => {
    originalConsoleWarn(...args);
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    pushSystemLog('warn', msg, 'PERINGATAN');
};

console.error = (...args) => {
    originalConsoleError(...args);
    const msg = args.map(a => (typeof a === 'object' ? (a.stack || JSON.stringify(a)) : String(a))).join(' ');
    pushSystemLog('error', msg, 'ERROR');
};

// Endpoints untuk Log Obrolan Persisten & Analisa Trafik
app.get('/api/chat/logs', async (req, res) => {
    try {
        const logs = await getRecentChatLogsFromDb(100);
        res.json({ success: true, logs });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/chat/analytics', async (req, res) => {
    try {
        const stats = await getChatAnalyticsFromDb();
        res.json({ success: true, stats });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/chat/clear-logs', async (req, res) => {
    try {
        await clearChatLogsFromDb();
        io.emit('chat_logs_cleared');
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoints untuk Log Sistem & Simulasi Pengujian
app.get('/api/system/logs', async (req, res) => {
    try {
        const logs = await getRecentSystemLogsFromDb(150);
        res.json({ success: true, logs: logs.length > 0 ? logs : (global.recentSystemLogs || []) });
    } catch(err) {
        res.json({ success: true, logs: global.recentSystemLogs || [] });
    }
});

app.post('/api/system/clear-logs', async (req, res) => {
    try {
        await clearSystemLogsFromDb();
        global.recentSystemLogs = [];
        io.emit('system_logs_cleared');
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/system/simulate-chat', async (req, res) => {
    try {
        const { message, senderId, isGroup } = req.body;
        if (!message) return res.status(400).json({ error: 'Pesan simulasi wajib diisi.' });

        const simSender = senderId || '6281234567890@c.us';
        const simChatId = isGroup ? '120363000000000000@g.us' : simSender;
        const simLog = {
            chatId: simChatId,
            senderId: simSender,
            body: message,
            type: 'incoming',
            isGroup: Boolean(isGroup),
            timestamp: Date.now(),
            isSimulation: true
        };

        await saveChatLogToDb(simLog);
        io.emit('message_log', simLog);

        pushSystemLog('info', `Simulasi pesan diterima: "${message}" dari ${simSender}`, 'SIMULATOR');
        res.json({ success: true, message: 'Simulasi pesan dikirim ke live monitor.' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Socket.io & Global Protections ──────────────────────────────────────────
io.on('connection', async (socket) => {
    socket.emit('whatsapp_status', { status: getStatus() });
    if (getQrCode() && getStatus() !== 'CONNECTED') socket.emit('qr', getQrCode());
    
    try {
        const initialChatLogs = await getRecentChatLogsFromDb(100);
        socket.emit('initial_chat_logs', { logs: initialChatLogs });

        const initialSysLogs = await getRecentSystemLogsFromDb(150);
        socket.emit('system_logs_batch', { logs: initialSysLogs.length > 0 ? initialSysLogs : (global.recentSystemLogs || []) });

        const analytics = await getChatAnalyticsFromDb();
        socket.emit('chat_analytics_init', { stats: analytics });
    } catch(e) {}
});

process.on('uncaughtException', (err) => {
    console.error('uncaughtException global:', err.message);
});
process.on('unhandledRejection', (reason) => {
    const errMsg = reason ? (reason.message || reason.toString()) : '';
    if (!errMsg.includes('Execution context was destroyed') && !errMsg.includes('Navigating frame was detached')) {
        console.error('Unhandled Promise Rejection:', errMsg);
    }
});

// ─── Bootstrapping App ────────────────────────────────────────────────────────
server.listen(PORT, async () => {
    console.log(`\n======================================================\nWeb Dashboard CS Aktif di: http://localhost:${PORT}\n======================================================\n`);
    await initDatabase();
    setSocketIo(io);
    await cleanupHeadlessChrome();
    createNewClient(io);

    const { startReminderScheduler, startGroupScheduleScheduler } = require('./src/scheduler/reminderJob');
    startReminderScheduler(getClient, io, getStatus);
    startGroupScheduleScheduler(getClient, getStatus);

    if (config.telegram_bot_enabled && config.telegram_bot_token) {
        try {
            const { initTelegramBot } = require('./src/services/telegram/client');
            const { startTelegramScheduler } = require('./src/services/telegram/scheduler');
            await initTelegramBot(io);
            startTelegramScheduler();
            console.log('[Telegram] Bot Telegram & Scheduler berhasil diaktifkan.');
        } catch (tgErr) {
            console.error('[Telegram] Gagal inisialisasi Bot Telegram:', tgErr.message);
        }
    } else {
        console.log('[Telegram] Bot Telegram tidak aktif. Atur telegram_bot_enabled: true di Pengaturan.');
    }
});
