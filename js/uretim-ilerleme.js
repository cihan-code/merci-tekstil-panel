// Generated from erci-materials-api agent/uretim/progress.js; keep core behavior identical.
var UretimIlerleme = (function () {
'use strict';

// Whole-order stage reports and preflight confirmations. Quantity remains an
// order attribute, not progress input. Plans never prove actual completion.
const { expandRoute, buildPlan } = UretimPlanlayici;
const cal = UretimPlanlayici.calendar;

const STATUS_LABELS = {
  not_started: 'Başlanmadı', in_progress: 'Devam ediyor', completed: 'Tamamlandı', blocked: 'Bekliyor',
  confirmed: 'Teyit edildi', missing: 'Yapılmadı', unknown: 'Teyit bekliyor',
};
const CHECKS = [
  { id: 'print_files_sent', label: 'Baskı dosyalarının baskıcıya gönderimi',
    question: 'Baskı dosyaları baskıcıya gönderildi mi?',
    missing_message: 'Baskı dosyaları baskıcıya gönderilmeli.',
    op_id: 'print_work', remind_at: ['print_dropoff', 'print_work'] },
  { id: 'embroidery_files_sent', label: 'Nakış dosyasının nakışçıya gönderimi',
    question: 'Nakış dosyası nakışçıya gönderildi mi?',
    missing_message: 'Nakış dosyası nakışçıya gönderilmeli.',
    op_id: 'embroidery_work', remind_at: ['embroidery_dropoff', 'embroidery_work'] },
];

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}

function entryKey(entry) {
  return JSON.stringify([String(entry.job_id), entry.kind || 'operation', entry.check_id || entry.op_id]);
}

function applicableChecks(rota, job) {
  const route = expandRoute(rota, job);
  return CHECKS.filter((check) => route.some((op) => op.id === check.op_id));
}

function validateReport(report, jobs, rota) {
  if (!report || typeof report.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(report.id)) {
    throw new Error('Bildirime benzersiz bir id verilmeli.');
  }
  if (!validDate(report.date)) throw new Error('Geçerli bir bildirim tarihi gerekli.');
  if (!Array.isArray(report.entries) || !report.entries.length) throw new Error('İşlem veya teyit gerekli.');
  const seen = new Set();
  const entries = report.entries.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Bildirim satırı geçersiz.');
    if (['quantity', 'completed_quantity', 'quantity_mode', 'first_progress'].some((key) => key in entry)) {
      throw new Error('İlerleme adetle tutulmuyor; işlemin durumunu bildirin.');
    }
    const job = jobs.find((j) => String(j.id) === String(entry.job_id));
    if (!job) throw new Error('Aktif iş bulunamadı: ' + entry.job_id);
    const kind = entry.kind || 'operation';
    const allowed = kind === 'check' ? ['confirmed', 'missing', 'unknown']
      : kind === 'operation' ? ['not_started', 'in_progress', 'completed', 'blocked'] : [];
    if (!allowed.includes(entry.status)) throw new Error('Geçersiz aşama veya teyit durumu.');
    if (kind === 'check') {
      if (entry.op_id || !applicableChecks(rota, job).some((c) => c.id === entry.check_id)) {
        throw new Error('Bu iş için teyit bulunamadı: ' + entry.check_id);
      }
    } else if (entry.check_id || !expandRoute(rota, job).some((op) => op.id === entry.op_id)) {
      throw new Error('Bu işte işlem bulunamadı: ' + entry.op_id);
    }
    if (entry.note !== undefined && typeof entry.note !== 'string') throw new Error('Açıklama metin olmalı.');
    const note = (entry.note || '').trim();
    if (entry.status === 'blocked' && !note) throw new Error('Bekleme nedeni gerekli.');
    const result = { job_id: job.id, kind,
      ...(kind === 'check' ? { check_id: entry.check_id } : { op_id: entry.op_id }),
      status: entry.status, note };
    if ('expected_report_id' in entry) {
      if (entry.expected_report_id !== null && typeof entry.expected_report_id !== 'string') {
        throw new Error('Önceki bildirim kimliği geçersiz.');
      }
      result.expected_report_id = entry.expected_report_id;
    }
    const key = entryKey(result);
    if (seen.has(key)) throw new Error('Aynı aşama veya teyit bir bildirimde iki kez yazılamaz.');
    seen.add(key);
    return result;
  });
  return { id: report.id, date: report.date, entries };
}

function latestEntries(reports, today) {
  if (!validDate(today)) throw new Error('Geçerli plan tarihi gerekli.');
  const latest = new Map();
  reports.map((report, index) => ({ report, index }))
    .filter(({ report }) => report.date <= today)
    .sort((a, b) => a.report.date.localeCompare(b.report.date) || a.index - b.index)
    .forEach(({ report }) => {
      for (const entry of report.entries) latest.set(entryKey(entry),
        { ...entry, date: report.date, report_id: report.id });
    });
  return [...latest.values()];
}

function addReport(reports, report, jobs, rota) {
  const normalized = validateReport(report, jobs, rota);
  const existing = reports.find((r) => r.id === normalized.id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
      throw new Error('Bu bildirim id farklı içerikle zaten kaydedilmiş.');
    }
    return reports;
  }
  const latest = latestEntries(reports, normalized.date);
  for (const entry of normalized.entries) {
    const key = entryKey(entry);
    if (reports.some((r) => r.date > normalized.date && r.entries.some((e) => entryKey(e) === key))) {
      throw new Error('Bu aşama veya teyit için daha yeni bildirim var.');
    }
    const previous = latest.find((e) => entryKey(e) === key);
    if ('expected_report_id' in entry && entry.expected_report_id !== (previous?.report_id || null)) {
      throw new Error('Taslak hazırlandıktan sonra kayıt değişti; taslağı yenileyin.');
    }
    const job = jobs.find((j) => String(j.id) === String(entry.job_id));
    if (entry.kind === 'operation' && entry.status !== 'completed' &&
        ((job.completed_operations || []).includes(entry.op_id) || previous?.status === 'completed')) {
      throw new Error('Bu işlem tamamlanmış görünüyor; önce çelişki çözülmeli.');
    }
  }
  return [...reports, normalized];
}

