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
  ctx.matApi = async () => { calls++; return { json: async () => ({ saved: false, clarification: 'Hangi üretim işlemi yapıldı? Bugün yapılan işlemi ve varsa kalan işi açıkça yazın.' }) }; };
  ctx.CLOUD_DIRTY = true;
  await api.submit({ preventDefault() {} }); assert.equal(calls, 0);
  ctx.CLOUD_DIRTY = false;
  await api.submit({ preventDefault() {} }); assert.equal(calls, 1);
  assert.equal(elements.opFeedbackText.value, 'Baskı yapıldı.');
  assert.match(elements.opFeedbackStatus.textContent, /Hangi üretim işlemi/);
});

function finalFixture() {
  const s = snapshot();
  s.jev = { configured: true }; s.state_hash = 'current-state';
  s.records[0].planning_basis = { assigned_to: '', follow_up_date: null, note: 'Original', problem_note: '' };
  s.records.push({ record_id: 8, basis: { status: 'Dikimde', customer: 'Synthetic B', quantity: 80,
    decoration: 'yok', est_delivery: null }, planning_basis: { assigned_to: '', follow_up_date: null, note: '', problem_note: '' }, revision: null, reminders: [], history: [] });
  s.plan = { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()), version: 1, status: 'ready', source: 'jev', state_hash: s.state_hash,
    considered_count: 2, record_count: 2, decisions: [
      { record_id: 7, task_key: 'reported_remaining', action: 'Önce kâğıt engelini gider; kalan 5 adedi tamamla', disposition: 'do', priority: 1, source: 'jev', confidence: .9 },
      { record_id: 8, task_key: 'finish_sewing', action: 'Dikimi bitir; paketlemeye hazırla', disposition: 'do', priority: 2, source: 'jev', confidence: .8 },
    ] };
  return s;
}
function finalRows() { return [{ u: record(), deco: 'baski' }, { u: { id: 8, status: 'Dikimde', customer_name: 'Synthetic B', quantity: 80 }, deco: 'yok' }]; }
test('all rows, including feedback rows, use the shared final Jev actions', () => {
  const { api } = harness(); const s = finalFixture(); api.setState(s);
  const rows = finalRows(), original = JSON.stringify(rows); api.apply(rows);
  assert.equal(rows[0].action, s.plan.decisions[0].action); assert.equal(rows[0].source, 'jev');
  assert.equal(rows[1].action, s.plan.decisions[1].action); assert.equal(rows[1].priority, 2);
  assert.equal(rows[0].u.quantity, 100); assert.match(rows[0].action, /kalan 5/);
  assert.match(original, /Original/);
});
test('a planning note change invalidates the complete global plan', () => {
  const { api } = harness(); api.setState(finalFixture()); const rows = finalRows(); rows[1].u.note = 'New constraint';
  api.apply(rows); assert.ok(rows.every(row => row.planStale)); assert.ok(rows.every(row => row.source !== 'jev'));
});
test('incomplete, duplicated or malformed final decisions never apply partially', () => {
  for (const mutate of [s => s.plan.decisions.pop(), s => s.plan.decisions[1].record_id = 7,
    s => s.plan.decisions[1].priority = 1, s => s.plan.decisions[1].disposition = 'done',
    s => s.plan.decisions[1].confidence = 2, s => s.plan.state_hash = 'old']) {
    const { api } = harness(), s = finalFixture(); mutate(s); api.setState(s); const rows = finalRows(); api.apply(rows);
    assert.ok(rows.every(row => !row.planApplied)); assert.ok(rows.every(row => row.planStale));
  }
});
test('completed feedback is excluded from pending decisions without being scheduled again', () => {
  const { api } = harness(), s = finalFixture();
  s.records[0].revision = { status: 'Teslim Edildi', section: 'Tamamlanan', action: 'Teslim edildi.' };
  s.plan.decisions.shift(); s.plan.decisions[0].priority = 1; s.plan.record_count = 1;
  api.setState(s); const rows = finalRows(); api.apply(rows);
  assert.equal(rows[0].u.status, 'Teslim Edildi'); assert.equal(rows[0].planApplied, undefined);
  assert.equal(rows[1].source, 'jev');
});
test('refresh only reads; explicit evaluate posts once and dirty state blocks it', async () => {
  const { ctx, api } = harness(); api.setState(finalFixture());
  ctx.DATA = { uretimTakip: [] }; ctx.esc = String;
  const calls = []; ctx.matApi = async (url, opts) => { calls.push({ url, method: opts?.method || 'GET' }); return { json: async () => finalFixture() }; };
  await vm.runInContext('operationsRefresh()', ctx);
  assert.equal(calls[0].method, 'GET');
  ctx.CLOUD_DIRTY = true; await vm.runInContext('operationsEvaluatePlan()', ctx); assert.equal(calls.length, 1);
  ctx.CLOUD_DIRTY = false; await vm.runInContext('operationsEvaluatePlan()', ctx);
  assert.equal(calls.length, 2); assert.equal(calls[1].url, '/api/agent/operations/plan'); assert.equal(calls[1].method, 'POST');
});

