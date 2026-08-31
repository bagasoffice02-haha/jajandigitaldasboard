# Aturan 03: Arsitektur Modular Frontend & Standar Kode Bersih

Aturan ini mewajibkan struktur kode yang terpecah rapi, bertanggung jawab tunggal, mudah diuji secara independen, dan dapat dipelihara oleh tim lintas waktu.

---

## 1. Batas Ukuran Berkas & Pemisahan Tanggung Jawab

### Batas Ketat (Tidak Bisa Dikompromikan)
- **Maksimal 250 baris per file** — jika mendekati batas, langsung pecah sebelum melampaui.
- Satu file = satu tanggung jawab utama. Tidak boleh ada "god component" atau "utility monster".

### Cara Memecah File yang Terlalu Besar

Ketika sebuah komponen mulai membengkak, pisahkan berdasarkan tanggung jawab:

```text
SEBELUM (satu file raksasa):
FormulirPesanan.jsx (400+ baris)
  └── state manajemen + validasi + UI input + UI ringkasan + pemanggilan API

SESUDAH (terpisah dengan benar):
fitur/pesanan/
  ├── komponen/
  │   ├── formulir-pesanan.jsx        ← Hanya rendering UI form
  │   └── ringkasan-pesanan.jsx       ← Hanya rendering UI ringkasan
  ├── kait/
  │   ├── use-formulir-pesanan.js     ← State & validasi form
  │   └── use-kirim-pesanan.js        ← Logika submit & loading state
  └── layanan/
      └── api-pesanan.js              ← Fetch, POST, error handling
```

---

## 2. Prinsip Pemisahan (What Goes Where)

| Lapisan | Lokasi | Boleh Berisi | Tidak Boleh Berisi |
| :--- | :--- | :--- | :--- |
| **Komponen UI** | `komponen/` | JSX, styling, event handler sederhana | Fetch API, logika bisnis kompleks, state server |
| **Custom Hook** | `kait/` | State, useEffect, side effects, logika bisnis | JSX/markup, styling |
| **Layanan API** | `layanan/` | Fetch/axios calls, transformasi response, error mapping | State, JSX, logika UI |
| **Utilitas** | `utilitas/` | Fungsi murni (pure functions) tanpa side effects | State, API calls, React hooks |
| **Tipe/Interface** | `tipe/` | TypeScript types, interfaces, enums, zod schemas | Logic, API calls |

---

## 3. Konvensi Penamaan Bahasa Indonesia (Aturan Wajib)

### Komponen React
```jsx
// Benar — PascalCase Bahasa Indonesia
export function KartuProduk() {}
export function FormulirPendaftaran() {}
export function BilahNavigasiUtama() {}
export function ModalKonfirmasiHapus() {}

// Salah
export function ProductCard() {}
export function RegistrationForm() {}
```

### Variabel, State, Props
```js
// Benar — camelCase Bahasa Indonesia
const [daftarProduk, setDaftarProduk] = useState([])
const [statusMemuat, setStatusMemuat] = useState(false)
const [pesanError, setPesanError] = useState(null)
const [modalTerbuka, setModalTerbuka] = useState(false)
const hargaTampilan = formatRupiah(hargaAsli)

// Salah
const [productList, setProductList] = useState([])
const [isLoading, setIsLoading] = useState(false)
```

### Custom Hook
```js
// Benar — camelCase dengan awalan use + Bahasa Indonesia
function useDaftarProduk(kategoriId) {}
function useKeranjangBelanja() {}
function usePaginasiTabel(totalData) {}
function useDebounce(nilai, tundaan) {}

// Salah
function useProductList() {}
function useShoppingCart() {}
```

### Fungsi & Handler
```js
// Benar — camelCase Bahasa Indonesia, deskriptif
function hitungTotalHarga(daftarItem) {}
function formatRupiah(angka) {}
function validasiEmailPengguna(email) {}
const tanganiKlikSimpan = async () => {}
const tanganiPerubahanInput = (e) => {}
const tanganiTutupModal = () => {}

// Salah
function calculateTotal() {}
function handleSave() {}
```

### ID & Class HTML / CSS
```jsx
// Benar — kebab-case Bahasa Indonesia
<div id="formulir-pendaftaran">
<button id="tombol-simpan-profil">
<section className="bagian-hero">
<nav className="menu-navigasi-utama">

// Salah
<div id="registration-form">
<button id="save-button">
```

### Tabel & Kolom Database
```sql
-- Benar — snake_case Bahasa Indonesia
CREATE TABLE pengguna (
  id UUID PRIMARY KEY,
  nama_lengkap VARCHAR(255),
  alamat_email VARCHAR(255) UNIQUE,
  kata_sandi_hash TEXT,
  tanggal_daftar TIMESTAMPTZ DEFAULT NOW(),
  status_aktif BOOLEAN DEFAULT TRUE
);

CREATE TABLE pesanan (
  id UUID PRIMARY KEY,
  id_pengguna UUID REFERENCES pengguna(id),
  total_harga DECIMAL(15,2),
  status_pesanan VARCHAR(50),
  tanggal_dibuat TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Pola Barrel Export (Public API per Modul)

Setiap direktori fitur wajib memiliki `index.ts` yang mengekspos API publiknya:

```ts
// fitur/autentikasi/index.ts
// Hanya ekspor apa yang perlu diakses dari luar modul ini
export { FormulirLogin } from './komponen/formulir-login'
export { TombolKeluarAkun } from './komponen/tombol-keluar-akun'
export { useStatusAutentikasi } from './kait/use-status-autentikasi'
export type { DataPengguna } from './tipe/skema-autentikasi'
// JANGAN ekspor internal detail implementation
```

---

## 5. Larangan Pola Anti-Pattern

| Anti-Pattern | Mengapa Dilarang | Pola yang Benar |
| :--- | :--- | :--- |
| Prop drilling > 2 level | Membuat dependensi yang rapuh antar komponen | Gunakan Context API atau Zustand store |
| Fetch data langsung di komponen | Mencampur UI dengan logika server | Pindahkan ke custom hook atau TanStack Query |
| `any` di TypeScript | Menghilangkan keuntungan type safety | Definisikan interface/type yang proper |
| `useEffect` untuk derive state | Menyebabkan render ganda & bug halus | Gunakan `useMemo` atau komputasi langsung |
| Mutate props/state secara langsung | Menyebabkan bug rendering yang susah dilacak | Buat salinan baru (spread operator/immer) |
