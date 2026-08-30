// =========================================================================
// LIVE MONITOR & ENTERPRISE SYSTEM DIAGNOSTICS STUDIO
// =========================================================================

let messageCount = 0;
let errorLogCount = 0;
let activeSessionsSet = new Set();
let botStartTime = Date.now();
let currentMonitorMode = 'chat'; // 'chat' | 'logs'
let currentChatFilter = 'all'; // 'all' | 'incoming' | 'outgoing'
let currentLogFilter = 'all'; // 'all' | 'error' | 'warn' | 'ai'
let systemLogsCache = [];

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

// ── 1. STUDIO MODE SWITCHER (LIVE CHAT VS LOGS) ───────────────────────────
window.switchMonitorStudioMode = function(mode) {
    currentMonitorMode = mode;
    const chatBtn = document.getElementById('monitor-mode-chat-btn');
    const logsBtn = document.getElementById('monitor-mode-logs-btn');
    const chatControls = document.getElementById('monitor-chat-controls');
    const logsControls = document.getElementById('monitor-logs-controls');
    const chatPane = document.getElementById('monitor-pane-chat');
    const logsPane = document.getElementById('monitor-pane-logs');

    if (mode === 'chat') {
        if (chatBtn) {
            chatBtn.className = 'px-3 py-1 text-xs font-bold rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm flex items-center gap-1.5 transition-all';
        }
        if (logsBtn) {
            logsBtn.className = 'px-3 py-1 text-xs font-semibold rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-all';
        }
        if (chatControls) chatControls.classList.remove('hidden');
        if (logsControls) logsControls.classList.add('hidden');
        if (chatPane) chatPane.classList.remove('hidden');
        if (logsPane) logsPane.classList.add('hidden');
    } else {
        if (logsBtn) {
            logsBtn.className = 'px-3 py-1 text-xs font-bold rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm flex items-center gap-1.5 transition-all';
        }
        if (chatBtn) {
            chatBtn.className = 'px-3 py-1 text-xs font-semibold rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-all';
        }
        if (logsControls) logsControls.classList.remove('hidden');
        if (chatControls) chatControls.classList.add('hidden');
        if (logsPane) logsPane.classList.remove('hidden');
        if (chatPane) chatPane.classList.add('hidden');
    }

    if (window.lucide) lucide.createIcons();
};

