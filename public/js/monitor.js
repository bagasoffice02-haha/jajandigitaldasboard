// ==========================================
// LIVE MONITOR & WHATSAPP CONNECTION MODULE
// ==========================================

let messageCount = 0;
let activeSessionsSet = new Set();
let botStartTime = Date.now();

// Helper escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Update UI Status Koneksi WhatsApp
window.updateConnectionStatus = function(status) {
    const statusDot = document.getElementById('status-dot');
    const headerConnLabel = document.getElementById('header-conn-label');
    const statusText = document.getElementById('status-text');
    const statusInfo = document.getElementById('status-info');
    const statusDevice = document.getElementById('status-device');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const qrCodeDiv = document.getElementById('qr-code');
    const qrStatus = document.getElementById('qr-status');

    console.log('[Monitor] Status WA:', status);

    if (status === 'CONNECTED') {
        if (statusDot) {
            statusDot.className = 'w-2 h-2 rounded-full bg-emerald-400 status-dot-pulse';
        }
        if (headerConnLabel) {
            headerConnLabel.textContent = 'WhatsApp Terhubung';
            headerConnLabel.className = 'text-emerald-400 text-[11px] font-semibold';
        }
        if (statusText) {
            statusText.textContent = 'TERHUBUNG (AKTIF)';
            statusText.className = 'text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        }
        if (statusInfo) statusInfo.textContent = 'Gateway Siap & Responsif';
        if (statusDevice) statusDevice.textContent = 'Sesi Aktif (Online)';

        if (qrPlaceholder) qrPlaceholder.classList.add('hidden');
        if (qrCodeDiv) {
            qrCodeDiv.innerHTML = `
                <div class="text-center p-4 flex flex-col items-center justify-center">
                    <div class="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-2 shadow-inner">
                        <i data-lucide="check-circle" class="w-6 h-6"></i>
                    </div>
                    <p class="text-xs font-bold text-slate-200">Bot Terhubung</p>
                    <p class="text-[10px] text-slate-400 mt-0.5">WhatsApp siap melayani pesan</p>
                </div>
            `;
        }
        if (qrStatus) qrStatus.textContent = '';
    } else if (status === 'QR_RECEIVED') {
        if (statusDot) {
            statusDot.className = 'w-2 h-2 rounded-full bg-amber-400 status-dot-pulse';
        }
        if (headerConnLabel) {
            headerConnLabel.textContent = 'Scan QR Diperlukan';
            headerConnLabel.className = 'text-amber-400 text-[11px] font-semibold';
        }
        if (statusText) {
            statusText.textContent = 'MENUNGGU SCAN QR';
            statusText.className = 'text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20';
        }
        if (statusInfo) statusInfo.textContent = 'Buka WA di HP > Perangkat Tertaut';
        if (statusDevice) statusDevice.textContent = 'Menunggu Login';
        if (qrPlaceholder) qrPlaceholder.classList.add('hidden');
        if (qrStatus) qrStatus.textContent = 'Pindai QR ini melalui aplikasi WhatsApp';
    } else if (status === 'INITIALIZING') {
        if (statusDot) {
            statusDot.className = 'w-2 h-2 rounded-full bg-sky-400 status-dot-pulse';
        }
        if (headerConnLabel) {
            headerConnLabel.textContent = 'Menginisialisasi...';
            headerConnLabel.className = 'text-sky-400 text-[11px] font-semibold';
        }
        if (statusText) {
            statusText.textContent = 'MEMULAI GATEWAY...';
            statusText.className = 'text-[11px] font-bold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20';
        }
        if (statusInfo) statusInfo.textContent = 'Menghubungkan Headless Browser...';
        if (qrPlaceholder) {
            qrPlaceholder.classList.remove('hidden');
            qrPlaceholder.innerHTML = `
                <div class="w-6 h-6 border-2 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mx-auto mb-2"></div>
                <p class="text-xs text-slate-400">Menyiapkan koneksi WhatsApp...</p>
            `;
        }
        if (qrCodeDiv) qrCodeDiv.innerHTML = '';
        if (qrStatus) qrStatus.textContent = '';
    } else {
        if (statusDot) {
            statusDot.className = 'w-2 h-2 rounded-full bg-slate-500';
        }
        if (headerConnLabel) {
            headerConnLabel.textContent = 'Terputus (Offline)';
            headerConnLabel.className = 'text-slate-400 text-[11px]';
        }
        if (statusText) {
            statusText.textContent = 'OFFLINE';
            statusText.className = 'text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/10';
        }
        if (statusInfo) statusInfo.textContent = 'Standby / Belum login';
        if (statusDevice) statusDevice.textContent = '—';
        if (qrPlaceholder) {
            qrPlaceholder.classList.remove('hidden');
            qrPlaceholder.innerHTML = `
                <i data-lucide="qr-code" class="w-10 h-10 mx-auto text-slate-600 mb-2"></i>
                <p class="text-xs text-slate-400 font-medium">Klik Hubungkan untuk Scan QR</p>
            `;
        }
        if (qrCodeDiv) qrCodeDiv.innerHTML = '';
        if (qrStatus) qrStatus.textContent = '';
    }

    if (window.lucide) lucide.createIcons();
};

// Render QR Code pada Canvas
window.renderQRCode = function(qrData) {
    if (!qrData) return;
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const qrCodeDiv = document.getElementById('qr-code');
    const qrStatus = document.getElementById('qr-status');

    if (qrPlaceholder) qrPlaceholder.classList.add('hidden');
    if (!qrCodeDiv) return;

    qrCodeDiv.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'rounded-xl shadow-lg';
    qrCodeDiv.appendChild(canvas);

    if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
        QRCode.toCanvas(canvas, qrData, {
            width: 190,
            margin: 1,
            color: {
                dark: '#090d16',
                light: '#ffffff'
            }
        }, function (error) {
            if (error) {
                console.error('[Monitor] Error toCanvas:', error);
                qrCodeDiv.innerHTML = '<p class="text-xs text-rose-400 text-center">Gagal menggambar QR Code</p>';
            }
        });
    }

    if (qrStatus) qrStatus.textContent = 'Scan via WhatsApp > Perangkat Tertaut';
    window.updateConnectionStatus('QR_RECEIVED');
};

