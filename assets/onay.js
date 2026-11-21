/* G64: customer approval page. No login: the token in ?t= is the only credential. Every server string goes in as text. */
(function (global) {
  'use strict';
  const DEFAULT_API = 'https://erci-materials-api.onrender.com';
  const POSITIONS = {gogus:'Göğüs',sirt:'Sırt',kol:'Kol',ense:'Ense',kapusan:'Kapüşon',kapuson:'Kapüşon',sol_gogus:'Sol göğüs',sag_gogus:'Sağ göğüs',sol_kol:'Sol kol',sag_kol:'Sağ kol',bacak:'Bacak',sol_bacak:'Sol bacak',sag_bacak:'Sağ bacak'};
  const KINDS = {baski:'Baskı',nakis:'Nakış'};

  function apiBase(search) {
    let endpoint = new URLSearchParams(search || '').get('api') || DEFAULT_API;
    try { const url = new URL(endpoint); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error(); endpoint = url.origin + url.pathname.replace(/\/$/, ''); } catch { endpoint = ''; }
    return endpoint;
  }
  const tokenOf = search => { const t = new URLSearchParams(search || '').get('t') || ''; return /^[A-Za-z0-9_-]{43}$/.test(t) ? t : ''; };
  const cm = mm => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(Number(mm) / 10);
  const date = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(d); };
  function measureLabel(a) {
    if (a.olcu === 'bekliyor' || a.enMm == null) return { main: 'Ölçü kesinleşiyor', sub: '' };
    const main = (a.olcu === 'yaklasik' ? '≈ ' : '') + cm(a.enMm) + ' × ' + cm(a.boyMm) + ' cm';
    return { main, sub: { yaklasik: 'Yaklaşık ölçü (≈)', standart: 'Standart ölçü', otomatik: 'Otomatik ölçü' }[a.olcu] || '' };
  }

  function start(doc, opts) {
    const root = doc.getElementById('onay-root');
    const endpoint = apiBase(opts.search), token = tokenOf(opts.search);
    const fetchFn = opts.fetch;
    const el = (tag, attrs, ...children) => {
      const n = doc.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (k === 'class') n.className = v;
        else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v != null) n.setAttribute(k, v);
      }
      for (const c of children.flat(Infinity)) if (c != null) n.append(typeof c === 'object' ? c : doc.createTextNode(String(c)));
      return n;
    };
    const head = el('header', { class: 'onay-head' }, el('span', { class: 'onay-logo', 'aria-hidden': 'true' }, 'M'), el('div', {}, el('div', { class: 'onay-brand' }, 'MerciTex'), el('div', { class: 'onay-sub' }, 'Sipariş onayı')));
    const show = (...nodes) => { root.replaceChildren(head, ...nodes.flat(Infinity).filter(Boolean)); };
    const expired = () => show(el('section', { class: 'onay-card onay-result bad' }, el('h1', {}, 'Bu linkin süresi doldu'), el('p', {}, 'Bağlantı geçerli değil ya da yenilenmiş. Lütfen bizden yeni bir bağlantı isteyin.')));
    const approved = s => show(el('section', { class: 'onay-card onay-result ok' }, el('h1', {}, 'Onayınız alındı'), el('p', {}, 'Teşekkür ederiz. Siparişiniz üretim sürecine alınacaktır.'), s?.onaylayan ? el('p', { class: 'onay-hint' }, s.onaylayan + (s.onayTarihi ? ' · ' + date(s.onayTarihi) : '')) : null));

    async function call(path, body) {
      const init = { method: body === undefined ? 'GET' : 'POST', credentials: 'omit', headers: {} };
      if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
      let res;
      try { res = await fetchFn(endpoint + '/api/siparis/musteri/' + token + path, init); } catch { const e = new Error('Sunucuya bağlanılamadı. Bağlantınızı kontrol edip tekrar deneyin.'); e.offline = true; throw e; }
      let data = {};
      try { data = await res.json(); } catch { /* empty body */ }
      if (!res.ok) { const e = new Error(data.error || 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'); e.status = res.status; throw e; }
      return data;
    }

    function productCard(u) {
      const sizes = Object.entries(u.bedenler || {}).filter(([, n]) => n > 0);
      return el('section', { class: 'onay-card onay-product' },
        el('h2', {}, u.ad), el('div', { class: 'onay-chips' }, [u.renk, u.kumas, u.numune ? 'Numune' : null, (u.adet != null ? u.adet + ' adet' : null)].filter(Boolean).map(t => el('span', { class: 'onay-chip' }, t))),
        u.gorseller?.length ? el('div', { class: 'onay-images' }, u.gorseller.map(g => el('img', { src: endpoint + g.url, alt: u.ad + (g.gorunum ? ' · ' + ({ on: 'ön', arka: 'arka', kol: 'kol' }[g.gorunum] || g.gorunum) : ''), loading: 'lazy' }))) : null,
        sizes.length ? el('ul', { class: 'onay-sizes', 'aria-label': 'Beden dağılımı' }, sizes.map(([k, n]) => el('li', {}, k, el('b', {}, n)))) : null,
        u.uygulamalar?.length ? el('ul', { class: 'onay-apps', 'aria-label': 'Uygulamalar' }, u.uygulamalar.map(a => { const m = measureLabel(a);
          return el('li', {}, el('strong', {}, (POSITIONS[a.konum] || a.konum) + ' · ' + (KINDS[a.tur] || a.tur)), ' — ', m.main, m.sub ? el('small', {}, m.sub) : null); })) : null);
    }

    function render(s) {
      if (s.durum === 'onaylandi') return approved(s);
      const name = el('input', { type: 'text', id: 'ad-soyad', autocomplete: 'name', maxlength: '120', required: 'required' });
      const err = el('div', { class: 'onay-error', role: 'alert', hidden: 'hidden' });
      const fail = e => { err.textContent = e.message; err.hidden = false; };
      const needName = () => { const v = name.value.replace(/\s+/g, ' ').trim(); if (v.length < 2) { fail(new Error('Lütfen adınızı ve soyadınızı yazın.')); name.focus?.(); return null; } err.hidden = true; return v; };
      const note = el('textarea', { id: 'degisiklik-notu', maxlength: '2000', rows: '5', placeholder: 'Örn. göğüs baskısı biraz küçülsün, renk bir ton açık olsun…' });
      const noteBox = el('div', { hidden: 'hidden' }, el('label', { for: 'degisiklik-notu' }, 'Değişiklik veya revize isteğiniz'), note, el('p', { class: 'onay-hint' }, 'En çok 2000 karakter.'));
      const send = el('button', { type: 'button', hidden: 'hidden' }, 'Gönder');
      const approve = el('button', { type: 'button' }, 'Onaylıyorum');
      const change = el('button', { type: 'button', class: 'secondary', 'aria-expanded': 'false' }, 'Değişiklik istiyorum');
      let busy = false;
      const guard = async (btn, fn) => { if (busy) return; busy = true; btn.disabled = true; try { await fn(); } catch (e) { if (e.status === 404) expired(); else fail(e); } finally { busy = false; btn.disabled = false; } };
      approve.addEventListener('click', () => { const n = needName(); if (n) guard(approve, async () => { await call('/onayla', { adSoyad: n, kabul: true }); approved({ onaylayan: n }); }); });
      change.addEventListener('click', () => { noteBox.hidden = !noteBox.hidden; send.hidden = noteBox.hidden; change.setAttribute('aria-expanded', String(!noteBox.hidden)); if (!noteBox.hidden) note.focus?.(); });
      send.addEventListener('click', () => {
        const n = needName(); if (!n) return;
        const text = note.value.trim();
        if (!text) { fail(new Error('Lütfen değişiklik notunuzu yazın.')); return; }
        guard(send, async () => {
          await call('/degisiklik', { adSoyad: n, not: text });
          const again = el('button', { type: 'button', class: 'secondary' }, 'Bir not daha ekle');
          again.addEventListener('click', () => load());
          show(el('section', { class: 'onay-card onay-result ok' }, el('h1', {}, 'Notunuz iletildi'), el('p', {}, 'Değişiklik isteğinizi inceleyip size dönüş yapacağız. Siparişiniz henüz onaylanmadı.'), again));
        });
      });
      show(
        el('h1', {}, s.siparis.ad || 'Siparişiniz'), el('p', { class: 'onay-meta' }, 'Sipariş no: ' + s.siparis.no + ' · Sürüm ' + s.siparis.surum),
        s.durum === 'degisiklik_istendi' ? el('div', { class: 'onay-card' }, el('h2', {}, 'Önceki notlarınız'), (s.notlar || []).map(n => el('div', { class: 'onay-note' }, n.metin, el('small', {}, date(n.tarih))))) : null,
        (s.urunler || []).map(productCard),
        el('section', { class: 'onay-card' }, el('h2', {}, 'Onay formu'),
          s.onayFormu ? el('a', { class: 'onay-btn secondary', href: endpoint + s.onayFormu, target: '_blank', rel: 'noopener noreferrer' }, 'Onay formunu aç (PDF)') : el('p', { class: 'onay-hint' }, 'Onay formu hazırlanıyor.'),
          el('details', {}, el('summary', {}, 'Şartlar ve koşullar'), el('div', { class: 'onay-terms' }, s.sartlar || ''))),
        el('section', { class: 'onay-card' }, el('h2', {}, 'Cevabınız'),
          el('label', { for: 'ad-soyad' }, 'Adınız ve soyadınız'), name,
          el('p', { class: 'onay-hint' }, "“Onaylıyorum” düğmesine basarak sipariş formunu ve şartları kabul etmiş olursunuz."), err,
          noteBox,
          el('div', { class: 'onay-actions' }, approve, change, send)));
    }

    async function load() {
      if (!endpoint || !token) return expired();
      try { render(await call('')); }
      catch (e) { if (e.status === 404) expired(); else show(el('section', { class: 'onay-card onay-result bad' }, el('h1', {}, 'Sayfa açılamadı'), el('p', {}, e.message))); }
    }
    return load();
  }

  const api = { start, apiBase, tokenOf, measureLabel, cm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global.document && global.location && !global.__ONAY_TEST__) start(global.document, { search: global.location.search, fetch: (...a) => global.fetch(...a) });
})(typeof window !== 'undefined' ? window : globalThis);
