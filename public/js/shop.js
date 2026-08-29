// ==========================================
// SHOP, HOST ADMIN & CRM MODULE
// ==========================================

let activeCustomers = [];
let selectedNodeId = null;

// ─── 1. HOST ADMIN MANAGEMENT ───────────────────────────
window.loadHostAdmins = async function() {
    const list = document.getElementById('shop-admins-list');
    if (!list) return;
    list.innerHTML = '<p class="text-center text-slate-500 text-xs py-4">Memuat daftar admin...</p>';

    try {
        const resDb = await fetch('/api/shop/admins');
        if (!resDb.ok) throw new Error('Gagal memuat admin dari database');
        const dbAdmins = await resDb.json();

        list.innerHTML = '';

        if (!dbAdmins || dbAdmins.length === 0) {
            list.innerHTML = `
                <div class="p-4 text-center bg-[#0b1120] border border-white/10 rounded-xl">
                    <p class="text-xs text-slate-400">Belum ada Host Admin terdaftar.</p>
                </div>
            `;
            return;
        }

        dbAdmins.forEach(admin => {
            const phone = typeof admin === 'string' ? admin : (admin.phone || '');
            const cleanPhone = (phone || '').replace(/\D/g, '');
            const name = typeof admin === 'string' ? 'Host Admin' : (admin.name || 'Host Admin');
            
            const card = document.createElement('div');
            card.className = 'p-3 rounded-xl bg-[#0b1120] border border-white/10 flex items-center justify-between gap-3';
            card.innerHTML = `
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                        <i data-lucide="shield-check" class="w-4 h-4"></i>
                    </div>
                    <div class="min-w-0">
                        <h4 class="text-xs font-bold text-white truncate">${name}</h4>
                        <p class="text-[11px] text-slate-400 font-mono">+${cleanPhone}</p>
                    </div>
                </div>
                <button onclick="window.removeHostAdminDirect('${cleanPhone}@c.us')" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs transition-all" title="Hapus Admin">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            `;
            list.appendChild(card);
        });

        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('Error loadHostAdmins:', err);
        if (list) list.innerHTML = `<p class="text-center text-rose-400 text-xs py-4">Gagal: ${err.message}</p>`;
    }
};

window.removeHostAdminDirect = async function(phoneJid) {
    if (!confirm(`Hapus hak akses Host Admin untuk ${phoneJid}?`)) return;
    try {
        const res = await fetch('/api/shop/admins', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneJid })
        });
        if (res.ok) {
            alert('Host Admin berhasil dihapus.');
            window.loadHostAdmins();
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        alert('Gagal menghapus admin: ' + err.message);
    }
};

// ─── 2. CUSTOMERS CRM ────────────────────────────────────
window.loadCustomersList = async function() {
    const list = document.getElementById('shop-customers-list');
    if (!list) return;
    list.innerHTML = '<p class="text-center text-slate-500 text-xs py-4">Memuat data kontak...</p>';

    try {
        const res = await fetch('/api/shop/customers');
        if (!res.ok) throw new Error('Gagal memuat pelanggan');
        activeCustomers = await res.json();
        
        list.innerHTML = '';
        
        if (!activeCustomers || activeCustomers.length === 0) {
            list.innerHTML = '<p class="text-center text-slate-500 text-xs py-6">Belum ada pelanggan terdeteksi.</p>';
            return;
        }
        
        activeCustomers.forEach((cust, idx) => {
            const cleanPhone = (cust.phone || '').replace(/\D/g, '');
            const card = document.createElement('div');
            card.className = 'customer-item-card p-3 rounded-xl bg-[#0b1120] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3';
            
            card.innerHTML = `
                <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex items-center gap-2">
                        <input type="text" id="cust-name-${idx}" value="${cust.name || 'Pelanggan'}" class="bg-transparent border-b border-white/10 hover:border-indigo-500 text-xs font-semibold text-white focus:outline-none px-1 py-0.5" placeholder="Nama">
                        <a href="https://wa.me/${cleanPhone}" target="_blank" class="text-[11px] text-emerald-400 font-mono flex items-center gap-1 hover:underline">
                            +${cleanPhone}
                            <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                        </a>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-[11px]">
                        <input type="text" id="cust-notes-${idx}" value="${cust.notes || ''}" placeholder="Catatan / Alamat..." class="bg-[#090d16] border border-white/10 rounded-lg px-2 py-1 text-slate-300 focus:outline-none focus:border-indigo-500">
                        <input type="text" id="cust-labels-${idx}" value="${(cust.labels || []).join ? (cust.labels || []).join(', ') : (cust.labels || '')}" placeholder="Tag (VIP, Reseller)" class="bg-[#090d16] border border-white/10 rounded-lg px-2 py-1 text-slate-300 focus:outline-none focus:border-indigo-500">
                    </div>
                </div>

                <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button onclick="saveCustomerInfo(${idx})" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm">
                        Simpan
                    </button>
                </div>
            `;
            list.appendChild(card);
        });
        
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('Error loadCustomersList:', err);
        if (list) list.innerHTML = `<p class="text-center text-rose-400 text-xs py-4">Gagal: ${err.message}</p>`;
    }
};

