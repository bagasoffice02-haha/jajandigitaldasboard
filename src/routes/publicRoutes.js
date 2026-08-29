'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');

module.exports = function(dependencies) {
    const router = express.Router();
    const { 
        loginAttempts, 
        activeSessions, 
        saveSessions, 
        config, 
        ADMIN_USERNAME, 
        ADMIN_PASSWORD, 
        resetOtpBucket, 
        otpRateBucket, 
        getDb, 
        getClient, 
        getStatus,
        uploadRateBucket,
        paymentUpload,
        getPublicUrlInfo
    } = dependencies;

    // Helper functions for reading HTML views
    function readView(viewName) {
        return fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'views', viewName), 'utf-8');
    }

    router.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', '..', 'public', 'login.html')));

    router.get(['/u', '/upload-bukti'], async (req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        let html = readView('upload-bukti.html');
        html = html.replace('class="card-3d "', 'class="card-3d is-flipped"');
        
        let txCount = 176;
        try {
            const db = await getDb();
            if (db) {
                const rowOrders = await db.get("SELECT COUNT(*) as total FROM orders WHERE UPPER(status) IN ('SELESAI', 'DONE', 'COMPLETED', 'PAID')");
                const rowInvoices = await db.get("SELECT COUNT(*) as total FROM invoices WHERE UPPER(status) IN ('SELESAI', 'DONE', 'COMPLETED', 'PAID')");
                const totalDone = ((rowOrders && rowOrders.total) || 0) + ((rowInvoices && rowInvoices.total) || 0);
                txCount += totalDone;
            }
        } catch(_) {}
        const formattedTxCount = txCount.toLocaleString('id-ID');
        html = html.replaceAll('${formattedTxCount}', formattedTxCount);
        
        const { baseUrl } = getPublicUrlInfo(req);
        html = html.replaceAll('${pageUrl}', `${baseUrl}/u`);
        html = html.replaceAll('${fullImageUrl}', `${baseUrl}/favicon.ico`);
        html = html.replaceAll('${mimeType}', 'image/x-icon');
        
        res.send(html);
    });

    router.get(['/q', '/qris', '/qris/:filename', '/v/qris'], async (req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        let filename = req.params ? (req.params.filename || 'Qris.jpeg') : 'Qris.jpeg';
        let rawImageUrl = '';

        const mediaPath = path.join(__dirname, '..', '..', 'media', filename);
        if (fs.existsSync(mediaPath)) {
            rawImageUrl = `/media/${filename}`;
        } else {
            const fallbackPath = path.join(__dirname, '..', '..', 'media', 'Qris.jpeg');
            if (fs.existsSync(fallbackPath)) {
                rawImageUrl = `/media/Qris.jpeg`;
            } else {
                try {
                    const files = fs.readdirSync(path.join(__dirname, '..', '..', 'media'));
                    const imgFile = files.find(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
                    if (imgFile) rawImageUrl = `/media/${imgFile}`;
                } catch(_) {}
            }
        }

        let txCount = 176;
        try {
            const db = await getDb();
            if (db) {
                const rowOrders = await db.get("SELECT COUNT(*) as total FROM orders WHERE UPPER(status) IN ('SELESAI', 'DONE', 'COMPLETED', 'PAID')");
                const rowInvoices = await db.get("SELECT COUNT(*) as total FROM invoices WHERE UPPER(status) IN ('SELESAI', 'DONE', 'COMPLETED', 'PAID')");
                const totalDone = ((rowOrders && rowOrders.total) || 0) + ((rowInvoices && rowInvoices.total) || 0);
                txCount += totalDone;
            }
        } catch(_) {}
        const formattedTxCount = txCount.toLocaleString('id-ID');

        const { baseUrl } = getPublicUrlInfo(req);
        const fullImageUrl = rawImageUrl ? `${baseUrl}${rawImageUrl}` : `${baseUrl}/favicon.ico`;
        const pageUrl = `${baseUrl}/q`;
        let mimeType = 'image/jpeg';
        if(filename.endsWith('.png')) mimeType = 'image/png';
        if(filename.endsWith('.webp')) mimeType = 'image/webp';

        let html = readView('qris.html');
        html = html.replace('class="card-3d is-flipped"', 'class="card-3d "');
        html = html.replaceAll('${formattedTxCount}', formattedTxCount);
        html = html.replaceAll('${rawImageUrl}', rawImageUrl);
        html = html.replaceAll('${fullImageUrl}', fullImageUrl);
        html = html.replaceAll('${mimeType}', mimeType);
        html = html.replaceAll('${pageUrl}', pageUrl);
        html = html.replace('${startFlipped ? \'is-flipped\' : \'\'}', '');
        
        res.send(html);
    });

    router.get(['/referral', '/leaderboard', '/affiliate'], async (req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        const { baseUrl } = getPublicUrlInfo(req);
        let html = readView('referral.html');
        html = html.replaceAll('${pageUrl}', `${baseUrl}/referral`);
        res.send(html);
    });

    router.post('/api/login', (req, res) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const attempts = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };

        if (attempts.lockUntil > now) {
            const remainingSec = Math.ceil((attempts.lockUntil - now) / 1000);
            return res.status(429).json({ success: false, error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${remainingSec} detik.` });
        }

        const { username, password, rememberMe } = req.body;
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
        return res.status(401).json({ success: false, error: 'Username atau password salah!' });
    });

    router.post('/api/logout', (req, res) => {
        const token = req.cookies.session_token;
        if (token) {
            activeSessions.delete(token);
            saveSessions();
            res.clearCookie('session_token');
        }
        res.json({ success: true });
    });

    router.post('/api/upload-bukti', (req, res, next) => {
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

    router.post('/api/request-reset-otp', async (req, res) => {
        try {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
            const now = Date.now();
            const lastRequest = otpRateBucket.get(ip) || 0;

            if (now - lastRequest < 60 * 1000) {
                const remaining = Math.ceil((60 * 1000 - (now - lastRequest)) / 1000);
                return res.status(429).json({ success: false, error: `Harap tunggu ${remaining} detik sebelum meminta OTP lagi.` });
            }

            const { newPhone } = req.body || {};

            let bossNumSetting = config.boss_number || config.owner_number || '';
            try {
                const db = await getDb();
                const row = await db.get("SELECT value FROM settings WHERE key = 'boss_number'");
                if (row && row.value) bossNumSetting = row.value;
            } catch(_) {}

            let cleanBossNum = bossNumSetting.replace(/[^0-9]/g, '');

            if (!cleanBossNum) {
                if (!newPhone || newPhone.trim().length < 8) {
                    return res.status(400).json({ success: false, error: 'Belum ada nomor terdaftar. Harap masukkan nomor WhatsApp Super Admin Anda.' });
                }
                cleanBossNum = newPhone.replace(/[^0-9]/g, '');
                if (cleanBossNum.startsWith('0')) cleanBossNum = '62' + cleanBossNum.slice(1);

                const { updateConfig } = require('../../src/config/config');
                updateConfig({ boss_number: cleanBossNum });
                try {
                    const db = await getDb();
                    await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('boss_number', ?)", [cleanBossNum]);
                } catch(_) {}
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
            res.json({ success: true, message: `Kode OTP telah dikirimkan ke WhatsApp Super Admin (${maskedPhone}).` });
        } catch (err) {
            res.status(500).json({ success: false, error: 'Gagal mengirim OTP via WhatsApp: ' + err.message });
        }
    });

    router.post('/api/verify-reset-otp', async (req, res) => {
        try {
            const { otp, newPassword } = req.body;
            if (!otp || !newPassword) return res.status(400).json({ success: false, error: 'OTP dan Password Baru wajib diisi.' });
            if (newPassword.length < 6) return res.status(400).json({ success: false, error: 'Password baru minimal 6 karakter.' });

            let bossNumSetting = config.boss_number || config.owner_number || '';
            try {
                const db = await getDb();
                const row = await db.get("SELECT value FROM settings WHERE key = 'boss_number'");
                if (row && row.value) bossNumSetting = row.value;
            } catch(_) {}
            const cleanBossNum = bossNumSetting.replace(/[^0-9]/g, '');

            const record = resetOtpBucket.get(cleanBossNum);
            if (!record || record.expiresAt < Date.now()) {
                return res.status(400).json({ success: false, error: 'Kode OTP kadaluarsa atau belum diminta.' });
            }
            if (record.otp !== otp.trim()) {
                return res.status(400).json({ success: false, error: 'Kode OTP yang dimasukkan salah!' });
            }

            resetOtpBucket.delete(cleanBossNum);
            const { updateConfig } = require('../../src/config/config');
            updateConfig({ admin_password: newPassword });

            const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
            activeSessions.add(token);
            saveSessions();
            res.cookie('session_token', token, { httpOnly: true, secure: false, maxAge: 24 * 60 * 60 * 1000 });
            res.json({ success: true, message: 'Password berhasil direset!' });
        } catch (err) {
            res.status(500).json({ success: false, error: 'Gagal verifikasi OTP.' });
        }
    });

    return router;
};
