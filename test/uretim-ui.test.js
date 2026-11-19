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

test('image warnings and design lists follow persisted line metadata across products',()=>{
  const version={lines:[{id:11},{id:22}],files:[{id:1,kind:'urun_gorsel',line_id:11,gorunum:'on'},{id:2,kind:'desen_kaynak',line_id:22},{id:3,kind:'urun_gorsel',line_id:11,gorunum:'arka'}]};
  assert.deepEqual(ui.missingImages(version).map(line=>line.id),[22]);
  assert.deepEqual(ui.lineFiles(version,22).map(file=>file.id),[2]);
  assert.deepEqual(ui.lineFiles(version,11).map(file=>file.id),[1,3]);
  assert.deepEqual(ui.missingImages({...version,files:[...version.files,{id:4,kind:'urun_gorsel',line_id:22}]}),[]);
});
test('unknown product file ownership never makes all rows appear complete',()=>{
  const file={id:1,kind:'urun_gorsel'},version={lines:[{id:11},{id:22}],files:[file]};
  assert.equal(ui.missingImages(version).length,2);
  assert.deepEqual(ui.missingImages(version,{1:{lineId:22}}).map(line=>line.id),[11]);
  assert.equal(ui.missingImages({lines:[{id:11}],files:[file]}).length,0);
});
test('each persisted design finds its own application without parsing invalid legacy provenance',()=>{
  const first={id:1,kind:'nakis',position:'sirt',measure_source:'{"desenDosyaId":7}'},second={id:2,kind:'baski',position:'gogus',measure_source:'{"desenDosyaId":8}'};
  const line={applications:[{measure_source:'old free text'},first,second]};
  assert.equal(ui.designApplication(line,'7'),first);assert.equal(ui.designApplication(line,8),second);assert.equal(ui.designApplication(line,9),undefined);
});
test('uploads run sequentially, retain each failed filename, continue and retry only unfinished stages',async()=>{
  const jobs=[{file:{name:'on.png'},kind:'urun_gorsel'},{file:{name:'logo.pdf'},kind:'desen_kaynak',applicationKind:'nakis',position:'sirt'},{file:{name:'arka.png'},kind:'urun_gorsel'},{file:{name:'ikinci.png'},kind:'desen_kaynak',applicationKind:'baski',position:'gogus'}];
  const calls=[];let failUpload=true,failApplication=true,inFlight=0;
  const send=async job=>{assert.equal(inFlight++,0);await Promise.resolve();calls.push('upload:'+job.file.name);inFlight--;if(job.file.name==='on.png'&&failUpload)throw Error('PNG yüklenemedi');return {id:job.file.name};};
  const save=async job=>{calls.push('application:'+job.file.name+':'+job.applicationKind+':'+job.position);if(job.file.name==='logo.pdf'&&failApplication)throw Error('Uygulama kaydedilemedi');return {id:job.uploaded.id};};
  const failed=await ui.uploadJobs(jobs,send,save);
  assert.deepEqual(failed.map(job=>[job.file.name,job.error]),[['on.png','PNG yüklenemedi'],['logo.pdf','Uygulama kaydedilemedi']]);
  assert.equal(jobs[2].done,true);assert.equal(jobs[3].done,true);assert.equal(jobs[1].uploaded.id,'logo.pdf');
  failUpload=false;failApplication=false;calls.length=0;
  assert.deepEqual(await ui.uploadJobs(jobs,send,save),[]);
  assert.deepEqual(calls,['upload:on.png','application:logo.pdf:nakis:sirt']);
  assert.ok(jobs.every(job=>job.done&&!job.error));
});

