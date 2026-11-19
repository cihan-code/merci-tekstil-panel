'use strict';
// Panel sayfaları sabit API anahtarı taşımaz; eski uçlara kişi oturumuyla (Bearer) gider.
// Kullanıcı, şifre ve belirteçler uydurmadır.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const API = 'https://erci-materials-api.onrender.com';
// The old constant's full name must not appear anywhere in this repo (git grep check), so it is matched by a prefix.
const KEY = 'merci.production.session';
const TOKEN_A = 'a1'.repeat(32), TOKEN_B = 'b2'.repeat(32);
const future = () => new Date(Date.now() + 3600e3).toISOString();

// --- Alt süreç: stok.html'in satır içi betiğini tarayıcı taklidinde çalıştırır, sonucu JSON yazar. ---
if (process.env.PANEL_OTURUM_SURUCU) {
  const scenario = process.env.PANEL_OTURUM_SURUCU;
  require(path.join(__dirname, 'dom-stub.js'));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const server = { token: TOKEN_A, data: { fabrics: [], movements: [], samples: [], sampleMovements: [] }, calls: [] };
  globalThis.__fetchImpl = async (url, opts) => {
    const h = opts.headers || {};
    server.calls.push({ url: String(url), method: opts.method || 'GET', auth: h.Authorization || null, apiKey: 'x-api-key' in h });
    if (url === API + '/api/siparis/giris') {
      const b = JSON.parse(opts.body);
      if (b.ad !== 'Deneme Kişi' || b.sifre !== 'uydurma-sifre') return jsonRes(401, { error: 'Giriş bilgileri geçersiz' });
      return jsonRes(200, { token: server.token, expiresAt: future(), user: { id: 1, name: 'Deneme Kişi', role: 'ekip' } });
    }
    if (url === API + '/api/stokdata') {
      if (h.Authorization !== 'Bearer ' + server.token) return jsonRes(401, { error: 'Yetkisiz', code: 'AUTH-401' });
      if (opts.method === 'POST') { server.data = JSON.parse(opts.body).data; return jsonRes(200, { ok: true, updatedAt: '2026-11-20T08:00:01.000Z' }); }
      // A copy, as over HTTP: the page must not mutate the fake server's object.
      return jsonRes(200, { data: JSON.parse(JSON.stringify(server.data)), updatedAt: '2026-11-20T08:00:00.000Z' });
    }
    return jsonRes(404, { error: 'bilinmeyen uç' });
  };
  if (scenario !== 'oturumsuz') {
    sessionStorage.setItem(KEY, JSON.stringify({ token: TOKEN_A, expiresAt: future(), user: { id: 1, name: 'Deneme Kişi' }, endpoint: API }));
  }
  const html = fs.readFileSync(path.join(root, 'stok.html'), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');
  vm.runInThisContext(fs.readFileSync(path.join(root, 'assets/session.js'), 'utf8'), { filename: 'session.js' });
  vm.runInThisContext(inline + '\n;globalThis.__stok = { get dirty() { return STOK_DIRTY; }, get state() { return state; } };', { filename: 'stok-inline.js' });
  const dialog = () => document.body.children.find(c => c.id === 'merciSessionLogin');
  const walk = (n, fn) => fn(n) || (n.children || []).reduce((hit, c) => hit || walk(c, fn), null);
  async function submitLogin() {
    const form = dialog().children[0];
    walk(form, n => n.name === 'ad' && n).value = 'Deneme Kişi';
    walk(form, n => n.name === 'sifre' && n).value = 'uydurma-sifre';
    await form._l.submit({ preventDefault() {} });
    await wait(50);
  }
  const out = {};
  (async () => {
    await wait(50);
    out.callsAtOpen = server.calls.slice();
    out.dialogAtOpen = !!dialog();
    out.statusAtOpen = __el('syncStatus').textContent;
    if (scenario === 'oturumsuz') {
      await submitLogin();
      out.reloaded = !!globalThis.__reloaded;
      out.saved = JSON.parse(sessionStorage.getItem(KEY));
      out.dialogAfterLogin = !!dialog();
    }
    if (scenario === 'oturum-dustu') {
      server.token = TOKEN_B;           // sunucuda oturum düştü; yeni girişte bu verilir
      __el('s-name').value = 'Uydurma numune';
      await __el('add-sample')._l.click();
      await wait(50);
      out.dirtyAfter401 = __stok.dirty;
      out.sessionAfter401 = sessionStorage.getItem(KEY);
      out.dialogAfter401 = !!dialog();
      out.statusAfter401 = __el('syncStatus').textContent;
      out.serverSamplesBeforeLogin = server.data.samples.length;
      await submitLogin();
      await wait(50);
      out.dirtyAfterLogin = __stok.dirty;
      out.serverSamples = server.data.samples.map(s => s.name);
      out.lastPostAuth = server.calls.filter(c => c.method === 'POST' && c.url.endsWith('/api/stokdata')).pop().auth;
      out.reloaded = !!globalThis.__reloaded;
    }
    out.calls = server.calls;
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  })().catch(e => { process.stdout.write(JSON.stringify({ crash: String(e && e.stack || e) })); process.exit(1); });
  return;
}

const test = require('node:test');
const assert = require('node:assert/strict');
const session = require('../assets/session.js');

function driveStok(scenario) {
  const r = spawnSync(process.execPath, [__filename], { env: { ...process.env, PANEL_OTURUM_SURUCU: scenario }, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return JSON.parse(r.stdout);
}
class Storage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
function freshStorage(value) {
  globalThis.sessionStorage = new Storage();
  if (value !== undefined) globalThis.sessionStorage.setItem(KEY, typeof value === 'string' ? value : JSON.stringify(value));
  return globalThis.sessionStorage;
}

test('index.html and stok.html carry no fixed API key and load the shared session helper first', () => {
  for (const page of ['index.html', 'stok.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.doesNotMatch(html, /x-api-key/i, page);
    assert.doesNotMatch(html, /\bAPI_KEY\b|MATERIALS_API_K/, page);
    // A long random-looking quoted literal is how the old key looked; data: URIs are not quoted this way.
    assert.doesNotMatch(html, /['"`][A-Za-z0-9_-]{32,}['"`]/, page);
    const helper = html.indexOf('<script src="assets/session.js"></script>');
    const firstInline = html.search(/<script(?![^>]*\bsrc=)[^>]*>/);
    assert.ok(helper !== -1 && helper < firstInline, page + ': session.js is a classic script before the inline code');
  }
  for (const file of ['assets/session.js', 'assets/uretim.js', 'assets/operations.js', 'hub.html', 'form-panel.html', 'uretim.html']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /x-api-key|_API_KEY\b/i, file);
  }
});

test('the helper reads the same sessionStorage record as uretim.js', () => {
  const js = fs.readFileSync(path.join(root, 'assets/uretim.js'), 'utf8');
  assert.equal(/storageKey='([^']+)'/.exec(js)[1], session.KEY);
  assert.equal(session.KEY, KEY);
});

test('a valid session for this API gives a Bearer header; nothing else does', () => {
  freshStorage({ token: TOKEN_A, expiresAt: future(), user: { name: 'Deneme Kişi' }, endpoint: API });
  assert.equal(session.read(API).user.name, 'Deneme Kişi');
  assert.deepEqual(session.headers(API), { Authorization: 'Bearer ' + TOKEN_A });

  // Another API address: never sent there, but kept for the page that owns it.
  assert.equal(session.read('https://other.example.invalid'), null);
  assert.deepEqual(session.headers('https://other.example.invalid'), {});
  assert.notEqual(sessionStorage.getItem(KEY), null);

  freshStorage();
  assert.equal(session.read(API), null);
  assert.deepEqual(session.headers(API), {});
});

test('expired, malformed or tokenless records are unknown and removed', () => {
  for (const value of [{ token: TOKEN_A, expiresAt: new Date(Date.now() - 1000).toISOString(), endpoint: API },
    '{bozuk', { expiresAt: future(), endpoint: API }, { token: '', endpoint: API }, { token: 42, endpoint: API }, 'null']) {
    const s = freshStorage(value);
    assert.equal(session.read(API), null, JSON.stringify(value));
    assert.equal(s.getItem(KEY), null, JSON.stringify(value));
  }
  // At the boundary an expiry equal to now is already expired.
  const realNow = Date.now; const now = realNow();
  Date.now = () => now;
  try {
    freshStorage({ token: TOKEN_A, expiresAt: new Date(now).toISOString(), endpoint: API });
    assert.equal(session.read(API), null);
  } finally { Date.now = realNow; }
  freshStorage({ token: TOKEN_A, endpoint: API });
  assert.equal(session.read(API).token, TOKEN_A, 'no expiry recorded: the server decides');
  session.clear();
  assert.equal(sessionStorage.getItem(KEY), null);
});

test('login stores the session with its API address; failures store nothing', async () => {
  const realFetch = globalThis.fetch;
  try {
    freshStorage();
    let sent;
    globalThis.fetch = async (url, init) => { sent = { url, init }; return { ok: true, status: 200,
      json: async () => ({ token: TOKEN_A, expiresAt: future(), user: { id: 1, name: 'Deneme Kişi' } }) }; };
    const s = await session.login(API, 'Deneme Kişi', 'uydurma-sifre');
    assert.equal(sent.url, API + '/api/siparis/giris');
    assert.equal(sent.init.credentials, 'omit');
    assert.deepEqual(JSON.parse(sent.init.body), { ad: 'Deneme Kişi', sifre: 'uydurma-sifre' });
    assert.equal(s.endpoint, API);
    assert.equal(JSON.parse(sessionStorage.getItem(KEY)).token, TOKEN_A);

    for (const [res, message] of [
      [{ ok: false, status: 401, json: async () => ({ error: 'Giriş bilgileri geçersiz' }) }, /Giriş bilgileri geçersiz/],
      [{ ok: true, status: 200, json: async () => ({ user: { name: 'Deneme Kişi' } }) }, /desteklenmiyor/],
      [{ ok: false, status: 503, json: async () => { throw new Error('html'); } }, /503/],
    ]) {
      freshStorage();
      globalThis.fetch = async () => res;
      await assert.rejects(session.login(API, 'Deneme Kişi', 'x'), message);
      assert.equal(sessionStorage.getItem(KEY), null);
    }
    freshStorage();
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(session.login(API, 'Deneme Kişi', 'x'), /Sunucuya bağlanılamadı/);
    assert.equal(sessionStorage.getItem(KEY), null);
  } finally { globalThis.fetch = realFetch; }
});

test('concurrent login requests share one dialog', () => {
  const made = [];
  const node = () => { const n = { style: {}, children: [], setAttribute() {}, addEventListener() {}, focus() {},
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; } }; made.push(n); return n; };
  const realDocument = globalThis.document;
  globalThis.document = { body: node(), createElement: node };
  try {
    const first = session.requireLogin(API), second = session.requireLogin(API, { message: 'Oturum sona erdi.' });
    assert.equal(first, second);
    assert.equal(globalThis.document.body.children.length, 1);
    assert.equal(globalThis.document.body.children[0].id, 'merciSessionLogin');
  } finally { globalThis.document = realDocument; }
});

test('stok.html: opening without a session asks for login, sends nothing, and returns to the page after login', () => {
  const r = driveStok('oturumsuz');
  assert.equal(r.crash, undefined, r.crash);
  assert.deepEqual(r.callsAtOpen, []);
  assert.equal(r.dialogAtOpen, true);
  assert.match(r.statusAtOpen, /Giriş gerekli/);
  assert.equal(r.dialogAfterLogin, false);
  assert.equal(r.saved.endpoint, API);
  assert.equal(r.reloaded, true, 'page reloads so the fabric ledger also sees the session');
  assert.ok(r.calls.every(c => !c.apiKey));
});

test('stok.html: a valid session reads numune data with Bearer and never with x-api-key', () => {
  const r = driveStok('oturumlu');
  assert.equal(r.crash, undefined, r.crash);
  assert.equal(r.dialogAtOpen, false);
  assert.deepEqual(r.callsAtOpen.map(c => [c.url, c.method, c.auth, c.apiKey]), [[API + '/api/stokdata', 'GET', 'Bearer ' + TOKEN_A, false]]);
});

test('stok.html: a 401 on save clears the session, keeps the record, and sends it after login', () => {
  const r = driveStok('oturum-dustu');
  assert.equal(r.crash, undefined, r.crash);
  assert.equal(r.dirtyAfter401, true);
  assert.equal(r.sessionAfter401, null);
  assert.equal(r.dialogAfter401, true);
  assert.match(r.statusAfter401, /Giriş gerekli/);
  assert.equal(r.serverSamplesBeforeLogin, 0);
  assert.equal(r.dirtyAfterLogin, false);
  assert.deepEqual(r.serverSamples, ['Uydurma numune']);
  assert.equal(r.lastPostAuth, 'Bearer ' + TOKEN_B);
  assert.equal(r.reloaded, false, 'unsaved work is not reloaded away');
  assert.ok(r.calls.every(c => !c.apiKey));
});

test('index.html: opening without a session goes to login first; a 401 keeps unsaved data and resends after login', () => {
  for (const scenario of ['oturumsuz-acilis', 'oturum-dustu']) {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'sync-harness.js'), scenario], { encoding: 'utf8', timeout: 30000 });
    assert.equal(r.status, 0, scenario + '\n' + r.stdout + r.stderr);
    assert.match(r.stdout, /hepsi geçti/);
  }
});
