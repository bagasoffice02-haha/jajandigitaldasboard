# Aturan 05: Protokol Kolaborasi Tim & Standar Git

Aturan ini mengatur bagaimana AI berperilaku dalam lingkungan tim agar tidak menjadi **sumber gangguan di repositori bersama** dan memastikan semua output AI tetap konsisten dengan standar tim.

---

## 1. Prinsip Batas Domain (Boundary Respect)

### Aturan Isolasi Tugas
- AI hanya boleh memodifikasi berkas yang **secara langsung berhubungan dengan tugas yang sedang dikerjakan**.
- Jika menemukan kode yang "kotor" atau bisa diperbaiki di berkas lain yang tidak berkaitan dengan tugas, **catat sebagai saran di catatan_bug_dan_error.md** — jangan langsung ubah tanpa izin.
- **Dilarang** refactor naming massal, restrukturisasi folder, atau perubahan konfigurasi ESLint/Prettier global secara sepihak.

### Cakupan Kerja yang Jelas
Sebelum mulai mengerjakan tugas dari PRD atau instruksi pengguna, AI wajib mendeklarasikan:
```
CAKUPAN KERJA:
- File yang akan dibuat/dimodifikasi: [daftar file]
- File yang dibaca sebagai referensi: [daftar file]
- File yang TIDAK akan disentuh: [batas yang jelas]
```

---

## 2. Standar Pesan Komit Git (Conventional Commits)

**Format wajib:**
```
<type>(<scope>): <deskripsi singkat dalam Bahasa Indonesia>

[body opsional: penjelasan lebih lanjut jika perlu]

[footer opsional: referensi issue, breaking changes]
```

**Tipe komit yang valid:**
| Tipe | Kapan Digunakan | Contoh |
| :--- | :--- | :--- |
| `feat` | Fitur baru yang terlihat oleh pengguna | `feat(keranjang): tambahkan fitur kupon diskon` |
| `fix` | Perbaikan bug | `fix(login): perbaiki loop redirect setelah autentikasi` |
| `refactor` | Perbaikan kode tanpa perubahan fungsionalitas | `refactor(produk): pecah komponen kartu produk menjadi modular` |
| `style` | Perubahan styling/CSS tanpa perubahan logika | `style(dasbor): sesuaikan padding kartu dengan token desain` |
| `docs` | Pembaruan dokumentasi | `docs(api): tambah contoh penggunaan endpoint pesanan` |
| `test` | Penambahan atau perbaikan test | `test(auth): tambah test validasi token kedaluwarsa` |
| `chore` | Pembaruan dependency, konfigurasi build | `chore: perbarui tailwindcss ke v4.0` |
| `perf` | Peningkatan performa | `perf(gambar): tambah lazy loading pada galeri produk` |

**Aturan tambahan:**
- Deskripsi komit menggunakan **imperative mood** (perintah): "tambahkan", bukan "menambahkan"
- Deskripsi komit maksimal **72 karakter**
- Scope menggunakan nama modul/fitur dalam Bahasa Indonesia

---

## 3. Alur Pengembangan Berbasis PRD

### Tahap 1: Analisis & Dekomposisi
Ketika menerima PRD atau deskripsi fitur:
1. Baca PRD secara menyeluruh dan identifikasi:
   - Daftar komponen UI yang dibutuhkan
   - State dan data yang perlu dikelola
   - Endpoint API yang perlu dibuat/dipakai
   - Modul lain yang terdampak
2. Pecah menjadi **sub-tugas terukur** dengan estimasi kompleksitas
3. Urutkan berdasarkan dependensi (mana yang harus dibuat dulu)

### Tahap 2: Frontend-First Validation
- Bangun seluruh UI dengan **mock data statis** terlebih dahulu
- Biarkan tim melakukan tinjauan visual dan UX sebelum menyentuh backend
- Verifikasi di browser menggunakan snapshot sebelum melanjutkan ke integrasi API

### Tahap 3: Integrasi Backend Presisi
- Ganti mock data dengan pemanggilan API nyata satu endpoint per satu
- Uji setiap integrasi secara terpisah sebelum menggabungkan
- Perbarui `memori_proyek.md` setiap endpoint berhasil diintegrasikan

---

## 4. Aturan Code Review Mandiri Sebelum Commit

Sebelum membuat komit apa pun, AI wajib menjalankan pemeriksaan mandiri:

```bash
# 1. Pastikan tidak ada error TypeScript
npx tsc --noEmit

# 2. Pastikan tidak ada pelanggaran linter
npm run lint

# 3. Pastikan format kode konsisten
npm run format --check

# 4. Jalankan test yang berkaitan dengan perubahan
npm test -- --testPathPattern=[nama-modul]
```

Jika ada pelanggaran, **perbaiki dulu sebelum commit** — jangan biarkan CI/CD tim menjadi penjaga satu-satunya.

---

## 5. Penanganan Konflik Merge

Jika terjadi konflik merge saat bekerja dengan kode tim:
1. **Jangan langsung pilih "mine" atau "theirs"** — baca dua versi dengan seksama
2. Pahami konteks perubahan di kedua sisi
3. Jika tidak yakin, **tanyakan ke pengguna** sebelum memutuskan resolusi konflik
4. Setelah merge, jalankan semua test untuk memastikan tidak ada regresi