test('retry reconciles an application measured after its initial registration failed',async()=>{
  const application={id:42,kind:'baski',position:'gogus',measure_source:'{"desenDosyaId":7}'},job={versionId:3,lineId:11,kind:'desen_kaynak',uploaded:{id:7},error:'İlk uygulama kaydı başarısız'};
  ui.reconcileJobs([job],{id:3,lines:[{id:11,applications:[application]}]});
  let uploads=0,applications=0;
  assert.deepEqual(await ui.uploadJobs([job],()=>{uploads++;},()=>{applications++;}),[]);
  assert.equal(job.application,application);assert.equal(uploads,0);assert.equal(applications,0);assert.equal(job.done,true);
  const other={...job,application:undefined};ui.reconcileJobs([other],{id:4,lines:[{id:11,applications:[application]}]});assert.equal(other.application,undefined);
});

function boxHarness(natural={w:700,h:1000},dimensions=ui.designRatio(140,60,'test')){
  const node=()=>({value:'',style:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},fire(type,values={}){this.listeners[type]?.({preventDefault(){},...values});}});
  const overlay=node(),width=node(),height=node();width.value='20';overlay.style={left:'30%',top:'30%'};overlay.setPointerCapture=()=>{};
  const stage={getBoundingClientRect:()=>({left:10,top:20,width:350,height:500})};
  overlay.getBoundingClientRect=()=>({left:10+parseFloat(overlay.style.left)*3.5,top:20+parseFloat(overlay.style.top)*5,width:parseFloat(overlay.style.width)*3.5,height:parseFloat(overlay.style.height)*5});
  const binding=ui.bindDesignBox(overlay,stage,width,height,()=>natural,()=>dimensions);binding.apply();
  return {overlay,width,height,binding,setRatio(value){dimensions=value;},pixels(){return ui.pixelBox({x:parseFloat(overlay.style.left)*3.5,y:parseFloat(overlay.style.top)*5,w:parseFloat(overlay.style.width)*3.5,h:parseFloat(overlay.style.height)*5},{w:350,h:500},natural);}};
}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
test('pointer resize changes only width and preserves a 140:60 design on a portrait product',()=>{
  const h=boxHarness(),o=h.overlay;close(h.pixels().w,140);close(h.pixels().h,60);
  o.fire('pointerdown',{pointerId:1,clientX:100,clientY:100,target:{classList:{contains:()=>true}}});
  o.fire('pointermove',{pointerId:2,clientX:200,clientY:300});close(h.pixels().w,140);
  o.fire('pointermove',{pointerId:1,clientX:135,clientY:400});close(h.pixels().w,210);close(h.pixels().h,90);
  o.fire('pointerup');o.fire('pointermove',{pointerId:1,clientX:200,clientY:400});close(h.pixels().w,210);
});
test('pointer move clamps inside the product without changing the artwork dimensions',()=>{
  const h=boxHarness(),o=h.overlay;
  o.fire('pointerdown',{pointerId:1,clientX:100,clientY:100,target:{classList:{contains:()=>false}}});
  o.fire('pointermove',{pointerId:1,clientX:10000,clientY:-10000});
  close(parseFloat(o.style.left),80);close(parseFloat(o.style.top),0);close(h.pixels().w,140);close(h.pixels().h,60);
});
test('all Shift arrows resize width with locked height; ordinary arrows only move',()=>{
  const h=boxHarness(),o=h.overlay;
  for(const key of ['ArrowRight','ArrowDown'])o.fire('keydown',{key,shiftKey:true});close(h.pixels().w,154);close(h.pixels().h,66);
  for(const key of ['ArrowLeft','ArrowUp'])o.fire('keydown',{key,shiftKey:true});close(h.pixels().w,140);close(h.pixels().h,60);
  o.fire('keydown',{key:'ArrowRight'});o.fire('keydown',{key:'ArrowDown'});close(parseFloat(o.style.left),31);close(parseFloat(o.style.top),31);close(h.pixels().h,60);
});
test('width number input derives height, preserves commas and fits tall designs without ratio drift',()=>{
  const h=boxHarness();h.width.value='40,5';h.width.fire('input');close(h.pixels().w,283.5);close(h.pixels().h,121.5);
  h.setRatio(ui.designRatio(10,100,'tall'));h.width.value='100';h.width.fire('input');close(h.pixels().h,1000);close(h.pixels().w,100);
  h.width.value='bad';const before=h.overlay.style.width;h.width.fire('input');assert.equal(h.overlay.style.width,before);
  h.setRatio(null);h.width.value='50';assert.equal(h.binding.apply(),false);assert.equal(h.overlay.style.width,before);
});
test('alpha bounds ignore transparent margins while preserving opaque white artwork',()=>{
  const pixels=new Uint8ClampedArray(200*100*4);
  for(let y=20;y<80;y++)for(let x=30;x<170;x++){const i=(y*200+x)*4;pixels.set([255,255,255,255],i);}
  assert.deepEqual(ui.contentBounds(200,100,pixels),{x:30,y:20,w:140,h:60});
  assert.equal(ui.contentBounds(200,100,pixels,true),null);assert.equal(ui.contentBounds(2,2,new Uint8Array(16)),null);
  assert.throws(()=>ui.contentBounds(2,2,new Uint8Array(4)),RangeError);
});
test('ratio loading uses decoded raster dimensions and PDF content before server bounds',async()=>{
  const raster=ui.designRatio(140,60,'naturalWidth/Height'),pdf=ui.designRatio(280,120,'PDF first page');
  assert.equal(await ui.readDesignAsset(new Blob(['png'],{type:'image/png'}),{decode:async()=>raster,pdf:()=>assert.fail('PDF parser used on PNG')}),raster);
  assert.equal(await ui.readDesignAsset(new Blob(['%PDF-'],{type:'application/octet-stream'}),{decode:()=>assert.fail('raster parser used on PDF'),pdf:async()=>pdf,report:{report:{sourceBounds:{w:1,h:1}}}}),pdf);
  const fallback=await ui.readDesignAsset(new Blob(['%PDF-'],{type:'application/pdf'}),{pdf:async()=>{throw Error('unavailable');},report:{report_json:'{"sourceBounds":{"w":140,"h":60}}'}});
  close(fallback.ratio,140/60);assert.equal(fallback.source,'Sunucu vektör raporu');
});
test('missing, invalid and target-only PDF reports require explicit confirmation without a guessed ratio',async()=>{
  for(const report of [undefined,{report_json:'bad'},{report:{sourceBounds:{w:0,h:60}}},{report:{width:140,height:60,targetMm:{w:140,h:60}}}]){
    await assert.rejects(ui.readDesignAsset(new Blob(['%PDF-'],{type:'application/pdf'}),{pdf:async()=>{throw Error('broken PDF');},report}),/Oran bilinmiyor.*teyit/);
  }
  for(const [w,h] of [[0,60],[140,NaN],[Infinity,60],[-1,2]])assert.throws(()=>ui.designRatio(w,h,'invalid'),RangeError);
});

