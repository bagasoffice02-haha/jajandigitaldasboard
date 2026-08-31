const { getDb } = require('./sqlite');

// 1. Group Configurations Helpers
async function getGroupConfigs() {
    const db = getDb();
    const rows = await db.all('SELECT * FROM group_configs');
    const configs = {};
    rows.forEach(r => {
        let settingsObj = {};
        try { settingsObj = JSON.parse(r.settings || '{}'); } catch(e) {}
        
        // Merge structured fields into nested object for backward compatibility
        configs[r.group_id] = {
            ...settingsObj,
            groupId: r.group_id,
            groupName: r.group_name || settingsObj.groupName || '',
            enabled: r.bot_active === 1,
            welcomeMessage: r.welcome_message || settingsObj.welcomeMessage || '',
            custom_rules: JSON.parse(r.custom_rules || '[]')
        };
    });
    return { group_configs: configs };
}

async function saveGroupConfig(groupId, settings) {
    const db = getDb();
    const groupName = settings.groupName || '';
    const botActive = settings.enabled !== false ? 1 : 0;
    const welcomeMessage = settings.welcomeMessage || '';
    const customRules = JSON.stringify(settings.custom_rules || []);
    
    await db.run('INSERT OR REPLACE INTO group_configs (group_id, group_name, bot_active, welcome_message, custom_rules, settings) VALUES (?, ?, ?, ?, ?, ?)',
        groupId, groupName, botActive, welcomeMessage, customRules, JSON.stringify(settings)
    );
}

async function deleteGroupConfig(groupId) {
    const db = getDb();
    await db.run('DELETE FROM group_configs WHERE group_id = ?', groupId);
}

// 2. Chat Sessions Helpers
async function getChatSession(sessionId) {
    const db = getDb();
    const row = await db.get('SELECT messages FROM chat_sessions WHERE session_id = ?', sessionId);
    if (row) {
        try { return JSON.parse(row.messages); } catch(e) {}
    }
    return [];
}

async function saveChatSession(sessionId, messages) {
    const db = getDb();
    await db.run('INSERT OR REPLACE INTO chat_sessions (session_id, messages, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        sessionId, JSON.stringify(messages)
    );
}

async function clearChatSession(sessionId) {
    const db = getDb();
    await db.run('DELETE FROM chat_sessions WHERE session_id = ?', sessionId);
}

// 3. Shop Data Helpers (Admins & Customers CRM)
async function getShopData() {
    const db = getDb();
    const admins = await db.all('SELECT * FROM shop_admins');
    const customers = await db.all('SELECT * FROM shop_customers ORDER BY updated_at DESC, created_at DESC');
    return {
        host_admins: admins.map(a => a.phone),
        customers: customers.map(c => {
            let parsedLabels = [];
            try {
                parsedLabels = JSON.parse(c.labels || '[]');
            } catch (e) {
                parsedLabels = c.labels ? c.labels.split(',').map(s => s.trim()).filter(Boolean) : [];
            }
            return {
                phone: c.phone,
                name: c.name,
                notes: c.notes || '',
                labels: parsedLabels,
                orderCount: c.order_count || 0,
                updated_at: c.updated_at,
                mute_ai: c.mute_ai || 0
            };
        })
    };
}

async function addAdmin(phone, name) {
    const db = getDb();
    await db.run('INSERT OR REPLACE INTO shop_admins (phone, name) VALUES (?, ?)', phone, name || 'Host Admin');
}

async function updateAdmin(oldPhone, newPhone, name) {
    const db = getDb();
    if (oldPhone === newPhone) {
        await db.run('UPDATE shop_admins SET name = ? WHERE phone = ?', name || 'Host Admin', oldPhone);
    } else {
        await db.run('DELETE FROM shop_admins WHERE phone = ?', oldPhone);
        await db.run('INSERT OR REPLACE INTO shop_admins (phone, name) VALUES (?, ?)', newPhone, name || 'Host Admin');
    }
}

async function removeAdmin(phone) {
    const db = getDb();
    await db.run('DELETE FROM shop_admins WHERE phone = ?', phone);
}

async function addCustomer(phone, name, notes = '', labels = [], orderCount = 0) {
    const db = getDb();
    const labelsStr = Array.isArray(labels) ? JSON.stringify(labels) : '[]';
    
    const existing = await db.get('SELECT * FROM shop_customers WHERE phone = ?', phone);
    if (existing) {
        const updatedName = name || existing.name || '';
        const updatedNotes = notes !== undefined ? notes : (existing.notes || '');
        const updatedLabels = labels !== undefined ? labelsStr : (existing.labels || '[]');
        const updatedOrderCount = orderCount !== undefined ? orderCount : (existing.order_count || 0);
        
        await db.run(
            'UPDATE shop_customers SET name = ?, notes = ?, labels = ?, order_count = ?, updated_at = CURRENT_TIMESTAMP WHERE phone = ?',
            updatedName, updatedNotes, updatedLabels, updatedOrderCount, phone
        );
    } else {
        await db.run(
            'INSERT INTO shop_customers (phone, name, notes, labels, order_count) VALUES (?, ?, ?, ?, ?)',
            phone, name || '', notes || '', labelsStr, orderCount || 0
        );
    }
}

