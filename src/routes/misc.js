// src/routes/misc.js — API Routes untuk Notepad, Memory, History, Backup/Restore, Scheduler, WA Restart
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const { getDb, initDatabase } = require('../db/sqlite');
const { getLogHistory } = require('../db/models');
const { getClient, getStatus, restartClient } = require('../services/whatsapp/client');
const { sendDailyReport, checkPremiumExpirations, runWeeklyBackup } = require('../scheduler/reminderJob');
const { config } = require('../config/config');

const KNOWLEDGE_DIR = './knowledge';

router.get('/test-buka', async (req, res) => {
    try {
        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            return res.json({ error: 'WA client not connected' });
        }
        const { group_configs: gConfigs } = await require('../db/models').getGroupConfigs();
        const activeGroupIds = Object.keys(gConfigs);
        const groupId = req.query.gid || activeGroupIds[0];
        if (!groupId) return res.json({ error: 'No group configured' });
        
        console.log('[Test Buka] Gid:', groupId);
        const chat = await client.getChatById(groupId);
        
        const result = await client.pupPage.evaluate(async (chatId) => {
            try {
                const chatWid = window.Store.WidFactory.createWid(chatId);
                const chat = await window.Store.Chat.find(chatWid);
                if (!chat) return { error: 'Chat not found in Store' };
                
                // Cek ketersediaan WAWebSetPropertyGroupAction
                const hasSetGroupProperty = !!(window.require && window.require('WAWebSetPropertyGroupAction'));
                
                // Eksekusi setGroupProperty
                await window.require('WAWebSetPropertyGroupAction').setGroupProperty(chat, 'announcement', 0);
                return { success: true, hasSetGroupProperty };
            } catch (e) {
                return { error: e.message || String(e), stack: e.stack };
            }
        }, groupId);
        
        return res.json({ result });
    } catch (err) {
        return res.json({ error: err.message, stack: err.stack });
    }
});

