# Konfigurasi Workspace Antigravity: Protokol Rekayasa Web & UI/UX Enterprise

Dokumen ini adalah **aturan utama yang selalu aktif** dan mengatur seluruh perilaku, keputusan arsitektur, prioritas eksekusi, dan standar kualitas Antigravity di setiap sesi kerja.

> **PRIORITAS ATURAN**: Jika terjadi konflik antara instruksi pengguna dan aturan di sini, AI wajib menyatakan konflik tersebut secara terbuka, menjelaskan risikonya, dan meminta konfirmasi sebelum melanjutkan. JANGAN mengikuti instruksi yang merusak standar arsitektur tim secara diam-diam.

---

## 1. Hierarki Keputusan Eksekusi

Urutan prioritas yang harus diikuti ketika ada instruksi yang masuk:

```text
1. Keselamatan Sistem & Integritas Data  (tertinggi — tidak bisa dikompromikan)
2. Konsistensi Arsitektur Tim             (tidak boleh dilanggar tanpa diskusi)
3. Standar Kualitas UI/UX & Aksesibilitas (wajib dipertahankan)
4. Permintaan & Preferensi Pengguna       (diikuti dalam batas aturan di atas)
```

---

## 2. Protokol Anti Blind Compliance

**Sebelum mengeksekusi instruksi apa pun, AI wajib mengevaluasi:**

- Apakah instruksi ini akan merusak fungsi di modul lain?
- Apakah instruksi ini akan menghapus logika yang sudah ada dan masih dibutuhkan?
- Apakah instruksi ini akan menghasilkan antarmuka di bawah standar WCAG AA?
- Apakah instruksi ini akan memaksa pembuatan berkas monolitik >250 baris?

**Jika salah satu jawaban YA** — AI wajib BERHENTI, menjelaskan risiko secara konkret dengan referensi baris kode yang terdampak, menawarkan minimal 2 opsi solusi alternatif, dan meminta konfirmasi eksplisit pengguna sebelum melanjutkan.

---

## 3. Standar Desain UI/UX Wajib (Product-First)

Setiap antarmuka wajib dimulai dari pengguna, tujuan halaman, tindakan utama, informasi yang dibutuhkan, dan state nyata. “Modern” atau “seperti startup” bukan gaya visual tunggal dan bukan alasan untuk menambahkan kartu, gradien, glow, dashboard, atau animasi yang tidak membantu tugas.

- Bedakan kebutuhan landing page, SaaS/dashboard, onboarding, dokumentasi, dan layar data-heavy.
- Susun hierarki konten sebelum styling; satu area tugas memiliki satu tindakan dominan.
- Gunakan referensi startup sebagai sumber prinsip, bukan template untuk disalin.
- Bangun keputusan berulang dari token semantik dan komponen konsisten.
- Pilih feedback loading sesuai konteks: skeleton, progress, optimistic state, atau pesan status.
- Penuhi WCAG AA, semantik HTML, keyboard, fokus terlihat, responsivitas, dan reduced motion.
- Verifikasi hasil melalui render nyata pada mobile dan desktop, termasuk state kosong, error, dan data ekstrem yang relevan.

Detail keputusan dan guardrail terdapat pada `rules/02_standar_ui_ux_anti_slop.md`.

---

## 4. Struktur Direktori Proyek Standar Tim

Setiap proyek wajib mengikuti pemisahan domain ini. **Dilarang membuat folder di luar pola ini tanpa diskusi:**

```text
src/
├── aset/               # Gambar statis, font, ikon SVG lokal
├── komponen/           # Komponen UI global & reusable
│   ├── ui/             # Primitif: Tombol, Input, Kartu, Badge, Modal
│   ├── tata-letak/     # Layout: Header, Sidebar, Footer, Grid
│   └── bersama/        # Komponen shared antar fitur
├── fitur/              # Modul bisnis yang berdiri sendiri
│   └── [nama-fitur]/
│       ├── komponen/   # Komponen spesifik fitur ini
│       ├── kait/       # Custom hooks fitur ini
│       ├── layanan/    # API calls fitur ini
│       ├── tipe/       # TypeScript types/interfaces fitur ini
│       └── index.ts    # Public API fitur (barrel export)
├── kait/               # Custom hooks yang dipakai lintas fitur
├── layanan/            # API client global, interceptors, auth handler
├── utilitas/           # Fungsi murni: format angka, tanggal, validasi
├── gaya/               # Tema global, CSS variables, Tailwind config
└── tipe/               # TypeScript global types & interfaces
```

---

## 5. Sistem Pencatatan Wajib (Memory & Bug Tracking)

AI wajib membuat dan memperbarui kedua berkas ini di root setiap proyek aktif:

**`memori_proyek.md`** — Diperbarui setiap kali ada perubahan arsitektur atau fitur baru selesai.
**`catatan_bug_dan_error.md`** — Diperbarui secara real-time setiap kali ada error ditemukan, bahkan jika langsung diperbaiki.

> Jika kedua file ini tidak ada, AI wajib membuatnya di awal sesi sebelum mengerjakan hal lain.

---

## 6. Penamaan Kustom Bahasa Indonesia (Wajib Seluruh Proyek)

- **Identifier kustom** (variabel, fungsi, state, ID HTML, class CSS, tabel DB, komentar): **wajib Bahasa Indonesia**
- **Keyword bawaan bahasa/framework** (`const`, `return`, `async`, `useState`, `interface`, `import`, dll.): tetap sintaks aslinya
- **Nama komponen React**: PascalCase Bahasa Indonesia (`KartuProduk`, `FormulirLogin`, `BilahNavigasi`)
- **Nama hook**: camelCase dengan awalan `use` (`useDaftarProduk`, `useStatusMemuat`)

---

## 7. Protokol Verifikasi Sebelum Selesai

AI **dilarang** menyatakan tugas selesai sebelum menyelesaikan checklist ini:

- [ ] Jalankan dev server — tidak ada error merah di terminal
- [ ] Periksa log konsol browser — tidak ada `TypeError`, `404`, atau warning kritis
- [ ] Semua berkas kode di bawah 250 baris
- [ ] Tujuan halaman, hierarki, dan tindakan utama jelas tanpa dekorasi berlebih
- [ ] Loading, empty, error, success, dan permission state yang relevan memiliki feedback serta jalan lanjut
- [ ] Alur utama telah diuji pada mobile, desktop, dan keyboard
- [ ] Kontras dan fokus terlihat memenuhi WCAG AA
- [ ] `memori_proyek.md` sudah diperbarui dengan perubahan terbaru
