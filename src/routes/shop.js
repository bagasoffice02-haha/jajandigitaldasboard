// src/routes/shop.js — API Routes untuk Data Toko, Admin, Pelanggan, Broadcast
const express = require('express');
const router = express.Router();
const fs = require('fs');
const { getDb } = require('../db/sqlite');
const { getGroupConfigs, getShopData, addAdmin, updateAdmin, removeAdmin, addCustomer, setCustomerMuteAi } = require('../db/models');
const { getClient, getStatus, setMessagesAdminsOnlyHelper } = require('../services/whatsapp/client');

let cancelBroadcastFlag = false;

// ─── PINNED CHATS (host admin) ────────────────────────────
router.get('/pinned-chats', async (req, res) => {
    try {
        const db = getDb();
        const admins = await db.all('SELECT phone, name FROM shop_admins ORDER BY id ASC') || [];
        const result = admins.map(a => {
            const clean = (a.phone || '').replace(/\D/g, '');
            return { id: `${clean}@c.us`, name: a.name || clean, phone: clean, isHostAdmin: true };
        });
        res.json(result);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── ADMINS ───────────────────────────────────────────────
router.get('/admins', async (req, res) => {
    try {
        const db = getDb();
        const admins = await db.all('SELECT phone, name FROM shop_admins ORDER BY id ASC') || [];
        res.json(admins);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin', async (req, res) => {
    try {
        const { phone, name } = req.body;
        if (!phone) return res.status(400).json({ error: 'Nomor WhatsApp wajib diisi' });
        const cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone) return res.status(400).json({ error: 'Nomor WhatsApp tidak valid' });
        await addAdmin(cleanPhone, name || 'Host Admin');
        res.json({ success: true, message: 'Host Admin berhasil ditambahkan' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/admin', async (req, res) => {
    try {
        const { oldPhone, phone, name } = req.body;
        if (!oldPhone || !phone) return res.status(400).json({ error: 'Nomor WhatsApp lama dan baru wajib diisi' });
        const cleanOld = oldPhone.replace(/\D/g, '');
        const cleanNew = phone.replace(/\D/g, '');
        if (!cleanNew) return res.status(400).json({ error: 'Nomor WhatsApp baru tidak valid' });
        await updateAdmin(cleanOld, cleanNew, name || 'Host Admin');
        res.json({ success: true, message: 'Host Admin berhasil diperbarui' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/admins', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Nomor WhatsApp wajib diisi' });
        const cleanPhone = phone.replace(/\D/g, '');
        await removeAdmin(cleanPhone);
        res.json({ success: true, message: 'Host Admin berhasil dihapus' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admins', async (req, res) => {
    try {
        const { admins } = req.body;
        if (!Array.isArray(admins)) return res.status(400).json({ error: 'Format salah' });
        const db = getDb();
        if (!db) return res.status(500).json({ error: 'Database belum siap' });
        await db.run('DELETE FROM shop_admins');
        const added = new Set();
        for (const phone of admins) {
            const cleanPhone = typeof phone === 'string' ? phone.split('@')[0].replace(/\D/g, '') : (phone.phone || '').replace(/\D/g, '');
            const adminName = typeof phone === 'object' && phone.name ? phone.name : 'Host Admin';
            if (cleanPhone && !added.has(cleanPhone)) {
                await addAdmin(cleanPhone, adminName);
                added.add(cleanPhone);
            }
        }
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── CUSTOMERS ────────────────────────────────────────────
router.get('/customers', async (req, res) => {
    try {
        const shopData = await getShopData();
        res.json(shopData.customers || []);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/customers', async (req, res) => {
    try {
        const { customers } = req.body;
        if (!Array.isArray(customers)) return res.status(400).json({ error: 'Format salah' });
        for (const cust of customers) {
            await addCustomer(cust.phone, cust.name, cust.notes, cust.labels, cust.orderCount);
            if (cust.mute_ai !== undefined) {
                await setCustomerMuteAi(cust.phone, cust.mute_ai);
            }
        }
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── BROADCAST ─── DINONAKTIFKAN PERMANEN ─────────────────
// Fitur broadcast dimatikan untuk mencegah risiko ban WhatsApp.
// Pengiriman massal ke banyak nomor melanggar ToS Meta dan menyebabkan akun diblokir.
router.post('/broadcast', (req, res) => {
    return res.status(403).json({ 
        error: '🚫 Fitur broadcast telah dinonaktifkan secara permanen untuk melindungi akun WhatsApp dari risiko pemblokiran oleh Meta.' 
    });
});
router.post('/broadcast/stop', (req, res) => {
    return res.json({ success: true, message: 'Broadcast tidak aktif.' });
});

// ─── KIRIM PESAN LANGSUNG ─────────────────────────────────
router.post('/send-message', async (req, res) => {
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

// ─── AKSI MASSAL TOKO (buka/tutup semua grup) ─────────────
router.post('/action', async (req, res) => {
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
        for (let gi = 0; gi < activeGroupIds.length; gi++) {
            const gid = activeGroupIds[gi];
            try {
                await setMessagesAdminsOnlyHelper(client, gid, shouldAdminsOnly);
                const msgText = shouldAdminsOnly
                    ? "🔔 *Pemberitahuan Manual:* Toko ditutup sementara. Grup ini ditutup untuk umum. Hanya Admin yang dapat mengirim pesan."
                    : "🔔 *Pemberitahuan Manual:* Toko dibuka kembali. Grup dibuka untuk umum. Silakan ajukan pesanan Anda!";
                await client.sendMessage(gid, msgText);
                count++;
            } catch(e) {
                console.error(`Gagal kontrol grup ${gid} massal:`, e.message);
            }
            // Delay 5 detik antar grup agar tidak terdeteksi spam oleh WhatsApp
            if (gi < activeGroupIds.length - 1) await new Promise(r => setTimeout(r, 5000));
        }
        res.json({ success: true, count });
    } catch(err) {
        console.error('Gagal menjalankan aksi massal toko:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
