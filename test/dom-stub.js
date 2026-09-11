// Minimal tarayici taklidi: panel index.html'in JS'ini Node'da calistirmak icin.
'use strict';
const listeners = { document: {}, window: {} };

class FakeClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  contains(c) { return this.set.has(c); }
  toggle(c, on) { if (on === undefined) { this.set.has(c) ? this.set.delete(c) : this.set.add(c); } else if (on) this.set.add(c); else this.set.delete(c); }
}
class FakeEl {
  constructor(id) {
    this.id = id || '';
    this.style = new Proxy({ cssText: '' }, { get: (t, k) => t[k] === undefined ? '' : t[k], set: (t, k, v) => { t[k] = v; return true; } });
    this.classList = new FakeClassList(this);
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this._html = '';
    this._text = '';
    this.value = '';
    this.disabled = false;
    this.elements = new Proxy({}, { get: () => ({ value: '' }) });
    this.tagName = 'DIV';
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  addEventListener(t, fn) { (this._l = this._l || {})[t] = fn; }
  removeEventListener() {}
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  querySelector(sel) { return globalThis.document.querySelector(sel); }
  querySelectorAll() { return []; }
  scrollIntoView() {}
  select() {}
  click() {}
  focus() {}
  insertBefore(c) { this.children.push(c); return c; }
  getContext() { return { drawImage() {}, getImageData() { return { data: [] }; }, putImageData() {} }; }
  setAttribute() {}
  getAttribute() { return null; }
  closest() { return null; }
}

const elCache = new Map();
function el(id) { if (!elCache.has(id)) elCache.set(id, new FakeEl(id)); return elCache.get(id); }

const body = new FakeEl('body');
globalThis.document = {
  body,
  documentElement: new FakeEl('html'),
  visibilityState: 'visible',
  activeElement: { tagName: 'BODY' },
  getElementById: (id) => el(id),
  createElement: (tag) => { const e = new FakeEl(''); e.tagName = String(tag).toUpperCase(); return e; },
  querySelector: (sel) => {
    if (sel === '.modal-overlay.active') return globalThis.__modalOpen ? new FakeEl('modal') : null;
    if (sel === '.view.active') return el('view-dashboard');
    return el('q:' + sel);
  },
  querySelectorAll: () => [],
  addEventListener: (t, fn) => { listeners.document[t] = fn; },
  execCommand: () => true,
};
globalThis.window = globalThis;
globalThis.addEventListener = (t, fn) => { listeners.window[t] = fn; };
globalThis.removeEventListener = () => {};
globalThis.__fire = (target, type, ev) => {
  const fn = listeners[target][type];
  if (!fn) throw new Error('dinleyici yok: ' + target + '/' + type);
  return fn(ev || {});
};
globalThis.__listeners = listeners;
globalThis.__modalOpen = false;
globalThis.__el = el;

class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (globalThis.__quotaFull) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
globalThis.localStorage = new FakeStorage();
globalThis.sessionStorage = new FakeStorage();
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-harness', onLine: true }, configurable: true, writable: true }); } catch (e) {}
globalThis.location = { reload() { globalThis.__reloaded = true; }, href: 'http://test/' };
globalThis.alert = () => {};
globalThis.confirm = () => (globalThis.__confirmAnswer !== false);
globalThis.Chart = function () { return { destroy() {}, update() {} }; };
globalThis.Chart.register = () => {};
globalThis.URL = globalThis.URL || {};
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:test';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};
globalThis.FileReader = function () {};
globalThis.Image = function () { return new FakeEl(''); };

// fetch: testler __fetchImpl'i degistirir
globalThis.__fetchLog = [];
globalThis.__fetchImpl = async () => { throw new Error('fetch stub ayarlanmadi'); };
globalThis.fetch = async (url, opts) => {
  globalThis.__fetchLog.push({ url, method: (opts && opts.method) || 'GET', body: opts && opts.body });
  return globalThis.__fetchImpl(url, opts || {});
};
function jsonRes(status, obj) {
  return { ok: status >= 200 && status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj) };
}
globalThis.jsonRes = jsonRes;
