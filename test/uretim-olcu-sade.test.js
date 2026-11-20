'use strict';
// G39: inline size editor, folded upload form and stated vector states. Invented data only.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ui=require('../assets/uretim.js');
const SOURCE=fs.readFileSync(path.join(__dirname,'../assets/uretim.js'),'utf8');
const ENDPOINT='https://erci-materials-api.onrender.com';

function harness({responses={}}={}) {
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.listeners={};this.style={};this.hidden=false;
      const set=new Set();this.classList={add:c=>set.add(c),contains:c=>set.has(c)};}
    get type(){return this.attrs.type;}
    get value(){
      if(this.tag==='select'&&this._value===undefined){const option=this.children.find(c=>c.selected)||this.children[0];return option?.value ?? '';}
      return this._value ?? '';
    }
    set value(v){this._value=v;}
    append(...children){for(const c of children){this.children.push(c);if(c instanceof Element)c.parent=this;}}
    replaceChildren(...children){this.children=[];this._text=undefined;this.append(...children);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
    setAttribute(k,v){this.attrs[k]=String(v);}
    getAttribute(k){return this.attrs[k] ?? null;}
    hasAttribute(k){return k in this.attrs;}
    setCustomValidity(message){this.validity={valid:!message};}
    reportValidity(){}
    addEventListener(event,handler){(this.listeners[event] ||= []).push(handler);}
    async fire(event,extra={}){for(const h of this.listeners[event] || [])await h({target:this,preventDefault(){},...extra});}
    click(){return this.fire('click');}
    find(pred,out=[]){if(pred(this))out.push(this);for(const c of this.children)if(c instanceof Element)c.find(pred,out);return out;}
    querySelectorAll(sel){return sel==='[data-number]'?this.find(e=>'data-number' in e.attrs):[];}
    querySelector(sel){return sel==='[type=submit]'?this.find(e=>e.attrs.type==='submit')[0] || null:null;}
    get textContent(){return this._text ?? this.children.map(c=>c.textContent ?? c).join('');}
    set textContent(v){this._text=String(v);}
  }
  class FormData {constructor(){this.entries=[];}append(k,v){this.entries.push([k,v]);}}
  const calls=[],root=new Element('root'),png=Uint8Array.from(Buffer.from('89504e470d0a1a0a0000000049454e4400000000','hex')).buffer;
  const images=[];
  const createElement=tag=>{const node=new Element(tag);if(tag==='img')images.push(node);return node;};
  const URLShim=Object.assign(function(value){return new URL(value);},{createObjectURL:()=>'blob:test',revokeObjectURL(){}});
  const context={Node:Element,console,setTimeout,clearTimeout,
    document:{getElementById:()=>root,createElement,createTextNode:text=>({textContent:text}),querySelectorAll:()=>[]},
    sessionStorage:{getItem:()=>JSON.stringify({token:'t',user:{name:'Deneme Kişi'},endpoint:ENDPOINT}),removeItem(){},setItem(){}},
    location:{search:''},URL:URLShim,URLSearchParams,FormData,
    fetch:async(url,init)=>{
      const route=String(url).replace(ENDPOINT+'/api/siparis/','');
      calls.push({route,method:init.method,body:init.body instanceof FormData?init.body:init.body?JSON.parse(init.body):undefined});
      const data=responses[route] ?? {};
      if(data instanceof Error)throw data;
      return {ok:true,status:200,json:async()=>data,blob:async()=>({type:'image/png',arrayBuffer:async()=>png})};
    }};
  context.addEventListener=()=>{};
  const source=SOURCE.replace("  renderFrame();if(session)run(async()=>{await loadCommon();await renderTab();});",
    '  global.k={manualEditor,uploadForm,applicationForm,renderFiles,autoMeasureBlock,patternSelector,state,setRefresh:fn=>{refreshInPlace=fn;}};')
    .replace("  window.addEventListener('pagehide'","  global.addEventListener('pagehide'");
  vm.runInNewContext(source,context);
  const refreshed=[];context.k.setRefresh(async v=>{refreshed.push(v.id);});
  return {...context.k,calls,refreshed,Element,images};
}
const byName=(root,name)=>root.find(e=>(e.attrs.name ?? e.name)===name)[0];
const byText=(root,tag,text)=>root.find(e=>e.tag===tag&&e.textContent===text)[0];
const VERSION={id:5,status:'taslak',lines:[],files:[]};
const LINE={id:11,product_key:'sweat',applications:[]};

