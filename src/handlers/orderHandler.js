// src/handlers/orderHandler.js
'use strict';
const { getDb } = require('../db/sqlite');

async function handleOrderMessage(msg, {
    senderId, chatId, userMessage, textLower, isGroup, clientInstance, ioInstance
}) {
    // AUTO-ORDER DETECTOR
    const isOrderMsg = textLower.startsWith('pesan:') || 
                       textLower.startsWith('pesan ') || 
                       textLower.startsWith('beli:') || 
                       textLower.startsWith('beli ');
                       
    if (!isOrderMsg) return false;

    let details = '';
    if (textLower.startsWith('pesan:')) details = userMessage.substring(6).trim();
    else if (textLower.startsWith('pesan ')) details = userMessage.substring(6).trim();
    else if (textLower.startsWith('beli:')) details = userMessage.substring(5).trim();
    else if (textLower.startsWith('beli ')) details = userMessage.substring(5).trim();
    
    if (details.length > 0) {
        let contactName = '';
        try {
            const contact = await msg.getContact();
            contactName = contact.pushname || contact.name || '';
        } catch (e) {}
        
        let groupName = '';
        if (isGroup) {
            try {
                const chat = await clientInstance.getChatById(chatId);
                groupName = chat.name || '';
            } catch(e) {}
        }
        
        const customerNumber = senderId.split('@')[0];
        let displayName = contactName || customerNumber;
        if (groupName) {
            displayName += ` (${groupName})`;
        }
        
        const db = getDb();
        if (db) {
            try {
                await db.run(
                    'INSERT INTO orders (customer_number, customer_name, details, status) VALUES (?, ?, ?, ?)',
                    customerNumber,
                    displayName,
                    details,
                    'PENDING'
                );
                
                const orderResult = await db.get('SELECT last_insert_rowid() as id');
                const orderId = orderResult ? orderResult.id : Date.now();
                
                if (ioInstance) {
                    ioInstance.emit('order_created', {
                        id: orderId,
                        customer_number: customerNumber,
                        customer_name: displayName,
                        details: details,
                        status: 'PENDING',
                        created_at: new Date().toISOString()
                    });
                }
                
                try {
                    const chat = await msg.getChat();
                    try { await chat.sendStateTyping(); } catch(_) {}
                    await new Promise(r => setTimeout(r, 2000));
                } catch(_) {}

                await msg.reply(`✅ *Pesanan Anda Telah Dicatat!*\n\n` +
                                `📦 *Detail:* ${details}\n` +
                                `👤 *Nama:* ${contactName || customerNumber}\n\n` +
                                `Terima kasih! Admin kami akan segera menghubungi Bos untuk konfirmasi pembayaran.`);
                return true;
            } catch (err) {
                console.error('Gagal mencatat order ke SQLite:', err.message);
            }
        }
    }
    return false;
}

module.exports = { handleOrderMessage };
