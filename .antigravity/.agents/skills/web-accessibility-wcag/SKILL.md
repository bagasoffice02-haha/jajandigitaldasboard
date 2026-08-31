---
name: web-accessibility-wcag
description: >-
  Gunakan skill ini saat melakukan audit aksesibilitas, menguji rasio kontras warna (WCAG AA/AAA),
  memastikan semantik HTML5, navigasi keyboard (focus trapping & focus-visible),
  keterbacaan pembaca layar (screen reader), dan saat ada pertanyaan tentang apakah
  suatu pilihan warna atau komponen memenuhi standar aksesibilitas.
---

# Panduan Aksesibilitas Web & Standar WCAG 2.1

Skill ini memandu AI untuk membangun antarmuka yang dapat diakses oleh **semua pengguna** — termasuk pengguna dengan disabilitas visual, motorik, atau yang mengandalkan teknologi asistif.

---

## Panduan Cepat: Alat Verifikasi Aksesibilitas

| Alat | Cara Penggunaan | Untuk Mengecek |
| :--- | :--- | :--- |
| Chrome DevTools → Accessibility | F12 → Elements → Accessibility panel | Hierarki aksesibilitas, ARIA roles |
| Chrome DevTools → Lighthouse | F12 → Lighthouse → Accessibility | Skor aksesibilitas menyeluruh |
| chrome-devtools-mcp `take_snapshot` | Snapshot DOM + aksesibilitas | Cek dari dalam Antigravity |
| axe DevTools (browser extension) | Klik ikon di toolbar | Deteksi error aksesibilitas otomatis |
| WebAIM Contrast Checker | webaim.org/resources/contrastchecker | Hitung rasio kontras manual |

---

## Langkah 1: Verifikasi Rasio Kontras (Wajib Setiap Ada Warna Baru)

### Standar yang Wajib Dipenuhi

```text
TEKS NORMAL (< 18px reguler / < 14px bold):
  WCAG AA  → minimum 4.5:1  [WAJIB]
  WCAG AAA → minimum 7:1    [Sangat Direkomendasikan]

TEKS BESAR (≥ 18px reguler / ≥ 14px bold):
  WCAG AA  → minimum 3:1   [WAJIB]
  WCAG AAA → minimum 4.5:1 [Sangat Direkomendasikan]

ELEMEN UI (border tombol aktif, ikon bermakna, focus ring):
  WCAG AA  → minimum 3:1   [WAJIB]
```

### Kombinasi Warna yang Sering Gagal (Hindari)

```text
❌ Teks abu #999999 di latar putih #FFFFFF     → Rasio: 2.85:1 (GAGAL AA)
❌ Teks abu #767676 di latar putih #FFFFFF     → Rasio: 4.48:1 (GAGAL AA — hampir saja)
❌ Tombol kuning #FFCC00 dengan teks putih     → Rasio: 1.97:1 (GAGAL AA)
❌ Teks putih di latar hijau terang #4CAF50    → Rasio: 2.71:1 (GAGAL AA)

✅ Teks hitam #171717 di latar putih           → Rasio: 18.1:1 (LULUS AAA)
✅ Teks #374151 di latar putih #FFFFFF         → Rasio: 9.73:1 (LULUS AAA)
✅ Teks putih #FFFFFF di utama #4F46E5         → Rasio: 5.25:1 (LULUS AA)
✅ Teks #6B7280 di latar putih — HANYA untuk teks besar ≥ 24px → Rasio: 4.62:1 (LULUS AA)
```

---

## Langkah 2: Semantik HTML5 yang Benar

### Struktur Halaman Wajib

```html
<!-- ✅ Struktur semantik yang benar -->
<body>
  <header role="banner">        <!-- Identitas situs: logo, navigasi utama -->
    <nav aria-label="Navigasi Utama">
      <ul>
        <li><a href="/">Beranda</a></li>
        <li><a href="/produk" aria-current="page">Produk</a></li>
      </ul>
    </nav>
  </header>

  <main id="konten-utama">       <!-- Satu per halaman — konten inti -->
    <h1>Judul Halaman Utama</h1> <!-- Satu per halaman -->
    <section aria-labelledby="judul-seksi">
      <h2 id="judul-seksi">Sub Seksi</h2>
    </section>
  </main>

  <aside aria-label="Artikel Terkait">  <!-- Konten pendukung -->
  </aside>

  <footer role="contentinfo">    <!-- Informasi hak cipta, tautan sekunder -->
  </footer>
</body>
```

### Elemen Interaktif yang Benar

