// ==========================================
// REFERRAL & AFFILIATE SYSTEM (DUAL-VIEW)
// ==========================================
'use strict';

let allDashRefCodesData = [];

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
            if (window.showToast) window.showToast('success', `Pengaturan referral disimpan! (+${points_per_invite} Poin per member)`);
        } else {
            if (window.showToast) window.showToast('error', data.error || 'Gagal menyimpan.');
        }
    } catch (err) {
        if (window.showToast) window.showToast('error', 'Error koneksi server.');
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
    const mobileCards = document.getElementById('dashRefMobileCards');

    if (codes.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-xs text-slate-500">Belum ada peserta referral terdaftar.</td></tr>';
        if (mobileCards) mobileCards.innerHTML = '<div class="py-8 text-center text-xs text-slate-500">Belum ada peserta referral terdaftar.</div>';
        return;
    }

    // 1. Desktop Table
    if (tbody) {
        tbody.innerHTML = codes.map(item => {
            const cleanPhone = (item.user_phone || '').replace(/\D/g, '');
            return `
                <tr>
                    <td class="font-bold text-xs text-white">${escapeHtml(item.user_name || 'Member')}</td>
                    <td class="font-mono-num text-xs text-emerald-400">+${cleanPhone}</td>
                    <td>
                        <code class="font-mono-num font-bold text-xs text-indigo-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">${escapeHtml(item.code)}</code>
                    </td>
                    <td class="font-mono-num text-xs">${item.total_invites || 0} orang</td>
                    <td>
                        <span class="font-mono-num font-bold text-xs text-amber-400">${item.points || 0} Poin</span>
                    </td>
                    <td class="text-right">
                        <div class="flex items-center justify-end gap-1.5">
                            <button onclick="window.openManualRewardModal('${item.user_phone}', '${escapeHtml(item.user_name || 'Member')}', ${item.points || 0})" class="px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-[11px] font-semibold">
                                Atur Poin
                            </button>
                            <button onclick="window.deleteReferralCodeDirect('${item.code}')" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 2. Mobile Cards
    if (mobileCards) {
        mobileCards.innerHTML = codes.map(item => {
            const cleanPhone = (item.user_phone || '').replace(/\D/g, '');
            return `
                <div class="mobile-entity-card">
                    <div class="mobile-entity-header">
                        <div>
                            <h4 class="font-bold text-xs text-white">${escapeHtml(item.user_name || 'Member')}</h4>
                            <span class="font-mono-num text-[11px] text-emerald-400">+${cleanPhone}</span>
                        </div>
                        <code class="font-mono-num font-bold text-xs text-indigo-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">${escapeHtml(item.code)}</code>
                    </div>
                    <div class="flex items-center justify-between text-xs text-slate-300 pt-1">
                        <span>Undangan: <strong>${item.total_invites || 0}</strong></span>
                        <span class="font-bold text-amber-400">${item.points || 0} Poin</span>
                    </div>
                    <div class="mobile-entity-actions">
                        <button onclick="window.openManualRewardModal('${item.user_phone}', '${escapeHtml(item.user_name || 'Member')}', ${item.points || 0})" class="px-3 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold">
                            Atur Poin
                        </button>
                        <button onclick="window.deleteReferralCodeDirect('${item.code}')" class="p-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (window.lucide) lucide.createIcons();
}

function renderReferralDashboardLogs(logs) {
    const tbody = document.getElementById('dashRefLogsBody');
    if (!tbody) return;

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-xs text-slate-500">Belum ada riwayat klaim undangan.</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(l => {
        const timeStr = new Date(l.created_at || Date.now()).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
        const referrerPhone = (l.referrer_phone || '').replace(/\D/g, '');
        const refereePhone = (l.referee_phone || '').replace(/\D/g, '');
        const cleanGid = (l.group_id || '-').split('@')[0];

        return `
            <tr>
                <td class="text-slate-400 text-[11px] font-mono-num whitespace-nowrap">${timeStr}</td>
                <td class="text-xs font-semibold text-white">+${referrerPhone}</td>
                <td class="text-xs text-slate-300">+${refereePhone}</td>
                <td>
                    <code class="font-mono-num text-[11px] text-indigo-400">${escapeHtml(l.referral_code)}</code>
                </td>
                <td class="text-slate-400 text-[11px] font-mono-num">${cleanGid}</td>
            </tr>
        `;
    }).join('');
}

window.filterReferralDashboardTable = function() {
    const input = document.getElementById('ref-search-input');
    if (!input) return;
    const q = input.value.toLowerCase().trim();
    
    const filtered = allDashRefCodesData.filter(c => 
        (c.user_name && c.user_name.toLowerCase().includes(q)) ||
        (c.user_phone && c.user_phone.includes(q)) ||
        (c.code && c.code.toLowerCase().includes(q))
    );
    renderReferralDashboardCodes(filtered);
};

window.openManualRewardModal = function(phone, name, currentPts) {
    const newPts = prompt(`Edit Poin Referral untuk ${name} (+${phone.replace(/\D/g,'')}):\n\nMasukkan jumlah total poin baru:`, currentPts);
    if (newPts === null) return;
    const parsed = parseInt(newPts, 10);
    if (isNaN(parsed)) {
        if (window.showToast) window.showToast('warning', 'Poin harus berupa angka valid!');
        return;
    }

    fetch('/api/referrals/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, points: parsed })
    }).then(r => r.json()).then(d => {
        if (d.success) {
            if (window.showToast) window.showToast('success', `Poin untuk ${name} berhasil diubah menjadi ${parsed} Poin!`);
            window.loadReferralDashboardData();
        } else {
            if (window.showToast) window.showToast('error', d.error || 'Gagal mengubah poin');
        }
    }).catch(e => {
        if (window.showToast) window.showToast('error', 'Error: ' + e.message);
    });
};

window.deleteReferralCodeDirect = function(code) {
    if (!confirm(`Hapus kode referral "${code}" dari sistem?`)) return;

    fetch('/api/referrals/codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    }).then(r => r.json()).then(d => {
        if (d.success) {
            if (window.showToast) window.showToast('success', `Kode referral ${code} dihapus!`);
            window.loadReferralDashboardData();
        } else {
            if (window.showToast) window.showToast('error', d.error || 'Gagal');
        }
    }).catch(e => {
        if (window.showToast) window.showToast('error', 'Error: ' + e.message);
    });
};

window.loadGroupInviteLinksConfig = async function() {
    try {
        const res = await fetch('/api/referrals/invite-links');
        const data = await res.json();
        if (data.success && data.links) {
            const container = document.getElementById('dashRefGroupLinksContainer');
            if (!container) return;
            const keys = Object.keys(data.links);
            if (keys.length === 0) {
                container.innerHTML = '<p class="text-xs text-slate-500">Belum ada tautan undangan grup terkonfigurasi.</p>';
                return;
            }
            container.innerHTML = keys.map(gid => {
                const link = data.links[gid];
                const cleanGid = gid.split('@')[0];
                return `
                    <div class="p-3 rounded-xl bg-[#0b1120] border border-white/10 flex items-center justify-between gap-3 text-xs">
                        <div>
                            <span class="font-bold text-white">Grup: ${cleanGid}</span>
                            <p class="text-[11px] text-slate-400 font-mono-num truncate max-w-xs">${escapeHtml(link)}</p>
                        </div>
                        <a href="${link}" target="_blank" class="px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 text-[11px] font-semibold hover:bg-indigo-600/30">Buka</a>
                    </div>
                `;
            }).join('');
        }
    } catch(e) {}
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.loadReferralDashboardData) window.loadReferralDashboardData();
    }, 600);
});