test('documented server stage transitions bridge the short paneldata delay without stale warnings', () => {
  const { api } = harness(); const s = finalFixture();
  s.records[0].basis.status = 'Dikimde';
  s.records[0].revision = { status: 'Dikimde', action: 'Dikime alındı.', section: 'Dikim' };
  s.records[0].stage_sync = { status: 'applied', from_status: 'Baskı/Nakışta', to_status: 'Dikimde' };
  const rows = finalRows(); api.setState(s); api.apply(rows);
  assert.equal(rows[0].planStale, undefined); assert.equal(rows[0].source, 'jev'); assert.equal(rows[0].u.status, 'Dikimde');
});
test('stage-only compatibility never hides changed quantities or unsaved manual stages', () => {
  for (const dirty of [false, true]) {
    const { api, ctx } = harness(); const s = finalFixture();
    s.records[0].basis.status = 'Dikimde'; s.records[0].stage_sync = { status: 'applied', from_status: 'Baskı/Nakışta', to_status: 'Dikimde' };
    ctx.CLOUD_DIRTY = dirty;
    const rows = finalRows(); if (!dirty) rows[0].u.quantity = 200;
    api.setState(s); api.apply(rows); assert.equal(rows[0].planStale, true);
  }
});
test('report adopts canonical server data through existing sync and displays the stage change', async () => {
  const { api, ctx, elements } = harness(); const s = finalFixture(); api.setState(s);
  ctx.DATA = { uretimTakip: [record()] };
  elements.opFeedbackJob.value = '7'; elements.opFeedbackText.value = 'Dikime alındı.';
  let adoptions = 0, saves = 0;
  ctx.adoptCloudSnapshot = cloud => { adoptions++; ctx.DATA = cloud.data; return true; };
  ctx.saveData = () => saves++;
  ctx.matApi = async () => ({ json: async () => ({ saved: true, snapshot: s,
    panel_sync: { data: { uretimTakip: [{ ...record(), status: 'Dikimde' }] }, updatedAt: '2026-10-02T08:00:00Z' },
    stage_sync: { status: 'applied', from_status: 'Baskı/Nakışta', to_status: 'Dikimde' } }) });
  await api.submit({ preventDefault() {} });
  assert.equal(adoptions, 1); assert.equal(saves, 0); assert.equal(ctx.DATA.uretimTakip[0].status, 'Dikimde');
  assert.match(elements.opFeedbackStatus.textContent, /Aşama: Baskı\/Nakışta → Dikimde/);
});
test('edits made while the report response is arriving are preserved without a second cloud write', async () => {
  const { api, ctx, elements } = harness(); const s = finalFixture(); api.setState(s);
  ctx.DATA = { jobs: [], uretimTakip: [record()] };
  elements.opFeedbackJob.value = '7'; elements.opFeedbackText.value = 'Dikime alındı.';
  let adoptions = 0; ctx.adoptCloudSnapshot = () => { adoptions++; return true; };
  ctx.matApi = async () => ({ json: async () => {
    ctx.DATA.jobs.push({ id: 99, title: 'Keep local edit' }); ctx.CLOUD_DIRTY = true;
    return { saved: true, snapshot: s, panel_sync: { data: { jobs: [], uretimTakip: [] }, updatedAt: '2026-10-02T08:00:00Z' } };
  } });
  await api.submit({ preventDefault() {} });
  assert.equal(adoptions, 0); assert.equal(ctx.DATA.jobs.length, 1); assert.equal(ctx.CLOUD_DIRTY, true);
  assert.match(elements.opFeedbackStatus.textContent, /Yerel değişikliklerin korundu/);
});

