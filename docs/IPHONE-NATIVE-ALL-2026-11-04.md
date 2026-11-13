# iPhone 0.3.0 (3) – nativní rozhraní všech firemních modulů

Datum: 4. 11. 2026. Větev `feat/iphone-native-all-2026-11-04`.
Ověřený aplikační commit: `b4955c487cd5a92d7296fbbd15672f759efc93ed`.

## Rozsah a architektura

SwiftUI nyní vykresluje i zbývající pracovní sekce a formuláře: zákazníky, zahrady, historii a závady, protokoly, materiál, předplatné, docházku, vozidla, tým, nastavení a oznámení. Podpis, výběr souborů/fotek, značky na snímcích, mapa a náhled PDF mají nativní ovládání. Stávající typovaný přehled, seznam a detail zakázky zůstávají.

**Není to úplný přepis veškeré aplikační logiky do Swiftu.** Nativní renderer čte typovaný kontrakt dostupných ovládacích prvků, původní doménové handlery, offline fronty a koncepty běží ve vizuálně skrytém trvalém WebKitu. Původní server a jeho oprávnění zůstávají rozhodující. HTML pracovní aplikace se v běžném režimu nezobrazuje, autentizace poskytovatele zůstává odděleným webovým přihlášením. Samotný Super Admin není součástí tohoto iPhone klienta.

Tato kompatibilita zachovává jeden zdroj obchodních pravidel a jednu synchronizační frontu. Nativní přehled/seznam dál vyžaduje ověřené připojení; podporované offline zápisy se provádějí společným enginem přes nativně vykreslené formuláře. Není zaveden nový lokální databázový model ani migrace provozních záznamů.

## Změněné části

- `apps/iphone/App/NativeForms.swift`: nativní formuláře, výběry, heslová pole, měsíce, datum/čas, sekce, klávesnice a stabilní přístupnost.
- `NativeMedia.swift`, `NativeSurfaces.swift`: PhotosPicker, kamera, Soubory, přenos po částech, QuickLook/sdílení, podpis, popisky a spojnice fotografií, přesouvání značek, MapKit se značkami a trasami.
- `Core/NativeScreenModels.swift`, `NativeScreenStore.swift`, `NativeEditQueue.swift`: typovaný kontrakt, pořadí editací, zadržení neodeslaných hodnot při chybě, odeslání před submitterem, zneplatnění odpovědí, omezená životnost náhledů a obrazové cache.
- `BrowserSession.swift`, `NativeBridge.swift`, `HybridDiaryScreen.swift`, `PracovniDenikApp.swift`: jeden zachovaný engine, přímý odběr změn do SwiftUI, skrytí HTML pro dotyk/přístupnost, ochrana při pozadí a viditelné obnovení po selhání procesu. Žádné automatické obnovení otevřeného formuláře.
- `Resources/NativeScreensFixture.js`, `NativeFixture.js`, unit/UI testy a `project.yml`: izolované testy a verze 0.3.0 (3).
- `apps/work-diary/web/native-screens.js`, `native-client.js`, `app.js`, `index.html`, `sw.js`: kontrakt pouze pro nativního klienta. Normální prohlížeč dál používá současné UI.
- V obou nasazovaných firemních checkoutech byly sjednoceny chybějící klientské části existujícího podpisu zákazníka z GitHubu (`service-work-ui.js`, `service-protocol-pdf.js`, `live-protocol-preview.js`). Backend a databáze podpis již podporovaly; nedošlo ke změně schématu.
- `scripts/test-native-screens-browser.mjs`: skutečné uložení a synchronizace nad odděleným Worker/D1/R2.

## Úspěšné kontroly

GitHub Actions [41795992677](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/41795992677): **13 unit + 5 UI testů bez chyby**, úspěšné sestavení pro simulátor i zařízení. Xcode 26.0.1, XcodeGen 2.44.1, minimální iOS 17. Testy potvrzují nativní přehled/seznam/detail, stránkování, zachování formuláře i nativního textu a uchování enginu při uspání a dokumentu. Testovací formulář je izolovaná fixture, nikoli záznam skutečného zákazníka.

**287 regresních unit testů** společné aplikace prošlo. Worker artefakty pro obě firmy úspěšně validované včetně autentizace a odmítnutí anonymního přístupu.

