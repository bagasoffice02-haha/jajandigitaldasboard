// Dashboard Admin Chatbot CS Sania AI - Client Logic
const socket = io();

// ══════════════════════════════════════════
// ULTRA MODERN TOAST NOTIFICATION SYSTEM (2026 SAAS EXPERIENCE)
// ══════════════════════════════════════════
window.showToast = function(message, type = 'info', duration = 3500) {
    if (!message) return;
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    
    let iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    let defaultTitle = 'Informasi';

    if (type === 'success') {
        iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
        defaultTitle = 'Berhasil';
    } else if (type === 'error') {
        iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        defaultTitle = 'Gagal';
    } else if (type === 'warning') {
        iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        defaultTitle = 'Perhatian';
    }

    toast.innerHTML = `
        <div class="toast-icon">${iconSvg}</div>
        <div class="toast-content">
            <span class="toast-title">${defaultTitle}</span>
            <span class="toast-message">${message}</span>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 350);
    }, duration);
};

// Override default browser alert with sleek toast notification
window.alert = function(msg) {
    if (!msg) return;
    const str = String(msg).toLowerCase();
    const isError = str.includes('gagal') || str.includes('error') || str.includes('salah') || str.includes('kosong') || str.includes('bukan') || str.includes('tidak');
    const isSuccess = str.includes('berhasil') || str.includes('sukses') || str.includes('disimpan') || str.includes('dihapus') || str.includes('dikirim') || str.includes('disalin');
    const type = isError ? 'error' : (isSuccess ? 'success' : 'info');
    window.showToast(msg, type);
};

// State & UI Elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const qrContainer = document.getElementById('qr-container');
const qrPlaceholder = document.getElementById('qr-code-placeholder');
const activeSessionInfo = document.getElementById('active-session-info');
const knowledgeList = document.getElementById('knowledge-list');
const mediaList = document.getElementById('media-list');
const chatMessages = document.getElementById('chat-messages');
const badgeModelName = document.getElementById('badge-model-name');

// File Upload inputs
const knowledgeUpload = document.getElementById('knowledge-upload');
const mediaUpload = document.getElementById('media-upload');

// Config Form Elements
const configForm = document.getElementById('config-form');
const cfgProvider = document.getElementById('cfg-provider');
const cfgGeminiApiKeys = document.getElementById('cfg-gemini-api-keys');
const cfgGeminiModel = document.getElementById('cfg-gemini-model');

const cfgApiUrl = document.getElementById('cfg-api-url');
const cfgModelName = document.getElementById('cfg-model-name');
const cfgMaxTokens = document.getElementById('cfg-max-tokens');
const cfgApiKey = document.getElementById('cfg-api-key');
const cfgBossNumber = document.getElementById('cfg-boss-number');
const cfgReportTime = document.getElementById('cfg-report-time');
const cfgSystemPrompt = document.getElementById('cfg-system-prompt');
const cfgAiMemory = document.getElementById('cfg-ai-memory');
const historyFinanceList = document.getElementById('history-finance-list');
const historyAgendaList = document.getElementById('history-agenda-list');

window.toggleProviderFields = function() {
    const provider = cfgProvider.value;
    const groups = {
        gemini: document.getElementById('group-gemini-settings'),
        local: document.getElementById('group-local-settings'),
        groq: document.getElementById('group-groq-settings'),
        deepseek: document.getElementById('group-deepseek-settings'),
        qwen: document.getElementById('group-qwen-settings'),
        openrouter: document.getElementById('group-openrouter-settings')
    };
    
    Object.keys(groups).forEach(key => {
        const group = groups[key];
        if (group) {
            if (key === provider) {
                group.classList.remove('hidden');
            } else {
                group.classList.add('hidden');
            }
        }
    });
};

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    loadConfig();
    loadAiMemory();
    loadHistoryLog();
    setupUploadHandlers();
    setupConfigHandler();
    
    // Sync theme selector from localStorage
    const savedTheme = localStorage.getItem('dashboard-theme') || 'light';
    const selector = document.getElementById('cfg-theme-selector');
    if (selector) {
        selector.value = savedTheme;
    }
});

// Change Theme Handler (dihandle di index.html — fungsi ini sebagai fallback/compat)
// Fungsi utama ada di inline script index.html agar tidak ada duplikasi

window.switchTab = function(tabId) {
    // Hide all tab content
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    // Remove active class from all tab buttons
    document.querySelectorAll('.ios-tab-btn').forEach(el => el.classList.remove('active'));
    
    // Show selected tab content
    const selectedTab = document.getElementById(`tab-${tabId}`);
    if (selectedTab) selectedTab.classList.remove('hidden');
    
    // Make corresponding tab button active (with merged tab support)
    let buttonId = tabId;
    if (tabId === 'features' || tabId === 'notes') {
        buttonId = 'memory';
    } else if (tabId === 'transactions' || tabId === 'premium') {
        buttonId = 'shop';
    }
    const selectedBtn = document.getElementById(`btn-tab-${buttonId}`);
    if (selectedBtn) selectedBtn.classList.add('active');
    
    // Specific triggers
    if (tabId === 'groups' || tabId === 'broadcast') {
        loadGroupsList();
    } else if (tabId === 'shop') {
        loadHostAdmins();
        loadCustomersList();
        loadGroupsList();
        loadOrders();
        loadInvoices();
        loadPremiumData();
    } else if (tabId === 'transactions') {
        loadOrders();
        loadInvoices();
    } else if (tabId === 'premium') {
        loadPremiumData();
    } else if (tabId === 'notes') {
        loadLocalNotes();
    } else if (tabId === 'settings') {
        // Auto-load konfigurasi Telegram setiap kali tab Settings dibuka
        setTimeout(() => { if (typeof loadTelegramConfig === 'function') loadTelegramConfig(); }, 150);
    }
};// Real-time Socket.io Connection Events
socket.on('connect', () => {
    console.log('Connected to dashboard backend server via WebSockets.');
});

socket.on('whatsapp_status', (data) => {
    updateConnectionStatus(data.status);
});

socket.on('qr', (qrData) => {
    renderQRCode(qrData);
});

socket.on('message_log', (msg) => {
    appendMessageLog(msg);
});

socket.on('history_updated', (data) => {
    renderHistoryLog(data);
});

socket.on('memory_updated', (data) => {
    if (cfgAiMemory) {
        cfgAiMemory.value = data.content;
    }
    loadFiles();
});

socket.on('broadcast_progress', (data) => {
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

socket.on('group_config_updated', (data) => {
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

// Update WhatsApp status display
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

// Render QR code dynamically
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

// Append new WhatsApp message to the live chat feed
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

// Fetch files list from server
async function loadFiles() {
    try {
        const res = await fetch('/api/files');
        const data = await res.json();
        
        renderFileList(knowledgeList, data.knowledge, 'knowledge');
        renderFileList(mediaList, data.media, 'media');
    } catch (err) {
        console.error('Gagal memuat berkas:', err);
    }
}

// Render list of files in UI
function renderFileList(container, files, type) {
    container.innerHTML = '';
    
    if (!files || files.length === 0) {
        container.innerHTML = `<div class="file-item-placeholder">Tidak ada berkas tersedia.</div>`;
        return;
    }
    
    files.forEach(fileObj => {
        const file = typeof fileObj === 'string' ? fileObj : (fileObj.name || '');
        if (!file) return;

        const item = document.createElement('div');
        item.className = 'file-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = file;
        nameSpan.title = file;
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'file-actions';
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '5px';
        
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-secondary btn-sm';
        viewBtn.innerHTML = 'Lihat';
        viewBtn.onclick = () => window.open(`/${type}/${file}`, '_blank');
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn btn-secondary btn-sm';
        renameBtn.innerHTML = 'Rename';
        renameBtn.onclick = () => renameFile(type, file);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.textContent = 'Hapus';
        deleteBtn.onclick = () => deleteFile(type, file);
        
        actionsDiv.appendChild(viewBtn);
        actionsDiv.appendChild(renameBtn);
        actionsDiv.appendChild(deleteBtn);
        
        item.appendChild(nameSpan);
        item.appendChild(actionsDiv);
        container.appendChild(item);
    });
}

// Rename uploaded file
async function renameFile(type, filename) {
    const newName = prompt(`Masukkan nama baru untuk berkas "${filename}":`, filename);
    if (!newName || newName.trim() === '' || newName.trim() === filename) return;
    
    try {
        const res = await fetch('/api/files/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, oldFilename: filename, newFilename: newName.trim() })
        });
        
        if (res.ok) {
            alert('Nama berkas berhasil diubah!');
            loadFiles();
        } else {
            alert('Gagal mengubah nama berkas: ' + await res.text());
        }
    } catch(err) {
        alert('Gagal mengubah nama berkas: ' + err.message);
    }
}

// Setup File Upload inputs change listeners
function setupUploadHandlers() {
    knowledgeUpload.addEventListener('change', () => handleFileUpload(knowledgeUpload, 'knowledge'));
    mediaUpload.addEventListener('change', () => handleFileUpload(mediaUpload, 'media'));
}

// Handle file upload to backend
async function handleFileUpload(inputElement, type) {
    const file = inputElement.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const res = await fetch(`/api/upload/${type}`, {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            alert(`File ${file.name} berhasil diunggah.`);
            loadFiles();
        } else {
            const errText = await res.text();
            alert(`Gagal mengunggah: ${errText}`);
        }
    } catch (err) {
        console.error('Kesalahan unggah:', err);
        alert('Gagal mengunggah karena gangguan koneksi.');
    } finally {
        inputElement.value = '';
    }
}

// Delete file on server
async function deleteFile(type, filename) {
    if (!confirm(`Apakah Anda yakin ingin menghapus berkas "${filename}"?`)) return;
    
    try {
        const res = await fetch('/api/files/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type, filename })
        });
        
        if (res.ok) {
            loadFiles();
        } else {
            alert('Gagal menghapus berkas.');
        }
    } catch (err) {
        console.error('Kesalahan hapus berkas:', err);
    }
}

// Load configurations from config.json
async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('Gagal mengambil data konfigurasi.');
        const config = await res.json();
        
        cfgProvider.value = config.provider || 'gemini';
        
        // Memuat stok API Keys (gabungkan dengan newline untuk textarea)
        let keysList = '';
        if (config.gemini_api_keys && Array.isArray(config.gemini_api_keys)) {
            keysList = config.gemini_api_keys.join('\n');
        } else if (config.gemini_api_key) {
            keysList = config.gemini_api_key;
        }
        cfgGeminiApiKeys.value = keysList;
        
        cfgGeminiModel.value = config.provider === 'gemini' ? (config.model_name || 'gemini-2.5-flash') : 'gemini-2.5-flash';
        
        cfgApiUrl.value = config.api_url || '';
        cfgModelName.value = config.provider === 'local' ? (config.model_name || 'qwen3.5-9b') : 'qwen3.5-9b';
        const isPlaceholder = (config.api_key || '').includes('YOUR_LOCAL') || (config.api_key || '').includes('TOKEN');
        cfgApiKey.value = isPlaceholder ? '' : (config.api_key || '');
        
        // Memuat stok Groq API Keys (gabungkan dengan newline untuk textarea)
        let groqKeysList = '';
        if (config.groq_api_keys && Array.isArray(config.groq_api_keys)) {
            groqKeysList = config.groq_api_keys.join('\n');
        } else if (config.groq_api_key) {
            groqKeysList = config.groq_api_key;
        }
        document.getElementById('cfg-groq-api-keys').value = groqKeysList;
        document.getElementById('cfg-groq-model').value = config.groq_model || 'llama-3.3-70b-versatile';
        
        document.getElementById('cfg-deepseek-api-key').value = config.deepseek_api_key || '';
        document.getElementById('cfg-deepseek-model').value = config.deepseek_model || 'deepseek-chat';
        
        document.getElementById('cfg-qwen-api-key').value = config.qwen_api_key || '';
        document.getElementById('cfg-qwen-model').value = config.qwen_model || 'qwen-plus';
        
        document.getElementById('cfg-openrouter-api-key').value = config.openrouter_api_key || '';
        document.getElementById('cfg-openrouter-model').value = config.openrouter_model || 'meta-llama/llama-3.3-70b-instruct';
        
        cfgMaxTokens.value = config.max_tokens || 1000;
        window.currentPrivateChatSyncGroupId = config.private_chat_sync_group_id || '';

        const syncSelect = document.getElementById('cfg-private-chat-sync-group-id');
        if (syncSelect) {
            syncSelect.value = window.currentPrivateChatSyncGroupId;
        }

        const privateBotEnabled = document.getElementById('cfg-private-chat-bot-enabled');
        if (privateBotEnabled) {
            privateBotEnabled.checked = config.private_chat_bot_enabled !== false;
        }

        const groupBotEnabled = document.getElementById('cfg-group-chat-bot-enabled');
        if (groupBotEnabled) {
            groupBotEnabled.checked = config.group_chat_bot_enabled !== false;
        }

        const groupAiEnabled = document.getElementById('cfg-group-ai-enabled');
        if (groupAiEnabled) {
            groupAiEnabled.checked = config.group_ai_enabled !== false;
        }

        const privateAiEnabled = document.getElementById('cfg-private-ai-enabled');
        if (privateAiEnabled) {
            privateAiEnabled.checked = config.private_ai_enabled !== false;
        }

        if (cfgBossNumber) cfgBossNumber.value = config.boss_number || '';
        if (cfgReportTime) cfgReportTime.value = config.report_time || '08:00';
        if (cfgSystemPrompt) cfgSystemPrompt.value = config.system_prompt_template || '';
        
        const autoSendVcardEl = document.getElementById('cfg-auto-send-vcard');
        if (autoSendVcardEl) autoSendVcardEl.checked = config.auto_send_vcard !== false;
        
        const vcardNameEl = document.getElementById('cfg-vcard-name');
        if (vcardNameEl) vcardNameEl.value = config.vcard_name || 'CS Jajan Digital';
        
        // Update header badge with current provider name and model
        let providerLabel = 'Gemini';
        if (config.provider === 'local') providerLabel = 'LM Studio';
        else if (config.provider === 'groq') providerLabel = 'Groq';
        else if (config.provider === 'deepseek') providerLabel = 'DeepSeek';
        else if (config.provider === 'qwen') providerLabel = 'Qwen';
        else if (config.provider === 'openrouter') providerLabel = 'OpenRouter';
        
        badgeModelName.textContent = `${providerLabel}: ${config.model_name || 'Aktif'}`;
        
        toggleProviderFields();
    } catch (err) {
        console.error('Error loading config:', err);
    }
}

// Save config handler
function setupConfigHandler() {
    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const provider = cfgProvider.value;
        const keysInput = cfgGeminiApiKeys.value;
        const geminiKeys = keysInput.split('\n')
            .map(k => k.trim())
            .filter(k => k.length > 0);
            
        // Tentukan model name berdasarkan provider yang aktif
        let activeModel = 'gemini-2.5-flash';
        if (provider === 'gemini') {
            activeModel = cfgGeminiModel.value.trim();
        } else if (provider === 'local') {
            activeModel = cfgModelName.value.trim();
        } else if (provider === 'groq') {
            activeModel = document.getElementById('cfg-groq-model').value.trim();
        } else if (provider === 'deepseek') {
            activeModel = document.getElementById('cfg-deepseek-model').value.trim();
        } else if (provider === 'qwen') {
            activeModel = document.getElementById('cfg-qwen-model').value.trim();
        } else if (provider === 'openrouter') {
            activeModel = document.getElementById('cfg-openrouter-model').value.trim();
        }
            
        const payload = {
            provider: provider,
            gemini_api_keys: geminiKeys,
            api_url: cfgApiUrl.value.trim(),
            api_key: (cfgApiKey.value.trim() && !cfgApiKey.value.includes('YOUR_LOCAL') && !cfgApiKey.value.includes('TOKEN')) ? cfgApiKey.value.trim() : (config && config.api_key && !config.api_key.includes('YOUR_LOCAL') ? config.api_key : ''),
            model_name: activeModel,
            max_tokens: parseInt(cfgMaxTokens.value, 10),
            boss_number: cfgBossNumber ? cfgBossNumber.value.trim() : '',
            report_time: cfgReportTime ? cfgReportTime.value.trim() : '08:00',
            system_prompt_template: cfgSystemPrompt ? cfgSystemPrompt.value.trim() : '',
            private_chat_sync_group_id: document.getElementById('cfg-private-chat-sync-group-id') ? document.getElementById('cfg-private-chat-sync-group-id').value : '',
            private_chat_bot_enabled: document.getElementById('cfg-private-chat-bot-enabled') ? document.getElementById('cfg-private-chat-bot-enabled').checked : true,
            group_chat_bot_enabled: document.getElementById('cfg-group-chat-bot-enabled') ? document.getElementById('cfg-group-chat-bot-enabled').checked : true,
            group_ai_enabled: document.getElementById('cfg-group-ai-enabled') ? document.getElementById('cfg-group-ai-enabled').checked : true,
            private_ai_enabled: document.getElementById('cfg-private-ai-enabled') ? document.getElementById('cfg-private-ai-enabled').checked : true,
            auto_send_vcard: document.getElementById('cfg-auto-send-vcard') ? document.getElementById('cfg-auto-send-vcard').checked : false,
            vcard_name: document.getElementById('cfg-vcard-name') ? document.getElementById('cfg-vcard-name').value.trim() : 'CS Jajan Digital',
            
            // Sertakan key & model provider lainnya agar tidak terhapus
            groq_api_keys: (document.getElementById('cfg-groq-api-keys').value || '').split('\n').map(k => k.trim()).filter(k => k.length > 0),
            groq_model: document.getElementById('cfg-groq-model').value.trim(),
            deepseek_api_key: document.getElementById('cfg-deepseek-api-key').value.trim(),
            deepseek_model: document.getElementById('cfg-deepseek-model').value.trim(),
            qwen_api_key: document.getElementById('cfg-qwen-api-key').value.trim(),
            qwen_model: document.getElementById('cfg-qwen-model').value.trim(),
            openrouter_api_key: document.getElementById('cfg-openrouter-api-key').value.trim(),
            openrouter_model: document.getElementById('cfg-openrouter-model').value.trim()
        };
        
        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (res.ok) {
                alert('Konfigurasi bot berhasil disimpan dan diterapkan!');
                loadConfig(); // Refresh values & header badge
            } else {
                alert('Gagal menyimpan konfigurasi.');
            }
        } catch (err) {
            console.error('Save config error:', err);
            alert('Terjadi kesalahan koneksi saat menyimpan.');
        }
    });
}

// Utility to escape HTML and prevent XSS in monitor console
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Load AI Memory from server
async function loadAiMemory() {
    try {
        const res = await fetch('/api/memory');
        if (!res.ok) throw new Error('Gagal mengambil data memori otomatis.');
        const data = await res.json();
        if (cfgAiMemory) {
            cfgAiMemory.value = data.content || '';
        }
    } catch (err) {
        console.error('Error loading AI memory:', err);
    }
}

// Save AI Memory to server
window.saveAiMemory = async function() {
    if (!cfgAiMemory) return;
    
    const payload = {
        content: cfgAiMemory.value
    };
    
    try {
        const res = await fetch('/api/memory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            alert('Undang-Undang Utama AI (Konstitusi Bot) berhasil disimpan!');
            loadFiles();
        } else {
            alert('Gagal menyimpan Undang-Undang.');
        }
    } catch (err) {
        console.error('Save memory error:', err);
        alert('Terjadi kesalahan koneksi saat menyimpan.');
    }
};

// Clear AI Memory
window.clearAiMemory = function() {
    if (!cfgAiMemory) return;
    if (confirm('Apakah Anda yakin ingin menghapus seluruh Undang-Undang Utama AI (Konstitusi Bot)?')) {
        cfgAiMemory.value = '';
        saveAiMemory();
    }
};

// Load History Logs from server
async function loadHistoryLog() {
    try {
        const res = await fetch('/api/history');
        if (!res.ok) throw new Error('Gagal mengambil history log.');
        const data = await res.json();
        renderHistoryLog(data);
    } catch (err) {
        console.error('Error loading history log:', err);
    }
}

// Render history logs inside WhatsApp style lists (iOS layout)
function renderHistoryLog(data) {
    if (!data) return;
    
    // 1. Finance list
    if (historyFinanceList) {
        historyFinanceList.innerHTML = '';
        const finance = data.finance || [];
        if (finance.length === 0) {
            historyFinanceList.innerHTML = `
                <div class="file-item-placeholder">Belum ada catatan keuangan masuk.</div>
            `;
        } else {
            finance.forEach(entry => {
                const item = document.createElement('div');
                item.className = 'wa-chat-item';
                
                const dateStr = new Date(entry.tanggal).toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                const isIncome = entry.tipe === 'Pemasukan';
                const avatarIcon = isIncome ? 'arrow-down-left' : 'arrow-up-right';
                const avatarClass = isIncome ? 'income' : 'expense';
                
                item.innerHTML = `
                    <div class="wa-chat-avatar ${avatarClass}"><i data-lucide="${avatarIcon}"></i></div>
                    <div class="wa-chat-details">
                        <div class="wa-chat-title-row">
                            <span class="wa-chat-title">${escapeHtml(entry.keterangan)}</span>
                            <span class="wa-chat-time">${dateStr}</span>
                        </div>
                        <div class="wa-chat-subtitle-row" style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                            <span class="wa-chat-subtitle" style="color:${isIncome ? '#30d158' : '#ff453a'}; font-weight:600; font-size:13.5px;">
                                ${isIncome ? '+' : '-'} Rp ${entry.nominal.toLocaleString('id-ID')}
                            </span>
                            <span class="preset-category-badge" style="background:${isIncome ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)'}; color:${isIncome ? '#30d158' : '#ff453a'}; padding:2px 6px; font-size:10px; border-radius:4px; font-weight:600;">
                                ${entry.tipe}
                            </span>
                        </div>
                    </div>
                `;
                historyFinanceList.appendChild(item);
            });
        }
    }
    
    // 2. Agenda list
    if (historyAgendaList) {
        historyAgendaList.innerHTML = '';
        const agenda = data.agenda || [];
        if (agenda.length === 0) {
            historyAgendaList.innerHTML = `
                <div class="file-item-placeholder">Belum ada agenda terjadwal.</div>
            `;
        } else {
            agenda.forEach(entry => {
                const item = document.createElement('div');
                item.className = 'wa-chat-item';
                
                item.innerHTML = `
                    <div class="wa-chat-avatar agenda"><i data-lucide="calendar"></i></div>
                    <div class="wa-chat-details">
                        <div class="wa-chat-title-row">
                            <span class="wa-chat-title">${escapeHtml(entry.acara)}</span>
                        </div>
                        <div class="wa-chat-subtitle-row" style="margin-top:4px;">
                            <span class="wa-chat-subtitle" style="color:var(--wa-green); font-size:12.5px; font-weight:600;">
                                <i data-lucide="clock" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-top:-2px; margin-right:2px;"></i> ${escapeHtml(entry.waktu)}
                            </span>
                        </div>
                    </div>
                `;
                historyAgendaList.appendChild(item);
            });
        }
    }

    // Trigger Lucide SVG compilation
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Refresh WhatsApp Client (Refresh QR/Sesi)
window.refreshQRCode = async function(clearSession = false) {
    const confirmMsg = clearSession 
        ? 'Apakah Anda yakin ingin mereset sesi WhatsApp dan memindai QR Code baru?' 
        : 'Apakah Anda ingin memuat ulang koneksi WhatsApp?';
        
    if (!confirm(confirmMsg)) return;
    
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.textContent = 'Memuat Ulang...';
    
    try {
        const res = await fetch('/api/whatsapp/restart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ clearSession })
        });
        
        if (res.ok) {
            alert('WhatsApp Client sedang di-restart, mohon tunggu beberapa saat.');
        } else {
            const errMsg = await res.text();
            alert('Gagal me-restart client: ' + errMsg);
        }
    } catch (err) {
        console.error('Restart client error:', err);
        alert('Terjadi kesalahan koneksi saat me-restart.');
    }
};

// ══════════════════════════════════════════
// GROUPS TAB LOGIC
// ══════════════════════════════════════════

let activeGroups = [];
let selectedGroupId = null;
let selectedGroupConfig = null;
let selectedNodeId = null;

// Ambil Daftar Grup dari API
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

// Render daftar grup ke sidebar kiri
function renderGroupsListSidebar() {
    const container = document.getElementById('groups-list-container');
    if (!container) return;
    
    if (activeGroups.length === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; font-size:0.85rem; margin-top:30px;">Tidak ada grup yang terdeteksi.</p>';
        return;
    }
    
    container.innerHTML = '';
    activeGroups.forEach(g => {
        const card = document.createElement('div');
        card.className = `group-item-card ${selectedGroupId === g.id ? 'active' : ''}`;
        card.style = `
            padding: 10px;
            border-radius: 6px;
            border: 1px solid ${selectedGroupId === g.id ? 'var(--accent-color)' : 'var(--border-color)'};
            background: ${selectedGroupId === g.id ? 'rgba(10, 132, 255, 0.1)' : 'rgba(255,255,255,0.02)'};
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.2s ease;
            margin-bottom: 8px;
        `;
        
        // Hover effect
        card.onmouseover = () => { if (selectedGroupId !== g.id) card.style.background = 'rgba(255,255,255,0.05)'; };
        card.onmouseout = () => { if (selectedGroupId !== g.id) card.style.background = 'rgba(255,255,255,0.02)'; };
        card.onclick = () => selectGroup(g.id);
        
        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = `
            <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:180px;">${g.name}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary);">${g.id.split('@')[0]}</div>
        `;
        
        const badge = document.createElement('span');
        badge.textContent = g.enabled ? 'Aktif' : 'Nonaktif';
        badge.style = `
            font-size: 0.65rem;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            background: ${g.enabled ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.1)'};
            color: ${g.enabled ? '#30d158' : 'var(--text-secondary)'};
        `;
        
        card.appendChild(infoDiv);
        card.appendChild(badge);
        container.appendChild(card);
    });
}

// Memilih Grup untuk dikonfigurasi
window.selectGroup = async function(groupId) {
    selectedGroupId = groupId;
    selectedNodeId = null;
    
    // UI states
    document.getElementById('no-group-selected-placeholder').classList.add('hidden');
    document.getElementById('group-editor-panel').classList.remove('hidden');
    
    // Set JID and default tab
    const jidEl = document.getElementById('selected-group-jid');
    if (jidEl) jidEl.textContent = groupId;
    if (typeof window.switchGroupSubTab === 'function') {
        window.switchGroupSubTab('settings');
    }
    
    // Highlight list sidebar
    renderGroupsListSidebar();
    
    // Load config dari server
    try {
        const res = await fetch(`/api/group-config/${groupId}`);
        if (!res.ok) throw new Error('Gagal mengambil data konfigurasi grup');
        
        selectedGroupConfig = await res.json();
        
        // Set info dasar
        document.getElementById('selected-group-title').textContent = selectedGroupConfig.groupName;
        document.getElementById('grp-enabled').checked = selectedGroupConfig.enabled;
        document.getElementById('grp-ai-fallback').checked = selectedGroupConfig.useAiFallback;
        document.getElementById('grp-ai-names').value = selectedGroupConfig.aiNames || 'bot, ai';
        document.getElementById('grp-trigger').value = selectedGroupConfig.triggerPrefix || '';
        document.getElementById('grp-category-footer').value = selectedGroupConfig.categoryFooter || 'Silakan pilih menu dengan mengetik angkanya:';
        document.getElementById('grp-content-footer').value = selectedGroupConfig.contentFooter || 'Ketik *0* untuk kembali ke menu sebelumnya, atau *#* untuk kembali ke menu utama.';
        
        // Emojis, Number navigation, Headers/Footers
        document.getElementById('grp-category-emoji').value = selectedGroupConfig.categoryEmoji || '📁';
        document.getElementById('grp-content-emoji').value = selectedGroupConfig.contentEmoji || '📄';
        document.getElementById('grp-number-nav-enable').checked = selectedGroupConfig.enableNumberNavigation !== false;
        document.getElementById('grp-universal-header').value = selectedGroupConfig.universalHeader || '';
        document.getElementById('grp-universal-footer').value = selectedGroupConfig.universalFooter || '';
        document.getElementById('grp-welcome-message').value = selectedGroupConfig.welcomeMessage || '';
        document.getElementById('grp-goodbye-message').value = selectedGroupConfig.goodbyeMessage || '';
        document.getElementById('grp-open-text').value = selectedGroupConfig.groupOpenText || '';
        document.getElementById('grp-close-text').value = selectedGroupConfig.groupCloseText || '';
        
        // Auto Close Schedule
        const schedule = selectedGroupConfig.autoCloseSchedule || { enabled: false, openTime: '08:00', closeTime: '17:00', activeDays: [1,2,3,4,5,6,7] };
        document.getElementById('grp-auto-close-enable').checked = schedule.enabled;
        document.getElementById('grp-open-time').value = schedule.openTime || '08:00';
        document.getElementById('grp-close-time').value = schedule.closeTime || '17:00';
        
        // Day checkboxes
        const activeDays = schedule.activeDays || [1,2,3,4,5,6,7];
        document.querySelectorAll('.grp-active-day-cb').forEach(cb => {
            cb.checked = activeDays.includes(parseInt(cb.value, 10));
        });
        
        // Toggle schedule UI fields visibility
        toggleScheduleFields();

        // Scheduled Message
        const legacyMsg = selectedGroupConfig.scheduledMessage || { enabled: false, time: '12:00', activeDays: [1,2,3,4,5,6,7], message: '' };
        let schedMessages = selectedGroupConfig.scheduledMessages || [];
        
        // Auto migrate legacy single scheduledMessage to the array
        if (legacyMsg.enabled && legacyMsg.message && legacyMsg.message.trim() !== '' && schedMessages.length === 0) {
            schedMessages.push(legacyMsg);
            selectedGroupConfig.scheduledMessage = { enabled: false, time: '12:00', activeDays: [1,2,3,4,5,6,7], message: '' };
        }
        
        selectedGroupConfig.scheduledMessages = schedMessages;
        renderSchedMsgList(schedMessages);

        // Extra Triggers
        renderExtraTriggersList(selectedGroupConfig.extraTriggers || []);
        
        // Load knowledge files list (dengan checkbox keaktifan)
        await loadKnowledgeFilesChecklist();
        
        // Render visual editor pohon menu
        renderMenuTreeVisual();
        
        // Reset editor node sebelah kanan
        resetNodeEditorForm();

        // Refresh Quick Edit list if currently open
        if (typeof quickEditOpen !== 'undefined' && quickEditOpen) {
            renderQuickEditList();
        }
    } catch (err) {
        console.error('Error selectGroup:', err);
        alert('Gagal memuat konfigurasi grup: ' + err.message);
    }
};

// Ambil knowledge files dan tampilkan list checkbox
async function loadKnowledgeFilesChecklist() {
    const container = document.getElementById('grp-knowledge-files');
    if (!container) return;
    
    try {
        const res = await fetch('/api/files');
        if (!res.ok) throw new Error('Gagal mengambil berkas referensi');
        const data = await res.json();
        
        const files = data.knowledge || [];
        if (files.length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary); font-size:0.75rem; text-align:center; margin-top:20px;">Tidak ada berkas .txt di tab Memory.</p>';
            return;
        }
        
        container.innerHTML = '';
        files.forEach(f => {
            const label = document.createElement('label');
            label.style = 'display:flex; align-items:center; gap:8px; font-size:0.8rem; cursor:pointer; padding:2px 0;';
            
            const isChecked = selectedGroupConfig.allowedKnowledgeFiles && selectedGroupConfig.allowedKnowledgeFiles.includes(f.name);
            label.innerHTML = `
                <input type="checkbox" class="grp-kb-checkbox" value="${f.name}" ${isChecked ? 'checked' : ''} style="width:14px; height:14px;">
                <span style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${f.name}">${f.name}</span>
            `;
            container.appendChild(label);
        });
    } catch (err) {
        console.error('Error loadKnowledgeFilesChecklist:', err);
        container.innerHTML = '<p style="color:#ff453a; font-size:0.75rem;">Gagal memuat daftar berkas.</p>';
    }
}

// ══════════════════════════════════════════
// LOGIKA POHON MENU (TREE MENU EDITOR)
// ══════════════════════════════════════════

// Render pohon secara visual
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

// Buat elemen HTML untuk sebuah node secara rekursif
function createNodeHTML(node, depth) {
    const div = document.createElement('div');
    div.style.marginLeft = `${depth * 15}px`;
    div.style.marginTop = '4px';
    
    const header = document.createElement('div');
    header.className = `menu-node-item ${selectedNodeId === node.id ? 'selected' : ''}`;
    
    // Style node item
    header.style = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        border-radius: 4px;
        cursor: pointer;
        background: ${selectedNodeId === node.id ? 'rgba(10, 132, 255, 0.15)' : 'transparent'};
        border: 1px solid ${selectedNodeId === node.id ? 'var(--accent-color)' : 'transparent'};
        font-size: 0.85rem;
        transition: all 0.15s ease;
    `;
    
    // Hover effects
    header.onmouseover = () => { if (selectedNodeId !== node.id) header.style.background = 'rgba(255,255,255,0.03)'; };
    header.onmouseout = () => { if (selectedNodeId !== node.id) header.style.background = 'transparent'; };
    header.onclick = (e) => {
        e.stopPropagation();
        selectTreeNode(node.id);
    };
    
    const iconName = node.type === 'category' ? 'folder' : 'file-text';
    const color = node.type === 'category' ? '#ff9f0a' : '#0a84ff';
    
    const statusBadge = node.type === 'content' 
        ? `<span class="status-badge" onclick="quickToggleStatus(event, '${node.id}')" style="font-size: 0.65rem; margin-left: 6px; padding: 2px 6px; border-radius: 4px; font-weight: bold; background: ${
            node.status === 'Tersedia' ? 'rgba(52, 199, 89, 0.15); color: #30d158; border: 1px solid rgba(52, 199, 89, 0.3);' :
            node.status === 'Habis' ? 'rgba(255, 69, 58, 0.15); color: #ff453a; border: 1px solid rgba(255, 69, 58, 0.3);' :
            node.status === 'Pre-order' ? 'rgba(255, 159, 10, 0.15); color: #ff9f0a; border: 1px solid rgba(255, 159, 10, 0.3);' :
            'rgba(255,255,255,0.05); color: var(--text-secondary); border: 1px solid rgba(255,255,255,0.1);'
        }">${node.status || 'Atur Status'}</span>`
        : '';

    header.innerHTML = `
        <i data-lucide="${iconName}" style="width: 14px; height: 14px; color: ${color};"></i>
        <span style="font-weight: ${node.type === 'category' ? '600' : '400'}; flex: 1;">${node.name}</span>
        ${statusBadge}
        ${node.type === 'category' ? `<span style="font-size:0.7rem; color:var(--text-secondary); padding: 0 4px; background:rgba(255,255,255,0.05); border-radius:3px;">${node.children ? node.children.length : 0}</span>` : ''}
    `;
    
    div.appendChild(header);
    
    // Render children jika bertipe kategori
    if (node.type === 'category' && node.children && node.children.length > 0) {
        const childrenContainer = document.createElement('div');
        node.children.forEach(child => {
            const childEl = createNodeHTML(child, depth + 1);
            childrenContainer.appendChild(childEl);
        });
        div.appendChild(childrenContainer);
    }
    
    return div;
}

