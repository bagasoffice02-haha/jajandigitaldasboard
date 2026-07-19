const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config, getGeminiKey, rotateGeminiKey } = require('../../config/config');
const { getChatSession, saveChatSession, getLogHistory } = require('../../db/models');
const { getDb } = require('../../db/sqlite');

let currentGroqKeyIndex = 0;
let ioInstance = null;

const KNOWLEDGE_DIR = path.join(__dirname, '../../../knowledge');

function setSocketIo(io) {
    ioInstance = io;
}

const CACHE_MIN_CHAR_LENGTH = 130000;

async function getOrCreateContextCache(systemPrompt, apiKey) {
    if (!systemPrompt || systemPrompt.length < CACHE_MIN_CHAR_LENGTH) {
        return null;
    }

    const md5 = crypto.createHash('md5').update(systemPrompt).digest('hex');
    const keyHash = crypto.createHash('md5').update(apiKey).digest('hex').substring(0, 8);
    const dbKey = `gemini_cache_${keyHash}`;

    const db = getDb();
    if (db) {
        try {
            const row = await db.get("SELECT value FROM key_value_store WHERE key = ?", dbKey);
            if (row && row.value) {
                const cacheData = JSON.parse(row.value);
                if (cacheData.md5 === md5 && cacheData.expireTime) {
                    const expireDate = new Date(cacheData.expireTime);
                    if (expireDate.getTime() > Date.now() + 60000) {
                        console.log(`[Gemini Cache] Menggunakan Cache Context yang sudah ada: ${cacheData.cacheName}`);
                        return cacheData.cacheName;
                    }
                }
            }
        } catch (dbErr) {
            console.error('[Gemini Cache DB Error]:', dbErr.message);
        }
    }

    const model = config.model_name && config.model_name.startsWith('gemini') 
        ? config.model_name 
        : 'gemini-2.5-flash';
    const cleanModel = model.startsWith('models/') ? model : `models/${model}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`;
    const payload = {
        model: cleanModel,
        displayName: 'jajan_digital_context',
        ttl: '3600s',
        contents: [
            {
                role: 'user',
                parts: [{ text: systemPrompt }]
            }
        ]
    };

    try {
        console.log(`[Gemini Cache] Membuat cache baru untuk system prompt (${systemPrompt.length} karakter)...`);
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });

        if (response.data && response.data.name) {
            const cacheName = response.data.name;
            const expireTime = response.data.expireTime || new Date(Date.now() + 3600 * 1000).toISOString();
            
            const cacheData = { cacheName, md5, expireTime };
            if (db) {
                await db.run("INSERT OR REPLACE INTO key_value_store (key, value) VALUES (?, ?)", dbKey, JSON.stringify(cacheData));
            }
            console.log(`[Gemini Cache] Berhasil membuat cache baru: ${cacheName}. Expire pada: ${expireTime}`);
            return cacheName;
        }
    } catch (err) {
        let errDetail = err.message;
        if (err.response && err.response.data && err.response.data.error) {
            errDetail = err.response.data.error.message;
        }
        console.warn(`[Gemini Cache Warning] Gagal membuat context cache (${errDetail}). Bot akan otomatis menggunakan request standar.`);
    }

    return null;
}

// Call Gemini API using a specific key
async function callGemini(systemPrompt, chatHistory, isJson = false, apiKey) {
    const model = config.model_name && config.model_name.startsWith('gemini') 
        ? config.model_name 
        : 'gemini-2.5-flash';
        
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const contents = chatHistory.map(msg => {
        const role = msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';
        return {
            role: role,
            parts: [{ text: msg.content }]
        };
    });
    
    // Cek ketersediaan/pembuatan Cache Context
    const cacheName = await getOrCreateContextCache(systemPrompt, apiKey);
    
    const payload = { contents };
    
    if (cacheName) {
        payload.cachedContent = cacheName;
    } else if (systemPrompt) {
        payload.systemInstruction = {
            parts: [{ text: systemPrompt }]
        };
    }
    
    payload.generationConfig = {
        temperature: isJson ? 0.1 : 0.7,
        maxOutputTokens: config.max_tokens || 1000
    };
    
    if (isJson) {
        payload.generationConfig.responseMimeType = "application/json";
    }
    
    try {
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });
        if (response.data && response.data.candidates && response.data.candidates[0].content) {
            return response.data.candidates[0].content.parts[0].text.trim();
        } else {
            throw new Error('Respon tidak valid dari Gemini API.');
        }
    } catch (err) {
        if (err.response) {
            console.error('[Gemini API Error Response]:', JSON.stringify(err.response.data));
        }
        throw err;
    }
}

