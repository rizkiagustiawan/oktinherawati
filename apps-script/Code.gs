/**
 * Google Sheets backend untuk tes listening Oktin — TANPA SQL.
 * Skema v3: SATU BARIS per peserta (lebar, ringkas) di sheet "Responses",
 * rincian 35 item di kolom items_json (JSON). Tidak ada lagi sheet "Items"
 * 35 baris/peserta → hemat baris & mudah diolah sampai selesai skripsi.
 *
 * SETUP (5 menit, sekali saja):
 * 1. Buka https://script.google.com -> New Project
 * 2. Hapus isi Code.gs, tempel file ini
 * 3. Run -> setup (izinkan permission akun Google)
 * 4. Deploy -> New deployment -> Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Copy Web App URL (…/exec) -> tempel ke site/config.js (sheetsEndpoint)
 *
 * Data masuk otomatis ke Google Sheet baru "OKTIN Listening Responses".
 */

// ================= SKEMA v3 (30 kolom) =================
var HDR_V3 = [
  "timestamp", "nama", "wa", "semester",
  "toefl_score", "toefl_type", "section_high", "section_low",
  "q01", "q02", "q03", "q04", "q05", "q06", "q07", "q08", "q09", "q10",
  "o1", "o2",
  "total", "percent", "simple", "compound",
  "duration_sec", "violations", "violation_log",
  "user_agent", "test_version",
  "items_json"
];

function setup() {
  var ss = SpreadsheetApp.create("OKTIN Listening Responses");
  var sh = ss.getSheets()[0];
  sh.appendRow(HDR_V3);
  PropertiesService.getScriptProperties().setProperty("RESPONSE_SS_ID", ss.getId());
  Logger.log("Sheet dibuat: " + ss.getUrl());
}

// init otomatis saat POST pertama (tanpa setup manual)
function setupSilent() {
  var ss = SpreadsheetApp.create("OKTIN Listening Responses");
  ss.getSheets()[0].appendRow(HDR_V3);
  PropertiesService.getScriptProperties().setProperty("RESPONSE_SS_ID", ss.getId());
  return ss.getId();
}

// normalisasi nomor WA: buang non-digit, konversi 62 -> 0, seragamkan ke 08xx
function normWa(v) {
  var s = String(v == null ? "" : v).replace(/\D/g, "");
  if (s.indexOf("62") === 0) s = "0" + s.substring(2);
  if (s.indexOf("0") !== 0) s = "0" + s;
  return s;
}

// paksa kolom WA jadi teks agar leading zero tidak hilang (Responses kolom 3)
function forceTextWa(sh, col, label) {
  try {
    sh.getRange(1, col, Math.max(sh.getMaxRows(), 1), 1).setNumberFormat("@");
    if (label) {
      var cur = sh.getRange(1, col, 1, 1).getValues()[0][0];
      if (String(cur) !== label) sh.getRange(1, col).setValue(label);
    }
  } catch (ignored) {}
}

// migrasi header skema lama -> v3 (sekaligus geser data lama)
function ensureV3(sh) {
  var cur = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  if (cur.join("|") === HDR_V3.join("|")) return;

  var n = sh.getLastRow();
  var rows = [];
  if (n >= 2) rows = sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues();

  var hasComplex = cur.indexOf("complex") !== -1 || cur.indexOf("q_likert_1to5") !== -1;
  var v2 = cur.length >= 13 && cur[7] === "compound" && cur[8] === "duration_sec";

  sh.getRange(1, 1, 1, sh.getLastColumn()).clearContent();
  sh.getRange(1, 1, 1, HDR_V3.length).setValues([HDR_V3]);
  if (rows.length === 0) return;

  var out = rows.map(function (r) {
    var x = r.slice();
    while (x.length < 18) x.push("");
    var row = new Array(HDR_V3.length).fill("");
    row[0] = x[0]; // timestamp
    row[1] = x[1]; // nama
    row[2] = x[2]; // wa
    row[3] = x[3]; // semester
    row[20] = x[4]; // total
    row[21] = x[5]; // percent
    row[22] = x[6]; // simple
    if (hasComplex) {
      // v1: compound ada di kolom 7 (complex) -> kosongkan, pakai 7 sbg compound? -> biarkan kosong
      row[24] = x[10]; row[25] = x[11]; row[26] = x[12];
      row[27] = x[16]; row[28] = x[17];
    } else if (v2) {
      row[23] = x[7]; // compound
      row[24] = x[8]; row[25] = x[9]; row[26] = x[10];
      row[27] = x[11]; row[28] = x[12];
    }
    return row;
  });
  sh.getRange(2, 1, out.length, HDR_V3.length).setValues(out);
}

