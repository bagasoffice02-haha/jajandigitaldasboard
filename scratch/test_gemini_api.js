const { config, getGeminiKey } = require('../src/config/config');
const axios = require('axios');

async function testGemini() {
    console.log('--- DIAGNOSTIC GEMINI ---');
    console.log('Provider saat ini:', config.provider);
    console.log('Model saat ini:', config.model_name);
    
    let keys = config.gemini_api_keys || [];
    if (keys.length === 0 && config.gemini_api_key) keys = [config.gemini_api_key];
    if (keys.length === 0 && config.api_key) keys = [config.api_key];
    keys = keys.filter(k => k && k.trim().length > 0);
    
    console.log('Jumlah API Key terdeteksi:', keys.length);
    if (keys.length === 0) {
        console.error('ERROR: Tidak ada API Key Gemini terkonfigurasi!');
        return;
    }
    
    const testPrompt = "Halo, jika kamu menerima ini jawab dengan kata 'OK'";
    const model = config.model_name && config.model_name.startsWith('gemini') 
        ? config.model_name 
        : 'gemini-2.5-flash';
        
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const masked = key.substring(0, 6) + '...' + key.substring(key.length - 4);
        console.log(`Menguji Key #${i+1} (${masked})...`);
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const payload = {
            contents: [{
                role: 'user',
                parts: [{ text: testPrompt }]
            }]
        };
        
        try {
            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });
            if (response.data && response.data.candidates && response.data.candidates[0].content) {
                console.log(`✅ Key #${i+1} BERHASIL! Respon AI: "${response.data.candidates[0].content.parts[0].text.trim()}"`);
            } else {
                console.error(`❌ Key #${i+1} GAGAL: Respon API tidak lengkap.`, JSON.stringify(response.data));
            }
        } catch (err) {
            console.error(`❌ Key #${i+1} GAGAL: ${err.message}`);
            if (err.response) {
                console.error('Detail Error:', JSON.stringify(err.response.data));
            }
        }
    }
}

testGemini();
