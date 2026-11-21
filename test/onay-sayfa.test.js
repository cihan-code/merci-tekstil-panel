'use strict';
// G64: customer approval page. Invented data only; the page code runs against a tiny fake DOM.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const onay=require('../assets/onay.js');
const HTML=fs.readFileSync(path.join(__dirname,'../onay.html'),'utf8');
const CSS=fs.readFileSync(path.join(__dirname,'../assets/onay.css'),'utf8');
const JS=fs.readFileSync(path.join(__dirname,'../assets/onay.js'),'utf8');
const TOKEN='B'.repeat(43);
const API='https://api.example.test';

class El {
  constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.hidden=false;this.value='';this.disabled=false;this.className='';this._text=undefined;}
  append(...c){for(const x of c)this.children.push(x);}
  replaceChildren(...c){this.children=[];this._text=undefined;this.append(...c);}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='hidden')this.hidden=true;}
  getAttribute(k){return this.attrs[k]??null;}
  addEventListener(e,h){(this.listeners[e] ||= []).push(h);}
  async click(){for(const h of this.listeners.click||[])await h({});await new Promise(r=>setImmediate(r));}
  focus(){}
  find(pred,out=[]){if(pred(this))out.push(this);for(const c of this.children)if(c instanceof El)c.find(pred,out);return out;}
  get textContent(){return this._text ?? this.children.map(c=>c.textContent ?? c.data ?? '').join('');}
  set textContent(v){this._text=String(v);}
}
function page({search=`?t=${TOKEN}&api=${API}`,summary,status=200,responses={}}={}) {
  const root=new El('main'),calls=[];
  const doc={getElementById:()=>root,createElement:t=>new El(t),createTextNode:t=>({data:String(t),textContent:String(t)})};
  const fetch=async(url,init)=>{
    const route=url.replace(`${API}/api/siparis/musteri/${TOKEN}`,'')||'/';
    calls.push({route,method:init.method,body:init.body?JSON.parse(init.body):undefined,credentials:init.credentials});
    const key=`${init.method} ${route}`;
    if(responses[key]) {const r=responses[key];return {ok:(r.status||200)<400,status:r.status||200,json:async()=>r.body||{}};}
    return {ok:status<400,status,json:async()=>summary||{}};
  };
  return {root,calls,run:()=>onay.start(doc,{search,fetch})};
}
const SUMMARY={durum:'bekliyor',siparis:{no:'MRC-G64-1',ad:'Örnek Kulüp',surum:2},sonKullanma:'2026-12-06T10:00:00.000Z',
  urunler:[{ad:'Tişört',renk:'Mavi',kumas:null,numune:false,adet:4,bedenler:{M:2,L:2,XL:0},
    gorseller:[{gorunum:'on',url:`/api/siparis/musteri/${TOKEN}/gorsel/5`}],
    uygulamalar:[{tur:'baski',konum:'gogus',enMm:280,boyMm:120,olcu:'standart'},{tur:'nakis',konum:'sol_kol',enMm:75,boyMm:40,olcu:'yaklasik'},{tur:'baski',konum:'sirt',enMm:null,boyMm:null,olcu:'bekliyor'}]}],
  onayFormu:`/api/siparis/musteri/${TOKEN}/onay-formu.pdf`,sartlar:'1. Sipariş ve Üretim Onayı\nÖrnek şart metni.',notlar:[]};
const buttons=(root,label)=>root.find(e=>e.tag==='button'&&e.textContent===label)[0];

test('yardımcılar: api adresi, belirteç biçimi, ölçü etiketi',()=>{
  assert.equal(onay.apiBase(''),'https://erci-materials-api.onrender.com');
  assert.equal(onay.apiBase('?api=https://x.example.test/yol/'),'https://x.example.test/yol');
  assert.equal(onay.apiBase('?api=javascript:alert(1)'),'');
  assert.equal(onay.tokenOf(`?t=${TOKEN}`),TOKEN);assert.equal(onay.tokenOf('?t=kisa'),'');assert.equal(onay.tokenOf(''),'');
  assert.deepEqual(onay.measureLabel({olcu:'standart',enMm:280,boyMm:120}),{main:'28 × 12 cm',sub:'Standart ölçü'});
  assert.deepEqual(onay.measureLabel({olcu:'yaklasik',enMm:75,boyMm:40}),{main:'≈ 7,5 × 4 cm',sub:'Yaklaşık ölçü (≈)'});
  assert.equal(onay.measureLabel({olcu:'bekliyor',enMm:null}).main,'Ölçü kesinleşiyor');
});

test('özet çizilir: sipariş, ürün, görsel, beden, uygulama ölçüleri, PDF bağlantısı, şartlar, iki düğme',async()=>{
  const p=page({summary:SUMMARY});await p.run();
  const text=p.root.textContent;
  for(const s of ['Örnek Kulüp','MRC-G64-1','Tişört','Mavi','4 adet','Göğüs · Baskı','28 × 12 cm','Standart ölçü','≈ 7,5 × 4 cm','Yaklaşık ölçü (≈)','Ölçü kesinleşiyor','Örnek şart metni','Onaylıyorum','Değişiklik istiyorum'])
    assert.ok(text.includes(s),s);
  assert.ok(!text.includes('XL0'));
  assert.equal(p.root.find(e=>e.tag==='img')[0].getAttribute('src'),`${API}/api/siparis/musteri/${TOKEN}/gorsel/5`);
  const pdf=p.root.find(e=>e.tag==='a')[0];assert.equal(pdf.textContent,'Onay formunu aç (PDF)');
  assert.equal(pdf.getAttribute('href'),`${API}/api/siparis/musteri/${TOKEN}/onay-formu.pdf`);assert.match(pdf.getAttribute('rel'),/noopener/);
  assert.equal(p.calls[0].credentials,'omit');
  assert.equal(p.calls.length,1);
});

