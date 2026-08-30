// ==========================================
// GROUPS & COMMUNITY MANAGER MODULE
// ==========================================

window.activeGroups = [];
window.selectedGroupId = null;
window.selectedGroupConfig = null;
window.hostConfigActiveGroups = [];

// Memuat daftar grup WhatsApp dari Server (WA Live + SQLite DB)
window.loadGroupsList = async function() {
    const container = document.getElementById('groups-list-container');
    let resPending = true;

    if (container) {
        container.innerHTML = `
            <div class="p-6 text-center bg-[#0b1120] border border-[var(--border-color)] rounded-2xl">
                <div class="flex items-center justify-center gap-3 mb-2">
                    <div class="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                    <p id="group-loading-text" class="text-xs text-[var(--text-muted)] font-medium">Mengambil daftar grup WhatsApp...</p>
                </div>
                <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div id="group-loading-progress" class="bg-indigo-500 h-full w-[30%] transition-all duration-300"></div>
                </div>
            </div>
        `;
    }

    try {
        const res = await fetch('/api/groups');
        resPending = false;
        
        if (!res.ok) throw new Error('Gagal mengambil daftar grup dari server');
        
        const data = await res.json();
        window.activeGroups = Array.isArray(data) ? data : [];
        window.hostConfigActiveGroups = window.activeGroups;

        // Render card grup
        window.renderGroupsListSidebar();
        
        // Update dropdown host config grup
        window.updateHostGroupSelect();

        // Jika ada grup dan belum ada yang dipilih, pilih grup pertama
        if (window.activeGroups.length > 0 && !window.selectedGroupId) {
            window.selectGroup(window.activeGroups[0].id);
        }

        if (typeof window.updateCloneSourceDropdown === 'function') {
            window.updateCloneSourceDropdown();
        }
        if (typeof window.updateBroadcastGroupDropdown === 'function') {
            window.updateBroadcastGroupDropdown();
        }
    } catch (err) {
        resPending = false;
        console.error('Error loadGroupsList:', err);
        if (container) {
            container.innerHTML = `
                <div class="p-6 text-center bg-rose-500/10 border border-rose-500/20 rounded-2xl space-y-3">
                    <div class="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                        <i data-lucide="alert-triangle" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <h4 class="text-xs font-bold text-[var(--text-primary)]">Gagal Memuat Daftar Grup</h4>
                        <p class="text-[11px] text-[var(--text-muted)] mt-0.5">${err.message || 'Pastikan server bot aktif.'}</p>
                    </div>
                    <div class="flex items-center justify-center gap-2">
                        <button onclick="loadGroupsList()" class="px-3 py-1.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-white/20 text-[var(--text-primary)] text-xs font-semibold">Coba Lagi</button>
                        <button onclick="addNewGroupJidManual()" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[var(--text-primary)] text-xs font-semibold">Tambah Manual</button>
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }
};

// Render daftar grup ke dalam container kartu
window.renderGroupsListSidebar = function() {
    const container = document.getElementById('groups-list-container');
    if (!container) return;

    if (!window.activeGroups || window.activeGroups.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center bg-[#0b1120] border border-[var(--border-color)] rounded-2xl space-y-3">
                <i data-lucide="users" class="w-8 h-8 mx-auto text-slate-600"></i>
                <p class="text-xs text-[var(--text-muted)]">Belum ada grup yang terdeteksi di database.</p>
                <button onclick="addNewGroupJidManual()" class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[var(--text-primary)] text-xs font-semibold shadow-sm">
                    Tambah ID JID Grup Manual
                </button>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    container.innerHTML = '';
    window.activeGroups.forEach(g => {
        const isSelected = window.selectedGroupId === g.id;
        const card = document.createElement('div');
        card.className = `group-card p-4 rounded-xl border transition-all cursor-pointer ${
            isSelected ? 'bg-indigo-600/10 border-indigo-500/50 shadow-sm' : 'bg-[#0b1120] border-[var(--border-color)] hover:border-white/20'
        }`;
        card.onclick = () => window.selectGroup(g.id);

        const cleanJid = (g.id || '').split('@')[0];
        const isBotActive = g.enabled !== false;
        const hasWelcome = g.config && g.config.welcomeMessage ? true : false;
        const hasSchedule = g.config && g.config.autoCloseSchedule && g.config.autoCloseSchedule.enabled ? true : false;

        card.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                        <h4 class="font-bold text-xs text-[var(--text-primary)] truncate">${g.name || g.id}</h4>
                        ${isSelected ? '<span class="text-[10px] bg-indigo-500 text-[var(--text-primary)] px-1.5 py-0.2 rounded font-bold">Dipilih</span>' : ''}
                    </div>
                    <p class="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">${cleanJid}</p>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                    isBotActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-[var(--text-muted)]'
                }">
                    ${isBotActive ? 'BOT AKTIF' : 'NONAKTIF'}
                </span>
            </div>

            <div class="flex items-center gap-2 mt-3 pt-2 border-t border-white/5 text-[11px] text-[var(--text-muted)]">
                <span class="flex items-center gap-1">
                    <i data-lucide="message-square" class="w-3 h-3 text-[var(--text-muted)]"></i>
                    ${hasWelcome ? '<span class="text-indigo-300">Welcome On</span>' : 'Welcome Off'}
                </span>
                <span>•</span>
                <span class="flex items-center gap-1">
                    <i data-lucide="clock" class="w-3 h-3 text-[var(--text-muted)]"></i>
                    ${hasSchedule ? '<span class="text-amber-300">Jadwal Aktif</span>' : 'Jadwal Off'}
                </span>
            </div>
        `;
        container.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
};

// Update dropdown pilihan grup pada konfigurasi operasional & Visual Menu Tree
window.updateHostGroupSelect = function() {
    const selects = [
        document.getElementById('host-config-group-select'),
        document.getElementById('menu-tree-group-select')
    ];

    selects.forEach(select => {
        if (!select) return;
        select.innerHTML = '<option value="">-- Pilih Grup WhatsApp --</option>';
        window.activeGroups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = `${g.name || g.id} (${g.id.split('@')[0]})`;
            select.appendChild(opt);
        });

        if (window.selectedGroupId) {
            select.value = window.selectedGroupId;
        }

        select.onchange = (e) => {
            if (e.target.value) {
                window.selectGroup(e.target.value);
            }
        };
    });
};