test('G39 ratio lock: width or height drives the other, off when unchecked, absent when the ratio is unknown',async()=>{
  assert.deepEqual(ui.lockedSize('width','30',2),{width:30,height:15});
  assert.deepEqual(ui.lockedSize('height','12,5',1.6),{width:20,height:12.5});
  assert.equal(ui.lockedSize('width','',2),null);assert.equal(ui.lockedSize('width','10',null),null);assert.equal(ui.lockedSize('width','0',2),null);
  // Automatic measurement ratio first, then the vector record's content box.
  assert.equal(ui.designAspect({measure_source:{designAspectRatio:2}},{designBox:{w:100,h:100}}),2);
  assert.equal(ui.designAspect({measure_source:'{}'},{designBox:{w:160,h:90}}),160/90);
  assert.equal(ui.designAspect({measure_source:'{}'},{designBox:{w:0,h:90}}),null);

  const h=harness(),app={id:3,kind:'baski',position:'sirt',width_mm:null,height_mm:null,measure_source:JSON.stringify({designAspectRatio:2})};
  const editor=h.manualEditor(VERSION,LINE,app,[],()=>{});
  const width=byName(editor,'manual_w'),height=byName(editor,'manual_h'),lock=byName(editor,'manual_lock');
  assert.equal(lock.checked,true);assert.match(editor.textContent,/Oranı koru \(desen 2 : 1\)/);
  width.value='30';await width.fire('input');assert.equal(height.value,'15');
  height.value='10';await height.fire('input');assert.equal(width.value,'20');
  lock.checked=false;width.value='44';await width.fire('input');assert.equal(height.value,'10');

  const unknown=h.manualEditor(VERSION,LINE,{...app,measure_source:'{}'},[],()=>{});
  assert.equal(byName(unknown,'manual_lock'),undefined);assert.match(unknown.textContent,/Desen oranı bilinmiyor; en ve boyu ayrı girin\./);
  const w2=byName(unknown,'manual_w'),h2=byName(unknown,'manual_h');h2.value='7';w2.value='30';await w2.fire('input');assert.equal(h2.value,'7');
});

test('G39 Kaydet sends integer millimetres with elleTeyit and refreshes in place; invalid sizes send nothing',async()=>{
  assert.deepEqual(ui.manualSaveBody('28,4','12'),{width_mm:284,height_mm:120,elleTeyit:true});
  for(const [w,h] of [['','12'],['0','12'],['28,45','12'],['abc','1']])assert.throws(()=>ui.manualSaveBody(w,h),RangeError);

  const h=harness(),app={id:3,kind:'nakis',position:'gogus',width_mm:90,height_mm:45,measure_source:'{}'};
  let closed=false;const editor=h.manualEditor(VERSION,LINE,app,[],()=>{closed=true;});
  assert.equal(byName(editor,'manual_w').value,'9');assert.equal(byName(editor,'manual_h').value,'4,5');
  byName(editor,'manual_w').value='0';
  await byText(editor,'button','Kaydet').click();
  assert.equal(h.calls.length,0);assert.match(editor.textContent,/0,1 veya daha büyük/);
  byName(editor,'manual_w').value='10,2';byName(editor,'manual_h').value='5';
  await byText(editor,'button','Kaydet').click();
  assert.deepEqual(h.calls,[{route:'uygulamalar/3',method:'PATCH',body:{width_mm:102,height_mm:50,elleTeyit:true}}]);
  assert.deepEqual(h.refreshed,[5]);
  await byText(editor,'button','Vazgeç').click();assert.equal(closed,true);
});

