# Pracovní deník pro iPhone a Apple Watch

Vydání **0.8.4 (13)** zahrnuje všechny dokončené změny větve `ui/ios-attendance-integration-2026-11-20`: nové dashboardy, kompaktní detail a přehled zakázek, bublinová tlačítka a propojenou osobní/týmovou docházku. [Rozsah a stav balíčku](../../docs/IPHONE-0.8.4-2026-11-20.md).

Nativní základ **0.8.0 (9)** nahrazuje skrytý webový engine samostatným klientem SwiftUI. Telefon používá `URLSession` a současné REST API. Formuláře, validace, PDF, místní koncepty a synchronizační fronta jsou implementované ve Swiftu. Watch zůstává ve SwiftUI a komunikuje s telefonem přes WatchConnectivity. Server a společná databáze se nepřepisují do Swiftu.

Připravená aktualizace **0.8.1 (10)** sjednocuje postupové tlačítko zakázky, hlavní akce nad spodní navigací, nahrávání do úložiště aplikace bez Disku, miniatury, kompresi fotografií a mazání denních zápisů vlastníkem/administrátorem. [Změny a skutečný stav ověření](../../docs/IPHONE-FIELD-UPDATE-2026-11-18.md). Sestavení Xcode a testy prošly; dostupná IPA vyžaduje vlastní podpis.

Aktualizace **0.8.2 (11)** umožňuje vyplňovat deník realizace všem rolím včetně čtenáře u dostupné zakázky. Čtenář může přidat povinnou fotografii deníku a upravit vlastní zápis, nezískává správu zakázky ani protokolu. Mazání zůstává výhradně vlastníkovi a administrátorovi. [Rozsah, nasazení webu a ověření](../../docs/DIARY-ROLES-2026-11-19.md).

Role a moduly klient načítá při novém spuštění procesu a po výslovném přihlášení, změně firmy, oboru nebo hesla. Návrat z pozadí, obnovení pracovních dat, Apple Watch, uložení ani odeslání fronty už nepřidávají požadavek `/api/me`. Každý skutečný požadavek nadále autorizuje server. Chyba připojení nesmaže koncepty; odpověď 401 ukončí neplatnou relaci a ponechá neodeslanou práci zabezpečenou. [Změna a regresní testy](../../docs/IPHONE-SESSION-STARTUP-2026-11-07.md).

**Stav vydání:** **0.8.4 (13)** úspěšně sestavena ze zdroje `795d55d603078b0071e81db96db7cc730d84baca`, [běh 44733769829](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44733769829). Prošlo 123 unit + 46 UI testů, release device build, kontrola nativního bundle a vložené Watch aplikace i její simulátor. [Stáhnout IPA, logy a snímky](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44733769829/artifacts/14628686740) (do 4. 12. 2026). IPA vyžaduje vlastní podpis; fyzická zařízení a publikace do TestFlight/App Store nejsou tímto během ověřené. [Obsah, kontrolní součty a závislost nové docházky na serveru](../../docs/IPHONE-0.8.4-2026-11-20.md).

Rozšíření [uloženého adresáře zákazníků a zahrad](../../docs/OFFLINE-DIRECTORY-2026-11-19.md) doplňuje přednačtení, lokální hledání a základní detaily ve stávajícím šifrovaném vaultu. Je součástí vydání 0.8.3 i 0.8.4 a jejich ověřených sestavení Xcode.

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
