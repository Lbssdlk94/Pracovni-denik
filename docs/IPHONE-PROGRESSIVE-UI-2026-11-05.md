# SwiftUI: pět záložek a rozklikávací obrazovky (0.7.0 / 8)

**Aktuální stav: sestaveno a ověřeno.** [GitHub běh 42091853829](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/42091853829) úspěšně sestavil zdroj `fccb246efb22c87e81a152fceb620f9b5c28742c` v Xcode 27.1 / SDK 27.1. Prošlo 29 jednotkových a 10 UI testů. Vzniklo nové nepodepsané IPA včetně Watch 0.7.0 (8).

## Změny

- Nativní `TabView` má pořadí Přehled, Zakázky, Docházka, Zákazníci, Více. Vypnuté moduly se nezpřístupňují. Dosavadní engine zůstává připojený bez reloadu.
- Spodní navigace zůstává u seznamů, zahrad, zákaznických detailů a dalších běžných stránek. Editační formuláře a systémové výběry souborů si ponechávají samostatné modální okno.
- Zákaznický řádek ukazuje jméno, samostatné volání a otevření detailu. Kontakty, adresy, zahrady a předplatné jsou v rozbalovacích částech. Zákaznický detail je stránka uvnitř záložky, nikoli velké modální okno.
- Zahrady jsou bílé řádky se jménem, šipkou a malou známou vzdáleností z původního režimu Nejbližší. Vzdálenost je přibližná a vzdušnou čarou. Bez dostupné polohy se nevymýšlí číslo. Případné upřesnění polohy má vlastní malou akci.
- Adresa a kontakt zahrady, její dokumentace, historie, servis a technické údaje se otevírají jednotlivě. Tlačítko Zpět v zahradě volá původní návrat do seznamu zahrad.
- Více začíná uzavřenými kategoriemi Práce v terénu, Firemní agenda, Tým (podle oprávnění) a Nastavení. Nastavení firmy je rozdělené do uzavřených sekcí. Odhlášení je v nastavení účtu.
- Před změnou záložky se dokončí rozpracovaný přenos hodnot. Původní ochrana otevřených formulářů může přepnutí odmítnout. Čtení zákaznického detailu lze ukončit přepnutím záložky bez zahození formuláře.
- Přehled zachovává dosavadní grafiku; odstraněné je jen technické datum ISO pod obsahem.

## Architektura a kompatibilita

Viditelné ovládací prvky jsou SwiftUI. Původní skrytý `WKWebView` stále zajišťuje obchodní logiku, serverové role, licence, ověřování, koncepty a offline fronty. Nevzniká druhá databáze ani druhý zdroj pravdy. Nejde o úplný přepis backendu a doménové logiky do Swiftu.

`native-screens.js` přidává sémantické typy `destination`, `contact`, `category` a volitelné `presentation: page`. Používá existující identifikátory a neprůhledné živé handly. Obsah pro starší nativní renderer zůstává v `children`; webové obrazovky a data se nemění. Testovací kopie kontraktu v iPhone Resources je shodná s produkčním zdrojem.

## Ověření

Úspěšné lokální kontroly v izolovaném prostředí:

- 313 backendových regresních testů, bez chyb.
- 4 testy zásad podepisování a 13 testů přípravy simulátorů.
- Sestavení Workeru, validace artefaktu a kontrola syntaxe.
- `test-native-client-browser.mjs`: skutečné lokální Worker/D1/R2, oddělení oborů, přiřazení, modulové zákazy, zachování formuláře, zrušení bez zápisu, offline zneplatnění snapshotů.
- `test-native-screens-browser.mjs`: kompaktní řádky, stabilní ID, samostatné volání, zachované adresy v detailu, zákaznický detail jako stránka, rozbalovací nastavení a kontrakt při 360/390/430 CSS px. Skutečné uložení zákazníka s párovou zahradou, protokolu, podpisu, fotky, vytvoření PDF, značek a mapové polohy; offline uložení a následná synchronizace bez duplikace. Pracovník Garden u společné zahrady neobdrží šachty, vyfukování ani soukromé závlahářské poznámky.

