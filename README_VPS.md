# 🚀 Panduan Setup Bot WhatsApp Jajan Digital di VPS
### Dari Nol Sampai Berjalan — Ubuntu Server

---

> [!IMPORTANT]
> **Spesifikasi VPS Minimum yang Direkomendasikan:**
> - RAM: **2 GB** (minimum), 4 GB (rekomendasi)
> - CPU: **1 Core** (minimum), 2 Core (rekomendasi)
> - Storage: **20 GB** SSD
> - OS: **Ubuntu 22.04 / 24.04 LTS**
> - Bandwidth: 1 TB/bulan

---

## 📋 Daftar Isi

1. [Koneksi ke VPS](#1-koneksi-ke-vps)
2. [Update Sistem](#2-update-sistem)
3. [Install Node.js](#3-install-nodejs)
4. [Install Google Chrome (Headless)](#4-install-google-chrome-headless)
5. [Clone Repository dari GitHub](#5-clone-repository-dari-github)
6. [Install Dependencies Bot](#6-install-dependencies-bot)
7. [Restore Data dari Backup](#7-restore-data-dari-backup-opsional)
8. [Menjalankan Bot](#8-menjalankan-bot)
9. [Akses Dashboard dari Luar](#9-akses-dashboard-dari-luar)
10. [Agar Bot Jalan Terus (PM2)](#10-agar-bot-jalan-terus-pm2)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Koneksi ke VPS

Buka terminal di PC (Windows pakai **PuTTY** atau **Windows Terminal**):

```bash
ssh phuser@IP_SERVER_KAMU
# Contoh:
ssh phuser@103.xxx.xxx.xxx
```

Masukkan password VPS saat diminta. Setelah masuk, Bos akan melihat prompt:
```
phuser@bagas-ganteng:~$
```

---

## 2. Update Sistem

Selalu update sistem dulu sebelum install apapun:

```bash
sudo apt update && sudo apt upgrade -y
```

> [!NOTE]
> Proses ini bisa memakan waktu 2-5 menit tergantung koneksi server.

---

## 3. Install Node.js

Bot membutuhkan **Node.js versi 18 atau lebih baru**. Gunakan NodeSource untuk install versi terbaru:

```bash
# Tambahkan repository NodeSource (Node.js 20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verifikasi instalasi
node --version   # Harus muncul: v20.x.x
npm --version    # Harus muncul: 10.x.x
```

---

## 4. Install Google Chrome (Headless)

Bot menggunakan Chrome untuk menjalankan WhatsApp Web. **Ini wajib dipasang!**

```bash
# Install dependensi Chrome
sudo apt install -y wget gnupg ca-certificates

# Tambahkan repository Google Chrome
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list

# Install Chrome
sudo apt update
sudo apt install -y google-chrome-stable

# Verifikasi
google-chrome --version
# Harus muncul: Google Chrome 12x.x.x.x
```

**Cek lokasi Chrome (penting untuk config):**
```bash
which google-chrome-stable
# Output: /usr/bin/google-chrome-stable
```

> [!IMPORTANT]
> Catat path Chrome ini! Akan dipakai di langkah konfigurasi nanti.

---

## 5. Clone Repository dari GitHub

```bash
# Pindah ke folder home
cd ~

# Clone repository bot
git clone https://github.com/bagasoffice02-haha/wa_gatewaygrup.git

# Masuk ke folder bot
cd wa_gatewaygrup

# Cek isi folder
ls -la
```

---

## 6. Install Dependencies Bot

```bash
# Install semua package yang dibutuhkan
npm install

# Proses ini memakan waktu 2-5 menit
# Tunggu sampai selesai (muncul "added XXX packages")
```

---

## 7. Restore Data dari Backup (Opsional)

> [!TIP]
> Lewati bagian ini jika Bos ingin setup dari awal (baru). Lanjut ke [Langkah 8](#8-menjalankan-bot).

### Jika punya file backup (.zip) dari fitur Export dashboard:

**Cara A — Upload via Dashboard (Paling Mudah):**
1. Jalankan bot dulu (Langkah 8) → scan QR → buka dashboard
2. Masuk Settings → card **"Import / Restore Backup"**
3. Upload file .zip backup → klik **"Mulai Restore Data"**
4. Restart bot setelah selesai

**Cara B — Upload via SCP dari PC:**
```bash
# Di PC (PowerShell/Terminal), upload file backup:
scp "C:\Users\Administrator\Downloads\backup-jajan-digital-xxx.zip" phuser@IP_SERVER:~/wa_gatewaygrup/

# Di VPS, ekstrak file:
cd ~/wa_gatewaygrup
unzip backup-jajan-digital-xxx.zip -d ./restore_temp

# Copy file-file penting:
cp restore_temp/config.json ./config.json
cp restore_temp/database.sqlite ./database.sqlite
cp restore_temp/presets.json ./presets.json
cp -r restore_temp/knowledge ./knowledge
cp -r restore_temp/media ./media

# Opsional (jika bawa sesi WA):
cp -r restore_temp/session ./session

# Hapus folder temp
rm -rf restore_temp backup-jajan-digital-xxx.zip
```

---

## 8. Menjalankan Bot

### 8a. Konfigurasi dulu (WAJIB!)

Edit file konfigurasi:
```bash
nano config.json
```

Ubah bagian berikut:

```json
{
  "puppeteer_executable_path": "/usr/bin/google-chrome-stable",
  "admin_username": "admin",
  "admin_password": "PASSWORD_KUAT_KAMU",
  "provider": "groq",
  "groq_api_keys": [
    "gsk_xxxxxxxxxxxxxxxx",
    "gsk_yyyyyyyyyyyyyyyy"
  ],
  "groq_model": "llama-3.3-70b-versatile"
}
```

Simpan dengan **Ctrl+X** → **Y** → **Enter**

### 8b. Jalankan Bot (Test Mode)

```bash
node index.js
```

Jika berhasil, akan muncul:
```
======================================================
Web Dashboard CS Aktif di: http://localhost:3000
======================================================

SILAKAN SCAN QR CODE BERIKUT DENGAN APLIKASI WHATSAPP:
[QR CODE MUNCUL DI SINI]
```

**Scan QR** menggunakan WhatsApp di HP:
- Buka WhatsApp → **⋮** → **Perangkat Tertaut** → **Tautkan Perangkat** → Scan QR

Jika berhasil konek:
```
Chatbot WhatsApp AI Lokal (Qwen) Berhasil Tersambung!
```

Tekan **Ctrl+C** untuk stop (sementara).

---

## 9. Akses Dashboard dari Luar

### 9a. Buka Port di Firewall VPS

```bash
# Izinkan port 3000
sudo ufw allow 3000/tcp
sudo ufw enable
sudo ufw status
```

### 9b. Akses Dashboard

Buka browser di HP/PC:
```
http://IP_SERVER_KAMU:3000
```

Contoh: `http://103.xxx.xxx.xxx:3000`

Login dengan username & password yang ada di `config.json`.

> [!TIP]
> Untuk keamanan lebih, Bos bisa pakai **Cloudflare Tunnel** agar dashboard bisa diakses via domain tanpa buka port (dijelaskan di bagian Troubleshooting).

---

## 10. Agar Bot Jalan Terus (PM2)

Tanpa PM2, bot akan berhenti saat Bos menutup terminal SSH. Gunakan **PM2** agar bot berjalan terus di background.

### Install PM2:
```bash
sudo npm install -g pm2
```

### Jalankan bot dengan PM2:
```bash
cd ~/wa_gatewaygrup
pm2 start index.js --name "jajan-digital-bot"
```

### Perintah PM2 yang sering dipakai:

| Perintah | Fungsi |
|---|---|
| `pm2 status` | Lihat status semua bot |
| `pm2 logs jajan-digital-bot` | Lihat log bot secara real-time |
| `pm2 restart jajan-digital-bot` | Restart bot |
| `pm2 stop jajan-digital-bot` | Stop bot |
| `pm2 delete jajan-digital-bot` | Hapus dari PM2 |

### Agar bot auto-start saat VPS reboot:
```bash
pm2 startup
# Ikuti instruksi yang muncul (copy-paste perintah yang dikasih)

pm2 save
# Simpan daftar process
```

---

## 11. Troubleshooting

### ❌ Error: Chrome tidak ditemukan
```bash
# Cek ulang path Chrome
which google-chrome-stable
ls /usr/bin/google-chrome*

# Update config.json dengan path yang benar
nano config.json
```

### ❌ Error: ENOSPC (kehabisan disk)
```bash
df -h          # Cek penggunaan disk
du -sh *       # Cek folder mana yang besar
```

### ❌ Error: Cannot find module 'xxx'
```bash
cd ~/wa_gatewaygrup
npm install    # Install ulang dependencies
```

### ❌ Error: `GLIBC_2.38' not found (sqlite3)
Error ini terjadi karena Bos menyalin folder `node_modules` dari Windows/sistem lain langsung ke VPS. Modul native C++ seperti `sqlite3` harus dikompilasi ulang sesuai versi Linux VPS Bos.
```bash
# Masuk ke folder bot
cd ~/wa_gatewaygrup

# Hapus folder node_modules & lock file lama
rm -rf node_modules package-lock.json

# Install dependencies bersih di VPS
npm install

# Jika masih error, kompilasi manual sqlite3:
npm install sqlite3 --build-from-source
```

### ❌ Bot berhenti sendiri / crash
```bash
pm2 logs jajan-digital-bot --lines 50   # Lihat 50 baris log terakhir
pm2 restart jajan-digital-bot            # Restart bot
```

### ❌ QR Code tidak muncul
```bash
# Hapus sesi lama dan mulai ulang
rm -rf session/
node index.js   # atau: pm2 restart jajan-digital-bot
```

### ❌ Dashboard tidak bisa diakses dari luar
```bash
# Pastikan firewall mengizinkan port 3000
sudo ufw allow 3000/tcp
sudo ufw status

# Cek bot berjalan di port 3000
ss -tlnp | grep 3000
```

### ❌ RAM penuh (OOM)
```bash
free -h        # Cek penggunaan RAM

# Tambahkan SWAP sebagai RAM virtual (darurat)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 📌 Ringkasan Perintah Penting

```bash
# Masuk ke folder bot
cd ~/wa_gatewaygrup

# Jalankan bot (test)
node index.js

# Jalankan dengan PM2 (production)
pm2 start index.js --name "jajan-digital-bot"

# Restart bot
pm2 restart jajan-digital-bot

# Lihat log
pm2 logs jajan-digital-bot

# Update bot dari GitHub
git pull origin main
npm install
pm2 restart jajan-digital-bot
```

---

## 🔄 Cara Update Bot Setelah Ada Perubahan Kode

Setiap kali Bos update kode di PC dan push ke GitHub:

```bash
cd ~/wa_gatewaygrup
git pull origin main   # Ambil kode terbaru
npm install            # Update dependencies jika ada yang baru
pm2 restart jajan-digital-bot  # Restart bot
```

---

> [!NOTE]
> **Akses Dashboard:** `http://IP_SERVER:3000`
> 
> **Repo GitHub:** `https://github.com/bagasoffice02-haha/wa_gatewaygrup`
> 
> **Provider AI Default:** Groq (llama-3.3-70b-versatile)