Integrační test nativního kontraktu prošel ve společném zdroji a v obou skutečných firemních variantách, vždy nad lokálními testovacími SQLite/D1/R2:

1. Deset povolených modulů vrací nativní ovládací prvky.
2. Česká desetinná čárka se správně předá číselnému vstupu.
3. Uložení zákazníka založí právě jednu propojenou zahradu.
4. Protokol se skutečně uloží s textem, podpisem a jednou fotografií, bez automatického dokončení zakázky.
5. PDF obsahuje skutečná PDF data a lze je předat náhledu i při nezměněné bezpečnostní politice.
6. Přidaná a přesunutá značka fotografie i vybraná poloha se skutečně uloží do šachty.
7. Offline upravený protokol se po připojení automaticky synchronizuje; zůstává jeden protokol a jedna fotografie.
8. Samostatný test mostu ověřil přiřazení pracovníků, oddělení oborů, zákaz cizí zakázky a katalogu, omezené moduly, zákaz nepovolené navigace, zachování otevřeného formuláře a zavření bez zápisu.
9. Běžné webové UI prošlo izolovanou kontrolou na 390/430/1280/1440 px: oddělení oborů, zákazník se dvěma zahradami, adresy, žádné vodorovné přetékání a zrušení zakázky bez vytvoření záznamu.

Testy nezapisovaly do provozních databází ani nepotvrzovaly převzetí za skutečné pracovníky.

## Distribuční artefakt

GitHub artefakt: `13305761790`, `PracovniDenik-builds-and-logs-UNSIGNED`.

`PracovniDenik-UNSIGNED-REQUIRES-SIGNING.ipa`, 535 174 bytů.
SHA256: `4e37ab7be18b42ee26c2569a96d163c61cdb0011c8f7974b5caee87bc24ab005`.
Kontrolní součet souhlasí s `IPA-SHA256.txt`. Ověřen executable, `Assets.car`, `PrivacyInfo.xcprivacy`, název Pracovní deník a verze 0.3.0 (3).

Balíček není podepsaný a není vydaný v TestFlightu/App Store. Před instalací je nutné vlastní podepsání stejným postupem jako u 3D Scanneru. Přístupové klíče ani certifikáty se do IPA nevkládaly. GitHub artefakt vyprší 18. 11. 2026.

Skutečné screenshoty testů simulátoru jsou předané jako `prehled-swiftui.png`, `detail-swiftui.png` a `formular-swiftui-test.png`. Poslední používá záměrně jednoduchou testovací fixture, ne skutečnou obrazovku zákazníka.

## Nasazení kompatibilního webového kontraktu

- Dr. Závlaha: verze **110**, commit `163099e9ec04803ca615f5bf0eee9fd370d5ff96`, deployment `appgdep_6aeb05e523948191ab3a1b250c4f53fe`, **succeeded**, https://zavlahovy-denik.purplecedar.chatgpt.site.
- Dr. Garden: verze **31**, commit `8621c4e55c159f6d36d59fa4426c05c5ba5d2a07`, deployment `appgdep_6aeb05fdeb5c81919b30f55ec5444e8b`, **succeeded**, https://dr-garden.purplecedar.chatgpt.site.

Zachováno veřejné publikum Dr. Závlahy, omezené publikum Garden a prostředí/secrety obou instalací. Databázové migrace ani změny provozních záznamů se neprováděly. Původní nativní kontrakt 0.2 zůstává kompatibilní.

## Co není fyzicky ověřené / omezení

Skutečný iPhone nebyl dostupný. Zbývá ověřit přihlášení poskytovatele, výběr z reálné fotoknihovny a fotoaparátu, systémová GPS oprávnění, velké importy, dlouhé uspání, offline spuštění na zařízení, sdílení PDF a SMS. Backendové scénáře z testu kontraktu nejsou totéž jako provedení každé akce přímo na fyzickém telefonu.

Nativní APNs nejsou implementované; centrum oznámení ano. Limit náhledu je 32 MB, větší soubor lze stáhnout původní cestou. Importy dál podléhají původním limitům a paměti WebKitu/zařízení. Úplnou obnovu neuložené paměti při násilném ukončení procesu nelze zaručit. Kontrakt je závislý na kompatibilní webové verzi; nejde o zcela nezávislý přepis doménové logiky do Swiftu. Pravidla distribučního obchodu je nutné posoudit před veřejným vydáním.
