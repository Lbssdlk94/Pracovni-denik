const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function inquiryAge(at,now=Date.now()){
 const time=Number(at);if(!Number.isFinite(time)||time<=0)return '';
 const minutes=Math.max(0,Math.floor((now-time)/60000));
 if(minutes<1)return 'Právě teď';
 if(minutes<60)return new Intl.RelativeTimeFormat('cs',{numeric:'always'}).format(-minutes,'minute');
 const hours=Math.floor(minutes/60);
 if(hours<24)return new Intl.RelativeTimeFormat('cs',{numeric:'always'}).format(-hours,'hour');
 return new Intl.RelativeTimeFormat('cs',{numeric:'always'}).format(-Math.floor(hours/24),'day');
}
export function inquiryAlertMarkup(summary,{now=Date.now()}={}){
 const count=Math.max(0,Math.floor(Number(summary?.newCount)||0));if(!count)return '';
 const row=summary.latestNew,one=count===1&&!!row?.id;
 const title=count===1?'Nová poptávka':count<5?'Nové poptávky':'Nových poptávek';
 const name=row?[row.firstName,row.lastName].filter(Boolean).join(' '):'';
 const person=[name,row?.city].filter(Boolean).join(' · ');
 const work=[row?.categoryLabel,row?.serviceLabel].filter(Boolean).join(' · ');
 const age=inquiryAge(row?.createdAt,now);
 return `<div class="inquiry-alert-heading"><span class="inquiry-alert-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16l2 9v7H2v-7L4 4Z"/><path d="M2 13h6l2 3h4l2-3h6"/></svg></span><h2>${title}</h2><span class="inquiry-alert-count" aria-label="${escape(count)} nových poptávek">${count>99?'99+':count}</span></div>${person?`<p class="inquiry-alert-person">${escape(person)}</p>`:''}${work?`<p class="inquiry-alert-work">${escape(work)}</p>`:''}${count>1?'<p class="inquiry-alert-more">Nejnovější z '+escape(count)+' nových poptávek</p>':''}<div class="inquiry-alert-footer">${age?`<time datetime="${escape(new Date(Number(row.createdAt)).toISOString())}">${escape(age)}</time>`:'<span>Čeká na zpracování</span>'}<button type="button" class="btn primary" ${one?'data-overview-inquiry="'+escape(row.id)+'"':'data-overview-inquiry-list'}>${one?'Zobrazit poptávku':'Zobrazit poptávky'}</button></div>`;
}
