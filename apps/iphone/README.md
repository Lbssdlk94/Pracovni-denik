# Pracovní deník pro iPhone

Ve zdrojích je nově **0.7.0 (8)**: pět záložek, kompaktní zákazníci a zahrady, rozklikávací Více a nastavení. Viditelné rozhraní je SwiftUI. Implementace i ověřené hranice: [Progresivní UI 0.7](../../docs/IPHONE-PROGRESSIVE-UI-2026-11-05.md). **Nové IPA zatím nevzniklo:** GitHub odmítl sestavení před spuštěním runneru kvůli účtování / limitu útraty. Nové Swift a UI testy se musí spustit po odblokování Actions.

Poslední ověřené sestavení **0.6.0 (6)** přepracovává zakázky, detail, menu i navazující formuláře ve SwiftUI, přidává nativní okna, systémový vzhled iOS 27 / Liquid Glass a tmavý režim. Prošly všechny testy iPhone, sestavení iPhone/Watch a spuštění hodinek. Stav ověření: [iOS UI 0.6](../../docs/IOS-UI-0.6-2026-11-05.md).

Ve zdrojích je připravená **0.6.1 (7)** se sjednocenou navigací hodinek a návštěvami hned nahoře. Její sestavení **není ověřené**: GitHub běhy 41988885874 a 41989006987 odmítl před spuštěním runneru kvůli problému s platbou nebo limitem útraty účtu. Po odblokování GitHub Actions je potřeba tento kód sestavit a zkontrolovat, teprve pak vydat nové IPA.

Verze 0.5 přidává doprovodnou aplikaci pro Apple Watch (watchOS 10+) s dnešními přidělenými zakázkami, převzetím, přesným příjezdem a změnami stavu. Podrobnosti, instalace a ověřené hranice jsou v `docs/APPLE-WATCH-2026-11-04.md`. Verze 0.4 přidala podporu APNs a navazuje na převod rozhraní ve verzi 0.3. Ten rozšiřuje SwiftUI z přehledu, zakázek a detailu také na zbývající povolené firemní sekce: zákazníky, zahrady, historii, závady, protokoly, materiál, předplatné, docházku, vozidla, tým, nastavení a centrum oznámení. Formuláře, výběry, karty, rozbalovací části, podpis, fotografie s přesouváním značek, MapKit a náhled dokumentů používají nativní ovládací prvky. Zachovává zelenou identitu a názvy jednotlivých firem.

## Co je ve Swiftu a co zůstává společné

**Jde o převod uživatelského rozhraní, nikoli úplný přepis veškerého kódu do Swiftu.** Přehled a zakázky používají typované datové modely. Další obrazovky získávají typovaný popis právě dostupných ovládacích prvků z nového `web/native-screens.js` a vykreslují je ve SwiftUI. Nezobrazují HTML firemní aplikace.

Dosavadní JavaScriptová doménová logika, validace, verzování, koncepty a offline fronty pokračují v připojeném, vizuálně skrytém `WKWebView`. Nativní změny se předávají původním handlerům přes neprůhledné identifikátory živých prvků. To zachovává stejné API, kontroly rolí a oborů, licence, potvrzování, výpočty, oprávnění i konflikty. Backend zůstává současný. Nová část nezakládá druhou databázi ani synchronizační frontu.

Nejprve se odešlou všechny rozepsané nativní hodnoty ve správném pořadí, teprve pak tlačítko Uložit. Při chybě hodnota zůstane rozepsaná a odeslání formuláře se zastaví. Čísla přijímají českou desetinnou čárku. Při přechodu do pozadí se provede pokus o uložení konceptů do původního úložiště. Obrazovky i soubory se při zneplatnění přístupu uzamknou; staré asynchronní odpovědi se odmítnou.

Fotografie vybírá systémový PhotosPicker / fotoaparát / Soubory. Přenos do společného enginu probíhá po částech; velké importy ze Souborů se ve Swiftu čtou průběžně. Původní formát a ověřování importu zůstávají rozhodující. Fotografie, podpis, značky a poloha se ukládají původním postupem. Výběr na MapKitu se předává existujícímu mapovému handleru. Nativní mapový podklad je Apple Maps.

PDF a další soubory se otevírají přes QuickLook a lze je sdílet systémovým panelem. Dočasné PDF se předává jako původní Blob, aby nebylo nutné oslabovat bezpečnostní politiku webu. Limit nativního náhledu je 32 MB, stahování má původní streamovací cestu přes WKDownload. Zavření náhledu odstraní jeho dočasnou kopii. Oprávnění ke zdrojovým souborům nadále ověřuje původní API.

## Sestavení přes GitHub

