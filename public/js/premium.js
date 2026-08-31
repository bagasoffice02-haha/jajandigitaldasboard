// ==========================================
// PREMIUM INVENTORY & SUBSCRIPTIONS (DUAL-VIEW)
// ==========================================
'use strict';

let premiumProducts = [];
let premiumAccounts = [];
let premiumSales = [];

function formatRupiah(num) {
    if (isNaN(num)) return 'Rp 0';
    return 'Rp ' + Number(num).toLocaleString('id-ID');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.openPremiumModal = function(type) {
    const modal = document.getElementById('modal-premium-' + type);
    if (modal) {
        modal.classList.remove('hidden');
        if (type === 'sale') {
            loadPremiumAccountsListForSale();
        } else if (type === 'account') {
            loadPremiumProductsListForAccount();
        }
        if (window.lucide) lucide.createIcons();
    }
};

window.closePremiumModal = function(type) {
    const modal = document.getElementById('modal-premium-' + type);
    if (modal) modal.classList.add('hidden');
};

window.loadPremiumData = async function() {
    try {
        await Promise.all([
            loadPremiumProducts(),
            loadPremiumAccounts(),
            loadPremiumSales()
        ]);
        updatePremiumStats();
    } catch(err) {
        console.error('Error loadPremiumData:', err);
    }
};

async function loadPremiumProducts() {
    try {
        const res = await fetch('/api/premium/products');
        if (res.ok) premiumProducts = await res.json();
    } catch(e) {}
}

async function loadPremiumAccounts() {
    try {
        const res = await fetch('/api/premium/accounts');
        if (res.ok) {
            premiumAccounts = await res.json();
            renderPremiumAccounts();
        }
    } catch(e) {}
}

async function loadPremiumSales() {
    try {
        const res = await fetch('/api/premium/sales');
        if (res.ok) {
            premiumSales = await res.json();
            renderPremiumSales();
        }
    } catch(e) {}
}

function updatePremiumStats() {
    const todayStr = new Date().toISOString().substring(0, 10);
    const activeSubs = premiumSales.filter(s => s.payment_status === 'Lunas' && s.end_date >= todayStr).length;
    const statActive = document.getElementById('stat-active-subscribers');
    if (statActive) statActive.textContent = activeSubs;
    
    const totalAccs = premiumAccounts.length;
    const readyAccs = premiumAccounts.filter(a => a.status === 'Tersedia').length;
    const statStock = document.getElementById('stat-stock-ratio');
    if (statStock) statStock.textContent = `${readyAccs} / ${totalAccs}`;
    
    const activeSales = premiumSales.filter(s => s.payment_status === 'Lunas' && s.end_date >= todayStr);
    const estimatedRev = activeSales.reduce((acc, curr) => acc + (curr.price || 0), 0);
    const statRev = document.getElementById('stat-monthly-revenue');
    if (statRev) statRev.textContent = formatRupiah(estimatedRev);
}

function renderPremiumAccounts() {
    const tbody = document.getElementById('premium-accounts-table-body');
    const mobileCards = document.getElementById('premium-accounts-mobile-cards');

    if (!premiumAccounts || premiumAccounts.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-xs text-[var(--text-muted)]">Belum ada stok akun premium.</td></tr>';
        if (mobileCards) mobileCards.innerHTML = '<div class="py-8 text-center text-xs text-[var(--text-muted)]">Belum ada stok akun premium.</div>';
        return;
    }

    // 1. Desktop Table
    if (tbody) {
        tbody.innerHTML = premiumAccounts.map(acc => {
            let statusBadge = '<span class="badge-chip badge-emerald">TERSEDIA</span>';
            if (acc.status === 'Penuh') statusBadge = '<span class="badge-chip badge-rose">PENUH</span>';
            if (acc.status === 'Nonaktif') statusBadge = '<span class="badge-chip badge-slate">NONAKTIF</span>';

            return `
                <tr>
                    <td class="font-bold text-xs text-[var(--text-primary)]">${escapeHtml(acc.product_name || 'APK')}</td>
                    <td>
                        <div class="font-semibold text-xs text-[var(--text-primary)] font-mono-num">${escapeHtml(acc.email)}</div>
                        <div class="text-[11px] text-[var(--text-muted)] font-mono-num">Pass: ${escapeHtml(acc.password)}</div>
                    </td>
                    <td class="font-mono-num text-xs">${acc.active_users || 0} / ${acc.max_users}</td>
                    <td>${statusBadge}</td>
                    <td class="text-right">
                        <button onclick="deletePremiumAccount(${acc.id})" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 2. Mobile Cards
    if (mobileCards) {
        mobileCards.innerHTML = premiumAccounts.map(acc => {
            let statusBadge = '<span class="badge-chip badge-emerald">TERSEDIA</span>';
            if (acc.status === 'Penuh') statusBadge = '<span class="badge-chip badge-rose">PENUH</span>';

            return `
                <div class="mobile-entity-card">
                    <div class="mobile-entity-header">
                        <span class="font-bold text-xs text-[var(--text-primary)]">${escapeHtml(acc.product_name || 'APK')}</span>
                        ${statusBadge}
                    </div>
                    <div class="space-y-1">
                        <div class="text-xs font-mono-num text-indigo-300">${escapeHtml(acc.email)}</div>
                        <div class="text-[11px] font-mono-num text-[var(--text-muted)]">Pass: ${escapeHtml(acc.password)}</div>
                    </div>
                    <div class="mobile-entity-actions">
                        <span class="text-[11px] text-[var(--text-muted)] mr-auto">Slot: ${acc.active_users || 0}/${acc.max_users}</span>
                        <button onclick="deletePremiumAccount(${acc.id})" class="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (window.lucide) lucide.createIcons();
}

function renderPremiumSales() {
    const tbody = document.getElementById('premium-sales-table-body');
    const mobileCards = document.getElementById('premium-sales-mobile-cards');

    if (!premiumSales || premiumSales.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-xs text-[var(--text-muted)]">Belum ada riwayat penjualan.</td></tr>';
        if (mobileCards) mobileCards.innerHTML = '<div class="py-8 text-center text-xs text-[var(--text-muted)]">Belum ada riwayat penjualan.</div>';
        return;
    }

    // 1. Desktop Table
    if (tbody) {
        tbody.innerHTML = premiumSales.map(sale => {
            const cleanPhone = (sale.buyer_phone || '').replace(/\D/g, '');
            let daysLeft = 0;
            if (sale.end_date) {
                const diffTime = new Date(sale.end_date) - new Date();
                daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
            
            let daysBadge = `<span class="badge-chip badge-emerald">${daysLeft} Hari</span>`;
            if (daysLeft < 0) daysBadge = `<span class="badge-chip badge-rose">EXPIRED</span>`;
            else if (daysLeft <= 5) daysBadge = `<span class="badge-chip badge-amber">${daysLeft} Hari Lagi</span>`;

            let payBadge = sale.payment_status === 'Lunas'
                ? '<span class="badge-chip badge-emerald">LUNAS</span>'
                : '<span class="badge-chip badge-amber">PENDING</span>';

            return `
                <tr>
                    <td>
                        <div class="font-bold text-xs text-[var(--text-primary)]">${escapeHtml(sale.product_name || 'APK')}</div>
                        <div class="text-[11px] text-[var(--text-muted)] font-mono-num truncate max-w-[140px]">${escapeHtml(sale.account_email || '')}</div>
                    </td>
                    <td>
                        <div class="font-semibold text-xs text-[var(--text-primary)]">${escapeHtml(sale.buyer_name)}</div>
                        <a href="https://wa.me/${cleanPhone}" target="_blank" class="text-[11px] text-emerald-400 font-mono-num hover:underline">+${cleanPhone}</a>
                    </td>
                    <td class="text-xs">${escapeHtml(sale.profile_name || '-')}</td>
                    <td>
                        <div>${daysBadge}</div>
                        <div class="text-[10px] text-[var(--text-muted)] mt-0.5">s/d ${sale.end_date || '-'}</div>
                    </td>
                    <td>
                        <div>${payBadge}</div>
                        <div class="font-mono-num font-bold text-xs text-[var(--text-primary)] mt-0.5">${formatRupiah(sale.price)}</div>
                    </td>
                    <td class="text-right">
                        <div class="flex items-center justify-end gap-1.5">
                            <button onclick="sendPremiumReminder(${sale.id}, this)" class="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" title="Kirim Pengingat WA">
                                <i data-lucide="bell" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="deletePremiumSale(${sale.id})" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20" title="Hapus">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 2. Mobile Cards
    if (mobileCards) {
        mobileCards.innerHTML = premiumSales.map(sale => {
            const cleanPhone = (sale.buyer_phone || '').replace(/\D/g, '');
            return `
                <div class="mobile-entity-card">
                    <div class="mobile-entity-header">
                        <span class="font-bold text-xs text-[var(--text-primary)]">${escapeHtml(sale.product_name || 'APK')} - ${escapeHtml(sale.profile_name || 'Slot')}</span>
                        <span class="font-mono-num font-bold text-xs text-emerald-400">${formatRupiah(sale.price)}</span>
                    </div>
                    <div class="text-xs text-[var(--text-secondary)]">
                        <span>${escapeHtml(sale.buyer_name)} (+${cleanPhone})</span>
                        <div class="text-[11px] text-[var(--text-muted)] mt-0.5">Berakhir: ${sale.end_date || '-'}</div>
                    </div>
                    <div class="mobile-entity-actions">
                        <a href="https://wa.me/${cleanPhone}" target="_blank" class="px-2.5 py-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] flex items-center gap-1">
                            <i data-lucide="message-circle" class="w-3 h-3 text-emerald-400"></i>
                            <span>Chat</span>
                        </a>
                        <button onclick="sendPremiumReminder(${sale.id}, this)" class="px-2.5 py-1 rounded-lg bg-emerald-600 text-[var(--text-primary)] text-[11px] font-semibold flex items-center gap-1">
                            <i data-lucide="bell" class="w-3 h-3"></i>
                            <span>Ingatkan</span>
                        </button>
                        <button onclick="deletePremiumSale(${sale.id})" class="p-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (window.lucide) lucide.createIcons();
}

function loadPremiumProductsListForAccount() {
    const sel = document.getElementById('acc-product-id');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Pilih Aplikasi / APK --</option>';
    premiumProducts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

function loadPremiumAccountsListForSale() {
    const sel = document.getElementById('sale-account-id');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Pilih Akun Sumber --</option>';
    premiumAccounts.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.product_name || 'APK'} - ${a.email} (${a.active_users || 0}/${a.max_users})`;
        sel.appendChild(opt);
    });
}

window.savePremiumAccount = async function() {
    const productId = document.getElementById('acc-product-id').value;
    const email = document.getElementById('acc-email').value.trim();
    const password = document.getElementById('acc-password').value.trim();
    const maxUsers = document.getElementById('acc-max-users').value || 1;
    const status = document.getElementById('acc-status').value || 'Tersedia';

    if (!email || !password) {
        if (window.showToast) window.showToast('warning', 'Email dan Password wajib diisi!');
        return;
    }

    try {
        const res = await fetch('/api/premium/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId, email, password, max_users: maxUsers, status })
        });
        if (res.ok) {
            window.closePremiumModal('account');
            if (window.showToast) window.showToast('success', 'Akun premium berhasil ditambahkan!');
            window.loadPremiumData();
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        if (window.showToast) window.showToast('error', 'Gagal menyimpan akun: ' + err.message);
    }
};

window.savePremiumSale = async function() {
    const accountId = document.getElementById('sale-account-id').value;
    const buyerName = document.getElementById('sale-buyer-name').value.trim();
    const buyerPhone = document.getElementById('sale-buyer-phone').value.trim();
    const profileName = document.getElementById('sale-profile-name').value.trim();
    const price = document.getElementById('sale-price').value || 0;
    const endDate = document.getElementById('sale-end-date').value;
    const paymentStatus = document.getElementById('sale-payment-status').value || 'Lunas';

    if (!buyerName || !buyerPhone || !endDate) {
        if (window.showToast) window.showToast('warning', 'Nama pembeli, nomor WhatsApp, dan tanggal berakhir wajib diisi!');
        return;
    }

    try {
        const res = await fetch('/api/premium/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: accountId, buyer_name: buyerName, buyer_phone: buyerPhone, profile_name: profileName, price, end_date: endDate, payment_status: paymentStatus })
        });
        if (res.ok) {
            window.closePremiumModal('sale');
            if (window.showToast) window.showToast('success', 'Penjualan premium berhasil dicatat!');
            window.loadPremiumData();
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        if (window.showToast) window.showToast('error', 'Gagal menyimpan penjualan: ' + err.message);
    }
};

window.deletePremiumAccount = async function(id) {
    const confirmed = await window.showEnterpriseConfirm({
        title: 'Hapus Akun Premium',
        message: 'Apakah Anda yakin ingin menghapus akun premium ini dari inventaris?',
        confirmText: 'Ya, Hapus Akun',
        cancelText: 'Batal',
        type: 'danger',
        icon: 'trash-2'
    });

    if (!confirmed) return;

    try {
        const res = await fetch(`/api/premium/accounts/${id}`, { method: 'DELETE' });
        if (res.ok) {
            if (window.showToast) window.showToast('success', 'Akun premium dihapus.');
            window.loadPremiumData();
        }
    } catch(e) {}
};

window.deletePremiumSale = async function(id) {
    const confirmed = await window.showEnterpriseConfirm({
        title: 'Hapus Catatan Penjualan',
        message: 'Apakah Anda yakin ingin menghapus riwayat transaksi penjualan ini?',
        confirmText: 'Ya, Hapus Transaksi',
        cancelText: 'Batal',
        type: 'danger',
        icon: 'trash-2'
    });

    if (!confirmed) return;

    try {
        const res = await fetch(`/api/premium/sales/${id}`, { method: 'DELETE' });
        if (res.ok) {
            if (window.showToast) window.showToast('success', 'Penjualan dihapus.');
            window.loadPremiumData();
        }
    } catch(e) {}
};

window.sendPremiumReminder = async function(saleId, btn) {
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`/api/premium/sales/${saleId}/remind`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            if (window.showToast) window.showToast('success', 'Pengingat WhatsApp berhasil dikirim ke pelanggan!');
        } else {
            throw new Error(data.error || 'Gagal');
        }
    } catch(err) {
        if (window.showToast) window.showToast('error', 'Gagal kirim pengingat: ' + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.loadPremiumData) window.loadPremiumData();
    }, 500);
});
