# Dokončení kontroly a oprav deníku

## Opravené chyby

1. **Zabezpečení rozepsaného formuláře po selhání lokálního zápisu.** `flush()` nastavoval příznak `dirty=false` ještě před potvrzením zápisu do úložiště. Při jeho selhání funkce pro bezpečnostní obnovu neviděla aktuální text ani vybrané soubory, přestože zůstaly otevřené ve formuláři. Stejný problém se týkal souborů po úspěšném uložení samotných textových údajů. Samostatný příznak `recoverable` nyní uchovává formulář pro obnovu až do skutečného uložení či výslovného zahození. Obnovené rozepsané formuláře se posuzují stejně; formulář jiného účtu se nezpřístupní. Původní upozornění při chybě místního úložiště zůstává.

2. **Falešný konflikt při výběru hlavní položky materiálu.** Skutečný Worker/D1 deaktivoval obě vybrané alternativy, ale API odpovědělo 409, protože porovnávalo přesný počet `meta.changes` s počtem obchodních záznamů. Doprovodné triggery tento počet ovlivňují. Nová kontrola ověřuje stav, verzi, autora a čas konkrétních zkontrolovaných položek. Původní CAS a oprávnění vlastníka zůstávají. Historické ceny, množství a revize materiálu v protokolech se nemění.

Nové adresy modulů a Service Worker `draft-recovery-v1` zajišťují, aby se nepoužíval opravený klient se starým modulem formulářů. Firemní varianty protokolu a vzhled zůstaly zachované.

## Ověření

- 287 automatických testů prošlo, 0 selhání.
- Nový skutečný Chromium test při 360/390/430/1440 px: chyba kvóty úložiště, nejnovější text a originální vybraný File dostupný pro obnovu; zachování souboru po uložení metadat; obnova rozepsaného formuláře; vyloučení jiného účtu a skutečně uloženého formuláře. Prošel také v obou nativních sestaveních.
- Skutečný Worker/D1: párové vytvoření zákazníka a zahrady bez duplicit, souběžné opakování zápisu, přesné ID vazby, atomický výběr hlavního materiálu a rollback při záměrně vyvolané chybě doprovodného zápisu. Test si vytváří vlastní kategorii v oddělené DB, proto funguje i u čisté instalace Garden bez předvyplněného katalogu.
- Skutečný Worker/D1: závada, opravná zakázka, atomické vazby a výslovné vyřešení závady.
- Skutečný Worker/D1: nedokončená návštěva, přeplánování, zachování původního pokusu, skutečné stavy protokolu a idempotentní dokončení.
- Regrese GitHub opravy resetování: čtyři kontroly s odkazem na smazaný záznam bez nechtěné navigace či ztráty rozepsané zakázky.
- Prohlížečová regrese spojení: zaseklá fotografie neblokuje přehledy, 502/503/504, uložení a pozdější odeslání protokolu a fotografie právě jednou, skutečný offline Service Worker a návrat komunikace.
- Regrese rozhraní 390/430/1280/1440 px, více zahrad a správných adres, zrušení formuláře bez zápisu a serverové omezení pracovníka Garden.
- Kontrola importů offline cache, syntaxe, sestavení a přesného artefaktu obou instalací.

Zápisové testy používaly pouze syntetická data a oddělené databáze/úložiště. Skutečné provozní zákazníky, zahrady ani zakázky testy neměnily. Záměrně vložená chyba transakce v testu vrací 503; ověřuje právě to, že nezůstane částečný zápis.

## Nasazení

- Dr. Závlaha: **108**, commit `7bd3517453705ca912d29dd7f98abcb14ecc8f61`, deployment `appgdep_6aea4be78ae4819196dd851e773a7099`, `succeeded`.
- Dr. Garden: **29**, commit `2d72deb0b05d26a809e983f221de8a59b84cf9ec`, deployment `appgdep_6aea4bcf3d508191bc8d6f08b4e91dde`, `succeeded`.
- Žádná nová migrace, změna klíčů, licencí, přístupů ani schématu. Společná databáze a API, oddělení oborů, původní podpisové rozdíly protokolu a oprava GitHub `e0f48d5` zachovány.

## Omezení

Fyzický iPhone a Safari nebyly dostupné; mobilní kontroly používají Chromium emulaci. Oprava nemůže nahradit zápis na disk, pokud jej prohlížeč skutečně zakáže: neodeslaný formulář zůstává dostupný pro obnovu v otevřeném okně a aplikace pravdivě hlásí chybu uložení. Vypnutí procesu před úspěšným uložením proto nelze prohlásit za bezpečné.

Dostupný omezený provozní vzorek z posledních tří hodin před kontrolou neobsahoval HTTP 500/502/503/504. Obsahoval zrušené požadavky a několik 409. Samotný stav 409 není důkaz výpadku; aplikace jej používá také při souběžné změně oprávnění či přiřazení. Nejde o tvrzení, že je každý historický incident objasněný nebo aplikace zcela bez chyb. Přímé přihlášení za skutečného pracovníka ani přímé oprávnění souborů Google Disku nebylo součástí ověření.
