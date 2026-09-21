const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console });
for (const file of ['uretim-planlayici.js', 'uretim-ilerleme.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
const rota = JSON.parse(fs.readFileSync(path.join(root, 'uretim-rota.json'), 'utf8'));
const p = ctx.UretimIlerleme;
const job = { id: 1, job_no: 'TEST', customer_name: 'Synthetic', product: 'tisort', quantity: 300,
  options: { printing: true, embroidery: false }, completed_operations: [] };
const report = (op, status, kind = 'operation') => ({ id: op + status, date: '2026-09-21',
  entries: [{ job_id: 1, kind, status, ...(kind === 'operation' ? { op_id: op } : { check_id: op }) }] });
const plan = (reports) => p.buildProgressPlan(rota, [job], reports, '2026-09-22');
const route = ctx.UretimPlanlayici.expandRoute(rota, job);
job.completed_operations = route.slice(0, route.findIndex((op) => op.id === 'sewing')).map((op) => op.id);
const carried = plan([report('sewing', 'not_started')]);
assert(carried.today_plan.some((op) => op.op_id === 'sewing' && op.carried_over));
assert(!plan([report('sewing', 'completed')]).today_plan.some((op) => op.op_id === 'sewing'));
assert(plan([report('sewing', 'blocked')]).needs_attention.length);
job.completed_operations = route.slice(0, route.findIndex((op) => op.id === 'print_work')).map((op) => op.id);
const waiting = plan([]);
assert(waiting.today_plan.some((op) => op.op_id === 'print_work' && !op.actionable));
const confirmed = plan([report('print_files_sent', 'confirmed', 'check')]);
assert(confirmed.today_plan.some((op) => op.op_id === 'print_work' && op.actionable));
assert.equal(typeof ctx.UretimPlanlayici.partQuestions, 'function');
assert(html.includes('uaPartConfirmHtml(j, q)'));
console.log('Browser syntax, carryover, completion, blockers, file confirmation and existing part controls passed.');