function doPost(e) {
  try {
    var d;
    try {
      d = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOut({ ok: false, error: "invalid_json" });
    }
    if (!d || typeof d !== "object") return jsonOut({ ok: false, error: "invalid_payload" });
    if (!d.meta || !d.meta.finished_at) return jsonOut({ ok: false, error: "missing_meta" });
    if (!Array.isArray(d.items)) return jsonOut({ ok: false, error: "missing_items" });

    var ssId = PropertiesService.getScriptProperties().getProperty("RESPONSE_SS_ID");
    if (!ssId) ssId = setupSilent();
    var ss = SpreadsheetApp.openById(ssId);
    var sh = ss.getSheetByName("Responses") || ss.insertSheet("Responses");
    ensureV3(sh);

    // kolom WA dipaksa teks setelah header final
    forceTextWa(sh, 3, "wa");

    // satu attempt per nomor WA
    var waNorm = normWa(d.wa);
    if (!waNorm) return jsonOut({ ok: false, reason: "invalid_wa" });
    var lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      var waCol = sh.getRange(2, 3, lastRow - 1, 1).getValues().flat().map(normWa);
      if (waCol.indexOf(waNorm) !== -1) return jsonOut({ ok: false, reason: "duplicate_wa" });
    }

    // ---- kuesioner (opsional; kosong bila belum dikirim) ----
    var qn = (d.questionnaire && typeof d.questionnaire === "object") ? d.questionnaire : {};
    var qArr = Array.isArray(d.q) ? d.q : (Array.isArray(qn.q) ? qn.q : []);
    var q = [];
    for (var i = 0; i < 10; i++) q.push(qArr[i] == null ? "" : qArr[i]);
    var o1 = d.o1 != null ? d.o1 : (qn.o1 != null ? qn.o1 : "");
    var o2 = d.o2 != null ? d.o2 : (qn.o2 != null ? qn.o2 : "");

    // ---- rincian item -> satu kolom JSON (ringkas) ----
    var itemsJson = JSON.stringify(d.items.map(function (it) {
      return { i: it.id, t: it.type, c: it.chosen == null ? "" : it.chosen, k: it.ok ? 1 : 0 };
    }));

    var row = [
      d.meta.finished_at, d.nama, String(waNorm), d.semester,
      d.toefl_score != null ? d.toefl_score : "",
      d.toefl_type != null ? d.toefl_type : "",
      d.section_high != null ? d.section_high : "",
      d.section_low != null ? d.section_low : "",
      q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7], q[8], q[9],
      o1, o2,
      d.total, d.percent, d.simple, d.compound,
      d.duration_sec, d.violations, JSON.stringify(d.violation_log),
      d.meta.ua, d.meta.test,
      itemsJson
    ];

    var respRow = sh.getLastRow() + 1;
    sh.getRange(respRow, 1, 1, HDR_V3.length).setValues([row]);
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