test('G40 product annotations are grouped by the current raster and reject stale or invalid sources',()=>{
  const files=[{id:21,kind:'urun_gorsel',gorunum:'on',path:'/x/front.png'},{id:22,kind:'urun_gorsel',gorunum:'arka',path:'/x/back.pdf'}];
  const source={gorselFileId:21,selectedView:'on',designBoxPx:{x:100,y:50,w:200,h:100},rasterWidth:1000,rasterHeight:500,flatId:8,desenFileId:12};
  const app={id:3,kind:'baski',position:'gogus',desenDosyaId:12,width_mm:400,height_mm:200,measure_source:source};
  const shot={fileId:21,left:10,top:10,width:20,height:20,confirmed:true,rasterWidth:1000,rasterHeight:500};
  assert.deepEqual(ui.previewBox(app,files,{kalipId:8}),shot);
  const candidate={...app,id:4,kind:'nakis',needs_confirmation:1,measure_source:{...source,designBoxPx:null,candidateBoxPx:source.designBoxPx}};
  assert.equal(ui.placementMarks({applications:[app,candidate]},files).get(21).length,2);
  assert.equal(ui.previewBox(candidate,files).confirmed,false);
  const manualCandidate={...candidate,needs_confirmation:0,measure_source:{...candidate.measure_source,method:'elle'}};
  assert.equal(ui.placementMarks({applications:[manualCandidate]},files).get(21)[0].width,null);
  assert.equal(ui.previewBox({...app,measure_source:{...source,gorselFileId:22}},files),null);
  assert.equal(ui.previewBox({...app,measure_source:{...source,designBoxPx:null}},files),null);
  assert.equal(ui.previewBox({...app,measure_source:{...source,rasterWidth:0}},files),null);
  assert.equal(ui.previewBox({...app,measure_source:{...source,designBoxPx:{...source.designBoxPx,x:-1}}},files),null);
  assert.equal(ui.previewBox({...app,measure_source:{...source,designBoxPx:{...source.designBoxPx,x:900}}},files),null);
  assert.equal(ui.previewBox({...app,measure_source:{designBoxPx:source.designBoxPx}},files),null);
  assert.equal(ui.previewBox({...app,desenDosyaId:99},files),null);
  assert.equal(ui.previewBox(app,files,{kalipId:9}),null);
  assert.equal(ui.previewBox(app,[...files,{...files[0],id:23}]),null);
  assert.equal(ui.previewBox(app,files,{}, {21:{olcuHatasi:'Görsele ulaşılamadı'}}),null);
});

test('G40 inline size changes update labels while the found box stays fixed',async()=>{
  const files=[{id:21,kind:'urun_gorsel',path:'/x/front.png'}];
  const source={gorselFileId:21,designBoxPx:{x:100,y:50,w:200,h:100},rasterWidth:1000,rasterHeight:500};
  const app={id:3,kind:'baski',position:'gogus',width_mm:400,height_mm:200,measure_source:source};
  const h=harness(),editor=h.manualEditor(VERSION,LINE,app,files,()=>{});
  assert.equal(editor.find(e=>e.tag==='figure').length,0);
  await new Promise(setImmediate);
  assert.deepEqual(h.calls.map(c=>c.route),['dosyalar/21']);
  Object.assign(h.images[0],{naturalWidth:1000,naturalHeight:500});
  await h.images[0].fire('load');
  const box=editor.find(e=>e.className==='p-placement')[0];
  assert.equal(box.attrs.style,'--x:10%;--y:10%;--w:20%;--h:20%');
  assert.equal(box.attrs['aria-label'],'Baskı · Göğüs · En 40 cm · Boy 20 cm');
  const width=byName(editor,'manual_w');width.value='20';await width.fire('input');
  const height=byName(editor,'manual_h');height.value='10';await height.fire('input');
  assert.equal(box.attrs.style,'--x:10%;--y:10%;--w:20%;--h:20%');
  assert.equal(box.attrs['aria-label'],'Baskı · Göğüs · En 20 cm · Boy 10 cm');

  for(const h2 of [harness(),harness({responses:{'dosyalar/21':Error('Dosya yüklenemedi')}})]){
    const bad=h2.manualEditor(VERSION,LINE,app,files,()=>{});
    await new Promise(setImmediate);
    if(h2.images[0]){
      Object.assign(h2.images[0],{naturalWidth:500,naturalHeight:1000});
      await h2.images[0].fire('load');
    }
    assert.equal(bad.find(e=>e.tag==='figure').length,0);
  }
  const bare=h.manualEditor(VERSION,LINE,{...app,measure_source:'{}'},files,()=>{});
  assert.equal(bare.find(e=>e.tag==='figure').length,0);
});