window.quickToggleStatus = function(e, nodeId) {
    e.stopPropagation(); // Cegah selectNode terpanggil!
    if (!selectedGroupConfig) return;
    
    const node = findNodeInTree(selectedGroupConfig.menuTree, nodeId);
    if (node && node.type === 'content') {
        const statuses = ['', 'Tersedia', 'Habis', 'Pre-order'];
        const currentIdx = statuses.indexOf(node.status || '');
        const nextIdx = (currentIdx + 1) % statuses.length;
        node.status = statuses[nextIdx];
        
        // Re-render visual tree
        renderMenuTreeVisual();
        
        // Jika node ini sedang dipilih, sinkronkan nilai di form edit kanan juga!
        if (selectedNodeId === nodeId) {
            document.getElementById('node-status').value = node.status;
        }
    }
};


// Memilih Node Menu untuk diedit
window.selectTreeNode = function(nodeId) {
    selectedNodeId = nodeId;
    renderMenuTreeVisual(); // Re-render visual highlighting
    
    const node = findNodeInTree(selectedGroupConfig.menuTree, nodeId);
    if (!node) return;
    
    // Tampilkan editor fields
    document.getElementById('node-editor-placeholder').classList.add('hidden');
    document.getElementById('node-editor-fields').classList.remove('hidden');
    
    // Reset to message tab
    if (typeof window.switchNodeEditorTab === 'function') {
        window.switchNodeEditorTab('message');
    }
    
    // Update data form
    document.getElementById('node-name').value = node.name;
    document.getElementById('node-aliases').value = Array.isArray(node.aliases) ? node.aliases.join(', ') : '';
    document.getElementById('node-type').value = node.type;
    
    // Tipe toggle fields
    toggleNodeFields();
    
    document.getElementById('node-text').value = node.text || '';
    const promoCheck = document.getElementById('node-promo');
    if (promoCheck) {
        promoCheck.checked = !!node.isPromo;
    }
    if (node.type === 'content') {
        document.getElementById('node-media').value = node.media || '';
        document.getElementById('node-status-field').classList.remove('hidden');
        document.getElementById('node-status').value = node.status || '';
    } else {
        document.getElementById('node-media').value = '';
        document.getElementById('node-status-field').classList.add('hidden');
        document.getElementById('node-status').value = '';
    }

    // Auto scroll to active node editor on mobile so the user sees they can edit
    setTimeout(() => {
        const editorEl = document.getElementById('active-node-editor');
        if (editorEl) {
            editorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 80);
};

window.toggleNodeFields = function() {
    const nodeType = document.getElementById('node-type').value;
    const mediaField = document.getElementById('node-media-field');
    const statusField = document.getElementById('node-status-field');
    const btnAddChild = document.getElementById('btn-add-child');
    
    if (nodeType === 'category') {
        if (mediaField) mediaField.classList.add('hidden');
        if (statusField) statusField.classList.add('hidden');
        if (btnAddChild) btnAddChild.classList.remove('hidden');
    } else {
        if (mediaField) mediaField.classList.remove('hidden');
        if (statusField) statusField.classList.remove('hidden');
        if (btnAddChild) btnAddChild.classList.add('hidden');
    }
    
    // Sync ke data pohon jika ada pergantian tipe node
    if (selectedGroupId && selectedNodeId) {
        const node = findNodeInTree(selectedGroupConfig.menuTree, selectedNodeId);
        if (node && node.type !== nodeType) {
            node.type = nodeType;
            if (nodeType === 'category') {
                node.children = node.children || [];
                delete node.media;
                delete node.status;
            } else {
                node.media = "";
                node.status = "";
                delete node.children;
            }
            renderMenuTreeVisual();
        }
    }
};

// Reset Form Node Editor
function resetNodeEditorForm() {
    document.getElementById('node-editor-fields').classList.add('hidden');
    document.getElementById('node-editor-placeholder').classList.remove('hidden');
    selectedNodeId = null;
}

// Helper rekursif: Cari node di dalam pohon
function findNodeInTree(node, id) {
    if (node.id === id) return node;
    if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
            const found = findNodeInTree(child, id);
            if (found) return found;
        }
    }
    return null;
}

