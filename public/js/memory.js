// ==========================================
// KNOWLEDGE BASE (RAG), AI MEMORY & NOTEPAD
// ==========================================
'use strict';

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── 1. KNOWLEDGE BASE (RAG) FILES ────────────────────────
window.loadFiles = async function() {
    const container = document.getElementById('files-list');
    if (!container) return;

    try {
        const res = await fetch('/api/files');
        if (!res.ok) throw new Error('Gagal memuat berkas');
        const data = await res.json();
        
        const files = data.knowledge || [];
        container.innerHTML = '';

        if (files.length === 0) {
            container.innerHTML = '<p class="text-center py-6 text-xs text-[var(--text-muted)]">Belum ada dokumen referensi RAG.</p>';
            return;
        }

        files.forEach(fileObj => {
            const fileName = typeof fileObj === 'string' ? fileObj : (fileObj.name || '');
            if (!fileName) return;
            const fileUrl = `/knowledge/${fileName}`;

            const item = document.createElement('div');
            item.className = 'p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs';
            item.innerHTML = `
                <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                        <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
                    </div>
                    <span class="font-medium truncate max-w-[200px] text-white" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <a href="${fileUrl}" target="_blank" class="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-semibold border border-[var(--border-color)]">
                        Buka
                    </a>
                    <button onclick="deleteFile('knowledge', '${escapeHtml(fileName)}')" class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            `;
            container.appendChild(item);
        });

        if (window.lucide) lucide.createIcons();
    } catch(err) {
        console.error('Error loadFiles:', err);
        if (container) container.innerHTML = `<p class="text-center py-4 text-xs text-rose-400">Gagal: ${err.message}</p>`;
    }
};

window.uploadFile = async function() {
    const input = document.getElementById('file-upload-input');
    if (!input || !input.files || input.files.length === 0) return;

    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);

    if (window.showToast) window.showToast('info', `Mengunggah ${file.name}...`);

    try {
        const res = await fetch('/api/upload/knowledge', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            if (window.showToast) window.showToast('success', `Berkas ${file.name} berhasil diunggah!`);
            window.loadFiles();
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        if (window.showToast) window.showToast('error', 'Gagal mengunggah berkas: ' + err.message);
    } finally {
        input.value = '';
    }
};

window.deleteFile = async function(type, filename) {
    if (!confirm(`Apakah Anda yakin ingin menghapus berkas "${filename}"?`)) return;

    try {
        const res = await fetch('/api/files/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, filename })
        });

        if (res.ok) {
            if (window.showToast) window.showToast('success', 'Berkas berhasil dihapus.');
            window.loadFiles();
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        if (window.showToast) window.showToast('error', 'Gagal menghapus berkas: ' + err.message);
    }
};

// ─── 2. AI MEMORY & SYSTEM PROMPT ─────────────────────────
window.loadMemoryContent = async function() {
    const textarea = document.getElementById('ai-memory-text');
    if (!textarea) return;

    try {
        const res = await fetch('/api/memory');
        if (res.ok) {
            const data = await res.json();
            textarea.value = data.content || '';
        }
    } catch (err) {
        console.error('Error loadMemoryContent:', err);
    }
};

window.saveMemoryContent = async function() {
    const textarea = document.getElementById('ai-memory-text');
    if (!textarea) return;

    const content = textarea.value;
    try {
        const res = await fetch('/api/memory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (res.ok) {
            if (window.showToast) window.showToast('success', 'System Prompt & Kepribadian AI berhasil disimpan!');
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        if (window.showToast) window.showToast('error', 'Gagal menyimpan memori AI: ' + err.message);
    }
};

// ─── 3. NOTEPAD SINKRON ───────────────────────────────────
window.loadLocalNotes = async function() {
    const textarea = document.getElementById('local-notepad-input');
    if (!textarea) return;

    try {
        const res = await fetch('/api/notepad');
        if (res.ok) {
            const data = await res.json();
            textarea.value = data.content || '';
        }
    } catch (err) {
        console.error('Error loadLocalNotes:', err);
    }
};

window.saveLocalNotes = async function() {
    const textarea = document.getElementById('local-notepad-input');
    if (!textarea) return;

    const content = textarea.value;
    try {
        const res = await fetch('/api/notepad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (res.ok) {
            if (window.showToast) window.showToast('success', 'Catatan operasional berhasil disimpan!');
        } else {
            throw new Error(await res.text());
        }
    } catch (err) {
        if (window.showToast) window.showToast('error', 'Gagal menyimpan catatan: ' + err.message);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.loadFiles) window.loadFiles();
        if (window.loadMemoryContent) window.loadMemoryContent();
        if (window.loadLocalNotes) window.loadLocalNotes();
    }, 500);
});
