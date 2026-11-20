'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ui=require('../assets/uretim.js');

test('server reasonTexts are shown before the local dictionary',()=>{
  const row={status:'teyit',reasons:['cok_yol'],reasonTexts:['Sunucu metni.']};
  assert.equal(ui.vectorDetail(row),'Sunucu metni.');
});
test('unknown reason codes show as quality confirmation, never as raw code',()=>{
  const row={status:'teyit',reasons:['yeni_bilinmeyen_kod'],reasonTexts:['yeni_bilinmeyen_kod']};
  assert.equal(ui.vectorDetail(row),'Kalite teyidi gerekli');
  assert.equal(ui.vectorDetail({status:'teyit',reasons:['yeni_bilinmeyen_kod']}),'Kalite teyidi gerekli');
  assert.equal(ui.vectorDetail({status:'teyit',reasons:[],message:'dolgu_detay_kalinligi_olculemedi'}),'Kalite teyidi gerekli');
  assert.doesNotMatch(ui.vectorReasonList({reasons:['dolgu_detay_kalinligi_olculemedi'],reasonTexts:['dolgu_detay_kalinligi_olculemedi']}).join(' '),/_/);
});
test('known codes without server text use the local dictionary',()=>{
  assert.match(ui.vectorDetail({status:'teyit',reasons:['ince_cizgi']}),/0,2 mm/);
});
test('leg positions have Turkish labels and appear only for trousers products',()=>{
  assert.equal(ui.positionLabel('bacak'),'Bacak');
  assert.equal(ui.positionLabel('sol_bacak'),'Sol bacak');
  assert.equal(ui.positionLabel('sag_bacak'),'Sağ bacak');
  assert.ok(ui.applicationPositions('esofman').includes('sol_bacak'));
  assert.ok(!ui.applicationPositions('sweat').includes('bacak'));
  assert.ok(!ui.applicationPositions(undefined).includes('sag_bacak'));
});
