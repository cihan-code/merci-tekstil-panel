'use strict';
// Isolated intraday UI. Does not mutate DATA or call the panel save endpoint.
let operationsState = null, operationsLoading = false, operationsMounted = false;
let operationsPending = null;
function operationsApply(rows) {
  for (const row of rows) {
    const found = operationsState?.records.find(r => String(r.record_id) === String(row.u.id));
    const reminders = (found?.reminders || []).map(r => r.message).join(' ');
    if (reminders) row.u = { ...row.u, note: [row.u.note, 'Üretim hafızası: ' + reminders].filter(Boolean).join(' · ') };
    if (!found?.revision) continue;
    row.feedback = true;
    const basis = found.basis;
    if (basis && (basis.status !== row.u.status || basis.quantity !== row.u.quantity ||
        basis.customer !== row.u.customer_name || basis.decoration !== row.deco ||
        basis.est_delivery !== (row.u.est_delivery || null))) {
      row.section = 'Gün içi revizyon';
      row.action = 'İş kaydı değişti; panel kaydıyla son bildirimi teyit et.';
      continue;
    }
    row.action = found.revision.action + (found.revision.note ? ' · ' + found.revision.note : '');
    row.section = found.revision.section;
    row.u = { ...row.u, status: found.revision.status };
  }
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
    '<details><summary>Bildirim geçmişi</summary><div id="opFeedbackHistory"></div></details><div id="opFeedbackMemory"></div></section>';
  document.getElementById('opFeedbackForm').addEventListener('submit', operationsSubmit);
  document.getElementById('opFeedbackJob').addEventListener('change', operationsHistory);
  operationsRefresh();
}
async function operationsRefresh() {
  if (operationsLoading) return;
  operationsLoading = true;
  try {
    const snapshot = await (await matApi('/api/agent/operations')).json();
    if (snapshot.version !== 1 || !Array.isArray(snapshot.records)) throw new Error('Üretim günlüğü biçimi desteklenmiyor');
    operationsState = snapshot;
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
    operationsMessage('Günlük yüklenemedi: ' + e.message + '. Yenile düğmesiyle tekrar dene.', true);
    const button = document.getElementById('opFeedbackSave'); if (button) button.disabled = true;
    renderOperasyonPlan();
  } finally { operationsLoading = false; }
}
async function operationsSubmit(event) {
  event.preventDefault();
  if (!operationsState) return;
  if (typeof CLOUD_DIRTY !== 'undefined' && (CLOUD_DIRTY || CLOUD_INFLIGHT || CLOUD_CONFLICT)) {
    operationsMessage('Panel değişikliklerinin kaydı tamamlandıktan sonra planı yenile.', true); return;
  }
  const recordId = document.getElementById('opFeedbackJob').value;
  const text = document.getElementById('opFeedbackText').value.trim();
  const record = operationsState.records.find(r => String(r.record_id) === recordId);
  if (!record || !text) { operationsMessage('İşi seçip bildirimi yaz.', true); return; }
  const button = document.getElementById('opFeedbackSave'); button.disabled = true;
  operationsMessage('Bildirim işleniyor…');
  const signature = recordId + '\n' + text;
  if (!operationsPending || operationsPending.signature !== signature) operationsPending = { signature, id: crypto.randomUUID() };
  try {
    const result = await (await matApi('/api/agent/operations/report', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ record_id: recordId, text,
        request_id: operationsPending.id, revision: operationsState.revision, fingerprint: record.fingerprint }) })).json();
    if (!result.saved) { operationsMessage(result.clarification, true); operationsPending = null; return; }
    operationsState = result.snapshot;
    document.getElementById('opFeedbackText').value = '';
    operationsPending = null;
    operationsMessage('Kaydedildi; plan güncellendi.\n' + (result.summary || 'Bu bildirim daha önce kaydedilmiş.'));
    operationsHistory();
    if (typeof operationsMemory === 'function') operationsMemory();
    renderOperasyonPlan();
  } catch (e) { operationsMessage('Kaydedilemedi: ' + e.message, true); }
  finally { button.disabled = false; }
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
    b.disabled = true;
    try {
      operationsState = await (await matApi('/api/agent/operations/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: b.dataset.undo, revision: operationsState.revision }) })).json();
      operationsMessage('Bildirim geri alındı; plan yeniden hesaplandı.'); operationsHistory();
      if (typeof operationsMemory === 'function') operationsMemory();
      renderOperasyonPlan();
    } catch (e) { operationsMessage(e.message, true); b.disabled = false; }
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
    b.disabled = true;
    try {
      operationsState = await (await matApi('/api/agent/operations/rule', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue: b.dataset.issue, status: b.dataset.rule, revision: operationsState.revision }) })).json();
      operationsMemory(); renderOperasyonPlan(); operationsMessage('Üretim hafızası güncellendi.');
    } catch (e) { operationsMessage(e.message, true); b.disabled = false; }
  }));
}
