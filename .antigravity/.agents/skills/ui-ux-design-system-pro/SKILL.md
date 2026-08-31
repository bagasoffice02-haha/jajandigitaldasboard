---
name: ui-ux-design-system-pro
description: >-
  Rancang, bangun, atau refaktor UI web dengan pendekatan product-first, hierarki
  visual yang kuat, design system adaptif, interaksi yang jelas, dan kualitas visual
  setara produk startup modern. Gunakan untuk landing page, SaaS, dashboard,
  onboarding, komponen, token, tipografi, responsivitas, atau evaluasi visual.
---

# UI/UX Product-First

Tujuan skill ini bukan membuat antarmuka sekadar terlihat modern. Hasil yang baik harus membuat nilai produk cepat dipahami, tugas utama terasa ringan, dan seluruh state dapat dipercaya.

## Urutan berpikir

1. **Pahami produk sebelum memilih gaya.** Temukan pengguna utama, masalah yang sedang diselesaikan, tindakan terpenting, tingkat kepercayaan yang dibutuhkan, serta konteks perangkat. Jangan mengarang dashboard, metrik, navigasi, atau fitur untuk mengisi ruang.
2. **Klasifikasikan permukaan.** Bedakan landing page pemasaran, aplikasi produk, dashboard operasional, onboarding, dan halaman konten. Masing-masing memiliki kepadatan, ritme, serta kebutuhan bukti yang berbeda.
3. **Susun pengalaman sebagai cerita tugas.** Tetapkan urutan perhatian: orientasi, nilai/konteks, tindakan utama, bukti atau detail, lalu tindakan sekunder. Konten dan informasi menentukan layout, bukan sebaliknya.
4. **Pilih satu arah visual yang disengaja.** Nyatakan 3–5 kata karakter produk, misalnya “tenang, presisi, teknis, cepat”. Gunakan referensi untuk prinsip tertentu—hierarki, kepadatan, motion, atau brand expression—bukan untuk menyalin keseluruhan tampilan.
5. **Bangun grammar visual.** Tentukan token warna semantik, peran tipografi, skala ruang, radius, border, elevation, ikon, serta motion. Variasi harus berasal dari peran atau state, bukan dekorasi acak.
6. **Implementasikan alur lengkap.** Sertakan state normal, hover, focus-visible, active, disabled, loading, empty, error, success, dan permission bila relevan. Pilih skeleton, progress, optimistic state, atau pesan status sesuai perilaku sistem—jangan memaksa satu pola untuk semua loading.
7. **Verifikasi dengan render nyata.** Tinjau desktop dan mobile, tema yang didukung, keyboard, kontras, overflow, kepadatan, serta konsol browser. Perbaiki berdasarkan apa yang terlihat dan terasa, bukan hanya berdasarkan kode.

---

## Prinsip kualitas startup

- **Value first.** Pada landing page, pengguna harus memahami produk, audiens, dan hasil utamanya dari hero tanpa harus menebak.
- **One dominant action.** Setiap viewport atau area tugas memiliki satu aksi berprioritas tertinggi. Aksi sekunder tidak boleh bersaing lewat warna, ukuran, atau posisi.
- **Quiet chrome, strong content.** Navigasi, border, dan permukaan membantu orientasi namun tidak mengalahkan konten utama.
- **Progressive disclosure.** Tampilkan kompleksitas ketika dibutuhkan. Jangan menyembunyikan fungsi penting, tetapi jangan memaksa pengguna memahami semua opsi di awal.
- **Consistency with purpose.** Komponen serupa berperilaku serupa; perbedaan visual harus mengomunikasikan perbedaan fungsi, hierarki, atau state.
- **Fast is a design feature.** Cegah layout shift, beri respons langsung setelah aksi, dan pertahankan konteks saat data diperbarui.
- **Trust through detail.** Microcopy spesifik, data realistis, alignment rapi, state error yang membantu, serta fokus keyboard yang terlihat membentuk rasa percaya.
- **Restraint creates character.** Kepribadian produk datang dari beberapa keputusan kuat yang konsisten, bukan dari gradien, glow, shadow, blur, kartu, atau animasi yang ditumpuk.

---

## Arah menurut jenis permukaan

### Landing page startup

- Mulai dari janji nilai yang konkret, satu CTA utama, dan visual produk atau bukti yang relevan.
- Gunakan social proof, outcome, demo, atau detail teknis sebagai bukti—bukan deretan kartu fitur generik.
- Beri ruang untuk ekspresi merek pada hero atau momen tertentu; pertahankan bagian informasional tetap mudah dipindai.

### SaaS dan dashboard

- Optimalkan orientasi, scanability, kecepatan tindakan, dan kontinuitas konteks.
- Gunakan kartu hanya untuk unit informasi yang benar-benar mandiri. Untuk daftar, tabel, atau alur linear, utamakan struktur, whitespace, dan divider.
- Kepadatan dapat tinggi bila hierarki, alignment, label, dan shortcut tetap jelas.

### Onboarding, auth, dan pengaturan

- Kurangi keputusan per langkah dan jelaskan mengapa data atau izin diminta.
- Pertahankan progres, nilai input pengguna, jalur kembali, serta cara pulih dari error.
- Gunakan bukti keamanan atau kepercayaan hanya saat relevan dengan kekhawatiran pengguna.

## Guardrail visual

- Jangan memakai gaya “startup” sebagai sinonim untuk dark mode, ungu neon, glassmorphism, gradient blob, atau hero berukuran penuh layar.
- Jangan membungkus setiap bagian dalam kartu. Elevation harus mencerminkan lapisan interaksi yang nyata.
- Jangan memakai emoji sebagai ikon kontrol; gunakan ikon vektor yang konsisten dan label yang dapat dipahami.
- Jangan membuat teks sekunder terlalu pucat demi estetika. Penuhi WCAG AA dan uji pada latar sebenarnya.
- Jangan menambahkan animasi tanpa menjelaskan perubahan, hubungan ruang, progres, atau feedback. Hormati `prefers-reduced-motion`.
- Jangan mengubah design system global untuk menyelesaikan satu pengecualian lokal tanpa memeriksa dampaknya.
- Jangan menilai kualitas dari screenshot desktop saja. UI harus tetap utuh pada lebar sempit, zoom, konten panjang, dan data ekstrem.

---

## Bukti selesai

Sebelum menyatakan selesai, pastikan:

- tujuan halaman dan aksi utama terbaca jelas;
- hierarki tetap kuat saat warna diabaikan atau tampilan diperkecil;
- semua state yang relevan tersedia dan memberikan jalan lanjut atau pemulihan;
- token digunakan konsisten dan tidak ada keputusan visual acak yang berulang;
- kontrol memakai elemen semantik, dapat dioperasikan dengan keyboard, dan memiliki fokus terlihat;
- teks normal memenuhi rasio 4.5:1, teks besar serta komponen grafis bermakna 3:1;
- hasil telah diperiksa pada mobile sekitar 375px dan desktop sekitar 1280px, termasuk overflow dan konten panjang;
- motion, loading, dan feedback tidak menutupi masalah performa atau mengganggu tugas.

## Referensi

Saat menentukan arah startup atau melakukan kritik visual, baca [references/referensi-startup.md](references/referensi-startup.md). Pilih hanya referensi yang sesuai dengan jenis produk dan jelaskan prinsip yang diambil.
