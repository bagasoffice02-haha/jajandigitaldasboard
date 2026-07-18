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
const archiver = require('archiver');
const unzipper = require('unzipper');

const { config, updateConfig: saveConfig } = require('./src/config/config');
const { initDatabase, getDb } = require('./src/db/sqlite');
const { 
    getGroupConfigs, 
    saveGroupConfig, 
    deleteGroupConfig, 
    getShopData, 
    addAdmin, 
    removeAdmin, 
    addCustomer, 
    removeCustomer, 
    getLogHistory, 
    saveLogHistory 
} = require('./src/db/models');
const { 
    createNewClient, 
    getClient, 
    getStatus, 
    getQrCode, 
    cleanupHeadlessChrome,
    restartClient
} = require('./src/services/whatsapp/client');
const { performOCR, isReceiptText, extractReceiptDetails } = require('./src/services/ocr/ocrService');
const { setSocketIo } = require('./src/services/ai/aiService');
const { sendDailyReport, checkPremiumExpirations, runWeeklyBackup } = require('./src/scheduler/reminderJob');

// Setup Express Web Server & Socket.io
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = config.port || 3000;

app.use(express.json());

// Global Session Token Store (Persistent JSON to survive restarts)
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

// Middleware Autentikasi Dasbor
function checkAuth(req, res, next) {
    const publicPaths = ['/login', '/api/login', '/favicon.ico'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    let token = null;
    const cookies = req.headers.cookie;
    if (cookies) {
        const parts = cookies.split(';');
        for (const part of parts) {
            const [k, v] = part.trim().split('=');
            if (k === 'session_token') {
                token = v;
                break;
            }
        }
    }

    if (token && activeSessions.has(token)) {
        return next();
    }

    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
}

app.use(checkAuth);

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        activeSessions.add(token);
        saveSessions();
        res.cookie('session_token', token, { httpOnly: true, secure: false, maxAge: 24 * 60 * 60 * 1000 }); // 24 jam
        return res.json({ success: true });
    }
    return res.status(401).json({ success: false, error: 'Username atau password salah!' });
});

app.post('/api/logout', (req, res) => {
    const cookies = req.headers.cookie;
    if (cookies) {
        const parts = cookies.split(';');
        for (const part of parts) {
            const [k, v] = part.trim().split('=');
            if (k === 'session_token') {
                activeSessions.delete(v);
                saveSessions();
                break;
            }
        }
    }
    res.clearCookie('session_token');
    res.json({ success: true });
});

app.get('/api/auth-status', (req, res) => {
    res.json({ authenticated: true });
});

// Middleware penyajian file statis express
app.use(express.static(path.join(__dirname, 'public')));
app.use('/knowledge', express.static(path.join(__dirname, 'knowledge')));
app.use('/media', express.static(path.join(__dirname, 'media')));

const KNOWLEDGE_DIR = './knowledge';
const MEDIA_DIR = './media';
if (!fs.existsSync(KNOWLEDGE_DIR)) fs.mkdirSync(KNOWLEDGE_DIR);
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);

// Multer Storage Configuration
const knowledgeStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, KNOWLEDGE_DIR),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const knowledgeUpload = multer({ storage: knowledgeStorage });

const mediaStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, MEDIA_DIR),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const mediaUpload = multer({ storage: mediaStorage });

// API: Orders
app.get('/api/orders', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.json([]);
        const rows = await db.all('SELECT * FROM orders ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error('Gagal mengambil orders:', err.message);
        res.status(500).json({ error: 'Gagal mengambil data pesanan' });
    }
});

app.post('/api/orders/:id/status', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        const { id } = req.params;
        const { status } = req.body;
        await db.run('UPDATE orders SET status = ? WHERE id = ?', status, id);
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal update status order:', err.message);
        res.status(500).json({ error: 'Gagal update status pesanan' });
    }
});

app.delete('/api/orders/:id', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        const { id } = req.params;
        await db.run('DELETE FROM orders WHERE id = ?', id);
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal menghapus order:', err.message);
        res.status(500).json({ error: 'Gagal menghapus pesanan' });
    }
});

// API: Invoices
app.get('/api/invoices', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.json([]);
        const rows = await db.all('SELECT * FROM invoices ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error('Gagal mengambil invoices:', err.message);
        res.status(500).json({ error: 'Gagal mengambil data invoice' });
    }
});

app.post('/api/invoices', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        const { id, customer_number, customer_name, status, details } = req.body;
        
        await db.run(
            'INSERT INTO invoices (id, customer_number, customer_name, status, details) VALUES (?, ?, ?, ?, ?)',
            id || ('INV-' + Date.now().toString().substring(6)),
            customer_number || 'DASHBOARD',
            customer_name || 'Dashboard User',
            status || 'SELESAI',
            details || 'Pembayaran OCR'
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal membuat invoice baru:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/invoices/:id/status', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        const { id } = req.params;
        const { status } = req.body;
        await db.run('UPDATE invoices SET status = ? WHERE id = ?', status, id);
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal update status invoice:', err.message);
        res.status(500).json({ error: 'Gagal update status invoice' });
    }
});

app.delete('/api/invoices/:id', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        const { id } = req.params;
        await db.run('DELETE FROM invoices WHERE id = ?', id);
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal menghapus invoice:', err.message);
        res.status(500).json({ error: 'Gagal menghapus data invoice' });
    }
});

// API: CRM Customer Notes
app.post('/api/customers/update-crm', async (req, res) => {
    try {
        const { customer_number, notes } = req.body;
        if (!customer_number) return res.status(400).json({ error: 'Nomor pelanggan wajib diisi' });
        await addCustomer(customer_number, notes);
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal update CRM:', err.message);
        res.status(500).json({ error: 'Gagal update data CRM pelanggan' });
    }
});

