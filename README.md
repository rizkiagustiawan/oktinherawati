# TOEFL-Like Listening Part A — Conversational Implicature

Instrumen tes listening online untuk skripsi:
**"Implicatures and Male Students' Challenges in TOEFL-Like Listening"** — Oktin Herawati, Pendidikan Bahasa Inggris, Universitas Mataram.

## Spesifikasi (sesuai proposal + revisi Week 3)

| Komponen | Nilai |
|---|---|
| Jenis tes | TOEFL-like Listening Comprehension Part A (short conversations) |
| Item | **30** — 15 complex sentence + 15 simple sentence (semua conversational implicature) |
| Tag tambahan | setiap item bertag `deixis` / `reference` (untuk analisis bab 3.6 bila perlu) |
| Pembicara audio | 3 suara British native-like: Narator (Thomas) · Pria (Ryan) · Wanita (Sonia) — Microsoft Edge Neural TTS, 24 kHz |
| Aturan audio | diputar **sekali saja** (karakteristik TOEFL), lalu timer **30 detik** per soal |
| Pilihan jawaban | A, B, C, D (di-shuffle per siswa, seed = nomor WA) |
| Form peserta | Nama · Nomor WA aktif · Semester (validasi 4–7, sesuai kriteria subjek) |
| Skor | otomatis + breakdown simple/complex × deixis/reference |
| Kuesioner | 12 item post-test (10 Likert 1–5 + 2 pilihan) sesuai bab 3.5 |
| Anti-cheat | fullscreen wajib, deteksi pindah tab/blur, blokir copy/right-click/devtools-key, 1 attempt per nomor WA, log pelanggaran terkirim ke peneliti |
| Penyimpanan | Google Sheets via Apps Script (gratis, **tanpa SQL**) |
| Hosting | Vercel (*.vercel.app) + source di GitHub |

## Struktur

```
├── site/            # frontend statis (deploy ini ke Vercel)
│   ├── index.html   # SPA: form → tes → kuesioner → skor
│   ├── app.js       # state machine + anti-cheat + scoring
│   ├── data.js      # 30 item (auto-generate dari items.json)
│   ├── config.js    # endpoint Sheets + nomor WA
│   └── audio/       # intro.mp3 + item01..30.mp3
├── items.json       # sumber soal (satu sumber kebenaran)
├── tools/gen_tts.py # generator audio (3 suara, retry otomatis)
├── Code.gs          # backend Google Sheets (Apps Script)
└── SETUP.md         # panduan aktivasi 10 menit
```

## Regenerasi audio / soal

Ubah `items.json`, lalu:

```bash
uv venv .venv && uv pip install -p .venv/bin/python edge-tts
.venv/bin/python tools/gen_tts.py        # semua
.venv/bin/python tools/gen_tts.py 1 15   # item tertentu saja
python3 - <<'EOF'  # regenerate data.js
import json
d = json.load(open("items.json"))
out = {"items": [{**i, "audio": f"audio/item{i['id']:02d}.mp3"} for i in d["items"]],
       "questionnaire": d["questionnaire"], "introUrl": "audio/intro.mp3", "answerSeconds": 30}
open("site/data.js","w").write("window.TEST_DATA = " + json.dumps(out, ensure_ascii=False) + ";")
EOF
```

## Referensi riset pendukung (baru, bisa dikutip)

- Safitri, L. M., dkk. (2024). *Investigating EFL Learners' Recognition of Conversational Implicature in Listening Test*. Randwick International of Social Science Journal, 5(3), 359–373. DOI 10.47175/rissj.v5i3.1021 — 5 sumber kesulitan listening, termasuk **new accent** → justifikasi kontrol aksen British konsisten.
- *Comprehension of Conversational Implicatures among Yemeni EFL Students* (2025, n=261) — pemahaman implicature EFL intermediate masih terendah.
- *Person Deixis in EFL Classroom Interaction: Kazakhstani–Indonesian Comparative Study* (2025) — kegagalan resolusi pronomina dalam interaksi cepat.
- Shahidi et al. (2025, Interspeech) — TTS voice-cloning valid untuk listening/speech assessment → justifikasi penggunaan neural TTS.
- ETS (2026) TOEFL iBT Test Content — audio one-shot, ~30 detik jawab per item (dasar pacing instrumen).
- Garis riset gender: Bacon (1992) → Mullins (2024) TESOL Quarterly 58(2) → Zhang & Liu (2024) MLJ 108(3).