test('partial work without a count uses the shared stage and reason, with no null count', () => {
  const { api } = harness(); const s = finalFixture();
  s.records[0].entries = [{ op: 'cut', status: 'partial', remaining: null, reason: 'kapşon astarı henüz kesilmedi' }];
  s.records[0].revision = { status: 'Kesimde', section: 'Gün içi revizyon', action: 'Kesim: kalanı tamamla', note: 'kapşon astarı henüz kesilmedi' };
  s.records[0].basis.status = 'Kesimde'; s.records[0].stage_sync = { status: 'applied', from_status: 'Baskı/Nakışta', to_status: 'Kesimde' };
  s.plan.decisions[0].action = 'Kesim: kalanı tamamla. Kapşon astarı henüz kesilmedi';
  const rows = finalRows(); api.setState(s); api.apply(rows);
  assert.equal(rows[0].u.status, 'Kesimde'); assert.equal(rows[0].source, 'jev');
  assert.match(rows[0].action, /astarı/); assert.doesNotMatch(rows[0].action, /null|undefined/);
});
test('foreign clarification never reaches the screen and retains the report text', async () => {
  const { api, ctx, elements } = harness(); api.setState(snapshot());
  elements.opFeedbackJob.value = '7'; elements.opFeedbackText.value = 'İş halledildi.';
  ctx.matApi = async () => ({ json: async () => ({ saved: false, clarification: 'Please specify which operation.' }) });
  await api.submit({ preventDefault() {} });
  assert.match(elements.opFeedbackStatus.textContent, /Hangi üretim işlemi/);
  assert.doesNotMatch(elements.opFeedbackStatus.textContent, /Please/);
  assert.equal(elements.opFeedbackText.value, 'İş halledildi.');
});

test('unexpected native JSON errors are shown in Turkish, preserving the report input', async () => {
  const { api, ctx, elements } = harness(); api.setState(snapshot());
  elements.opFeedbackJob.value = '7'; elements.opFeedbackText.value = 'Kesim yapıldı.';
  ctx.matApi = async () => ({ json: async () => { throw new SyntaxError('Unexpected token in JSON'); } });
  await api.submit({ preventDefault() {} });
  assert.match(elements.opFeedbackStatus.textContent, /Sunucu yanıtı işlenemedi/);
  assert.doesNotMatch(elements.opFeedbackStatus.textContent, /Unexpected/);
  assert.equal(elements.opFeedbackText.value, 'Kesim yapıldı.');
});

