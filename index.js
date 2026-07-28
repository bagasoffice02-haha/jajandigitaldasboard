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

// Middleware Autentikasi Dasbor (Bypass portal upload bukti publik & short links)
function checkAuth(req, res, next) {
    const publicPaths = ['/login', '/api/login', '/upload-bukti', '/api/upload-bukti', '/qris', '/q', '/u', '/favicon.ico'];
    if (publicPaths.includes(req.path) || req.path.startsWith('/uploads/') || req.path.startsWith('/v/') || req.path.startsWith('/b/') || req.path.startsWith('/qris') || req.path.startsWith('/q') || req.path.startsWith('/u') || req.path.startsWith('/media/')) return next();
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

// ─── Auth & Short Link Routes ──────────────────────────────────────────────────
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// Short URLs: /u = upload bukti, /q = qris pembayaran
app.get(['/u', '/upload-bukti'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'upload-bukti.html')));

// Route Public QRIS dengan Open Graph Metadata (/q & /qris)
app.get(['/q', '/qris', '/qris/:filename', '/v/qris'], (req, res) => {
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
    const pageUrl = `${baseUrl}/q`;
    const mimeType = getImgMimeType(filename);

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Pembayaran QRIS - Jajan Digital</title>

    <!-- Open Graph Meta Tags untuk Preview Gambar QRIS di WhatsApp -->
    <meta property="og:site_name" content="Jajan Digital" />
    <meta property="og:title" content="Pembayaran QRIS & Transfer - Jajan Digital" />
    <meta property="og:description" content="Scan QRIS atau transfer Bank / E-Wallet Jajan Digital." />
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
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">

    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', -apple-system, sans-serif; }
        body {
            background: #0b1329;
            color: #f1f5f9;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 8px;
        }
        .card {
            width: 100%;
            max-width: 380px;
            background: rgba(30, 41, 59, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .header { text-align: center; }
        .header h1 { font-size: 1.1rem; font-weight: 700; color: #38bdf8; }
        .header p { font-size: 0.72rem; color: #94a3b8; margin-top: 1px; }

        .qris-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
        }
        .qris-img-bg {
            background: white;
            padding: 5px;
            border-radius: 8px;
            display: inline-block;
        }
        .qris-img {
            width: 140px;
            height: 140px;
            object-fit: contain;
            display: block;
        }
        .btn-download {
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.3);
            color: #38bdf8;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.72rem;
            font-weight: 600;
            text-decoration: none;
            cursor: pointer;
        }

        .bank-list {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .bank-item {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            padding: 5px 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .bank-name { font-weight: 700; color: #e2e8f0; font-size: 0.68rem; }
        .bank-num { font-family: monospace; font-size: 0.82rem; font-weight: 700; color: #38bdf8; }
        .bank-holder { font-size: 0.65rem; color: #94a3b8; }
        .btn-copy {
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid rgba(16, 185, 129, 0.3);
            color: #34d399;
            padding: 3px 8px;
            border-radius: 5px;
            font-size: 0.68rem;
            font-weight: 600;
            cursor: pointer;
        }

        .note-bar {
            background: rgba(234, 179, 8, 0.1);
            border: 1px solid rgba(234, 179, 8, 0.25);
            border-radius: 6px;
            padding: 5px 8px;
            font-size: 0.68rem;
            color: #fef08a;
            line-height: 1.35;
        }

        .btn-action {
            background: linear-gradient(135deg, #0284c7 0%, #0d9488 100%);
            color: white;
            text-decoration: none;
            text-align: center;
            padding: 8px;
            border-radius: 8px;
            font-size: 0.8rem;
            font-weight: 700;
            display: block;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <h1>Pembayaran Jajan Digital</h1>
            <p>Scan QRIS atau Transfer Bank / E-Wallet</p>
        </div>

        <div class="qris-box">
            <div class="qris-img-bg">
                <img src="${rawImageUrl}" alt="QRIS" class="qris-img">
            </div>
            <a href="${rawImageUrl}" download="QRIS_JajanDigital.jpeg" class="btn-download">Unduh QRIS</a>
        </div>

        <div class="bank-list">
            <div class="bank-item">
                <div>
                    <div class="bank-name">GOPAY</div>
                    <div class="bank-num">085789863037</div>
                    <div class="bank-holder">a.n Bagas Saputra</div>
                </div>
                <button class="btn-copy" onclick="copyText('085789863037', this)">Salin</button>
            </div>
            <div class="bank-item">
                <div>
                    <div class="bank-name">SEABANK</div>
                    <div class="bank-num">901346990999</div>
                    <div class="bank-holder">a.n Bagas Saputra</div>
                </div>
                <button class="btn-copy" onclick="copyText('901346990999', this)">Salin</button>
            </div>
            <div class="bank-item">
                <div>
                    <div class="bank-name">BRI</div>
                    <div class="bank-num">560801027512500</div>
                    <div class="bank-holder">a.n Bagas Saputra</div>
                </div>
                <button class="btn-copy" onclick="copyText('560801027512500', this)">Salin</button>
            </div>
        </div>

        <div class="note-bar">
            <strong>Catatan:</strong> QRIS bebas admin. Bank/E-Wallet +Rp500. Kirim bukti transfer setelah bayar.
        </div>

        <a href="/u" class="btn-action">Unggah Bukti Transfer</a>
    </div>

    <script>
        function copyText(val, btn) {
            navigator.clipboard.writeText(val).then(() => {
                const orig = btn.textContent;
                btn.textContent = 'Tersalin';
                btn.style.background = '#10b981';
                btn.style.color = '#ffffff';
                setTimeout(() => {
                    btn.textContent = orig;
                    btn.style.background = 'rgba(16, 185, 129, 0.15)';
                    btn.style.color = '#34d399';
                }, 1500);
            }).catch(() => {
                const temp = document.createElement('input');
                temp.value = val;
                document.body.appendChild(temp);
                temp.select();
                document.execCommand('copy');
                document.body.removeChild(temp);
                btn.textContent = 'Tersalin';
                btn.style.background = '#10b981';
                btn.style.color = '#ffffff';
                setTimeout(() => {
                    btn.textContent = 'Salin';
                    btn.style.background = 'rgba(16, 185, 129, 0.15)';
                    btn.style.color = '#34d399';
                }, 1500);
            });
        }
    </script>
</body>
</html>`;

    res.send(html);
});

// Route Preview Bukti Pembayaran dengan Open Graph Metadata (/b/:filename & /v/:filename)
app.get(['/b/:filename', '/v/:filename'], (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public', 'uploads', 'payments', filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Bukti pembayaran tidak ditemukan atau sudah kadaluarsa.');
    }

    const { baseUrl } = getPublicUrlInfo(req);
    const rawImageUrl = `${baseUrl}/uploads/payments/${filename}`;
    const pageUrl = `${baseUrl}/b/${filename}`;
    const mimeType = getImgMimeType(filename);

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Bukti Transfer - Jajan Digital</title>

    <!-- Open Graph Meta Tags untuk Pratinjau Gambar di WhatsApp -->
    <meta property="og:site_name" content="Jajan Digital" />
    <meta property="og:title" content="Bukti Transfer - Jajan Digital" />
    <meta property="og:description" content="Foto bukti transfer Jajan Digital." />
    <meta property="og:image" content="${rawImageUrl}" />
    <meta property="og:image:secure_url" content="${rawImageUrl}" />
    <meta property="og:image:type" content="${mimeType}" />
    <meta property="og:image:width" content="600" />
    <meta property="og:image:height" content="600" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${pageUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${rawImageUrl}" />

    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
        body {
            margin: 0; padding: 10px; background: #0b1329; color: white;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            min-height: 100vh;
        }
        .container { max-width: 95vw; text-align: center; }
        .title { font-size: 0.9rem; font-weight: 700; color: #34d399; margin-bottom: 8px; }
        img { max-width: 100%; max-height: 82vh; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15); display: block; margin: 0 auto; }
    </style>
</head>
<body>
    <div class="container">
        <div class="title">Bukti Transfer Jajan Digital</div>
        <a href="${rawImageUrl}" target="_blank">
            <img src="${rawImageUrl}" alt="Bukti Transfer">
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
            const randomName = 'p_' + crypto.randomBytes(4).toString('hex') + ext;
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
    const { baseUrl } = getPublicUrlInfo(req);
    const viewUrl = `/b/${req.file.filename}`;
    const fullUrl = `${baseUrl}${viewUrl}`;
    
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
