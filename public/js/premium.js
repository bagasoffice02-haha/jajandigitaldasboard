// ==========================================
// PREMIUM MANAGER TAB LOGIC
// ==========================================
let premiumProducts = [];
let premiumAccounts = [];
let premiumSales = [];

window.openPremiumModal = function(type) {
    const modal = document.getElementById('modal-premium-' + type);
    if (modal) {
        modal.classList.remove('hidden-modal');
        if (type === 'sale') {
            loadPremiumAccountsListForSale();
        } else if (type === 'account') {
            loadPremiumProductsListForAccount();
        } else if (type === 'apk') {
            window.renderPremiumApkList();
        }
    }
};

window.closePremiumModal = function(type) {
    const modal = document.getElementById('modal-premium-' + type);
    if (modal) {
        modal.classList.add('hidden-modal');
    }
};

window.closePremiumModalOnOverlay = function(event, type) {
    if (event.target.classList.contains('premium-modal')) {
        closePremiumModal(type);
    }
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
        if (!res.ok) throw new Error('Gagal memuat produk');
        premiumProducts = await res.json();
    } catch(err) {
        console.error('Error loadPremiumProducts:', err);
    }
}

async function loadPremiumAccounts() {
    try {
        const res = await fetch('/api/premium/accounts');
        if (!res.ok) throw new Error('Gagal memuat akun');
        premiumAccounts = await res.json();
        renderPremiumAccountsTable();
    } catch(err) {
        console.error('Error loadPremiumAccounts:', err);
    }
}

async function loadPremiumSales() {
    try {
        const res = await fetch('/api/premium/sales');
        if (!res.ok) throw new Error('Gagal memuat penjualan');
        premiumSales = await res.json();
        renderPremiumSalesTable();
    } catch(err) {
        console.error('Error loadPremiumSales:', err);
    }
}

function updatePremiumStats() {
    const todayStr = new Date().toISOString().substring(0, 10);
    const activeSubs = premiumSales.filter(s => s.payment_status === 'Lunas' && s.end_date >= todayStr).length;
    document.getElementById('stat-active-subscribers').textContent = activeSubs;
    
    const totalAccs = premiumAccounts.length;
    const readyAccs = premiumAccounts.filter(a => a.status === 'Tersedia').length;
    document.getElementById('stat-stock-ratio').textContent = `${readyAccs} / ${totalAccs}`;
    
    const activeSales = premiumSales.filter(s => s.payment_status === 'Lunas' && s.end_date >= todayStr);
    const estimatedRev = activeSales.reduce((acc, curr) => acc + (curr.price || 0), 0);
    document.getElementById('stat-monthly-revenue').textContent = `Rp ${estimatedRev.toLocaleString('id-ID')}`;
    
    const soonExpiring = premiumSales.filter(s => {
        if (!s.end_date) return false;
        const diffTime = new Date(s.end_date) - new Date();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 5 && diffDays >= 0;
    }).length;
    document.getElementById('stat-expiring-soon').textContent = soonExpiring;
}