async function removeCustomer(phone) {
    const db = getDb();
    await db.run('DELETE FROM shop_customers WHERE phone = ?', phone);
}

async function touchCustomer(phone) {
    const db = getDb();
    await db.run('UPDATE shop_customers SET updated_at = CURRENT_TIMESTAMP WHERE phone = ?', phone);
}

async function setCustomerMuteAi(phone, muteAi) {
    const db = getDb();
    await db.run('UPDATE shop_customers SET mute_ai = ? WHERE phone = ?', muteAi ? 1 : 0, phone);
}

// 4. Log History (Finance & Agenda) Helpers
async function getLogHistory() {
    const db = getDb();
    const row = await db.get("SELECT value FROM key_value_store WHERE key = 'log_history'");
    if (row) {
        try { return JSON.parse(row.value); } catch(e) {}
    }
    return { finance: [], agenda: [] };
}

async function saveLogHistory(history) {
    const db = getDb();
    await db.run('INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)', 'log_history', JSON.stringify(history));
}

// 5. Reminders Helpers
async function getReminders() {
    const db = getDb();
    const rows = await db.all('SELECT * FROM reminders WHERE is_active = 1');
    return rows.map(r => ({
        id: r.id,
        phone: r.phone,
        message: r.message,
        time: r.time,
        is_active: r.is_active === 1
    }));
}

async function addReminder(phone, message, time) {
    const db = getDb();
    const result = await db.run('INSERT INTO reminders (phone, message, time, is_active) VALUES (?, ?, ?, 1)', phone, message, time);
    return result.lastID;
}

async function deactivateReminder(id) {
    const db = getDb();
    await db.run('UPDATE reminders SET is_active = 0 WHERE id = ?', id);
}

