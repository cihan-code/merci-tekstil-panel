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
  function measureContext(a,line={}) {
    const m=measureSource(a),parts=[];
    const flat=(line.kalipAdaylari || []).find(f=>String(f.id)===String(line.kalipId));
    const name=m.flatAd || flat?.ad,beden=m.refBeden || flat?.refBeden;
    if(name)parts.push('Kalıp: '+name+(beden?' ('+beden+')':''));
    if(typeof m.summary==='string' && m.summary.trim())parts.push(m.summary.trim());
    else {
      if(typeof m.sleeveMethod==='string' && m.sleeveMethod.trim())parts.push('Kol ölçümü: '+m.sleeveMethod);
      if(typeof m.scaleFrom==='string' && m.scaleFrom.trim())parts.push('Ölçek: '+m.scaleFrom);
    }
    return parts.join(' · ');
  }
  // Why an application has no usable measurement, or null when it is measured.
  function measureGap(version,line,lineFilesList,a) {
    if (a && a.width_mm!=null && a.height_mm!=null) return null;
    if (!lineFilesList.some(f=>f.kind==='urun_gorsel')) return {code:'gorsel_eksik',text:'Ön görsel eksik'};
    if (!lineFilesList.some(f=>f.kind==='desen_kaynak' || f.kind==='desen_kaynak_vektor')) return {code:'desen_eksik',text:'Desen eksik'};
    return {code:'olculebilir',text:'Ölçü bekleniyor'};
  }
  const NO_VECTORIZER=/^Vektörleştirme bu sunucuda yok:?\s*/;
  // Every source shows a stated vector state; a missing row means the server record is still being created.
  function vectorBadge(row,file) {
    if(!row)return {label:'Vektör kaydı bekleniyor…',tone:'warn',downloadable:false};
    const downloadable=!!row.previewFileId && ['hazir','teyit'].includes(row.status);
    if(row.status==='hazirlaniyor')return {label:'Vektör hazırlanıyor…',tone:'warn',downloadable:false};
    if(row.status==='hazir'){
      // Previews made before the server stated the source kind: only raster files are known to be traced.
      const traced=row.sourceKind ? row.sourceKind==='raster' : /\.(png|jpe?g)$/i.test(file?.path || '');
      return {label:traced?'Vektöre çevrildi':row.sourceKind==='vector'?'Vektörel':'Vektörel PDF hazır',tone:'good',downloadable};
    }
    if(row.status==='teyit')return {label:'Teyit gerekli',tone:'warn',downloadable};
    if(row.status==='hata')return {label:NO_VECTORIZER.test(row.message || '')?'Vektörleştirme bu sunucuda yok':'Vektör hazırlanamadı',tone:'warn',downloadable:false};
    if(row.status==='yok')return {label:'Vektör kaydı yok',tone:'warn',downloadable:false};
    return {label:'Vektör durumu: '+String(row.status),tone:'warn',downloadable:false};
  }
  // Server quality codes become Turkish sentences; full sentences pass through unchanged.
  const VECTOR_REASONS={raster_detay_ve_metin_gorsel_teyidi:'Görselden çevrildi; ince detay ve yazılar gözle kontrol edilmeli.',karma_sayfada_raster_korundu:'PDF içindeki piksel görsel vektöre çevrilmedi.',cok_yol:'Çok sayıda yol var (2000 üstü).',ince_cizgi:'0,2 mm’den ince çizgi var.',metin:'PDF yazı içeriyor; yazılar eğriye çevrilmeli.',dolgu_detay_kalinligi_olculemedi:'Dolgu detaylarının kalınlığı ölçülemedi.',supheli_oran:'Desenin en-boy oranı olağan dışı.',oran_bozuldu:'Hedef ölçü desenin en-boy oranını değiştiriyor.'};
  function vectorDetail(row,confirmationMessage) {
    if(!row)return '';
    if(row.status==='teyit' || row.quality==='teyit'){
      const codes=(row.reasons || []).map(r=>VECTOR_REASONS[r] ?? r);
      return reasonText(codes) || reasonText(confirmationMessage) || reasonText(row.message);
    }
    if(['hata','yok'].includes(row.status))return String(row.message || '').replace(NO_VECTORIZER,'');
    return '';
  }
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
  function vectorPollNext(rows,elapsedMs,sourceIds=[]) {
    const known=new Set((rows||[]).map(r=>Number(r.sourceFileId)));
    if (!(rows||[]).some(r=>r.status==='hazirlaniyor') && sourceIds.every(id=>known.has(Number(id)))) return 'dur';
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
  // Inline manual size: cm with one decimal on screen, integer mm on the wire.
  function designFileId(a) { const m=measureSource(a);return a.desenDosyaId ?? m.desenFileId ?? m.desenDosyaId ?? null; }
  function designAspect(a,vectorRow) {
    const m=measureSource(a),box=vectorRow?.designBox;
    for(const ratio of [Number(m.designAspectRatio),box?Number(box.w)/Number(box.h):NaN])if(Number.isFinite(ratio)&&ratio>0)return ratio;
    return null;
  }
  function lockedSize(changed,value,ratio) {
    const n=parseNumber(value);
    if(n==null || n<=0 || !(ratio>0))return null;
    return changed==='width' ? {width:n,height:Math.round(n*10/ratio)/10} : {width:Math.round(n*10*ratio)/10,height:n};
  }
  function manualSaveBody(width,height) {
    const w=validateNumber(width,{min:.1,step:.1,required:true}),h=validateNumber(height,{min:.1,step:.1,required:true});
    return {width_mm:Math.round(w*10),height_mm:Math.round(h*10),elleTeyit:true};
  }
  const RASTER_EXT=/\.(png|jpe?g)$/i;
  const PDF_EXT=/\.pdf$/i;
  const APPLICATION_POSITIONS=['gogus','sirt','kol','ense','kapuson'];
  const fileName=file=>file.path || file.name || '';
  function currentProductImage(a,image,files,metadata){
    const view=f=>f.gorunum || metadata[f.id]?.gorunum;
    const latest=(...views)=>files.filter(f=>f.kind==='urun_gorsel' && views.includes(view(f))).reduce(
      (last,f)=>!last || Number(f.id)>Number(last.id)?f:last,null);
    const imageView=view(image),recordedView=measureSource(a).selectedView;
    if(imageView && recordedView && imageView!==recordedView)return false;
    const position=a.position;
    let active;
    if(['kol','sol_kol','sag_kol'].includes(position))active=latest('kol') || latest('on') || latest('arka');
    else if(position==='teyit')active=latest('on','arka');
    else if(recordedView || imageView)active=latest(recordedView || imageView);
    if(files.some(f=>f.kind==='urun_gorsel' && !view(f) && Number(f.id)>Number(image.id)))return false;
    return !active || String(active.id)===String(image.id);
  }
  // Retain the measured coordinates. A typed size never changes the found placement.
  function previewBox(a,files=[],line={},metadata={}) {
    const m=measureSource(a),box=m.designBoxPx || m.candidateBoxPx,w=m.rasterWidth,h=m.rasterHeight;
    const image=files.find(f=>m.gorselFileId!=null && String(f.id)===String(m.gorselFileId) && f.kind==='urun_gorsel');
    if(!image || !RASTER_EXT.test(fileName(image)) || a.olcuHatasi || image.olcuHatasi || metadata[image.id]?.olcuHatasi)return null;
    if(![w,h].every(n=>Number.isSafeInteger(n)&&n>0) || !box || ![box.x,box.y,box.w,box.h].every(Number.isFinite))return null;
    if(box.x<0 || box.y<0 || box.w<=0 || box.h<=0 || box.x+box.w>w || box.y+box.h>h)return null;
    if(Object.hasOwn(a,'desenDosyaId') && String(a.desenDosyaId ?? '')!==String(m.desenFileId ?? ''))return null;
    if(line.kalipId!=null && String(line.kalipId)!==String(m.flatId))return null;
    if(!currentProductImage(a,image,files,metadata))return null;
    return {fileId:image.id,left:box.x/w*100,top:box.y/h*100,width:box.w/w*100,height:box.h/h*100,
      rasterWidth:w,rasterHeight:h,confirmed:!!m.designBoxPx && !a.needs_confirmation};
  }
  function orientationIsSafe(bytes){
    // The measurement raster and browser image must share axes, including square images and mirrors.
    const view=new DataView(bytes),size=view.byteLength;
    if(size<8)return false;
    if(view.getUint32(0)===0x89504e47 && view.getUint32(4)===0x0d0a1a0a){
      for(let pos=8;pos+12<=size;){
        const length=view.getUint32(pos),type=view.getUint32(pos+4);
        if(length>size-pos-12 || type===0x65584966 || type===0x6163544c)return false; // eXIf / animated PNG
        if(type===0x49454e44)return true;
        pos+=length+12;
      }
      return false;
    }
    if(view.getUint16(0)!==0xffd8)return false;
    for(let pos=2;pos+4<=size;){
      if(view.getUint8(pos++)!==0xff)return false;
      while(pos<size && view.getUint8(pos)===0xff)pos++;
      if(pos+2>=size)return false;
      const marker=view.getUint8(pos++);
      if(marker===0xda)return true;
      const length=view.getUint16(pos);
      if(length<2 || length>size-pos)return false;
      // APP1 can carry EXIF or XMP orientation. Render those JPEGs without coordinates.
      if(marker===0xe1)return false;
      pos+=length;
    }
    return false;
  }
  function placementMarks(line,files,metadata){
    const marks=new Map();
    for(const a of line.applications || []){
      const shot=previewBox(a,files,line,metadata);
      if(!shot)continue;
      if(!marks.has(shot.fileId))marks.set(shot.fileId,[]);
      const showSize=shot.confirmed || measureSource(a).method!=='elle';
      marks.get(shot.fileId).push({shot,label:statusLabel(a.kind)+' · '+positionLabel(a.position),
        width:showSize ? a.width_mm : null,height:showSize ? a.height_mm : null});
    }
    return marks;
  }
  const GENERIC_REASONS=['Uygulama ölçüsü teyit edilmeli','Ölçü kaynağı yok; ekip teyidi gerekli'];
  // Applications the automatic measurement has never processed (registered before G24 or still waiting).
  function unmeasuredApps(version) { return (version?.lines || []).flatMap(l=>l.applications || []).filter(a=>a.width_mm==null && !measureSource(a).method); }
  const UPLOAD_FIELDS={urun_gorsel:['gorunum'],desen_kaynak:['applicationKind','position']};
  function uploadFields(kind) { return UPLOAD_FIELDS[kind] || []; }
  function guessUpload(name,applications=[]) {
    const raw=String(name || '').toLocaleLowerCase('tr').replace(/[ıİ]/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c');
    const ext=(/\.([a-z0-9]+)$/.exec(raw) || [])[1] || '',stem=raw.replace(/\.[a-z0-9]+$/,'');
    const has=(...words)=>words.some(word=>new RegExp('(^|[^a-z])'+word+'([^a-z]|$)').test(stem));
    const guess={};
    const view=has('arka','back')?'arka':has('kol','sleeve')?'kol':has('on','front')?'on':null;
    const kind=has('nakis','embroidery','brode')?'nakis':has('baski','print','dtf','serigraf')?'baski':null;
    const position=has('gogus','chest')?'gogus':has('sirt','back','arka')?'sirt':has('kol','sleeve')?'kol':has('ense','neck')?'ense':has('kapuson','hood')?'kapuson':null;
    if(['pdf','svg'].includes(ext) || kind || has('desen','logo','vektor','vector'))guess.kind='desen_kaynak';
    else if(view || has('urun','mockup','gorsel'))guess.kind='urun_gorsel';
    if(guess.kind==='urun_gorsel'){if(view)guess.gorunum=view;return guess;}
    // A design without hints takes the first application of the line that still has no design.
    const open=(applications || []).find(a=>!designFileId(a) && (!position || a.position===position) && (!kind || a.kind===kind));
    if(kind || open)guess.applicationKind=kind || open.kind;
    if(position || open)guess.position=position || open.position;
    return guess;
  }
  // An existing application at this kind and position without a design receives the upload instead of a duplicate.
  function linkTarget(line,kind,position) { return (line?.applications || []).find(a=>a.kind===kind && a.position===position && !designFileId(a)) || null; }
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
    // Prefer the snapshot source link; retain provenance fallbacks for older snapshots.
    return (line.applications || []).find(a=>{const m=measureSource(a);return Number(a.desenDosyaId ?? m.desenFileId ?? m.desenDosyaId)===Number(fileId);});
  }
  function measurementWarning(a,files,metadata={}) {
    const file=files.find(file=>designApplication({applications:[a]},file.id));
    return a.olcuHatasi ?? file?.olcuHatasi ?? metadata[file?.id]?.olcuHatasi ??
      files.filter(file=>file.kind==='urun_gorsel').map(file=>file.olcuHatasi ?? metadata[file.id]?.olcuHatasi).find(Boolean);
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
  // Kartela helpers: pure, so they can be tested without a DOM.
  function safeHex(hex){const h=String(hex ?? '').trim();return /^#[0-9a-fA-F]{6}$/.test(h)?h:/^[0-9a-fA-F]{6}$/.test(h)?'#'+h:null;}
  function hexLight(hex){const h=safeHex(hex);if(!h)return false;const [r,g,b]=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));return (0.299*r+0.587*g+0.114*b)/255>0.82;}
  function hexInk(hex){const h=safeHex(hex);if(!h)return '#12213B';const [r,g,b]=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));return (0.299*r+0.587*g+0.114*b)/255>0.6?'#12213B':'#FFFFFF';}
  function kartelaFabrics(data){
    const out=[];
    for(const k of data?.kartelalar || [])for(const f of (k.kumaslar?.length?k.kumaslar:[{tur:k.id,ad:k.ad}]))out.push({tur:f.tur,ad:k.kumaslar?.length>1?f.ad:k.ad,kartela:k});
    return out;
  }
  function colorLabel(c){return c.no+' '+c.renk;}
  function stockLabel(s){return s.color_no!=null&&s.name?s.name+' ('+formatKg(s.available)+')':(s.name || s.fabric_key)+' / '+(s.color_name || 'Renk yok')+' ('+formatKg(s.available)+')';}
  function stockGroups(stocks){
    const groups=new Map();
    for(const s of stocks){const key=s.kartela?.ad || s.fabric_type || s.tur || 'Diğer kumaşlar';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
    return [...groups].map(([label,items])=>({label,items}));
  }
  function kartelaCaption(s){const no=s.kartela?.no ?? s.color_no;return no==null||no===''?'':'Kartela No '+no;}
  const pure={reasonText,vectorQuality,vectorDetail,designAspect,lockedSize,manualSaveBody,previewBox,orientationIsSafe,placementMarks,unmeasuredApps,uploadFields,guessUpload,linkTarget,reconcileJobs,designApplication,measurementWarning,lineFiles,missingImages,uploadJobs,parseNumber,inputNumber,validateNumber,displayMessage,positiveSizes,unmatchedAwaitingKg,queueFile,SIZES,PRODUCTS,POSITIONS,positionLabel,applicationLabel,measureSource,measureSummary,measureContext,measureGap,vectorBadge,vectorPollNext,VECTOR_POLL_MS,packageActions,costApplications,pricePayload,escapeHtml,formatNumber,formatKg,formatDate,statusLabel,sizeTotal,adapt,safeHex,hexLight,hexInk,kartelaFabrics,colorLabel,stockLabel,stockGroups,kartelaCaption};
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
  const state={tab:'orders',kartela:null,highlight:null,stocks:[],orders:[],outbox:[],confirmations:[],activeOrder:null,version:null,pending:[]};
  let fileMetadata={},vectorRows={},extractionRows={},vectorTimer=null;
  // Versions whose never-measured applications were already sent to automatic measurement in this page session.
  const autoMeasured=new Set();
  function rememberFile(file,job){fileMetadata[file.id]={lineId:job.lineId,gorunum:job.gorunum,name:job.file.name};}
  async function sendJobs(jobs){reconcileJobs(jobs,state.version);for(const versionId of new Set(jobs.filter(job=>job.uploaded&&job.kind==='desen_kaynak'&&!job.application&&!job.done).map(job=>job.versionId))){try{reconcileJobs(jobs,await api('surumler/'+versionId));}catch(error){for(const job of jobs.filter(job=>job.versionId===versionId&&!job.done))job.error=error.message;return jobs.filter(job=>!job.done);}}const failed=await uploadJobs(jobs,async job=>{const data=new FormData();data.append('file',job.file);data.append('kind',job.kind);data.append('lineId',job.lineId);if(job.gorunum)data.append('gorunum',job.gorunum);if(job.applicationId)data.append('applicationId',job.applicationId);const file=await api('surumler/'+job.versionId+'/dosyalar',data);rememberFile(file,job);return file;},job=>api('satirlar/'+job.lineId+'/uygulamalar',{kind:job.applicationKind,position:job.position,desenDosyaId:job.uploaded.id,measure_source:JSON.stringify({desenDosyaId:job.uploaded.id,dosyaAdi:job.file.name}),needs_confirmation:1}));for(const job of jobs){if(job.done && job.uploaded){const warning=job.application?.olcuHatasi ?? job.uploaded.olcuHatasi;if(warning)fileMetadata[job.uploaded.id]={...fileMetadata[job.uploaded.id],olcuHatasi:warning};}}state.pending=state.pending.filter(job=>!job.done);return failed;}
  function focusMedia(){document.getElementById('order-media')?.scrollIntoView({block:'start'});}
  const objectUrls=new Set(); let pageUrls=new Set(), content, notice;
  const measuredResize=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{
    for(const {target} of entries){if(target.isConnected)target.layoutPlacements();else measuredResize.unobserve(target);}
  }):null;
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
  function clearUrls(){ measuredResize?.disconnect();for(const u of pageUrls){URL.revokeObjectURL(u);objectUrls.delete(u);} pageUrls=new Set(); }
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
  function stockOptions(selected){
    const s=el('select',{});s.append(el('option',{value:''},'Kumaş kalemi seçin'));
    for(const g of stockGroups(state.stocks)){const og=el('optgroup',{label:g.label});for(const item of g.items){const o=el('option',{value:item.id},stockLabel(item));o.selected=String(item.id)===String(selected);og.append(o);}s.append(og);}
    return s;
  }
  // Colour circle: hex comes from the server and is validated before it reaches a style attribute.
  function swatch(hex,{no,dokulu,teyit,label}={}){
    const h=safeHex(hex),n=el('span',{class:'p-kd'+(hexLight(h)?' light':'')+(dokulu?' dokulu':''),'aria-hidden':label?null:'true'},no==null?'':String(no));
    if(h)n.setAttribute('style','background-color:'+h+';color:'+hexInk(h));
    if(teyit){n.append(el('span',{class:'p-kd-warn',title:typeof teyit==='string'?teyit:'Renk teyit bekliyor'},'!'));}
    return n;
  }
  function kartelaGrid(kartela,onPick){
    const grid=el('div',{class:'p-kgrid',role:'group','aria-label':kartela.ad+' kartelası'});
    for(const c of kartela.renkler || []){
      const hint=c.teyit?(typeof c.teyit==='string'?c.teyit:'Bu rengin teyidi bekliyor.'):'';
      const b=el('button',{type:'button',class:'p-kcell secondary','aria-label':colorLabel(c)+(c.dokulu?', melanj':'')+(hint?', teyit gerekli':''),title:colorLabel(c)+(hint?' · '+hint:'')},swatch(c.hex,{no:c.no,dokulu:c.dokulu,teyit:c.teyit}),el('span',{class:'p-kname'},c.renk));
      b.addEventListener('click',()=>run(()=>onPick(c),b));
      grid.append(b);
    }
    return grid;
  }
  function stockBadge(s){const cap=kartelaCaption(s);return cap?el('span',{class:'p-kinline'},swatch(s.color_hex),' '+cap):null;}
  async function loadKartela(){
    try{const d=await api('kartela');state.kartela=Array.isArray(d?.kartelalar)?d:null;}
    catch(e){state.kartela=null;if(typeof console!=='undefined')console.info('Kartela yüklenemedi, serbest renk alanı kullanılacak:',e.message);}
  }
  async function loadStocks(){state.stocks=adapt('list',await api('stok')).map(s=>adapt('stock',s));}
  async function loadCommon(){await loadStocks();await loadKartela();}
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
    const color=input('color_name',{value:line.color_name || '',required:true});const kinfo=el('div',{class:'p-kinfo','aria-live':'polite'});const showK=()=>{const s=state.stocks.find(s=>String(s.id)===fabric.value);kinfo.replaceChildren();const cap=s&&kartelaCaption(s);if(cap)kinfo.append(swatch(s.color_hex),cap);};showK();fabric.addEventListener('change',()=>{const s=state.stocks.find(s=>String(s.id)===fabric.value);if(s?.color_name)color.value=s.color_name;showK();});
    box.append(el('div',{class:'p-grid'},field('Ürün',product),el('div',{},field('Kumaş kalemi',fabric),kinfo),field('Renk',color),field('Astar',el('input',{name:'lining',type:'checkbox',checked:line.lining===1||line.lining===true}))));
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
      for(const file of designs.files){const job={file,kind:'desen_kaynak',applicationKind:'baski',position:'gogus'},kind=opts([['baski','Baskı'],['nakis','Nakış']],'baski'),position=opts(APPLICATION_POSITIONS.map(key=>[key,positionLabel(key)]),'gogus');box._uploads.push(job);
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
    clearUrls();clearTimeout(vectorTimer);vectorRows={};extractionRows={};const o=await api('siparisler/'+id);state.activeOrder=o;state.version=versionId?o.versions.find(v=>v.id===versionId):o.versions.at(-1);if(!state.version)throw Error('Sürüm bulunamadı.');
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
  // Re-render the order without moving the reader to another part of the page.
  async function refreshInPlace(v){const y=global.scrollY || 0;await openOrder(state.activeOrder.id,v.id);global.scrollTo?.(0,y);}
  function uploadForm(v,line){
    const kind=opts([['urun_gorsel','Ürün görseli'],['desen_kaynak','Desen (PNG / PDF)']],'urun_gorsel');kind.name='kind';
    const view=opts([['on','Ön'],['arka','Arka'],['kol','Kol']],'on');view.name='gorunum';
    const applicationKind=opts([['baski','Baskı'],['nakis','Nakış']],'baski');applicationKind.name='applicationKind';
    const position=opts(APPLICATION_POSITIONS.map(key=>[key,positionLabel(key)]),'gogus');position.name='position';
    const file=input('file',{type:'file',accept:'.png,.jpg,.jpeg,.pdf',required:true});
    const fields={gorunum:field('Görünüm',view),applicationKind:field('Uygulama',applicationKind),position:field('Konum',position)};
    const show=()=>{const visible=uploadFields(kind.value);for(const [key,node] of Object.entries(fields))node.hidden=!visible.includes(key);};
    kind.addEventListener('change',show);
    file.addEventListener('change',()=>{const guess=guessUpload(file.files[0]?.name,line.applications);for(const [node,key] of [[kind,'kind'],[view,'gorunum'],[applicationKind,'applicationKind'],[position,'position']])if(guess[key])node.value=guess[key];show();});
    show();
    const f=form(async()=>{
      const design=kind.value==='desen_kaynak',target=design?linkTarget(line,applicationKind.value,position.value):null;
      const job={versionId:v.id,lineId:line.id,file:file.files[0],kind:kind.value,...(design?{applicationKind:applicationKind.value,position:position.value,...(target?{applicationId:target.id,application:target}:{})}:{gorunum:view.value})};
      state.pending.push(job);await sendJobs([job]);await refreshInPlace(v);message(job.error || 'Dosya yüklendi.',!!job.error);
    },el('div',{class:'p-grid'},field('Dosya',file),field('Dosya türü',kind),fields.gorunum,fields.applicationKind,fields.position),submit('Yükle'));
    f.hidden=true;f.classList.add('p-upload-form');
    const toggle=el('button',{type:'button',class:'secondary','aria-expanded':'false'},'Dosya ekle');
    toggle.addEventListener('click',()=>{f.hidden=!f.hidden;toggle.setAttribute('aria-expanded',String(!f.hidden));});
    return el('div',{class:'p-upload'},toggle,f);
  }
  function applicationForm(v,line){
    const kind=opts([['baski','Baskı'],['nakis','Nakış']],'baski');
    const position=opts(APPLICATION_POSITIONS.map(key=>[key,positionLabel(key)]),'gogus');
    const f=form(async()=>{
      if((line.applications || []).some(a=>a.kind===kind.value && a.position===position.value))throw Error('Bu tür ve konumda bir uygulama zaten var.');
      await api('satirlar/'+line.id+'/uygulamalar',{kind:kind.value,position:position.value,needs_confirmation:1});
      await refreshInPlace(v);message('Uygulama eklendi.');
    },el('div',{class:'p-grid'},field('Uygulama türü',kind),field('Konum',position)),submit('Uygulamayı kaydet'));
    f.hidden=true;
    const toggle=el('button',{type:'button',class:'secondary','aria-expanded':'false'},'Dosyasız uygulama ekle');
    toggle.addEventListener('click',()=>{f.hidden=!f.hidden;toggle.setAttribute('aria-expanded',String(!f.hidden));});
    return el('div',{class:'p-upload'},toggle,f);
  }
  function patternSelector(v,line){
    if((line.kalipAdaylari || []).length<2)return null;
    const select=opts(line.kalipAdaylari.map(f=>[f.id,f.ad+(f.refBeden?' ('+f.refBeden+')':'')]),line.kalipId,'Kalıbı seçin');
    select.name='kalipId';select.disabled=v.status!=='taslak';
    select.addEventListener('change',()=>run(async()=>{
      try {
        if(!select.value){select.value=line.kalipId || '';return;}
        await api('satirlar/'+line.id,{kalipId:select.value},'PATCH');
        await refreshInPlace(v);message('Kalıp seçimi kaydedildi.');
      } catch(error){select.value=line.kalipId || '';throw error;}
    },select));
    return el('div',{class:'p-kalip'},field('Kalıp',select));
  }
  function renderMedia(v){
    const section=card(el('div',{class:'p-step'},'2 / Görsel, desen ve ölçü'),el('h3',{},'Ürün dosyaları'));section.id='order-media';
    for(const l of v.lines){
      const heading=el('div',{class:'p-row p-between p-media-heading'},el('h4',{},PRODUCTS[l.product_key]+' / '+(l.color_name || '')),patternSelector(v,l));
      section.append(heading);
      const det=el('details',{},el('summary',{},'Dosya ve ölçü ',missingImages(v,fileMetadata).some(line=>line.id===l.id)?badge('Görsel eksik','warn'):null));det.open=true;
      const failed=state.pending.filter(job=>job.versionId===v.id&&job.lineId===l.id&&!job.done);
      for(const job of failed)det.append(el('div',{class:'p-notice error'},text(job.file.name+': '+job.error,'p-inline-error'),button('Yeniden yükle',async()=>{await sendJobs([job]);await openOrder(state.activeOrder.id,v.id);focusMedia();})));
      const lf=lineFiles(v,l.id,fileMetadata);
      const marks=failed.length ? new Map() : placementMarks(l,lf,fileMetadata);
      det.append(renderFiles(lf.filter(file=>['urun_gorsel','desen_kaynak','desen_kaynak_vektor'].includes(file.kind)),false,marks),autoMeasureBlock(v,l,lf,failed.length===0),uploadForm(v,l),applicationForm(v,l));section.append(det);
    }content.append(section);startVectorPolling(v);measureOnOpen(v);
  }
  // Applications registered before automatic measurement existed are measured once when their draft is opened.
  function measureOnOpen(v){
    if(v.status!=='taslak' || autoMeasured.has(v.id) || !unmeasuredApps(v).length)return;
    autoMeasured.add(v.id);
    run(async()=>{const result=await api('surumler/'+v.id+'/otomatik-olc?degisen=1',{});if(result?.results?.length && state.version?.id===v.id && state.activeOrder)await refreshInPlace(v);});
  }
  function autoMeasureBlock(v,line,lf,showPlacement=true){
    const box=el('div',{class:'p-auto'});
    for(const a of line.applications||[]){
      const row=el('div',{class:'p-auto-row'}),summary=measureSummary(a),gap=measureGap(v,line,lf,a),label=statusLabel(a.kind)+' · '+positionLabel(a.position);
      const editorHost=el('div',{class:'p-manual-slot'});
      // The editor opens inside this row; the page does not move.
      const edit=()=>button('Elle düzelt',async()=>{if(editorHost.children.length){editorHost.replaceChildren();return;}editorHost.replaceChildren(manualEditor(v,line,a,showPlacement?lf:[],()=>editorHost.replaceChildren()));},'secondary');
      row.append(el('strong',{},label));
      if(summary)row.append(text(summary,'p-number'));
      const context=measureContext(a,line);if(context)row.append(text(context,'p-measure-context'));
      const warning=measurementWarning(a,lf,fileMetadata);
      const reason=reasonText(measureSource(a).reasons) || reasonText(state.confirmations.find(c=>c.kind==='olcu'&&c.ref_table==='applications'&&Number(c.ref_id)===Number(a.id))?.message);
      const waiting=a.width_mm==null && !measureSource(a).method && (!reason || GENERIC_REASONS.includes(reason));
      if(warning){
        row.append(el('div',{class:'p-notice warn'},'Otomatik ölçü yapılamadı: '+reasonText(warning)+' · ',edit()));
      }else if(waiting){
        row.append(el('div',{class:'p-notice warn'},'Otomatik ölçü henüz çalışmadı.'),el('div',{class:'p-actions'},button('Otomatik ölç',async()=>{await api('surumler/'+v.id+'/otomatik-olc?degisen=1',{});await refreshInPlace(v);message('Otomatik ölçü çalıştı.');}),edit()));
      }else if(a.needs_confirmation){
        row.append(el('div',{class:'p-notice warn'},'Ölçü teyit gerektiriyor.'+(reason?' '+reason:'')),el('div',{class:'p-actions'},
          a.width_mm!=null && a.height_mm!=null ? button('Ölçüyü onayla',async()=>{const list=adapt('list',await api('teyitler?status=acik')),c=list.find(c=>c.kind==='olcu'&&c.ref_table==='applications'&&Number(c.ref_id)===Number(a.id));
            if(!c)throw Error('Açık ölçü teyidi bulunamadı; sayfayı yenileyin.');await api('teyitler/'+c.id+'/coz',{});await refreshInPlace(v);message('Ölçü teyidi kaydedildi.');}) : null,
          edit()));
      }else if(gap){
        row.append(text(gap.text,'p-muted'));
        row.append(el('div',{class:'p-actions'},gap.code==='olculebilir'?button('Otomatik ölç',async()=>{await api('surumler/'+v.id+'/otomatik-olc',{});await refreshInPlace(v);message('Otomatik ölçü çalıştı.');}):null,edit()));
      }else row.append(el('div',{class:'p-actions'},edit()));
      if(!designFileId(a) && lf.some(file=>file.kind==='urun_gorsel'))row.append(extractionHost(a));
      row.append(editorHost);box.append(row);
    }
    if(!(line.applications||[]).length){const gap=measureGap(v,line,lf,null);box.append(text(gap.text+(gap.code==='olculebilir'?' · Desen yükleyince uygulama eklenir.':''),'p-muted'));}
    return box;
  }
  function manualEditor(v,line,a,lf,close){
    const label=statusLabel(a.kind)+' · '+positionLabel(a.position),ratio=designAspect(a,vectorRows[designFileId(a)]),shot=previewBox(a,lf,line,fileMetadata);
    const width=num('manual_w',a.width_mm==null?'':a.width_mm/10,{min:.1,step:.1,required:true}),height=num('manual_h',a.height_mm==null?'':a.height_mm/10,{min:.1,step:.1,required:true});
    const lock=input('manual_lock',{type:'checkbox'});lock.checked=!!ratio;
    const error=el('p',{class:'p-inline-error','aria-live':'polite'});
    const preview=shot?.confirmed?el('div',{class:'p-manual-preview'}):null;
    let updateMark;
    const follow=()=>{try{updateMark?.(readNumber(width)*10,readNumber(height)*10);}catch{updateMark?.(null,null);}};
    if(preview)renderRaster(preview,lf.find(file=>file.id===shot.fileId),[{shot,label,width:a.width_mm,height:a.height_mm}],true,update=>{updateMark=update;follow();});
    const sync=changed=>{error.textContent='';if(lock.checked && ratio){let pair=null;try{pair=lockedSize(changed,(changed==='width'?width:height).value,ratio);}catch{}
      if(pair)(changed==='width'?height:width).value=inputNumber(changed==='width'?pair.height:pair.width);}
      follow();};
    width.addEventListener('input',()=>sync('width'));height.addEventListener('input',()=>sync('height'));
    lock.addEventListener('change',()=>sync('width'));
    const save=button('Kaydet',async()=>{
      let body;try{body=manualSaveBody(width.value,height.value);}catch(e){error.textContent=e.message;throw e;}
      try{await api('uygulamalar/'+a.id,body,'PATCH');}catch(e){error.textContent=e.message;throw e;}
      await refreshInPlace(v);message(label+': '+formatNumber(body.width_mm/10)+' × '+formatNumber(body.height_mm/10)+' cm, '+session.user.name+' adına kaydedildi; teyit kapandı.');
    },'');
    return el('div',{class:'p-manual-inline',role:'group','aria-label':label+' için elle ölçü'},
      el('div',{class:'p-manual-fields'},field('En (cm)',width),field('Boy (cm)',height)),
      ratio?field('Oranı koru (desen '+formatNumber(Math.round(ratio*100)/100)+' : 1)',lock):text('Desen oranı bilinmiyor; en ve boyu ayrı girin.','p-muted'),
      preview,error,el('div',{class:'p-actions'},save,button('Vazgeç',async()=>close())));
  }
  function vectorHost(file){const host=el('div',{class:'p-vector','data-vector-source':String(file.id)});renderVector(host,file);return host;}
  function renderVector(host,file){
    const row=vectorRows[file.id],b=vectorBadge(row,file);host.replaceChildren(badge(b.label,b.tone));
    const quality=vectorQuality(row);
    if(quality && row.status!=='teyit')host.append(badge(quality.label,quality.tone));
    const confirmation=row && state.confirmations.find(c=>c.kind==='vektor_kalite'&&c.ref_table==='files'&&Number(c.ref_id)===Number(row.previewFileId));
    const detail=vectorDetail(row,confirmation?.message);
    if(detail)host.append(el('span',{class:'p-vector-detail'},detail));
    if(b.downloadable)host.append(button('Vektörel PDF indir',()=>download({id:row.previewFileId,kind:'desen_vektor_onizleme',path:'desen-'+file.id+'-vektor.pdf'})));
    if(vectorRows.timedOut&&(!row||row.status==='hazirlaniyor'))host.append(button('Yenile',async()=>{vectorRows.timedOut=false;startVectorPolling(state.version);}));
  }
  function extractionHost(a){
    const host=el('div',{class:'p-vector','data-extraction-application':String(a.id)});
    renderExtraction(host,a.id);
    return host;
  }
  function renderExtraction(host,applicationId){
    const row=extractionRows[applicationId];
    const label={hazir:'Görselden çıkarılan desen hazır',teyit:'Çıkarılan desen için teyit gerekli',hata:'Desen çıkarılamadı'}[row?.status] ||
      (vectorRows.timedOut?'Görselden desen sonucu bekleniyor':'Görselden desen hazırlanıyor…');
    host.replaceChildren(badge(label,row?.status==='hazir'?'good':'warn'));
    const detail=reasonText(row?.reasons) || reasonText(row?.message);
    if(detail)host.append(el('span',{class:'p-vector-detail'},detail));
    if(row?.previewFileId && ['hazir','teyit'].includes(row.status)){
      const file={id:row.previewFileId,kind:'desen_vektor_onizleme',path:'desen-'+applicationId+'-vektor.pdf'};
      const preview=el('div',{class:'p-extraction-preview'});
      host.append(button('Çıkarılan PDF’yi aç',()=>openPdfPreview(preview,file)),button('Çıkarılan PDF’yi indir',()=>download(file)),preview);
    }
    if(vectorRows.timedOut && (!row || row.status==='hazirlaniyor'))host.append(button('Yenile',async()=>{vectorRows.timedOut=false;startVectorPolling(state.version);}));
  }
  function startVectorPolling(v){
    clearTimeout(vectorTimer);
    if(!v || v.status!=='taslak')return;
    const sourceIds=v.files.filter(f=>['desen_kaynak','desen_kaynak_vektor'].includes(f.kind)).map(f=>f.id);
    const extractedHosts=[...document.querySelectorAll('[data-extraction-application]')];
    if(!sourceIds.length && !extractedHosts.length)return;
    const started=Date.now();
    const tick=async()=>{
      if(!session || state.version!==v)return;
      let rows;try{rows=await api('surumler/'+v.id+'/vektor-durum');}catch{if(state.version===v)vectorTimer=setTimeout(tick,VECTOR_POLL_MS*2);return;}
      if(rows.some(r=>r.status==='teyit'||r.quality==='teyit')){try{state.confirmations=adapt('list',await api('teyitler?status=acik'));}catch{}}
      if(!session || state.version!==v)return;
      vectorRows=Object.fromEntries(rows.filter(r=>!r.extracted).map(r=>[r.sourceFileId,r]));
      const nextExtractionRows=Object.fromEntries(rows.filter(r=>r.extracted).map(r=>[r.applicationId,r]));
      const elapsed=Date.now()-started;
      const next=vectorPollNext(rows,elapsed,sourceIds);
      const waiting=next==='bekle' || (elapsed<VECTOR_POLL_MAX_MS && extractedHosts.some(host=>!nextExtractionRows[host.dataset.extractionApplication]));
      vectorRows.timedOut=!waiting && (next==='yenile' || extractedHosts.some(host=>!nextExtractionRows[host.dataset.extractionApplication]));
      for(const host of document.querySelectorAll('[data-vector-source]')){const file=v.files.find(f=>String(f.id)===host.dataset.vectorSource);if(file)renderVector(host,file);}
      for(const host of extractedHosts){
        const id=host.dataset.extractionApplication;
        const old=extractionRows[id],row=nextExtractionRows[id];
        if(old?.status==='hazir' && row?.status==='hazir' && old.previewFileId===row.previewFileId)continue;
        extractionRows[id]=row;
        renderExtraction(host,id);
      }
      if(waiting)vectorTimer=setTimeout(tick,VECTOR_POLL_MS);
    };
    tick();
  }
  async function openPdfPreview(preview,file){
    const blob=await api('dosyalar/'+file.id,undefined,undefined,true);
    const u=blobUrl(blob.slice(0,blob.size,'application/pdf'));
    preview.replaceChildren(el('iframe',{src:u,title:statusLabel(file.kind)+' PDF önizlemesi'}));
  }
  function dimensionText(mm){return Number.isFinite(Number(mm)) && Number(mm)>0 ? formatNumber(Number(mm)/10)+' cm' : '';}
  function placementMarker({shot,label,width,height}){
    const en=el('span',{class:'p-dimension-label'}),boy=el('span',{class:'p-dimension-label'});
    const widthLine=el('div',{class:'p-dimension p-dimension-width','aria-hidden':'true'});
    const heightLine=el('div',{class:'p-dimension p-dimension-height','aria-hidden':'true'});
    const horizontal=el('div',{class:'p-dimension-value p-dimension-en','aria-hidden':'true'},en);
    const vertical=el('div',{class:'p-dimension-value p-dimension-boy','aria-hidden':'true'},boy);
    const candidate=shot.confirmed?'':' p-placement-candidate';
    const node=el('div',{class:'p-placement'+candidate,role:'img',style:`--x:${shot.left}%;--y:${shot.top}%;--w:${shot.width}%;--h:${shot.height}%`},
      el('div',{class:'p-placement-box','aria-hidden':'true'}),widthLine,heightLine,horizontal,vertical);
    if(shot.top+shot.height>76)node.classList.add('p-placement-above');
    if(shot.left+shot.width>72)node.classList.add('p-placement-left');
    if(shot.height<7 || (shot.left<21 && shot.left+shot.width>79))node.classList.add('p-placement-no-height');
    const update=(w,h)=>{
      const enText=dimensionText(w),boyText=dimensionText(h);
      en.textContent=shot.confirmed?enText:'Teyit'+(enText?' · '+enText:'');
      boy.textContent=boyText;
      horizontal.hidden=widthLine.hidden=shot.confirmed && !enText;
      vertical.hidden=heightLine.hidden=!boyText;
      node.setAttribute('aria-label',[label,shot.confirmed?'':'Teyit gerekli',enText && 'En '+enText,boyText && 'Boy '+boyText].filter(Boolean).join(' · '));
    };
    update(width,height);
    return {node,update,shot,horizontal,vertical};
  }
  function layoutPlacements(stage,markers){
    const bounds=stage.getBoundingClientRect();
    if(!bounds.width)return;
    const occupied=[];
    const claim=node=>{
      const rect=node.getBoundingClientRect();
      if(rect.left<bounds.left-1 || rect.right>bounds.right+1 ||
        occupied.some(other=>rect.left<other.right+3 && rect.right>other.left-3 && rect.top<other.bottom+3 && rect.bottom>other.top-3))return false;
      occupied.push(rect);
      return true;
    };
    for(const {node,shot,horizontal} of markers){
      if(horizontal.hidden)continue;
      const above=shot.top+shot.height>76;
      const fit=(side,gap)=>{
        node.classList.toggle('p-placement-above',side);
        node.style.setProperty('--width-gap',gap+'px');
        return claim(horizontal.firstChild);
      };
      if(fit(above,7) || fit(!above,7))continue;
      // A second track keeps two nearby width labels readable without sliding their endpoints.
      if(above && shot.top>12 && fit(true,30))continue;
      if(shot.top+shot.height<88 && fit(false,30))continue;
      fit(above,7);
    }
    for(const {node,shot,vertical} of markers){
      const tall=bounds.height*shot.height/100>=12;
      node.classList.toggle('p-placement-no-height',!tall);
      if(!tall || vertical.hidden)continue;
      const left=shot.left>100-shot.left-shot.width;
      node.classList.toggle('p-placement-left',left);
      if(claim(vertical.firstChild))continue;
      node.classList.toggle('p-placement-left',!left);
      if(!claim(vertical.firstChild))node.classList.add('p-placement-no-height');
    }
  }
  async function renderRaster(slot,file,marks=[],onlyMeasured=false,onUpdate){
    try{
      const blob=await api('dosyalar/'+file.id,undefined,undefined,true);
      if(slot.isConnected===false)return;
      const safe=marks.length && await blob.arrayBuffer().then(orientationIsSafe,()=>false);
      if(slot.isConnected===false)return;
      if(onlyMeasured && !safe)return;
      const image=el('img',{class:'p-thumb',alt:statusLabel(file.kind)});
      image.addEventListener('load',()=>{
        const matched=safe ? marks.filter(({shot})=>shot.rasterWidth===image.naturalWidth && shot.rasterHeight===image.naturalHeight) : [];
        if(!matched.length){if(onlyMeasured)slot.replaceChildren();return;}
        const rendered=matched.map(placementMarker);
        image.className='p-measured-raster';
        const stage=el('div',{class:'p-measured-stage'},image,rendered.map(mark=>mark.node));
        slot.replaceChildren(el('figure',{class:'p-measured'},stage,
          el('figcaption',{},matched.map(({label,shot})=>label+(shot.confirmed?'':' (teyit gerekli)')).join(' / '))));
        if(measuredResize){
          stage.layoutPlacements=()=>layoutPlacements(stage,rendered);
          stage.layoutPlacements();
          measuredResize.observe(stage);
        }
        if(onUpdate)onUpdate((w,h)=>{rendered[0].update(w,h);stage.layoutPlacements?.();});
      },{once:true});
      image.addEventListener('error',()=>slot.replaceChildren(),{once:true});
      if(!onlyMeasured)slot.replaceChildren(image);
      image.src=blobUrl(blob);
    }catch{slot.replaceChildren();}
  }
  function renderFiles(files,previews=false,marks=new Map()){
    const grid=el('div',{class:'p-files'});
    for(const file of files){
      const preview=el('div',{}),name=fileMetadata[file.id]?.name || fileName(file).split('/').pop() || 'Dosya #'+file.id;
      const pdf=previews || (file.kind==='urun_gorsel' && PDF_EXT.test(fileName(file) || name));
      const openPdf=pdf?button('PDF önizle',()=>openPdfPreview(preview,file)):null;
      const item=el('div',{class:'p-file'},el('h3',{},statusLabel(file.kind)),text(name),preview,
        ['desen_kaynak','desen_kaynak_vektor'].includes(file.kind)?vectorHost(file):null,
        el('div',{class:'p-actions'},button('İndir',()=>download(file)),openPdf));
      grid.append(item);
      if(['desen_kaynak','urun_gorsel'].includes(file.kind) && RASTER_EXT.test(fileName(file) || name))renderRaster(preview,file,marks.get(file.id));
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
  function stockTable(){return table(['Kumaş / renk','Toplam','Ayrılan','Kullanılabilir','Teslim bekleyen','Tedarik bekleyen',''],state.stocks.map(s=>[el('div',{class:s.id===state.highlight?'p-picked':null,'aria-current':s.id===state.highlight?'true':null},el('strong',{},s.name || s.fabric_key),text(s.color_name || '—'),stockBadge(s)),formatKg(s.total),formatKg(s.reserved),formatKg(s.available),formatKg(s.awaiting_delivery),formatKg(s.shortage),button('Hareketler',async()=>{const target=el('div',{});const dialog=el('dialog',{class:'production p-dialog'},el('h2',{},s.name+' / Hareketler'),target,button('Kapat',()=>dialog.close()));dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();await movements(s.id,target);})]));}
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
    const freeForm=form(async()=>{await api('stok/kalemler',{tur:type.value.trim(),renk:color.value.trim(),ad:name.value.trim() || undefined,unit:'kg'});await renderLedger();message('Kumaş kalemi eklendi. Sayım yaparak fiziksel stoğu kaydedin.');},el('div',{class:'p-grid three'},field('Kumaş türü',type),field('Renk',color),field('Görünen ad (isteğe bağlı)',name)),submit('Yeni kumaşı kaydet'));
    const newCard=card(el('h3',{},'Yeni kumaş'));content.append(newCard);
    const fabrics=kartelaFabrics(state.kartela);
    if(!fabrics.length)newCard.append(freeForm);
    else{
      const pick=opts([...fabrics.map((f,i)=>[i,f.ad]),['serbest','Kartelası olmayan kumaş (serbest renk)']],'','Kumaş seçin');pick.setAttribute('aria-label','Kumaş');
      const host=el('div',{});
      pick.addEventListener('change',()=>{
        host.replaceChildren();if(pick.value==='')return;
        if(pick.value==='serbest'){host.append(freeForm);return;}
        const f=fabrics[Number(pick.value)];if(f.kartela.not)host.append(text(f.kartela.not));
        host.append(text('Rengi kartelada numarasıyla seçin.'),kartelaGrid(f.kartela,async c=>{
          const r=await api('stok/kalemler',{tur:f.tur,kartelaNo:c.no,unit:'kg'});
          if(r?.mevcut){state.highlight=r.id ?? r.item?.id ?? null;await renderLedger();message('Bu kalem zaten var: '+colorLabel(c)+'. Listede işaretlendi.');}
          else{state.highlight=r?.id ?? r?.item?.id ?? null;await renderLedger();message('Kumaş kalemi eklendi: '+colorLabel(c)+'. Sayım yaparak fiziksel stoğu kaydedin.');}
        }));
      });
      newCard.append(field('Kumaş',pick),host);
    }
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
