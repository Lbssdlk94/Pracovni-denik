import {planTimeSummary,LEGACY_TIME_MEANINGS,DURATION_PRESETS,durationFromParts,durationParts,durationLabel,durationChoiceResult,termSpan} from './planning-model.js?v=workspace-roles-v1';
export function planningFields(job,esc,prefix='job'){return `${job?.startTime||job?.endTime?`<fieldset class="legacy-meaning"><legend>Upřesnění původního času</legend><p>${esc(job.startTime||'?')}${job.endTime?'–'+esc(job.endTime):''}</p><label class="field">Co původní rozmezí znamená?<select name="legacyTimeMeaning" id="${prefix}-legacy-meaning">${Object.entries(LEGACY_TIME_MEANINGS).map(([key,label])=>'<option value="'+key+'" '+((job.legacyTimeMeaning||'unknown')===key?'selected':'')+'>'+label+'</option>').join('')}</select></label><p class="mini-empty">Původní hodnoty zůstanou zachované. Plán práce a domluvený příjezd vyplňte samostatně; nic se automaticky nekopíruje.</p></fieldset>`:''}<fieldset class="explicit-planning"><legend>Plán práce</legend><div class="planning-fields"><label class="field">Plánovaný začátek práce<input id="${prefix}-planned-start" name="plannedStart" type="time" step="60" value="${esc(job?.plannedStart||'')}"></label>${durationPickerMarkup({prefix,minutes:job?.estimatedMinutes??null,start:job?.plannedStart||'',esc,name:'estimatedMinutes'})}</div><p class="mini-empty">Plánovaná doba určuje obsazení kolegy a kontrolu souběhu. Bez ní nelze souběh plně ověřit.</p></fieldset><details class="arrival-window-fields" ${job?.arrivalWindowStart?'open':''}><summary>Domluvené rozmezí příjezdu zákazníkovi</summary><div class="planning-fields"><label class="field">Příjezd nejdříve<input id="${prefix}-arrival-start" name="arrivalWindowStart" type="time" value="${esc(job?.arrivalWindowStart||'')}"></label><label class="field">Příjezd nejpozději<input id="${prefix}-arrival-end" name="arrivalWindowEnd" type="time" value="${esc(job?.arrivalWindowEnd||'')}"></label></div><p class="mini-empty">Rozmezí příjezdu není délka práce ani doba přejezdu.</p></details>`;}
export function readPlanningFields(form){return {...(form.elements.legacyTimeMeaning?{legacyTimeMeaning:form.elements.legacyTimeMeaning.value}:{}),plannedStart:form.elements.plannedStart.value,estimatedMinutes:form.elements.estimatedMinutes.value===''?null:Number(form.elements.estimatedMinutes.value),arrivalWindowStart:form.elements.arrivalWindowStart.value,arrivalWindowEnd:form.elements.arrivalWindowEnd.value};}
export async function saveJobWithWarnings(db,id,value){try{return await db.request('/api/jobs/'+encodeURIComponent(id),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(value)});}catch(e){if(e.code!=='job_schedule_warning'||!e.preview)throw e;const text=[...e.preview.overlaps.map(o=>(o.kind==='reserve'?'Nedostatečná rezerva':'Souběh práce')+': '+o.otherTitle+' · '+o.date+' '+o.startTime+'–'+o.endTime),...(e.preview.warnings||[]).map(w=>w.message)].join('\n');if(!confirm(text+'\n\nZkontroloval/a jsem upozornění a chci zakázku přesto uložit.'))throw Error('Zakázka zatím nebyla uložena. Upravte plán práce.');return db.request('/api/jobs/'+encodeURIComponent(id),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...value,allowOverlaps:true,previewRevision:e.preview.revision})});}}
export const scheduleText=planTimeSummary;
function knownMinutes(minutes, start, end, term){
  const numeric = minutes===''||minutes==null ? null : Number(minutes);
  if(Number.isInteger(numeric)&&numeric>=1&&numeric<=1440) return numeric;
  return term ? termSpan(start, end) : null;
}
export function durationPickerMarkup({prefix='duration', minutes=null, start='', end='', esc=value=>String(value??''), name='', term=false, endField=''}={}){
  const selected = knownMinutes(minutes, start, end, term);
  const custom = Number.isInteger(selected)&&!DURATION_PRESETS.some(([value])=>value===selected);
  const parts = durationParts(custom?selected:null);
  const result = durationChoiceResult({start, minutes:selected, term});
  const storedEnd = term ? (result.end || (termSpan(start, end) ? end : '')) : '';
  const choices = DURATION_PRESETS.map(([value, label])=>`<button type="button" class="duration-choice" data-duration-choice="${value}" aria-pressed="${selected===value}">${esc(label)}</button>`).join('')+`<button type="button" class="duration-choice" data-duration-choice="custom" aria-pressed="${custom}">Vlastní délka</button>`;
  const warning = result.overflow ? 'Konec by přesáhl půlnoc. Zkraťte dobu nebo posuňte začátek.' : result.midnight&&term ? 'Půlnoc nelze uložit jako konec dne. Zkraťte dobu nebo posuňte začátek.' : '';
  const status = warning || (result.end ? 'Konec: '+result.end : (result.text ? 'Délka: '+result.text : ''));
  return `<div class="duration-picker" data-duration-picker ${term?'data-duration-term':''} data-duration-start="${esc(start||'')}">
    <span class="duration-label">Plánovaná doba</span>
    <div class="duration-choices" role="group" aria-label="Plánovaná doba">${choices}</div>
    <div class="duration-custom" ${custom?'':'hidden'}>
      <label class="field">Hodiny<input data-duration-hours inputmode="numeric" min="0" max="24" step="1" value="${custom?esc(parts.hours):''}"></label>
      <label class="field">Minuty<input data-duration-minutes inputmode="numeric" min="0" max="59" step="1" value="${custom?esc(parts.minutes):''}"></label>
    </div>
    ${name?`<input type="hidden" name="${esc(name)}" id="${esc(prefix)}-estimated-minutes" value="${selected??''}">`:''}
    ${term?`<input type="hidden" data-term-end ${endField?`data-concept-field="${esc(endField)}"`:''} value="${esc(storedEnd)}">`:''}
    <p class="duration-end${warning?' is-warning':''}" data-duration-status>${esc(status)}</p>
  </div>`;
}
function pickerStart(picker){
  if(picker.hasAttribute('data-duration-term')) return picker.closest('[data-term-row], .assistant-term')?.querySelector('[data-duration-start-input]')?.value || picker.dataset.durationStart || '';
  return picker.closest('form')?.elements?.plannedStart?.value || picker.dataset.durationStart || '';
}
function pickerMinutes(picker){
  const custom = picker.querySelector('[data-duration-choice="custom"]')?.getAttribute('aria-pressed')==='true';
  if(custom && !picker.querySelector('.duration-custom')?.hidden){
    const parsed = durationFromParts(picker.querySelector('[data-duration-hours]')?.value.trim(), picker.querySelector('[data-duration-minutes]')?.value.trim());
    if(parsed) return parsed;
  }
  const pressed = [...picker.querySelectorAll('[data-duration-choice]')].find(button=>button.getAttribute('aria-pressed')==='true' && button.dataset.durationChoice!=='custom');
  if(pressed) return Number(pressed.dataset.durationChoice);
  const hidden = picker.querySelector('[name=estimatedMinutes]');
  if(hidden?.value!==''){const value=Number(hidden.value);if(Number.isInteger(value)) return value;}
  return termSpan(pickerStart(picker), picker.querySelector('[data-term-end]')?.value);
}
function markPressed(picker, minutes, custom){
  picker.querySelectorAll('[data-duration-choice]').forEach(button=>{
    const on = button.dataset.durationChoice==='custom' ? custom : !custom && button.dataset.durationChoice===String(minutes);
    button.setAttribute('aria-pressed', String(on));
  });
  const panel = picker.querySelector('.duration-custom');
  if(panel) panel.hidden = !custom;
}
function paintStatus(picker, result, term){
  const status = picker.querySelector('[data-duration-status]');
  if(!status) return;
  if(result.blocked){
    status.classList.add('is-warning');
    status.textContent = result.midnight ? 'Půlnoc nelze uložit jako konec dne. Zkraťte dobu nebo posuňte začátek.' : 'Konec by přesáhl půlnoc. Zkraťte dobu nebo posuňte začátek.';
    return;
  }
  status.classList.remove('is-warning');
  status.textContent = result.end ? 'Konec: '+result.end : (result.text ? 'Délka: '+result.text : '');
}
function writeControl(control, value){
  if(!control || control.value===value) return;
  control.value = value;
  control.dispatchEvent(new Event('input', {bubbles:true}));
}
function applyPicker(picker, minutes, {custom=false, source='choice'}={}){
  const term = picker.hasAttribute('data-duration-term');
  const start = pickerStart(picker);
  const result = durationChoiceResult({start, minutes, term});
  if(result.blocked){
    paintStatus(picker, result, term);
    if(!term && source==='start') writeControl(picker.querySelector('[name=estimatedMinutes]'), '');
    return;
  }
  markPressed(picker, result.minutes, custom);
  if(custom && result.minutes){
    const parts = durationParts(result.minutes);
    const hours = picker.querySelector('[data-duration-hours]'), mins = picker.querySelector('[data-duration-minutes]');
    if(hours && mins && durationFromParts(hours.value.trim(), mins.value.trim())!==result.minutes){hours.value=parts.hours; mins.value=parts.minutes;}
  }
  writeControl(picker.querySelector('[name=estimatedMinutes]'), result.minutes==null?'':String(result.minutes));
  if(result.end) writeControl(picker.querySelector('[data-term-end]'), result.end);
  picker.dataset.durationStart = start;
  paintStatus(picker, result, term);
  refreshDurationTotals(picker.closest('#job-terms, .assistant-concept-sheet, form') || document);
}
export function refreshDurationTotals(root){
  if(typeof document==='undefined' || !root?.querySelectorAll) return;
  root.querySelectorAll('[data-duration-total]').forEach(host=>{
    const box = host.closest('#job-terms, .assistant-concept-sheet, form') || root;
    const rows = [...box.querySelectorAll('[data-term-row], .assistant-term')];
    if(rows.length<2){host.textContent=''; return;}
    let total=0, missing=false;
    for(const row of rows){
      const span = termSpan(row.querySelector('[data-duration-start-input]')?.value, row.querySelector('[data-term-end]')?.value);
      if(!span) missing=true; else total+=span;
    }
    host.textContent = total ? `Celková plánovaná délka: ${durationLabel(total)}${missing?' (některý den nemá platnou délku)':''}` : 'Celková plánovaná délka: doplňte délku jednotlivých dní';
  });
}
function syncPickerFromValue(picker){
  const hidden = picker.querySelector('[name=estimatedMinutes]');
  if(!hidden) return;
  const minutes = hidden.value==='' ? null : Number(hidden.value);
  const custom = Number.isInteger(minutes) && !DURATION_PRESETS.some(([value])=>value===minutes);
  if(custom){
    const parts = durationParts(minutes);
    const hours = picker.querySelector('[data-duration-hours]'), mins = picker.querySelector('[data-duration-minutes]');
    if(hours) hours.value = parts.hours;
    if(mins) mins.value = parts.minutes;
  }
  applyPicker(picker, Number.isInteger(minutes)?minutes:null, {custom, source:'sync'});
}
let durationPickersInstalled = false;
export function installDurationPickers(){
  if(durationPickersInstalled || typeof document==='undefined') return;
  durationPickersInstalled = true;
  document.addEventListener('click', event=>{
    const button = event.target.closest?.('[data-duration-choice]');
    if(!button) return;
    const picker = button.closest('[data-duration-picker]');
    if(!picker) return;
    event.preventDefault();
    if(button.dataset.durationChoice==='custom'){
      const hours = picker.querySelector('[data-duration-hours]'), mins = picker.querySelector('[data-duration-minutes]');
      if(hours && mins && hours.value==='' && mins.value===''){
        const parts = durationParts(pickerMinutes(picker));
        hours.value = parts.hours; mins.value = parts.minutes;
      }
      applyPicker(picker, durationFromParts(hours?.value.trim(), mins?.value.trim()), {custom:true, source:'custom'});
      return;
    }
    applyPicker(picker, Number(button.dataset.durationChoice), {custom:false, source:'choice'});
  });
  document.addEventListener('input', event=>{
    const target = event.target;
    if(target instanceof HTMLFormElement){target.querySelectorAll('[data-duration-picker]:not([data-duration-term])').forEach(syncPickerFromValue); return;}
    if(!(target instanceof Element)) return;
    if(target.matches('[name=estimatedMinutes], [data-term-end]')) return;
    if(target.matches('[data-duration-hours], [data-duration-minutes]')){
      const picker = target.closest('[data-duration-picker]');
      if(picker) applyPicker(picker, durationFromParts(picker.querySelector('[data-duration-hours]')?.value.trim(), picker.querySelector('[data-duration-minutes]')?.value.trim()), {custom:true, source:'custom'});
      return;
    }
    if(target.matches('[name=plannedStart]')){
      (target.form || target.closest('form'))?.querySelectorAll('[data-duration-picker]:not([data-duration-term])').forEach(picker=>applyPicker(picker, pickerMinutes(picker), {source:'start'}));
      return;
    }
    if(target.matches('[data-duration-start-input]')){
      const picker = target.closest('[data-term-row], .assistant-term')?.querySelector('[data-duration-picker]');
      if(picker) applyPicker(picker, pickerMinutes(picker), {source:'start'});
    }
  });
}
if(typeof document!=='undefined') installDurationPickers();