test('ad soyad boşken Onaylıyorum istek göndermez; doluyken kabul:true ile gönderir ve "Onayınız alındı" gösterir',async()=>{
  const p=page({summary:SUMMARY,responses:{'POST /onayla':{body:{durum:'onaylandi'}}}});await p.run();
  await buttons(p.root,'Onaylıyorum').click();
  assert.equal(p.calls.length,1);assert.match(p.root.textContent,/adınızı ve soyadınızı/);
  p.root.find(e=>e.tag==='input')[0].value='Ayşe Örnek';
  await buttons(p.root,'Onaylıyorum').click();
  assert.deepEqual(p.calls[1],{route:'/onayla',method:'POST',body:{adSoyad:'Ayşe Örnek',kabul:true},credentials:'omit'});
  assert.match(p.root.textContent,/Onayınız alındı/);
});

test('değişiklik notu: alan açılır, boş not gönderilmez, not metin olarak gider ve "Notunuz iletildi" çıkar',async()=>{
  const p=page({summary:SUMMARY,responses:{'POST /degisiklik':{status:201,body:{durum:'degisiklik_istendi'}}}});await p.run();
  const area=p.root.find(e=>e.tag==='textarea')[0];
  assert.equal(area.parentHidden,undefined);
  await buttons(p.root,'Değişiklik istiyorum').click();
  const send=buttons(p.root,'Gönder');assert.equal(send.hidden,false);
  p.root.find(e=>e.tag==='input')[0].value='Ayşe Örnek';
  await send.click();assert.equal(p.calls.length,1);assert.match(p.root.textContent,/değişiklik notunuzu yazın/);
  area.value='Göğüs <script>alert(1)</script> küçülsün';
  await send.click();
  assert.deepEqual(p.calls[1].body,{adSoyad:'Ayşe Örnek',not:'Göğüs <script>alert(1)</script> küçülsün'});
  assert.match(p.root.textContent,/Notunuz iletildi/);assert.match(p.root.textContent,/henüz onaylanmadı/);
  assert.equal(p.root.find(e=>e.tag==='script').length,0);
});

test('404 ve belirteçsiz açılış "Bu linkin süresi doldu" gösterir; sunucu hatası ayrı mesaj verir',async()=>{
  const a=page({status:404});await a.run();assert.match(a.root.textContent,/Bu linkin süresi doldu/);
  const b=page({search:'?t=kisa'});await b.run();assert.match(b.root.textContent,/Bu linkin süresi doldu/);assert.equal(b.calls.length,0);
  const c=page({status:500,summary:{error:'Sunucu şu an meşgul'}});await c.run();assert.match(c.root.textContent,/Sayfa açılamadı/);
});

test('zaten onaylanmış ya da onay sırasında 404 dönen link uygun ekranı gösterir',async()=>{
  const a=page({summary:{...SUMMARY,durum:'onaylandi',onaylayan:'Ayşe Örnek',onayTarihi:'2026-11-22T09:00:00.000Z'}});await a.run();
  assert.match(a.root.textContent,/Onayınız alındı/);assert.ok(!buttons(a.root,'Onaylıyorum'));
  const b=page({summary:SUMMARY,responses:{'POST /onayla':{status:404,body:{error:'x'}}}});await b.run();
  b.root.find(e=>e.tag==='input')[0].value='Ayşe Örnek';await buttons(b.root,'Onaylıyorum').click();
  assert.match(b.root.textContent,/süresi doldu/);
  const c=page({summary:SUMMARY,responses:{'POST /onayla':{status:409,body:{error:'Onay şu an tamamlanamadı; lütfen bizimle iletişime geçin'}}}});await c.run();
  c.root.find(e=>e.tag==='input')[0].value='Ayşe Örnek';await buttons(c.root,'Onaylıyorum').click();
  assert.match(c.root.textContent,/Onay şu an tamamlanamadı/);assert.ok(buttons(c.root,'Onaylıyorum'));
});

test('sayfa kabuğu: Türkçe, telefon görünümü, indekslenmez, açık/koyu tema, innerHTML yok, dış font yok',()=>{
  assert.match(HTML,/<html lang="tr">/);assert.match(HTML,/name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(HTML,/noindex/);assert.match(HTML,/name="referrer" content="no-referrer"/);assert.match(HTML,/assets\/onay\.js/);
  assert.match(CSS,/prefers-color-scheme:dark/);assert.match(CSS,/min-height:52px/);
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(JS));
  assert.ok(!/fonts\.googleapis/.test(HTML+CSS));
  assert.ok(!/localStorage|sessionStorage/.test(JS));
});
