// ==========================================
// SHOP, HOST ADMIN, CRM & VISUAL MENU TREE
// ==========================================
'use strict';

let activeCustomers = [];
window.selectedNodeId = 'root';

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
                <div class="p-4 text-center bg-[var(--bg-subtle)] border border-[var(--border-color)] rounded-xl">
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
            card.className = 'p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)] flex items-center justify-between gap-3';
            card.innerHTML = `
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                        <i data-lucide="shield-check" class="w-4 h-4"></i>
                    </div>
                    <div class="min-w-0">
                        <h4 class="text-xs font-bold text-[var(--text-primary)] truncate">${escapeHtml(name)}</h4>
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
            if (window.showToast) window.showToast('success', 'Host Admin berhasil dihapus.');
            window.loadHostAdmins();
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        if (window.showToast) window.showToast('error', 'Gagal menghapus admin: ' + err.message);
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
            card.className = 'customer-item-card p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs';
            card.innerHTML = `
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold shrink-0">
                        ${(cust.name || 'P').charAt(0).toUpperCase()}
                    </div>
                    <div class="min-w-0">
                        <div class="font-bold text-[var(--text-primary)] truncate">${escapeHtml(cust.name || 'Pelanggan')}</div>
                        <a href="https://wa.me/${cleanPhone}" target="_blank" class="text-[11px] text-emerald-400 font-mono hover:underline flex items-center gap-1">
                            +${cleanPhone}
                            <i data-lucide="external-link" class="w-2.5 h-2.5"></i>
                        </a>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="badge-chip badge-slate text-[10px]">${escapeHtml(cust.labels || 'Pelanggan')}</span>
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

window.formatWhatsAppText = function(text) {
    if (!text) return '<span class="text-[var(--text-muted)] italic">Ketik isi balasan teks untuk melihat pratinjau pesan di sini...</span>';
    let formatted = escapeHtml(text)
        .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
        .replace(/_(.*?)_/g, '<em>$1</em>')
        .replace(/~(.*?)~/g, '<del>$1</del>')
        .replace(/```([\s\S]*?)```/g, '<pre class="bg-black/20 p-1.5 rounded font-mono text-[11px] my-1">$1</pre>')
        .replace(/\n/g, '<br/>');
    return formatted;
};

window.updateWhatsAppPreview = function() {
    const previewEl = document.getElementById('node-wa-preview');
    const inputText = document.getElementById('node-text');
    if (!previewEl || !inputText) return;
    previewEl.innerHTML = window.formatWhatsAppText(inputText.value);
};

