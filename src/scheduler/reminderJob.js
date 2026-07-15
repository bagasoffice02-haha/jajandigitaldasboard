const { deactivateReminder, getReminders, getGroupConfigs } = require('../db/models');
const { getDb } = require('../db/sqlite');
const { config } = require('../config/config');
const { fetchSheetsSummary } = require('../services/sheets/sheetsService');
const { MessageMedia } = require('whatsapp-web.js');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const os = require('os');

let lastSentReportDate = '';
let lastSentBackupDate = '';
const groupOpenStates = new Map();
function resolveClient(clientOrGetClient) {
    if (typeof clientOrGetClient === 'function') {
        return clientOrGetClient();
    }
    return clientOrGetClient;
}

async function checkPremiumExpirations(clientOrGetClient, io) {
    try {
        const client = resolveClient(clientOrGetClient);
        if (!client) return;
        
        const db = getDb();
        if (!db) return;
        
        console.log('[Premium Scheduler] Memulai pemeriksaan masa aktif langganan premium...');
        
        const sales = await db.all(`
            SELECT s.*, a.email AS account_email, p.name AS product_name 
            FROM premium_sales s 
            LEFT JOIN premium_accounts a ON s.account_id = a.id 
            LEFT JOIN premium_products p ON a.product_id = p.id
        `);
        
        if (!sales || sales.length === 0) {
            console.log('[Premium Scheduler] Tidak ada data penjualan premium.');
            return;
        }

        const todayStr = new Date().toLocaleDateString('en-US', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const [m, d, y] = todayStr.split('/');
        const todayDateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        const todayTime = new Date(todayDateStr).getTime();

        const expiringSoon = [];
        const expired = [];

        for (const sale of sales) {
            if (!sale.end_date) continue;
            
            const endTime = new Date(sale.end_date).getTime();
            const diffDays = Math.ceil((endTime - todayTime) / (1000 * 60 * 60 * 24));
            
            const profileInfo = sale.profile_name ? ` (Slot: ${sale.profile_name})` : '';
            const itemDesc = `*${sale.buyer_name}* - No. WA: ${sale.buyer_phone}\n   Prod: *${sale.product_name}* - ${sale.account_email}${profileInfo}\n   Exp: *${sale.end_date}*`;

            if (diffDays <= 0) {
                expired.push(`${itemDesc} (Lewat ${Math.abs(diffDays)} hari)`);
            } else if (diffDays <= 5) {
                expiringSoon.push(`${itemDesc} (Sisa ${diffDays} hari lagi)`);
            }

            // Send Auto-Reminder exactly 3 days and 1 day before expiration
            if (sale.auto_remind === 1 && (diffDays === 3 || diffDays === 1)) {
                try {
                    const cleanPhone = sale.buyer_phone.replace(/\D/g, '') + '@c.us';
                    const reminderMsg = `🔔 *PENGINGAT LANGGANAN PREMIUM* 🔔\n\nHalo Kak *${sale.buyer_name}*,\n\nMengingatkan bahwa langganan akun premium Anda untuk produk *${sale.product_name}*${profileInfo} akan berakhir dalam *${diffDays} hari* (${sale.end_date}).\n\nKredensial Akun:\n- Login: \`${sale.account_email}\`\n\nSilakan lakukan perpanjangan langganan sebelum masa aktif berakhir agar layanan tidak terputus. Terima kasih! 🙏`;
                    
                    await client.sendMessage(cleanPhone, reminderMsg);
                    console.log(`[Premium Scheduler] Sent auto-reminder to customer ${sale.buyer_name} (${cleanPhone})`);
                    
                    io.emit('message_log', {
                        chatId: cleanPhone,
                        body: `[Auto-Reminder Premium] Mengingatkan sisa hari: ${diffDays} hari`,
                        type: 'outgoing',
                        timestamp: Date.now()
                    });
                } catch (err) {
                    console.error(`[Premium Scheduler] Gagal mengirim auto-reminder ke ${sale.buyer_name}:`, err.message);
                }
            }
        }

        // Send daily rekap report to Admin Host
        if ((expired.length > 0 || expiringSoon.length > 0) && config.boss_number && config.boss_number.trim() !== '') {
            try {
                const cleanBoss = config.boss_number.replace(/\D/g, '') + '@c.us';
                
                let adminMsg = `⚠️ *REKAP EXPIRED & PERINGATAN LANGGANAN PREMIUM* ⚠️\n\nHalo Bos! Berikut adalah daftar pelanggan premium yang sudah habis masa aktifnya atau akan habis dalam waktu dekat:\n\n`;
                
                if (expired.length > 0) {
                    adminMsg += `🔴 *SUDAH HABIS (EXPIRED):*\n`;
                    expired.forEach((line, idx) => {
                        adminMsg += `${idx + 1}. ${line}\n`;
                    });
                    adminMsg += `\n`;
                }
                
                if (expiringSoon.length > 0) {
                    adminMsg += `🟡 *AKAN HABIS (1-5 HARI):*\n`;
                    expiringSoon.forEach((line, idx) => {
                        adminMsg += `${idx + 1}. ${line}\n`;
                    });
                    adminMsg += `\n`;
                }
                
                adminMsg += `Silakan lakukan follow-up ke pelanggan di atas untuk perpanjangan atau penonaktifan akun. Terima kasih!`;
                
                await client.sendMessage(cleanBoss, adminMsg);
                console.log(`[Premium Scheduler] Rekap dikirim ke Bos: ${cleanBoss}`);
                
                io.emit('message_log', {
                    chatId: cleanBoss,
                    body: `[Rekap Premium Terjadwal] Mengirim ${expired.length} expired & ${expiringSoon.length} warning`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            } catch (err) {
                console.error('[Premium Scheduler] Gagal mengirim rekap ke Bos:', err.message);
            }
        }
    } catch (err) {
        console.error('[Premium Scheduler] Error:', err.message);
    }
}

async function sendDailyReport(clientOrGetClient, io) {
    try {
        const client = resolveClient(clientOrGetClient);
        if (!client) return;
        if (!config.boss_number || config.boss_number.trim() === '') {
            console.log('[Scheduler] Nomor WhatsApp Bos belum dikonfigurasi. Laporan dibatalkan.');
            return;
        }

        console.log('[Scheduler] Mengambil data Google Sheets untuk laporan harian...');
        const summary = await fetchSheetsSummary(true);
        if (!summary) {
            console.error('[Scheduler] Gagal mengambil ringkasan Google Sheets untuk laporan.');
            return;
        }

        const cleanBoss = config.boss_number.replace(/\D/g, '') + '@c.us';
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' };
        const todayStr = new Date().toLocaleDateString('id-ID', options);

        let reportMsg = `💼 *LAPORAN HARIAN ASISTEN PRIBADI* 📊\n`;
        reportMsg += `📅 *Hari/Tanggal*: ${todayStr}\n\n`;
        
        reportMsg += `💰 *Ringkasan Keuangan*:\n`;
        reportMsg += `- *Saldo Kas*: Rp ${summary.saldoKas.toLocaleString('id-ID')}\n`;
        reportMsg += `- *Total Pemasukan*: Rp ${summary.totalPemasukan.toLocaleString('id-ID')}\n`;
        reportMsg += `- *Total Pengeluaran*: Rp ${summary.totalPengeluaran.toLocaleString('id-ID')}\n\n`;

        reportMsg += `📅 *5 Agenda Terdekat*:\n`;
        if (summary.agendaList && summary.agendaList.length > 0) {
            const topAgendas = summary.agendaList.slice(0, 5);
            topAgendas.forEach((agenda, idx) => {
                reportMsg += `${idx + 1}. *${agenda.waktu}*: ${agenda.acara}\n`;
            });
        } else {
            reportMsg += `_(Belum ada agenda terdaftar)_\n`;
        }

        reportMsg += `\nSemoga hari ini berjalan lancar dan penuh keberhasilan, Bos! 🚀`;

        console.log(`[Scheduler] Mengirim laporan harian ke nomor Bos: ${cleanBoss}`);
        await client.sendMessage(cleanBoss, reportMsg);

        io.emit('message_log', {
            chatId: cleanBoss,
            body: `[Laporan Terjadwal Harian] Dikirim otomatis`,
            type: 'outgoing',
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('[Scheduler] Gagal mengirim laporan harian:', err.message);
    }
}

function startReminderScheduler(clientOrGetClient, io, getStatus) {
    console.log('[Scheduler] Memulai scheduler pengingat otomatis...');
    setInterval(async () => {
        if (getStatus() !== 'CONNECTED') return;

        try {
            const client = resolveClient(clientOrGetClient);
            if (!client) return;
            
            const now = new Date();
            const activeReminders = await getReminders();

            for (let reminder of activeReminders) {
                const reminderTime = new Date(reminder.time);
                if (now.getTime() >= reminderTime.getTime()) {
                    console.log(`[Reminder] Mengirim pengingat: "${reminder.message}"...`);
                    try {
                        let targetChatId = reminder.phone;
                        if (!targetChatId || targetChatId.trim() === '' || targetChatId === '@c.us') {
                            if (config.boss_number && config.boss_number.trim() !== '') {
                                targetChatId = config.boss_number.replace(/\D/g, '') + '@c.us';
                            }
                        }

                        if (!targetChatId || targetChatId === '@c.us') {
                            throw new Error('Nomor tujuan pengingat tidak valid atau kosong.');
                        }

                        const reminderMsg = `🔔 *PENGINGAT ASISTEN PRIBADI* 🔔\n\nHalo Bos! Saya di sini untuk mengingatkan Bos:\n👉 *${reminder.message}*`;
                        
                        await client.sendMessage(targetChatId, reminderMsg);
                        await deactivateReminder(reminder.id);

                        io.emit('message_log', {
                            chatId: targetChatId,
                            body: `🔔 [Pengingat Terkirim] ${reminder.message}`,
                            type: 'outgoing',
                            timestamp: Date.now()
                        });
                    } catch (err) {
                        console.error('[Reminder] Gagal mengirim pengingat:', err.message);
                    }
                }
            }
        } catch (e) {
            console.error('[Reminder Scheduler] Error:', e.message);
        }
    }, 30000);
}

async function checkGroupSchedules(clientOrGetClient, getStatus) {
    try {
        if (getStatus() !== 'CONNECTED') return;
        const client = resolveClient(clientOrGetClient);
        if (!client) return;

        const now = new Date();
        const timeParts = now.toLocaleTimeString('en-US', {
            timeZone: 'Asia/Jakarta',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        }).split(':');
        
        if (timeParts.length < 2) return;
        const timeStr = `${timeParts[0].padStart(2, '0')}:${timeParts[1].padStart(2, '0')}`;

        const weekdayStr = now.toLocaleDateString('en-US', {
            timeZone: 'Asia/Jakarta',
            weekday: 'long'
        });

        const dayMap = {
            'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7
        };
        const currentDayVal = dayMap[weekdayStr] || now.getDay();

        const { group_configs: gConfigs } = await getGroupConfigs();
        const groupIds = Object.keys(gConfigs);
        
        for (const groupId of groupIds) {
            const cfg = gConfigs[groupId];
            if (!cfg || !cfg.enabled || !cfg.autoCloseSchedule || !cfg.autoCloseSchedule.enabled) {
                continue;
            }

            const schedule = cfg.autoCloseSchedule;
            const openTime = schedule.openTime;
            const closeTime = schedule.closeTime;
            const activeDays = schedule.activeDays || [];

            let shouldBeOpen = true;
            
            if (activeDays.length > 0 && !activeDays.includes(currentDayVal)) {
                shouldBeOpen = false;
            } else {
                if (openTime && closeTime) {
                    if (timeStr < openTime || timeStr >= closeTime) {
                        shouldBeOpen = false;
                    }
                }
            }

            const prevState = groupOpenStates.get(groupId);

            if (prevState !== shouldBeOpen) {
                groupOpenStates.set(groupId, shouldBeOpen);
                
                if (prevState !== undefined) {
                    try {
                        const chat = await client.getChatById(groupId);
                        await chat.setMessagesAdminsOnly(!shouldBeOpen);
                        
                        const msgText = shouldBeOpen 
                            ? "🔔 *Pemberitahuan Otomatis:* Jam operasional toko telah dimulai. Grup dibuka kembali untuk umum. Silakan ajukan pesanan Anda!"
                            : "🔔 *Pemberitahuan Otomatis:* Jam operasional toko telah berakhir. Grup ditutup sementara. Hanya Admin yang dapat mengirim pesan.";
                        
                        await client.sendMessage(groupId, msgText);
                        console.log(`[Scheduler] Status Grup ${cfg.group_name || groupId} diubah ke ${shouldBeOpen ? 'BUKA' : 'TUTUP'}.`);
                    } catch (err) {
                        console.error(`[Scheduler] Gagal mengubah setelan grup ${groupId}:`, err.message);
                    }
                } else {
                    console.log(`[Scheduler] Sinkronisasi awal status Grup ${cfg.group_name || groupId}: ${shouldBeOpen ? 'BUKA' : 'TUTUP'}.`);
                }
            }
        }
    } catch (err) {
        console.error('[Scheduler Error] Gagal memeriksa jadwal grup:', err.message);
    }
}

function startGroupScheduleScheduler(client, getStatus) {
    console.log('[Scheduler] Memulai scheduler otomatisasi buka/tutup grup...');
    setTimeout(() => checkGroupSchedules(client, getStatus), 5000);
    setInterval(() => checkGroupSchedules(client, getStatus), 60000);
}

function startDailyReportScheduler(client, io, getStatus) {
    console.log('[Scheduler] Memulai scheduler laporan harian otomatis...');
    setInterval(async () => {
        if (getStatus() !== 'CONNECTED') return;

        const now = new Date();
        const parts = now.toLocaleTimeString('en-US', {
            timeZone: 'Asia/Jakarta',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        }).split(':');
        
        if (parts.length < 2) return;
        const hh = parts[0].padStart(2, '0');
        const mm = parts[1].padStart(2, '0');
        const timeStr = `${hh}:${mm}`;

        const dateStr = now.toLocaleDateString('en-US', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        const targetTime = config.report_time || '08:00';

        if (timeStr === targetTime && lastSentReportDate !== dateStr) {
            console.log(`[Scheduler] Waktu cocok (${timeStr}), mengirim laporan harian...`);
            lastSentReportDate = dateStr;
            await sendDailyReport(client, io);
            await checkPremiumExpirations(client, io);
        }

        // Auto-Backup Mingguan otomatis (Setiap Hari Minggu Pukul 01:00)
        const isSunday = now.getDay() === 0;
        const targetBackupTime = '01:00';
        if (isSunday && timeStr === targetBackupTime && lastSentBackupDate !== dateStr) {
            lastSentBackupDate = dateStr;
            await runWeeklyBackup(client, io);
        }
    }, 30000);
}

async function runWeeklyBackup(clientOrGetClient, io) {
    try {
        const client = resolveClient(clientOrGetClient);
        if (!client) return;
        
        console.log('[Backup Scheduler] Memulai pembuatan backup mingguan otomatis...');
        
        const now = new Date();
        const timestamp = now.toISOString().split('T')[0];
        const zipFilename = `backup-jajan-digital-${timestamp}.zip`;
        const tempZipPath = path.join(os.tmpdir(), zipFilename);
        
        const output = fs.createWriteStream(tempZipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        const archivePromise = new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
        });
        
        archive.pipe(output);
        
        if (fs.existsSync('./config.json')) {
            archive.file('./config.json', { name: 'config.json' });
        }
        
        if (fs.existsSync('./database.sqlite')) {
            const dbTemp = path.join(os.tmpdir(), `db-${Date.now()}.sqlite`);
            fs.copyFileSync('./database.sqlite', dbTemp);
            archive.file(dbTemp, { name: 'database.sqlite' });
            output.on('close', () => { try { fs.unlinkSync(dbTemp); } catch(_) {} });
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
        
        await archive.finalize();
        await archivePromise;
        
        console.log('[Backup Scheduler] Backup ZIP berhasil dibuat di:', tempZipPath);
        
        if (client && config.boss_number && config.boss_number.trim() !== '') {
            const cleanBoss = config.boss_number.replace(/\D/g, '') + '@c.us';
            const fileData = fs.readFileSync(tempZipPath);
            const base64Data = fileData.toString('base64');
            const mediaObj = new MessageMedia('application/zip', base64Data, zipFilename);
            
            await client.sendMessage(cleanBoss, mediaObj, {
                caption: `💾 *BACKUP MINGGUAN OTOMATIS* 💾\n\nHalo Bos! Berikut adalah berkas cadangan database, konfigurasi, presets, dan media toko untuk minggu ini.\n\nSimpan berkas ZIP ini di tempat aman.`
            });
            console.log(`[Backup Scheduler] Backup dikirim ke Bos via WA.`);
            
            if (io) {
                io.emit('message_log', {
                    chatId: cleanBoss,
                    body: `[Auto-Backup Mingguan] Berkas ZIP dikirim`,
                    type: 'outgoing',
                    timestamp: Date.now()
                });
            }
        }
        
        const backupDir = './backups';
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir);
        }
        fs.copyFileSync(tempZipPath, path.join(backupDir, zipFilename));
        
        try { fs.unlinkSync(tempZipPath); } catch(_) {}
        
        const files = fs.readdirSync(backupDir);
        const nowMs = Date.now();
        files.forEach(file => {
            const filePath = path.join(backupDir, file);
            const stats = fs.statSync(filePath);
            const diffDays = (nowMs - stats.mtimeMs) / (1000 * 60 * 60 * 24);
            if (diffDays > 30) {
                try { fs.unlinkSync(filePath); console.log(`[Backup Cleanup] Menghapus backup lama: ${file}`); } catch(_) {}
            }
        });
        
    } catch (err) {
        console.error('[Backup Scheduler] Gagal membuat/mengirim backup:', err.message);
    }
}

module.exports = {
    startDailyReportScheduler,
    startReminderScheduler,
    startGroupScheduleScheduler,
    checkPremiumExpirations,
    sendDailyReport,
    runWeeklyBackup
};
