// src/handlers/adminMenuHandler.js
// Admin menu state machine (perintah menu interaktif via WA untuk Host Admin)
'use strict';
const fs = require('fs');
const path = require('path');
const { getGroupConfigs, saveGroupConfig } = require('../db/models');
const { findNodeById, getStatusEmoji } = require('./helpers');

// Koleksi item konten dari semua grup untuk manajemen stok
async function getAllContentNodes() {
    const list = [];
    const { group_configs: gConfigs } = await getGroupConfigs();
    const groupIds = Object.keys(gConfigs);
    for (const gId of groupIds) {
        const cfg = gConfigs[gId];
        if (!cfg) continue;
        const collect = (node, groupName) => {
            if (!node) return;
            if (node.type === 'content') {
                list.push({
                    groupId: gId,
                    groupName,
                    nodeId: node.id,
                    name: node.name,
                    status: node.status || '',
                    text: node.text || '',
                    isPromo: node.isPromo || false
                });
            }
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach(child => collect(child, groupName));
            }
        };
        if (cfg.menuTree) collect(cfg.menuTree, cfg.groupName || gId);
    }
    return list;
}

async function sendGroupDetailMenu(msg, groupId, senderId) {
    const { group_configs: gConfigs } = await getGroupConfigs();
    const gCfg = gConfigs[groupId];
    if (!gCfg) {
        await msg.reply("⚠️ Konfigurasi grup tidak ditemukan.");
        if (global.adminMenuStates) global.adminMenuStates.delete(senderId);
        return;
    }
    const botStatus = gCfg.enabled ? "🟢 AKTIF" : "🔴 NONAKTIF";
    const schedInfo = (gCfg.autoCloseSchedule && gCfg.autoCloseSchedule.enabled)
        ? `🟢 AKTIF (${gCfg.autoCloseSchedule.openTime} - ${gCfg.autoCloseSchedule.closeTime})`
        : "🔴 NONAKTIF";
    let detailText = `⚙️ *PENGATURAN GRUP: ${gCfg.groupName || groupId}* ⚙️\n\n` +
                     `🔌 Status Bot: *${botStatus}*\n` +
                     `⏰ Jadwal Otomatis: *${schedInfo}*\n\n` +
                     `Pilih opsi berikut dengan mengetik angkanya:\n\n` +
                     `1️⃣ 🔌 *Toggle Status Bot* (Aktif/Nonaktif)\n` +
                     `2️⃣ 🔓 *Buka Grup* (Manual khusus grup ini)\n` +
                     `3️⃣ 🔒 *Tutup Grup* (Manual khusus grup ini)\n` +
                     `4️⃣ ⏰ *Kelola Jadwal Otomatis*\n` +
                     `5️⃣ ➕ *Tambah Trigger Baru* (Khusus grup ini)\n\n` +
                     `_Ketik *0* untuk kembali ke pilihan grup, atau *batal* untuk keluar._`;
    await msg.reply(detailText);
}

