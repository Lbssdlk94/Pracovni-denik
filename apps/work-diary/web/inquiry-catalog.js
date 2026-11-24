export const INQUIRY_STATUSES=[
 {id:'new',label:'Nová',open:true},
 {id:'contacted',label:'Zákazník kontaktován',open:true},
 {id:'visit_set',label:'Domluvena prohlídka',open:true},
 {id:'quote_prep',label:'Připravuje se nabídka',open:true},
 {id:'quote_sent',label:'Nabídka odeslána',open:true},
 {id:'awaiting',label:'Čeká na rozhodnutí zákazníka',open:true},
 {id:'accepted',label:'Přijata',open:true},
 {id:'converted',label:'Převedena na zakázku',open:false},
 {id:'rejected',label:'Zamítnuta',open:false},
 {id:'archived',label:'Archivována',open:false}
];
export const INQUIRY_SERVICES=[
 {id:'new_install',label:'Nová realizace',category:'irrigation',jobType:'installation'},
 {id:'service',label:'Servis stávající závlahy',category:'irrigation',jobType:'service'},
 {id:'winterize',label:'Zazimování',category:'irrigation',jobType:'service'},
 {id:'spring_start',label:'Jarní spuštění',category:'irrigation',jobType:'service'},
 {id:'extension',label:'Rozšíření systému',category:'irrigation',jobType:'installation'},
 {id:'garden_build',label:'Realizace zahrady',category:'garden',jobType:'installation'},
 {id:'maintenance',label:'Údržba zahrady',category:'garden',jobType:'service'},
 {id:'planting',label:'Výsadba',category:'garden',jobType:'installation'},
 {id:'lawn',label:'Realizace trávníku',category:'garden',jobType:'installation'},
 {id:'other',label:'Ostatní zahradnické práce',category:'garden',jobType:'survey'}
];
export const INQUIRY_CATEGORIES=[
 {id:'irrigation',label:'Závlaha'},
 {id:'garden',label:'Garden'},
 {id:'both',label:'Obojí'}
];
export const INQUIRY_CONSENT='Souhlasím se zpracováním jména, kontaktu, adresy a fotografií za účelem vyřízení této poptávky. Údaje uvidí jen oprávnění pracovníci firmy, které formulář patří. Neslouží k hromadné nabídce a veřejně se nezobrazují.';
export const inquiryStatusLabel=id=>INQUIRY_STATUSES.find(item=>item.id===id)?.label||'Neznámý stav';
export const inquiryCategoryLabel=id=>INQUIRY_CATEGORIES.find(item=>item.id===id)?.label||'';
export const inquiryService=id=>INQUIRY_SERVICES.find(item=>item.id===id)||null;
export const inquiryServiceLabel=id=>inquiryService(id)?.label||'';
export const inquiryClosed=id=>INQUIRY_STATUSES.some(item=>item.id===id&&!item.open);
export function inquiryAllowsService(category, serviceType){
 const service=inquiryService(serviceType);
 if(!service||!['irrigation','garden','both'].includes(category)) return false;
 return category==='both'||service.category===category;
}
