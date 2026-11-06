# Pracovní deník pro iPhone a Apple Watch

Verze **0.8.0 (9)** nahrazuje skrytý webový engine samostatným klientem SwiftUI. Telefon používá `URLSession` a současné REST API. Formuláře, validace, PDF, místní koncepty a synchronizační fronta jsou implementované ve Swiftu. Watch zůstává ve SwiftUI a komunikuje s telefonem přes WatchConnectivity. Server a společná databáze se nepřepisují do Swiftu.

**Stav vydání:** poslední úspěšné sestavení je commit `f82cf005e89faade44f29ee4f2b5e38aafcbb7f0`, [běh 42264874748](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/42264874748): 36 jednotkových + 7 UI testů, iPhone IPA, vložená Watch aplikace a oba simulátory. Poslední doplnění v `cf32f54` a `e8bd416` zatím Xcode neověřil. GitHub odmítl spustit [běh 42267712850](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/42267712850) kvůli platbám / limitu útraty účtu. PR #4 zůstává rozpracovaný; toto není oznámení hotového finálního vydání.

[Architektura, funkce, přechod, testy a omezení](../../docs/IPHONE-NATIVE-API-2026-11-06.md).

## Sestavení

Xcode 26+ (ověřeno Xcode 27.1 / SDK 27.1), XcodeGen 2.44.1. Minimální iOS 17, watchOS 10.

```sh
cd apps/iphone
xcodegen generate
xcodebuild -project PracovniDenik.xcodeproj -scheme PracovniDenik -destination 'generic/platform=iOS' build CODE_SIGNING_ALLOWED=NO
```

GitHub **Actions → iPhone and Apple Watch build and IPA** spouští testy, kontroluje skutečný device bundle a připravuje artefakt `PracovniDenik-builds-and-logs-UNSIGNED`. Kontrola odmítne přibalené `.js`, `.html`, `.htm`, `WKAppBoundDomains` i přímé linkování WebKitu. Starší soubory s webovým adaptérem zůstávají ve zdrojové historii kvůli návratu k 0.7, ale nejsou součástí targetu 0.8 ani IPA.

IPA je nepodepsané a vyžaduje vlastní podpis a instalaci. Přihlašovací údaje Apple, certifikáty a privátní klíče nepatří do chatu ani repozitáře. TestFlight/App Store nejsou publikované. Podepisovací workflow zůstává připravené pro bezpečně uložené GitHub Secrets a správné profily telefonu i hodinek.

## Přechod z 0.7

1. V dosavadní aplikaci nejdříve synchronizujte všechny neodeslané změny a uložte rozpracované formuláře.
2. Ověřte funkční firemní přihlašovací jméno a heslo. Odkazy a přihlášení účtem třetí strany nový klient nepoužívá. Zapomenuté heslo obnovuje administrátor.
3. Aktualizujte pod stejným bundle ID a stejnou podepisovací identitou, **bez odinstalace a mazání dat**. Přihlaste se znovu.

Původní WebKit/IndexedDB soubory se nemažou. Klient 0.8 je ale bez spuštění starého enginu bezpečně nepřečte; automatický převod staré neodeslané fronty není implementovaný. Neinstalujte aktualizaci přes neodeslanou práci. Nový šifrovaný vault je oddělený podle instalace, účtu a oprávnění.

Fyzický iPhone/Watch, doručování APNs, skutečná Google autorizace, doručení e-mailu a obnova provozní zálohy zatím nebyly ověřeny. Výsledky simulátorů ani izolovaných testů tyto zkoušky nenahrazují.
