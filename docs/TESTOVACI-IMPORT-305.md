# Test1–Test305: jednorázový objemový import

Vlastník otevře Nastavení → Testovací data · Test1–Test305 → Vytvořit testovací data / pokračovat.

Import používá běžné přihlášené API zákazníků, automatického vytváření propojených zahrad, zakázek, servisních protokolů a soukromých fotografií. Nepřidává alternativní autentizaci ani serverový servisní token. Server nadále kontroluje oprávnění u každého požadavku. Správce, pracovník ani čtenář tento panel nevidí.

Pevná dávka `volume-20261027`:

- 305 zákazníků, 305 zahrad a 305 zakázek, názvy Test1 až Test305;
- 1. listopadu až 31. prosince 2026, všech 61 kalendářních dní po pěti návštěvách;
- plán 08:00, 10:00, 12:00, 14:00 a 16:00, odhad 60 minut, všechny přiřazené přihlášenému vlastníkovi;
- 305 potvrzených **syntetických** interních protokolů, zakázky zůstávají naplánované;
- 457 samostatných soukromých JPEG objektů (jeden u lichých, dva u sudých zakázek), celkem 379 988 768 bajtů, přibližně 380 MB;
- dva opakovaně používané uměle vytvořené snímky 1600 × 1200 px, žádné skutečné fotografie osob či zahrad;
- záměrně neexistující testovací adresy, bez telefonních čísel a e-mailů, žádné SMS ani odesílání protokolů.

Automatické vytvoření zahrady proběhne při založení zákazníka. Vazby používají jednoznačné identifikátory, nikoli párování jmen. Opakované spuštění naváže na stejná ID. Záznamy s cizími ID a názvem Test1–Test305 způsobí zastavení, nikoli sloučení. Pokud uživatel změnil testovací zakázku nebo protokol, import se zastaví a nepřepíše je. Běžné upozornění API na kolize se neobchází.

Import vyžaduje připojení a otevřenou aplikaci. Při zamknutí telefonu nebo přerušení sítě jej lze spustit znovu. Ovládání Pozastavit dokončí právě odesílaný požadavek. Nejde o offline frontu ani úlohu na pozadí. Existující servisní integrace ani konfigurace modulů se nemění. Fixture JPEGy nejsou v přednačítání service workeru: stáhnou se až při spuštění importu.

## Ověření bez provozních dat

```
npm run build:tenant
NODE_PATH=/cesta/k/playwright/node_modules node scripts/test-live-volume-import.mjs
```

Test má výhradně loopback HTTP bridge a novou dočasnou D1/R2, bez možnosti zadat vzdálenou cílovou URL. `QA_TENANT_ROOT` může vybrat jiné **lokální** sestavení. Ověřuje skutečné kliknutí v Settings, pozastavení a pokračování, celou dávku, úplné opakování bez duplicit, nezměněný výchozí záznam, identifikátorové vazby, počty a velikosti fotografií, kontrolní součet JPEG, restart úložiště, oprávnění čtenáře a nepřiřazeného pracovníka, seznam bez hromadného stahování fotek, PDF se dvěma fotkami a mobilní šířky 390/430 px.

Výsledky: `.qa/live-volume-import/report.json`, pro odlišný lokální build `.qa/live-volume-deploy/report.json`. Dočasná databáze i soubory se po testu odstraní.

Měřené časy jsou lokální Chromium/Miniflare, nikoli skutečný iPhone, Safari ani měření odezvy produkčního hostingu přes internet. Živý import vyžaduje běžnou relaci vlastníka a po jeho spuštění samostatnou kontrolu skutečných uložených počtů. Samotné nasazení importního tlačítka nevytváří testovací provozní záznamy.

## Výsledek 27. 10. 2026

Prošlo sestavení určené k nasazení Dr. Závlahy, s výchozím kontrolním zákazníkem/zahradou navíc. Ověřeno přesně 457 objektů přímo v R2 a součet jejich velikostí. Import po pozastavení: 27,6 s; úplné opakování bez duplicit: 3,3 s; vykreslení 306 zahrad: 97 ms. Mobilní přehled 390/430 px: 553/480 ms. Vygenerované PDF má 1 496 354 bajtů a dva vložené obrázky. Obsah PDF byl ověřen; samotný nativní PDF prohlížeč v headless Chromiu není náhradou skutečného iPhonu/Safari.

Strojový výsledek: `docs/test-results/import-305-2026-10-27.json`. Nasazení tlačítka je oddělené od vytvoření živých testovacích záznamů; ty vzniknou až kliknutím přihlášeného vlastníka.
