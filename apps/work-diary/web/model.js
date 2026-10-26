export const COLORS = ['#e87541','#378567','#597dc6','#b68a2e','#a567ab','#d05b64'];
export const DEFAULT_ZONES = [
  {id:'front',name:'Trávník před domem',color:COLORS[0]},
  {id:'back',name:'Trávník za domem',color:COLORS[1]},
  {id:'beds',name:'Záhony',color:COLORS[2]},
  {id:'drip',name:'Kapková závlaha',color:COLORS[3]}
];
export const clamp = (value,min=0,max=1) => Math.max(min,Math.min(max,value));
export function normalizedPoint(clientX,clientY,rect) {
  return {x:clamp((clientX-rect.left)/rect.width),y:clamp((clientY-rect.top)/rect.height)};
}
export function createMarker(point,zone,id) {
  return {id,x:clamp(point.x),y:clamp(point.y),labelX:clamp(point.x+.15,.17,.83),labelY:clamp(point.y-.12,.07,.93),zoneId:zone.id,zoneName:zone.name,color:zone.color};
}
export function safeName(name) {return (name.trim().replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,70)||'zavlahova-sachta');}
export function validateBackup(value) {
  if(value?.format!=='zavlahovy-denik'||![1,2,3,4,5,6].includes(value.version)||!Array.isArray(value.records)||!Array.isArray(value.zones)) throw new Error('Soubor není záloha Závlahového deníku.');
  if(value.records.length>100000||value.zones.length>200) throw new Error('Záloha obsahuje příliš mnoho záznamů.');
  const text=(v,n)=>typeof v==='string'&&v.length<=n;
  const color=v=>/^#[0-9a-f]{6}$/i.test(v);
  if(value.zones.some(z=>!text(z.id,100)||!text(z.name,100)||!z.name.trim()||!color(z.color))) throw new Error('Seznam zón v záloze není platný.');
  const gardens=value.version>=2?value.gardens:[];
  const validId=v=>typeof v==='string'&&/^[-a-zA-Z0-9_]{1,100}$/.test(v);
  if(!Array.isArray(gardens)||gardens.length>100000||new Set(gardens.map(g=>g.id)).size!==gardens.length)throw new Error('Seznam zahrad v záloze není platný.');
  for(const g of gardens){if(!validId(g.id)||!text(g.name,100)||!g.name.trim()||!text(g.address,500)||!text(g.notes,2000))throw new Error('Zahrada v záloze není platná.');if(g.plan&&(!text(g.plan.name,180)||!['application/pdf','image/jpeg','image/png','image/webp'].includes(g.plan.type)||!text(g.plan.data,29_000_000)||!g.plan.data.startsWith('data:'+g.plan.type+';base64,')))throw new Error('Plán v záloze není platný.');}
  for(const g of gardens){const markers=g.plan?.markers;if(markers===undefined)continue;if(!Array.isArray(markers)||markers.length>500||new Set(markers.map(p=>p?.shaftId)).size!==markers.length||markers.some(p=>!validId(p?.shaftId)||!Number.isFinite(p.x)||p.x<0||p.x>1||!Number.isFinite(p.y)||p.y<0||p.y>1||!g.plan.type.startsWith('image/')||!value.records.some(r=>r.id===p.shaftId&&r.gardenId===g.id)))throw new Error('Značky šachet v plánu nejsou platné.');}
  for(const g of gardens){if(g.blowout===undefined){if(value.version>=6)throw new Error('Pokyny k vyfukování v záloze chybí.');continue;}const steps=g.blowout,photoIds=new Set();if(!Array.isArray(steps)||steps.length>34||steps.filter(s=>!s?.hidden).length>30||new Set(steps.map(s=>s?.id)).size!==steps.length)throw new Error('Pokyny k vyfukování nejsou platné.');for(const s of steps){if(s?.hidden!==undefined&&(typeof s.hidden!=='boolean'||(s.hidden&&(!['compressor','pump','water','supply'].includes(s.id)||s.notes!==''||s.photos?.length))))throw new Error('Smazaná položka vyfukování není platná.');if(!validId(s?.id)||!text(s.title,100)||!s.title.trim()||!text(s.notes,4000)||!Array.isArray(s.photos)||s.photos.length>6)throw new Error('Položka vyfukování není platná.');for(const p of s.photos){if(!validId(p?.id)||photoIds.has(p.id)||photoIds.size>=40||!['image/jpeg','image/png','image/webp'].includes(p.type)||!text(p.data,12000000)||!p.data.startsWith('data:'+p.type+';base64,'))throw new Error('Fotografie vyfukování není platná.');photoIds.add(p.id);}}}
  const serviceIds=new Set();
  for(const g of gardens){if(g.pumpType!==undefined&&!text(g.pumpType,160))throw new Error('Typ čerpadla v záloze není platný.');const entries=value.version>=3?g.services:[];if(!Array.isArray(entries)||entries.length>5000)throw new Error('Servisní historie v záloze není platná.');for(const s of entries){const d=typeof s.date==='string'?new Date(s.date+'T00:00:00Z'):null;if(!validId(s.id)||serviceIds.has(s.id)||(s.gardenId!==undefined&&s.gardenId!==g.id)||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!d||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s.date||Number(s.date.slice(0,4))<1000||!text(s.work,4000)||!s.work.trim()||!text(s.parts,2000)||!text(s.notes,2000))throw new Error('Servisní záznam v záloze není platný.');serviceIds.add(s.id);}}
  for(const r of value.records) {
    if(r.position!=null&&(!Number.isFinite(r.position.latitude)||r.position.latitude<-90||r.position.latitude>90||!Number.isFinite(r.position.longitude)||r.position.longitude<-180||r.position.longitude>180||(r.position.accuracy!=null&&(!Number.isFinite(r.position.accuracy)||r.position.accuracy<0||r.position.accuracy>50000))))throw new Error('GPS poloha v záloze není platná.');
    if(r.gardenId!=null&&(!validId(r.gardenId)||!gardens.some(g=>g.id===r.gardenId)))throw new Error('Šachta odkazuje na neplatnou zahradu.');
    if(!text(r.id,100)||!text(r.name,100)||!text(r.location,160)||!text(r.notes,2000)||!Number.isFinite(r.updatedAt)||!Number.isFinite(r.createdAt)||!Array.isArray(r.markers)||r.markers.length>100||!text(r.image,20_000_000)||!/^data:image\/(jpeg|png);base64,/.test(r.image)) throw new Error('Záznam v záloze není platný.');
    for(const m of r.markers) if(!text(m.id,100)||!text(m.zoneName,100)||!text(m.zoneId,100)||!color(m.color)||['x','y','labelX','labelY'].some(k=>!Number.isFinite(m[k])||m[k]<0||m[k]>1)) throw new Error('Popisek v záloze není platný.');
  }
  if(new Set(value.records.map(r=>r.id)).size!==value.records.length||new Set(value.zones.map(z=>z.id)).size!==value.zones.length) throw new Error('Záloha obsahuje opakované záznamy.');
  return value;
}
