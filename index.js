// Polyfill untuk DOMMatrix yang dibutuhkan oleh pdfjs-dist / pdf-parse di Node.js
if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {};
}

const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const { config } = require('./src/config/config');
const { initDatabase, getDb } = require('./src/db/sqlite');
const { createNewClient, getClient, getStatus, getQrCode, cleanupHeadlessChrome } = require('./src/services/whatsapp/client');
const { setSocketIo } = require('./src/services/ai/aiService');

// ─── Setup Express & Socket.io ───────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = config.port || 3000;

app.use(express.json());

// Simpan io & multer instances di app agar bisa diakses route children
app.set('io', io);

// ─── Autentikasi Sesi ────────────────────────────────────────────────────────
const SESSIONS_FILE = './sessions.json';
let activeSessions = new Set();

function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
            activeSessions = new Set(data);
        }
    } catch (e) {
        console.error('[Auth] Gagal memuat file sesi:', e.message);
    }
}

function saveSessions() {
    try {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Array.from(activeSessions)), 'utf-8');
    } catch (e) {
        console.error('[Auth] Gagal menyimpan file sesi:', e.message);
    }
}

loadSessions();

const ADMIN_USERNAME = config.admin_username || 'admin';
const ADMIN_PASSWORD = config.admin_password || 'bagas123';

// Middleware Autentikasi Dasbor (Bypass portal upload bukti publik)
function checkAuth(req, res, next) {
    const publicPaths = ['/login', '/api/login', '/upload-bukti', '/api/upload-bukti', '/favicon.ico'];
    if (publicPaths.includes(req.path) || req.path.startsWith('/uploads/')) return next();
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

// ─── Auth & Public Upload Portal Routes ─────────────────────────────────────────
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/upload-bukti', (req, res) => res.sendFile(path.join(__dirname, 'public', 'upload-bukti.html')));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        activeSessions.add(token);
        saveSessions();
        res.cookie('session_token', token, { httpOnly: true, secure: false, maxAge: 24 * 60 * 60 * 1000 });
        return res.json({ success: true });
    }
    return res.status(401).json({ success: false, error: 'Username atau password salah!' });
});

app.post('/api/logout', (req, res) => {
    const cookies = req.headers.cookie;
    if (cookies) {
        for (const part of cookies.split(';')) {
            const [k, v] = part.trim().split('=');
            if (k === 'session_token') { activeSessions.delete(v); saveSessions(); break; }
        }
    }
    res.clearCookie('session_token');
    res.json({ success: true });
});

app.get('/api/auth-status', (req, res) => res.json({ authenticated: true }));

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/knowledge', express.static(path.join(__dirname, 'knowledge')));
app.use('/media', express.static(path.join(__dirname, 'media')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

const KNOWLEDGE_DIR = './knowledge';
const MEDIA_DIR = './media';
const PAYMENTS_DIR = './public/uploads/payments';
const STICKERS_DIR = './public/uploads/stickers';
const PRODUCTS_DIR = './public/uploads/products';

[KNOWLEDGE_DIR, MEDIA_DIR, PAYMENTS_DIR, STICKERS_DIR, PRODUCTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Multer Setup ─────────────────────────────────────────────────────────────
const knowledgeUpload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, KNOWLEDGE_DIR), filename: (req, file, cb) => cb(null, file.originalname) }) });
const mediaUpload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, MEDIA_DIR), filename: (req, file, cb) => cb(null, file.originalname) }) });
const stickersUpload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, STICKERS_DIR), filename: (req, file, cb) => cb(null, file.originalname) }) });
const productsUpload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, PRODUCTS_DIR), filename: (req, file, cb) => cb(null, file.originalname) }) });

const paymentUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, PAYMENTS_DIR),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname) || '.jpg';
            const randomName = 'pay_' + crypto.randomBytes(8).toString('hex') + ext;
            cb(null, randomName);
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadZip = multer({
    storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, require('os').tmpdir()), filename: (req, file, cb) => cb(null, `import-backup-${Date.now()}.zip`) }),
    fileFilter: (req, file, cb) => (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) ? cb(null, true) : cb(new Error('Hanya file .zip yang diizinkan'), false),
    limits: { fileSize: 500 * 1024 * 1024 }
});

// Simpan multer instances ke app agar bisa dipakai di route files
app.set('knowledgeUpload', knowledgeUpload);
app.set('mediaUpload', mediaUpload);
app.set('stickersUpload', stickersUpload);
app.set('productsUpload', productsUpload);
app.set('paymentUpload', paymentUpload);
app.set('uploadZip', uploadZip);

