import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedPoint,createMarker,validateBackup,DEFAULT_ZONES,safeName} from '../web/model.js';
test('Marker coordinates stay attached to the same point after resizing the photo',()=>{
  assert.deepEqual(normalizedPoint(150,250,{left:50,top:50,width:200,height:400}),{x:.5,y:.5});
  assert.deepEqual(normalizedPoint(450,850,{left:50,top:50,width:800,height:1600}),{x:.5,y:.5});
  assert.deepEqual(normalizedPoint(-50,1000,{left:0,top:0,width:100,height:100}),{x:0,y:1});
});
test('New labels are placed inside the image even for valves at an edge',()=>{
  const m=createMarker({x:1,y:0},DEFAULT_ZONES[0],'marker');
  assert.equal(m.x,1);assert.equal(m.y,0);assert.ok(m.labelX<1);assert.ok(m.labelY>0);assert.equal(m.zoneName,'Trávník před domem');
});
test('Backup rejects malformed annotations before replacing stored data',()=>{
  const backup={format:'zavlahovy-denik',version:1,zones:DEFAULT_ZONES,records:[{id:'one',name:'Šachta',location:'',notes:'',updatedAt:1,createdAt:1,image:'data:image/jpeg;base64,abcd',markers:[createMarker({x:.3,y:.4},DEFAULT_ZONES[0],'m')]}]};
  assert.equal(validateBackup(backup),backup);
  assert.throws(()=>validateBackup({...backup,records:[{...backup.records[0],markers:[{...backup.records[0].markers[0],x:NaN}]}]}));
  assert.throws(()=>validateBackup({...backup,zones:[{id:'x',name:'X',color:'url(evil)'}]}));
  assert.throws(()=>validateBackup({...backup,records:[backup.records[0],backup.records[0]]}));
});
test('Export filenames retain Czech characters and remove path separators',()=>{
  assert.equal(safeName('Šachta / u terasy'),'Šachta-u-terasy');assert.equal(safeName(''),'zavlahova-sachta');
});
