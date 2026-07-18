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
    try {
        const { groupId } = req.params;
        const client = getClient();
        if (!client || getStatus() !== 'CONNECTED') {
            return res.status(400).json({ error: 'WhatsApp client tidak terhubung.' });
        }

        console.log(`[API Members] Mengambil anggota grup untuk ${groupId}...`);
        let participants = [];

        // Evaluasi langsung di WA Web via Puppeteer
        try {
            participants = await client.pupPage.evaluate(async (chatId) => {
                try {
                    const chat = window.WWebJS.getChat(chatId);
                    if (!chat || !chat.groupMetadata) return [];
                    
                    try {
                        const WAWebGroupQueryJob = window.require('WAWebGroupQueryJob');
                        if (WAWebGroupQueryJob && WAWebGroupQueryJob.queryAndUpdateGroupMetadataById) {
                            await WAWebGroupQueryJob.queryAndUpdateGroupMetadataById({ id: chatId });
                        }
                    } catch (_) {}

                    const metadata = chat.groupMetadata;
                    if (metadata && metadata.participants) {
                        return metadata.participants.map(p => ({
                            id: p.id._serialized,
                            user: p.id.user,
                            isAdmin: p.isAdmin || false,
                            isSuperAdmin: p.isSuperAdmin || false
                        }));
                    }
                } catch (e) {
                    console.error('Error in WA page evaluate:', e.message);
                }
                return [];
            }, groupId);
        } catch (evalErr) {
            console.warn('[API Members] Evaluasi halaman gagal, fallback ke fetchChat:', evalErr.message);
        }

        // Fallback ke standard fetch jika evaluasi kosong
        if (!participants || participants.length === 0) {
            try {
                const chat = await client.getChatById(groupId);
                if (chat && chat.isGroup && chat.participants) {
                    participants = chat.participants.map(p => ({
                        id: p.id._serialized,
                        user: p.id.user,
                        isAdmin: p.isAdmin || false,
                        isSuperAdmin: p.isSuperAdmin || false
                    }));
                }
            } catch (getChatErr) {
                console.error('[API Members] Fallback getChatById juga gagal:', getChatErr.message);
            }
        }

        if (!participants || participants.length === 0) {
            return res.status(404).json({ error: 'Anggota grup tidak ditemukan atau gagal diambil. Pastikan bot adalah anggota grup tersebut.' });
        }

        const resolved = participants.map(p => {
            return {
                id: p.id,
                phone: p.user,
                isAdmin: p.isAdmin,
                isSuperAdmin: p.isSuperAdmin
            };
        });

        res.json({ success: true, count: resolved.length, members: resolved });
    } catch (err) {
        console.error('Gagal mengambil anggota grup:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