1. V repozitáři otevřete **Actions → iPhone and Apple Watch build and IPA**. Změny `apps/iphone` spouštějí sestavení automaticky. Ruční spuštění je dostupné po zařazení workflow do výchozí větve.
2. Po úspěšných testech simulátoru a sestavení zařízení včetně vložené Watch aplikace stáhněte artefakt **PracovniDenik-builds-and-logs-UNSIGNED**.
3. Rozbalte `PracovniDenik-UNSIGNED-REQUIRES-SIGNING.ipa`; kontrolní součet je v `IPA-SHA256.txt`.

Balíček je **nepodepsaný**. Nelze jej přímo nainstalovat klepnutím v Safari. Použijte vlastní nástroj pro podepsání a instalaci jako u 3D Scanneru, například Sideloadly. Apple přihlášení zadávejte pouze důvěryhodnému instalačnímu nástroji, neposílejte hesla, certifikáty ani privátní klíče do chatu či GitHubu. TestFlight / App Store vyžadují Apple Developer účet, podepisování a samostatné ověření distribučních požadavků; toto workflow do nich aplikaci nevydává. Artefakty GitHubu mají životnost 14 dní.

Pro vlastní vývoj: Xcode 27 (kompatibilní základ Xcode 26+), XcodeGen 2.44.1, `cd apps/iphone && xcodegen generate`. Minimální iOS je 17. Výchozí instalace je Dr. Závlaha; důvěryhodné domény Dr. Závlaha a Dr. Garden jsou explicitně uvedené v `EndpointPolicy.swift` a `WKAppBoundDomains`. Telefon, připravená SMS, e-mail a externí navigace se otevírají systémově.

## Přihlášení, offline a známé meze

- Aplikace má vlastní trvalé cookies a úložiště, není automaticky přihlášená ze Safari. Přihlášení používá firemní jméno a heslo; osobní přístupové odkazy jsou na serveru vypnuté. Přihlášení poskytovatele ChatGPT zůstává v odděleném přihlašovacím okně; nejde o firemní obrazovku převedenou do SwiftUI.
- Návrat z pozadí ani přepnutí nativní sekce neobnovuje hlavní stránku. Při pádu webového procesu se nabídne výslovné obnovení. Zachovat lze jen již uložené koncepty / fronty; neuloženou paměť zaniklého procesu nelze zaručit.
- Offline zápisy používají původní podporované workflow. Pro offline spuštění je nejdřív nutné online přihlášení a naplnění cache. Typovaný nativní přehled/seznam vyžaduje ověřené připojení; při jeho ztrátě se použijí dostupné původní pracovní obrazovky vykreslené nativně. Nedochází ke slibu, že všechny původně online funkce nově fungují offline.
- Neodinstalovávejte aplikaci ani nemažte její data, dokud obsahuje neodeslanou práci. Úložiště Safari a aplikace se automaticky neslučují.
- Centrum oznámení je dostupné. **Podpora nativního APNs je implementovaná, ale doručování zatím čeká na skutečnou Apple konfiguraci a podepsanou aplikaci.** Podrobné kroky a ověřené hranice jsou v `docs/IPHONE-PUSH-2026-11-04.md`. Webový push ve WKWebView není náhradou APNs.
- Nativní rozhraní je navázané na kompatibilní verzi webového kontraktu. Úpravy jeho DOM struktur je potřeba ověřovat integračními testy. Nejde o nezávislého klienta, který by fungoval bez společného enginu.
- Na fyzickém iPhonu zbývá ověřit skutečné přihlášení poskytovatele, fotoaparát/fotoknihovnu, GPS, dlouhé uspání a offline spuštění, velké importy, systémové sdílení a SMS. Simulátor tyto zkoušky nenahrazuje.

## Ověření

Apple CI sestavuje projekt pro simulátor i zařízení a spouští unit a UI testy. Izolované fixture testy ověřují nativní přehled, seznam, detail, stránkování a nativní formulář bez ztráty textu; původní testy prohlížečového enginu kontrolují zachování stránky po uspání a otevření dokumentu. Nejde o testování přihlášení do provozního účtu.

`apps/work-diary/scripts/test-native-screens-browser.mjs` používá skutečný lokální Worker, SQLite/D1 a R2 s umělými uživateli a daty. Prochází 10 modulů a ověřuje uložení zákazníka s propojenou zahradou, protokolu, podpisu, fotografie, skutečného PDF, přesunutých značek a polohy, následný offline zápis a synchronizaci bez duplikace. `test-native-client-browser.mjs` kontroluje oddělení oborů, přiřazení, role, omezení modulů a nepovolené navigace. Testy neprovádějí zápisy do provozních databází.

Podrobné výsledky vydání jsou v `docs/IPHONE-NATIVE-ALL-2026-11-04.md`. `PrivacyInfo.xcprivacy` je nutné před veřejnou distribucí zkontrolovat spolu se skutečnými zásadami soukromí.
