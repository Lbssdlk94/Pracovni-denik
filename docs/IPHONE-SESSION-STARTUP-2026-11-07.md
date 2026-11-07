# Načtení oprávnění pouze při spuštění

Požadavek: přihlášený pracovník nemá během běžného používání opakovaně načítat role a dostupné moduly. Jde o nativního klienta iPhone 0.8; web ani serverová pravidla se nemění.

## Chování

- `APIStore.start()` načte relaci a oprávnění jednou pro nový proces aplikace. Opětovné vykreslení kořenové obrazovky neprovádí další zjišťování oprávnění. Nové spuštění po ukončení aplikace role načte znovu.
- Výslovné přihlášení, změna firmy, oboru nebo vlastního hesla načtou odpovídající identitu. Není možné převzít oprávnění předchozího účtu či firmy.
- Návrat z pozadí, připojení internetu, pravidelná aktualizace pracovních dat, ruční obnovení seznamu, Watch, uložení a synchronizace fronty nevolají `/api/me`. `resume()` pouze opakuje odeslání fronty a obnoví pracovní data; nejde o znovupřihlášení ani změnu načtených rolí.
- Pravidelná aktualizace pracovních dat zůstává. Odstranění této aktualizace by přerušilo průběžnou dostupnost změn ostatních pracovníků.
- Oprávnění při skutečném čtení a zápisu dále ověřuje server. Odebranou pravomoc nelze využít jen proto, že staré tlačítko zůstává do nového spuštění viditelné. Odpověď 403 změnu odmítne, neodhlašuje legitimní účet kvůli jedinému nepřístupnému záznamu; odmítnutý zápis zůstane ve frontě jako blokovaný.
- Odpověď 401 z čtení, zápisu nebo synchronizace ukončí neplatnou relaci; klient ji automaticky znovu neotevírá při každém návratu do popředí. Neodeslaná fronta a koncepty zůstanou v původním šifrovaném úložišti. Odeslání odmítnuté kvůli změně účtu/relace není vydávané za úspěšné potvrzení.
- Zůstává současná 24hodinová platnost offline oprávnění. Obnovení seznamu ani samotný online zápis tuto dobu neprodlužuje. Dlouho otevřená online aplikace může nadále ukládat přes server; offline zápis po uplynutí platnosti vyžaduje nové spuštění s připojením. Existující koncepty se nemažou.

## Upravené části

`APIStore.swift`: jednorázový start, oddělení obnovy dat od načítání identity, odstranění předběžného `/api/me` před zápisy a synchronizací, obsluha odmítnuté relace bez ztráty fronty, zachování platnosti offline přístupu.

`APIRoot.swift`: inicializace přes jednorázový start. `APIFixture.swift`: možnost změny identity v izolovaných testech. `NativeAPITests.swift`: sedm regresních scénářů:

1. Jeden požadavek na role při startu; opakovaný start, návrat, čtení a zápis bez dalšího požadavku.
2. Odeslání fronty a požadavek hodinek bez načtení rolí.
3. Změněné pravomoci se načtou až v nově vytvořené instanci aplikace.
4. Serverové odmítnutí 403 stále zablokuje změnu a zachová její obsah.
5. Odpověď 401 ponechá frontu i koncepty a nespustí automatické znovupřihlášení.
6. Přímý online zápis respektuje neplatnou relaci bez předchozího volání `/api/me`.
7. Dlouhá online relace nadále ukládá, ale neprodlužuje offline oprávnění.

## Ověření

Lokálně prošlo 13 testů přípravy simulátorů, 4 testy podepisovacích zásad a `git diff --check`. Tyto kontroly nenahrazují kompilaci Swiftu. Sedm nových XCTest scénářů vyžaduje Xcode a zatím nemá potvrzené spuštění. Finální stav GitHub Actions bude doplněn po běhu; původní blokace účtováním se bez důkazu nepovažuje za vyřešenou. Neprováděly se zápisy do skutečných zakázek, změny serverových oprávnění ani produkční migrace.
