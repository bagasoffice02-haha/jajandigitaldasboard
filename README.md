# 🤖 WA Bot CS — Asisten Manager Pribadi

Dashboard WhatsApp Bot berbasis AI lokal untuk membantu Bos mengelola **keuangan bisnis**, **agenda kerja**, dan **pengingat otomatis** — langsung dari WhatsApp.

---

## 📋 Daftar Isi

1. [Fitur Unggulan](#-fitur-unggulan)
2. [Kebutuhan Sistem](#-kebutuhan-sistem)
3. [Instalasi](#-instalasi)
4. [Konfigurasi AI Provider](#-konfigurasi-ai-provider)
5. [Konfigurasi Google Sheets](#-konfigurasi-google-sheets)
6. [Menjalankan Bot](#-menjalankan-bot)
7. [Panduan Penggunaan (Perintah WhatsApp)](#-panduan-penggunaan-perintah-whatsapp)
8. [Fitur Dashboard Web](#-fitur-dashboard-web)
9. [Struktur File](#-struktur-file)
10. [Troubleshooting](#-troubleshooting)

---

## ✨ Fitur Unggulan

| Fitur | Keterangan |
|-------|-----------|
| 💬 **AI Chatbot** | Asisten cerdas yang menjawab pertanyaan dalam Bahasa Indonesia |
| 💰 **Pencatatan Keuangan** | Catat kas masuk/keluar otomatis ke Google Sheets via obrolan |
| 📅 **Manajemen Agenda** | Jadwalkan kegiatan dan tampilkan daftar agenda aktif |
| ⏰ **Pengingat Otomatis** | Set pengingat via bahasa alami atau perintah manual |
| 📊 **Laporan Harian** | Rekap keuangan + agenda dikirim otomatis ke WhatsApp Bos |
| 🖼️ **Baca Gambar (OCR)** | Bot bisa membaca teks dari foto/struk yang dikirim |
| 📄 **Baca PDF** | Bot bisa membaca isi dokumen PDF yang dikirim |
| 🧠 **Basis Pengetahuan** | Upload file `.txt` sebagai referensi tambahan bagi AI |
| 🔒 **Akses Tunggal** | Opsional: bot hanya merespons nomor Bos tertentu |
| 🎨 **4 Tema Dashboard** | Light, Dark, Minimal Dark, Minimal Light |
| 📱 **Responsif Mobile** | Dashboard nyaman diakses dari HP maupun laptop |

---

## 🖥️ Kebutuhan Sistem

- **Node.js** v18 atau lebih baru → [Download](https://nodejs.org)
- **npm** (sudah termasuk dalam Node.js)
- **Google Chrome / Chromium** (digunakan oleh whatsapp-web.js)
- Koneksi internet aktif (untuk WhatsApp & API AI)
- Salah satu **AI Provider** berikut:
  - Google Gemini API Key *(Rekomendasi — gratis & cepat)*
  - Groq API Key
  - DeepSeek API Key
  - Alibaba Qwen (DashScope) API Key
  - OpenRouter API Key
  - LM Studio lokal (tanpa internet)

---

## 🚀 Instalasi

### Langkah 1 — Clone Repository

```bash
git clone https://github.com/Bagas10k/wa_gateway.git
cd wa_gateway
```

### Langkah 2 — Install Dependensi

```bash
npm install
```

> ⏳ Proses ini membutuhkan waktu beberapa menit karena mengunduh `whatsapp-web.js` dan `tesseract.js`.

### Langkah 3 — Buat File Konfigurasi

Salin file contoh dan edit sesuai kebutuhan:

```bash
# Windows
copy config.example.json config.json

# Mac / Linux
cp config.example.json config.json
```

Kemudian buka `config.json` dengan teks editor dan isi konfigurasi (lihat bagian [Konfigurasi AI Provider](#-konfigurasi-ai-provider) di bawah).

### Langkah 4 — Jalankan Bot

```bash
npm start
```

### Langkah 5 — Sambungkan WhatsApp

1. Buka browser, akses: **`http://localhost:3000`**
2. Klik tab **Chats** → akan muncul QR Code
3. Buka **WhatsApp** di HP → **Perangkat Tertaut** → **Tautkan Perangkat**
4. Scan QR Code yang tampil di dashboard
5. Tunggu hingga status berubah menjadi ✅ **Terhubung (Aktif)**

---

## 🤖 Konfigurasi AI Provider

Buka file `config.json` dan sesuaikan bagian berikut:

### Option A — Google Gemini *(Rekomendasi)*

Dapatkan API Key gratis di: [aistudio.google.com](https://aistudio.google.com/app/apikey)

```json
{
  "provider": "gemini",
  "gemini_api_keys": [
    "AIzaSy...",
    "AIzaSy..."
  ],
  "model_name": "gemini-2.5-flash"
}
```

> 💡 Bisa isi lebih dari satu API Key. Bot akan rotasi otomatis jika ada key yang kena limit.

---

### Option B — Groq API *(Gratis, Ultra Cepat)*

Dapatkan API Key di: [console.groq.com](https://console.groq.com)

```json
{
  "provider": "groq",
  "groq_api_key": "gsk_...",
  "groq_model": "llama-3.3-70b-versatile"
}
```

---

### Option C — DeepSeek API

```json
{
  "provider": "deepseek",
  "deepseek_api_key": "sk-...",
  "deepseek_model": "deepseek-chat"
}
```

---

### Option D — Alibaba Qwen (DashScope)

```json
{
  "provider": "qwen",
  "qwen_api_key": "sk-...",
  "qwen_model": "qwen-plus"
}
```

---

### Option E — OpenRouter *(Akses Ratusan Model)*

Dapatkan API Key di: [openrouter.ai](https://openrouter.ai/keys)

```json
{
  "provider": "openrouter",
  "openrouter_api_key": "sk-or-...",
  "openrouter_model": "meta-llama/llama-3.3-70b-instruct"
}
```

---

### Option F — LM Studio (100% Lokal, Tanpa Internet)

1. Download dan jalankan [LM Studio](https://lmstudio.ai)
2. Load model pilihan Anda (contoh: Qwen 3.5, Llama 3)
3. Klik **Start Server** di LM Studio

```json
{
  "provider": "local",
  "api_url": "http://localhost:1234/v1/chat/completions",
  "model_name": "nama-model-di-lmstudio"
}
```

---

### Pengaturan Tambahan

```json
{
  "max_tokens": 1500,
  "boss_number": "628123456789",
  "report_time": "08:00"
}
```

| Parameter | Keterangan |
|-----------|-----------|
| `max_tokens` | Batas panjang jawaban AI (100–4000) |
| `boss_number` | Nomor WA Bos (format internasional, tanpa `+`). Isi jika ingin bot hanya merespons nomor ini. Kosongkan `""` untuk respons semua orang. |
| `report_time` | Waktu kirim laporan harian otomatis (format `HH:MM`, zona waktu WIB) |

---

## 📊 Konfigurasi Google Sheets

Fitur ini memungkinkan bot mencatat keuangan dan agenda ke Google Spreadsheet Anda secara otomatis.

### Langkah 1 — Buat Google Spreadsheet

Buat spreadsheet baru di [sheets.google.com](https://sheets.google.com) dengan 2 sheet:
- Sheet **`Keuangan`** — kolom: `Tanggal`, `Tipe`, `Nominal`, `Keterangan`
- Sheet **`Agenda`** — kolom: `Tanggal`, `Kegiatan`, `Status`

### Langkah 2 — Deploy Google Apps Script

1. Di Spreadsheet, klik **Ekstensi → Apps Script**
2. Hapus kode yang ada, paste script yang disediakan (hubungi pengembang untuk script lengkap)
3. Klik **Deploy → New Deployment → Web App**
4. Atur akses: **Anyone** → klik **Deploy**
5. Salin URL deployment yang diberikan

### Langkah 3 — Masukkan URL ke Konfigurasi

```json
{
  "google_sheets_url": "https://script.google.com/macros/s/AKfyc.../exec"
}
```

---

## ▶️ Menjalankan Bot

```bash
npm start
```

Bot berjalan di: **`http://localhost:3000`**

> 💡 Untuk menjalankan di background (agar tidak mati ketika terminal ditutup), gunakan **PM2**:
> ```bash
> npm install -g pm2
> pm2 start index.js --name wa-bot
> pm2 save
> pm2 startup
> ```

---

## 📱 Panduan Penggunaan (Perintah WhatsApp)

Kirim perintah berikut langsung ke nomor WhatsApp bot dari nomor Bos:

### 🧠 Perintah Memori & Identitas

| Perintah | Fungsi | Contoh |
|----------|--------|--------|
| `#akubosmu [info]` | Simpan informasi penting ke memori AI | `#akubosmu Nama toko saya adalah Toko Sania` |

> Informasi yang disimpan akan diingat AI selamanya sebagai "undang-undang" prioritas tertinggi.

---

### ⏰ Perintah Pengingat

| Perintah | Fungsi | Contoh |
|----------|--------|--------|
| `#ingatkan [waktu] \| [pesan]` | Set pengingat manual | `#ingatkan jam 15:30 \| Telepon supplier` |

**Format waktu yang didukung:**

| Input | Arti |
|-------|------|
| `jam 14:00` | Hari ini pukul 14.00 |
| `15:30` | Hari ini pukul 15.30 |
| `besok jam 09:00` | Besok pukul 09.00 |
| `lusa jam 10:00` | Lusa pukul 10.00 |
| `20/06 jam 14:00` | Tanggal 20 Juni |
| `1 jam lagi` | 1 jam dari sekarang |
| `30 menit lagi` | 30 menit dari sekarang |

**Atau gunakan bahasa alami (AI akan mendeteksi otomatis):**
> *"tolong ingatkan saya besok jam 8 pagi untuk bayar gaji karyawan"*

---

### 📅 Perintah Agenda

| Perintah | Fungsi |
|----------|--------|
| `#agenda` | Tampilkan daftar agenda aktif |

**Atau via bahasa alami:**
> *"tambahkan agenda: meeting dengan klien besok jam 10"*
> *"apa saja agenda saya minggu ini?"*

---

### 📊 Perintah Laporan

| Perintah | Fungsi |
|----------|--------|
| `#jadwallaporan HH:MM` | Ubah jadwal laporan harian | 

**Contoh:** `#jadwallaporan 07:30` → laporan dikirim tiap hari pukul 07.30 WIB

**Atau minta laporan sekarang via AI:**
> *"kasih saya ringkasan keuangan hari ini"*

---

### 💰 Pencatatan Keuangan via Bahasa Alami

Tidak perlu format khusus. Cukup ceritakan ke bot:

> *"+50k jajan siang"* → Bot catat: **Pemasukan Rp 50.000 — jajan siang**
> *"-150k beli bensin"* → Bot catat: **Pengeluaran Rp 150.000 — beli bensin**
> *"bayar listrik 300rb"* → Bot catat: **Pengeluaran Rp 300.000 — bayar listrik**

---

### 🖼️ Kirim Gambar / PDF

Langsung kirim foto atau file PDF ke bot — bot akan membaca isinya secara otomatis menggunakan OCR (untuk gambar) atau parser (untuk PDF).

> Contoh: Kirim foto struk belanja → bot akan membaca nominal dan keterangannya.

---

## 🖥️ Fitur Dashboard Web

Akses dashboard di **`http://localhost:3000`**

### Tab Chats
- 📡 Monitor status koneksi WhatsApp (Terhubung / QR / Terputus)
- 💬 Live monitor semua percakapan masuk & keluar secara real-time
- 📋 Riwayat pencatatan keuangan terakhir
- 📅 Riwayat agenda terakhir

### Tab Memory
- 📜 **Undang-Undang AI** — Edit dan simpan aturan prioritas bot
- 📂 **Basis Pengetahuan** — Upload file `.txt` sebagai referensi AI
- 📎 **Aset Media** — Upload file `.pdf` / `.png` yang bisa dikirim bot ke Bos

### Tab Settings
- ⚙️ Ganti AI Provider & model tanpa restart server
- 🔑 Kelola API Key
- 📊 Atur URL Google Sheets
- 🔐 Atur nomor Bos (akses tunggal)
- ⏰ Atur waktu laporan harian
- 🤖 Edit kepribadian dan template prompt bot
- 🎨 Ganti tema dashboard (Light / Dark / Minimal Dark / Minimal Light)

---

## 📁 Struktur File

```
wa_gateway/
├── index.js              # Server utama & logika bot
├── config.json           # Konfigurasi aktif (tidak di-commit ke git)
├── config.example.json   # Template konfigurasi
├── package.json          # Daftar dependensi
├── reminders.json        # Database pengingat aktif (auto-generated)
├── knowledge/            # Folder file basis pengetahuan (.txt)
├── media/                # Folder aset media (.pdf, .png)
├── public/
│   ├── index.html        # Halaman dashboard
│   ├── style.css         # Styling dashboard
│   └── client.js         # Logika frontend (Socket.io)
└── session/              # Sesi WhatsApp tersimpan (auto-generated)
```

---

## 🔧 Troubleshooting

### ❌ Bot tidak merespons pesan

1. Pastikan QR sudah discan dan status **Terhubung (Aktif)**
2. Cek apakah `boss_number` di `config.json` sudah benar (atau kosongkan `""` untuk tes)
3. Lihat log di terminal — cari pesan error

---

### ❌ QR Code tidak muncul

1. Pastikan `npm start` berjalan tanpa error di terminal
2. Coba klik tombol **Refresh QR** di dashboard
3. Jika masih gagal, klik **Reset Sesi** lalu scan ulang

---

### ❌ Error: Cannot find module '...'

```bash
npm install
```

---

### ❌ API AI tidak merespons / timeout

1. Periksa API Key di `config.json` — pastikan valid dan belum expired
2. Cek kuota API Key Anda di dashboard masing-masing provider
3. Coba ganti ke provider lain lewat dashboard **Settings**

---

### ❌ Google Sheets tidak menyimpan data

1. Pastikan URL di `google_sheets_url` sudah benar
2. Pastikan Apps Script sudah di-deploy dengan akses **Anyone**
3. Cek apakah nama sheet di Spreadsheet sesuai (`Keuangan` dan `Agenda`)

---

### ❌ Bot crash / server mati sendiri

Gunakan **PM2** agar server otomatis restart jika terjadi error:

```bash
npm install -g pm2
pm2 start index.js --name wa-bot --watch
```

---

## 📞 Bantuan

Jika ada kendala, silakan buka **Issue** di repository GitHub:
[github.com/Bagas10k/wa_gateway/issues](https://github.com/Bagas10k/wa_gateway/issues)

---

> Dibuat dengan ❤️ — WA Bot CS v1.0.0
