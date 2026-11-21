import test from 'node:test';
import assert from 'node:assert/strict';
import {readImportSheet, priceMinor} from '../web/assistant-import.js';

test('A customer table keeps only complete rows and does not invent contacts', ()=>{
  const sheet = readImportSheet('Jméno;Telefon;E-mail;Adresa;Město\nNovák;777111222;;Lesní 1;Plzeň\nŠpatný;abc;;;\nNovák;777111222;;Lesní 1;Plzeň\n', 'Načti zákazníky');
  assert.equal(sheet.kind, 'customers');
  assert.equal(sheet.records.length, 1);
  assert.deepEqual(sheet.records[0], {name:'Novák', email:'', phone:'777111222', address:'Lesní 1', city:'Plzeň'});
  assert.match(sheet.skipped.join(' '), /telefon|dvakrát/);
  assert.equal(sheet.records[0].email, '');
});

test('Material prices stay in the file and a missing price is skipped', ()=>{
  assert.equal(priceMinor('125,50 Kč'), 12550);
  assert.equal(priceMinor('1 250'), 125000);
  assert.equal(priceMinor(''), null);
  const sheet = readImportSheet('Název;Jednotka;Cena\nPostřikovač R-VAN 14;ks;125,50\nPotrubí;m;\n', 'materiál');
  assert.equal(sheet.records.length, 1);
  assert.equal(sheet.records[0].priceMinor, 12550);
  assert.equal(sheet.records[0].unit, 'ks');
  assert.match(sheet.skipped[0], /Potrubí/);
});

test('An unmarked table is not guessed', ()=>{
  const sheet = readImportSheet('A;B\n1;2\n', '');
  assert.match(sheet.error, /nepoznám/);
});
