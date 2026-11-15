# Přehlednější deník realizace – 15. 11. 2026

Webové rozhraní stávajícího deníku; žádná migrace databáze ani změna provozních záznamů.

## Použití

Otevřete zakázku druhu **Realizace → Deník realizace**. Na počítači je přímé tlačítko také v bočním panelu zakázky. Přehled zakázky a deník mají samostatné záložky. Aktivní záložka zůstává po opětovném otevření stejné zakázky zapamatovaná v této relaci; při změně účtu/oprávnění se paměť vymaže.

Zápisy jsou seskupené podle dnů od nejnovějšího. Na kartě je autor, stručný souhrn, počet fotografií a případné čekání na synchronizaci. Rozkliknutí zobrazí celou práci, volitelné části a fotografie. Tlačítko **Přidat dnešní zápis** otevře samostatný formulář. Materiál, komplikace a další krok jsou pod rozbalovací částí. **Zpět na zápisy** zachová lokální koncept; stejně tak přepnutí na přehled zakázky.

Deník se načte až při prvním otevření jeho záložky. Fotografie až po rozkliknutí konkrétního zápisu: nejvýše tři malé JPG/PNG do 2 MiB se zobrazí jako náhledy. Ostatní soubory, včetně HEIC a větších originálů, mají odkaz na otevření. Souhrn označuje neúplný stránkovaný počet znaménkem +. Soukromé adresy souborů a původní úložiště se nemění; nevytváříme kopie fotografií.

## Inspirace

- [Raken – Daily Reports](https://www.rakenapp.com/features/daily-reports): denní práce a fotografie v kontextu dne.
- [Fieldwire – Daily Report Forms](https://help.fieldwire.com/hc/en-us/articles/360004892152-Introduction-to-Daily-Report-Forms): oddělení denního záznamu od ostatních projektových údajů.

Přebíráme princip členění, nikoliv značku, grafické podklady či externí službu.

## Zachované návaznosti

Stávající API, původní identifikátory, stránkování, práva na serveru, rozpracované formuláře, IndexedDB fronta, idempotentní operace a výslovné porovnání konfliktů. Servisní protokol, stav zakázky a historie zůstávají beze změny. Ukládání zamkne formulář proti dvojímu odeslání a pozdní odpověď nemůže překreslit jinou otevřenou zakázku. Verze statických importů a Service Worker cache jsou sjednocené.

## Ověření

- `npm test`: 344 úspěšných testů, 0 chyb.
- `node scripts/test-job-diary-browser.mjs`: skutečný sestavený Worker, izolované D1/SQLite a R2, Chromium + IndexedDB. Oddělené záložky a načítání na vyžádání, klávesnice, řazení a seskupení dnů, až tři malé náhledy bez automatického stahování velkých originálů, přepnutí záložek a zachování konceptu, uložení textu a fotografie, obnovení stránky, offline zápis a fotografie, chyba 502 a následná synchronizace právě jednou, výslovné vyřešení konfliktu, přímý vstup z bočního panelu.
- `node scripts/test-communication-browser.mjs`: skutečný Service Worker a offline obnova; zaseklá fotografie neblokuje zakázky/zákazníky; obnovení po 503/504, zachování protokolu a původní fotografie při 502, odeslání právě jednou po připojení.
- Rozměry 360/390/430/1440 CSS px: žádné vodorovné posouvání, hlavní nové ovládací prvky alespoň 44 × 44 px, dlouhé jméno zákazníka, otevřený editor.
- Sestavení a validace obou firemních artefaktů se zachováním jejich konfigurace a brandingu.

Všechny zápisy testů jsou v izolovaných databázích; žádné skutečné zakázky nebyly přepsány. Není ověřeno na fyzickém iPhonu, v Safari ani s jeho softwarovou klávesnicí. Tato změna upravuje web/PWA, nikoliv nativní SwiftUI obrazovku nebo IPA.

Náhledy z testovacích dat: `/workspace/artifacts/job-diary-2026-11-15/`.