test('G25 vector badges follow the server status and only ready or confirm-needed vectors download',()=>{
  assert.deepEqual(ui.vectorBadge({status:'hazirlaniyor'}),{label:'Vektör hazırlanıyor…',tone:'warn',downloadable:false});
  assert.deepEqual(ui.vectorBadge({status:'hazir',previewFileId:7}),{label:'Vektörel PDF hazır',tone:'good',downloadable:true});
  assert.deepEqual(ui.vectorBadge({status:'teyit',previewFileId:8}),{label:'Kalite teyidi gerekli',tone:'warn',downloadable:true});
  assert.equal(ui.vectorBadge({status:'hata'}).downloadable,false);
  assert.equal(ui.vectorBadge(undefined),null);
});
test('G25 vector polling stops when nothing is preparing and offers refresh after two minutes',()=>{
  const rows=[{status:'hazirlaniyor'},{status:'hazir'}];
  assert.equal(ui.vectorPollNext(rows,5000),'bekle');
  assert.equal(ui.vectorPollNext(rows,120000),'yenile');
  assert.equal(ui.vectorPollNext([{status:'hazir'}],1000),'dur');
  assert.equal(ui.vectorPollNext([],0),'dur');
});
test('G25 automatic measurement summary shows size, reference size and confidence',()=>{
  const app={kind:'baski',position:'gogus',width_mm:284,height_mm:121,measure_source:JSON.stringify({method:'otomatik',refBeden:'L',confidence:0.92})};
  assert.equal(ui.measureSummary(app),'Otomatik ölçü: 28,4 × 12,1 cm · L bedene göre · güven %92');
  assert.equal(ui.measureSummary({...app,measure_source:{method:'elle'}}),'Elle ölçü: 28,4 × 12,1 cm');
  assert.equal(ui.measureSummary({...app,width_mm:null}),null);
  assert.equal(ui.measureSummary({...app,measure_source:'not json'}),'Ölçü: 28,4 × 12,1 cm');
});
test('G25 measurement gap names the missing input before offering automatic measurement',()=>{
  const app={width_mm:null,height_mm:null};
  assert.equal(ui.measureGap({},{},[{kind:'desen_kaynak'}],app).text,'Ön görsel eksik');
  assert.equal(ui.measureGap({},{},[{kind:'urun_gorsel'}],app).text,'Desen eksik');
  assert.equal(ui.measureGap({},{},[{kind:'urun_gorsel'},{kind:'desen_kaynak'}],app).code,'olculebilir');
  assert.equal(ui.measureGap({},{},[],{width_mm:10,height_mm:10}),null);
});
test('G25 unmeasured applications read "Ölçü bekleniyor" and confirmation is stated',()=>{
  assert.equal(ui.applicationLabel({kind:'baski',position:'sirt',width_mm:null,height_mm:null}),'Baskı · Sırt: Ölçü bekleniyor');
  assert.equal(ui.applicationLabel({kind:'baski',position:'sirt',width_mm:null,height_mm:null,needs_confirmation:1}),'Baskı · Sırt: teyit gerekli');
  assert.equal(ui.applicationLabel({kind:'baski',position:'sirt',width_mm:100,height_mm:50,needs_confirmation:1}),'Baskı · Sırt: 10 × 5 cm · teyit gerekli');
});

