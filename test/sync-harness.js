'use strict';
// Panel bulut senkronizasyonu REGRESYON KOSUMU — tarayici gerektirmez, bagimlilik yok.
//
// Neyi koruyor: 11 Eylul 2026'da giderilen veri kaybi. Kaydet'e basildiktan sonra bulut
// yazmasi tamamlanmadan gelen periyodik tazeleme, yeni girilen kaydi bellekten siliyor,
// ardindan bekleyen yazma bu silinmis hali buluta gondererek kaybi kalici yapiyordu.
// "poll-race" senaryosu tam olarak bunu yakalar (eski surumde jobs=0 ile duser).
//
// Kullanim:
//   node test/sync-harness.js                # tum senaryolar
//   node test/sync-harness.js poll-race      # tek senaryo
//   node test/sync-harness.js poll-race eski-index.html   # baska bir surumu test et

const fs = require('fs');
const path = require('path');
const vm = require('vm');
require(path.join(__dirname, 'dom-stub.js'));

const ALL = ['normal', 'poll-race', 'save-during-response', 'net-fail', 'stale-autoheal', 'real-conflict', 'schema-422', 'quota'];
const scenario = process.argv[2] || 'normal';
const PANEL_HTML = process.argv[3] || path.join(__dirname, '..', 'index.html');

// index.html icindeki satir ici <script> bloklarini cikar (tarayicidaki gibi tek kapsam).
function buildBundle() {
  const html = fs.readFileSync(PANEL_HTML, 'utf8');
  const blocks = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  if (!blocks.length) throw new Error('index.html icinde satir ici script bulunamadi: ' + PANEL_HTML);
  return blocks.join('\n;\n') + EPILOGUE;
}

// Test erisimi: script kapsamindaki degiskenleri disariya acar.
const EPILOGUE = `
;globalThis.__t = {
  get dirty() { try { return CLOUD_DIRTY; } catch (e) { return undefined; } },
  get inflight() { try { return CLOUD_INFLIGHT; } catch (e) { return undefined; } },
  get conflict() { try { return CLOUD_CONFLICT; } catch (e) { return undefined; } },
  get errors() { try { return PANEL_ERRORS; } catch (e) { return undefined; } },
  get stamp() { try { return CLOUD_LAST_KNOWN_UPDATED_AT; } catch (e) { return undefined; } },
  get base() { try { return CLOUD_BASE_JSON; } catch (e) { return undefined; } },
  get badge() { try { return SYNC_BADGE_STATE; } catch (e) { return undefined; } },
  get retryN() { try { return CLOUD_RETRY_N; } catch (e) { return undefined; } },
  get ready() { try { return CLOUD_SYNC_READY; } catch (e) { return undefined; } },
  get data() { try { return DATA; } catch (e) { return undefined; } },
  set data(v) { DATA = v; },
  saveData: function () { return saveData(); },
  tick: function () { return cloudRefreshTick(); },
  push: function () { return runCloudPush(); },
  report: function () { return panelErrorReportText(); },
  stubRender: function () { renderAll = function () {}; populateLoginNames = function () {}; renderYoneticiler = function () {}; },
};
`;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let failed = 0;
function check(cond, label, extra) {
  if (cond) { console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + (extra ? ('  →  ' + extra) : '')); }
}

// --- sahte sunucu durumu ---
const server = { data: null, updatedAt: null, nextPost: null, getFails: 0 };
function serverGet() {
  if (server.getFails > 0) { server.getFails--; throw new Error('ağ hatası (test)'); }
  // Gerçek HTTP sınırı: yanıt DAİMA kopya olmalı (aksi halde istemci sunucunun nesnesini
  // doğrudan mutasyona uğratır ve test yalan söyler).
  return jsonRes(200, JSON.parse(JSON.stringify({ data: server.data, auth: null, updatedAt: server.updatedAt })));
}
globalThis.__fetchImpl = async (url, opts) => {
  const isPost = (opts.method === 'POST');
  if (String(url).indexOf('/api/paneldata') !== -1 && !isPost) return serverGet();
  if (String(url).indexOf('/api/paneldata') !== -1 && isPost) {
    if (server.nextPost) { const r = server.nextPost; server.nextPost = null; if (r instanceof Error) throw r; return r; }
    const body = JSON.parse(opts.body);
    server.data = body.data;
    server.updatedAt = new Date().toISOString() + '#' + Math.random().toString(36).slice(2, 6);
    return jsonRes(200, { ok: true, updatedAt: server.updatedAt });
  }
  return jsonRes(404, { error: 'bilinmeyen uç', code: 'TEST-404' });
};

// senaryoya gore acilisi ayarla
if (scenario === 'stale-autoheal') server.getFails = 1;      // açılış çekişi başarısız
server.data = server.data || { customers: [], jobs: [], incomes: [], expenses: [], fixedExpenses: [], debts: [], pipeline: [], suppliers: [], hedefler: [], hedeflerAylik: [], uretimTakip: [], okulMail: [], okulTakip: [], tasks: [], invoices: [], supplierCategories: [], costTemplates: { products: [], baski: {}, nakis: {}, price_tiers: [], price_list: {}, meta: {} } };
server.updatedAt = '2026-09-11T08:00:00.000Z';