// Hubungkan Listener Input Form secara real-time
document.addEventListener('DOMContentLoaded', () => {
    const inputName = document.getElementById('node-name');
    const inputText = document.getElementById('node-text');
    const inputMedia = document.getElementById('node-media');
    
    if (inputName) {
        inputName.addEventListener('input', (e) => {
            if (!selectedGroupId || !selectedNodeId) return;
            const node = findNodeInTree(selectedGroupConfig.menuTree, selectedNodeId);
            if (node) {
                node.name = e.target.value;
                renderMenuTreeVisual();
            }
        });
    }
    
    if (inputText) {
        inputText.addEventListener('input', (e) => {
            if (!selectedGroupId || !selectedNodeId) return;
            const node = findNodeInTree(selectedGroupConfig.menuTree, selectedNodeId);
            if (node) {
                node.text = e.target.value;
            }
        });
    }
    
    if (inputMedia) {
        inputMedia.addEventListener('input', (e) => {
            if (!selectedGroupId || !selectedNodeId) return;
            const node = findNodeInTree(selectedGroupConfig.menuTree, selectedNodeId);
            if (node && node.type === 'content') {
                node.media = e.target.value;
            }
        });
    }
    
    const inputStatus = document.getElementById('node-status');
    if (inputStatus) {
        inputStatus.addEventListener('change', (e) => {
            if (!selectedGroupId || !selectedNodeId) return;
            const node = findNodeInTree(selectedGroupConfig.menuTree, selectedNodeId);
            if (node && node.type === 'content') {
                node.status = e.target.value;
                renderMenuTreeVisual();
            }
        });
    }
    
    const inputAliases = document.getElementById('node-aliases');
    if (inputAliases) {
        inputAliases.addEventListener('input', (e) => {
            if (!selectedGroupId || !selectedNodeId) return;
            const node = findNodeInTree(selectedGroupConfig.menuTree, selectedNodeId);
            if (node) {
                node.aliases = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
            }
        });
    }
    
    const inputPromo = document.getElementById('node-promo');
    if (inputPromo) {
        inputPromo.addEventListener('change', (e) => {
            if (!selectedGroupId || !selectedNodeId) return;
            const node = findNodeInTree(selectedGroupConfig.menuTree, selectedNodeId);
            if (node) {
                node.isPromo = e.target.checked;
                renderMenuTreeVisual();
            }
        });
    }
});

// Tambah Node Anak ke kategori aktif
window.addChildNode = function() {
    if (!selectedGroupId || !selectedNodeId) return;
    const node = findNodeInTree(selectedGroupConfig.menuTree, selectedNodeId);
    if (!node || node.type !== 'category') return;
    
    const newId = Date.now().toString();
    const newNode = {
        id: newId,
        name: "Menu Baru",
        type: "content",
        text: "Isi balasan teks...",
        media: ""
    };
    
    node.children = node.children || [];
    node.children.push(newNode);
    
    renderMenuTreeVisual();
    selectTreeNode(newId); // Select node baru agar bisa diedit
};

// Hapus Node
window.deleteNode = function() {
    if (!selectedGroupId || !selectedNodeId) return;
    
    if (selectedNodeId === 'root') {
        alert('Node Utama (Root) tidak boleh dihapus!');
        return;
    }
    
    if (!confirm('Apakah Anda yakin ingin menghapus menu ini beserta seluruh sub-menunya?')) return;
    
    const removed = removeNodeFromTree(selectedGroupConfig.menuTree, selectedNodeId);
    if (removed) {
        resetNodeEditorForm();
        renderMenuTreeVisual();
    }
};

// Helper rekursif: Hapus node dari pohon
function removeNodeFromTree(parentNode, targetId) {
    if (parentNode.children && Array.isArray(parentNode.children)) {
        for (let i = 0; i < parentNode.children.length; i++) {
            if (parentNode.children[i].id === targetId) {
                parentNode.children.splice(i, 1);
                return true;
            }
            const found = removeNodeFromTree(parentNode.children[i], targetId);
            if (found) return true;
        }
    }
    return false;
}

