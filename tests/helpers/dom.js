/* Minimal DOM stub cukup untuk menjalankan site/app.js di Node (tanpa browser). */
"use strict";

class ClassList {
  constructor(el) { this.el = el; this._set = new Set(); }
  add(...c) { c.forEach((x) => this._set.add(x)); this._sync(); }
  remove(...c) { c.forEach((x) => this._set.delete(x)); this._sync(); }
  contains(c) { return this._set.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this._set.has(c) : !!force;
    if (on) this._set.add(c); else this._set.delete(c);
    this._sync();
    return on;
  }
  _sync() {
    this.el._className = [...this._set].join(" ");
    if (this.el.attrs) this.el.attrs.class = this.el._className;
  }
  toString() { return [...this._set].join(" "); }
}

class Style {
  constructor() { this._p = {}; }
  setProperty(k, v) { this._p[k] = v; }
  getPropertyValue(k) { return this._p[k] || ""; }
}

class Element {
  constructor(tag, doc) {
    this.tagName = (tag || "div").toUpperCase();
    this.ownerDocument = doc || null;
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.style = new Style();
    this.classList = new ClassList(this);
    this._className = "";
    this._text = "";
    this._html = "";
    this._listeners = {};
    this.dataset = {};
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.type = "text";
  }
  get id() { return this.attrs.id || ""; }
  set id(v) { this.attrs.id = v; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    return c;
  }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    const a = this._listeners[type] || [];
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }
  dispatch(type, ev) {
    const e = Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, ev || {});
    (this._listeners[type] || []).slice().forEach((fn) => fn.call(this, e));
    return e;
  }
  click() {
    const ev = this.dispatch("click");
    if (typeof this.onclick === "function") this.onclick.call(this, ev);
    return ev;
  }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  focus() {}
  reset() {}
  requestFullscreen() { return Promise.resolve(); }
  closest() { return null; }
  getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 30 }; }
}

class Document extends Element {
  constructor() {
    super("#document", null);
    this.ownerDocument = this;
    this._ids = new Map();
    this._all = [];
    this.fullscreenElement = null;
    this.hidden = false;
    this.readyState = "complete";
  }
  createElement(tag) { return new Element(tag, this); }
  createTextNode(t) { const e = new Element("#text", this); e.textContent = t; return e; }
  _register(el) {
    this._all.push(el);
    if (el.attrs.id) this._ids.set(el.attrs.id, el);
    return el;
  }
  getElementById(id) { return this._ids.get(id) || null; }
  querySelector(sel) {
    if (sel.startsWith("#")) return this.getElementById(sel.slice(1));
    if (sel.startsWith("[")) {
      const m = sel.match(/^\[data-name=([^\]]+)\]/);
      if (m) return this._all.find((e) => e.dataset && e.dataset.name === m[1]) || null;
    }
    if (sel.includes("[name=")) {
      const m = sel.match(/\[name=([^\]]+)\]/);
      const name = m && m[1];
      const checked = sel.includes(":checked");
      return this._all.find((e) => e.attrs && e.attrs.name === name && (!checked || e.checked)) || null;
    }
    const cls = sel.startsWith(".") ? sel.slice(1) : null;
    if (cls) return this._all.find((e) => e.classList.contains(cls)) || null;
    return this._all.find((e) => e.tagName === sel.toUpperCase()) || null;
  }
  querySelectorAll(sel) {
    if (sel === ".screen") return this._all.filter((e) => e.classList.contains("screen"));
    if (sel === ".opt") return this._all.filter((e) => e.classList.contains("opt"));
    if (sel.startsWith("[data-name=")) {
      const m = sel.match(/^\[data-name=([^\]]+)\]/);
      const name = m[1];
      const onlySel = sel.includes(".sel");
      return this._all.filter((e) => e.dataset.name === name && (!onlySel || e.classList.contains("sel")));
    }
    if (sel.includes("[name=")) {
      const m = sel.match(/\[name=([^\]]+)\]/);
      return this._all.filter((e) => e.attrs.name === m[1]);
    }
    if (sel.startsWith("#")) {
      const e = this.getElementById(sel.slice(1));
      return e ? [e] : [];
    }
    return [];
  }
  addEventListener(type, fn) { super.addEventListener(type, fn); }
  exitFullscreen() {
    this.fullscreenElement = null;
    this.dispatch("fullscreenchange");
    return Promise.resolve();
  }
}

function makeDocument() {
  const doc = new Document();
  const root = doc.createElement("html");
  root.requestFullscreen = () => {
    doc.fullscreenElement = root;
    doc.dispatch("fullscreenchange");
    return Promise.resolve();
  };
  doc.documentElement = root;

  const ids = [
    "scr-form", "scr-locked", "scr-test", "scr-qn", "scr-score",
    "regForm", "fName", "fWa", "fSem", "fConsent", "formErr",
    "tProgress", "tTimer", "tViol", "itemTag", "itemNum",
    "stage-play", "stage-ans", "btnPlay", "qText", "opts", "countdown",
    "scoreTotal", "scorePct", "stSimple", "stCompound", "stDeixis", "stRef",
    "rName", "rSem", "rDur", "rViol", "rSubmit",
    "btnCopy", "btnWa", "btnRetry", "fsOverlay", "btnFsBack", "likertWrap", "mcWrap", "questForm", "questErr",
    "qnForm", "qnScore", "qnType", "qnHigh", "qnLow", "qnLikert", "qnO1", "qnO2", "qnErr", "qnSubmit",
  ];
  for (const id of ids) {
    const el = doc.createElement("div");
    el.id = id;
    doc._register(el);
  }
  ["scr-form"].forEach((id) => doc.getElementById(id).classList.add("screen", "active"));
  ["scr-locked", "scr-test", "scr-qn", "scr-score"].forEach((id) => doc.getElementById(id).classList.add("screen"));
  doc.getElementById("stage-ans").classList.add("hidden");
  doc.getElementById("fsOverlay").classList.add("hidden");
  doc.getElementById("btnWa").classList.add("hidden");

  doc.getElementById("fSem").tagName = "SELECT";
  doc.getElementById("fName").tagName = "INPUT";
  doc.getElementById("fWa").tagName = "INPUT";
  doc.getElementById("qnType").tagName = "SELECT";
  doc.getElementById("qnHigh").tagName = "SELECT";
  doc.getElementById("qnLow").tagName = "SELECT";

  return doc;
}

module.exports = { Document, Element, ClassList, makeDocument };