// Hubungkan / Refresh QR Code
window.refreshQRCode = async function(force = false) {
    if (window.showToast) window.showToast('info', 'Meminta sinyal koneksi WhatsApp...');
    window.updateConnectionStatus('INITIALIZING');

    try {
        const res = await fetch('/api/whatsapp/restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clearSession: force })
        });
        const data = await res.json();
        if (data.success) {
            if (window.showToast) window.showToast('success', data.message || 'Memulai ulang client WhatsApp...');
        }
    } catch (err) {
        console.error('Error restart WA:', err);
    }
};

// Ambil Status Awal Saat Halaman Dibuka
window.checkInitialWhatsAppStatus = async function() {
    try {
        const res = await fetch('/api/whatsapp/status');
        if (res.ok) {
            const data = await res.json();
            window.updateConnectionStatus(data.status);
            if (data.qr && data.status !== 'CONNECTED') {
                window.renderQRCode(data.qr);
            }
        }
    } catch (err) {
        console.warn('Initial WA status fetch fallback:', err.message);
    }
};

// Tambahkan Pesan ke Live Stream Obrolan
window.appendMessageLog = function(msg) {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return;

    // Bersihkan placeholder kosong jika ada
    const placeholder = chatContainer.querySelector('.text-slate-500');
    if (placeholder) placeholder.remove();

    messageCount++;
    const statMsg = document.getElementById('stat-msg-count');
    if (statMsg) statMsg.textContent = messageCount;

    const cleanChatId = (msg.chatId || '').split('@')[0];
    if (cleanChatId) activeSessionsSet.add(cleanChatId);
    const statSess = document.getElementById('stat-session-count');
    if (statSess) statSess.textContent = activeSessionsSet.size;

    const timeStr = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isOutgoing = msg.type === 'outgoing';

    const bubble = document.createElement('div');
    bubble.className = `flex items-start gap-2.5 message-log-item ${isOutgoing ? 'flex-row-reverse' : ''}`;
    
    const avatarBg = isOutgoing ? 'bg-indigo-600 text-white' : 'bg-sky-500/20 text-sky-400';
    const bubbleBg = isOutgoing ? 'bg-indigo-500/10 border-indigo-500/30 text-[var(--text-primary)]' : 'bg-[var(--bg-subtle)] border-[var(--border-color)] text-[var(--text-primary)]';

    bubble.innerHTML = `
        <div class="w-7 h-7 rounded-lg ${avatarBg} flex items-center justify-center shrink-0 text-xs font-bold shadow-sm">
            ${isOutgoing ? 'AI' : 'U'}
        </div>
        <div class="max-w-[78%] rounded-2xl p-3 border text-xs ${bubbleBg} shadow-sm space-y-1">
            <div class="flex items-center justify-between gap-3 text-[10px] text-[var(--text-muted)] font-mono">
                <span>+${cleanChatId}</span>
                <span>${timeStr}</span>
            </div>
            <p class="whitespace-pre-wrap leading-relaxed">${escapeHtml(msg.body)}</p>
            ${msg.fileSent ? `
                <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-subtle)] border border-[var(--border-color)] text-[10px] text-indigo-400 mt-1">
                    <i data-lucide="paperclip" class="w-3 h-3"></i>
                    <span>Berkas: ${escapeHtml(msg.fileSent)}</span>
                </div>
            ` : ''}
        </div>
    `;

    chatContainer.appendChild(bubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    if (window.lucide) lucide.createIcons();
};

window.clearChatLogs = function() {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return;
    chatContainer.innerHTML = `
        <div class="text-center py-12 text-slate-500 text-xs flex flex-col items-center justify-center">
            <i data-lucide="inbox" class="w-8 h-8 mb-2 opacity-40"></i>
            <span>Log obrolan telah dibersihkan.</span>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
};

window.filterChatLogs = function() {
    const input = document.getElementById('search-chat-input');
    if (!input) return;
    const query = input.value.toLowerCase().trim();
    const items = document.querySelectorAll('#chat-messages .message-log-item');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query) ? 'flex' : 'none';
    });
};

// Update Uptime Counter
setInterval(() => {
    const uptimeEl = document.getElementById('stat-uptime');
    if (!uptimeEl) return;
    const diff = Date.now() - botStartTime;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        uptimeEl.textContent = `${hours}j ${minutes % 60}m`;
    } else {
        uptimeEl.textContent = `${minutes}m`;
    }
}, 30000);

// Socket Listeners
if (window.socket) {
    window.socket.on('connect', () => {
        console.log('[Socket] Terhubung ke backend dashboard.');
        window.checkInitialWhatsAppStatus();
    });

    window.socket.on('whatsapp_status', (data) => {
        window.updateConnectionStatus(data.status);
    });

    window.socket.on('qr', (qrData) => {
        if (qrData) {
            window.renderQRCode(qrData);
        }
    });

    window.socket.on('message_log', (msg) => {
        window.appendMessageLog(msg);
    });
}

// Inisialisasi awal
document.addEventListener('DOMContentLoaded', () => {
    window.checkInitialWhatsAppStatus();
});
