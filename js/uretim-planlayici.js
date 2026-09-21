// Ported from uretim/lib/calendar.js, scheduler.js, panelAdapter.js (erci-materials-api).
// Pure, dependency-free JS - no Node builtins used. Runs the SAME deterministic
// production scheduler in the browser, against panel data already in memory,
// so the daily dashboard needs no network round-trip and no AI call.
// Source of truth stays uretim/ in the mercitex-operations-agent repo; keep in sync by hand.
'use strict';
var UretimPlanlayici = (function () {
// ---------------- lib/calendar.js ----------------
'use strict';

// Working-day arithmetic for the production scheduler.
//
// A day carries a "factor": the fraction of a full working day available.
// Saturday is a half day for everyone EXCEPT the sewing workshop, which works
// a full Saturday - that is expressed in rota.json as calendar.overrides.sewing.
//
// All dates are ISO strings (YYYY-MM-DD) handled in UTC so there is no DST drift.

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const MS_PER_DAY = 86400000;

function assertISO(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) {
    throw new Error('Tarih YYYY-MM-DD olmalı: ' + iso);
  }
  return iso;
}

function toDate(iso) {
  return new Date(assertISO(iso) + 'T00:00:00Z');
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  return toISO(new Date(toDate(iso).getTime() + n * MS_PER_DAY));
}

function diffDays(fromISO, toISOStr) {
  return Math.round((toDate(toISOStr) - toDate(fromISO)) / MS_PER_DAY);
}

function dayName(iso) {
  return DAY_NAMES[toDate(iso).getUTCDay()];
}

// Fraction of a full working day available on `iso` for operation `opId`.
// opId is optional; when given, calendar.overrides[opId] wins over the default.
function dayFactor(calendar, iso, opId) {
  const name = dayName(iso);
  const overrides = (calendar && calendar.overrides) || {};
  if (opId && overrides[opId] && overrides[opId][name] !== undefined) {
    return overrides[opId][name];
  }
  const working = (calendar && calendar.working_days) || {};
  return working[name] === undefined ? 1 : working[name];
}

function isWorkingDay(calendar, iso, opId) {
  return dayFactor(calendar, iso, opId) > 0;
}

// First day at or after `iso` on which `opId` can do any work.
function nextWorkingDay(calendar, iso, opId) {
  let cur = assertISO(iso);
  for (let guard = 0; guard < 400; guard++) {
    if (isWorkingDay(calendar, cur, opId)) return cur;
    cur = addDays(cur, 1);
  }
  throw new Error('nextWorkingDay: çalışma günü bulunamadı (' + iso + ')');
}

// Consume `workDays` full-day-equivalents of effort starting at `startISO`.
// Returns { start, end } - both the first day worked and the day the work finishes.
// A 1-day task started on a Saturday (factor 0.5) spills into Monday.
function addWorkDays(calendar, startISO, workDays, opId) {
  const start = nextWorkingDay(calendar, startISO, opId);
  if (!(workDays > 0)) return { start, end: start };

  let remaining = workDays;
  let cur = start;
  for (let guard = 0; guard < 2000; guard++) {
    const factor = dayFactor(calendar, cur, opId);
    if (factor > 0) {
      remaining -= factor;
      if (remaining <= 1e-9) return { start, end: cur };
    }
    cur = addDays(cur, 1);
  }
  throw new Error('addWorkDays: sonlanmadı (' + startISO + ', ' + workDays + ')');
}

// ---------------- scheduler.js ----------------
var cal = { addDays, diffDays, dayName, dayFactor, isWorkingDay, nextWorkingDay, addWorkDays, toISO };
'use strict';

// Deterministic production scheduler for the Mercitex daily plan.
//
// NO model call happens here and no number is guessed. Every duration comes from
// rota.json; anything rota.json leaves as null is reported as an explicit unknown
// rather than being silently treated as instant.
//
// Flow per job:
//   1. expandRoute   - drop the operations this job does not use, resolve labels
//   2. pre-sewing    - forward-schedule from today (cutting runs parallel;
//                      printing and embroidery run parallel on different bundles)
//   3. sewing queue  - ALL jobs share one workshop; capacity is allocated by
//                      earliest delivery date first
//   4. post-sewing   - buttonholes, ironing/packing, delivery
//
// Durations with a min/max range produce two passes: an earliest and a latest
// schedule. The daily action list uses the earliest pass (work that COULD start
// today should start today); delivery estimates report the range.


const PRINT_OPS = ['print_dropoff', 'print_work'];
const EMBROIDERY_OPS = ['embroidery_dropoff', 'embroidery_work'];

// ---------------------------------------------------------------- route

// Which operations does this specific job actually go through?
function expandRoute(rota, job) {
  const product = rota.products[job.product];
  if (!product) throw new Error('Bilinmeyen ürün: ' + job.product);
  const opts = job.options || {};
  const out = [];

  for (const base of rota.base_route) {
    if (PRINT_OPS.includes(base.id) && !opts.printing) continue;
    if (EMBROIDERY_OPS.includes(base.id) && !opts.embroidery) continue;

    if (base.id === 'buttonhole_button') {
      const has = product.has_buttonhole;
      if (!has) continue;
      if (has === 'optional' && !opts.buttonhole) continue;
    }

    const op = Object.assign({}, base);

    if (base.id === 'cut_extra_parts') {
      const parts = applicableParts(product, opts);
      if (!parts.length) continue; // e.g. polar, şort have no extra cut part
      op.parts = parts;
      // "Yaka ribanası kesimi", "Kaşkorse (etek ve kol) + Kapüşon astarı kesimi" - the
      // field needs to read which pieces are being cut, not a generic "cutting".
      op.label = parts.map((p) => p.label).join(' + ') + ' kesimi';
    }

    if (base.id === 'buttonhole_button' && product.buttonhole_label) {
      op.label = product.buttonhole_label;
    }

    if (base.id === 'sewing') {
      op.capacity_per_day = product.sewing_capacity_per_day;
    }

    out.push(op);
  }
  return out;
}

function applicableParts(product, opts) {
  return (product.extra_cut_parts || []).filter((part) => {
    if (!part.optional) return true;
    return !!(opts.parts && opts.parts[part.id]);
  });
}

// Accessories the job needs, and whether we have been told they are in stock.
function accessoryBlockers(rota, job) {
  const product = rota.products[job.product];
  const opts = job.options || {};
  const stock = opts.accessories_in_stock || {};
  const blockers = [];

  for (const acc of product.accessories || []) {
    if (acc.condition && !opts[acc.condition] && !(opts.parts && opts.parts[acc.condition])) continue;
    if (stock[acc.id] === true) continue;
    if (stock[acc.id] === false) {
      blockers.push({
        kind: 'accessory_missing',
        accessory: acc.id,
        message: acc.label + ' stokta yok - sipariş edilmeli, dikimi bloklar.',
        lead_days_known: acc.order_lead_days != null,
      });
    } else {
      blockers.push({
        kind: 'accessory_unknown',
        accessory: acc.id,
        message: acc.label + ' elde var mı, sorulmadı.',
      });
    }
  }

  // Every Merci job carries printing or embroidery - a plain garment is not produced.
  // Both explicitly answered "no" therefore means the job data is wrong, not that the
  // decoration stage should be skipped silently.
  if (opts.printing === false && opts.embroidery === false) {
    blockers.push({
      kind: 'no_decoration',
      message: 'Bu işte ne baskı ne nakış işaretli - düz ürün üretilmediği için bu bilgi hatalı olmalı, teyit edilmeli.',
    });
  }
  return blockers;
}

// The panel already records the decoration choice on the job as
//   baski_nakis_secim = { template, extras, items: [{ type: 'baski'|'nakis', size }] }
// Older records used the single-valued { baski: 'X', nakis: 'Y' } shape instead.
// Reading it means the agent never has to ask whether a job is printed or embroidered.
function decorationFromPanel(secim) {
  let items = [];
  if (secim) {
    if (Array.isArray(secim.items)) {
      items = secim.items.slice();
    } else {
      if (secim.baski) items.push({ type: 'baski', size: secim.baski });
      if (secim.nakis) items.push({ type: 'nakis', size: secim.nakis });
    }
  }
  return {
    printing: items.some((i) => i && i.type === 'baski'),
    embroidery: items.some((i) => i && i.type === 'nakis'),
    decoration_items: items,
    template: (secim && secim.template) || null,
  };
}

// Build scheduler options for a panel job: decoration comes from panel data,
// everything else still needs a human answer.
function optionsFromPanelJob(panelJob, confirmed) {
  const decoration = decorationFromPanel(panelJob && panelJob.baski_nakis_secim);
  return Object.assign(
    { printing: decoration.printing, embroidery: decoration.embroidery },
    confirmed || {},
    { decoration_items: decoration.decoration_items }
  );
}

// Optional cut parts nobody has answered yet, in a structured shape so a UI can
// ask them as a yes/no question and feed the answer straight back as options.parts.
// Asked once per job - the answer belongs to the cutting step, not to every day.
function partQuestions(rota, job) {
  const product = rota.products[job.product];
  const opts = job.options || {};
  const out = [];
  for (const part of product.extra_cut_parts || []) {
    if (!part.optional) continue;
    if (opts.parts && part.id in opts.parts) continue;
    out.push({
      kind: 'part_unknown',
      part: part.id,
      label: part.label,
      message: part.requires_confirmation || (part.label + ' olacak mı?'),
    });
  }
  return out;
}

// Options the job needs answered before it can be planned honestly.
function openQuestions(rota, job) {
  const product = rota.products[job.product];
  const opts = job.options || {};
  const questions = partQuestions(rota, job).map((q) => q.message);

  if (product.has_buttonhole === 'optional' && !('buttonhole' in opts)) {
    questions.push(product.buttonhole_confirmation || 'İlik açılacak mı?');
  }
  if (!('printing' in opts)) questions.push('Bu işte baskı var mı?');
  if (!('embroidery' in opts)) questions.push('Bu işte nakış var mı?');
  for (const acc of product.accessories || []) {
    const stock = opts.accessories_in_stock || {};
    if (!(acc.id in stock)) questions.push(acc.label + ' elde var mı?');
  }
  return questions;
}

// ------------------------------------------------------------ durations

const UNKNOWN = Symbol('unknown duration');

function resolveDuration(op, job, mode) {
  if (op.capacity_from_product) return null; // handled by the shared sewing queue
  if (op.duration_rule) return null;         // handled by the cutoff rule

  if (op.duration_business_days_min !== undefined) {
    return mode === 'max' ? op.duration_business_days_max : op.duration_business_days_min;
  }

  if (op.duration_days === null || op.duration_days === undefined) return UNKNOWN;

  let days = op.duration_days;
  if (op.id === 'iron_pack') {
    const threshold = op.high_quantity_threshold;
    if (threshold == null) return { days, unknownExtra: true };
    if (job.quantity >= threshold) days += op.high_quantity_extra_days || 0;
  }
  return days;
}

// --------------------------------------------------------- job schedule

// A handoff (dropping bundles at the printer, handing the order to the courier)
// normally happens the NEXT morning, because the preceding step finishes late in
// the day. It only happens the same day when the preceding step finished early -
// which the scheduler cannot know from dates alone, so it must be told:
// job.early_handoffs = ['print_dropoff', ...]
function handoffStart(op, job, cursor, prevEnd) {
  if (!op.handoff_rule || !prevEnd) return cursor;
  const early = job.early_handoffs || [];
  return early.includes(op.id) ? prevEnd : cursor;
}

function scheduleLinear(calendar, ops, startISO, job, mode, timeline, unknowns, prevEndInit) {
  let cursor = startISO;
  let prevEnd = prevEndInit || null;

  for (const op of ops) {
    const resolved = resolveDuration(op, job, mode);
    let days = resolved;
    let unknownDuration = false;

    if (resolved === UNKNOWN) {
      days = 0;
      unknownDuration = true;
      unknowns.push(op.label + ' süresi tanımsız');
    } else if (resolved && typeof resolved === 'object' && resolved.unknownExtra) {
      days = resolved.days;
      unknowns.push(op.label + ' için "yüksek adet" eşiği tanımsız');
    }

    const from = handoffStart(op, job, cursor, prevEnd);
    const span = cal.addWorkDays(calendar, from, days, op.id);
    timeline.push(entry(op, span, unknownDuration));
    prevEnd = span.end;
    cursor = days > 0 ? cal.addDays(span.end, 1) : span.start;
  }
  return cursor;
}

function entry(op, span, unknownDuration) {
  return {
    op_id: op.id,
    label: op.label,
    kind: op.kind,
    location: op.location || null,
    start: span.start,
    end: span.end,
    unknown_duration: !!unknownDuration,
    parts: op.parts ? op.parts.map((p) => p.label) : undefined,
    // Parts that are only in this cut because a human confirmed them - worth
    // calling out on the shop floor, the standard parts are not.
    confirmed_parts: op.parts ? op.parts.filter((p) => p.optional).map((p) => p.label) : undefined,
  };
}

function splitPhases(ops) {
  const idx = ops.findIndex((o) => o.id === 'sewing');
  if (idx === -1) throw new Error('Rotada dikim operasyonu yok.');
  return {
    pre: ops.slice(0, idx).filter((o) => o.id !== 'sewing_dropoff'),
    dropoff: ops.find((o) => o.id === 'sewing_dropoff') || null,
    sewing: ops[idx],
    post: ops.slice(idx + 1),
  };
}

// Everything up to (not including) sewing. Cutting is parallel; the print and
// embroidery branches are parallel with each other.
function schedulePreSewing(calendar, phases, job, mode, today) {
  const timeline = [];
  const unknowns = [];
  const done = new Set(job.completed_operations || []);
  const pending = phases.pre.filter((o) => !done.has(o.id));

  const take = (ids) => pending.filter((o) => ids.includes(o.id));
  const fabric = take(['fabric_order', 'fabric_arrival']);
  const cutting = take(['cut_main', 'cut_extra_parts']);
  const printing = take(PRINT_OPS);
  const embroidery = take(EMBROIDERY_OPS);

  let cursor = today;

  // Fabric order + arrival, driven by the 09:00 cutoff rule.
  for (const op of fabric) {
    if (op.id === 'fabric_order') {
      const span = cal.addWorkDays(calendar, cursor, 0, op.id);
      timeline.push(entry(op, span, false));
      cursor = span.start;
      continue;
    }
    const rule = op.duration_rule;
    const offset = job.fabric_order_after_cutoff
      ? rule.after_cutoff_arrival_day_offset
      : rule.before_cutoff_arrival_day_offset;
    const arrival = cal.addDays(cursor, offset);
    timeline.push(entry(op, { start: arrival, end: arrival }, false));
    // Fabric lands at 17:00-18:00, so cutting can only begin the next day.
    cursor = cal.addDays(arrival, 1);
  }

  // Cutting: both operations run in parallel, so the phase ends at the later one.
  let cutEnd = null;
  if (cutting.length) {
    for (const op of cutting) {
      const days = resolveDuration(op, job, mode);
      const span = cal.addWorkDays(calendar, cursor, days === UNKNOWN ? 0 : days, op.id);
      timeline.push(entry(op, span, days === UNKNOWN));
      if (!cutEnd || span.end > cutEnd) cutEnd = span.end;
    }
    cursor = cal.addDays(cutEnd, 1);
  }

  // Print and embroidery branches run at the same time on different bundles.
  // Each branch opens with a handoff whose timing depends on when cutting finished.
  let branchEnd = cursor;
  let workEnd = null;
  for (const branch of [printing, embroidery]) {
    if (!branch.length) continue;
    const before = timeline.length;
    const end = scheduleLinear(calendar, branch, cursor, job, mode, timeline, unknowns, cutEnd);
    for (const t of timeline.slice(before)) {
      if (t.kind === 'work' && (!workEnd || t.end > workEnd)) workEnd = t.end;
    }
    if (end > branchEnd) branchEnd = end;
  }
  cursor = branchEnd;

  if (phases.dropoff && !done.has(phases.dropoff.id)) {
    if (phases.dropoff.immediate) {
      // Handing the bundles to the sewing workshop costs no meaningful time: it
      // happens the day printing/embroidery finishes. Sewing itself starts the
      // next working day.
      const at = workEnd || cutEnd || cursor;
      timeline.push(entry(phases.dropoff, { start: at, end: at }, false));
      cursor = cal.addDays(at, 1);
    } else {
      cursor = scheduleLinear(
        calendar, [phases.dropoff], cursor, job, mode, timeline, unknowns, workEnd || cutEnd
      );
    }
  }

  return { timeline, unknowns, sewingReady: cursor };
}

// -------------------------------------------------- shared sewing queue

// The workshop is one shared resource. A job needing `quantity` of a product with
// capacity C consumes quantity/C workshop-days, so a day can sew 125 t-shirts OR
// 100 polos OR half of each. Jobs are served earliest-delivery-first.
function runSewingQueue(calendar, entries) {
  const queue = entries
    .filter((e) => e.needsSewing)
    .sort((a, b) => {
      const d = String(a.job.est_delivery || '9999').localeCompare(String(b.job.est_delivery || '9999'));
      return d !== 0 ? d : a.sewingReady.localeCompare(b.sewingReady);
    });

  if (!queue.length) return;

  const remaining = new Map();
  for (const item of queue) {
    const capacity = item.phases.sewing.capacity_per_day;
    if (!capacity) throw new Error('Dikim kapasitesi tanımsız: ' + item.job.product);
    remaining.set(item, item.job.quantity / capacity);
    item.sewingStart = null;
  }

  let day = queue.reduce((min, i) => (i.sewingReady < min ? i.sewingReady : min), queue[0].sewingReady);

  for (let guard = 0; guard < 2000 && remaining.size; guard++) {
    let available = cal.dayFactor(calendar, day, 'sewing');
    if (available > 0) {
      for (const item of queue) {
        if (available <= 1e-9) break;
        if (!remaining.has(item) || item.sewingReady > day) continue;
        const used = Math.min(available, remaining.get(item));
        if (!item.sewingStart) item.sewingStart = day;
        available -= used;
        const left = remaining.get(item) - used;
        if (left <= 1e-9) {
          item.sewingEnd = day;
          remaining.delete(item);
        } else {
          remaining.set(item, left);
        }
      }
    }
    day = cal.addDays(day, 1);
  }

  if (remaining.size) throw new Error('Dikim kuyruğu sonlanmadı.');
}

// ---------------------------------------------------------------- main

function schedule(rota, jobs, today, mode) {
  const calendar = rota.calendar;
  const entries = jobs.map((job) => {
    const ops = expandRoute(rota, job);
    const phases = splitPhases(ops);
    const done = new Set(job.completed_operations || []);
    const pre = schedulePreSewing(calendar, phases, job, mode, today);
    return {
      job,
      phases,
      needsSewing: !done.has('sewing'),
      sewingReady: cal.nextWorkingDay(calendar, pre.sewingReady, 'sewing'),
      timeline: pre.timeline,
      unknowns: pre.unknowns,
    };
  });

  runSewingQueue(calendar, entries);

  return entries.map((item) => {
    const { job, phases } = item;
    const timeline = item.timeline;
    const unknowns = item.unknowns.slice();

    if (item.needsSewing) {
      timeline.push({
        op_id: 'sewing',
        label: phases.sewing.label,
        kind: 'work',
        location: phases.sewing.location || null,
        start: item.sewingStart,
        end: item.sewingEnd,
        unknown_duration: false,
        capacity_per_day: phases.sewing.capacity_per_day,
      });
    }

    const done = new Set(job.completed_operations || []);
    const post = phases.post.filter((o) => !done.has(o.id));
    const afterSewing = item.sewingEnd ? cal.addDays(item.sewingEnd, 1) : today;
    scheduleLinear(calendar, post, afterSewing, job, mode, timeline, unknowns, item.sewingEnd || null);

    const finish = timeline.length ? timeline[timeline.length - 1].end : today;
    return {
      job_id: job.id,
      job_no: job.job_no || null,
      customer_name: job.customer_name,
      product: job.product,
      product_label: rota.products[job.product].label,
      quantity: job.quantity,
      est_delivery: job.est_delivery || null,
      timeline,
      finish,
      unknowns: [...new Set(unknowns)],
    };
  });
}

// Public entry point: run both passes and assemble the daily plan.
function buildPlan(rota, jobs, today) {
  const earliest = schedule(rota, jobs, today, 'min');
  const latest = schedule(rota, jobs, today, 'max');

  const jobsOut = earliest.map((e, i) => {
    const l = latest[i];
    const job = jobs[i];

    // The two passes are scenarios, not strict bounds: because the sewing workshop
    // is shared, a slower pass can free the queue earlier for a low-priority job.
    // Report the span of the two outcomes rather than assuming min <= max.
    const finishEarliest = e.finish <= l.finish ? e.finish : l.finish;
    const finishLatest = e.finish <= l.finish ? l.finish : e.finish;

    const lateEarliest = job.est_delivery ? cal.diffDays(job.est_delivery, finishEarliest) : null;
    const lateLatest = job.est_delivery ? cal.diffDays(job.est_delivery, finishLatest) : null;

    const questions = openQuestions(rota, job);
    return Object.assign({}, e, {
      finish_earliest: finishEarliest,
      finish_latest: finishLatest,
      days_late_earliest: lateEarliest,
      days_late_latest: lateLatest,
      at_risk: lateLatest != null && lateLatest > 0,
      open_questions: questions,
      part_questions: partQuestions(rota, job),
      blockers: accessoryBlockers(rota, job),
      // Unanswered options were treated as "no". The estimate is not trustworthy
      // until a human confirms them.
      provisional: questions.length > 0,
    });
  });

  const todayPlan = [];
  for (const j of jobsOut) {
    for (const op of j.timeline) {
      if (op.start <= today && today <= op.end) {
        todayPlan.push({
          job_id: j.job_id,
          job_no: j.job_no,
          customer_name: j.customer_name,
          product_label: j.product_label,
          quantity: j.quantity,
          op_id: op.op_id,
          label: op.label,
          kind: op.kind,
          location: op.location,
          parts: op.parts,
          confirmed_parts: op.confirmed_parts,
          est_delivery: j.est_delivery,
          at_risk: j.at_risk,
        });
      }
    }
  }

  return { today, jobs: jobsOut, today_plan: todayPlan };
}

// ---------------- panelAdapter.js ----------------
'use strict';

// Turns raw panel data (panel-data.json) into scheduler jobs.
//
// Where each field comes from:
//   product / quantity / delivery / decoration   <- data.jobs        (reliable)
//   where the job currently is in production     <- data.uretimTakip (needs matching)
//
// The panel does not link the two lists: a uretimTakip record carries no job_id
// and no product, and its customer_name field is really a free-text description.
// See linkProductionRecords below for how the two are paired, and why a doubtful
// pairing is reported as a question rather than guessed.


const ACTIVE_JOB_STATUSES = ['Onaylandı', 'Üretimde'];

// Which route operations are already behind a job sitting at a given panel stage.
// The stage names come from agent/lib/enums.js URETIM_STATUSES.
const STAGE_COMPLETED = {
  'Kumaş Bekleniyor': ['fabric_order'],
  'Kumaş Geldi': ['fabric_order', 'fabric_arrival'],
  'Kesimde': ['fabric_order', 'fabric_arrival'],
  'Baskı/Nakışta': ['fabric_order', 'fabric_arrival', 'cut_main', 'cut_extra_parts',
    'print_dropoff', 'embroidery_dropoff'],
  'Dikimde': ['fabric_order', 'fabric_arrival', 'cut_main', 'cut_extra_parts',
    'print_dropoff', 'print_work', 'embroidery_dropoff', 'embroidery_work', 'sewing_dropoff'],
  'Ütü-Pakette-Teslimat Bekliyor': ['fabric_order', 'fabric_arrival', 'cut_main', 'cut_extra_parts',
    'print_dropoff', 'print_work', 'embroidery_dropoff', 'embroidery_work', 'sewing_dropoff',
    'sewing', 'buttonhole_button'],
};

// Turkish-aware normalisation so "Tişört", "TİŞÖRT" and "tisort" all compare equal.
function normalize(s) {
  return String(s == null ? '' : s)
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Free-text product_type -> rota product key, via the alias table in rota.json.
function matchProduct(rota, productType) {
  const q = normalize(productType);
  if (!q) return null;
  let best = null;
  for (const [key, product] of Object.entries(rota.products)) {
    const candidates = [product.label, key, ...(product.aliases || [])];
    for (const c of candidates) {
      const n = normalize(c);
      if (!n) continue;
      if (q === n) return key;                       // exact wins outright
      if (q.includes(n) && (!best || n.length > best.len)) best = { key, len: n.length };
    }
  }
  return best ? best.key : null;
}

// Products Mercitex makes but does not plan here (caps, badges). Skipping them is a
// decision, not a data error - they must not show up as "unrecognised product".
function isExcludedProduct(rota, productType) {
  const q = normalize(productType);
  if (!q) return false;
  const list = (rota.excluded_products && rota.excluded_products.list) || [];
  return list.some((name) => {
    const n = normalize(name);
    return n && (q === n || q.includes(n));
  });
}

function customerNameOf(job, customers) {
  if (job.customer_id != null) {
    const c = (customers || []).find((x) => x.id === job.customer_id);
    if (c && c.name) return c.name;
  }
  return job.customer_name_free || '';
}

// Link production records to jobs.
//
// Real panel data showed uretimTakip.customer_name is NOT a customer name - it is a
// free-text job description that usually embeds the customer ("SAU TECH Tişört") and
// sometimes a project name instead ("İTÜ İlk 1000 Tişört"). Exact equality therefore
// never matches. We look for the customer name INSIDE the description, and demand an
// exact quantity match plus mutual uniqueness before adopting a stage - a wrong stage
// yields a confidently wrong plan, which is worse than admitting we do not know.
function linkProductionRecords(rota, activeJobs, openProduction, customers) {
  const pairs = [];
  const links = new Map();
  const claimed = new Set();

  // Explicit job_id wins over any guesswork. The panel's Üretim Takip form now
  // carries a "Bağlı İş" selector, so records created or edited after that change
  // state the link outright and no name matching is needed.
  for (const rec of openProduction) {
    if (rec.job_id == null) continue;
    const job = activeJobs.find((j) => String(j.id) === String(rec.job_id));
    if (job && !links.has(job)) {
      links.set(job, { record: rec, reason: null, source: 'job_id' });
      claimed.add(rec);
    }
  }

  for (const job of activeJobs) {
    if (links.has(job)) continue;
    const name = normalize(customerNameOf(job, customers));
    if (!name) continue;
    const productKey = matchProduct(rota, job.product_type);
    const aliases = productKey
      ? [rota.products[productKey].label, ...(rota.products[productKey].aliases || [])].map(normalize)
      : [];

    for (const rec of openProduction) {
      if (claimed.has(rec)) continue;
      const text = normalize(rec.customer_name);
      if (!text.includes(name)) continue;
      const jq = Number(job.quantity);
      const rq = Number(rec.quantity);
      const quantityMatches = Number.isFinite(jq) && Number.isFinite(rq) && jq > 0 && jq === rq;
      const productMentioned = aliases.some((a) => a && text.includes(a));
      pairs.push({ job, rec, quantityMatches, productMentioned });
    }
  }

  const solid = pairs.filter((p) => p.quantityMatches);

  for (const p of solid) {
    const otherJobs = solid.filter((x) => x.job === p.job);
    const otherRecs = solid.filter((x) => x.rec === p.rec);
    if (otherJobs.length === 1 && otherRecs.length === 1) {
      links.set(p.job, { record: p.rec, reason: null });
    }
  }

  for (const job of activeJobs) {
    if (links.has(job)) continue;
    const mine = pairs.filter((p) => p.job === job);
    let reason;
    if (!mine.length) {
      reason = 'adı geçen açık üretim kaydı yok';
    } else if (!mine.some((p) => p.quantityMatches)) {
      reason = 'aday üretim kaydı var ama adetler tutmuyor (' + job.quantity + ' adet)';
    } else {
      reason = 'birden fazla aday eşleşiyor - hangisi olduğu belirsiz';
    }
    links.set(job, { record: null, reason });
  }
  return links;
}

// panelData is the `data` object inside panel-data.json.
function buildJobsFromPanel(rota, panelData, opts) {
  const options = opts || {};
  const confirmations = options.confirmations || {};
  const data = panelData || {};
  const customers = data.customers || [];

  const activeJobs = (data.jobs || []).filter((j) => ACTIVE_JOB_STATUSES.includes(j.status));
  const openProduction = (data.uretimTakip || []).filter((u) => u.status !== 'Teslim Edildi');

  const links = linkProductionRecords(rota, activeJobs, openProduction, customers);

  const jobs = [];
  const needsAttention = [];

  for (const job of activeJobs) {
    const name = customerNameOf(job, customers);
    const productKey = matchProduct(rota, job.product_type);

    if (!productKey && isExcludedProduct(rota, job.product_type)) {
      continue; // planlama dışı - hata değil
    }

    if (!productKey) {
      needsAttention.push({
        job_id: job.id,
        job_no: job.job_no || null,
        customer_name: name,
        kind: 'product_unknown',
        message: 'Ürün tipi "' + (job.product_type || '(boş)') + '" rotadaki ürünlerle eşleşmedi - hangi ürün?',
      });
      continue;
    }

    const match = links.get(job) || { record: null, reason: 'eşleştirme yapılmadı' };
    const stage = match.record ? match.record.status : null;
    const completed = stage ? (STAGE_COMPLETED[stage] || []) : [];

    if (!match.record && job.status === 'Üretimde') {
      needsAttention.push({
        job_id: job.id,
        job_no: job.job_no || null,
        customer_name: name,
        kind: 'stage_unknown',
        message: 'İş üretimde ama hangi aşamada olduğu belirlenemedi (' + match.reason +
          ') - plan baştan kuruldu, aşamayı bildirin.',
      });
    }

    jobs.push({
      id: job.id,
      job_no: job.job_no || null,
      customer_name: name || '(müşteri adı yok)',
      product: productKey,
      quantity: Number(job.quantity) || 0,
      est_delivery: (match.record && match.record.est_delivery) || job.delivery_date || null,
      options: optionsFromPanelJob(job, confirmations[job.id] || {}),
      completed_operations: completed,
      panel_stage: stage,
      stage_source: stage ? (match.source === 'job_id' ? 'panel bağlantısı' : 'ad eşleşmesi') : 'bilinmiyor',
      production_record_id: match.record ? match.record.id : null,
      problem_note: (match.record && match.record.problem_note) || null,
    });
  }

  return { jobs, needs_attention: needsAttention };
}


return {
  calendar: cal,
  buildPlan: buildPlan,
  diffDays: diffDays,
  dayName: dayName,
  schedule: schedule,
  expandRoute: expandRoute,
  openQuestions: openQuestions,
  partQuestions: partQuestions,
  accessoryBlockers: accessoryBlockers,
  decorationFromPanel: decorationFromPanel,
  optionsFromPanelJob: optionsFromPanelJob,
  buildJobsFromPanel: buildJobsFromPanel,
  matchProduct: matchProduct,
  normalize: normalize,
  customerNameOf: customerNameOf,
  isExcludedProduct: isExcludedProduct,
};
})();
