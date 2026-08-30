// ==========================================
// SHOP, HOST ADMIN, CRM & VISUAL MENU TREE
// ==========================================

let activeCustomers = [];
window.selectedNodeId = 'root';

// ─── 1. HOST ADMIN MANAGEMENT ───────────────────────────
window.loadHostAdmins = async function() {
    const list = document.getElementById('shop-admins-list');
    if (!list) return;
    list.innerHTML = '<p class="text-center text-[var(--text-muted)] text-xs py-4">Memuat daftar admin...</p>';

    try {
        const resDb = await fetch('/api/shop/admins');
        if (!resDb.ok) throw new Error('Gagal memuat admin dari database');
        const dbAdmins = await resDb.json();

        list.innerHTML = '';

        if (!dbAdmins || dbAdmins.length === 0) {
            list.innerHTML = `
                <div class="p-4 text-center bg-[#0b1120] border border-[var(--border-color)] rounded-xl">
                    <p class="text-xs text-[var(--text-muted)]">Belum ada Host Admin terdaftar.</p>
                </div>
            `;
            return;
        }

        dbAdmins.forEach(admin => {
            const phone = typeof admin === 'string' ? admin : (admin.phone || '');
            const cleanPhone = (phone || '').replace(/\D/g, '');
            const name = typeof admin === 'string' ? 'Host Admin' : (admin.name || 'Host Admin');
            
            const card = document.createElement('div');
            card.className = 'p-3 rounded-xl bg-[#0b1120] border border-[var(--border-color)] flex items-center justify-between gap-3';
            card.innerHTML = `
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                        <i data-lucide="shield-check" class="w-4 h-4"></i>
                    </div>
                    <div class="min-w-0">
                        <h4 class="text-xs font-bold text-[var(--text-primary)] truncate">${name}</h4>
                        <p class="text-[11px] text-[var(--text-muted)] font-mono">+${cleanPhone}</p>
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
    list.innerHTML = '<p class="text-center text-[var(--text-muted)] text-xs py-4">Memuat data kontak...</p>';

    try {
        const res = await fetch('/api/shop/customers');
        if (!res.ok) throw new Error('Gagal memuat pelanggan');
        activeCustomers = await res.json();
        
        list.innerHTML = '';
        
        if (!activeCustomers || activeCustomers.length === 0) {
            list.innerHTML = '<p class="text-center text-[var(--text-muted)] text-xs py-6">Belum ada pelanggan terdeteksi.</p>';
            return;
        }
        
        activeCustomers.forEach((cust, idx) => {
            const cleanPhone = (cust.phone || '').replace(/\D/g, '');
            const card = document.createElement('div');
            card.className = 'customer-item-card p-3 rounded-xl bg-[#0b1120] border border-[var(--border-color)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3';
            
            card.innerHTML = `
                <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex items-center gap-2">
                        <input type="text" id="cust-name-${idx}" value="${cust.name || 'Pelanggan'}" class="bg-transparent border-b border-[var(--border-color)] hover:border-indigo-500 text-xs font-semibold text-[var(--text-primary)] focus:outline-none px-1 py-0.5" placeholder="Nama">
                        <a href="https://wa.me/${cleanPhone}" target="_blank" class="text-[11px] text-emerald-400 font-mono flex items-center gap-1 hover:underline">
                            +${cleanPhone}
                            <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                        </a>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-[11px]">
                        <input type="text" id="cust-notes-${idx}" value="${cust.notes || ''}" placeholder="Catatan / Alamat..." class="bg-[#090d16] border border-[var(--border-color)] rounded-lg px-2 py-1 text-[var(--text-secondary)] focus:outline-none focus:border-indigo-500">
                        <input type="text" id="cust-labels-${idx}" value="${(cust.labels || []).join ? (cust.labels || []).join(', ') : (cust.labels || '')}" placeholder="Tag (VIP, Reseller)" class="bg-[#090d16] border border-[var(--border-color)] rounded-lg px-2 py-1 text-[var(--text-secondary)] focus:outline-none focus:border-indigo-500">
                    </div>
                </div>

                <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button onclick="saveCustomerInfo(${idx})" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[var(--text-primary)] text-xs font-semibold shadow-sm">
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

// ─── 3. VISUAL MENU TREE BUILDER ─────────────────────────

// Helper: Cari node di dalam pohon secara rekursif
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

// Render pohon visual
window.renderMenuTreeVisual = async function() {
    const container = document.getElementById('menu-tree-visualizer');
    if (!container) return;

    // Pastikan kita memiliki group config aktif
    if (!window.selectedGroupConfig || !window.selectedGroupConfig.menuTree) {
        // Coba muat grup aktif pertama jika ada
        if (window.activeGroups && window.activeGroups.length > 0 && !window.selectedGroupId) {
            await window.selectGroup(window.activeGroups[0].id);
        } else if (window.selectedGroupId) {
            try {
                const res = await fetch(`/api/group-config/${window.selectedGroupId}`);
                if (res.ok) {
                    window.selectedGroupConfig = await res.json();
                }
            } catch(e) {}
        }
    }
    
    if (!window.selectedGroupConfig || !window.selectedGroupConfig.menuTree) {
        container.innerHTML = `
            <div class="p-6 text-center bg-[#0b1120] border border-[var(--border-color)] rounded-2xl">
                <i data-lucide="git-fork" class="w-8 h-8 mx-auto text-slate-600 mb-2"></i>
                <p class="text-xs text-[var(--text-muted)]">Pilih grup pada tab <strong>Manajemen Grup</strong> untuk melihat struktur menu pohon.</p>
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

    // Pastikan form editor aktif menampilkan data node yang terpilih
    if (window.selectedNodeId) {
        window.loadNodeDataToEditor(window.selectedNodeId);
    }
};

function createNodeHTML(node, depth) {
    const div = document.createElement('div');
    div.style.marginLeft = `${depth * 14}px`;
    div.className = 'my-1';
    
    const isSelected = window.selectedNodeId === node.id;
    const isCategory = node.type === 'category';
    
    const header = document.createElement('div');
    header.className = `menu-node-item ${isSelected ? 'selected' : ''}`;
    
    header.onclick = (e) => {
        e.stopPropagation();
        window.selectTreeNode(node.id);
    };
    
    const iconName = isCategory ? 'folder' : 'file-text';
    const iconColor = isCategory ? 'text-amber-400' : 'text-sky-400';
    
    let statusClass = 'tersedia';
    if (node.status === 'Habis') statusClass = 'habis';
    if (node.status === 'Pre-order') statusClass = 'preorder';

    const statusBadge = (!isCategory && node.status) 
        ? `<span class="status-badge-item ${statusClass}" onclick="window.quickToggleStatus(event, '${node.id}')" title="Klik untuk ubah status">${node.status}</span>`
        : '';

    const promoBadge = node.isPromo ? '<span class="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-bold">🔥 PROMO</span>' : '';

    header.innerHTML = `
        <i data-lucide="${iconName}" class="w-3.5 h-3.5 ${iconColor} shrink-0"></i>
        <span class="font-medium flex-1 truncate text-xs ${isSelected ? 'text-[var(--text-primary)] font-bold' : 'text-[var(--text-primary)]'}">${node.name || 'Menu'}</span>
        ${promoBadge}
        ${statusBadge}
        ${isCategory && node.children ? `<span class="text-[10px] text-[var(--text-muted)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">${node.children.length} item</span>` : ''}
    `;
    
    div.appendChild(header);
    
    if (isCategory && node.children && node.children.length > 0) {
        const childContainer = document.createElement('div');
        childContainer.className = 'border-l border-[var(--border-color)] pl-2 ml-2';
        node.children.forEach(child => {
            const childEl = createNodeHTML(child, depth + 1);
            childContainer.appendChild(childEl);
        });
        div.appendChild(childContainer);
    }
    
    return div;
}

// Quick toggle status Tersedia / Habis / Pre-order
window.quickToggleStatus = function(e, nodeId) {
    if (e) e.stopPropagation();
    if (!window.selectedGroupConfig) return;
    
    const node = findNodeInTree(window.selectedGroupConfig.menuTree, nodeId);
    if (node && node.type !== 'category') {
        const statuses = ['Tersedia', 'Habis', 'Pre-order'];
        const currentIdx = statuses.indexOf(node.status || 'Tersedia');
        const nextIdx = (currentIdx + 1) % statuses.length;
        node.status = statuses[nextIdx];
        
        window.renderMenuTreeVisual();
        if (window.selectedNodeId === nodeId) {
            const statusSelect = document.getElementById('node-status');
            if (statusSelect) statusSelect.value = node.status;
        }
    }
};

// Memilih node untuk ditampilkan di editor form sebelah kanan
window.selectTreeNode = function(nodeId) {
    window.selectedNodeId = nodeId;
    window.renderMenuTreeVisual();
    window.loadNodeDataToEditor(nodeId);
};

window.loadNodeDataToEditor = function(nodeId) {
    if (!window.selectedGroupConfig) return;
    const node = findNodeInTree(window.selectedGroupConfig.menuTree, nodeId);
    if (!node) return;

    const editorTitle = document.getElementById('node-editor-title');
    const placeholder = document.getElementById('node-editor-placeholder');
    const formPanel = document.getElementById('node-editor-form');

    if (placeholder) placeholder.classList.add('hidden');
    if (formPanel) formPanel.classList.remove('hidden');

    if (editorTitle) editorTitle.textContent = `Edit Menu: ${node.name || node.id}`;

    const inputName = document.getElementById('node-name');
    const inputAliases = document.getElementById('node-aliases');
    const inputType = document.getElementById('node-type');
    const inputText = document.getElementById('node-text');
    const inputStatus = document.getElementById('node-status');
    const inputPromo = document.getElementById('node-promo');
    const inputMedia = document.getElementById('node-media');

    if (inputName) inputName.value = node.name || '';
    if (inputAliases) inputAliases.value = Array.isArray(node.aliases) ? node.aliases.join(', ') : (node.aliases || '');
    if (inputType) inputType.value = node.type || 'content';
    if (inputText) inputText.value = node.text || '';
    if (inputStatus) inputStatus.value = node.status || 'Tersedia';
    if (inputPromo) inputPromo.checked = !!node.isPromo;
    if (inputMedia) inputMedia.value = node.media || '';

    // Sembunyikan field yang tidak relevan jika kategori
    const textSec = document.getElementById('node-sec-text');
    if (textSec) {
        textSec.style.display = node.type === 'category' ? 'none' : 'block';
    }
};

// Helper tambah format teks WhatsApp
window.insertFormatToElement = function(elementId, formatChar) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selected = text.substring(start, end) || 'teks';

    const replacement = `${formatChar}${selected}${formatChar}`;
    el.value = text.substring(0, start) + replacement + text.substring(end);
    el.focus();
    el.setSelectionRange(start + formatChar.length, start + formatChar.length + selected.length);

    // Trigger update ke node aktif
    if (window.selectedGroupConfig && window.selectedNodeId) {
        const node = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
        if (node) node.text = el.value;
    }
};

// Tambah node anak baru
window.addChildNode = function() {
    if (!window.selectedGroupConfig || !window.selectedGroupConfig.menuTree) {
        alert('Pilih grup WhatsApp terlebih dahulu!');
        return;
    }

    let parentNode = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
    if (!parentNode || parentNode.type !== 'category') {
        parentNode = window.selectedGroupConfig.menuTree; // Fallback ke root
    }

    const newId = Date.now().toString();
    const newNode = {
        id: newId,
        name: "Produk / Menu Baru",
        type: "content",
        text: "Deskripsi & harga produk...",
        status: "Tersedia",
        isPromo: false,
        media: ""
    };

    parentNode.children = parentNode.children || [];
    parentNode.children.push(newNode);

    window.selectedNodeId = newId;
    window.renderMenuTreeVisual();
    window.loadNodeDataToEditor(newId);
};

// Hapus node aktif
window.deleteNode = function() {
    if (!window.selectedGroupConfig || !window.selectedNodeId) return;
    if (window.selectedNodeId === 'root') {
        alert('Node Utama (Root) tidak dapat dihapus!');
        return;
    }

    if (!confirm('Apakah Anda yakin ingin menghapus menu ini?')) return;

    function removeRecursive(parentNode, targetId) {
        if (!parentNode.children) return false;
        for (let i = 0; i < parentNode.children.length; i++) {
            if (parentNode.children[i].id === targetId) {
                parentNode.children.splice(i, 1);
                return true;
            }
            if (removeRecursive(parentNode.children[i], targetId)) return true;
        }
        return false;
    }

    removeRecursive(window.selectedGroupConfig.menuTree, window.selectedNodeId);
    window.selectedNodeId = 'root';
    window.renderMenuTreeVisual();
    window.loadNodeDataToEditor('root');
};

// Simpan konfigurasi menu pohon ke server
window.saveGroupConfiguration = async function() {
    if (!window.selectedGroupId || !window.selectedGroupConfig) {
        alert('Pilih grup terlebih dahulu untuk menyimpan menu!');
        return;
    }

    // Ambil data form terkini jika ada
    const inputName = document.getElementById('node-name');
    const inputText = document.getElementById('node-text');
    const inputStatus = document.getElementById('node-status');
    const inputPromo = document.getElementById('node-promo');
    const inputMedia = document.getElementById('node-media');
    const inputAliases = document.getElementById('node-aliases');

    if (window.selectedNodeId) {
        const node = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
        if (node) {
            if (inputName) node.name = inputName.value.trim();
            if (inputText) node.text = inputText.value;
            if (inputStatus) node.status = inputStatus.value;
            if (inputPromo) node.isPromo = inputPromo.checked;
            if (inputMedia) node.media = inputMedia.value.trim();
            if (inputAliases) node.aliases = inputAliases.value.split(',').map(s => s.trim()).filter(Boolean);
        }
    }

    try {
        const res = await fetch(`/api/group-config/${window.selectedGroupId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(window.selectedGroupConfig)
        });

        if (res.ok) {
            alert('Struktur Pohon Menu berhasil disimpan ke Database!');
            window.renderMenuTreeVisual();
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal menyimpan menu: ' + err.message);
    }
};

// Event listener input real-time
document.addEventListener('DOMContentLoaded', () => {
    const inputName = document.getElementById('node-name');
    const inputText = document.getElementById('node-text');
    const inputStatus = document.getElementById('node-status');
    const inputPromo = document.getElementById('node-promo');
    const inputMedia = document.getElementById('node-media');
    const inputAliases = document.getElementById('node-aliases');

    if (inputName) {
        inputName.addEventListener('input', (e) => {
            if (!window.selectedGroupConfig || !window.selectedNodeId) return;
            const node = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
            if (node) {
                node.name = e.target.value;
                // Live update label
                const selectedItem = document.querySelector('.menu-node-item.selected span');
                if (selectedItem) selectedItem.textContent = node.name;
            }
        });
    }

    if (inputText) {
        inputText.addEventListener('input', (e) => {
            if (!window.selectedGroupConfig || !window.selectedNodeId) return;
            const node = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
            if (node) node.text = e.target.value;
        });
    }

    if (inputStatus) {
        inputStatus.addEventListener('change', (e) => {
            if (!window.selectedGroupConfig || !window.selectedNodeId) return;
            const node = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
            if (node) {
                node.status = e.target.value;
                window.renderMenuTreeVisual();
            }
        });
    }

    if (inputPromo) {
        inputPromo.addEventListener('change', (e) => {
            if (!window.selectedGroupConfig || !window.selectedNodeId) return;
            const node = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
            if (node) {
                node.isPromo = e.target.checked;
                window.renderMenuTreeVisual();
            }
        });
    }

    if (inputMedia) {
        inputMedia.addEventListener('input', (e) => {
            if (!window.selectedGroupConfig || !window.selectedNodeId) return;
            const node = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
            if (node) node.media = e.target.value.trim();
        });
    }

    if (inputAliases) {
        inputAliases.addEventListener('input', (e) => {
            if (!window.selectedGroupConfig || !window.selectedNodeId) return;
            const node = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
            if (node) node.aliases = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
        });
    }

    // Auto-load saat awal
    setTimeout(() => {
        if (window.loadHostAdmins) window.loadHostAdmins();
        if (window.loadCustomersList) window.loadCustomersList();
        if (window.renderMenuTreeVisual) window.renderMenuTreeVisual();
    }, 400);
});
