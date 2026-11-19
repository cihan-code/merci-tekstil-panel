/* Personal session shared by the panel pages. No fixed API key: the repository is public. */
(function (global) {
  'use strict';
  // Must equal storageKey in assets/uretim.js (a test checks it): one login serves every page in the tab.
  const KEY = 'merci.production.session';
  let pending = null;

  function store() { try { return global.sessionStorage || null; } catch (e) { return null; } }
  // A malformed or expired record is removed, as uretim.js does. A session taken for another API
  // address is never sent here, but it is left in place for the page that owns it.
  function read(endpoint) {
    const s = store();
    if (!s) return null;
    let session = null;
    try { session = JSON.parse(s.getItem(KEY)); } catch (e) { session = null; }
    if (!session || typeof session.token !== 'string' || !session.token
      || (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now())) {
      try { s.removeItem(KEY); } catch (e) {}
      return null;
    }
    return session.endpoint === endpoint ? session : null;
  }
  function headers(endpoint) {
    const session = read(endpoint);
    return session ? { Authorization: 'Bearer ' + session.token } : {};
  }
  function clear() { const s = store(); try { if (s) s.removeItem(KEY); } catch (e) {} }

  async function login(endpoint, name, password) {
    let res;
    try {
      res = await global.fetch(endpoint + '/api/siparis/giris', { method: 'POST', credentials: 'omit',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ad: name, sifre: password }) });
    } catch (e) { throw new Error('Sunucuya bağlanılamadı. Bağlantınızı kontrol edip tekrar deneyin.'); }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok) throw new Error((body && body.error) || ('Giriş tamamlanamadı (' + res.status + ').'));
    if (!body || typeof body.token !== 'string' || !body.token || !body.user || !body.user.name) throw new Error('Giriş yanıtı desteklenmiyor.');
    const session = Object.assign({}, body, { endpoint });
    try { store().setItem(KEY, JSON.stringify(session)); }
    catch (e) { throw new Error('Oturum bu tarayıcıda saklanamadı (gizli pencere ya da kapalı depolama).'); }
    return session;
  }

  // Shows a blocking login dialog and resolves with the new session. Concurrent callers share one dialog.
  function requireLogin(endpoint, options) {
    if (pending) return pending;
    pending = new Promise(resolve => {
      const doc = global.document;
      const make = (tag, props, css) => { const n = doc.createElement(tag); Object.assign(n, props || {}); if (css) n.style.cssText = css; return n; };
      const overlay = make('div', { id: 'merciSessionLogin' },
        'position:fixed;inset:0;z-index:2147483000;background:rgba(18,33,59,.55);display:flex;align-items:center;justify-content:center;padding:16px;');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'merciSessionTitle');
      const form = make('form', {}, 'background:#fff;color:#12213b;border-radius:14px;padding:24px;width:100%;max-width:360px;box-sizing:border-box;font-family:Inter,system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.25);');
      const title = make('h2', { id: 'merciSessionTitle', textContent: 'Kişisel giriş' }, 'margin:0 0 6px;font-size:20px;');
      const note = make('p', { textContent: (options && options.message) || 'Bu sayfa kişisel hesabınızla açılır. Üretim panelindeki adınız ve şifrenizle giriş yapın. Oturum yalnız bu sekmede saklanır.' },
        'margin:0 0 14px;font-size:13px;line-height:1.45;color:#5b6475;');
      const field = (label, input) => { const l = make('label', {}, 'display:block;font-size:13px;margin-bottom:10px;'); l.appendChild(make('span', { textContent: label })); l.appendChild(input); return l; };
      const inputCss = 'display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px 10px;border:1px solid #c9cfda;border-radius:8px;font:inherit;font-size:16px;';
      const name = make('input', { name: 'ad', required: true, autocomplete: 'username' }, inputCss);
      const password = make('input', { name: 'sifre', type: 'password', required: true, autocomplete: 'current-password' }, inputCss);
      const error = make('p', {}, 'min-height:1em;margin:4px 0 10px;font-size:13px;color:#b42318;');
      error.setAttribute('role', 'alert');
      const button = make('button', { type: 'submit', textContent: 'Giriş yap' },
        'width:100%;padding:10px;border:0;border-radius:8px;background:#12213b;color:#fff;font:inherit;font-weight:600;cursor:pointer;');
      form.appendChild(title); form.appendChild(note);
      form.appendChild(field('Ad', name)); form.appendChild(field('Şifre', password));
      form.appendChild(error); form.appendChild(button);
      overlay.appendChild(form);
      let busy = false;
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        busy = true; button.disabled = true; error.textContent = '';
        try {
          const session = await login(endpoint, String(name.value || '').trim(), String(password.value || ''));
          overlay.remove();
          pending = null;
          resolve(session);
        } catch (e) {
          error.textContent = e.message;
        } finally { busy = false; button.disabled = false; }
      });
      const mount = () => { doc.body.appendChild(overlay); try { name.focus(); } catch (e) {} };
      if (doc.body) mount(); else doc.addEventListener('DOMContentLoaded', mount, { once: true });
    });
    return pending;
  }

  const api = { KEY, read, headers, clear, login, requireLogin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.MerciSession = api;
})(typeof window === 'undefined' ? globalThis : window);