test('G28 color-only automatic measurements preserve cm, reference and fractional confidence',()=>{
  const app={width_mm:240,height_mm:100,measure_source:{method:'otomatik_renk',refBeden:'L',confidence:.87}};
  assert.equal(ui.measureSummary(app),'Otomatik ölçü: 24 × 10 cm · desen dosyası olmadan, görseldeki renkten · L bedene göre · güven %87');
});
test('G28 snapshot measurement source reconciles retries before the legacy link',async()=>{
  const application={id:9,measure_source:JSON.stringify({desenFileId:22,desenDosyaId:23})};
  assert.equal(ui.designApplication({applications:[application]},22),application);
  assert.equal(ui.designApplication({applications:[application]},23),undefined);
  const job={versionId:3,lineId:11,kind:'desen_kaynak',uploaded:{id:22}};
  ui.reconcileJobs([job],{id:3,lines:[{id:11,applications:[application]}]});
  let calls=0;await ui.uploadJobs([job],()=>{calls++;},()=>{calls++;});
  assert.equal(calls,0);assert.equal(job.application,application);assert.equal(job.done,true);
});
test('G28 quality waiting is neutral and independent of a downloadable ready vector',()=>{
  const row={status:'hazir',quality:'beklemede',previewFileId:7};
  assert.deepEqual(ui.vectorQuality(row),{label:'Kalite ölçüden sonra değerlendirilecek',tone:''});
  assert.equal(ui.vectorBadge(row).downloadable,true);
  assert.equal(ui.vectorQuality({quality:'iyi'}).tone,'good');
  assert.equal(ui.vectorQuality({quality:'teyit'}).tone,'warn');
});
test('G28 measurement and vector reasons read arrays, text and confirmation report messages',()=>{
  assert.equal(ui.reasonText(['Göğüs referansı eksik.','Ölçüyü teyit edin.']),'Göğüs referansı eksik. Ölçüyü teyit edin.');
  assert.equal(ui.reasonText('Ölçüyü teyit edin.'),'Ölçüyü teyit edin.');
  assert.equal(ui.reasonText('Vektör teyidi: {"reasons":[]}'),'Vektör teyidi');
  assert.equal(ui.reasonText('Vektör kalitesi görsel teyit gerektiriyor: {"quality":"teyit","reasons":["Detay kaybı var."]}'),'Detay kaybı var.');
});

