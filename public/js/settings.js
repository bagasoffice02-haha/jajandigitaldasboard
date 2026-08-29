// public/js/settings.js
// Modul Pengaturan Bot (WhatsApp, Telegram, System Prompt & Parameter Global)
'use strict';

let cachedTgToken = '';

// Socket.io: Terima update status Bot Telegram dari server secara real-time
if (typeof socket !== 'undefined') {
    socket.on('telegram_status', (data) => {
        updateTelegramStatusUI(data.status, data.message);
    });
}

function updateTelegramStatusUI(status, message) {
    const dot  = document.getElementById('tg-status-dot');
    const text = document.getElementById('tg-status-text');
    if (!dot || !text) return;

    const map = {
        CONNECTED:    { color: '#10b981', label: '● Terhubung & Aktif' },
        DISCONNECTED: { color: '#ef4444', label: '● Terputus' },
        DISABLED:     { color: '#6b7280', label: '○ Bot Telegram Nonaktif' },
        ERROR:        { color: '#f59e0b', label: '⚠ Error: ' + (message || 'Periksa token') }
    };
    const s = map[status] || { color: '#6b7280', label: '○ ' + (status || 'Tidak Diketahui') };
    dot.style.background = s.color;
    text.textContent = s.label;
    text.style.color = s.color;
}

window.loadTelegramConfig = async function() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) return;
        const cfg = await res.json();

        const el = (id) => document.getElementById(id);

        if (cfg.telegram_bot_token) cachedTgToken = cfg.telegram_bot_token;

        if (el('tg-enabled-toggle'))      el('tg-enabled-toggle').checked    = cfg.telegram_bot_enabled === true;
        if (el('tg-bot-token'))           el('tg-bot-token').value           = cfg.telegram_bot_token || '';
        if (el('tg-boss-id'))             el('tg-boss-id').value             = cfg.telegram_boss_id || '';
        if (el('tg-private-enabled'))     el('tg-private-enabled').checked   = cfg.telegram_private_bot_enabled !== false;

        const tgCfg = cfg.telegram_config || {};
        if (el('tg-rate-limit'))          el('tg-rate-limit').value          = tgCfg.rate_limit_per_minute ?? 5;
        if (el('tg-ai-cooldown'))         el('tg-ai-cooldown').value         = tgCfg.ai_cooldown_seconds ?? 10;
        if (el('tg-whitelist-mode'))      el('tg-whitelist-mode').checked    = tgCfg.whitelist_mode === true;
        if (el('tg-whitelist'))           el('tg-whitelist').value           = (tgCfg.whitelist || []).join(',');
        if (el('tg-blacklist'))           el('tg-blacklist').value           = (tgCfg.blacklist || []).join(',');
        if (el('tg-auto-delete-welcome')) el('tg-auto-delete-welcome').value = tgCfg.auto_delete_welcome_seconds ?? 0;
        if (el('tg-auto-delete-schedule'))el('tg-auto-delete-schedule').value= tgCfg.auto_delete_schedule_seconds ?? 0;

        try {
            const statusRes = await fetch('/api/telegram/status');
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                updateTelegramStatusUI(statusData.status, statusData.error);
            } else {
                updateTelegramStatusUI(cfg.telegram_bot_enabled ? 'DISCONNECTED' : 'DISABLED');
            }
        } catch (_) {
            updateTelegramStatusUI(cfg.telegram_bot_enabled ? 'DISCONNECTED' : 'DISABLED');
        }
    } catch (err) {
        console.error('[TG Config] Gagal memuat konfigurasi Telegram:', err.message);
        updateTelegramStatusUI('ERROR', err.message);
    }
};

