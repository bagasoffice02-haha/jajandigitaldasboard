// src/routes/files.js — API Routes untuk Manajemen File, OCR & Categorized File Manager
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DIRS = {
    knowledge: './knowledge',
    media: './media',
    stickers: './public/uploads/stickers',
    payments: './public/uploads/payments',
    products: './public/uploads/products'
};

const URL_PREFIXES = {
    knowledge: '/knowledge',
    media: '/media',
    stickers: '/uploads/stickers',
    payments: '/uploads/payments',
    products: '/uploads/products'
};

function getFileInfo(dirPath, urlPrefix) {
    if (!fs.existsSync(dirPath)) return [];
    try {
        const files = fs.readdirSync(dirPath);
        return files.map(name => {
            const filePath = path.join(dirPath, name);
            let stats = { size: 0, mtime: new Date() };
            try { stats = fs.statSync(filePath); } catch(_) {}
            return {
                name,
                url: `${urlPrefix}/${name}`,
                size: stats.size,
                mtime: stats.mtime
            };
        }).sort((a, b) => b.mtime - a.mtime);
    } catch (_) {
        return [];
    }
}

// ─── FILE LIST (Categorized) ────────────────────────────────────────────
router.get('/files', (req, res) => {
    try {
        res.json({
            knowledge: getFileInfo(DIRS.knowledge, URL_PREFIXES.knowledge),
            media: getFileInfo(DIRS.media, URL_PREFIXES.media),
            stickers: getFileInfo(DIRS.stickers, URL_PREFIXES.stickers),
            payments: getFileInfo(DIRS.payments, URL_PREFIXES.payments),
            products: getFileInfo(DIRS.products, URL_PREFIXES.products)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── UPLOAD ───────────────────────────────────────────────
router.post('/upload/knowledge', (req, res) => {
    req.app.get('knowledgeUpload').single('file')(req, res, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

router.post('/upload/media', (req, res) => {
    req.app.get('mediaUpload').single('file')(req, res, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

router.post('/upload/stickers', (req, res) => {
    req.app.get('stickersUpload').single('file')(req, res, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

router.post('/upload/products', (req, res) => {
    req.app.get('productsUpload').single('file')(req, res, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ─── OCR ──────────────────────────────────────────────────
router.post('/ocr', (req, res) => {
    req.app.get('mediaUpload').single('file')(req, res, async (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'Tidak ada file gambar yang diupload' });
        
        try {
            const { performOCR, isReceiptText, extractReceiptDetails } = require('../services/ocr/ocrService');
            const filePath = req.file.path;
            const buffer = fs.readFileSync(filePath);
            const ocrText = await performOCR(buffer);
            try { fs.unlinkSync(filePath); } catch (_) {}
            const isReceipt = isReceiptText(ocrText);
            let parsed = null;
            if (isReceipt) {
                parsed = await extractReceiptDetails(ocrText);
            }
            res.json({ success: true, text: ocrText, isReceipt, parsed });
        } catch (ocrErr) {
            console.error('Error saat OCR di Dashboard:', ocrErr.message);
            res.status(500).json({ error: ocrErr.message });
        }
    });
});

// ─── DELETE FILE ─────────────────────────────────────────
router.post('/files/delete', (req, res) => {
    const { type, filename } = req.body;
    const targetDir = DIRS[type] || DIRS.media;
    const filePath = path.join(targetDir, filename);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Gagal menghapus berkas: ' + err.message });
        }
    } else {
        res.status(404).json({ error: 'File tidak ditemukan' });
    }
});

// ─── RENAME FILE ─────────────────────────────────────────
router.post('/files/rename', (req, res) => {
    const { type, oldFilename, newFilename, oldName, newName } = req.body;
    const oldNameFinal = oldFilename || oldName;
    const newNameFinal = newFilename || newName;
    if (!oldNameFinal || !newNameFinal) {
        return res.status(400).json({ error: 'Nama file lama atau baru tidak valid' });
    }
    const targetDir = DIRS[type] || DIRS.media;
    const oldPath = path.join(targetDir, oldNameFinal);
    const newPath = path.join(targetDir, newNameFinal);
    if (fs.existsSync(oldPath)) {
        try {
            fs.renameSync(oldPath, newPath);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Gagal mengubah nama berkas: ' + err.message });
        }
    } else {
        res.status(404).json({ error: 'File tidak ditemukan' });
    }
});

module.exports = router;

