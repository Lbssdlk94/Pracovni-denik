import {shortJobAddress} from './job-mobile-model.js?v=workspace-roles-v1';
// Display formatting only. Identity/linking never depends on these labels.
export function gardenChoiceLabel(garden){const city=garden.addressDetails?.city||garden.city||'',address=shortJobAddress(garden.address),parts=address.split(',').map(v=>v.trim()).filter(v=>v&&v.toLocaleLowerCase('cs')!==city.toLocaleLowerCase('cs'));return [garden.name,city,parts.join(', ')].filter(Boolean).join(' · ');}