test('G32 source links precede both legacy measurement provenance fields',()=>{
  const application={desenDosyaId:7,measure_source:'{"flatId":null}'};
  assert.equal(ui.designApplication({applications:[application]},7),application);
  const conflicting={...application,measure_source:{desenFileId:8,desenDosyaId:9}};
  assert.equal(ui.designApplication({applications:[conflicting]},7),conflicting);
  assert.equal(ui.designApplication({applications:[conflicting]},8),undefined);
  assert.equal(ui.designApplication({applications:[{...conflicting,desenDosyaId:null}]},8).measure_source.desenFileId,8);
});

function measurementCardHarness(responses=[]) {
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};}
    append(...children){this.children.push(...children);}
    setAttribute(){}
    addEventListener(event,handler){this[event]=handler;}
    get textContent(){return this.children.map(child=>child.textContent ?? child).join('');}
  }
  const root=new Element('root');
  const context={Node:Element,document:{getElementById:()=>root,createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})},sessionStorage:{getItem:()=>null,removeItem(){}},location:{search:''},URL,URLSearchParams,FormData:class{append(){}},fetch:async()=>({ok:true,json:async()=>responses.shift()})};
  const source=fs.readFileSync(path.join(__dirname,'../assets/uretim.js'),'utf8').replace("  renderFrame();if(session)run(async()=>{await loadCommon();await renderTab();});",'  global.testCards={autoMeasureBlock,sendJobs,state};').replace("  window.addEventListener('pagehide'", "  global.addEventListener('pagehide'");
  context.addEventListener=()=>{};
  require('node:vm').runInNewContext(source,context);
  return context.testCards;
}

test('G32 confirmation requires both dimensions and keeps manual correction available',()=>{
  const harness=measurementCardHarness();
  for(const [width_mm,height_mm] of [[null,null],[100,null],[null,100],[100,50]]){
    const manual={open:false},card=harness.autoMeasureBlock({id:1},{applications:[{id:2,kind:'baski',needs_confirmation:1,width_mm,height_mm}]},[],manual);
    assert.equal(card.textContent.includes('Ölçüyü onayla'),width_mm!=null&&height_mm!=null);
    assert.match(card.textContent,/Elle düzelt/);
  }
});

test('G32 upload and application measurement failures finish successfully and survive snapshot refresh',async()=>{
  for(const stage of ['upload','application']){
    const warning='Referans bulunamadı',application={id:4,desenDosyaId:7,kind:'baski',position:'gogus',needs_confirmation:1,width_mm:null,height_mm:null};
    const harness=measurementCardHarness([{id:7,...(stage==='upload'?{olcuHatasi:warning}:{})},{...application,...(stage==='application'?{olcuHatasi:warning}:{})}]);
    const job={versionId:1,lineId:2,kind:'desen_kaynak',file:{name:'logo.pdf'},applicationKind:'baski',position:'gogus'};
    assert.equal((await harness.sendJobs([job])).length,0);
    assert.equal(job.done,true);assert.equal(job.error,'');assert.equal(harness.state.pending.length,0);
    const manual={open:false},card=harness.autoMeasureBlock({id:1},{applications:[application]},[{id:7,kind:'desen_kaynak'}],manual);
    assert.equal(card.textContent,'Baskı · GöğüsOtomatik ölçü yapılamadı: '+warning+' · Elle düzelt');
    const action=card.children[0].children[1].children[1];
    await action.click();assert.equal(manual.open,true);
    assert.doesNotMatch(card.textContent,/Ölçüyü onayla|Yeniden yükle/);
  }
});

