'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ui=require('../assets/uretim.js');

test('kg uses Turkish grouping, decimal comma and preserves negative and zero balances',()=>{
  assert.equal(ui.formatKg(1234.5),'1.234,5 kg');
  assert.equal(ui.formatKg(0),'0 kg');
  assert.equal(ui.formatKg(-2.125),'-2,125 kg');
  assert.equal(ui.formatKg(0.001),'0,001 kg');
});
test('missing and invalid kg are unknown rather than zero',()=>{
  for(const value of [null,undefined,NaN,Infinity,'bad','', ' '])assert.equal(ui.formatKg(value),'—');
});
test('dates use day.month.year and reject invalid dates',()=>{
  assert.equal(ui.formatDate('2026-11-19T12:00:00Z'),'19.11.2026');
  assert.equal(ui.formatDate('invalid'),'—');assert.equal(ui.formatDate(null),'—');
});
test('status labels cover ordering, approval, manual dispatch, invoices and confirmation types',()=>{
  for(const [code,label] of Object.entries({onay_bekliyor:'Onay bekliyor',onaylandi:'Onaylandı',manuel_bekliyor:'Elle gönderim bekliyor',elle_gonderildi:'Gruba gönderildi',fiyat_bekliyor:'Fiyat bekliyor',teslim_alindi:'Teslim alındı',vektor_kalite:'Vektör kalitesi',eski_surum:'Eski sürüm'}))assert.equal(ui.statusLabel(code),label);
  assert.equal(ui.statusLabel('future_state'),'future_state');
});
test('size totals accept all eight sizes without including unrelated properties',()=>{
  assert.equal(ui.sizeTotal({XS:2,M:4,'4XL':3,other:400}),9);
  assert.equal(ui.sizeTotal({}),0);
  assert.equal(ui.sizeTotal(Object.fromEntries(ui.SIZES.map(s=>[s,'2']))),16);
});
test('invalid size quantities cannot silently change an order',()=>{
  for(const n of [-1,.5,NaN,Infinity,'bad'])assert.throws(()=>ui.sizeTotal({S:n}),RangeError);
});
test('pixel box scales both axes to original image pixels',()=>{
  assert.deepEqual(ui.pixelBox({x:30,y:60,w:90,h:120},{w:300,h:600},{w:1000,h:2000}),{x:100,y:200,w:300,h:400});
  assert.deepEqual(ui.pixelBox({x:0,y:0,w:300,h:600},{w:300,h:600},{w:1000,h:1200}),{x:0,y:0,w:1000,h:1200});
});
test('pixel conversion rejects out-of-image, empty, and non-finite measurements',()=>{
  for(const box of [{x:-1,y:0,w:1,h:1},{x:0,y:0,w:0,h:1},{x:20,y:0,w:90,h:10},{x:0,y:0,w:NaN,h:1}])assert.throws(()=>ui.pixelBox(box,{w:100,h:100},{w:1000,h:1000}),RangeError);
  assert.throws(()=>ui.pixelBox({x:0,y:0,w:1,h:1},{w:0,h:100},{w:100,h:100}),RangeError);
});
test('stock adapter converts milli-units exactly once and prefers explicit kg fields',()=>{
  const out=ui.adapt('stock',{id:1,total_milli:1234500,reserved_milli:2000,available_milli:1232500,shortage_milli:0,awaiting_delivery_milli:5500});
  assert.equal(out.total,1234.5);assert.equal(out.available,1232.5);assert.equal(out.shortage,0);assert.equal(out.awaiting_delivery,5.5);
  assert.equal(ui.adapt('stock',{total_kg:12.5,total_milli:900}).total,12.5);
});
test('stock adapter never invents missing balances or interprets undocumented bare units',()=>{
  const out=ui.adapt('stock',{id:1,total:100});assert.equal(out.total,null);assert.equal(out.reserved,null);
});
test('line adapter reads actual SQLite JSON and structured request formats without mutation',()=>{
  const input={sizes_json:'{"S":4}',material_items_json:'{"ribana":2}'};
  const out=ui.adapt('line',input);assert.deepEqual(out.sizes,{S:4});assert.deepEqual(out.material_items,{ribana:2});assert.equal(input.sizes,undefined);
  assert.deepEqual(ui.adapt('line',{sizes:{M:2}}).sizes,{M:2});
  assert.throws(()=>ui.adapt('line',{sizes_json:'bad'}));
});
test('invoice adapter preserves allocation suggestions, related orders and matching reasons',()=>{
  const out=ui.adapt('invoice',{allocation_json:'[{"orderLineId":7,"qtyMilli":15000}]',orders:['DEMO-1'],match_reasons_json:'["Kontrol"]'});
  assert.deepEqual(out.allocations,[{orderLineId:7,qtyMilli:15000}]);assert.deepEqual(out.orders,['DEMO-1']);assert.deepEqual(out.reasons,['Kontrol']);
});
test('measurement adapter reports cm without turning an absent reference into zero',()=>{
  assert.equal(ui.adapt('measurement',{width_mm:125,height_mm:200}).widthCm,12.5);
  assert.equal(ui.adapt('measurement',{width_mm:null,needsConfirmation:true}).widthCm,null);
});
test('order stock summary remains unknown until the server supplies per-order allocations',()=>{
  assert.equal(ui.adapt('orderStock',{}).label,'Bilgi bekleniyor');
  assert.equal(ui.adapt('orderStock',{allocations:[{shortage_milli:2}]}).label,'Tedarik bekliyor');
  assert.equal(ui.adapt('orderStock',{allocations:[{shortage_milli:0}]}).label,'Tam');
});
test('cost adapter distinguishes waiting price and completed transfer',()=>{
  assert.equal(ui.adapt('cost',{status:'fiyat_bekliyor'}).label,'Fiyat bekliyor');
  assert.equal(ui.adapt('cost',{status:'tamamlandi',unitPrice:10}).label,'Tamam');
  assert.equal(ui.adapt('cost',{status:'tamam',unitPrice:null}).label,'Tamam');
  assert.equal(ui.adapt('cost',{status:'basarisiz',unitPrice:10}).label,'Başarısız');
});
test('unknown API response envelopes fail visibly',()=>{
  assert.deepEqual(ui.adapt('list',[]),[]);assert.throws(()=>ui.adapt('list',{items:[]}),TypeError);
  assert.throws(()=>ui.adapt('unknown',{}),TypeError);
});
test('escaping handles text, attribute delimiters, ampersands and empty values',()=>{
  assert.equal(ui.escapeHtml('<img src="x" onerror=\'bad\'> &'), '&lt;img src=&quot;x&quot; onerror=&#39;bad&#39;&gt; &amp;');
  assert.equal(ui.escapeHtml(null),'');assert.equal(ui.escapeHtml(42),'42');
});
test('production client keeps credentials in session storage and avoids HTML sinks and legacy keys',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../assets/uretim.js'),'utf8');
  assert.doesNotMatch(js,/localStorage|innerHTML|insertAdjacentHTML|x-api-key/i);
  assert.match(js,/sessionStorage\.setItem/);assert.match(js,/res.status===401/);
  assert.match(js,/Authorization='Bearer '/);assert.match(js,/kdvDahil:false/);
});
test('stock page mounts the shared ledger and removes legacy fabric mutations',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../stok.html'),'utf8');
  assert.match(html,/data-mode="stock"/);assert.doesNotMatch(html,/id="add-fabric"|id="km-save"|data-del-fabric|state\.fabrics\.push/);
  assert.match(html,/function renderSamples\(/);assert.match(html,/api\/stokdata/);
});

test('size boundary translates UI 2XL to documented PDF XXL and back',()=>{
  assert.deepEqual(ui.adapt('sizesOut',{'2XL':5,XS:1}),{XXL:5,XS:1});
  assert.deepEqual(ui.adapt('line',{sizes_json:'{"XXL":5,"XS":1}'}).sizes,{'2XL':5,XS:1});
});

test('cm values and piece counts share Turkish number formatting',()=>{
  assert.equal(ui.formatNumber(12.5),'12,5');assert.equal(ui.formatNumber(1234),'1.234');assert.equal(ui.formatNumber(null),'—');
});
