'use strict';
// Isolated intraday UI. Does not mutate DATA or call the panel save endpoint.
let operationsState = null, operationsLoading = false, operationsMounted = false;
let operationsPending = null;
let operationsPlanning = false, operationsWriting = false, operationsPlanError = '', operationsLocalPlanStale = false;
function operationsCloudBusy() {
  return (typeof CLOUD_DIRTY !== 'undefined' && CLOUD_DIRTY) ||
    (typeof CLOUD_INFLIGHT !== 'undefined' && CLOUD_INFLIGHT) ||
    (typeof CLOUD_CONFLICT !== 'undefined' && CLOUD_CONFLICT);
}
function operationsBasisChanged(row, found) {
  const basis = found?.basis && { ...found.basis, ...found.planning_basis };
  if (!basis) return false;
  const current = { status: row.u.status, quantity: row.u.quantity, customer: row.u.customer_name,
    decoration: row.deco, est_delivery: row.u.est_delivery || null,
    note: row.u.note || '', problem_note: row.u.problem_note || '',
    assigned_to: row.u.assigned_to || '', follow_up_date: row.u.follow_up_date || null };
  return Object.keys(current).some(key => Object.prototype.hasOwnProperty.call(basis, key) && basis[key] !== current[key]);
}
function operationsApply(rows) {
  const records = operationsState?.records || [];
  const plan = operationsState?.plan;
  const changed = new Set(rows.filter(row => operationsBasisChanged(row,
    records.find(r => String(r.record_id) === String(row.u.id)))).map(row => String(row.u.id)));
  const activeRecords = records.filter(record => record.basis?.status !== 'Teslim Edildi');
  operationsLocalPlanStale = !!plan && (operationsCloudBusy() || changed.size > 0 ||
    (operationsState.state_hash && plan.state_hash !== operationsState.state_hash) ||
    activeRecords.length !== rows.length || rows.some(row => !activeRecords.some(r => String(r.record_id) === String(row.u.id))));
  const pendingIds = new Set(rows.filter(row => {
    const found = records.find(r => String(r.record_id) === String(row.u.id));
    return row.u.status !== 'Teslim Edildi' && found?.revision?.status !== 'Teslim Edildi' && found?.revision?.section !== 'Tamamlanan';
  }).map(row => String(row.u.id)));
  if (plan && ['ready', 'fallback', 'empty'].includes(plan.status)) {
    const expectedSource = plan.status === 'ready' ? 'jev' : 'rules';
    const list = plan.decisions;
    const ids = new Set(Array.isArray(list) ? list.map(d => String(d.record_id)) : []);
    const priorities = new Set(Array.isArray(list) ? list.map(d => d.priority) : []);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
    const valid = plan.date === day && plan.source === expectedSource && plan.state_hash === operationsState.state_hash &&
      plan.record_count === pendingIds.size && plan.considered_count === records.length &&
      (plan.status === 'empty') === (pendingIds.size === 0) && Array.isArray(list) &&
      list.length === pendingIds.size && ids.size === list.length && [...pendingIds].every(id => ids.has(id)) &&
      priorities.size === list.length && list.every(d => typeof d.action === 'string' && !!d.action.trim() &&
        typeof d.task_key === 'string' && !!d.task_key.trim() && ['do', 'defer', 'confirm'].includes(d.disposition) &&
        Number.isInteger(d.priority) && d.priority >= 1 && d.priority <= list.length && d.source === expectedSource &&
        (d.confidence === null || typeof d.confidence === 'number' && Number.isFinite(d.confidence) && d.confidence >= 0 && d.confidence <= 1));
    if (!valid) operationsLocalPlanStale = true;
  }
  const stale = plan?.status === 'stale' || operationsLocalPlanStale;
  const usable = plan && !stale && ['ready', 'fallback'].includes(plan.status) && Array.isArray(plan.decisions);
  for (const row of rows) {
    const found = records.find(r => String(r.record_id) === String(row.u.id));
    const reminders = (found?.reminders || []).map(r => r.message).join(' ');
    if (reminders) row.u = { ...row.u, note: [row.u.note, 'Üretim hafızası: ' + reminders].filter(Boolean).join(' · ') };
    if (found?.revision) row.feedback = true;
    if (changed.has(String(row.u.id))) {
      row.section = 'Gün içi revizyon';
      row.action = 'İş kaydı değişti; panel kaydıyla son bildirimi teyit et.';
      row.planStale = true;
      continue;
    }
    if (found?.revision) {
      row.action = found.revision.action + (found.revision.note ? ' · ' + found.revision.note : '');
      row.section = found.revision.section;
      row.u = { ...row.u, status: found.revision.status };
    }
    if (row.u.status === 'Teslim Edildi' || row.section === 'Tamamlanan') continue;
    if (stale) {
      row.action = 'Planın dayanağı değişti; güncel yapılanları, kalanları ve engelleri teyit edip Jev ile planı yeniden değerlendir.';
      row.planStale = true;
      continue;
    }
    const decisions = usable ? plan.decisions.filter(d => String(d.record_id) === String(row.u.id) &&
      (!row.task_key || d.task_key === row.task_key) && typeof d.action === 'string' && d.action.trim()) : [];
    if (!decisions.length) continue;
    decisions.sort((a, b) => a.priority - b.priority);
    row.action = [...new Set(decisions.map(d => d.action))].join(' · ');
    row.priority = Math.min(...decisions.map(d => Number.isInteger(d.priority) ? d.priority : 999));
    row.disposition = decisions.some(d => d.disposition === 'confirm') ? 'confirm' : decisions[0].disposition;
    row.planApplied = true;
    row.source = plan.status === 'ready' && plan.source === 'jev' && decisions.every(d => d.source === 'jev') ? 'jev' : 'rules';
  }
}
function operationsPlanStatus() {
  const el = document.getElementById('opJevStatus');
  const button = document.getElementById('opJevPlan');
  if (button) button.disabled = operationsPlanning || operationsWriting || operationsLoading || !operationsState?.jev?.configured || operationsCloudBusy();
  if (!el) return;
  const plan = operationsState?.plan;
  let message = 'Plan durumu yükleniyor…', error = false;
  if (operationsPlanning) message = 'Jev tüm aşamaları değerlendiriyor…';
  else if (operationsPlanError) { message = operationsPlanError; error = true; }
  else if (operationsCloudBusy()) message = 'Panel değişikliklerinin kaydı tamamlanınca Jev ile planı değerlendir.';
  else if (plan?.status === 'stale' || operationsLocalPlanStale) {
    message = 'Plan güncel değil. Son durumu teyit edip Jev ile yeniden değerlendir.'; error = true;
  } else if (plan?.status === 'empty') message = 'Planlanacak açık iş yok.';
  else if (plan?.status === 'ready' && plan.source === 'jev') {
    message = 'Jev son planı hazır. ' + (plan.considered_count ?? plan.record_count ?? 0) + ' iş değerlendirildi; aşağıdaki eylemler bu kararı kullanıyor.';
  } else if (plan?.status === 'fallback') {
    message = 'Jev değerlendirmesi alınamadı; mevcut ilerleme ve kurallara göre plan gösteriliyor. Yeniden deneyebilirsin.'; error = true;
  } else if (operationsState && !operationsState.jev?.configured) {
    message = 'Jev henüz sunucuda yapılandırılmamış; mevcut ilerleme ve kurallara göre plan gösteriliyor.';
  } else if (operationsState) message = 'Jev değerlendirmesi henüz yok. Düğmeyle tüm işleri birlikte değerlendir; Yenile yalnız kayıtlı planı getirir.';
  el.textContent = message;
  el.classList.toggle('op-feedback-error', error);
}
async function operationsEvaluatePlan() {
  if (operationsPlanning || operationsWriting || operationsLoading || !operationsState) return;
  if (operationsCloudBusy()) { operationsPlanError = 'Panel değişikliklerinin kaydı tamamlandıktan sonra planı değerlendir.'; operationsPlanStatus(); return; }
  if (!operationsState.jev?.configured) { operationsPlanStatus(); return; }
  operationsPlanning = true; operationsPlanError = ''; operationsPlanStatus();
  try {
    const snapshot = await (await matApi('/api/agent/operations/plan', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    if (snapshot.version !== 1 || !Array.isArray(snapshot.records)) throw new Error('Plan yanıtı desteklenmiyor');
    operationsState = snapshot;
    operationsHistory();
    operationsMemory();
    renderOperasyonPlan();
  } catch (e) { operationsPlanError = 'Jev planı alınamadı: ' + e.message + '. Tekrar dene.'; }
  finally { operationsPlanning = false; operationsPlanStatus(); }
}
function operationsMessage(message, error = false) {
  const el = document.getElementById('opFeedbackStatus');
  if (el) { el.textContent = message; el.classList.toggle('op-feedback-error', error); }
}
function operationsMount() {
  const el = document.getElementById('opFeedback');
  if (!el || operationsMounted) return;
  operationsMounted = true;
  el.innerHTML = '<section class="op-feedback"><h3>Yapılanları ve kalanları bildir</h3>' +
    '<p class="op-feedback-muted">İşi seçip bugünkü gelişmeyi yaz. Tamamlanan işlemler ve kalanlar günlük plana işlenir.</p>' +
    '<form id="opFeedbackForm"><label for="opFeedbackJob">İş / ürün</label><select id="opFeedbackJob" required><option value="">İş seç</option></select>' +
    '<label for="opFeedbackText">Ne yapıldı, ne kaldı?</label><textarea id="opFeedbackText" maxlength="2000" required placeholder="Baskıya götürüldü. Beş tanesinin baskı kâğıdı eksik olduğu için onlar basılmadı, diğerleri tamamlandı."></textarea>' +
    '<div class="op-feedback-actions"><button type="submit" class="op-btn op-btn-main" id="opFeedbackSave">Kaydet ve planı güncelle</button>' +
    '<span id="opFeedbackStatus" class="op-feedback-status" role="status" aria-live="polite">Günlük yükleniyor…</span></div></form>' +
    '<div class="op-jev-plan"><h4>Jev ile son plan</h4><p class="op-feedback-muted">Tüm işler, üretim aşamaları, yapılanlar, kalanlar, engeller ve kabul ettiğin kurallar birlikte değerlendirilir.</p>' +
    '<div class="op-feedback-actions"><button type="button" class="op-btn" id="opJevPlan" disabled>Jev ile planı değerlendir</button>' +
    '<span id="opJevStatus" class="op-feedback-status" role="status" aria-live="polite">Plan durumu yükleniyor…</span></div></div>' +
    '<details><summary>Bildirim geçmişi</summary><div id="opFeedbackHistory"></div></details><div id="opFeedbackMemory"></div></section>';
  document.getElementById('opFeedbackForm').addEventListener('submit', operationsSubmit);
  document.getElementById('opFeedbackJob').addEventListener('change', operationsHistory);
  document.getElementById('opJevPlan').addEventListener('click', operationsEvaluatePlan);
  operationsRefresh();
}
async function operationsRefresh() {
  if (operationsLoading || operationsPlanning || operationsWriting) return;
  operationsLoading = true;
  try {
    const snapshot = await (await matApi('/api/agent/operations')).json();
    if (snapshot.version !== 1 || !Array.isArray(snapshot.records)) throw new Error('Üretim günlüğü biçimi desteklenmiyor');
    operationsState = snapshot;
    operationsPlanError = '';
    const select = document.getElementById('opFeedbackJob');
    if (!select) return;
    const selected = select.value;
    select.innerHTML = '<option value="">İş seç</option>' + (DATA.uretimTakip || []).filter(r => r.status !== 'Teslim Edildi').map(r =>
      '<option value="' + esc(r.id) + '">' + esc('#' + r.id + ' ' + r.customer_name + (r.quantity ? ' — ' + r.quantity + ' adet' : '')) + '</option>').join('');
    select.value = selected;
    document.getElementById('opFeedbackSave').disabled = !operationsState.configured;
    operationsMessage(operationsState.configured ? 'Hazır. Yalnız kaydettiğinde bildirim yorumlanır.' : 'Bildirim yorumlama henüz sunucuda yapılandırılmamış.', !operationsState.configured);
    operationsHistory();
    if (typeof operationsMemory === 'function') operationsMemory();
    renderOperasyonPlan();
  } catch (e) {
    operationsState = null;
    operationsPlanError = 'Plan yüklenemedi: ' + e.message + '. Yenile düğmesiyle tekrar dene.';
    operationsMessage('Günlük yüklenemedi: ' + e.message + '. Yenile düğmesiyle tekrar dene.', true);
    const button = document.getElementById('opFeedbackSave'); if (button) button.disabled = true;
    renderOperasyonPlan();
  } finally { operationsLoading = false; operationsPlanStatus(); }
}
async function operationsSubmit(event) {
  event.preventDefault();
  if (!operationsState) return;
  if (operationsCloudBusy() || operationsPlanning || operationsWriting) {
    operationsMessage('Panel değişikliklerinin kaydı tamamlandıktan sonra planı yenile.', true); return;
  }
  const recordId = document.getElementById('opFeedbackJob').value;
  const text = document.getElementById('opFeedbackText').value.trim();
  const record = operationsState.records.find(r => String(r.record_id) === recordId);
  if (!record || !text) { operationsMessage('İşi seçip bildirimi yaz.', true); return; }
  const button = document.getElementById('opFeedbackSave'); button.disabled = true;
  operationsWriting = true; operationsPlanStatus();
  operationsMessage('Bildirim işleniyor…');
  const signature = recordId + '\n' + text;
  if (!operationsPending || operationsPending.signature !== signature) operationsPending = { signature, id: crypto.randomUUID() };
  try {
    const result = await (await matApi('/api/agent/operations/report', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ record_id: recordId, text,
        request_id: operationsPending.id, revision: operationsState.revision, fingerprint: record.fingerprint }) })).json();
    if (!result.saved) { operationsMessage(result.clarification, true); operationsPending = null; return; }
    operationsState = result.snapshot;
    operationsPlanError = '';
    document.getElementById('opFeedbackText').value = '';
    operationsPending = null;
    operationsMessage('Kaydedildi; plan güncellendi.\n' + (result.summary || 'Bu bildirim daha önce kaydedilmiş.'));
    operationsHistory();
    if (typeof operationsMemory === 'function') operationsMemory();
    renderOperasyonPlan();
  } catch (e) { operationsMessage('Kaydedilemedi: ' + e.message, true); }
  finally { button.disabled = false; operationsWriting = false; operationsPlanStatus(); }
}
function operationsHistory() {
  const box = document.getElementById('opFeedbackHistory');
  if (!box || !operationsState) return;
  const id = document.getElementById('opFeedbackJob').value;
  const record = operationsState.records.find(r => String(r.record_id) === id);
  box.innerHTML = record?.history.length ? record.history.map(e => '<article><strong>' + esc(e.date) + '</strong><p>' +
    esc(e.text) + '</p><button type="button" class="op-btn" data-undo="' + esc(e.id) + '">Bildirimi geri al</button></article>').join('')
    : '<p class="op-feedback-muted">Geçmişi görmek için bir iş seç. Henüz bildirimi olmayan işler burada boş görünür.</p>';
  box.querySelectorAll('[data-undo]').forEach(b => b.addEventListener('click', async () => {
    if (operationsCloudBusy() || operationsPlanning || operationsWriting) { operationsMessage('Panel kaydı ve plan değerlendirmesi tamamlandıktan sonra tekrar dene.', true); return; }
    b.disabled = true;
    operationsWriting = true; operationsPlanStatus();
    try {
      operationsState = await (await matApi('/api/agent/operations/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: b.dataset.undo, revision: operationsState.revision }) })).json();
      operationsPlanError = '';
      operationsMessage('Bildirim geri alındı; plan yeniden hesaplandı.'); operationsHistory();
      if (typeof operationsMemory === 'function') operationsMemory();
      renderOperasyonPlan();
    } catch (e) { operationsMessage(e.message, true); b.disabled = false; }
    finally { operationsWriting = false; operationsPlanStatus(); }
  }));
}

function operationsMemory() {
  const box = document.getElementById('opFeedbackMemory');
  if (!box || !operationsState) return;
  const labels = { observing: 'Gözlem birikiyor', suggested: 'Kural önerisi', accepted: 'Planda kullanılıyor', dismissed: 'Kullanılmıyor' };
  box.innerHTML = '<details><summary>Üretim hafızası</summary><p class="op-feedback-muted">Aynı sorun en az üç farklı işte görülünce hazırlık kuralı önerilir. Kabul ettiğin kurallar ilgili işlerde hatırlatılır.</p>' +
    (operationsState.knowledge || []).map(k => '<article><strong>' + esc(k.label) + '</strong><p>' + esc(labels[k.status]) + ' · ' + k.samples + ' farklı iş</p><p>' + esc(k.reminder) + '</p>' +
      '<details><summary>Dayanak bildirimler</summary>' + k.evidence.map(e => '<p>#' + esc(e.record_id) + ' · ' + esc(e.date) + ': ' + esc(e.evidence) + '</p>').join('') + '</details>' +
      (k.samples >= 3 ? '<div class="op-feedback-actions"><button type="button" class="op-btn" data-issue="' + esc(k.issue) + '" data-rule="' + (k.status === 'accepted' ? 'dismissed' : 'accepted') + '">' +
        (k.status === 'accepted' ? 'Kuralı durdur' : 'Kuralı kullan') + '</button></div>' : '') + '</article>').join('') +
    (!(operationsState.knowledge || []).length ? '<p>Henüz tekrar eden bir sorun kaydı yok.</p>' : '') + '</details>';
  box.querySelectorAll('[data-rule]').forEach(b => b.addEventListener('click', async () => {
    if (operationsCloudBusy() || operationsPlanning || operationsWriting) { operationsMessage('Panel kaydı ve plan değerlendirmesi tamamlandıktan sonra tekrar dene.', true); return; }
    b.disabled = true;
    operationsWriting = true; operationsPlanStatus();
    try {
      operationsState = await (await matApi('/api/agent/operations/rule', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue: b.dataset.issue, status: b.dataset.rule, revision: operationsState.revision }) })).json();
      operationsPlanError = '';
      operationsMemory(); renderOperasyonPlan(); operationsMessage('Üretim hafızası güncellendi.');
    } catch (e) { operationsMessage(e.message, true); b.disabled = false; }
    finally { operationsWriting = false; operationsPlanStatus(); }
  }));
}
