// src/handlers/helpers.js
// Fungsi utilitas bersama yang dipakai oleh semua handler

'use strict';
const fs = require('fs');
const path = require('path');
const { getLogHistory, saveLogHistory } = require('../db/models');

// ─── Phone Normalization ───────────────────────────────────────────────────────
function normalizePhone(phone) {
    if (!phone) return '';
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) clean = '62' + clean.slice(1);
    return clean;
}

// ─── MIME Type Helper ─────────────────────────────────────────────────────────
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
        '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
        '.txt': 'text/plain', '.zip': 'application/zip', '.rar': 'application/vnd.rar',
        '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.csv': 'text/csv', '.json': 'application/json',
        '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript'
    };
    return mimeMap[ext] || 'application/octet-stream';
}

// ─── Reminder Time Parser ─────────────────────────────────────────────────────
function parseReminderTime(timeStr) {
    const now = new Date();
    const wibOffset = 7 * 60 * 60 * 1000;
    const nowUtc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const nowWib = new Date(nowUtc + wibOffset);
    let targetDate = new Date(nowWib);
    const cleanStr = timeStr.toLowerCase().trim();
    const timeMatch = cleanStr.match(/([01]\d|2[0-3])[:.]([0-5]\d)/);
    if (!timeMatch) return null;
    const hh = parseInt(timeMatch[1], 10);
    const mm = parseInt(timeMatch[2], 10);
    targetDate.setHours(hh, mm, 0, 0);
    if (cleanStr.includes('besok')) {
        targetDate.setDate(targetDate.getDate() + 1);
    } else if (cleanStr.includes('lusa')) {
        targetDate.setDate(targetDate.getDate() + 2);
    } else {
        const dateMatch = cleanStr.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?/);
        if (dateMatch) {
            const day = parseInt(dateMatch[1], 10);
            const month = parseInt(dateMatch[2], 10) - 1;
            const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : targetDate.getFullYear();
            targetDate.setDate(day); targetDate.setMonth(month); targetDate.setFullYear(year);
        } else {
            if (targetDate.getTime() <= nowWib.getTime()) targetDate.setDate(targetDate.getDate() + 1);
        }
    }
    const diff = targetDate.getTime() - nowWib.getTime();
    return new Date(now.getTime() + diff);
}

// ─── History Log ──────────────────────────────────────────────────────────────
async function addHistoryLog(type, entry, ioInstance) {
    const newEntry = { ...entry, tanggal: new Date().toISOString() };
    const historyLog = await getLogHistory();
    if (type === 'finance') {
        if (!historyLog.finance) historyLog.finance = [];
        historyLog.finance.unshift(newEntry);
        if (historyLog.finance.length > 15) historyLog.finance.pop();
    } else if (type === 'agenda') {
        if (!historyLog.agenda) historyLog.agenda = [];
        historyLog.agenda.unshift(newEntry);
        if (historyLog.agenda.length > 15) historyLog.agenda.pop();
    }
    await saveLogHistory(historyLog);
    if (ioInstance) ioInstance.emit('history_updated', historyLog);
}

// ─── Menu Tree Helpers ────────────────────────────────────────────────────────
function findNodeById(node, id) {
    if (node.id === id) return node;
    if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
            const found = findNodeById(child, id);
            if (found) return found;
        }
    }
    return null;
}

function findNodeByName(node, name, parentPath = []) {
    const searchName = name.toLowerCase().trim();
    const nodeName = node && node.name ? node.name.toLowerCase().trim() : '';
    if (nodeName === searchName) return { node, parentPath };
    if (node && Array.isArray(node.aliases)) {
        const hasAlias = node.aliases.some(a => a.toLowerCase().trim() === searchName);
        if (hasAlias) return { node, parentPath };
    }
    if (node && node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
            const result = findNodeByName(child, name, [...parentPath, node.id]);
            if (result) return result;
        }
    }
    return null;
}

function getAllPromoNodes(menuTree, categoryPath = []) {
    const results = [];
    const collect = (node, pathArr) => {
        if (!node) return;
        if (node.type === 'content' && node.isPromo) results.push({ node, categoryPath: pathArr });
        if (node.type === 'category' && node.children) {
            const childPath = node.id === 'root' ? pathArr : [...pathArr, node.name];
            node.children.forEach(child => collect(child, childPath));
        }
    };
    if (menuTree) collect(menuTree, categoryPath);
    return results;
}

