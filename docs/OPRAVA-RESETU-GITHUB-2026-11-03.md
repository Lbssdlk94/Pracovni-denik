# Převzetí opravy resetování z GitHubu

Zdroj: `origin/main`, commit `e0f48d5d8a2dd6aab3d0c647889febf300ad265e` (Stop the false access lock after background sync). Integrační větev: `release/github-fix-shared-workspace-2026-11-03`.

## Převzatá oprava

- Model a klient vycházejí z uvedeného GitHub commitu, včetně jeho tří regresních testů. Identifikátor dříve viděného či souvisejícího záznamu, který není místním uloženým záznamem, se při chybění v manifestu nepovažuje za snížení oprávnění. Tím se odstraní falešné šifrování prázdné změny a následné znovunačtení při běžné synchronizaci.
- Skutečně uložená data, neodeslané změny a opravdové změny role/oboru stále procházejí kontrolou manifestu, odebráním přístupu a případným šifrovaným zabezpečením.
- Úspěšně dokončená redukce s řízeným `workspace_reload` se nehlásí jako selhání zabezpečení práce. V aktuální aplikaci navigaci již zajišťuje callback `onReduced`; v převzatém klientu proto není druhé samostatné volání `location.reload()`. Dva nové testy ověřují předání řízení hostiteli a správné dokončení odvolání přístupu.
- Převzat záměr dalších GitHub oprav: normální automatická obnova po 120 sekundách a timeout komunikace nezaměňovaný za autorizační chybu. Stávající návrat po síťové chybě, kontrola viditelnosti a zachování fronty zůstávají funkční.
- Nové verzované adresy `github-sync-fix-v3` zajišťují načtení opraveného klienta i přes starší Service Worker.

## Kompatibilita se skutečně nasazenou aplikací

GitHub `main` při převzetí nebyl shodný se základem živé aplikace. Oproti poslednímu nasazenému společnému prostoru obsahoval také návrat ke staršímu backendu a odstranění migrací 0043–0049, společného API, autorizačních kontrol oborů a obnovy neodeslané práce. Nasazení celé této větve by odstranilo potřebné funkce a ochrany sdílené databáze.

Proto byla GitHub oprava začleněna do posledního ověřeného společného základu `1b070e4`. Backend, databázové migrace, společné úložiště, přístupové politiky a rozdíly firemních instalací zůstaly zachované. GitHub `main` nebyl přepsán. Předchozí rozpracovaná lokální alternativa byla odložena do stashe a není součástí vydání.

## Ověření

- 286 automatických testů, 0 selhání, včetně tří dodaných GitHub testů a kontrol skutečného odebrání oprávnění.
- Nový Chromium/Worker/D1/R2 regresní test: synchronizace vrátí smazanou šachtu; čtyři následující autentizované kontroly nevytvoří archiv, nezamknou aplikaci, neprovedou navigaci a zachovají otevřenou uloženou rozepsanou zakázku. Na izolovaných datech se nevytvoří nová provozní zakázka. Prošel na společném zdroji i na přesných sestaveních obou aplikací.
- Zachování šifrované neodeslané práce při skutečné změně týmu, stabilních identifikátorů operací a obnovení po reloadu.
- Kontroly rozhraní 390/430/1280/1440 px, více zahrad, adres, zrušeného formuláře a omezení pracovníka Garden.
- Kontroly HTTP 502/503/504, oddělení zaseklé fotografie od přehledů, automatického odeslání protokolu/fotografie právě jednou, skutečného offline Service Workeru a jeho importů.
- Skutečná dvojice izolovaných Workerů: společná DB/R2, konflikty zápisu, autorizace, oddělení týmů, podepsané RPC a přenos 25MiB fotografie.
- Kontrola syntaxe, build a kontrola přesného nasazovaného artefaktu obou instalací.

Zápisové testy proběhly na oddělených syntetických datech. Provozní zakázky, zákazníci ani zahrady nebyli testováním změněni. Fyzický iPhone/Safari není ověřen; mobilní testy používají Chromium emulaci.

## Vydání

- Dr. Závlaha: verze 107, commit `50a6c99a5d2b060bdbb89a38d7c3a12446bb512c`.
- Dr. Garden: verze 28, commit `e4a45c05c2819843feecc0295458c3c1de4bf94e`.
- Původní veřejné/soukromé přístupy, runtime prostředí a databázová schémata zachována. Nejsou přidané žádné migrace ani změny klíčů.

Již otevřenou aplikaci jednou zavřít a otevřít s internetem. Nemazat úložiště prohlížeče, které může obsahovat neodeslanou práci.