// ─── 6. Persistent Chat Logs & Real-Time Sync Helpers ─────────────────────────
async function saveChatLogToDb(log) {
    try {
        const db = getDb();
        if (!db) return null;
        const ts = log.timestamp || Date.now();
        const res = await db.run(
            `INSERT INTO chat_logs (chat_id, sender_id, sender_name, body, type, is_group, is_simulation, file_sent, timestamp)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            log.chatId || '',
            log.senderId || log.sender || '',
            log.senderName || '',
            log.body || '',
            log.type || 'incoming',
            log.isGroup ? 1 : 0,
            log.isSimulation ? 1 : 0,
            log.fileSent || '',
            ts
        );
        return res ? res.lastID : null;
    } catch (err) {
        console.error('[DB saveChatLogToDb Error]:', err.message);
        return null;
    }
}

async function getRecentChatLogsFromDb(limit = 100) {
    try {
        const db = getDb();
        if (!db) return [];
        const rows = await db.all(
            `SELECT id, chat_id as chatId, sender_id as senderId, sender_name as senderName,
                    body, type, is_group as isGroup, is_simulation as isSimulation,
                    file_sent as fileSent, timestamp, created_at as createdAt
             FROM chat_logs
             ORDER BY timestamp DESC
             LIMIT ?`,
            limit
        );
        return rows.reverse(); // Urutkan kronologis dari yang terlama ke terbaru
    } catch (err) {
        console.error('[DB getRecentChatLogsFromDb Error]:', err.message);
        return [];
    }
}

async function clearChatLogsFromDb() {
    try {
        const db = getDb();
        if (!db) return false;
        await db.run('DELETE FROM chat_logs');
        return true;
    } catch (err) {
        console.error('[DB clearChatLogsFromDb Error]:', err.message);
        return false;
    }
}

// ─── 7. Chat Analytics & Peak Hour Response Insights ──────────────────────────
async function getChatAnalyticsFromDb() {
    try {
        const db = getDb();
        if (!db) return {
            totalMessages: 0,
            totalSessions: 0,
            totalIncoming: 0,
            totalOutgoing: 0,
            todayCount: 0,
            peakHour: '—',
            hourlyDistribution: Array(24).fill(0),
            dailyDistribution: []
        };

        const totalRow = await db.get('SELECT COUNT(*) as count FROM chat_logs');
        const sessionRow = await db.get('SELECT COUNT(DISTINCT chat_id) as count FROM chat_logs');
        const incomingRow = await db.get("SELECT COUNT(*) as count FROM chat_logs WHERE type = 'incoming'");
        const outgoingRow = await db.get("SELECT COUNT(*) as count FROM chat_logs WHERE type = 'outgoing'");
        
        // Ambil semua timestamp untuk analisis per jam (WIB: UTC+7)
        const recentRows = await db.all('SELECT timestamp, type FROM chat_logs ORDER BY timestamp DESC LIMIT 5000');
        
        const hourlyBuckets = Array(24).fill(0);
        const hourlyIncoming = Array(24).fill(0);
        const hourlyOutgoing = Array(24).fill(0);
        
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        let todayCount = 0;

        recentRows.forEach(r => {
            const date = new Date(r.timestamp);
            // Konversi ke jam lokal (0 - 23)
            const hour = date.getHours();
            hourlyBuckets[hour]++;
            if (r.type === 'incoming') hourlyIncoming[hour]++;
            else hourlyOutgoing[hour]++;

            if (r.timestamp >= oneDayAgo) {
                todayCount++;
            }
        });

        // Cari jam tersibuk (Peak Hour)
        let maxCount = -1;
        let peakHourIndex = 12;
        hourlyBuckets.forEach((cnt, idx) => {
            if (cnt > maxCount) {
                maxCount = cnt;
                peakHourIndex = idx;
            }
        });

        const padZero = (n) => String(n).padStart(2, '0');
        const peakHourStr = maxCount > 0 
            ? `${padZero(peakHourIndex)}:00 - ${padZero((peakHourIndex + 1) % 24)}:00 WIB`
            : 'Belum Ada Data';

        // 7 Hari Terakhir
        const daysMap = new Map();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now - i * 24 * 60 * 60 * 1000);
            const dateKey = d.toISOString().slice(0, 10);
            const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' });
            daysMap.set(dateKey, { label: dayName, count: 0 });
        }

        recentRows.forEach(r => {
            const dateKey = new Date(r.timestamp).toISOString().slice(0, 10);
            if (daysMap.has(dateKey)) {
                daysMap.get(dateKey).count++;
            }
        });

        return {
            totalMessages: totalRow ? totalRow.count : 0,
            totalSessions: sessionRow ? sessionRow.count : 0,
            totalIncoming: incomingRow ? incomingRow.count : 0,
            totalOutgoing: outgoingRow ? outgoingRow.count : 0,
            todayCount,
            peakHour: peakHourStr,
            peakCount: maxCount > 0 ? maxCount : 0,
            hourlyDistribution: hourlyBuckets,
            hourlyIncoming,
            hourlyOutgoing,
            dailyDistribution: Array.from(daysMap.values())
        };
    } catch (err) {
        console.error('[DB getChatAnalyticsFromDb Error]:', err.message);
        return {
            totalMessages: 0,
            totalSessions: 0,
            totalIncoming: 0,
            totalOutgoing: 0,
            todayCount: 0,
            peakHour: '—',
            hourlyDistribution: Array(24).fill(0),
            dailyDistribution: []
        };
    }
}

// ─── 8. Persistent System & Diagnostics Logs ─────────────────────────────────
async function saveSystemLogToDb(log) {
    try {
        const db = getDb();
        if (!db) return null;
        const ts = log.timestamp || Date.now();
        const res = await db.run(
            `INSERT INTO system_activity_logs (level, tag, message, timestamp)
             VALUES (?, ?, ?, ?)`,
            log.level || 'info',
            log.tag || 'SISTEM',
            log.message || '',
            ts
        );
        return res ? res.lastID : null;
    } catch (err) {
        return null;
    }
}

async function getRecentSystemLogsFromDb(limit = 150) {
    try {
        const db = getDb();
        if (!db) return [];
        const rows = await db.all(
            `SELECT id, level, tag, message, timestamp, created_at as createdAt
             FROM system_activity_logs
             ORDER BY timestamp DESC
             LIMIT ?`,
            limit
        );
        return rows.reverse();
    } catch (err) {
        return [];
    }
}

async function clearSystemLogsFromDb() {
    try {
        const db = getDb();
        if (!db) return false;
        await db.run('DELETE FROM system_activity_logs');
        return true;
    } catch (err) {
        return false;
    }
}

module.exports = {
    getGroupConfigs,
    saveGroupConfig,
    deleteGroupConfig,
    getChatSession,
    saveChatSession,
    clearChatSession,
    getShopData,
    addAdmin,
    updateAdmin,
    removeAdmin,
    addCustomer,
    removeCustomer,
    touchCustomer,
    setCustomerMuteAi,
    getLogHistory,
    saveLogHistory,
    getReminders,
    addReminder,
    deactivateReminder,
    saveChatLogToDb,
    getRecentChatLogsFromDb,
    clearChatLogsFromDb,
    getChatAnalyticsFromDb,
    saveSystemLogToDb,
    getRecentSystemLogsFromDb,
    clearSystemLogsFromDb
};
