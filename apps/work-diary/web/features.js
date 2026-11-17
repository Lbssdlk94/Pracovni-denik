export const FEATURE_GROUPS=[
 {key:'work',label:'Zakázky a plánování'},
 {key:'people',label:'Zákazníci a tým'},
 {key:'documentation',label:'Dokumentace a závady'},
 {key:'finance',label:'Materiál a účtování'},
 {key:'irrigation',label:'Závlahy – odborné funkce'},
 {key:'maps',label:'Poloha a mapy'},
 {key:'fleet',label:'Vozidla a řidiči'},
 {key:'system',label:'Upozornění, offline a zálohy'}
];
const irrigationKeys=['shafts','zoneManagement','pictureExport','search','demo','blowout','pump','plans','map'];
export const PROFESSION_SECTIONS=[
 {key:'all',label:'Všechny funkce',description:'Úplný přehled jednotlivých přepínačů.'},
 {key:'irrigation',label:'Závlahy',description:'Společné nástroje i odborná dokumentace závlah.'},
 {key:'gardener',label:'Zahradnictví',description:'Zahrady, návštěvy, údržba, závady, materiál a pracovní tým.'},
 {key:'electrician',label:'Elektro',description:'Společné zakázky, objekty, protokoly, závady a materiál. Odborné elektrorevize nejsou součástí této šablony.'},
 {key:'plumber',label:'Instalatérství',description:'Společné zakázky, objekty, servis, závady a materiál.'},
 {key:'carpenter',label:'Truhlářství',description:'Společné zakázky, zaměření, realizace a dokumentace.'},
 {key:'universal',label:'Univerzální deník',description:'Společné nástroje bez odborných funkcí závlah.'}
];
export const professionFeatureKeys=key=>FEATURE_OPTIONS.filter(f=>key==='all'||key==='irrigation'||!irrigationKeys.includes(f.key)).map(f=>f.key);
const groups={work:['jobs','jobDay','jobList','jobCalendar','jobTimeline','jobWeek','jobTable','jobWorkload','jobBacklog','jobHandoffs','jobTravel'],people:['customers','gardens','teamManagement','attendance'],documentation:['googleDrive','photoUploads','gardenHistory','defects','service','drivePhotos','protocolPhotos'],finance:['materials','workCharges','subscriptions'],irrigation:irrigationKeys,maps:['location','nearby','jobMap'],fleet:['vehicles','fleetOdometer','fleetExpenses','fleetFuel','fleetConsumption','fleetService','fleetStk','fleetVignette','fleetReceipts','fleetPhotos','fleetDriverSelection','fleetAlerts'],system:['notifications','emailNotifications','offline','backups']};
export const featureGroup=key=>FEATURE_GROUPS.find(g=>groups[g.key].includes(key))?.key||'system';
export const FEATURE_OPTIONS=[
 {key:'vehicles',label:'Vozidla',description:'Firemní auta, označení kolegů jako řidičů a společná evidence.'},
 {key:'fleetOdometer',label:'Samostatný zápis kilometrů',description:'Aktualizace tachometru mimo tankování a servis.',requires:['vehicles'],licenseParent:'vehicles'},
 {key:'fleetExpenses',label:'Ostatní náklady auta',description:'Samostatné provozní výdaje mimo tankování a servis.',requires:['vehicles'],licenseParent:'vehicles'},
 {key:'fleetFuel',label:'Tankování',description:'Částka, litry, stav kilometrů a automaticky evidovaný autor.',requires:['vehicles'],licenseParent:'vehicles'},
 {key:'fleetConsumption',label:'Výpočet spotřeby',description:'Spotřeba mezi plnými nádržemi pro každé auto samostatně.',requires:['vehicles','fleetFuel'],licenseParent:'vehicles'},
 {key:'fleetService',label:'Servis a náklady auta',description:'Záznamy údržby a nákladů vozidla.',requires:['vehicles'],licenseParent:'vehicles'},
 {key:'fleetStk',label:'Hlídání STK',description:'Platnost STK a nastavitelný předstih.',requires:['vehicles'],licenseParent:'vehicles'},
 {key:'fleetVignette',label:'Dálniční známky',description:'Platnost známky a nastavitelný předstih.',requires:['vehicles'],licenseParent:'vehicles'},
 {key:'fleetReceipts',label:'Fotografie účtenek',description:'Až tři snímky k záznamu. Vypnutí zachová uložené účtenky.',requires:['vehicles'],licenseParent:'vehicles'},
 {key:'fleetPhotos',label:'Fotografie aut',description:'Přidání a změna fotografie auta. Uložené fotografie zůstanou dostupné i po vypnutí nových nahrávání.',requires:['vehicles'],licenseParent:'vehicles'},
 {key:'fleetDriverSelection',label:'Vlastní výběr auta řidičem',description:'Označený řidič si může sám vybrat aktivní firemní auto.',requires:['vehicles'],licenseParent:'vehicles'},
 {key:'fleetAlerts',label:'Upozornění na termíny auta',description:'Centrum oznámení a dostupné push; serverový běh závisí na nastavené automatice firmy.',requires:['vehicles','notifications'],licenseParent:'vehicles'},
 {key:'googleDrive',label:'Google Disk – celé propojení',description:'Připojení, nastavení a komunikace s Google Diskem. Vypnutí nesmaže soubory ani přihlašovací údaje.',controlOnly:true},
 {key:'photoUploads',label:'Přidávání nových fotografií',description:'Nové snímky zahrad, šachet, zakázek a protokolů. Uložené fotografie zůstanou dostupné.',controlOnly:true},
 {key:'emailNotifications',label:'E-mailová upozornění kolegům',description:'Odesílání e-mailových připomínek realizací přes Resend. Centrum oznámení a push se nastavují samostatně. Nemění odesílání schválených výkazů.',requires:['notifications','jobs'],licenseParent:'notifications'},
 {key:'jobDay',label:'Můj den / Denní přehled',description:'Denní plán návštěv a rychlé přepínače Dnes a Zítra.',requires:['jobs'],licenseParent:'jobs'},
 {key:'jobList',label:'Seznam zakázek',description:'Průběžný seznam zakázek napříč termíny.',requires:['jobs'],licenseParent:'jobs'},
 {key:'jobCalendar',label:'Kalendář zakázek',description:'Měsíční kalendář návštěv, nezávislý na denním a běžném seznamu.',requires:['jobs'],licenseParent:'jobs'},
 {key:'jobTimeline',label:'Časová osa kolegů',description:'Počítačový rozpis s přesouváním návštěv a bočními úpravami.',requires:['jobs'],licenseParent:'jobs'},
 {key:'jobWeek',label:'Týdenní rozpis',description:'Přehled návštěv podle dnů týdne.',requires:['jobs'],licenseParent:'jobs'},
 {key:'jobTable',label:'Tabulka zakázek',description:'Počítačová tabulka a její hromadné úpravy.',requires:['jobs'],licenseParent:'jobs'},
 {key:'jobWorkload',label:'Vytížení kolegů',description:'Přehled plánované práce a vytížení týmu.',requires:['jobs'],licenseParent:'jobs'},
 {key:'jobBacklog',label:'Fronta plánování',description:'Nenaplánované návštěvy a údaje k upřesnění vedle časové osy.',requires:['jobs','jobTimeline'],licenseParent:'jobs'},
 {key:'jobHandoffs',label:'Převzetí zakázek',description:'Potvrzení převzetí jednotlivými kolegy a žádosti o upřesnění.',requires:['jobs'],licenseParent:'jobs'},
 {key:'jobTravel',label:'Jsem na cestě a připravená SMS',description:'Přesný čas příjezdu a návrh SMS zákazníkovi.',requires:['jobs'],licenseParent:'jobs'},
 {key:'protocolPhotos',label:'Fotografie servisního protokolu',description:'Přidávání fotografií přímo do protokolu. Uložené fotografie zůstanou v historii.',requires:['jobs'],licenseParent:'jobs'},
 {key:'workCharges',label:'Účtování práce a cesty',description:'Sazby, započaté hodiny a bloky 30 km. Prototyp pouze vlastníka.',requires:['jobs'],licenseParent:'jobs',ownerOnly:true},
 {key:'shafts',label:'Šachty a popisky ventilů',description:'Seznam šachet, jejich fotografie a počty u zahrad. Vypnutí skryje šachty i v nově založených zahradách.'},
 {key:'gardenHistory',label:'Historie zahrady',description:'Společný přehled návštěv a servisních zásahů.',requires:['gardens']},
 {key:'defects',label:'Evidence závad',description:'Sledované závady, jejich řešení a upozornění u zahrad a zakázek.',requires:['gardens']},
 {key:'materials',label:'Katalog materiálu',description:'Sdílený katalog a výběr materiálu do protokolu. Úpravy katalogu a cen provádí správce.'},
 {key:'subscriptions',label:'Servisní předplatné',description:'Tarify, sjednaná období, servisní plány a platby.',requires:['jobs','customers']},
 {key:'customers',label:'Seznam zákazníků',description:'Jména, více telefonů a adres. Kolega vidí jen zákazníky svých přiřazených zakázek.'},
 {key:'notifications',label:'Upozornění',description:'Soukromé centrum upozornění a volitelná push oznámení na telefonech kolegů.'},
 {key:'drivePhotos',label:'Fotodokumentace zakázek',description:'Fotografie ve třech fázích realizace. Bez připojeného Google Disku se ukládají do aplikace.',requires:['jobs']},
 {key:'jobMap',label:'Mapa zakázek',description:'Pouze správce a vlastník: rozmístění zakázek podle adres a vzdálenosti vzdušnou čarou.',requires:['jobs','location']},
 {key:'jobs',label:'Zakázky',description:'Zakázky, servisní protokoly a PDF. Kolega vidí vlastní zakázky a mění jejich stav.'},
 {key:'attendance',label:'Docházkový deník',description:'Příchody, odchody, měsíční výkazy a schvalování oprav. GPS docházky vidí pouze správce.'},
 {key:'gardens',label:'Složky zahrad',description:'Zahrady, jejich zákazníci, údaje a zapnuté části dokumentace.'},
 {key:'plans',label:'Plány závlahy',description:'Plány a snímky z dronu, včetně značek šachet v obrázku.',requires:['gardens']},
 {key:'service',label:'Servis závlahy',description:'Historie údržby, zásahů a výměn.',requires:['gardens']},
 {key:'blowout',label:'Vyfukování závlahy',description:'Fotografie a vlastní pokyny k zazimování každé zahrady.',requires:['gardens']},
 {key:'pump',label:'Typ čerpadla',description:'Druh, výrobce a model čerpadla u zahrady.',requires:['gardens']},
 {key:'offline',label:'Ukládání bez internetu',description:'Nové šachty a servis uložíte offline. Již čekající změny se odešlou i po vypnutí.'},
 {key:'location',label:'GPS a poloha',description:'Poloha šachet, ruční souřadnice, navigace a adresa zahrady podle aktuální polohy.'},
 {key:'nearby',label:'Řazení zahrad podle vzdálenosti',description:'Nejbližší zahrady podle jejich adresy a vaší aktuální polohy.',requires:['gardens','location']},
 {key:'map',label:'Mapa šachet',description:'Přehled poloh šachet v zahradě a ruční umístění špendlíku v mapě.',requires:['gardens','location','shafts']},
 {key:'teamManagement',label:'Správa kolegů',description:'Nabídka týmu, pozvánky a oprávnění. Uložené záznamy se dál sdílejí s členy týmu.'},
 {key:'zoneManagement',label:'Správa seznamu zón',description:'Přidávání a úpravy seznamu zón. Vlastní popisky ventilů ve fotografii fungují i při vypnutí.',requires:['shafts']},
 {key:'pictureExport',label:'Sdílení a stažení obrázku',description:'Export fotografie s popisky.',requires:['shafts']},
 {key:'backups',label:'Zálohy a obnova',description:'Stažení úplné zálohy a obnova ze souboru.'},
 {key:'search',label:'Vyhledávání šachet',description:'Hledání podle názvu, místa nebo zahrady.',requires:['shafts']},
 {key:'demo',label:'Ukázková šachta',description:'Vyzkoušení popisků na ilustrační fotografii.',requires:['shafts']}
];
export const DEFAULT_FEATURES=Object.fromEntries(FEATURE_OPTIONS.map(f=>[f.key,true]));
export const normalizeFeatures=value=>Object.fromEntries(FEATURE_OPTIONS.map(f=>[f.key,value?.[f.key]!==false]));
export const featureEnabled=(key,value)=>value?.[key]!==false&&(FEATURE_OPTIONS.find(f=>f.key===key)?.requires||[]).every(parent=>featureEnabled(parent,value));

export const gardenSectionIds=features=>[['shafts','shafts'],['history','gardenHistory'],['defects','defects'],['blowout','blowout'],['service','service'],['plan','plans'],['map','map']].filter(([,key])=>featureEnabled(key,features)).map(([id])=>id);

export const featureLicenseKey=key=>FEATURE_OPTIONS.find(f=>f.key===key)?.licenseParent||key;
export const licensedFeature=(key,modules,overrides={})=>(FEATURE_OPTIONS.find(f=>f.key===key)?.controlOnly||modules?.[featureLicenseKey(key)]===true)&&overrides?.[key]!==false&&(FEATURE_OPTIONS.find(f=>f.key===key)?.requires||[]).every(dep=>licensedFeature(dep,modules,overrides));
