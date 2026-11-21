'use strict';
// G64: customer approval link button, WhatsApp link and customer notes on the order card. Invented data only.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const SOURCE=fs.readFileSync(path.join(__dirname,'../assets/uretim.js'),'utf8');
const ENDPOINT='https://erci-materials-api.onrender.com';

function harness({responses={},clipboard}={}) {
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
  const context={Node:Element,console,setTimeout,clearTimeout,navigator:{clipboard},
    document:{getElementById:()=>root,createElement,createTextNode:text=>({textContent:text}),querySelectorAll:()=>[]},
    sessionStorage:{getItem:()=>JSON.stringify({token:'t',user:{name:'Deneme Kişi'},endpoint:ENDPOINT}),removeItem(){},setItem(){}},
    location:{search:''},URL:URLShim,URLSearchParams,FormData,
    fetch:async(url,init)=>{
      const route=String(url).replace(ENDPOINT+'/api/siparis/','');
      calls.push({route,method:init.method,body:init.body instanceof FormData?init.body:init.body?JSON.parse(init.body):undefined});
      const key=(init.method||'GET')+' '+route;
      const data=responses[key] ?? responses[route] ?? {};
      if(data instanceof Error)throw data;
      if(data && data.__status)return {ok:false,status:data.__status,json:async()=>({error:data.error})};
      return {ok:true,status:200,json:async()=>data,blob:async()=>({type:'image/png',arrayBuffer:async()=>png})};
    }};
  context.addEventListener=()=>{};
  const source=SOURCE.replace("  renderFrame();if(session)run(async()=>{await loadCommon();await renderTab();});",
    '  global.k={customerBlock,whatsappUrl,statusLabel,state,setRefresh:fn=>{refreshInPlace=fn;}};')
    .replace("  window.addEventListener('pagehide'","  global.addEventListener('pagehide'");
  vm.runInNewContext(source,context);
  const refreshed=[];context.k.setRefresh(async v=>{refreshed.push(v.id);});
  return {...context.k,calls,refreshed,Element,images};
}

const byText=(root,tag,text)=>root.find(e=>e.tag===tag&&e.textContent===text)[0];
const LINK='https://panel.example.test/onay.html?t='+'A'.repeat(43);
const ORDER={order_no:'MRC-G64-1'};

test('onay bekleyen sürümde düğme link üretir, panoya kopyalar ve WhatsApp bağlantısını gösterir',async()=>{
  const copied=[];
  const h=harness({responses:{'POST surumler/7/musteri-link':{link:LINK,expiresAt:'2026-12-06T10:00:00.000Z',versionId:7}},clipboard:{writeText:async t=>{copied.push(t);}}});
  const block=h.customerBlock(ORDER,{id:7,status:'onay_bekliyor'},[]);
  const button=byText(block,'button','Müşteri onay linki');assert.ok(button);
  await button.click();
  assert.deepEqual(h.calls.map(c=>c.route+' '+c.method),['surumler/7/musteri-link POST']);
  assert.deepEqual(copied,[LINK]);
  const box=block.find(e=>e.tag==='input')[0];assert.equal(box.value,LINK);
  const wa=block.find(e=>e.tag==='a')[0];
  assert.equal(wa.textContent,"WhatsApp'ta aç");
  assert.ok(wa.getAttribute('href').startsWith('https://wa.me/?text='));
  assert.ok(wa.getAttribute('href').includes(encodeURIComponent(LINK)));
  assert.ok(wa.getAttribute('href').includes(encodeURIComponent('MRC-G64-1')));
  assert.ok(wa.getAttribute('href').includes(encodeURIComponent('MerciTex')));
  assert.match(wa.getAttribute('rel'),/noopener/);
  assert.match(block.textContent,/panoya kopyalandı/);
});

test('pano yoksa düğme yine linki gösterir ve elle kopyalamayı söyler',async()=>{
  const h=harness({responses:{'POST surumler/7/musteri-link':{link:LINK,expiresAt:'2026-12-06T10:00:00.000Z'}}});
  const block=h.customerBlock(ORDER,{id:7,status:'onay_bekliyor'},[]);
  await byText(block,'button','Müşteri onay linki').click();
  assert.match(block.textContent,/elle kopyalayın/);assert.equal(block.find(e=>e.tag==='input')[0].value,LINK);
});

test('onay bekleyen olmayan sürümde düğme yok; not yoksa blok hiç çizilmez',()=>{
  const h=harness();
  assert.equal(h.customerBlock(ORDER,{id:7,status:'onaylandi'},[]),null);
  assert.equal(h.customerBlock(ORDER,{id:7,status:'taslak'},undefined),null);
});

test('müşteri notu ad, tarih ve düz metin olarak görünür; HTML metin olarak kalır',()=>{
  const h=harness();
  const block=h.customerBlock(ORDER,{id:7,status:'onay_bekliyor'},[{id:1,adSoyad:'Ayşe Örnek',metin:'Göğüs <b>küçülsün</b>',tarih:'2026-11-22T09:00:00.000Z'}]);
  assert.match(block.textContent,/Müşteri değişiklik istedi/);assert.match(block.textContent,/Ayşe Örnek/);
  assert.match(block.textContent,/Göğüs <b>küçülsün<\/b>/);
  assert.equal(block.find(e=>e.tag==='b').length,0);
  assert.ok(byText(block,'button','Müşteri onay linki'));
});

test('teyit türü ve liste rozeti: musteri_notu etiketi var, kaynak kod yalnız textContent/text düğümü kullanır',()=>{
  const h=harness();
  assert.equal(h.statusLabel('musteri_notu'),'Müşteri notu');
  assert.match(SOURCE,/badge\('Müşteri değişiklik istedi','warn'\)/);
  const start=SOURCE.indexOf('function customerBlock'),end=SOURCE.indexOf('async function openOrder');
  assert.ok(!/innerHTML/.test(SOURCE.slice(start,end)));
});