test('G32 snapshot measurement warnings stay on the matching application',()=>{
  const files=[{id:7,kind:'desen_kaynak'},{id:8,kind:'desen_kaynak'}],metadata={7:{olcuHatasi:'Ölçü yok'}};
  assert.equal(ui.measurementWarning({desenDosyaId:7},files,metadata),'Ölçü yok');
  assert.equal(ui.measurementWarning({desenDosyaId:8},files,metadata),undefined);
  assert.equal(ui.measurementWarning({olcuHatasi:'Sunucu uyarısı'},[],{}),'Sunucu uyarısı');
});

// G34: kartela grid, picking, fallback and grouped fabric options (invented data).
const KARTELA={surum:1,kartelalar:[
  {id:'test_a',ad:'Deneme Süprem',not:'Deneme notu',kumaslar:[{tur:'deneme_suprem',ad:'Deneme Süprem'}],renkler:[
    {no:1,renk:'Kırmızı',renkKey:'kirmizi',hex:'#A80010'},{no:2,renk:'Beyaz',renkKey:'beyaz',hex:'#FFFFFF'},
    {no:3,renk:'Gri Melanj',renkKey:'gri_melanj',hex:'#C8C8C8',dokulu:true},{no:4,renk:'Mavi',renkKey:'mavi',hex:'#00388C',teyit:'Renk adı teyit bekliyor'}]},
  {id:'test_b',ad:'Deneme Polar',kumaslar:[{tur:'deneme_polar',ad:'Deneme Polar'}],renkler:[{no:14,renk:'Lacivert',renkKey:'lacivert',hex:'#101040'}]}]};

function kartelaHarness({kartela=KARTELA,kalemler=null,stocks=[]}={}) {
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.listeners={};}
    append(...c){this.children.push(...c);}
    replaceChildren(...c){this.children=c;}
    setAttribute(k,v){this.attrs[k]=String(v);}
    hasAttribute(k){return k in this.attrs;}
    addEventListener(e,h){this.listeners[e]=h;}
    get textContent(){return this.children.map(c=>c.textContent ?? c).join('');}
    find(pred,out=[]){if(pred(this))out.push(this);for(const c of this.children)if(c instanceof Element)c.find(pred,out);return out;}
  }
  const root=new Element('root'),calls=[];
  const context={Node:Element,console:{info(){}},document:{getElementById:()=>root,createElement:t=>new Element(t),createTextNode:t=>({textContent:t})},sessionStorage:{getItem:()=>null,removeItem(){}},location:{search:''},URL,URLSearchParams,FormData:class{append(){}},
    fetch:async(url,init)=>{
      calls.push({url:String(url),method:init.method,body:init.body?JSON.parse(init.body):undefined});
      if(String(url).endsWith('/kartela'))return kartela?{ok:true,status:200,json:async()=>kartela}:{ok:false,status:404,json:async()=>({})};
      if(String(url).endsWith('/stok/kalemler'))return {ok:true,status:200,json:async()=>kalemler};
      return {ok:true,status:200,json:async()=>stocks};
    }};
  const source=fs.readFileSync(path.join(__dirname,'../assets/uretim.js'),'utf8').replace("  renderFrame();if(session)run(async()=>{await loadCommon();await renderTab();});",'  global.k={kartelaGrid,stockOptions,swatch,loadKartela,state};').replace("  window.addEventListener('pagehide'","  global.addEventListener('pagehide'");
  context.addEventListener=()=>{};
  require('node:vm').runInNewContext(source,context);
  return {...context.k,calls,root};
}

