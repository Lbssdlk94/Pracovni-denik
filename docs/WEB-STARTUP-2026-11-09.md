# Rychlejší otevření webového deníku

## Příčina čekání a oprava

Předchozí start nejprve čekal na `/api/me` a ověření místního inventáře. Potom ještě před vykreslením přehledu čekal na seznam zahrad a závlahových zón. Tím síťové načítání podpůrných seznamů blokovalo i již ověřeného uživatele.

Nově se po ověření účtu a místních dat otevře přehled s oprávněně dostupnou místní kopií zahrad a zón. Čerstvé seznamy doběhnou na pozadí. Pozdní odpovědi nepřekreslují otevřený formulář ani rozepsané značky; změna relace/role má vlastní generační kontrolu. Jiný počáteční pohled než přehled zachovává původní pořadí načítání. Nová rozhraní ani ukládání produkčních záznamů tato úprava nepřidává.

Další úspory:

- Platná relace ověřená heslem nemusí znovu zjišťovat, zda je povolené přechodné přihlášení ChatGPT. Relace se stále ověřuje proti aktuálnímu členovi, platnosti, odvolání a verzi hesla v databázi při každém požadavku.
- Prázdný místní inventář potřebuje jedno ověření manifestu místo dvou. Jakmile obsahuje jediný identifikátor, závěrečná kontrola revize zůstává. Účty, obory, role a revokované neodeslané záznamy se nadále rekoncilují před zpřístupněním místních dat.
- Žádné další periodické ověřování identity; běžné obnovení a náhled rolí používají ověřenou identitu dokumentu. Server dál autorizuje skutečné operace.

## Měření v izolaci

Stejný Chromium/Worker/D1/R2 scénář s první odpovědí zahrad záměrně zpožděnou o 1 500 ms, šířka 390 px:

| Měření | Před změnou | Po změně |
|---|---:|---:|
| Od navigace k vykreslení přehledu | 2 454 ms | 621 ms |
| Od odpovědi `/api/me` k přehledu | 1 770 ms | 76 ms |
| Vykresleno před doběhnutím zahrad | ne | ano |
| `/api/me` při prvním startu | 1 | 1 |
| Manifest prázdného zařízení | 2 | 1 |

První zkušební běh opravy měl 675/87 ms. Ověření konkrétních produkčních artefaktů při souběžném testování mělo 913/165 ms (Dr. Závlaha) a 998/234 ms (Dr. Garden). Jde o izolovaný záměrně zpomalený scénář, nikoli garantovaný čas otevření v konkrétním telefonu nebo připojení. Reálný autentizovaný start produkčním účtem nebyl měřen.

## Testy

- `npm test`: 75 souborů, 0 selhání; `npm run check`, validace sestaveného Workeru a `git diff --check` prošly.
- Regresní test zachovává jednu kontrolu prázdného inventáře, dvě s libovolným uloženým ID a odmítnutí při změně revize.
- Test heslové relace prokazuje, že se po změně role projeví čtenářská práva a že neplatná/odvolaná/expirovaná relace nebo změna verze hesla vrací 401. Neplatná cookie nesmí přejít na jiné přihlášení.
- Skutečný prohlížeč otevře přehled před zdrženými zahradami, umožní navigaci a psaní do formuláře; pozdní odpověď text nepřepíše. Opětovné spuštění s uloženými zahradami ověřuje aktuální identitu a oba manifestové kroky.
- Náhled rolí, přiřazené zakázky a oddělení oborů, zákazník + zahrada, protokol, podpis, fotografie a PDF, offline zápis a opakovaná synchronizace bez duplicit: prošly.
- Přihlášení a administrátorská obnova hesla: Chromium 390/430/1440. Protokolové a zákaznické scénáře dále zahrnují mobilní šířky 360/390/430.
- Konkrétní sestavené artefakty obou Sites prošly izolovanou validací autentizace, startup testem s opožděnými zahradami a skutečným Service Worker/offline testem obnovy komunikace s původní fotografií.
- Fyzický iPhone/Safari nebyl použit. Nativní SwiftUI zdroje se neměnily.

Soubory: `web/app.js`, `web/workspace-client.js`, `worker/api.js`, verze importů v `cloud.js`, `index.html`, `sw.js`; regresní testy `local-auth.test.js`, `workspace-client.test.js` a browser skripty. Starší test nativního mostu nyní před kontrolou uloženého kontaktu čeká na asynchronní načtení řádku; skutečný zápis zákazníka a zahrady zůstává ověřen přímo v testovací databázi.
