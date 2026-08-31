# Aturan 04: Sistem Memori Proyek & Pelacak Bug Real-time

Aturan ini memastikan AI memiliki **kontinuitas konteks yang tidak terputus** sepanjang siklus hidup proyek, sehingga tidak ada keputusan teknis yang hilang dan tidak ada bug yang terulang dua kali.

> **Wajib Dilakukan di Awal Setiap Sesi**: Jika `memori_proyek.md` belum ada di root proyek, buat sekarang sebelum mengerjakan hal lain.

---

## 1. Format Standar `memori_proyek.md`

File ini wajib mengikuti format di bawah dan diperbarui setiap kali ada perubahan signifikan:

```markdown
# Memori Proyek: [Nama Proyek]
Terakhir diperbarui: [YYYY-MM-DD HH:mm]

## Status Proyek
- Framework: [Next.js 15 / React 19 + Vite / dll]
- Package Manager: [npm / pnpm / bun]
- Styling: [Tailwind CSS v4 / v3]
- State Management: [Zustand / Context API / TanStack Query]
- Database: [PostgreSQL / MySQL / Supabase / dll]
- Auth: [NextAuth / Clerk / Supabase Auth / dll]

## Modul & Komponen yang Sudah Selesai
| Modul | Path Berkas | Status | Catatan |
| :--- | :--- | :--- | :--- |
| Bilah Navigasi | `src/komponen/tata-letak/bilah-navigasi.jsx` | Selesai | Responsif, WCAG AA |
| Sistem Auth | `src/fitur/autentikasi/` | Selesai | JWT + refresh token |

## Modul yang Sedang Dikerjakan
- [Nama Modul]: [Deskripsi status saat ini dan apa yang masih kurang]

## Keputusan Arsitektur yang Disepakati
- [Tanggal]: [Keputusan + alasannya]
  - Contoh: "2025-01-15: Memilih Zustand untuk global state karena tim tidak familiar dengan Redux"

## Endpoint API yang Sudah Terdefinisi
| Method | Endpoint | Deskripsi | Status |
| :--- | :--- | :--- | :--- |
| GET | `/api/produk` | Ambil semua produk dengan pagination | Selesai |
| POST | `/api/pesanan` | Buat pesanan baru | Belum |

## Rencana Langkah Selanjutnya (Next Steps)
1. [Langkah prioritas tertinggi]
2. [Langkah berikutnya]
3. [Langkah setelahnya]
```

---

## 2. Format Standar `catatan_bug_dan_error.md`

File ini diperbarui **secara real-time** setiap kali error ditemukan, bahkan jika langsung diselesaikan dalam sesi yang sama:

```markdown
# Catatan Bug & Error: [Nama Proyek]

## Bug Aktif (Belum Selesai)

### [BUG-001] [Deskripsi Singkat Bug]
- **Tanggal Ditemukan**: YYYY-MM-DD
- **Tingkat Keparahan**: Kritis / Tinggi / Sedang / Rendah
- **Gejala**: [Apa yang terlihat/terjadi oleh pengguna atau developer]
- **Pesan Error di Konsol**:
  ```
  TypeError: Cannot read properties of undefined (reading 'map')
  at KartuProduk (kartu-produk.jsx:23)
  ```
- **Akar Masalah**: [Penjelasan teknis mengapa terjadi]
- **Solusi yang Dicoba**: [Yang sudah dicoba tapi belum berhasil]
- **Langkah Berikutnya**: [Rencana investigasi selanjutnya]

---

## Bug Selesai (Arsip)

### [BUG-001] [Deskripsi Singkat]
- **Akar Masalah**: [Penjelasan singkat]
- **Solusi**: [Baris/file yang diubah]
- **Tanggal Selesai**: YYYY-MM-DD

---

## Fitur yang Ditunda (Deferred)

| Fitur | Alasan Penundaan | Akan Dikerjakan Setelah |
| :--- | :--- | :--- |
| Ekspor PDF | Menunggu library yang kompatibel | Modul laporan selesai |
```

---

## 3. Aturan Pembaruan File Memori

- Perbarui `memori_proyek.md` setiap kali:
  - Sebuah modul baru selesai dibuat
  - Ada keputusan arsitektur baru yang disepakati
  - Endpoint API baru ditambahkan atau diubah
  - Rencana *next steps* berubah

- Perbarui `catatan_bug_dan_error.md` setiap kali:
  - Error baru ditemukan (bahkan jika bisa langsung diselesaikan)
  - Status bug berubah (dari "aktif" menjadi "selesai")
  - Sebuah fitur sengaja dilewati/ditunda

---

## 4. Protokol Logging Kode Terstruktur

Setiap endpoint dan operasi asynchronous wajib memiliki logging yang cukup untuk debugging:

```js
// Contoh logging terstruktur pada endpoint API (Next.js App Router)
export async function POST(request) {
  const konteksLog = { endpoint: '/api/pesanan', method: 'POST' }
  
  try {
    const dataBody = await request.json()
    console.log('[PESANAN] Menerima permintaan buat pesanan:', {
      ...konteksLog,
      idPengguna: dataBody.idPengguna,
      jumlahItem: dataBody.items?.length
    })

    const hasilPesanan = await buatPesananBaru(dataBody)
    console.log('[PESANAN] Pesanan berhasil dibuat:', {
      ...konteksLog,
      idPesanan: hasilPesanan.id
    })

    return Response.json(hasilPesanan, { status: 201 })
  } catch (error) {
    console.error('[PESANAN] Gagal membuat pesanan:', {
      ...konteksLog,
      pesan: error.message,
      tumpukanError: error.stack
    })
    return Response.json({ pesan: 'Gagal memproses pesanan' }, { status: 500 })
  }
}
```
