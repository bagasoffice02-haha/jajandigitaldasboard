window.loadGroupsList = async function() {
    const container = document.getElementById('groups-list-container');
    let resPending = true;

    if (container) {
        container.innerHTML = `
            <div class="progress-bar-container" style="padding: 24px 16px; text-align: center; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid var(--border-color); margin: 10px 0;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 12px;">
                    <div style="display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(10, 132, 255, 0.1); border-top-color: #0a84ff; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                    <p id="group-loading-text" style="font-size: 0.8rem; font-weight: 500; color: var(--text-color-muted); margin: 0;">Menginisialisasi pencarian grup...</p>
                </div>
                <div style="background: rgba(255,255,255,0.05); height: 8px; border-radius: 4px; overflow: hidden; border: 1px solid var(--border-color); position: relative;">
                    <div id="group-loading-progress" style="width: 15%; height: 100%; background: linear-gradient(90deg, #0a84ff, #5856d6); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px rgba(10, 132, 255, 0.4);"></div>
                </div>
                <span id="group-loading-percentage" style="display: block; font-size: 0.72rem; color: var(--text-color-muted); font-weight: 600; margin-top: 8px;">15%</span>
            </div>
        `;
        
        const textEl = document.getElementById('group-loading-text');
        const progEl = document.getElementById('group-loading-progress');
        const pctEl = document.getElementById('group-loading-percentage');
        
        const steps = [
            { time: 800, pct: 40, text: "Menghubungkan ke obrolan WhatsApp..." },
            { time: 1600, pct: 70, text: "Memilah obrolan bertipe Grup..." },
            { time: 2500, pct: 90, text: "Menyinkronkan pengaturan database..." }
        ];
        
        steps.forEach(s => {
            setTimeout(() => {
                if (resPending && textEl && progEl && pctEl) {
                    textEl.innerText = s.text;
                    progEl.style.width = `${s.pct}%`;
                    pctEl.innerText = `${s.pct}%`;
                }
            }, s.time);
        });
    }

    try {
        const res = await fetch('/api/groups');
        resPending = false;
        
        const textEl = document.getElementById('group-loading-text');
        const progEl = document.getElementById('group-loading-progress');
        const pctEl = document.getElementById('group-loading-percentage');
        
        if (textEl && progEl && pctEl) {
            textEl.innerText = "Selesai! Memuat tampilan...";
            progEl.style.width = '100%';
            pctEl.innerText = '100%';
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (!res.ok) throw new Error('Gagal mengambil daftar grup');
        
        activeGroups = await res.json();
        renderGroupsListSidebar();
        
        // Update select dropdown untuk modal salin konfig
        updateCloneSourceDropdown();
        updatePrivateChatSyncDropdown();
        if (typeof updateBroadcastGroupDropdown === 'function') {
            updateBroadcastGroupDropdown();
        }
    } catch (err) {
        resPending = false;
        console.error('Error loadGroupsList:', err);
        const container = document.getElementById('groups-list-container');
        if (container) {
            container.innerHTML = `
                <div style="padding: 20px 10px; text-align: center; color: #ff453a; background: rgba(255, 69, 58, 0.05); border: 1px solid rgba(255, 69, 58, 0.15); border-radius: 8px;">
                    <i data-lucide="alert-triangle" style="width: 24px; height: 24px; color: #ff453a; margin-bottom: 8px; display: inline-block; vertical-align: middle;"></i>
                    <p style="font-size: 0.8rem; font-weight: 600; margin: 4px 0 0 0;">Gagal Memuat Daftar Grup</p>
                    <span style="font-size: 0.72rem; color: var(--text-color-muted); display: block; margin-top: 4px; margin-bottom: 12px;">Pastikan WhatsApp bot telah terhubung.</span>
                    <button class="btn btn-secondary" onclick="loadGroupsList()" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 6px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-primary); cursor: pointer;">Coba Lagi</button>
                </div>
            `;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }
};

window.sendBroadcast = async function() {
    let targetType = document.getElementById('broadcast-target-type').value;
    let customNumbersVal = document.getElementById('broadcast-custom-numbers').value.trim();
    const targetGroup = document.getElementById('broadcast-target-group').value;
    const msgInput = document.getElementById('broadcast-msg');
    const mediaInput = document.getElementById('broadcast-media');
    const delayInput = document.getElementById('broadcast-delay');
    
    const message = msgInput.value.trim();
    const media = mediaInput.value.trim();
    const delay = parseInt(delayInput.value, 10) || 5;
    
    if (!message) {
        alert('Tulis pesan broadcast terlebih dahulu!');
        return;
    }
    
    if (targetType === 'group_members') {
        if (!lastExtractedMembers || lastExtractedMembers.length === 0) {
            alert('Silakan klik tombol "Ekstrak & Hitung Anggota" terlebih dahulu sebelum mengirim siaran!');
            return;
        }
        // Ubah targetType menjadi custom_numbers dan gunakan nomor hasil ekstraksi
        targetType = 'custom_numbers';
        customNumbersVal = lastExtractedMembers.map(m => m.phone).join(',');
    }
    
    let confirmMsg = 'Apakah Anda yakin ingin mengirim pesan siaran ini?';
    if (targetType === 'groups') {
        confirmMsg = 'Apakah Anda yakin ingin mengirim pesan siaran ini ke SELURUH grup WhatsApp aktif?';
    } else if (targetType === 'custom_numbers') {
        confirmMsg = 'Apakah Anda yakin ingin mengirim pesan siaran ini (PM) ke daftar nomor penerima?';
    }
    
    if (!confirm(confirmMsg)) return;
    
    try {
        const res = await fetch('/api/shop/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                targetType, 
                customNumbers: customNumbersVal, 
                targetGroup, 
                message, 
                media, 
                delay 
            })
        });
        
        if (res.ok) {
            const result = await res.json();
            
            const terminal = document.getElementById('broadcast-terminal');
            if (terminal) {
                terminal.innerText = `[System] Mulai mengirim siaran massal ke ${result.count} tujuan...\n`;
            }
            
            const container = document.getElementById('broadcast-progress-container');
            const placeholder = document.getElementById('broadcast-progress-placeholder');
            if (container && placeholder) {
                container.classList.remove('hidden');
                placeholder.classList.add('hidden');
            }
            
            alert(`Siaran massal berhasil diproses! Memulai pengiriman ke ${result.count} tujuan.`);
            msgInput.value = '';
            mediaInput.value = '';
            document.getElementById('broadcast-custom-numbers').value = '';
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        alert('Gagal mengirim siaran massal: ' + err.message);
    }
};

