'use strict';
// G62: front/back answer and one-click suggestion on the open measurement confirmation. Invented data only.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
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
      const key=(init.method||'GET')+' '+route;
      const data=responses[key] ?? responses[route] ?? {};
      if(data instanceof Error)throw data;
      if(data && data.__status)return {ok:false,status:data.__status,json:async()=>({error:data.error})};
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
const byText=(root,tag,text)=>root.find(e=>e.tag===tag&&e.textContent===text)[0];
const VERSION={id:5,status:'taslak',lines:[],files:[]};
const viewReason='Ürün görünümü eşleştirme güveni düşük: 2 görünüm ayrılamadı; görünüm teyit edilmeli.';
const app=(id,extra={})=>({id,kind:'baski',position:'sirt',width_mm:null,height_mm:null,needs_confirmation:1,measure_source:JSON.stringify({gorselFileId:40,...extra}),...{}});
const conf=(id,refId,message)=>({id,kind:'olcu',ref_table:'applications',ref_id:refId,message,status:'acik'});

test('G62 ön/arka düğmeleri onUrun gövdesiyle çağırır ve siparişi yeniler; ikinci baskıda soru yinelenmez',async()=>{
  const h=harness();h.state.confirmations=[conf(31,7,viewReason),conf(32,8,viewReason)];
  const line={id:11,applications:[app(7),app(8)]};
  const block=h.autoMeasureBlock(VERSION,line,[]);
  assert.ok(byText(block,'button','Soldaki ön'));assert.ok(byText(block,'button','Sağdaki ön'));
  assert.equal(block.find(e=>e.tag==='button'&&e.textContent==='Soldaki ön').length,1);
  assert.match(block.textContent,/ilk baskısında cevaplanır/);
  await byText(block,'button','Sağdaki ön').click();
  assert.deepEqual(h.calls.filter(c=>c.method==='POST'),[{route:'teyitler/31/coz',method:'POST',body:{onUrun:'sag'}}]);
  assert.deepEqual(h.refreshed,[5]);
});

test('G62 dikey dizilimde Üstteki/Alttaki ön düğmeleri ust/alt gönderir',async()=>{
  const h=harness();h.state.confirmations=[conf(31,7,viewReason)];
  const views=[{page:1,productBoxPx:{x:10,y:0,w:100,h:100}},{page:1,productBoxPx:{x:10,y:120,w:100,h:100}}];
  const block=h.autoMeasureBlock(VERSION,{id:11,applications:[app(7,{views,selectedPage:1})]},[]);
  assert.equal(byText(block,'button','Soldaki ön'),undefined);
  await byText(block,'button','Alttaki ön').click();
  assert.deepEqual(h.calls.at(-1).body,{onUrun:'alt'});
});

test('G62 öneri varken Öneriyi onayla oneriOnay gönderir; öneri yokken düğme çıkmaz',async()=>{
  const h=harness();h.state.confirmations=[conf(41,9,'Sistem önerisi var.')];
  const block=h.autoMeasureBlock(VERSION,{id:11,applications:[app(9,{oneri:{width_mm:122,height_mm:44}})]},[]);
  assert.match(block.textContent,/Öneri: 12,2 × 4,4 cm/);
  await byText(block,'button','Öneriyi onayla').click();
  assert.deepEqual(h.calls.filter(c=>c.method==='POST'),[{route:'teyitler/41/coz',method:'POST',body:{oneriOnay:true}}]);
  assert.deepEqual(h.refreshed,[5]);
  const none=h.autoMeasureBlock(VERSION,{id:11,applications:[app(9)]},[]);
  assert.equal(byText(none,'button','Öneriyi onayla'),undefined);assert.equal(byText(none,'button','Soldaki ön'),undefined);
});

test('G62 sunucu oneriOnay ucunu bilmiyorsa elle ölçü çağrısına düşer (sistem önerisi kaynağı)',async()=>{
  const h=harness({responses:{'POST teyitler/41/coz':{__status:400,error:'bilinmeyen alan'}}});h.state.confirmations=[conf(41,9,'x')];
  const block=h.autoMeasureBlock(VERSION,{id:11,applications:[app(9,{oneri:{width_mm:122,height_mm:44}})]},[]);
  await byText(block,'button','Öneriyi onayla').click();
  const patch=h.calls.find(c=>c.method==='PATCH');
  assert.equal(patch.route,'uygulamalar/9');
  assert.deepEqual(patch.body,{width_mm:122,height_mm:44,elleTeyit:true,kaynak:'sistem önerisi (kullanıcı onayı)'});
  assert.deepEqual(h.refreshed,[5]);
});

test('G62 sunucu hatası kartta görünür, yenileme yapılmaz, düğmeler yeniden açılır',async()=>{
  const h=harness({responses:{'POST teyitler/31/coz':{__status:409,error:'Teyit zaten kapalı'}}});h.state.confirmations=[conf(31,7,viewReason)];
  const block=h.autoMeasureBlock(VERSION,{id:11,applications:[app(7)]},[]);
  const left=byText(block,'button','Soldaki ön'),right=byText(block,'button','Sağdaki ön');
  await left.click();
  assert.match(block.textContent,/Teyit zaten kapalı/);assert.deepEqual(h.refreshed,[]);
  assert.ok(!left.disabled && !right.disabled);
});
