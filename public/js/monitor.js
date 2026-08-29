function updateConnectionStatus(status) {
    statusDot.className = 'status-dot';
    
    if (status === 'CONNECTED') {
        statusDot.classList.add('connected');
        statusText.textContent = 'Terhubung (Aktif)';
        qrContainer.classList.add('hidden');
        activeSessionInfo.classList.remove('hidden');
    } else if (status === 'INITIALIZING') {
        statusDot.classList.add('initializing');
        statusText.textContent = 'Menginisialisasi WhatsApp...';
        qrContainer.classList.add('hidden');
        activeSessionInfo.classList.add('hidden');
    } else if (status === 'QR_RECEIVED') {
        statusDot.classList.add('initializing');
        statusText.textContent = 'Menunggu Pindai QR';
        qrContainer.classList.remove('hidden');
        activeSessionInfo.classList.add('hidden');
    } else {
        statusDot.classList.add('disconnected');
        statusText.textContent = 'Terputus (Offline)';
        if (!qrPlaceholder.querySelector('canvas')) {
            qrContainer.classList.add('hidden');
        } else {
            qrContainer.classList.remove('hidden');
        }
        activeSessionInfo.classList.add('hidden');
    }
    if (window.lucide) {
        lucide.createIcons();
    }
}

function renderQRCode(qrData) {
    qrPlaceholder.innerHTML = '';
    
    const canvas = document.createElement('canvas');
    qrPlaceholder.appendChild(canvas);
    
    // Draw QR using the global QRCode library loaded via CDN
    QRCode.toCanvas(canvas, qrData, { 
        width: 220, 
        margin: 1,
        color: {
            dark: '#0b0f19',
            light: '#ffffff'
        }
    }, function (error) {
        if (error) {
            console.error('Error drawing QR canvas:', error);
            qrPlaceholder.innerHTML = '<p style="color:red">Gagal memuat QR Code</p>';
        }
    });

    qrContainer.classList.remove('hidden');
    activeSessionInfo.classList.add('hidden');
}

