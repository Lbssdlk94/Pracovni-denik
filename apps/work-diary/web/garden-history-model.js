// Overlay the existing outboxes by stable source IDs; no separate visit records.
export function pendingGardenHistory(data,gardenId,work=[],services=[],author=''){
 const visits=new Map((data.visits||[]).map(v=>[v.id,{...v}]));
 for(const entry of work){const job=entry.snapshot?.job,report=entry.payload?.report;if(!entry.pending||!job||job.gardenId!==gardenId||!report)continue;const id='job:'+job.id,old=visits.get(id)||{};
 visits.set(id,{...old,id,jobId:job.id,title:job.title,date:report.date||old.date||job.dueDate,jobType:job.jobType,status:job.status,technician:job.assignedNames?.join(', ')||old.technician||author,work:report.work||'',material:[report.material,...(report.materialItems||[]).map(v=>[v.name,v.sku,v.quantity,v.unit].filter(v=>v!==undefined&&v!==null&&v!=='').join(' '))].filter(Boolean).join('\n'),defects:report.defects||'',notes:report.notes||'',recommendations:report.recommendations||'',hasReport:true,photos:old.photos||[],at:entry.updatedAt,pending:true,syncError:entry.error||''});}
 for(const entry of services){if(!entry._pending||entry.gardenId!==gardenId)continue;const id='service:'+entry.id;visits.set(id,{...(visits.get(id)||{}),id,date:entry.date,title:'Servisní zápis',jobType:'service',status:'done',technician:entry.authorName||author,work:entry.work||'',material:entry.parts||'',notes:entry.notes||'',defects:'',photos:[],at:entry.createdAt,pending:true,syncError:entry._error||''});}
 return {...data,visits:[...visits.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.at||0)-(a.at||0))};
}
