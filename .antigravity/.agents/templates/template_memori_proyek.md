# Memori Proyek: [Nama Proyek]

Dokumen ini merekam state, keputusan teknis, dan kemajuan implementasi agar kesinambungan pengerjaan tetap terjaga 100% konsisten.

---

## 1. Ikhtisar & Arsitektur Utama
- **Framework & Styling**: [Contoh: React 19 + Vite + Tailwind CSS v4]
- **State Management**: [Contoh: Zustand + TanStack Query]
- **Pustaka Ikon**: [Contoh: Lucide React]

---

## 2. Status Fitur & Komponen

| Fitur / Komponen | Berkas Terkait | Status | Catatan |
| :--- | :--- | :--- | :--- |
| Bilah Navigasi Utama | `src/komponen/navigasi/bilah_navigasi.jsx` | Selesai | Responsif & aksesibel |
| Modul Autentikasi | `src/fitur/autentikasi/` | Sedang Dikerjakan | Integrasi token JWT |
| Laporan Transaksi | `src/fitur/laporan/` | Belum Mulai | Menunggu skema database |

---

## 3. Keputusan Arsitektur Kritis
- [Tanggal]: Memilih menggunakan palet semantik HSL di `index.css` untuk kemudahan implementasi tema gelap/terang.
- [Tanggal]: Memisahkan logika fetch data ke custom hook `src/kait/` untuk menjaga komponen UI tetap murni presentasi.

---

## 4. Rencana Tahap Selanjutnya (*Next Steps*)
1. Selesaikan komponen formulir pendaftaran.
2. Lakukan inspeksi live browser dengan `take_snapshot` untuk menguji interaktivitas form.
3. Hubungkan ke endpoint API backend.
