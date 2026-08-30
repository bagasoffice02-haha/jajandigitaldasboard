// ==========================================
// TRANSACTIONS & INVOICING MODULE (DUAL-VIEW)
// ==========================================
'use strict';

let allOrders = [];
let allInvoices = [];
let currentOrderFilter = 'ALL';
let currentInvoiceFilter = 'ALL';

function formatRupiah(num) {
    if (isNaN(num)) return 'Rp 0';
    return 'Rp ' + Number(num).toLocaleString('id-ID');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── 1. ORDERS / PESANAN ──────────────────────────────────
window.loadOrders = async function() {
    const tableBody = document.getElementById('orders-table-body');
    const mobileCards = document.getElementById('orders-mobile-cards');
    
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-xs text-[var(--text-muted)]">Memuat pesanan...</td></tr>';
    if (mobileCards) mobileCards.innerHTML = '<div class="p-6 text-center text-xs text-[var(--text-muted)]">Memuat pesanan...</div>';

    try {
        const res = await fetch('/api/orders');
        if (!res.ok) throw new Error('Gagal mengambil daftar pesanan');
        allOrders = await res.json();
        
        window.renderOrders();
    } catch (err) {
        console.error('Error loadOrders:', err);
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-xs text-rose-400">Gagal: ${err.message}</td></tr>`;
        if (mobileCards) mobileCards.innerHTML = `<div class="p-4 text-center text-xs text-rose-400">Gagal: ${err.message}</div>`;
    }
};

window.renderOrders = function() {
    const tableBody = document.getElementById('orders-table-body');
    const mobileCards = document.getElementById('orders-mobile-cards');

    const filtered = currentOrderFilter === 'ALL'
        ? allOrders
        : allOrders.filter(o => (o.status || 'PENDING').toUpperCase() === currentOrderFilter);

    if (!filtered || filtered.length === 0) {
        const emptyMsg = '<div class="py-8 text-center text-xs text-[var(--text-muted)]">Tidak ada pesanan ditemukan.</div>';
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-xs text-[var(--text-muted)]">Tidak ada pesanan ditemukan.</td></tr>';
        if (mobileCards) mobileCards.innerHTML = emptyMsg;
        return;
    }

    // 1. Render Desktop Table
    if (tableBody) {
        tableBody.innerHTML = filtered.map(order => {
            const cleanPhone = (order.customer_phone || '').replace(/\D/g, '');
            const timeStr = new Date(order.created_at || Date.now()).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
            
            let statusBadge = '<span class="badge-chip badge-amber">PENDING</span>';
            if (order.status === 'PAID') statusBadge = '<span class="badge-chip badge-emerald">DIBAYAR</span>';
            if (order.status === 'CANCELLED') statusBadge = '<span class="badge-chip badge-rose">DIBATALKAN</span>';

            return `
                <tr>
                    <td class="font-mono-num font-bold text-xs">#${order.id}</td>
                    <td class="text-[var(--text-muted)] text-[11px] whitespace-nowrap">${timeStr}</td>
                    <td>
                        <div class="font-semibold text-xs text-[var(--text-primary)]">${escapeHtml(order.customer_name || 'Customer')}</div>
                        <a href="https://wa.me/${cleanPhone}" target="_blank" class="text-[11px] text-emerald-400 font-mono-num hover:underline flex items-center gap-1">
                            +${cleanPhone}
                            <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                        </a>
                    </td>
                    <td class="font-semibold text-xs">${escapeHtml(order.product_name || order.item_name || 'Produk')}</td>
                    <td class="text-right font-mono-num font-bold text-xs text-[var(--text-primary)]">${formatRupiah(order.amount || order.price)}</td>
                    <td>${statusBadge}</td>
                    <td class="text-right">
                        <div class="flex items-center justify-end gap-1.5">
                            ${order.status !== 'PAID' ? `
                                <button onclick="updateOrderStatus(${order.id}, 'PAID')" class="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold" title="Tandai Lunas">
                                    Lunas
                                </button>
                            ` : ''}
                            ${order.status !== 'CANCELLED' ? `
                                <button onclick="updateOrderStatus(${order.id}, 'CANCELLED')" class="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[11px] font-semibold" title="Batalkan">
                                    Batal
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 2. Render Mobile App Cards
    if (mobileCards) {
        mobileCards.innerHTML = filtered.map(order => {
            const cleanPhone = (order.customer_phone || '').replace(/\D/g, '');
            const timeStr = new Date(order.created_at || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            
            let statusBadge = '<span class="badge-chip badge-amber">PENDING</span>';
            if (order.status === 'PAID') statusBadge = '<span class="badge-chip badge-emerald">DIBAYAR</span>';
            if (order.status === 'CANCELLED') statusBadge = '<span class="badge-chip badge-rose">BATAL</span>';

            return `
                <div class="mobile-entity-card">
                    <div class="mobile-entity-header">
                        <div class="flex items-center gap-2">
                            <span class="font-mono-num font-bold text-xs text-indigo-400">#${order.id}</span>
                            <span class="text-[10px] text-[var(--text-muted)]">${timeStr}</span>
                        </div>
                        ${statusBadge}
                    </div>
                    
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <h4 class="text-xs font-bold text-[var(--text-primary)]">${escapeHtml(order.product_name || order.item_name || 'Produk')}</h4>
                            <p class="text-[11px] text-[var(--text-secondary)] mt-0.5">${escapeHtml(order.customer_name || 'Customer')} (+${cleanPhone})</p>
                        </div>
                        <div class="text-right">
                            <span class="font-mono-num font-bold text-sm text-emerald-400">${formatRupiah(order.amount || order.price)}</span>
                        </div>
                    </div>

                    <div class="mobile-entity-actions">
                        <a href="https://wa.me/${cleanPhone}" target="_blank" class="px-2.5 py-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] flex items-center gap-1">
                            <i data-lucide="message-circle" class="w-3 h-3 text-emerald-400"></i>
                            <span>Chat</span>
                        </a>
                        ${order.status !== 'PAID' ? `
                            <button onclick="updateOrderStatus(${order.id}, 'PAID')" class="px-3 py-1 rounded-lg bg-emerald-600 text-[var(--text-primary)] text-[11px] font-semibold shadow-sm">
                                Tandai Lunas
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    if (window.lucide) lucide.createIcons();
};

window.filterOrders = function(status) {
    currentOrderFilter = status;
    document.querySelectorAll('.order-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-status') === status);
    });
    window.renderOrders();
};

window.updateOrderStatus = async function(id, newStatus) {
    try {
        const res = await fetch(`/api/orders/${id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            if (window.showToast) window.showToast('success', `Status pesanan #${id} diperbarui: ${newStatus}`);
            window.loadOrders();
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        if (window.showToast) window.showToast('error', 'Gagal memperbarui status: ' + err.message);
    }
};

// ─── 2. INVOICES / FAKTUR TAGIHAN ─────────────────────────
window.loadInvoices = async function() {
    const tableBody = document.getElementById('invoices-table-body');
    const mobileCards = document.getElementById('invoices-mobile-cards');
    
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-xs text-[var(--text-muted)]">Memuat invoice...</td></tr>';
    if (mobileCards) mobileCards.innerHTML = '<div class="p-6 text-center text-xs text-[var(--text-muted)]">Memuat invoice...</div>';

    try {
        const res = await fetch('/api/invoices');
        if (!res.ok) throw new Error('Gagal mengambil daftar invoice');
        allInvoices = await res.json();
        
        window.renderInvoices();
    } catch (err) {
        console.error('Error loadInvoices:', err);
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-xs text-rose-400">Gagal: ${err.message}</td></tr>`;
        if (mobileCards) mobileCards.innerHTML = `<div class="p-4 text-center text-xs text-rose-400">Gagal: ${err.message}</div>`;
    }
};

window.renderInvoices = function() {
    const tableBody = document.getElementById('invoices-table-body');
    const mobileCards = document.getElementById('invoices-mobile-cards');

    const filtered = currentInvoiceFilter === 'ALL'
        ? allInvoices
        : allInvoices.filter(i => (i.status || 'UNPAID').toUpperCase() === currentInvoiceFilter);

    if (!filtered || filtered.length === 0) {
        const emptyMsg = '<div class="py-8 text-center text-xs text-[var(--text-muted)]">Tidak ada invoice ditemukan.</div>';
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-xs text-[var(--text-muted)]">Tidak ada invoice ditemukan.</td></tr>';
        if (mobileCards) mobileCards.innerHTML = emptyMsg;
        return;
    }

    // 1. Render Desktop Table
    if (tableBody) {
        tableBody.innerHTML = filtered.map(inv => {
            const cleanPhone = (inv.customer_phone || '').replace(/\D/g, '');
            const timeStr = new Date(inv.created_at || Date.now()).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
            
            let statusBadge = '<span class="badge-chip badge-rose">BELUM LUNAS</span>';
            if (inv.status === 'PAID') statusBadge = '<span class="badge-chip badge-emerald">LUNAS</span>';
            if (inv.status === 'CANCELLED') statusBadge = '<span class="badge-chip badge-slate">BATAL</span>';

            return `
                <tr>
                    <td class="font-mono-num font-bold text-xs">INV-${inv.id}</td>
                    <td class="text-[var(--text-muted)] text-[11px] whitespace-nowrap">${timeStr}</td>
                    <td>
                        <div class="font-semibold text-xs text-[var(--text-primary)]">${escapeHtml(inv.customer_name || 'Customer')}</div>
                        <span class="text-[11px] text-[var(--text-muted)] font-mono-num">+${cleanPhone}</span>
                    </td>
                    <td class="text-xs">${escapeHtml(inv.description || 'Tagihan Pembelian')}</td>
                    <td class="text-right font-mono-num font-bold text-xs text-[var(--text-primary)]">${formatRupiah(inv.amount)}</td>
                    <td>${statusBadge}</td>
                    <td class="text-right">
                        <div class="flex items-center justify-end gap-1.5">
                            ${inv.status !== 'PAID' ? `
                                <button onclick="updateInvoiceStatus(${inv.id}, 'PAID')" class="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
                                    Set Lunas
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 2. Render Mobile App Cards
    if (mobileCards) {
        mobileCards.innerHTML = filtered.map(inv => {
            const cleanPhone = (inv.customer_phone || '').replace(/\D/g, '');
            let statusBadge = '<span class="badge-chip badge-rose">BELUM LUNAS</span>';
            if (inv.status === 'PAID') statusBadge = '<span class="badge-chip badge-emerald">LUNAS</span>';

            return `
                <div class="mobile-entity-card">
                    <div class="mobile-entity-header">
                        <span class="font-mono-num font-bold text-xs text-purple-400">INV-${inv.id}</span>
                        ${statusBadge}
                    </div>
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <h4 class="text-xs font-bold text-[var(--text-primary)]">${escapeHtml(inv.description || 'Tagihan')}</h4>
                            <p class="text-[11px] text-[var(--text-muted)] mt-0.5">${escapeHtml(inv.customer_name || 'Customer')} (+${cleanPhone})</p>
                        </div>
                        <div class="text-right">
                            <span class="font-mono-num font-bold text-sm text-[var(--text-primary)]">${formatRupiah(inv.amount)}</span>
                        </div>
                    </div>
                    ${inv.status !== 'PAID' ? `
                        <div class="mobile-entity-actions">
                            <button onclick="updateInvoiceStatus(${inv.id}, 'PAID')" class="px-3 py-1 rounded-lg bg-emerald-600 text-[var(--text-primary)] text-[11px] font-semibold">
                                Set Lunas
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    if (window.lucide) lucide.createIcons();
};

window.filterInvoices = function(status) {
    currentInvoiceFilter = status;
    document.querySelectorAll('.invoice-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-status') === status);
    });
    window.renderInvoices();
};

window.updateInvoiceStatus = async function(id, newStatus) {
    try {
        const res = await fetch(`/api/invoices/${id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            if (window.showToast) window.showToast('success', `Status invoice INV-${id} diperbarui: ${newStatus}`);
            window.loadInvoices();
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        if (window.showToast) window.showToast('error', 'Gagal memperbarui status invoice: ' + err.message);
    }
};

// Initial Fetch
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.loadOrders) window.loadOrders();
    }, 400);
});
