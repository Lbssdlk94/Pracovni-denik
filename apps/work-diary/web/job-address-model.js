import {gardenChoiceLabel} from './garden-choice.js?v=workspace-roles-v1';
const sameId=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
export const gardenAddressValue=id=>'garden:'+id;
export function jobGardenAddress(garden,contact,job=null){
 if(!garden||contact&&!sameId(garden.customerId,contact.id))return null;
 const detail=garden.addressDetails?.customerId&&sameId(garden.addressDetails.customerId,garden.customerId)?garden.addressDetails:null;
 const storedJob=job&&sameId(job.gardenId,garden.id)&&sameId(job.customerId,garden.customerId)?job:null;
 const id=storedJob?.customerAddressId||detail?.customerAddressId;
 const address=id?contact?.addresses?.find(a=>sameId(a.id,id)):null;
 return {value:gardenAddressValue(garden.id),label:gardenChoiceLabel(garden)+(garden.address?'':' · Adresa není vyplněná'),address:garden.address||'',city:address?.city||detail?.city||storedJob?.city||'',customerAddressId:address?.id||null};
}
export function jobAddressId(value,gardenAddress,contact){
 if(gardenAddress?.value===value)return gardenAddress.customerAddressId;
 return contact?.addresses?.find(a=>sameId(a.id,value))?.id||null;
}