// Simpan Konfigurasi Grup & Menu Tree ke Server
window.saveGroupConfiguration = async function(showAlert = true, refreshGroupList = true) {
    if (!selectedGroupId || !selectedGroupConfig) return;
    
    const enabled = document.getElementById('grp-enabled').checked;
    const useAiFallback = document.getElementById('grp-ai-fallback').checked;
    const aiNames = document.getElementById('grp-ai-names').value.trim();
    const triggerPrefix = document.getElementById('grp-trigger').value.trim();
    const categoryFooter = document.getElementById('grp-category-footer').value.trim();
    const contentFooter = document.getElementById('grp-content-footer').value.trim();
    
    const categoryEmoji = document.getElementById('grp-category-emoji').value.trim() || '📁';
    const contentEmoji = document.getElementById('grp-content-emoji').value.trim() || '📄';
    const enableNumberNavigation = document.getElementById('grp-number-nav-enable').checked;
    const universalHeader = document.getElementById('grp-universal-header').value.trim();
    const universalFooter = document.getElementById('grp-universal-footer').value.trim();
    const welcomeMessage = document.getElementById('grp-welcome-message').value.trim();
    const goodbyeMessage = document.getElementById('grp-goodbye-message').value.trim();
    const groupOpenText = document.getElementById('grp-open-text').value.trim();
    const groupCloseText = document.getElementById('grp-close-text').value.trim();
    
    // Auto Close Schedule
    const activeDays = [];
    document.querySelectorAll('.grp-active-day-cb:checked').forEach(cb => {
        activeDays.push(parseInt(cb.value, 10));
    });
    const autoCloseSchedule = {
        enabled: document.getElementById('grp-auto-close-enable').checked,
        openTime: document.getElementById('grp-open-time').value,
        closeTime: document.getElementById('grp-close-time').value,
        activeDays
    };

    // Multiple Scheduled Messages
    const scheduledMessages = [];
    document.querySelectorAll('.grp-sched-msg-row').forEach(row => {
        const enabled = row.querySelector('.grp-sched-msg-row-enable').checked;
        const time = row.querySelector('.grp-sched-msg-row-time').value;
        const message = row.querySelector('.grp-sched-msg-row-content').value.trim();
        
        const activeDays = [];
        row.querySelectorAll('.grp-sched-msg-row-day-cb:checked').forEach(cb => {
            activeDays.push(parseInt(cb.value, 10));
        });
        
        if (message) {
            scheduledMessages.push({
                enabled,
                time,
                message,
                activeDays
            });
        }
    });
    
    // For backwards compatibility: keep dummy single scheduledMessage payload
    const scheduledMessage = scheduledMessages.length > 0 ? scheduledMessages[0] : { enabled: false, time: '12:00', activeDays: [], message: '' };
    
    // Extra Triggers
    const extraTriggers = [];
    document.querySelectorAll('.extra-trigger-row').forEach(row => {
        const keyword = row.querySelector('.grp-et-keyword').value.trim();
        const reply = row.querySelector('.grp-et-reply').value.trim();
        if (keyword && reply) {
            extraTriggers.push({ keyword, reply });
        }
    });

    // Ambil file referensi tercentang
    const allowedKnowledgeFiles = [];
    document.querySelectorAll('.grp-kb-checkbox:checked').forEach(cb => {
        allowedKnowledgeFiles.push(cb.value);
    });
    
    const paymentType = document.getElementById('host-payment-type') ? document.getElementById('host-payment-type').value : 'qris';
    const paymentMedia = document.getElementById('host-payment-media') ? document.getElementById('host-payment-media').value.trim() : 'Qris.jpeg';
    const paymentText = document.getElementById('host-payment-text') ? document.getElementById('host-payment-text').value : '';

    const payload = {
        groupName: selectedGroupConfig.groupName,
        enabled,
        useAiFallback,
        aiNames,
        triggerPrefix,
        categoryFooter,
        contentFooter,
        allowedKnowledgeFiles,
        menuTree: selectedGroupConfig.menuTree,
        categoryEmoji,
        contentEmoji,
        enableNumberNavigation,
        universalHeader,
        universalFooter,
        welcomeMessage,
        goodbyeMessage,
        groupOpenText,
        groupCloseText,
        autoCloseSchedule,
        scheduledMessage,
        scheduledMessages,
        extraTriggers,
        paymentType,
        paymentMedia,
        paymentText
    };
    
    try {
        const res = await fetch(`/api/group-config/${selectedGroupId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            if (showAlert) alert('Konfigurasi grup berhasil disimpan!');
            if (refreshGroupList) loadGroupsList(); // Refresh keaktifan status di sidebar
        } else {
            const txt = await res.text();
            alert('Gagal menyimpan konfigurasi: ' + txt);
        }
    } catch (err) {
        console.error('Error saveGroupConfiguration:', err);
        alert('Terjadi kesalahan koneksi saat menyimpan.');
    }
};

window.deleteGroupConfiguration = async function() {
    if (!selectedGroupId) return;
    if (!confirm('Apakah Anda yakin ingin menghapus konfigurasi grup ini? Semua menu produk grup ini akan dihapus dan di-reset.')) return;
    
    try {
        const res = await fetch(`/api/group-config/${selectedGroupId}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            alert('Konfigurasi grup berhasil dihapus!');
            selectedGroupId = null;
            selectedGroupConfig = null;
            document.getElementById('group-editor-panel').classList.add('hidden');
            loadGroupsList();
        } else {
            const data = await res.json();
            alert('Gagal menghapus konfigurasi: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error deleteGroupConfiguration:', err);
        alert('Terjadi kesalahan koneksi saat menghapus.');
    }
};

// ══════════════════════════════════════════
// LOGIKA DUPLIKASI (CLONING) KONFIGURASI
// ══════════════════════════════════════════

// Perbarui dropdown modal salin konfig
function updateCloneSourceDropdown() {
    const select = document.getElementById('clone-source-select');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Pilih Grup Sumber --</option>';
    activeGroups.forEach(g => {
        if (g.id !== selectedGroupId) {
            const option = document.createElement('option');
            option.value = g.id;
            option.textContent = g.name;
            select.appendChild(option);
        }
    });
}

function updatePrivateChatSyncDropdown() {
    const select = document.getElementById('cfg-private-chat-sync-group-id');
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Pilih Grup Penyelaras --</option>';
    
    activeGroups.forEach(g => {
        const option = document.createElement('option');
        option.value = g.id;
        option.textContent = g.name;
        select.appendChild(option);
    });
    
    if (window.currentPrivateChatSyncGroupId) {
        select.value = window.currentPrivateChatSyncGroupId;
    } else if (currentValue) {
        select.value = currentValue;
    }
}

// Buka Modal
window.showCloneConfigModal = function() {
    updateCloneSourceDropdown();
    document.getElementById('clone-config-modal').classList.remove('hidden');
    lucide.createIcons();
};

// Tutup Modal
window.closeCloneConfigModal = function() {
    document.getElementById('clone-config-modal').classList.add('hidden');
};

// Terapkan Duplikasi
window.applyCloneConfig = async function() {
    const sourceId = document.getElementById('clone-source-select').value;
    if (!sourceId) {
        alert('Pilih grup sumber terlebih dahulu!');
        return;
    }
    
    if (!confirm('Apakah Anda yakin ingin menimpa seluruh konfigurasi dan menu grup ini dengan data dari grup terpilih? Perubahan saat ini yang belum disimpan akan hilang.')) return;
    
    try {
        const res = await fetch(`/api/group-config/${sourceId}`);
        if (!res.ok) throw new Error('Gagal mengambil data grup sumber');
        
        const sourceConfig = await res.json();
        
        selectedGroupConfig.useAiFallback = sourceConfig.useAiFallback;
        selectedGroupConfig.triggerPrefix = sourceConfig.triggerPrefix;
        selectedGroupConfig.categoryFooter = sourceConfig.categoryFooter || '';
        selectedGroupConfig.contentFooter = sourceConfig.contentFooter || '';
        selectedGroupConfig.allowedKnowledgeFiles = JSON.parse(JSON.stringify(sourceConfig.allowedKnowledgeFiles || []));
        selectedGroupConfig.menuTree = JSON.parse(JSON.stringify(sourceConfig.menuTree));
        selectedGroupConfig.scheduledMessages = JSON.parse(JSON.stringify(sourceConfig.scheduledMessages || []));
        renderSchedMsgList(selectedGroupConfig.scheduledMessages);
        
        // Perbarui UI form
        document.getElementById('grp-ai-fallback').checked = selectedGroupConfig.useAiFallback;
        document.getElementById('grp-trigger').value = selectedGroupConfig.triggerPrefix || '';
        document.getElementById('grp-category-footer').value = selectedGroupConfig.categoryFooter || '';
        document.getElementById('grp-content-footer').value = selectedGroupConfig.contentFooter || '';
        
        // Perbarui checkboxes
        document.querySelectorAll('.grp-kb-checkbox').forEach(cb => {
            cb.checked = selectedGroupConfig.allowedKnowledgeFiles.includes(cb.value);
        });
        
        // Re-render visual tree
        renderMenuTreeVisual();
        resetNodeEditorForm();
        
        // Tutup modal
        closeCloneConfigModal();
        alert('Konfigurasi berhasil disalin! Silakan klik "Simpan Menu" untuk menerapkan secara permanen.');
    } catch (err) {
        console.error('Error applyCloneConfig:', err);
        alert('Gagal menyalin konfigurasi: ' + err.message);
    }
};

// ══════════════════════════════════════════
// TOKO / SHOP MANAGER HELPER FUNCTIONS
// ══════════════════════════════════════════

window.toggleScheduleFields = function() {
    const isEnabled = document.getElementById('grp-auto-close-enable').checked;
    const fields = document.getElementById('grp-schedule-fields');
    if (fields) {
        if (isEnabled) {
            fields.classList.remove('hidden');
        } else {
            fields.classList.add('hidden');
        }
    }
};

window.renderSchedMsgList = function(scheds = []) {
    const list = document.getElementById('grp-sched-msg-list-container');
    if (!list) return;
    list.innerHTML = '';
    
    if (scheds.length === 0) {
        list.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.75rem; text-align: center; margin: 10px 0;">Belum ada pesan terjadwal. Klik tombol Tambah di atas.</p>`;
        return;
    }
    
    scheds.forEach((s, idx) => {
        const item = document.createElement('div');
        item.style = 'border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; background: rgba(0,0,0,0.15); display: flex; flex-direction: column; gap: 8px;';
        item.className = 'grp-sched-msg-row';
        
        // Days check
        const activeDays = s.activeDays || [1, 2, 3, 4, 5, 6, 7];
        const daysHtml = [
            { v: 1, n: 'Sen' }, { v: 2, n: 'Sel' }, { v: 3, n: 'Rab' },
            { v: 4, n: 'Kam' }, { v: 5, n: 'Jum' }, { v: 6, n: 'Sab' },
            { v: 7, n: 'Min' }
        ].map(d => {
            const checked = activeDays.includes(d.v) ? 'checked' : '';
            return `<label style="display: flex; align-items: center; gap: 2px;"><input type="checkbox" value="${d.v}" class="grp-sched-msg-row-day-cb" ${checked}> ${d.n}</label>`;
        }).join('');

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 6px; margin-bottom: 4px;">
                <span style="font-size: 0.75rem; font-weight: bold; color: var(--text-secondary);">Jadwal #${idx + 1}</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <label class="checkbox-container" style="font-size: 0.72rem; display: flex; align-items: center; gap: 4px; font-weight: normal; margin-bottom: 0;">
                        <input type="checkbox" class="grp-sched-msg-row-enable" ${s.enabled ? 'checked' : ''}>
                        <span>Aktif</span>
                    </label>
                    <button type="button" class="btn btn-secondary btn-icon" onclick="deleteSchedMsgRow(this)" style="padding: 4px; min-height: auto; color: #ff453a; border-color: rgba(255,69,58,0.2); background: transparent;">
                        <i data-lucide="trash" style="width: 12px; height: 12px;"></i>
                    </button>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <div style="flex: 1;">
                    <label style="font-size: 0.7rem; color: var(--text-secondary);">Waktu Pengiriman (HH:MM)</label>
                    <input type="time" class="form-control grp-sched-msg-row-time" value="${s.time || '12:00'}" style="width: 100%; padding: 6px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); font-size: 0.82rem; height: 30px; border-radius: 6px;">
                </div>
            </div>
            
            <div>
                <label style="font-size: 0.7rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">Hari Aktif</label>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.7rem;">
                    ${daysHtml}
                </div>
            </div>
            
            <div>
                <label style="font-size: 0.7rem; color: var(--text-secondary);">Isi Pesan Terjadwal</label>
                <textarea class="form-control grp-sched-msg-row-content" placeholder="Contoh: Selamat siang kaka semua!..." rows="4" style="width: 100%; padding: 8px; border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); resize: vertical; font-size: 0.82rem; min-height: 100px; height: 100px;">${s.message || ''}</textarea>
            </div>
        `;
        list.appendChild(item);
    });
    
    if (window.lucide) lucide.createIcons();
};

window.addNewSchedMsgRow = function() {
    const list = document.getElementById('grp-sched-msg-list-container');
    if (!list) return;
    
    // Remove placeholder if present
    if (list.querySelector('p')) {
        list.innerHTML = '';
    }
    
    const idx = list.querySelectorAll('.grp-sched-msg-row').length;
    const item = document.createElement('div');
    item.style = 'border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; background: rgba(0,0,0,0.15); display: flex; flex-direction: column; gap: 8px;';
    item.className = 'grp-sched-msg-row';
    
    const daysHtml = [
        { v: 1, n: 'Sen' }, { v: 2, n: 'Sel' }, { v: 3, n: 'Rab' },
        { v: 4, n: 'Kam' }, { v: 5, n: 'Jum' }, { v: 6, n: 'Sab' },
        { v: 7, n: 'Min' }
    ].map(d => {
        return `<label style="display: flex; align-items: center; gap: 2px;"><input type="checkbox" value="${d.v}" class="grp-sched-msg-row-day-cb" checked> ${d.n}</label>`;
    }).join('');

    item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-color); padding-bottom: 6px; margin-bottom: 4px;">
            <span style="font-size: 0.75rem; font-weight: bold; color: var(--text-secondary);">Jadwal #${idx + 1}</span>
            <div style="display: flex; align-items: center; gap: 10px;">
                <label class="checkbox-container" style="font-size: 0.72rem; display: flex; align-items: center; gap: 4px; font-weight: normal; margin-bottom: 0;">
                    <input type="checkbox" class="grp-sched-msg-row-enable" checked>
                    <span>Aktif</span>
                </label>
                <button type="button" class="btn btn-secondary btn-icon" onclick="deleteSchedMsgRow(this)" style="padding: 4px; min-height: auto; color: #ff453a; border-color: rgba(255,69,58,0.2); background: transparent;">
                    <i data-lucide="trash" style="width: 12px; height: 12px;"></i>
                </button>
            </div>
        </div>
        
        <div style="display: flex; gap: 10px;">
            <div style="flex: 1;">
                <label style="font-size: 0.7rem; color: var(--text-secondary);">Waktu Pengiriman (HH:MM)</label>
                <input type="time" class="form-control grp-sched-msg-row-time" value="12:00" style="width: 100%; padding: 6px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); font-size: 0.82rem; height: 30px; border-radius: 6px;">
            </div>
        </div>
        
        <div>
            <label style="font-size: 0.7rem; color: var(--text-secondary); display: block; margin-bottom: 4px;">Hari Aktif</label>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.7rem;">
                ${daysHtml}
            </div>
        </div>
        
        <div>
            <label style="font-size: 0.7rem; color: var(--text-secondary);">Isi Pesan Terjadwal</label>
            <textarea class="form-control grp-sched-msg-row-content" placeholder="Contoh: Selamat siang kaka semua!..." rows="4" style="width: 100%; padding: 8px; border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); resize: vertical; font-size: 0.82rem; min-height: 100px; height: 100px;"></textarea>
        </div>
    `;
    list.appendChild(item);
    if (window.lucide) lucide.createIcons();
};

window.deleteSchedMsgRow = function(btn) {
    const row = btn.closest('.grp-sched-msg-row');
    if (row) {
        row.remove();
        
        const list = document.getElementById('grp-sched-msg-list-container');
        const rows = list.querySelectorAll('.grp-sched-msg-row');
        if (rows.length === 0) {
            list.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.75rem; text-align: center; margin: 10px 0;">Belum ada pesan terjadwal. Klik tombol Tambah di atas.</p>`;
        } else {
            rows.forEach((r, idx) => {
                const label = r.querySelector('span');
                if (label) label.textContent = `Jadwal #${idx + 1}`;
            });
        }
    }
};

window.renderExtraTriggersList = function(triggers = []) {
    const list = document.getElementById('grp-extra-triggers-list');
    if (!list) return;
    list.innerHTML = '';
    
    triggers.forEach((t, idx) => {
        const row = document.createElement('div');
        row.style = 'display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; background: var(--bg-primary); margin-bottom: 6px;';
        row.className = 'extra-trigger-row';
        
        row.innerHTML = `
            <div style="display: flex; gap: 6px;">
                <input type="text" placeholder="Kata Kunci" class="form-control grp-et-keyword" value="${t.keyword || ''}" style="flex: 1; padding: 4px 8px; font-size: 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
                <button type="button" class="btn btn-secondary btn-icon" onclick="deleteExtraTriggerRow(this)" style="padding: 4px; color: #ff453a; border-color: rgba(255,69,58,0.2); background: transparent;">
                    <i data-lucide="trash" style="width: 12px; height: 12px;"></i>
                </button>
            </div>
            <textarea placeholder="Respon Teks Balasan" class="form-control grp-et-reply" rows="2" style="width: 100%; padding: 4px 8px; font-size: 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); resize: vertical;">${t.reply || ''}</textarea>
        `;
        list.appendChild(row);
    });
    
    if (window.lucide) lucide.createIcons();
};

window.addExtraTriggerRow = function() {
    const list = document.getElementById('grp-extra-triggers-list');
    if (!list) return;
    
    const row = document.createElement('div');
    row.style = 'display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; background: var(--bg-primary); margin-bottom: 6px;';
    row.className = 'extra-trigger-row';
    
    row.innerHTML = `
        <div style="display: flex; gap: 6px;">
            <input type="text" placeholder="Kata Kunci" class="form-control grp-et-keyword" style="flex: 1; padding: 4px 8px; font-size: 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color);">
            <button type="button" class="btn btn-secondary btn-icon" onclick="deleteExtraTriggerRow(this)" style="padding: 4px; color: #ff453a; border-color: rgba(255,69,58,0.2); background: transparent;">
                <i data-lucide="trash" style="width: 12px; height: 12px;"></i>
            </button>
        </div>
        <textarea placeholder="Respon Teks Balasan" class="form-control grp-et-reply" rows="2" style="width: 100%; padding: 4px 8px; font-size: 0.8rem; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); resize: vertical;"></textarea>
    `;
    list.appendChild(row);
    
    if (window.lucide) lucide.createIcons();
};

window.deleteExtraTriggerRow = function(btn) {
    const row = btn.closest('.extra-trigger-row');
    if (row) row.remove();
};

// Host Admin
let activeHostAdmins = [];
let selectedHostAdmin = null;

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

window.addHostAdminManual = async function() {
    const input = document.getElementById('new-host-admin-phone');
    if (!input) return;
    const phone = input.value.replace(/\D/g, '');
    if (!phone) {
        alert('Silakan masukkan nomor HP yang valid (hanya angka).');
        return;
    }
    
    try {
        const resAdmins = await fetch('/api/shop/admins');
        if (!resAdmins.ok) throw new Error('Gagal mengambil daftar admin');
        let adminsList = await resAdmins.json();
        
        if (!adminsList.includes(phone)) {
            adminsList.push(phone);
        } else {
            alert('Nomor HP sudah terdaftar sebagai Host Admin.');
            return;
        }
        
        const saveRes = await fetch('/api/shop/admins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admins: adminsList })
        });
        
        if (!saveRes.ok) throw new Error(await saveRes.text());
        
        input.value = '';
        alert('Berhasil menambahkan Host Admin!');
        loadHostAdmins();
    } catch(err) {
        alert('Gagal menambahkan Host Admin: ' + err.message);
    }
};

window.removeHostAdminDirect = async function(jid) {
    const cleanPhone = jid.replace('@c.us', '').replace(/\D/g, '');
    if (!confirm(`Apakah Anda yakin ingin menghapus nomor +${cleanPhone} dari Host Admin?`)) return;
    
    try {
        const resAdmins = await fetch('/api/shop/admins');
        if (!resAdmins.ok) throw new Error('Gagal mengambil daftar admin');
        let adminsList = await resAdmins.json();
        
        adminsList = adminsList.filter(a => a !== cleanPhone);
        
        const saveRes = await fetch('/api/shop/admins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admins: adminsList })
        });
        
        if (!saveRes.ok) throw new Error(await saveRes.text());
        
        alert('Berhasil menghapus Host Admin!');
        loadHostAdmins();
    } catch(err) {
        alert('Gagal menghapus Host Admin: ' + err.message);
    }
};

window.toggleHostAdmin = async function(jid, isChecked) {
    try {
        const cleanJid = jid.replace('@c.us', '');
        const resAdmins = await fetch('/api/shop/admins');
        if (!resAdmins.ok) throw new Error('Gagal mengambil daftar admin');
        let adminsList = await resAdmins.json();
        
        if (isChecked) {
            if (!adminsList.includes(cleanJid)) {
                adminsList.push(cleanJid);
            }
        } else {
            adminsList = adminsList.filter(a => a !== cleanJid);
        }
        
        const saveRes = await fetch('/api/shop/admins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admins: adminsList })
        });
        
        if (!saveRes.ok) throw new Error(await saveRes.text());
        
        loadHostAdmins();
    } catch (err) {
        alert('Gagal memperbarui status Host Admin: ' + err.message);
        loadHostAdmins();
    }
};

window.openHostConfig = async function(admin) {
    selectedHostAdmin = admin;
    const cleanAdmin = admin.replace(/\D/g, '');
    
    const numEl = document.getElementById('host-config-number');
    if (numEl) numEl.textContent = `+${cleanAdmin}`;
    
    const txtArea = document.getElementById('host-config-memory');
    if (txtArea) txtArea.value = 'Memuat panduan...';
    
    const msgInput = document.getElementById('host-config-msg');
    if (msgInput) msgInput.value = '';

    // Show modal
    const modal = document.getElementById('host-config-modal');
    if (modal) modal.classList.remove('hidden');
    
    // Fetch current memory
    try {
        const res = await fetch('/api/memory');
        if (res.ok) {
            const data = await res.json();
            if (txtArea) txtArea.value = data.content || '';
        } else {
            if (txtArea) txtArea.value = '';
        }
    } catch(err) {
        console.error('Gagal mengambil memori:', err);
        if (txtArea) txtArea.value = '';
    }

    // Populate group selector and menu tree nodes
    try {
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
                // Render first group's toggle/menu items
                window.onHostGroupSelectChange();
            }
        }
    } catch(err) {
        console.error('Gagal mengambil daftar grup untuk modal host:', err);
    }
    
    if (window.lucide) lucide.createIcons();
};

window.closeHostConfigModal = function() {
    const modal = document.getElementById('host-config-modal');
    if (modal) modal.classList.add('hidden');
    selectedHostAdmin = null;
};

