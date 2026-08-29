async function loadFiles() {
    try {
        const res = await fetch('/api/files');
        const data = await res.json();
        cachedFilesData = data;
        
        renderFileList(knowledgeList, data.knowledge, 'knowledge');
        renderFileList(mediaList, data[currentMediaCategory] || [], currentMediaCategory);
    } catch (err) {
        console.error('Gagal memuat berkas:', err);
    }
}

function renderFileList(container, files, type) {
    container.innerHTML = '';
    
    if (!files || files.length === 0) {
        container.innerHTML = `<div class="file-item-placeholder">Tidak ada berkas di kategori ini.</div>`;
        return;
    }
    
    files.forEach(fileObj => {
        const file = typeof fileObj === 'string' ? fileObj : (fileObj.name || '');
        const fileUrl = typeof fileObj === 'object' && fileObj.url ? fileObj.url : (
            type === 'knowledge' ? `/knowledge/${file}` : 
            type === 'media' ? `/media/${file}` : 
            `/uploads/${type}/${file}`
        );
        if (!file) return;

        const item = document.createElement('div');
        item.className = 'file-item';
        item.style.alignItems = 'center';
        
        // Render thumbnail if image
        const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(file);
        let thumbHtml = '';
        if (isImg) {
            thumbHtml = `<img src="${fileUrl}" style="width: 34px; height: 34px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); margin-right: 8px; flex-shrink: 0;" alt="thumb">`;
        }

        const nameSpan = document.createElement('div');
        nameSpan.className = 'file-name';
        nameSpan.style.display = 'flex';
        nameSpan.style.alignItems = 'center';
        nameSpan.style.flex = '1';
        nameSpan.style.minWidth = '0';
        nameSpan.innerHTML = `${thumbHtml}<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${file}">${file}</span>`;
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'file-actions';
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '5px';
        actionsDiv.style.flexShrink = '0';
        
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-secondary btn-sm';
        viewBtn.innerHTML = 'Lihat';
        viewBtn.onclick = () => window.open(fileUrl, '_blank');
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn btn-secondary btn-sm';
        renameBtn.innerHTML = 'Rename';
        renameBtn.onclick = () => renameFile(type, file);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.textContent = 'Hapus';
        deleteBtn.onclick = () => deleteFile(type, file);
        
        actionsDiv.appendChild(viewBtn);
        if (type === 'media' || type === 'knowledge') actionsDiv.appendChild(renameBtn);
        actionsDiv.appendChild(deleteBtn);
        
        item.appendChild(nameSpan);
        item.appendChild(actionsDiv);
        container.appendChild(item);
    });
}

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

function setupUploadHandlers() {
    knowledgeUpload.addEventListener('change', () => handleFileUpload(knowledgeUpload, 'knowledge'));
    mediaUpload.addEventListener('change', () => handleFileUpload(mediaUpload, currentMediaCategory));
}

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


// Expose functions to window for HTML onclick compatibility
window.loadFiles = loadFiles;
window.renderFileList = renderFileList;
window.renameFile = renameFile;
window.setupUploadHandlers = setupUploadHandlers;
window.handleFileUpload = handleFileUpload;
window.deleteFile = deleteFile;
