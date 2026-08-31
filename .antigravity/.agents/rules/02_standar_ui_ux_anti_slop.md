# Aturan 02: Mindset UI/UX Product-First

Aturan ini menjaga agar antarmuka tidak berhenti pada “terlihat modern”. Kualitas UI/UX dinilai dari seberapa cepat pengguna memahami nilai, menyelesaikan tugas, memulihkan kesalahan, dan mempercayai produk.

---

## 1. Mulai dari masalah, bukan komponen

Sebelum menentukan layout atau gaya, identifikasi:

- siapa pengguna utama dan seberapa familier mereka dengan produk;
- tujuan halaman dan tindakan terpenting pengguna;
- informasi minimum untuk mengambil keputusan;
- risiko, keraguan, atau konsekuensi dari tindakan;
- konteks perangkat, aksesibilitas, koneksi, dan kepadatan data.

Dilarang mengarang metrik, testimoni, fitur, menu, atau kartu hanya agar halaman terlihat penuh. Bila konteks produk belum lengkap, pertahankan asumsi seminimal mungkin dan nyatakan asumsi yang memengaruhi hasil.

---

## 2. Bedakan jenis pengalaman

“Web startup” bukan satu gaya tunggal.

| Permukaan | Fokus utama | Karakter yang sesuai |
| :--- | :--- | :--- |
| Landing page | Nilai produk, diferensiasi, bukti, CTA | Narasi kuat, brand ekspresif, satu jalur utama |
| SaaS/dashboard | Orientasi, scanability, kecepatan tugas | Chrome tenang, hierarki rapat, pola dapat diprediksi |
| Onboarding/auth | Kejelasan, progres, kepercayaan | Keputusan sedikit per langkah, microcopy membantu |
| Dokumentasi | Penemuan informasi, keterbacaan | Navigasi stabil, tipografi nyaman, contoh konkret |
| Operasional/data-heavy | Perbandingan, anomali, tindakan | Kepadatan terkontrol, alignment kuat, data lebih dominan dari dekorasi |

Jangan membawa pola marketing yang dekoratif ke layar kerja padat, atau membuat landing page terasa seperti dashboard internal.

---

## 3. Susun hierarki sebelum styling

Setiap halaman harus memiliki urutan perhatian yang disengaja:

1. orientasi: pengguna berada di mana;
2. tujuan atau nilai utama;
3. tindakan utama;
4. bukti, konteks, atau data pendukung;
5. tindakan sekunder dan detail lanjutan.

Gunakan ukuran, berat, posisi, ruang, kontras, dan grouping untuk membentuk hierarki. Jangan mengandalkan warna saja. Bila semua elemen terlihat penting, tidak ada elemen yang benar-benar penting.

---

## 4. Gunakan referensi sebagai prinsip

Referensi seperti Linear, Vercel, Stripe, dan Raycast dipakai untuk mempelajari keputusan tertentu: ketenangan chrome, grid, tipografi, sistem warna, storytelling, feedback, atau kepadatan. Jangan menyalin merek, palet, hero, gradien, atau komposisi secara literal.

Sebelum menerapkan referensi, sebutkan:

- masalah desain yang ingin diselesaikan;
- prinsip yang diambil;
- penyesuaian terhadap pengguna, brand, dan konteks proyek.

## 5. Bangun sistem, bukan kumpulan pengecualian

Gunakan token berbasis peran untuk warna, tipografi, spacing, radius, elevation, motion, dan breakpoint. Nilai token mengikuti identitas proyek; tidak ada font, warna merek, radius, atau skala yang wajib untuk semua produk.

Komponen yang sama harus mempertahankan anatomi dan perilaku yang konsisten. Variasi baru hanya dibuat jika ada perbedaan fungsi, hierarki, konteks, atau state yang nyata.

---

## 6. Anti AI-slop

- Jangan jadikan ungu neon, gradient blob, glassmorphism, glow, dark mode, atau grid dekoratif sebagai shortcut menuju kesan startup.
- Jangan membungkus semua bagian dengan kartu. Gunakan kartu hanya ketika konten merupakan unit mandiri atau memiliki interaksi/lapisan tersendiri.
- Jangan menambahkan statistik, badge, tab, filter, pencarian, atau sidebar yang tidak dibutuhkan alur.
- Jangan memakai ikon besar, ilustrasi acak, atau emoji untuk mengisi ruang.
- Jangan membuat teks sekunder terlalu pucat, uppercase berlebihan, atau ukuran terlalu kecil demi estetika.
- Jangan memakai animasi sebagai hiasan terus-menerus. Motion harus menjelaskan perubahan, progres, feedback, atau hubungan ruang.
- Jangan menyalin gaya referensi tanpa memahami produk dan kontennya.

Kepribadian visual harus muncul dari sedikit keputusan yang kuat dan konsisten: tipografi, komposisi, tone warna, imagery, atau motion—bukan semua efek sekaligus.

## 7. State dan respons harus lengkap

Untuk setiap alur, pertimbangkan state yang benar-benar mungkin: normal, hover, focus-visible, active, disabled, loading, empty, error, success, offline, permission, dan partial data.

Pilih feedback sesuai durasi dan dampak:

- respons instan untuk aksi lokal;
- optimistic update bila kegagalan aman dipulihkan;
- progress bila durasi atau tahap dapat diketahui;
- skeleton bila struktur konten stabil;
- pesan status bila pengguna perlu memahami apa yang sedang terjadi.

Jangan menggunakan skeleton secara otomatis pada semua fetching dan jangan menghilangkan konten lama bila mempertahankannya lebih membantu konteks.

---

## 8. Aksesibilitas adalah kualitas produk

- Gunakan elemen HTML sesuai fungsi; tombol memakai `<button>`, navigasi memakai `<a>`, field memiliki label.
- Pertahankan fokus keyboard yang terlihat dan urutan fokus yang logis.
- Penuhi WCAG AA: teks normal minimal 4.5:1; teks besar serta komponen grafis bermakna minimal 3:1.
- Jangan bergantung pada warna, hover, drag, atau pointer presisi sebagai satu-satunya cara memahami atau mengoperasikan UI.
- Target sentuh, zoom, pembaca layar, `prefers-reduced-motion`, dan konten panjang harus diperhitungkan sejak desain, bukan setelah selesai.

## 9. Verifikasi visual wajib

Sebelum selesai:

- render dan gunakan alur utama pada browser nyata;
- periksa sekitar 375px dan 1280px, serta breakpoint yang berisiko;
- uji keyboard, fokus, overflow, zoom, loading, empty, error, dan data ekstrem yang relevan;
- periksa kontras pada pasangan warna aktual;
- periksa console dan layout shift;
- lakukan satu putaran pengurangan: hapus dekorasi, container, label, atau aksi yang tidak membantu pengguna.

Screenshot yang menarik tidak cukup. Bukti selesai adalah pengalaman yang tetap jelas, responsif, dapat dioperasikan, dan konsisten pada state nyata.
