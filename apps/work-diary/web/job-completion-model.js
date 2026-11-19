export function completionTrend(job){
 const percent=Number.isInteger(job.completionPercent)?job.completionPercent:null,baseline=Number.isInteger(job.completionBaselinePercent)?job.completionBaselinePercent:null,target=job.completionTargetPoints??20;
 if(percent===null)return {percent,delta:null,target,tone:'neutral',label:''};
 if(percent===100)return {percent,delta:baseline===null?null:percent-baseline,target,tone:'on-track',label:'Odhad 100 %'};
 if(baseline===null)return {percent,delta:null,target,tone:'neutral',label:'První den s odhadem'};
 const delta=percent-baseline;return {percent,delta,target,tone:delta>=target?'on-track':'slow',label:delta<0?'Odhad snížen o '+(-delta)+' p. b.':(delta>=target?'Posun ':'Malý posun · ')+'+'+delta+' p. b.'};
}
