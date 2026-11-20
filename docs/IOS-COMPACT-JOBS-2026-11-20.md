# Kompaktní nativní Zakázky

Větev `ui/ios-compact-jobs-2026-11-20` navazuje na dashboardy a detail (`2dd36ed`).

## Analýza a rozhodnutí

Původní `APIJobsScreen` byl v `APIRoot.swift`: seznam s velkými ovládacími řádky a čtyřmi akcemi u zakázky, bez všech požadovaných filtrů. Používal již oprávněný `/api/jobs`, původní měsíční cache a `APIStore`. `APIJobsMap` vyžaduje správce a potvrzené/geokódované adresy. Docházka a individuální intervaly existují samostatně od globálního stavu zakázky. Tyto kontrakty, databáze, serverová oprávnění, schvalování i offline fronta zůstávají zachované.

Existující seznam API podporuje stránkování, obor, pracovníka, typ, stav, protokol, pozornost a měsíční výběr. Nemá libovolné řazení podle zákazníka/aktualizace ani souhrn člověkohodin v kartách. Proto klient načítá úplné oprávněné stránky zvoleného rozsahu, vyhledává a řadí lokálně. Během načítání či chyby výslovně označuje neúplnost. Tím se neřadí jen první stránka za všechny zakázky. Rozsahy do tří měsíců používají měsíční požadavky/cache; širší výběr používá původní stránkovaný seznam bez omezení sedmidenního serverového filtru. Velké seznamy vykresluje nativní lazy List.

Dnešní výběr doplňuje oprávněné `in_progress` a `on_way` přes původní API i z předchozích měsíců. Neskryje tak pokračující vícedenní realizaci. Zítřek ani výslovné období se tím nerozšiřují.

Člověkohodiny se načítají odloženě pouze u zobrazených řádků přes původní `/api/jobs/:id/time`, využívají šedesátisekundovou cache a původní projekci fronty. Správce vidí souhrn, pracovník vlastní práci. Neukazují se vymyšlené nuly při chybě načtení. Osobní akce před otevřením původního editoru znovu načte oprávněný snímek/verze; nepřepíná globální zakázku. Starý postup zakázek bez docházky je zachován a má původní UI test.

## Rozhraní

- Nativní vyhledávání; Dnes / Zítra / Všechny; Moje / Celý tým; kompaktní ikony kalendáře, mapy a filtrů s počtem.
- Filtry se upravují v pracovní kopii sheetu. Zahrnují původní protokoly a pozornost z dashboardu, datum/období, obor, pracovníka, typ, zákazníka a řazení. Reset a potvrzení jsou oddělené od zavření.
- Skupiny Probíhající, Na cestě, Naplánované, Čekající na schválení, Nemohu dokončit, Dokončené. Prázdné jsou skryté; dokončené jsou na konci a standardně sbalené.
- Kompaktní karty mají český termín, jeden hlavní název, stav, dostupnou adresu, odhad bez velkého bloku při chybění, iniciály a skutečné hodiny. Volání, navigace, osobní akce a menu mají minimálně 44 bodů.
- Swipe oběma směry vždy s `allowsFullSwipe:false`; všechny funkce jsou i v tlačítkách/menu. Mazání zůstává v původním potvrzovaném detailu. Přeplánování používá stávající editor s kontrolou konfliktů a termínů.
- Mapa dostává stejná filtrovaná data jako seznam, změny přebírá i při otevření a u bodu používá stejnou kompaktní kartu. Zachována jsou původní oprávnění i upřesňování adres.
- Jedna informace o synchronizaci nad seznamem. Offline čtení používá pouze původní přístupově ověřenou cache tří měsíců. Starší/nenačtené zakázky nejsou vydávány za úplný stav.

## Ověření

Připravené jednotkové testy pokrývají vícedenní zakázky, skupiny, kombinace hledání/filtrů, řazení, české termíny, serverové parametry pro pracovníka, období, původní cache a vymazání řádků při 403. UI scénáře kontrolují obě role, detail, hledání, filtry, Dnes/Zítra, sbalené dokončené, gesta, osobní akci, nativní kalendář a snímky světla/tmy. Xcode Previews používají pouze izolovaný fixture transport.

Stav nativní kompilace a testů bude doplněn po kontrolním běhu. Nová IPA se nevytváří. Není vyžadována migrace nebo nasazení serveru/webu.

## Praktická omezení

Čtyři až pět karet se vejde jen při odpovídajícím displeji a kratším obsahu; Dynamic Type a čitelnost mají přednost. Nefiltrují se nedostupné firemní záznamy jen skrytím UI: server stále uplatňuje původní workspace/discipline/assignment oprávnění. Nabídka zákazníků je odvozena z právě načtených dostupných zakázek. Mapa neuděluje pracovníkovi nové správcovské oprávnění. Neomezené historické výběry vyžadují síť a mohou mít více stránek; průběh se zobrazuje a změna výběru načítání ruší. Fyzický iPhone a ruční VoiceOver průchod zatím nebyly testované.
