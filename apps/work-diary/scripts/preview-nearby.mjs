// Address lookup fixtures for loopback browser QA; never part of the hosted Worker.
import './preview-team.mjs';
const nativeFetch=globalThis.fetch;
const result=(latitude,longitude,label)=>({geometry:{type:'Point',coordinates:[longitude,latitude]},properties:{type:'house',street:label,housenumber:'12',city:'Test City',country:'Test'}});
globalThis.fetch=async(input,options)=>{
 const url=new URL(typeof input==='string'?input:input.url||String(input));if(url.hostname!=='photon.komoot.io')return nativeFetch(input,options);
 if(url.pathname==='/reverse')return Response.json({features:[{...result(50.087,14.421,'Jabloňová'),properties:{street:'Jabloňová',housenumber:'7',city:'Praha',postcode:'17000',country:'Česko',type:'house'}}]});
 const q=url.searchParams.get('q');let features=[];
 if(q.startsWith('Near'))features=[result(50.001,14,'Near')];
 if(q.startsWith('Far'))features=[result(51,14,'Far')];
 if(q.startsWith('Mixed'))features=[result(50.0005,14,'Mixed near'),result(49,16,'Mixed distant')];
 if(q.startsWith('Changed'))features=[result(52,14,'Changed')];
 return new Response(JSON.stringify({features}),{headers:{'content-type':'application/json'}});
};
