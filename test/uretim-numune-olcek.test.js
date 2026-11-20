'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ui=require('../assets/uretim.js');

test('geometrik ortalama notu yalnız scaleMode geo_ortalama iken gösterilir',()=>{
  const note='Mockup oranı kalıptan farklı (%28,9); ölçek boy ile göğüs ortalaması';
  assert.equal(ui.scaleNote({measure_source:JSON.stringify({scaleMode:'geo_ortalama',scaleNote:note})}),note);
  assert.equal(ui.scaleNote({measure_source:JSON.stringify({scaleNote:'Tek L ölçeği bulundu (1 eksen); ikinci eksen ölçüsü yok.'})}),'');
  assert.equal(ui.scaleNote({measure_source:null}),'');
});
