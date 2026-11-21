'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ui=require('../assets/uretim.js');

// G59 (invented data): fabric type and colour are separate fields; delete always carries an explicit confirmation.
const TYPES=[
  {tur:'supren_30_1',ad:'30/1 Süprem',kartela:{id:'a',ad:'30/1 Süprem'},renkler:[
    {no:1,renk:'Beyaz',hex:'#ffffff',kartelada:true,stokKalemId:7},{no:2,renk:'Çağla',hex:'#a8d5ba',kartelada:true,stokKalemId:null},
    {no:null,renk:'Deneme Rengi',hex:null,kartelada:false,stokKalemId:9}]},
  {tur:'ipek',ad:'Ipek',kartela:null,renkler:[]},
  {tur:'legacy:k1',ad:'Eski kumaş',kartela:null,renkler:[{no:null,renk:'Mavi',hex:null,kartelada:false,stokKalemId:3}]}];
const STOCKS=[{id:7,fabric_key:'supren_30_1|beyaz'},{id:3,fabric_key:'legacy:k1'},{id:5,fabric_key:'gizemli|x'}];

test('type of a line: saved type first, else derived from the old stock item, else empty',()=>{
  assert.equal(ui.fabricTypeOf({fabric_type:'ipek'},STOCKS,TYPES),'ipek');
  assert.equal(ui.fabricTypeOf({fabric_item_id:7},STOCKS,TYPES),'supren_30_1');
  assert.equal(ui.fabricTypeOf({fabric_item_id:3},STOCKS,TYPES),'legacy:k1');
  assert.equal(ui.fabricTypeOf({fabric_item_id:5},STOCKS,TYPES),'','unknown type is not guessed');
  assert.equal(ui.fabricTypeOf({},STOCKS,TYPES),'');
});
test('colour hint knows existing stock items, ignores case and Turkish letters, never invents a match',()=>{
  const t=TYPES[0];
  assert.equal(ui.fabricColorMatch(t,'BEYAZ').stokKalemId,7);
  assert.equal(ui.fabricColorMatch(t,'çağla').no,2);
  assert.equal(ui.fabricColorMatch(t,'Cagla'),null);
  assert.match(ui.fabricStockHint(t,'Beyaz'),/kalem var/);
  assert.match(ui.fabricStockHint(t,'Çağla'),/adla kaydedilir/);
  assert.equal(ui.fabricStockHint(t,''),'');
  assert.equal(ui.fabricStockHint(null,'Beyaz'),'');
});
test('colour list labels work for stock-only colours without a card number',()=>{
  assert.equal(ui.colorLabel({no:2,renk:'Çağla'}),'2 Çağla');
  assert.equal(ui.colorLabel({no:null,renk:'Deneme Rengi'}),'Deneme Rengi');
});
test('saving a line: new line and changed type/colour send fabric_type; an untouched old line keeps its stock item',()=>{
  assert.deepEqual(ui.fabricFields({},'supren_30_1','Çağla',''),{fabric_type:'supren_30_1',color_name:'Çağla'});
  const old={id:4,color_name:'Mavi',fabric_item_id:3};
  assert.deepEqual(ui.fabricFields(old,'legacy:k1','Mavi','legacy:k1'),{color_name:'Mavi'});
  assert.deepEqual(ui.fabricFields(old,'legacy:k1','Lacivert','legacy:k1'),{fabric_type:'legacy:k1',color_name:'Lacivert'});
  assert.deepEqual(ui.fabricFields(old,'ipek','Mavi','legacy:k1'),{fabric_type:'ipek',color_name:'Mavi'});
});
test('delete request always carries an explicit confirmation',()=>{
  assert.deepEqual(ui.deleteBody(),{onay:true});
});
