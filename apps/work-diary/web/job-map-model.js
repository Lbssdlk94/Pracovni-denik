import {normalizeAddress,automaticCandidate,validCoordinates} from './nearby.js?v=workspace-roles-v1';
// Use only the job's saved address, never a customer's unrelated second address.
export function jobMapAddress(job){const address=String(job.address||'').trim(),city=String(job.city||'').trim();return address?[address,city&&!normalizeAddress(address).split(',').map(p=>p.trim()).includes(normalizeAddress(city))?city:''].filter(Boolean).join(', '):'';}
export function jobMapCandidates(job){const geo=job.geocode;if(!geo||geo.address!==normalizeAddress(jobMapAddress(job))||!Array.isArray(geo.candidates))return [];return geo.candidates.filter(c=>c&&validCoordinates(c.position));}
export function jobMapLocation(job){const candidates=jobMapCandidates(job),chosen=candidates.find(c=>c.id===job.geocode.selectedId);if(chosen)return chosen;const auto=automaticCandidate(candidates);return auto?.precision==='address'?auto:null;}
// Unconfirmed matches remain visible, but cannot silently become the location used for distances.
export function jobMapPoints(job){const location=jobMapLocation(job);return location?[{candidate:location,confirmed:true}]:jobMapCandidates(job).map(candidate=>({candidate,confirmed:false}));}
export function groupedJobMapPoints(jobs){const groups=new Map();jobs.forEach((job,index)=>{for(const point of jobMapPoints(job)){const p=point.candidate.position,key=p.latitude.toFixed(6)+','+p.longitude.toFixed(6);if(!groups.has(key))groups.set(key,{position:p,entries:[]});groups.get(key).entries.push({job,index,...point});}});return [...groups.values()];}