window.triggerHostAction = async function(action) {
    if (!confirm(`Apakah Anda yakin ingin menjalankan aksi "${action === 'buka' ? 'Buka Toko' : 'Tutup Toko'}" secara manual ke semua grup?`)) return;
    
    try {
        const res = await fetch('/api/shop/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        
        if (res.ok) {
            const data = await res.json();
            alert(`Aksi berhasil dikirim! Sukses mengubah ${data.count} grup.`);
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal menjalankan aksi toko: ' + err.message);
    }
};

window.saveHostMemory = async function() {
    const textarea = document.getElementById('host-config-memory');
    if (!textarea) return;
    const content = textarea.value;
    
    try {
        const res = await fetch('/api/memory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        
        if (res.ok) {
            alert('Panduan & Karakter Bot berhasil disimpan!');
            // Sync to memory tab also
            const mainTextArea = document.getElementById('cfg-ai-memory');
            if (mainTextArea) mainTextArea.value = content;
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal menyimpan panduan: ' + err.message);
    }
};

window.sendHostMsg = async function() {
    if (!selectedHostAdmin) return;
    const input = document.getElementById('host-config-msg');
    if (!input) return;
    const message = input.value.trim();
    if (!message) {
        alert('Pesan tidak boleh kosong!');
        return;
    }
    
    try {
        const res = await fetch('/api/shop/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: selectedHostAdmin, message })
        });
        
        if (res.ok) {
            alert('Pesan WhatsApp berhasil dikirim ke nomor host admin!');
            input.value = '';
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal mengirim pesan: ' + err.message);
    }
};

// Download VCF (vCard) containing all active customers
window.downloadVcf = function() {
    if (!activeCustomers || activeCustomers.length === 0) {
        alert('Belum ada pelanggan terdaftar untuk diekspor!');
        return;
    }
    
    let vcfContent = '';
    activeCustomers.forEach(cust => {
        const name = cust.name || `Pelanggan ${cust.phone}`;
        const phone = cust.phone.replace(/\D/g, '');
        vcfContent += `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;TYPE=CELL:+${phone}\nEND:VCARD\n`;
    });
    
    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'daftar_pelanggan_wa.vcf';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Customers
let activeCustomers = [];

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

window.saveCustomerInfo = async function(idx) {
    const cust = activeCustomers[idx];
    if (!cust) return;
    
    const newName = document.getElementById(`cust-name-${idx}`).value.trim();
    const newNotes = document.getElementById(`cust-notes-${idx}`).value.trim();
    const newLabels = document.getElementById(`cust-labels-${idx}`).value.split(',').map(s => s.trim()).filter(Boolean);
    const newOrderCount = parseInt(document.getElementById(`cust-order-${idx}`).value, 10) || 0;
    
    cust.name = newName;
    cust.notes = newNotes;
    cust.labels = newLabels;
    cust.orderCount = newOrderCount;
    
    try {
        const res = await fetch('/api/shop/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customers: activeCustomers })
        });
        
        if (res.ok) {
            alert('Data pelanggan berhasil disimpan!');
            loadCustomersList();
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        alert('Gagal menyimpan data pelanggan: ' + err.message);
    }
};

// Isolated Chat Modal
window.viewCustomerChatLogs = async function(phone) {
    const contactId = phone.includes('@') ? phone : `${phone}@c.us`;
    const cleanId = contactId.split('@')[0];
    
    document.getElementById('shop-chat-modal-title').innerHTML = `<i data-lucide="message-square" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> Chat: wa.me/${cleanId}`;
    if (window.lucide) lucide.createIcons();
    
    const container = document.getElementById('shop-chat-messages-container');
    container.innerHTML = '<p style="text-align:center; color:var(--text-secondary); font-size:0.85rem; margin-top:50px;">Memuat riwayat chat...</p>';
    
    document.getElementById('shop-chat-modal').classList.remove('hidden');
    
    try {
        const res = await fetch(`/api/shop/logs/${contactId}`);
        if (!res.ok) throw new Error('Gagal mengambil riwayat chat');
        
        const logs = await res.json();
        container.innerHTML = '';
        
        if (logs.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-secondary); font-size:0.85rem; margin-top:50px;">Belum ada riwayat chat dengan nomor ini.</p>';
            return;
        }
        
        logs.forEach(msg => {
            const isBot = msg.role === 'model' || msg.role === 'assistant';
            const bubble = document.createElement('div');
            bubble.style = `
                max-width: 80%;
                padding: 8px 12px;
                border-radius: 8px;
                font-size: 0.85rem;
                line-height: 1.4;
                margin-bottom: 8px;
                word-wrap: break-word;
                ${isBot 
                    ? 'align-self: flex-end; background: #34c759; color: #fff; border-bottom-right-radius: 2px;' 
                    : 'align-self: flex-start; background: var(--bg-primary); color: var(--text-primary); border-bottom-left-radius: 2px; border: 1px solid var(--border-color);'
                }
            `;
            bubble.innerHTML = msg.content ? msg.content.replace(/\n/g, '<br>') : '';
            container.appendChild(bubble);
        });
        
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        container.innerHTML = `<p style="text-align:center; color:#ff453a; font-size:0.85rem; margin-top:50px;">Gagal memuat log: ${err.message}</p>`;
    }
};

window.closeShopChatModal = function() {
    document.getElementById('shop-chat-modal').classList.add('hidden');
};

// Target type selection changer
window.onBroadcastTargetTypeChange = async function(val) {
    const customGrp = document.getElementById('broadcast-custom-numbers-group');
    const membersGrp = document.getElementById('broadcast-group-members-group');
    const extractResult = document.getElementById('extract-members-result');
    
    if (customGrp) customGrp.classList.toggle('hidden', val !== 'custom_numbers');
    if (membersGrp) membersGrp.classList.toggle('hidden', val !== 'group_members');
    
    if (extractResult && val !== 'group_members') {
        extractResult.classList.add('hidden');
    }
    
    if (val === 'group_members') {
        if (typeof loadGroupsList === 'function') {
            await loadGroupsList();
        }
    }
};

// Dropdown groups list populator
window.updateBroadcastGroupDropdown = function() {
    const select = document.getElementById('broadcast-target-group');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Pilih Grup Asal Anggota --</option>';
    if (activeGroups && activeGroups.length > 0) {
        activeGroups.forEach(g => {
            const option = document.createElement('option');
            option.value = g.id;
            option.textContent = g.name;
            select.appendChild(option);
        });
    }
};

let lastExtractedMembers = [];

window.extractGroupMembers = async function() {
    const groupId = document.getElementById('broadcast-target-group').value;
    const btn = document.getElementById('btn-extract-members');
    const resultContainer = document.getElementById('extract-members-result');
    const countText = document.getElementById('extract-count-text');
    const previewList = document.getElementById('extract-preview-list');
    
    if (!groupId) {
        alert('Silakan pilih grup asal terlebih dahulu!');
        return;
    }
    
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span style="display: inline-block; width: 10px; height: 10px; border: 1.5px solid var(--text-primary); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 6px;"></span> Mengekstrak Anggota...`;
    
    if (resultContainer) resultContainer.classList.add('hidden');
    lastExtractedMembers = [];
    
    try {
        const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/members`);
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Gagal mengekstrak anggota');
        }
        
        const data = await res.json();
        lastExtractedMembers = data.members || [];
        
        if (countText) countText.innerText = `${data.count} Anggota Ditemukan`;
        if (previewList) {
            previewList.innerHTML = lastExtractedMembers
                .map((m, idx) => `${idx + 1}. ${m.phone} ${m.isAdmin ? '(Admin)' : ''}`)
                .join('<br>');
        }
        if (resultContainer) resultContainer.classList.remove('hidden');
        
        alert(`Berhasil mengekstrak ${data.count} anggota dari grup!`);
    } catch (err) {
        alert('Gagal mengambil anggota grup: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// Advanced Broadcast
// Advanced Broadcast
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

// Host Admin Group/Menu Config Modal Handlers
let hostConfigActiveGroups = [];

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

window.onHostGroupSelectChange = function() {
    const select = document.getElementById('host-config-group-select');
    if (!select) return;
    const gId = select.value;
    if (!gId) return;

    // Cari config grup terpilih
    const group = hostConfigActiveGroups.find(g => g.id === gId);
    if (!group) return;

    // Update group active toggle
    const toggle = document.getElementById('host-group-active-toggle');
    const bg = document.getElementById('host-group-active-bg');
    const dot = document.getElementById('host-group-active-dot');

    if (toggle) toggle.checked = group.enabled;
    if (bg) bg.style.background = group.enabled ? '#30d158' : 'rgba(255,255,255,0.08)';
    if (dot) dot.style.left = group.enabled ? '18px' : '2px';

    // Update Welcome Message UI
    const welcomeInput = document.getElementById('host-group-welcome-msg');
    if (welcomeInput) {
        welcomeInput.value = (group.config && group.config.welcomeMessage) || '';
    }
    const goodbyeInput = document.getElementById('host-group-goodbye-msg');
    if (goodbyeInput) {
        goodbyeInput.value = (group.config && group.config.goodbyeMessage) || '';
    }

    // Update Scheduler UI
    const schedToggle = document.getElementById('host-scheduler-toggle');
    const schedBg = document.getElementById('host-scheduler-bg');
    const schedDot = document.getElementById('host-scheduler-dot');
    const openInput = document.getElementById('host-scheduler-open');
    const closeInput = document.getElementById('host-scheduler-close');

    const schedConfig = (group.config && group.config.autoCloseSchedule) || { enabled: false, openTime: '08:00', closeTime: '17:00' };
    
    if (schedToggle) schedToggle.checked = schedConfig.enabled;
    if (schedBg) schedBg.style.background = schedConfig.enabled ? '#30d158' : 'rgba(255,255,255,0.08)';
    if (schedDot) schedDot.style.left = schedConfig.enabled ? '14px' : '2px';
    if (openInput) openInput.value = schedConfig.openTime || '08:00';
    if (closeInput) closeInput.value = schedConfig.closeTime || '17:00';

    // Update Payment Settings UI
    const pType = document.getElementById('host-payment-type');
    const pMedia = document.getElementById('host-payment-media');
    const pText = document.getElementById('host-payment-text');
    
    if (pType) pType.value = (group.config && group.config.paymentType) || 'qris';
    if (pMedia) pMedia.value = (group.config && group.config.paymentMedia) || 'Qris.jpeg';
    if (pText) pText.value = (group.config && group.config.paymentText) || '';
    
    if (window.togglePaymentFields) {
        window.togglePaymentFields();
    }

    // Clear Trigger inputs
    const keyInp = document.getElementById('host-trigger-keyword');
    const repInp = document.getElementById('host-trigger-reply');
    const medInp = document.getElementById('host-trigger-media');
    if (keyInp) keyInp.value = '';
    if (repInp) repInp.value = '';
    if (medInp) medInp.value = '';

    // Render Trigger list
    const triggerList = document.getElementById('host-active-triggers-list');
    if (triggerList) {
        triggerList.innerHTML = '';
        const triggers = (group.config && group.config.extraTriggers) || [];
        if (triggers.length === 0) {
            triggerList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); font-size: 0.7rem; margin-top: 10px;">Belum ada kata kunci tambahan.</p>';
        } else {
            triggers.forEach(t => {
                const row = document.createElement('div');
                row.style = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: var(--bg-secondary); border-radius: 4px; border: 1px solid var(--border-color); margin-bottom: 4px;';
                
                const mediaSuffix = t.media ? ` 📁 (${t.media})` : '';
                const scopeLabel = t.scope === 'private' ? ' [Pribadi]' : (t.scope === 'all' ? ' [Semua]' : ' [Grup]');
                row.innerHTML = `
                    <div style="font-size: 0.75rem; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 80%; color: var(--text-primary);">
                        <strong>${t.keyword}</strong><span style="color: var(--text-secondary); font-size: 0.65rem;">${scopeLabel}</span>: ${t.reply}${mediaSuffix}
                    </div>
                    <button class="btn btn-secondary btn-icon" onclick="window.deleteHostTrigger('${gId}', '${t.keyword}')" style="padding: 2px; color: #ff453a; border: none; background: transparent; cursor: pointer;">
                        <i data-lucide="trash" style="width: 12px; height: 12px;"></i>
                    </button>
                `;
                triggerList.appendChild(row);
            });
        }
    }

    // Update list menu konten item
    const list = document.getElementById('host-menu-items-list');
    if (!list) return;
    list.innerHTML = '';

    const nodes = [];
    if (group.config && group.config.menuTree) {
        const collectContentNodes = (node) => {
            if (node.type === 'content') {
                nodes.push(node);
            }
            if (node.children) {
                node.children.forEach(collectContentNodes);
            }
        };
        collectContentNodes(group.config.menuTree);
    }

    if (nodes.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-secondary); font-size: 0.75rem; margin-top: 20px;">Belum ada menu konten di grup ini...</p>';
        return;
    }

    nodes.forEach(node => {
        const itemRow = document.createElement('div');
        itemRow.style = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--border-color);';
        
        const statusVal = node.status || 'Tersedia';
        itemRow.innerHTML = `
            <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary);">${node.name}</span>
            <select onchange="window.updateHostNodeStatus('${gId}', '${node.id}', this.value)" style="padding: 2px 6px; font-size: 0.75rem; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;">
                <option value="Tersedia" ${statusVal === 'Tersedia' ? 'selected' : ''}>Tersedia</option>
                <option value="Habis" ${statusVal === 'Habis' ? 'selected' : ''}>Habis</option>
                <option value="Pre-order" ${statusVal === 'Pre-order' ? 'selected' : ''}>Pre-order</option>
            </select>
        `;
        list.appendChild(itemRow);
    });

    if (window.lucide) lucide.createIcons();
};

window.onHostGroupActiveToggleChange = async function(isChecked) {
    const select = document.getElementById('host-config-group-select');
    if (!select) return;
    const gId = select.value;
    if (!gId) return;

    try {
        const res = await fetch('/api/host-admin/toggle-group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: gId, enabled: isChecked })
        });

        if (res.ok) {
            const group = hostConfigActiveGroups.find(g => g.id === gId);
            if (group) group.enabled = isChecked;

            const bg = document.getElementById('host-group-active-bg');
            const dot = document.getElementById('host-group-active-dot');
            if (bg) bg.style.background = isChecked ? '#30d158' : 'rgba(255,255,255,0.08)';
            if (dot) dot.style.left = isChecked ? '18px' : '2px';
            
            loadGroupsList();
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        alert('Gagal mengubah status grup: ' + err.message);
    }
};

window.onHostSchedulerToggleChange = function(isChecked) {
    const bg = document.getElementById('host-scheduler-bg');
    const dot = document.getElementById('host-scheduler-dot');
    if (bg) bg.style.background = isChecked ? '#30d158' : 'rgba(255,255,255,0.08)';
    if (dot) dot.style.left = isChecked ? '14px' : '2px';
};

window.triggerHostActionSpecific = async function(action) {
    const select = document.getElementById('host-config-group-select');
    if (!select) return;
    const gId = select.value;
    if (!gId) return;

    if (!confirm(`Apakah Anda yakin ingin ${action === 'buka' ? 'membuka' : 'menutup'} grup ini secara manual?`)) return;

    try {
        const res = await fetch('/api/host-admin/open-close-group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: gId, action })
        });

        if (res.ok) {
            alert(`Berhasil ${action === 'buka' ? 'membuka' : 'menutup'} grup!`);
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal mengontrol grup: ' + err.message);
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

window.addHostTrigger = async function() {
    const select = document.getElementById('host-config-group-select');
    if (!select) return;
    const gId = select.value;
    if (!gId) return;

    const keyword = document.getElementById('host-trigger-keyword').value.trim();
    const reply = document.getElementById('host-trigger-reply').value.trim();
    const media = document.getElementById('host-trigger-media').value.trim();
    
    let scope = 'group';
    if (document.getElementById('host-scope-all') && document.getElementById('host-scope-all').checked) {
        scope = 'all';
    } else if (document.getElementById('host-scope-private') && document.getElementById('host-scope-private').checked) {
        scope = 'private';
    }

    if (!keyword || !reply) {
        alert('Kata kunci dan balasan teks wajib diisi!');
        return;
    }

    try {
        const res = await fetch('/api/host-admin/add-trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: gId, keyword, reply, media, scope })
        });

        if (res.ok) {
            alert('Kata kunci / trigger baru berhasil ditambahkan!');
            // Refresh local state
            const groupsRes = await fetch('/api/groups');
            if (groupsRes.ok) {
                hostConfigActiveGroups = await groupsRes.json();
                window.onHostGroupSelectChange();
            }
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal menambahkan trigger: ' + err.message);
    }
};

window.deleteHostTrigger = async function(gId, keyword) {
    if (!confirm(`Hapus kata kunci "${keyword}"?`)) return;

    try {
        const res = await fetch('/api/host-admin/delete-trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: gId, keyword })
        });

        if (res.ok) {
            // Refresh local state
            const groupsRes = await fetch('/api/groups');
            if (groupsRes.ok) {
                hostConfigActiveGroups = await groupsRes.json();
                window.onHostGroupSelectChange();
            }
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal menghapus trigger: ' + err.message);
    }
};

window.updateHostNodeStatus = async function(gId, nodeId, status) {
    try {
        const res = await fetch('/api/host-admin/update-node-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: gId, nodeId, status })
        });

        if (!res.ok) {
            throw new Error(await res.text());
        }
    } catch (err) {
        alert('Gagal memperbarui status menu item: ' + err.message);
    }
};

// WhatsApp text style format helper
window.insertFormatToElement = function(elementId, symbol) {
    const textarea = document.getElementById(elementId);
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    
    const selectedText = text.substring(start, end);
    const replacement = symbol + selectedText + symbol;
    
    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    textarea.focus();
    
    const newPos = start + symbol.length + selectedText.length + symbol.length;
    textarea.setSelectionRange(newPos, newPos);
    
    textarea.dispatchEvent(new Event('input'));
};

// Save specific group welcome message
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

// Save specific group goodbye message
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

window.togglePaymentFields = function() {
    const typeSelect = document.getElementById('host-payment-type');
    const mediaGroup = document.getElementById('payment-media-group');
    if (typeSelect && mediaGroup) {
        if (typeSelect.value === 'custom') {
            mediaGroup.style.display = 'none';
        } else {
            mediaGroup.style.display = 'block';
        }
    }
};

window.saveHostPaymentSettings = async function() {
    const select = document.getElementById('host-config-group-select');
    if (!select) return;
    const gId = select.value;
    if (!gId) return;

    const pType = document.getElementById('host-payment-type').value;
    const pMedia = document.getElementById('host-payment-media').value.trim();
    const pText = document.getElementById('host-payment-text').value;

    try {
        const res = await fetch('/api/host-admin/payment-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: gId, paymentType: pType, paymentMedia: pMedia, paymentText: pText })
        });

        if (res.ok) {
            alert('Metode pembayaran berhasil disimpan!');
            // Refresh local state
            const group = hostConfigActiveGroups.find(g => g.id === gId);
            if (group) {
                group.config = group.config || {};
                group.config.paymentType = pType;
                group.config.paymentMedia = pMedia;
                group.config.paymentText = pText;
            }
            if (selectedGroupId === gId) {
                if (selectedGroupConfig) {
                    selectedGroupConfig.paymentType = pType;
                    selectedGroupConfig.paymentMedia = pMedia;
                    selectedGroupConfig.paymentText = pText;
                }
            }
        } else {
            throw new Error(await res.text());
        }
    } catch(err) {
        alert('Gagal menyimpan metode pembayaran: ' + err.message);
    }
};

// ============================================================
//  QUICK EDIT PANEL — Edit Cepat Produk via Dashboard
// ============================================================

let quickEditOpen = false;

function toggleQuickEditPanel() {
    const panel = document.getElementById('quick-edit-panel');
    const tree  = document.querySelector('.grp-tree-grid');
    const btn   = document.getElementById('btn-toggle-quickedit');

    quickEditOpen = !quickEditOpen;

    if (quickEditOpen) {
        panel.classList.remove('hidden');
        panel.style.display = 'flex';
        if (tree) tree.style.display = 'none';
        btn.style.background = 'var(--blue)';
        btn.style.color = '#fff';
        btn.style.borderColor = 'var(--blue)';
        renderQuickEditList();
    } else {
        panel.classList.add('hidden');
        panel.style.display = 'none';
        if (tree) tree.style.display = '';
        btn.style.background = '';
        btn.style.color = '';
        btn.style.borderColor = '';
    }
}

function _getAllProductsFlat(tree, catPath) {
    const results = [];
    const path = catPath || [];
    const walk = (node, currentPath) => {
        if (node.type === 'content') {
            results.push({ ...node, _catPath: currentPath });
        }
        if (node.children && Array.isArray(node.children)) {
            const childPath = (node.type === 'category' && node.id !== 'root')
                ? [...currentPath, node.name]
                : currentPath;
            node.children.forEach(c => walk(c, childPath));
        }
    };
    if (tree) walk(tree, path);
    return results;
}

function _escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function renderQuickEditList() {
    const container = document.getElementById('quick-edit-list');
    const searchVal = (document.getElementById('qe-search')?.value || '').toLowerCase().trim();
    if (!container) return;
    if (!selectedGroupId || !selectedGroupConfig) {
        container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;text-align:center;margin-top:30px;">Pilih grup terlebih dahulu.</p>';
        return;
    }
    const allProducts = _getAllProductsFlat(selectedGroupConfig.menuTree);
    const filtered = searchVal
        ? allProducts.filter(p => (p.name||'').toLowerCase().includes(searchVal) || (p.text||'').toLowerCase().includes(searchVal))
        : allProducts;

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;text-align:center;margin-top:30px;">Tidak ada produk ditemukan.</p>';
        return;
    }

    filtered.sort((a, b) => (a.name||'').localeCompare(b.name||'', 'id', { sensitivity: 'base' }));

    container.innerHTML = filtered.map(p => {
        const stColor = p.status==='Tersedia'?'var(--green)':p.status==='Habis'?'var(--red)':'var(--orange)';
        const stBg    = p.status==='Tersedia'?'var(--green-soft)':p.status==='Habis'?'var(--red-soft)':'var(--orange-soft)';
        const promo   = p.isPromo;
        const cat     = p._catPath && p._catPath.length>0 ? p._catPath.join(' › ') : 'Tanpa Kategori';
        const desc    = p.text ? p.text.substring(0,90).replace(/\n/g,' ')+(p.text.length>90?'…':'') : '<em style="opacity:.45">Deskripsi kosong</em>';
        const esc     = _escHtml;

        return `<div class="qe-row" style="border:1px solid var(--border);border-radius:10px;padding:10px 14px;background:var(--surface);transition:box-shadow 0.2s;">
  <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;">
    <div style="flex:1;min-width:150px;">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-weight:700;font-size:0.9rem;">${esc(p.name)}</span>
        ${promo?'<span style="background:rgba(251,146,60,.18);color:var(--orange);font-size:0.65rem;padding:1px 7px;border-radius:99px;font-weight:700;">🔥 PROMO</span>':''}
      </div>
      <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:2px;">${esc(cat)}</div>
      <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:5px;">${desc}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;min-width:130px;">
      <select onchange="qeUpdateStatus('${esc(p.id)}',this.value)"
        style="font-size:0.75rem;padding:3px 6px;height:28px;border-radius:6px;cursor:pointer;border:1px solid ${stColor};color:${stColor};background:${stBg};font-weight:600;outline:none;">
        <option value="Tersedia" ${p.status==='Tersedia'?'selected':''}>✅ Tersedia</option>
        <option value="Habis"    ${p.status==='Habis'?'selected':''}>❌ Habis</option>
        <option value="Pre-order"${p.status==='Pre-order'?'selected':''}>⏳ Pre-order</option>
      </select>
      <button onclick="qeTogglePromo('${esc(p.id)}')"
        style="font-size:0.72rem;padding:3px 10px;border-radius:6px;border:1px solid ${promo?'var(--orange)':'var(--border)'};background:${promo?'var(--orange-soft)':'var(--surface2)'};color:${promo?'var(--orange)':'var(--text-secondary)'};cursor:pointer;font-weight:600;transition:all 0.2s;">
        ${promo?'🔥 Promo Aktif':'➕ Set Promo'}
      </button>
      <div style="display:flex;gap:5px;">
        <button onclick="qeOpenEdit('${esc(p.id)}')"
          style="font-size:0.72rem;padding:3px 8px;border-radius:6px;border:1px solid var(--blue);background:var(--blue-soft);color:var(--blue);cursor:pointer;font-weight:600;">
          ✏️ Edit
        </button>
        <button onclick="qeDeleteProduct('${esc(p.id)}','${esc(p.name)}')"
          style="font-size:0.72rem;padding:3px 8px;border-radius:6px;border:1px solid var(--red);background:var(--red-soft);color:var(--red);cursor:pointer;font-weight:600;">
          🗑️
        </button>
      </div>
    </div>
  </div>
  <div id="qe-edit-form-${esc(p.id)}" style="display:none;margin-top:10px;border-top:1px solid var(--border);padding-top:10px;flex-direction:column;gap:8px;">
    <div>
      <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:3px;">Nama Produk</label>
      <input type="text" id="qe-name-${esc(p.id)}" value="${esc(p.name)}"
        style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:0.85rem;">
    </div>
    <div>
      <label style="font-size:0.75rem;font-weight:600;display:block;margin-bottom:3px;">Deskripsi / Konten</label>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">
        <button type="button" onclick="qeInsertFmt('qe-desc-${esc(p.id)}','*')" style="font-size:0.65rem;padding:2px 7px;border-radius:4px;border:1px solid var(--border);background:var(--surface2);cursor:pointer;font-weight:700;">B</button>
        <button type="button" onclick="qeInsertFmt('qe-desc-${esc(p.id)}','_')" style="font-size:0.65rem;padding:2px 7px;border-radius:4px;border:1px solid var(--border);background:var(--surface2);cursor:pointer;font-style:italic;">I</button>
        <button type="button" onclick="qeInsertFmt('qe-desc-${esc(p.id)}','~')" style="font-size:0.65rem;padding:2px 7px;border-radius:4px;border:1px solid var(--border);background:var(--surface2);cursor:pointer;text-decoration:line-through;">S</button>
      </div>
      <textarea id="qe-desc-${esc(p.id)}" rows="8"
        style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:0.85rem;resize:vertical;min-height:160px;font-family:inherit;">${esc(p.text||'')}</textarea>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button onclick="qeCloseEdit('${esc(p.id)}')"
        style="font-size:0.8rem;padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);cursor:pointer;">Batal</button>
      <button onclick="qeSaveEdit('${esc(p.id)}')"
        style="font-size:0.8rem;padding:5px 14px;border-radius:6px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:600;">💾 Simpan</button>
    </div>
  </div>
</div>`;
    }).join('');
}

