# Místní přehled zakázek za aktuální a předchozí měsíc

## Použití

Web/PWA Dr. Závlaha a Dr. Garden ukládá textové podklady přehledu zakázek do existujícího IndexedDB. Při načtení návštěv aktuálního nebo předchozího měsíce připraví na pozadí úplné přehledy obou měsíců, včetně stránkování. Další návrat nebo výběr dne může zobrazit místní kopii okamžitě. Označení „Uložená kopie“ uvádí čas aktualizace. Fotografie, přílohy a plné servisní protokoly se touto funkcí nestahují; používají dosavadní systémy.

Výběr mladší než 60 sekund se znovu nestahuje. Starší se zobrazí a na pozadí obnoví; ruční tlačítko Obnovit a dosavadní pravidelná týmová synchronizace vynutí načtení ze serveru. Nejde o novou periodickou kontrolu účtu ani o realtime odběr změn. Zrušení/znovuotevření stránky místní přehled nemaže, pokud další ověření účtu a záznamů potvrdí stejný přístup a verze.

Při potvrzené změně stavu, termínu nebo smazání se měsíc lokálně upraví a označí k obnově. Opožděné čtení nesmí přepsat potvrzenou změnu. Chyba nebo neodeslaný zápis ostatní uložené návštěvy nesmaže. Provedení operací nad zakázkou se stále řídí skutečným backendem a jeho verzemi/CAS.

Uložený den je dostupný i offline, pokud to firma dovoluje a relace splňuje dosavadní 24hodinové podmínky offline používání. Změna stavu, plánování a běžný úplný detail vyžadují internet; dosavadní offline rozpracování protokolu funguje odděleně. Neuložený výběr se nevydává za prázdný plán a zobrazí vysvětlení.

## Rozsah a bezpečnost

- Klíč přehledu odděluje účet, roli/náhled role, oprávnění, zapnuté moduly, instalaci, společný prostor, autorizační verzi a vybraný obor. Odhlášení, změna účtu a oboru kopii znepřístupní nebo vymaže.
- Při novém ověření společného prostoru se identifikátory uložených zakázek připojí k existujícímu manifestu. Server stejnými scope SQL podmínkami vrací jen povolená ID a jejich aktuální verze. Odepřený nebo změněný záznam zneplatní dotčený snapshot před dokončením přihlášení.
- Kešované seznamy se nepřidávají do evidence protokolů, fronty neodeslaných změn ani provozních tabulek. Samotná změna čtecí kopie nevyvolává umělou obnovu oprávnění nebo reload stránky.
- Neuchovávají se soukromé poznámky zahrady ani kontaktní telefony/adresář z připojené karty zákazníka. Jméno zákazníka a místo práce zůstávají součástí pracovního přehledu. Úplný detail čerpá aktuální oprávněná data ze serveru.
- Úplné snapshoty jednotlivých stránek musí mít stejnou revizi plánu. Podpůrné čtení revize se provádí jen s parametrem cacheSnapshot při přípravě měsíců; běžným API klientům nepřidává dva databázové dotazy.
- Změny provozních dat, migrace databáze ani úpravy přihlašovacích práv nebyly potřeba. Selhání pomocného úložiště neoznačí úspěšný serverový zápis za chybu.

## Omezení

- Funkce zrychluje především Den, Kalendář a rozpisy za uložené období. Neomezený seznam všech roků, vzdálené měsíce, fronta nenaplánovaných zakázek a výběry mimo tyto dva měsíce používají server.
- Lokálně se odvozují filtry stavu, druhu, technika, hledání a protokolů. Velké výsledky nad 500 položek používají původní serverové stránkování; příprava úplného měsíce je omezena na 50 stránek / 5 000 položek. Nedokončená nebo změněná dávka se nikdy neoznačí za úplný měsíc.
- Při přechodu do dalšího měsíce se při práci s kopií zachovává nové dvouměsíční okno. Při ověřeném spuštění/uložení se staré položky oříznou. Prohlížeč může sám místní úložiště uvolnit; jde o obnovitelnou kopii, nikoli zálohu.
- U samostatných instalací bez sdíleného manifestu se kopie při novém ověření účtu konzervativně vymaže, aby neobcházela změnu přiřazení. Dr. Závlaha a Dr. Garden používají společný manifest, takže podporují opětovné použití přes restart.
- Bez sítě nelze okamžitě zjistit změnu práv na serveru; použijí se dosavadní časově omezená offline oprávnění. Při připojení a dalším ověření se kopie znovu kontroluje. Stav „Uložená kopie“ neznamená živý stav všech kolegů.