test('G40 rotated or ambiguous image containers do not get marks',()=>{
  const inspect=hex=>ui.orientationIsSafe(Uint8Array.from(Buffer.from(hex,'hex')).buffer);
  assert.equal(inspect('89504e470d0a1a0a0000000049454e4400000000'),true);
  assert.equal(inspect('89504e470d0a1a0a000000006558496600000000'),false);
  assert.equal(inspect('89504e470d0a1a0a000000006163544c00000000'),false);
  assert.equal(inspect('ffd8ffe00002ffda0002ff00ffd9'),true);
  assert.equal(inspect('ffd8ffe10002ffda0002ff00ffd9'),false);
  assert.equal(inspect('255044462d312e34'),false);
});

test('G40 applications can be added without a design file',async()=>{
  const h=harness(),host=h.applicationForm(VERSION,LINE);
  const form=host.find(e=>e.tag==='form')[0];
  assert.equal(form.hidden,true);
  await byText(host,'button','Dosyasız uygulama ekle').click();
  assert.equal(form.hidden,false);
  const [kind,position]=form.find(e=>e.tag==='select');
  kind.value='nakis';position.value='sirt';
  await form.fire('submit');
  assert.deepEqual(h.calls,[{route:'satirlar/11/uygulamalar',method:'POST',body:{kind:'nakis',position:'sirt',needs_confirmation:1}}]);
  assert.deepEqual(h.refreshed,[5]);
});

test('G39 upload form folds behind Dosya ekle and shows only the fields of the chosen type',async()=>{
  assert.deepEqual(ui.uploadFields('urun_gorsel'),['gorunum']);assert.deepEqual(ui.uploadFields('desen_kaynak'),['applicationKind','position']);
  const h=harness(),form=h.uploadForm(VERSION,LINE);
  const toggle=byText(form,'button','Dosya ekle'),inner=form.find(e=>e.tag==='form')[0];
  assert.equal(inner.hidden,true);assert.equal(toggle.attrs['aria-expanded'],'false');
  await toggle.click();assert.equal(inner.hidden,false);assert.equal(toggle.attrs['aria-expanded'],'true');
  const holder=name=>form.find(e=>e.tag==='label'&&e.children.some(c=>(c.attrs?.name ?? c.name)===name))[0];
  const visible=()=>['gorunum','applicationKind','position'].filter(name=>!holder(name).hidden);
  assert.deepEqual(visible(),['gorunum']);
  assert.deepEqual(byName(form,'gorunum').children.map(o=>o.textContent),['Ön','Arka','Kol']);
  byName(form,'kind').value='desen_kaynak';await byName(form,'kind').fire('change');
  assert.deepEqual(visible(),['applicationKind','position']);
  byName(form,'kind').value='urun_gorsel';await byName(form,'kind').fire('change');
  assert.deepEqual(visible(),['gorunum']);
});

