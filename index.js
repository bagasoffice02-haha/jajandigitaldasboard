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
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server);
const PORT = config.port || 3000;

app.use(express.json());

// Helper untuk menghasilkan Protocol (HTTPS/HTTP) & Host domain yang akurat di balik Nginx/Cloudflare
function getPublicUrlInfo(req) {
    const host = req.headers.host || `localhost:${PORT}`;
    const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure || !host.includes('localhost');
    const protocol = isHttps ? 'https' : 'http';
    return { protocol, host, baseUrl: `${protocol}://${host}` };
}

function getImgMimeType(filename) {
    if (/\.(png)$/i.test(filename)) return 'image/png';
    if (/\.(webp)$/i.test(filename)) return 'image/webp';
    return 'image/jpeg';
}

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
    const publicPaths = ['/login', '/api/login', '/upload-bukti', '/api/upload-bukti', '/qris', '/favicon.ico'];
    if (publicPaths.includes(req.path) || req.path.startsWith('/uploads/') || req.path.startsWith('/v/') || req.path.startsWith('/qris')) return next();
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

// Route Public QRIS dengan Open Graph Metadata (Agar WA Tampilkan Gambar QRIS Preview di Link Card)
app.get(['/qris', '/qris/:filename', '/v/qris'], (req, res) => {
    let filename = req.params.filename || 'Qris.jpeg';
    let rawImageUrl = '';

    const mediaPath = path.join(__dirname, 'media', filename);
    if (fs.existsSync(mediaPath)) {
        rawImageUrl = `/media/${filename}`;
    } else {
        const fallbackPath = path.join(__dirname, 'media', 'Qris.jpeg');
        if (fs.existsSync(fallbackPath)) {
            rawImageUrl = `/media/Qris.jpeg`;
        } else {
            try {
                const files = fs.readdirSync(path.join(__dirname, 'media'));
                const imgFile = files.find(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
                if (imgFile) rawImageUrl = `/media/${imgFile}`;
            } catch(_) {}
        }
    }

    const { baseUrl } = getPublicUrlInfo(req);
    const fullImageUrl = rawImageUrl ? `${baseUrl}${rawImageUrl}` : `${baseUrl}/favicon.ico`;
    const pageUrl = `${baseUrl}/qris`;
    const mimeType = getImgMimeType(filename);

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>💵 QRIS Pembayaran Resmi - Jajan Digital</title>

    <!-- Open Graph Meta Tags untuk Preview Gambar QRIS di WhatsApp -->
    <meta property="og:site_name" content="Jajan Digital" />
    <meta property="og:title" content="💵 QRIS Pembayaran Resmi - Jajan Digital" />
    <meta property="og:description" content="Scan barcode QRIS ini untuk melakukan pembayaran dari M-Banking / E-Wallet apapun." />
    <meta property="og:image" content="${fullImageUrl}" />
    <meta property="og:image:secure_url" content="${fullImageUrl}" />
    <meta property="og:image:type" content="${mimeType}" />
    <meta property="og:image:width" content="600" />
    <meta property="og:image:height" content="600" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${pageUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${fullImageUrl}" />

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.75);
            --border-color: rgba(255, 255, 255, 0.12);
            --accent-gradient: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
        body {
            background-color: var(--bg-color);
            background-image: 
                radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.15) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(6, 182, 212, 0.15) 0px, transparent 50%);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 1.5rem 1rem;
        }
        .container {
            width: 100%;
            max-width: 440px;
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 2rem 1.5rem;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }
        .badge {
            display: inline-block;
            padding: 6px 16px;
            border-radius: 50px;
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid rgba(16, 185, 129, 0.3);
            color: #34d399;
            font-size: 0.85rem;
            font-weight: 600;
            margin-bottom: 0.75rem;
        }
        .title {
            font-size: 1.5rem;
            font-weight: 800;
            background: var(--accent-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 0.5rem;
        }
        .subtitle {
            font-size: 0.85rem;
            color: var(--text-muted);
            margin-bottom: 1.5rem;
            line-height: 1.4;
        }
        .qris-box {
            background: white;
            padding: 1rem;
            border-radius: 18px;
            display: inline-block;
            margin-bottom: 1.5rem;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
        }
        .qris-img {
            max-width: 100%;
            width: 280px;
            height: auto;
            display: block;
            border-radius: 8px;
        }
        .instructions {
            text-align: left;
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid var(--border-color);
            border-radius: 14px;
            padding: 1rem;
            margin-bottom: 1.5rem;
            font-size: 0.85rem;
            color: #cbd5e1;
            line-height: 1.6;
        }
        .instructions ol { padding-left: 1.2rem; }
        .instructions li { margin-bottom: 0.25rem; }
        .btn-upload {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
            padding: 0.9rem 1.5rem;
            border-radius: 14px;
            background: var(--accent-gradient);
            color: white;
            text-decoration: none;
            font-weight: 700;
            font-size: 0.95rem;
            box-shadow: 0 8px 20px rgba(16, 185, 129, 0.3);
            transition: all 0.3s ease;
        }
        .btn-upload:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 25px rgba(16, 185, 129, 0.4);
        }
    </style>
</head>
<body>
    <div class="container">
        <span class="badge">🏪 Jajan Digital Official</span>
        <h1 class="title">QRIS Pembayaran Resmi</h1>
        <p class="subtitle">Scan menggunakan M-Banking atau E-Wallet (Gopay, OVO, Dana, ShopeePay, LinkAja, BCA, Mandiri, dll)</p>

        <div class="qris-box">
            <img src="${rawImageUrl}" alt="Barcode QRIS Pembayaran" class="qris-img">
        </div>

        <div class="instructions">
            <strong>📌 Cara Melakukan Pembayaran:</strong>
            <ol>
                <li>Simpan / Screenshot barcode QRIS di atas.</li>
                <li>Buka aplikasi m-Banking / e-Wallet Anda.</li>
                <li>Pilih menu <strong>Scan / Bayar QRIS</strong> dan upload gambar QRIS.</li>
                <li>Masukkan nominal sesuai total belanja Anda.</li>
                <li>Setelah berhasil, klik tombol di bawah untuk unggah bukti bayar.</li>
            </ol>
        </div>

        <a href="/upload-bukti" class="btn-upload">
            <span>📸 Unggah Bukti Pembayaran</span>
        </a>
    </div>
</body>
</html>`;

    res.send(html);
});

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
            const ext = path.extname(file.originalname) || '.png';
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
    const viewUrl = `/v/${req.file.filename}`;
    const fullUrl = `${protocol}://${host}${viewUrl}`;
    
    console.log(`[Payment Upload] Bukti baru tersimpan: ${req.file.filename} -> ${fullUrl}`);
    res.json({ success: true, url: viewUrl, fullUrl, filename: req.file.filename });
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