function renderPremiumAccountsTable() {
    const tbody = document.getElementById('premium-accounts-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (premiumAccounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">Belum ada stok akun premium.</td></tr>';
        return;
    }
    
    premiumAccounts.forEach(acc => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        let statusColor = '#ffd60a'; 
        if (acc.status === 'Penuh') statusColor = '#ff453a';
        if (acc.status === 'Nonaktif') statusColor = 'var(--text-secondary)';
        if (acc.status === 'Tersedia') statusColor = '#30d158';

        tr.innerHTML = `
            <td style="padding: 10px 8px; font-weight: 600;">${acc.product_name || 'APK'}</td>
            <td style="padding: 10px 8px;">
                <div style="font-weight: 500;">${acc.email}</div>
                <div style="font-size: 0.7rem; color: var(--text-secondary); font-family: monospace;">Pass: ${acc.password}</div>
                ${acc.notes ? `<div style="font-size: 0.7rem; color: #ffd60a; margin-top: 2px;">📝 ${acc.notes}</div>` : ''}
            </td>
            <td style="padding: 10px 8px;">${acc.active_users || 0} / ${acc.max_users}</td>
            <td style="padding: 10px 8px;"><span class="badge" style="background: rgba(255,255,255,0.05); color: ${statusColor};">${acc.status}</span></td>
            <td style="padding: 10px 8px; text-align: right;">
                <button class="btn btn-danger btn-sm" onclick="deletePremiumAccount(${acc.id})" style="padding: 3px 8px; font-size: 0.7rem; min-height: auto; height: 24px; width: auto; display: inline-flex; align-items: center; justify-content: center;"><i data-lucide="trash-2" style="width: 12px; height: 12px;"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function renderPremiumSalesTable() {
    const tbody = document.getElementById('premium-sales-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (premiumSales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-secondary);">Belum ada data penjualan premium.</td></tr>';
        return;
    }
    
    premiumSales.forEach(sale => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        let daysLeft = 0;
        if (sale.end_date) {
            const diffTime = new Date(sale.end_date) - new Date();
            daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
        
        let daysBadge = '';
        if (daysLeft < 0) {
            daysBadge = `<span class="badge" style="background: rgba(255,69,58,0.15); color: #ff453a;">Expired (${Math.abs(daysLeft)} h)</span>`;
        } else if (daysLeft <= 5) {
            daysBadge = `<span class="badge" style="background: rgba(255,214,10,0.15); color: #ffd60a;">${daysLeft} Hari Lagi</span>`;
        } else {
            daysBadge = `<span class="badge" style="background: rgba(48,209,88,0.15); color: #30d158;">${daysLeft} Hari</span>`;
        }

        let paymentColor = sale.payment_status === 'Lunas' ? '#30d158' : '#ffd60a';

        tr.innerHTML = `
            <td style="padding: 10px 8px;">
                <div style="font-weight: 600;">${sale.product_name || 'APK'}</div>
                <div style="font-size: 0.7rem; color: var(--text-secondary); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sale.account_email || ''}</div>
            </td>
            <td style="padding: 10px 8px;">
                <div style="font-weight: 500;">${sale.buyer_name}</div>
                <div style="font-size: 0.7rem; color: var(--text-secondary); font-family: monospace;">+${sale.buyer_phone}</div>
            </td>
            <td style="padding: 10px 8px;">${sale.profile_name || '-'}</td>
            <td style="padding: 10px 8px;">
                ${daysBadge}
                <div style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 2px;">s/d ${sale.end_date || ''}</div>
            </td>
            <td style="padding: 10px 8px;">
                <span class="badge" style="background: rgba(255,255,255,0.05); color: ${paymentColor};">${sale.payment_status}</span>
                <div style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 2px;">Rp ${(sale.price || 0).toLocaleString('id-ID')}</div>
            </td>
            <td style="padding: 10px 8px; text-align: right;">
                <div style="display: flex; gap: 4px; justify-content: flex-end; align-items: center;">
                    <button class="btn btn-secondary btn-sm" onclick="sendPremiumReminder(${sale.id}, this)" title="Kirim Pengingat WA" style="padding: 3px 8px; font-size: 0.7rem; min-height: auto; height: 24px; width: auto; display: inline-flex; align-items: center; justify-content: center; color: #25d366;"><i data-lucide="bell" style="width: 12px; height: 12px;"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="deletePremiumSale(${sale.id})" style="padding: 3px 8px; font-size: 0.7rem; min-height: auto; height: 24px; width: auto; display: inline-flex; align-items: center; justify-content: center;"><i data-lucide="trash-2" style="width: 12px; height: 12px;"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function loadPremiumProductsListForAccount() {
    const select = document.getElementById('acc-product-id');
    if (!select) return;
    select.innerHTML = '<option value="">-- Pilih APK --</option>';
    premiumProducts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

function loadPremiumAccountsListForSale() {
    const select = document.getElementById('sale-account-id');
    if (!select) return;
    select.innerHTML = '<option value="">-- Pilih Akun --</option>';
    premiumAccounts.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.product_name || 'APK'} - ${a.email} (${a.active_users || 0}/${a.max_users} User)`;
        select.appendChild(opt);
    });
}

window.renderPremiumApkList = function() {
    const list = document.getElementById('premium-apk-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (premiumProducts.length === 0) {
        list.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-secondary); width: 100%; text-align: center;">Belum ada jenis APK. Tambahkan di atas.</span>';
        return;
    }
    
    premiumProducts.forEach(p => {
        const badge = document.createElement('div');
        badge.style = 'display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.75rem; font-weight: 500;';
        badge.innerHTML = `
            <span>${p.name}</span>
            <i data-lucide="x" onclick="deletePremiumProduct(${p.id})" style="width: 12px; height: 12px; color: var(--text-secondary); cursor: pointer; transition: color 0.15s;" onmouseover="this.style.color='#ff453a'" onmouseout="this.style.color='var(--text-secondary)'"></i>
        `;
        list.appendChild(badge);
    });
    lucide.createIcons();
};

window.addPremiumProduct = async function() {
    const input = document.getElementById('premium-apk-name');
    if (!input || !input.value.trim()) return;
    const name = input.value.trim();
    
    try {
        const res = await fetch('/api/premium/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        
        input.value = '';
        await loadPremiumProducts();
        window.renderPremiumApkList();
    } catch(err) {
        alert('Gagal menambah jenis APK: ' + err.message);
    }
};

window.deletePremiumProduct = async function(id) {
    if (!confirm('Hapus jenis APK ini? Semua akun dengan jenis ini juga akan terpengaruh.')) return;
    try {
        const res = await fetch('/api/premium/products/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        
        await loadPremiumProducts();
        window.renderPremiumApkList();
        loadPremiumAccounts(); 
    } catch(err) {
        alert('Gagal menghapus APK: ' + err.message);
    }
};

window.deletePremiumAccount = async function(id) {
    if (!confirm('Hapus akun premium ini dari stok?')) return;
    try {
        const res = await fetch('/api/premium/accounts/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        loadPremiumAccounts();
    } catch(err) {
        alert('Gagal menghapus akun: ' + err.message);
    }
};

window.deletePremiumSale = async function(id) {
    if (!confirm('Hapus data penjualan ini?')) return;
    try {
        const res = await fetch('/api/premium/sales/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        loadPremiumSales();
    } catch(err) {
        alert('Gagal menghapus data penjualan: ' + err.message);
    }
};

window.sendPremiumReminder = async function(id, btn) {
    const oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="loader" style="width:10px; height:10px; border-width:1.5px; display:inline-block;"></span>';
    
    try {
        const res = await fetch('/api/premium/send-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saleId: id })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        alert('✅ Pesan WhatsApp reminder manual berhasil dikirim ke pembeli!');
    } catch(err) {
        alert('❌ Gagal mengirim reminder WA: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
    }
}

// --- NEW PREMIUM REQUIREMENTS ---
window.addPremiumSale = async function() {
    console.log("addPremiumSale placeholder");
};
window.crudPremiumProduct = function(action, id) {
    console.log("crudPremiumProduct placeholder");
};
window.allocatePremiumSlot = function(accountId, type) {
    console.log("allocatePremiumSlot placeholder");
};
window.filterPremiumAvailability = function(status) {
    console.log("filterPremiumAvailability placeholder");
};
window.showDueDateReminder = function() {
    console.log("showDueDateReminder placeholder");
};
window.calculateStockAndRevenue = function() {
    console.log("calculateStockAndRevenue placeholder");
};