test('G39 the upload form is prefilled from the file name and the line applications',async()=>{
  assert.deepEqual(ui.guessUpload('Arka-Görsel.PNG'),{kind:'urun_gorsel',gorunum:'arka'});
  assert.deepEqual(ui.guessUpload('ön.jpg'),{kind:'urun_gorsel',gorunum:'on'});
  assert.deepEqual(ui.guessUpload('kol_mockup.png'),{kind:'urun_gorsel',gorunum:'kol'});
  assert.deepEqual(ui.guessUpload('logo-göğüs-nakış.pdf'),{kind:'desen_kaynak',applicationKind:'nakis',position:'gogus'});
  const apps=[{id:1,kind:'baski',position:'sirt',desenDosyaId:9},{id:2,kind:'nakis',position:'kol',desenDosyaId:null,measure_source:'{}'}];
  assert.deepEqual(ui.guessUpload('desen.pdf',apps),{kind:'desen_kaynak',applicationKind:'nakis',position:'kol'});
  assert.deepEqual(ui.guessUpload('foto.png'),{});
  assert.equal(ui.linkTarget({applications:apps},'nakis','kol').id,2);assert.equal(ui.linkTarget({applications:apps},'baski','sirt'),null);

  const h=harness({responses:{'surumler/5/dosyalar':{id:31,kind:'desen_kaynak'}}}),line={...LINE,applications:apps},form=h.uploadForm(VERSION,line);
  const file=byName(form,'file');file.files=[{name:'logo.pdf'}];await file.fire('change');
  assert.equal(byName(form,'kind').value,'desen_kaynak');assert.equal(byName(form,'applicationKind').value,'nakis');assert.equal(byName(form,'position').value,'kol');
  // The design joins the existing sleeve application instead of creating a duplicate.
  await form.find(e=>e.tag==='form')[0].fire('submit');
  assert.deepEqual(h.calls.map(c=>c.route),['surumler/5/dosyalar']);
  assert.deepEqual(h.calls[0].body.entries.filter(([k])=>k!=='file'),[['kind','desen_kaynak'],['lineId',11],['applicationId',2]]);
  assert.deepEqual(h.refreshed,[5]);
});

test('G39 measurement rows open the editor inline and name a waiting automatic measurement',async()=>{
  const h=harness();
  h.state.confirmations=[{kind:'olcu',ref_table:'applications',ref_id:7,message:'Uygulama ölçüsü teyit edilmeli'},{kind:'olcu',ref_table:'applications',ref_id:8,message:'Kol görünümü için ürün görseli yok: kol konumu ön görselde ölçülür ve bu satırda ön görsel yüklenmedi.'}];
  const line={...LINE,applications:[{id:7,kind:'baski',position:'sirt',needs_confirmation:1,width_mm:null,height_mm:null,measure_source:'{"flatId":null}'},
    {id:8,kind:'nakis',position:'kol',needs_confirmation:1,width_mm:null,height_mm:null,measure_source:'{"flatId":null}'}]};
  assert.deepEqual(ui.unmeasuredApps({lines:[line]}).map(a=>a.id),[7,8]);
  const block=h.autoMeasureBlock(VERSION,line,[]);
  const [waiting,sleeve]=block.children;
  assert.match(waiting.textContent,/Otomatik ölçü henüz çalışmadı\./);assert.doesNotMatch(waiting.textContent,/Uygulama ölçüsü teyit edilmeli/);
  assert.ok(byText(waiting,'button','Otomatik ölç'));
  assert.match(sleeve.textContent,/^Nakış · KolÖlçü teyit gerektiriyor\. Kol görünümü için ürün görseli yok/);
  const slot=sleeve.children.at(-1);assert.equal(slot.children.length,0);
  await byText(sleeve,'button','Elle düzelt').click();
  assert.equal(slot.children.length,1);assert.match(slot.textContent,/^En \(cm\)Boy \(cm\)/);
  await byText(sleeve,'button','Elle düzelt').click();assert.equal(slot.children.length,0);
});

test('G39 vector states are always stated, polling waits for missing rows and reasons are Turkish',()=>{
  assert.equal(ui.vectorBadge({status:'hazir',sourceKind:'vector',previewFileId:1}).label,'Vektörel');
  assert.equal(ui.vectorBadge({status:'hazir',sourceKind:'raster',previewFileId:1}).label,'Vektöre çevrildi');
  assert.equal(ui.vectorBadge({status:'hazir',previewFileId:1},{path:'/x/desen_kaynak-1.png'}).label,'Vektöre çevrildi');
  assert.equal(ui.vectorBadge({status:'hata',message:'Vektörleştirme bu sunucuda yok: Cannot find native binding'}).label,'Vektörleştirme bu sunucuda yok');
  assert.equal(ui.vectorDetail({status:'hata',message:'Vektörleştirme bu sunucuda yok: Cannot find native binding'}),'Cannot find native binding');
  assert.equal(ui.vectorBadge({status:'yok',message:'Sürüm taslak olmadığı için vektör önizlemesi hazırlanmadı.'}).label,'Vektör kaydı yok');
  assert.equal(ui.vectorDetail({status:'teyit',reasons:['metin','raster_detay_ve_metin_gorsel_teyidi']}),'PDF yazı içeriyor; yazılar eğriye çevrilmeli. Görselden çevrildi; ince detay ve yazılar gözle kontrol edilmeli.');
  assert.equal(ui.vectorDetail({status:'teyit',reasons:[]},'Vektör kalitesi görsel teyit gerektiriyor: {"reasons":["Detay kaybı var."]}'),'Detay kaybı var.');
  assert.equal(ui.vectorDetail({status:'hazir',reasons:[]}),'');
  assert.equal(ui.vectorPollNext([{sourceFileId:4,status:'hazir'}],1000,[4,5]),'bekle');
  assert.equal(ui.vectorPollNext([{sourceFileId:4,status:'hazir'},{sourceFileId:5,status:'teyit'}],1000,[4,5]),'dur');
  for(const retired of ['Elle ölçü (yedek yol)','Kütüphane kayıtlarının görsel indirme ucu','Vektör durumu bilinmiyor','Deseni yerleştir','duz-cizimler'])
    assert.equal(SOURCE.includes(retired),false,retired);
});


