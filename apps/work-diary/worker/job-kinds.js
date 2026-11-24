import {mergeJobKinds} from '../web/job-selection.js';

export async function readJobKinds(env){
  let extra = [];
  try{
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='job-kinds'").first();
    if(row?.value){
      const parsed = JSON.parse(row.value);
      if(Array.isArray(parsed)) extra = parsed;
    }
  }catch{extra = [];}
  return mergeJobKinds(extra);
}
