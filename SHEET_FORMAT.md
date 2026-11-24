# Format Google Sheets (Skema v3) — Pengumpulan Data sampai Selesai Skripsi

Backend `Code.gs` sekarang menulis **SATU BARIS per peserta** di sheet **`Responses`**.
Tidak ada lagi sheet "Items" (yang dulu memakai 35 baris per peserta → boros).

## 1. Struktur sheet `Responses` (30 kolom)

| Kolom | Nama | Isi |
|---|---|---|
| 1 | timestamp | Waktu submit (ISO dari `meta.finished_at`) |
| 2 | nama | Nama peserta |
| 3 | wa | Nomor WA, dinormalisasi ke format 08xx (teks, leading zero aman) |
| 4 | semester | Semester (4–7) |
| 5 | toefl_score | Skor TOEFL terbaru (kriteria: < 500) |
| 6 | toefl_type | Jenis tes: ITP/PBT / iBT / Belum pernah |
| 7 | section_high | Section nilai tertinggi (Listening / Structure & Written Expression / Reading) |
| 8 | section_low | Section nilai terendah |
| 9–18 | q01…q10 | 10 jawaban Likert 1–5 (kuesioner) |
| 19 | o1 | Pertanyaan terbuka 1 (tipe kalimat lebih sulit) |
| 20 | o2 | Pertanyaan terbuka 2 (saran) |
| 21 | total | Skor tes (benar dari 35) |
| 22 | percent | Persentase benar |
| 23 | simple | Breakdown simple: benar/jumlah (%) |
| 24 | compound | Breakdown compound: benar/jumlah (%) |
| 25 | duration_sec | Durasi mengerjakan (detik) |
| 26 | violations | Jumlah pelanggaran integritas |
| 27 | violation_log | Log pelanggaran (JSON string) |
| 28 | user_agent | Browser peserta |
| 29 | test_version | Versi instrumen |
| 30 | items_json | **JSON**: rincian 35 item `[{i, t, c, k}]` — i=id item, t=simple/compound, c=jawaban dipilih, k=1 benar / 0 salah |

## 2. Keuntungan format ini

- **Hemat**: 35 peserta = 35 baris (bukan 1.225 baris) + 1 kolom JSON.
- **Semua data satu tempat**: identitas, kuesioner, skor, dan rincian item dalam satu baris — tidak perlu VLOOKUP antar-sheet.
- **Mudah dianalisis**: cocok langsung untuk Excel/SPSS/Google Sheets pivot.
- **Migrasi otomatis**: data lama (skema v1/v2) ikut dirapikan ke v3 saat POST berikutnya masuk.

## 3. Tips saat pengumpulan (Hari-H)

1. **Freeze baris 1**: `View → Freeze → 1 row` supaya header selalu terlihat.
2. **Filter view**: buat Filter View per sesi/kelas agar tidak mengganggu data asli.
3. **Validasi cepat**: kolom `toefl_score` → filter angka ≥ 500 untuk menandai kandidat yang tidak memenuhi kriteria.
4. **Cek duplikat**: kolom `wa` → highlight duplikat (harusnya tidak ada karena backend menolak WA sama).
5. **Aman**: jangan share spreadsheet ke publik; hanya peneliti & pembimbing.

## 4. Alur analisis s.d. skripsi

### a. Ekspor
`File → Download → Excel (.xlsx)` atau `CSV`.

### b. Rekap ringkas (langsung dari kolom)
- `percent`, `simple`, `compound` → tabel deskriptif Bab 4 (rata-rata, distribusi).
- `toefl_score`, `section_high`, `section_low` → profil peserta (Bab 4, data latar).
- `q01…q10` → rata-rata per dimensi kuesioner (Bab 4, persepsi).

### c. Analisis pola kesalahan per tipe kalimat (Bab 3.6)
Parsing kolom `items_json` (mis. dengan Python):

```python
import json, pandas as pd

df = pd.read_excel("responses.xlsx")
rows = []
for _, r in df.iterrows():
    for it in json.loads(r["items_json"]):
        rows.append({"wa": r["wa"], "item": it["i"], "type": it["t"],
                     "ok": it["k"]})
long = pd.DataFrame(rows)

# persentase kesalahan per tipe kalimat
long.groupby("type")["ok"].agg(["count", "mean"])   # mean = proporsi benar

# item dengan error tertinggi
long[long["ok"] == 0].groupby("item").size().sort_values(ascending=False)
```

Di Excel: `Data → From Table/Range` pada kolom items_json tidak langsung; gunakan Power Query untuk split JSON, atau cukup pakai skrip di atas.

### d. Korelasi (opsional)
Hubungkan `section_low == "Listening"` dengan pola error item listening untuk triangulasi.

## 5. Catatan teknis

- Backend baru = **v3**. URL deployment Apps Script lama (yang `…/exec` di `site/config.js`) **sudah tidak aktif** — deploy ulang `Code.gs` ini dan ganti URL di `site/config.js` sebelum pengumpulan resmi.
- Web app saat ini **belum** mengirim data kuesioner (q01…q10, o1/o2, toefl_*). Kolom itu akan terisi otomatis setelah fitur kuesioner diintegrasikan ke aplikasi; sementara itu kolomnya kosong.
- Test backend disesuaikan ke v3: jalankan `npm test` (butuh Node.js) sebelum deploy.