// Memilih grup aktif untuk diedit konfigurasinya
window.selectGroup = async function(groupId) {
    if (!groupId) return;
    window.selectedGroupId = groupId;
    
    // Update select dropdowns value
    const hostSelect = document.getElementById('host-config-group-select');
    if (hostSelect && hostSelect.value !== groupId) {
        hostSelect.value = groupId;
    }
    const treeSelect = document.getElementById('menu-tree-group-select');
    if (treeSelect && treeSelect.value !== groupId) {
        treeSelect.value = groupId;
    }

    // Re-render highlight kartu
    window.renderGroupsListSidebar();

    try {
        const res = await fetch(`/api/group-config/${groupId}`);
        if (!res.ok) throw new Error('Gagal mengambil konfigurasi grup');
        
        const config = await res.json();
        window.selectedGroupConfig = config;

        // Isi form Welcome Message
        const welcomeInput = document.getElementById('host-group-welcome-msg');
        if (welcomeInput) {
            welcomeInput.value = config.welcomeMessage || '';
        }

        // Isi form Schedule
        const schedToggle = document.getElementById('host-scheduler-toggle');
        const schedOpen = document.getElementById('host-scheduler-open');
        const schedClose = document.getElementById('host-scheduler-close');

        if (config.autoCloseSchedule) {
            if (schedToggle) schedToggle.checked = !!config.autoCloseSchedule.enabled;
            if (schedOpen && config.autoCloseSchedule.openTime) schedOpen.value = config.autoCloseSchedule.openTime;
            if (schedClose && config.autoCloseSchedule.closeTime) schedClose.value = config.autoCloseSchedule.closeTime;
        } else {
            if (schedToggle) schedToggle.checked = false;
        }

        // Render Menu Tree jika ada di tab Shop/CRM
        if (typeof window.renderMenuTreeVisual === 'function') {
            window.renderMenuTreeVisual();
        }
    } catch (err) {
        console.error('Error selectGroup:', err);
    }
};

// Simpan Pesan Welcome Grup
window.saveHostWelcomeMsg = async function() {
    const select = document.getElementById('host-config-group-select');
    const gId = select ? select.value : window.selectedGroupId;
    if (!gId) {
        alert('Pilih grup WhatsApp terlebih dahulu!');
        return;
    }

    const msgVal = (document.getElementById('host-group-welcome-msg').value || '').trim();

    try {
        const res = await fetch('/api/host-admin/welcome-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: gId, welcomeMessage: msgVal })
        });

        if (res.ok) {
            alert('Pesan sambutan selamat datang berhasil disimpan!');
            // Update local memory
            const grp = window.activeGroups.find(g => g.id === gId);
            if (grp) {
                grp.config = grp.config || {};
                grp.config.welcomeMessage = msgVal;
            }
            window.renderGroupsListSidebar();
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal menyimpan pesan welcome: ' + err.message);
    }
};

