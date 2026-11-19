# Přímé otevření zakázky a odstranění zbytečného načítání

## Nálezy a opravy

1. Webový Přehled před otevřením konkrétní návštěvy volal `navigate('jobs')`. To vykreslilo seznam a spustilo jeho požadavky, teprve potom následoval detail. Stejný mezikrok byl v oznámeních, historii zahrady, předplatném, URL `?job=` a starším nativním adaptéru. Odkazy nově otevírají modal přímo nad původní stránkou; jeho zavření vrací původní kontext bez další navigace. Desktopové otevření z rozpisu si ponechává boční editor.
2. Detail ze seznamového snapshotu se zobrazuje ihned a plné údaje se ověří na pozadí. Není-li snapshot dostupný, hned se zobrazí stav načítání detailu. Zavření během čekání ani pozdní odpověď staršího otevření nesmí znovu otevřít jinou zakázku. Odepření přístupu dál kontroluje API, cache a současný kontext.
3. `render()` dříve mazal JobsUI při každém vykreslení jiné stránky. Přímý detail nad Přehledem se nově zachová pouze pod stejným účtem a oprávněními. Změna kontextu jej nezachovává. Aktualizace zakázky nepotřebuje načítat skrytý seznam zakázek.
4. Dnešní návštěvy a Servisní protokoly připraví filtr před přechodem na seznam. Dříve se nejdříve spouštěl seznam s původním filtrem a potom druhé načítání s cílovým filtrem.
5. Sbalená Pracovní doba nepotřebuje hned stahovat intervaly, schvalování a sazby. Načte je při otevření. Souběžné čtení stejné otevřené sekce se sdílí; rychlé opětovné rozbalení do pěti sekund využije právě načtené údaje. Ruční obnovení a původní třicetisekundové obnovování otevřené sekce zůstávají. Paměť je vázaná na účet, roli, obor a oprávnění.
6. SwiftUI Další návštěva už používala přímý `NavigationLink`; nepotřebuje přesměrování. U ručního obnovení čtyř obrazovek ale `resume()` změnil globální revizi, která spustila `.task`, a současně kód volal explicitní `load()`. Nový parametr `refreshViews:false` pro tyto případy odstraní vedlejší spuštění. Běžný návrat do popředí, synchronizace změn a výchozí `resume()` své obnovování zachovávají.

## Změřený příklad

Izolovaný skutečný sestavený Worker, Miniflare D1/R2 a Chromium, syntetická zakázka:

- Před změnou: během kliknutí na Další návštěvu vznikla stránka `#jobs`, zmizel Přehled a odešly čtyři požadavky: detail, seznam kolegů, seznam zakázek a pracovní doba.
- Po změně: stránka `#jobs` vůbec nevznikne, Přehled zůstává pod detailem a odejde jediný požadavek na detail.
- Nejde o měření produkční latence nebo procentního zrychlení. Síť je v testu uměle zpomalená a fotografie ani reálná data nebyly měněny.

## Ověření a omezení

Prohlížečový scénář ověřuje zachování původní stránky, přímý URL odkaz, mobil 360/390 a desktop 1280 px, žádný boční editor pro odkaz z Přehledu, první načtení pracovní doby až po rozbalení a rychlé opětovné otevření bez dalšího požadavku. U Dnešních návštěv a Protokolů ověřuje jediný seznamový požadavek se správným filtrem. Testy používají pouze izolovaná data.

Databáze, serverové autorizace, licence, měsíční cache, ukládání fotografií a obsah zakázek se nemění. Současná revize zakázky a konflikty zůstávají povinné pro změny. Nezavádí se nekonečná cache ani obcházení ověření přístupu.

Další případné dělení globální SwiftUI revize podle jednotlivých zdrojů je větší samostatná změna. Pravidelné obnovování pracovních dat a kontroly API nebyly bez rozlišení vypnuty. Zrychlení webu se nasazuje přes stávající Sites; nativní změny se připravují na GitHubu. V tomto úkolu se nevytváří další IPA.


## Doplňkové kontroly

Regresní prohlížečový test odhalil při offline přestávce nahrazení otevřeného detailu čekáním na síť a jeho následné zavření. Opravený přechod zachovává otevřený detail a pro nové offline otevření používá pouze dostupný seznamový snapshot v dosavadním autorizovaném kontextu. Nevytváří domnělé plné údaje, stavové změny vyžadují připojení a pracovní intervaly stále ověřuje původní offline klient. Osobní přestávka, restart PWA, následná synchronizace a samostatné ukončení byly znovu ověřeny na izolovaných datech.

Přímý návrat z dokončovacího protokolu již nevyžaduje přítomnost seznamu `#jobs` pod detailem. Test přímého odkazu také ověřuje změnu stavu bez přesunu do seznamu, zavření během načítání bez následného znovuotevření a rychlé opětovné otevření pracovní doby. Kopie pracovní doby se při nové verzi zakázky nepovažuje automaticky za právě obnovenou.

Kontrolní workflow iOS s `checks_only=true` nebyl spuštěn: automatická kontrola oprávnění jej odmítla s odkazem na předchozí pokyn nespouštět GitHub Actions. Commit a push zdrojových změn jsou povolené a provedené; nová IPA nevzniká. Přidaný XCTest a změny SwiftUI proto zatím nemají ověření v Xcode; čeká se na výslovné potvrzení tohoto kontrolního běhu. V aktuálním prostředí není Swift/Xcode ani Swift syntaktický parser.


## Výsledky a zveřejnění

- Závěrečná plná webová regrese: **87 testovacích souborů, bez selhání**.
- Prošly syntax kontroly, přesné Service Worker importy a oba sestavené instalační artefakty s izolovaným přihlášeným startem a odmítnutím anonymního přístupu.
- Prošel přímý navigační scénář také nad přesným sestaveným Workerem kanonického webu. První pokus o jeho ověření narazil na zákaz relativní cesty mimo kořen Miniflare; opakování používá identickou kopii artefaktu uvnitř testovacího kořene a prošlo.
- Prošly plné prohlížečové scénáře člověkohodin (hromadná práce, samostatné ukončení, offline přestávka, restart, synchronizace, zachovaný globální stav) a procent dokončení (konflikt, poznámka, hranice, koncept, seznam).
- Striktní porovnání obou Workerů mimo vložené `ASSETS` potvrdilo shodný backend. Oba publikované archivy obsahují jen Worker a hostingové manifesty; žádné databázové migrace.
- Dr. Závlaha: **Sites v147**, zdroj `44c9a7127fac5deb059799a731572445fea548b5`, nasazení `appgdep_6aff35937b708191bb1aeaf4a69d5398`, stav `succeeded`.
- Dr. Garden: **Sites v67**, zdroj `fab4676b3231f32e9139cefc080d4d08818af780`, nasazení `appgdep_6aff35c23bc481919d998f7348f9f754`, stav `succeeded`.
- Publikum, tajné údaje a databázové vazby zůstaly zachované. Produkční zakázky ani kontakty nebyly kvůli testům měněny.

Zdroje včetně nativní přípravy: GitHub větev `perf/direct-job-navigation-2026-11-19`. Návrat webu je možný nasazením předchozí verze Dr. Závlaha 146 / Dr. Garden 66 bez změny databáze. Nativní aplikace potřebuje pro aktivaci změny další samostatné vydání; v tomto úkolu nová IPA nevznikla.