// ── 2. WHATSAPP CONNECTION & QR CODE STATUS ──────────────────────────────
window.updateConnectionStatus = function(status) {
    const statusDot = document.getElementById('status-dot');
    const headerConnLabel = document.getElementById('header-conn-label');
    const statusText = document.getElementById('status-text');
    const statusInfo = document.getElementById('status-info');
    const statusDevice = document.getElementById('status-device');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const qrCodeDiv = document.getElementById('qr-code');
    const qrStatus = document.getElementById('qr-status');

    if (status === 'CONNECTED') {
        if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-emerald-400 status-dot-pulse';
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
                    <p class="text-xs font-bold text-[var(--text-primary)]">Bot Terhubung</p>
                    <p class="text-[10px] text-[var(--text-muted)] mt-0.5">WhatsApp siap melayani pesan</p>
                </div>
            `;
        }
        if (qrStatus) qrStatus.textContent = '';
    } else if (status === 'QR_RECEIVED') {
        if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-amber-400 status-dot-pulse';
        if (headerConnLabel) {
            headerConnLabel.textContent = 'Scan QR Diperlukan';
            headerConnLabel.className = 'text-amber-400 text-[11px] font-semibold';
        }
        if (statusText) {
            statusText.textContent = 'MENUNGGU SCAN QR';
            statusText.className = 'text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20';
        }
        if (statusInfo) statusInfo.textContent = 'Buka WA > Perangkat Tertaut';
        if (statusDevice) statusDevice.textContent = 'Menunggu Login';
        if (qrPlaceholder) qrPlaceholder.classList.add('hidden');
        if (qrStatus) qrStatus.textContent = 'Pindai QR ini melalui aplikasi WhatsApp';
    } else if (status === 'INITIALIZING') {
        if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-sky-400 status-dot-pulse';
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
                <p class="text-xs text-[var(--text-muted)]">Menyiapkan sesi WhatsApp...</p>
            `;
        }
        if (qrCodeDiv) qrCodeDiv.innerHTML = '';
        if (qrStatus) qrStatus.textContent = '';
    } else {
        if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-slate-500';
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
                <p class="text-xs text-[var(--text-muted)] font-medium">Klik Hubungkan untuk Scan QR</p>
            `;
        }
        if (qrCodeDiv) qrCodeDiv.innerHTML = '';
        if (qrStatus) qrStatus.textContent = '';
    }

    if (window.lucide) lucide.createIcons();
};

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
            width: 180,
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

// ── 3. LIVE CHAT STREAM MODULE ───────────────────────────────────────────
window.setChatFilter = function(filter) {
    currentChatFilter = filter;
    const btnAll = document.getElementById('chat-filter-all');
    const btnIn = document.getElementById('chat-filter-incoming');
    const btnOut = document.getElementById('chat-filter-outgoing');

    const activeClass = 'px-2 py-0.5 rounded font-bold bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm';
    const inactiveClass = 'px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]';

    if (btnAll) btnAll.className = filter === 'all' ? activeClass : inactiveClass;
    if (btnIn) btnIn.className = filter === 'incoming' ? activeClass : inactiveClass;
    if (btnOut) btnOut.className = filter === 'outgoing' ? activeClass : inactiveClass;

    window.filterChatLogs();
};

window.appendMessageLog = function(msg) {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return;

    const placeholder = chatContainer.querySelector('.text-slate-500') || chatContainer.querySelector('.opacity-40')?.parentElement;
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
    bubble.setAttribute('data-msg-type', isOutgoing ? 'outgoing' : 'incoming');
    
    const avatarBg = isOutgoing ? 'bg-indigo-600 text-white' : 'bg-emerald-500/20 text-emerald-400';
    const bubbleBg = isOutgoing ? 'bg-indigo-500/10 border-indigo-500/30 text-[var(--text-primary)]' : 'bg-[var(--bg-subtle)] border-[var(--border-color)] text-[var(--text-primary)]';
    const senderBadge = isOutgoing ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-400 font-bold">BOT AI</span>' : `<span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">${msg.isGroup ? 'GRUP' : 'PELANGGAN'}</span>`;

    bubble.innerHTML = `
        <div class="w-7 h-7 rounded-lg ${avatarBg} flex items-center justify-center shrink-0 text-xs font-bold shadow-sm">
            ${isOutgoing ? 'AI' : 'U'}
        </div>
        <div class="max-w-[80%] rounded-2xl p-3 border text-xs ${bubbleBg} shadow-sm space-y-1 relative group">
            <div class="flex items-center justify-between gap-3 text-[10px] text-[var(--text-muted)] font-mono">
                <div class="flex items-center gap-1.5">
                    ${senderBadge}
                    <span>+${cleanChatId}</span>
                    ${msg.isSimulation ? '<span class="text-[8px] bg-amber-500/20 text-amber-400 px-1 rounded">SIM</span>' : ''}
                </div>
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

    window.filterChatLogs();
    if (window.lucide) lucide.createIcons();
};

window.filterChatLogs = function() {
    const input = document.getElementById('search-chat-input');
    const query = input ? input.value.toLowerCase().trim() : '';
    const items = document.querySelectorAll('#chat-messages .message-log-item');

    items.forEach(item => {
        const type = item.getAttribute('data-msg-type');
        const text = item.textContent.toLowerCase();
        const matchesQuery = !query || text.includes(query);
        const matchesFilter = currentChatFilter === 'all' || currentChatFilter === type;

        item.style.display = (matchesQuery && matchesFilter) ? 'flex' : 'none';
    });
};

window.clearChatLogs = function() {
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return;
    chatContainer.innerHTML = `
        <div class="text-center py-12 text-[var(--text-muted)] text-xs flex flex-col items-center justify-center">
            <i data-lucide="inbox" class="w-8 h-8 mb-2 opacity-40"></i>
            <span>Log obrolan telah dibersihkan.</span>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
};