// Simpan Jadwal Operasional Buka / Tutup Grup
window.saveHostScheduler = async function() {
    const select = document.getElementById('host-config-group-select');
    const gId = select ? select.value : window.selectedGroupId;
    if (!gId) {
        alert('Pilih grup WhatsApp terlebih dahulu!');
        return;
    }

    const enabled = document.getElementById('host-scheduler-toggle').checked;
    const openTime = document.getElementById('host-scheduler-open').value;
    const closeTime = document.getElementById('host-scheduler-close').value;

    try {
        const res = await fetch('/api/host-admin/group-scheduler', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: gId, schedulerEnabled: enabled, openTime, closeTime })
        });

        if (res.ok) {
            alert('Jadwal otomatis buka/tutup grup berhasil disimpan!');
            const grp = window.activeGroups.find(g => g.id === gId);
            if (grp) {
                grp.config = grp.config || {};
                grp.config.autoCloseSchedule = { enabled, openTime, closeTime };
            }
            window.renderGroupsListSidebar();
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal menyimpan jadwal: ' + err.message);
    }
};

// Tambah ID JID Grup Manual (Bila WhatsApp belum terkoneksi live)
window.addNewGroupJidManual = async function() {
    const jid = prompt('Masukkan ID JID Grup WhatsApp:\n(Contoh: 12036310978236670@g.us)\n\nTips: Ketik .id di dalam grup WhatsApp Anda untuk mengetahui JID ini.');
    if (!jid) return;

    const cleanJid = jid.trim();
    if (!cleanJid.endsWith('@g.us')) {
        alert('Format ID Grup salah! Harus berakhiran @g.us');
        return;
    }

    try {
        const checkRes = await fetch(`/api/group-config/${cleanJid}`);
        let existingConfig = {};
        if (checkRes.ok) {
            existingConfig = await checkRes.json();
        }

        const saveRes = await fetch(`/api/group-config/${cleanJid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(existingConfig)
        });

        if (!saveRes.ok) throw new Error('Gagal menyimpan ID grup ke database.');

        alert('Grup berhasil didaftarkan! Memuat ulang...');
        await window.loadGroupsList();
        window.selectGroup(cleanJid);
    } catch (err) {
        alert('Gagal menambahkan grup manual: ' + err.message);
    }
};

// Filter Pencarian Grup
window.filterGroupsList = function() {
    const input = document.getElementById('group-search-input');
    if (!input) return;
    const query = input.value.toLowerCase().trim();

    const cards = document.querySelectorAll('#groups-list-container .group-card');
    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query) ? 'block' : 'none';
    });
};

// Broadcast Handler
window.sendBroadcast = async function() {
    const targetType = document.getElementById('broadcast-target-type') ? document.getElementById('broadcast-target-type').value : 'groups';
    const customNumbersVal = document.getElementById('broadcast-custom-numbers') ? document.getElementById('broadcast-custom-numbers').value.trim() : '';
    const targetGroup = document.getElementById('broadcast-target-group') ? document.getElementById('broadcast-target-group').value : '';
    const msgInput = document.getElementById('broadcast-msg');
    const message = msgInput ? msgInput.value.trim() : '';

    if (!message) {
        alert('Tulis pesan siaran massal terlebih dahulu!');
        return;
    }

    if (!confirm('Apakah Anda yakin ingin mengirim pesan siaran ini?')) return;

    try {
        const res = await fetch('/api/shop/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetType, customNumbers: customNumbersVal, targetGroup, message, delay: 5 })
        });
        if (res.ok) {
            alert('Siaran massal berhasil diproses dan dikirim!');
            if (msgInput) msgInput.value = '';
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal mengirim siaran: ' + err.message);
    }
};

window.stopBroadcast = async function() {
    try {
        const res = await fetch('/api/shop/broadcast/stop', { method: 'POST' });
        if (res.ok) alert('Pengiriman siaran dihentikan.');
    } catch(err) {
        alert('Gagal menghentikan siaran: ' + err.message);
    }
};

// Initialize listeners saat DOM selesai dimuat
document.addEventListener('DOMContentLoaded', () => {
    // Muat data grup saat awal
    setTimeout(() => {
        if (window.loadGroupsList) {
            window.loadGroupsList();
        }
    }, 400);
});