// Call Gemini with Key Pool Rotation
async function callGeminiWithPool(systemPrompt, chatHistory, isJson = false) {
    const geminiInfo = getGeminiKey();
    if (!geminiInfo) {
        throw new Error('Tidak ada API Key Gemini yang tersedia di dalam stok (pool).');
    }
    
    let keys = config.gemini_api_keys || [];
    if (keys.length === 0 && config.gemini_api_key) keys = [config.gemini_api_key];
    if (keys.length === 0 && config.api_key) keys = [config.api_key];
    keys = keys.filter(k => k && k.trim().length > 0);
    
    let lastError = null;
    
    for (let i = 0; i < keys.length; i++) {
        const activeKey = getGeminiKey();
        const maskedKey = activeKey.key.substring(0, 6) + '...' + activeKey.key.substring(activeKey.key.length - 4);
        
        try {
            console.log(`[Gemini Pool] Mencoba memanggil API menggunakan Key #${activeKey.index + 1} (${maskedKey})`);
            const result = await callGemini(systemPrompt, chatHistory, isJson, activeKey.key);
            return result;
        } catch (err) {
            console.warn(`[Gemini Pool] Key #${activeKey.index + 1} gagal digunakan: ${err.message}`);
            lastError = err;
            rotateGeminiKey();
        }
    }
    
    throw new Error(`Seluruh API Key di stok gagal digunakan. Error terakhir: ${lastError ? lastError.message : 'Unknown'}`);
}

// Call OpenAI Compatible APIs (Groq, DeepSeek, Qwen, OpenRouter, dsb)
async function callOpenAiCompatible(url, apiKey, model, systemPrompt, chatHistory, isJson = false) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    
    chatHistory.forEach(msg => {
        messages.push({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.content
        });
    });
    
    const payload = {
        model: model,
        messages: messages,
        stream: false,
        temperature: isJson ? 0.1 : 0.7,
        max_tokens: isJson ? 250 : (config.max_tokens || 1000)
    };
    
    if (isJson) {
        payload.response_format = { type: 'json_object' };
    }
    
    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${apiKey || ''}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });
        
        let content = response.data.choices[0].message.content.trim();
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        
        if (isJson) {
            content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        }
        
        return content;
    } catch (err) {
        if (err.response) {
            console.error(`[OpenAI-Compatible API Error Response from ${url}]:`, JSON.stringify(err.response.data));
        }
        throw err;
    }
}

// Call Groq with Key Pool Rotation
async function callGroqWithPool(systemPrompt, chatHistory, isJson = false) {
    let keys = config.groq_api_keys || [];
    if (keys.length === 0 && config.groq_api_key && config.groq_api_key.trim()) {
        keys = [config.groq_api_key];
    }
    keys = keys.filter(k => k && k.trim().length > 0);
    
    if (keys.length === 0) {
        throw new Error('Tidak ada API Key Groq yang tersedia di dalam stok (pool).');
    }
    
    const model = config.groq_model || 'llama-3.3-70b-versatile';
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    let lastError = null;
    
    for (let i = 0; i < keys.length; i++) {
        const index = (currentGroqKeyIndex + i) % keys.length;
        const activeKey = keys[index];
        const maskedKey = activeKey.substring(0, 6) + '...' + activeKey.substring(activeKey.length - 4);
        
        try {
            console.log(`[Groq Pool] Mencoba memanggil API menggunakan Key #${index + 1} (${maskedKey})`);
            const result = await callOpenAiCompatible(url, activeKey, model, systemPrompt, chatHistory, isJson);
            currentGroqKeyIndex = index;
            return result;
        } catch (err) {
            console.warn(`[Groq Pool] Key #${index + 1} gagal digunakan: ${err.message}`);
            lastError = err;
            currentGroqKeyIndex = (index + 1) % keys.length;
        }
    }
    
    throw new Error(`Seluruh API Key Groq di stok gagal digunakan. Error terakhir: ${lastError ? lastError.message : 'Unknown'}`);
}

