# SwiftUI: pět záložek a rozklikávací obrazovky (0.7.0 / 8)

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

Připravené, ale **nespuštěné** nové Swift/XCTest kontroly:

- Typování kompaktních řádků a místních kategorií, kompatibilita starého kontraktu a rozlišení detailu od modálního formuláře.
- Pět záložek v zákaznickém detailu, přepnutí na docházku, kompaktní seznam zahrad a uzavřené podrobnosti, zachování rozepsaného formuláře při pokusu o změnu záložky.
- Screenshot attachments pro nové seznamy a detail vzniknou až při úspěšném běhu XCTest; starší snímky 0.6.0 nejsou důkazem tohoto rozložení.

## Zbývající blokace

GitHub Actions [běh 42081168803](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/42081168803) pro první implementační commit byl odmítnut před přidělením runneru (žádné kroky Xcode). Anotace GitHubu:

> The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings

Závěrečné změny se proto ukládají s `[skip ci]`, aby se opakovaně nespouštěl stejný zablokovaný běh. Po vyřešení účtování je nutné spustit workflow `iPhone and Apple Watch build and IPA` nad **aktuální hlavou této větve**, ověřit Swift kompilaci, XCTest a nové screenshoty. Následně vydat nové IPA se stejným bundle ID a vlastním podepsáním. V tuto chvíli **není nové IPA, ověřené nativní snímky ani ověření na fyzickém iPhonu**. Poslední úspěšně sestavené IPA zůstává 0.6.0; neobsahuje tyto úpravy ani rozpracované změny Watch z 0.6.1.

Provozní zákazníci, zahrady, zakázky, fotky, role a databáze se při testování neupravovaly.