test('kartela grid draws one accessible button per colour with white outline, melange and confirm hints',()=>{
  const h=kartelaHarness();
  const grid=h.kartelaGrid(KARTELA.kartelalar[0],async()=>{});
  const cells=grid.find(n=>n.tag==='button');
  assert.equal(cells.length,4);
  assert.deepEqual(cells.map(c=>c.attrs['aria-label']),['1 Kırmızı','2 Beyaz','3 Gri Melanj, melanj','4 Mavi, teyit gerekli']);
  const circles=grid.find(n=>/p-kd( |$)/.test(n.className ?? ''));
  assert.equal(circles.length,4);
  assert.match(circles[1].className,/light/);assert.doesNotMatch(circles[0].className,/light/);
  assert.match(circles[2].className,/dokulu/);
  assert.equal(grid.find(n=>/p-kd-warn/.test(n.className ?? '')).length,1);
  assert.match(circles[0].attrs.style,/background-color:#A80010/);
});
test('clicking a colour sends tur and kartelaNo; mevcut answer is passed through',async()=>{
  const h=kartelaHarness({kalemler:{id:7,mevcut:true}});
  const seen=[];
  const grid=h.kartelaGrid(KARTELA.kartelalar[1],async c=>{seen.push(c.no);});
  grid.find(n=>n.tag==='button')[0].listeners.click();
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(seen,[14]);
});
test('ledger source posts { tur, kartelaNo, unit } and reports an existing item',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../assets/uretim.js'),'utf8');
  assert.match(js,/api\('stok\/kalemler',\{tur:f\.tur,kartelaNo:c\.no,unit:'kg'\}\)/);
  assert.match(js,/r\?\.mevcut/);assert.match(js,/Bu kalem zaten var/);
});
test('missing kartela endpoint falls back silently to the free colour field',async()=>{
  const h=kartelaHarness({kartela:null});
  await h.loadKartela();
  assert.equal(h.state.kartela,null);
  assert.deepEqual(ui.kartelaFabrics(h.state.kartela),[]);
});
test('loaded kartela lists fabrics by kartela name',async()=>{
  const h=kartelaHarness();
  await h.loadKartela();
  assert.deepEqual(ui.kartelaFabrics(h.state.kartela).map(f=>[f.tur,f.ad]),[['deneme_suprem','Deneme Süprem'],['deneme_polar','Deneme Polar']]);
});
test('order line fabric select groups items by fabric with server names and a kartela caption',()=>{
  const h=kartelaHarness();
  h.state.stocks=[
    {id:1,name:'Deneme Süprem 14 Lacivert',available:12.5,color_no:14,color_hex:'#101040',kartela:{id:'test_a',ad:'Deneme Süprem',no:14}},
    {id:2,name:'Deneme Süprem 2 Beyaz',available:3,color_no:2,kartela:{id:'test_a',ad:'Deneme Süprem',no:2}},
    {id:3,fabric_key:'serbest',name:'Serbest Kumaş',color_name:'Mor',available:1}];
  const select=h.stockOptions(1);
  const groups=select.find(n=>n.tag==='optgroup');
  assert.deepEqual(groups.map(g=>g.attrs.label),['Deneme Süprem','Diğer kumaşlar']);
  const opts=select.find(n=>n.tag==='option');
  assert.equal(opts[1].textContent,'Deneme Süprem 14 Lacivert (12,5 kg)');
  assert.equal(opts[3].textContent,'Serbest Kumaş / Mor (1 kg)');
  assert.equal(ui.kartelaCaption(h.state.stocks[0]),'Kartela No 14');assert.equal(ui.kartelaCaption(h.state.stocks[2]),'');
});
test('hex values are validated before use and light colours are detected',()=>{
  assert.equal(ui.safeHex('red;background:url(x)'),null);assert.equal(ui.safeHex('A80010'),'#A80010');
  assert.equal(ui.hexLight('#FFFFFF'),true);assert.equal(ui.hexLight('#101040'),false);assert.equal(ui.hexLight(null),false);
});
