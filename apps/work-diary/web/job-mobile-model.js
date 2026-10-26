// Presentation only: the saved address and navigation destination remain untouched.
export function shortJobAddress(value){
 const seen=new Set();return String(value||'').split(',').map(s=>s.replace(/(?:^|\s)\d{3}\s?\d{2}(?=\s|$)/g,'').trim()).filter(s=>{const key=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');if(!key||['ceska republika','cesko','czech republic','czechia'].includes(key)||seen.has(key))return false;seen.add(key);return true;}).join(', ');
}
export function moveJobDay(day,amount){return new Date(Date.parse(day+'T12:00:00Z')+amount*86400000).toISOString().slice(0,10);}