function appendMessageLog(msg) {
    const placeholder = chatMessages.querySelector('.chat-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    const cleanChatId = msg.chatId.split('@')[0];
    const timestampStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let sessionBlock = document.getElementById(`session-${cleanChatId}`);
    if (!sessionBlock) {
        sessionBlock = document.createElement('div');
        sessionBlock.id = `session-${cleanChatId}`;
        sessionBlock.className = 'chat-session-block';
        
        const header = document.createElement('div');
        header.className = 'session-user-header';
        header.textContent = `WA User: +${cleanChatId}`;
        sessionBlock.appendChild(header);
        chatMessages.appendChild(sessionBlock);
    }
    
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${msg.type}`; // 'incoming' (User) or 'outgoing' (Sania) or 'system-cmd'
    
    let bubbleContent = `<div>${escapeHtml(msg.body)}</div>`;
    
    if (msg.fileSent) {
        const iconName = msg.fileSent.endsWith('.png') ? 'image' : 'file-text';
        bubbleContent += `
            <div class="media-tag-indicator" style="display:inline-flex; align-items:center; gap:6px;">
                <i data-lucide="${iconName}" style="width:14px; height:14px;"></i>
                <span>Mengirim Berkas: <strong>${escapeHtml(msg.fileSent)}</strong></span>
            </div>
        `;
    }
    
    bubbleContent += `<span class="message-time">${timestampStr}</span>`;
    bubble.innerHTML = bubbleContent;
    
    sessionBlock.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (window.lucide) {
        lucide.createIcons();
    }
}


// Expose functions to window for HTML onclick compatibility
window.updateConnectionStatus = updateConnectionStatus;
window.renderQRCode = renderQRCode;
window.appendMessageLog = appendMessageLog;


// Socket Listeners
window.socket.on('connect', () => {
    console.log('Connected to dashboard backend server via WebSockets.');
});

window.socket.on('whatsapp_status', (data) => {
    updateConnectionStatus(data.status);
});

window.socket.on('qr', (qrData) => {
    renderQRCode(qrData);
});

window.socket.on('message_log', (msg) => {
    appendMessageLog(msg);
});

window.socket.on('history_updated', (data) => {
    renderHistoryLog(data);
});

window.socket.on('memory_updated', (data) => {
    if (cfgAiMemory) {
        cfgAiMemory.value = data.content;
    }
    loadFiles();
});

window.socket.on('broadcast_progress', (data) => {
    const container = document.getElementById('broadcast-progress-container');
    const placeholder = document.getElementById('broadcast-progress-placeholder');
    const statusBar = document.getElementById('broadcast-progress-bar');
    const statusText = document.getElementById('broadcast-progress-status');
    const percentText = document.getElementById('broadcast-progress-percent');
    const statTotal = document.getElementById('broadcast-stat-total');
    const statSuccess = document.getElementById('broadcast-stat-success');
    const statFail = document.getElementById('broadcast-stat-fail');
    const terminal = document.getElementById('broadcast-terminal');
    
    if (container && placeholder) {
        container.classList.remove('hidden');
        placeholder.classList.add('hidden');
    }
    
    const pct = Math.round((data.current / data.total) * 100) || 0;
    if (statusBar) statusBar.style.width = `${pct}%`;
    if (percentText) percentText.innerText = `${pct}%`;
    if (statTotal) statTotal.innerText = data.total;
    if (statSuccess) statSuccess.innerText = data.successCount;
    if (statFail) statFail.innerText = data.failCount;
    
    if (statusText) {
        if (data.status === 'RUNNING') {
            statusText.innerText = 'Sedang Mengirim...';
            statusText.style.color = '#3b82f6';
        } else if (data.status === 'COMPLETED') {
            statusText.innerText = '✓ Selesai';
            statusText.style.color = '#10b981';
        } else if (data.status === 'CANCELLED') {
            statusText.innerText = '✕ Dihentikan';
            statusText.style.color = '#ef4444';
        }
    }
    
    if (terminal && data.lastJid) {
        const time = new Date().toLocaleTimeString('id-ID');
        const formattedJid = data.lastJid.replace('@c.us', '');
        const symbol = data.lastStatus === 'SUCCESS' ? '✅' : '❌';
        const msgStr = `[${time}] Kirim ke ${formattedJid} ... ${data.lastStatus === 'SUCCESS' ? 'SUKSES' : 'GAGAL'} ${symbol}\n`;
        terminal.innerText += msgStr;
        terminal.scrollTop = terminal.scrollHeight;
    }
    
    if (data.status === 'CANCELLED' && terminal) {
        terminal.innerText += `[System] Broadcast dibatalkan/dihentikan oleh admin.\n`;
        terminal.scrollTop = terminal.scrollHeight;
    }
});

window.socket.on('group_config_updated', (data) => {
    if (selectedGroupId && data.groupId === selectedGroupId) {
        setTimeout(async () => {
            if (selectedGroupId === data.groupId) {
                try {
                    const res = await fetch(`/api/group-config/${selectedGroupId}`);
                    if (res.ok) {
                        selectedGroupConfig = await res.json();
                        if (quickEditOpen) {
                            renderQuickEditList();
                        } else {
                            renderMenuTreeVisual();
                        }
                    }
                } catch (e) {
                    console.error('Error auto-refreshing group config:', e);
                }
            }
        }, 200);
    }
});

window.socket.on('order_created', (newOrder) => {
    playNotificationSound();
    
    const toast = document.createElement('div');
    toast.style = 'position: fixed; top: 20px; right: 20px; background: #0a84ff; color: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 9999; display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 0.9rem; animation: slideIn 0.3s ease;';
    toast.innerHTML = `<i data-lucide="shopping-bag" style="width: 18px; height: 18px;"></i> <span>Pesanan Baru Masuk! #${newOrder.id}</span>`;
    document.body.appendChild(toast);
    
    if (window.lucide) lucide.createIcons();
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);

    const activeTab = document.querySelector('.ios-tab-btn.active');
    if (activeTab && activeTab.id === 'btn-tab-shop') {
        loadOrders();
    } else {
        const btnShop = document.getElementById('btn-tab-shop');
        if (btnShop) {
            btnShop.style.position = 'relative';
            let dot = document.getElementById('transaction-badge-dot');
            if (!dot) {
                dot = document.createElement('span');
                dot.id = 'transaction-badge-dot';
                dot.style = 'position: absolute; top: 6px; right: 12px; width: 8px; height: 8px; background: #ff453a; border-radius: 50%;';
                btnShop.appendChild(dot);
            }
        }
    }
});

window.socket.on('invoice_created', (newInv) => {
    playNotificationSound();
    
    const toast = document.createElement('div');
    toast.style = 'position: fixed; top: 20px; right: 20px; background: #ff9f0a; color: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 9999; display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 0.9rem; animation: slideIn 0.3s ease;';
    toast.innerHTML = `<i data-lucide="file-text" style="width: 18px; height: 18px;"></i> <span>Invoice Baru Dicetak! #${newInv.id}</span>`;
    document.body.appendChild(toast);
    
    if (window.lucide) lucide.createIcons();
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);

    const activeTab = document.querySelector('.ios-tab-btn.active');
    if (activeTab && activeTab.id === 'btn-tab-shop') {
        loadInvoices();
    } else {
        const btnShop = document.getElementById('btn-tab-shop');
        if (btnShop) {
            btnShop.style.position = 'relative';
            let dot = document.getElementById('transaction-badge-dot');
            if (!dot) {
                dot = document.createElement('span');
                dot.id = 'transaction-badge-dot';
                dot.style = 'position: absolute; top: 6px; right: 12px; width: 8px; height: 8px; background: #ff9f0a; border-radius: 50%;';
                btnShop.appendChild(dot);
            }
        }
    }
});

window.socket.on('telegram_status', (data) => {
    updateTelegramStatusUI(data.status, data.message);
});
