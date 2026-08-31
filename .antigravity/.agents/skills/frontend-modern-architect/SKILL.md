---
name: frontend-modern-architect
description: >-
  Gunakan skill ini saat merancang arsitektur aplikasi web modern (React, Next.js, Vite),
  mengatur manajemen state, memisahkan logika bisnis dan antarmuka, menyusun folder berbasis fitur,
  mengoptimalkan performa rendering, dan memilih library yang tepat untuk kebutuhan tim.
  Aktifkan juga saat setup proyek baru atau ketika ada kebingungan soal struktur folder.
---

# Panduan Arsitektur Frontend Modern & Rekayasa Web

Skill ini menyediakan **pola arsitektur yang dapat langsung dieksekusi** untuk membangun aplikasi frontend yang scalable, dapat diuji secara independen, dan mudah dipelihara oleh tim lintas waktu.

---

## Langkah 1: Setup Proyek Baru (Checklist Urutan Wajib)

Ikuti urutan ini setiap membuat proyek baru:

```bash
# 1. Buat proyek
npx create-next-app@latest nama-proyek --typescript --tailwind --app --src-dir --import-alias "@/*"
# ATAU untuk Vite:
npm create vite@latest nama-proyek -- --template react-ts

# 2. Install dependency standar tim
npm install zustand @tanstack/react-query @tanstack/react-query-devtools
npm install lucide-react class-variance-authority clsx tailwind-merge
npm install zod react-hook-form @hookform/resolvers

# 3. Install dependency development
npm install -D @types/node prettier eslint-config-prettier

# 4. Buat folder struktur standar (jalankan dari root proyek)
mkdir -p src/{aset,komponen/{ui,tata-letak,bersama},fitur,kait,layanan,utilitas,gaya,tipe}
```

---

## Langkah 2: Utilitas Wajib (Copy Sebelum Mulai)

### `src/utilitas/cn.ts` — Gabungkan Kelas Tailwind
```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Menggabungkan dan menyelesaikan konflik kelas Tailwind CSS */
export function cn(...masukan: ClassValue[]): string {
  return twMerge(clsx(masukan))
}
```

### `src/utilitas/format.ts` — Formatter Umum
```ts
/** Format angka menjadi mata uang Rupiah */
export function formatRupiah(angka: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(angka)
}

/** Format tanggal ke format lokal Indonesia */
export function formatTanggal(tanggal: Date | string, opsi?: Intl.DateTimeFormatOptions): string {
  const objTanggal = typeof tanggal === 'string' ? new Date(tanggal) : tanggal
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    ...opsi,
  }).format(objTanggal)
}

/** Format angka dengan pemisah ribuan */
export function formatAngka(angka: number): string {
  return new Intl.NumberFormat('id-ID').format(angka)
}

/** Potong teks panjang dengan elipsis */
export function potongTeks(teks: string, panjangMaksimal: number): string {
  if (teks.length <= panjangMaksimal) return teks
  return teks.slice(0, panjangMaksimal).trimEnd() + '...'
}
```

---

## Langkah 3: Setup TanStack Query (State Server)

```tsx
// src/komponen/tata-letak/penyedia-aplikasi.tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function PenyediaAplikasi({ children }: { children: React.ReactNode }) {
  const [klienQuery] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,        // 1 menit — data dianggap segar
          gcTime: 5 * 60 * 1000,       // 5 menit — cache dibersihkan
          retry: 1,                     // Coba ulang 1 kali jika gagal
          refetchOnWindowFocus: false,  // Jangan refetch saat fokus ke tab
        },
      },
    })
  )

  return (
    <QueryClientProvider client={klienQuery}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

### Pola Custom Hook dengan TanStack Query
```ts
// src/fitur/produk/kait/use-daftar-produk.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ambilDaftarProduk, hapusProduk } from '../layanan/api-produk'
import type { ParameterFilterProduk } from '../tipe/skema-produk'

