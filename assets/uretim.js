/* Shared production workbench and fabric ledger. No legacy stock credentials. */
(function (global) {
  'use strict';
  const SIZES = ['XS','S','M','L','XL','2XL','3XL','4XL'];
  // No recipe GET route exists. Copied from agent/operations/recipes.json (version 1).
  const PRODUCTS = {sweat:'Sweatshirt',tisort:'Tişört',polar:'Polar',polo:'Polo yaka',esofman:'Eşofman',sort:'Şort',tam_fermuar:'Tam fermuarlı',yarim_fermuar:'Yarım fermuarlı'};
  const LABELS = {taslak:'Taslak',onay_bekliyor:'Onay bekliyor',onaylandi:'Onaylandı',onayli:'Onaylı',eski:'Eski sürüm',iptal:'İptal',bekliyor:'Bekliyor',isleniyor:'İşleniyor',tamam:'Tamam',tamamlandi:'Tamamlandı',basarisiz:'Başarısız',manuel_bekliyor:'Elle gönderim bekliyor',elle_gonderildi:'Gruba gönderildi',gonderildi:'Gönderildi',fiyat_bekliyor:'Fiyat bekliyor',teslim_bekliyor:'Teslim bekliyor',teslim_alindi:'Teslim alındı',eslesti:'Eşleşti',teyit:'Teyit gerekli',olcu:'Ölçü',fatura_eslesme:'Fatura eşleşmesi',eksik_alan:'Eksik alan',baglanti_hatasi:'Bağlantı hatası',vektor_kalite:'Vektör kalitesi',eski_surum:'Eski sürüm',acilis:'Açılış',giris:'Giriş',cikis:'Çıkış',duzeltme:'Düzeltme',tahsis:'Ayırma',tahsis_iade:'Ayırma iadesi',onay_formu:'Onay formu',baski_formu:'Baskı formu',nakis_formu:'Nakış formu',uretim_formu:'Üretim formu',kesim_formu:'Kesim formu',dikim_formu:'Dikim formu',desen_vektor:'Vektör desen',urun_gorsel:'Ürün görseli',desen_kaynak:'Desen kaynağı',atolye_dosya:'Atölye dosyası',maliyet_aktarim:'Maliyet aktarımı'};
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function formatNumber(value) { return value==null || (typeof value==='string'&&!value.trim()) || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat('tr-TR',{maximumFractionDigits:3}).format(Number(value)); }
  function formatKg(value) { const n=formatNumber(value);return n==='—'?n:n+' kg'; }
  function formatDate(value) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('tr-TR').format(d); }
  function statusLabel(value) { return LABELS[value] || (value == null ? 'Bilgi yok' : String(value)); }
  function sizeTotal(sizes) { return SIZES.reduce((n,k) => { const q=Number(sizes?.[k] ?? 0); if (!Number.isSafeInteger(q) || q<0) throw new RangeError('Beden adetleri sıfır veya pozitif tam sayı olmalı.'); return n+q; },0); }
  function pixelBox(box, rendered, natural) {
    for (const value of [box.x,box.y,box.w,box.h,rendered.w,rendered.h,natural.w,natural.h]) if (!Number.isFinite(value)) throw new RangeError('Geçersiz piksel kutusu.');
    if ([box.w,box.h,rendered.w,rendered.h,natural.w,natural.h].some(v=>v<=0) || box.x<0 || box.y<0 || box.x+box.w>rendered.w+.01 || box.y+box.h>rendered.h+.01) throw new RangeError('Ölçü kutusu görselin içinde olmalı.');
    return {x:box.x*natural.w/rendered.w,y:box.y*natural.h/rendered.h,w:box.w*natural.w/rendered.w,h:box.h*natural.h/rendered.h};
  }
  function parseObject(value, fallback={}) { if (value==null) return fallback; return typeof value==='string' ? JSON.parse(value) : value; }
  // All endpoint shape boundaries live here. Absent fields remain unknown, never zero.
  function adapt(kind, value) {
    if (kind==='list') { if (!Array.isArray(value)) throw new TypeError('Sunucu liste biçimi desteklenmiyor.'); return value; }
    if (kind==='stock') {
      const out={...value};
      for (const key of ['total','reserved','available','shortage','awaiting_delivery']) {
        out[key]=value[key+'_kg']!=null ? Number(value[key+'_kg']) : value[key+'_milli']!=null ? Number(value[key+'_milli'])/1000 : null;
      }
      return out;
    }
    if (kind==='sizesOut') return Object.fromEntries(Object.entries(value).map(([key,qty])=>[key==='2XL'?'XXL':key,qty]));
    if (kind==='line') {const sizes=parseObject(value.sizes_json ?? value.sizes);return {...value,sizes:Object.fromEntries(Object.entries(sizes).map(([key,qty])=>[key==='XXL'?'2XL':key,qty])),material_items:parseObject(value.material_items_json ?? value.material_items)};}
    if (kind==='invoice') return {...value,allocations:value.allocations ?? parseObject(value.allocation_json,[]),orders:value.orders ?? [],reasons:value.reasons ?? parseObject(value.match_reasons_json,[])};
    if (kind==='measurement') return {...value,widthCm:value.width_mm==null ? null : Number(value.width_mm)/10,heightCm:value.height_mm==null ? null : Number(value.height_mm)/10};
    if (kind==='orderStock') {
      // Core snapshots expose no order-specific allocation summary yet.
      if (!Array.isArray(value.allocations)) return {label:'Bilgi bekleniyor',tone:'warn'};
      return value.allocations.some(a=>Number(a.shortage_milli)>0) ? {label:'Tedarik bekliyor',tone:'warn'} : {label:'Tam',tone:'good'};
    }
    if (kind==='cost') return {...value,label:['tamam','tamamlandi'].includes(value.status) ? 'Tamam' : value.priceWaiting || value.status==='fiyat_bekliyor' || value.unitPrice==null ? 'Fiyat bekliyor' : statusLabel(value.status)};
    throw new TypeError('Bilinmeyen adaptör: '+kind);
  }
  const pure={SIZES,PRODUCTS,escapeHtml,formatNumber,formatKg,formatDate,statusLabel,sizeTotal,pixelBox,adapt};
  if (typeof module!=='undefined' && module.exports) module.exports=pure;
  global.MerciProduction=pure;
  if (typeof document==='undefined') return;
  const root=document.getElementById('production-root');
  if (!root) return;
  const mode=root.dataset.mode || 'production', storageKey='merci.production.session';
  let session=null;
  try { session=JSON.parse(sessionStorage.getItem(storageKey)); } catch { sessionStorage.removeItem(storageKey); }
  if (!session?.token || (session.expiresAt && new Date(session.expiresAt).getTime()<=Date.now())) session=null;
  let endpoint=new URLSearchParams(location.search).get('api') || 'https://erci-materials-api.onrender.com';
  try { const url=new URL(endpoint); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw Error(); endpoint=url.origin+url.pathname.replace(/\/$/,''); } catch { endpoint=''; }
  // Scope cached sessions to the API to avoid sending a token to a changed override.
  if (session && session.endpoint!==endpoint) session=null;
  if (!session) sessionStorage.removeItem(storageKey);
  const state={tab:'orders',stocks:[],flats:[],orders:[],outbox:[],activeOrder:null,version:null};
  const objectUrls=new Set(); let pageUrls=new Set(), content, notice;
  const el=(tag,attrs,...children)=>{
    const n=document.createElement(tag);
    for (const [k,v] of Object.entries(attrs || {})) {
      if (k==='class') n.className=v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(),v);
      else if (k==='value') n.value=v ?? '';
      else if (k==='checked') n.checked=!!v;
      else if (k==='disabled') n.disabled=!!v;
      else if (v!=null) n.setAttribute(k,v);
    }
    for (const c of children.flat(Infinity)) if (c!=null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  };
  const text=(s,cls='p-muted')=>el('p',{class:cls},s);
  const card=(...c)=>el('section',{class:'p-card'},...c);
  const field=(label,node)=>{if(!node.hasAttribute('aria-label'))node.setAttribute('aria-label',label);return el('label',{class:'p-field'},label,node);};
  const input=(name,opts={})=>el('input',{name,...opts});
  const num=(name,value='',opts={})=>input(name,{type:'number',min:0,step:'any',value,...opts});
  const opts=(items,selected,empty)=>{
    const s=el('select',{});
    if (empty!=null) s.append(el('option',{value:''},empty));
    for(const [value,label] of items) { const o=el('option',{value},label); o.selected=String(value)===String(selected); s.append(o); }
    return s;
  };
  const badge=(s,tone)=>el('span',{class:'p-badge '+(tone || (/basarisiz|eski/.test(s)?'bad':/bekliyor|teyit/.test(s)?'warn':/tamam|onayli|onaylandi|gonderildi/.test(s)?'good':''))},statusLabel(s));
  function message(s,error=false){ if(notice){notice.textContent=s;notice.className='p-notice'+(error?' error':'');} }
  function clearUrls(){ for(const u of pageUrls){URL.revokeObjectURL(u);objectUrls.delete(u);} pageUrls=new Set(); }
  function blobUrl(blob){const u=URL.createObjectURL(blob);pageUrls.add(u);objectUrls.add(u);return u;}
  async function api(path,body,method,blob=false){
    if(!endpoint) throw Error('API adresi geçersiz.');
    const headers={}; if(session?.token) headers.Authorization='Bearer '+session.token;
    const init={method:method || (body===undefined?'GET':'POST'),headers,credentials:'omit'};
    if(body!==undefined){if(body instanceof FormData)init.body=body;else{headers['Content-Type']='application/json';init.body=JSON.stringify(body);}}
    let res;try{res=await fetch(endpoint+'/api/siparis/'+path,init);}catch{throw Error('Sunucuya bağlanılamadı. Bağlantınızı kontrol edip tekrar deneyin.');}
    if(res.status===401&&path!=='giris'){session=null;sessionStorage.removeItem(storageKey);clearUrls();renderFrame();throw Error('Oturum sona erdi. Kişisel hesabınızla tekrar giriş yapın.');}
    if(!res.ok){let m='İşlem tamamlanamadı ('+res.status+').';try{const d=await res.json();m=d.error || m;}catch{} if([404,501,503].includes(res.status)&&/^(stok\/(sayim|kalemler)|fatura-satirlari|siparisler\/\d+\/(maliyet|fiyat))/.test(path))m='Sunucu hazır değil. Bu bölüm etkinleşince tekrar deneyin.';const e=Error(m);e.status=res.status;throw e;}
    return blob ? res.blob() : res.json();
  }
  async function optional(path){try{return {data:await api(path)};}catch(e){if(e.status===404||e.status===503||e.status===501)return {unavailable:true,error:'Sunucu hazır değil. Bu bölüm etkinleşince tekrar yenileyin.'};throw e;}}
  async function run(fn,button){if(button)button.disabled=true;message('');try{await fn();}catch(e){message(e.message,true);}finally{if(button)button.disabled=false;}}
  const button=(label,fn,cls='secondary')=>{let b=el('button',{type:'button',class:cls,onclick:()=>run(fn,b)},label);return b;};
  const submit=(label)=>el('button',{type:'submit'},label);
  const form=(fn,...children)=>{const f=el('form',{onsubmit:e=>{e.preventDefault();run(()=>fn(f),f.querySelector('[type=submit]'));}},...children);return f;};
  function table(headers,rows){const t=el('table',{class:'p-table'},el('thead',{},el('tr',{},headers.map(h=>el('th',{scope:'col'},h)))));const body=el('tbody',{});for(const row of rows)body.append(el('tr',{},row.map((c,i)=>el('td',{'data-label':headers[i]},c))));t.append(body);return rows.length?t:text('Henüz kayıt yok.');}
  function stockOptions(selected){return opts(state.stocks.map(s=>[s.id,(s.name || s.fabric_key)+' / '+(s.color_name || 'Renk yok')+' ('+formatKg(s.available)+')']),selected,'Kumaş kalemi seçin');}
  async function loadStocks(){state.stocks=adapt('list',await api('stok')).map(s=>adapt('stock',s));}
  async function loadCommon(){await loadStocks();if(mode==='production'){const f=await optional('duz-cizimler');state.flats=f.data?adapt('list',f.data):[];}}
  async function logout(){session=null;sessionStorage.removeItem(storageKey);clearUrls();state.stocks=[];state.orders=[];state.activeOrder=null;state.version=null;renderFrame();}
  function renderFrame(){
    clearUrls();root.replaceChildren();
    root.append(el('header',{class:'p-head'},el('div',{},el('div',{class:'p-brand'},'MerciCo / Üretim'),el('h1',{},mode==='stock'?'Kumaş defteri':'Üretim ve Sipariş'),text(mode==='stock'?'Fiziksel stok, ayırmalar ve sayım aynı defterde.':'Siparişten atölyeye, sürümü ve dosyaları birlikte takip edin.','p-sub')),el('div',{class:'p-row'},el('a',{href:'hub.html'},'Panel merkezi'),session?button('Çıkış · '+session.user.name,logout):null)));
    notice=el('div',{class:'p-notice',role:'status','aria-live':'polite'});root.append(notice);
    if(!session){renderLogin();return;}
    root.append(text('Giriş yapan: '+session.user.name+'. İşlemler bu kişi adına kaydedilir.'));
    if(mode==='production')root.append(el('nav',{class:'p-tabs',role:'tablist','aria-label':'Üretim bölümleri'},[['orders','Siparişler'],['stock','Stok ve faturalar'],['confirmations','Teyit gerekenler']].map(([key,label])=>el('button',{id:'tab-'+key,type:'button',role:'tab','aria-controls':'production-content','aria-selected':String(state.tab===key),onclick:()=>run(async()=>{state.tab=key;state.activeOrder=null;renderFrame();await renderTab();})},label))));
    content=el('div',{id:'production-content',role:'tabpanel','aria-labelledby':mode==='production'?'tab-'+state.tab:null});root.append(content);
  }
  function renderLogin(){
    root.append(card(el('h2',{},'Kişisel giriş'),text('Kendi adınız ve şifrenizle giriş yapın. Oturum yalnız bu sekmede saklanır.'),form(async f=>{
      const result=await api('giris',{ad:f.elements.ad.value.trim(),sifre:f.elements.sifre.value});
      if(!result.token||!result.user?.name)throw Error('Giriş yanıtı desteklenmiyor.');
      session={...result,endpoint};sessionStorage.setItem(storageKey,JSON.stringify(session));renderFrame();await loadCommon();await renderTab();
    },el('div',{class:'p-grid'},field('Ad',input('ad',{required:true,autocomplete:'username'})),field('Şifre',input('sifre',{type:'password',required:true,autocomplete:'current-password'}))),submit('Giriş yap'))));
  }
  async function renderTab(){
    if(!session)return;
    if(mode==='stock'){await renderLedger();return;}
    if(state.tab==='orders')await renderOrders();else if(state.tab==='stock')await renderStockTab();else await renderConfirmations();
  }
  async function renderOrders(){
    content.replaceChildren(card(el('h2',{},'Siparişler'),text('Siparişler yükleniyor…')));
    const [orders,jobs]=await Promise.all([api('siparisler'),api('outbox')]);state.orders=adapt('list',orders);state.outbox=adapt('list',jobs);
    const details=await Promise.all(state.orders.map(o=>api('siparisler/'+o.id)));
    const costs=await Promise.all(state.orders.map(o=>optional('siparisler/'+o.id+'/maliyet')));
    if(!session||state.tab!=='orders')return;
    content.replaceChildren(card(el('div',{class:'p-row p-between'},el('div',{},el('h2',{},'Siparişler'),text('Güncel sürüm, atölye ve fiyat durumu.')),button('Yeni sipariş',()=>renderWizard(),'')),table(['Sipariş / müşteri','Güncel sürüm','Stok','Atölye','Maliyet',''],details.map((o,i)=>{
      const v=o.versions?.at(-1),stock=v?adapt('orderStock',v):{label:'Bilgi yok'};const jobs=state.outbox.filter(j=>j.version_id===v?.id&&j.kind==='atolye_dosya');
      return [el('div',{},el('strong',{},o.order_no),text(o.customer_name || 'Müşteri belirtilmedi')),v?el('div',{},'v'+v.version_no,' ',badge(v.status)):'—',badge(stock.label,stock.tone),jobs.length?el('div',{},jobs.map(j=>el('div',{},badge(j.status)))):'Paket bekleniyor',costs[i].data?adapt('cost',costs[i].data).label:'Sunucu hazır değil',button('Aç',()=>openOrder(o.id))];
    }))));
  }
  function lineEditor(source={},index=0){
    const line=adapt('line',source),box=card(el('div',{class:'p-row p-between'},el('h3',{},'Ürün satırı '+(index+1))));box.classList.add('p-line');box._source=line;
    const product=opts(Object.entries(PRODUCTS),line.product_key || 'tisort');product.name='product_key';
    const fabric=stockOptions(line.fabric_item_id);fabric.name='fabric_item_id';fabric.required=true;
    const color=input('color_name',{value:line.color_name || '',required:true});fabric.addEventListener('change',()=>{const s=state.stocks.find(s=>String(s.id)===fabric.value);if(s?.color_name)color.value=s.color_name;});
    box.append(el('div',{class:'p-grid'},field('Ürün',product),field('Kumaş kalemi',fabric),field('Renk',color),field('Astar',el('input',{name:'lining',type:'checkbox',checked:line.lining===1||line.lining===true}))));
    const sizes=el('div',{class:'p-sizes'},SIZES.map(s=>field(s,num('size_'+s,line.sizes[s] || 0,{step:1,required:true}))));const total=text('Toplam: '+formatNumber(sizeTotal(line.sizes))+' adet','p-number');sizes.addEventListener('input',()=>{try{total.textContent='Toplam: '+formatNumber(sizeTotal(readSizes(box)))+' adet';}catch(e){total.textContent=e.message;}});box.append(sizes,total);
    const mat=el('details',{},el('summary',{},'Ek reçete malzemeleri (kaşkorse, ribana, astar)'),text('Ürünün reçetesindeki malzemeleri kaleme bağlayın. Eksik eşlemeler teyide düşer.'));
    for(const key of ['kaskorse','ribana','astar']){const s=stockOptions(line.material_items[key]);s.name='material_'+key;mat.append(field({kaskorse:'Kaşkorse',ribana:'Ribana',astar:'Astar'}[key],s));}box.append(mat);
    if(line.applications?.length){const apps=el('details',{},el('summary',{},'Mevcut uygulamaların cm ölçüleri'));line.applications.forEach((a,i)=>apps.append(el('div',{class:'p-grid'},field(statusLabel(a.kind)+' / '+a.position+' en (cm)',num('app_w_'+i,a.width_mm==null?'':a.width_mm/10,{min:.1,step:.1})),field('Boy (cm)',num('app_h_'+i,a.height_mm==null?'':a.height_mm/10,{min:.1,step:.1})),field('Bu ölçüleri elle teyit ettim',input('app_confirm_'+i,{type:'checkbox'})))));box.append(apps);}
    box.append(button('Satırı kaldır',()=>box.remove(),'secondary'));return box;
  }
  function readSizes(box){return Object.fromEntries(SIZES.map(s=>[s,Number(box.querySelector('[name="size_'+s+'"]').value)]));}
  function readLine(box){const get=n=>box.querySelector('[name="'+n+'"]');const source=box._source,sizes=readSizes(box),quantity=sizeTotal(sizes);if(!quantity)throw Error('Her ürün satırında en az bir adet gerekli.');
    const line={...(source.id?{id:source.id}:{}),product_key:get('product_key').value,fabric_item_id:Number(get('fabric_item_id').value),color_name:get('color_name').value.trim(),sizes:adapt('sizesOut',sizes),quantity,lining:get('lining').checked,material_items:Object.fromEntries(['kaskorse','ribana','astar'].filter(k=>get('material_'+k).value).map(k=>[k,Number(get('material_'+k).value)]))};
    if(source.applications?.length)line.applications=source.applications.map((a,i)=>{const w=get('app_w_'+i).value?Math.round(Number(get('app_w_'+i).value)*10):null,h=get('app_h_'+i).value?Math.round(Number(get('app_h_'+i).value)*10):null;const confirmed=get('app_confirm_'+i).checked;if((w!==a.width_mm||h!==a.height_mm||a.needs_confirmation)&&!confirmed)throw Error('Uygulama ölçülerini kontrol edip elle teyit kutusunu işaretleyin.');return {...a,width_mm:w,height_mm:h,needs_confirmation:confirmed?0:a.needs_confirmation};});return line;
  }
  function renderWizard(revision=false){
    clearUrls();const v=state.version,o=state.activeOrder;
    const lines=el('div',{});(revision?v.lines:[{}]).forEach((line,i)=>lines.append(lineEditor(line,i)));
    const f=form(async f=>{
      const data=[...lines.children].map(readLine);if(!data.length)throw Error('En az bir ürün satırı ekleyin.');
      if(revision){const fresh=await api('surumler/'+v.id+'/revizyon',{lines:data});await openOrder(o.id,fresh.id);}
      else {const result=await api('siparisler',{order_no:f.elements.order_no.value.trim(),customer_name:f.elements.customer_name.value.trim(),job_no:f.elements.job_no.value.trim() || null,lines:data});await openOrder(result.id,result.version.id);message('Sipariş oluşturuldu. Ürün görsellerini ve desenleri ekleyerek ölçü adımına geçin.');}
    },card(el('div',{class:'p-step'},revision?'Revizyon / Yeni sürüm':'1 / Sipariş ve ürünler'),el('h2',{},revision?'Revizyon aç':'Yeni sipariş'),revision?text('Bu liste yeni sürümün tüm satırlarıdır. Değişen alanları düzenleyin; eski sürüm korunur.'):el('div',{class:'p-grid three'},field('Sipariş no',input('order_no',{required:true})),field('Müşteri',input('customer_name',{required:true})),field('İşler no (isteğe bağlı)',input('job_no',{})))),lines,button('Ürün satırı ekle',()=>lines.append(lineEditor({},lines.children.length))),el('div',{class:'p-actions'},submit(revision?'Yeni sürüm aç':'Siparişi oluştur'),button('Vazgeç',()=>revision?openOrder(o.id,v.id):renderOrders())));
    content.replaceChildren(f);
  }
  async function openOrder(id,versionId){
    clearUrls();const o=await api('siparisler/'+id);state.activeOrder=o;state.version=versionId?o.versions.find(v=>v.id===versionId):o.versions.at(-1);if(!state.version)throw Error('Sürüm bulunamadı.');
    const v=state.version;state.outbox=adapt('list',await api('outbox'));const costs=await optional('siparisler/'+id+'/maliyet');if(!session||state.tab!=='orders')return;
    const selector=opts(o.versions.map(v=>[v.id,'v'+v.version_no+' · '+statusLabel(v.status)]),v.id);selector.setAttribute('aria-label','Sipariş sürümü');selector.addEventListener('change',()=>run(()=>openOrder(id,Number(selector.value))));
    content.replaceChildren(card(el('div',{class:'p-row p-between'},el('div',{},el('h2',{},o.order_no+' / '+(o.customer_name || 'Müşteri yok')),badge(v.status)),el('div',{class:'p-row'},button('Yenile',()=>openOrder(id,v.id)),button('Siparişlere dön',renderOrders))),field('Sürüm',selector)));
    const oldSent=o.versions.filter(old=>old.id!==v.id).some(old=>state.outbox.some(j=>j.version_id===old.id && j.kind==='atolye_dosya' && ['tamam','tamamlandi','elle_gonderildi'].includes(j.status)));
    if(oldSent || (v.status==='eski'&&state.outbox.some(j=>j.version_id===v.id&&j.kind==='atolye_dosya'&&['tamam','tamamlandi','elle_gonderildi'].includes(j.status))))content.append(el('div',{class:'p-notice error'},'Eski sürüm atölyeye ulaştı. Yeni sürümün iletildiğini dosya bazında kontrol edin.'));
    content.append(card(el('h3',{},'Ürünler'),table(['Ürün','Renk / kumaş','Bedenler','Adet','Uygulama'],v.lines.map(raw=>{const l=adapt('line',raw),s=state.stocks.find(s=>s.id===l.fabric_item_id);return [PRODUCTS[l.product_key] || l.product_key,(l.color_name || '—')+' / '+(s?.name || l.fabric_item_id || '—'),Object.entries(l.sizes).map(([k,q])=>k+': '+formatNumber(q)).join(', '),formatNumber(l.quantity),el('div',{},l.applications.map(a=>text(statusLabel(a.kind)+' / '+a.position+': '+formatNumber(a.width_mm==null?null:a.width_mm/10)+' × '+formatNumber(a.height_mm==null?null:a.height_mm/10)+' cm'+(a.needs_confirmation?' · teyit kaydı var':''))))];}))));
    if(v.status==='taslak')renderMedia(v);
    else if(v.status==='onay_bekliyor'&&!v.files.some(f=>f.kind==='onay_formu'))content.append(el('div',{class:'p-notice'},'Yeni sürüm açıldı. Bu sunucu sürümü revizyonlarda dosya yükleme ve form hazırlamayı henüz desteklemiyor. Belgeler hazır olana kadar onay verilemez.'));
    content.append(card(el('div',{class:'p-step'},'3 / Formlar ve onay'),el('h3',{},'Sürüm belgeleri'),el('div',{class:'p-actions'},button('Formları hazırla',async()=>{await api('surumler/'+v.id+'/hazirla'+(v.files.some(f=>f.kind.endsWith('_formu'))?'?yeniden=1':''),{});await openOrder(id,v.id);message('Formlar hazırlandı. PDF önizlemelerini kontrol edin.');},''),button('Onaya gönder',async()=>{await api('surumler/'+v.id+'/gonder',{});await openOrder(id,v.id);}),button('Müşteri onayladı',()=>approvalDialog(v)),button('Revizyon aç',()=>renderWizard(true))),renderFiles(v.files.filter(f=>f.kind.endsWith('_formu')),true)));
    if(v.status==='onaylandi'){const pack=await optional('surumler/'+v.id+'/atolye-paketi');if(pack.unavailable)content.append(card(el('h3',{},'Atölye paketi'),text(pack.error)));else renderPackage(pack.data,v);}
    else content.append(card(el('h3',{},'Atölye paketi'),text('Atölye paketi için müşteri onayını kaydedin.')));
    renderCost(costs,id,v);
  }
  function uploadForm(v,line){
    const kind=opts([['urun_gorsel','Ürün görseli'],['desen_kaynak','Desen (PNG / PDF)']],'urun_gorsel');kind.name='kind';
    const view=opts([['on','Ön'],['arka','Arka']],'on');view.name='gorunum';
    const file=input('file',{type:'file',accept:'.png,.jpg,.jpeg,.pdf',required:true});
    return form(async f=>{const data=new FormData();data.append('file',file.files[0]);data.append('kind',kind.value);data.append('lineId',line.id);data.append('gorunum',view.value);await api('surumler/'+v.id+'/dosyalar',data);await openOrder(state.activeOrder.id,v.id);message('Dosya yüklendi.');},el('div',{class:'p-grid'},field('Dosya türü',kind),field('Görünüm',view),field('Dosya',file)),submit('Dosyayı yükle'));
  }
  function renderMedia(v){
    const section=card(el('div',{class:'p-step'},'2 / Görsel, desen ve ölçü'),el('h3',{},'Ürün dosyaları'));
    for(const l of v.lines){const det=el('details',{},el('summary',{},PRODUCTS[l.product_key]+' / '+(l.color_name || '')+' · Dosya ve ölçü'));det.open=v.lines.length===1;det.append(uploadForm(v,l),measurementEditor(v,l));section.append(det);}content.append(section);
  }
  function measurementEditor(v,line){
    const host=el('section',{},el('h3',{},'Deseni yerleştir'));
    const flat=opts(state.flats.filter(f=>f.urun===line.product_key).map(f=>[f.id,f.ad+' / '+f.gorunum]),null,'Yerel düz çizim / fotoğraf');flat.name='flatId';
    const productImage=input('flatImage',{type:'file',accept:'.png,.jpg,.jpeg'}),designImage=input('designImage',{type:'file',accept:'.png,.pdf'});
    const image=el('img',{alt:'Ölçü referansı olan ürün görseli',hidden:true}),overlay=el('div',{class:'p-box',tabindex:0,role:'group','aria-label':'Desen kutusu. Ok tuşlarıyla taşıyın; Shift ve oklarla boyutlandırın.'});
    const handle=el('span',{class:'p-resize','aria-hidden':'true'},'↘');overlay.append(handle);
    const stage=el('div',{class:'p-stage'},image,overlay);let natural=null;
    const boxWidth=num('box_width',30,{max:100,min:1,step:.1}),boxHeight=num('box_height',25,{max:100,min:1,step:.1});
    const referencePx=num('refLengthPx','',{min:.1,step:.1}),referenceCm=num('refLengthCm','',{min:.1,step:.1}),refNote=input('refAciklama',{placeholder:'Örn. Ön beden eni'});
    const kind=opts([['baski','Baskı'],['nakis','Nakış']],'baski'),position=opts(['gogus','sirt','kol','ense','kapuson'].map(k=>[k,{gogus:'Göğüs',sirt:'Sırt',kol:'Kol',ense:'Ense',kapuson:'Kapüşon'}[k]]),'gogus');
    const imageKind=opts([['flat','Düz çizim'],['photo','Fotoğraf / belirsiz görsel']],'flat');
    const source=opts(v.files.filter(f=>f.kind==='desen_kaynak').map(f=>[f.id,'Desen #'+f.id]),null,'Yüklenmiş desen seçin');source.required=true;
    const result=el('div',{'aria-live':'polite'});
    async function preview(blob,asDesign=false){const url=blobUrl(blob);if(asDesign){overlay.querySelectorAll('img,object').forEach(n=>n.remove());overlay.prepend(blob.type==='application/pdf'?el('object',{data:url,type:'application/pdf','aria-label':'PDF desen önizlemesi'}):el('img',{src:url,alt:'Desen'}));}else{image.src=url;image.hidden=false;await image.decode();natural={w:image.naturalWidth,h:image.naturalHeight};stage.style.aspectRatio=natural.w+'/'+natural.h;}}
    productImage.addEventListener('change',()=>run(async()=>{if(productImage.files[0])await preview(productImage.files[0]);}));
    designImage.addEventListener('change',()=>run(async()=>{if(designImage.files[0])await preview(designImage.files[0],true);}));
    source.addEventListener('change',()=>run(async()=>{if(source.value)await preview(await api('dosyalar/'+source.value,undefined,undefined,true),true);}));
    // A library record contains a filesystem path, not a browser-readable URL.
    flat.addEventListener('change',()=>{const f=state.flats.find(f=>f.id===flat.value);if(f){referencePx.value=f.refLengthPx || '';referenceCm.value=f.refLengthCm || '';refNote.value=f.refAciklama || '';}});
    const applySize=()=>{const w=Math.max(1,Math.min(100,Number(boxWidth.value))),h=Math.max(1,Math.min(100,Number(boxHeight.value)));overlay.style.width=w+'%';overlay.style.height=h+'%';overlay.style.left=Math.min(parseFloat(overlay.style.left)||30,100-w)+'%';overlay.style.top=Math.min(parseFloat(overlay.style.top)||30,100-h)+'%';};
    boxWidth.addEventListener('input',applySize);boxHeight.addEventListener('input',applySize);
    let drag;
    overlay.addEventListener('pointerdown',e=>{e.preventDefault();overlay.setPointerCapture(e.pointerId);const r=stage.getBoundingClientRect(),b=overlay.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:b.left-r.left,top:b.top-r.top,w:b.width,h:b.height,r,resize:e.target===handle};});
    overlay.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag,dx=e.clientX-d.x,dy=e.clientY-d.y;if(d.resize){const w=Math.max(12,Math.min(d.r.width-d.left,d.w+dx)),h=Math.max(12,Math.min(d.r.height-d.top,d.h+dy));overlay.style.width=w/d.r.width*100+'%';overlay.style.height=h/d.r.height*100+'%';boxWidth.value=(w/d.r.width*100).toFixed(1);boxHeight.value=(h/d.r.height*100).toFixed(1);}else{overlay.style.left=Math.max(0,Math.min(d.r.width-d.w,d.left+dx))/d.r.width*100+'%';overlay.style.top=Math.max(0,Math.min(d.r.height-d.h,d.top+dy))/d.r.height*100+'%';}});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])overlay.addEventListener(event,()=>drag=null);
    overlay.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;if(e.shiftKey){boxWidth.value=Number(boxWidth.value)+dx;boxHeight.value=Number(boxHeight.value)+dy;applySize();}else{overlay.style.left=Math.max(0,Math.min(100-parseFloat(boxWidth.value),(parseFloat(overlay.style.left)||30)+dx))+'%';overlay.style.top=Math.max(0,Math.min(100-parseFloat(boxHeight.value),(parseFloat(overlay.style.top)||30)+dy))+'%';}});
    const f=form(async()=>{
      if(!natural)throw Error('Ölçü için ürünün düz çizimini veya fotoğrafını seçin.');if(!source.value)throw Error('Önce bu satıra bir desen yükleyin ve seçin.');
      if(flat.value){await api('duz-cizimler/'+encodeURIComponent(flat.value)+'/referans',{refLengthPx:Number(referencePx.value),refLengthCm:Number(referenceCm.value),refAciklama:refNote.value.trim()},'PUT');}
      const r=stage.getBoundingClientRect(),b=overlay.getBoundingClientRect(),designBoxPx=pixelBox({x:b.left-r.left,y:b.top-r.top,w:b.width,h:b.height},{w:r.width,h:r.height},natural);
      const measured=adapt('measurement',await api('uygulamalar/olc',{lineId:line.id,kind:kind.value,position:position.value,desenDosyaId:Number(source.value),...(flat.value?{flatId:flat.value}:{refLengthPx:Number(referencePx.value),refLengthCm:Number(referenceCm.value)}),designBoxPx,imageKind:imageKind.value}));
      result.replaceChildren(text('Ölçü: '+formatNumber(measured.widthCm)+' × '+formatNumber(measured.heightCm)+' cm','p-number'));
      if(measured.needsConfirmation){const width=num('confirm_w',measured.widthCm ?? '',{min:.1,step:.1,required:true}),height=num('confirm_h',measured.heightCm ?? '',{min:.1,step:.1,required:true});const alert=el('div',{class:'p-notice'},measured.reason || 'Ölçüyü elle teyit edin.');
        // Core has no application PATCH. A changed measurement must be entered by revision.
        result.append(alert,field('Teyit edilen en (cm)',width),field('Teyit edilen boy (cm)',height),button('Cm değerlerini teyit et',async()=>{
          if(!width.value||!height.value)throw Error('En ve boy değerlerini doldurun.');
          if(Number(width.value)!==measured.widthCm || Number(height.value)!==measured.heightCm){await openOrder(state.activeOrder.id,v.id);renderWizard(true);message('Ölçü değişikliği için uygulamanın cm alanlarını düzenleyip yeni sürüm açın.');return;}
          if(!measured.confirmationId)throw Error('Sunucu teyit kimliğini vermedi.');await api('teyitler/'+measured.confirmationId+'/coz',{});await openOrder(state.activeOrder.id,v.id);message('Ölçü teyidi kaydedildi.');
        },''));
      }else{await openOrder(state.activeOrder.id,v.id);message('Ölçü kaydedildi: '+formatNumber(measured.widthCm)+' × '+formatNumber(measured.heightCm)+' cm.');}
    },field('Düz çizim kütüphanesi',flat),text('Kütüphane kayıtlarının görsel indirme ucu henüz yok. Önizleme için aynı düz çizim dosyasını aşağıdan seçin; referans değerleri kütüphaneden gelir.'),el('div',{class:'p-grid'},field('Ürün önizleme dosyası',productImage),field('İsteğe bağlı desen önizleme dosyası',designImage),field('Yüklenmiş desen',source),field('Görsel türü',imageKind)),stage,el('div',{class:'p-grid'},field('Kutu eni (%)',boxWidth),field('Kutu boyu (%)',boxHeight),field('Referans uzunluğu (orijinal piksel)',referencePx),field('Referans uzunluğu (cm)',referenceCm),field('Referans açıklaması',refNote),field('Uygulama',kind),field('Konum',position)),submit('Ölçüyü hesapla ve kaydet'));
    const libraryFile=input('libraryFile',{type:'file',accept:'.png,.jpg,.jpeg',required:true}),libraryName=input('libraryName',{required:true}),libraryView=opts([['on','Ön'],['arka','Arka']],'on');
    const library=el('details',{},el('summary',{},'Kütüphaneye düz çizim yükle'),form(async()=>{const data=new FormData();data.append('file',libraryFile.files[0]);data.append('ad',libraryName.value);data.append('urun',line.product_key);data.append('gorunum',libraryView.value);await api('duz-cizimler',data);await loadCommon();await openOrder(state.activeOrder.id,v.id);},field('Çizim adı',libraryName),field('Görünüm',libraryView),field('PNG / JPG',libraryFile),submit('Kütüphaneye ekle')));
    host.append(f,result,library);return host;
  }
  function renderFiles(files,previews=false){
    const grid=el('div',{class:'p-files'});
    for(const file of files){const preview=el('div',{}),item=el('div',{class:'p-file'},el('h3',{},statusLabel(file.kind)),preview,el('div',{class:'p-actions'},button('İndir',()=>download(file)),previews?button('PDF önizle',async()=>{const u=blobUrl(await api('dosyalar/'+file.id,undefined,undefined,true));preview.replaceChildren(el('iframe',{src:u,title:statusLabel(file.kind)+' PDF önizlemesi'}));}):null));grid.append(item);}
    return grid;
  }
  async function download(file){const url=blobUrl(await api('dosyalar/'+file.id,undefined,undefined,true));const a=el('a',{href:url,download:(file.path?.split('/').pop() || file.kind+'-'+file.id)});document.body.append(a);a.click();a.remove();}
  function approvalDialog(v){
    const file=v.files.find(f=>f.kind==='onay_formu');if(!file)throw Error('Önce formları hazırlayın.');
    const dialog=el('dialog',{class:'production p-dialog'},el('h2',{},'Müşteri onayını kaydet'),text('Onayı kaydeden: '+session.user.name),text('Seçili dosya: '+statusLabel(file.kind)+' #'+file.id),button('Onay formunu indir',()=>download(file)));
    const selected=opts([[file.id,'Onay formu #'+file.id]],file.id);selected.disabled=true;dialog.append(field('Onay formu',selected),el('div',{class:'p-actions'},button('Onayı kaydet',async()=>{await api('surumler/'+v.id+'/onay',{fileId:file.id});dialog.close();dialog.remove();await openOrder(state.activeOrder.id,v.id);message('Müşteri onayı '+session.user.name+' adına kaydedildi.');},''),button('Vazgeç',()=>{dialog.close();dialog.remove();})));
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
  }
  function renderPackage(pack,v){
    if(!Array.isArray(pack.files))throw Error('Atölye paketi biçimi desteklenmiyor.');
    const ready=['onayli','onaylandi'].includes(v.status)&&pack.files.length>0;
    const messageBox=el('textarea',{readonly:true,'aria-label':'Atölye mesajı',value:pack.message || ''});
    const section=card(el('div',{class:'p-row p-between'},el('h3',{},'Atölye paketi'),badge(ready?'Atölye paketi hazır':'Onay / dosya bekleniyor',ready?'good':'warn')),messageBox,button('Mesajı kopyala',async()=>{try{await navigator.clipboard.writeText(messageBox.value);message('Atölye mesajı kopyalandı.');}catch{messageBox.focus();messageBox.select();message('Mesaj seçildi. Kopyalama kısayolunu kullanın.');}}));
    section.append(table(['Dosya','Durum','İşlem'],pack.files.map(file=>{const j=file.outbox;return [statusLabel(file.kind),badge(j?.status==='tamam'?'Gruba gönderildi':j?.status || 'Paket bekleniyor',j?.status==='tamam'?'good':null),el('div',{class:'p-row'},button('İndir',()=>download(file)),j?.status==='manuel_bekliyor'?button('Gruba gönderildi',async()=>{await api('outbox/'+j.id+'/elle-gonderildi',{});await openOrder(state.activeOrder.id,v.id);}):j&&['bekliyor','basarisiz'].includes(j.status)?button('Elle gönderime al',async()=>{await api('outbox/'+j.id+'/manuel',{});await openOrder(state.activeOrder.id,v.id);}):null,j&&['basarisiz','manuel_bekliyor'].includes(j.status)?button('Tekrar dene',async()=>{await api('outbox/'+j.id+'/tekrar',{});await openOrder(state.activeOrder.id,v.id);}):null)];})));
    content.append(section);
  }
  function renderCost(result,id,v){
    const section=card(el('h3',{},'Maliyet'));
    if(result.unavailable){section.append(text(result.error));content.append(section);return;}
    const c=adapt('cost',result.data),price=num('unitPrice',c.unitPrice ?? '',{required:true,min:.01,step:.01});
    section.append(badge(c.label),form(async()=>{await api('siparisler/'+id+'/fiyat',{unitPrice:Number(price.value),kdvDahil:false});await openOrder(id,v.id);message('Birim fiyat kaydedildi.');},field('Birim fiyat (TL, KDV hariç)',price),submit('Fiyatı kaydet')));
    if(c.missing?.length)section.append(text('Eksik alanlar: '+c.missing.join(', ')));if(c.lastError)section.append(text(c.lastError,'p-inline-error'));
    if(c.jobId)section.append(el('a',{href:'index.html',title:'İşler paneli'},'İşler panelini aç'),text('İşler sekmesinde '+(c.jobNo || c.jobId)+' kaydını açın. Kayıt kimliği: '+c.jobId));
    content.append(section);
  }
  async function movements(itemId,target){const rows=adapt('list',await api('stok/hareketler?itemId='+encodeURIComponent(itemId)));target.replaceChildren(table(['Tarih','İşlem','Miktar','Not'],rows.map(m=>[formatDate(m.created_at),statusLabel(m.type),formatKg(m.qty_milli==null?null:m.qty_milli/1000),m.note || '—'])));}
  function stockTable(){return table(['Kumaş / renk','Toplam','Ayrılan','Kullanılabilir','Teslim bekleyen','Tedarik bekleyen',''],state.stocks.map(s=>[el('div',{},el('strong',{},s.name || s.fabric_key),text(s.color_name || '—')),formatKg(s.total),formatKg(s.reserved),formatKg(s.available),formatKg(s.awaiting_delivery),formatKg(s.shortage),button('Hareketler',async()=>{const target=el('div',{});const dialog=el('dialog',{class:'production p-dialog'},el('h2',{},s.name+' / Hareketler'),target,button('Kapat',()=>dialog.close()));dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();await movements(s.id,target);})]));}
  async function renderStockTab(){
    await loadStocks();const invoices=await optional('fatura-satirlari');if(!session||state.tab!=='stock')return;
    const link=el('a',{href:'stok.html'+(new URLSearchParams(location.search).has('api')?'?api='+encodeURIComponent(endpoint):'')},'Kumaş tanımı ve sayım girişi');
    content.replaceChildren(card(el('h2',{},'Stok ve faturalar'),text('Teslim bekleyen miktar fiziksel stoğa dahil değildir.'),stockTable(),link));
    const section=card(el('h3',{},'Fatura satırları'));
    if(invoices.unavailable)section.append(text(invoices.error));else{const filter=opts([['','Tümü'],['teslim_bekliyor','Teslim bekliyor'],['teslim_alindi','Teslim alındı'],['teyit','Teyit gerekenler']],'');filter.setAttribute('aria-label','Fatura durumu');const list=el('div',{});const paint=rows=>{list.replaceChildren(...rows.map(raw=>invoiceCard(adapt('invoice',raw))));if(!rows.length)list.append(text('Henüz fatura satırı yok.'));};paint(adapt('list',invoices.data));filter.addEventListener('change',()=>run(async()=>paint(adapt('list',await api('fatura-satirlari'+(filter.value?'?durum='+filter.value:''))))));section.append(field('Duruma göre filtrele',filter),list);}content.append(section);
  }
  function invoiceCard(row){
    const item=stockOptions(row.item_id);item.required=true;const allocationRows=el('div',{});
    const addAllocation=(a={})=>{const line=num('orderLineId',a.orderLineId || '',{step:1,min:1,required:true}),qty=num('qtyKg',a.qtyMilli==null?'':a.qtyMilli/1000,{step:.001,min:.001,required:true});allocationRows.append(el('div',{class:'p-grid'},field('Sipariş satırı ID'+(a.orderNo?' · '+a.orderNo:''),line),field('Ayrılacak kg',qty),button('Dağıtımı kaldır',()=>line.closest('.p-grid').remove())));};row.allocations.forEach(addAllocation);
    const f=form(async()=>{const allocations=[...allocationRows.children].map(n=>({orderLineId:Number(n.querySelector('[name=orderLineId]').value),qtyMilli:Math.round(Number(n.querySelector('[name=qtyKg]').value)*1000)}));await api('fatura-satirlari/'+row.id+'/teslim',{itemId:Number(item.value),allocations});await renderStockTab();message('Teslim alındı. Kumaş defteri güncellendi.');},field('Eşleşen kalem / değiştir',item),el('details',{},el('summary',{},'Önerilen dağıtımı değiştir'),allocationRows,button('Siparişe dağıtım ekle',()=>addAllocation())),submit('Teslim alındı'));
    return card(el('div',{class:'p-row p-between'},el('h3',{},row.supplier || 'Tedarikçi belirtilmedi'),badge(row.delivery_status)),text(row.description || 'Açıklama yok'),text('Fatura: '+(row.invoice_no || row.source_invoice_id || '—')+' · '+formatKg(row.qty_milli==null?null:row.qty_milli/1000)),badge(row.match_status),text('Bağlı siparişler: '+(row.orders.join(', ') || 'Yok')),row.reasons?.length?el('div',{class:'p-notice'},row.reasons.join(' ')):null,row.delivery_status==='teslim_alindi'?text('Bu satır teslim alınmış.'):f);
  }
  async function renderLedger(){
    await loadStocks();if(!session)return;
    const type=input('tur',{required:true,placeholder:'Örn. iki iplik'}),color=input('renk',{required:true}),name=input('ad',{});
    content.replaceChildren(card(el('div',{class:'p-row p-between'},el('h2',{},'Kumaş kalemleri'),button('Yenile',renderLedger)),text('Açılış stoğunu sayımdan sonra girin. Sayım, toplam fiziksel miktarı kaydeder; kullanılabilir miktar ayırmalara göre hesaplanır.'),stockTable()));
    content.append(card(el('h3',{},'Yeni kumaş'),form(async()=>{await api('stok/kalemler',{tur:type.value.trim(),renk:color.value.trim(),ad:name.value.trim() || undefined,unit:'kg'});await renderLedger();message('Kumaş kalemi eklendi. Sayım yaparak fiziksel stoğu kaydedin.');},el('div',{class:'p-grid three'},field('Kumaş türü',type),field('Renk',color),field('Görünen ad (isteğe bağlı)',name)),submit('Yeni kumaşı kaydet'))));
    const counts=card(el('h3',{},'Sayım ve hareket geçmişi'));
    for(const s of state.stocks){const qty=num('countedKg','',{step:.001,required:true}),note=input('note',{required:true,placeholder:'Örn. Açılış sayımı'}),history=el('div',{});let countKey=null;
      const countForm=form(async()=>{if(!countKey)countKey=new Date().toISOString().slice(0,10)+'-'+crypto.randomUUID().slice(0,8);await api('stok/sayim',{itemId:s.id,countedKg:Number(qty.value),countKey,note:note.value.trim()});countKey=null;await renderLedger();message('Sayım kaydedildi.');},el('div',{class:'p-grid'},field('Sayılan kg',qty),field('Sayım notu',note)),submit('Sayımı kaydet'));
      counts.append(el('div',{class:'p-stock-item'},el('h3',{},(s.name || s.fabric_key)+' / '+(s.color_name || '—')),text('Defter toplamı: '+formatKg(s.total),'p-number'),s.unit==='kg'?el('div',{class:'p-stock-count'},countForm):text('Bu kalemin birimi kg değil; kg sayımı yapılamaz.'),el('details',{ontoggle:e=>{if(e.target.open&&!history.hasChildNodes())run(()=>movements(s.id,history));}},el('summary',{},'Hareket geçmişi'),history),editStockItem(s)));
    }
    if(!state.stocks.length)counts.append(text('Önce yeni bir kumaş tanımlayın.'));content.append(counts);
  }
  function editStockItem(s){
    const name=input('ad',{value:s.name || '',required:true}),colorNo=input('colorNo',{value:s.color_no || ''}),colorHex=input('colorHex',{value:s.color_hex || '',pattern:'#?[0-9a-fA-F]{6}'});
    return el('details',{},el('summary',{},'Kalem bilgilerini düzelt'),text('Tür, renk ve birim kalemin kimliğidir. Görünen ad ve kartela bilgileri düzeltilebilir.'),form(async()=>{
      await api('stok/kalemler/'+s.id,{ad:name.value.trim(),colorNo:colorNo.value.trim() || null,colorHex:colorHex.value.trim() || null},'PATCH');await renderLedger();message('Kalem bilgileri güncellendi.');
    },field('Görünen ad',name),field('Kartela renk no',colorNo),field('Renk kodu (HEX, isteğe bağlı)',colorHex),submit('Kalemi güncelle')));
  }
  async function renderConfirmations(){
    const [confirmations,jobs]=await Promise.all([api('teyitler?status=acik'),api('outbox')]);state.outbox=adapt('list',jobs);if(!session||state.tab!=='confirmations')return;
    content.replaceChildren(card(el('div',{class:'p-row p-between'},el('h2',{},'Teyit gerekenler'),button('Yenile',renderConfirmations)),text('İlgili kaydı kontrol edip düzeltmeyi yaptıktan sonra teyidi çözün.')));
    const groups=new Map();for(const c of adapt('list',confirmations)){if(!groups.has(c.kind))groups.set(c.kind,[]);groups.get(c.kind).push(c);}
    for(const [kind,rows] of groups)content.append(card(el('h3',{},statusLabel(kind)),...rows.map(c=>el('div',{class:'p-stock-item'},text(c.message,'p-ink'),text(formatDate(c.created_at)),el('div',{class:'p-row'},button('İlgili düzeltmeyi aç',()=>openConfirmation(c)),button('Çözüldü',async()=>{await api('teyitler/'+c.id+'/coz',{});await renderConfirmations();}))))));
    if(!groups.size)content.append(card(text('Açık teyit yok.')));
    const pending=state.outbox.filter(j=>['basarisiz','manuel_bekliyor'].includes(j.status));
    content.append(card(el('h3',{},'Bekleyen kuyruk işleri'),table(['İş / sürüm','Durum','Hata','İşlem'],pending.map(j=>[statusLabel(j.kind)+' / '+j.version_id,badge(j.status),j.last_error || '—',el('div',{class:'p-row'},button('Tekrar dene',async()=>{await api('outbox/'+j.id+'/tekrar',{});await renderConfirmations();}),j.status==='basarisiz'&&j.kind==='atolye_dosya'?button('Elle gönderime al',async()=>{await api('outbox/'+j.id+'/manuel',{});await renderConfirmations();}):null)]))));
  }
  async function openConfirmation(c){
    if(c.ref_table==='invoice_lines'||c.kind==='fatura_eslesme'){state.tab='stock';renderFrame();await renderStockTab();message('Fatura satırı #'+c.ref_id+' için eşleşme ve dağıtımı kontrol edin.');return;}
    if(c.ref_table==='stock_items'){location.href='stok.html?api='+encodeURIComponent(endpoint);return;}
    let versionId=c.ref_table==='order_versions'?c.ref_id:null;
    if(c.ref_table==='outbox')versionId=state.outbox.find(j=>j.id===c.ref_id)?.version_id;
    const orders=adapt('list',await api('siparisler'));
    for(const o of orders){const detail=await api('siparisler/'+o.id);const v=detail.versions.find(v=>v.id===versionId || (c.ref_table==='applications'&&v.lines.some(l=>l.applications.some(a=>a.id===c.ref_id))) || (c.ref_table==='files'&&v.files.some(f=>f.id===c.ref_id)) || (c.ref_table==='order_lines'&&v.lines.some(l=>l.id===c.ref_id)));
      if(v){state.tab='orders';renderFrame();await openOrder(o.id,v.id);message('Teyit #'+c.id+': '+c.message);return;}}
    state.tab='orders';renderFrame();await renderOrders();message('Bu teyidin kaydı için doğrudan bağlantı bulunamadı. Referans: '+c.ref_table+' #'+c.ref_id+'.',true);
  }
  window.addEventListener('pagehide',()=>{for(const u of objectUrls)URL.revokeObjectURL(u);});
  renderFrame();if(session)run(async()=>{await loadCommon();await renderTab();});
})(typeof window==='undefined'?globalThis:window);
