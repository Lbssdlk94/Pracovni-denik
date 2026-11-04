# Pracovní deník pro iPhone

Verze 0.2 má **nativní SwiftUI přehled, seznam zakázek a detail zakázky**. Používá schválené zelené barvy a ikonu. Seznam má hledání, den, stav, stránkování a pro správce volbu vlastních zakázek nebo týmu; respektuje povolení pohledů Můj den a Seznam. Detail rozlišuje plánovanou práci, příjezdové rozmezí a původní neurčený čas, zobrazuje stav protokolu a otevřené závady.

Zákazníci, zahrady, docházka, další moduly i pracovní formuláře zatím používají stávající web. Tlačítka **Jsem na cestě, Změnit stav, Servisní protokol, Fotodokumentace a Úplný detail** předají konkrétní zakázku původnímu webovému postupu. Upravování plánu, potvrzení převzetí, dokončení, materiál, PDF a SMS proto zachovávají současná pravidla a oprávnění. Nejde zatím o přepis všech formulářů do SwiftUI.

Datový most `web/native-client.js` čte přes současný přihlášený `cloud.js`; nepřenáší hesla, přístupové odkazy ani obnovovací klíče do Swiftu. WebView, cookies, IndexedDB i jeho neodeslané formuláře zůstávají během přepnutí připojené. Nativní část nevytváří druhou databázi ani druhou synchronizační frontu. Při odvolání přístupu, změně oboru nebo ztrátě spojení se nativní data zneplatní. Při návratu do popředí a každých 60 sekund aktivního nativního přehledu se přístup znovu ověřuje.

Nativní seznamy nyní vyžadují internet, stejně jako dosavadní plán zakázek. **Offline práci otevřete ve webové části**, která zachovává současné podporované ukládání. Přepnutí zpět do nativního přehledu se zablokuje, dokud uživatel neuloží nebo nezavře otevřený webový formulář; nedochází k tichému zahození práce.

Výchozí adresa je Dr. Závlaha. Důvěryhodné adresy jsou explicitně omezené na Dr. Závlahu a Dr. Garden (`Core/EndpointPolicy.swift` a `WKAppBoundDomains` v `project.yml`). Telefon, SMS, e-mail a externí navigace se otevírají systémově; externím stránkám se neposkytuje nativní přístup k údajům deníku. Zdrojové kódy ani IPA neobsahují servisní klíče či přístupové odkazy uživatelů.

## Sestavení bez Macu přes GitHub

1. Otevřete v repozitáři **Actions → iPhone build and IPA**. Push změn v `apps/iphone` spouští sestavení automaticky; po zařazení workflow do výchozí větve je dostupné i ruční **Run workflow**.
2. Vyčkejte na úspěšné testy simulátoru i sestavení zařízení.
3. V dokončeném běhu stáhněte artefakt **PracovniDenik-builds-and-logs-UNSIGNED**.
4. Rozbalte `PracovniDenik-UNSIGNED-REQUIRES-SIGNING.ipa`. Soubor `IPA-SHA256.txt` umožňuje ověřit jeho kontrolní součet.

Balíček je **nepodepsaný**, stejně jako výstup současného sestavení 3D Scanneru. Nelze jej přímo nainstalovat klepnutím v Safari. Použijte stejný vlastní nástroj pro podepsání a instalaci jako u Scanneru (například Sideloadly na vlastním počítači). Apple přihlášení zadávejte pouze přímo důvěryhodnému instalačnímu nástroji; hesla, certifikáty a privátní klíče neposílejte do chatu ani do GitHubu.

TestFlight a App Store vyžadují Apple Developer účet a další nastavení podepisování/distribuce. Tento workflow je nepředstírá a nikam aplikaci automaticky nevydává. Před předložením App Store je třeba posoudit i jeho pravidla minimální funkčnosti pro aplikace používající webové rozhraní.

Artefakty GitHubu se po 14 dnech smažou; IPA si stáhněte, případně spusťte nový běh. Pro vlastní vývoj: Xcode 26.0.1, XcodeGen 2.44.1, `cd apps/iphone && xcodegen generate`, otevřít vygenerovaný `PracovniDenik.xcodeproj`. Minimální verze iOS je 17.

## Přihlášení, rozpracovaná práce a offline režim

- Účet není automaticky přihlášený ze Safari. Aplikace má vlastní trvalé cookies a webové úložiště. Použijte existující přihlášení nebo vložte osobní přístupový odkaz do webového přihlašovacího formuláře. Novou pozvánku vystavuje oprávněný správce; nepoužívejte již spotřebovaný jednorázový odkaz.
- ChatGPT přihlášení se otevírá odděleně se stejným úložištěm cookies. Jeho funkčnost v zabudovaném prohlížeči závisí na poskytovateli přihlášení a musí se ověřit na skutečném telefonu. Není součástí izolovaných testů.
- Při návratu z pozadí či krátké ztrátě sítě se `WKWebView` nevytváří znovu ani automaticky neobnovuje. Rozpracovaný formulář zůstává v téže stránce.
- Při ukončení webového procesu systémem iOS se nabídne výslovné obnovení. Zachovat lze jen práci, kterou web již uložil do svého úložiště/fronty; nelze zaručit obnovu neuložené paměti procesu, souborového vstupu nebo zápisu odmítnutého kvótou zařízení.
- Offline data a fronta patří do existujícího webového mechanismu. Nativní aplikace nevytváří druhou databázi ani druhou synchronizaci. Pro offline otevření je nejprve nutné online přihlášení a úspěšné naplnění webové cache. Skutečný offline provoz v nainstalované aplikaci zatím není fyzicky ověřený.
- Neodinstalovávejte aplikaci a nemažte její data, dokud obsahuje neodeslanou práci. Data Safari a nativní aplikace se automaticky neslučují.

## Co testy ověřují a co ještě vyžaduje iPhone

11 unit testů kontroluje adresy, životní cyklus prohlížeče, plánované časy, skutečný stav protokolu a datový model. 5 UI testů v iOS simulátoru ověřuje původní uchování formuláře a náhled dokumentu i nový nativní přehled, seznam, detail, stránkování a bezpečný návrat z webového formuláře. Používají izolované testovací údaje. Samostatný integrační test mostu běží nad skutečným lokálním Worker/D1/R2 a ověřuje role, přiřazení, oddělení oborů, omezení modulů a zachování formulářů.

Před širší distribucí je třeba na fyzickém iPhonu ověřit přihlášení, návrat po dlouhém uspání, skutečný offline zápis a synchronizaci, fotoaparát/fotoknihovnu, GPS, export PDF a připravené SMS. Povolení fotoaparátu a polohy nejsou vyžadována při spuštění, ale až při použití příslušné webové funkce. Serverové kontroly a správa modulů zůstávají rozhodující.

Centrum oznámení v aplikaci se zachovává. **Nativní APNs ani push oznámení na zamčeném telefonu nejsou implementované**; webový push v `WKWebView` nelze automaticky považovat za podporovaný. Jeho doplnění vyžaduje samostatnou nativní integraci a podepsaný profil.

`PrivacyInfo.xcprivacy` popisuje uživatelské údaje deníku bez sledování; před veřejnou distribucí musí být zkontrolován spolu s aktuálními zásadami soukromí a skutečně zapnutými moduly.
