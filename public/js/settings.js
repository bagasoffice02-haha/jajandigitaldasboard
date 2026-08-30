// ==========================================
// BOT SETTINGS & AUTO-REPLY CONFIGURATION
// ==========================================
'use strict';

window.loadTelegramConfig = async function() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) return;
        const cfg = await res.json();

        const tokenInput = document.getElementById('cfg-tg-token');
        const adminInput = document.getElementById('cfg-tg-admin-chat-id');

        if (tokenInput && cfg.telegram_bot_token) tokenInput.value = cfg.telegram_bot_token;
        if (adminInput && cfg.telegram_boss_id) adminInput.value = cfg.telegram_boss_id;
    } catch (err) {
        console.error('Error loadTelegramConfig:', err);
    }
};

window.saveTelegramSettings = async function() {
    const tokenInput = document.getElementById('cfg-tg-token');
    const adminInput = document.getElementById('cfg-tg-admin-chat-id');

    const token = tokenInput ? tokenInput.value.trim() : '';
    const adminId = adminInput ? adminInput.value.trim() : '';

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_bot_token: token,
                telegram_boss_id: adminId,
                telegram_bot_enabled: !!token
            })
        });

        if (res.ok) {
            if (window.showToast) window.showToast('success', 'Pengaturan Telegram berhasil disimpan!');
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        if (window.showToast) window.showToast('error', 'Gagal menyimpan pengaturan Telegram: ' + err.message);
    }
};

window.loadFeaturesConfig = async function() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) return;
        const cfg = await res.json();

        const welcomeDm = document.getElementById('feat-welcome-dm');
        const offHours = document.getElementById('feat-off-hours-msg');

        if (welcomeDm && cfg.welcome_dm_message) welcomeDm.value = cfg.welcome_dm_message;
        if (offHours && cfg.off_hours_message) offHours.value = cfg.off_hours_message;
    } catch(err) {
        console.error('Error loadFeaturesConfig:', err);
    }
};

window.saveFeaturesConfig = async function() {
    const welcomeDm = document.getElementById('feat-welcome-dm');
    const offHours = document.getElementById('feat-off-hours-msg');

    const welcomeMsg = welcomeDm ? welcomeDm.value : '';
    const offHoursMsg = offHours ? offHours.value : '';

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                welcome_dm_message: welcomeMsg,
                off_hours_message: offHoursMsg
            })
        });

        if (res.ok) {
            if (window.showToast) window.showToast('success', 'Aturan pesan otomatis berhasil disimpan!');
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        if (window.showToast) window.showToast('error', 'Gagal menyimpan fitur: ' + err.message);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.loadTelegramConfig) window.loadTelegramConfig();
        if (window.loadFeaturesConfig) window.loadFeaturesConfig();
    }, 600);
});
