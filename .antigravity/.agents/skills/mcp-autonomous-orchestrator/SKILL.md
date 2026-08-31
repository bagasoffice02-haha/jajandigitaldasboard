---
name: mcp-autonomous-orchestrator
description: >-
  Gunakan skill ini untuk mengorkestrasi pemanggilan tools MCP secara otomatis dan terstruktur.
  Mencakup: mencari komponen UI teruji di Shadcn/MUI, mengambil dokumentasi resmi terbaru via Context7,
  menginspeksi browser live via Chrome DevTools MCP, dan mengecek skema database via Postgres MCP.
  Aktifkan saat hendak mulai coding komponen baru, debugging error, atau membutuhkan referensi library.
---

# Panduan Integrasi & Orkestrasi MCP Autonomous

Skill ini memastikan AI **tidak pernah menebak-nebak** saat membangun antarmuka atau mengintegrasikan library — semua referensi diambil dari sumber terverifikasi melalui MCP sebelum kode pertama ditulis.

---

## Aturan Utama: MCP-First Before Code

```text
SEBELUM membuat komponen baru   → Cek Shadcn/MUI MCP dulu
SEBELUM menggunakan API library → Cek Context7 MCP dulu
SETELAH menulis kode            → Verifikasi di browser via Chrome DevTools MCP
SAAT debugging error            → Baca log konsol via Chrome DevTools MCP dulu
SAAT query database             → Cek skema lewat Postgres MCP dulu
```

---

## Matriks Keputusan MCP (Kapan Panggil Yang Mana)

| Situasi | MCP yang Dipanggil | Tool yang Digunakan | Tujuan |
| :--- | :--- | :--- | :--- |
| Butuh komponen UI (tabel, form, dialog, card) | `shadcn` atau `shadcn-space` | `searchBlocks`, `listBlocks` | Cari template blok yang sudah teruji |
| Butuh komponen Material Design | `mui` | `fetchDocs`, `generateReactCode` | Komponen MUI yang sesuai |
| Butuh API Next.js/React/Tailwind terbaru | `context7` | `resolve-library-id`, `query-docs` | Dokumentasi resmi versi terbaru |
| Ingin cek render browser | `chrome-devtools` | `take_snapshot` | Lihat DOM dan layout aktual |
| Ada error di konsol browser | `chrome-devtools` | `list_console_messages` | Baca error/warning aktual |
| Ingin klik tombol atau isi form di browser | `chrome-devtools` | `click`, `fill_form` | Interaksi otomatis untuk testing |
| Butuh info skema tabel database | `postgres` | `query` | Cek kolom, tipe data, relasi |
| Butuh riset solusi dari web | `web-search` | `search_web` | Temukan solusi issue terkini |

---

## Alur Kerja Standar per Skenario

### Skenario A: Membangun Komponen UI Baru

```text
1. EXPLORE (MCP Shadcn/Space)
   └── Cari blok yang relevan dengan searchBlocks atau listBlocks
   └── Jika ada yang cocok → adaptasi ke standar tim
   └── Jika tidak ada → lanjut ke langkah 2

2. BUILD (Tulis Kode)
   └── Gunakan standar token dari rules/02_standar_ui_ux_anti_slop.md
   └── Pakai pola komponen dari skill ui-ux-design-system-pro

3. VERIFY (MCP Chrome DevTools)
   └── Jalankan: npm run dev
   └── Panggil take_snapshot → Cek layout visual
   └── Panggil list_console_messages → Pastikan tidak ada error
   └── Jika ada error → selesaikan sebelum lanjut
```

### Skenario B: Integrasi Library Baru

```text
1. RESOLVE (MCP Context7)
   └── Panggil resolve-library-id dengan nama library
   └── Catat library-id yang didapat

2. FETCH DOCS (MCP Context7)
   └── Panggil query-docs dengan library-id dan topik spesifik
   └── Baca dokumentasi API yang relevan

3. IMPLEMENT (Tulis Kode berdasarkan docs aktual)
   └── Jangan menebak — gunakan API yang terbaca dari dokumentasi

4. VERIFY (Terminal + Browser)
   └── Cek tidak ada error TypeScript
   └── Verifikasi di browser via Chrome DevTools MCP
```

### Skenario C: Debugging Error

```text
1. READ FIRST (jangan langsung perbaiki)
   └── Panggil list_console_messages → Baca semua error aktual
   └── Identifikasi: tipe error, file, dan baris yang bermasalah

2. TRACE
   └── Buka file yang disebutkan di stack trace
   └── Cari penyebab root cause, bukan hanya symptoms

3. RESEARCH (jika error tidak familiar)
   └── Panggil MCP web-search dengan pesan error yang spesifik

4. FIX + RE-VERIFY
   └── Perbaiki kode
   └── Panggil list_console_messages lagi → Konfirmasi error hilang
   └── Catat bug dan solusinya di catatan_bug_dan_error.md
```

### Skenario D: Bekerja dengan Database

```text
1. CEK SKEMA DULU (MCP Postgres)
   └── Query: SELECT column_name, data_type FROM information_schema.columns 
              WHERE table_name = 'nama_tabel'
   └── Jangan menebak nama kolom atau tipe data

2. UJI QUERY (MCP Postgres)
   └── Jalankan query SELECT/INSERT/UPDATE di MCP sebelum diintegrasikan ke kode
   └── Pastikan query menghasilkan data yang sesuai ekspektasi

3. IMPLEMENT
   └── Gunakan nama kolom aktual yang sudah diverifikasi
   └── Tambahkan penanganan error yang spesifik sesuai kemungkinan error DB
```

---

## Protokol Pelaporan Hasil MCP

Setelah memanggil MCP dan mendapatkan hasil, AI wajib melaporkan:

```
HASIL MCP [nama-server] → [tool-yang-dipanggil]:
- Ditemukan: [apa yang ditemukan/dikonfirmasi]
- Digunakan untuk: [bagaimana hasilnya akan diaplikasikan ke kode]
- Referensi: [link atau identifier dari hasil MCP]
```

Ini memastikan pengguna tahu bahwa kode yang ditulis didasarkan pada referensi nyata, bukan tebakan.

---

## Validasi Checkpoint

- [ ] Komponen UI baru: sudah cek Shadcn/MUI dulu sebelum buat dari nol?
- [ ] Penggunaan API library: sudah cek Context7 untuk versi terbaru?
- [ ] Setelah menulis kode: sudah verifikasi di browser dengan take_snapshot?
- [ ] Ada error: sudah baca log konsol via MCP sebelum mulai perbaiki?
- [ ] Query database baru: sudah verifikasi nama kolom di Postgres MCP?
