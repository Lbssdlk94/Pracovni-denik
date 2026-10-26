# Pracovní pořadí, zahrady, závady a protokoly – v75

## Příčiny a opravy

- Řazení dříve oddělovalo pouze Hotovo od ostatních stavů. Nedokončený pokus tak zůstával mezi aktivními návštěvami a rozhodoval jeho původní čas. Serverové řazení, stránkování, denní seznam i společný seznam nyní používají pořadí Probíhá → aktivní podle data a času → Nedokončeno → Hotovo. V rámci dne jsou aktivní návštěvy bez času za časovanými.
- Opravný formulář měl uloženou zahradu a adresní text, ale neměl ID zákazníkovy adresy ani strukturované město. Zahrada dosud eviduje jen text adresy. Formulář nyní vždy nabízí vlastní volbu konkrétní uložené zahrady. Další části adresy získává přes existující jednoznačný řetězec ID zahrada → zakázka → zákazník → adresa. Nikdy podle shodného jména nebo adresního textu. Při chybějící či rozporné vazbě město neodhaduje. Ruční adresa zůstává možná.
- Pozdní odpověď při změně zahrady kontroluje aktuální výběr a verze upravovaných polí. Nezastíní novější ruční změny. Obnovení rozepsaného formuláře zachovává hodnoty i konkrétní opravu/závadu.

## Použití

1. V zakázce zvolte **Změnit stav → Nemohu dokončit**, vyberte nebo napište povinný důvod a potvrďte. Další aktivní návštěva se posune nahoru; zakázka zůstane v části **Nedokončené · k řešení**. Správce má stejnojmennou rychlou volbu a frontu na časové ose.
2. Při přeplánování nedokončené zakázky se obnoví Naplánováno. Původní datum, časy, přiřazení a důvod se uchovají v **Doplňující údaje → Předchozí nedokončené pokusy** i v historii zahrady. Návrat do práce je možný také výslovnou změnou stavu.
3. Zahrady se ve výběrech zobrazují jako název · dostupné město · stručná adresa. Úplná adresa pro navigaci se nemění. ID zůstávají jediným základem vazeb.
4. Zahrada, její historie a detail nové návštěvy ukazují otevřené závady s datem, prioritou a stavem. Klepnutí otevře řešení a správci umožní naplánovat opravu. Dokončení zakázky závadu neřeší. Po výslovném vyřešení zůstane neutrální záznam v historii; sledovaná závada je ke zdrojové návštěvě připojena pouze jednou.
5. Dokončené zakázky mají odznak **Protokol hotový / rozpracovaný / chybí**. V úzkém bloku časové osy jej zastupuje ✓ / … / !; úplné znění je v popisku a v detailu. Ve **Filtrech → Protokoly dokončených zakázek** lze vybrat chybějící i rozpracované. Vyplněný protokol lze potvrdit samostatným tlačítkem; samotná prázdná návštěva označená Hotovo stále znamená Protokol chybí. Úprava obsahu potvrzeného protokolu jej vrátí do rozpracovaného stavu.

## Soubory a data

- `worker/jobs.js`, `job-workflow.js`, `job-planner.js`, `planning.js`: pořadí, filtry, návrat do plánu, kontrola oprávnění a souběžných změn.
- `worker/service-work.js`, `garden-history.js`: skutečný stav dokumentu a historie návštěv/pokusů.
- `worker/garden-address-links.js`, `api.js`, `customers.js`: adresní metadata přes explicitní ID, se zachováním serverové viditelnosti zdrojových zakázek.
- `web/jobs-ui.js`, `job-address-model.js`, `garden-choice.js`, `job-workflow-model.js`, `job-schedule.js`, `job-backlog-ui.js`, `job-timeline-ui.js`, `job-week-ui.js`, `job-table-ui.js`, `planning-model.js`, `job-timeline-model.js`, `job-composer.js`, `garden-history-ui.js`, `service-work-ui.js`, `app.js`, `customers-ui.js`, `subscriptions-ui.js`, příslušné CSS: formuláře, jednotné výběry a zobrazení.
- `db/schema.js`, `drizzle/0036_job_workflow_20261019.sql` + metadata: nová historie pokusů a stav protokolu. Migrace zachová provozní zakázky beze změny; jednorázově zaznamená současné nedokončené pokusy. Transakční triggery a verze zabraňují zdvojení při souběžném zápisu.
- `scripts/build.mjs`, `package.json`, nové regresní testy, `web/sw.js` a aktualizované verze importů: sestavení, ověření a offline cache.

## Ověření a meze

Testy používají výhradně izolované SQLite/D1, R2 a testovací přihlášení; žádné provozní zakázky se kvůli testům nemění. Automatické testy zahrnují role vlastníka, správce, pracovníka, čtenáře a nepřizvaného uživatele, souběžné zápisy, opakování požadavku, přeplánování, adresní ID, protokolové filtry, migraci, dva pozemky jednoho zákazníka a zachování otevřených závad.

Prohlížečové scénáře ověřují skutečné ukládání/obnovení, mobilní šířky 360/390/430 a desktop 1280/1440, předání kolegům, přesouvání, výběr adres a obnovu rozepsaného formuláře. Samostatné scénáře ověřují offline zápis závad/protokolů a pozdější synchronizaci s konflikty a soukromými fotografiemi. Změna stavu běžné zakázky a její plánování nadále vyžadují internet, stejně jako dosavadní seznam zakázek.

Skutečný iPhone ani macOS Safari nejsou dostupné; WebKit v Linuxu je emulované ověření, nikoliv fyzický přístroj. Ztracené údaje pokusů před touto migrací nelze zpětně rekonstruovat; zachová se aktuálně dostupný stav. Starý protokol se označí jako hotový pouze při dohledatelném uloženém dokončení dané verze, jinak zůstává rozpracovaný. Při nejednoznačných adresních vazbách je nutný ruční výběr. Google Disk a e-mailové integrace se v tomto úkolu nemění.

### Výsledek závěrečné kontroly

- `npm test`: 45 úspěšných testovacích souborů, žádné selhání; `npm run check` a validace sestavení prošly.
- Skutečný izolovaný workerd/D1: `test:job-workflow-worker`, `test:planning-worker`, `test:subscriptions-worker` prošly, včetně migrace, stránkování, souběžných změn a idempotence.
- Chromium: pracovní přehled, oprava adres, historie závad, zákazníci, desktopové plánování a servisní protokol/PDF prošly. WebKit: pracovní přehled, oprava adres a historie včetně offline synchronizace prošly.
- Test zpožděné adresní odpovědi vypíná service worker, aby síťový odklad skutečně zachytil Playwright. Samostatné offline scénáře běží se skutečným service workerem a IndexedDB.
- Při obnově stránky WebKit jednou ohlásil zrušený požadavek přednačítání. Regresní test před obnovou nyní čeká na dokončení síťových operací; funkční scénář poté prošel bez chyb stránky.