// Call Local LM Studio API
async function callLMStudio(systemPrompt, chatHistory, isJson = false) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    
    chatHistory.forEach(msg => {
        messages.push({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.content
        });
    });
    
    let apiEndpoint = config.api_url;
    if (apiEndpoint && !apiEndpoint.includes('/chat/completions') && !apiEndpoint.includes('/api/chat')) {
        apiEndpoint = apiEndpoint.replace(/\/+$/, '') + '/v1/chat/completions';
    }

    try {
        const response = await axios.post(apiEndpoint || 'http://localhost:1234/v1/chat/completions', {
            model: config.model_name,
            messages: messages,
            stream: false,
            temperature: isJson ? 0.1 : 0.7,
            max_tokens: isJson ? 250 : (config.max_tokens || 1000)
        }, {
            headers: {
                'Authorization': `Bearer ${config.api_key || 'lm-studio'}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000
        });
        
        let content = response.data.choices[0].message.content.trim();
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        
        if (isJson) {
            content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        }
        
        return content;
    } catch (err) {
        if (err.response) {
            console.error('[LM Studio API Error Response]:', JSON.stringify(err.response.data));
        }
        throw err;
    }
}

// Helper to call a single AI Provider directly
async function callSingleProvider(providerName, systemPrompt, chatHistory, isJson) {
    if (providerName === 'gemini') {
        return await callGeminiWithPool(systemPrompt, chatHistory, isJson);
    } else if (providerName === 'groq') {
        return await callGroqWithPool(systemPrompt, chatHistory, isJson);
    } else if (providerName === 'deepseek') {
        const apiKey = config.deepseek_api_key;
        const model = config.deepseek_model || 'deepseek-chat';
        const url = 'https://api.deepseek.com/chat/completions';
        return await callOpenAiCompatible(url, apiKey, model, systemPrompt, chatHistory, isJson);
    } else if (providerName === 'qwen') {
        const apiKey = config.qwen_api_key;
        const model = config.qwen_model || 'qwen-plus';
        const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
        return await callOpenAiCompatible(url, apiKey, model, systemPrompt, chatHistory, isJson);
    } else if (providerName === 'openrouter') {
        const apiKey = config.openrouter_api_key;
        const model = config.openrouter_model || 'meta-llama/llama-3.3-70b-instruct';
        const url = 'https://openrouter.ai/api/v1/chat/completions';
        return await callOpenAiCompatible(url, apiKey, model, systemPrompt, chatHistory, isJson);
    } else {
        return await callLMStudio(systemPrompt, chatHistory, isJson);
    }
}

// Global Ai Provider Dispatcher with Auto Provider Failover Rotation
async function callAiProvider(systemPrompt, chatHistory, isJson = false) {
    const primaryProvider = config.provider || 'gemini';
    const allProviders = ['gemini', 'groq', 'deepseek', 'qwen', 'openrouter', 'lokal'];
    
    // Shift primaryProvider to the front of execution queue
    const executionOrder = [primaryProvider];
    allProviders.forEach(p => {
        if (p !== primaryProvider) executionOrder.push(p);
    });
    
    let lastError = null;
    
    for (const provider of executionOrder) {
        // Skip check if no key/URL is configured for this backup provider to avoid useless network attempts
        if (provider === 'gemini') {
            let keys = config.gemini_api_keys || [];
            if (keys.length === 0 && config.gemini_api_key) keys = [config.gemini_api_key];
            if (keys.length === 0 && config.api_key) keys = [config.api_key];
            keys = keys.filter(k => k && k.trim().length > 0);
            if (keys.length === 0) continue;
        } else if (provider === 'groq') {
            let keys = config.groq_api_keys || [];
            if (keys.length === 0 && config.groq_api_key) keys = [config.groq_api_key];
            keys = keys.filter(k => k && k.trim().length > 0);
            if (keys.length === 0) continue;
        } else if (provider === 'deepseek') {
            if (!config.deepseek_api_key || !config.deepseek_api_key.trim()) continue;
        } else if (provider === 'qwen') {
            if (!config.qwen_api_key || !config.qwen_api_key.trim()) continue;
        } else if (provider === 'openrouter') {
            if (!config.openrouter_api_key || !config.openrouter_api_key.trim()) continue;
        } else if (provider === 'lokal') {
            if (!config.api_url) continue;
        }
        
        try {
            if (provider !== primaryProvider) {
                console.log(`[AI Failover] Provider utama (${primaryProvider.toUpperCase()}) gagal/tidak merespon. Mengalihkan ke provider cadangan: ${provider.toUpperCase()}`);
            }
            const result = await callSingleProvider(provider, systemPrompt, chatHistory, isJson);
            return result;
        } catch (err) {
            console.warn(`[AI Failover] Provider ${provider.toUpperCase()} gagal digunakan: ${err.message}`);
            lastError = err;
        }
    }
    
    throw new Error(`Seluruh provider AI (utama & cadangan) gagal digunakan. Error terakhir: ${lastError ? lastError.message : 'Unknown'}`);
}

// AI Extraction helper for Receipt OCR
async function extractReceiptDetails(ocrText) {
    const systemPrompt = `Kamu adalah AI pembuat keputusan ekstraksi data keuangan.
Tugasmu adalah menganalisis teks hasil pembacaan OCR dari sebuah foto kuitansi atau nota belanja, lalu mengekstrak informasi keuangan berupa TOTAL NOMINAL pembelanjaan (dalam rupiah) dan DESKRIPSI SINGKAT tujuan pengeluaran tersebut.

Keluaran Anda HARUS berupa format JSON bersih seperti contoh berikut:
{
  "nominal": 150000,
  "keterangan": "Beli bensin di Pertamina"
}

[ATURAN PENTING]
- nominal: Harus berupa angka bulat (integer) saja, tanpa tanda titik, koma, atau Rp.
- keterangan: Deskripsi singkat max 5 kata (misal: "Beli bensin", "Makan siang", "Belanja ATK").
- Jika tidak menemukan total nominal yang jelas, tebak angka terbesar yang masuk akal sebagai total pengeluaran.`;

    try {
        const content = await callAiProvider(systemPrompt, [{ role: 'user', content: `TEKS OCR KUITANSI:\n${ocrText}` }], true);
        const data = JSON.parse(content);
        return {
            nominal: parseInt(data.nominal, 10) || 0,
            keterangan: data.keterangan || 'Pengeluaran Kuitansi'
        };
    } catch (e) {
        console.error('Gagal mengekstrak struk belanja:', e.message);
        return {
            nominal: 0,
            keterangan: 'Gagal mengekstrak struk belanja'
        };
    }
}

function getAllKnowledgeContext() {
    if (!fs.existsSync(KNOWLEDGE_DIR)) {
        return 'Tidak ada dokumen referensi lembaga yang tersedia.';
    }

    const files = fs.readdirSync(KNOWLEDGE_DIR);
    let allContent = '';

    for (const file of files) {
        if (file.endsWith('.txt') || file.endsWith('.md')) {
            const filePath = path.join(KNOWLEDGE_DIR, file);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            allContent += `\n[BERKAS: ${file}]\n${fileContent}\n`;
        }
    }

    return allContent || 'Gunakan pengetahuan umum lembaga yang ramah.';
}

function getCurrentTimeString() {
    const now = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    const dayName = days[now.getDay()];
    const day = now.getDate();
    const monthName = months[now.getMonth()];
    const year = now.getFullYear();
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${dayName}, ${day} ${monthName} ${year} pukul ${hours}:${minutes}:${seconds} WIB`;
}

// Generate Unified AI response
async function generateUnifiedAiResponse(userMessage, chatId) {
    const memoryPath = path.join(KNOWLEDGE_DIR, '00_memori_otomatis.txt');
    let memoryContent = '';
    if (fs.existsSync(memoryPath)) {
        memoryContent = fs.readFileSync(memoryPath, 'utf-8');
    }
    const knowledgeContext = getAllKnowledgeContext();
    
    let groupContext = '';
    try {
        const { getGroupConfigs } = require('../../db/models');
        const { group_configs: gConfigs } = await getGroupConfigs();
        
        let configGroupId = config.private_chat_sync_group_id;
        if (!configGroupId) {
            configGroupId = Object.keys(gConfigs || {}).find(id => {
                const mTree = gConfigs[id].menuTree;
                return mTree && mTree.children && mTree.children.length > 0;
            }) || Object.keys(gConfigs || {})[0];
        }
        
        const activeCfg = configGroupId ? gConfigs[configGroupId] : null;
        if (activeCfg) {
            const serializeMenuTree = (node, depth = 0) => {
                if (!node) return '';
                const typeLabel = node.type === 'category' ? 'Kategori' : 'Produk';
                const statusLabel = node.status ? ` [Status: ${node.status}]` : '';
                const promoLabel = node.isPromo ? ' [🔥 PROMO]' : '';
                
                let res = '  '.repeat(depth) + `- ${node.name} (${typeLabel})${statusLabel}${promoLabel}`;
                if (node.text) {
                    res += `: ${node.text.replace(/\n/g, ' ')}`;
                }
                res += '\n';
                
                if (node.children && node.children.length > 0) {
                    node.children.forEach(child => {
                        res += serializeMenuTree(child, depth + 1);
                    });
                }
                return res;
            };
            const serializedMenu = serializeMenuTree(activeCfg.menuTree) || 'Belum ada menu produk terkonfigurasi.';
            
            const schedule = activeCfg.autoCloseSchedule || { enabled: false };
            let scheduleText = 'Toko buka 24 jam.';
            if (schedule.enabled) {
                const daysMap = { 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu', 0: 'Minggu', 7: 'Minggu' };
                const activeDaysStr = schedule.activeDays ? schedule.activeDays.map(d => daysMap[d]).join(', ') : 'Setiap Hari';
                scheduleText = `Toko buka & beroperasi pada hari: ${activeDaysStr} mulai jam ${schedule.openTime || '08:00'} sampai ${schedule.closeTime || '22:00'} WIB. Di luar jam operasional tersebut sistem toko tutup/offline otomatis.`;
            }
            
            groupContext = `
[DATA GRUP RUJUKAN & OPERASIONAL AKTIF]
- Nama Grup Rujukan: ${activeCfg.groupName}
- ID Grup Rujukan: ${configGroupId}
- Jadwal Operasional Toko: ${scheduleText}

[DAFTAR MENU & KATALOG PRODUK AKTIF]
${serializedMenu}
`.trim();
        }
    } catch (err) {
        console.error('Gagal memproses groupContext untuk Unified AI:', err.message);
    }

    const timeString = getCurrentTimeString();
    const currentTimeContext = `[INFORMASI WAKTU SEKARANG]\n- Hari, Tanggal & Jam saat ini: ${timeString}\n- Zona Waktu: UTC+7 (WIB)\n\n`;
    const combinedContext = `${currentTimeContext}[DATA GRUP & KATALOG PRODUK]\n${groupContext}\n\n[MEMORI PRIBADI BOS]\n${memoryContent}\n\n[DOKUMEN PENDUKUNG]\n${knowledgeContext}`.trim();
    
    const systemPromptTemplate = config.system_prompt_template || 'Kamu adalah asisten virtual bernama Sania. Berikut info pendukung:\n{KNOWLEDGE_BASE_CONTENT}';
    let systemPrompt = systemPromptTemplate.replace('{KNOWLEDGE_BASE_CONTENT}', combinedContext);
    
    systemPrompt += `\n\n[INSTRUKSI KLASIFIKASI & FORMAT OUTPUT JSON UTAMA (WAJIB DIPATUHI)]
Tugas utama Anda saat ini adalah menganalisis pesan terbaru dari Bos dan mendeteksi tujuannya (intent):
1. finance: Mencatat pemasukan atau pengeluaran uang (misalnya: belanja, gaji, bayar tagihan, dll).
2. reminder: Permintaan dari Bos untuk diingatkan tentang sesuatu pada waktu tertentu (misalnya: "ingatkan saya nanti jam 15:30 untuk jemput anak", "tolong ingatkan besok jam 9 buat laporan").
3. agenda: Mencatat agenda, jadwal, janji, rapat, atau tugas (todos) ke spreadsheet tanpa memerlukan pengingat waktu real-time.
4. chat: Obrolan umum, pertanyaan, diskusi, basa-basi, atau permintaan lainnya.

Keluaran Anda HARUS selalu berupa format JSON bersih sesuai dengan salah satu struktur di bawah ini (JANGAN mengeluarkan teks lain di luar JSON):

Jika intent adalah "finance":
{
  "intent": "finance",
  "data": {
    "type": "Pemasukan" | "Pengeluaran",
    "nominal": <angka nominal uang bulat, integer saja>,
    "keterangan": "<deskripsi singkat tujuan transaksi, max 5 kata>"
  }
}

Jika intent adalah "reminder":
{
  "intent": "reminder",
  "data": {
    "waktu": "<keterangan waktu pengingat dalam bahasa Indonesia, misal: besok 09:00 atau nanti 15:30 atau 18/06 jam 10:00>",
    "pesan": "<pesan yang ingin diingatkan kepada Bos, max 10 kata>"
  }
}

If intent adalah "agenda":
{
  "intent": "agenda",
  "data": {
    "waktu": "<waktu/tanggal acara yang dimaksud, gunakan informasi waktu saat ini sebagai acuan>",
    "acara": "<nama acara/kegiatan/tugas, max 5 kata>"
  }
}

Jika intent adalah "chat":
{
  "intent": "chat",
  "reply": "<balasan obrolan Anda yang ramah, sopan, membantu, dan sigap. JANGAN PERNAH menyertakan tabel/ringkasan total keuangan (seperti Total Pemasukan, Total Pengeluaran, Saldo Kas/Sisa Uang) pada bagian reply ini. Cukup jawab pertanyaan Bos secara singkat dan langsung.>"
}

[PANDUAN NOMINAL]
Kenali singkatan nominal uang:
- rb / rebu / k = ribuan (contoh: 50rb / 50k -> 50000)
- jt / juta = jutaan (contoh: 1.5jt -> 1500000)

[PANDUAN PERHITUNGAN TOTAL & NOMINAL]
- JANGAN PERNAH menyertakan ringkasan total keuangan (Total Pemasukan, Total Pengeluaran, Saldo Kas) pada balasan obrolan Anda. Ringkasan saldo dan kas sudah ditangani secara otomatis oleh sistem lokal.
- Jika Bos bertanya tentang transaksi tertentu (misalnya "berapa habis bensin hari ini"), hitunglah hanya berdasarkan daftar [10 Transaksi Keuangan Terakhir] yang tertulis di atas, lalu jawab dengan bahasa alami yang singkat (misal: "Bos menghabiskan Rp 27.000 untuk bensin hari ini berdasarkan transaksi terbaru"). JANGAN melakukan operasi matematika atau penambahan pada angka saldo total.
- Abaikan angka total saldo/pengeluaran/pemasukan yang ada di riwayat percakapan sebelumnya jika nilainya berbeda dengan data real-time saat ini. Data real-time saat ini di atas adalah kebenaran mutlak.

[PANDUAN KEPRIBADIAN & BAHASA]
JANGAN menuliskan proses berpikir (thinking/reasoning process) atau menggunakan tag <think>. Jawab secara langsung dalam format JSON di atas.`;

    if (memoryContent.trim()) {
        const constitutionHeader = `[UNDANG-UNDANG TERTINGGI AI / KONSTITUSI BOT (MUTLAK & OVERRIDE ALL RULES)]\n` +
                                   `Aturan berikut ditulis langsung oleh Bos Anda dan bersifat MUTLAK. ` +
                                   `Jika ada pertentangan antara panduan kepribadian default asisten di bawah dengan Undang-Undang di bawah ini, Anda WAJIB MENGABAIKAN panduan default dan sepenuhnya mematuhi Undang-Undang Tertinggi berikut:\n` +
                                   `${memoryContent.trim()}\n\n========================================\n\n`;
        
        systemPrompt = constitutionHeader + systemPrompt;
        systemPrompt += `\n\n[PENEGASAN KONSTITUSI]\nPENTING: Sebagai asisten yang setia dan patuh, Anda harus menerapkan dan mematuhi seluruh aturan dalam [UNDANG-UNDANG TERTINGGI AI] di atas tanpa pengecualian dalam setiap balasan Anda ke Bos!`;
    }
    
    const history = await getChatSession(chatId);
    const chatHistory = [];
    const recentHistory = history.slice(-8);
    recentHistory.forEach(msg => {
        chatHistory.push({
            role: msg.role,
            content: msg.content
        });
    });
    
    chatHistory.push({ role: 'user', content: userMessage });
    
    const content = await callAiProvider(systemPrompt, chatHistory, true);
    
    let result;
    try {
        result = JSON.parse(content);
    } catch (e) {
        console.warn('Gagal mem-parsing JSON respon terpadu AI, mencoba memulihkan JSON:', e.message);
        
        let parsed = null;
        try {
            let fixedContent = content.trim();
            if (!fixedContent.endsWith('}')) {
                if (fixedContent.endsWith('"')) {
                    fixedContent += '}';
                } else {
                    fixedContent += '"}';
                }
            }
            parsed = JSON.parse(fixedContent);
        } catch (innerErr) {}

        if (parsed && parsed.reply) {
            result = parsed;
        } else {
            const replyMatch = content.match(/"reply"\s*:\s*"([\s\S]*?)"/i) || 
                               content.match(/"reply"\s*:\s*"([\s\S]*?)$/i);
            
            if (replyMatch && replyMatch[1]) {
                let cleanReply = replyMatch[1].trim();
                if (cleanReply.endsWith('"')) {
                    cleanReply = cleanReply.substring(0, cleanReply.length - 1);
                }
                result = {
                    intent: 'chat',
                    reply: cleanReply
                };
            } else {
                let cleanText = content.replace(/\{[\s\S]*?"reply"\s*:\s*"/i, '')
                                      .replace(/"\s*,\s*"intent"[\s\S]*/gi, '')
                                      .replace(/"\s*\}\s*$/g, '')
                                      .trim();
                result = {
                    intent: 'chat',
                    reply: cleanText || content
                };
            }
        }
    }
    
    if (result.intent === 'chat' && result.reply) {
        history.push({ role: 'user', content: userMessage });
        history.push({ role: 'assistant', content: result.reply });
        
        const finalHistory = history.slice(-10);
        await saveChatSession(chatId, finalHistory);
    }
    
    return result;
}

// Generate chat response for group
async function generateGroupAiResponse(userMessage, systemPrompt, chatId) {
    const history = await getChatSession(chatId);
    const chatHistory = [];
    const recentHistory = history.slice(-8);
    recentHistory.forEach(msg => {
        chatHistory.push({
            role: msg.role,
            content: msg.content
        });
    });
    
    chatHistory.push({ role: 'user', content: userMessage });
    
    const content = await callAiProvider(systemPrompt, chatHistory, false);
    
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: content });
    
    const finalHistory = history.slice(-10);
    await saveChatSession(chatId, finalHistory);
    
    return { reply: content };
}

function appendToMemory(text) {
    const memoryPath = path.join(KNOWLEDGE_DIR, '00_memori_otomatis.txt');
    let content = '';
    if (fs.existsSync(memoryPath)) {
        content = fs.readFileSync(memoryPath, 'utf-8');
    }
    content = content.trim();
    if (content) {
        content += `\n- ${text}`;
    } else {
        content = `- ${text}`;
    }
    fs.writeFileSync(memoryPath, content, 'utf-8');
    
    if (ioInstance) {
        ioInstance.emit('memory_updated', { content });
    }
}

module.exports = {
    callAiProvider,
    extractReceiptDetails,
    generateUnifiedAiResponse,
    generateGroupAiResponse,
    appendToMemory,
    setSocketIo,
    getCurrentTimeString
};
