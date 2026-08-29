// public/js/referral.js
// Modul Referral & Afiliasi Multi-Grup
'use strict';

let allDashRefCodesData = [];

window.loadReferralGlobalSettings = async function() {
    try {
        const res = await fetch('/api/referrals/settings');
        const data = await res.json();
        if (data.success && data.settings) {
            const elPts = document.getElementById('ref-pts-per-invite');
            const elDesc = document.getElementById('ref-bonus-desc');
            if (elPts) elPts.value = data.settings.points_per_invite || 10;
            if (elDesc) elDesc.value = data.settings.bonus_desc || 'Voucher Diskon & Bebas Biaya Admin';
        }
    } catch (err) {
        console.error('[Load Referral Settings Error]:', err);
    }
};

window.saveReferralSettings = async function() {
    try {
        const elPts = document.getElementById('ref-pts-per-invite');
        const elDesc = document.getElementById('ref-bonus-desc');
        const points_per_invite = elPts ? parseInt(elPts.value, 10) || 10 : 10;
        const bonus_desc = elDesc ? elDesc.value.trim() : '';

        const res = await fetch('/api/referrals/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points_per_invite, bonus_desc })
        });

        const data = await res.json();
        if (data.success) {
            if (window.showToast) window.showToast('success', `Pengaturan referral berhasil disimpan! (+${points_per_invite} Poin)`);
            else alert(`✓ Pengaturan campaign berhasil disimpan!\n• Poin per undangan: +${points_per_invite} Poin`);
        } else {
            if (window.showToast) window.showToast('error', data.error || 'Gagal menyimpan pengaturan.');
            else alert('❌ Error: ' + (data.error || 'Gagal menyimpan pengaturan.'));
        }
    } catch (err) {
        if (window.showToast) window.showToast('error', 'Error koneksi server.');
        else alert('❌ Error koneksi server.');
    }
};

window.loadReferralDashboardData = async function() {
    try {
        window.loadReferralGlobalSettings();

        const [resCodes, resLogs] = await Promise.all([
            fetch('/api/referrals/codes'),
            fetch('/api/referrals/logs')
        ]);
        
        const dataCodes = await resCodes.json();
        const dataLogs = await resLogs.json();

        if (dataCodes.success && Array.isArray(dataCodes.codes)) {
            allDashRefCodesData = dataCodes.codes;
            renderReferralDashboardCodes(allDashRefCodesData);
        }

        if (dataLogs.success && Array.isArray(dataLogs.logs)) {
            renderReferralDashboardLogs(dataLogs.logs);
        }

        window.loadGroupInviteLinksConfig();

        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('[Dashboard Referral Error]:', err);
    }
};

