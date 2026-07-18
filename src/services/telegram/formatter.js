// src/services/telegram/formatter.js
// Konverter format teks WA → Telegram MarkdownV2
'use strict';

/**
 * Mengkonversi teks format WhatsApp ke format Telegram MarkdownV2
 * WA: *tebal* _miring_ ~coret~
 * Telegram: **tebal** _miring_ ~~coret~~
 */
function waToTelegramMarkdown(text) {
    if (!text) return '';

    // Escape karakter khusus MarkdownV2 Telegram terlebih dahulu
    // Kecuali karakter yang akan kita gunakan sebagai formatting
    let result = text;

    // Konversi bold: *teks* → *teks* (MarkdownV2 Telegram juga pakai *, biarkan)
    // Konversi italic: _teks_ → sudah sama
    // Konversi strikethrough: ~teks~ → ~teks~ (sudah sama di MarkdownV2)
    // Konversi monospace: ```teks``` → ```teks``` (sudah sama)

    return result;
}

/**
 * Escape teks biasa agar aman untuk dikirim dengan mode MarkdownV2 Telegram
 * Telegram MarkdownV2 memerlukan escape pada: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
function escapeTelegramMarkdown(text) {
    if (!text) return '';
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Konversi format WA ke HTML Telegram (lebih mudah di-render)
 * WA: *tebal* → <b>tebal</b>
 * WA: _miring_ → <i>miring</i>
 * WA: ~coret~ → <s>coret</s>
 * WA: ```kode``` → <code>kode</code>
 */
function waToTelegramHtml(text) {
    if (!text) return '';

    let result = text;

    // Escape HTML entities first
    result = result
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Bold: *teks* → <b>teks</b>
    result = result.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');

    // Italic: _teks_ → <i>teks</i>
    result = result.replace(/_([^_\n]+)_/g, '<i>$1</i>');

    // Strikethrough: ~teks~ → <s>teks</s>
    result = result.replace(/~([^~\n]+)~/g, '<s>$1</s>');

    // Monospace inline: `teks` → <code>teks</code>
    result = result.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Code block: ```teks``` → <pre>teks</pre>
    result = result.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');

    // Newlines
    result = result.replace(/\\n/g, '\n');

    return result;
}

/**
 * Buat Inline Keyboard dari node menu pohon untuk Telegram
 * @param {Object} menuNode - Node menu yang akan dirender
 * @param {Object} cfg - Konfigurasi grup
 * @returns {Object} - reply_markup untuk Telegram
 */
function buildMenuInlineKeyboard(menuNode, cfg) {
    if (!menuNode || !menuNode.children || menuNode.children.length === 0) {
        return null;
    }

    const sortedChildren = [...menuNode.children].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'id', { sensitivity: 'base' })
    );

    const buttons = [];
    const ROW_SIZE = 2;

    for (let i = 0; i < sortedChildren.length; i += ROW_SIZE) {
        const row = sortedChildren.slice(i, i + ROW_SIZE).map((child, idx) => {
            const num = i + idx + 1;
            const icon = child.type === 'category' ? '📂' : (child.isPromo ? '🔥' : '📦');
            return {
                text: `${num}. ${icon} ${child.name}`,
                callback_data: `menu_${child.id}`
            };
        });
        buttons.push(row);
    }

    // Tombol kembali & menu utama
    const navRow = [];
    if (menuNode.id !== 'root') {
        navRow.push({ text: '🔙 Kembali', callback_data: 'menu_back' });
    }
    navRow.push({ text: '🏠 Menu Utama', callback_data: 'menu_root' });
    buttons.push(navRow);

    return { inline_keyboard: buttons };
}

/**
 * Render teks menu dari node pohon (sama seperti renderGroupMenuMessage di WA)
 * @param {Object} menuNode - Node menu
 * @param {Object} cfg - Konfigurasi grup
 * @returns {string} - Teks menu terformat untuk Telegram
 */
function renderTelegramMenu(menuNode, cfg) {
    if (!menuNode) return 'Menu tidak tersedia.';

    const menuEmoji = cfg.menuEmoji || '🍽️';
    const shopName = cfg.groupName || 'Toko Kami';

    const sortedChildren = menuNode.children
        ? [...menuNode.children].sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', 'id', { sensitivity: 'base' })
          )
        : [];

    let text = `${menuEmoji} <b>${menuNode.id === 'root' ? `Menu Utama — ${shopName}` : menuNode.name}</b>\n`;
    text += `${'─'.repeat(30)}\n\n`;

    if (sortedChildren.length === 0) {
        text += '_Belum ada menu yang tersedia._\n';
    } else {
        sortedChildren.forEach((child, idx) => {
            const num = idx + 1;
            const icon = child.type === 'category' ? '📂' : (child.isPromo ? '🔥' : '📦');
            const statusLabel = child.status && child.status !== 'Tersedia'
                ? ` <i>[${child.status}]</i>`
                : '';
            text += `${num}. ${icon} <b>${child.name}</b>${statusLabel}\n`;
        });
    }

    text += `\n${'─'.repeat(30)}\n`;
    text += `_Ketik angka atau klik tombol di bawah untuk memilih._\n`;
    text += `_Ketik /menu untuk kembali ke Menu Utama._`;

    return text;
}

module.exports = {
    waToTelegramHtml,
    waToTelegramMarkdown,
    escapeTelegramMarkdown,
    buildMenuInlineKeyboard,
    renderTelegramMenu
};
