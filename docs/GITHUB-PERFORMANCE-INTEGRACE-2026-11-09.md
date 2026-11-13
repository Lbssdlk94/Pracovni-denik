# Převzetí aktuálních optimalizací z GitHubu

## Porovnání

Nová větev `perf/work-diary-overhead-2026-11-09` je v PR #5, revize `3defe12a404f382ceb8679352829833adc7b5282` z 9. listopadu. Obsahuje tři optimalizační commity nad `main` (`8fddb62`). V PR #3 již bylo změněno pravidelné obnovení ze dvou na pět minut a odstraněn doslovný znakový řetězec `\\n`, který rozbíjel parsování `app.js`.

Naše poslední pracovní verze `71f547e` vychází z jiné větve; proti dnešní optimalizační větvi má 89 vlastních commitů a optimalizační větev 6. Celým nahrazením by se ztratily zdroje SwiftUI/Watch, přihlášení heslem, společný adresář/obory a náhled rolí. Nejde o úmyslné smazání těchto funkcí autorem optimalizací: jen nejsou v jeho starším základu.

Proto je připravená větev `integrate/github-performance-2026-11-09` nad `71f547e`, která přebírá změny bez návratu ke starému základu:

- Soubory Service Workeru se stahují souběžně v dávkách maximálně osmi. PDF knihovna, font, přihlašování a role preview zůstávají v offline balíčku. Při chybě libovolného souboru se neaktivuje neúplná nová verze.
- Nastavení modulů/licence se v rámci jednoho požadavku API čte jen jednou. Jde o lokální Promise pro požadavek, nikoli sdílenou paměť mezi uživateli, obory či následujícími požadavky. Skutečná serverová autorizace zdrojů se zachovává.
- Pravidelné obnovení úspěšné komunikace nyní čeká pět minut. Současný mechanismus zotavení po výpadku, rychlá reakce na návrat internetu a ruční obnovení zůstávají. Původní `setInterval` ze staré větve se nepřidává souběžně s existujícím obnovováním.
- Ladicí panel z PR #5 už v naší pracovní verzi nebyl; nic se znovu nevkládá. Také rozbité parsování `app.js` už bylo opravené.

Jde o výkonové změny, nikoli implementaci nového modrého vizuálního návrhu. Při původní integraci bez nasazení; po následném výslovném pokynu uživatele nasazeno 9. listopadu, viz níže. Bez migrace databáze a bez změn provozních záznamů.

## Kontroly a měření

- `npm run check` a `git diff --check`: prošly.
- `npm test`: 75 testovacích souborů, 0 selhání; upravený nový test byl následně znovu samostatně ověřen.
- Nové regresní testy: počet dotazů při uploadu fotografie protokolu, změna politiky mezi požadavky, souběh stahování maximálně 8, neaktivování rozbité offline verze.
- Izolovaný upload fotografie do protokolu: před integrací 3 SELECTy pro nastavení funkcí, po integraci 1. To není měření celkového počtu SQL dotazů ani doby celé operace.
- `node scripts/build.mjs` + `node scripts/validate-artifact.mjs --allow-unbound`: úspěšný sestavený Worker, ověřená autentizace, spuštění, zakázky, odmítnutí anonymního přístupu nad oddělenou SQLite/R2. Samotné `npm run build` vyžaduje navázaný hosting; pracovní GitHub checkout nemá `project_id`, proto je pro tuto lokální kontrolu použit podporovaný příznak `--allow-unbound`.
- `test-native-client-browser.mjs`: skutečný Chromium + izolovaný Worker/D1/R2; náhled rolí, návrat, koncepty, blokování zápisu, oddělení oborů, přiřazené zakázky a kontrola nulových dodatečných identity/manifest požadavků při běžném používání. Šířky 390/1440.
- `test-communication-browser.mjs`: skutečný Service Worker, offline spuštění, obnovení spojení po 502/503/504, zachování originální fotografie a ID operace v neodeslané frontě i přes reload; následné uložení právě jednou.

Nativní Swift/Xcode se neměnil a v tomto úkolu se nesestavoval. Fyzický iPhone/Safari nebyl testován. Nejde o důkaz rychlosti konkrétního mobilního připojení ani odstranění všech možných výpadků.

## Nasazení 9. listopadu 2026

Na výslovné zadání uživatele byly změny aplikovány jako úzké patche do aktuálních zdrojů obou Sites. Zachované branding, přístupy, soubory, vazby a nastavení instalací.

- Dr. Závlaha: verze **124**, zdroj `f455c05bf5f2a61fb6e2608f823dfbd08512ba39`, nasazení `appgdep_6af221b7498c8191930dd5cf10eec20b`, succeeded, https://zavlahovy-denik.purplecedar.chatgpt.site
- Dr. Garden: verze **44**, zdroj `728e6f78c1310d64572c02834612c3fe8bd94378`, nasazení `appgdep_6af221de601c8191ad052de5ee79926e`, succeeded, https://dr-garden.purplecedar.chatgpt.site

Pro každý konkrétní produkční artefakt před nasazením prošly nové testy memoizace a offline instalace, sestavení/validace autentizovaného Workeru, Chromium test náhledu rolí a pracovních funkcí a skutečný SW/offline test obnovy komunikace s protokolem a původní fotografií. Všechny zápisy do testovacích SQLite/D1/R2, nikoli do provozních zakázek. Kontrola přesného verzování importů, zotavení, komunikace serveru a podepsané gateway rovněž prošla.
