// src/routes/groups.js — API Routes untuk Manajemen Grup WhatsApp
const express = require('express');
const router = express.Router();
const { getGroupConfigs, saveGroupConfig, deleteGroupConfig } = require('../db/models');
const { getClient, getStatus } = require('../services/whatsapp/client');

// ─── LIST SEMUA GRUP ──────────────────────────────────────
router.get('/groups', async (req, res) => {
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
                results.push({ id, name: cleanName, isConfigured: true, enabled: cfg.enabled, config: cfg });
            }
        });
        
        res.json(results);
    } catch (err) {
        console.error('Gagal mengambil list grup:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── KONFIGURASI GRUP SPESIFIK ───────────────────────────
router.get('/group-config/:groupId', async (req, res) => {
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

router.post('/group-config/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const cfg = req.body;
        await saveGroupConfig(groupId, cfg);
        req.app.get('io').emit('group_config_updated', { groupId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/group-config/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        await deleteGroupConfig(groupId);
        req.app.get('io').emit('group_config_updated', { groupId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint untuk mengekstrak daftar nomor anggota dari grup tertentu
router.get('/groups/:groupId/members', async (req, res) => {
    return res.status(403).json({
        error: '🚫 Fitur pengambilan/ekstraksi anggota grup dinonaktifkan secara permanen untuk melindungi akun WhatsApp dari pemblokiran (ban) Meta.'
    });
});

module.exports = router;