// Render pohon visual
window.renderMenuTreeVisual = async function() {
    const container = document.getElementById('menu-tree-visualizer');
    if (!container) return;

    if (!window.activeGroups || window.activeGroups.length === 0) {
        if (typeof window.loadGroupsList === 'function') {
            await window.loadGroupsList();
        }
    }

    if (!window.selectedGroupConfig || !window.selectedGroupConfig.menuTree) {
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
            <div class="p-8 text-center bg-[var(--bg-subtle)] border border-[var(--border-color)] rounded-2xl space-y-2">
                <i data-lucide="git-fork" class="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50"></i>
                <p class="text-xs font-semibold text-[var(--text-primary)]">Belum Ada Grup Terpilih</p>
                <p class="text-[11px] text-[var(--text-muted)]">Pilih salah satu grup WhatsApp pada dropdown di atas untuk mengedit struktur pohon menu.</p>
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
    
    let statusBadge = '';
    if (!isCategory && node.status) {
        let chipClass = 'badge-emerald';
        if (node.status === 'Habis') chipClass = 'badge-rose';
        if (node.status === 'Pre-order') chipClass = 'badge-amber';
        statusBadge = `<span class="badge-chip ${chipClass}" onclick="window.quickToggleStatus(event, '${node.id}')" title="Klik untuk ganti status">${node.status}</span>`;
    }

    const promoBadge = node.isPromo ? '<span class="badge-chip badge-rose">🔥 PROMO</span>' : '';

    header.innerHTML = `
        <i data-lucide="${iconName}" class="w-3.5 h-3.5 ${iconColor} shrink-0"></i>
        <span class="font-medium flex-1 truncate text-xs ${isSelected ? 'font-bold' : ''}">${escapeHtml(node.name || 'Menu')}</span>
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
    const inputText = document.getElementById('node-text');
    const inputStatus = document.getElementById('node-status');
    const inputPromo = document.getElementById('node-promo');
    const inputMedia = document.getElementById('node-media');

    if (inputName) inputName.value = node.name || '';
    if (inputAliases) inputAliases.value = Array.isArray(node.aliases) ? node.aliases.join(', ') : (node.aliases || '');
    if (inputText) inputText.value = node.text || '';
    if (inputStatus) inputStatus.value = node.status || 'Tersedia';
    if (inputPromo) inputPromo.checked = !!node.isPromo;
    if (inputMedia) inputMedia.value = node.media || '';

    const textSec = document.getElementById('node-sec-text');
    if (textSec) {
        textSec.style.display = node.type === 'category' ? 'none' : 'block';
    }

    window.updateWhatsAppPreview();
};

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

    if (window.selectedGroupConfig && window.selectedNodeId) {
        const node = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
        if (node) node.text = el.value;
    }
    window.updateWhatsAppPreview();
};

window.addChildNode = function() {
    if (!window.selectedGroupConfig || !window.selectedGroupConfig.menuTree) {
        if (window.showToast) window.showToast('warning', 'Pilih grup WhatsApp terlebih dahulu!');
        return;
    }

    let parentNode = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
    if (!parentNode || parentNode.type !== 'category') {
        parentNode = window.selectedGroupConfig.menuTree;
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

window.deleteNode = function() {
    if (!window.selectedGroupConfig || !window.selectedNodeId) return;
    if (window.selectedNodeId === 'root') {
        if (window.showToast) window.showToast('warning', 'Node Utama (Root) tidak dapat dihapus!');
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

window.saveGroupConfiguration = async function() {
    if (!window.selectedGroupId || !window.selectedGroupConfig) {
        if (window.showToast) window.showToast('warning', 'Pilih grup terlebih dahulu untuk menyimpan menu!');
        return;
    }

    const inputName = document.getElementById('node-name');
    const inputText = document.getElementById('node-text');
    const inputStatus = document.getElementById('node-status');
    const inputPromo = document.getElementById('node-promo');
    const inputMedia = document.getElementById('node-media');
    const inputAliases = document.getElementById('node-aliases');

    if (window.selectedNodeId && window.selectedGroupConfig.menuTree) {
        const currentNode = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
        if (currentNode) {
            if (inputName) currentNode.name = inputName.value.trim();
            if (inputText) currentNode.text = inputText.value;
            if (inputStatus) currentNode.status = inputStatus.value;
            if (inputPromo) currentNode.isPromo = inputPromo.checked;
            if (inputMedia) currentNode.media = inputMedia.value.trim();
            if (inputAliases) {
                currentNode.aliases = inputAliases.value.split(',').map(s => s.trim()).filter(s => s);
            }
        }
    }

    try {
        const res = await fetch(`/api/group-config/${window.selectedGroupId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(window.selectedGroupConfig)
        });
        
        if (res.ok) {
            if (window.showToast) window.showToast('success', 'Konfigurasi menu pohon berhasil disimpan ke database!');
            window.renderMenuTreeVisual();
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        if (window.showToast) window.showToast('error', 'Gagal menyimpan menu: ' + err.message);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Bind real-time input listeners to update preview
    const nodeTextInput = document.getElementById('node-text');
    if (nodeTextInput) {
        nodeTextInput.addEventListener('input', () => {
            window.updateWhatsAppPreview();
            if (window.selectedGroupConfig && window.selectedNodeId) {
                const node = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
                if (node) node.text = nodeTextInput.value;
            }
        });
    }

    const nodeNameInput = document.getElementById('node-name');
    if (nodeNameInput) {
        nodeNameInput.addEventListener('input', () => {
            if (window.selectedGroupConfig && window.selectedNodeId) {
                const node = findNodeInTree(window.selectedGroupConfig.menuTree, window.selectedNodeId);
                if (node) {
                    node.name = nodeNameInput.value;
                    const selectedEl = document.querySelector('.menu-node-item.selected span');
                    if (selectedEl) selectedEl.textContent = node.name || 'Menu';
                }
            }
        });
    }
});
