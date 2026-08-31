# Panduan Instalasi & Konfigurasi MCP (Model Context Protocol)

Dokumen ini menjelaskan cara memasang dan mengaktifkan server MCP untuk Antigravity guna mendukung alur kerja Web Development & UI/UX secara penuh.

---

## 1. Lokasi Berkas Konfigurasi MCP

Antigravity membaca server MCP dari lokasi berikut:
1. **Konfigurasi Global (Berlaku untuk semua proyek di komputer Anda)**:
   - Path: `~/.gemini/config/mcp_config.json` (pada Windows: `C:\Users\<Username>\.gemini\config\mcp_config.json`).
2. **Konfigurasi Berbasis Plugin**:
   - Path: `plugins/<nama_plugin>/mcp_config.json`.

---

## 2. Langkah-Langkah Pemasangan MCP

1. Salin isi berkas [mcp_config.json.template](./mcp_config.json.template) ke berkas `mcp_config.json` global Anda di `C:\Users\<Username>\.gemini\config\mcp_config.json`.
2. Pastikan komputer Anda telah terpasang **Node.js** (v18 atau lebih baru) dan `npx` dapat diakses dari terminal.
3. Sesuaikan variabel lingkungan (*environment variables*) seperti kredensial PostgreSQL atau API Key (jika menggunakan server pencarian eksternal).
4. Buka menu Antigravity IDE: **Additional Options (...) > MCP Servers** untuk memverifikasi bahwa server telah berstatus aktif dan terhubung.

---

## 3. Server MCP Rekomendasi Utama

- **Shadcn MCP**: Menjamin komponen UI yang dibuat mengikuti standar desain terkini tanpa perlu menulis ulang styling dari nol.
- **Chrome DevTools MCP**: Mengizinkan AI memverifikasi visual tampilan di browser secara mandiri tanpa menunggu screenshot manual dari pengguna.
- **Context7 MCP**: Memastikan sintaks pustaka eksternal (misal: Next.js 15, Tailwind v4, TanStack Query v5) selalu akurat dan tidak menggunakan API lawas.
- **Postgres MCP**: Mempermudah validasi struktur tabel dan relasi foreign key langsung dari basis data lokal.
