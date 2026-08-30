// ==========================================
// CORE SYSTEM: SOCKET, THEMES, TOASTS & DUAL NAVIGATION
// ==========================================
'use strict';

const socket = io();
window.socket = socket;

// ─── 1. TEMA GELAP & TERANG (DARK / LIGHT THEME ENGINE) ────
window.initTheme = function() {
    const savedTheme = localStorage.getItem('dashboard_theme') || 'dark';
    window.setTheme(savedTheme, false);
};

window.setTheme = function(theme, notify = true) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    localStorage.setItem('dashboard_theme', theme);

    // Update Theme Toggle Buttons
    const themeIcons = document.querySelectorAll('.theme-toggle-icon');
    const themeLabels = document.querySelectorAll('.theme-toggle-label');

    themeIcons.forEach(icon => {
        if (theme === 'light') {
            icon.setAttribute('data-lucide', 'moon');
        } else {
            icon.setAttribute('data-lucide', 'sun');
        }
    });

    themeLabels.forEach(label => {
        label.textContent = theme === 'light' ? 'Mode Gelap' : 'Mode Terang';
    });

    if (window.lucide) lucide.createIcons();

    if (notify && window.showToast) {
        window.showToast('info', `Beralih ke ${theme === 'light' ? 'Mode Terang (Light Mode)' : 'Mode Gelap (Dark Mode)'}`);
    }
};

window.toggleTheme = function() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    window.setTheme(nextTheme, true);
};