window.saveCustomerInfo = async function(idx) {
    const cust = activeCustomers[idx];
    if (!cust) return;

    const name = document.getElementById(`cust-name-${idx}`).value.trim();
    const notes = document.getElementById(`cust-notes-${idx}`).value.trim();
    const labelsRaw = document.getElementById(`cust-labels-${idx}`).value.trim();
    const labels = labelsRaw ? labelsRaw.split(',').map(s => s.trim()) : [];

    try {
        const res = await fetch('/api/shop/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: cust.phone, name, notes, labels })
        });
        if (res.ok) {
            alert('Data pelanggan berhasil disimpan!');
            cust.name = name;
            cust.notes = notes;
            cust.labels = labels;
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        alert('Gagal menyimpan pelanggan: ' + err.message);
    }
};

window.filterCustomersTable = function() {
    const input = document.getElementById('customer-search-input');
    if (!input) return;
    const query = input.value.toLowerCase().trim();

    const cards = document.querySelectorAll('#shop-customers-list .customer-item-card');
    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query) ? 'flex' : 'none';
    });
};

// ─── 3. MENU TREE BUILDER ────────────────────────────────
window.renderMenuTreeVisual = function() {
    const container = document.getElementById('menu-tree-visualizer');
    if (!container) return;
    
    if (!window.selectedGroupConfig || !window.selectedGroupConfig.menuTree) {
        container.innerHTML = `
            <div class="p-6 text-center bg-[#0b1120] border border-white/10 rounded-2xl">
                <i data-lucide="git-fork" class="w-8 h-8 mx-auto text-slate-600 mb-2"></i>
                <p class="text-xs text-slate-400">Pilih grup pada tab <strong>Manajemen Grup</strong> untuk melihat struktur menu pohon.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }
    
    container.innerHTML = '';
    const rootNode = window.selectedGroupConfig.menuTree;
    
    const rootEl = createNodeHTML(rootNode, 0);
    container.appendChild(rootEl);
    
    if (window.lucide) lucide.createIcons();
};

function createNodeHTML(node, depth) {
    const div = document.createElement('div');
    div.style.marginLeft = `${depth * 16}px`;
    div.className = 'my-1';
    
    const header = document.createElement('div');
    const isSelected = selectedNodeId === node.id;
    header.className = `flex items-center gap-2 p-2 rounded-xl text-xs border transition-all cursor-pointer ${
        isSelected ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-[#0b1120] border-white/10 text-slate-300 hover:border-white/20'
    }`;
    
    header.onclick = (e) => {
        e.stopPropagation();
        selectTreeNode(node.id);
    };
    
    const iconName = node.type === 'category' ? 'folder' : 'file-text';
    const iconColor = node.type === 'category' ? 'text-amber-400' : 'text-sky-400';
    
    header.innerHTML = `
        <i data-lucide="${iconName}" class="w-3.5 h-3.5 ${iconColor}"></i>
        <span class="font-medium flex-1 truncate">${node.name || 'Menu'}</span>
        ${node.status ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10">${node.status}</span>` : ''}
        ${node.type === 'category' && node.children ? `<span class="text-[10px] text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">${node.children.length}</span>` : ''}
    `;
    
    div.appendChild(header);
    
    if (node.type === 'category' && node.children && node.children.length > 0) {
        const childContainer = document.createElement('div');
        node.children.forEach(child => {
            const childEl = createNodeHTML(child, depth + 1);
            childContainer.appendChild(childEl);
        });
        div.appendChild(childContainer);
    }
    
    return div;
}

function findNodeInTree(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
            const found = findNodeInTree(child, id);
            if (found) return found;
        }
    }
    return null;
}

window.selectTreeNode = function(nodeId) {
    selectedNodeId = nodeId;
    window.renderMenuTreeVisual();
};

// Initializer
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.loadHostAdmins) window.loadHostAdmins();
        if (window.loadCustomersList) window.loadCustomersList();
    }, 500);
});
