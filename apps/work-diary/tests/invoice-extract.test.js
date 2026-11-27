import test from 'node:test';import assert from 'node:assert/strict';
import {parseInvoiceText,invoiceAmount,invoicePrefill} from '../web/invoice-extract-model.js';
import {invoicePageLayout} from '../web/invoice-pdf-reader.js';
const text=`Faktura číslo: FV-2026-001
Dodavatel:
Servis Zahrad s.r.o.
IČO: 12345678
Odběratel:
Dr. Závlaha s.r.o.
IČO: 87654321
Datum vystavení: 26.11.2026
Datum splatnosti: 10.12.2026
Základ DPH 10 000,00
DPH 2 100,00
Celkem k úhradě: 12 100,00 Kč
Variabilní symbol: 20260001
Číslo účtu: 123456789/0100`;
test('Czech invoice extraction chooses payable total rather than VAT and identifies the payer by company ID',()=>{
 const r=parseInvoiceText(text,{company:{companyId:'87654321'}});assert.equal(r.fields.amount,1210000);assert.equal(r.fields.direction,'expense');assert.equal(r.fields.counterparty,'Servis Zahrad s.r.o.');assert.equal(r.fields.currency,'CZK');assert.equal(r.fields.reference,'FV-2026-001');assert.equal(r.fields.dueDate,'2026-12-10');assert.equal(r.fields.issuedOn,'2026-11-26');assert.equal(r.fields.variableSymbol,'20260001');assert.equal(r.fields.bankAccount,'123456789/0100');assert.equal(r.requiresReview,true);assert.equal(r.fields.paidMinor,undefined);
 const outgoing=parseInvoiceText(text,{company:{companyId:'12345678'}});assert.equal(outgoing.fields.direction,'income');assert.equal(outgoing.fields.counterparty,'Dr. Závlaha s.r.o.');
});
test('Ambiguous amounts, missing identity, invalid dates, currency and payment claims require review',()=>{
 let r=parseInvoiceText(text+'\nCelkem k úhradě: 100,00 Kč\nUhrazeno převodem');assert.equal(r.fields.amount,undefined);assert.equal(r.fields.direction,undefined);assert.ok(r.warnings.some(x=>/Skutečné platby/.test(x)));
 r=parseInvoiceText(text.replace('12 100,00 Kč','12 100,00 EUR').replace('10.12.2026','31.13.2026'));assert.equal(r.fields.currency,'EUR');assert.equal(r.fields.dueDate,undefined);assert.ok(r.warnings.some(x=>/Cizí měnu/.test(x)));
 r=parseInvoiceText(text,{partial:true});assert.equal(r.fields.amount,undefined);
});
test('Zero due and credit notes never fall back to a positive VAT total or invent a paid transaction',()=>{
 const r=parseInvoiceText(text.replace('12 100,00 Kč','0,00 Kč')+'\nCelkem včetně DPH: 12 100,00 Kč\nUhrazeno');assert.equal(r.fields.amount,undefined);assert.equal(r.fields.paidMinor,undefined);
 assert.equal(parseInvoiceText('Dobropis\nCelkem k úhradě: -100,00 Kč').fields.amount,undefined);
});
test('Decimal precision and staff edits survive prefilling',()=>{
 for(const [s,n] of [['1 234,56',123456],['1,234.56',123456],['1.234,56',123456],['10.000',1000000]])assert.equal(invoiceAmount(s),n);
 assert.equal(invoiceAmount('-100'),null);assert.equal(invoiceAmount('1,234'),null);assert.deepEqual(invoicePrefill({amount:123456,counterparty:'ACME',direction:'expense'},new Set(['counterparty'])),{amount:'1234.56',direction:'expense'});
});
test('PDF text layout keeps supplier and customer columns separate',()=>{
 const token=(str,x,y,width=100)=>({str,transform:[1,0,0,1,x,y],width});const layout=invoicePageLayout([token('Dodavatel:',40,700),token('Odběratel:',310,700),token('Servis ABC',40,680),token('Dr. Závlaha',310,680),token('IČO: 12345678',40,660),token('IČO: 87654321',310,660)]);
 const r=parseInvoiceText(layout.text,{company:{companyId:'87654321'},parties:layout.parties});assert.equal(r.fields.direction,'expense');assert.equal(r.fields.counterparty,'Servis ABC');assert.doesNotMatch(layout.parties.supplier,/87654321/);
});
