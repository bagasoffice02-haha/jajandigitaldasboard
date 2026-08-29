window.loadOrders = async function() {
    try {
        const res = await fetch('/api/orders');
        if (!res.ok) throw new Error('Gagal mengambil data pesanan');
        allOrders = await res.json();
        
        const total = allOrders.length;
        const pending = allOrders.filter(o => o.status === 'PENDING').length;
        const completed = allOrders.filter(o => o.status === 'SELESAI').length;
        
        document.getElementById('order-stat-total').textContent = total;
        document.getElementById('order-stat-pending').textContent = pending;
        document.getElementById('order-stat-completed').textContent = completed;
        
        // Remove red dot badge if we are viewing the transactions tab
        const dot = document.getElementById('transaction-badge-dot');
        if (dot) dot.remove();
        
        renderOrdersTable();
    } catch (err) {
        console.error('Error loadOrders:', err);
    }
};

window.filterOrders = function(status) {
    currentOrderFilter = status;
    const buttons = document.querySelectorAll('.order-filter-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(status)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderOrdersTable();
};

window.sortOrders = function(criteria) {
    currentOrderSort = criteria;
    renderOrdersTable();
};

// Helper format tanggal transaksi profesional (Contoh: Minggu, 12 Jul 2026 - 15:30)
function formatTransactionDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        
        const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        
        const dayName = dayNames[d.getDay()];
        const dateNum = String(d.getDate()).padStart(2, '0');
        const monthName = monthNames[d.getMonth()];
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        
        return `${dayName}, ${dateNum} ${monthName} ${year} - ${hours}:${minutes}`;
    } catch(e) {
        return dateStr;
    }
}

