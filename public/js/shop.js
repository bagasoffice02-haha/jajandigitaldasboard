window.renderMenuTreeVisual = function() {
    const container = document.getElementById('menu-tree-visualizer');
    if (!container) return;
    
    if (!selectedGroupConfig || !selectedGroupConfig.menuTree) {
        container.innerHTML = '<p style="color:var(--text-secondary); font-size:0.85rem; text-align:center;">Data menu tidak ditemukan.</p>';
        return;
    }
    
    container.innerHTML = '';
    const rootNode = selectedGroupConfig.menuTree;
    
    // Render mulai dari root
    const rootEl = createNodeHTML(rootNode, 0);
    container.appendChild(rootEl);
    
    // Re-initialize Lucide Icons untuk tombol/ikon pohon
    lucide.createIcons();
};

window.loadHostAdmins = async function() {
    const list = document.getElementById('shop-admins-list');
    if (!list) return;
    list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);font-size:0.8rem;margin-top:20px;">Memuat daftar admin...</p>';

    try {
        // Selalu ambil admin dari DB dulu (pasti ada meski WA belum connect)
        const resDb = await fetch('/api/shop/admins');
        if (!resDb.ok) throw new Error('Gagal memuat daftar admin dari database');
        const dbAdmins = await resDb.json(); // array of phone strings (digits only)

        // Coba ambil pinned chats dari WA (mungkin gagal jika WA belum connect)
        let pinnedChats = [];
        try {
            const resWa = await fetch('/api/shop/pinned-chats');
            if (resWa.ok) {
                pinnedChats = await resWa.json();
            }
        } catch(e) { /* WA belum connect, ok */ }

        list.innerHTML = '';

        // ── Bagian 1: Daftar Admin Tersimpan ──
        const sectionTitle1 = document.createElement('p');
        sectionTitle1.style = 'font-size:0.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin:0 0 6px;';
        sectionTitle1.textContent = '🛡️ Admin Tersimpan di Database';
        list.appendChild(sectionTitle1);

        if (dbAdmins.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.style = 'text-align:center;color:var(--text-secondary);font-size:0.8rem;padding:10px;background:var(--bg-secondary);border-radius:8px;';
            emptyMsg.textContent = 'Belum ada Host Admin yang terdaftar. Tambahkan nomor di atas.';
            list.appendChild(emptyMsg);
        } else {
            dbAdmins.forEach(phone => {
                const cleanPhone = (phone || '').replace(/\D/g, '');
                const row = document.createElement('div');
                row.style = 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid #30d158;border-radius:8px;background:var(--bg-secondary);margin-bottom:6px;';
                row.innerHTML = `
                    <div style="display:flex;flex-direction:column;gap:2px;">
                        <span style="font-weight:600;font-size:0.85rem;color:var(--text-primary);display:flex;align-items:center;gap:6px;">
                            <i data-lucide="shield-check" style="width:14px;height:14px;color:#30d158;"></i>
                            +${cleanPhone}
                        </span>
                        <span style="font-size:0.72rem;color:#30d158;">✅ Aktif sebagai Host Admin</span>
                    </div>
                    <button onclick="window.removeHostAdminDirect('${cleanPhone}@c.us')" title="Hapus Admin" style="background:transparent;border:1px solid #ff453a;padding:5px 8px;border-radius:6px;color:#ff453a;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:0.75rem;">
                        <i data-lucide="trash-2" style="width:12px;height:12px;"></i> Hapus
                    </button>
                `;
                list.appendChild(row);
            });
        }

        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('Error loadHostAdmins:', err);
        if (list) list.innerHTML = `<p style="text-align:center;color:#ff453a;font-size:0.8rem;margin-top:20px;">❌ Gagal memuat: ${err.message}</p>`;
    }
};

window.loadCustomersList = async function() {
    try {
        const res = await fetch('/api/shop/customers');
        if (!res.ok) throw new Error('Gagal memuat pelanggan');
        activeCustomers = await res.json();
        
        const list = document.getElementById('shop-customers-list');
        if (!list) return;
        list.innerHTML = '';
        
        if (activeCustomers.length === 0) {
            list.innerHTML = `<p style="text-align: center; color: var(--text-secondary); font-size: 0.9rem; margin-top: 50px;">Belum ada pelanggan terdeteksi.</p>`;
            return;
        }
        
        activeCustomers.forEach((cust, idx) => {
            const card = document.createElement('div');
            card.className = 'customer-item-row';
            card.style = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 6px 12px;
                margin-bottom: 8px;
                transition: all 0.2s ease;
                min-height: 48px;
            `;
            
            // Hover effect
            card.onmouseover = () => { card.style.background = 'rgba(255,255,255,0.04)'; };
            card.onmouseout = () => { card.style.background = 'var(--bg-secondary)'; };

            card.innerHTML = `
                <!-- Nama & WA Link -->
                <div style="flex: 2; display: flex; flex-direction: column; gap: 2px; min-width: 140px;">
                    <input type="text" id="cust-name-${idx}" value="${cust.name}" style="font-weight: 600; font-size: 0.85rem; border: none; background: transparent; color: var(--text-primary); border-bottom: 1px dashed var(--border-color); padding: 2px; width: 100%;" placeholder="Nama Pelanggan">
                    <a href="https://wa.me/${cust.phone}" target="_blank" style="font-size: 0.72rem; color: #30d158; text-decoration: none; width: fit-content; font-family: monospace;">wa.me/${cust.phone}</a>
                </div>
                
                <!-- Catatan/Alamat -->
                <div style="flex: 3; min-width: 180px;">
                    <input type="text" id="cust-notes-${idx}" value="${cust.notes || ''}" placeholder="Alamat / Catatan..." class="form-control" style="width: 100%; padding: 4px 8px; font-size: 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; height: 28px;">
                </div>
                
                <!-- Labels/Tags -->
                <div style="flex: 2; min-width: 130px;">
                    <input type="text" id="cust-labels-${idx}" value="${(cust.labels || []).join(', ')}" placeholder="Tag (VIP, Reseller)" class="form-control" style="width: 100%; padding: 4px 8px; font-size: 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; height: 28px;">
                </div>
                
                <!-- Order Count -->
                <div style="width: 60px; display: flex; align-items: center; position: relative;">
                    <input type="number" id="cust-order-${idx}" value="${cust.orderCount || 0}" class="form-control" style="width: 100%; padding: 4px; font-size: 0.8rem; text-align: center; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; height: 28px;" title="Order Count">
                </div>
                

                
                <!-- Aksi Buttons -->
                <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
                    <button class="btn btn-secondary" onclick="viewCustomerChatLogs('${cust.phone}')" style="font-size: 0.72rem; padding: 4px 8px; display: flex; align-items: center; gap: 4px; min-height: auto; height: 28px; border-radius: 6px;">
                        <i data-lucide="message-square" style="width: 11px; height: 11px;"></i> Chat
                    </button>
                    <button class="btn btn-primary" onclick="saveCustomerInfo(${idx})" style="font-size: 0.72rem; padding: 4px 10px; min-height: auto; height: 28px; border-radius: 6px; font-weight: 600;">Simpan</button>
                </div>
            `;
            list.appendChild(card);
        });
        
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('Error loadCustomersList:', err);
    }
};