function getStatusEmoji(status) {
    if (!status) return '';
    const s = status.trim().toLowerCase();
    if (s === 'tersedia' || s === 'sedia' || s === 'ready') return ' ✅';
    if (s === 'habis' || s === 'kosong' || s === 'tidak tersedia') return ' ❌';
    if (s === 'pre-order' || s === 'preorder' || s === 'po') return ' ⏳';
    return '';
}

function getSortedGroupedChildren(children) {
    if (!children) return { categories: [], promos: [], ready: [], preOrder: [], habis: [], flatList: [] };
    
    // Sort alphabetically by name first
    const sorted = [...children].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id', { sensitivity: 'base' }));
    
    const categories = sorted.filter(c => c.type === 'category');
    const promos = sorted.filter(c => c.type === 'content' && c.isPromo);
    const ready = sorted.filter(c => c.type === 'content' && !c.isPromo && (c.status === 'Tersedia' || !c.status));
    const preOrder = sorted.filter(c => c.type === 'content' && !c.isPromo && c.status === 'Pre-order');
    const habis = sorted.filter(c => c.type === 'content' && !c.isPromo && c.status === 'Habis');
    
    return {
        categories,
        promos,
        ready,
        preOrder,
        habis,
        flatList: [...promos, ...ready, ...preOrder, ...habis, ...categories]
    };
}

function renderGroupMenuMessage(node, cfg = {}) {
    let msg = '';
    
    // Header Balasan Universal (Teks Pembuka) jika diisi
    if (cfg.universalHeader && cfg.universalHeader.trim() !== '') {
        msg += `${cfg.universalHeader.trim()}\n\n`;
    }
    
    // Header Dekoratif Kustom
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += ` 🛒 *DAFTAR PRODUK DIGITAL*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📂 \`${node.name}\` | Total Menu: ${node.children ? node.children.length : 0}\n\n`;
    
    if (node.text && node.text.trim() !== '') {
        msg += `${node.text.trim()}\n\n`;
    }
    
    if (node.type === 'category' && node.children && node.children.length > 0) {
        const showNumber = cfg.enableNumberNavigation !== false;
        const { categories, promos, ready, preOrder, habis } = getSortedGroupedChildren(node.children);
        
        let currentOverallIndex = 1;
        
        // Helper to render a group
        const renderGroup = (title, items) => {
            if (items.length === 0) return '';
            let groupMsg = `${title}\n`;
            items.forEach(child => {
                const numPrefix = showNumber ? ` ${currentOverallIndex}. ` : ' ‣ ';
                currentOverallIndex++;
                
                if (child.type === 'category') {
                    groupMsg += `${numPrefix}📁 *${child.name}*\n`;
                } else {
                    const statusText = child.status || 'Tersedia';
                    groupMsg += `${numPrefix}${child.name} ―― ${statusText}\n`;
                }
            });
            groupMsg += `\n`;
            return groupMsg;
        };
        
        msg += renderGroup(`[ 🔥 PROMO SPESIAL ]`, promos);
        msg += renderGroup(`[ 🟢 READY STOK / TERSEDIA ]`, ready);
        msg += renderGroup(`[ 🟡 PRE-ORDER / ANTRI ]`, preOrder);
        msg += renderGroup(`[ 🔴 OUT OF STOCK / HABIS ]`, habis);
        msg += renderGroup(`[ 📁 KATEGORI LAIN ]`, categories);
        
        // Navigation footer
        if (node.id !== 'root') {
            msg += `\n${showNumber ? '0. ' : '🔙 '}*Kembali ke Menu Sebelumnya*`;
            msg += `\n${showNumber ? '#. ' : '🏠 '}*Kembali ke Menu Utama*`;
        }
    }
    
    if (cfg.universalFooter && cfg.universalFooter.trim() !== '') {
        msg += `\n\n${cfg.universalFooter.trim()}`;
    }
    
    return msg;
}

function getGroupKnowledgeContext(allowedFiles, basePath) {
    if (!allowedFiles || allowedFiles.length === 0) return 'Gunakan pengetahuan umum lembaga yang ramah.';
    let context = '';
    allowedFiles.forEach(file => {
        if (file.startsWith('secret_') || file.startsWith('admin_')) return;
        const filePath = path.join(basePath || path.join(__dirname, '../../knowledge'), file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            context += `\n[BERKAS: ${file}]\n${content}\n`;
        }
    });
    return context || 'Gunakan pengetahuan umum lembaga yang ramah.';
}

module.exports = {
    normalizePhone,
    getMimeType,
    parseReminderTime,
    addHistoryLog,
    findNodeById,
    findNodeByName,
    getAllPromoNodes,
    getStatusEmoji,
    getSortedGroupedChildren,
    renderGroupMenuMessage,
    getGroupKnowledgeContext
};
