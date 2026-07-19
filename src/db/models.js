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
    await db.run('INSERT OR REPLACE INTO shop_admins (phone, name) VALUES (?, ?)', phone, name || '');
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

module.exports = {
    getGroupConfigs,
    saveGroupConfig,
    deleteGroupConfig,
    getChatSession,
    saveChatSession,
    clearChatSession,
    getShopData,
    addAdmin,
    removeAdmin,
    addCustomer,
    removeCustomer,
    touchCustomer,
    setCustomerMuteAi,
    getLogHistory,
    saveLogHistory,
    getReminders,
    addReminder,
    deactivateReminder
};
