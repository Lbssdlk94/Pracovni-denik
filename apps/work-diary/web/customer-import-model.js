// One customer may span several rows only when the source supplies a stable ID.
// Original fields, including internal notes, are kept separately from contacts.
const CI_LIMIT=250,CI_ENTRY_LIMIT=20;
const ciFold=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('cs').replace(/[^a-z0-9]+/g,' ').trim();
const ciAliases={
 id:['id zakaznika','id mwork','customer id'],name:['zakaznik','jmeno','jmeno zakaznika','nazev zakaznika','firma','name','nazev'],
 person:['kontaktni osoba','jmeno kontaktu','contact person'],phone:['telefon','tel','mobil','phone'],email:['e mail','email','mail'],
 address:['adresa','ulice','ulice a cislo','address'],city:['mesto','obec','city'],zip:['psc','zip','postal code'],place:['nazev mista','oznaceni adresy'],
 extraContacts:['dalsi kontakty'],extraAddresses:['dalsi adresy'],category:['kategorie','obor','obory'],kind:['druh kontaktu','typ kontaktu'],
 billingName:['fakturacni nazev','fakturacni jmeno','fakturacni firma'],billingAddress:['fakturacni adresa'],billingCity:['fakturacni mesto'],billingZip:['fakturacni psc'],companyId:['ico','ic'],taxId:['dic'],
};
function ciColumns(headers){return Object.fromEntries(Object.entries(ciAliases).map(([key,names])=>[key,headers.findIndex(h=>names.includes(ciFold(h)))]));}
const ciField=(row,index)=>index<0?'':String(row[index]||'').trim();
function ciPhone(value){const text=String(value||'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();if(text&&!/^\+?[0-9 ()\-./#*;,]{3,50}$/.test(text))throw Error('neplatný telefon');return text;}
function ciMail(value){const text=String(value||'').trim();if(text&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text))throw Error('neplatný e-mail');return text;}
function ciAddress(text,label=''){
 const match=text.match(/\s*\[([^\]]+)\]\s*$/);if(match){label=match[1];text=text.slice(0,match.index).trim();}
 if(!text)return null;if(text.length>500)throw Error('adresa je delší než 500 znaků');
 return {id:'',label:label.slice(0,60),address:text,city:''};
}
function ciPushUnique(values,item,key){if(!item)return;if(values.some(value=>key(value)===key(item)))return;if(values.length>=CI_ENTRY_LIMIT)throw Error('více než 20 adres nebo kontaktů');values.push(item);}
function ciExtraContact(text){
 const email=text.match(/[^\s<>;,]+@[^\s<>;,]+\.[^\s<>;,]+/),number=text.match(/\+420\s*\d{3}\s*\d{3}\s*\d{3}|\b\d{3}\s*\d{3}\s*\d{3}\b|\+\d[\d ()-]{7,24}/);
 if(!number&&!email)throw Error('další kontakt nemá rozpoznatelný telefon ani e-mail');
 const at=Math.min(number?.index??Infinity,email?.index??Infinity),name=text.slice(0,at).trim();
 let rest=text.slice(at);if(number)rest=rest.replace(number[0],'');if(email)rest=rest.replace(email[0],'');
 return {id:'',name:name.slice(0,160),phone:ciPhone(number?.[0]||''),email:ciMail(email?.[0]||''),note:rest.trim().replace(/^\((.*)\)$/,'$1').slice(0,300)};
}
export function readCustomerProfiles(table){
 const c=ciColumns(table.headers);if(c.name<0)return {error:'Chybí sloupec Zákazník nebo Jméno. Nic jsem neuložil.'};
 const advanced=['id','person','extraContacts','extraAddresses','billingName','billingAddress','companyId','taxId','category','kind'].some(key=>c[key]>=0);
 const groups=new Map(),records=[],skipped=[];let index=0;
 for(const row of table.rows){index++;const name=ciField(row,c.name),sourceId=ciField(row,c.id),key=sourceId?'id:'+sourceId:'name:'+ciFold(name);
  if(!name){skipped.push(`řádek ${index+1}: chybí jméno`);continue;}
  if(!sourceId&&groups.has(key)){skipped.push(`${name}: jméno je v souboru dvakrát; doplňte ID zákazníka pro více adres a kontaktů, další řádek vyžaduje ruční kontrolu`);continue;}
  let profile=groups.get(key);
  if(!profile){
   if(groups.size>=CI_LIMIT)return {error:`Soubor obsahuje více než ${CI_LIMIT} zákazníků. Rozdělte jej. Nic jsem neuložil.`};
   profile={name,email:'',phone:'',address:'',city:'',phones:[],addresses:[],contacts:[],billing:{},disciplines:[],contactKind:'customer',sourceRef:sourceId?(ciFold(table.headers[c.id])==='id mwork'?'mwork:':'csv:')+sourceId:null,importDetails:{sourceRows:[],original:[]}};groups.set(key,profile);records.push(profile);
  }
  try{
   if(name!==profile.name)throw Error('stejné ID má různá jména');
   const phone=ciPhone(ciField(row,c.phone)),email=ciMail(ciField(row,c.email)),person=ciField(row,c.person);
   if(name.length>160||email.length>254)throw Error('jméno nebo e-mail je příliš dlouhý');
   const street=ciField(row,c.address),city=ciField(row,c.city),zip=ciField(row,c.zip);
   if(zip&&!/^\d{3}\s?\d{2}$/.test(zip))throw Error('PSČ není platné (např. 261 01)');
   if(zip&&!street)throw Error('u PSČ chybí ulice nebo úplná adresa');if(city.length>120)throw Error('město je příliš dlouhé');
   const address=ciAddress([street,zip].filter(Boolean).join(', '),ciField(row,c.place));if(address)address.city=city;
   const contact=phone||email||person?{id:'',name:person||name,phone,email,note:''}:null;
   ciPushUnique(profile.contacts,contact,v=>[v.name,v.phone,v.email,v.note].join('|'));
   ciPushUnique(profile.addresses,address,v=>v.address+'|'+v.city+'|'+v.label);
   for(const extra of ciField(row,c.extraContacts).split(/[;\n]+/).map(v=>v.trim()).filter(Boolean))ciPushUnique(profile.contacts,ciExtraContact(extra),v=>[v.name,v.phone,v.email,v.note].join('|'));
   for(const extra of ciField(row,c.extraAddresses).split(/[;\n]+/).map(v=>v.trim()).filter(Boolean))ciPushUnique(profile.addresses,ciAddress(extra),v=>v.address+'|'+v.city+'|'+v.label);
   const billing={name:ciField(row,c.billingName),address:[ciField(row,c.billingAddress),ciField(row,c.billingZip),ciField(row,c.billingCity)].filter(Boolean).join(', '),companyId:ciField(row,c.companyId),taxId:ciField(row,c.taxId)};
   for(const [field,value] of Object.entries(billing))if(value){if(profile.billing[field]&&profile.billing[field]!==value)throw Error('stejné ID má různé fakturační údaje');profile.billing[field]=value;}
   const category=ciFold(ciField(row,c.category));let disciplines=[];
   if(['oboji','zavlaha garden','zavlaha zahrada'].includes(category))disciplines=['irrigation','garden'];
   else if(['zavlaha','zavlahy','irrigation'].includes(category))disciplines=['irrigation'];
   else if(['garden','zahrada','zahrady'].includes(category))disciplines=['garden'];
   else if(category&&category!=='dodavatel')throw Error('neznámý obor; použijte Závlaha, Garden nebo Obojí');
   profile.disciplines=[...new Set([...profile.disciplines,...disciplines])];
   const kind=ciFold(ciField(row,c.kind));if(kind&&!['zakaznik','dodavatel','oboji','customer','supplier','both'].includes(kind))throw Error('neznámý druh kontaktu');
   const role=kind==='dodavatel'||kind==='supplier'||category==='dodavatel'?'supplier':kind==='oboji'||kind==='both'?'both':'customer';
   if(profile.importDetails.sourceRows.length&&profile.contactKind!==role)throw Error('stejné ID má rozdílný druh kontaktu');profile.contactKind=role;
   profile.importDetails.sourceRows.push(index+1);profile.importDetails.original.push(Object.fromEntries(table.headers.map((h,i)=>[h,String(row[i]||'')])));
  }catch(error){profile.invalid=true;skipped.push(`${name} (řádek ${index+1}): ${error.message}; profil vyžaduje kontrolu`);}
 }
 const valid=records.filter(p=>!p.invalid).map(profile=>{
  profile.contacts.forEach((v,i)=>v.id='contact-'+(i+1));profile.addresses.forEach((v,i)=>v.id='address-'+(i+1));
  for(const contact of profile.contacts)if(contact.phone)ciPushUnique(profile.phones,{id:'phone-'+(profile.phones.length+1),label:contact.name.slice(0,60),number:contact.phone},v=>v.number.replace(/\D/g,''));
  profile.email=profile.contacts.find(v=>v.email)?.email||'';profile.phone=profile.phones[0]?.number||'';profile.address=profile.addresses[0]?.address||'';profile.city=profile.addresses[0]?.city||'';
  if(!advanced)return {name:profile.name,email:profile.email,phone:profile.phone,address:profile.address,city:profile.city};
  return profile;
 });
 if(!valid.length)return {error:'Žádný zákazník z tabulky nejde použít. '+skipped.slice(0,10).join('\n')+' Nic jsem neuložil.'};
 return {kind:'customers',records:valid,skipped};
}
