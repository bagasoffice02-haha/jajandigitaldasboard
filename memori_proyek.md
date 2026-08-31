# Memori Proyek: Jajan Digital Enterprise Dashboard & AI Gateway

## 1. Ringkasan Arsitektur & Status Terkini
- **Framework & Runtime**: Node.js, Express, SQLite (`database.sqlite`), Socket.IO, Tailwind CSS.
- **Frontend Modular**: Terbagi dalam 8 modul terpisah di `public/js/` (`core.js`, `monitor.js`, `transactions.js`, `shop.js`, `memory.js`, `groups.js`, `premium.js`, `referral.js`, `apikeys.js`).
- **Standard UI/UX**: Compact Enterprise Aesthetic (Max Card Radius 12px, Button 8px, Badge 6px), WCAG AA Contrast, Anti-AI-Slop, 100% Vector SVG/Lucide Icons, Penamaan Bahasa Indonesia.

---

## 2. Fitur & Komponen yang Telah Selesai (Completed Features)

### A. Monitoring & Chat Real-time Lintas Perangkat (Tab 1)
- Penyimpanan persisten ke database SQLite (`chat_logs` dan `system_activity_logs`).
- Sinkronisasi instan via Socket.IO (`initial_chat_logs`, `chat_analytics_init`, `chat_batch_stream`).
- Grafik Analisis Aktivitas: 
  - Grafik Batang 24 Jam (00:00 - 23:00 WIB) untuk mendeteksi jam puncak chat pelanggan.
  - Grafik Tren 7 Hari Terakhir.
  - Rasio Interaksi Chat (Total Chat, Respon AI Bot, Intervensi Admin).
- Fitur Filter Log: Semua, Chat Pelanggan Saja, Respon Bot Saja, Log Aktivitas Sistem Saja.

### B. Otomatisasi Jadwal & Perintah Bot
- Eksekusi perintah otomatis `.buka` dan `.tutup` bot.
- Penjadwalan jam operasional toko otomatis dengan pesan broadcast dan status WhatsApp.

### C. Manajemen Host Admin Toko (Tab 6)
- Penambahan tombol `+ Tambah Admin` dan `Edit Admin` untuk nomor WhatsApp admin toko.
- CRUD backend di `src/routes/shop.js` (`GET /admins`, `POST /admin`, `PUT /admin`, `DELETE /admins`).
- Sinkronisasi ke `src/db/models.js` (`updateAdmin`).

### D. Manajemen Multi-Engine AI & API Key (Tab 8)
- Pilihan Engine AI Utama: **Google Gemini**, **Groq Cloud**, **xAI Grok (Elon Musk)**, **DeepSeek AI**, **Alibaba Qwen**, **OpenRouter**, dan **LM Studio (Lokal)**.
- Ikon Logo Vektor Resmi (SVG murni) untuk setiap provider AI.
- Diagnosa kesehatan live (*Health Check*) dengan penanganan HTTP 401 dan quota limits.
- Dukungan Rotasi Key Pool otomatis untuk Gemini dan Groq.

### E. Halaman Login 3D Modern (Sesuai Referensi Visual)
- Tata letak 2 kolom responsif (*Split Screen Card*).
- Objek Utama 3D: Karakter 3D Blender/Clay dengan VR headset, kontroler interaktif, dan kartu UI melayang.
- Efek Parallax 3D interaktif mengikuti kursor mouse.
- Pemulihan password admin via kode OTP WhatsApp resmi (`POST /api/request-reset-otp` & `POST /api/verify-reset-otp`).

### F. Enterprise Confirmation Dialog Modal
- Penggantian total `window.confirm` dan `window.alert` browser dengan `#enterprise-confirm-modal`.
- Dukungan keyboard: `Escape` untuk batal/tutup, `Enter` untuk konfirmasi aksi bahaya/penting.
- Logika Logout aman: menghapus sesi server, cookie otentikasi, dan redirect ke `/login`.

---

## 3. Rencana Langkah Selanjutnya
1. Memastikan pemantauan log konsol server dan terminal stabil selama penggunaan beban tinggi.
2. Memelihara kompatibilitas update dependensi dan database backup berkala.

