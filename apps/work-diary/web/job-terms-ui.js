// One job can keep several work days. A missing schedule stays a normal single-day job.
import {durationLabel, termSpan} from './planning-model.js?v=workspace-roles-v1';
import {durationPickerMarkup, refreshDurationTotals} from './planning-fields.js?v=workspace-roles-v1';
const WEEKDAYS = ['neděle','pondělí','úterý','středa','čtvrtek','pátek','sobota'];

export function shiftDate(iso, days){
  const date = new Date(iso+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
export function buildTermDates(start, count, weekends){
  const days = [];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)) return days;
  let date = start, guard = 0;
  const total = Math.max(1, Math.min(14, Number(count)||1));
  while(days.length<total && guard<40){
    const weekday = new Date(date+'T12:00:00Z').getUTCDay();
    if(weekends||(weekday!==0&&weekday!==6)) days.push(date);
    date = shiftDate(date, 1);
    guard++;
  }
  return days;
}
function dayLabel(iso){
  const date = new Date(iso+'T12:00:00Z');
  return Number.isNaN(date.getTime()) ? '' : `${WEEKDAYS[date.getUTCDay()]} ${iso.slice(8)}. ${iso.slice(5,7)}.`;
}
function dayWord(count){return count===1?'den':count<5?'dny':'dní';}
function hours(ms){
  if(!ms) return 'zatím bez záznamu';
  const value = Math.round(ms/360000)/10;
  return `${String(value).replace('.',',')} h`;
}
function rowMarkup(term, index, people, esc){
  const selected = new Set(term.people||[]);
  return `<div class="job-term-row" data-term-row>
    <div class="job-term-main">
      <label class="field">Den<input data-term-date type="date" required value="${esc(term.date||'')}"></label>
      <label class="field">Od<input data-term-start data-duration-start-input type="time" step="60" value="${esc(term.start||'07:00')}"></label>
      <label class="field">Stav<select data-term-status><option value="planned" ${(term.status||'planned')==='planned'?'selected':''}>Naplánováno</option><option value="done" ${term.status==='done'?'selected':''}>Dokončeno</option></select></label>
    </div>
    ${durationPickerMarkup({prefix:'term-'+index, start:term.start||'07:00', end:term.end||'15:00', esc, term:true})}
    <label class="field">Pracovníci<select data-term-people multiple size="${Math.min(4, Math.max(people.length, 1))}">${people.map(person=>`<option value="${esc(person.id)}" ${selected.has(person.id)?'selected':''}>${esc(person.name)}</option>`).join('')}</select></label>
    <label class="field">Poznámka<input data-term-note maxlength="300" value="${esc(term.note||'')}" placeholder="Např. jiná zakázka, kratší den"></label>
    <button class="btn ghost" type="button" data-term-remove>Odebrat den</button>
  </div>`;
}
export function termEditorMarkup(job, people, esc){
  const terms = Array.isArray(job?.terms)&&job.terms.length>1 ? job.terms : [];
  const multi = terms.length>1;
  return `<fieldset class="job-terms" id="job-terms"><legend>Rozsah zakázky</legend>
    <div class="job-terms-mode" role="radiogroup" aria-label="Rozsah zakázky">
      <label><input type="radio" name="termMode" value="single" ${multi?'':'checked'}> Jednodenní zakázka</label>
      <label><input type="radio" name="termMode" value="multi" ${multi?'checked':''}> Vícedenní zakázka</label>
    </div>
    <div class="job-terms-builder" ${multi?'':'hidden'}>
      <div class="job-term-main">
        <label class="field">První den<input type="date" id="job-terms-start" value="${esc(terms[0]?.date||job?.dueDate||'')}"></label>
        <label class="field">Počet pracovních dní<input type="number" id="job-terms-count" min="1" max="14" value="${terms.length||4}"></label>
        <label class="choice"><input type="checkbox" id="job-terms-weekends"> Zahrnout víkendy</label>
      </div>
      <div class="actions"><button class="btn" type="button" id="job-terms-fill">Vygenerovat dny</button><button class="btn" type="button" id="job-terms-add">Přidat den</button><button class="btn" type="button" id="job-terms-copy">Stejní pracovníci na všechny dny</button></div>
      <div id="job-terms-list">${terms.map((term,index)=>rowMarkup(term,index,people,esc)).join('')}</div>
      <p class="mini-empty" data-duration-total></p>
      <p class="mini-empty">Vznikne jedna zakázka. Dokončení jednoho dne nezavře celou zakázku. Úprava názvu nebo adresy termíny nemaže.</p>
    </div>
  </fieldset>`;
}
export function readTermPayload(form){
  if(form.querySelector('[name=termMode]:checked')?.value!=='multi') return null;
  const terms = [...form.querySelectorAll('[data-term-row]')].map(row=>({
    date:row.querySelector('[data-term-date]').value,
    start:row.querySelector('[data-term-start]').value||'07:00',
    end:row.querySelector('[data-term-end]').value||'15:00',
    people:[...row.querySelector('[data-term-people]').selectedOptions].map(option=>option.value),
    note:row.querySelector('[data-term-note]').value.trim(),
    status:row.querySelector('[data-term-status]').value
  }));
  return terms.length?terms:null;
}
export function bindTermEditor(form, people, esc){
  const box = form.querySelector('#job-terms');
  if(!box) return;
  const list = box.querySelector('#job-terms-list');
  const builder = box.querySelector('.job-terms-builder');
  const paint = terms=>{list.innerHTML=terms.map((term,index)=>rowMarkup(term,index,people,esc)).join(''); refreshDurationTotals(box);};
  const current = ()=>readTermPayload(form)||[];
  const show = ()=>{builder.hidden=box.querySelector('[name=termMode]:checked')?.value!=='multi';};
  box.querySelectorAll('[name=termMode]').forEach(input=>input.addEventListener('change', show));
  box.querySelector('#job-terms-fill').onclick=()=>{
    const dates = buildTermDates(box.querySelector('#job-terms-start').value, box.querySelector('#job-terms-count').value, box.querySelector('#job-terms-weekends').checked);
    const existing = current();
    paint(dates.map(date=>existing.find(term=>term.date===date)||{date,start:'07:00',end:'15:00',people:existing[0]?.people||[],status:'planned',note:''}));
  };
  box.querySelector('#job-terms-add').onclick=()=>{
    const rows = current();
    const last = rows.at(-1)?.date||box.querySelector('#job-terms-start').value;
    const date = last?buildTermDates(shiftDate(last,1),1,box.querySelector('#job-terms-weekends').checked)[0]:'';
    paint([...rows,{date,start:'07:00',end:'15:00',people:rows[0]?.people||[],status:'planned',note:''}]);
  };
  box.querySelector('#job-terms-copy').onclick=()=>{
    const rows = current();
    if(!rows.length) return;
    paint(rows.map(term=>({...term,people:[...rows[0].people]})));
  };
  list.addEventListener('click', event=>{
    const button = event.target.closest('[data-term-remove]');
    if(!button) return;
    const row = button.closest('[data-term-row]');
    const rows = [...list.querySelectorAll('[data-term-row]')];
    paint(current().filter((_,index)=>rows[index]!==row));
  });
  show();
  refreshDurationTotals(box);
}
export function scheduleBadge(job){
  const days = job?.schedule?.days||(Array.isArray(job?.terms)&&job.terms.length>1?job.terms.length:0);
  if(days<2) return '';
  const done = job?.schedule?.done??job.terms.filter(term=>term.status==='done').length;
  const next = job?.schedule?.next||job.terms.find(term=>term.status!=='done')?.date||'';
  return `<span class="job-term-badge">Vícedenní · ${days} ${dayWord(days)}</span><span class="job-term-progress">${done} ze ${days} ${dayWord(days)} dokončeno${next?` · nejbližší ${dayLabel(next)}`:''}</span>`;
}
export function scheduleMarkup(job, people, esc){
  const terms = Array.isArray(job?.terms)?job.terms:[];
  if(terms.length<2) return '';
  const names = new Map(people.map(person=>[person.id, person.name]));
  const done = terms.filter(term=>term.status==='done').length;
  const total = terms.reduce((sum, term)=>sum+(termSpan(term.start, term.end)||0), 0);
  return `<section class="job-schedule-section" aria-label="Harmonogram realizace"><h3>Harmonogram realizace</h3><p class="mini-empty">${total?`Celková plánovaná délka: ${esc(durationLabel(total))}. `:''}${done} ze ${terms.length} dní dokončeno. Jeden dokončený den nezavře celou zakázku.</p>${terms.map((term,index)=>`<article class="job-term-card" data-schedule-term="${index}"><header><strong>${esc(dayLabel(term.date))}</strong><span>${esc(term.start)}–${esc(term.end)}</span></header><p>${esc((term.people||[]).map(id=>names.get(id)||'Kolega').join(', ')||'Bez pracovníků')}</p><p>Odpracováno: ${esc(term.worked?.length?term.worked.map(item=>`${item.name} ${hours(item.ms)}`).join(', '):hours(term.workedMs))}</p><p>Stav: ${term.status==='done'?'dokončeno':'naplánováno'}${term.note?` · ${esc(term.note)}`:''}</p><label class="field">Přesunout jen tento den<input data-move-date type="date" value="${esc(term.date)}"></label><button class="btn" type="button" data-move-term="${index}">Přesunout den</button><button class="btn" type="button" data-finish-term="${index}">${term.status==='done'?'Vrátit den do plánu':'Dokončit jen tento den'}</button></article>`).join('')}</section>`;
}
