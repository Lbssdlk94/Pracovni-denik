# Incident: deník realizace vracel 503

Produkční log Dr. Závlahy potvrdil `GET /api/jobs/…/diary` → 503 a `D1_ERROR: no such table: job_diary_entries: SQLITE_ERROR` (např. požadavek `b8c41df2c7e9767d004d295c1bc455f7`, čas 1794769677809 ms UTC). Obecná hláška „Týmové úložiště není dostupné“ zakryla chybějící migraci.

Předchozí balení obsahovalo `.openai/hosting.json` a `dist/`, včetně **vnořeného** `dist/drizzle`. Hosting ale migrace načítá z **kořenového** `drizzle`. Lokální testy ručně aplikovaly kompletní migrace a proto tuto chybu balení neodhalily. Kontrola shody statických souborů po nasazení nezaručovala připravenost produkční databáze.

## Náprava

Použit stávající `scripts/package-workspace-release.mjs`, který zabalí `.openai/hosting.json`, `dist`, **`drizzle` a `db`** a kontroluje kořenové cesty. Přidán přímý příkaz:

```
npm run package:site -- /absolutni/cesta/release.tar.gz
```

Dva regresní případy ověřují obsah taru včetně 0054, shodu SQL a odmítnutí chybějící kořenové migrace nebo zastaralého sestavení. Prošly příkazem `node tests/release-package.test.js` na izolovaných souborech. SQL historie nebyla měněna; žádné vytváření tabulek během běžného API požadavku.

Dr. Závlaha: **verze 132**, zdroj `876e495d53e9d9a833387b12f6a448c7a6e9ba51`, nasazení `appgdep_6afa0480665081918341a309b870f031`, úspěšné. Následný databázový přehled a čtení nově vytvořené tabulky potvrdily existenci všech sloupců a úspěšné čtení; bez přepisování skutečných zakázek. Migrace 0054 přidává prázdnou tabulku a index.

Dr. Garden: pokus o úplný balíček verze 52 (zdroj `b7b2a4b08a07e33abda13ebdf456b302e0de82d4`, nasazení `appgdep_6afa04a454d08191aa2465747c140006`) zastavil stávající ochranný trigger `workspace_transfer_frozen`. Archiv zahrnuje i historickou migraci úklidu syntetických dat; dostupná chyba ale neurčuje konkrétní SQL, které ochranu vyvolalo. Ochrana zůstala nedotčená. Poslední živá verze 51 zůstává. Neodstraňovat trigger, nepřepisovat neměnnou migraci a nespouštět úklid přes zmrazenou lokální databázi jako obcházení chyby. Propojený Garden používá společné API/databázi Dr. Závlahy, kde již tabulka existuje. Samostatné vyřešení lokální migrační historie Garden není součástí této opravy.

Pozor: opakované `save_site_version` se stejným zdrojovým commitem vrátilo již existující verzi a původní archiv. Opravený balíček byl proto vydán pod novým zdrojovým commitem. Metadata uloženého archivu používají normalizovaný obsah a jeho `content_hash` nelze bez znalosti algoritmu porovnávat se SHA-256 komprimovaného tar.gz. Ověřovat kořenové cesty před uložením a připravenost databáze po nasazení.

Přímá kontrola uživatelského API z nástrojové relace vrátila 401: správně vyžaduje existující místní přihlášení. Obejít přihlášení ani obnovovat heslo kvůli kontrole jsme nezkoušeli. Produkční ověření je úspěšné na úrovni databázové tabulky a jejího čtení; celé otevření deníku v přihlášené relaci uživatele zde není ověřeno.