window.saveTelegramConfig = async function() {
    const el = (id) => document.getElementById(id);
    const btn = el('btn-save-tg-config');
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;"></span> Menyimpan...`;

    const parseIdList = (str) =>
        (str || '').split(',').map(s => s.trim()).filter(s => s.length > 0);

    let inputToken = el('tg-bot-token') ? el('tg-bot-token').value.trim() : '';
    if (!inputToken || /^\.+$/.test(inputToken)) {
        inputToken = cachedTgToken;
    }

    const payload = {
        telegram_bot_token:        inputToken,
        telegram_bot_enabled:      el('tg-enabled-toggle') ? el('tg-enabled-toggle').checked : false,
        telegram_boss_id:          el('tg-boss-id')        ? el('tg-boss-id').value.trim()   : '',
        telegram_private_bot_enabled: el('tg-private-enabled') ? el('tg-private-enabled').checked : true,
        private_chat_sync_group_id: el('cfg-private-chat-sync-group-id') ? el('cfg-private-chat-sync-group-id').value : '',
        telegram_config: {
            rate_limit_per_minute:         parseInt(el('tg-rate-limit')?.value || '5', 10),
            ai_cooldown_seconds:           parseInt(el('tg-ai-cooldown')?.value || '10', 10),
            whitelist_mode:                el('tg-whitelist-mode')?.checked || false,
            whitelist:                     parseIdList(el('tg-whitelist')?.value),
            blacklist:                     parseIdList(el('tg-blacklist')?.value),
            auto_delete_welcome_seconds:   parseInt(el('tg-auto-delete-welcome')?.value || '0', 10),
            auto_delete_schedule_seconds:  parseInt(el('tg-auto-delete-schedule')?.value || '0', 10)
        }
    };

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        if (inputToken) cachedTgToken = inputToken;

        btn.innerHTML = `<i data-lucide="check" style="width:15px;height:15px;"></i> Tersimpan!`;
        btn.style.background = '#10b981';

        if (window.lucide) lucide.createIcons();
        if (window.showToast) window.showToast('Pengaturan Telegram berhasil disimpan!', 'success');

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = '';
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }, 2000);

        setTimeout(async () => {
            try {
                const sRes = await fetch('/api/telegram/status');
                if (sRes.ok) {
                    const sData = await sRes.json();
                    updateTelegramStatusUI(sData.status);
                }
            } catch (_) {}
        }, 1000);

    } catch (err) {
        if (window.showToast) window.showToast('Gagal menyimpan: ' + err.message, 'error');
        else alert('Gagal menyimpan pengaturan Telegram: ' + err.message);
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
};

window.testTelegramConnection = async function() {
    let token = document.getElementById('tg-bot-token')?.value.trim();
    if (!token || /^\.+$/.test(token)) {
        token = cachedTgToken;
    }

    if (!token) {
        alert('Isi token bot terlebih dahulu dari @BotFather!');
        return;
    }

    updateTelegramStatusUI('DISCONNECTED', 'Menguji koneksi...');
    const dot  = document.getElementById('tg-status-dot');
    const text = document.getElementById('tg-status-text');
    if (dot)  dot.style.background = '#f59e0b';
    if (text) { text.textContent = '⟳ Menguji koneksi ke Telegram...'; text.style.color = '#f59e0b'; }

    try {
        const res = await fetch('/api/telegram/test-connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        const data = await res.json();
        if (data.success) {
            cachedTgToken = token;
            if (document.getElementById('tg-bot-token')) document.getElementById('tg-bot-token').value = token;
            updateTelegramStatusUI('CONNECTED');
            alert(`✅ Koneksi berhasil!\n\nBot: @${data.username}\nNama: ${data.first_name}\n\nToken valid! Jangan lupa klik "Simpan Pengaturan Telegram".`);
        } else {
            updateTelegramStatusUI('ERROR', data.error || 'Token tidak valid');
            alert('❌ Koneksi gagal: ' + (data.error || 'Token tidak valid atau kadaluarsa.'));
        }
    } catch (err) {
        updateTelegramStatusUI('ERROR', err.message);
        alert('❌ Gagal menguji koneksi: ' + err.message);
    }
};

window.toggleTgTokenVisibility = function() {
    const input = document.getElementById('tg-bot-token');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
};