// ─── 2. TOAST NOTIFICATIONS (ZERO ALERT REPLACEMENT) ───────
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
    
    let iconSvg = '<i data-lucide="info" class="w-4 h-4"></i>';
    let defaultTitle = 'Informasi';

    if (type === 'success') {
        iconSvg = '<i data-lucide="check-circle-2" class="w-4 h-4"></i>';
        defaultTitle = 'Berhasil';
    } else if (type === 'error') {
        iconSvg = '<i data-lucide="alert-circle" class="w-4 h-4"></i>';
        defaultTitle = 'Gagal';
    } else if (type === 'warning') {
        iconSvg = '<i data-lucide="alert-triangle" class="w-4 h-4"></i>';
        defaultTitle = 'Perhatian';
    }

    toast.innerHTML = `
        <div class="toast-icon">${iconSvg}</div>
        <div class="toast-content">
            <span class="toast-title">${defaultTitle}</span>
            <span class="toast-message">${message}</span>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
        <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 300);
    }, duration);
};

// ─── 3. DUAL-NAV TAB SWITCHER (DESKTOP & MOBILE) ───────────
window.switchTab = function(tabId) {
    // Sembunyikan semua tab konten
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    
    // Hapus kelas aktif dari sidebar dan mobile bar
    document.querySelectorAll('.sidebar-nav-btn, .mobile-nav-item').forEach(el => el.classList.remove('active'));
    
    // Tampilkan tab yang dipilih
    const selectedTab = document.getElementById(`tab-${tabId}`);
    if (selectedTab) selectedTab.classList.remove('hidden');
    
    // Aktifkan tombol sidebar desktop
    const deskBtn = document.getElementById(`sidebar-btn-${tabId}`);
    if (deskBtn) deskBtn.classList.add('active');

    // Aktifkan tombol mobile bottom bar
    let mobileTarget = tabId;
    if (['features', 'notes', 'referral', 'apikeys', 'settings', 'premium'].includes(tabId)) {
        mobileTarget = 'more';
    }
    const mobBtn = document.getElementById(`mob-nav-${mobileTarget}`);
    if (mobBtn) mobBtn.classList.add('active');

    // Tutup mobile more sheet jika terbuka
    window.closeMobileMoreSheet();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Auto-fetch data per tab
    if (tabId === 'groups' || tabId === 'broadcast') {
        if (window.loadGroupsList) window.loadGroupsList();
    } else if (tabId === 'shop') {
        if (window.loadHostAdmins) window.loadHostAdmins();
        if (window.loadCustomersList) window.loadCustomersList();
        if (window.loadGroupsList) window.loadGroupsList();
        if (window.renderMenuTreeVisual) window.renderMenuTreeVisual();
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

// ─── 4. MOBILE MORE SHEET CONTROL ──────────────────────────
window.openMobileMoreSheet = function() {
    const sheet = document.getElementById('mobile-more-sheet');
    if (sheet) {
        sheet.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    }
};

window.closeMobileMoreSheet = function() {
    const sheet = document.getElementById('mobile-more-sheet');
    if (sheet) sheet.classList.add('hidden');
};

// ─── 5. SUB-TABS (TRANSAKSI, DLL) ──────────────────────────
window.switchSubTab = function(parentTab, subTab) {
    if (parentTab === 'transactions') {
        const ordersPanel = document.getElementById('panel-orders-container');
        const invoicesPanel = document.getElementById('panel-invoices-container');
        const ordersBtn = document.getElementById('sub-tab-orders-btn');
        const invoicesBtn = document.getElementById('sub-tab-invoices-btn');
        
        if (subTab === 'orders') {
            if (ordersPanel) ordersPanel.style.display = 'block';
            if (invoicesPanel) invoicesPanel.style.display = 'none';
            if (ordersBtn) { ordersBtn.classList.add('active'); }
            if (invoicesBtn) { invoicesBtn.classList.remove('active'); }
            if (window.loadOrders) window.loadOrders();
        } else if (subTab === 'invoices') {
            if (ordersPanel) ordersPanel.style.display = 'none';
            if (invoicesPanel) invoicesPanel.style.display = 'block';
            if (ordersBtn) { ordersBtn.classList.remove('active'); }
            if (invoicesBtn) { invoicesBtn.classList.add('active'); }
            if (window.loadInvoices) window.loadInvoices();
        }
    } else if (parentTab === 'premium') {
        const accPanel = document.getElementById('panel-premium-accounts-container');
        const salesPanel = document.getElementById('panel-premium-sales-container');
        const accBtn = document.getElementById('sub-tab-acc-btn');
        const salesBtn = document.getElementById('sub-tab-sales-btn');

        if (subTab === 'accounts') {
            if (accPanel) accPanel.style.display = 'block';
            if (salesPanel) salesPanel.style.display = 'none';
            if (accBtn) accBtn.classList.add('active');
            if (salesBtn) salesBtn.classList.remove('active');
        } else if (subTab === 'sales') {
            if (accPanel) accPanel.style.display = 'none';
            if (salesPanel) salesPanel.style.display = 'block';
            if (accBtn) accBtn.classList.remove('active');
            if (salesBtn) salesBtn.classList.add('active');
        }
    }
    if (window.lucide) lucide.createIcons();
};

// ─── 6. MODAL QUICK LINKS & LOGOUT ─────────────────────────
window.openQuickLinksModal = function() {
    const modal = document.getElementById('quick-links-modal');
    if (modal) {
        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    }
};

window.closeQuickLinksModal = function() {
    const modal = document.getElementById('quick-links-modal');
    if (modal) modal.classList.add('hidden');
};

window.copyPublicUrl = function(pathStr) {
    const fullUrl = window.location.origin + pathStr;
    navigator.clipboard.writeText(fullUrl).then(() => {
        window.showToast('success', `Tautan disalin: ${fullUrl}`);
    }).catch(err => {
        window.showToast('error', 'Gagal menyalin tautan: ' + err.message);
    });
};

window.logoutDashboard = function() {
    if (confirm('Apakah Anda yakin ingin keluar dari Dasbor?')) {
        document.cookie = 'session_token=; Max-Age=0; path=/;';
        window.location.href = '/login';
    }
};

// Keyboard ESC listener untuk modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
        window.closeMobileMoreSheet();
    }
});

// Auto-inisialisasi
document.addEventListener('DOMContentLoaded', () => {
    window.initTheme();
    if (window.lucide) lucide.createIcons();
});
