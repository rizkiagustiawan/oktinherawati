/* Menjalankan Code.gs (Apps Script) di Node dengan stub SpreadsheetApp /
   PropertiesService / ContentService. Memungkinkan menguji doPost secara nyata
   tanpa Google. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");

class Range {
  constructor(sheet, row, col, nRows, nCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.nRows = nRows;
    this.nCols = nCols;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nRows; r++) {
      const line = [];
      for (let c = 0; c < this.nCols; c++) {
        line.push(this.sheet._get(this.row + r, this.col + c));
      }
      out.push(line);
    }
    return out;
  }
  setValues(vals) {
    vals.forEach((line, r) => line.forEach((v, c) => this.sheet._setCoerced(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) {
    this.sheet._setCoerced(this.row, this.col, v);
    return this;
  }
  clearContent() {
    for (let r = 0; r < this.nRows; r++) {
      for (let c = 0; c < this.nCols; c++) this.sheet._set(this.row + r, this.col + c, "");
    }
    return this;
  }
  setNumberFormat(fmt) {
    const kind = String(fmt).indexOf("@") !== -1 ? "TEXT" : "NUMBER";
    for (let c = 0; c < this.nCols; c++) this.sheet.setColFormat(this.col + c, kind);
    this.sheet.setColFormatRows(this.col, kind, this.row, this.row + this.nRows - 1);
    return this;
  }
}

class Sheet {
  constructor(name) {
    this.name = name;
    this.cells = new Map();
    this.formats = new Map(); // col -> "TEXT" | "NUMBER"
    this.maxRows = 1000;
    this.maxCols = 30;
  }
  setColFormat(col, fmt) { this.formats.set(col, fmt); return this; }
  setColFormatRows(col, fmt, fromRow, toRow) {
    if (!this.rowFormats) this.rowFormats = new Map();
    this.rowFormats.set(col, { fmt, fromRow, toRow });
    return this;
  }
  _fmtFor(col, row) { return this.formats.get(col); }
  _coerce(r, c, v) {
    // Google Sheets: menulis teks numerik ke sel berformat General -> angka.
    // Format TEXT ("@") hanya berlaku pada sel/kolom yang sudah diformat.
    if (typeof v !== "string") return v;
    if (this._fmtFor(c, r) === "TEXT") return v;
    if (/^\d+$/.test(v)) return Number(v);
    return v;
  }
  _key(r, c) { return r + ":" + c; }
  _get(r, c) { const v = this.cells.get(this._key(r, c)); return v === undefined ? "" : v; }
  _set(r, c, v) { this.cells.set(this._key(r, c), v); }
  _setCoerced(r, c, v) { this.cells.set(this._key(r, c), this._coerce(r, c, v)); }
  getName() { return this.name; }
  getRange(row, col, nRows, nCols) {
    return new Range(this, row, col, nRows === undefined ? 1 : nRows, nCols === undefined ? 1 : nCols);
  }
  getLastRow() {
    let max = 0;
    for (const k of this.cells.keys()) {
      const [r, c] = k.split(":").map(Number);
      if (this._get(r, c) !== "" && this._get(r, c) !== undefined) max = Math.max(max, r);
    }
    return max;
  }
  getLastColumn() {
    let max = 0;
    for (const k of this.cells.keys()) {
      const [r, c] = k.split(":").map(Number);
      if (this._get(r, c) !== "") max = Math.max(max, c);
    }
    return max;
  }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  appendRow(vals) {
    const row = this.getLastRow() + 1;
    vals.forEach((v, i) => this._setCoerced(row, i + 1, v));
    return this;
  }
  getColumnWidth() { return 100; }
}

class Spreadsheet {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.sheets = new Map();
    const s = new Sheet("Sheet1");
    this.sheets.set("Sheet1", s);
  }
  getId() { return this.id; }
  getUrl() { return "https://docs.google.com/spreadsheets/d/" + this.id + "/edit"; }
  getSheets() { return [...this.sheets.values()]; }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.set(n, s); return s; }
}

function boot(options = {}) {
  const files = new Map();
  if (options.existingSheets) {
    for (const [id, sheets] of Object.entries(options.existingSheets)) {
      const ss = new Spreadsheet(id, "existing");
      for (const [name, rows] of Object.entries(sheets)) {
        const sh = ss.insertSheet(name);
        rows.forEach((r) => sh.appendRow(r));
      }
      files.set(id, ss);
    }
  }
  let created = 0;
  const props = new Map(Object.entries(options.props || {}));

  const SpreadsheetApp = {
    create(name) {
      created++;
      const ss = new Spreadsheet("new-" + created, name);
      files.set(ss.id, ss);
      return ss;
    },
    openById(id) {
      if (!files.has(id)) throw new Error("not found: " + id);
      return files.get(id);
    },
  };
  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, v),
      };
    },
  };
  const ContentService = {
    MimeType: { JSON: "application/json" },
    createTextOutput(text) {
      return { _text: text, setMimeType() { return this; }, getContent() { return this._text; } };
    },
  };

  const sandbox = { SpreadsheetApp, PropertiesService, ContentService, Logger: { log() {} }, JSON, Object, Array, String, Number, Math, Date, isNaN, parseInt };
  sandbox.globalThis = sandbox;
  const code = fs.readFileSync(path.join(ROOT, "Code.gs"), "utf8");
  vm.runInNewContext(code, sandbox, { filename: "Code.gs" });

  return {
    sandbox,
    files,
    props,
    created: () => created,
    post(payload) {
      const e = { postData: { contents: JSON.stringify(payload) } };
      return JSON.parse(sandbox.doPost(e).getContent());
    },
    get(params) {
      return JSON.parse(sandbox.doGet({ parameter: params || {} }).getContent());
    },
    sheet(id, name) {
      const ss = files.get(id);
      return ss ? ss.getSheetByName(name) : null;
    },
  };
}

module.exports = { boot, Sheet, Spreadsheet };
