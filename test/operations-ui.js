'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/operations.js'), 'utf8');
function harness() {
  const elements = Object.fromEntries(['opFeedbackJob', 'opFeedbackText', 'opFeedbackSave', 'opFeedbackStatus'].map(id =>
    [id, { value: '', disabled: false, textContent: '', classList: { toggle() {} } }]));
  let sequence = 0;
  const ctx = vm.createContext({ document: { getElementById: id => elements[id] || null },
    crypto: { randomUUID: () => 'request-' + ++sequence }, renderOperasyonPlan() {},
    CLOUD_DIRTY: false, CLOUD_INFLIGHT: false, CLOUD_CONFLICT: false });
  vm.runInContext(source + '\nthis.api = { apply: operationsApply, submit: operationsSubmit, setState: s => operationsState = s };', ctx);
  return { ctx, api: ctx.api, elements };
}
const record = () => ({ id: 7, customer_name: 'Synthetic A', quantity: 100, status: 'Baskı/Nakışta', est_delivery: null, note: 'Original' });
const snapshot = () => ({ version: 1, revision: 2, configured: true, records: [{ record_id: 7, fingerprint: 'f1',
  basis: { status: 'Baskı/Nakışta', customer: 'Synthetic A', quantity: 100, decoration: 'baski', est_delivery: null },
  revision: { action: 'Baskı: kalan 5 adedi tamamla', note: 'Kâğıt eksik', status: 'Baskı/Nakışta', section: 'Gün içi revizyon' },
  reminders: [{ message: 'Baskı kâğıdını önceden kontrol et.' }], history: [] }] });

test('partial report overlays the plan without modifying stored panel data', () => {
  const { api } = harness();
  api.setState(snapshot());
  const u = record(), original = JSON.stringify(u), row = { u, deco: 'baski', action: 'Generic action' };
  api.apply([row]);
  assert.match(row.action, /kalan 5/);
  assert.match(row.action, /Kâğıt eksik/);
  assert.match(row.u.note, /Baskı kâğıdını/);
  assert.equal(row.section, 'Gün içi revizyon');
  assert.equal(JSON.stringify(u), original);
});
test('a concurrent panel edit requires state confirmation instead of using old progress', () => {
  const { api } = harness(); api.setState(snapshot());
  const row = { u: { ...record(), quantity: 200 }, deco: 'baski' };
  api.apply([row]);
  assert.match(row.action, /teyit/);
  assert.doesNotMatch(row.action, /kalan 5/);
});
test('a network retry retains the request ID and input, then clears input after success', async () => {
  const { api, ctx, elements } = harness(); api.setState(snapshot());
  elements.opFeedbackJob.value = '7'; elements.opFeedbackText.value = 'Kalan beş adet.';
  const calls = [];
  ctx.matApi = async (url, opts) => { calls.push(JSON.parse(opts.body)); throw new Error('Network unavailable'); };
  await api.submit({ preventDefault() {} });
  assert.equal(elements.opFeedbackText.value, 'Kalan beş adet.');
  ctx.matApi = async (url, opts) => { calls.push(JSON.parse(opts.body)); return { json: async () => ({ saved: true, snapshot: snapshot(), summary: 'Kalan 5' }) }; };
  await api.submit({ preventDefault() {} });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].request_id, calls[1].request_id);
  assert.equal(calls[0].fingerprint, 'f1');
  assert.equal(elements.opFeedbackText.value, '');
});
test('cloud edits prevent reporting and ambiguity preserves the text', async () => {
  const { api, ctx, elements } = harness(); api.setState(snapshot());
  elements.opFeedbackJob.value = '7'; elements.opFeedbackText.value = 'Baskı yapıldı.';
  let calls = 0;
  ctx.matApi = async () => { calls++; return { json: async () => ({ saved: false, clarification: 'Kaç adet kaldı?' }) }; };
  ctx.CLOUD_DIRTY = true;
  await api.submit({ preventDefault() {} }); assert.equal(calls, 0);
  ctx.CLOUD_DIRTY = false;
  await api.submit({ preventDefault() {} }); assert.equal(calls, 1);
  assert.equal(elements.opFeedbackText.value, 'Baskı yapıldı.');
  assert.equal(elements.opFeedbackStatus.textContent, 'Kaç adet kaldı?');
});