```tsx
// ✅ BENAR — Gunakan elemen semantik yang tepat
<button type="button" onClick={tanganiKlik}>Simpan Perubahan</button>
<button type="submit">Kirim Formulir</button>
<a href="/profil">Lihat Profil</a>

// ❌ SALAH — Jangan gunakan div/span untuk interaksi
<div onClick={tanganiKlik}>Simpan Perubahan</div>
<span onClick={tanganiKlik}>Klik Saya</span>

// ✅ BENAR — Jika terpaksa menggunakan div (rare case), tambahkan ARIA lengkap
<div
  role="button"
  tabIndex={0}
  aria-pressed={tertekan}
  onClick={tanganiKlik}
  onKeyDown={(e) => e.key === 'Enter' && tanganiKlik()}
>
  Label Aksi
</div>
```

---

## Langkah 3: Navigasi Keyboard & Focus Management

### Aturan Fokus Wajib

```tsx
// ✅ BENAR — Jangan hapus outline, ganti dengan custom focus ring
.tombol:focus-visible {
  outline: 2px solid hsl(var(--utama));
  outline-offset: 2px;
}

// Tailwind equivalent (gunakan ini):
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-utama focus-visible:ring-offset-2"
```

### Modal dengan Focus Trap yang Benar

```tsx
// src/komponen/ui/dialog.tsx
import { useEffect, useRef } from 'react'

export function Dialog({ terbuka, onTutup, judul, children }: PropsDialog) {
  const refDialog = useRef<HTMLDivElement>(null)
  const refTombolTutup = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (terbuka) {
      // Pindahkan fokus ke tombol tutup saat dialog terbuka
      refTombolTutup.current?.focus()

      // Tangkap tombol Tab agar fokus tidak keluar dialog
      const tanganiTab = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return
        const elemenFokusable = refDialog.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (!elemenFokusable || elemenFokusable.length === 0) return

        const pertama = elemenFokusable[0] as HTMLElement
        const terakhir = elemenFokusable[elemenFokusable.length - 1] as HTMLElement

        if (e.shiftKey && document.activeElement === pertama) {
          e.preventDefault()
          terakhir.focus()
        } else if (!e.shiftKey && document.activeElement === terakhir) {
          e.preventDefault()
          pertama.focus()
        }
      }

      document.addEventListener('keydown', tanganiTab)
      return () => document.removeEventListener('keydown', tanganiTab)
    }
  }, [terbuka])

  if (!terbuka) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="judul-dialog"
      ref={refDialog}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onTutup} aria-hidden="true" />
      <div className="relative rounded-xl bg-latar-kartu p-6 shadow-xl w-full max-w-md">
        <h2 id="judul-dialog" className="text-lg font-semibold">{judul}</h2>
        <button
          ref={refTombolTutup}
          onClick={onTutup}
          aria-label="Tutup dialog"
          className="absolute top-4 right-4 rounded-lg p-1 focus-visible:ring-2 focus-visible:ring-utama"
        >
          <XIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  )
}
```

---

## Langkah 4: Form Aksesibel

```tsx
// ✅ Setiap input WAJIB memiliki label yang terhubung
<div className="space-y-2">
  <label
    htmlFor="masukan-email"         /* ← Terhubung ke input via htmlFor + id */
    className="text-sm font-medium"
  >
    Alamat Email
    <span aria-hidden="true" className="text-bahaya ml-1">*</span>
    <span className="sr-only">(wajib diisi)</span>
  </label>

  <input
    id="masukan-email"              /* ← Sama dengan htmlFor di atas */
    type="email"
    name="email"
    autoComplete="email"
    required
    aria-required="true"
    aria-invalid={adaError ? 'true' : 'false'}
    aria-describedby={adaError ? 'error-email' : undefined}
    className="..."
  />

  {adaError && (
    <p id="error-email" role="alert" className="text-sm text-bahaya">
      {pesanError}
    </p>
  )}
</div>
```

---

## Validasi Checkpoint Aksesibilitas

Sebelum menyatakan komponen/halaman selesai, jalankan audit ini:
- [ ] Semua teks memenuhi rasio kontras minimal WCAG AA (4.5:1 untuk teks normal)
- [ ] Navigasi keyboard bekerja tanpa mouse (Tab, Enter, Escape, arrow keys)
- [ ] Setiap input memiliki `<label>` yang terhubung via `htmlFor` + `id`
- [ ] Tidak ada `<div onClick>` tanpa `role="button"` dan `tabIndex="0"`
- [ ] Semua ikon dekoratif memiliki `aria-hidden="true"`
- [ ] Semua ikon bermakna memiliki `aria-label` atau teks tersembunyi `sr-only`
- [ ] Halaman hanya memiliki satu `<h1>`
- [ ] Modal/dialog memiliki focus trap yang berfungsi
- [ ] Focus ring terlihat jelas di semua elemen interaktif