Úspěšně spuštěné nové Swift/XCTest kontroly:

- Typování kompaktních řádků a místních kategorií, kompatibilita starého kontraktu a rozlišení detailu od modálního formuláře.
- Pět záložek v zákaznickém detailu, přepnutí na docházku, kompaktní seznam zahrad a uzavřené podrobnosti, zachování rozepsaného formuláře při pokusu o změnu záložky.
- XCTest vytvořil skutečné snímky kompaktních seznamů, detailu zahrady, přehledu, zakázek, protokolu a přesného příjezdu. Byly vizuálně zkontrolovány. Obrázky obsahují pouze oddělená testovací data.

## Sestavení a ověřené hranice

Dřívější odmítnutí GitHub Actions kvůli účtování je vyřešeno. Nový běh skončil `success`; Xcode kroky se skutečně provedly. Archiv artefaktu `13445709667` byl stažen a jeho SHA-256 porovnán s digestem z GitHub API. V IPA byla zkontrolována verze telefonu i hodinek, původní bundle ID, povolené domény a skutečně přibalená Watch aplikace.

IPA SHA-256: `cc1690c2be8e414080978b68b01a704b0e1db6baa2a4fa611e6dba02d1c1883d`.

GitHub artefakt se jmenuje `PracovniDenik-builds-and-logs-UNSIGNED` a má životnost 14 dní. K instalaci je potřeba vlastní podepsání stejně jako u dosavadních IPA. TestFlight / App Store nebyly publikovány.

Ověření proběhlo v izolovaném simulátoru iPhone a Watch. Nebyl dostupný fyzický iPhone/Watch, skutečné doručení APNs ani reálný telefonní hovor / odeslání SMS. Přehled a seznamy byly zkontrolovány vizuálně, nové položky More/Settings byly průchozí v UI testech; jejich samostatné snímky tento běh nepořizoval. Kontroly CSS šířek 360/390/430 z předchozí části ověřují datový adaptér v prohlížeči, nikoli plnou nativní matici zařízení.

V testu prvního otevření klávesnice se objevilo jedno diagnostické varování `Invalid frame dimension (negative or non-finite)`. Test psaní a zachování formuláře prošel; příslušný snímek neukázal oříznuté ani ztracené pole. Příčina varování není potvrzená a chování klávesnice na fyzickém zařízení zůstává k ověření. Další dvě varování sestavení pouze oznamují absenci AppIntents; tento modul aplikace nepoužívá.

## Skutečné snímky nové verze

- [Zákazníci](previews/iphone-0.7/zakaznici.png)
- [Zahrady](previews/iphone-0.7/zahrady.png)
- [Rozklikávací detail zahrady](previews/iphone-0.7/detail-zahrady.png)
- [Skutečně vykreslený detail na Watch](previews/iphone-0.7/watch-detail.png)

Provozní zákazníci, zahrady, zakázky, fotky, role a databáze se při testování neupravovaly.

## Publikovaný společný kontrakt

Kompatibilní prezentační adaptér byl úspěšně nasazen bez změn databáze:

- Dr. Závlaha: https://zavlahovy-denik.purplecedar.chatgpt.site — verze Sites 120, zdroj `f896082efc4b9674384ee7d7c34607ef0e9f40f4`.
- Dr. Garden: https://dr-garden.purplecedar.chatgpt.site — verze Sites 41, zdroj `7505fc72705d80e34dae621f9aa5cc5987093ac2`.

Obě publikace vrátily `succeeded`. Je to podklad pro nové SwiftUI obrazovky; stávající nainstalované IPA se tím nepřepíše. Nativní zdroje a ověření jsou v [PR #2](https://github.com/Lbssdlk94/Pracovni-denik/pull/2).
