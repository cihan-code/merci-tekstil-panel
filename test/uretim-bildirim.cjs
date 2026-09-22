const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.slice(html.indexOf('async function uaSubmitProgress()'), html.indexOf('async function renderUretimTakipDashboard()'));
assert(source.length > 0);
assert(html.indexOf('id="uaProgressInput"') > html.indexOf('id="view-uretim-ajan"'));
function setup(response, failure) {
  const elements = {
    uaProgressInput: { value: '123 kesimi bitti', disabled: false, focus() {} },
    uaProgressBtn: { disabled: false, addEventListener(event, handler) { this.click = handler; } },
    uaProgressResult: { textContent: '' },
  };
  const calls = [];
  let refreshes = 0;
  const context = vm.createContext({ document: { getElementById: id => elements[id] },
    matApi: async (url, options) => { calls.push({ url, options }); if (failure) throw Error(failure); return { json: async () => response }; },
    renderUretimTakipDashboard: async () => { refreshes++; },
  });
  vm.runInContext(source, context);
  return { elements, calls, run: () => elements.uaProgressBtn.click(), refreshes: () => refreshes };
}
test('saved whole-stage report refreshes plan and shows server receipt', async () => {
  const s = setup({ applied: [{ type: 'record_production_progress', summary: '123: kesim tamamlandı' }] });
  await s.run();
  assert.equal(s.calls[0].url, '/api/agent/act');
  assert.equal(JSON.parse(s.calls[0].options.body).instruction, '123 kesimi bitti');
  assert.equal(s.refreshes(), 1);
  assert.match(s.elements.uaProgressResult.textContent, /Kaydedildi: 123/);
  assert.equal(s.elements.uaProgressInput.value, '');
  assert.equal(s.elements.uaProgressBtn.disabled, false);
});
test('clarification, rejected and pending reports retain text without success', async () => {
  for (const out of [{ reply: 'Hangi iş?' }, { errors: [{ error: 'İş bulunamadı' }] }, { pending: [{ describe: 'Onay gereken değişiklik' }] }]) {
    const s = setup(out); await s.run();
    assert.equal(s.refreshes(), 0);
    assert.equal(s.elements.uaProgressInput.value, '123 kesimi bitti');
    assert.match(s.elements.uaProgressResult.textContent, /Henüz kayıt yapılmadı/);
    assert.doesNotMatch(s.elements.uaProgressResult.textContent, /Kaydedildi:/);
  }
});
test('network failure retains report and restores controls', async () => {
  const s = setup(null, 'Bağlantı kesildi'); await s.run();
  assert.match(s.elements.uaProgressResult.textContent, /Kayıt doğrulanamadı/);
  assert.equal(s.elements.uaProgressInput.value, '123 kesimi bitti');
  assert.equal(s.elements.uaProgressInput.disabled, false);
  assert.equal(s.elements.uaProgressBtn.disabled, false);
});
test('empty or duplicate submissions do not call API', async () => {
  const s = setup({}); s.elements.uaProgressInput.value = '  '; await s.run();
  s.elements.uaProgressInput.value = '123 kesimi bitti'; s.elements.uaProgressBtn.disabled = true; await s.run();
  assert.equal(s.calls.length, 0);
});