// ================= REKAP ANALISIS (untuk grafik) =================
// Jalankan fungsi ini dari editor Apps Script setelah data terkumpul:
//   Run -> buatRekap
// Hasil: sheet "Rekap" berisi 3 blok siap untuk Insert -> Chart:
//   A. Ringkasan per peserta
//   B. Analisis per item (35) -> pilih kolom % Salah untuk bar chart
//   C. Statistik ringkas (rata-rata simple vs compound, item tersulit)
function buatRekap() {
  var ssId = PropertiesService.getScriptProperties().getProperty("RESPONSE_SS_ID");
  if (!ssId) throw new Error("BELUM ADA DATA: jalankan setup() atau tunggu submit pertama.");
  var ss = SpreadsheetApp.openById(ssId);
  var sh = ss.getSheetByName("Responses");
  if (!sh) throw new Error("Sheet Responses belum ada. Tunggu peserta pertama submit.");

  var n = sh.getLastRow();
  if (n < 2) throw new Error("Belum ada peserta di sheet Responses.");

  var rows = sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues();

  var byItem = {}; // id -> {type, benar, total}
  var peserta = [];
  var skor = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r[1] && !r[2]) continue; // baris kosong
    var arr = [];
    try { arr = JSON.parse(r[29] || "[]") || []; } catch (e) { arr = []; }
    var bSimple = 0, tSimple = 0, bComp = 0, tComp = 0;
    for (var j = 0; j < arr.length; j++) {
      var it = arr[j] || {};
      var iid = it.i, type = it.t, ok = it.k === 1;
      if (iid == null) continue;
      if (!byItem[iid]) byItem[iid] = { type: type, benar: 0, total: 0 };
      byItem[iid].total++;
      if (ok) byItem[iid].benar++;
      if (type === "simple") { tSimple++; if (ok) bSimple++; }
      else { tComp++; if (ok) bComp++; }
    }
    skor.push(r[20] != null ? Number(r[20]) : 0);
    peserta.push([r[1], r[2], r[3], r[4], r[6], r[7],
      r[20] != null ? r[20] : "", r[21] != null ? r[21] : "",
      bSimple + "/" + tSimple, bComp + "/" + tComp]);
  }

  var PAD = function (n) { var a = [n]; for (var k = 1; k < 11; k++) a.push(""); return a; };

  var out = [];
  out.push(["REKAP ANALISIS - dibuat otomatis oleh buatRekap() - " + new Date().toISOString().slice(0, 10)]);
  out.push([]);

  // ---- Blok A: per peserta ----
  out.push(["A. Ringkasan per Peserta"]);
  out.push(["No", "Nama", "WA", "Semester", "TOEFL", "Section Tinggi", "Section Rendah",
    "Skor", "%", "Simple (benar/total)", "Compound (benar/total)"]);
  for (var p = 0; p < peserta.length; p++) {
    var line = [p + 1].concat(peserta[p]);
    while (line.length < 11) line.push("");
    out.push(line);
  }
  out.push([]);

  // ---- Blok B: per item (siap grafik) ----
  out.push(["B. Analisis per Item (35) - pilih kolom '% Salah' untuk bar chart"]);
  out.push(["No Item", "Tipe Kalimat", "Jumlah Peserta", "Benar", "% Benar", "% Salah/Error"]);
  var keys = Object.keys(byItem).map(Number).sort(function (a, b) { return a - b; });
  var itemStat = [];
  for (var k = 0; k < keys.length; k++) {
    var it = byItem[keys[k]];
    var pct = it.total ? Math.round((it.benar / it.total) * 100) : 0;
    out.push([keys[k], it.type, it.total, it.benar, pct, 100 - pct]);
    itemStat.push({ id: keys[k], type: it.type, err: 100 - pct });
  }
  out.push([]);

  // ---- Blok C: statistik ringkas ----
  out.push(["C. Statistik Ringkas"]);
  out.push(["Jumlah peserta", peserta.length]);
  if (skor.length) {
    var sum = 0, mn = skor[0], mx = skor[0];
    for (var s = 0; s < skor.length; s++) { sum += skor[s]; if (skor[s] < mn) mn = skor[s]; if (skor[s] > mx) mx = skor[s]; }
    out.push(["Rata-rata skor (dari 35)", Math.round((sum / skor.length) * 10) / 10]);
    out.push(["Skor terendah", mn]);
    out.push(["Skor tertinggi", mx]);
  }
  // error terbesar per item
  itemStat.sort(function (a, b) { return b.err - a.err; });
  out.push(["3 item tersulit (error tertinggi)"]);
  for (var q = 0; q < Math.min(3, itemStat.length); q++) {
    out.push(["  #" + itemStat[q].id + " (" + itemStat[q].type + ")", itemStat[q].err + "% salah"]);
  }

  var rakap = ss.getSheetByName("Rekap") || ss.insertSheet("Rekap");
  rakap.clear();
  var maxCols = 11;
  for (var rowIdx = 0; rowIdx < out.length; rowIdx++) {
    var rr = out[rowIdx];
    while (rr.length < maxCols) rr.push("");
  }
  rakap.getRange(1, 1, out.length, maxCols).setValues(out);
  rakap.getRange(1, 1, 1, maxCols).setFontWeight("bold");
  rakap.getRange(1, 1).setFontSize(12);
}

// alias bahasa Inggris
function makeSummary() { buatRekap(); }

function doGet() { return jsonOut({ ok: true, service: "oktin-listening", time: new Date() }); }

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