test('G39b pattern selector only appears for multiple candidates, PATCHes kalipId and refreshes',async()=>{
  const h=harness(),candidates=[{id:'regular',ad:'SWEAT',refBeden:'L'},{id:'over',ad:'OWERSİZE SWEAT',refBeden:'L'}];
  assert.equal(h.patternSelector(VERSION,LINE),null);
  assert.equal(h.patternSelector(VERSION,{...LINE,kalipAdaylari:candidates.slice(0,1)}),null);
  const line={...LINE,kalipId:'regular',kalipAdaylari:candidates};
  const selector=h.patternSelector(VERSION,line),select=byName(selector,'kalipId');
  assert.equal(select.value,'regular');assert.match(selector.textContent,/SWEAT \(L\)/);
  select.value='over';await select.fire('change');
  assert.deepEqual(h.calls,[{route:'satirlar/11',method:'PATCH',body:{kalipId:'over'}}]);
  assert.deepEqual(h.refreshed,[5]);assert.equal(select.disabled,false);
  select.value='';await select.fire('change');assert.equal(h.calls.length,1);
  assert.equal(byName(h.patternSelector({...VERSION,status:'onaylandi'},line),'kalipId').disabled,true);
  assert.equal(byName(h.patternSelector(VERSION,{...line,kalipId:null}),'kalipId').value,'');
});

test('G39b measurement rows show the chosen pattern and server sleeve explanation',()=>{
  const h=harness(),line={...LINE,kalipId:'a',kalipAdaylari:[{id:'a',ad:'SWEAT',refBeden:'L'}]};
  const app={id:3,kind:'nakis',position:'kol',width_mm:100,height_mm:50,measure_source:{flatAd:'OWERSİZE SWEAT',refBeden:'L',summary:'Kol genişliğine göre ölçüldü.',sleeveMethod:'fallback',scaleFrom:'on'}};
  const block=h.autoMeasureBlock(VERSION,{...line,applications:[app]},[]);
  assert.match(block.textContent,/Kalıp: OWERSİZE SWEAT \(L\) · Kol genişliğine göre ölçüldü\./);
  assert.doesNotMatch(block.textContent,/fallback/);
  assert.equal(ui.measureContext({measure_source:{sleeveMethod:'kol',scaleFrom:'ön görünüm'}},line),'Kalıp: SWEAT (L) · Kol ölçümü: kol · Ölçek: ön görünüm');
  assert.equal(ui.measureContext({measure_source:'invalid'}),'');
});


test('G39b a failed pattern change restores the saved selection without refreshing',async()=>{
  const h=harness({responses:{'satirlar/11':new Error('offline')}});
  const line={...LINE,kalipId:'a',kalipAdaylari:[{id:'a',ad:'SWEAT'},{id:'b',ad:'OWERSİZE SWEAT'}]};
  const select=byName(h.patternSelector(VERSION,line),'kalipId');
  select.value='b';await select.fire('change');
  assert.equal(select.value,'a');assert.equal(select.disabled,false);assert.deepEqual(h.refreshed,[]);
});