function prepareReport(draft, reports, jobs, rota) {
  const normalized = validateReport(draft, jobs, rota);
  const latest = latestEntries(reports, draft.date);
  for (const entry of normalized.entries) {
    entry.expected_report_id = latest.find((e) => entryKey(e) === entryKey(entry))?.report_id || null;
  }
  addReport(reports, normalized, jobs, rota);
  return normalized;
}

function applyProgress(rota, jobs, reports, today) {
  const latest = latestEntries(reports, today);
  const attention = [], rows = [], ready = [];
  for (const job of jobs) {
    const route = expandRoute(rota, job);
    const done = new Set(job.completed_operations || []);
    let held = false;
    for (const entry of latest.filter((e) => String(e.job_id) === String(job.id) && e.kind !== 'check')) {
      const op = route.find((o) => o.id === entry.op_id);
      if (!op) {
        held = true;
        attention.push({ job_id: job.id, kind: 'progress_conflict',
          message: 'İşin rotası aşama kaydıyla çelişiyor; teyit gerekli.' });
        continue;
      }
      const panelCompleted = done.has(entry.op_id);
      if (entry.status === 'completed') done.add(entry.op_id);
      if (entry.status === 'blocked' && !panelCompleted) {
        held = true;
        attention.push({ job_id: job.id, kind: 'progress_blocked', op_id: op.id,
          message: op.label + ': ' + entry.note });
      }
      rows.push({ ...entry, job_no: job.job_no || null, customer_name: job.customer_name,
        op_label: op.label, status: panelCompleted ? 'completed' : entry.status,
        status_label: STATUS_LABELS[panelCompleted ? 'completed' : entry.status],
        superseded_by_panel: panelCompleted && entry.status !== 'completed' });
    }
    // A reported operational blocker conservatively holds the whole order.
    if (!held) ready.push({ ...job, completed_operations: [...done] });
  }
  return { jobs: ready, progress_rows: rows, needs_attention: attention, latest };
}

function dependsOn(route, opId, ancestor, visited = new Set()) {
  if (opId === ancestor) return true;
  if (visited.has(opId)) return false;
  visited.add(opId);
  return (route.find((o) => o.id === opId)?.depends_on || [])
    .some((parent) => dependsOn(route, parent, ancestor, visited));
}

function buildProgressPlan(rota, jobs, reports, today) {
  const applied = applyProgress(rota, jobs, reports, today);
  const plan = buildPlan(rota, applied.jobs, today);
  const checkRows = [], reminders = [];
  const nextDay = cal.nextWorkingDay(rota.calendar, cal.addDays(today, 1));
  for (const planned of plan.jobs) {
    const job = applied.jobs.find((j) => String(j.id) === String(planned.job_id));
    const route = expandRoute(rota, job);
    const done = new Set(job.completed_operations);
    for (const check of applicableChecks(rota, job)) {
      if (done.has(check.op_id)) continue;
      const saved = applied.latest.find((e) => String(e.job_id) === String(job.id) && e.check_id === check.id);
      const status = saved?.status || 'unknown';
      const triggers = planned.timeline.filter((o) => check.remind_at.includes(o.op_id));
      const due = triggers.some((op) => op.start <= nextDay);
      const row = { job_id: job.id, job_no: job.job_no || null, customer_name: job.customer_name,
        check_id: check.id, op_id: check.op_id, label: check.label, status,
        status_label: STATUS_LABELS[status], date: saved?.date || null,
        message: status === 'missing' ? check.missing_message : check.question, due };
      checkRows.push(row);
      if (status === 'confirmed') continue;
      planned.provisional = true;
      planned.pending_checks = [...(planned.pending_checks || []), row];
      if (due) reminders.push(row);
      for (const item of plan.today_plan.filter((it) => String(it.job_id) === String(job.id))) {
        if (!dependsOn(route, item.op_id, check.op_id)) continue;
        item.readiness = status === 'missing' || item.readiness === 'blocked' ? 'blocked' : 'confirmation_required';
        item.actionable = false;
        item.preflight_checks = [...(item.preflight_checks || []), row];
      }
    }
  }
  for (const row of plan.today_plan) {
    const progress = applied.progress_rows.find((p) => String(p.job_id) === String(row.job_id) && p.op_id === row.op_id);
    row.progress_status = progress?.status || null;
    row.progress_date = progress?.date || null;
    row.progress_note = progress?.note || null;
    row.carried_over = !!progress && progress.date < today && progress.status !== 'completed';
    row.readiness = row.readiness || 'ready';
    row.actionable = row.actionable !== false;
    if (progress?.status === 'in_progress') {
      const planned = plan.jobs.find((j) => String(j.job_id) === String(row.job_id));
      planned.provisional = true;
      planned.unknowns.push(row.label + ': devam eden işlemin kalan süresi bildirilmedi.');
    }
  }
  return { ...plan, progress_rows: applied.progress_rows, check_rows: checkRows, reminders,
    needs_attention: [...applied.needs_attention, ...reminders.map((row) => ({
      ...row, kind: row.status === 'missing' ? 'preflight_missing' : 'preflight_confirmation',
    }))] };
}

return { STATUS_LABELS, CHECKS, applicableChecks, validateReport, latestEntries,
  addReport, prepareReport, applyProgress, buildProgressPlan };

})();
