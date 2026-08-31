// ==========================================
// CORE SYSTEM: SOCKET, THEMES, TOASTS & DUAL NAVIGATION
// ==========================================
'use strict';

const socket = io();
window.socket = socket;

const TAB_TITLES = {
    monitor:      { title: 'Live Monitor & Analitik Obrolan', category: 'Operasional & Analitik' },
    transactions: { title: 'Transaksi, Pembayaran & Kasir', category: 'Operasional & Analitik' },
    shop:         { title: 'Katalog, Stok Akun & Manajemen Toko', category: 'Operasional & Analitik' },
    groups:       { title: 'Manajemen Komunitas & Grup WhatsApp', category: 'Operasional & Analitik' },
    memory:       { title: 'Basis Pengetahuan, Auto-Reply & Memo AI', category: 'Kecerdasan & Sistem' },
    settings:     { title: 'Pengaturan Sistem, Kredensial & API Key', category: 'Kecerdasan & Sistem' },
    // Backward compatibility aliases
    features:     { title: 'Fitur Auto-Reply', category: 'Kecerdasan & Sistem' },
    notes:        { title: 'Catatan & Memo', category: 'Kecerdasan & Sistem' },
    premium:      { title: 'Stok Akun Premium', category: 'Operasional & Analitik' },
    referral:     { title: 'Program Referral', category: 'Operasional & Analitik' },
    apikeys:      { title: 'API Key Manager', category: 'Kecerdasan & Sistem' }
};

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
    if (type === 'success') iconSvg = '<i data-lucide="check-circle-2" class="w-4 h-4"></i>';
    else if (type === 'error') iconSvg = '<i data-lucide="alert-circle" class="w-4 h-4"></i>';
    else if (type === 'warning') iconSvg = '<i data-lucide="alert-triangle" class="w-4 h-4"></i>';

    toast.innerHTML = `
        <div class="toast-icon">${iconSvg}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
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
    // Aliasing untuk subtab yang sudah digabung
    let targetTab = tabId;
    let targetSubTab = null;

    if (tabId === 'features') {
        targetTab = 'memory';
        targetSubTab = 'features';
    } else if (tabId === 'notes') {
        targetTab = 'memory';
        targetSubTab = 'notes';
    } else if (tabId === 'premium') {
        targetTab = 'shop';
        targetSubTab = 'premium';
    } else if (tabId === 'referral') {
        targetTab = 'shop';
        targetSubTab = 'referral';
    } else if (tabId === 'apikeys') {
        targetTab = 'settings';
        targetSubTab = 'apikeys';
    }

    // Sembunyikan semua tab konten
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    
    // Hapus kelas aktif dari sidebar dan mobile bar
    document.querySelectorAll('.sidebar-nav-btn, .mobile-nav-item').forEach(el => el.classList.remove('active'));
    
    // Tampilkan tab yang dipilih
    const selectedTab = document.getElementById('tab-' + targetTab);
    if (selectedTab) selectedTab.classList.remove('hidden');
    
    // Aktifkan tombol sidebar desktop
    const deskBtn = document.getElementById('sidebar-btn-' + targetTab);
    if (deskBtn) deskBtn.classList.add('active');

    // Aktifkan tombol mobile bottom bar
    const mobBtn = document.getElementById('mob-nav-' + targetTab);
    if (mobBtn) mobBtn.classList.add('active');

    // Update Desktop Breadcrumb & Tab Title
    updateWorkbenchHeader(targetTab);

    // Aktifkan subtab jika ada
    if (targetSubTab) {
        window.switchSubTab(targetTab, targetSubTab);
    } else {
        // Default subtab loading
        if (targetTab === 'shop') {
            window.switchSubTab('shop', 'menutree');
        } else if (targetTab === 'memory') {
            window.switchSubTab('memory', 'knowledge');
        } else if (targetTab === 'settings') {
            window.switchSubTab('settings', 'apikeys');
        }
    }

    // Tutup mobile more sheet jika terbuka
    window.closeMobileMoreSheet();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Auto-fetch data per tab
    if (targetTab === 'groups') {
        if (window.loadGroupsList) window.loadGroupsList();
    } else if (targetTab === 'transactions') {
        if (window.loadOrders) window.loadOrders();
        if (window.loadInvoices) window.loadInvoices();
    }

    if (window.lucide) lucide.createIcons();
};

function updateWorkbenchHeader(tabId) {
    const meta = TAB_TITLES[tabId] || { title: 'Dashboard', category: 'Operasional' };
    const breadcrumbCat = document.getElementById('workbench-breadcrumb-cat');
    const breadcrumbTitle = document.getElementById('workbench-breadcrumb-title');

    if (breadcrumbCat) breadcrumbCat.textContent = meta.category;
    if (breadcrumbTitle) breadcrumbTitle.textContent = meta.title;
}

// ─── 4. LIVE CLOCK TICKER ──────────────────────────────────
function startLiveClock() {
    const clockEl = document.getElementById('workbench-clock');
    if (!clockEl) return;

    function update() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
        clockEl.textContent = `${dateStr}, ${timeStr} WIB`;
    }
    update();
    setInterval(update, 1000);
}

// ─── 5. MOBILE MORE SHEET CONTROL ──────────────────────────
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

// ─── 6. SUB-TABS CONTROL (CONSOLIDATED) ────────────────────────
window.switchSubTab = function(parentTab, subTab) {
    if (parentTab === 'transactions') {
        const ordersPanel = document.getElementById('panel-orders-container');
        const invoicesPanel = document.getElementById('panel-invoices-container');
        const ordersBtn = document.getElementById('sub-tab-orders-btn');
        const invoicesBtn = document.getElementById('sub-tab-invoices-btn');

        if (subTab === 'orders') {
            if (ordersPanel) ordersPanel.style.display = 'block';
            if (invoicesPanel) invoicesPanel.style.display = 'none';
            if (ordersBtn) ordersBtn.classList.add('active');
            if (invoicesBtn) invoicesBtn.classList.remove('active');
        } else {
            if (ordersPanel) ordersPanel.style.display = 'none';
            if (invoicesPanel) invoicesPanel.style.display = 'block';
            if (ordersBtn) ordersBtn.classList.remove('active');
            if (invoicesBtn) invoicesBtn.classList.add('active');
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
        } else {
            if (accPanel) accPanel.style.display = 'none';
            if (salesPanel) salesPanel.style.display = 'block';
            if (accBtn) accBtn.classList.remove('active');
            if (salesBtn) salesBtn.classList.add('active');
        }
    } else if (parentTab === 'memory') {
        const panes = ['knowledge', 'features', 'notes'];
        panes.forEach(p => {
            const el = document.getElementById('subpane-mem-' + p);
            const btn = document.getElementById('subtab-mem-' + p + '-btn');
            if (p === subTab) {
                if (el) el.classList.remove('hidden');
                if (btn) {
                    btn.classList.add('active', 'font-bold', 'text-[var(--text-primary)]');
                    btn.classList.remove('text-[var(--text-muted)]');
                }
            } else {
                if (el) el.classList.add('hidden');
                if (btn) {
                    btn.classList.remove('active', 'font-bold', 'text-[var(--text-primary)]');
                    btn.classList.add('text-[var(--text-muted)]');
                }
            }
        });
        if (subTab === 'knowledge' && window.loadFiles) window.loadFiles();
        if (subTab === 'notes' && window.loadLocalNotes) window.loadLocalNotes();
    } else if (parentTab === 'shop') {
        const panes = ['menutree', 'premium', 'referral', 'admins', 'customers'];
        panes.forEach(p => {
            const el = document.getElementById('subpane-shop-' + p);
            const btn = document.getElementById('subtab-shop-' + p + '-btn');
            if (p === subTab) {
                if (el) el.classList.remove('hidden');
                if (btn) {
                    btn.classList.add('active', 'font-bold', 'text-[var(--text-primary)]');
                    btn.classList.remove('text-[var(--text-muted)]');
                }
            } else {
                if (el) el.classList.add('hidden');
                if (btn) {
                    btn.classList.remove('active', 'font-bold', 'text-[var(--text-primary)]');
                    btn.classList.add('text-[var(--text-muted)]');
                }
            }
        });
        if (subTab === 'menutree' && window.renderMenuTreeVisual) window.renderMenuTreeVisual();
        if (subTab === 'premium' && window.loadPremiumData) window.loadPremiumData();
        if (subTab === 'referral' && window.loadReferralDashboardData) window.loadReferralDashboardData();
        if (subTab === 'admins' && window.loadHostAdmins) window.loadHostAdmins();
        if (subTab === 'customers' && window.loadCustomersList) window.loadCustomersList();
    } else if (parentTab === 'settings') {
        const panes = ['apikeys', 'server'];
        panes.forEach(p => {
            const el = document.getElementById('subpane-set-' + p);
            const btn = document.getElementById('subtab-set-' + p + '-btn');
            if (p === subTab) {
                if (el) el.classList.remove('hidden');
                if (btn) {
                    btn.classList.add('active', 'font-bold', 'text-[var(--text-primary)]');
                    btn.classList.remove('text-[var(--text-muted)]');
                }
            } else {
                if (el) el.classList.add('hidden');
                if (btn) {
                    btn.classList.remove('active', 'font-bold', 'text-[var(--text-primary)]');
                    btn.classList.add('text-[var(--text-muted)]');
                }
            }
        });
        if (subTab === 'apikeys' && window.loadApiKeys) window.loadApiKeys();
        if (subTab === 'server' && window.loadTelegramConfig) window.loadTelegramConfig();
    }
    if (window.lucide) lucide.createIcons();
};

// ─── 7. QUICK LINKS & PUBLIC PORTALS ───────────────────────
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

window.copyPublicUrl = function(pathUrl) {
    const fullUrl = window.location.origin + pathUrl;
    navigator.clipboard.writeText(fullUrl).then(() => {
        if (window.showToast) window.showToast('success', `Tautan disalin: ${fullUrl}`);
    }).catch(() => {
        prompt('Salin tautan ini:', fullUrl);
    });
};

// ─── 7. UNIVERSAL ENTERPRISE CONFIRMATION DIALOG MODAL ───────
let activeConfirmResolver = null;

window.showEnterpriseConfirm = function(options = {}) {
    const {
        title = 'Konfirmasi Tindakan',
        message = 'Apakah Anda yakin ingin melanjutkan tindakan ini?',
        confirmText = 'Ya, Lanjutkan',
        cancelText = 'Batal',
        type = 'danger', // 'danger' | 'warning' | 'primary'
        icon = 'alert-triangle'
    } = options;

    return new Promise((resolve) => {
        activeConfirmResolver = resolve;

        const modal = document.getElementById('enterprise-confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const actionBtn = document.getElementById('confirm-btn-action');
        const cancelBtn = document.getElementById('confirm-btn-cancel');
        const iconBox = document.getElementById('confirm-icon-box');
        const iconEl = document.getElementById('confirm-icon');
        const actionTextEl = document.getElementById('confirm-action-text');

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.innerHTML = message;
        if (actionTextEl) actionTextEl.textContent = confirmText;
        if (cancelBtn) cancelBtn.textContent = cancelText;

        if (iconBox && iconEl) {
            if (type === 'danger') {
                iconBox.className = 'w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0 shadow-inner';
                if (actionBtn) actionBtn.className = 'px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-colors flex items-center gap-1.5';
                iconEl.setAttribute('data-lucide', icon || 'log-out');
            } else if (type === 'warning') {
                iconBox.className = 'w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-inner';
                if (actionBtn) actionBtn.className = 'px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/30 transition-colors flex items-center gap-1.5';
                iconEl.setAttribute('data-lucide', icon || 'alert-triangle');
            } else {
                iconBox.className = 'w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0 shadow-inner';
                if (actionBtn) actionBtn.className = 'px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-colors flex items-center gap-1.5';
                iconEl.setAttribute('data-lucide', icon || 'check-circle');
            }
        }

        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }
        if (window.lucide) lucide.createIcons();
    });
};

window.resolveEnterpriseConfirm = function(result) {
    const modal = document.getElementById('enterprise-confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    if (typeof activeConfirmResolver === 'function') {
        const resolver = activeConfirmResolver;
        activeConfirmResolver = null;
        resolver(Boolean(result));
    }
};

window.logoutDashboard = async function() {
    const confirmed = await window.showEnterpriseConfirm({
        title: 'Keluar dari Sistem',
        message: 'Apakah Anda yakin ingin mengakhiri sesi admin dasbor saat ini?',
        confirmText: 'Ya, Keluar Sistem',
        cancelText: 'Tetap di Sini',
        type: 'danger',
        icon: 'log-out'
    });

    if (!confirmed) return;

    if (window.showToast) window.showToast('info', 'Mengakhiri sesi admin...');
    try {
        await fetch('/api/logout', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' } 
        });
    } catch (_) {}
    document.cookie = 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    window.location.href = '/login';
};

// ─── 8. GLOBAL KEYBOARD SHORTCUTS ──────────────────────────
document.addEventListener('keydown', (e) => {
    // ESC: Close open modals & cancel active confirmation dialog
    if (e.key === 'Escape') {
        if (activeConfirmResolver) {
            window.resolveEnterpriseConfirm(false);
            return;
        }
        const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
        openModals.forEach(m => m.classList.add('hidden'));
    }
    // Enter on active confirmation dialog: confirm
    if (e.key === 'Enter' && activeConfirmResolver) {
        window.resolveEnterpriseConfirm(true);
        return;
    }
    // Ctrl+K / Cmd+K: Open Quick Links
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        window.openQuickLinksModal();
    }
});

// Initial Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    window.initTheme();
    startLiveClock();
    if (window.lucide) lucide.createIcons();
});