function qeInsertFmt(taId, sym) {
    const ta = document.getElementById(taId);
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.substring(s,e);
    const wrapped = sel ? `${sym}${sel}${sym}` : `${sym}Teks${sym}`;
    ta.value = ta.value.substring(0,s) + wrapped + ta.value.substring(e);
    ta.focus();
    ta.setSelectionRange(s, s + wrapped.length);
}

function _findNodeInTree(tree, nodeId) {
    if (!tree) return null;
    if (tree.id === nodeId) return tree;
    if (!tree.children) return null;
    for (const child of tree.children) {
        const found = _findNodeInTree(child, nodeId);
        if (found) return found;
    }
    return null;
}

async function qeUpdateStatus(nodeId, newStatus) {
    if (!selectedGroupId || !selectedGroupConfig) return;
    const node = _findNodeInTree(selectedGroupConfig.menuTree, nodeId);
    if (!node) return;
    node.status = newStatus;
    renderQuickEditList();
    await saveGroupConfiguration(false, false);
}

async function qeTogglePromo(nodeId) {
    if (!selectedGroupId || !selectedGroupConfig) return;
    const node = _findNodeInTree(selectedGroupConfig.menuTree, nodeId);
    if (!node) return;
    node.isPromo = !node.isPromo;
    renderQuickEditList();
    await saveGroupConfiguration(false, false);
}

function qeOpenEdit(nodeId) {
    const form = document.getElementById(`qe-edit-form-${nodeId}`);
    if (form) form.style.display = 'flex';
}
function qeCloseEdit(nodeId) {
    const form = document.getElementById(`qe-edit-form-${nodeId}`);
    if (form) form.style.display = 'none';
}

async function qeSaveEdit(nodeId) {
    if (!selectedGroupId || !selectedGroupConfig) return;
    const node = _findNodeInTree(selectedGroupConfig.menuTree, nodeId);
    if (!node) return;
    const nameEl = document.getElementById(`qe-name-${nodeId}`);
    const descEl = document.getElementById(`qe-desc-${nodeId}`);
    if (nameEl && nameEl.value.trim()) node.name = nameEl.value.trim();
    if (descEl) node.text = descEl.value.trim();
    renderQuickEditList();
    await saveGroupConfiguration(false, false);
}

async function qeDeleteProduct(nodeId, productName) {
    if (!confirm(`Yakin hapus produk "${productName}"?\nAksi ini tidak bisa dibatalkan.`)) return;
    if (!selectedGroupId || !selectedGroupConfig) return;
    const del = (tree, id) => {
        if (!tree.children) return false;
        const idx = tree.children.findIndex(c => c.id === id);
        if (idx >= 0) { tree.children.splice(idx, 1); return true; }
        return tree.children.some(c => del(c, id));
    };
    del(selectedGroupConfig.menuTree, nodeId);
    renderQuickEditList();
    await saveGroupConfiguration(false, false);
}

window.logoutAdmin = async function() {
    if (!confirm('Apakah Anda yakin ingin keluar dari dasbor?')) return;
    try {
        const res = await fetch('/api/logout', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            window.location.href = '/login';
        } else {
            alert('Gagal logout: ' + (data.error || 'Terjadi kesalahan'));
        }
    } catch (err) {
        console.error('Error logging out:', err);
        alert('Gagal menghubungi server untuk logout.');
    }
};

// Node Editor: Direct Media File Uploader
window.uploadNodeMediaFile = async function(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const res = await fetch('/api/upload/media', {
            method: 'POST',
            body: formData
        });
        if (res.ok) {
            const filename = file.name;
            document.getElementById('node-media').value = filename;
            // update in-memory node
            if (selectedGroupId && selectedNodeId) {
                const node = findNodeInTree(selectedGroupConfig.menuTree, selectedNodeId);
                if (node && node.type === 'content') {
                    node.media = filename;
                }
            }
            alert(`File "${filename}" berhasil diunggah!`);
        } else {
            alert('Gagal unggah file: ' + res.statusText);
        }
    } catch (err) {
        console.error('Error uploadNodeMediaFile:', err);
        alert('Gagal mengunggah berkas ke server.');
    }
};

// === ORDERS MANAGEMENT (REAL-TIME ORDER TAB) ===
let allOrders = [];
let currentOrderFilter = 'ALL';
let currentOrderSort = 'newest';

// Inject keyframe animations for toast notification
const animStyle = document.createElement('style');
animStyle.textContent = `
@keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(120%); opacity: 0; } }
`;
document.head.appendChild(animStyle);

function playNotificationSound() {
    try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        
        // Ding
        const osc1 = context.createOscillator();
        const gain1 = context.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, context.currentTime);
        gain1.gain.setValueAtTime(0.2, context.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.4);
        osc1.connect(gain1);
        gain1.connect(context.destination);
        osc1.start();
        osc1.stop(context.currentTime + 0.4);
        
        // Dong
        const osc2 = context.createOscillator();
        const gain2 = context.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1046.5, context.currentTime + 0.12);
        gain2.gain.setValueAtTime(0.2, context.currentTime + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.6);
        osc2.connect(gain2);
        gain2.connect(context.destination);
        osc2.start(context.currentTime + 0.12);
        osc2.stop(context.currentTime + 0.6);
    } catch (e) {
        console.warn('AudioContext not allowed yet:', e.message);
    }
}

window.loadOrders = async function() {
    try {
        const res = await fetch('/api/orders');
        if (!res.ok) throw new Error('Gagal mengambil data pesanan');
        allOrders = await res.json();
        
        const total = allOrders.length;
        const pending = allOrders.filter(o => o.status === 'PENDING').length;
        const completed = allOrders.filter(o => o.status === 'SELESAI').length;
        
        document.getElementById('order-stat-total').textContent = total;
        document.getElementById('order-stat-pending').textContent = pending;
        document.getElementById('order-stat-completed').textContent = completed;
        
        // Remove red dot badge if we are viewing the transactions tab
        const dot = document.getElementById('transaction-badge-dot');
        if (dot) dot.remove();
        
        renderOrdersTable();
    } catch (err) {
        console.error('Error loadOrders:', err);
    }
};

window.filterOrders = function(status) {
    currentOrderFilter = status;
    const buttons = document.querySelectorAll('.order-filter-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(status)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderOrdersTable();
};

window.sortOrders = function(criteria) {
    currentOrderSort = criteria;
    renderOrdersTable();
};

// Helper format tanggal transaksi profesional (Contoh: Minggu, 12 Jul 2026 - 15:30)
function formatTransactionDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        
        const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        
        const dayName = dayNames[d.getDay()];
        const dateNum = String(d.getDate()).padStart(2, '0');
        const monthName = monthNames[d.getMonth()];
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        
        return `${dayName}, ${dateNum} ${monthName} ${year} - ${hours}:${minutes}`;
    } catch(e) {
        return dateStr;
    }
}

