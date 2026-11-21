import {foldCzech} from './assistant-commands.js';

const CUSTOMER = {name:['jmeno','zakaznik','name','firma'], phone:['telefon','phone','tel','mobil'], email:['email','e mail','mail'], address:['adresa','address','ulice'], city:['mesto','city','obec']};
const MATERIAL = {name:['nazev','polozka','material','name'], unit:['jednotka','unit','mj'], price:['cena','price','castka'], sku:['kod','sku','cislo']};

function parseRows(text, delimiter){
  const rows = [];
  let row = [], cell = '', quote = false;
  const source = String(text||'').replace(/^\uFEFF/, '').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  for(let i=0;i<source.length;i++){
    const char = source[i];
    if(quote){
      if(char==='"'&&source[i+1]==='"'){cell+='"'; i++;}
      else if(char==='"') quote = false;
      else cell += char;
    }else if(char==='"') quote = true;
    else if(char===delimiter){row.push(cell.trim()); cell='';}
    else if(char==='\n'){row.push(cell.trim()); if(row.some(Boolean)) rows.push(row); row=[]; cell='';}
    else cell += char;
  }
  row.push(cell.trim());
  if(row.some(Boolean)) rows.push(row);
  return rows;
}
function delimiterOf(line){
  const counts = {';':0, ',':0, '\t':0};
  let quote = false;
  for(let i=0;i<line.length;i++){
    const char = line[i];
    if(char==='"') quote = !quote;
    else if(!quote&&counts[char]!==undefined) counts[char]++;
  }
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][1]?Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0]:';';
}
export function parseSpreadsheet(text){
  const raw = String(text||'').replace(/^\uFEFF/, '').trim();
  if(!raw) return {error:'Soubor je prázdný. Nic jsem neuložil.'};
  if(raw.includes('\u0000')) return {error:'Soubor není textová tabulka. Uložte ho jako CSV. Nic jsem neuložil.'};
  const rows = parseRows(raw, delimiterOf(raw.split(/\n/,1)[0]));
  if(rows.length<2) return {error:'V souboru chybí data pod hlavičkou. První řádek má pojmenovat sloupce. Nic jsem neuložil.'};
  if(rows.length-1>40) return {error:`Soubor má ${rows.length-1} řádků. Najednou vezmu nejvýše 40, ať se import nezastaví v půlce. Rozdělte ho. Nic jsem neuložil.`};
  return {headers:rows[0].map(foldCzech), rows:rows.slice(1)};
}
function column(headers, aliases){
  return headers.findIndex(header=>aliases.some(alias=>header===alias||header.startsWith(alias+' ')));
}
function phoneOk(value){
  return /^\+?[0-9 ()\-./#*;,]{3,50}$/.test(value)&&/[0-9]{2}/.test(value.replace(/\D/g,''));
}
export function priceMinor(value){
  let text = String(value||'').toLocaleLowerCase('cs').normalize('NFD').replace(/\p{M}/gu,'').replace(/kč|kc|czk/g,'').replace(/\s/g,'');
  if(!text) return null;
  if(/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g,'');
  else text = text.replace(',','.');
  if(!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [koruny, halere=''] = text.split('.');
  const minor = Number(koruny)*100+Number((halere+'00').slice(0,2));
  return Number.isSafeInteger(minor)&&minor>=0&&minor<=100000000?minor:null;
}
function sameName(a, b){return foldCzech(a)===foldCzech(b);}
export function readImportSheet(text, hint=''){
  const table = parseSpreadsheet(text);
  if(table.error) return table;
  const folded = foldCzech(hint);
  const customerHint = /\bzakaz/.test(folded), materialHint = /\b(material|poloz|katalog)\b/.test(folded);
  const customerColumns = column(table.headers, CUSTOMER.name)>=0&&(column(table.headers, CUSTOMER.phone)>=0||column(table.headers, CUSTOMER.email)>=0||column(table.headers, CUSTOMER.address)>=0);
  const materialColumns = column(table.headers, MATERIAL.name)>=0&&(column(table.headers, MATERIAL.unit)>=0||column(table.headers, MATERIAL.price)>=0);
  const kind = customerHint&&!materialHint?'customers':materialHint&&!customerHint?'materials':customerColumns&&!materialColumns?'customers':materialColumns&&!customerColumns?'materials':'';
  if(!kind) return {error:'Podle souboru nepoznám, jestli jsou to zákazníci, nebo materiál. Napište to k souboru. Nic jsem neuložil.'};
  return kind==='customers'?readCustomers(table):readMaterials(table);
}
function readCustomers(table){
  const name = column(table.headers, CUSTOMER.name);
  if(name<0) return {error:'Nevidím sloupec se jménem zákazníka. Hlavička má mít například Jméno, Telefon, E-mail, Adresa, Město. Nic jsem neuložil.'};
  const phone = column(table.headers, CUSTOMER.phone), email = column(table.headers, CUSTOMER.email), address = column(table.headers, CUSTOMER.address), city = column(table.headers, CUSTOMER.city);
  const records = [], skipped = [];
  for(const row of table.rows){
    const item = {name:(row[name]||'').trim()};
    if(!item.name){skipped.push('řádek bez jména'); continue;}
    if(records.some(record=>sameName(record.name, item.name))){skipped.push(`${item.name}: v souboru je dvakrát`); continue;}
    const mail = email<0?'':(row[email]||'').trim();
    if(mail&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mail)){skipped.push(`${item.name}: e-mail není platný`); continue;}
    const number = phone<0?'':(row[phone]||'').trim();
    if(number&&!phoneOk(number)){skipped.push(`${item.name}: telefon není platný`); continue;}
    records.push({name:item.name, email:mail, phone:number, address:address<0?'':(row[address]||'').trim(), city:city<0?'':(row[city]||'').trim()});
  }
  if(!records.length) return {error:'Žádný zákazník z tabulky nejde použít. '+(skipped.slice(0,5).join(' ')||'')+' Nic jsem neuložil.'};
  return {kind:'customers', records, skipped};
}
function readMaterials(table){
  const name = column(table.headers, MATERIAL.name), unit = column(table.headers, MATERIAL.unit), price = column(table.headers, MATERIAL.price), sku = column(table.headers, MATERIAL.sku);
  if(name<0||unit<0||price<0) return {error:'U materiálu potřebuji sloupce Název, Jednotka a Cena. Chybějící cenu nedoplňuji. Nic jsem neuložil.'};
  const records = [], skipped = [];
  for(const row of table.rows){
    const itemName = (row[name]||'').trim(), itemUnit = (row[unit]||'').trim();
    const minor = priceMinor(row[price]||'');
    if(!itemName||!itemUnit||minor==null){skipped.push(`${itemName||'řádek'}: chybí název, jednotka nebo platná cena v Kč`); continue;}
    if(records.some(record=>sameName(record.name, itemName)&&record.unit===itemUnit)){skipped.push(`${itemName}: v souboru je dvakrát`); continue;}
    records.push({name:itemName, unit:itemUnit.slice(0,20), priceMinor:minor, sku:sku<0?'':(row[sku]||'').trim().slice(0,80)});
  }
  if(!records.length) return {error:'Žádná položka z tabulky nejde použít. '+(skipped.slice(0,5).join(' ')||'')+' Nic jsem neuložil.'};
  return {kind:'materials', records, skipped};
}
