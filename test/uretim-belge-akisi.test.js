'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ui=require('../assets/uretim.js');

test('çocuk yaş aralıkları toplama girer, tanımsız anahtarlar girmez',()=>{
  assert.equal(ui.sizeTotal({M:2,'4-6 YAŞ':3,'8-10 YAŞ':1,'bilinmeyen':50}),6);
  assert.ok(ui.CHILD_SIZES.every(label=>/YAŞ$/.test(label)));
});
test('ölçü teyidi bekleyen uygulamalar sayılır',()=>{
  const version={lines:[{applications:[{width_mm:100,height_mm:50,needs_confirmation:0},{width_mm:null,height_mm:null,needs_confirmation:1},{width_mm:80,height_mm:40,needs_confirmation:1}]},{applications:[]}]};
  assert.equal(ui.unmeasuredCount(version),2);
  assert.equal(ui.unmeasuredCount(null),0);
});
