/* Shared production workbench and fabric ledger. No legacy stock credentials. */
(function (global) {
  'use strict';
  const SIZES = ['XS','S','M','L','XL','2XL','3XL','4XL'];
  // No recipe GET route exists. Copied from agent/operations/recipes.json (version 1).
  const PRODUCTS = {sweat:'Sweatshirt',tisort:'Tişört',polar:'Polar',polo:'Polo yaka',esofman:'Eşofman',sort:'Şort',tam_fermuar:'Tam fermuarlı',yarim_fermuar:'Yarım fermuarlı'};
  const POSITIONS = Object.freeze({gogus:'Göğüs',sirt:'Sırt',kol:'Kol',ense:'Ense',kapusan:'Kapüşon',kapuson:'Kapüşon',sol_gogus:'Sol göğüs',sag_gogus:'Sağ göğüs',sol_kol:'Sol kol',sag_kol:'Sağ kol'});
  const LABELS = {baski:'Baskı',nakis:'Nakış',taslak:'Taslak',onay_bekliyor:'Onay bekliyor',onaylandi:'Onaylandı',onayli:'Onaylı',eski:'Eski sürüm',iptal:'İptal',bekliyor:'Bekliyor',isleniyor:'İşleniyor',tamam:'Tamam',tamamlandi:'Tamamlandı',basarisiz:'Başarısız',manuel_bekliyor:'Elle gönderim bekliyor',elle_gonderildi:'Gruba gönderildi',gonderildi:'Gönderildi',fiyat_bekliyor:'Fiyat bekliyor',teslim_bekliyor:'Teslim bekliyor',teslim_alindi:'Teslim alındı',eslesti:'Eşleşti',teyit:'Teyit gerekli',olcu:'Ölçü',fatura_eslesme:'Fatura eşleşmesi',eksik_alan:'Eksik alan',baglanti_hatasi:'Bağlantı hatası',vektor_kalite:'Vektör kalitesi',eski_surum:'Eski sürüm',acilis:'Açılış',giris:'Giriş',cikis:'Çıkış',duzeltme:'Düzeltme',tahsis:'Ayırma',tahsis_iade:'Ayırma iadesi',onay_formu:'Onay formu',baski_formu:'Baskı formu',nakis_formu:'Nakış formu',uretim_formu:'Üretim formu',kesim_formu:'Kesim formu',dikim_formu:'Dikim formu',desen_vektor:'Vektör desen',desen_vektor_onizleme:'Vektör önizleme',urun_gorsel:'Ürün görseli',desen_kaynak:'Desen kaynağı',atolye_dosya:'Atölye dosyası',maliyet_aktarim:'Maliyet aktarımı'};
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function formatNumber(value) { return value==null || (typeof value==='string'&&!value.trim()) || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat('tr-TR',{maximumFractionDigits:3}).format(Number(value)); }
  function formatKg(value) { const n=formatNumber(value);return n==='—'?n:n+' kg'; }
  function formatDate(value) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('tr-TR').format(d); }
  function statusLabel(value) { return LABELS[value] || (value == null ? 'Bilgi yok' : String(value)); }
  function positionLabel(value) { return Object.hasOwn(POSITIONS,value) ? POSITIONS[value] : String(value ?? '—'); }
  function applicationLabel(a) {
    const head=statusLabel(a.kind)+' · '+positionLabel(a.position)+': ', measured=a.width_mm!=null && a.height_mm!=null;
    const tail=a.needs_confirmation ? ' · teyit gerekli' : '';
    if (!measured) return head+(a.needs_confirmation ? 'teyit gerekli' : 'Ölçü bekleniyor');
    return head+formatNumber(a.width_mm/10)+' × '+formatNumber(a.height_mm/10)+' cm'+tail;
  }
  function measureSource(a) { try { const m=typeof a.measure_source==='string' ? JSON.parse(a.measure_source) : a.measure_source; return m && typeof m==='object' ? m : {}; } catch { return {}; } }
  // Automatic measurement also supports the color-only path; confidence is 0..1.
  function measureSummary(a) {
    if (a.width_mm==null || a.height_mm==null) return null;
    const m=measureSource(a), size=formatNumber(a.width_mm/10)+' × '+formatNumber(a.height_mm/10)+' cm';
    if (!['otomatik','otomatik_renk'].includes(m.method)) return m.method==='elle' ? 'Elle ölçü: '+size : 'Ölçü: '+size;
    const parts=['Otomatik ölçü: '+size];
    if (m.method==='otomatik_renk') parts.push('desen dosyası olmadan, görseldeki renkten');
    if (m.refBeden) parts.push(m.refBeden+' bedene göre');
    const c=Number(m.confidence);
    if (m.confidence!=null && Number.isFinite(c)) parts.push('güven %'+Math.round(c<=1 ? c*100 : c));
    return parts.join(' · ');
  }
  // Why an application has no usable measurement, or null when it is measured.
  function measureGap(version,line,lineFilesList,a) {
    if (a && a.width_mm!=null && a.height_mm!=null) return null;
    if (!lineFilesList.some(f=>f.kind==='urun_gorsel')) return {code:'gorsel_eksik',text:'Ön görsel eksik'};
    if (!lineFilesList.some(f=>f.kind==='desen_kaynak' || f.kind==='desen_kaynak_vektor')) return {code:'desen_eksik',text:'Desen eksik'};
    return {code:'olculebilir',text:'Ölçü bekleniyor'};
  }
  const VECTOR_BADGES={hazirlaniyor:['Vektör hazırlanıyor…','warn'],hazir:['Vektörel PDF hazır','good'],teyit:['Kalite teyidi gerekli','warn'],hata:['Vektör hazırlanamadı','warn']};
  function vectorBadge(row) { const b=row && VECTOR_BADGES[row.status]; return b ? {label:b[0],tone:b[1],downloadable:!!row.previewFileId && ['hazir','teyit'].includes(row.status)} : null; }
  function reasonText(value) {
    if (Array.isArray(value)) return value.map(reasonText).filter(Boolean).join(' ');
    const raw=String(value ?? '').trim();
    // Vector confirmations include a prose prefix followed by the full report.
    const start=raw.indexOf('{');
    if(start>=0){try{const report=JSON.parse(raw.slice(start));return reasonText(report.reasons) || raw.slice(0,start).replace(/:\s*$/,'');}catch{}}
    return raw;
  }
  function vectorQuality(row) {
    if(row?.quality==='beklemede')return {label:'Kalite ölçüden sonra değerlendirilecek',tone:''};
    if(row?.quality==='iyi')return {label:'Kalite uygun',tone:'good'};
    if(row?.quality==='teyit')return {label:'Kalite teyidi gerekli',tone:'warn'};
    return null;
  }
  const VECTOR_POLL_MS=4000, VECTOR_POLL_MAX_MS=120000;
  function vectorPollNext(rows,elapsedMs) {
    if (!(rows||[]).some(r=>r.status==='hazirlaniyor')) return 'dur';
    return elapsedMs>=VECTOR_POLL_MAX_MS ? 'yenile' : 'bekle';
  }
  function packageActions(status) { return status==='manuel_bekliyor' ? [['Gruba gönderildi olarak işaretle','elle-gonderildi']] : status==='basarisiz' ? [['Tekrar dene','tekrar']] : status==='bekliyor' ? [['Elle gönderime al (otomatik gönderim kapalı)','manuel']] : []; }
  function parseNumber(value) {
    if(typeof value==='number'){if(Number.isFinite(value))return value;throw new RangeError('Geçerli bir sayı girin.');}
    let raw=String(value ?? '').trim().replace(/\s/g,'');
    if(!raw)return null;
    if(raw.includes(',')){if(!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(raw))throw new RangeError('Geçerli bir sayı girin (ör. 12,5).');raw=raw.replace(/\./g,'').replace(',','.');}
    else if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))throw new RangeError('Geçerli bir sayı girin (ör. 12,5).');
    const number=Number(raw);if(!Number.isFinite(number))throw new RangeError('Geçerli bir sayı girin.');return number;
  }
  function inputNumber(value){return value==null || value===''?'':new Intl.NumberFormat('tr-TR',{useGrouping:false,maximumFractionDigits:12}).format(parseNumber(value));}
  function validateNumber(value,{min=0,max,step='any',required=false}={}){
    const number=parseNumber(value);if(number==null){if(required)throw new RangeError('Bu sayı alanını doldurun.');return null;}
    if(number<Number(min) || (max!=null&&number>Number(max)))throw new RangeError('Sayı '+inputNumber(min)+(max!=null?' ile '+inputNumber(max)+' arasında':' veya daha büyük')+' olmalı.');
    if(step!=='any' && Math.abs((number-Number(min))/Number(step)-Math.round((number-Number(min))/Number(step)))>1e-7)throw new RangeError(Number(step)===1?'Adet tam sayı olmalı.':'Sayı '+inputNumber(step)+' adımlarına uygun olmalı.');
    return number;
  }
  function displayMessage(value){
    return String(value ?? '').split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&line!=='—').join('\n').replace(/\.[ \t]*,/g,';').replace(/\b(?:gogus|sirt|sol_gogus|sag_gogus|sol_kol|sag_kol)\b/g,key=>positionLabel(key)).replace(/\b(?:sweat|tisort|polar|polo|esofman|sort|tam_fermuar|yarim_fermuar)\b/g,key=>PRODUCTS[key]);
  }
  function positiveSizes(sizes){return Object.entries(sizes || {}).filter(([,qty])=>Number(qty)>0).map(([key,qty])=>key+': '+formatNumber(qty)).join(', ');}
  function unmatchedAwaitingKg(rows){return rows.filter(row=>row.delivery_status==='teslim_bekliyor' && row.unit==='kg' && (row.item_id==null||row.match_status!=='eslesti')).reduce((sum,row)=>sum+(Number(row.qty_milli)||0),0)/1000;}
  function queueFile(job){const payload=parseObject(job.payload_json ?? job.payload),file=payload.file || job.file || {};return {name:file.name || file.filename || file.path?.split(/[\\/]/).pop() || (file.id?'Dosya #'+file.id:''),kind:file.kind?statusLabel(file.kind):''};}
  function costApplications(c) { return (c.computation?.applications || []).map(a=>({type:a.type,area:a.area,qty:a.units,size:(c.bnItems || c.computation?.baskiNakisItems || []).find(i=>i.type===a.type&&i.area===a.area)?.size || ''})); }
  function pricePayload(price,items=[]) { return {unitPrice:validateNumber(price,{min:.01,step:.01,required:true}),...(items.length?{bnItems:items}:{})}; }
  function sizeTotal(sizes) { return SIZES.reduce((n,k) => { const q=Number(sizes?.[k] ?? 0); if (!Number.isSafeInteger(q) || q<0) throw new RangeError('Beden adetleri sıfır veya pozitif tam sayı olmalı.'); return n+q; },0); }
  function pixelBox(box, rendered, natural) {
    for (const value of [box.x,box.y,box.w,box.h,rendered.w,rendered.h,natural.w,natural.h]) if (!Number.isFinite(value)) throw new RangeError('Geçersiz piksel kutusu.');
    if ([box.w,box.h,rendered.w,rendered.h,natural.w,natural.h].some(v=>v<=0) || box.x<0 || box.y<0 || box.x+box.w>rendered.w+.01 || box.y+box.h>rendered.h+.01) throw new RangeError('Ölçü kutusu görselin içinde olmalı.');
    return {x:box.x*natural.w/rendered.w,y:box.y*natural.h/rendered.h,w:box.w*natural.w/rendered.w,h:box.h*natural.h/rendered.h};
  }
  function designRatio(w,h,source) {
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw new RangeError('Desen oranı okunamadı.');
    return {w,h,ratio:w/h,source};
  }
  function contentBounds(width,height,data,ignoreWhite=false) {
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||data.length!==width*height*4)throw new RangeError('Desen pikselleri okunamadı.');
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      if(!data[i+3]||(ignoreWhite&&data[i]>=250&&data[i+1]>=250&&data[i+2]>=250))continue;
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
    }
    return right<0?null:{x:left,y:top,w:right-left+1,h:bottom-top+1};
  }
  function fitDesignBox(width,ratio,natural,left=30,top=30) {
    if(!Number.isFinite(width)||!Number.isFinite(ratio)||ratio<=0||!natural||natural.w<=0||natural.h<=0)throw new RangeError('Önce ürün görselini ve desen oranını belirleyin.');
    const factor=natural.w/natural.h/ratio;
    const w=Math.max(Math.min(1,100/factor),Math.min(width,100,100/factor)),h=w*factor;
    return {w,h,left:Math.max(0,Math.min(left,100-w)),top:Math.max(0,Math.min(top,100-h))};
  }
  // Geometry is expressed in image percentages; the product's natural aspect is essential.
  function bindDesignBox(overlay,stage,width,height,getNatural,getRatio) {
    let drag=null;
    if(!overlay.style.left)overlay.style.left='30%';if(!overlay.style.top)overlay.style.top='30%';
    const apply=()=>{
      const natural=getNatural(),ratio=getRatio();if(!natural||!ratio)return false;
      let box;try{box=fitDesignBox(parseNumber(width.value),ratio.ratio,natural,parseFloat(overlay.style.left)||0,parseFloat(overlay.style.top)||0);}catch{return false;}
      for(const key of ['width','height','left','top'])overlay.style[key]=box[{width:'w',height:'h',left:'left',top:'top'}[key]]+'%';
      width.value=inputNumber(box.w);height.value=inputNumber(box.h);return true;
    };
    width.addEventListener('input',apply);
    overlay.addEventListener('pointerdown',e=>{
      if(!getRatio()||!getNatural())return;e.preventDefault();overlay.setPointerCapture(e.pointerId);
      const r=stage.getBoundingClientRect(),b=overlay.getBoundingClientRect();
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:b.left-r.left,top:b.top-r.top,w:b.width,h:b.height,r,resize:e.target.classList.contains('p-resize')};
    });
    overlay.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      const d=drag,dx=e.clientX-d.x,dy=e.clientY-d.y;
      if(d.resize){width.value=inputNumber((d.w+dx)/d.r.width*100);apply();}
      else{overlay.style.left=Math.max(0,Math.min(d.r.width-d.w,d.left+dx))/d.r.width*100+'%';overlay.style.top=Math.max(0,Math.min(d.r.height-d.h,d.top+dy))/d.r.height*100+'%';}
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])overlay.addEventListener(event,()=>drag=null);
    overlay.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||!getRatio()||!getNatural())return;
      e.preventDefault();const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
      if(e.shiftKey){width.value=inputNumber(parseNumber(width.value)+dx+dy);apply();}
      else{overlay.style.left=((parseFloat(overlay.style.left)||0)+dx)+'%';overlay.style.top=((parseFloat(overlay.style.top)||0)+dy)+'%';apply();}
    });
    return {apply,cancel(){drag=null;}};
  }
  // Never accept a page-size or target-size field as a report of source artwork bounds.
  function reportDesignRatio(file) {
    let report;try{report=parseObject(file?.vector_report ?? file?.report_json ?? file?.report);}catch{return null;}
    const box=report?.sourceBounds;
    if(!box)return null;
    try{return {...designRatio(box.w,box.h,'Sunucu vektör raporu'),box};}catch{return null;}
  }
  async function readDesignAsset(blob,{decode,pdf,report}={}) {
    const isPdf=blob.type==='application/pdf'||new TextDecoder().decode(await blob.slice(0,5).arrayBuffer())==='%PDF-';
    if(isPdf){
      try{return await pdf(blob);}catch(error){const fallback=reportDesignRatio(report);if(fallback)return fallback;throw Error('PDF oranı okunamadı. Oran bilinmiyor; desenin en ve boyunu teyit edin.');}
    }
    return decode(blob);
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
    if (kind==='cost') return {...value,label:['tamam','tamamlandi'].includes(value.status) ? 'Tamam' : value.status ? statusLabel(value.status) : 'Onay bekleniyor'};
    throw new TypeError('Bilinmeyen adaptör: '+kind);
  }
  function designApplication(line,fileId) {
    // The snapshot does not expose document_application_sources.file_id yet.
    return (line.applications || []).find(a=>{const m=measureSource(a);return Number(m.desenFileId ?? m.desenDosyaId)===Number(fileId);});
  }
  function lineFiles(version,lineId,metadata={}) {
    return (version.files || []).filter(file=>Number(file.line_id ?? metadata[file.id]?.lineId)===Number(lineId) || (version.lines.length===1 && file.line_id==null && !metadata[file.id]?.lineId));
  }
  function missingImages(version,metadata={}) {
    return (version.lines || []).filter(line=>!lineFiles(version,line.id,metadata).some(file=>file.kind==='urun_gorsel'));
  }
  function reconcileJobs(jobs,version){
    for(const job of jobs){if(job.versionId!==version?.id || !job.uploaded || job.kind!=='desen_kaynak')continue;const line=version.lines.find(line=>line.id===job.lineId);const application=line&&designApplication(line,job.uploaded.id);if(application)job.application=application;}
  }
  // Each job keeps completed stages, so retrying metadata never duplicates an uploaded file.
  async function uploadJobs(jobs,send,saveApplication) {
    for(const job of jobs){
      if(job.done)continue;
      try{
        if(!job.uploaded)job.uploaded=await send(job);
        if(job.kind==='desen_kaynak' && !job.application)job.application=await saveApplication(job);
        job.done=true;job.error='';
      }catch(error){job.error=error.message;}
    }
    return jobs.filter(job=>!job.done);
  }
  const pure={reasonText,vectorQuality,designRatio,contentBounds,fitDesignBox,bindDesignBox,reportDesignRatio,readDesignAsset,reconcileJobs,designApplication,lineFiles,missingImages,uploadJobs,parseNumber,inputNumber,validateNumber,displayMessage,positiveSizes,unmatchedAwaitingKg,queueFile,SIZES,PRODUCTS,POSITIONS,positionLabel,applicationLabel,measureSource,measureSummary,measureGap,vectorBadge,vectorPollNext,VECTOR_POLL_MS,packageActions,costApplications,pricePayload,escapeHtml,formatNumber,formatKg,formatDate,statusLabel,sizeTotal,pixelBox,adapt};
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
  const state={tab:'orders',stocks:[],flats:[],orders:[],outbox:[],confirmations:[],activeOrder:null,version:null,pending:[]};
  let fileMetadata={},vectorRows={},vectorTimer=null;
  function rememberFile(file,job){fileMetadata[file.id]={lineId:job.lineId,gorunum:job.gorunum,name:job.file.name};}
  async function sendJobs(jobs){reconcileJobs(jobs,state.version);for(const versionId of new Set(jobs.filter(job=>job.uploaded&&job.kind==='desen_kaynak'&&!job.application&&!job.done).map(job=>job.versionId))){try{reconcileJobs(jobs,await api('surumler/'+versionId));}catch(error){for(const job of jobs.filter(job=>job.versionId===versionId&&!job.done))job.error=error.message;return jobs.filter(job=>!job.done);}}const failed=await uploadJobs(jobs,async job=>{const data=new FormData();data.append('file',job.file);data.append('kind',job.kind);data.append('lineId',job.lineId);if(job.gorunum)data.append('gorunum',job.gorunum);const file=await api('surumler/'+job.versionId+'/dosyalar',data);rememberFile(file,job);return file;},job=>api('satirlar/'+job.lineId+'/uygulamalar',{kind:job.applicationKind,position:job.position,desenDosyaId:job.uploaded.id,measure_source:JSON.stringify({desenDosyaId:job.uploaded.id,dosyaAdi:job.file.name}),needs_confirmation:1}));state.pending=state.pending.filter(job=>!job.done);return failed;}
  function focusMedia(){document.getElementById('order-media')?.scrollIntoView({block:'start'});}
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
  const field=(label,node)=>{
    if(!node.hasAttribute('aria-label'))node.setAttribute('aria-label',label);
    if(node.type==='file'){
      node.hidden=true;const filename=el('span',{class:'p-file-name','aria-live':'polite'},'Dosya seçilmedi'),choose=button('Dosya seç',()=>node.click());
      node.addEventListener('change',()=>{filename.textContent=[...node.files].map(f=>f.name).join(', ') || 'Dosya seçilmedi';});
      node.addEventListener('invalid',event=>{event.preventDefault();choose.focus();message(label+' için dosya seçin.',true);});
      return el('div',{class:'p-field'},el('span',{},label),el('div',{class:'p-file-picker'},node,choose,filename));
    }
    return el('label',{class:'p-field'+(node.type==='checkbox'?' p-check':'')},label,node);
  };
  const input=(name,opts={})=>el('input',{name,...opts});
  const num=(name,value='',opts={})=>{
    const constraints={min:0,step:'any',...opts},node=input(name,{...opts,type:'text',inputmode:'decimal',value:inputNumber(value),'data-number':''});node._numberRules=constraints;
    const check=()=>{try{validateNumber(node.value,constraints);node.setCustomValidity('');}catch(error){node.setCustomValidity(error.message);}};
    node.addEventListener('input',check);node.addEventListener('blur',()=>{check();if(node.validity.valid)node.value=inputNumber(node.value);});check();return node;
  };
  const readNumber=node=>validateNumber(node.value,node._numberRules || {});
  const opts=(items,selected,empty)=>{
    const s=el('select',{});
    if (empty!=null) s.append(el('option',{value:''},empty));
    for(const [value,label] of items) { const o=el('option',{value},label); o.selected=String(value)===String(selected); s.append(o); }
    return s;
  };
  const badge=(s,tone)=>el('span',{class:'p-badge '+(tone ?? (/basarisiz|eski/.test(s)?'bad':/bekliyor|teyit/.test(s)?'warn':/tamam|onayli|onaylandi|gonderildi/.test(s)?'good':''))},statusLabel(s));
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
  const form=(fn,...children)=>{const f=el('form',{onsubmit:async e=>{e.preventDefault();if(f._busy)return;for(const node of f.querySelectorAll('[data-number]')){try{readNumber(node);node.setCustomValidity('');}catch(error){node.setCustomValidity(error.message);node.reportValidity();return;}}f._busy=true;try{await run(()=>fn(f),f.querySelector('[type=submit]'));}finally{f._busy=false;}}},...children);return f;};
  function table(headers,rows){const t=el('table',{class:'p-table'},el('thead',{},el('tr',{},headers.map(h=>el('th',{scope:'col'},h)))));const body=el('tbody',{});for(const row of rows)body.append(el('tr',{},row.map((c,i)=>el('td',{'data-label':headers[i]},c))));t.append(body);return rows.length?t:text('Henüz kayıt yok.');}
  function stockOptions(selected){return opts(state.stocks.map(s=>[s.id,(s.name || s.fabric_key)+' / '+(s.color_name || 'Renk yok')+' ('+formatKg(s.available)+')']),selected,'Kumaş kalemi seçin');}
  async function loadStocks(){state.stocks=adapt('list',await api('stok')).map(s=>adapt('stock',s));}
  async function loadCommon(){await loadStocks();if(mode==='production'){const f=await optional('duz-cizimler');state.flats=f.data?adapt('list',f.data):[];}}
  async function logout(){session=null;sessionStorage.removeItem(storageKey);clearUrls();state.stocks=[];state.orders=[];state.activeOrder=null;state.version=null;state.pending=[];fileMetadata={};renderFrame();}
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
      return [el('div',{},el('strong',{},o.order_no),text(o.customer_name || 'Müşteri belirtilmedi'),v&&missingImages(v,fileMetadata).length?badge('Görsel eksik','warn'):null),v?el('div',{},'v'+v.version_no,' ',badge(v.status)):'—',badge(stock.label,stock.tone),jobs.length?el('div',{},jobs.map(j=>el('div',{},badge(j.status)))):'Paket bekleniyor',costs[i].data?adapt('cost',costs[i].data).label:'Sunucu hazır değil',button('Aç',()=>openOrder(o.id))];
    }))));
  }
  function lineEditor(source={},index=0,media=false){
    const line=adapt('line',source),box=card(el('div',{class:'p-row p-between'},el('h3',{},'Ürün satırı '+(index+1))));box.classList.add('p-line');box._source=line;
    const product=opts(Object.entries(PRODUCTS),line.product_key || 'tisort');product.name='product_key';
    const fabric=stockOptions(line.fabric_item_id);fabric.name='fabric_item_id';fabric.required=true;
    const color=input('color_name',{value:line.color_name || '',required:true});fabric.addEventListener('change',()=>{const s=state.stocks.find(s=>String(s.id)===fabric.value);if(s?.color_name)color.value=s.color_name;});
    box.append(el('div',{class:'p-grid'},field('Ürün',product),field('Kumaş kalemi',fabric),field('Renk',color),field('Astar',el('input',{name:'lining',type:'checkbox',checked:line.lining===1||line.lining===true}))));
    const sizes=el('div',{class:'p-sizes'},SIZES.map(s=>field(s,num('size_'+s,line.sizes[s] || 0,{step:1,required:true}))));const total=text('Toplam: '+formatNumber(sizeTotal(line.sizes))+' adet','p-number');sizes.addEventListener('input',()=>{try{total.textContent='Toplam: '+formatNumber(sizeTotal(readSizes(box)))+' adet';}catch(e){total.textContent=e.message;}});box.append(sizes,total);
    const mat=el('details',{},el('summary',{},'Ek reçete malzemeleri (kaşkorse, ribana, astar)'),text('Ürünün reçetesindeki malzemeleri kaleme bağlayın. Eksik eşlemeler teyide düşer.'));
    for(const key of ['kaskorse','ribana','astar']){const s=stockOptions(line.material_items[key]);s.name='material_'+key;mat.append(field({kaskorse:'Kaşkorse',ribana:'Ribana',astar:'Astar'}[key],s));}box.append(mat);
    if(line.applications?.length){const apps=el('details',{},el('summary',{},'Mevcut uygulamaların cm ölçüleri'));line.applications.forEach((a,i)=>apps.append(el('div',{class:'p-grid'},field(statusLabel(a.kind)+' · '+positionLabel(a.position)+' en (cm)',num('app_w_'+i,a.width_mm==null?'':a.width_mm/10,{min:.1,step:.1})),field('Boy (cm)',num('app_h_'+i,a.height_mm==null?'':a.height_mm/10,{min:.1,step:.1})),field('Bu ölçüleri elle teyit ettim',input('app_confirm_'+i,{type:'checkbox'})))));box.append(apps);}
    if(media)box.append(newLineMedia(box));
    box.append(button('Satırı kaldır',()=>box.remove(),'secondary'));return box;
  }
  function selectedPreview(file){
    return el('div',{class:'p-selected-file'},file.type.startsWith('image/')?el('img',{src:blobUrl(file),alt:file.name}):el('a',{href:blobUrl(file),target:'_blank',rel:'noopener',class:'p-pdf-preview','aria-label':file.name+' PDF önizle'},el('span',{'aria-hidden':'true'},'▤'),el('span',{},'PDF önizle')),el('span',{},file.name));
  }
  function newLineMedia(box){
    box._uploads=[];const host=el('section',{class:'p-new-media'},el('h3',{},'Görseller ve desenler'),text('İsteğe bağlı: ön / arka ürün görseli ve birden fazla PNG / PDF desen ekleyin.'));
    const views=el('div',{class:'p-grid'});
    for(const [view,label] of [['on','Ön ürün görseli'],['arka','Arka ürün görseli']]){
      const file=input('image_'+view,{type:'file',accept:'.png,.jpg,.jpeg'}),preview=el('div',{});
      file.addEventListener('change',()=>{box._uploads=box._uploads.filter(job=>job.gorunum!==view);preview.replaceChildren();if(file.files[0]){box._uploads.push({file:file.files[0],kind:'urun_gorsel',gorunum:view});preview.append(selectedPreview(file.files[0]));}});
      views.append(el('div',{},field(label,file),preview));
    }
    const designs=input('designs',{type:'file',accept:'.png,.pdf',multiple:true}),rows=el('div',{});
    designs.addEventListener('change',()=>{
      for(const file of designs.files){const job={file,kind:'desen_kaynak',applicationKind:'baski',position:'gogus'},kind=opts([['baski','Baskı'],['nakis','Nakış']],'baski'),position=opts(['gogus','sirt','kol','ense','kapuson'].map(key=>[key,positionLabel(key)]),'gogus');box._uploads.push(job);
        kind.addEventListener('change',()=>job.applicationKind=kind.value);position.addEventListener('change',()=>job.position=position.value);
        const row=el('div',{class:'p-design-row'},selectedPreview(file),el('div',{class:'p-grid'},field('Uygulama · '+file.name,kind),field('Konum · '+file.name,position)),button('Deseni kaldır',()=>{box._uploads=box._uploads.filter(item=>item!==job);row.remove();}));rows.append(row);
      }designs.value='';designs.closest('.p-field').querySelector('.p-file-name').textContent='Eklenen desenler aşağıda';
    });
    host.append(views,field('Desenler (PNG / PDF, birden fazla)',designs),rows);return host;
  }
  function readSizes(box){return Object.fromEntries(SIZES.map(s=>[s,readNumber(box.querySelector('[name="size_'+s+'"]')) ?? 0]));}
  function readLine(box){const get=n=>box.querySelector('[name="'+n+'"]');const source=box._source,sizes=readSizes(box),quantity=sizeTotal(sizes);if(!quantity)throw Error('Her ürün satırında en az bir adet gerekli.');
    const line={...(source.id?{id:source.id}:{}),product_key:get('product_key').value,fabric_item_id:Number(get('fabric_item_id').value),color_name:get('color_name').value.trim(),sizes:adapt('sizesOut',sizes),quantity,lining:get('lining').checked,material_items:Object.fromEntries(['kaskorse','ribana','astar'].filter(k=>get('material_'+k).value).map(k=>[k,Number(get('material_'+k).value)]))};
    if(source.applications?.length)line.applications=source.applications.map((a,i)=>{const w=get('app_w_'+i).value?Math.round(readNumber(get('app_w_'+i))*10):null,h=get('app_h_'+i).value?Math.round(readNumber(get('app_h_'+i))*10):null;const confirmed=get('app_confirm_'+i).checked;if((w!==a.width_mm||h!==a.height_mm||a.needs_confirmation)&&!confirmed)throw Error('Uygulama ölçülerini kontrol edip elle teyit kutusunu işaretleyin.');return {...a,width_mm:w,height_mm:h,needs_confirmation:confirmed?0:a.needs_confirmation};});return line;
  }
  function renderWizard(revision=false){
    clearUrls();const v=state.version,o=state.activeOrder;
    let created=null;
    const openCreated=async()=>{try{await openOrder(created.id,created.version.id);focusMedia();const failed=state.pending.filter(job=>job.versionId===created.version.id&&!job.done);message(failed.length?'Sipariş oluşturuldu. '+failed.length+' dosya tamamlanamadı; aşağıdan yeniden yükleyin.':'Sipariş ve dosyalar kaydedildi. Ölçü adımına geçebilirsiniz.',failed.length>0);}catch(error){if(session)content.replaceChildren(card(el('h2',{},'Sipariş kaydedildi'),text('Sipariş ekranı açılamadı: '+error.message),button('Siparişi aç',openCreated)));throw error;}};
    const lines=el('div',{});(revision?v.lines:[{}]).forEach((line,i)=>lines.append(lineEditor(line,i,!revision)));
    const f=form(async f=>{
      if(created){await openCreated();return;}
      const data=[...lines.children].map(readLine);if(!data.length)throw Error('En az bir ürün satırı ekleyin.');
      if(revision){const fresh=await api('surumler/'+v.id+'/revizyon',{lines:data});await openOrder(o.id,fresh.id);}
      else {const selected=[...lines.children].map(box=>(box._uploads || []).map(job=>({...job})));const result=await api('siparisler',{order_no:f.elements.order_no.value.trim(),customer_name:f.elements.customer_name.value.trim(),job_no:f.elements.job_no.value.trim() || null,lines:data});created=result;const jobs=selected.flatMap((uploads,i)=>uploads.map(job=>({...job,lineId:result.version.lines[i].id,versionId:result.version.id})));state.pending.push(...jobs);await sendJobs(jobs);state.pending=state.pending.filter(job=>!job.done);await openCreated();}
    },card(el('div',{class:'p-step'},revision?'Revizyon / Yeni sürüm':'1 / Sipariş ve ürünler'),el('h2',{},revision?'Revizyon aç':'Yeni sipariş'),revision?text('Bu liste yeni sürümün tüm satırlarıdır. Değişen alanları düzenleyin; eski sürüm korunur.'):el('div',{class:'p-grid three'},field('Sipariş no',input('order_no',{required:true})),field('Müşteri',input('customer_name',{required:true})),field('İşler no (isteğe bağlı)',input('job_no',{})))),lines,button('Ürün satırı ekle',()=>lines.append(lineEditor({},lines.children.length,!revision))),el('div',{class:'p-actions'},submit(revision?'Yeni sürüm aç':'Siparişi oluştur'),button('Vazgeç',()=>revision?openOrder(o.id,v.id):renderOrders())));
    content.replaceChildren(f);
  }
  async function openOrder(id,versionId){
    clearUrls();clearTimeout(vectorTimer);const o=await api('siparisler/'+id);state.activeOrder=o;state.version=versionId?o.versions.find(v=>v.id===versionId):o.versions.at(-1);if(!state.version)throw Error('Sürüm bulunamadı.');
    const v=state.version;[state.outbox,state.confirmations]=await Promise.all([api('outbox').then(rows=>adapt('list',rows)),api('teyitler?status=acik').then(rows=>adapt('list',rows))]);const costs=await optional('siparisler/'+id+'/maliyet');if(!session||state.tab!=='orders')return;
    const selector=opts(o.versions.map(v=>[v.id,'v'+v.version_no+' · '+statusLabel(v.status)]),v.id);selector.setAttribute('aria-label','Sipariş sürümü');selector.addEventListener('change',()=>run(()=>openOrder(id,Number(selector.value))));
    content.replaceChildren(card(el('div',{class:'p-row p-between'},el('div',{},el('h2',{},o.order_no+' / '+(o.customer_name || 'Müşteri yok')),badge(v.status)),el('div',{class:'p-row'},button('Yenile',()=>openOrder(id,v.id)),button('Siparişlere dön',renderOrders))),field('Sürüm',selector)));
    const oldSent=o.versions.filter(old=>old.id!==v.id).some(old=>state.outbox.some(j=>j.version_id===old.id && j.kind==='atolye_dosya' && ['tamam','tamamlandi','elle_gonderildi'].includes(j.status)));
    if(oldSent || (v.status==='eski'&&state.outbox.some(j=>j.version_id===v.id&&j.kind==='atolye_dosya'&&['tamam','tamamlandi','elle_gonderildi'].includes(j.status))))content.append(el('div',{class:'p-notice'},'Eski sürüm atölyeye ulaştı. Atölyeye yeni sürümü gönderin.'));
    content.append(card(el('h3',{},'Ürünler'),table(['Ürün','Renk / kumaş','Bedenler','Adet','Uygulama'],v.lines.map(raw=>{const l=adapt('line',raw),s=state.stocks.find(s=>s.id===l.fabric_item_id);return [PRODUCTS[l.product_key] || l.product_key,(l.color_name || '—')+' / '+(s?.name || l.fabric_item_id || '—'),positiveSizes(l.sizes),formatNumber(l.quantity),el('div',{},l.applications.map(a=>text(applicationLabel(a))))];}))));
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
    const applicationKind=opts([['baski','Baskı'],['nakis','Nakış']],'baski'),position=opts(['gogus','sirt','kol','ense','kapuson'].map(key=>[key,positionLabel(key)]),'gogus');
    const file=input('file',{type:'file',accept:'.png,.jpg,.jpeg,.pdf',required:true});
    return form(async()=>{const job={versionId:v.id,lineId:line.id,file:file.files[0],kind:kind.value,...(kind.value==='urun_gorsel'?{gorunum:view.value}:{applicationKind:applicationKind.value,position:position.value})};state.pending.push(job);await sendJobs([job]);await openOrder(state.activeOrder.id,v.id);focusMedia();message(job.error || 'Dosya yüklendi.',!!job.error);},el('div',{class:'p-grid'},field('Dosya türü',kind),field('Görünüm',view),field('Desen uygulaması',applicationKind),field('Desen konumu',position),field('Dosya',file)),submit('Dosyayı yükle'));
  }
  function renderMedia(v){
    const section=card(el('div',{class:'p-step'},'2 / Görsel, desen ve ölçü'),el('h3',{},'Ürün dosyaları'));section.id='order-media';
    for(const l of v.lines){
      const det=el('details',{},el('summary',{},PRODUCTS[l.product_key]+' / '+(l.color_name || '')+' · Dosya ve ölçü ',missingImages(v,fileMetadata).some(line=>line.id===l.id)?badge('Görsel eksik','warn'):null));det.open=true;
      const failed=state.pending.filter(job=>job.versionId===v.id&&job.lineId===l.id&&!job.done);
      for(const job of failed)det.append(el('div',{class:'p-notice error'},text(job.file.name+': '+job.error,'p-inline-error'),button('Yeniden yükle',async()=>{await sendJobs([job]);await openOrder(state.activeOrder.id,v.id);focusMedia();})));
      const lf=lineFiles(v,l.id,fileMetadata),manual=el('details',{class:'p-manual'},el('summary',{},'Elle ölçü (yedek yol)'),measurementEditor(v,l));
      det.append(renderFiles(lf.filter(file=>['urun_gorsel','desen_kaynak','desen_kaynak_vektor'].includes(file.kind))),autoMeasureBlock(v,l,lf,manual),uploadForm(v,l),manual);section.append(det);
    }content.append(section);startVectorPolling(v);
  }
  function autoMeasureBlock(v,line,lf,manual){
    const box=el('div',{class:'p-auto'});
    const openManual=()=>{manual.open=true;manual.scrollIntoView?.({block:'center'});};
    for(const a of line.applications||[]){
      const row=el('div',{class:'p-auto-row'}),summary=measureSummary(a),gap=measureGap(v,line,lf,a),label=statusLabel(a.kind)+' · '+positionLabel(a.position);
      row.append(el('strong',{},label));
      if(summary)row.append(text(summary,'p-number'));
      if(a.needs_confirmation){
        const reason=reasonText(measureSource(a).reasons) || reasonText(state.confirmations.find(c=>c.kind==='olcu'&&c.ref_table==='applications'&&Number(c.ref_id)===Number(a.id))?.message);
        row.append(el('div',{class:'p-notice warn'},'Ölçü teyit gerektiriyor.'+(reason?' '+reason:'')),el('div',{class:'p-actions'},
          button('Ölçüyü onayla',async()=>{const list=adapt('list',await api('teyitler?status=acik')),c=list.find(c=>c.kind==='olcu'&&c.ref_table==='applications'&&Number(c.ref_id)===Number(a.id));
            if(!c)throw Error('Açık ölçü teyidi bulunamadı; sayfayı yenileyin.');await api('teyitler/'+c.id+'/coz',{});await openOrder(state.activeOrder.id,v.id);message('Ölçü teyidi kaydedildi.');}),
          button('Elle düzelt',async()=>openManual(),'secondary')));
      }else if(gap){
        row.append(text(gap.text,'p-muted'));
        if(gap.code==='olculebilir')row.append(button('Otomatik ölç',async()=>{await api('surumler/'+v.id+'/otomatik-olc',{});await openOrder(state.activeOrder.id,v.id);message('Otomatik ölçü çalıştı.');}));
      }else row.append(el('div',{class:'p-actions'},button('Elle düzelt',async()=>openManual(),'secondary')));
      box.append(row);
    }
    if(!(line.applications||[]).length){const gap=measureGap(v,line,lf,null);box.append(text(gap.text+(gap.code==='olculebilir'?' · Desen konumunu girin ya da elle ölçün.':''),'p-muted'));}
    return box;
  }
  function vectorHost(file){const host=el('div',{class:'p-vector','data-vector-source':String(file.id)});renderVector(host,file);return host;}
  function renderVector(host,file){
    const row=vectorRows[file.id],b=vectorBadge(row);host.replaceChildren();
    if(!b){host.append(text('Vektör durumu bilinmiyor','p-muted'));return;}
    host.append(badge(b.label,b.tone));
    const quality=vectorQuality(row);
    if(quality && quality.label!==b.label)host.append(badge(quality.label,quality.tone));
    if(row.quality==='teyit' || row.status==='teyit'){
      const confirmation=state.confirmations.find(c=>c.kind==='vektor_kalite'&&c.ref_table==='files'&&Number(c.ref_id)===Number(row.previewFileId));
      const reason=reasonText(row.reasons) || reasonText(confirmation?.message) || reasonText(row.message);
      if(reason)host.append(text(reason,'p-muted'));
    }
    if(row.status==='hata'&&row.message)host.append(text(row.message,'p-muted'));
    if(b.downloadable)host.append(button('Vektörel PDF indir',()=>download({id:row.previewFileId,kind:'desen_vektor_onizleme',path:'desen-'+file.id+'-vektor.pdf'})));
    if(vectorRows.timedOut&&row.status==='hazirlaniyor')host.append(button('Yenile',async()=>{vectorRows.timedOut=false;startVectorPolling(state.version);}));
  }
  function startVectorPolling(v){
    clearTimeout(vectorTimer);if(!v||v.status!=='taslak'||!v.files.some(f=>f.kind==='desen_kaynak'||f.kind==='desen_kaynak_vektor'))return;
    const started=Date.now(),versionId=v.id;
    const tick=async()=>{
      if(!session||state.version?.id!==versionId)return;
      let rows;try{rows=await api('surumler/'+versionId+'/vektor-durum');}catch{vectorTimer=setTimeout(tick,VECTOR_POLL_MS*2);return;}
      if(rows.some(r=>r.status==='teyit'||r.quality==='teyit')){try{state.confirmations=adapt('list',await api('teyitler?status=acik'));}catch{}}
      if(!session||state.version?.id!==versionId)return;
      vectorRows=Object.fromEntries(rows.map(r=>[r.sourceFileId,r]));
      const next=vectorPollNext(rows,Date.now()-started);vectorRows.timedOut=next==='yenile';
      for(const host of document.querySelectorAll('[data-vector-source]')){const file=v.files.find(f=>String(f.id)===host.dataset.vectorSource);if(file)renderVector(host,file);}
      if(next==='bekle')vectorTimer=setTimeout(tick,VECTOR_POLL_MS);
    };
    tick();
  }
  function measurementEditor(v,line){
    const host=el('section',{},el('h3',{},'Deseni yerleştir'));
    const flat=opts(state.flats.filter(f=>f.urun===line.product_key).map(f=>[f.id,f.ad+' / '+f.gorunum]),null,'Yerel düz çizim / fotoğraf');flat.name='flatId';
    const productImage=input('flatImage',{type:'file',accept:'.png,.jpg,.jpeg'});
    const image=el('img',{alt:'Ölçü referansı olan ürün görseli',hidden:true}),overlay=el('div',{class:'p-box',tabindex:0,role:'group','aria-label':'Desen kutusu. Ok tuşlarıyla taşıyın; Shift ve oklarla boyutlandırın.'});
    const handle=el('span',{class:'p-resize','aria-hidden':'true'},'↘');overlay.append(handle);
    const stage=el('div',{class:'p-stage'},image,overlay);let natural=null,ratio=null,selectedDesign='',selection=0,productSelection=0;
    const boxWidth=num('box_width',30,{max:100,min:0.000001,required:true}),boxHeight=num('box_height','',{max:100,min:0.000001});boxHeight.readOnly=true;overlay.hidden=true;boxWidth.disabled=true;
    const referencePx=num('refLengthPx','',{min:.1,step:.1}),referenceCm=num('refLengthCm','',{min:.1,step:.1}),refNote=input('refAciklama',{placeholder:'Örn. Ön beden eni'});
    const kind=opts([['baski','Baskı'],['nakis','Nakış']],'baski'),position=opts(Object.entries(POSITIONS),'gogus');
    const imageKind=opts([['flat','Düz çizim'],['photo','Fotoğraf / belirsiz görsel']],'flat');
    const source=opts(v.files.filter(f=>f.kind==='desen_kaynak'&&(lineFiles(v,line.id,fileMetadata).includes(f)||designApplication(line,f.id))).map(f=>[f.id,fileMetadata[f.id]?.name || 'Desen #'+f.id]),null,'Yüklenmiş desen seçin');source.required=true;
    const result=el('div',{'aria-live':'polite'});
    const ratioNote=text('Oran bilinmiyor. Yüklenmiş desen seçin.','p-ratio-note'),ratioConfirmation=el('div',{class:'p-ratio-confirm'});
    const sizing=bindDesignBox(overlay,stage,boxWidth,boxHeight,()=>natural,()=>ratio);
    function setRatio(value){ratio=value;overlay.hidden=!value;boxWidth.disabled=!value;ratioNote.textContent=value?'Oran desenden · '+value.source+' ('+formatNumber(value.w)+' × '+formatNumber(value.h)+')':'Oran bilinmiyor. Desenin en ve boyunu teyit edin.';sizing.apply();}
    function cropPreview(canvas,box){const crop=document.createElement('canvas');crop.width=box.w;crop.height=box.h;crop.getContext('2d').drawImage(canvas,box.x,box.y,box.w,box.h,0,0,box.w,box.h);return crop.toDataURL('image/png');}
    async function decodeDesign(blob){
      const img=el('img',{src:blobUrl(blob),alt:'Desen'});await img.decode();
      let value=designRatio(img.naturalWidth,img.naturalHeight,'Doğal görsel boyutu');
      if(blob.type==='image/png'){
        const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
        const box=contentBounds(canvas.width,canvas.height,ctx.getImageData(0,0,canvas.width,canvas.height).data);
        if(!box)throw Error('Desen tamamen saydam. Oran bilinmiyor; en ve boyu teyit edin.');
        value={...designRatio(box.w,box.h,'PNG saydamlık kutusu'),preview:cropPreview(canvas,box)};
      }
      return {...value,preview:value.preview||img.src};
    }
    async function decodePdf(blob){
      // Pinned pdf.js is loaded only for PDF sources. A network/library failure stays unknown.
      const lib=global.pdfjsLib||await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs');
      if(!global.pdfjsLib)lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs';
      const task=lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())});let doc;
      try{
        doc=await task.promise;const page=await doc.getPage(1),base=page.getViewport({scale:1});
        const viewport=page.getViewport({scale:Math.min(2,2400/Math.max(base.width,base.height))}),canvas=document.createElement('canvas');
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d',{willReadFrequently:true});
        await page.render({canvasContext:ctx,viewport,background:'rgb(255,255,255)'}).promise;
        const box=contentBounds(canvas.width,canvas.height,ctx.getImageData(0,0,canvas.width,canvas.height).data,true)||{x:0,y:0,w:canvas.width,h:canvas.height};
        return {...designRatio(box.w,box.h,'PDF ilk sayfa içerik kutusu'),preview:cropPreview(canvas,box)};
      }finally{await task.destroy();}
    }
    productImage.addEventListener('change',()=>run(async()=>{
      const ticket=++productSelection;natural=null;sizing.cancel();overlay.hidden=true;
      if(!productImage.files[0])return;
      const next=el('img',{src:blobUrl(productImage.files[0])});await next.decode();if(ticket!==productSelection)return;
      image.src=next.src;image.hidden=false;natural={w:next.naturalWidth,h:next.naturalHeight};stage.style.aspectRatio=natural.w+'/'+natural.h;overlay.hidden=!ratio;sizing.apply();
    }));
    source.addEventListener('change',()=>run(async()=>{
      const ticket=++selection,id=source.value;selectedDesign='';sizing.cancel();setRatio(null);boxHeight.value='';ratioConfirmation.replaceChildren();overlay.querySelectorAll('img,object').forEach(n=>n.remove());
      if(!id)return;
      const app=designApplication(line,id);if(app){kind.value=app.kind;position.value=app.position;}
      let blob;
      try{
        blob=await api('dosyalar/'+id,undefined,undefined,true);
        const value=await readDesignAsset(blob,{decode:decodeDesign,pdf:decodePdf,report:v.files.find(file=>String(file.id)===id)});
        if(ticket!==selection)return;selectedDesign=id;
        if(value.preview)overlay.prepend(el('img',{src:value.preview,alt:'Seçili desen'}));
        else overlay.prepend(el('object',{data:blobUrl(blob),type:'application/pdf','aria-label':'Seçili PDF desen'}));
        setRatio(value);
      }catch(error){
        if(ticket!==selection)return;ratioNote.textContent=error.message+' Oran bilinmiyor; en ve boyu teyit edin.';
        const w=num('ratio_confirm_w','',{min:.000001,required:true}),h=num('ratio_confirm_h','',{min:.000001,required:true});
        ratioConfirmation.replaceChildren(field('Teyit edilen desen eni (aynı birim)',w),field('Teyit edilen desen boyu (aynı birim)',h),button('Desen oranını teyit et',()=>{
          if(ticket!==selection||!blob)throw Error('Önce desen dosyasını seçin.');
          const value=designRatio(readNumber(w),readNumber(h),'Kullanıcı teyidi');selectedDesign=id;
          overlay.prepend(blob.type==='application/pdf'?el('object',{data:blobUrl(blob),type:'application/pdf','aria-label':'Teyit edilen desen önizlemesi'}):el('img',{src:blobUrl(blob),alt:'Teyit edilen desen'}));setRatio(value);ratioConfirmation.replaceChildren();
        }));
      }
    }));
    // A library record contains a filesystem path, not a browser-readable URL.
    flat.addEventListener('change',()=>{const f=state.flats.find(f=>f.id===flat.value);if(f){referencePx.value=inputNumber(f.refLengthPx);referenceCm.value=inputNumber(f.refLengthCm);refNote.value=f.refAciklama || '';}});
    const f=form(async()=>{
      if(!natural)throw Error('Ölçü için ürünün düz çizimini veya fotoğrafını seçin.');if(!source.value)throw Error('Önce bu satıra bir desen yükleyin ve seçin.');if(!ratio||selectedDesign!==source.value)throw Error('Oran bilinmiyor. Seçili desenin en ve boyunu teyit edin.');if(!sizing.apply())throw Error('Geçerli bir kutu eni girin.');
      if(flat.value){await api('duz-cizimler/'+encodeURIComponent(flat.value)+'/referans',{refLengthPx:readNumber(referencePx),refLengthCm:readNumber(referenceCm),refAciklama:refNote.value.trim()},'PUT');}
      const r=stage.getBoundingClientRect(),b=overlay.getBoundingClientRect(),designBoxPx=pixelBox({x:b.left-r.left,y:b.top-r.top,w:b.width,h:b.height},{w:r.width,h:r.height},natural);designBoxPx.h=designBoxPx.w/ratio.ratio;
      const existing=designApplication(line,source.value);const measured=adapt('measurement',await api(existing?'uygulamalar/'+existing.id:'uygulamalar/olc',{lineId:line.id,kind:kind.value,position:position.value,desenDosyaId:Number(source.value),...(flat.value?{flatId:flat.value}:{refLengthPx:readNumber(referencePx),refLengthCm:readNumber(referenceCm)}),designBoxPx,imageKind:imageKind.value},existing?'PATCH':'POST'));
      result.replaceChildren(text('Ölçü: '+formatNumber(measured.widthCm)+' × '+formatNumber(measured.heightCm)+' cm','p-number'));
      if(measured.needsConfirmation){const width=num('confirm_w',measured.widthCm ?? '',{min:.1,step:.1,required:true}),height=num('confirm_h',measured.heightCm ?? '',{min:.1,step:.1,required:true});const alert=el('div',{class:'p-notice'},measured.reason || 'Ölçüyü elle teyit edin.');
        // Keep changed manual confirmation values in the existing revision flow.
        result.append(alert,field('Teyit edilen en (cm)',width),field('Teyit edilen boy (cm)',height),button('Cm değerlerini teyit et',async()=>{
          if(!width.value||!height.value)throw Error('En ve boy değerlerini doldurun.');
          if(readNumber(width)!==measured.widthCm || readNumber(height)!==measured.heightCm){await openOrder(state.activeOrder.id,v.id);renderWizard(true);message('Ölçü değişikliği için uygulamanın cm alanlarını düzenleyip yeni sürüm açın.');return;}
          if(!measured.confirmationId)throw Error('Sunucu teyit kimliğini vermedi.');await api('teyitler/'+measured.confirmationId+'/coz',{});await openOrder(state.activeOrder.id,v.id);message('Ölçü teyidi kaydedildi.');
        },''));
      }else{await openOrder(state.activeOrder.id,v.id);message('Ölçü kaydedildi: '+formatNumber(measured.widthCm)+' × '+formatNumber(measured.heightCm)+' cm.');}
    },field('Düz çizim kütüphanesi',flat),text('Kütüphane kayıtlarının görsel indirme ucu henüz yok. Önizleme için aynı düz çizim dosyasını aşağıdan seçin; referans değerleri kütüphaneden gelir.'),el('div',{class:'p-grid'},field('Ürün önizleme dosyası',productImage),field('Yüklenmiş desen',source),field('Görsel türü',imageKind)),ratioNote,ratioConfirmation,stage,el('div',{class:'p-grid'},field('Kutu eni (%)',boxWidth),field('Kutu boyu (%) · Oran desenden',boxHeight),field('Referans uzunluğu (orijinal piksel)',referencePx),field('Referans uzunluğu (cm)',referenceCm),field('Referans açıklaması',refNote),field('Uygulama',kind),field('Konum',position)),submit('Ölçüyü hesapla ve kaydet'));
    const libraryFile=input('libraryFile',{type:'file',accept:'.png,.jpg,.jpeg',required:true}),libraryName=input('libraryName',{required:true}),libraryView=opts([['on','Ön'],['arka','Arka']],'on');
    const library=el('details',{id:'flat-library-'+line.id},el('summary',{},'Kütüphaneye düz çizim yükle'),form(async()=>{const data=new FormData();data.append('file',libraryFile.files[0]);data.append('ad',libraryName.value);data.append('urun',line.product_key);data.append('gorunum',libraryView.value);await api('duz-cizimler',data);await loadCommon();await openOrder(state.activeOrder.id,v.id);},field('Çizim adı',libraryName),field('Görünüm',libraryView),field('PNG / JPG',libraryFile),submit('Kütüphaneye ekle')));
    if(!state.flats.some(flat=>flat.urun===line.product_key))host.append(el('div',{class:'p-notice'},text('Önce düz çizim ekleyin.'),el('a',{href:'#flat-library-'+line.id,onclick:()=>{library.open=true;}},'Düz çizim yükleme / referans ekranını aç')));
    host.append(f,result,library);return host;
  }
  function renderFiles(files,previews=false){
    const grid=el('div',{class:'p-files'});
    for(const file of files){const preview=el('div',{}),item=el('div',{class:'p-file'},el('h3',{},statusLabel(file.kind)),text(fileMetadata[file.id]?.name || file.path?.split('/').pop() || 'Dosya #'+file.id),preview,['desen_kaynak','desen_kaynak_vektor'].includes(file.kind)?vectorHost(file):null,el('div',{class:'p-actions'},button('İndir',()=>download(file)),previews?button('PDF önizle',async()=>{const u=blobUrl(await api('dosyalar/'+file.id,undefined,undefined,true));preview.replaceChildren(el('iframe',{src:u,title:statusLabel(file.kind)+' PDF önizlemesi'}));}):null));grid.append(item);}
    for(const [i,file] of files.entries()){
      if(!['desen_kaynak','urun_gorsel'].includes(file.kind)||!/\.(png|jpe?g)$/i.test(file.path||fileMetadata[file.id]?.name||''))continue;
      api('dosyalar/'+file.id,undefined,undefined,true).then(blob=>{const slot=grid.children[i]?.children[2];if(slot)slot.replaceChildren(el('img',{class:'p-thumb',src:blobUrl(blob),alt:'Küçük önizleme'}));}).catch(()=>{});
    }
    return grid;
  }
  async function download(file){const url=blobUrl(await api('dosyalar/'+file.id,undefined,undefined,true));const a=el('a',{href:url,download:(file.path?.split('/').pop() || file.kind+'-'+file.id)});document.body.append(a);a.click();a.remove();}
  function approvalDialog(v){
    const file=v.files.find(f=>f.kind==='onay_formu');if(!file)throw Error('Önce formları hazırlayın.');
    const dialog=el('dialog',{class:'production p-dialog','aria-labelledby':'approval-title'},el('h2',{id:'approval-title'},'Müşteri onayını kaydet'),text('Onayı kaydeden: '+session.user.name),text('Seçili dosya: '+statusLabel(file.kind)+' #'+file.id),button('Onay formunu indir',()=>download(file)));
    const selected=opts([[file.id,'Onay formu #'+file.id]],file.id);selected.disabled=true;dialog.append(field('Onay formu',selected),el('div',{class:'p-actions'},button('Onayı kaydet',async()=>{await api('surumler/'+v.id+'/onay',{fileId:file.id});dialog.close();dialog.remove();await openOrder(state.activeOrder.id,v.id);message('Müşteri onayı '+session.user.name+' adına kaydedildi.');},''),button('Vazgeç',()=>{dialog.close();dialog.remove();})));
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
  }
  function renderPackage(pack,v){
    if(!Array.isArray(pack.files))throw Error('Atölye paketi biçimi desteklenmiyor.');
    const ready=['onayli','onaylandi'].includes(v.status)&&pack.files.length>0;
    const messageBox=el('textarea',{readonly:true,'aria-label':'Atölye mesajı',value:pack.message || ''});
    const section=card(el('div',{class:'p-row p-between'},el('h3',{},'Atölye paketi'),badge(ready?'Atölye paketi hazır':'Onay / dosya bekleniyor',ready?'good':'warn')),messageBox,button('Mesajı kopyala',async()=>{try{await navigator.clipboard.writeText(messageBox.value);message('Atölye mesajı kopyalandı.');}catch{messageBox.focus();messageBox.select();message('Mesaj seçildi. Kopyalama kısayolunu kullanın.');}}));
    section.append(table(['Dosya','Durum','İşlem'],pack.files.map(file=>{const j=file.outbox;return [statusLabel(file.kind),badge(j?.status==='tamam'?'Gruba gönderildi':j?.status || 'Paket bekleniyor',j?.status==='tamam'?'good':null),el('div',{class:'p-row'},button('İndir',()=>download(file)),packageActions(j?.status).map(([label,action])=>button(label,async()=>{await api('outbox/'+j.id+'/'+action,{});await openOrder(state.activeOrder.id,v.id);})))];})));
    content.append(section);
  }
  function renderCost(result,id,v){
    const section=card(el('h3',{},'Maliyet'));
    if(result.unavailable){section.append(text(result.error));content.append(section);return;}
    const c=adapt('cost',result.data),price=num('unitPrice',c.unitPrice ?? '',{required:true,min:.01,step:.01});
    const applications=costApplications(c).map((a,i)=>{const size=input('cost_size_'+i,{value:a.size,required:true,placeholder:'Örn. Orta Boyut'});return {a,size,node:field(statusLabel(a.type)+' · '+positionLabel(a.area).charAt(0).toLocaleUpperCase('tr')+positionLabel(a.area).slice(1)+' ('+formatNumber(a.qty)+' adet) maliyet boyutu',size)};});
    section.append(text('Durum: '+c.label),form(async()=>{await api('siparisler/'+id+'/fiyat',pricePayload(price.value,applications.map(({a,size})=>({...a,size:size.value.trim()}))));await openOrder(id,v.id);message('Birim fiyat kaydedildi.');},field('Birim fiyat (TL, KDV hariç)',price),applications.length?text('Baskı ve nakış boyutlarını maliyet şablonundaki adlarıyla girin (ör. Küçük Boyut, Orta Boyut).'):null,applications.map(a=>a.node),submit('Fiyatı kaydet')));
    if(c.missing?.length){const missing=c.missing.map(displayMessage).filter(Boolean);if(missing.length)section.append(el('div',{},text('Eksik alanlar:'),el('ul',{},missing.map(item=>el('li',{},item)))));}if(c.lastError)section.append(text(displayMessage(c.lastError),'p-inline-error p-message'));
    if(!c.jobId)section.append(text('İşler kaydı: Henüz oluşturulmadı.'));
    if(c.jobId)section.append(el('a',{href:'index.html',title:'İşler paneli'},'İşler panelini aç'),text('İşler sekmesinde '+(c.jobNo || c.jobId)+' kaydını açın. Kayıt kimliği: '+c.jobId));
    content.append(section);
  }
  async function movements(itemId,target){const rows=adapt('list',await api('stok/hareketler?itemId='+encodeURIComponent(itemId)));target.replaceChildren(table(['Tarih','İşlem','Miktar','Not'],rows.map(m=>[formatDate(m.created_at),statusLabel(m.type),formatKg(m.qty_milli==null?null:m.qty_milli/1000),m.note || '—'])));}
  function stockTable(){return table(['Kumaş / renk','Toplam','Ayrılan','Kullanılabilir','Teslim bekleyen','Tedarik bekleyen',''],state.stocks.map(s=>[el('div',{},el('strong',{},s.name || s.fabric_key),text(s.color_name || '—')),formatKg(s.total),formatKg(s.reserved),formatKg(s.available),formatKg(s.awaiting_delivery),formatKg(s.shortage),button('Hareketler',async()=>{const target=el('div',{});const dialog=el('dialog',{class:'production p-dialog'},el('h2',{},s.name+' / Hareketler'),target,button('Kapat',()=>dialog.close()));dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();await movements(s.id,target);})]));}
  async function renderStockTab(){
    await loadStocks();const invoices=await optional('fatura-satirlari');if(!session||state.tab!=='stock')return;
    const link=el('a',{href:'stok.html'+(new URLSearchParams(location.search).has('api')?'?api='+encodeURIComponent(endpoint):'')},'Kumaş tanımı ve sayım girişi');
    content.replaceChildren(card(el('h2',{},'Stok ve faturalar'),text('Teslim bekleyen miktar fiziksel stoğa dahil değildir.'),stockTable(),link));
    const section=card(el('h3',{},'Fatura satırları'));if(!invoices.unavailable)content.firstElementChild.insertBefore(el('div',{class:'p-notice'},'Eşleşmemiş teslim bekleyen: '+formatKg(unmatchedAwaitingKg(adapt('list',invoices.data)))+' (teyit gerekli)'),content.firstElementChild.children[1]);
    if(invoices.unavailable)section.append(text(invoices.error));else{const filter=opts([['','Tümü'],['teslim_bekliyor','Teslim bekliyor'],['teslim_alindi','Teslim alındı'],['teyit','Teyit gerekenler']],'');filter.setAttribute('aria-label','Fatura durumu');const list=el('div',{});const paint=rows=>{list.replaceChildren(...rows.map(raw=>invoiceCard(adapt('invoice',raw))));if(!rows.length)list.append(text('Henüz fatura satırı yok.'));};paint(adapt('list',invoices.data));filter.addEventListener('change',()=>run(async()=>paint(adapt('list',await api('fatura-satirlari'+(filter.value?'?durum='+filter.value:''))))));section.append(field('Duruma göre filtrele',filter),list);}content.append(section);
  }
  function invoiceCard(row){
    const item=stockOptions(row.item_id);item.required=true;const allocationRows=el('div',{});
    const addAllocation=(a={})=>{const line=num('orderLineId',a.orderLineId || '',{step:1,min:1,required:true}),qty=num('qtyKg',a.qtyMilli==null?'':a.qtyMilli/1000,{step:.001,min:.001,required:true});allocationRows.append(el('div',{class:'p-grid'},field('Sipariş satırı ID'+(a.orderNo?' · '+a.orderNo:''),line),field('Ayrılacak kg',qty),button('Dağıtımı kaldır',()=>line.closest('.p-grid').remove())));};row.allocations.forEach(addAllocation);
    const f=form(async()=>{const allocations=[...allocationRows.children].map(n=>({orderLineId:readNumber(n.querySelector('[name=orderLineId]')),qtyMilli:Math.round(readNumber(n.querySelector('[name=qtyKg]'))*1000)}));await api('fatura-satirlari/'+row.id+'/teslim',{itemId:Number(item.value),allocations});await renderStockTab();message('Teslim alındı. Kumaş defteri güncellendi.');},field('Eşleşen kalem / değiştir',item),el('details',{},el('summary',{},'Önerilen dağıtımı değiştir'),allocationRows,button('Siparişe dağıtım ekle',()=>addAllocation())),submit('Teslim alındı'));
    return card(el('div',{class:'p-row p-between'},el('h3',{},row.supplier || 'Tedarikçi belirtilmedi'),badge(row.delivery_status)),text(row.description || 'Açıklama yok'),text('Fatura: '+(row.invoice_no || row.source_invoice_id || '—')+' · '+formatKg(row.qty_milli==null?null:row.qty_milli/1000)),badge(row.match_status),text('Bağlı siparişler: '+(row.orders.join(', ') || 'Yok')),row.reasons?.length?el('div',{class:'p-notice'},row.reasons.join(' ')):null,row.delivery_status==='teslim_alindi'?text('Bu satır teslim alınmış.'):f);
  }
  async function renderLedger(){
    await loadStocks();if(!session)return;
    const type=input('tur',{required:true,placeholder:'Örn. iki iplik'}),color=input('renk',{required:true}),name=input('ad',{});
    content.replaceChildren(card(el('div',{class:'p-row p-between'},el('h2',{},'Kumaş kalemleri'),button('Yenile',renderLedger)),text('Açılış stoğunu sayımdan sonra girin. Sayım, toplam fiziksel miktarı kaydeder; kullanılabilir miktar ayırmalara göre hesaplanır.'),stockTable()));
    content.append(card(el('h3',{},'Yeni kumaş'),form(async()=>{await api('stok/kalemler',{tur:type.value.trim(),renk:color.value.trim(),ad:name.value.trim() || undefined,unit:'kg'});await renderLedger();message('Kumaş kalemi eklendi. Sayım yaparak fiziksel stoğu kaydedin.');},el('div',{class:'p-grid three'},field('Kumaş türü',type),field('Renk',color),field('Görünen ad (isteğe bağlı)',name)),submit('Yeni kumaşı kaydet'))));
    const counts=card(el('h3',{},'Sayım ve hareket geçmişi'));
    for(const s of state.stocks){const qty=num('countedKg','',{step:.001,required:true}),note=input('note',{required:true,placeholder:'Örn. Açılış sayımı'}),history=el('div',{});let countKey=null;
      const countForm=form(async()=>{if(!countKey)countKey=new Date().toISOString().slice(0,10)+'-'+crypto.randomUUID().slice(0,8);await api('stok/sayim',{itemId:s.id,countedKg:readNumber(qty),countKey,note:note.value.trim()});countKey=null;await renderLedger();message('Sayım kaydedildi.');},el('div',{class:'p-grid'},field('Sayılan kg',qty),field('Sayım notu',note)),submit('Sayımı kaydet'));
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
    for(const [kind,rows] of groups)content.append(card(el('h3',{},statusLabel(kind)),...rows.map(c=>el('div',{class:'p-stock-item'},displayMessage(c.message)?text(displayMessage(c.message),'p-ink p-message'):null,formatDate(c.created_at)!=='—'?text(formatDate(c.created_at)):null,el('div',{class:'p-row'},button('İlgili düzeltmeyi aç',()=>openConfirmation(c)),button('Çözüldü',async()=>{await api('teyitler/'+c.id+'/coz',{});await renderConfirmations();}))))));
    if(!groups.size)content.append(card(text('Açık teyit yok.')));
    const pending=state.outbox.filter(j=>['basarisiz','manuel_bekliyor','bekliyor'].includes(j.status));
    content.append(card(el('h3',{},'Bekleyen kuyruk işleri'),pending.length?pending.map(j=>{
      const file=queueFile(j),actions=j.kind==='atolye_dosya'?packageActions(j.status):(j.status==='basarisiz'?[['Tekrar dene','tekrar']]:[]);
      return el('div',{class:'p-stock-item'},el('h3',{},statusLabel(j.kind)+(j.version_id?' / Sürüm '+j.version_id:'')),badge(j.status),file.name?text('Dosya: '+file.name):null,file.kind?text('Dosya türü: '+file.kind):null,displayMessage(j.last_error)?text('Hata: '+displayMessage(j.last_error),'p-inline-error p-message'):null,actions.length?el('div',{class:'p-actions'},actions.map(([label,action])=>button(label,async()=>{await api('outbox/'+j.id+'/'+action,{});await renderConfirmations();}))):null);
    }):text('Bekleyen kuyruk işi yok.')));
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
