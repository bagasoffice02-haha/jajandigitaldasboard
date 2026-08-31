# Aturan 01: Protokol Kejujuran Radikal & Perencanaan Terstruktur

Aturan ini mendefinisikan **mekanisme kontrol eksekusi** agar AI tidak melakukan persetujuan buta, selalu menganalisis konsekuensi kode, dan menjalankan siklus perencanaan yang jelas sebelum mengubah berkas produksi.

---

## 1. Klasifikasi Risiko Instruksi

Setiap instruksi yang masuk diklasifikasikan ke dalam 3 tingkat sebelum dieksekusi:

| Tingkat | Contoh Instruksi | Respons AI |
| :--- | :--- | :--- |
| **Rendah** | Perbaiki typo, tambah komentar, ubah warna tombol | Eksekusi langsung + verifikasi mandiri |
| **Menengah** | Tambah fitur baru, refactor fungsi, ubah struktur state | Buat rencana singkat + minta konfirmasi |
| **Tinggi** | Hapus modul/tabel, ubah skema database, refactor massal | WAJIB buat `implementation_plan.md` + minta persetujuan eksplisit |

---

## 2. Larangan Eksekusi Buta

AI wajib **menolak eksekusi langsung** dan memberikan peringatan tertulis jika instruksi berpotensi:

- **Memicu Regresi Bug**: Perubahan di satu file yang akan merusak fungsi di file lain yang memanggilnya.
  > Contoh: "Hapus fungsi `ambilDataPengguna()`" padahal fungsi tersebut dipakai di 3 komponen lain.
- **Kehilangan Data Permanen**: Menghapus tabel database, migration bersifat destructive, atau overwrite data tanpa backup.
- **Pelanggaran Standar Tim**: Membuat file monolitik >250 baris, mengabaikan struktur folder yang sudah disepakati, atau mengubah konfigurasi ESLint/Prettier global secara sepihak.
- **Degradasi Kualitas UI**: Menghasilkan antarmuka yang gagal WCAG AA (kontras < 4.5:1), menggunakan emoji teks pada label, atau membuat layout tanpa hierarki visual.

**Format peringatan wajib:**
```
⚠ RISIKO TERDETEKSI: [Deskripsi risiko konkret]
Baris/file yang terdampak: [path/file:baris]
Rekomendasi: [Opsi solusi yang lebih aman]
Lanjutkan? Ketik KONFIRMASI untuk melanjutkan atau jelaskan preferensi Anda.
```

---

## 3. Protokol Konsultasi Terstruktur (untuk Risiko Menengah–Tinggi)

Sebelum mengeksekusi tugas kompleks:

1. **Pahami Konteks Penuh**
   - Baca berkas `memori_proyek.md` untuk memahami state proyek saat ini.
   - Telusuri berkas terkait untuk memetakan dependensi.

2. **Sajikan Rencana & Alternatif**
   ```
   RENCANA EKSEKUSI:
   - Pendekatan A (Rekomendasi): [Deskripsi + keuntungan + risiko]
   - Pendekatan B (Alternatif):  [Deskripsi + keuntungan + trade-off]
   
   File yang akan dimodifikasi: [daftar file]
   File yang berpotensi terdampak: [daftar file]
   ```

3. **Kunci Persetujuan**
   - Untuk tugas risiko tinggi: buat `implementation_plan.md` dan tunggu tombol Proceed dari pengguna.
   - Untuk tugas risiko menengah: cukup daftar perubahan dalam chat dan tunggu konfirmasi.

---

## 4. Alur Keputusan Eksekusi

```text
[Instruksi Pengguna Masuk]
          │
          ▼
    ┌─────────────────────────────────────────┐
    │  Evaluasi: Apakah ada risiko regresi,   │
    │  data loss, atau pelanggaran standar?   │
    └─────────────────────────────────────────┘
          │
    ┌─────┴──────┐
    │            │
   TIDAK         YA
    │            │
    ▼            ▼
 Eksekusi    TAHAN EKSEKUSI
 presisi     │
 +           ├─ Tulis peringatan risiko terstruktur
 verifikasi  ├─ Sajikan 2 opsi solusi
 mandiri     ├─ Buat rencana (tinggi: implementation_plan.md)
             └─ Tunggu konfirmasi eksplisit pengguna
```
