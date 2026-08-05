// src/routes/referral.js
'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/sqlite');

// GET: Ambil daftar seluruh Kode Referral & Poin Affiliate
router.get('/referrals/codes', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.json({ success: true, codes: [] });

        const codes = await db.all("SELECT * FROM referral_codes ORDER BY total_invites DESC, points DESC");
        res.json({ success: true, codes: codes || [] });
    } catch (err) {
        console.error('[API Referral Codes Error]:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET: Ambil daftar Riwayat Klaim Kode Referral
router.get('/referrals/logs', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.json({ success: true, logs: [] });

        const logs = await db.all("SELECT * FROM referral_logs ORDER BY claimed_at DESC LIMIT 100");
        res.json({ success: true, logs: logs || [] });
    } catch (err) {
        console.error('[API Referral Logs Error]:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST: Admin menambah / mengurangi Poin Referral manual dari Dasbor Web
router.post('/referrals/update-points', async (req, res) => {
    try {
        const { phone, points, total_invites } = req.body;
        if (!phone) return res.status(400).json({ success: false, error: 'Nomor HP wajib diisi.' });

        const db = getDb();
        await db.run(
            "UPDATE referral_codes SET points = ?, total_invites = ? WHERE phone = ?",
            parseInt(points, 10) || 0, parseInt(total_invites, 10) || 0, phone
        );

        res.json({ success: true, message: 'Poin referral berhasil diperbarui.' });
    } catch (err) {
        console.error('[API Referral Update Error]:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE: Hapus kode referral dari Dasbor Web
router.delete('/referrals/code/:phone', async (req, res) => {
    try {
        const phone = req.params.phone;
        const db = getDb();
        await db.run("DELETE FROM referral_codes WHERE phone = ?", phone);
        res.json({ success: true, message: 'Kode referral berhasil dihapus.' });
    } catch (err) {
        console.error('[API Referral Delete Error]:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
