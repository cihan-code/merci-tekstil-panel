'use strict';
// G73: next-step mapping, order list ordering, line copy and version picker. Invented data only.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ui=require('../assets/uretim.js');
const SOURCE=fs.readFileSync(path.join(__dirname,'../assets/uretim.js'),'utf8');
const ENDPOINT='https://erci-materials-api.onrender.com';

const app=(over={})=>({id:1,kind:'baski',position:'gogus',width_mm:100,height_mm:100,needs_confirmation:0,...over});
const version=(status,{files=[],apps=[app()],image=true}={})=>({id:7,status,lines:[{id:3,applications:apps}],files:[...(image?[{id:1,kind:'urun_gorsel',line_id:3}]:[]),...files]});

test('taslak: görsel eksik, ölçü bekliyor, formlar hazır ve hazırla adımları',()=>{
  assert.equal(ui.nextStep(version('taslak',{image:false})).code,'gorsel');
  assert.equal(ui.nextStep(version('taslak',{image:false})).target,'order-media');
  assert.equal(ui.nextStep(version('taslak',{apps:[app({width_mm:null})]})).code,'olcu');
  assert.equal(ui.nextStep(version('taslak',{apps:[app({needs_confirmation:1})]})).alt,'hazirla');
  assert.equal(ui.nextStep(version('taslak')).code,'hazirla');
  assert.equal(ui.nextStep(version('taslak',{files:[{id:9,kind:'uretim_formu'}]})).code,'gonder');
});

test('onay bekliyor: belge yoksa bekler, onay formu varsa müşteri linki',()=>{
  assert.equal(ui.nextStep(version('onay_bekliyor')).code,'belge');
  assert.equal(ui.nextStep(version('onay_bekliyor',{files:[{id:9,kind:'onay_formu'}]})).code,'link');
});

test('onaylandı: paket gönderilmediyse paket adımı, gönderildiyse bitti; bilinmeyen durumlarda adım yok',()=>{
  assert.equal(ui.nextStep(version('onaylandi')).code,'paket');
  assert.equal(ui.nextStep(version('onaylandi'),{sent:true}).code,'bitti');
  for(const s of ['eski','iptal','onayli','baska'])assert.equal(ui.nextStep(version(s)).code,'yok');
  assert.equal(ui.nextStep(null).code,'yok');
});

test('atolyeSent yalnız tüm atölye işleri bittiyse doğru',()=>{
  const v={id:7};
  assert.equal(ui.atolyeSent(v,[]),false);
  assert.equal(ui.atolyeSent(v,[{version_id:7,kind:'atolye_dosya',status:'tamam'},{version_id:7,kind:'atolye_dosya',status:'elle_gonderildi'}]),true);
  assert.equal(ui.atolyeSent(v,[{version_id:7,kind:'atolye_dosya',status:'tamam'},{version_id:7,kind:'atolye_dosya',status:'manuel_bekliyor'}]),false);
  assert.equal(ui.atolyeSent(v,[{version_id:8,kind:'atolye_dosya',status:'tamam'}]),false);
});

test('liste sırası: adım bekleyenler üstte, belge bekleyenler sonra, biten ve adımsızlar altta; grup içi sıra korunur',()=>{
  const items=[['a','bitti'],['b','hazirla'],['c','belge'],['d','yok'],['e','link'],['f','paket']].map(([id,code])=>({id,step:{code}}));
  assert.deepEqual(ui.orderBySteps(items).map(x=>x.id),['b','e','f','c','a','d']);
  assert.deepEqual(items.map(x=>x.id),['a','b','c','d','e','f']);
});