window.stopBroadcast = async function() {
    if (!confirm('Apakah Anda yakin ingin menghentikan pengiriman siaran massal yang sedang berjalan?')) return;
    try {
        const res = await fetch('/api/shop/broadcast/stop', { method: 'POST' });
        if (res.ok) {
            const result = await res.json();
            alert(result.message || 'Siaran dihentikan.');
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        alert('Gagal menghentikan siaran: ' + err.message);
    }
};

window.addNewGroupJidManual = async function() {
    const jid = prompt('Masukkan ID JID Grup WA Baru secara manual:\n(Contoh: 12036310978236670@g.us)\n\nAnda bisa mendapatkan ID grup ini dengan mengetik ".id" di dalam grup WhatsApp Anda.');
    if (!jid) return;
    
    const cleanJid = jid.trim();
    if (!cleanJid.endsWith('@g.us')) {
        alert('Format ID Grup salah. Harus diakhiri dengan @g.us');
        return;
    }
    
    try {
        const checkRes = await fetch(`/api/group-config/${cleanJid}`);
        if (!checkRes.ok) throw new Error('Gagal memeriksa konfigurasi grup.');
        const existingConfig = await checkRes.json();
        
        const saveRes = await fetch(`/api/group-config/${cleanJid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(existingConfig)
        });
        
        if (!saveRes.ok) throw new Error('Gagal menyimpan konfigurasi baru.');
        
        alert('Grup berhasil ditambahkan! Memuat ulang daftar...');
        
        // Reload main sidebar group list
        if (window.loadGroupsList) {
            await window.loadGroupsList();
        }
        
        const groupsRes = await fetch('/api/groups');
        if (groupsRes.ok) {
            hostConfigActiveGroups = await groupsRes.json();
            const groupSelect = document.getElementById('host-config-group-select');
            if (groupSelect) {
                groupSelect.innerHTML = '';
                hostConfigActiveGroups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g.id;
                    opt.textContent = g.name;
                    groupSelect.appendChild(opt);
                });
                groupSelect.value = cleanJid;
                window.onHostGroupSelectChange();
            }
        }
    } catch (err) {
        alert('Gagal menambahkan grup manual: ' + err.message);
    }
};

window.saveHostScheduler = async function() {
    const select = document.getElementById('host-config-group-select');
    if (!select) return;
    const gId = select.value;
    if (!gId) return;

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
            alert('Jadwal otomatis grup berhasil disimpan!');
            // Refresh local state config
            const group = hostConfigActiveGroups.find(g => g.id === gId);
            if (group) {
                const existingDays = (group.config && group.config.autoCloseSchedule && group.config.autoCloseSchedule.activeDays) || [1,2,3,4,5,6,7];
                group.config = group.config || {};
                group.config.autoCloseSchedule = { enabled, openTime, closeTime, activeDays: existingDays };
            }
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal menyimpan jadwal: ' + err.message);
    }
};

window.saveHostWelcomeMsg = async function() {
    const select = document.getElementById('host-config-group-select');
    if (!select) return;
    const gId = select.value;
    if (!gId) return;

    const msgVal = document.getElementById('host-group-welcome-msg').value;

    try {
        const res = await fetch('/api/host-admin/welcome-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: gId, welcomeMessage: msgVal })
        });

        if (res.ok) {
            alert('Pesan selamat datang berhasil disimpan!');
            // Refresh local state
            const group = hostConfigActiveGroups.find(g => g.id === gId);
            if (group) {
                group.config = group.config || {};
                group.config.welcomeMessage = msgVal;
            }
            if (selectedGroupId === gId) {
                if (selectedGroupConfig) {
                    selectedGroupConfig.welcomeMessage = msgVal;
                }
                const mainWelcomeInput = document.getElementById('grp-welcome-message');
                if (mainWelcomeInput) mainWelcomeInput.value = msgVal;
            }
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal menyimpan pesan selamat datang: ' + err.message);
    }
};

window.saveHostGoodbyeMsg = async function() {
    const select = document.getElementById('host-config-group-select');
    if (!select) return;
    const gId = select.value;
    if (!gId) return;

    const msgVal = document.getElementById('host-group-goodbye-msg').value;

    try {
        const res = await fetch('/api/host-admin/goodbye-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: gId, goodbyeMessage: msgVal })
        });

        if (res.ok) {
            alert('Pesan selamat tinggal berhasil disimpan!');
            // Refresh local state
            const group = hostConfigActiveGroups.find(g => g.id === gId);
            if (group) {
                group.config = group.config || {};
                group.config.goodbyeMessage = msgVal;
            }
            if (selectedGroupId === gId) {
                if (selectedGroupConfig) {
                    selectedGroupConfig.goodbyeMessage = msgVal;
                }
                const mainGoodbyeInput = document.getElementById('grp-goodbye-message');
                if (mainGoodbyeInput) mainGoodbyeInput.value = msgVal;
            }
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal menyimpan pesan selamat tinggal: ' + err.message);
    }
};