window.renderOrdersTable = function() {
    const tbody = document.getElementById('orders-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let filtered = allOrders.filter(o => {
        if (currentOrderFilter === 'ALL') return true;
        return o.status === currentOrderFilter;
    });
    
    // Sort logic
    if (currentOrderSort === 'newest') {
        filtered.sort((a, b) => b.id - a.id);
    } else if (currentOrderSort === 'oldest') {
        filtered.sort((a, b) => a.id - b.id);
    } else if (currentOrderSort === 'name-asc') {
        filtered.sort((a, b) => {
            const nameA = (a.customer_name || '').toLowerCase();
            const nameB = (b.customer_name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    } else if (currentOrderSort === 'name-desc') {
        filtered.sort((a, b) => {
            const nameA = (a.customer_name || '').toLowerCase();
            const nameB = (b.customer_name || '').toLowerCase();
            return nameB.localeCompare(nameA);
        });
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 30px; text-align: center; color: var(--text-secondary);">Tidak ada pesanan dengan status "${currentOrderFilter}"</td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach(order => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        
        const dateFormatted = formatTransactionDate(order.created_at);
        
        const statusBadge = order.status === 'PENDING' 
            ? `<span class="badge" style="background: rgba(255,214,10,0.15); color: #ffd60a; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; display: inline-block;">Menunggu</span>`
            : order.status === 'SELESAI'
                ? `<span class="badge" style="background: rgba(48,209,88,0.15); color: #30d158; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; display: inline-block;">Selesai</span>`
                : `<span class="badge" style="background: rgba(255,69,58,0.15); color: #ff453a; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; display: inline-block;">Batal</span>`;
                
        tr.innerHTML = `
            <td style="padding: 12px 16px; font-weight: 500; font-family: monospace;">#${order.id}</td>
            <td style="padding: 12px 16px;">
                <div style="font-weight: 600;">${order.customer_name}</div>
                <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                    <a href="https://wa.me/${order.customer_number}" target="_blank" style="color: #30d158; font-size: 0.75rem; text-decoration: none; display: flex; align-items: center; gap: 2px;">
                        <i data-lucide="message-circle" style="width: 12px; height: 12px;"></i> ${order.customer_number}
                    </a>
                </div>
            </td>
            <td style="padding: 12px 16px; font-size: 0.9rem; white-space: pre-wrap;">${order.details}</td>
            <td style="padding: 12px 16px; font-size: 0.8rem; color: var(--text-secondary);">${dateFormatted}</td>
            <td style="padding: 12px 16px;">${statusBadge}</td>
            <td style="padding: 12px 16px; text-align: right;">
                <div style="display: flex; gap: 6px; justify-content: flex-end;">
                    ${order.status === 'PENDING' ? `
                        <button class="btn btn-primary" onclick="updateOrderStatus(${order.id}, 'SELESAI')" style="font-size: 0.75rem; padding: 4px 8px; background: #30d158; border-color: #30d158;">Selesai</button>
                        <button class="btn btn-secondary" onclick="updateOrderStatus(${order.id}, 'BATAL')" style="font-size: 0.75rem; padding: 4px 8px; color: #ff453a; border-color: rgba(255,69,58,0.3);">Batal</button>
                    ` : ''}
                    <button class="btn btn-secondary" onclick="deleteOrder(${order.id})" style="font-size: 0.75rem; padding: 4px 8px; color: #ff453a; border-color: rgba(255,69,58,0.2);">Hapus</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    if (window.lucide) lucide.createIcons();
};

window.updateOrderStatus = async function(id, status) {
    try {
        const res = await fetch(`/api/orders/${id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            loadOrders();
        } else {
            alert('Gagal memperbarui status pesanan');
        }
    } catch (err) {
        console.error('Error updateOrderStatus:', err);
    }
};

window.deleteOrder = async function(id) {
    if (!confirm('Hapus pesanan ini dari riwayat?')) return;
    try {
        const res = await fetch(`/api/orders/${id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            loadOrders();
        } else {
            alert('Gagal menghapus pesanan');
        }
    } catch (err) {
        console.error('Error deleteOrder:', err);
    }
};

// WebSocket Order Listener
socket.on('order_created', (newOrder) => {
    playNotificationSound();
    
    const toast = document.createElement('div');
    toast.style = 'position: fixed; top: 20px; right: 20px; background: #0a84ff; color: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 9999; display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 0.9rem; animation: slideIn 0.3s ease;';
    toast.innerHTML = `<i data-lucide="shopping-bag" style="width: 18px; height: 18px;"></i> <span>Pesanan Baru Masuk! #${newOrder.id}</span>`;
    document.body.appendChild(toast);
    
    if (window.lucide) lucide.createIcons();
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);

    const activeTab = document.querySelector('.ios-tab-btn.active');
    if (activeTab && activeTab.id === 'btn-tab-shop') {
        loadOrders();
    } else {
        const btnShop = document.getElementById('btn-tab-shop');
        if (btnShop) {
            btnShop.style.position = 'relative';
            let dot = document.getElementById('transaction-badge-dot');
            if (!dot) {
                dot = document.createElement('span');
                dot.id = 'transaction-badge-dot';
                dot.style = 'position: absolute; top: 6px; right: 12px; width: 8px; height: 8px; background: #ff453a; border-radius: 50%;';
                btnShop.appendChild(dot);
            }
        }
    }
});

let allInvoices = [];
let currentInvoiceFilter = 'ALL';
let currentInvoiceSort = 'newest';

window.sortInvoices = function(criteria) {
    currentInvoiceSort = criteria;
    renderInvoicesTable();
};

window.loadInvoices = async function() {
    try {
        const res = await fetch('/api/invoices');
        if (!res.ok) throw new Error('Gagal mengambil data invoice');
        allInvoices = await res.json();
        
        const total = allInvoices.length;
        const proses = allInvoices.filter(i => i.status === 'PROSES').length;
        const selesai = allInvoices.filter(i => i.status === 'SELESAI').length;
        
        document.getElementById('invoice-stat-total').textContent = total;
        document.getElementById('invoice-stat-proses').textContent = proses;
        document.getElementById('invoice-stat-selesai').textContent = selesai;
        
        const dot = document.getElementById('transaction-badge-dot');
        if (dot) dot.remove();
        
        renderInvoicesTable();
    } catch (err) {
        console.error('Error loadInvoices:', err);
    }
};

window.filterInvoices = function(status) {
    currentInvoiceFilter = status;
    const buttons = document.querySelectorAll('.invoice-filter-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(status)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderInvoicesTable();
};

window.renderInvoicesTable = function() {
    const tbody = document.getElementById('invoices-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let filtered = allInvoices.filter(i => {
        if (currentInvoiceFilter === 'ALL') return true;
        return i.status === currentInvoiceFilter;
    });
    
    // Sort logic
    if (currentInvoiceSort === 'newest') {
        filtered.sort((a, b) => {
            const idA = parseInt((a.id || '').replace(/\D/g, ''), 10) || 0;
            const idB = parseInt((b.id || '').replace(/\D/g, ''), 10) || 0;
            return idB - idA;
        });
    } else if (currentInvoiceSort === 'oldest') {
        filtered.sort((a, b) => {
            const idA = parseInt((a.id || '').replace(/\D/g, ''), 10) || 0;
            const idB = parseInt((b.id || '').replace(/\D/g, ''), 10) || 0;
            return idA - idB;
        });
    } else if (currentInvoiceSort === 'name-asc') {
        filtered.sort((a, b) => {
            const nameA = (a.customer_name || '').toLowerCase();
            const nameB = (b.customer_name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    } else if (currentInvoiceSort === 'name-desc') {
        filtered.sort((a, b) => {
            const nameA = (a.customer_name || '').toLowerCase();
            const nameB = (b.customer_name || '').toLowerCase();
            return nameB.localeCompare(nameA);
        });
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 30px; text-align: center; color: var(--text-secondary);">Tidak ada invoice dengan status "${currentInvoiceFilter}"</td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach(inv => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        
        const dateFormatted = formatTransactionDate(inv.created_at);
        
        const statusBadge = inv.status === 'PROSES' 
            ? `<span class="badge" style="background: rgba(255,214,10,0.15); color: #ffd60a; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; display: inline-block;">Diproses</span>`
            : `<span class="badge" style="background: rgba(48,209,88,0.15); color: #30d158; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; display: inline-block;">Selesai</span>`;
                
        tr.innerHTML = `
            <td style="padding: 12px 16px; font-weight: 500; font-family: monospace;">#${inv.id}</td>
            <td style="padding: 12px 16px;">
                <div style="font-weight: 600;">${inv.customer_name}</div>
                <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                    <a href="https://wa.me/${inv.customer_number}" target="_blank" style="color: #30d158; font-size: 0.75rem; text-decoration: none; display: flex; align-items: center; gap: 2px;">
                        <i data-lucide="message-circle" style="width: 12px; height: 12px;"></i> ${inv.customer_number}
                    </a>
                </div>
            </td>
            <td style="padding: 12px 16px; font-size: 0.9rem; white-space: pre-wrap;">${inv.details}</td>
            <td style="padding: 12px 16px; font-size: 0.8rem; color: var(--text-secondary);">${dateFormatted}</td>
            <td style="padding: 12px 16px;">${statusBadge}</td>
            <td style="padding: 12px 16px; text-align: right;">
                <div style="display: flex; gap: 6px; justify-content: flex-end;">
                    ${inv.status === 'PROSES' ? `
                        <button class="btn btn-primary" onclick="updateInvoiceStatus('${inv.id}', 'SELESAI')" style="font-size: 0.75rem; padding: 4px 8px; background: #30d158; border-color: #30d158;">Selesai</button>
                    ` : ''}
                    <button class="btn btn-secondary" onclick="deleteInvoice('${inv.id}')" style="font-size: 0.75rem; padding: 4px 8px; color: #ff453a; border-color: rgba(255,69,58,0.2);">Hapus</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    if (window.lucide) lucide.createIcons();
};

window.updateInvoiceStatus = async function(id, status) {
    try {
        const res = await fetch(`/api/invoices/${id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            loadInvoices();
        } else {
            alert('Gagal memperbarui status invoice');
        }
    } catch (err) {
        console.error('Error updateInvoiceStatus:', err);
    }
};

window.deleteInvoice = async function(id) {
    if (!confirm('Hapus invoice ini dari riwayat?')) return;
    try {
        const res = await fetch(`/api/invoices/${id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            loadInvoices();
        } else {
            alert('Gagal menghapus invoice');
        }
    } catch (err) {
        console.error('Error deleteInvoice:', err);
    }
};

// WebSocket Invoice Listener
socket.on('invoice_created', (newInv) => {
    playNotificationSound();
    
    const toast = document.createElement('div');
    toast.style = 'position: fixed; top: 20px; right: 20px; background: #ff9f0a; color: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 9999; display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 0.9rem; animation: slideIn 0.3s ease;';
    toast.innerHTML = `<i data-lucide="file-text" style="width: 18px; height: 18px;"></i> <span>Invoice Baru Dicetak! #${newInv.id}</span>`;
    document.body.appendChild(toast);
    
    if (window.lucide) lucide.createIcons();
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);

    const activeTab = document.querySelector('.ios-tab-btn.active');
    if (activeTab && activeTab.id === 'btn-tab-shop') {
        loadInvoices();
    } else {
        const btnShop = document.getElementById('btn-tab-shop');
        if (btnShop) {
            btnShop.style.position = 'relative';
            let dot = document.getElementById('transaction-badge-dot');
            if (!dot) {
                dot = document.createElement('span');
                dot.id = 'transaction-badge-dot';
                dot.style = 'position: absolute; top: 6px; right: 12px; width: 8px; height: 8px; background: #ff9f0a; border-radius: 50%;';
                btnShop.appendChild(dot);
            }
        }
    }
});

// --- NEW TRANSACTIONS REQUIREMENTS ---
window.exportCashHistoryCSV = function() {
    console.log("exportCashHistoryCSV placeholder");
};
window.quickSearchOrder = function(query) {
    console.log("quickSearchOrder placeholder");
};
window.showOrderDetails = function(id) {
    console.log("showOrderDetails placeholder");
};
window.updateOrderStatusManual = function(id, status) {
    if(window.updateOrderStatus) window.updateOrderStatus(id, status);
};