function renderReferralDashboardCodes(codes) {
    let totalInvites = 0;
    let totalPoints = 0;
    codes.forEach(c => {
        totalInvites += (c.total_invites || 0);
        totalPoints += (c.points || 0);
    });

    const elAff = document.getElementById('dashRefTotalAffiliates');
    const elInv = document.getElementById('dashRefTotalInvites');
    const elPts = document.getElementById('dashRefTotalPoints');

    if (elAff) elAff.textContent = codes.length.toLocaleString('id-ID');
    if (elInv) elInv.textContent = totalInvites.toLocaleString('id-ID');
    if (elPts) elPts.textContent = totalPoints.toLocaleString('id-ID');

    const tbody = document.getElementById('dashRefTableBody');
    if (!tbody) return;

    if (codes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-secondary);">Belum ada peserta referral terdaftar.</td></tr>';
        return;
    }

    let html = '';
    codes.forEach((c) => {
        html += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 10px; font-weight: 600;">${c.user_name || 'Member'}</td>
                <td style="padding: 10px; color: var(--text-secondary);">${c.phone}</td>
                <td style="padding: 10px;"><span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 8px; border-radius: 6px; font-weight: 800;">${c.code}</span></td>
                <td style="padding: 10px; font-weight: 700; color: #10b981;">
                    <input type="number" id="ref-inv-${c.phone}" value="${c.total_invites || 0}" style="width: 70px; padding: 4px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--surface2); color: var(--text-color);">
                </td>
                <td style="padding: 10px; font-weight: 700; color: #f59e0b;">
                    <input type="number" id="ref-pts-${c.phone}" value="${c.points || 0}" style="width: 80px; padding: 4px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--surface2); color: var(--text-color);">
                </td>
                <td style="padding: 10px; text-align: right;">
                    <button type="button" class="btn btn-primary btn-sm" onclick="saveReferralPoints('${c.phone}')" style="margin-right: 4px;">Simpan</button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteReferralCode('${c.phone}')">Hapus</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function renderReferralDashboardLogs(logs) {
    const tbody = document.getElementById('dashRefLogsBody');
    if (!tbody) return;

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-secondary);">Belum ada riwayat klaim referral.</td></tr>';
        return;
    }

    let html = '';
    logs.forEach((l) => {
        const dateFormatted = l.claimed_at ? new Date(l.claimed_at).toLocaleString('id-ID') : '-';
        html += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 10px; font-size: 0.8rem; color: var(--text-secondary);">${dateFormatted}</td>
                <td style="padding: 10px; font-weight: 600;">${l.referrer_name || '-'} (${l.referrer_phone || '-'})</td>
                <td style="padding: 10px; color: #10b981; font-weight: 600;">${l.referred_name || '-'} (${l.referred_phone || '-'})</td>
                <td style="padding: 10px;"><span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${l.code_used}</span></td>
                <td style="padding: 10px; font-size: 0.8rem; color: var(--text-secondary);">${l.group_id}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

window.filterReferralDashboardTable = function() {
    const q = (document.getElementById('ref-search-input')?.value || '').toLowerCase().trim();
    if (!q) {
        renderReferralDashboardCodes(allDashRefCodesData);
        return;
    }
    const filtered = allDashRefCodesData.filter(c =>
        (c.user_name && c.user_name.toLowerCase().includes(q)) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
    );
    renderReferralDashboardCodes(filtered);
};

window.saveReferralPoints = async function(phone) {
    try {
        const ptsInput = document.getElementById(`ref-pts-${phone}`);
        const invInput = document.getElementById(`ref-inv-${phone}`);
        
        const points = ptsInput ? parseInt(ptsInput.value, 10) : 0;
        const total_invites = invInput ? parseInt(invInput.value, 10) : 0;

        const res = await fetch('/api/referrals/update-points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, points, total_invites })
        });
        const data = await res.json();
        if (data.success) {
            if (window.showToast) window.showToast('success', 'Poin referral berhasil diperbarui!');
            else alert('✓ Poin referral berhasil diperbarui!');
            window.loadReferralDashboardData();
        } else {
            if (window.showToast) window.showToast('error', data.error || 'Gagal meng-update poin.');
            else alert('❌ Error: ' + (data.error || 'Gagal meng-update poin.'));
        }
    } catch (err) {
        if (window.showToast) window.showToast('error', 'Error koneksi server.');
        else alert('❌ Error koneksi server.');
    }
};

window.deleteReferralCode = async function(phone) {
    if (!confirm('Apakah Anda yakin ingin menghapus kode referral ini?')) return;
    try {
        const res = await fetch(`/api/referrals/code/${phone}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            if (window.showToast) window.showToast('success', 'Kode referral berhasil dihapus.');
            else alert('✓ Kode referral berhasil dihapus.');
            window.loadReferralDashboardData();
        } else {
            if (window.showToast) window.showToast('error', data.error || 'Gagal menghapus kode.');
            else alert('❌ Error: ' + (data.error || 'Gagal menghapus kode.'));
        }
    } catch (err) {
        if (window.showToast) window.showToast('error', 'Error koneksi server.');
        else alert('❌ Error koneksi server.');
    }
};

window.openQuickLinksModal = function() {
    const modal = document.getElementById('quick-links-modal');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
};

window.closeQuickLinksModal = function() {
    const modal = document.getElementById('quick-links-modal');
    if (modal) modal.classList.add('hidden');
};

window.copyPublicUrl = function(path) {
    const fullUrl = window.location.origin + path;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullUrl).then(() => {
            if (window.showToast) window.showToast('success', 'Link berhasil disalin ke clipboard!');
            else alert('✓ Link berhasil disalin ke clipboard:\n' + fullUrl);
        }).catch(() => {
            prompt('Salin link berikut:', fullUrl);
        });
    } else {
        prompt('Salin link berikut:', fullUrl);
    }
};

window.loadGroupInviteLinksConfig = async function() {
    const tbody = document.getElementById('dashRefGroupLinksBody');
    if (!tbody) return;
    try {
        const res = await fetch('/api/groups');
        const groups = await res.json();
        if (!Array.isArray(groups) || groups.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-secondary);">Belum ada grup terdeteksi.</td></tr>';
            return;
        }

        let html = '';
        groups.forEach(g => {
            const cfg = g.config || {};
            const invLink = cfg.inviteLink || '';
            const isEnabled = g.enabled !== false;
            const statusBadge = isEnabled 
                ? '<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">Aktif</span>'
                : '<span style="background: rgba(239, 68, 68, 0.15); color: #ef4444; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">Nonaktif</span>';

            html += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 10px; font-weight: 600;">${g.name}</td>
                    <td style="padding: 10px; font-size: 0.75rem; color: var(--text-secondary); font-family: monospace;">${g.id}</td>
                    <td style="padding: 10px;">${statusBadge}</td>
                    <td style="padding: 10px;">
                        <input type="text" id="grp-inv-link-${g.id}" value="${invLink}" placeholder="Kosongkan untuk Auto-Detect Link WA" style="width: 100%; min-width: 250px; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--surface2); color: var(--text-color); font-size: 0.8rem;">
                    </td>
                    <td style="padding: 10px; text-align: right;">
                        <button type="button" class="btn btn-primary btn-sm" onclick="saveSingleGroupInviteLink('${g.id}')">Simpan Link</button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('[Load Group Links Error]:', err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-secondary);">Gagal memuat daftar grup.</td></tr>';
    }
};

window.saveSingleGroupInviteLink = async function(groupId) {
    try {
        const inputEl = document.getElementById(`grp-inv-link-${groupId}`);
        const inviteLink = inputEl ? inputEl.value.trim() : '';

        const resGroups = await fetch('/api/groups');
        const groups = await resGroups.json();
        const currentGrp = groups.find(g => g.id === groupId);
        const currentCfg = currentGrp ? (currentGrp.config || {}) : {};

        const payload = {
            ...currentCfg,
            groupName: currentGrp ? currentGrp.name : '',
            enabled: currentGrp ? currentGrp.enabled !== false : true,
            inviteLink
        };

        const resSave = await fetch(`/api/groups/${groupId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const dataSave = await resSave.json();
        if (dataSave.success) {
            if (window.showToast) window.showToast('success', 'Link undangan grup berhasil disimpan!');
            else alert('✓ Link undangan grup berhasil disimpan!');
            window.loadGroupInviteLinksConfig();
        } else {
            if (window.showToast) window.showToast('error', dataSave.error || 'Gagal menyimpan link grup.');
            else alert('❌ Error: ' + (dataSave.error || 'Gagal menyimpan link grup.'));
        }
    } catch (err) {
        if (window.showToast) window.showToast('error', 'Error koneksi server.');
        else alert('❌ Error koneksi server.');
    }
};
