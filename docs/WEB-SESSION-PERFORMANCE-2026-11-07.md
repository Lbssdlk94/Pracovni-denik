# Web a aplikace z plochy: méně ověřování, stejné zabezpečení

Požadavek: neověřovat stále dokola přihlášení a možnosti uživatele, zrychlit a stabilizovat běžné používání Pracovního deníku. Navazuje na změnu [nativního iPhone klienta](IPHONE-SESSION-STARTUP-2026-11-07.md).

## Příčina zbytečných požadavků

`cloud.connect()` vždy znovu načítal `/api/me` a poté kontroloval místní inventář přes `/api/workspace/manifest`. Volala jej obnova přehledů, otevření nastavení, starší nativní adaptér i předběžná kontrola každého zápisu do společného workspace. Tentýž účet a jeho nezměněné možnosti se tak opakovaně zjišťovaly před vlastní prací. Výsledek byl další HTTP a databázová práce a při přechodné chybě zbytečně zablokované uložení či obnova.

## Oprava

- `connect()` sdílí jeden právě probíhající požadavek a dále vrací identitu načtenou pro aktuální dokument. Role a moduly se během běžné synchronizace znovu nevyhledávají. Ověření uložených offline dat zůstává při skutečném spuštění / novém načtení stránky.
- Z ukládání je odstraněna předběžná kontrola celého workspace. Každý skutečný požadavek zůstává autorizovaný serverem se současnými pravidly rolí, oborů a přiřazení. Nejde o vypnutí zabezpečení API.
- Běžné otevření nastavení už nezjišťuje přístup. Obnova dat a návrat z pozadí synchronizují data bez samostatného načítání identity.
- Po výslovném přihlášení nebo změně účtu/oprávnění v nastavení lze identitu obnovit. Přihlášení sdílí již načtený výsledek se startem aplikace, místo dvojího `/api/me`. Změna účtu / odhlášení oznámí existujícím mechanismem jiným kartám explicitní změnu; nejde o časovač.
- Odpověď 401 stále ukončí neplatnou relaci. Jednotlivá nepovolená část při synchronizaci neodhlašuje celý účet kvůli 403; odmítnuté šachty se nezobrazují z předchozí cache a změněný přístup není označen za výpadek internetu. Přechodná chyba spojení dál podporuje bezpečné opakování.
- Zachovány původní IndexedDB a fronty, ID operací, koncepty i data. Žádná nová databáze, migrace, změna firemního brandingu nebo přístupového publika.
- Nové verze JS modulů a Service Worker cache. Aktualizace nevynucuje automatické obnovení právě rozepsané stránky. Web / aplikaci z plochy stačí jednou znovu načíst.

## Měření a skutečné testy

Stejný izolovaný Chromium / Worker / D1 / R2 scénář: spuštění, tři opakovaná čtení nativního kontextu, skutečné otevření nastavení, návrat na zahrady a skutečně dokončená synchronizace. Test čeká na dokončení změny stavu spojení; nestačí pouhé vyvolání kliknutí.

| Požadavky | Před změnou | Po změně |
| --- | ---: | ---: |
| `/api/me` při spuštění | 1 | 1 |
| Manifest při spuštění v těchto datech | 2 | 2 |
| Další `/api/me` v uvedeném scénáři | 5 | 0 |
| Další manifesty v uvedeném scénáři | 10 | 0 |

Odstraněno **15 zbytečných požadavků** v tomto scénáři. Nejde o příslib konkrétního násobku zrychlení celého webu nebo měření uživatelova telefonu / internetové přípojky. Samostatně test ověřil skutečně uloženou změnu stavu zakázky bez další identity nebo manifestu. Nasazované firemní buildy byly také ověřeny v izolovaném prohlížečovém scénáři.

Úspěšně prošlo:

- `npm test` pracovní aplikace: 73 testovacích souborů, bez selhání.
- Kontrola syntaxe a `git diff --check`.
- `test-native-client-browser.mjs`: počty požadavků, skutečné uložení stavu, zachovaný formulář, zrušení bez zápisu, načtení nových možností při novém spuštění, serverové odmítnutí zakázaného modulu i při starší načtené identitě, přiřazený pracovník a oddělení oborů.
- `test-local-auth-browser.mjs`: skutečné heslové přihlášení, vytváření účtů, povinná změna prvního hesla přes obnovení stránky, relace, pouze administrátorské obnovení hesla, oprávnění a šířky 390 / 430 / 1440.
- `test-communication-browser.mjs`: zablokovaná fotografie nezastaví zákazníky a zakázky; chyby 502/503/504; stejný neodeslaný protokol, původní fotografie a operation ID po obnovení; následná synchronizace právě jednou. Skutečný Service Worker uloží aktuální moduly, odstraní staré cache a obnoví shell offline i spojení po návratu sítě.
- `test-native-screens-browser.mjs`: deset pracovních modulů, uložení zákazníka a párové zahrady, protokol/podpis/fotografie/PDF, značky a poloha, offline zápis bez duplikace, předání oznámení a skrytí závlahářských údajů pracovníkovi Garden.
- Sestavení a validace přesně obou firemních artefaktů; autentizovaný start a zakázky nad izolovanou SQLite/R2, anonymní přístup odmítnut.

Testovací skripty používají aktuální verzi modulu. Technický test vynuceného výpadku identity výslovně požaduje `refresh:true`; běžný provoz tento požadavek nepoužívá. Nezapisovalo se do skutečných zakázek ani zákazníků.

## Nasazení

- **Dr. Závlaha:** https://zavlahovy-denik.purplecedar.chatgpt.site — Sites **122**, zdroj `5192bd9174bd94b9923ceb39844bc737c98e909c`, deployment `appgdep_6aef6ce83b548191b7204a0d4f709617`, `succeeded`.
- **Dr. Garden:** https://dr-garden.purplecedar.chatgpt.site — Sites **42**, zdroj `652b7aa3b72cd932731e9b7d8ecbdd7f45947de5`, deployment `appgdep_6aef6d0003308191a0f62a0dd93ea044`, `succeeded`.

Změny jsou také ve zdrojové větvi GitHub `feat/swift-api-client-2026-11-06` (kód webu `4389e87`). Nativní klient SwiftUI má vlastní úpravu načítání identity v `f1fe523`; nová IPA zůstává blokovaná GitHub Billing & plans a její XCTest se nepovažují za spuštěné. Nasazení webu tuto blokaci nemá a samo nenainstaluje nový nativní balíček.

Omezení: Chromium emulace nenahrazuje fyzický Safari/iPhone ani dlouhodobý provoz všech zařízení. Nebylo prováděno přihlášení do soukromého provozního účtu, skutečné doručování APNs nebo externích integrací. Serverová bezpečnostní kontrola každého čtení a zápisu se záměrně zachovává.