// ─── Mount Routers ────────────────────────────────────────────────────────────
const ordersRouter    = require('./src/routes/orders');
const premiumRouter   = require('./src/routes/premium');
const filesRouter     = require('./src/routes/files');
const groupsRouter    = require('./src/routes/groups');
const shopRouter      = require('./src/routes/shop');
const hostAdminRouter = require('./src/routes/hostAdmin');
const miscRouter      = require('./src/routes/misc');
const configRouter    = require('./src/routes/configRoute');

// Public Payment Upload Route (dengan IP Rate Limiter: max 5 upload / 10 mnt)
const uploadRateBucket = new Map();

app.post('/api/upload-bukti', (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const timestamps = (uploadRateBucket.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
    
    if (timestamps.length >= 5) {
        return res.status(429).json({ success: false, error: 'Terlalu banyak unggahan. Batas 5 file per 10 menit.' });
    }
    
    timestamps.push(now);
    uploadRateBucket.set(ip, timestamps);
    next();
}, paymentUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'File tidak ditemukan' });
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers.host || `localhost:${PORT}`;
    const fileUrl = `/uploads/payments/${req.file.filename}`;
    const fullUrl = `${protocol}://${host}${fileUrl}`;
    
    console.log(`[Payment Upload] Bukti baru tersimpan: ${req.file.filename} -> ${fullUrl}`);
    res.json({ success: true, url: fileUrl, fullUrl, filename: req.file.filename });
});


// Upload routes perlu multer langsung — dipasang sebelum mount router
app.post('/api/upload/knowledge', knowledgeUpload.single('file'), (req, res) => res.json({ success: true }));
app.post('/api/upload/media',    mediaUpload.single('file'),    (req, res) => res.json({ success: true }));
app.post('/api/upload/stickers', stickersUpload.single('file'), (req, res) => res.json({ success: true }));
app.post('/api/upload/products', productsUpload.single('file'), (req, res) => res.json({ success: true }));


app.use('/api', ordersRouter);
app.use('/api/premium', premiumRouter);
app.use('/api', filesRouter);
app.use('/api', groupsRouter);
app.use('/api/shop', shopRouter);
app.use('/api/host-admin', hostAdminRouter);
app.use('/api', miscRouter);
app.use('/api', configRouter);

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('Dashboard client terhubung ke WebSocket.');
    socket.emit('whatsapp_status', { status: getStatus() });
    if (getQrCode() && getStatus() !== 'CONNECTED') socket.emit('qr', getQrCode());
});

// ─── Global Error Protection ─────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error('Terjadi uncaughtException global:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    const errMsg = reason ? (reason.message || reason.toString()) : '';
    if (errMsg.includes('Execution context was destroyed') ||
        errMsg.includes('Navigating frame was detached') ||
        errMsg.includes('Session closed') ||
        errMsg.includes('Target closed') ||
        errMsg.includes('evaluate')) {
        console.warn('[WA Warning] Puppeteer context reset (diabaikan agar tidak restart berulang):', errMsg);
    } else {
        console.error('Unhandled Promise Rejection:', errMsg);
    }
});

// ─── Bootstrapping App ────────────────────────────────────────────────────────
server.listen(PORT, async () => {
    console.log(`\n======================================================`);
    console.log(`Web Dashboard CS Aktif di: http://localhost:${PORT}`);
    console.log(`======================================================\n`);

    await initDatabase();
    setSocketIo(io);
    await cleanupHeadlessChrome();
    createNewClient(io);

    const { startReminderScheduler, startGroupScheduleScheduler } = require('./src/scheduler/reminderJob');
    startReminderScheduler(getClient, io, getStatus);
    startGroupScheduleScheduler(getClient, getStatus);

    // ─── Inisialisasi Bot Telegram (kondisional) ───────────────────────────
    if (config.telegram_bot_enabled && config.telegram_bot_token) {
        try {
            const { initTelegramBot } = require('./src/services/telegram/client');
            const { startTelegramScheduler } = require('./src/services/telegram/scheduler');
            await initTelegramBot(io);
            startTelegramScheduler();
            console.log('[Telegram] ✅ Bot Telegram & Scheduler berhasil diaktifkan.');
        } catch (tgErr) {
            console.error('[Telegram] ❌ Gagal menginisialisasi Bot Telegram:', tgErr.message);
        }
    } else {
        console.log('[Telegram] Bot Telegram tidak aktif. Atur telegram_bot_enabled: true di Pengaturan Dasbor.');
    }
});