window.renderOrdersTable = function() {
    const tbody = document.getElementById('orders-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let filtered = allOrders.filter(o => {
        if (currentOrderFilter === 'ALL') return true;
        return o.status === currentOrderFilter;
    });
    
    // Sort logic
    if (currentOrderSort === 'newest') {
        filtered.sort((a, b) => b.id - a.id);
    } else if (currentOrderSort === 'oldest') {
        filtered.sort((a, b) => a.id - b.id);
    } else if (currentOrderSort === 'name-asc') {
        filtered.sort((a, b) => {
            const nameA = (a.customer_name || '').toLowerCase();
            const nameB = (b.customer_name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    } else if (currentOrderSort === 'name-desc') {
        filtered.sort((a, b) => {
            const nameA = (a.customer_name || '').toLowerCase();
            const nameB = (b.customer_name || '').toLowerCase();
            return nameB.localeCompare(nameA);
        });
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 30px; text-align: center; color: var(--text-secondary);">Tidak ada pesanan dengan status "${currentOrderFilter}"</td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach(order => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        
        const dateFormatted = formatTransactionDate(order.created_at);
        
        const statusBadge = order.status === 'PENDING' 
            ? `<span class="badge" style="background: rgba(255,214,10,0.15); color: #ffd60a; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; display: inline-block;">Menunggu</span>`
            : order.status === 'SELESAI'
                ? `<span class="badge" style="background: rgba(48,209,88,0.15); color: #30d158; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; display: inline-block;">Selesai</span>`
                : `<span class="badge" style="background: rgba(255,69,58,0.15); color: #ff453a; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; display: inline-block;">Batal</span>`;
                
        tr.innerHTML = `
            <td style="padding: 12px 16px; font-weight: 500; font-family: monospace;">#${order.id}</td>
            <td style="padding: 12px 16px;">
                <div style="font-weight: 600;">${order.customer_name}</div>
                <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                    <a href="https://wa.me/${order.customer_number}" target="_blank" style="color: #30d158; font-size: 0.75rem; text-decoration: none; display: flex; align-items: center; gap: 2px;">
                        <i data-lucide="message-circle" style="width: 12px; height: 12px;"></i> ${order.customer_number}
                    </a>
                </div>
            </td>
            <td style="padding: 12px 16px; font-size: 0.9rem; white-space: pre-wrap;">${order.details}</td>
            <td style="padding: 12px 16px; font-size: 0.8rem; color: var(--text-secondary);">${dateFormatted}</td>
            <td style="padding: 12px 16px;">${statusBadge}</td>
            <td style="padding: 12px 16px; text-align: right;">
                <div style="display: flex; gap: 6px; justify-content: flex-end;">
                    ${order.status === 'PENDING' ? `
                        <button class="btn btn-primary" onclick="updateOrderStatus(${order.id}, 'SELESAI')" style="font-size: 0.75rem; padding: 4px 8px; background: #30d158; border-color: #30d158;">Selesai</button>
                        <button class="btn btn-secondary" onclick="updateOrderStatus(${order.id}, 'BATAL')" style="font-size: 0.75rem; padding: 4px 8px; color: #ff453a; border-color: rgba(255,69,58,0.3);">Batal</button>
                    ` : ''}
                    <button class="btn btn-secondary" onclick="deleteOrder(${order.id})" style="font-size: 0.75rem; padding: 4px 8px; color: #ff453a; border-color: rgba(255,69,58,0.2);">Hapus</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    if (window.lucide) lucide.createIcons();
};

window.updateOrderStatus = async function(id, status) {
    try {
        const res = await fetch(`/api/orders/${id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            loadOrders();
        } else {
            alert('Gagal memperbarui status pesanan');
        }
    } catch (err) {
        console.error('Error updateOrderStatus:', err);
    }
};

window.deleteOrder = async function(id) {
    if (!confirm('Hapus pesanan ini dari riwayat?')) return;
    try {
        const res = await fetch(`/api/orders/${id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            loadOrders();
        } else {
            alert('Gagal menghapus pesanan');
        }
    } catch (err) {
        console.error('Error deleteOrder:', err);
    }
};

// WebSocket Order Listener
socket.on('order_created', (newOrder) => {
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

let allInvoices = [];
let currentInvoiceFilter = 'ALL';
let currentInvoiceSort = 'newest';

window.sortInvoices = function(criteria) {
    currentInvoiceSort = criteria;
    renderInvoicesTable();
};

window.loadInvoices = async function() {
    try {
        const res = await fetch('/api/invoices');
        if (!res.ok) throw new Error('Gagal mengambil data invoice');
        allInvoices = await res.json();
        
        const total = allInvoices.length;
        const proses = allInvoices.filter(i => i.status === 'PROSES').length;
        const selesai = allInvoices.filter(i => i.status === 'SELESAI').length;
        
        document.getElementById('invoice-stat-total').textContent = total;
        document.getElementById('invoice-stat-proses').textContent = proses;
        document.getElementById('invoice-stat-selesai').textContent = selesai;
        
        const dot = document.getElementById('transaction-badge-dot');
        if (dot) dot.remove();
        
        renderInvoicesTable();
    } catch (err) {
        console.error('Error loadInvoices:', err);
    }
};

window.filterInvoices = function(status) {
    currentInvoiceFilter = status;
    const buttons = document.querySelectorAll('.invoice-filter-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(status)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderInvoicesTable();
};

window.renderInvoicesTable = function() {
    const tbody = document.getElementById('invoices-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let filtered = allInvoices.filter(i => {
        if (currentInvoiceFilter === 'ALL') return true;
        return i.status === currentInvoiceFilter;
    });
    
    // Sort logic
    if (currentInvoiceSort === 'newest') {
        filtered.sort((a, b) => {
            const idA = parseInt((a.id || '').replace(/\D/g, ''), 10) || 0;
            const idB = parseInt((b.id || '').replace(/\D/g, ''), 10) || 0;
            return idB - idA;
        });
    } else if (currentInvoiceSort === 'oldest') {
        filtered.sort((a, b) => {
            const idA = parseInt((a.id || '').replace(/\D/g, ''), 10) || 0;
            const idB = parseInt((b.id || '').replace(/\D/g, ''), 10) || 0;
            return idA - idB;
        });
    } else if (currentInvoiceSort === 'name-asc') {
        filtered.sort((a, b) => {
            const nameA = (a.customer_name || '').toLowerCase();
            const nameB = (b.customer_name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    } else if (currentInvoiceSort === 'name-desc') {
        filtered.sort((a, b) => {
            const nameA = (a.customer_name || '').toLowerCase();
            const nameB = (b.customer_name || '').toLowerCase();
            return nameB.localeCompare(nameA);
        });
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 30px; text-align: center; color: var(--text-secondary);">Tidak ada invoice dengan status "${currentInvoiceFilter}"</td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach(inv => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        
        const dateFormatted = formatTransactionDate(inv.created_at);
        
        const statusBadge = inv.status === 'PROSES' 
            ? `<span class="badge" style="background: rgba(255,214,10,0.15); color: #ffd60a; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; display: inline-block;">Diproses</span>`
            : `<span class="badge" style="background: rgba(48,209,88,0.15); color: #30d158; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; display: inline-block;">Selesai</span>`;
                
        tr.innerHTML = `
            <td style="padding: 12px 16px; font-weight: 500; font-family: monospace;">#${inv.id}</td>
            <td style="padding: 12px 16px;">
                <div style="font-weight: 600;">${inv.customer_name}</div>
                <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                    <a href="https://wa.me/${inv.customer_number}" target="_blank" style="color: #30d158; font-size: 0.75rem; text-decoration: none; display: flex; align-items: center; gap: 2px;">
                        <i data-lucide="message-circle" style="width: 12px; height: 12px;"></i> ${inv.customer_number}
                    </a>
                </div>
            </td>
            <td style="padding: 12px 16px; font-size: 0.9rem; white-space: pre-wrap;">${inv.details}</td>
            <td style="padding: 12px 16px; font-size: 0.8rem; color: var(--text-secondary);">${dateFormatted}</td>
            <td style="padding: 12px 16px;">${statusBadge}</td>
            <td style="padding: 12px 16px; text-align: right;">
                <div style="display: flex; gap: 6px; justify-content: flex-end;">
                    ${inv.status === 'PROSES' ? `
                        <button class="btn btn-primary" onclick="updateInvoiceStatus('${inv.id}', 'SELESAI')" style="font-size: 0.75rem; padding: 4px 8px; background: #30d158; border-color: #30d158;">Selesai</button>
                    ` : ''}
                    <button class="btn btn-secondary" onclick="deleteInvoice('${inv.id}')" style="font-size: 0.75rem; padding: 4px 8px; color: #ff453a; border-color: rgba(255,69,58,0.2);">Hapus</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    if (window.lucide) lucide.createIcons();
};

window.updateInvoiceStatus = async function(id, status) {
    try {
        const res = await fetch(`/api/invoices/${id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            loadInvoices();
        } else {
            alert('Gagal memperbarui status invoice');
        }
    } catch (err) {
        console.error('Error updateInvoiceStatus:', err);
    }
};

window.deleteInvoice = async function(id) {
    if (!confirm('Hapus invoice ini dari riwayat?')) return;
    try {
        const res = await fetch(`/api/invoices/${id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            loadInvoices();
        } else {
            alert('Gagal menghapus invoice');
        }
    } catch (err) {
        console.error('Error deleteInvoice:', err);
    }
};

// WebSocket Invoice Listener
socket.on('invoice_created', (newInv) => {
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

// ── EXPORT & MIGRASI DATA ─────────────────────────────
window.handleExportClick = function(el) {
    const originalHTML = el.innerHTML;
    el.innerHTML = '<i data-lucide="loader"></i> Sedang menyiapkan file...';
    el.style.pointerEvents = 'none';
    el.style.opacity = '0.7';
    lucide.createIcons();

    // Restore tombol setelah 8 detik (waktu cukup untuk ZIP selesai dibuat)
    setTimeout(() => {
        el.innerHTML = originalHTML;
        el.style.pointerEvents = '';
        el.style.opacity = '';
        lucide.createIcons();
    }, 8000);
};

// ── IMPORT / RESTORE BACKUP ───────────────────────────
let importSelectedFile = null;

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function setImportFile(file) {
    if (!file || !file.name.endsWith('.zip')) {
        alert('Hanya file .zip yang bisa diupload!');
        return;
    }
    importSelectedFile = file;

    // Tampilkan info file
    document.getElementById('import-file-name').textContent = file.name;
    document.getElementById('import-file-size').textContent = formatFileSize(file.size);
    document.getElementById('import-file-info').style.display = 'block';

    // Aktifkan tombol
    const btn = document.getElementById('btn-do-import');
    btn.disabled = false;
    btn.style.opacity = '1';

    // Reset result
    const result = document.getElementById('import-result');
    result.style.display = 'none';
    result.innerHTML = '';

    lucide.createIcons();
}

window.handleImportFileSelect = function(input) {
    if (input.files && input.files[0]) setImportFile(input.files[0]);
};

window.handleImportDrop = function(event) {
    event.preventDefault();
    const dropzone = document.getElementById('import-dropzone');
    dropzone.style.borderColor = '';
    dropzone.style.background = '';
    const file = event.dataTransfer.files[0];
    if (file) setImportFile(file);
};

window.doImport = function() {
    if (!importSelectedFile) return;

    const importSession = document.getElementById('import-session-check').checked;
    const btn = document.getElementById('btn-do-import');
    const progressWrap = document.getElementById('import-progress-wrap');
    const progressBar = document.getElementById('import-progress-bar');
    const progressPct = document.getElementById('import-progress-pct');
    const resultDiv = document.getElementById('import-result');

    // Konfirmasi
    if (!confirm(`⚠️ Restore backup dari "${importSelectedFile.name}"?\n\nData yang ada (config, database, knowledge, media) akan DITIMPA.\nLanjutkan?`)) return;

    // Disable tombol & tampilkan progress
    btn.disabled = true;
    btn.style.opacity = '0.5';
    progressWrap.style.display = 'block';
    progressBar.style.width = '0%';
    progressPct.textContent = '0%';
    resultDiv.style.display = 'none';

    const formData = new FormData();
    formData.append('backup', importSelectedFile);
    formData.append('import_session', importSession ? '1' : '0');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/import', true);

    // Progress upload
    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 90); // Max 90% untuk upload fase
            progressBar.style.width = pct + '%';
            progressPct.textContent = pct + '%';
        }
    };

    xhr.onload = function() {
        progressBar.style.width = '100%';
        progressPct.textContent = '100%';

        setTimeout(() => {
            progressWrap.style.display = 'none';
            btn.disabled = false;
            btn.style.opacity = '1';
        }, 1000);

        try {
            const data = JSON.parse(xhr.responseText);
            resultDiv.style.display = 'block';

            if (data.success) {
                const restoredCount = data.details?.restored?.length || 0;
                const errorCount = data.details?.errors?.length || 0;
                resultDiv.style.background = 'rgba(37,211,102,0.1)';
                resultDiv.style.borderLeft = '3px solid #25d366';
                resultDiv.innerHTML = `
                    <strong>✅ ${data.message}</strong><br>
                    📁 ${restoredCount} file berhasil dipulihkan<br>
                    ${errorCount > 0 ? `⚠️ ${errorCount} file gagal<br>` : ''}
                    <small style="color:#888;">Memuat ulang data grup dari database...</small>
                `;
                
                // Auto-reload grup list setelah 1.5 detik agar SQLite selesai diinisialisasi
                setTimeout(async () => {
                    try {
                        if (typeof loadGroupsList === 'function') {
                            await loadGroupsList();
                        }
                        resultDiv.innerHTML = `
                            <strong>✅ ${data.message}</strong><br>
                            📁 ${restoredCount} file berhasil dipulihkan<br>
                            ${errorCount > 0 ? `⚠️ ${errorCount} file gagal<br>` : ''}
                            <small style="color:#25d366; font-weight:600;">✓ Data grup berhasil dimuat ulang dari database!</small>
                        `;
                    } catch (err) {
                        console.warn('Auto-reload grup gagal:', err);
                    }
                }, 1500);
            } else {
                resultDiv.style.background = 'rgba(231,76,60,0.08)';
                resultDiv.style.borderLeft = '3px solid #e74c3c';
                resultDiv.innerHTML = `<strong>❌ Gagal:</strong> ${data.message}`;
            }
        } catch(e) {
            resultDiv.style.display = 'block';
            resultDiv.style.background = 'rgba(231,76,60,0.08)';
            resultDiv.style.borderLeft = '3px solid #e74c3c';
            resultDiv.innerHTML = `<strong>❌ Error:</strong> Respon server tidak valid.`;
        }
    };

    xhr.onerror = function() {
        progressWrap.style.display = 'none';
        btn.disabled = false;
        btn.style.opacity = '1';
        resultDiv.style.display = 'block';
        resultDiv.style.background = 'rgba(231,76,60,0.08)';
        resultDiv.style.borderLeft = '3px solid #e74c3c';
        resultDiv.innerHTML = `<strong>❌ Koneksi gagal.</strong> Periksa server dan coba lagi.`;
    };

    xhr.send(formData);
};

// === AUTOMATION SCHEDULER ACTIONS ===
window.triggerSchedulerAction = async function(action, btn) {
    const oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="loader" style="width:12px; height:12px; border-width:2px; display:inline-block; vertical-align:middle; margin-right:6px;"></span> Memproses...';
    
    try {
        const res = await fetch(`/api/scheduler/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        
        alert('✅ ' + data.message);
    } catch(err) {
        alert('❌ Gagal memicu otomatisasi: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
    }
};

// === LOCAL NOTEPAD (WORD MINI) ===
window.execEditorCommand = function(cmd, value = null) {
    document.execCommand(cmd, false, value);
    const editor = document.getElementById('local-notepad-editor');
    if (editor) editor.focus();
};

window.loadLocalNotes = async function() {
    const editor = document.getElementById('local-notepad-editor');
    if (!editor) return;
    
    try {
        const res = await fetch('/api/notepad');
        if (!res.ok) throw new Error('Gagal mengambil data catatan.');
        const data = await res.json();
        editor.innerHTML = data.content || '<p>Mulai ketik catatan operasional atau memo toko Anda di sini...</p>';
    } catch(err) {
        console.error('Error loadLocalNotes:', err);
    }
};

window.saveLocalNotes = async function() {
    const editor = document.getElementById('local-notepad-editor');
    const btn = document.getElementById('btn-save-notes');
    if (!editor || !btn) return;
    
    const content = editor.innerHTML.trim();
    const oldHtml = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = '<span class="loader" style="width:12px; height:12px; border-width:2px; display:inline-block; vertical-align:middle; margin-right:6px;"></span> Menyimpan...';
    
    try {
        const res = await fetch('/api/notepad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        
        alert('✅ Catatan berhasil disimpan ke database!');
    } catch(err) {
        alert('❌ Gagal menyimpan catatan: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
    }
};

window.toggleOcrZone = function() {
    const zone = document.getElementById('ocr-drag-drop-zone');
    if (zone) {
        if (zone.style.display === 'none') {
            zone.style.display = 'block';
        } else {
            zone.style.display = 'none';
        }
    }
};

// ==========================================
// PREMIUM MANAGER TAB LOGIC
// ==========================================
let premiumProducts = [];
let premiumAccounts = [];
let premiumSales = [];

window.openPremiumModal = function(type) {
    const modal = document.getElementById('modal-premium-' + type);
    if (modal) {
        modal.classList.remove('hidden-modal');
        if (type === 'sale') {
            loadPremiumAccountsListForSale();
        } else if (type === 'account') {
            loadPremiumProductsListForAccount();
        } else if (type === 'apk') {
            window.renderPremiumApkList();
        }
    }
};

window.closePremiumModal = function(type) {
    const modal = document.getElementById('modal-premium-' + type);
    if (modal) {
        modal.classList.add('hidden-modal');
    }
};

window.closePremiumModalOnOverlay = function(event, type) {
    if (event.target.classList.contains('premium-modal')) {
        closePremiumModal(type);
    }
};

window.loadPremiumData = async function() {
    try {
        await Promise.all([
            loadPremiumProducts(),
            loadPremiumAccounts(),
            loadPremiumSales()
        ]);
        updatePremiumStats();
    } catch(err) {
        console.error('Error loadPremiumData:', err);
    }
};

async function loadPremiumProducts() {
    try {
        const res = await fetch('/api/premium/products');
        if (!res.ok) throw new Error('Gagal memuat produk');
        premiumProducts = await res.json();
    } catch(err) {
        console.error('Error loadPremiumProducts:', err);
    }
}

async function loadPremiumAccounts() {
    try {
        const res = await fetch('/api/premium/accounts');
        if (!res.ok) throw new Error('Gagal memuat akun');
        premiumAccounts = await res.json();
        renderPremiumAccountsTable();
    } catch(err) {
        console.error('Error loadPremiumAccounts:', err);
    }
}

async function loadPremiumSales() {
    try {
        const res = await fetch('/api/premium/sales');
        if (!res.ok) throw new Error('Gagal memuat penjualan');
        premiumSales = await res.json();
        renderPremiumSalesTable();
    } catch(err) {
        console.error('Error loadPremiumSales:', err);
    }
}

function updatePremiumStats() {
    const todayStr = new Date().toISOString().substring(0, 10);
    const activeSubs = premiumSales.filter(s => s.payment_status === 'Lunas' && s.end_date >= todayStr).length;
    document.getElementById('stat-active-subscribers').textContent = activeSubs;
    
    const totalAccs = premiumAccounts.length;
    const readyAccs = premiumAccounts.filter(a => a.status === 'Tersedia').length;
    document.getElementById('stat-stock-ratio').textContent = `${readyAccs} / ${totalAccs}`;
    
    const activeSales = premiumSales.filter(s => s.payment_status === 'Lunas' && s.end_date >= todayStr);
    const estimatedRev = activeSales.reduce((acc, curr) => acc + (curr.price || 0), 0);
    document.getElementById('stat-monthly-revenue').textContent = `Rp ${estimatedRev.toLocaleString('id-ID')}`;
    
    const soonExpiring = premiumSales.filter(s => {
        if (!s.end_date) return false;
        const diffTime = new Date(s.end_date) - new Date();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 5 && diffDays >= 0;
    }).length;
    document.getElementById('stat-expiring-soon').textContent = soonExpiring;
}

function renderPremiumAccountsTable() {
    const tbody = document.getElementById('premium-accounts-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (premiumAccounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">Belum ada stok akun premium.</td></tr>';
        return;
    }
    
    premiumAccounts.forEach(acc => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        let statusColor = '#ffd60a'; 
        if (acc.status === 'Penuh') statusColor = '#ff453a';
        if (acc.status === 'Nonaktif') statusColor = 'var(--text-secondary)';
        if (acc.status === 'Tersedia') statusColor = '#30d158';

        tr.innerHTML = `
            <td style="padding: 10px 8px; font-weight: 600;">${acc.product_name || 'APK'}</td>
            <td style="padding: 10px 8px;">
                <div style="font-weight: 500;">${acc.email}</div>
                <div style="font-size: 0.7rem; color: var(--text-secondary); font-family: monospace;">Pass: ${acc.password}</div>
                ${acc.notes ? `<div style="font-size: 0.7rem; color: #ffd60a; margin-top: 2px;">📝 ${acc.notes}</div>` : ''}
            </td>
            <td style="padding: 10px 8px;">${acc.active_users || 0} / ${acc.max_users}</td>
            <td style="padding: 10px 8px;"><span class="badge" style="background: rgba(255,255,255,0.05); color: ${statusColor};">${acc.status}</span></td>
            <td style="padding: 10px 8px; text-align: right;">
                <button class="btn btn-danger btn-sm" onclick="deletePremiumAccount(${acc.id})" style="padding: 3px 8px; font-size: 0.7rem; min-height: auto; height: 24px; width: auto; display: inline-flex; align-items: center; justify-content: center;"><i data-lucide="trash-2" style="width: 12px; height: 12px;"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function renderPremiumSalesTable() {
    const tbody = document.getElementById('premium-sales-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (premiumSales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-secondary);">Belum ada data penjualan premium.</td></tr>';
        return;
    }
    
    premiumSales.forEach(sale => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        let daysLeft = 0;
        if (sale.end_date) {
            const diffTime = new Date(sale.end_date) - new Date();
            daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
        
        let daysBadge = '';
        if (daysLeft < 0) {
            daysBadge = `<span class="badge" style="background: rgba(255,69,58,0.15); color: #ff453a;">Expired (${Math.abs(daysLeft)} h)</span>`;
        } else if (daysLeft <= 5) {
            daysBadge = `<span class="badge" style="background: rgba(255,214,10,0.15); color: #ffd60a;">${daysLeft} Hari Lagi</span>`;
        } else {
            daysBadge = `<span class="badge" style="background: rgba(48,209,88,0.15); color: #30d158;">${daysLeft} Hari</span>`;
        }

        let paymentColor = sale.payment_status === 'Lunas' ? '#30d158' : '#ffd60a';

        tr.innerHTML = `
            <td style="padding: 10px 8px;">
                <div style="font-weight: 600;">${sale.product_name || 'APK'}</div>
                <div style="font-size: 0.7rem; color: var(--text-secondary); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sale.account_email || ''}</div>
            </td>
            <td style="padding: 10px 8px;">
                <div style="font-weight: 500;">${sale.buyer_name}</div>
                <div style="font-size: 0.7rem; color: var(--text-secondary); font-family: monospace;">+${sale.buyer_phone}</div>
            </td>
            <td style="padding: 10px 8px;">${sale.profile_name || '-'}</td>
            <td style="padding: 10px 8px;">
                ${daysBadge}
                <div style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 2px;">s/d ${sale.end_date || ''}</div>
            </td>
            <td style="padding: 10px 8px;">
                <span class="badge" style="background: rgba(255,255,255,0.05); color: ${paymentColor};">${sale.payment_status}</span>
                <div style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 2px;">Rp ${(sale.price || 0).toLocaleString('id-ID')}</div>
            </td>
            <td style="padding: 10px 8px; text-align: right;">
                <div style="display: flex; gap: 4px; justify-content: flex-end; align-items: center;">
                    <button class="btn btn-secondary btn-sm" onclick="sendPremiumReminder(${sale.id}, this)" title="Kirim Pengingat WA" style="padding: 3px 8px; font-size: 0.7rem; min-height: auto; height: 24px; width: auto; display: inline-flex; align-items: center; justify-content: center; color: #25d366;"><i data-lucide="bell" style="width: 12px; height: 12px;"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="deletePremiumSale(${sale.id})" style="padding: 3px 8px; font-size: 0.7rem; min-height: auto; height: 24px; width: auto; display: inline-flex; align-items: center; justify-content: center;"><i data-lucide="trash-2" style="width: 12px; height: 12px;"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function loadPremiumProductsListForAccount() {
    const select = document.getElementById('acc-product-id');
    if (!select) return;
    select.innerHTML = '<option value="">-- Pilih APK --</option>';
    premiumProducts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

function loadPremiumAccountsListForSale() {
    const select = document.getElementById('sale-account-id');
    if (!select) return;
    select.innerHTML = '<option value="">-- Pilih Akun --</option>';
    premiumAccounts.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.product_name || 'APK'} - ${a.email} (${a.active_users || 0}/${a.max_users} User)`;
        select.appendChild(opt);
    });
}

window.renderPremiumApkList = function() {
    const list = document.getElementById('premium-apk-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (premiumProducts.length === 0) {
        list.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-secondary); width: 100%; text-align: center;">Belum ada jenis APK. Tambahkan di atas.</span>';
        return;
    }
    
    premiumProducts.forEach(p => {
        const badge = document.createElement('div');
        badge.style = 'display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.75rem; font-weight: 500;';
        badge.innerHTML = `
            <span>${p.name}</span>
            <i data-lucide="x" onclick="deletePremiumProduct(${p.id})" style="width: 12px; height: 12px; color: var(--text-secondary); cursor: pointer; transition: color 0.15s;" onmouseover="this.style.color='#ff453a'" onmouseout="this.style.color='var(--text-secondary)'"></i>
        `;
        list.appendChild(badge);
    });
    lucide.createIcons();
};

window.addPremiumProduct = async function() {
    const input = document.getElementById('premium-apk-name');
    if (!input || !input.value.trim()) return;
    const name = input.value.trim();
    
    try {
        const res = await fetch('/api/premium/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        
        input.value = '';
        await loadPremiumProducts();
        window.renderPremiumApkList();
    } catch(err) {
        alert('Gagal menambah jenis APK: ' + err.message);
    }
};

window.deletePremiumProduct = async function(id) {
    if (!confirm('Hapus jenis APK ini? Semua akun dengan jenis ini juga akan terpengaruh.')) return;
    try {
        const res = await fetch('/api/premium/products/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        
        await loadPremiumProducts();
        window.renderPremiumApkList();
        loadPremiumAccounts(); 
    } catch(err) {
        alert('Gagal menghapus APK: ' + err.message);
    }
};

window.deletePremiumAccount = async function(id) {
    if (!confirm('Hapus akun premium ini dari stok?')) return;
    try {
        const res = await fetch('/api/premium/accounts/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        loadPremiumAccounts();
    } catch(err) {
        alert('Gagal menghapus akun: ' + err.message);
    }
};

window.deletePremiumSale = async function(id) {
    if (!confirm('Hapus data penjualan ini?')) return;
    try {
        const res = await fetch('/api/premium/sales/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        loadPremiumSales();
    } catch(err) {
        alert('Gagal menghapus data penjualan: ' + err.message);
    }
};

window.sendPremiumReminder = async function(id, btn) {
    const oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="loader" style="width:10px; height:10px; border-width:1.5px; display:inline-block;"></span>';
    
    try {
        const res = await fetch('/api/premium/send-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saleId: id })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');
        alert('✅ Pesan WhatsApp reminder manual berhasil dikirim ke pembeli!');
    } catch(err) {
        alert('❌ Gagal mengirim reminder WA: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
    }
};

// Register Form submits
document.addEventListener('DOMContentLoaded', () => {
    const accForm = document.getElementById('premium-account-form');
    if (accForm) {
        accForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const product_id = document.getElementById('acc-product-id').value;
            const email = document.getElementById('acc-email').value.trim();
            const password = document.getElementById('acc-password').value.trim();
            const max_users = parseInt(document.getElementById('acc-max-users').value, 10) || 1;
            const status = document.getElementById('acc-status').value;
            const notes = document.getElementById('acc-notes').value.trim();
            
            try {
                const res = await fetch('/api/premium/accounts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_id, email, password, max_users, status, notes })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Server error');
                
                accForm.reset();
                closePremiumModal('account');
                loadPremiumAccounts();
            } catch(err) {
                alert('Gagal menyimpan akun: ' + err.message);
            }
        });
    }
    
    const saleForm = document.getElementById('premium-sale-form');
    if (saleForm) {
        const startInput = document.getElementById('sale-start-date');
        if (startInput) {
            startInput.value = new Date().toISOString().substring(0, 10);
        }
        
        saleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const account_id = document.getElementById('sale-account-id').value;
            const buyer_name = document.getElementById('sale-buyer-name').value.trim();
            const buyer_phone = document.getElementById('sale-buyer-phone').value.trim();
            const profile_name = document.getElementById('sale-profile-name').value.trim();
            const price = parseInt(document.getElementById('sale-price').value, 10) || 0;
            const start_date = document.getElementById('sale-start-date').value;
            const end_date = document.getElementById('sale-end-date').value;
            const payment_status = document.getElementById('sale-payment-status').value;
            const auto_remind = document.getElementById('sale-auto-remind').checked;
            
            try {
                const res = await fetch('/api/premium/sales', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account_id, buyer_name, buyer_phone, price, payment_status, profile_name, start_date, end_date, auto_remind })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Server error');
                
                saleForm.reset();
                closePremiumModal('sale');
                loadPremiumSales();
            } catch(err) {
                alert('Gagal mencatat penjualan: ' + err.message);
            }
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM BOT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

// Socket.io: Terima update status Bot Telegram dari server secara real-time
socket.on('telegram_status', (data) => {
    updateTelegramStatusUI(data.status, data.message);
});

function updateTelegramStatusUI(status, message) {
    const dot  = document.getElementById('tg-status-dot');
    const text = document.getElementById('tg-status-text');
    if (!dot || !text) return;

    const map = {
        CONNECTED:    { color: '#10b981', label: '● Terhubung & Aktif' },
        DISCONNECTED: { color: '#ef4444', label: '● Terputus' },
        DISABLED:     { color: '#6b7280', label: '○ Bot Telegram Nonaktif' },
        ERROR:        { color: '#f59e0b', label: '⚠ Error: ' + (message || 'Periksa token') }
    };
    const s = map[status] || { color: '#6b7280', label: '○ ' + (status || 'Tidak Diketahui') };
    dot.style.background = s.color;
    text.textContent = s.label;
    text.style.color = s.color;
}

let cachedTgToken = '';

// Muat data konfigurasi Telegram dari server ke form dasbor
async function loadTelegramConfig() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) return;
        const cfg = await res.json();

        const el = (id) => document.getElementById(id);

        if (cfg.telegram_bot_token) cachedTgToken = cfg.telegram_bot_token;

        if (el('tg-enabled-toggle'))      el('tg-enabled-toggle').checked    = cfg.telegram_bot_enabled === true;
        if (el('tg-bot-token'))           el('tg-bot-token').value           = cfg.telegram_bot_token || '';
        if (el('tg-boss-id'))             el('tg-boss-id').value             = cfg.telegram_boss_id || '';
        if (el('tg-private-enabled'))     el('tg-private-enabled').checked   = cfg.telegram_private_bot_enabled !== false;

        const tgCfg = cfg.telegram_config || {};
        if (el('tg-rate-limit'))          el('tg-rate-limit').value          = tgCfg.rate_limit_per_minute ?? 5;
        if (el('tg-ai-cooldown'))         el('tg-ai-cooldown').value         = tgCfg.ai_cooldown_seconds ?? 10;
        if (el('tg-whitelist-mode'))      el('tg-whitelist-mode').checked    = tgCfg.whitelist_mode === true;
        if (el('tg-whitelist'))           el('tg-whitelist').value           = (tgCfg.whitelist || []).join(',');
        if (el('tg-blacklist'))           el('tg-blacklist').value           = (tgCfg.blacklist || []).join(',');
        if (el('tg-auto-delete-welcome')) el('tg-auto-delete-welcome').value = tgCfg.auto_delete_welcome_seconds ?? 0;
        if (el('tg-auto-delete-schedule'))el('tg-auto-delete-schedule').value= tgCfg.auto_delete_schedule_seconds ?? 0;

        // Cek status bot langsung dari backend
        try {
            const statusRes = await fetch('/api/telegram/status');
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                updateTelegramStatusUI(statusData.status, statusData.error);
            } else {
                updateTelegramStatusUI(cfg.telegram_bot_enabled ? 'DISCONNECTED' : 'DISABLED');
            }
        } catch (_) {
            updateTelegramStatusUI(cfg.telegram_bot_enabled ? 'DISCONNECTED' : 'DISABLED');
        }

    } catch (err) {
        console.error('[TG Config] Gagal memuat konfigurasi Telegram:', err.message);
        updateTelegramStatusUI('ERROR', err.message);
    }
}


// Simpan pengaturan Telegram ke server (menulis ke config.json)
window.saveTelegramConfig = async function() {
    const el = (id) => document.getElementById(id);
    const btn = el('btn-save-tg-config');
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span style="display:inline-block;width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;"></span> Menyimpan...`;

    const parseIdList = (str) =>
        (str || '').split(',').map(s => s.trim()).filter(s => s.length > 0);

    let inputToken = el('tg-bot-token') ? el('tg-bot-token').value.trim() : '';
    if (!inputToken || /^\.+$/.test(inputToken)) {
        inputToken = cachedTgToken;
    }

    const payload = {
        telegram_bot_token:        inputToken,
        telegram_bot_enabled:      el('tg-enabled-toggle') ? el('tg-enabled-toggle').checked : false,
        telegram_boss_id:          el('tg-boss-id')        ? el('tg-boss-id').value.trim()   : '',
        telegram_private_bot_enabled: el('tg-private-enabled') ? el('tg-private-enabled').checked : true,
        private_chat_sync_group_id: el('cfg-private-chat-sync-group-id') ? el('cfg-private-chat-sync-group-id').value : '',
        telegram_config: {
            rate_limit_per_minute:         parseInt(el('tg-rate-limit')?.value || '5', 10),
            ai_cooldown_seconds:           parseInt(el('tg-ai-cooldown')?.value || '10', 10),
            whitelist_mode:                el('tg-whitelist-mode')?.checked || false,
            whitelist:                     parseIdList(el('tg-whitelist')?.value),
            blacklist:                     parseIdList(el('tg-blacklist')?.value),
            auto_delete_welcome_seconds:   parseInt(el('tg-auto-delete-welcome')?.value || '0', 10),
            auto_delete_schedule_seconds:  parseInt(el('tg-auto-delete-schedule')?.value || '0', 10)
        }
    };

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());

        if (inputToken) cachedTgToken = inputToken;

        btn.innerHTML = `<i data-lucide="check" style="width:15px;height:15px;"></i> Tersimpan!`;
        btn.style.background = '#10b981';

        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = '';
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }, 2000);

        // Fetch status terbaru
        setTimeout(async () => {
            try {
                const sRes = await fetch('/api/telegram/status');
                if (sRes.ok) {
                    const sData = await sRes.json();
                    updateTelegramStatusUI(sData.status);
                }
            } catch (_) {}
        }, 1000);

    } catch (err) {
        alert('Gagal menyimpan pengaturan Telegram: ' + err.message);
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
};

// Test koneksi: validasi token bot dengan memanggil getMe() via backend
window.testTelegramConnection = async function() {
    let token = document.getElementById('tg-bot-token')?.value.trim();
    if (!token || /^\.+$/.test(token)) {
        token = cachedTgToken;
    }

    if (!token) {
        alert('Isi token bot terlebih dahulu dari @BotFather!');
        return;
    }

    updateTelegramStatusUI('DISCONNECTED', 'Menguji koneksi...');
    const dot  = document.getElementById('tg-status-dot');
    const text = document.getElementById('tg-status-text');
    if (dot)  dot.style.background = '#f59e0b';
    if (text) { text.textContent = '⟳ Menguji koneksi ke Telegram...'; text.style.color = '#f59e0b'; }

    try {
        const res = await fetch('/api/telegram/test-connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        const data = await res.json();
        if (data.success) {
            cachedTgToken = token;
            if (document.getElementById('tg-bot-token')) document.getElementById('tg-bot-token').value = token;
            updateTelegramStatusUI('CONNECTED');
            alert(`✅ Koneksi berhasil!\n\nBot: @${data.username}\nNama: ${data.first_name}\n\nToken valid! Jangan lupa klik "Simpan Pengaturan Telegram".`);
        } else {
            updateTelegramStatusUI('ERROR', data.error || 'Token tidak valid');
            alert('❌ Koneksi gagal: ' + (data.error || 'Token tidak valid atau kadaluarsa.'));
        }
    } catch (err) {
        updateTelegramStatusUI('ERROR', err.message);
        alert('❌ Gagal menguji koneksi: ' + err.message);
    }
};

// Toggle tampilkan/sembunyikan token (icon mata)
window.toggleTgTokenVisibility = function() {
    const input = document.getElementById('tg-bot-token');
    const icon  = document.getElementById('tg-token-eye');
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    if (icon) {
        icon.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
        if (window.lucide) lucide.createIcons();
    }
};

// Toggle UI whitelist (sekedar visual feedback)
window.toggleWhitelistUI = function() {
    const isEnabled = document.getElementById('tg-whitelist-mode')?.checked;
    const whitelistInput = document.getElementById('tg-whitelist');
    if (whitelistInput) {
        whitelistInput.style.borderColor = isEnabled ? '#229ED9' : '';
        whitelistInput.style.opacity = isEnabled ? '1' : '0.5';
    }
};

// Auto-load saat halaman pertama kali terbuka jika tab aktif adalah settings
document.addEventListener('DOMContentLoaded', () => {
    const activeTab = document.querySelector('.tab-content:not(.hidden)');
    if (activeTab && activeTab.id === 'tab-settings') {
        setTimeout(() => { if (typeof loadTelegramConfig === 'function') loadTelegramConfig(); }, 300);
    }
});

// Switch group sub-tabs (Settings vs Menu Tree)
window.switchGroupSubTab = function(tabName) {
    // Switch active states on segment buttons
    document.querySelectorAll('.grp-segment-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`grp-btn-${tabName}`)?.classList.add('active');
    
    // Switch active states on tab panes
    if (tabName === 'settings') {
        document.getElementById('grp-tab-content-settings').classList.remove('hidden');
        document.getElementById('grp-tab-content-tree').classList.add('hidden');
    } else {
        document.getElementById('grp-tab-content-settings').classList.add('hidden');
        document.getElementById('grp-tab-content-tree').classList.remove('hidden');
    }
    
    // Re-trigger Lucide icons render just in case
    if (window.lucide) lucide.createIcons();
};