// ── 4. CHAT SIMULATOR (TEST BOT LIVE) ────────────────────────────────────
window.sendSimulatedTestMessage = async function() {
    const input = document.getElementById('sim-message-input');
    if (!input || !input.value.trim()) return;

    const message = input.value.trim();
    input.value = '';

    try {
        const res = await fetch('/api/system/simulate-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, senderId: '6281234567890@c.us', isGroup: false })
        });
        const data = await res.json();
        if (!data.success && window.showToast) {
            window.showToast('error', data.error || 'Gagal mengirim simulasi');
        }
    } catch(err) {
        console.error('Error sendSimulatedTestMessage:', err);
    }
};

// ── 5. ENTERPRISE SYSTEM & ERROR DIAGNOSTICS LOG STREAM ───────────────────
window.setLogFilter = function(filter) {
    currentLogFilter = filter;
    const btnAll = document.getElementById('log-filter-all');
    const btnErr = document.getElementById('log-filter-error');
    const btnWarn = document.getElementById('log-filter-warn');
    const btnAi = document.getElementById('log-filter-ai');

    const activeClass = 'px-2 py-0.5 rounded font-bold bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm';
    const inactiveClass = 'px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]';

    if (btnAll) btnAll.className = filter === 'all' ? activeClass : inactiveClass;
    if (btnErr) btnErr.className = filter === 'error' ? activeClass + ' text-rose-400' : 'px-2 py-0.5 rounded text-rose-400/70';
    if (btnWarn) btnWarn.className = filter === 'warn' ? activeClass + ' text-amber-400' : 'px-2 py-0.5 rounded text-amber-400/70';
    if (btnAi) btnAi.className = filter === 'ai' ? activeClass + ' text-purple-400' : 'px-2 py-0.5 rounded text-purple-400/70';

    window.filterSystemLogs();
};