function harness(responses={}){
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.listeners={};this.style={};this.hidden=false;this.className='';
      const set=new Set();this.classList={add:c=>set.add(c),contains:c=>set.has(c)};}
    get type(){return this.attrs.type;}
    get value(){if(this.tag==='select'&&this._value===undefined){const o=this.children.find(c=>c.selected)||this.children[0];return o?.value ?? '';}return this._value ?? '';}
    set value(v){this._value=v;}
    get parentNode(){return this.parent;}
    get name(){return this.attrs.name;}
    set name(v){this.attrs.name=v;}
    append(...c){for(const x of c){this.children.push(x);if(x instanceof Element)x.parent=this;}}
    replaceChildren(...c){this.children=[];this._text=undefined;this.append(...c);}
    setAttribute(k,v){this.attrs[k]=String(v);}
    getAttribute(k){return this.attrs[k] ?? null;}
    hasAttribute(k){return k in this.attrs;}
    setCustomValidity(m){this.validity={valid:!m};}
    addEventListener(e,h){(this.listeners[e] ||= []).push(h);}
    async fire(e){for(const h of this.listeners[e] || [])await h({target:this,preventDefault(){}});}
    click(){return this.fire('click');}
    find(pred,out=[]){if(pred(this))out.push(this);for(const c of this.children)if(c instanceof Element)c.find(pred,out);return out;}
    querySelectorAll(sel){return sel==='[data-number]'?this.find(e=>'data-number' in e.attrs):[];}
    querySelector(sel){const m=/^\[name="(.+)"\]$/.exec(sel);return m?this.find(e=>e.attrs.name===m[1])[0] || null:null;}
    get textContent(){return this._text ?? this.children.map(c=>c.textContent ?? c).join('');}
    set textContent(v){this._text=String(v);}
  }
  const calls=[],root=new Element('root');
  const context={Node:Element,console,setTimeout,clearTimeout,navigator:{},
    document:{getElementById:()=>root,createElement:t=>new Element(t),createTextNode:text=>({textContent:text}),querySelectorAll:()=>[]},
    sessionStorage:{getItem:()=>JSON.stringify({token:'t',user:{name:'Deneme Kişi'},endpoint:ENDPOINT}),removeItem(){},setItem(){}},
    location:{search:''},URL:Object.assign(function(v){return new URL(v);},{createObjectURL:()=>'blob:test',revokeObjectURL(){}}),URLSearchParams,FormData:class{},
    fetch:async(url,init)=>{const route=String(url).replace(ENDPOINT+'/api/siparis/','');calls.push(init.method+' '+route);const data=responses[route] ?? [];return {ok:true,status:200,json:async()=>data};}};
  context.addEventListener=()=>{};
  const source=SOURCE.replace("  renderFrame();if(session)run(async()=>{await loadCommon();await renderTab();});",'  global.k={openOrder,lineEditor,renderFrame,state};')
    .replace("  window.addEventListener('pagehide'","  global.addEventListener('pagehide'");
  vm.runInNewContext(source,context);
  context.k.renderFrame();
  return {...context.k,calls,root,Element};
}

test('satır kopyala: ürün, kumaş, renk, astar ve fiyat kopyalanır; bedenler sıfır başlar',async()=>{
  const h=harness();
  const host=new h.Element('div');
  const first=h.lineEditor({product_key:'polo',color_name:'Lacivert',lining:1,unit_price_kurus:12550,sizes:{M:5}},0,false);
  host.append(first);
  const copy=first.find(e=>e.tag==='button'&&e.textContent==='Satırı kopyala')[0];
  await copy.click();
  assert.equal(host.children.length,2);
  const second=host.children[1],val=n=>second.querySelector('[name="'+n+'"]');
  assert.equal(val('product_key').value,'polo');
  assert.equal(val('color_name').value,'Lacivert');
  assert.equal(val('lining').checked,true);
  assert.equal(val('unit_price').value,'125,50');
  assert.equal(val('size_M').value,'0');
});

function orderResponses(versions){
  return {'siparisler/1':{id:1,order_no:'T-1',customer_name:'Deneme',versions},outbox:[],'teyitler?status=acik':[],'siparisler/1/maliyet':{},'surumler/21/musteri-notlari':[],'surumler/22/musteri-notlari':[]};
}
const detailVersion=(id,no,status)=>({id,version_no:no,status,lines:[{id:id*10,product_key:'tisort',sizes_json:'{"M":1}',quantity:1,applications:[]}],files:[{id:id*100,kind:'onay_formu',path:'x/o.pdf'}]});

test('sürüm seçici yalnız birden çok sürüm varsa görünür ve sıradaki adım şeridi gelir',async()=>{
  const one=harness(orderResponses([detailVersion(21,1,'onay_bekliyor')]));
  one.state.tab='orders';await one.openOrder(1);
  const hasSelector=h=>h.root.find(e=>e.tag==='select'&&e.attrs['aria-label']==='Sipariş sürümü').length>0;
  assert.equal(hasSelector(one),false);
  const strip=one.root.find(e=>/p-next /.test(e.className+' '))[0];
  assert.ok(strip,'şerit var');
  assert.match(strip.textContent,/Sıradaki adım/);
  assert.ok(strip.find(e=>e.tag==='button'&&e.textContent==='Müşteri onay linki').length===1);
  const two=harness(orderResponses([detailVersion(21,1,'eski'),detailVersion(22,2,'onay_bekliyor')]));
  two.state.tab='orders';await two.openOrder(1);
  assert.equal(hasSelector(two),true);
});

test('G74: desen_png etiketi okunur; bilinmeyen dosya türü ham anahtar yerine okunur yedek alır',()=>{
  assert.equal(ui.fileKindLabel('desen_png'),'Desen (yüksek çözünürlüklü görsel)');
  assert.equal(ui.statusLabel('desen_png'),'Desen (yüksek çözünürlüklü görsel)');
  assert.equal(ui.fileKindLabel('desen_vektor'),'Vektör desen');
  assert.equal(ui.fileKindLabel('yeni_dosya_turu'),'Yeni dosya turu');
  assert.equal(ui.fileKindLabel(undefined),'Dosya');
});
