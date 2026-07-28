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
    const publicPaths = ['/login', '/api/login', '/api/get-registered-admin-phone', '/api/request-reset-otp', '/api/verify-reset-otp', '/upload-bukti', '/api/upload-bukti', '/qris', '/q', '/u', '/favicon.ico'];
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
app.get(['/u', '/upload-bukti'], async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    await renderPaymentPage(req, res, true);
});

// Route Public QRIS dengan Open Graph Metadata (/q & /qris)
app.get(['/q', '/qris', '/qris/:filename', '/v/qris'], async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    await renderPaymentPage(req, res, false);
});

async function renderPaymentPage(req, res, startFlipped = false) {
    let filename = req.params ? (req.params.filename || 'Qris.jpeg') : 'Qris.jpeg';
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

    // Ambil total transaksi sukses secara live dari database (mulai dari 176)
    let txCount = 176;
    try {
        const db = await getDb();
        const row = await db.get("SELECT COUNT(*) as total FROM orders WHERE status = 'DONE'");
        if (row && row.total) {
            txCount += row.total;
        }
    } catch(_) {}
    const formattedTxCount = txCount.toLocaleString('id-ID');

    const { baseUrl } = getPublicUrlInfo(req);
    const fullImageUrl = rawImageUrl ? `${baseUrl}${rawImageUrl}` : `${baseUrl}/favicon.ico`;
    const pageUrl = `${baseUrl}/q`;
    const mimeType = getImgMimeType(filename);

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Pembayaran & Upload Bukti — Jajan Digital</title>

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

    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
        html, body {
            height: 100%;
            overflow: hidden;
            background: #070c19;
            color: #f8fafc;
        }

        body {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 8px;
            background-image: 
                radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.12) 0px, transparent 50%),
                radial-gradient(at 100% 100%, rgba(13, 148, 136, 0.12) 0px, transparent 50%);
        }

        .scene {
            width: 100%;
            max-width: 410px;
            height: min(100vh - 16px, 630px);
            perspective: 1200px;
        }

        .card-3d {
            width: 100%;
            height: 100%;
            position: relative;
            transform-style: preserve-3d;
            transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .card-3d.is-flipped {
            transform: rotateY(180deg);
        }

        .card-face {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
            background: rgba(15, 23, 42, 0.88);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 18px;
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6);
        }

        .card-back {
            transform: rotateY(180deg);
        }

        .header { text-align: center; margin-bottom: 2px; }
        .header h1 { font-size: 1.05rem; font-weight: 700; color: #38bdf8; letter-spacing: -0.3px; }
        
        .trust-badge {
            background: rgba(16, 185, 129, 0.12);
            border: 1px solid rgba(16, 185, 129, 0.28);
            color: #34d399;
            padding: 3px 10px;
            border-radius: 20px;
            font-size: 0.7rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-top: 3px;
        }
        .live-dot {
            width: 6px;
            height: 6px;
            background: #34d399;
            border-radius: 50%;
            box-shadow: 0 0 6px #34d399;
            animation: pulseDot 1.5s infinite;
        }
        @keyframes pulseDot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.85); }
        }

        .qris-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            margin: 4px 0;
        }
        .qris-img-bg {
            background: #ffffff;
            padding: 6px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.3);
        }
        .qris-img {
            width: 190px;
            height: 190px;
            object-fit: contain;
            display: block;
            border-radius: 6px;
        }

        .btn-zoom {
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.35);
            color: #38bdf8;
            padding: 5px 14px;
            border-radius: 8px;
            font-size: 0.75rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .bank-list {
            display: flex;
            flex-direction: column;
            gap: 5px;
            margin: 4px 0;
        }
        .bank-item {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            padding: 8px 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .bank-name { font-size: 0.75rem; font-weight: 800; color: #38bdf8; }
        .bank-num { font-family: monospace; font-size: 0.88rem; font-weight: 700; color: #f1f5f9; letter-spacing: 0.5px; }
        .bank-holder { font-size: 0.68rem; color: #94a3b8; }
        .btn-copy {
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid rgba(16, 185, 129, 0.35);
            color: #34d399;
            padding: 5px 12px;
            border-radius: 6px;
            font-size: 0.72rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .note-bar {
            background: rgba(234, 179, 8, 0.1);
            border: 1px solid rgba(234, 179, 8, 0.25);
            border-radius: 8px;
            padding: 6px 10px;
            font-size: 0.68rem;
            color: #fef08a;
            line-height: 1.3;
        }

        .btn-flip {
            background: linear-gradient(135deg, #0284c7 0%, #0d9488 100%);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            padding: 10px;
            border-radius: 10px;
            font-size: 0.88rem;
            font-weight: 700;
            cursor: pointer;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 4px 15px rgba(2, 132, 199, 0.35);
        }

        .btn-flip-back {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #cbd5e1;
            padding: 9px;
            border-radius: 10px;
            font-size: 0.82rem;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        /* Front / Back Dropzone Styles */
        .dropzone {
            border: 2px dashed rgba(56, 189, 248, 0.4);
            background: rgba(15, 23, 42, 0.5);
            border-radius: 12px;
            padding: 20px 10px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease;
            margin: 12px 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 180px;
        }
        .dropzone:hover { border-color: #38bdf8; background: rgba(56, 189, 248, 0.08); }
        .dropzone-icon { margin-bottom: 6px; display: flex; align-items: center; justify-content: center; }
        .dropzone-text { font-size: 0.85rem; font-weight: 600; color: #e2e8f0; }
        .dropzone-hint { font-size: 0.72rem; color: #94a3b8; margin-top: 4px; }

        .btn-upload-submit {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            border: none;
            padding: 10px;
            border-radius: 10px;
            font-size: 0.88rem;
            font-weight: 700;
            cursor: pointer;
            width: 100%;
            margin-bottom: 8px;
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
        }
        .btn-upload-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        .status-msg {
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 0.78rem;
            margin-bottom: 8px;
            display: none;
            text-align: center;
        }
        .status-success { background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; }
        .status-error { background: rgba(248, 113, 113, 0.2); border: 1px solid rgba(248, 113, 113, 0.4); color: #f87171; }
    </style>
</head>
<body>

    <div class="scene">
        <div class="card-3d ${startFlipped ? 'is-flipped' : ''}" id="card3d">
            
            <!-- SISI DEPAN: QRIS & REKENING PEMBAYARAN -->
            <div class="card-face card-front">
                <div class="header">
                    <h1>Pembayaran Jajan Digital</h1>
                    <div class="trust-badge">
                        <span class="live-dot"></span>
                        <span>${formattedTxCount} Total Transaksi Selesai</span>
                    </div>
                </div>

                <div class="qris-box">
                    <div class="qris-img-bg" onclick="openZoomModal()" style="cursor: zoom-in;">
                        <img src="${rawImageUrl}" alt="QRIS" class="qris-img">
                    </div>
                    <button type="button" onclick="openZoomModal()" class="btn-zoom">Perbesar QRIS</button>
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

                <button type="button" class="btn-flip" onclick="toggleFlip()">
                    <span>Sudah Bayar? Unggah Bukti</span>
                </button>
            </div>

            <!-- SISI BELAKANG: FORM UNGGAH BUKTI TRANSFER -->
            <div class="card-face card-back">
                <div class="header">
                    <h1>Unggah Bukti Transfer</h1>
                    <div class="trust-badge">
                        <span class="live-dot"></span>
                        <span>Verifikasi Aman & Cepat</span>
                    </div>
                </div>

                <form id="uploadForm" onsubmit="handleUploadSubmit(event)" style="display:flex; flex-direction:column; justify-content:space-between; flex:1;">
                    <div id="statusMsg" class="status-msg"></div>

                    <div class="dropzone" onclick="document.getElementById('fileInput').click()">
                        <div id="dropInitial">
                            <div class="dropzone-icon">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="17 8 12 3 7 8"/>
                                    <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                            </div>
                            <div class="dropzone-text">Pilih Foto Bukti Transfer</div>
                            <div class="dropzone-hint">Format JPG, PNG, WEBP (Max 2MB)</div>
                        </div>
                        <img id="previewImg" style="display:none; max-height:160px; max-width:100%; border-radius:8px; object-fit:contain;" alt="Pratinjau Bukti">
                        <input type="file" id="fileInput" accept="image/*" style="display:none;" onchange="handleFileSelect(event)">
                    </div>

                    <div>
                        <button type="submit" id="btnSubmitUpload" class="btn-upload-submit">Kirim Bukti Pembayaran</button>
                        <button type="button" class="btn-flip-back" onclick="toggleFlip()">
                            <span>← Kembali ke Halaman QRIS</span>
                        </button>
                    </div>
                </form>
            </div>

        </div>
    </div>

    <!-- Modal Lightbox Zoom QRIS -->
    <div id="zoomModal" onclick="closeZoomModal()" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.92); z-index:9999; flex-direction:column; align-items:center; justify-content:center; padding:15px; cursor:zoom-out;">
        <div style="position:absolute; top:20px; right:20px; color:white; font-size:22px; font-weight:bold; background:rgba(255,255,255,0.2); width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center;">✕</div>
        <img src="${rawImageUrl}" style="max-width:92vw; max-height:80vh; border-radius:12px; background:white; padding:10px; box-shadow:0 10px 30px rgba(0,0,0,0.8);" alt="QRIS Perbesar">
        <div style="color:#94a3b8; font-size:0.8rem; margin-top:14px;">Ketuk di mana saja untuk menutup</div>
    </div>

    <script>
        function toggleFlip() {
            const card = document.getElementById('card3d');
            card.classList.toggle('is-flipped');
        }

        function openZoomModal() {
            const modal = document.getElementById('zoomModal');
            modal.style.display = 'flex';
        }
        function closeZoomModal() {
            const modal = document.getElementById('zoomModal');
            modal.style.display = 'none';
        }

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

        function handleFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                const statusMsg = document.getElementById('statusMsg');
                statusMsg.className = 'status-msg status-error';
                statusMsg.textContent = 'Ukuran file foto terlalu besar! Maksimal 2MB.';
                statusMsg.style.display = 'block';
                event.target.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('previewImg').src = e.target.result;
                document.getElementById('previewImg').style.display = 'block';
                document.getElementById('dropInitial').style.display = 'none';
            };
            reader.readAsDataURL(file);
        }

        async function handleUploadSubmit(event) {
            event.preventDefault();
            const fileInput = document.getElementById('fileInput');
            const btn = document.getElementById('btnSubmitUpload');
            const statusMsg = document.getElementById('statusMsg');

            if (!fileInput.files || !fileInput.files[0]) {
                statusMsg.className = 'status-msg status-error';
                statusMsg.textContent = 'Silakan pilih foto bukti transfer terlebih dahulu!';
                statusMsg.style.display = 'block';
                return;
            }

            const file = fileInput.files[0];
            if (file.size > 2 * 1024 * 1024) {
                statusMsg.className = 'status-msg status-error';
                statusMsg.textContent = 'Ukuran file foto terlalu besar! Maksimal 2MB.';
                statusMsg.style.display = 'block';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Mengunggah...';
            statusMsg.style.display = 'none';

            const formData = new FormData();
            formData.append('file', fileInput.files[0]);

            try {
                const res = await fetch('/api/upload-bukti', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    const fullUrl = data.fullUrl || (window.location.origin + data.url);

                    // Otomatis salin ke clipboard jika diizinkan browser
                    try {
                        navigator.clipboard.writeText(fullUrl);
                    } catch(_) {}

                    statusMsg.className = 'status-msg status-success';
                    statusMsg.innerHTML = '<div style="font-weight:700; font-size:0.95rem; color:#34d399; margin-bottom:4px;">Unggah Bukti Berhasil!</div>' +
                        '<div style="font-size:0.74rem; color:#94a3b8; margin-bottom:8px;">Link telah disalin ke clipboard. Tempelkan di chat WhatsApp:</div>' +
                        '<div style="background:rgba(15,23,42,0.85); border:1px solid rgba(56,189,248,0.35); padding:8px 10px; border-radius:8px; font-family:monospace; font-size:0.8rem; color:#38bdf8; word-break:break-all; user-select:all; margin-bottom:10px; text-align:center;" onclick="copyText(\'' + fullUrl + '\', document.getElementById(\'btnCopyResult\'))">' + fullUrl + '</div>' +
                        '<button type="button" id="btnCopyResult" class="btn-copy" onclick="copyText(\'' + fullUrl + '\', this)" style="width:100%; padding:10px; font-size:0.85rem; font-weight:700; background:#10b981; color:#ffffff; border-radius:8px; border:none; box-shadow:0 4px 12px rgba(16,185,129,0.35);">Salin Link Bukti</button>';
                    statusMsg.style.display = 'block';

                    const dropzoneEl = document.querySelector('.dropzone');
                    if (dropzoneEl) dropzoneEl.style.display = 'none';
                    btn.style.display = 'none';
                } else {
                    statusMsg.className = 'status-msg status-error';
                    statusMsg.textContent = data.error || 'Gagal mengunggah bukti.';
                    statusMsg.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = 'Kirim Bukti Pembayaran';
                }
            } catch (err) {
                statusMsg.className = 'status-msg status-error';
                statusMsg.textContent = 'Gangguan koneksi ke server.';
                statusMsg.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Kirim Bukti Pembayaran';
            }
        }
    </script>
</body>
</html>`;

    res.send(html);
}

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


const loginAttempts = new Map();

app.post('/api/login', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };

    if (attempts.lockUntil > now) {
        const remainingSec = Math.ceil((attempts.lockUntil - now) / 1000);
        return res.status(429).json({ success: false, error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${remainingSec} detik.` });
    }

    const { username, password, rememberMe } = req.body;

    // Load credentials secara dinamis dari config
    const currentAdminUser = config.admin_username || ADMIN_USERNAME;
    const currentAdminPass = config.admin_password || ADMIN_PASSWORD;

    if (username === currentAdminUser && password === currentAdminPass) {
        loginAttempts.delete(ip);
        const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        activeSessions.add(token);
        saveSessions();
        const maxAge = rememberMe ? (30 * 24 * 60 * 60 * 1000) : (24 * 60 * 60 * 1000); // 30 hari vs 1 hari
        res.cookie('session_token', token, { httpOnly: true, secure: false, maxAge });
        return res.json({ success: true });
    }

    attempts.count += 1;
    if (attempts.count >= 5) {
        attempts.lockUntil = now + (5 * 60 * 1000); // Lockout 5 menit
        attempts.count = 0;
    }
    loginAttempts.set(ip, attempts);

    const remaining = 5 - (attempts.count);
    return res.status(401).json({ success: false, error: 'Username atau password salah!' });
});

// ─── Otentikasi Reset Password via WA OTP ──────────────────────────────────
const resetOtpBucket = new Map();
const otpRateBucket = new Map();

app.get('/api/get-registered-admin-phone', async (req, res) => {
    try {
        let bossNumSetting = config.boss_number || config.owner_number || '';
        try {
            const db = await getDb();
            const row = await db.get("SELECT value FROM settings WHERE key = 'boss_number'");
            if (row && row.value) bossNumSetting = row.value;
        } catch(_) {}

        const cleanBossNum = bossNumSetting.replace(/[^0-9]/g, '');

        if (!cleanBossNum) {
            return res.json({ hasNumber: false });
        }

        let maskedPhone = cleanBossNum;
        if (cleanBossNum.length >= 8) {
            const prefix = cleanBossNum.slice(0, 4);
            const suffix = cleanBossNum.slice(-4);
            maskedPhone = `${prefix}****${suffix}`;
        }

        return res.json({ hasNumber: true, maskedPhone });
    } catch (err) {
        return res.json({ hasNumber: false });
    }
});

app.post('/api/request-reset-otp', async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const lastRequest = otpRateBucket.get(ip) || 0;

        if (now - lastRequest < 60 * 1000) {
            const remaining = Math.ceil((60 * 1000 - (now - lastRequest)) / 1000);
            return res.status(429).json({ success: false, error: `Harap tunggu ${remaining} detik sebelum meminta OTP lagi.` });
        }

        const { newPhone } = req.body || {};

        // Ambil boss_number secara otomatis dari config & SQLite settings (Pengaturan Dasbor)
        let bossNumSetting = config.boss_number || config.owner_number || '';
        try {
            const db = await getDb();
            const row = await db.get("SELECT value FROM settings WHERE key = 'boss_number'");
            if (row && row.value) bossNumSetting = row.value;
        } catch(_) {}

        let cleanBossNum = bossNumSetting.replace(/[^0-9]/g, '');

        // Jika belum ada nomor terdaftar & user mengirimkan nomor baru
        if (!cleanBossNum) {
            if (!newPhone || newPhone.trim().length < 8) {
                return res.status(400).json({ success: false, error: 'Belum ada nomor terdaftar. Harap masukkan nomor WhatsApp Super Admin Anda.' });
            }
            cleanBossNum = newPhone.replace(/[^0-9]/g, '');
            if (cleanBossNum.startsWith('0')) cleanBossNum = '62' + cleanBossNum.slice(1);

            // Simpan ke config & SQLite
            const { updateConfig } = require('./src/config/config');
            updateConfig({ boss_number: cleanBossNum });
            try {
                const db = await getDb();
                await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('boss_number', ?)", [cleanBossNum]);
            } catch(_) {}
            console.log(`[Auth Reset] Nomor Super Admin baru didaftarkan: ${cleanBossNum}`);
        }

        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            return res.status(530).json({ success: false, error: 'Bot WhatsApp sedang offline. Pastikan bot terhubung.' });
        }

        otpRateBucket.set(ip, now);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        resetOtpBucket.set(cleanBossNum, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

        const recipientJid = cleanBossNum.startsWith('62') ? `${cleanBossNum}@c.us` : `62${cleanBossNum.replace(/^0/, '')}@c.us`;
        const maskedPhone = cleanBossNum.slice(0, 4) + '****' + cleanBossNum.slice(-4);
        const msgText = `*[KEAMANAN DASBOR JAJAN DIGITAL]*\n\nKode OTP Reset Password Admin Anda adalah: *${otp}*\n\nKode ini berlaku selama 10 menit. JANGAN berikan kode ini kepada siapapun demi keamanan akun Anda.`;

        await client.sendMessage(recipientJid, msgText);
        console.log(`[Auth Reset] OTP sent to ${cleanBossNum}: ${otp}`);

        res.json({ success: true, message: `Kode OTP telah dikirimkan ke WhatsApp Super Admin (${maskedPhone}).` });
    } catch (err) {
        console.error('[Auth Reset] Gagal mengirim OTP WA:', err.message);
        res.status(500).json({ success: false, error: 'Gagal mengirim OTP via WhatsApp: ' + err.message });
    }
});

app.post('/api/verify-reset-otp', async (req, res) => {
    try {
        const { otp, newPassword } = req.body;
        if (!otp || !newPassword) {
            return res.status(400).json({ success: false, error: 'OTP dan Password Baru wajib diisi.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'Password baru minimal 6 karakter.' });
        }

        let bossNumSetting = config.boss_number || config.owner_number || '';
        try {
            const db = await getDb();
            const row = await db.get("SELECT value FROM settings WHERE key = 'boss_number'");
            if (row && row.value) bossNumSetting = row.value;
        } catch(_) {}
        const cleanBossNum = bossNumSetting.replace(/[^0-9]/g, '');

        const record = resetOtpBucket.get(cleanBossNum);

        if (!record || record.expiresAt < Date.now()) {
            return res.status(400).json({ success: false, error: 'Kode OTP kadaluarsa atau belum diminta. Klik kirim OTP ulang.' });
        }

        if (record.otp !== otp.trim()) {
            return res.status(400).json({ success: false, error: 'Kode OTP yang dimasukkan salah!' });
        }

        resetOtpBucket.delete(cleanBossNum);

        const { updateConfig } = require('./src/config/config');
        updateConfig({ admin_password: newPassword });

        const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        activeSessions.add(token);
        saveSessions();
        res.cookie('session_token', token, { httpOnly: true, secure: false, maxAge: 24 * 60 * 60 * 1000 });

        console.log(`[Auth Reset] Password Admin berhasil diubah untuk ${cleanBossNum}`);
        res.json({ success: true, message: 'Password Admin berhasil diubah! Mengalihkan ke dasbor...' });
    } catch (err) {
        console.error('[Auth Reset] Gagal mereset password:', err.message);
        res.status(500).json({ success: false, error: 'Gagal mereset password: ' + err.message });
    }
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
            const ext = path.extname(file.originalname).toLowerCase() || '.png';
            const randomName = 'p_' + crypto.randomBytes(4).toString('hex') + ext;
            cb(null, randomName);
        }
    }),
    fileFilter: (req, file, cb) => {
        const allowedExts = /\.(jpg|jpeg|png|webp)$/i;
        const allowedMimes = /^image\/(jpeg|jpg|png|webp)$/i;
        if (allowedExts.test(file.originalname) && allowedMimes.test(file.mimetype)) {
            return cb(null, true);
        }
        cb(new Error('Hanya file gambar (JPG, PNG, WEBP) yang diizinkan!'));
    },
    limits: { fileSize: 2 * 1024 * 1024 }
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