window.appendSystemLog = function(logObj) {
    if (!logObj || !logObj.message) return;
    systemLogsCache.push(logObj);
    if (systemLogsCache.length > 300) systemLogsCache.shift();

    if (logObj.level === 'error') {
        errorLogCount++;
        const statErr = document.getElementById('stat-error-count');
        const pillErr = document.getElementById('log-error-pill');
        if (statErr) {
            statErr.textContent = `${errorLogCount} Error`;
            statErr.className = 'font-bold font-mono-num text-rose-400';
        }
        if (pillErr) {
            pillErr.textContent = errorLogCount;
            pillErr.classList.remove('hidden');
        }
    }

    const logsContainer = document.getElementById('system-logs-container');
    if (!logsContainer) return;

    if (logsContainer.children.length === 1 && logsContainer.children[0].textContent.includes('Memuat log')) {
        logsContainer.innerHTML = '';
    }

    const timeStr = new Date(logObj.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    let levelBadge = '';
    let textClass = 'text-slate-300';
    if (logObj.level === 'error') {
        levelBadge = '<span class="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">ERROR</span>';
        textClass = 'text-rose-300 font-semibold';
    } else if (logObj.level === 'warn') {
        levelBadge = '<span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">WARN</span>';
        textClass = 'text-amber-200';
    } else if (logObj.level === 'ai') {
        levelBadge = '<span class="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-400 font-bold border border-purple-500/30">AI</span>';
        textClass = 'text-purple-200';
    } else {
        levelBadge = '<span class="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">INFO</span>';
        textClass = 'text-slate-300';
    }

    const logRow = document.createElement('div');
    logRow.className = `flex items-start gap-2 py-0.5 system-log-item hover:bg-white/5 px-1 rounded transition-colors ${textClass}`;
    logRow.setAttribute('data-log-level', logObj.level || 'info');
    logRow.setAttribute('data-log-tag', logObj.tag || 'SISTEM');

    logRow.innerHTML = `
        <span class="text-[10px] text-slate-500 shrink-0 font-mono">[${timeStr}]</span>
        <div class="shrink-0 text-[9px]">${levelBadge}</div>
        <span class="text-[10px] text-indigo-400 font-semibold shrink-0">[${escapeHtml(logObj.tag || 'SISTEM')}]</span>
        <span class="break-all whitespace-pre-wrap flex-1">${escapeHtml(logObj.message)}</span>
    `;

    logsContainer.appendChild(logRow);

    const autoScrollChk = document.getElementById('log-autoscroll-chk');
    if (!autoScrollChk || autoScrollChk.checked) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    window.filterSystemLogs();
};

window.filterSystemLogs = function() {
    const input = document.getElementById('search-log-input');
    const query = input ? input.value.toLowerCase().trim() : '';
    const items = document.querySelectorAll('#system-logs-container .system-log-item');

    items.forEach(item => {
        const level = item.getAttribute('data-log-level');
        const text = item.textContent.toLowerCase();
        const matchesQuery = !query || text.includes(query);
        const matchesFilter = currentLogFilter === 'all' || currentLogFilter === level;

        item.style.display = (matchesQuery && matchesFilter) ? 'flex' : 'none';
    });
};

window.copyAllSystemLogs = function() {
    if (systemLogsCache.length === 0) {
        if (window.showToast) window.showToast('info', 'Belum ada log untuk disalin');
        return;
    }
    const text = systemLogsCache.map(l => `[${new Date(l.timestamp).toISOString()}] [${(l.level || 'INFO').toUpperCase()}] [${l.tag || 'SISTEM'}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
        if (window.showToast) window.showToast('success', 'Semua log sistem berhasil disalin ke clipboard');
    });
};

window.downloadSystemLogs = function() {
    if (systemLogsCache.length === 0) {
        if (window.showToast) window.showToast('info', 'Belum ada log untuk diunduh');
        return;
    }
    const text = systemLogsCache.map(l => `[${new Date(l.timestamp).toISOString()}] [${(l.level || 'INFO').toUpperCase()}] [${l.tag || 'SISTEM'}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jajan_digital_logs_${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
};

window.clearSystemLogs = async function() {
    systemLogsCache = [];
    errorLogCount = 0;
    const statErr = document.getElementById('stat-error-count');
    const pillErr = document.getElementById('log-error-pill');
    if (statErr) {
        statErr.textContent = '0 Error';
        statErr.className = 'font-bold font-mono-num text-emerald-400';
    }
    if (pillErr) pillErr.classList.add('hidden');

    const logsContainer = document.getElementById('system-logs-container');
    if (logsContainer) {
        logsContainer.innerHTML = '<div class="text-slate-500 text-center py-10">Log sistem telah dibersihkan.</div>';
    }

    try {
        await fetch('/api/system/clear-logs', { method: 'POST' });
        if (window.showToast) window.showToast('success', 'Log sistem dibersihkan.');
    } catch(_) {}
};

window.fetchInitialSystemLogs = async function() {
    try {
        const res = await fetch('/api/system/logs');
        if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.logs)) {
                const logsContainer = document.getElementById('system-logs-container');
                if (logsContainer) logsContainer.innerHTML = '';
                data.logs.forEach(l => window.appendSystemLog(l));
            }
        }
    } catch(_) {}
};

// ── 6. UPTIME & SOCKET MONITORING ────────────────────────────────────────
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

// ── 7. SOCKET LISTENERS ──────────────────────────────────────────────────
if (window.socket) {
    window.socket.on('connect', () => {
        console.log('[Socket] Terhubung ke backend dashboard.');
        window.checkInitialWhatsAppStatus();
        window.fetchInitialSystemLogs();
        const statSock = document.getElementById('stat-socket-clients');
        if (statSock) statSock.textContent = 'Terhubung';
    });

    window.socket.on('disconnect', () => {
        const statSock = document.getElementById('stat-socket-clients');
        if (statSock) statSock.textContent = 'Terputus';
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

    window.socket.on('system_log', (logObj) => {
        window.appendSystemLog(logObj);
    });

    window.socket.on('system_logs_batch', (data) => {
        if (data && Array.isArray(data.logs)) {
            const logsContainer = document.getElementById('system-logs-container');
            if (logsContainer) logsContainer.innerHTML = '';
            data.logs.forEach(l => window.appendSystemLog(l));
        }
    });

    window.socket.on('system_logs_cleared', () => {
        const logsContainer = document.getElementById('system-logs-container');
        if (logsContainer) logsContainer.innerHTML = '<div class="text-slate-500 text-center py-10">Log sistem telah dibersihkan.</div>';
    });
}

// Inisialisasi awal
document.addEventListener('DOMContentLoaded', () => {
    window.checkInitialWhatsAppStatus();
    window.fetchInitialSystemLogs();
});
