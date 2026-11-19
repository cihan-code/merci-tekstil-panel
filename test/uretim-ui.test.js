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
  assert.match(js,/Authorization='Bearer '/);assert.doesNotMatch(js,/kdvDahil/);
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

 test('application labels use a shared Turkish position dictionary and decimal commas',()=>{
  assert.equal(ui.applicationLabel({kind:'baski',position:'gogus',width_mm:186,height_mm:200}),'Baskı · Göğüs: 18,6 × 20 cm');
  assert.equal(ui.applicationLabel({kind:'nakis',position:'sol_gogus',width_mm:105,height_mm:55}),'Nakış · Sol göğüs: 10,5 × 5,5 cm');
  for(const [key,label] of Object.entries(ui.POSITIONS))assert.equal(ui.positionLabel(key),label);
  assert.equal(ui.positionLabel('yeni_konum'),'yeni_konum');
  assert.equal(ui.positionLabel('constructor'),'constructor');
});
test('workshop actions follow parked, failed and waiting states',()=>{
  assert.deepEqual(ui.packageActions('manuel_bekliyor'),[['Gruba gönderildi olarak işaretle','elle-gonderildi']]);
  assert.deepEqual(ui.packageActions('basarisiz'),[['Tekrar dene','tekrar']]);
  assert.deepEqual(ui.packageActions('bekliyor'),[['Elle gönderime al (otomatik gönderim kapalı)','manuel']]);
  for(const status of ['tamam','isleniyor','iptal',undefined])assert.deepEqual(ui.packageActions(status),[]);
});
test('cost status keeps queue errors visible before price entry',()=>{
  assert.equal(ui.adapt('cost',{status:'basarisiz',unitPrice:null}).label,'Başarısız');
  assert.equal(ui.adapt('cost',{status:'bekliyor',unitPrice:null}).label,'Bekliyor');
  assert.equal(ui.adapt('cost',{}).label,'Onay bekleniyor');
});

test('cost price input carries explicit template sizes and application quantities without VAT flag',()=>{
  const items=ui.costApplications({computation:{applications:[{type:'baski',area:'göğüs',units:140}],baskiNakisItems:[{type:'baski',area:'göğüs',size:null}]}});
  assert.deepEqual(items,[{type:'baski',area:'göğüs',qty:140,size:''}]);
  const selected=ui.costApplications({bnItems:[{type:'baski',area:'göğüs',size:'Özel Boyut'}],computation:{applications:[{type:'baski',area:'göğüs',units:140}]}});
  assert.deepEqual(ui.pricePayload('80.5',selected),{unitPrice:80.5,bnItems:[{type:'baski',area:'göğüs',qty:140,size:'Özel Boyut'}]});
  assert.deepEqual(ui.pricePayload('80.5'),{unitPrice:80.5});
  assert.deepEqual(ui.costApplications({}),[]);
});


test('Turkish decimal input accepts commas, grouped paste and legacy dots as API numbers',()=>{
  for(const [input,expected] of [['80,50',80.5],['1.234,567',1234.567],['80.5',80.5],['0,001',.001],[' -2,5 ',-2.5],['0',0]])assert.equal(ui.parseNumber(input),expected);
  assert.equal(ui.inputNumber(80.5),'80,5');assert.equal(ui.inputNumber(1234.567),'1234,567');
  assert.equal(ui.inputNumber(''),'');assert.equal(ui.parseNumber(''),null);
  assert.deepEqual(ui.pricePayload('80,50'),{unitPrice:80.5});
  assert.equal(JSON.stringify(ui.pricePayload('80,50')),'{"unitPrice":80.5}');
  for(const value of ['1,2,3','12.34,5','bad','NaN','Infinity',Infinity])assert.throws(()=>ui.parseNumber(value),RangeError);
});
test('localized number validation preserves required, bounds, integer and precision constraints',()=>{
  assert.equal(ui.validateNumber('0',{step:1,required:true}),0);
  assert.equal(ui.validateNumber('12,345',{step:.001}),12.345);
  for(const value of ['-1','0,5','2,01'])assert.throws(()=>ui.validateNumber(value,{step:1}),RangeError);
  assert.throws(()=>ui.validateNumber('',{required:true}),RangeError);
  assert.throws(()=>ui.validateNumber('101',{min:1,max:100}),RangeError);
  assert.throws(()=>ui.validateNumber('0,0001',{step:.001}),RangeError);
  for(const price of ['0','-2','1,001',''])assert.throws(()=>ui.pricePayload(price),RangeError);
});
test('unmatched delivery summary counts only awaiting kg from the full invoice list',()=>{
  const waiting={delivery_status:'teslim_bekliyor',unit:'kg',qty_milli:12500};
  assert.equal(ui.unmatchedAwaitingKg([
    {...waiting,match_status:'teyit',item_id:null},
    {...waiting,qty_milli:250,match_status:'eslesmedi',item_id:null},
    {...waiting,qty_milli:1000,match_status:'eslesti',item_id:null},
    {...waiting,match_status:'eslesti',item_id:1},
    {...waiting,delivery_status:'teslim_alindi',match_status:'teyit'},
    {...waiting,unit:'adet',match_status:'teyit'},
    {...waiting,unit:'m',match_status:'teyit'},
  ]),13.75);
  assert.equal(ui.unmatchedAwaitingKg([]),0);
});
test('confirmation text preserves server bullet lines and uses recipe and position labels',()=>{
  assert.equal(ui.displayMessage('Maliyet aktarımı için eksik alanlar:\n\n• polo: gogus\n—\n• Birim fiyat., kontrol'),'Maliyet aktarımı için eksik alanlar:\n• Polo yaka: Göğüs\n• Birim fiyat; kontrol');
  for(const value of [null,undefined,'','  ','—','\n—\n'])assert.equal(ui.displayMessage(value),'');
  assert.equal(ui.PRODUCTS.polo,'Polo yaka');
});
test('read-only size summaries exclude zero sizes while preserving positive counts',()=>{
  assert.equal(ui.positiveSizes({XS:0,S:5,M:0,L:12,'2XL':0}),'S: 5, L: 12');
  assert.equal(ui.positiveSizes({XS:0}), '');
});
test('queue cards derive both basename and localized type from actual outbox payload',()=>{
  assert.deepEqual(ui.queueFile({payload_json:JSON.stringify({file:{id:4,path:'/private/storage/order-4.pdf',kind:'kesim_formu'}})}),{name:'order-4.pdf',kind:'Kesim formu'});
  assert.deepEqual(ui.queueFile({payload_json:{file:{filename:'dikim.pdf',kind:'dikim_formu'}}}),{name:'dikim.pdf',kind:'Dikim formu'});
  assert.deepEqual(ui.queueFile({payload_json:'{}'}),{name:'',kind:''});
});
test('dark dialog selector matches body-mounted dialog and preserves mobile gutters',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../assets/uretim.css'),'utf8');
  assert.match(css,/\.production\.p-dialog\{/);assert.doesNotMatch(css,/\.production \.p-dialog\{/);
  assert.match(css,/width:calc\(100vw - 32px\)/);assert.match(css,/color-scheme:dark/);
  assert.match(css,/select:disabled\{opacity:1/);
  for(const file of ['uretim.html','stok.html'])assert.match(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),/<html lang="tr">/);
});
