// src/handlers/referralHandler.js
'use strict';

const { getDb } = require('../db/sqlite');

// Helper to generate a clean uppercase unique code from phone/name
function generateReferralCode(userName, phone) {
    const cleanNum = (phone || '').replace(/\D/g, '').slice(-4);
    const cleanName = (userName || 'REF')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5);
    const prefix = cleanName || 'REF';
    return `${prefix}${cleanNum}`;
}

async function handleReferralMessage(msg, {
    chatId, senderId, userMessage, textLower, isGroup, clientInstance, ioInstance
}) {
    const text = textLower.trim();

    // Command 1: !myref / !kode / .myref / .kode — Generate / Cek Kode Referral Sendiri
    if (['!myref', '.myref', '!kode', '.kode', '!kodelink'].includes(text)) {
        try {
            const db = getDb();
            if (!db) return false;

            const contact = await msg.getContact();
            const senderPhone = (contact.number || (contact.id && contact.id.user) || senderId).replace(/\D/g, '');
            const senderName = contact.pushname || contact.name || 'Member';

            // Cek apakah user sudah punya kode referral
            let existing = await db.get("SELECT * FROM referral_codes WHERE phone = ?", senderPhone);

            if (!existing) {
                let code = generateReferralCode(senderName, senderPhone);
                // Pastikan kode unik
                let checkCode = await db.get("SELECT code FROM referral_codes WHERE code = ?", code);
                if (checkCode) {
                    code = `${code}${Math.floor(10 + Math.random() * 90)}`;
                }

                await db.run(
                    "INSERT INTO referral_codes (phone, user_name, code, total_invites, points) VALUES (?, ?, ?, 0, 0)",
                    senderPhone, senderName, code
                );

                existing = { phone: senderPhone, user_name: senderName, code, total_invites: 0, points: 0 };
            }

            let groupInviteLink = '';
            try {
                const { group_configs: gConfigs } = await getGroupConfigs();
                const activeCfg = gConfigs[chatId] || {};
                if (activeCfg && activeCfg.inviteLink && activeCfg.inviteLink.trim() !== '') {
                    groupInviteLink = activeCfg.inviteLink.trim();
                } else if (isGroup && clientInstance && typeof clientInstance.getInviteCode === 'function') {
                    const inviteCode = await clientInstance.getInviteCode(chatId);
                    if (inviteCode) {
                        groupInviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                    }
                }
            } catch (_) {}

            const shareLink = groupInviteLink || 'https://wa.jajandigital.web.id/referral';

            const replyMsg = 
`🎁 *KARTU REFERRAL AFFILIATE ANDA* 🎁
━━━━━━━━━━━━━━━━━━━━━━

👤 *Nama* : ${senderName}
🔑 *Kode Unik* : *${existing.code}*
📊 *Total Undangan* : ${existing.total_invites} Orang
🪙 *Total Poin* : ${existing.points} Poin

━━━━━━━━━━━━━━━━━━━━━━
📢 *TEKS SIAP SEBAR / PROMOSI:*
_Salin & bagikan pesan di bawah ke Story WA / Teman Anda:_

"🔥 Yuk gabung ke grup WhatsApp *Jajan Digital* buat dapet promo aplikasi premium murah!
🔗 *Link Grup:* ${shareLink}
👉 Pas baru join, langsung ketik: *!ref ${existing.code}* untuk klaim voucher diskon!"

━━━━━━━━━━━━━━━━━━━━━━
🏆 *Setiap 1 teman yang klaim kode Anda, Anda dapet +10 Poin Referral!* 🚀`;

            if (isGroup) {
                await clientInstance.sendMessage(chatId, replyMsg, { quotedMessageId: msg.id._serialized });
            } else {
                await msg.reply(replyMsg);
            }

            return true;
        } catch (err) {
            console.error('[Referral Handler Error]:', err.message);
            await msg.reply('❌ Maaf, gagal memproses kode referral.');
            return true;
        }
    }

    // Command 2: !ref <code> / .ref <code> — Klaim Kode Referral oleh Member Baru
    if (text.startsWith('!ref') || text.startsWith('.ref')) {
        const parts = userMessage.trim().split(/\s+/);
        const inputCode = (parts[1] || '').toUpperCase().trim();

        if (!inputCode) {
            await msg.reply('⚠️ *Format Salah!*\nGunakan format: *!ref <KODE_REFERRAL>*\n_Contoh: !ref BAGAS77_');
            return true;
        }

        try {
            const db = getDb();
            if (!db) return false;

            const contact = await msg.getContact();
            const referredPhone = (contact.number || (contact.id && contact.id.user) || senderId).replace(/\D/g, '');
            const referredName = contact.pushname || contact.name || 'Member Baru';

            // 1. Cari pemilik kode referral
            const referrer = await db.get("SELECT * FROM referral_codes WHERE code = ?", inputCode);

            if (!referrer) {
                await msg.reply(`❌ *Kode Referral "${inputCode}" tidak ditemukan!*\n_Mohon periksa kembali kode pengundang Anda._`);
                return true;
            }

            // 2. Anti Self-Referral (Cegah klaim kode sendiri)
            if (referrer.phone === referredPhone) {
                await msg.reply('⚠️ *Tidak dapat klaim kode sendiri!*\n_Kode referral hanya berlaku untuk teman yang Anda undang._');
                return true;
            }

            // 3. Anti Duplicate (1 Nomor hanya bisa klaim 1x selamanya)
            const alreadyClaimed = await db.get("SELECT * FROM referral_logs WHERE referred_phone = ?", referredPhone);
            if (alreadyClaimed) {
                await msg.reply('⚠️ *Anda sudah pernah menggunakan kode referral sebelumnya!*\n_Setiap akun hanya dapat diklaim 1x._');
                return true;
            }

            // 4. Catat Log Klaim & Tambah Poin
            await db.run(
                "INSERT INTO referral_logs (referrer_phone, referrer_name, referred_phone, referred_name, code_used, group_id) VALUES (?, ?, ?, ?, ?, ?)",
                referrer.phone, referrer.user_name, referredPhone, referredName, inputCode, chatId
            );

            // Tambah 10 Poin ke pengundang
            const newInvites = (referrer.total_invites || 0) + 1;
            const newPoints = (referrer.points || 0) + 10;

            await db.run(
                "UPDATE referral_codes SET total_invites = ?, points = ? WHERE phone = ?",
                newInvites, newPoints, referrer.phone
            );

            const referrerTag = `@${referrer.phone}`;
            const referredTag = `@${referredPhone}`;

            const replyMsg =
`🎉 *KONFIRMASI REFERRAL BERHASIL!* 🎉
━━━━━━━━━━━━━━━━━━━━━━

Selamat datang ${referredTag} di grup *Jajan Digital*! 🥳
Terima kasih kepada ${referrerTag} yang telah mengundang member baru.

🎁 *Reward Event:*
➕ ${referrerTag} : *+10 Poin Referral* (Total: ${newPoints} Poin)
🎁 ${referredTag} : *Voucher Bebas Admin / Diskon Khusus*

━━━━━━━━━━━━━━━━━━━━━━
🔥 Ketik *!myref* untuk mendapatkan Kode Referral Anda sendiri!`;

            await clientInstance.sendMessage(chatId, replyMsg, {
                quotedMessageId: msg.id._serialized,
                mentions: [
                    `${referrer.phone}@c.us`,
                    `${referredPhone}@c.us`
                ]
            });

            if (ioInstance) {
                ioInstance.emit('message_log', {
                    chatId,
                    body: `[Referral Event] ${referredName} klaim kode ${inputCode} dari ${referrer.user_name}`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }

            return true;
        } catch (err) {
            console.error('[Referral Claim Error]:', err.message);
            await msg.reply('❌ Maaf, gagal mengonfirmasi kode referral.');
            return true;
        }
    }

    // Command 3: !topref / .topref — Papan Peringkat Top Referral
    if (['!topref', '.topref', '!leaderboard'].includes(text)) {
        try {
            const db = getDb();
            if (!db) return false;

            const topUsers = await db.all("SELECT * FROM referral_codes ORDER BY total_invites DESC, points DESC LIMIT 10");

            if (!topUsers || topUsers.length === 0) {
                await msg.reply('📊 *PAPAN PERINGKAT REFERRAL*\n\nBelum ada peserta referral aktif. Ketik *!myref* untuk menjadi yang pertama! 🚀');
                return true;
            }

            const numMap = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
            let leaderboardMsg = `🏆 *PAPAN PERINGKAT TOP REFERRAL* 🏆\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            const mentions = [];
            topUsers.forEach((u, idx) => {
                const rank = numMap[idx] || `${idx + 1}.`;
                leaderboardMsg += `${rank} *@${u.phone}* — *${u.total_invites} Undangan* (${u.points} Poin)\n`;
                mentions.push(`${u.phone}@c.us`);
            });

            leaderboardMsg += `\n━━━━━━━━━━━━━━━━━━━━━━\n🔥 *Event Aktif!* Ketik *!myref* untuk membagikan kode Anda dan kumpulkan poin terbanyak! 🎁`;

            await clientInstance.sendMessage(chatId, leaderboardMsg, {
                quotedMessageId: msg.id._serialized,
                mentions
            });

            return true;
        } catch (err) {
            console.error('[TopRef Error]:', err.message);
            await msg.reply('❌ Maaf, gagal mengambil papan peringkat.');
            return true;
        }
    }

    return false;
}

module.exports = { handleReferralMessage };
