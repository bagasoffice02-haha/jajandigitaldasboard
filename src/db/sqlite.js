const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

const SQLITE_DB_FILE = path.join(__dirname, '../../database.sqlite');
const DATABASE_FILE = path.join(__dirname, '../../database.json');

let db = null;

async function initDatabase() {
    try {
        db = await open({
            filename: SQLITE_DB_FILE,
            driver: sqlite3.Database
        });

        // Enable foreign keys
        await db.run('PRAGMA foreign_keys = ON');
        
        await db.exec(`
            CREATE TABLE IF NOT EXISTS key_value_store (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_number TEXT,
                customer_name TEXT,
                details TEXT,
                status TEXT DEFAULT 'PENDING',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS invoices (
                id TEXT PRIMARY KEY,
                customer_number TEXT,
                customer_name TEXT,
                status TEXT,
                details TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS premium_products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS premium_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                email TEXT NOT NULL,
                password TEXT NOT NULL,
                max_users INTEGER DEFAULT 1,
                status TEXT DEFAULT 'Tersedia',
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(product_id) REFERENCES premium_products(id) ON DELETE SET NULL
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS premium_sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER,
                buyer_name TEXT NOT NULL,
                buyer_phone TEXT NOT NULL,
                price INTEGER DEFAULT 0,
                payment_status TEXT DEFAULT 'Belum Bayar',
                profile_name TEXT,
                start_date TEXT,
                end_date TEXT,
                auto_remind INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(account_id) REFERENCES premium_accounts(id) ON DELETE SET NULL
            )
        `);

        // Relational tables for settings and metadata
        await db.exec(`
            CREATE TABLE IF NOT EXISTS group_configs (
                group_id TEXT PRIMARY KEY,
                group_name TEXT,
                bot_active INTEGER DEFAULT 1,
                welcome_message TEXT,
                custom_rules TEXT,
                settings TEXT
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS chat_sessions (
                session_id TEXT PRIMARY KEY,
                messages TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS shop_admins (
                phone TEXT PRIMARY KEY,
                name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS shop_customers (
                phone TEXT PRIMARY KEY,
                name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check and add updated_at and mute_ai columns to shop_customers if they don't exist
        try {
            const tableInfo = await db.all("PRAGMA table_info(shop_customers)");
            const columns = tableInfo.map(c => c.name);
            if (!columns.includes('updated_at')) {
                await db.exec("ALTER TABLE shop_customers ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP");
                console.log('[DB] Added updated_at column to shop_customers');
            }
            if (!columns.includes('mute_ai')) {
                await db.exec("ALTER TABLE shop_customers ADD COLUMN mute_ai INTEGER DEFAULT 0");
                console.log('[DB] Added mute_ai column to shop_customers');
            }
            if (!columns.includes('notes')) {
                await db.exec("ALTER TABLE shop_customers ADD COLUMN notes TEXT");
                console.log('[DB] Added notes column to shop_customers');
            }
            if (!columns.includes('labels')) {
                await db.exec("ALTER TABLE shop_customers ADD COLUMN labels TEXT");
                console.log('[DB] Added labels column to shop_customers');
            }
            if (!columns.includes('order_count')) {
                await db.exec("ALTER TABLE shop_customers ADD COLUMN order_count INTEGER DEFAULT 0");
                console.log('[DB] Added order_count column to shop_customers');
            }
        } catch (colErr) {
            console.error('[DB Column Migration Error]:', colErr.message);
        }

        await db.exec(`
            CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT,
                message TEXT,
                time TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 1. Migrate from database.json if it exists (first time migration)
        if (fs.existsSync(DATABASE_FILE)) {
            try {
                console.log('[DB] database.json ditemukan. Memigrasikan data ke key_value_store...');
                const raw = fs.readFileSync(DATABASE_FILE, 'utf-8');
                const legacyData = JSON.parse(raw);

                // Save log_history to key_value_store
                await db.run('INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)', 'log_history', JSON.stringify(legacyData.log_history || { finance: [], agenda: [] }));

                // Save other legacy fields to key_value_store temporarily
                await db.run('INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)', 'group_configs', JSON.stringify(legacyData.group_configs || { group_configs: {} }));
                await db.run('INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)', 'chat_sessions', JSON.stringify(legacyData.chat_sessions || {}));
                await db.run('INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)', 'shop_data', JSON.stringify(legacyData.shop_data || { host_admins: [], customers: [] }));
                await db.run('INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)', 'reminders', JSON.stringify(legacyData.reminders || []));

                fs.renameSync(DATABASE_FILE, DATABASE_FILE + '.bak');
                console.log('[DB] database.json berhasil diimpor ke key_value_store.');
            } catch (e) {
                console.error('[DB] Gagal memigrasikan database.json:', e.message);
            }
        }

        // 2. Perform table-specific migrations from key_value_store if the tables are empty
        
        // A. Migrate group_configs
        const gcCheck = await db.get('SELECT COUNT(*) as count FROM group_configs');
        if (gcCheck.count === 0) {
            const kvGc = await db.get("SELECT value FROM key_value_store WHERE key = 'group_configs'");
            if (kvGc && kvGc.value) {
                try {
                    const parsed = JSON.parse(kvGc.value);
                    const gc = parsed.group_configs || {};
                    for (const gid of Object.keys(gc)) {
                        const conf = gc[gid] || {};
                        await db.run('INSERT OR REPLACE INTO group_configs (group_id, group_name, bot_active, welcome_message, custom_rules, settings) VALUES (?, ?, ?, ?, ?, ?)',
                            gid, conf.group_name || '', conf.bot_active !== false ? 1 : 0, conf.welcome_message || '', JSON.stringify(conf.custom_rules || []), JSON.stringify(conf)
                        );
                    }
                    console.log(`[DB Migration] Berhasil memigrasikan ${Object.keys(gc).length} group configs dari key_value_store.`);
                } catch(e) {
                    console.error('[DB Migration] Gagal migrasi group_configs:', e.message);
                }
            }
        }

        // B. Migrate chat_sessions
        const csCheck = await db.get('SELECT COUNT(*) as count FROM chat_sessions');
        if (csCheck.count === 0) {
            const kvCs = await db.get("SELECT value FROM key_value_store WHERE key = 'chat_sessions'");
            if (kvCs && kvCs.value) {
                try {
                    const cs = JSON.parse(kvCs.value) || {};
                    let count = 0;
                    for (const sid of Object.keys(cs)) {
                        await db.run('INSERT OR REPLACE INTO chat_sessions (session_id, messages) VALUES (?, ?)', sid, JSON.stringify(cs[sid] || []));
                        count++;
                    }
                    console.log(`[DB Migration] Berhasil memigrasikan ${count} chat_sessions dari key_value_store.`);
                } catch(e) {
                    console.error('[DB Migration] Gagal migrasi chat_sessions:', e.message);
                }
            }
        }

        // C. Migrate shop admins & customers
        const adminCheck = await db.get('SELECT COUNT(*) as count FROM shop_admins');
        const customerCheck = await db.get('SELECT COUNT(*) as count FROM shop_customers');
        if (adminCheck.count === 0 && customerCheck.count === 0) {
            const kvSd = await db.get("SELECT value FROM key_value_store WHERE key = 'shop_data'");
            if (kvSd && kvSd.value) {
                try {
                    const sd = JSON.parse(kvSd.value) || { host_admins: [], customers: [] };
                    let adminCount = 0;
                    let customerCount = 0;
                    for (const admin of sd.host_admins || []) {
                        const phone = typeof admin === 'string' ? admin : (admin ? admin.phone : '');
                        const name = typeof admin === 'string' ? 'Host Admin' : (admin ? (admin.name || 'Host Admin') : 'Host Admin');
                        if (phone) {
                            await db.run('INSERT OR REPLACE INTO shop_admins (phone, name) VALUES (?, ?)', phone, name);
                            adminCount++;
                        }
                    }
                    for (const cust of sd.customers || []) {
                        if (cust && cust.phone) {
                            await db.run('INSERT OR REPLACE INTO shop_customers (phone, name) VALUES (?, ?)', cust.phone, cust.name || '');
                            customerCount++;
                        }
                    }
                    console.log(`[DB Migration] Berhasil memigrasikan ${adminCount} admins & ${customerCount} customers dari key_value_store.`);
                } catch(e) {
                    console.error('[DB Migration] Gagal migrasi shop_data:', e.message);
                }
            }
        }

        // D. Migrate reminders
        const reminderCheck = await db.get('SELECT COUNT(*) as count FROM reminders');
        if (reminderCheck.count === 0) {
            const kvRem = await db.get("SELECT value FROM key_value_store WHERE key = 'reminders'");
            if (kvRem && kvRem.value) {
                try {
                    const reminders = JSON.parse(kvRem.value) || [];
                    for (const rem of reminders) {
                        await db.run('INSERT INTO reminders (phone, message, time, is_active) VALUES (?, ?, ?, ?)', rem.phone, rem.message, rem.time, rem.is_active !== false ? 1 : 0);
                    }
                    console.log(`[DB Migration] Berhasil memigrasikan ${reminders.length} reminders dari key_value_store.`);
                } catch(e) {
                    console.error('[DB Migration] Gagal migrasi reminders:', e.message);
                }
            }
        }

        console.log('[DB] SQLite dan seluruh tabel siap digunakan.');
        return db;
    } catch (err) {
        console.error('[DB] Gagal menginisialisasi SQLite:', err.message);
        throw err;
    }
}

function getDb() {
    return db;
}

module.exports = {
    initDatabase,
    getDb
};