// Kunci query yang terpusat (untuk invalidasi yang konsisten)
export const kunciQueryProduk = {
  semua: ['produk'] as const,
  daftar: (filter: ParameterFilterProduk) => ['produk', 'daftar', filter] as const,
  detail: (id: string) => ['produk', 'detail', id] as const,
}

export function useDaftarProduk(filter: ParameterFilterProduk) {
  return useQuery({
    queryKey: kunciQueryProduk.daftar(filter),
    queryFn: () => ambilDaftarProduk(filter),
    placeholderData: (dataSaatIni) => dataSaatIni, // Pertahankan data lama saat filter berubah
  })
}

export function useHapusProduk() {
  const klienQuery = useQueryClient()

  return useMutation({
    mutationFn: hapusProduk,
    onSuccess: () => {
      // Invalidasi semua query produk setelah hapus berhasil
      klienQuery.invalidateQueries({ queryKey: kunciQueryProduk.semua })
    },
    onError: (error) => {
      console.error('[PRODUK] Gagal menghapus produk:', error.message)
    },
  })
}
```

---

## Langkah 4: Pola API Service Layer

```ts
// src/fitur/produk/layanan/api-produk.ts
import type { Produk, ParameterFilterProduk, HasilPaginasi } from '../tipe/skema-produk'

const ENDPOINT_DASAR = '/api/produk'

/** Ambil daftar produk dengan filter dan paginasi */
export async function ambilDaftarProduk(
  filter: ParameterFilterProduk
): Promise<HasilPaginasi<Produk>> {
  const parameterURL = new URLSearchParams()
  if (filter.halaman) parameterURL.set('halaman', String(filter.halaman))
  if (filter.kategori) parameterURL.set('kategori', filter.kategori)
  if (filter.pencarian) parameterURL.set('q', filter.pencarian)

  const respons = await fetch(`${ENDPOINT_DASAR}?${parameterURL}`)

  if (!respons.ok) {
    const dataError = await respons.json().catch(() => ({}))
    throw new Error(dataError.pesan ?? `Gagal memuat produk (${respons.status})`)
  }

  return respons.json()
}

/** Hapus produk berdasarkan ID */
export async function hapusProduk(idProduk: string): Promise<void> {
  const respons = await fetch(`${ENDPOINT_DASAR}/${idProduk}`, {
    method: 'DELETE',
  })

  if (!respons.ok) {
    const dataError = await respons.json().catch(() => ({}))
    throw new Error(dataError.pesan ?? `Gagal menghapus produk (${respons.status})`)
  }
}
```

---

## Langkah 5: Pola Error Boundary per Fitur

```tsx
// src/komponen/bersama/batas-error.tsx
'use client'
import { Component, type ReactNode } from 'react'

interface PropsBatasError {
  children: ReactNode
  penanganan?: ReactNode
}

interface StateBatasError {
  adaError: boolean
  pesan: string
}

export class BatasError extends Component<PropsBatasError, StateBatasError> {
  state: StateBatasError = { adaError: false, pesan: '' }

  static getDerivedStateFromError(error: Error): StateBatasError {
    return { adaError: true, pesan: error.message }
  }

  componentDidCatch(error: Error) {
    console.error('[BatasError] Error tertangkap:', error.message)
  }

  render() {
    if (this.state.adaError) {
      return this.props.penanganan ?? (
        <div className="p-6 text-center">
          <p className="text-bahaya font-medium">Terjadi kesalahan saat memuat konten ini.</p>
          <button
            className="mt-3 text-sm text-redup-teks underline"
            onClick={() => this.setState({ adaError: false, pesan: '' })}
          >
            Coba lagi
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

---

## Validasi Checkpoint

Sebelum menyatakan fitur baru selesai:
- [ ] Custom hook sudah terpisah dari komponen UI
- [ ] Service layer sudah terpisah dari custom hook
- [ ] Error dari API ditangani dengan pesan yang bermakna
- [ ] Loading state ada di semua operasi async
- [ ] Tidak ada file yang melebihi 250 baris
- [ ] TypeScript tidak ada error (`npx tsc --noEmit`)
