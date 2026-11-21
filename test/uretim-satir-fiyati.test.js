'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ui=require('../assets/uretim.js');

// G63 (invented values): the optional line sale price is typed in TL and sent as whole kuruş, without float arithmetic.
test('line price: empty stays unknown, TL text becomes whole kuruş',()=>{
  assert.equal(ui.priceKurus(''),null);
  assert.equal(ui.priceKurus('  '),null);
  assert.equal(ui.priceKurus('125'),12500);
  assert.equal(ui.priceKurus('125,5'),12550);
  assert.equal(ui.priceKurus('125.55'),12555);
  assert.equal(ui.priceKurus('0,29'),29);
  assert.equal(ui.priceKurus('1,15'),115,'no 1.15*100 rounding error');
});
test('line price: ambiguous or invalid text is refused, never guessed',()=>{
  for(const bad of ['1.250,50','12,555','-5','abc','0','0,00','1e3'])assert.throws(()=>ui.priceKurus(bad),/Birim satış fiyatı/,bad);
});
test('line price: kuruş shows back as TL text for a revision',()=>{
  assert.equal(ui.kurusText(null),'');
  assert.equal(ui.kurusText(12550),'125,50');
  assert.equal(ui.kurusText(29),'0,29');
  assert.equal(ui.priceKurus(ui.kurusText(12555)),12555);
});
test('queue label for the approval chain',()=>{
  assert.equal(ui.statusLabel('onay_zinciri'),'Onay zinciri (İşler + takip)');
});
