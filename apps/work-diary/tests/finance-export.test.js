import test from 'node:test';import assert from 'node:assert/strict';import {financeCsv,financeZip} from '../web/finance-export.js';
test('CSV escapes spreadsheet formula injection, preserves decimal precision and quotes descriptions',()=>{
 const csv=financeCsv([{id:'r',title:'=HYPERLINK("evil")',counterparty:' @BAD',amountMinor:125050,direction:'income',status:'paid',date:'2026-12-01'}]);assert.ok(csv.startsWith('\ufeff'));assert.match(csv,/1250,50/);assert.match(csv,/'=HYPERLINK\(""evil""\)/);assert.match(csv,/' @BAD/);
});
test('ZIP contains independent standard headers, a known CRC and blocks traversal or duplicate names',async()=>{
 const bytes=new Uint8Array(await financeZip([{name:'hello.txt',data:'hello'}]).arrayBuffer()),v=new DataView(bytes.buffer);assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint32(14,true),0x3610a686);assert.equal(v.getUint32(bytes.length-22,true),0x06054b50);assert.throws(()=>financeZip([{name:'../x',data:'x'}]));assert.throws(()=>financeZip([{name:'a',data:''},{name:'a',data:''}]));
});