## Ověření

- `npm test`: 76 testovacích souborů, bez chyby; cílené testy dále ověřily potvrzený přesun/smazání, zachování ostatních návštěv po chybě a závod opožděného čtení proti novějšímu potvrzení.
- Nová sada modelu: kompletní stránkování obou měsíců (125+105 záznamů), opětovné vytvoření klienta, filtry, přechod prosinec/leden v Praze, jiné účty/obory, zakázaný offline modul, expirace, změna verze/přiřazení, odmítnutý přístup, změna revize během stránkování, nedostupné úložiště a ochrana skutečné kopie při selhání zápisu.
- Skutečný Chromium + Worker/D1/R2 + IndexedDB: oba měsíce dostupné bez dalšího požadavku na seznam, kopie po obnovení stránky a ověření manifestu, uložená karta dne offline a žádná změna testované zakázky. Zůstává jeden identity požadavek při startu a žádné další při běžné práci či přepínání náhledu rolí.
- Regrese: skutečný Service Worker a offline fronta s původní fotografií přes reload/obnovení spojení, zákazník a zahrada, protokol/podpis/fotografie/PDF, role a oddělení oborů, přihlášení a administrátorská obnova hesla.
- Syntax check, přesné verze offline importů, validace kompilovaného artefaktu a stejné scénáře proti konkrétním artefaktům obou Sites. Zápisy výhradně v izolovaných testovacích databázích a R2.
- Ověřováno v Chromium, mobilní šířky 360/390/430 a desktop 1440 dle jednotlivých scénářů. Skutečný iPhone/Safari nebyl k dispozici. Nativní SwiftUI implementace se neměnila.

Soubory: nový `web/job-list-cache.js`, integrace v `cloud.js`, `jobs-ui.js`, `overview-ui.js`, doplnění `workspace-client.js`, autorizované verze v `worker/workspace-manifest.js`, konzistence snapshotu v `worker/jobs.js`, verze shellu/SW, zachování živého čtení staršího nativního mostu a regresní testy.

## Nasazení 12. listopadu 2026

- Dr. Závlaha: verze **126**, zdroj `3a625d145bc3a89ddda75a54b399f75096ac6ba2`, nasazení `appgdep_6af5f67e27ec81918ca168a81be79a39` succeeded, https://zavlahovy-denik.purplecedar.chatgpt.site
- Dr. Garden: verze **46**, zdroj `68f9b9cffe85567b12cc519870198e6d569dfdce`, nasazení `appgdep_6af5f6b73d848191b26e75f76cc6e1d2` succeeded, https://dr-garden.purplecedar.chatgpt.site
- GitHub: `49f7a63` a `19842e3`, PR #8. Doplňkový test prokazuje přenos revizního parametru snapshotu přes podepsanou vstupní bránu Dr. Garden. Zachované odlišnosti instalací včetně původní odpovědi při opakovaném mazání.

Před zveřejněním prošel každý konkrétní kompilovaný artefakt validací autentizovaného spuštění, real-browser testem místních měsíců, opětovným ověřením ID/verzí při reloadu, offline kartou dne, náhledem rolí a oddělením oborů. Offline fronta s původní fotografií, protokoly a další regresní workflow byly ověřeny na izolovaných datech. Veřejné přístupy, licenční propojení, provozní tabulky, zálohy a úložiště se neměnily.
