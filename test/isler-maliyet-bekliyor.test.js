'use strict';
// G68 (invented values): a job the approval chain opened without any cost shows "Maliyet bekliyor", never a 100% margin,
// and stays out of profit/margin totals. Other jobs keep the usual rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// Pull named top-level functions and constants out of index.html (balanced braces), run them in a sandbox.
function pick(name) {
  const fn = html.indexOf('\nfunction ' + name + '(');
  const decl = html.indexOf('\nconst ' + name + ' ');
  const start = fn >= 0 ? fn + 1 : decl + 1;
  assert.ok(start > 0, name);
  if (fn < 0) return html.slice(start, html.indexOf(';\n', start) + 1);
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error('unbalanced ' + name);
}
function sandbox(jobs) {
  const table = { innerHTML: '' };
  const ctx = vm.createContext({ DATA: { jobs }, document: { getElementById: id => (id === 'islerAylikTable' ? table : null) }, Intl });
  const names = ['round2', 'fmtCurrency', 'fmtNum', 'fmtPercent', 'esc', 'AY_ADLARI', 'jobTotalAmount', 'jobCostItems', 'jobTotalCost',
    'jobGrossProfit', 'jobMargin', 'jobCostPending', 'COST_PENDING_BADGE', 'jobCostCell', 'renderIslerAylik'];
  vm.runInContext(names.map(pick).join('\n') + '\nthis.api={jobCostPending,jobCostCell,jobMargin,renderIslerAylik,COST_PENDING_BADGE};', ctx);
  return { api: ctx.api, table };
}
const chainJob = (extra = {}) => ({ id: 2, job_no: 'SIP-1', order_date: '2026-11-22', quantity: 20, unit_price: 420, cost_items: [], manual_total_cost: 0, kaynak: 'onay_zinciri', ...extra });
const handJob = (extra = {}) => ({ id: 1, job_no: 'MRC-001', order_date: '2026-11-10', quantity: 10, unit_price: 100, cost_items: [{ category: 'Toplam Maliyet', amount: 600 }], ...extra });

test('chain record without cost is pending; with cost items or a typed total it is not; other records never', () => {
  const { api } = sandbox([]);
  assert.equal(api.jobCostPending(chainJob()), true);
  assert.equal(api.jobCostPending(chainJob({ cost_items: [{ category: 'Kumaş', amount: 300 }] })), false);
  assert.equal(api.jobCostPending(chainJob({ manual_total_cost: 500 })), false);
  assert.equal(api.jobCostPending(handJob({ cost_items: [] })), false, 'a hand record without cost keeps the old rule');
  assert.equal(api.jobCostCell(chainJob(), api.jobMargin(chainJob()), v => v), api.COST_PENDING_BADGE);
  assert.match(api.COST_PENDING_BADGE, /Maliyet bekliyor/);
});

test('monthly summary leaves pending records out of cost, profit and margin', () => {
  const { api, table } = sandbox([handJob({ order_date: '2026-11-10' }), chainJob()]);
  api.renderIslerAylik();
  const row = table.innerHTML.split('<tr>').find(r => r.includes('Kasım 2026'));
  assert.match(row, /1 maliyet bekliyor/);
  assert.match(row, /40\.0%/, 'margin of the priced record only: (1000-600)/1000');
  assert.doesNotMatch(row, /100\.0%|94\./);
});
