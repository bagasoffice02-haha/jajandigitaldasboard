# Dokumen Kebutuhan Produk (PRD): [Nama Proyek / Fitur]

Dokumen ini menjadi acuan utama spesifikasi bisnis, alur pengguna, dan hierarki fitur sebelum eksekusi kode dimulai.

---

## 1. Ringkasan Eksekutif & Nilai Utama
- **Nama Produk**: [Nama Proyek]
- **Target Pengguna**: [Deskripsi persona pengguna / pengembang / pelanggan]
- **Tujuan Utama (*Core Value Proposition*)**: [Penjelasan singkat 1-2 kalimat mengenai masalah yang diselesaikan]

---

## 2. Alur Pengguna (*User Journey*)
1. Pengguna membuka halaman utama dan melihat ringkasan status.
2. Pengguna melakukan aksi utama (misal: filter data, input formulir, checkout).
3. Sistem memberikan umpan balik visual instan (loading skeleton, notifikasi toast, pembaruan tabel).

---

## 3. Rincian Kebutuhan Fitur & Komponen UI

### Fitur 1: [Nama Fitur Utama]
- **Komponen Visual**: [Bilah Navigasi, Tabel Interaktif, Modal Konfirmasi, dll.]
- **Perilaku Interaksi**:
  - Validasi input secara langsung (*real-time validation*).
  - Tampilan responsif pada perangkat mobile (`< 640px`) dan desktop.
- **Kebutuhan Data & State**:
  - State lokal: [Daftar pilihan, status modal].
  - State server: [Endpoint API / Query].

---

## 4. Standar Non-Fungsional
- **Aksesibilitas**: Minimal skor WCAG 2.1 AA (kontras teks minimal 4.5:1).
- **Performa**: Waktu muat awal di bawah 1.5 detik, tanpa *layout shift* (CLS < 0.1).
- **Keamanan**: Sanitasi input dan proteksi data sensitif.
