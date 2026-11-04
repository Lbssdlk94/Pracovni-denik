# Nativní SwiftUI – první etapa, 4. 11. 2026

Dokončený rozsah schválený uživatelem: nativní přehled, seznam zakázek a detail; ostatní části nadále přes web. Verze aplikace 0.2.0 (build 2), iOS 17 a novější.

## Co je nativní

- Přehled se stejnou ikonou a zelenou identitou, aktuální firma/obor, návštěvy a odkazy na ostatní části.
- Seznam s hledáním, dnem, stavem, vlastními zakázkami/celým týmem pro správce a stránkováním. Dostupnost Mého dne a Seznamu respektuje centrální moduly. Řazení přebírá server; nedokončené nejsou hotové.
- Detail se zákazníkem, konkrétní zahradou, zadáním, technikem, adresou, stavem, stavem protokolu a otevřenými závadami. Plánovaná práce, příjezdové rozmezí a původní neurčené časy jsou označené zvlášť; rozdíl původních časů se nepřevádí na délku práce.
- Systémová navigace, SwiftUI ovládací prvky a dynamická velikost textu.

## Co zůstává webové

Zákazníci, zahrady, docházka, ostatní moduly, protokoly, fotografie, změny stavu, výjezd s přesným příjezdem/SMS, úpravy a plánování. Nativní tlačítko otevře konkrétní zakázku v odpovídajícím původním formuláři. WebView, DOM, souborové vstupy, cookies, IndexedDB a synchronizační fronty zůstávají připojené; přepínání rozhraní neobnovuje stránku. Otevřený formulář je nutné uložit nebo zavřít před návratem do nativního přehledu.

## Data a bezpečnost

`web/native-client.js` poskytuje omezené čtení přes přihlášený `cloud.js` a vybrané stávající UI akce. Serverové API, DB, schéma a role se nemění. Do Swiftu se neposílají přístupové tokeny, aliasy účtů ani klíče obnovy. NativeStateRelay přijímá pouze známé signály z hlavního rámce známého deníku a konkrétní hlavní instance WKWebView.

Nativní modely se neukládají na disk. Změna oprávnění/oboru, odhlášení, zamrznutí přístupu a offline přechod zneplatňují nativní obsah. Pozdní odpovědi starého kontextu se zahazují. Při návratu do popředí a po 60 sekundách aktivního nativního používání se přístup znovu ověřuje. Během neaktivní aplikace je nativní obsah zakrytý.

Offline zápisy používají původní webovou část. Nativní přehled zakázek nyní vyžaduje internet; nevzniká druhá databáze ani jiná fronta zápisů.

## Ověření

- **287/287** stávajících jednotkových testů webu.
- Úspěšný webový integrační test v reálném lokálním Worker/D1/R2 pro společný zdroj i Dr. Garden: role, přiřazení, oddělení oborů, přímá zakázka druhého oboru odmítnuta, nedostupné moduly, omezení navigace, ochrana formuláře, zrušení bez zápisu, zneplatnění při offline a snížení oprávnění. Snížení modulů se kontroluje přes okamžitý signál invalidace i při výměně dokumentu, nikoli čekáním na odpověď již opuštěné stránky.
- Stávající UI prošlo při šířkách 390/430/1280/1440 a uchování formulářů/souborů při 360/390/430/1440.
- [GitHub Actions 41781307431](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/41781307431), zdrojový commit aplikace `0db8407d8e5188dcadd151d4b74257ae5e265dc5`: **11 unit + 5 UI testů = 16 úspěšných**, 0 chyb. SwiftUI přehled/seznam/detail, stránkování a návrat z rozepsaného webového formuláře prošly na iOS simulátoru. Předchozí běh identifikoval nesprávnou variantu volání WebKit API; opraveno na aktuální async API, znovu sestaveno.
- Release sestavení pro zařízení, skutečný `.app` balíček ověřen na binární soubor, ikonu, privacy manifest a přesné povolené domény.
- Stažen skutečný artefakt `13299028789`. Ověřen obsah IPA a SHA-256: `f06a1764ea2c68f5521e649ff1b04fd7079a9509fe5f78f6aa5b853bbd34e0c7` (292 969 bajtů). Z xcresult vytaženy dva původní PNG snímky skutečných SwiftUI obrazovek na simulátoru; ukázková data, snímky nebyly graficky upravovány.

## Nasazení

- Dr. Závlaha **109**, source commit `033fd63fedbf7dd4325d981f22954daf230f1b2b`, deployment `appgdep_6aeac901e0ec8191890e80e48e8b2c1e`: succeeded.
- Dr. Garden **30**, source commit `dcc6766178c27ebd794f503ba9c73c6fe85ffd4b`, deployment `appgdep_6aeac91c7e5481918bd579df626a5d2f`: succeeded.
- Publikum, provozní data, přihlašovací role, backendové části a migrace zachované. Webové propojení se aktivuje jen při přítomnosti známého nativního WebKit handleru; původní prohlížeče a předchozí IPA si zachovávají vlastní rozhraní.

IPA zůstává nepodepsaná. Pro instalaci použijte vlastní podepsání jako u Scanneru; existující aplikaci s neodeslanou prací nemažte. Fyzický iPhone, poskytovatel ChatGPT přihlášení v zabudovaném prohlížeči, fotoaparát/GPS, skutečný offline provoz na telefonu a distribuce TestFlight/App Store nejsou ověřené. Nativní APNs/push při zavřené aplikaci nejsou implementované.

Podrobnosti instalace: [apps/iphone/README.md](../apps/iphone/README.md).
