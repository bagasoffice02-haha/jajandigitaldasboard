# Blueprint Konfigurasi Antigravity Enterprise (Web Dev & UI/UX Specialist)

Repositori ini adalah template patokan (*golden standard boilerplate*) yang berisi konfigurasi lengkap **Rules**, **Skills**, **MCP Integration**, dan **Strategi Vibe Coding** untuk Antigravity.

---

## Struktur Direktori

```text
.antigravity/
├── .agents/
│   ├── AGENTS.md                                # Master Rules Workspace (Pagar Pengaman Eksekusi)
│   ├── rules/
│   │   ├── 01_radikal_kejujuran_dan_perencanaan.md # Anti Blind-Compliance & Konsultasi Risiko
│   │   ├── 02_standar_ui_ux_anti_slop.md        # Standar Visual Taste, WCAG AAA/AA, Anti AI-Slop
│   │   ├── 03_arsitektur_modular_frontend.md   # Clean Code, Feature-Sliced Pattern, File Splitting
│   │   ├── 04_memori_dan_pelacak_bug.md         # Protokol Pencatatan State & Error Real-time
│   │   └── 05_protokol_kolaborasi_tim_git.md    # Standar Komit Git & Harmonisasi Kerja Tim
│   ├── skills/
│   │   ├── ui-ux-design-system-pro/             # Skill Design System & Token Tailwind CSS
│   │   │   └── SKILL.md
│   │   ├── frontend-modern-architect/           # Skill Arsitektur Frontend Modular (React/Next.js)
│   │   │   └── SKILL.md
│   │   ├── web-accessibility-wcag/              # Skill Audit Aksesibilitas, Semantik & Kontras
│   │   │   └── SKILL.md
│   │   └── mcp-autonomous-orchestrator/         # Skill Integrasi & Panggilan MCP Otomatis
│   │       └── SKILL.md
│   ├── mcp/
│   │   ├── mcp_config.json.template             # Template Konfigurasi Server MCP Teruji
│   │   └── panduan_instalasi_mcp.md             # Panduan Step-by-Step Setup MCP Lokal/Global
│   └── templates/
│       ├── template_prd.md                      # Template PRD untuk Spesifikasi Fitur
│       ├── template_memori_proyek.md            # Template State & Kemajuan Proyek
│       └── template_catatan_bug.md              # Template Pelacak Bug Real-time
├── README.md                                    # Petunjuk Penggunaan Blueprint Ini
└── panduan_strategi_vibe_coding.md              # Mental Model & Taktik Developer Pro + Tim
```

---

## Cara Menggunakan Folder Ini untuk Proyek Baru

1. **Salin Folder `.agents/`**:
   Salin folder `.agents/` ini langsung ke root repositori proyek web baru Anda (Next.js, Vite, React, Vue, Laravel, dll.).
2. **Aktifkan MCP Server**:
   Salin konfigurasi dari `.agents/mcp/mcp_config.json.template` ke file konfigurasi global Antigravity Anda (`~/.gemini/config/mcp_config.json`).
3. **Mulai dengan PRD & Rencana**:
   Buat file PRD berdasarkan `template_prd.md`, lalu minta Antigravity menyusun rencana implementasi sebelum menulis kode.
4. **Jalankan Verifikasi Browser**:
   Gunakan dev server lokal dan biarkan AI memverifikasi hasil render secara mandiri menggunakan `take_snapshot` dari Chrome DevTools MCP.

---

## Ringkasan Dokumen Pendukung

- [Panduan Strategi Vibe Coding](file:///C:/Users/bagas/Desktop/.antigravity/panduan_strategi_vibe_coding.md): Bacaan wajib untuk memahami cara mengontrol AI agar tidak halusinasi dan memiliki *taste* desain tingkat tinggi.
- [Panduan Instalasi MCP](file:///C:/Users/bagas/Desktop/.antigravity/.agents/mcp/panduan_instalasi_mcp.md): Cara mengintegrasikan Shadcn, Chrome DevTools, Postgres, dan Context7 ke IDE Anda.
