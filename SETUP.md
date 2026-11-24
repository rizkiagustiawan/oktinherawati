# SETUP — Aktivasi Tes (10 menit, sekali saja)

## 1. Backend Google Sheets — SUDAH AKTIF ✅ (14 Okt 2026)

- Web App URL sudah terpasang di `site/config.js`.
- Sheet data kanonik: **"OKTIN Listening Responses"** (tab `Responses` + `Items`).
- Sudah lolos tes end-to-end (POST simulasi siswa → data masuk, dedup WA aktif).
- Untuk deploy ulang backend di masa depan: edit `apps-script/Code.gs`, push via
  `gws script +push`, buat version baru, lalu **Deploy → Manage deployments → edit → versi baru**.

---

## 1b. (ARSIP) Aktivasi manual — tidak diperlukan lagi

1. Buka **https://script.google.com** (login akun Google Oktin/peneliti).
2. **New project** → hapus isi `Code.gs` → tempel seluruh isi file `Code.gs` dari repo ini.
3. Klik **Run** → pilih fungsi `setup` → **Review permissions → Allow**.
   → Muncul log "Sheet dibuat: <link>" — itu Google Sheet tempat semua jawaban terkumpul.
4. **Deploy → New deployment → ⚙ Web app**:
   - Description: `oktin-listening`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik **Deploy** → copy **Web App URL** (diakhiri `/exec`).
5. Buka `site/config.js`, isi:
   ```js
   sheetsEndpoint: "https://script.google.com/macros/s/XXXX/exec",
   whatsappTarget: "6281234567890",   // nomor WA Oktin (opsional, tombol fallback)
   ```
6. Commit + push → Vercel deploy ulang otomatis.

**Cek cepat:** buka Web App URL di browser → harus tampil `{"ok":true,"service":"oktin-listening",...}`.

## 2. Deploy ke Vercel (sudah selesai oleh asisten)

```bash
cd site && vercel --prod --yes
```

## 3. Uji coba sebelum hari-H

- Buka URL Vercel dengan `?reset=1` (reset attempt-lock untuk nomor WA yang sama saat debugging).
- Ikuti tes sampai selesai → cek Google Sheet "Responses" + "Items".
- Buat 2–3 akun dummy untuk verifikasi skor & breakdown per tipe kalimat (simple/compound).
- Tes sekarang **35 item** (18 simple + 17 compound), semua tanya jawab implicature. Sesuai proposal final: **tidak ada kuesioner post-test** di aplikasi; draft kuesioner pelengkap opsional tersedia di `draft_kuesioner_tantangan_listening.pdf` (belum diaktifkan).

## 4. Hari-H (35 item tes · 35 mahasiswa Pendidikan Bahasa Inggris UNRAM)

- Bagikan **link pendek** (Vercel URL) + minta pakai headphone.
- Satu attempt per nomor WA — pastikan peserta pakai nomor masing-masing.
- Kalau ada yang salah format WA saat daftar → kirim ulang link dengan `?reset=1&wa=08xx` (khusus debugging; hapus param saat sesi resmi).
- Setelah selesai semua: buka Google Sheet → File → Download → Excel/CSV → masuk ke tabel analisis bab 3.6 (percentage of error per kategori).

## 5. Catatan integritas (jujur, penting untuk pembimbing)

Anti-cheat sisi klien bersifat **pencegah + pencatat**, bukan keamanan absolut:
- Fullscreen + deteksi pindah tab + blokir copy = mencegah kebanyakan celah umum.
- Pelanggaran **dicatat** (jumlah + waktu kejadian) dan terkirim bersama hasil — bukan mem-block tes, supaya data tetap lengkap dan penguji bisa menilai validitas per-partisipan.
- Pretest sebaiknya tetap **diawasi** (lab bahasa) sesuai prosedur bab 3.5 — platform ini memang dirancang untuk sesi yang diawasi atau semi-awasi.

## 6. Unit test & E2E (jaga data tidak hilang)

Jalankan sebelum mengubah `Code.gs` atau `site/`:

```bash
npm test                  # 33 tes: flow frontend + kontrak backend + integrasi
node --test tests/        # sama, tanpa package.json
```

- `tests/e2e-flow.test.js` — alur peserta: isi form → 35 soal → submit; memastikan
  payload terkirim lengkap (35 item, skor per tipe, dedup, timer, audio sekali).
- `tests/backend.test.js` — kontrak `Code.gs`: baris Responses/Items tersimpan,
  dedup lintas format WA, migrasi header lama, 100 submit tanpa kehilangan data.
- `tests/integration.test.js` — menjembatani payload frontend nyata → backend.

⚠️ `tests/` hanya berjalan lokal di Node (DOM/Spreadsheet di-stub). Ini bukan
pengganti uji browser, tapi penjaga regresi supaya data selalu masuk sheet.

## 7. Tes live ke Google Sheets (opt-in)

Tes yang benar-benar membaca spreadsheet (menangkap bug yang tak bisa ditiru stub,
misalnya **leading zero WA dikonversi jadi angka** oleh Sheets):

```bash
gws auth login -s sheets,drive,script      # sekali saja
npm run test:live                          # atau: LIVE=1 node --test tests/live-sheet.test.js
```

Memeriksa: WA tersimpan `08...`, header 13/7 kolom, dan `Items = Responses × 35`.
Jalankan sebelum hari-H dan setelah setiap deploy `Code.gs`.
