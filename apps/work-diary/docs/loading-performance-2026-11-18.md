# Rychlejší načítání zakázek – 18. 11. 2026

## Zjištěné prodlevy

Detail před vykreslením čekal na celý GET zakázky, přestože seznam již obsahoval údaje pro jeho první zobrazení. Každé opakované otevření stahovalo totéž znovu. Seznam navíc čekal i na seznam pracovníků a opakované vykreslení znovu spouštělo přípravu offline protokolů.

Nejde o důkaz pomalé produkční databáze; její schéma ani dotazy se v této úpravě nemění.

## Změny

- Mobilní/modální detail se vykreslí ze stávajícího autorizovaného seznamu. Úplná data, kontakt a závady se doplní na pozadí. Pozdější odpověď nepřepíše rozepsaný deník, fotky ani uživatelem vybranou záložku. Změněná verze nabídne výslovné obnovení.
- Nová malá paměťová cache uchovává úplný detail nejvýše 30 sekund, seznam kolegů 60 sekund a sdílí souběžné shodné požadavky. Maximálně 24 položek, jednotlivá odpověď do 512 000 znaků. Každý volající dostane vlastní kopii.
- Cache je pouze v paměti jedné otevřené stránky, oddělená podle účtu, role, náhledu role, oboru a autorizační revize. Nepřidává trvalou kopii ani neprodlužuje offline oprávnění. Přihlášení `/api/me`, zákazníci, zahrady, funkce, protokoly, přílohy i oznámení tuto cache nepoužívají.
- Zápisy souvisejících údajů cache vyřadí. Vynucené obnovení a načtení před změnou zakázky jdou na server. Existující kontrola verze/CAS i serverová oprávnění zůstávají. Odmítnutý čerstvý detail odstraní uloženou kopii.
- Den, seznam, kalendář a mapa nečekají na seznam kolegů. Plánovací pohledy jej nadále vyžadují pro správné řádky pracovníků. Nedostupnost kolegů nezablokuje seznam zakázek.
- Opakovaný prefetch offline protokolu se přeskočí pouze při stejné verzi zakázky a lokální kopii mladší než 60 sekund. Souběžná stažení jsou sdílená. V náhledu role se tento prefetch nespouští. Výslovné otevření protokolu dál ověřuje aktuální stav.
- Verze modulů a Service Worker jsou sjednocené na `fast-read-v1`. API se neukládá do statické cache Service Workeru.

Hlavní soubory: `web/jobs-ui.js`, `web/cloud.js`, nový `web/scoped-read-cache.js`, `web/app.js`, `web/index.html`, `web/sw.js`. Regresní testy mají aktualizovanou URL modulu; přidané jsou dva prohlížečové testy a jednotkové testy cache.

## Srovnávací měření

Izolovaný skutečný sestavený Worker s Miniflare D1/R2, syntetická propojená firma, Chromium 390 × 844. U GET detailu a pracovníků je vložené stejné zpoždění 800 ms. Výchozí verze: GitHub `319871357fd8ce3b226c9024a2294c8c1a984f25`. Finální měření po změně používá přesný sestavený artefakt Dr. Závlahy. Nejde o měření přihlášené produkce ani fyzického iPhonu.

| Kontrola | Před | Po |
| --- | ---: | ---: |
| Nefiltrovaný seznam, čekání na viditelnou zakázku | 1347 ms | 258 ms |
| Medián pěti otevření detailu | 1319 ms | 66 ms |
| Síťové GET detailu během pěti otevření | 5 | 1 |
| GET kolegů při stejném přepínání pohledů | 5 | 1 |
| První denní seznam z existující tříměsíční kopie | 120 ms | 194 ms |

První denní seznam byl rychlý již před úpravou; rozdíl 120/194 ms zde není prokázané zrychlení. Optimalizace řeší další čekání na detail a kolegy. Jednotlivá finální otevření detailu: 77, 126, 66, 53, 63 ms.

Reprodukce: `node scripts/test-speed-browser.mjs [cesta-k-workeru]`. Pro baseline `SPEED_BASELINE=1`; baseline musí obsahovat původní zabalené webové soubory, nestačí testovat nový kód s přepnutým parametrem.

## Ověření

- Celá sada: 82 testovacích souborů prošlo, 0 selhání. Finální cílené testy cache a přesných verzí offline importů prošly; kontrola syntaxe také.
- Obě produkční sestavení: validní Worker, autentizovaný startup, instalace a zakázky na izolované SQLite/R2; anonymní API odmítnuto.
- Nový prohlížečový bezpečnostní test: opožděná odpověď zachová rozepsaný deník a záložku; změna od kolegy a následné skutečné uložení stavu používají aktuální verzi; změna kontaktu odstraní související starý detail; náhled role nevrací původní cache; odmítnuté načtení ji vyčistí.
- Prohlížečové regrese: odjezd, stav, editace, protokol a SMS zůstávají v otevřeném dialogu včetně skutečných uložení; menu, cíle a rozvržení 360/390/430/1440 px. Mazání deníku má potvrzení, audit a zachovaný originál fotografie.
- Deník realizace: požadovaná fotka, text po změně záložky, offline uložení/fotka po restartu, vložená chyba 502 a následná synchronizace právě jednou, konflikt s výslovným řešením. Mobilní rozměry 360/390/430 a desktop 1440 px, emulace klávesnice bez přetečení.
- Pro obě firemní sestavení je backend mimo vložená statická aktiva bajtově shodný s nasazenou předchozí verzí. Žádná změna schématu ani migrace. Aktualizace obsahuje jen frontendový release, ne kořenový balíček migrací; zmrazená databáze Dr. Garden se neupravuje.

Všechny zápisové testy používají izolovaná data. Skutečné zákazníky a zakázky testy nemění. Fyzický iPhone/Safari a nativní SwiftUI aplikace nebyly v tomto úkolu testované ani upravované. Výsledná odezva závisí na zařízení a síti; načítání protokolu, fotek a prvotní autorizace stále vyžaduje příslušná data ze serveru.
