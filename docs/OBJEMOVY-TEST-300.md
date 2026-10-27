# Objemový test: 300 zákazníků, 300 zahrad, 305 zakázek

Datum: 27. 10. 2026. Testovaná verze GitHubu: `6e189a0208888765364e9ba20341f3262bfd2840`.

## Výsledek

Scénář PROŠEL. V průběhu posledního úplného běhu nebyl zaznamenán pád stránky, neošetřená JavaScript chyba, HTTP 5xx ani vodorovné přetékání testovaných pohledů. Jde o výsledek tohoto konkrétního testu, nikoliv o záruku všech zařízení a budoucího provozu.

Data vznikla přes skutečné API sestaveného Workeru v novém izolovaném Miniflare prostředí s D1/R2:

- 300 syntetických zákazníků, každý s jednou automaticky propojenou zahradou: přesně 300 zahrad.
- 1. listopad až 31. prosinec 2026 včetně víkendů: 61 dní × 5 návštěv = 305 zakázek.
- Tři testovací technici, plánované začátky 08:00, 10:00, 12:00, 14:00 a 16:00, odhad hodina.
- Kontrola všech vazeb zákazník–zahrada–zakázka přes identifikátory, žádné párování názvů.
- Restart skutečného testovacího Workeru se zachováním jeho izolované D1/R2: počty a vazby zůstaly zachovány.
- Zákazníci prošli všemi 3 API stránkami a zakázky všemi 4 stránkami, bez ztracených nebo opakovaných ID.
- Počty v kalendáři: listopad 150 a prosinec 155, každý den přesně 5; ověřen i poslední den a denní rozpis.
- Vytížení pro týden 16.–22. listopadu odpovídalo 35 hodinám celkem: 14 + 14 + 7 hodin.
- Pracovník viděl svých 122 zakázek (dvě denně), nikoliv cizí práci. Server odmítl nepřiřazený detail, cizí účet a zakázaný zápis čtenáře.
- 50 čtecích požadavků v dávkách po 5 souběžných uživatelích, bez serverových chyb.
- Desktop 1440 px, mobil pracovníka 390 px, mobil správce 430 px. Deset cyklů Přehled → Zakázky, obnova stránky, zákazník 300 a jeho zahrada, všech 300 zahrad i na zpomaleném mobilním CPU.

## Naměřené časy obrazovek

Čas zahrnuje akci, dokončení sledovaného zobrazení a dva vykreslovací snímky. Běží na lokálním loopbacku, nikoliv přes produkční internet; statické soubory zde nejsou měřeny po CDN kompresi. Jednotlivá měření jsou orientační a mezi běhy se liší.

| Kontrola | Šířka | Čas |
| --- | ---: | ---: |
| desktop cold overview | 1440 px | 883 ms |
| desktop first 100 customers | 1440 px | 138 ms |
| desktop customers to 200 | 1440 px | 149 ms |
| desktop customers to 300 | 1440 px | 167 ms |
| desktop search customer 300 | 1440 px | 161 ms |
| desktop 300 garden cards | 1440 px | 138 ms |
| desktop jobs to 200 | 1440 px | 226 ms |
| desktop jobs to 300 | 1440 px | 261 ms |
| desktop jobs to 305 | 1440 px | 383 ms |
| desktop calendar 2026-11 | 1440 px | 126 ms |
| desktop calendar 2026-12 | 1440 px | 113 ms |
| desktop timeline 5 visits | 1440 px | 167 ms |
| mobile cold overview | 390 px | 591 ms |
| mobile daily 2 own visits | 390 px | 90 ms |
| mobile daily render with 4x CPU slowdown | 390 px | 280 ms |
| mobile manager cold overview | 430 px | 629 ms |
| mobile manager 300 gardens with 4x CPU slowdown | 430 px | 371 ms |
| mobile manager first 100 customers | 430 px | 119 ms |
| mobile manager customers to 200 | 430 px | 99 ms |
| mobile manager customers to 300 | 430 px | 100 ms |
| mobile manager search customer 300 | 430 px | 116 ms |

Lokální API zakázek: 59 naměřených čtení, medián 10,5 ms, p95 13,6 ms. Tyto časy neobsahují přenos přes veřejný internet.

## Pozorování a hranice

- Můj den se při novém spuštění vrací na dnešek. Pro kontrolu budoucích termínů se po obnově stránky znovu zvolilo datum. Zakázky z databáze nezmizely.
- Zahrady se vykreslují všechny najednou. S 300 položkami zde nevznikl výkonnostní problém; z toho nelze odvodit chování při desítkách tisíc zahrad.
- Test neobsahuje soubory zákazníků, množství fotek, velké PDF přílohy ani souběžnou práci stovek uživatelů. Nenahrazuje dlouhodobý zátěžový test nebo ověření skutečného hostingového limitu.
- Použit Chromium a emulace mobilních rozměrů; zpomalení CPU 4× je simulace. Skutečný iPhone/Safari, pomalá mobilní síť a serverová latence produkčního hostingu nebyly tímto během ověřeny.
- Dvě zaznamenané hodnoty JS heapu jsou pouze momentální vzorky. Nejsou celkovou RAM zařízení ani důkazem nepřítomnosti úniku paměti.
- Žádná provozní data nebyla vložena nebo upravena. Testovací D1/R2 úložiště bylo po běhu odstraněno. Nic se nenasazovalo do živých aplikací.

## Opakování

Test je v `scripts/test-volume.mjs`. Používá výhradně novou lokální databázi a loopback, nepřijímá URL vzdálené aplikace. Výstup standardně ukládá do ignorované `.qa/volume`; vlastní adresář lze zadat parametrem `--output`.

Po `npm ci` a `npm run build:tenant` je potřeba mít dostupný balíček Playwright a Chromium. Současné testovací prostředí používá Chromium v `/usr/bin/chromium`; jinou cestu lze zadat proměnnou `QA_CHROMIUM`. Pak se spustí `node scripts/test-volume.mjs`.

Scénář má pevné období listopad–prosinec 2026; při opakování po skončení tohoto období je potřeba zohlednit čekání na příští návštěvu na úvodu, případně upravit období scénáře.