vm.runInThisContext(buildBundle(), { filename: 'panel-bundle.js' });
const T = globalThis.__t;
T.stubRender();

(async function run() {
  await wait(120);                       // açılış senkronu otursun
  console.log('\n=== SENARYO: ' + scenario + ' ===');

  if (scenario === 'normal') {
    check(T.ready === true, 'açılış senkronu tamamlandı');
    check(T.dirty === false, 'başlangıçta kaydedilmemiş değişiklik yok');
    check(T.stamp === '2026-09-11T08:00:00.000Z', 'bulut damgası alındı', T.stamp);
    T.data.jobs.push({ id: 1, title: 'TEST İŞ', quantity: 5 });
    T.saveData();
    check(T.dirty === true, 'kaydet sonrası "gönderilmedi" işareti açıldı');
    check(T.badge === 'pending', 'rozet: bekliyor', T.badge);
    await wait(900);                     // debounce + istek
    check(T.dirty === false, 'kayıt onaylandı, işaret kapandı');
    check(T.badge === 'ok', 'rozet: kayıtlı', T.badge);
    check(server.data.jobs.length === 1 && server.data.jobs[0].title === 'TEST İŞ', 'kayıt sunucuya ulaştı');
  }

  if (scenario === 'poll-race') {
    // ESKİ HATA: kaydet'e basıldıktan hemen sonra gelen periyodik tazeleme, bulut yazması
    // tamamlanmadan yerel veriyi eski bulut sürümüyle değiştiriyor ve kayıt yok oluyordu.
    T.data.jobs.push({ id: 7, title: 'YENİ İŞ', quantity: 100 });
    T.saveData();
    check(T.dirty === true, 'kayıt bekliyor');
    await T.tick();                      // araya giren periyodik tazeleme (sunucu HENÜZ eski)
    check(T.data.jobs.length === 1, 'tazeleme yeni kaydı SİLMEDİ (kök neden düzeltmesi)', 'jobs=' + T.data.jobs.length);
    check(T.data.jobs[0] && T.data.jobs[0].title === 'YENİ İŞ', 'kayıt hâlâ yerinde');
    await wait(900);
    check(server.data.jobs.length === 1 && server.data.jobs[0].title === 'YENİ İŞ', 'kayıt sunucuya doğru şekilde gitti');
    check(T.dirty === false, 'senkron tamam');
    // ikinci tur: sunucu artık güncel, tazeleme sorunsuz geçmeli
    await T.tick();
    check(T.data.jobs.length === 1, 'ikinci tazeleme de veriyi bozmadı');
  }

  if (scenario === 'save-during-response') {
    // İnce yarış: sunucu yanıtı AYRIŞTIRILIRKEN kullanıcı yeni kayıt yapar.
    // Bu kayıt "gönderildi" sayılırsa, gönderilene kadar geçen sürede tazeleme onu silebilir.
    T.data.jobs.push({ id: 1, title: 'İLK' });
    let release;
    const gate = new Promise(r => { release = r; });
    server.nextPost = { ok: true, status: 200, json: async () => { await gate; server.data = JSON.parse(JSON.stringify(T.data)); server.updatedAt = 'X1'; return { ok: true, updatedAt: 'X1' }; } };
    T.saveData();
    await wait(800);                                   // POST uçtu, yanıt gövdesi bekliyor
    T.data.jobs.push({ id: 2, title: 'İKİNCİ' });
    T.saveData();                                      // yanıt ayrıştırılırken gelen kayıt
    release();
    await wait(40);
    check(T.dirty === true, 'yanıt ayrıştırılırken gelen kayıt "gönderildi" sayılmadı');
    await T.tick();                                    // araya giren tazeleme
    check(T.data.jobs.length === 2, 'tazeleme ikinci kaydı silmedi', 'jobs=' + T.data.jobs.length);
    await wait(1200);
    check(T.dirty === false, 'ikinci kayıt da tamamlandı');
    check(server.data.jobs.length === 2, 'her iki kayıt da sunucuda', 'jobs=' + server.data.jobs.length);
  }

  if (scenario === 'net-fail') {
    T.data.jobs.push({ id: 2, title: 'AĞ TESTİ' });
    server.nextPost = new Error('Failed to fetch');
    T.saveData();
    await wait(900);
    check(T.dirty === true, 'ağ hatasında kayıt "gönderilmedi" olarak KALDI (sessizce yutulmuyor)');
    check(T.badge === 'error', 'rozet: kaydedilmedi', T.badge);
    const e = T.errors[0];
    check(!!e && e.code === 'SYNC-001', 'hata kodu SYNC-001 üretildi', e && e.code);
    check(T.retryN === 1, 'yeniden deneme planlandı', 'n=' + T.retryN);
    await T.push();                      // yeniden deneme (sunucu artık ayakta)
    await wait(60);
    check(T.dirty === false, 'yeniden denemede kayıt tamamlandı');
    check(server.data.jobs.length === 1, 'veri sunucuya ulaştı');
  }

  if (scenario === 'stale-autoheal') {
    // Açılışta bulut çekişi başarısız (Render soğuk başlangıç) → damga yok → sunucu 409 döner.
    // Sunucudaki veri bizim başladığımız veriyle AYNI ise kullanıcıyı hiç rahatsız etmeden düzelmeli.
    check(T.stamp === null, 'açılışta damga alınamadı (soğuk başlangıç simülasyonu)', String(T.stamp));
    server.data = JSON.parse(JSON.stringify(T.data));        // sunucu = oturuma başladığımız hâl
    T.data.jobs.push({ id: 3, title: 'SOĞUK BAŞLANGIÇ İŞİ' });
    server.nextPost = jsonRes(409, { error: 'bayat', code: 'PD-409-STALE', currentUpdatedAt: server.updatedAt });
    T.saveData();
    await wait(1200);
    check(T.conflict === false, 'sahte çakışmada kullanıcıya soru SORULMADI');
    check(T.dirty === false, 'kayıt otomatik düzeltilip tamamlandı');
    check(server.data.jobs.length === 1 && server.data.jobs[0].title === 'SOĞUK BAŞLANGIÇ İŞİ', 'kayıt sunucuya ulaştı');
    check(T.errors.some(e => e.code === 'SYNC-004R'), 'olay kayda geçti (SYNC-004R)', T.errors.map(e => e.code).join(','));
  }

  if (scenario === 'real-conflict') {
    T.data.jobs.push({ id: 4, title: 'BENİM İŞİM' });
    server.data = JSON.parse(JSON.stringify(server.data));
    server.data.jobs = [{ id: 9, title: 'BAŞKA CİHAZIN İŞİ' }, { id: 10, title: 'İKİNCİ' }];
    server.updatedAt = '2026-09-11T09:00:00.000Z';
    server.nextPost = jsonRes(409, { error: 'çakışma', code: 'PD-409-CONFLICT', currentUpdatedAt: server.updatedAt });
    T.saveData();
    await wait(1200);
    check(T.conflict === true, 'gerçek çakışmada karar bandı açıldı');
    check(T.badge === 'conflict', 'rozet: çakışma', T.badge);
    check(T.data.jobs.length === 1 && T.data.jobs[0].title === 'BENİM İŞİM', 'yerel değişiklik SİLİNMEDİ');
    check(server.data.jobs.length === 2, 'bulut sürümü de ezilmedi');
    check(T.errors.some(e => e.code === 'SYNC-003'), 'hata kodu SYNC-003 üretildi', T.errors.map(e => e.code).join(','));
    const bar = document.body.children.find(c => c.id === 'cloudConflictBanner');
    check(!!bar, 'karar bandı DOM\'a eklendi');
    check(!!bar && bar.innerHTML.indexOf('SYNC-003') !== -1, 'bantta hata kodu görünüyor');
    check(!!bar && bar.innerHTML.indexOf('Yedeğimi İndir') !== -1, 'bantta yedek indirme seçeneği var');
  }

  if (scenario === 'schema-422') {
    T.data.jobs.push({ id: 5, title: 'BOZUK', quantity: 'abc' });
    server.nextPost = jsonRes(422, { error: 'Panel verisi doğrulanamadı (bozuk alan). Kaydetme iptal edildi.', code: 'PD-422-SCHEMA', details: [{ path: 'jobs[0].quantity', problem: 'geçersiz sayı: "abc"' }] });
    T.saveData();
    await wait(900);
    const e = T.errors[0];
    check(!!e && e.code === 'SYNC-005', 'hata kodu SYNC-005 üretildi', e && e.code);
    check(!!e && e.msg.indexOf('jobs[0].quantity') !== -1, 'sorunlu alan kullanıcıya gösteriliyor', e && e.msg);
    check(T.retryN === 0, 'aynı bozuk veri için sonsuz tekrar yok');
    check(T.dirty === true, 'veri hâlâ "gönderilmedi" olarak işaretli');
  }

  if (scenario === 'quota') {
    globalThis.__quotaFull = true;       // localStorage kotası dolu
    T.data.jobs.push({ id: 6, title: 'KOTA TESTİ' });
    let threw = false;
    try { T.saveData(); } catch (err) { threw = true; }
    globalThis.__quotaFull = false;
    check(threw === false, 'kota hatası form işlemini yarıda kesmiyor');
    check(T.errors.some(e => e.code === 'LOC-001'), 'hata kodu LOC-001 üretildi', T.errors.map(e => e.code).join(','));
    await wait(900);
    check(server.data.jobs.length === 1, 'kota dolu olsa da kayıt buluta gitti');
  }

  if (ALL.indexOf(scenario) === -1) {
    console.log('  ! bilinmeyen senaryo. Seçenekler: ' + ALL.join(', '));
    process.exit(2);
  }
  console.log(failed === 0 ? '\nSONUÇ: hepsi geçti' : ('\nSONUÇ: ' + failed + ' kontrol BAŞARISIZ'));
  process.exit(failed === 0 ? 0 : 1);
})();