test('capacity actions preserve the shared 200/0 allocation and reject malformed estimates', () => {
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/capacity-plan.json')));
  const s = payload.snapshot;
  s.plan.date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  const { api } = harness(); api.setState(s);
  const rows = payload.data.uretimTakip.map(u => ({ u, deco: 'yok' }));
  api.apply(rows);
  assert.deepEqual(rows.map(r => r.capacity.today_quantity), [200, 0]);
  assert.equal(rows[1].disposition, 'defer');
  assert.match(rows[0].action, /≈200 adet/); assert.match(rows[1].action, /zorlanmış kapasite/);
  s.plan.decisions[0].capacity.today_quantity = 300;
  const invalid = payload.data.uretimTakip.map(u => ({ u, deco: 'yok' })); api.apply(invalid);
  assert.ok(invalid.every(r => r.planStale)); assert.ok(invalid.every(r => !r.planApplied));
});
test('changing the selected product invalidates the whole shared capacity plan', () => {
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/capacity-plan.json')));
  const s = payload.snapshot;
  s.plan.date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  const { api } = harness(); api.setState(s);
  const rows = payload.data.uretimTakip.map(u => ({ u, deco: 'yok' }));
  rows[0].u.product_type = 'tisort'; api.apply(rows);
  assert.ok(rows.every(r => r.planStale)); assert.ok(rows.every(r => !r.planApplied));
});
test('recipe notes from the final plan are kept per row; malformed recipe data never applies', () => {
  const recipe = { version: 1, product_type: 'tam_fermuar', label: 'Tam fermuarlı', cord: null, lining: null,
    hints: ['Dikimde kemerleme yapılır.'], materials: null,
    preparations: [{ op: 'zipper', label: 'Tam fermuar temini', condition: null, status: 'unconfirmed', reason: '', text: 'Tam fermuar temini teyit edilsin.' }],
    text: 'Dikimde kemerleme yapılır. Tam fermuar temini teyit edilsin.' };
  const { api } = harness(), s = finalFixture(); s.plan.decisions[1].recipe = recipe; api.setState(s);
  const rows = finalRows(); api.apply(rows);
  assert.equal(rows[1].recipe.text, recipe.text); assert.equal(rows[0].recipe, null);
  assert.equal(rows[1].action, s.plan.decisions[1].action);
  for (const broken of [{ ...recipe, version: 2 }, { ...recipe, hints: [1] }, { ...recipe, preparations: [{ text: 'x' }] }, 'text']) {
    const other = harness(), bad = finalFixture(); bad.plan.decisions[1].recipe = broken; other.api.setState(bad);
    const badRows = finalRows(); other.api.apply(badRows);
    assert.ok(badRows.every(row => !row.planApplied && row.planStale));
  }
});
test('daily plan shows materials with the action and lists preparations separately', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const pick = name => { const start = html.indexOf('function ' + name + '('); let depth = 0, i = html.indexOf('{', start);
    for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && !--depth) break; }
    return html.slice(start, i + 1); };
  const ctx = vm.createContext({ fmtNum: n => String(n) });
  vm.runInContext(['opPlanRecipeText', 'opPlanTodo', 'opPlanDaily'].map(pick).join('\n') + '\nthis.daily = opPlanDaily; this.todo = opPlanTodo;', ctx);
  const recipe = { hints: ['Kesimden sonra kapüşonu ilikçiye gönder.'], materials: { message: 'Malzeme (fire hariç): ≈180 kg kumaş.', items: [] },
    preparations: [{ label: 'Tam fermuar temini', text: 'Tam fermuar temini teyit edilsin.' }] };
  const row = { u: { id: 1, customer_name: 'A', quantity: 250, status: 'Kumaş Geldi' }, planApplied: true, source: 'jev',
    disposition: 'do', priority: 1, late: 0, action: 'Kesimi yap.', recipe };
  const sections = ctx.daily({ today: '2026-10-08', groups: [['Kesim', [row]]] });
  const byTitle = Object.fromEntries(sections.map(s => [s.title, s.lines]));
  assert.deepEqual(byTitle['Bugün yapılacaklar'], ['A (≈250 adet): Kesimi yap. Kesimden sonra kapüşonu ilikçiye gönder. Malzeme (fire hariç): ≈180 kg kumaş.']);
  assert.deepEqual(byTitle['Hazırlık teyitleri'], ['A (≈250 adet): Tam fermuar temini teyit edilsin.']);
  assert.match(ctx.todo(row, true), /Malzeme.*Tam fermuar temini teyit edilsin\.$/);
  assert.equal(ctx.todo({ action: 'Kesimi yap.', recipe: null }, true), 'Kesimi yap.');
});
test('Kordon is asked only for sweat, tam fermuarlı, şort and eşofman; Astar only for hooded products', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
  const pick = name => { const start = html.indexOf('function ' + name + '('); let depth = 0, i = html.indexOf('{', start);
    for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && !--depth) break; }
    return html.slice(start, i + 1); };
  const labels = html.match(/const OPPLAN_PRODUCT_LABEL = (\{[^}]*\});/)[1];
  const ctx = vm.createContext({});
  vm.runInContext('const OPPLAN_PRODUCT_LABEL = ' + labels + ';\n' + between('const URETIM_CORD_PRODUCTS', 'function openGenericEditModal') +
    '\n' + pick('uretimSyncOptionalFields').replace("document.getElementById('formUretim')", 'this.form') +
    '\nthis.fields = ENTITY_CONFIGS.uretim.fields; this.sync = uretimSyncOptionalFields;', ctx);
  const show = (name, label) => ctx.fields.find(f => f.name === name).showIf({ get: () => label });
  assert.deepEqual(['Sweatshirt', 'Tam fermuarlı', 'Şort', 'Eşofman', 'Tişört', 'Polo yaka', 'Yarım fermuarlı', 'Polar', '— Belirtilmedi —'].map(l => [show('cord', l), show('lining', l)]),
    [[true, true], [true, true], [true, false], [true, false], [false, false], [false, false], [false, false], [false, false], [false, false]]);
  const field = value => { const box = { style: {} }; return { value, box, closest: () => box }; };
  for (const [product, cordShown, liningShown] of [['tisort', false, false], ['sort', true, false], ['sweat', true, true]]) {
    ctx.form = { elements: { product_type: { value: product }, cord: field('yok'), lining: field('yok') } };
    ctx.sync();
    const { cord, lining } = ctx.form.elements;
    assert.equal(cord.box.style.display, cordShown ? '' : 'none'); assert.equal(cord.value, cordShown ? 'yok' : '');
    assert.equal(lining.box.style.display, liningShown ? '' : 'none'); assert.equal(lining.value, liningShown ? 'yok' : '');
  }
  assert.match(html, /if \(f\.showIf && !f\.showIf\(fd\)\) \{ item\[f\.name\] = ''; return; \}/);
});
test('dated expectations reach the row note and Günün planı; delivery changes are announced', () => {
  const { api, ctx } = harness(), s = finalFixture();
  s.records[1].expectations = [
    { op: 'embroidery', status: 'due', text: 'Bugün bekleniyor: Nakış — “pazartesi bitecek” (09.10 bildirimi).' },
    { op: 'sewing', status: 'upcoming', text: 'Beklenen: Dikim 14.10 — “çarşamba biter” (09.10 bildirimi).' },
    { op: 'x', status: 'weird', text: 'ignored' }, null];
  api.setState(s); const rows = finalRows(); api.apply(rows);
  assert.equal(rows[1].expectations.map(x => x.status).join(), "due,upcoming");
  assert.match(rows[1].u.note, /Bugün bekleniyor: Nakış/); assert.doesNotMatch(rows[1].u.note, /ignored/);
  assert.equal(rows[0].expectations.length, 0);
  const message = vm.runInContext('operationsStageMessage', ctx);
  assert.equal(message({ status: 'applied', from_status: 'Kesimde', to_status: 'Baskı/Nakışta', from_delivery: '2026-10-15', to_delivery: '2026-10-13' }),
    'Aşama: Kesimde → Baskı/Nakışta\nTahmini teslimat: 15.10.2026 → 13.10.2026');
  assert.equal(message({ status: 'applied', from_status: 'Kesimde', to_status: 'Kesimde', from_delivery: null, to_delivery: '2026-10-13' }), 'Tahmini teslimat: boş → 13.10.2026');
  assert.equal(message({ status: 'applied', from_status: 'Kesimde', to_status: 'Kesimde' }), '');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const pick = name => { const start = html.indexOf('function ' + name + '('); let depth = 0, i = html.indexOf('{', start);
    for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && !--depth) break; }
    return html.slice(start, i + 1); };
  const daily = vm.createContext({ fmtNum: n => String(n) });
  vm.runInContext(['opPlanRecipeText', 'opPlanTodo', 'opPlanDaily'].map(pick).join('\n') + '\nthis.daily = opPlanDaily;', daily);
  const sections = daily.daily({ today: '2026-10-12', groups: [['Baskı / Nakış', [{ ...rows[1], u: { ...rows[1].u, customer_name: 'B', quantity: 80 }, late: 0 }]]] });
  assert.deepEqual(sections.find(x => x.title === 'Bugün beklenenler').lines, ['B (≈80 adet): Bugün bekleniyor: Nakış — “pazartesi bitecek” (09.10 bildirimi).']);
});
