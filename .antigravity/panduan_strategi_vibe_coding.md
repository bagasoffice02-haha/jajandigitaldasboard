# Panduan Strategi Vibe Coding untuk Developer Profesional & Tim

Dokumen ini membedah strategi rekayasa, mental model, dan taktik praktis bagi developer yang ingin memanfaatkan kekuatan *Vibe Coding* secara maksimal tanpa terjebak dalam kelemahan umum AI (ketiadaan standar estetika, halusinasi kode, dan pelanggaran arsitektur tim).

---

## 1. Mental Model: Developer sebagai Arsitek, AI sebagai Builder Berkecepatan Tinggi

Banyak pengguna pemula memperlakukan AI sebagai "penyelesai masalah ajaib" tanpa memberikan batas kendali yang jelas. Hal ini selalu berujung pada kekecewaan: kode monolitik yang berantakan, kontras visual yang buruk, dan bug regresi.

Sebagai **Developer Profesional dengan Skill Vibe Coding**, posisi Anda adalah:
- **Arsitek & Kurator Kualitas**: Anda memegang visi sistem, hierarki data, pembagian domain, dan standar visual.
- **AI Agent (Antigravity)**: Mesin eksekutor presisi yang menulis boilerplate, mengimplementasikan logika spesifik, menerapkan styling Tailwind, dan menguji kode dalam hitungan detik.

---

## 2. Mengapa Hasil AI Sering Terasa Generik?

Tanpa konteks produk yang cukup, AI mudah mengisi ruang dengan pola yang sering muncul: hero besar, gradien, deretan kartu, metrik rekaan, sidebar, dan micro-animation. Elemen tersebut bisa terlihat rapi secara terpisah, tetapi belum tentu membantu pengguna.

Masalah utamanya bukan sekadar kurang “taste”, melainkan urutan keputusan yang keliru:

1. **Gaya dipilih sebelum masalah dipahami** — tampilan mengarahkan konten, padahal seharusnya tujuan dan informasi membentuk layout.
2. **Semua hal diberi penekanan** — terlalu banyak warna, kartu, badge, dan CTA menghilangkan focal point.
3. **Referensi ditiru secara literal** — ciri visual Linear, Vercel, Stripe, atau startup lain dicampur tanpa memahami alasan di baliknya.
4. **Happy path dianggap cukup** — loading, empty, error, permission, keyboard, mobile, dan data ekstrem baru dipikirkan belakangan.

Mindset yang lebih kuat adalah **product-first**: pahami pengguna dan tugas, susun hierarki, pilih satu arah visual, bangun sistem, lalu verifikasi melalui render dan alur nyata.

---

## 3. Strategi Mengunci Standar Kualitas (The Guardrail Strategy)

Untuk memaksa AI menghasilkan karya berstandar enterprise, terapkan 4 pilar berikut:

### Pilar 1: Mulai dari Tugas, lalu Batasi Kreativitas
Tetapkan pengguna, tujuan layar, tindakan utama, dan informasi minimum sebelum membahas komponen. Setelah arah jelas, gunakan token semantik (`primary`, `secondary`, `muted`, `background`, `border`) agar kreativitas bergerak di dalam grammar visual yang konsisten. Token meningkatkan konsistensi, tetapi tetap harus diuji terhadap konten, tema, dan kontras aktual.

### Pilar 2: Terapkan Protokol Konsultasi & Interogasi (/grill-me)
Sebelum mengizinkan AI menulis kode pada fitur besar, gunakan perintah `/grill-me` atau minta AI menyusun `implementation_plan.md`. Biarkan AI menantang asumsi Anda, memetakan risiko, dan mengonfirmasi struktur data sebelum membuat satu berkas pun.

### Pilar 3: Verifikasi Pengalaman, Bukan Screenshot Saja
Gunakan browser nyata untuk menjalankan alur utama, memeriksa console, keyboard, responsivitas, overflow, dan state non-happy-path. Snapshot membantu menilai komposisi, tetapi kualitas UX dibuktikan oleh perilaku lengkap pada mobile dan desktop.

### Pilar 4: Pertahankan Konteks dengan Dokumen State Dinamis
Pada sesi percakapan yang panjang, AI akan mengalami pemotongan konteks (*token truncation*). Dengan mewajibkan pembaruan `memori_proyek.md` dan `catatan_bug_dan_error.md`, AI baru (atau subagent) dapat langsung melanjutkan pengerjaan tanpa mengulang dari nol.

---

## 4. Harmonisasi AI dalam Lingkungan Tim

Ketika Anda bekerja dalam tim, AI Anda tidak boleh menjadi "faktor pengganggu" di Git repositori:

1. **Simpan Folder `.agents/` di Root Repositori**:
   Dengan menaruh aturan `.agents/` di Git, seluruh rekan tim yang membuka repositori menggunakan Antigravity akan memiliki AI yang bertindak dengan aturan, konvensi penamaan, dan standar kualitas yang persis sama.
2. **Isolasi Fitur & Larangan Refactor Massal**:
   Instruksikan AI untuk hanya menyentuh berkas di dalam fitur yang sedang dikerjakan. Dilarang merestrukturisasi folder rekan tim tanpa izin eksplisit.
3. **Standarisasi Pesan Komit Git**:
   Gunakan standar *Conventional Commits* (`feat:`, `fix:`, `refactor:`, `docs:`) agar riwayat Git tim tetap rapi dan mudah dilacak.

---

## 5. Daftar Periksa Harian (*Daily Anti-Slop Checklist*)

Sebelum melakukan komit atau menyerahkan hasil kepada tim/klien, pastikan poin-poin berikut terpenuhi:

- [ ] Pengguna, tujuan layar, dan tindakan utama dapat dijelaskan dalam satu kalimat.
- [ ] Hierarki tetap jelas tanpa mengandalkan warna atau efek dekoratif.
- [ ] Tidak ada metrik, kartu, tab, ikon, atau CTA yang dibuat hanya untuk mengisi ruang.
- [ ] Loading, empty, error, success, dan permission state yang relevan memiliki feedback dan jalan lanjut.
- [ ] Kontras memenuhi WCAG AA dan alur utama dapat digunakan dengan keyboard.
- [ ] Layout telah diperiksa sekitar 375px dan 1280px, termasuk konten panjang serta data ekstrem.
- [ ] Terminal dan konsol browser bersih dari error atau warning kritis.
- [ ] Dokumen `memori_proyek.md` telah diperbarui dengan status terkini.
