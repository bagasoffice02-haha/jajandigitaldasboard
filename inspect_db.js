const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function run() {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    const rows = await db.all('SELECT group_id, group_name, bot_active, welcome_message, settings FROM group_configs');
    console.log('=== GROUP CONFIGS IN SQLITE ===');
    console.dir(rows, { depth: null });
}

run().catch(err => console.error(err));