// API: Premium products
app.get('/api/premium/products', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.json([]);
        const rows = await db.all('SELECT * FROM premium_products ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        console.error('Gagal mengambil premium products:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/premium/products', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Nama produk wajib diisi' });
        await db.run('INSERT INTO premium_products (name) VALUES (?)', name.trim());
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal menambah premium product:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/premium/products/:id', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        const { id } = req.params;
        await db.run('DELETE FROM premium_products WHERE id = ?', id);
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal menghapus premium product:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// API: Premium accounts
app.get('/api/premium/accounts', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.json([]);
        const rows = await db.all(`
            SELECT a.*, p.name AS product_name,
                   (SELECT COUNT(*) FROM premium_sales s WHERE s.account_id = a.id) AS active_users
            FROM premium_accounts a 
            LEFT JOIN premium_products p ON a.product_id = p.id 
            ORDER BY a.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Gagal mengambil premium accounts:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/premium/accounts', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        const { product_id, email, password, max_users, status, notes } = req.body;
        
        await db.run(`
            INSERT INTO premium_accounts (product_id, email, password, max_users, status, notes) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, product_id, email, password, max_users || 1, status || 'Tersedia', notes || '');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal menambah premium account:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/premium/accounts/:id', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        const { id } = req.params;
        await db.run('DELETE FROM premium_accounts WHERE id = ?', id);
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal menghapus premium account:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// API: Premium sales
app.get('/api/premium/sales', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.json([]);
        const rows = await db.all(`
            SELECT s.*, a.email AS account_email, p.name AS product_name 
            FROM premium_sales s 
            LEFT JOIN premium_accounts a ON s.account_id = a.id 
            LEFT JOIN premium_products p ON a.product_id = p.id 
            ORDER BY s.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Gagal mengambil premium sales:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/premium/sales', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        const { account_id, buyer_name, buyer_phone, price, payment_status, profile_name, start_date, end_date, auto_remind } = req.body;
        
        await db.run(`
            INSERT INTO premium_sales (account_id, buyer_name, buyer_phone, price, payment_status, profile_name, start_date, end_date, auto_remind) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, account_id, buyer_name, buyer_phone, price || 0, payment_status || 'Belum Bayar', profile_name || '', start_date || '', end_date || '', auto_remind !== false ? 1 : 0);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal menambah penjualan premium:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/premium/sales/:id', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        const { id } = req.params;
        await db.run('DELETE FROM premium_sales WHERE id = ?', id);
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal menghapus penjualan premium:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/premium/send-reminder', async (req, res) => {
    try {
        const { sale_id } = req.body;
        const db = getDb();
        const sale = await db.get(`
            SELECT s.*, a.email AS account_email, p.name AS product_name 
            FROM premium_sales s 
            LEFT JOIN premium_accounts a ON s.account_id = a.id 
            LEFT JOIN premium_products p ON a.product_id = p.id 
            WHERE s.id = ?
        `, sale_id);
        
        if (!sale) return res.status(404).json({ error: 'Data penjualan tidak ditemukan' });
        
        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            return res.status(500).json({ error: 'WhatsApp client belum terhubung' });
        }
        
        const cleanPhone = sale.buyer_phone.replace(/\D/g, '') + '@c.us';
        const profileInfo = sale.profile_name ? ` (Slot Profile: ${sale.profile_name})` : '';
        const msgText = `🔔 *PENGINGAT MASA AKTIF LANGGANAN PREMIUM* 🔔\n\nHalo Kak *${sale.buyer_name}*,\n\nKami menginformasikan bahwa langganan akun premium Anda untuk produk *${sale.product_name}*${profileInfo} akan segera berakhir pada *${sale.end_date}*.\n\nKredensial Akun:\n- Login: \`${sale.account_email}\`\n- Sandi: \`${sale.password || 'Hubungi Admin'}\`\n\nSilakan lakukan perpanjangan langganan sebelum masa aktif berakhir agar layanan tidak terputus. Terima kasih! 🙏`;
        
        await client.sendMessage(cleanPhone, msgText);
        res.json({ success: true });
    } catch (err) {
        console.error('Gagal mengirim reminder manual:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// API: Files list and manage
app.get('/api/files', (req, res) => {
    try {
        const knowledgeFiles = fs.existsSync(KNOWLEDGE_DIR) ? fs.readdirSync(KNOWLEDGE_DIR) : [];
        const mediaFiles = fs.existsSync(MEDIA_DIR) ? fs.readdirSync(MEDIA_DIR) : [];
        
        res.json({
            knowledge: knowledgeFiles.map(name => ({ name })),
            media: mediaFiles.map(name => ({ name }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/upload/knowledge', knowledgeUpload.single('file'), (req, res) => {
    res.json({ success: true });
});

app.post('/api/upload/media', mediaUpload.single('file'), (req, res) => {
    res.json({ success: true });
});

// API: OCR Receipt Analysis
app.post('/api/ocr', mediaUpload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Tidak ada file gambar yang diupload' });
    }
    
    try {
        const filePath = req.file.path;
        const buffer = fs.readFileSync(filePath);
        const ocrText = await performOCR(buffer);
        
        // Hapus file temp setelah OCR selesai
        try { fs.unlinkSync(filePath); } catch(_) {}
        
        const isReceipt = isReceiptText(ocrText);
        let parsed = null;
        if (isReceipt) {
            parsed = await extractReceiptDetails(ocrText);
        }
        
        res.json({
            success: true,
            text: ocrText,
            isReceipt: isReceipt,
            parsed: parsed
        });
    } catch (err) {
        console.error('Error saat OCR di Dashboard:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/files/delete', (req, res) => {
    const { type, filename } = req.body;
    const targetDir = type === 'media' ? MEDIA_DIR : KNOWLEDGE_DIR;
    const filePath = path.join(targetDir, filename);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Gagal menghapus berkas: ' + err.message });
        }
    } else {
        res.status(404).json({ error: 'File tidak ditemukan' });
    }
});

app.post('/api/files/rename', (req, res) => {
    const { type, oldFilename, newFilename, oldName, newName } = req.body;
    const oldNameFinal = oldFilename || oldName;
    const newNameFinal = newFilename || newName;
    
    if (!oldNameFinal || !newNameFinal) {
        return res.status(400).json({ error: 'Nama file lama atau baru tidak valid' });
    }

    const targetDir = type === 'media' ? MEDIA_DIR : KNOWLEDGE_DIR;
    const oldPath = path.join(targetDir, oldNameFinal);
    const newPath = path.join(targetDir, newNameFinal);
    
    if (fs.existsSync(oldPath)) {
        try {
            fs.renameSync(oldPath, newPath);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Gagal mengubah nama berkas: ' + err.message });
        }
    } else {
        res.status(404).json({ error: 'File tidak ditemukan' });
    }
});

// API: Config manager
app.get('/api/config', (req, res) => {
    res.json(config);
});

app.post('/api/config', (req, res) => {
    try {
        const newConfig = req.body;
        // Jangan timpa api_key jika yang dikirim adalah placeholder atau kosong
        const isPlaceholder = (v) => !v || v.includes('YOUR_LOCAL') || v.includes('TOKEN');
        if (isPlaceholder(newConfig.api_key)) {
            delete newConfig.api_key; // Pertahankan nilai lama
        }
        Object.assign(config, newConfig);
        saveConfig(config);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// API: Groups configs
app.get('/api/groups', async (req, res) => {
    try {
        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            const { group_configs: gConfigs } = await getGroupConfigs();
            const groups = Object.keys(gConfigs).map(id => {
                const cfg = gConfigs[id];
                const cleanName = (cfg.groupName && !cfg.groupName.includes('@g.us')) ? cfg.groupName : id;
                return { id, name: cleanName, isConfigured: true, enabled: cfg.enabled, config: cfg };
            });
            return res.json(groups);
        }
        
        let chats = [];
        try {
            chats = await client.getChats();
        } catch (err) {
            console.warn('[API Groups] Gagal mengambil chats via client.getChats(), fallback ke DB:', err.message);
            const { group_configs: gConfigs } = await getGroupConfigs();
            const groups = Object.keys(gConfigs).map(id => {
                const cfg = gConfigs[id];
                const cleanName = (cfg.groupName && !cfg.groupName.includes('@g.us')) ? cfg.groupName : id;
                return { id, name: cleanName, isConfigured: true, enabled: cfg.enabled, config: cfg };
            });
            return res.json(groups);
        }
        
        const groupChats = chats.filter(chat => chat.isGroup);
        const { group_configs: gConfigs } = await getGroupConfigs();
        const configuredGroupIds = Object.keys(gConfigs);
        
        const results = [];
        groupChats.forEach(g => {
            const isConfigured = configuredGroupIds.includes(g.id._serialized);
            const cfg = gConfigs[g.id._serialized] || {};
            const cleanName = (cfg.groupName && !cfg.groupName.includes('@g.us')) ? cfg.groupName : (g.name || g.id._serialized);
            results.push({
                id: g.id._serialized,
                name: cleanName,
                isConfigured: isConfigured,
                enabled: cfg.enabled !== false,
                config: cfg
            });
        });
        
        configuredGroupIds.forEach(id => {
            if (!results.find(r => r.id === id)) {
                const cfg = gConfigs[id];
                const cleanName = (cfg.groupName && !cfg.groupName.includes('@g.us')) ? cfg.groupName : id;
                results.push({
                    id,
                    name: cleanName,
                    isConfigured: true,
                    enabled: cfg.enabled,
                    config: cfg
                });
            }
        });
        
        res.json(results);
    } catch (err) {
        console.error('Gagal mengambil list grup:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/group-config/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { group_configs: gConfigs } = await getGroupConfigs();
        const cfg = gConfigs[groupId] || {
            groupId,
            groupName: groupId,
            enabled: true,
            useAiFallback: true,
            triggerPrefix: '',
            allowedKnowledgeFiles: [],
            categoryFooter: 'Silakan pilih menu dengan mengetik angkanya:',
            contentFooter: 'Ketik *0* untuk kembali ke menu sebelumnya, atau *#* untuk kembali ke menu utama.',
            menuTree: { id: "root", name: "Menu Utama", type: "category", text: "Silakan pilih salah satu opsi di bawah ini:", children: [] }
        };
        res.json(cfg);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/group-config/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const cfg = req.body;
        await saveGroupConfig(groupId, cfg);
        io.emit('group_config_updated', { groupId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/group-config/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        await deleteGroupConfig(groupId);
        io.emit('group_config_updated', { groupId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Shop data
app.get('/api/shop/pinned-chats', async (req, res) => {
    try {
        const client = getClient();
        const db = getDb();
        const admins = await db.all('SELECT phone FROM shop_admins') || [];
        const adminPhones = new Set(admins.map(a => a.phone.replace(/\D/g, '')));
        
        const fallbackToDbAdmins = () => {
            return admins.map(a => {
                const clean = a.phone.replace(/\D/g, '');
                return {
                    id: `${clean}@c.us`,
                    name: clean,
                    phone: clean,
                    isHostAdmin: true
                };
            });
        };
        
        if (!client || getStatus() !== 'CONNECTED') {
            return res.json(fallbackToDbAdmins());
        }
        
        let chats = [];
        try {
            chats = await client.getChats();
        } catch (err) {
            console.warn('[API Pinned Chats] Gagal mengambil chats via client.getChats(), fallback ke DB:', err.message);
            return res.json(fallbackToDbAdmins());
        }
        
        // Chat pribadi tersemat (pinned & not group)
        const pinned = chats.filter(chat => chat.pinned && !chat.isGroup).map(chat => {
            const phone = (chat.id.user || '').replace(/\D/g, '');
            return {
                id: chat.id._serialized,
                name: chat.name || phone,
                phone: phone,
                isHostAdmin: adminPhones.has(phone)
            };
        });
        
        // Gabungkan dengan admin terdaftar di DB yang tidak ada di daftar tersemat agar tetap muncul
        const pinnedPhones = new Set(pinned.map(p => p.phone));
        admins.forEach(a => {
            const clean = a.phone.replace(/\D/g, '');
            if (clean && !pinnedPhones.has(clean)) {
                pinned.push({
                    id: `${clean}@c.us`,
                    name: clean,
                    phone: clean,
                    isHostAdmin: true
                });
            }
        });
        
        res.json(pinned);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/shop/admins', async (req, res) => {
    try {
        const shopData = await getShopData();
        const cleanAdmins = (shopData.host_admins || []).map(a => a.replace(/\D/g, ''));
        res.json(cleanAdmins);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/shop/admins', async (req, res) => {
    try {
        const { admins } = req.body;
        if (!Array.isArray(admins)) return res.status(400).json({ error: 'Format salah' });
        
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        
        // Hapus semua admin terlebih dahulu
        await db.run('DELETE FROM shop_admins');
        
        // Tambahkan admin yang baru
        const added = new Set();
        for (const phone of admins) {
            const cleanPhone = phone.split('@')[0].replace(/\D/g, '');
            if (cleanPhone && !added.has(cleanPhone)) {
                await addAdmin(cleanPhone, 'Admin Host');
                added.add(cleanPhone);
            }
        }
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/shop/customers', async (req, res) => {
    try {
        const shopData = await getShopData();
        res.json(shopData.customers || []);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/shop/customers', async (req, res) => {
    try {
        const { customers } = req.body;
        if (!Array.isArray(customers)) return res.status(400).json({ error: 'Format salah' });
        
        for (const cust of customers) {
            await addCustomer(cust.phone, cust.name);
        }
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/shop/broadcast', async (req, res) => {
    try {
        const { targetType, customNumbers, targetGroup, message, media, delay } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Pesan broadcast wajib diisi.' });
        }
        
        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            return res.status(500).json({ error: 'WhatsApp client tidak terhubung.' });
        }
        
        // 1. Tentukan daftar target JID
        let targetIds = [];
        
        if (targetType === 'groups') {
            const { group_configs: gConfigs } = await getGroupConfigs();
            targetIds = Object.keys(gConfigs).filter(gid => gConfigs[gid].enabled);
        } else if (targetType === 'custom_numbers') {
            if (!customNumbers) {
                return res.status(400).json({ error: 'Nomor HP kustom wajib diisi.' });
            }
            targetIds = customNumbers
                .split(/[\n,]+/)
                .map(num => num.trim().replace(/\D/g, ''))
                .filter(num => num.length > 5)
                .map(num => `${num}@c.us`);
        } else if (targetType === 'group_members') {
            if (!targetGroup) {
                return res.status(400).json({ error: 'Grup asal anggota wajib dipilih.' });
            }
            try {
                console.log(`[Broadcast] Mengambil anggota grup untuk ${targetGroup}...`);
                let resolvedParticipants = [];

                // Strategi 1: Direct GroupMetadata find (paling cepat & aman untuk grup besar)
                try {
                    const strategy1 = await client.pupPage.evaluate(async (chatId) => {
                        try {
                            if (window.Store && window.Store.GroupMetadata) {
                                const metadata = await window.Store.GroupMetadata.find(chatId);
                                if (metadata && metadata.participants) {
                                    return metadata.participants.map(p => {
                                        const id = p.id || p;
                                        return typeof id === 'object' ? (id._serialized || id.toString()) : id;
                                    }).filter(Boolean);
                                }
                            }
                        } catch (e) {
                            // ignore
                        }
                        return null;
                    }, targetGroup);
                    
                    if (strategy1 && strategy1.length > 0) {
                        resolvedParticipants = strategy1;
                        console.log(`[Broadcast] Strategi 1 (GroupMetadata) Sukses: ${resolvedParticipants.length} anggota ditemukan.`);
                    }
                } catch (s1Err) {
                    console.warn('[Broadcast Warning] Strategi 1 Error:', s1Err.message);
                }

                // Strategi 2: Direct Chat Store get
                if (resolvedParticipants.length === 0) {
                    try {
                        const strategy2 = await client.pupPage.evaluate((chatId) => {
                            try {
                                if (window.Store && window.Store.Chat) {
                                    const chatInstance = window.Store.Chat.get(chatId);
                                    if (chatInstance && chatInstance.groupMetadata && chatInstance.groupMetadata.participants) {
                                        return chatInstance.groupMetadata.participants.map(p => {
                                            const id = p.id || p;
                                            return typeof id === 'object' ? (id._serialized || id.toString()) : id;
                                        }).filter(Boolean);
                                    }
                                }
                            } catch (e) {
                                // ignore
                            }
                            return null;
                        }, targetGroup);

                        if (strategy2 && strategy2.length > 0) {
                            resolvedParticipants = strategy2;
                            console.log(`[Broadcast] Strategi 2 (Chat Store get) Sukses: ${resolvedParticipants.length} anggota ditemukan.`);
                        }
                    } catch (s2Err) {
                        console.warn('[Broadcast Warning] Strategi 2 Error:', s2Err.message);
                    }
                }

                // Strategi 3: client.getChatById (Standard WWebJS)
                if (resolvedParticipants.length === 0) {
                    try {
                        const chat = await client.getChatById(targetGroup);
                        if (chat && chat.participants) {
                            resolvedParticipants = chat.participants.map(p => p.id._serialized);
                            console.log(`[Broadcast] Strategi 3 (getChatById) Sukses: ${resolvedParticipants.length} anggota ditemukan.`);
                        }
                    } catch (s3Err) {
                        console.warn('[Broadcast Warning] Strategi 3 Error:', s3Err.message);
                    }
                }

                // Strategi 4: client.getChats search
                if (resolvedParticipants.length === 0) {
                    try {
                        const chats = await client.getChats();
                        const matchingChat = chats.find(c => c.id._serialized === targetGroup);
                        if (matchingChat && matchingChat.participants) {
                            resolvedParticipants = matchingChat.participants.map(p => p.id._serialized);
                            console.log(`[Broadcast] Strategi 4 (getChats search) Sukses: ${resolvedParticipants.length} anggota ditemukan.`);
                        }
                    } catch (s4Err) {
                        console.warn('[Broadcast Warning] Strategi 4 Error:', s4Err.message);
                    }
                }

                if (resolvedParticipants && resolvedParticipants.length > 0) {
                    targetIds = resolvedParticipants;
                } else {
                    return res.status(400).json({ error: 'Gagal mengambil daftar anggota grup. Silakan coba kirim pesan manual ke grup tersebut terlebih dahulu agar sistem me-load datanya.' });
                }
            } catch (chatErr) {
                return res.status(400).json({ error: 'Gagal mengambil anggota grup: ' + chatErr.message });
            }
        } else {
            // Fallback backward compatibility
            const { targetGroupIds } = req.body;
            targetIds = targetGroupIds || [];
        }
        
        // Hapus duplikasi jika ada
        targetIds = [...new Set(targetIds)];
        
        if (targetIds.length === 0) {
            return res.status(400).json({ error: 'Tidak ditemukan target penerima siaran.' });
        }
        
        // 2. Load media if specified
        let messageMedia = null;
        if (media) {
            try {
                if (media.startsWith('http://') || media.startsWith('https://')) {
                    const { MessageMedia } = require('whatsapp-web.js');
                    messageMedia = await MessageMedia.fromUrl(media);
                } else {
                    const path = require('path');
                    const filePath = path.join('./media', media);
                    if (fs.existsSync(filePath)) {
                        const { MessageMedia } = require('whatsapp-web.js');
                        messageMedia = MessageMedia.fromFilePath(filePath);
                    } else {
                        return res.status(400).json({ error: `File media '${media}' tidak ditemukan di folder ./media` });
                    }
                }
            } catch (mediaErr) {
                return res.status(400).json({ error: 'Gagal memuat file media: ' + mediaErr.message });
            }
        }
        
        // 3. Jalankan broadcast di background (non-blocking) agar HTTP request tidak timeout
        const delayMs = (parseInt(delay, 10) || 5) * 1000;
        
        res.json({ success: true, count: targetIds.length, message: 'Broadcast dimulai di latar belakang.' });
        
        // Background Process
        (async () => {
            console.log(`[Broadcast] Memulai pengiriman ke ${targetIds.length} tujuan dengan jeda ${delay} detik...`);
            let countSuccess = 0;
            
            for (let i = 0; i < targetIds.length; i++) {
                const jid = targetIds[i];
                try {
                    // Cek koneksi di tengah jalan
                    if (getStatus() !== 'CONNECTED') {
                        console.log('[Broadcast Aborted] WhatsApp terputus saat proses broadcast sedang berjalan.');
                        break;
                    }
                    
                    if (messageMedia) {
                        // Kirim media dengan caption pesan
                        await client.sendMessage(jid, messageMedia, { caption: message });
                    } else {
                        await client.sendMessage(jid, message);
                    }
                    countSuccess++;
                    console.log(`[Broadcast Progress] Berhasil mengirim ke ${jid} (${i+1}/${targetIds.length})`);
                } catch (sendErr) {
                    console.error(`[Broadcast Error] Gagal mengirim ke ${jid}:`, sendErr.message);
                }
                
                // Jeda waktu antar pesan (delay anti-ban) kecuali untuk pesan terakhir
                if (i < targetIds.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
            console.log(`[Broadcast Completed] Berhasil mengirim ke ${countSuccess} dari ${targetIds.length} target.`);
        })();
        
    } catch(err) {
        console.error('Gagal memproses broadcast:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

app.post('/api/shop/send-message', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone || !message) return res.status(400).json({ error: 'Nomor dan pesan wajib diisi.' });
        
        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            return res.status(500).json({ error: 'WhatsApp client tidak terhubung.' });
        }
        
        const formattedJid = phone.includes('@') ? phone : `${phone.replace(/\D/g, '')}@c.us`;
        await client.sendMessage(formattedJid, message);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/host-admin/open-close-group', async (req, res) => {
    try {
        const { groupId, action } = req.body;
        if (!groupId || !action) return res.status(400).json({ error: 'groupId dan action wajib diisi.' });
        
        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            return res.status(500).json({ error: 'WhatsApp client tidak terhubung.' });
        }
        
        const chat = await client.getChatById(groupId);
        const shouldAdminsOnly = action !== 'buka';
        await chat.setMessagesAdminsOnly(shouldAdminsOnly);
        
        const msgText = shouldAdminsOnly 
            ? "🔔 *Pemberitahuan Manual:* Grup ini ditutup sementara oleh Admin. Hanya Admin yang dapat mengirim pesan."
            : "🔔 *Pemberitahuan Manual:* Jam operasional toko telah dimulai. Grup dibuka kembali untuk umum. Silakan ajukan pesanan Anda!";
        await client.sendMessage(groupId, msgText);
        
        res.json({ success: true });
    } catch(err) {
        console.error('Gagal mengontrol grup secara manual:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/shop/action', async (req, res) => {
    try {
        const { action } = req.body;
        if (!action) return res.status(400).json({ error: 'action wajib diisi.' });
        
        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            return res.status(500).json({ error: 'WhatsApp client tidak terhubung.' });
        }
        
        const { group_configs: gConfigs } = await getGroupConfigs();
        const activeGroupIds = Object.keys(gConfigs).filter(id => gConfigs[id].enabled);
        
        let count = 0;
        const shouldAdminsOnly = action !== 'buka';
        
        for (const gid of activeGroupIds) {
            try {
                const chat = await client.getChatById(gid);
                await chat.setMessagesAdminsOnly(shouldAdminsOnly);
                
                const msgText = shouldAdminsOnly 
                    ? "🔔 *Pemberitahuan Manual:* Toko ditutup sementara. Grup ini ditutup untuk umum. Hanya Admin yang dapat mengirim pesan."
                    : "🔔 *Pemberitahuan Manual:* Toko dibuka kembali. Grup dibuka untuk umum. Silakan ajukan pesanan Anda!";
                await client.sendMessage(gid, msgText);
                count++;
            } catch(e) {
                console.error(`Gagal kontrol grup ${gid} massal:`, e.message);
            }
        }
        
        res.json({ success: true, count });
    } catch(err) {
        console.error('Gagal menjalankan aksi massal toko:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/host-admin/toggle-group', async (req, res) => {
    try {
        const { groupId, enabled } = req.body;
        const { group_configs: gConfigs } = await getGroupConfigs();
        const gCfg = gConfigs[groupId];
        if (gCfg) {
            gCfg.enabled = enabled;
            await saveGroupConfig(groupId, gCfg);
            io.emit('group_config_updated', { groupId });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Grup tidak ditemukan' });
        }
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/host-admin/welcome-message', async (req, res) => {
    try {
        const { groupId, welcomeMessage } = req.body;
        const { group_configs: gConfigs } = await getGroupConfigs();
        const gCfg = gConfigs[groupId];
        if (gCfg) {
            gCfg.welcomeMessage = welcomeMessage;
            await saveGroupConfig(groupId, gCfg);
            io.emit('group_config_updated', { groupId });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Grup tidak ditemukan' });
        }
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/host-admin/goodbye-message', async (req, res) => {
    try {
        const { groupId, goodbyeMessage } = req.body;
        const { group_configs: gConfigs } = await getGroupConfigs();
        const gCfg = gConfigs[groupId];
        if (gCfg) {
            gCfg.goodbyeMessage = goodbyeMessage;
            await saveGroupConfig(groupId, gCfg);
            io.emit('group_config_updated', { groupId });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Grup tidak ditemukan' });
        }
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/host-admin/group-scheduler', async (req, res) => {
    try {
        const { groupId, schedulerEnabled, openTime, closeTime } = req.body;
        const { group_configs: gConfigs } = await getGroupConfigs();
        const gCfg = gConfigs[groupId];
        if (gCfg) {
            gCfg.autoCloseSchedule = {
                enabled: schedulerEnabled === true,
                openTime: openTime || '08:00',
                closeTime: closeTime || '17:00',
                activeDays: (gCfg.autoCloseSchedule && gCfg.autoCloseSchedule.activeDays) || [1,2,3,4,5]
            };
            await saveGroupConfig(groupId, gCfg);
            io.emit('group_config_updated', { groupId });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Grup tidak ditemukan' });
        }
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/host-admin/payment-settings', async (req, res) => {
    try {
        const { groupId, paymentType, paymentMedia, paymentText } = req.body;
        const { group_configs: gConfigs } = await getGroupConfigs();
        const gCfg = gConfigs[groupId];
        if (gCfg) {
            gCfg.paymentType = paymentType;
            gCfg.paymentMedia = paymentMedia;
            gCfg.paymentText = paymentText;
            await saveGroupConfig(groupId, gCfg);
            io.emit('group_config_updated', { groupId });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Grup tidak ditemukan' });
        }
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Manual Scheduler Actions
app.post('/api/scheduler/daily-report', async (req, res) => {
    try {
        const client = getClient();
        const status = getStatus();
        if (!client || status !== 'CONNECTED') {
            return res.status(400).json({ error: 'WhatsApp client belum tersambung (CONNECTED).' });
        }
        await sendDailyReport(client, io);
        res.json({ success: true, message: 'Laporan harian kas & agenda berhasil dikirim ke WhatsApp Bos!' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/scheduler/premium-expirations', async (req, res) => {
    try {
        const client = getClient();
        const status = getStatus();
        if (!client || status !== 'CONNECTED') {
            return res.status(400).json({ error: 'WhatsApp client belum tersambung (CONNECTED).' });
        }
        await checkPremiumExpirations(client, io);
        res.json({ success: true, message: 'Pemeriksaan & rekap jatuh tempo premium berhasil dikirim ke WhatsApp Bos!' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/scheduler/weekly-backup', async (req, res) => {
    try {
        const client = getClient();
        const status = getStatus();
        if (!client || status !== 'CONNECTED') {
            return res.status(400).json({ error: 'WhatsApp client belum tersambung (CONNECTED).' });
        }
        await runWeeklyBackup(client, io);
        res.json({ success: true, message: 'Backup berkas ZIP mingguan berhasil dibuat dan dikirim ke WhatsApp Bos!' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Local Notepad (Word Mini)
app.get('/api/notepad', async (req, res) => {
    try {
        const db = getDb();
        const row = await db.get("SELECT value FROM key_value_store WHERE key = 'local_notepad_content'");
        res.json({ content: row ? row.value : '' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notepad', async (req, res) => {
    try {
        const { content } = req.body;
        const db = getDb();
        await db.run("INSERT OR REPLACE INTO key_value_store (key, value) VALUES ('local_notepad_content', ?)", content || '');
        res.json({ success: true, message: 'Catatan berhasil disimpan!' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/presets', (req, res) => {
    try {
        const presetsPath = './presets.json';
        if (fs.existsSync(presetsPath)) {
            const data = fs.readFileSync(presetsPath, 'utf-8');
            res.json(JSON.parse(data));
        } else {
            res.json([]);
        }
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/history', async (req, res) => {
    try {
        const history = await getLogHistory();
        res.json(history);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/memory', (req, res) => {
    try {
        const memoryPath = path.join(KNOWLEDGE_DIR, '00_memori_otomatis.txt');
        const content = fs.existsSync(memoryPath) ? fs.readFileSync(memoryPath, 'utf-8') : '';
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/memory', (req, res) => {
    try {
        const { content } = req.body;
        const memoryPath = path.join(KNOWLEDGE_DIR, '00_memori_otomatis.txt');
        fs.writeFileSync(memoryPath, content || '', 'utf-8');
        io.emit('memory_updated', { content });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Backup Export ZIP
app.get('/api/export', async (req, res) => {
    try {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const zipFilename = `backup-jajan-digital-${timestamp}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err) => {
            console.error('[Export] Error saat membuat ZIP:', err.message);
            if (!res.headersSent) res.status(500).send('Gagal membuat file export.');
        });

        archive.pipe(res);

        if (fs.existsSync('./config.json')) {
            archive.file('./config.json', { name: 'config.json' });
        }

        const os = require('os');
        const dbTempPath = path.join(os.tmpdir(), `db-backup-${Date.now()}.sqlite`);
        if (fs.existsSync('./database.sqlite')) {
            try {
                fs.copyFileSync('./database.sqlite', dbTempPath);
                archive.file(dbTempPath, { name: 'database.sqlite' });
                archive.on('finish', () => { try { fs.unlinkSync(dbTempPath); } catch(_) {} });
            } catch(e) {
                console.warn('[Export] Tidak bisa copy database.sqlite:', e.message);
            }
        }

        if (fs.existsSync('./presets.json')) {
            archive.file('./presets.json', { name: 'presets.json' });
        }

        if (fs.existsSync('./knowledge')) {
            archive.directory('./knowledge', 'knowledge');
        }

        if (fs.existsSync('./media')) {
            archive.directory('./media', 'media');
        }

        const includeSession = req.query.session === '1';
        if (includeSession && fs.existsSync('./session')) {
            archive.directory('./session', 'session');
        }

        const readmeContent = `BACKUP JAJAN DIGITAL - ${now.toLocaleString('id-ID')}
========================================

File ini berisi backup data bot WhatsApp Jajan Digital Anda.

ISI BACKUP:
- config.json       : Konfigurasi bot (API keys, provider, dsb)
- database.sqlite   : Seluruh data (order, transaksi, memori, grup)
- presets.json      : Template pesan preset
- knowledge/        : File pengetahuan & memori AI toko
- media/            : File media (foto QRIS, dll)
${includeSession ? '- session/          : Sesi login WhatsApp (tidak perlu scan QR ulang)' : ''}

CARA RESTORE DI SERVER:
1. Clone repo: git clone https://github.com/bagasoffice02-haha/wa_gatewaygrup.git
2. cd wa_gatewaygrup && npm install
3. Ekstrak file backup ini dan copy semua isinya ke folder proyek
4. Jalankan: node index.js
${includeSession ? '5. Tidak perlu scan QR (sesi sudah dibawa)' : '5. Scan QR WhatsApp yang muncul'}

Dibuat otomatis oleh sistem bot Jajan Digital.`;

        archive.append(readmeContent, { name: 'README_RESTORE.txt' });

        await archive.finalize();
        console.log(`[Export] File backup berhasil dibuat: ${zipFilename}`);
    } catch (err) {
        console.error('[Export] Gagal export data:', err.message);
        if (!res.headersSent) res.status(500).send('Gagal export data.');
    }
});

// ZIP Import Backup Configuration
const uploadZip = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, require('os').tmpdir()),
        filename: (req, file, cb) => cb(null, `import-backup-${Date.now()}.zip`)
    }),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file .zip yang diizinkan'), false);
        }
    },
    limits: { fileSize: 500 * 1024 * 1024 }
});

app.post('/api/import', uploadZip.single('backup'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Tidak ada file yang diupload.' });
    }

    const zipPath = req.file.path;
    const importSession = req.body.import_session === '1';
    const results = { restored: [], skipped: [], errors: [] };

    const ALLOWED_ROOTS = ['config.json', 'database.sqlite', 'presets.json', 'knowledge', 'media'];
    if (importSession) ALLOWED_ROOTS.push('session');

    let needsDbReopen = false;
    
    try {
        console.log(`[Import] Memulai restore dari: ${req.file.originalname}`);

        const db = getDb();
        if (db) {
            try {
                await db.close();
                needsDbReopen = true;
                console.log('[Import] Koneksi database SQLite ditutup sementara demi keamanan restore.');
            } catch (err) {
                console.warn('[Import] Peringatan saat menutup database:', err.message);
            }
        }

        const zip = fs.createReadStream(zipPath).pipe(unzipper.Parse({ forceStream: true }));
        for await (const entry of zip) {
            const entryPathNormalized = entry.path.replace(/\\/g, '/');
            const entryType = entry.type;

            if (entryPathNormalized === 'README_RESTORE.txt' || entryPathNormalized.startsWith('__MACOSX')) {
                entry.autodrain();
                continue;
            }

            const rootName = entryPathNormalized.split('/')[0];
            if (!ALLOWED_ROOTS.includes(rootName)) {
                entry.autodrain();
                results.skipped.push(entry.path);
                continue;
            }

            const destPath = path.resolve('.', entryPathNormalized);
            const baseDir = path.resolve('.');
            if (!destPath.startsWith(baseDir)) {
                entry.autodrain();
                results.errors.push(`Path tidak aman dilewati: ${entry.path}`);
                continue;
            }

            if (entryType === 'Directory') {
                fs.mkdirSync(destPath, { recursive: true });
                entry.autodrain();
            } else {
                fs.mkdirSync(path.dirname(destPath), { recursive: true });

                await new Promise((resolve) => {
                    const writeStream = fs.createWriteStream(destPath);
                    entry.pipe(writeStream);
                    writeStream.on('finish', () => {
                        results.restored.push(entryPath);
                        resolve();
                    });
                    writeStream.on('error', (err) => {
                        results.errors.push(`Gagal tulis ${entryPath}: ${err.message}`);
                        resolve();
                    });
                });
            }
        }

        try { fs.unlinkSync(zipPath); } catch(_) {}

        if (results.restored.includes('config.json')) {
            try {
                const configPath = path.join(__dirname, 'config.json');
                const newConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                
                if (process.platform === 'linux') {
                    if (newConfig.puppeteer_executable_path && (newConfig.puppeteer_executable_path.includes('\\') || newConfig.puppeteer_executable_path.toLowerCase().includes('program files') || newConfig.puppeteer_executable_path.toLowerCase().includes('chrome.exe'))) {
                        newConfig.puppeteer_executable_path = '/usr/bin/google-chrome-stable';
                        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
                    }
                }
                
                Object.assign(config, newConfig);
                console.log('[Import] config.json berhasil dimuat ulang ke memori (OS check aman).');
            } catch(e) {
                console.warn('[Import] Gagal reload config.json:', e.message);
            }
        }

        console.log(`[Import] Selesai. Dipulihkan: ${results.restored.length} file, Dilewati: ${results.skipped.length}, Error: ${results.errors.length}`);

        res.json({
            success: true,
            message: `Berhasil memulihkan ${results.restored.length} file dari backup!`,
            details: results
        });

    } catch (err) {
        try { fs.unlinkSync(zipPath); } catch(_) {}
        console.error('[Import] Error saat import:', err.message);
        res.status(500).json({ success: false, message: `Gagal import: ${err.message}` });
    } finally {
        if (needsDbReopen) {
            try {
                // Tunggu sebentar agar OS selesai menulis file
                await new Promise(r => setTimeout(r, 500));
                await initDatabase();
                console.log('[Import] Koneksi database SQLite berhasil dibuka kembali.');
                
                // Verifikasi — pastikan group_configs terbaca
                const freshDb = getDb();
                if (freshDb) {
                    const gcRows = await freshDb.all('SELECT group_id FROM group_configs');
                    const kvRows = await freshDb.all('SELECT key FROM key_value_store');
                    console.log(`[Import] Verifikasi DB: ${gcRows.length} group config, ${kvRows.length} kv entries.`);
                }
            } catch (err) {
                console.error('[Import] Gagal membuka kembali database SQLite di finally:', err.message);
            }
        }
    }
});

// API: Restart WhatsApp Client
app.post('/api/whatsapp/restart', async (req, res) => {
    try {
        const { clearSession } = req.body;
        await restartClient(clearSession === true || clearSession === 'true' || clearSession === '1');
        res.json({ success: true, message: 'Menyalakan ulang WhatsApp client...' });
    } catch (err) {
        console.error('Gagal restart WA:', err.message);
        res.status(500).json({ error: 'Gagal merestart client WhatsApp: ' + err.message });
    }
});

io.on('connection', (socket) => {
    console.log('Dashboard client terhubung ke WebSocket.');
    socket.emit('whatsapp_status', { status: getStatus() });
    if (getQrCode() && getStatus() !== 'CONNECTED') {
        socket.emit('qr', getQrCode());
    }
});

// Global Protection
process.on('uncaughtException', (err) => {
    console.error('Terjadi uncaughtException global:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection dideteksi pada:', promise, 'alasan:', reason);
    
    const errMsg = reason ? reason.toString() : '';
    if (errMsg.includes('Execution context was destroyed') || 
        errMsg.includes('Navigating frame was detached') || 
        errMsg.includes('Session closed') ||
        errMsg.includes('Target closed') ||
        errMsg.includes('evaluate')) {
        
        console.log('[WA Recovery] Terdeteksi error Puppeteer/WA. Mencoba pemulihan otomatis...');
        const { restartClient, getStatus } = require('./src/services/whatsapp/client');
        if (getStatus() !== 'CONNECTED') {
            setTimeout(() => {
                restartClient(false).catch(err => console.error('[WA Recovery] Gagal restart:', err.message));
            }, 5000);
        }
    }
});

// Bootstrapping App
server.listen(PORT, async () => {
    console.log(`\n======================================================`);
    console.log(`Web Dashboard CS Aktif di: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
    
    await initDatabase();
    setSocketIo(io);
    await cleanupHeadlessChrome();
    createNewClient(io);

    // Start Schedulers Once (singleton)
    const { 
        startDailyReportScheduler, 
        startReminderScheduler, 
        startGroupScheduleScheduler 
    } = require('./src/scheduler/reminderJob');
    
    startDailyReportScheduler(getClient, io, getStatus);
    startReminderScheduler(getClient, io, getStatus);
    startGroupScheduleScheduler(getClient, getStatus);
});
