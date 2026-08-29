// public/js/core.js
// Inisialisasi Socket.io, Notifikasi Toast, Navigasi Tab, Tema & Modal Global
'use strict';

const socket = io();
window.socket = socket;

window.showToast = function(typeOrMsg, msg, duration = 3500) {
    let type = 'info';
    let message = typeOrMsg;
    if (msg) {
        type = typeOrMsg;
        message = msg;
    }
    if (!message) return;

    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    
    let iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    let defaultTitle = 'Informasi';

    if (type === 'success') {
        iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
        defaultTitle = 'Berhasil';
    } else if (type === 'error') {
        iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        defaultTitle = 'Gagal';
    } else if (type === 'warning') {
        iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        defaultTitle = 'Perhatian';
    }

    toast.innerHTML = `
        <div class="toast-icon">${iconSvg}</div>
        <div class="toast-content">
            <span class="toast-title">${defaultTitle}</span>
            <span class="toast-message">${message}</span>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 350);
    }, duration);
};

window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.ios-tab-btn, .hdr-tab-btn, .sidebar-nav-btn').forEach(el => el.classList.remove('active'));
    
    const selectedTab = document.getElementById(`tab-${tabId}`);
    if (selectedTab) selectedTab.classList.remove('hidden');
    
    let buttonId = tabId;
    if (tabId === 'features' || tabId === 'notes') {
        buttonId = 'memory';
    }
    const selectedBtn = document.getElementById(`btn-tab-${buttonId}`);
    if (selectedBtn) selectedBtn.classList.add('active');

    const selectedHdrBtn = document.getElementById(`hdr-btn-tab-${buttonId}`);
    if (selectedHdrBtn) selectedHdrBtn.classList.add('active');

    const mobBtn = document.getElementById(`mob-tab-${buttonId}`);
    if (mobBtn) mobBtn.classList.add('active');
    
    // Auto-fetch data per tab
    if (tabId === 'groups' || tabId === 'broadcast') {
        if (window.loadGroupsList) window.loadGroupsList();
    } else if (tabId === 'shop') {
        if (window.loadHostAdmins) window.loadHostAdmins();
        if (window.loadCustomersList) window.loadCustomersList();
        if (window.loadGroupsList) window.loadGroupsList();
    } else if (tabId === 'transactions') {
        if (window.loadOrders) window.loadOrders();
        if (window.loadInvoices) window.loadInvoices();
    } else if (tabId === 'premium') {
        if (window.loadPremiumData) window.loadPremiumData();
    } else if (tabId === 'notes') {
        if (window.loadLocalNotes) window.loadLocalNotes();
    } else if (tabId === 'settings') {
        setTimeout(() => { 
            if (window.loadTelegramConfig) window.loadTelegramConfig(); 
            if (window.checkAllApiStatus) window.checkAllApiStatus();
        }, 150);
    } else if (tabId === 'referral') {
        if (window.loadReferralDashboardData) window.loadReferralDashboardData();
    } else if (tabId === 'apikeys') {
        if (window.loadApiKeys) window.loadApiKeys();
    } else if (tabId === 'memory') {
        if (window.loadFiles) window.loadFiles();
    }

    if (window.lucide) lucide.createIcons();
};

window.switchSubTab = function(parentTab, subTab) {
    if (parentTab === 'transactions') {
        const ordersPanel = document.getElementById('panel-orders-container');
        const invoicesPanel = document.getElementById('panel-invoices-container');
        const ordersBtn = document.getElementById('sub-tab-orders-btn');
        const invoicesBtn = document.getElementById('sub-tab-invoices-btn');
        
        if (subTab === 'orders') {
            if (ordersPanel) ordersPanel.style.display = 'flex';
            if (invoicesPanel) invoicesPanel.style.display = 'none';
            if (ordersBtn) ordersBtn.classList.add('active');
            if (invoicesBtn) invoicesBtn.classList.remove('active');
        } else {
            if (ordersPanel) ordersPanel.style.display = 'none';
            if (invoicesPanel) invoicesPanel.style.display = 'flex';
            if (ordersBtn) ordersBtn.classList.remove('active');
            if (invoicesBtn) invoicesBtn.classList.add('active');
        }
    } else if (parentTab === 'premium') {
        const stockPanel = document.getElementById('panel-premium-stock-container');
        const salesPanel = document.getElementById('panel-premium-sales-container');
        const stockBtn = document.getElementById('sub-tab-premium-stock-btn');
        const salesBtn = document.getElementById('sub-tab-premium-sales-btn');
        
        if (subTab === 'stock') {
            if (stockPanel) stockPanel.style.display = 'flex';
            if (salesPanel) salesPanel.style.display = 'none';
            if (stockBtn) stockBtn.classList.add('active');
            if (salesBtn) salesBtn.classList.remove('active');
        } else {
            if (stockPanel) stockPanel.style.display = 'none';
            if (salesPanel) salesPanel.style.display = 'flex';
            if (stockBtn) stockBtn.classList.remove('active');
            if (salesBtn) salesBtn.classList.add('active');
        }
    }
    if (window.lucide) lucide.createIcons();
};

window.switchTabWithSub = function(tabId, subTabId) {
    window.switchTab(tabId);
    if (subTabId) {
        if (tabId === 'transactions') window.switchSubTab('transactions', subTabId);
        else if (tabId === 'premium') window.switchSubTab('premium', subTabId);
    }
    document.querySelectorAll('.combined-sub-btn').forEach(btn => {
        const tTab = btn.getAttribute('data-tab');
        const tSub = btn.getAttribute('data-sub');
        if (tTab === tabId && (!tSub || tSub === subTabId)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
};

window.switchNodeEditorTab = function(tabName) {
    document.querySelectorAll('.node-tab-btn').forEach(btn => btn.classList.remove('active'));
    const btnMap = { 'message': 0, 'media': 1, 'status': 2 };
    const btns = document.querySelectorAll('.node-tab-btn');
    if (btns && btns[btnMap[tabName]]) btns[btnMap[tabName]].classList.add('active');
    document.querySelectorAll('.node-editor-section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`node-sec-${tabName}`)?.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
};

window.switchGlobalSettingsTab = function(tabName) {
    document.querySelectorAll('.global-tab-btn').forEach(btn => btn.classList.remove('active'));
    const btnMap = { 'ai': 0, 'features': 1, 'prompt': 2 };
    const btns = document.querySelectorAll('.global-tab-btn');
    if (btns && btns[btnMap[tabName]]) btns[btnMap[tabName]].classList.add('active');
    document.querySelectorAll('.global-settings-section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`global-sec-${tabName}`)?.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
};

window.changeTheme = function(theme) {
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
    const card = document.getElementById('tc-' + theme);
    if (card) card.classList.add('active');

    document.documentElement.className = '';
    if (theme !== 'light' && theme !== 'ios-dark') {
        const mapped = (theme === 'ios-light') ? 'minimal-light' : theme;
        document.documentElement.classList.add('theme-' + mapped);
    }
    localStorage.setItem('dashboard-theme', theme);
    const sel = document.getElementById('cfg-theme-selector');
    if (sel) sel.value = theme;
};

window.logoutAdmin = function() {
    if (confirm('Apakah Anda yakin ingin keluar dari dasbor admin?')) {
        fetch('/api/logout', { method: 'POST' }).finally(() => {
            window.location.href = '/login';
        });
    }
};

window.refreshQRCode = function(force = false) {
    if (window.socket) {
        window.socket.emit('request_qr', { force });
        if (window.showToast) window.showToast('info', 'Meminta QR Code WhatsApp...');
    }
};

// Initial sync on load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('dashboard-theme') || 'light';
    window.changeTheme(savedTheme);
    if (window.lucide) lucide.createIcons();
});