async function handleAdminMenuMessage(msg, {
    senderId, userMessage, textLower, isSenderHostAdmin, isGroup, shopData,
    clientInstance, ioInstance, setMessagesAdminsOnly
}) {
    if (!global.adminMenuStates) global.adminMenuStates = new Map();
    
    // Trigger root menu admin
    if (!isGroup && isSenderHostAdmin && (textLower === '!admin' || textLower === 'admin' || textLower === 'menu admin' || textLower === 'menu' || textLower === 'bantuan' || textLower === 'help')) {
        global.adminMenuStates.set(senderId, { step: 'root', lastActive: Date.now() });
        let adminMenuText = `🛡️ *MENU UTAMA HOST ADMIN* 🛡️\n\n` +
                            `Silakan pilih perintah dengan mengetik angkanya:\n\n` +
                            `1️⃣ 👥 *Kelola Konfigurasi Grup WA*\n` +
                            `2️⃣ 🔓 *Buka Toko* (Semua Grup)\n` +
                            `3️⃣ 🔒 *Tutup Toko* (Semua Grup)\n` +
                            `4️⃣ 📦 *Kelola Status Stok Barang*\n` +
                            `5️⃣ 👥 *Lihat Daftar Pelanggan*\n` +
                            `6️⃣ ➕ *Tambah Trigger Kata Kunci Baru* (Semua Grup)\n` +
                            `7️⃣ 📝 *Update Panduan & Aturan Bot*\n` +
                            `8️⃣ 🛍️ *Tambah Produk ke Menu*\n` +
                            `9️⃣ ✏️ *Edit / Hapus Produk Menu*\n\n` +
                            `_Ketik *batal* untuk keluar dari menu admin._`;
        await msg.reply(adminMenuText);
        return true; // handled
    }
    
    const adminSession = global.adminMenuStates.get(senderId);
    
    // Active session
    if (!isGroup && isSenderHostAdmin && adminSession && (Date.now() - adminSession.lastActive < 300000)) {
        adminSession.lastActive = Date.now();
        
        if (textLower === 'batal' || textLower === 'keluar') {
            global.adminMenuStates.delete(senderId);
            await msg.reply("🚪 Keluar dari Menu Host Admin.");
            return true;
        }
        
        const { group_configs: gConfigs } = await getGroupConfigs();
        
        // ROOT STEP
        if (adminSession.step === 'root') {
            if (userMessage === '1') {
                const groupIds = Object.keys(gConfigs);
                if (groupIds.length === 0) {
                    await msg.reply("⚠️ Belum ada grup WA yang dikonfigurasi.");
                    global.adminMenuStates.delete(senderId);
                    return true;
                }
                adminSession.step = 'select_group';
                adminSession.groupIds = groupIds;
                let listText = `👥 *PILIH GRUP WA UNTUK DIATUR* 👥\n\nKetik nomor grup yang ingin Anda atur:\n\n`;
                groupIds.forEach((gId, idx) => {
                    const gCfg = gConfigs[gId];
                    listText += `*${idx + 1}*. ${gCfg.groupName || gId}\n`;
                });
                listText += `\n_Ketik *batal* untuk membatalkan._`;
                await msg.reply(listText);
                return true;
            } else if (userMessage === '2') {
                let successCount = 0;
                const groupIds2 = Object.keys(gConfigs);
                for (let gi = 0; gi < groupIds2.length; gi++) {
                    const gId = groupIds2[gi];
                    try {
                        const gCfg = gConfigs[gId];
                        const openText = (gCfg && gCfg.groupOpenText && gCfg.groupOpenText.trim() !== '') 
                            ? gCfg.groupOpenText 
                            : "🔓 *Pemberitahuan:* Toko telah dibuka kembali. Grup dibuka untuk umum!";
                        await setMessagesAdminsOnly(clientInstance, gId, false);
                        await clientInstance.sendMessage(gId, openText);
                        successCount++;
                    } catch (err) { console.error(`Gagal membuka grup ${gId}:`, err.message); }
                    // Delay antar grup agar tidak terdeteksi spam oleh WhatsApp
                    if (gi < groupIds2.length - 1) await new Promise(r => setTimeout(r, 5000));
                }
                global.adminMenuStates.delete(senderId);
                await msg.reply(`🔓 Toko dibuka! Berhasil membuka ${successCount} grup.`);
                return true;
            } else if (userMessage === '3') {
                let successCount = 0;
                const groupIds3 = Object.keys(gConfigs);
                for (let gi = 0; gi < groupIds3.length; gi++) {
                    const gId = groupIds3[gi];
                    try {
                        const gCfg = gConfigs[gId];
                        const closeText = (gCfg && gCfg.groupCloseText && gCfg.groupCloseText.trim() !== '') 
                            ? gCfg.groupCloseText 
                            : "🔒 *Pemberitahuan:* Toko telah ditutup. Hanya Admin yang dapat mengirim pesan.";
                        await setMessagesAdminsOnly(clientInstance, gId, true);
                        await clientInstance.sendMessage(gId, closeText);
                        successCount++;
                    } catch (err) { console.error(`Gagal menutup grup ${gId}:`, err.message); }
                    // Delay antar grup agar tidak terdeteksi spam oleh WhatsApp
                    if (gi < groupIds3.length - 1) await new Promise(r => setTimeout(r, 5000));
                }
                global.adminMenuStates.delete(senderId);
                await msg.reply(`🔒 Toko ditutup! Berhasil mengunci ${successCount} grup.`);
                return true;
            } else if (userMessage === '4') {
                const nodes = await getAllContentNodes();
                if (nodes.length === 0) {
                    await msg.reply("⚠️ Belum ada menu barang bertipe Konten di grup.");
                    global.adminMenuStates.delete(senderId);
                    return true;
                }
                adminSession.step = 'manage_stock';
                adminSession.nodes = nodes;
                let replyText = `📦 *KELOLA STATUS STOK BARANG*\n\nPilih nomor barang untuk mengubah statusnya:\n\n`;
                nodes.forEach((n, idx) => {
                    const statusEmoji = n.status === 'Tersedia' ? '🟢' : n.status === 'Habis' ? '🔴' : n.status === 'Pre-order' ? '🟡' : '⚪';
                    replyText += `*${idx + 1}*️⃣ ${statusEmoji} *${n.name}* (${n.groupName})\n   Status: ${n.status || 'Belum Diatur'}\n`;
                });
                replyText += `\nFormat ubah: *[nomor] [status]*\nPilihan status: *Tersedia*, *Habis*, *Pre-order*\n_Ketik *batal* untuk membatalkan._`;
                await msg.reply(replyText);
                return true;
            } else if (userMessage === '5') {
                let replyText = "👥 *DAFTAR PELANGGAN TOKO:*\n\n";
                if (shopData.customers && shopData.customers.length > 0) {
                    shopData.customers.forEach((c, idx) => { replyText += `${idx + 1}. *${c.name}* (${c.phone})\n`; });
                } else {
                    replyText += "Belum ada pelanggan terdaftar.";
                }
                global.adminMenuStates.delete(senderId);
                await msg.reply(replyText);
                return true;
            } else if (userMessage === '6') {
                adminSession.step = 'trigger_input';
                await msg.reply("➕ *TAMBAH TRIGGER KATA KUNCI BARU*\n\nKetik pemicu dan respon:\n*[kata_kunci] | [respon_balasan]*\n\nContoh: *alamat | Toko kami berlokasi di Jl. Melati No. 5.*\n\n_Ketik *batal* untuk membatalkan._");
                return true;
            } else if (userMessage === '7') {
                const memPath = path.join(__dirname, '../../knowledge', '00_memori_otomatis.txt');
                let currentMem = '';
                try { currentMem = fs.existsSync(memPath) ? fs.readFileSync(memPath, 'utf-8').trim() : '(Kosong)'; } catch(_) {}
                adminSession.step = 'panduan_input';
                await msg.reply(`📝 *UPDATE PANDUAN & ATURAN BOT*\n\nPanduan saat ini:\n_${currentMem || '(Kosong)'}_ \n\nKetik panduan/aturan bot yang baru untuk menggantikannya.\n\n_Ketik *batal* untuk membatalkan._`);
                return true;
            } else if (userMessage === '8') {
                const groupIds = Object.keys(gConfigs);
                if (groupIds.length === 0) {
                    await msg.reply("⚠️ Belum ada grup WA yang dikonfigurasi. Tambahkan grup dulu lewat dashboard web.");
                    global.adminMenuStates.delete(senderId);
                    return true;
                }
                adminSession.step = 'add_product_select_group';
                adminSession.groupIds = groupIds;
                let listText9 = `🛍️ *TAMBAH PRODUK KE MENU*\n\nPilih grup tujuan:\n\n`;
                for (let idx9 = 0; idx9 < groupIds.length; idx9++) {
                    const gCfg = gConfigs[groupIds[idx9]];
                    let displayName = groupIds[idx9];
                    if (gCfg.groupName && !gCfg.groupName.includes('@g.us')) displayName = gCfg.groupName;
                    else if (clientInstance) {
                        try { const chat = await clientInstance.getChatById(groupIds[idx9]); if (chat && chat.name) displayName = chat.name; } catch (_) {}
                    }
                    listText9 += `${idx9 + 1}. ${displayName}\n`;
                }
                listText9 += `\n_Ketik *batal* untuk membatalkan._`;
                await msg.reply(listText9);
                return true;
            } else if (userMessage === '9') {
                const groupIds = Object.keys(gConfigs);
                if (groupIds.length === 0) {
                    await msg.reply("⚠️ Belum ada grup WA yang dikonfigurasi.");
                    global.adminMenuStates.delete(senderId);
                    return true;
                }
                adminSession.step = 'edit_product_select_group';
                adminSession.groupIds = groupIds;
                let listText10 = `✏️ *EDIT / HAPUS PRODUK MENU*\n\nPilih grup:\n\n`;
                for (let idx10 = 0; idx10 < groupIds.length; idx10++) {
                    const gCfg = gConfigs[groupIds[idx10]];
                    let displayName = groupIds[idx10];
                    if (gCfg.groupName && !gCfg.groupName.includes('@g.us')) displayName = gCfg.groupName;
                    else if (clientInstance) {
                        try { const chat = await clientInstance.getChatById(groupIds[idx10]); if (chat && chat.name) displayName = chat.name; } catch (_) {}
                    }
                    listText10 += `${idx10 + 1}. ${displayName}\n`;
                }
                listText10 += `\n_Ketik *batal* untuk membatalkan._`;
                await msg.reply(listText10);
                return true;
            } else {
                await msg.reply("⚠️ Pilihan tidak valid. Silakan ketik angka 1 sampai 10, atau ketik *batal* untuk keluar.");
                return true;
            }
        }
        
        // SELECT_GROUP STEP
        if (adminSession.step === 'select_group') {
            const idx = parseInt(userMessage.trim(), 10) - 1;
            const groupIds = adminSession.groupIds || [];
            const targetGroupId = groupIds[idx];
            if (!targetGroupId) {
                await msg.reply(`⚠️ Pilihan tidak valid. Masukkan angka antara 1 sampai ${groupIds.length}.`);
                return true;
            }
            adminSession.step = 'group_detail';
            adminSession.selectedGroupId = targetGroupId;
            await sendGroupDetailMenu(msg, targetGroupId, senderId);
            return true;
        }
        
        // GROUP_DETAIL STEP
        if (adminSession.step === 'group_detail') {
            const selectedGroupId = adminSession.selectedGroupId;
            const gCfg = gConfigs[selectedGroupId];
            if (!gCfg) { await msg.reply("⚠️ Grup tidak ditemukan."); global.adminMenuStates.delete(senderId); return true; }
            
            if (userMessage === '0') {
                const groupIds = Object.keys(gConfigs);
                adminSession.step = 'select_group';
                adminSession.groupIds = groupIds;
                let listText = `👥 *PILIH GRUP WA UNTUK DIATUR* 👥\n\nKetik nomor grup:\n\n`;
                groupIds.forEach((gId, idx) => {
                    const cfg = gConfigs[gId];
                    listText += `*${idx + 1}*. ${cfg.groupName || gId}\n`;
                });
                listText += `\n_Ketik *batal* untuk membatalkan._`;
                await msg.reply(listText);
                return true;
            }
            if (userMessage === '1') {
                gCfg.enabled = !gCfg.enabled;
                await saveGroupConfig(selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: selectedGroupId });
                await msg.reply(`🔌 Status bot untuk grup *${gCfg.groupName || selectedGroupId}* kini *${gCfg.enabled ? 'AKTIF' : 'NONAKTIF'}*!`);
                await sendGroupDetailMenu(msg, selectedGroupId, senderId);
                return true;
            } else if (userMessage === '2') {
                try {
                    const openText = (gCfg && gCfg.groupOpenText && gCfg.groupOpenText.trim() !== '') 
                        ? gCfg.groupOpenText 
                        : "🔓 *Pemberitahuan:* Toko telah dibuka kembali. Grup dibuka untuk umum!";
                    await setMessagesAdminsOnly(clientInstance, selectedGroupId, false);
                    await clientInstance.sendMessage(selectedGroupId, openText);
                    await msg.reply("🔓 Berhasil membuka grup manual.");
                } catch(err) {
                    const errMsg = err.message || String(err);
                    if (errMsg === 'r' || errMsg.includes('Evaluation failed') || errMsg.trim().length <= 3) {
                        await msg.reply("❌ Gagal membuka grup: Terjadi kesalahan browser WhatsApp Web. Pastikan bot adalah Admin di grup ini.");
                    } else {
                        await msg.reply("❌ Gagal membuka grup: " + errMsg);
                    }
                }
                await sendGroupDetailMenu(msg, selectedGroupId, senderId);
                return true;
            } else if (userMessage === '3') {
                try {
                    const closeText = (gCfg && gCfg.groupCloseText && gCfg.groupCloseText.trim() !== '') 
                        ? gCfg.groupCloseText 
                        : "🔒 *Pemberitahuan:* Toko telah ditutup. Hanya Admin yang dapat mengirim pesan.";
                    await setMessagesAdminsOnly(clientInstance, selectedGroupId, true);
                    await clientInstance.sendMessage(selectedGroupId, closeText);
                    await msg.reply("🔒 Berhasil menutup grup manual.");
                } catch(err) {
                    const errMsg = err.message || String(err);
                    if (errMsg === 'r' || errMsg.includes('Evaluation failed') || errMsg.trim().length <= 3) {
                        await msg.reply("❌ Gagal menutup grup: Terjadi kesalahan browser WhatsApp Web. Pastikan bot adalah Admin di grup ini.");
                    } else {
                        await msg.reply("❌ Gagal menutup grup: " + errMsg);
                    }
                }
                await sendGroupDetailMenu(msg, selectedGroupId, senderId);
                return true;
            } else if (userMessage === '4') {
                adminSession.step = 'group_scheduler_input';
                await msg.reply("⏰ *KELOLA JADWAL OTOMATIS* ⏰\n\nKetik konfigurasi:\n*[aktif/nonaktif] | [jam_buka] | [jam_tutup]*\n\nContoh: *aktif | 08:00 | 17:00*\nContoh: *nonaktif*\n\n_Ketik *batal* untuk membatalkan._");
                return true;
            } else if (userMessage === '5') {
                adminSession.step = 'group_trigger_input';
                await msg.reply("➕ *TAMBAH TRIGGER BARU GRUP* ➕\n\nFormat:\n*[kata_kunci] | [teks_balasan] | [nama_media_opsional]*\n\nContoh: *alamat | Toko kami di Jl. Melati No. 5*\n\n_Ketik *batal* untuk membatalkan._");
                return true;
            } else {
                await msg.reply("⚠️ Pilihan tidak valid. Ketik angka 1 sampai 5, atau 0 untuk kembali.");
                return true;
            }
        }
        
        // GROUP_SCHEDULER_INPUT STEP
        if (adminSession.step === 'group_scheduler_input') {
            const selectedGroupId = adminSession.selectedGroupId;
            const gCfg = gConfigs[selectedGroupId];
            if (!gCfg) { await msg.reply("⚠️ Grup tidak ditemukan."); global.adminMenuStates.delete(senderId); return true; }
            const parts = userMessage.split('|');
            const mode = parts[0].trim().toLowerCase();
            if (mode === 'nonaktif' || mode === 'matikan' || mode === 'off') {
                gCfg.autoCloseSchedule = gCfg.autoCloseSchedule || { enabled: false, openTime: '08:00', closeTime: '17:00', activeDays: [1,2,3,4,5] };
                gCfg.autoCloseSchedule.enabled = false;
                await saveGroupConfig(selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: selectedGroupId });
                await msg.reply("⏰ Jadwal otomatis dinonaktifkan.");
            } else {
                if (parts.length < 3) { await msg.reply("⚠️ Format salah. Gunakan:\n*aktif | [jam_buka] | [jam_tutup]*"); return true; }
                const openTime = parts[1].trim();
                const closeTime = parts[2].trim();
                gCfg.autoCloseSchedule = gCfg.autoCloseSchedule || { enabled: false, openTime: '08:00', closeTime: '17:00', activeDays: [1,2,3,4,5] };
                gCfg.autoCloseSchedule.enabled = true;
                gCfg.autoCloseSchedule.openTime = openTime;
                gCfg.autoCloseSchedule.closeTime = closeTime;
                await saveGroupConfig(selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: selectedGroupId });
                await msg.reply(`⏰ Jadwal otomatis diaktifkan (${openTime} - ${closeTime}).`);
            }
            adminSession.step = 'group_detail';
            await sendGroupDetailMenu(msg, selectedGroupId, senderId);
            return true;
        }
        
        // GROUP_TRIGGER_INPUT STEP
        if (adminSession.step === 'group_trigger_input') {
            const selectedGroupId = adminSession.selectedGroupId;
            const gCfg = gConfigs[selectedGroupId];
            if (!gCfg) { await msg.reply("⚠️ Grup tidak ditemukan."); global.adminMenuStates.delete(senderId); return true; }
            const parts = userMessage.split('|');
            if (parts.length < 2) { await msg.reply("⚠️ Format salah. Gunakan:\n*[kata_kunci] | [teks_balasan] | [nama_media_opsional]*"); return true; }
            const keyword = parts[0].trim();
            const reply = parts[1].trim();
            const media = parts[2] ? parts[2].trim() : '';
            gCfg.extraTriggers = gCfg.extraTriggers || [];
            gCfg.extraTriggers = gCfg.extraTriggers.filter(t => t.keyword.toLowerCase().trim() !== keyword.toLowerCase().trim());
            gCfg.extraTriggers.push({ keyword, reply, media });
            await saveGroupConfig(selectedGroupId, gCfg);
            if (ioInstance) ioInstance.emit('group_config_updated', { groupId: selectedGroupId });
            await msg.reply(`✅ Berhasil menambahkan trigger *"${keyword}"*${media ? ` dengan media: ${media}` : ''} khusus untuk grup ini.`);
            adminSession.step = 'group_detail';
            await sendGroupDetailMenu(msg, selectedGroupId, senderId);
            return true;
        }
        
        // MANAGE_STOCK STEP
        if (adminSession.step === 'manage_stock') {
            const parts = userMessage.trim().split(/\s+/);
            if (parts.length < 2) { await msg.reply("⚠️ Format salah. Ketik: *[nomor] [status]*"); return true; }
            const index = parseInt(parts[0], 10) - 1;
            const newStatusInput = parts.slice(1).join(' ').trim().toLowerCase();
            const validStatuses = { 'tersedia': 'Tersedia', 'habis': 'Habis', 'pre-order': 'Pre-order', 'preorder': 'Pre-order' };
            const newStatus = validStatuses[newStatusInput];
            if (!newStatus) { await msg.reply("⚠️ Status tidak valid. Pilih: *Tersedia*, *Habis*, *Pre-order*"); return true; }
            const nodes = adminSession.nodes || [];
            const targetNodeInfo = nodes[index];
            if (!targetNodeInfo) { await msg.reply(`⚠️ Nomor tidak valid. Masukkan angka antara 1 sampai ${nodes.length}.`); return true; }
            const groupConfig = gConfigs[targetNodeInfo.groupId];
            if (groupConfig && groupConfig.menuTree) {
                const node = findNodeById(groupConfig.menuTree, targetNodeInfo.nodeId);
                if (node) {
                    node.status = newStatus;
                    await saveGroupConfig(targetNodeInfo.groupId, groupConfig);
                    if (ioInstance) ioInstance.emit('group_config_updated', { groupId: targetNodeInfo.groupId });
                    global.adminMenuStates.delete(senderId);
                    await msg.reply(`✅ Berhasil mengubah status *${targetNodeInfo.name}* menjadi *${newStatus}*!`);
                    return true;
                }
            }
            await msg.reply("❌ Gagal memperbarui status menu.");
            global.adminMenuStates.delete(senderId);
            return true;
        }
        
        // BROADCAST_INPUT STEP — DINONAKTIFKAN
        if (adminSession.step === 'broadcast_input') {
            global.adminMenuStates.delete(senderId);
            await msg.reply("🚫 Fitur broadcast telah dinonaktifkan untuk melindungi akun WhatsApp dari risiko pemblokiran.");
            return true;
        }
        
        // TRIGGER_INPUT STEP (global)
        if (adminSession.step === 'trigger_input') {
            const parts = userMessage.split('|');
            if (parts.length < 2) { await msg.reply("⚠️ Format salah. Gunakan tanda |.\nContoh: *alamat | Jl. Melati No. 5*"); return true; }
            const keyword = parts[0].trim();
            const reply = parts.slice(1).join('|').trim();
            if (!keyword || !reply) { await msg.reply("⚠️ Kata kunci dan respon tidak boleh kosong!"); return true; }
            const groupIds = Object.keys(gConfigs);
            let updateCount = 0;
            for (const gId of groupIds) {
                const gCfg = gConfigs[gId];
                if (gCfg) {
                    gCfg.extraTriggers = gCfg.extraTriggers || [];
                    gCfg.extraTriggers = gCfg.extraTriggers.filter(t => t.keyword.toLowerCase().trim() !== keyword.toLowerCase().trim());
                    gCfg.extraTriggers.push({ keyword, reply });
                    await saveGroupConfig(gId, gCfg);
                    updateCount++;
                }
            }
            if (ioInstance) ioInstance.emit('group_config_updated', {});
            global.adminMenuStates.delete(senderId);
            await msg.reply(`✅ Berhasil menambahkan trigger *"${keyword}"* ke ${updateCount} grup!`);
            return true;
        }
        
        // PANDUAN_INPUT STEP
        if (adminSession.step === 'panduan_input') {
            const newPanduan = userMessage.trim();
            const memPath = path.join(__dirname, '../../knowledge', '00_memori_otomatis.txt');
            try {
                fs.writeFileSync(memPath, newPanduan, 'utf-8');
                if (ioInstance) ioInstance.emit('memory_updated', {});
                global.adminMenuStates.delete(senderId);
                await msg.reply(`✅ *Panduan & Aturan Bot berhasil diperbarui!*\n\nPanduan baru:\n_${newPanduan}_`);
            } catch(err) {
                await msg.reply(`❌ Gagal menyimpan panduan: ${err.message}`);
                global.adminMenuStates.delete(senderId);
            }
            return true;
        }
        
        // ADD PRODUCT FLOW
        if (adminSession.step === 'add_product_select_group') {
            const idx = parseInt(userMessage.trim(), 10) - 1;
            const groupIds = adminSession.groupIds || [];
            const targetGroupId = groupIds[idx];
            if (!targetGroupId) { await msg.reply(`⚠️ Pilihan tidak valid. Masukkan angka 1 sampai ${groupIds.length}.`); return true; }
            adminSession.selectedGroupId = targetGroupId;
            const gCfg = gConfigs[targetGroupId];
            const menuTree = gCfg.menuTree || { children: [] };
            const categories = [];
            const collectCats = (node) => {
                if (node.type === 'category') { categories.push({ id: node.id, name: node.name, ref: node }); if (node.children) node.children.forEach(collectCats); }
            };
            collectCats(menuTree);
            adminSession.categories = categories;
            let catText = `📂 *PILIH KATEGORI*\n\nKetik nomor kategori tujuan produk baru:\n\n`;
            categories.forEach((c, i) => { catText += `${i + 1}. ${c.name}\n`; });
            catText += `${categories.length + 1}. ➕ *Buat Kategori Baru*\n\n_Ketik *batal* untuk membatalkan._`;
            adminSession.step = 'add_product_select_cat';
            await msg.reply(catText);
            return true;
        }
        if (adminSession.step === 'add_product_select_cat') {
            const categories = adminSession.categories || [];
            const idx = parseInt(userMessage.trim(), 10) - 1;
            if (idx === categories.length) {
                adminSession.step = 'add_product_new_cat_name';
                await msg.reply(`📂 *BUAT KATEGORI BARU*\n\nKetik nama kategori baru:\n\n_Ketik *batal* untuk membatalkan._`);
                return true;
            }
            if (!categories[idx]) { await msg.reply(`⚠️ Pilihan tidak valid. Masukkan angka 1 sampai ${categories.length + 1}.`); return true; }
            adminSession.selectedCatId = categories[idx].id;
            adminSession.step = 'add_product_name';
            await msg.reply(`✏️ *NAMA PRODUK*\n\nKetik nama produk yang ingin ditambahkan:\n\n_Ketik *batal* untuk membatalkan._`);
            return true;
        }
        if (adminSession.step === 'add_product_new_cat_name') {
            const newCatName = userMessage.trim();
            if (!newCatName) { await msg.reply('⚠️ Nama kategori tidak boleh kosong.'); return true; }
            const newCatId = 'cat_' + Date.now();
            const newCatNode = { id: newCatId, name: newCatName, type: 'category', text: '', children: [] };
            const gCfg = gConfigs[adminSession.selectedGroupId];
            gCfg.menuTree = gCfg.menuTree || { id: 'root', name: 'Menu Utama', type: 'category', text: '', children: [] };
            gCfg.menuTree.children = gCfg.menuTree.children || [];
            gCfg.menuTree.children.push(newCatNode);
            await saveGroupConfig(adminSession.selectedGroupId, gCfg);
            if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
            adminSession.selectedCatId = newCatId;
            adminSession.step = 'add_product_name';
            await msg.reply(`✅ Kategori *${newCatName}* berhasil dibuat!\n\n✏️ *NAMA PRODUK*\n\nKetik nama produk:\n\n_Ketik *batal* untuk membatalkan._`);
            return true;
        }
        if (adminSession.step === 'add_product_name') {
            adminSession.newProduct = { name: userMessage.trim() };
            adminSession.step = 'add_product_desc';
            await msg.reply(`📝 *DESKRIPSI / ISI PRODUK*\n\nKetik deskripsi lengkap produk *${adminSession.newProduct.name}*:\n\n_Ketik *batal* untuk membatalkan._`);
            return true;
        }
        if (adminSession.step === 'add_product_desc') {
            adminSession.newProduct.text = userMessage.trim();
            adminSession.step = 'add_product_status';
            await msg.reply(`📊 *STATUS KETERSEDIAAN*\n\n1. ✅ Tersedia\n2. ❌ Habis\n3. ⏳ Pre-order\n\n_Ketik *batal* untuk membatalkan._`);
            return true;
        }
        if (adminSession.step === 'add_product_status') {
            const statusMap = { '1': 'Tersedia', '2': 'Habis', '3': 'Pre-order', 'tersedia': 'Tersedia', 'habis': 'Habis', 'pre-order': 'Pre-order', 'preorder': 'Pre-order' };
            const status = statusMap[userMessage.trim().toLowerCase()];
            if (!status) { await msg.reply('⚠️ Pilihan tidak valid. Ketik 1 (Tersedia), 2 (Habis), atau 3 (Pre-order).'); return true; }
            adminSession.newProduct.status = status;
            adminSession.step = 'add_product_promo';
            await msg.reply(`🔥 *PROMO SPESIAL?*\n\n1. Ya — tandai sebagai 🔥 Promo\n2. Tidak\n\n_Ketik *batal* untuk membatalkan._`);
            return true;
        }
        if (adminSession.step === 'add_product_promo') {
            const isPromoMap = { '1': true, 'ya': true, 'yes': true, 'y': true, '2': false, 'tidak': false, 'no': false, 'n': false };
            const isPromo = isPromoMap[userMessage.trim().toLowerCase()];
            if (isPromo === undefined) { await msg.reply('⚠️ Ketik 1 (Ya) atau 2 (Tidak).'); return true; }
            adminSession.newProduct.isPromo = isPromo;
            const p = adminSession.newProduct;
            const statusEmoji = { 'Tersedia': '✅', 'Habis': '❌', 'Pre-order': '⏳' }[p.status] || '';
            const confirmText = `📋 *KONFIRMASI PRODUK BARU*\n\n*Nama:* ${p.name}\n*Status:* ${statusEmoji} ${p.status}\n*Promo:* ${isPromo ? '🔥 Ya' : 'Tidak'}\n*Deskripsi:*\n${p.text}\n\nKetik *simpan* untuk menyimpan, atau *batal* untuk membatalkan.`;
            adminSession.step = 'add_product_confirm';
            await msg.reply(confirmText);
            return true;
        }
        if (adminSession.step === 'add_product_confirm') {
            if (textLower !== 'simpan') { await msg.reply('❌ Penambahan produk dibatalkan.'); global.adminMenuStates.delete(senderId); return true; }
            const p = adminSession.newProduct;
            const newProductNode = { id: 'prod_' + Date.now(), name: p.name, type: 'content', text: p.text, status: p.status, isPromo: p.isPromo || false, media: '' };
            const gCfg = gConfigs[adminSession.selectedGroupId];
            const catNode = findNodeById(gCfg.menuTree, adminSession.selectedCatId);
            if (!catNode) { await msg.reply('❌ Kategori tidak ditemukan. Silakan coba lagi.'); global.adminMenuStates.delete(senderId); return true; }
            catNode.children = catNode.children || [];
            catNode.children.push(newProductNode);
            await saveGroupConfig(adminSession.selectedGroupId, gCfg);
            if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
            global.adminMenuStates.delete(senderId);
            await msg.reply(`✅ *Produk berhasil ditambahkan!*\n\n🛍️ *${p.name}* telah masuk ke menu grup *${gCfg.groupName || adminSession.selectedGroupId}*.`);
            return true;
        }
        
        // EDIT PRODUCT FLOW
        if (adminSession.step === 'edit_product_select_group') {
            const idx = parseInt(userMessage.trim(), 10) - 1;
            const groupIds = adminSession.groupIds || [];
            const targetGroupId = groupIds[idx];
            if (!targetGroupId) { await msg.reply(`⚠️ Pilihan tidak valid. Masukkan angka 1 sampai ${groupIds.length}.`); return true; }
            adminSession.selectedGroupId = targetGroupId;
            const allProducts = (await getAllContentNodes()).filter(n => n.groupId === targetGroupId);
            if (allProducts.length === 0) { await msg.reply('⚠️ Belum ada produk di grup ini.'); global.adminMenuStates.delete(senderId); return true; }
            adminSession.editProducts = allProducts;
            const numMap = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
            const getN = (n) => n.toString().split('').map(d => numMap[parseInt(d,10)]||d).join('');
            const stEmoji = (s) => s==='Tersedia'?'✅':s==='Habis'?'❌':s==='Pre-order'?'⏳':'❔';
            let prodList = `✏️ *DAFTAR PRODUK*\n\nKetik nomor produk yang ingin diedit:\n\n`;
            allProducts.forEach((p, i) => { const promo = p.isPromo ? ' 🔥' : ''; prodList += `${getN(i+1)} *${p.name}*${promo} ${stEmoji(p.status)}\n`; });
            prodList += `\n_Ketik *batal* untuk membatalkan._`;
            adminSession.step = 'edit_product_pick';
            await msg.reply(prodList);
            return true;
        }
        if (adminSession.step === 'edit_product_pick') {
            const idx = parseInt(userMessage.trim(), 10) - 1;
            const allProducts = adminSession.editProducts || [];
            if (!allProducts[idx]) { await msg.reply(`⚠️ Pilihan tidak valid. Masukkan angka 1 sampai ${allProducts.length}.`); return true; }
            adminSession.editTargetProduct = allProducts[idx];
            const p = allProducts[idx];
            const stEmoji = (s) => s==='Tersedia'?'✅':s==='Habis'?'❌':s==='Pre-order'?'⏳':'❔';
            const detail = `✏️ *${p.name}* ${p.isPromo?'🔥':''} ${stEmoji(p.status)}\n\n_${p.text ? p.text.substring(0,120)+'...' : '(kosong)'}_\n\nPilih yang ingin diedit:\n\n1️⃣ Ubah Nama\n2️⃣ Ubah Deskripsi / Konten\n3️⃣ Ubah Status Ketersediaan\n4️⃣ Toggle Promo (${p.isPromo ? 'Promo AKTIF → Nonaktifkan' : 'Promo NONAKTIF → Aktifkan'})\n5️⃣ Hapus Produk Ini\n\n0️⃣ Kembali ke Daftar Produk\n\n_Ketik *batal* untuk keluar._`;
            adminSession.step = 'edit_product_action';
            await msg.reply(detail);
            return true;
        }
        if (adminSession.step === 'edit_product_action') {
            const p = adminSession.editTargetProduct;
            const gCfg = gConfigs[adminSession.selectedGroupId];
            const node = findNodeById(gCfg.menuTree, p.nodeId);
            if (userMessage === '0') {
                const allProducts = (await getAllContentNodes()).filter(n => n.groupId === adminSession.selectedGroupId);
                adminSession.editProducts = allProducts;
                const numMap = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
                const getN = (n) => n.toString().split('').map(d => numMap[parseInt(d,10)]||d).join('');
                const stEmoji = (s) => s==='Tersedia'?'✅':s==='Habis'?'❌':s==='Pre-order'?'⏳':'❔';
                let prodList = `✏️ *DAFTAR PRODUK*\n\nKetik nomor produk yang ingin diedit:\n\n`;
                allProducts.forEach((pr, i) => prodList += `${getN(i+1)} *${pr.name}* ${stEmoji(pr.status)}${pr.isPromo?' 🔥':''}\n`);
                prodList += `\n_Ketik *batal* untuk membatalkan._`;
                adminSession.step = 'edit_product_pick';
                await msg.reply(prodList);
                return true;
            }
            if (!node) { await msg.reply('❌ Produk tidak ditemukan di pohon menu.'); global.adminMenuStates.delete(senderId); return true; }
            if (userMessage === '1') { adminSession.editAction = 'name'; adminSession.step = 'edit_product_input'; await msg.reply(`✏️ *UBAH NAMA PRODUK*\n\nNama saat ini: *${node.name}*\n\nKetik nama baru:\n\n_Ketik *batal*._`); return true; }
            else if (userMessage === '2') { adminSession.editAction = 'text'; adminSession.step = 'edit_product_input'; await msg.reply(`📝 *UBAH DESKRIPSI PRODUK*\n\nDeskripsi saat ini:\n_${node.text || '(kosong)'}_\n\nKetik deskripsi baru:\n\n_Ketik *batal*._`); return true; }
            else if (userMessage === '3') { adminSession.editAction = 'status'; adminSession.step = 'edit_product_input'; await msg.reply(`📊 *UBAH STATUS PRODUK*\n\nStatus saat ini: *${node.status || 'Tersedia'}*\n\n1. ✅ Tersedia\n2. ❌ Habis\n3. ⏳ Pre-order\n\n_Ketik *batal*._`); return true; }
            else if (userMessage === '4') {
                node.isPromo = !node.isPromo;
                await saveGroupConfig(adminSession.selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
                const state = node.isPromo ? '🔥 *AKTIF*' : '❌ *NONAKTIF*';
                await msg.reply(`✅ Promo untuk *${node.name}* sekarang ${state}!`);
                adminSession.editTargetProduct.isPromo = node.isPromo;
                const allProducts2 = (await getAllContentNodes()).filter(n => n.groupId === adminSession.selectedGroupId);
                adminSession.editProducts = allProducts2;
                const numMap2 = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
                const getN2 = (n) => n.toString().split('').map(d => numMap2[parseInt(d,10)]||d).join('');
                const st2 = (s) => s==='Tersedia'?'✅':s==='Habis'?'❌':s==='Pre-order'?'⏳':'❔';
                let prodList2 = `✏️ *DAFTAR PRODUK* (diperbarui)\n\nKetik nomor produk yang ingin diedit:\n\n`;
                allProducts2.forEach((pr, i) => prodList2 += `${getN2(i+1)} *${pr.name}* ${st2(pr.status)}${pr.isPromo?' 🔥':''}\n`);
                prodList2 += `\n_Ketik *batal*._`;
                adminSession.step = 'edit_product_pick';
                await msg.reply(prodList2);
                return true;
            } else if (userMessage === '5') {
                adminSession.editAction = 'delete'; adminSession.step = 'edit_product_input';
                await msg.reply(`🗑️ *HAPUS PRODUK*\n\nAnda yakin ingin menghapus *${node.name}*?\n\nKetik *hapus* untuk konfirmasi, atau *batal* untuk membatalkan.`);
                return true;
            } else { await msg.reply('⚠️ Pilihan tidak valid. Ketik 1-5 atau 0 untuk kembali.'); return true; }
        }
        if (adminSession.step === 'edit_product_input') {
            const p = adminSession.editTargetProduct;
            const gCfg = gConfigs[adminSession.selectedGroupId];
            const node = findNodeById(gCfg.menuTree, p.nodeId);
            if (!node) { await msg.reply('❌ Produk tidak ditemukan.'); global.adminMenuStates.delete(senderId); return true; }
            if (adminSession.editAction === 'name') {
                const oldName = node.name; node.name = userMessage.trim();
                await saveGroupConfig(adminSession.selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
                global.adminMenuStates.delete(senderId);
                await msg.reply(`✅ Nama produk berhasil diubah!\n\n*${oldName}* → *${node.name}*`);
                return true;
            } else if (adminSession.editAction === 'text') {
                node.text = userMessage.trim();
                await saveGroupConfig(adminSession.selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
                global.adminMenuStates.delete(senderId);
                await msg.reply(`✅ Deskripsi produk *${node.name}* berhasil diperbarui!`);
                return true;
            } else if (adminSession.editAction === 'status') {
                const statusMap = { '1': 'Tersedia', '2': 'Habis', '3': 'Pre-order', 'tersedia': 'Tersedia', 'habis': 'Habis', 'pre-order': 'Pre-order', 'preorder': 'Pre-order' };
                const newStatus = statusMap[userMessage.trim().toLowerCase()];
                if (!newStatus) { await msg.reply('⚠️ Pilihan tidak valid. Ketik 1, 2, atau 3.'); return true; }
                const oldStatus = node.status; node.status = newStatus;
                await saveGroupConfig(adminSession.selectedGroupId, gCfg);
                if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
                global.adminMenuStates.delete(senderId);
                const stEmoji = (s) => s==='Tersedia'?'✅':s==='Habis'?'❌':s==='Pre-order'?'⏳':'❔';
                await msg.reply(`✅ Status *${node.name}* diubah: ${stEmoji(oldStatus)} ${oldStatus} → ${stEmoji(newStatus)} *${newStatus}*`);
                return true;
            } else if (adminSession.editAction === 'delete') {
                if (textLower !== 'hapus') { await msg.reply('❌ Penghapusan dibatalkan.'); global.adminMenuStates.delete(senderId); return true; }
                const deleteNode = (tree, targetId) => {
                    if (!tree.children) return false;
                    const idx = tree.children.findIndex(c => c.id === targetId);
                    if (idx >= 0) { tree.children.splice(idx, 1); return true; }
                    return tree.children.some(c => deleteNode(c, targetId));
                };
                const deleted = deleteNode(gCfg.menuTree, p.nodeId);
                if (deleted) {
                    await saveGroupConfig(adminSession.selectedGroupId, gCfg);
                    if (ioInstance) ioInstance.emit('group_config_updated', { groupId: adminSession.selectedGroupId });
                    global.adminMenuStates.delete(senderId);
                    await msg.reply(`🗑️ Produk *${p.name}* berhasil dihapus dari menu.`);
                } else {
                    await msg.reply('❌ Gagal menghapus produk.');
                    global.adminMenuStates.delete(senderId);
                }
                return true;
            }
        }
    }
    
    return false; // not handled
}

module.exports = { handleAdminMenuMessage, getAllContentNodes, sendGroupDetailMenu };
