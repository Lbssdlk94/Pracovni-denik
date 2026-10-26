# Ikona Pracovního deníku

Od 23. 10. 2026 je podle nového zadání používán jednoduchý tmavě zelený monogram na bílém podkladu. `approved-mark.svg` je vektorové překreslení symbolu z dodané vizuální předlohy; `approved-master.png` je technický export 1024 px. Jde o univerzální symbol Pracovního deníku, názvy firem zůstávají beze změny.

Výstupy se připravují pomocí `node scripts/prepare-app-icons.mjs`. Stejný zdroj vytváří in-app `work-diary-mark.svg`, PNG 32/48/180/192/512/1024 px a maskable varianty 192/512 px ve firemní šabloně i Super Adminu. Pozadí je neprůhledné bílé, bez vnějšího zaoblení; systém aplikuje svoji masku. Monogram leží uvnitř centrální bezpečné kružnice o průměru 80 % hrany pro Android.

`source.png`, `master.png` a `zadani_pro_codex.txt` archivují původní modrou ikonu a dřívější zadání; nový požadavek uživatele je nahrazuje. Původní soubory nebyly odstraněny.

Odkazy manifestu, favicon, apple-touch-icon, značky uvnitř aplikace a offline cache používají verzi `green-icon-v1`. PWA `name`, `short_name`, `id`, `scope`, `start_url` a názvy jednotlivých firem zachovány. Nová ikona je nastavena také pro push oznámení; samotné odesílání oznámení se nemění.

Ověření: rozměry a neprůhlednost všech variant, shoda assetů napříč instalacemi, bezpečná kružnice Androidu, načtení ze skutečných sestavených Workerů přes HTTP response (200, image/png a shodný obsah), správné odkazy manifestu, Apple a favicon, verzování offline cache. Izolovaný Chromium test ověřil všechny role na mobilu i desktopu včetně obnovy a studeného offline startu. Fyzický iPhone/Android a skutečná instalace na plochu nebyly k dispozici.

iOS může u již přidané aplikace ponechat původní ikonu. Nové přidání na plochu použije novou variantu. Výměna nesmaže lokální databázi ani neodeslané pracovní záznamy; k aktualizaci cache nepoužíváme mazání IndexedDB.