// ─── NOTEPAD ──────────────────────────────────────────────
router.get('/notepad', async (req, res) => {
    try {
        const db = getDb();
        const row = await db.get("SELECT value FROM key_value_store WHERE key = 'local_notepad_content'");
        res.json({ content: row ? row.value : '' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/notepad', async (req, res) => {
    try {
        const { content } = req.body;
        const db = getDb();
        await db.run("INSERT OR REPLACE INTO key_value_store (key, value) VALUES ('local_notepad_content', ?)", content || '');
        res.json({ success: true, message: 'Catatan berhasil disimpan!' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PRESETS ──────────────────────────────────────────────
router.get('/presets', (req, res) => {
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

// ─── RIWAYAT LOG ──────────────────────────────────────────
router.get('/history', async (req, res) => {
    try {
        const history = await getLogHistory();
        res.json(history);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── MEMORI AI ────────────────────────────────────────────
router.get('/memory', (req, res) => {
    try {
        const memoryPath = path.join(KNOWLEDGE_DIR, '00_memori_otomatis.txt');
        const content = fs.existsSync(memoryPath) ? fs.readFileSync(memoryPath, 'utf-8') : '';
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/memory', (req, res) => {
    try {
        const { content } = req.body;
        const memoryPath = path.join(KNOWLEDGE_DIR, '00_memori_otomatis.txt');
        fs.writeFileSync(memoryPath, content || '', 'utf-8');
        req.app.get('io').emit('memory_updated', { content });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── EXPORT BACKUP ZIP ────────────────────────────────────
router.get('/export', async (req, res) => {
    try {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const zipFilename = `backup-jajan-digital-${timestamp}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err) => {
            console.error('[Export] Error:', err.message);
            if (!res.headersSent) res.status(500).send('Gagal membuat file export.');
        });
        archive.pipe(res);
        if (fs.existsSync('./config.json')) archive.file('./config.json', { name: 'config.json' });
        const os = require('os');
        const dbTempPath = path.join(os.tmpdir(), `db-backup-${Date.now()}.sqlite`);
        if (fs.existsSync('./database.sqlite')) {
            try {
                fs.copyFileSync('./database.sqlite', dbTempPath);
                archive.file(dbTempPath, { name: 'database.sqlite' });
                archive.on('finish', () => { try { fs.unlinkSync(dbTempPath); } catch(_) {} });
            } catch(e) { console.warn('[Export] Tidak bisa copy database.sqlite:', e.message); }
        }
        if (fs.existsSync('./presets.json')) archive.file('./presets.json', { name: 'presets.json' });
        if (fs.existsSync('./knowledge')) archive.directory('./knowledge', 'knowledge');
        if (fs.existsSync('./media')) archive.directory('./media', 'media');
        const includeSession = req.query.session === '1';
        if (includeSession && fs.existsSync('./session')) archive.directory('./session', 'session');
        const readmeContent = `BACKUP JAJAN DIGITAL - ${now.toLocaleString('id-ID')}\n========================================\n\nFile ini berisi backup data bot WhatsApp Jajan Digital Anda.\n\nISI BACKUP:\n- config.json       : Konfigurasi bot (API keys, provider, dsb)\n- database.sqlite   : Seluruh data (order, transaksi, memori, grup)\n- presets.json      : Template pesan preset\n- knowledge/        : File pengetahuan & memori AI toko\n- media/            : File media (foto QRIS, dll)\n${includeSession ? '- session/          : Sesi login WhatsApp (tidak perlu scan QR ulang)' : ''}\n\nCARA RESTORE DI SERVER:\n1. Clone repo: git clone https://github.com/bagasoffice02-haha/wa_gatewaygrup.git\n2. cd wa_gatewaygrup && npm install\n3. Ekstrak file backup ini dan copy semua isinya ke folder proyek\n4. Jalankan: node index.js\n${includeSession ? '5. Tidak perlu scan QR (sesi sudah dibawa)' : '5. Scan QR WhatsApp yang muncul'}\n\nDibuat otomatis oleh sistem bot Jajan Digital.`;
        archive.append(readmeContent, { name: 'README_RESTORE.txt' });
        await archive.finalize();
        console.log(`[Export] Berhasil: ${zipFilename}`);
    } catch (err) {
        console.error('[Export] Gagal:', err.message);
        if (!res.headersSent) res.status(500).send('Gagal export data.');
    }
});

// ─── IMPORT BACKUP ZIP ────────────────────────────────────
router.post('/import', (req, res, next) => {
    // uploadZip dipasang dari index.js via app.get
    req.app.get('uploadZip').single('backup')(req, res, async (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada file yang diupload.' });
        
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
                try { await db.close(); needsDbReopen = true; console.log('[Import] DB ditutup sementara.'); }
                catch (e) { console.warn('[Import] Peringatan saat menutup DB:', e.message); }
            }
            const zip = fs.createReadStream(zipPath).pipe(unzipper.Parse({ forceStream: true }));
            for await (const entry of zip) {
                const entryPathNormalized = entry.path.replace(/\\/g, '/');
                if (entryPathNormalized === 'README_RESTORE.txt' || entryPathNormalized.startsWith('__MACOSX')) {
                    entry.autodrain(); continue;
                }
                const rootName = entryPathNormalized.split('/')[0];
                if (!ALLOWED_ROOTS.includes(rootName)) { entry.autodrain(); results.skipped.push(entry.path); continue; }
                const destPath = path.resolve('.', entryPathNormalized);
                const baseDir = path.resolve('.');
                if (!destPath.startsWith(baseDir)) { entry.autodrain(); results.errors.push(`Path tidak aman: ${entry.path}`); continue; }
                if (entry.type === 'Directory') {
                    fs.mkdirSync(destPath, { recursive: true }); entry.autodrain();
                } else {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    await new Promise((resolve) => {
                        const writeStream = fs.createWriteStream(destPath);
                        entry.pipe(writeStream);
                        writeStream.on('finish', () => { results.restored.push(entryPathNormalized); resolve(); });
                        writeStream.on('error', (e) => { results.errors.push(`Gagal tulis ${entryPathNormalized}: ${e.message}`); resolve(); });
                    });
                }
            }
            try { fs.unlinkSync(zipPath); } catch(_) {}
            if (results.restored.includes('config.json')) {
                try {
                    const configPath = path.join(process.cwd(), 'config.json');
                    const newConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    if (process.platform === 'linux') {
                        if (newConfig.puppeteer_executable_path && (newConfig.puppeteer_executable_path.includes('\\') || newConfig.puppeteer_executable_path.toLowerCase().includes('program files'))) {
                            newConfig.puppeteer_executable_path = '/usr/bin/google-chrome-stable';
                            fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
                        }
                    }
                    Object.assign(config, newConfig);
                    console.log('[Import] config.json berhasil dimuat ulang.');
                } catch(e) { console.warn('[Import] Gagal reload config.json:', e.message); }
            }
            console.log(`[Import] Selesai. Dipulihkan: ${results.restored.length}, Dilewati: ${results.skipped.length}, Error: ${results.errors.length}`);
            res.json({ success: true, message: `Berhasil memulihkan ${results.restored.length} file!`, details: results });
        } catch (err) {
            try { fs.unlinkSync(zipPath); } catch(_) {}
            console.error('[Import] Error:', err.message);
            res.status(500).json({ success: false, message: `Gagal import: ${err.message}` });
        } finally {
            if (needsDbReopen) {
                try {
                    await new Promise(r => setTimeout(r, 500));
                    await initDatabase();
                    console.log('[Import] DB SQLite dibuka kembali.');
                    const freshDb = getDb();
                    if (freshDb) {
                        const gcRows = await freshDb.all('SELECT group_id FROM group_configs');
                        const kvRows = await freshDb.all('SELECT key FROM key_value_store');
                        console.log(`[Import] Verifikasi DB: ${gcRows.length} group config, ${kvRows.length} kv entries.`);
                    }
                } catch (e) { console.error('[Import] Gagal membuka kembali DB:', e.message); }
            }
        }
    });
});

// ─── RESTART WHATSAPP ─────────────────────────────────────
router.post('/whatsapp/restart', async (req, res) => {
    try {
        const { clearSession } = req.body;
        await restartClient(clearSession === true || clearSession === 'true' || clearSession === '1');
        res.json({ success: true, message: 'Menyalakan ulang WhatsApp client...' });
    } catch (err) {
        console.error('Gagal restart WA:', err.message);
        res.status(500).json({ error: 'Gagal merestart client WhatsApp: ' + err.message });
    }
});

// ─── SCHEDULER MANUAL ─────────────────────────────────────
router.post('/scheduler/daily-report', async (req, res) => {
    try {
        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            return res.status(400).json({ error: 'WhatsApp client belum tersambung (CONNECTED).' });
        }
        await sendDailyReport(client, req.app.get('io'));
        res.json({ success: true, message: 'Laporan harian berhasil dikirim!' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/scheduler/premium-expirations', async (req, res) => {
    try {
        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            return res.status(400).json({ error: 'WhatsApp client belum tersambung (CONNECTED).' });
        }
        await checkPremiumExpirations(client, req.app.get('io'));
        res.json({ success: true, message: 'Pemeriksaan jatuh tempo premium berhasil dikirim!' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/scheduler/weekly-backup', async (req, res) => {
    try {
        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            return res.status(400).json({ error: 'WhatsApp client belum tersambung (CONNECTED).' });
        }
        await runWeeklyBackup(client, req.app.get('io'));
        res.json({ success: true, message: 'Backup ZIP mingguan berhasil dibuat dan dikirim!' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
