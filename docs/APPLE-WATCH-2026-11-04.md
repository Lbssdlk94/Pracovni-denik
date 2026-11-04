# Pracovní deník pro Apple Watch — 0.5.0 (build 5)

Doprovodná aplikace ve SwiftUI, minimálně watchOS 10, k existující aplikaci pro
iPhone (iOS 17+). Jeden společný backend, stejné účty, role, obory, licence,
přiřazení a podniková data. Nejde o samostatný klient s vlastním heslem nebo
samostatným serverem. Pro aktuální data a změny musí komunikovat s iPhonem,
který je přihlášený a připojený. Při nedostupném enginu požádá o otevření iPhonu.

## Co lze použít

- Dnešní zakázky přiřazené přihlášenému kolegovi (i správci jen jeho vlastní).
  Řazení přebírá existující Můj den: probíhající, aktivní, nedokončené, hotové.
- Zákazník, práce, zahrada/adresa, stav, druh a obor, plán práce a příjezdové
  rozmezí odděleně. Původní neurčitý čas se nemění na délku práce.
- Převzetí zakázky výhradně za přihlášeného přiřazeného kolegu.
- „Jsem na cestě“ s výběrem přesné hodiny a minuty příjezdu, datum dnešní
  návštěvy a časová zóna Europe/Prague. Přednastavení lze upravit; žádné „za X minut“.
- Zahájení práce a výslovně potvrzené dokončení běžné zakázky. Žádná automatická
  optimistická změna na hodinkách. U služby vyžadující protokol je nabídka
  „Dokončit na iPhonu“, bez odečtu předplatného nebo obcházení protokolu.
- Po odjezdu tlačítko na iPhonu otevře stávající připravenou SMS. Telefon ji
  automaticky neodesílá; kolega zkontroluje a potvrdí odeslání ve Zprávách.
- Posledních deset dostupných upozornění a počet nepřečtených. Čtení na hodinkách
  neoznačuje automaticky celé centrum za přečtené.
- Odkaz do Apple Map využívá úplnou uloženou adresu.
- iPhone → Více → Apple Watch: stav spárování, instalace, dostupnosti, poslední
  spojení a vysvětlení oznámení. Je-li na telefonu rozepsaný formulář, hodinky
  jej nepřepíší a akci odmítnou, dokud jej uživatel neuloží nebo nezavře.

Systémové notifikace mohou být zrcadlené z iPhonu standardním chováním watchOS.
**Samotná tato změna nezprovozňuje chybějící Apple APNs klíče ani podpis aplikace.**
Doručení skutečného push na fyzické hodinky vyžaduje dokončenou konfiguraci
APNs a volbu zrcadlení oznámení v systémové aplikaci Watch. Nemáme ověřené
fyzické doručení a aplikace nepředstírá samostatný watchOS push server.

## Propojení a ochrana dat

WatchConnectivity → iPhone → povolený příkaz `watch` ve stávajícím nativním
kontraktu → ověřený `cloud.js` → původní serverové API. Watch nikdy neposílá
vlastní userId, roli, URL ani libovolné API požadavky. Před každým novým
načtením a akcí se ověří relace na serveru. Backend nadále kontroluje obory,
přiřazení, role i licence. Do hodinek nejdou ceny, kontaktní seznam, protokoly,
soukromé poznámky zahrady, fotografie, přihlašovací cookies ani hesla.

Snapshot obsahuje SHA-256 vazbu na aktuální účet/oprávnění/pohled, datum a verzi
zakázky. Pro akce platí čerstvost 120 sekund a původní CAS verze zakázky.
Přesouvání či změna zadání kolegou vyžaduje obnovení a nové potvrzení; akce se
nikdy automaticky neopakuje s nově načtenou verzí. Potvrzovací dialog Hotovo
uchovává verzi návštěvy z okamžiku jeho otevření.

Přehled je jen v paměti. Po odhlášení, změně přístupu, ztrátě spojení a přechodu
hodinek do pozadí se skryje/odstraní; starší přehled se přestane zobrazovat.
Žádné ukládání firemního snapshotu do WatchConnectivity application context,
UserDefaults, souboru nebo cloudového zálohování. Background kontext obsahuje
jen nesenzitivní výzvu k ověření přístupu. Nepřidává se offline fronta zápisů.
Při timeoutu se ukáže nejistý výsledek a výzva k obnovení, nikoli falešné Hotovo.

Převzetí používá původní serverový operationId. Rychlé změny stavů používají
původní CAS. iPhone navíc drží nejvýše 32 potvrzení požadavků v paměti, po
změně identity je smaže; opakovaná odpověď neobsahuje starý business snapshot.
Po restartu zůstává rozhodující serverová verze a explicitní obnovení, nikoli
slib absolutního exactly-once doručení přes Bluetooth.

## Sestavení a instalace

`apps/iphone/project.yml` generuje moderní jeden watchOS cíl s vloženým
`PracovniDenikWatch.app` v iPhone aplikaci. Identifikátory:

- iPhone `cz.pracovnidenik.app`
- Apple Watch `cz.pracovnidenik.app.watchapp`

Workflow **iPhone and Apple Watch build and IPA** sestavuje iPhone simulátor,
spouští XCTest, sestavuje zařízení, ověřuje vloženou watchOS binárku, ikonu,
privacy manifest a shodná čísla verzí. Dále sestavuje watchOS simulátor a
po spárování pouze testovacích simulátorů pořizuje náhled dne, detailu a inboxu.
Náhledy používají výhradně vložená ukázková data, ne produkční přihlášení.

Podepsané sestavení používá dosavadní secrets a nově
`APPLE_WATCH_PROFILE_BASE64`. Oba profily musí patřit stejné Apple Team,
přesným bundle ID a stejné distribuční metodě; profil iPhonu musí mít APNs.
Žádný podpisový klíč nebo Apple heslo se nevkládá do zdrojů či chatu. Secrets
se nastavují v GitHub Settings → Secrets and variables → Actions.

Nepodepsaný IPA nelze nainstalovat přímo z odkazu. Instalace hodinek/TestFlight
vyžaduje platné podepsání **obou** částí. Při testovací instalaci se iPhone a
Watch párují běžně systémovou aplikací Watch; systém musí povolit instalaci
Pracovního deníku na hodinky. Nepřislíbili jsme automatické podepsání bez
certifikátu/profilů ani vydání do App Store.

## Soubory

- `WatchShared/WatchContract.swift`: minimální typovaný protokol a validace.
- `Core/WatchPhoneCoordinator.swift`: iPhone transport, ověření a replay.
- `WatchApp/`: nativní přehled, detail, výběr příjezdu, inbox, WCSession klient.
- `WatchResources/`: schválená ikona, privacy a ukázka pro simulátor.
- `App/WatchPhoneSettings.swift`, `HybridDiaryScreen.swift`: napojení do iPhonu.
- `web/watch-client.js`: ověřená projekce dat a úzký seznam operací přes API.
- `web/native-client.js`, `web/app.js`, `web/jobs-ui.js`: společný kontrakt a
  původní připravená SMS; normální webový klient neinstaluje WCSession bridge.
- `project.yml`, `.github/workflows/iphone.yml`, `verify_watch_bundle.py`,
  `select_watch_simulator.py`, `pair_watch_simulators.py` a podpisová pravidla.

## Provedené ověření

- **308** JS regresních kontrol prošlo, z toho osm nových watch testů proti
  skutečné izolované SQLite/API: přidělení/dnešní den, ořez dat, uložení
  stavu, staré verze, změna účtu, otevřený formulář, offline/stáří, převzetí,
  přesný odjezd, předání protokolu telefonu, vypnuté moduly a zrušené členství.
- Chromium + skutečný workerd/D1/R2: načtení přes nativní iPhone kontrakt,
  převzetí, uložení odjezdu/času, otevření původní SMS, zahájení, dokončení,
  trvání změny po obnovení a odmítnutý replay. Závada zůstala Čeká na díl,
  nevznikla další zakázka ani duplicitní převzetí. Totéž na sestavení obou firem.
- Původní test nativního bridge prošel: role, obory, omezené moduly, nepovolené
  navigace, rozpracovaný formulář a offline invalidace.
- Čtyři Python kontroly podpisových profilů prošly. Syntaxe, YAML a sestavený
  Worker ověřeny. Není potřeba databázová migrace.

### Zatím neověřené / čeká na Apple sestavení

Swift XCTest přidává kontrolu čerstvosti, oddělení časů, bezpečné adresy,
minimalizace dat, validace příjezdu, replay limitu, zákazu změny payloadu a
zahození odpovědi po změně identity. Jejich skutečný výsledek a kompilace budou
uvedeny podle GitHub Actions, nikoli odhadnuty z kontroly zdrojů.

Fyzické iPhone–Watch spojení, spolehlivost při uspání telefonu, instalace
podepsaného balíčku a zrcadlení skutečného APNs oznámení nejsou v tomto
linuxovém prostředí ověřené. Sestavení v simulátoru tyto testy nenahrazuje.

### Standardní Mac runner

Výchozí `macos-15` (Arm64) zůstával ve frontě bez přiděleného stroje. Workflow
nyní používá standardní `macos-15-intel`, nikoli placený větší runner, a ruční
spuštění dovoluje mezi oběma běžnými typy přepnout. Oficiální seznam GitHub
runner-images potvrzuje label i instalaci připnutého Xcode 26.0.1 na Intel obrazu.
https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md

### Nasazení společného kontraktu a stav sestavení

- Dr. Závlaha: verze **114**, zdroj `7140c78bdc3d17fd6c5b6a84f243e0f66203ca65`,
  nasazení `appgdep_6aeb6c83ac008191ae36c85e2a9885d0` úspěšné.
  https://zavlahovy-denik.purplecedar.chatgpt.site/
- Dr. Garden: verze **35**, zdroj `37299e1cdfd91de138856a7791da7e64042e2c11`,
  nasazení `appgdep_6aeb6d0f3c1c81918515efe4a017c88f` úspěšné.
  https://dr-garden.purplecedar.chatgpt.site/
- Veřejná kontrola: `watch-client.js?v=watch-companion-v1` vrací na obou adresách
  200 a identický sestavený kontrakt. Publikum obou instalací zůstalo beze změny.
- Prošla také regrese lokálního přihlášení v prohlížeči na 390, 430 a 1440 px:
  dočasné heslo, jeho změna po obnovení, trvalá relace, výhradní obnova role
  Administrátor, zákaz samoobslužné obnovy a ochrana neodeslaných změn.
- Aktuální Apple workflow pro kód `d6a1faf2869542eb5f5dba43f4f4c2fd0fe10b75`:
  https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/41879309267
  Při kontrole **4. 11. 2026 v 17:46 UTC** je stále `queued`, bez přiděleného
  runneru, bez spuštěných kroků a bez artefaktů. Ověřeno CLI i GitHub konektorem.
  Check-run neobsahuje chybu ani vysvětlení fronty; příčinu nelze doložit.
  Obecný GitHub Status uváděl Actions jako operational — to nepotvrzuje
  dostupnost konkrétního Macu. Neprohlašujeme kompilaci ani XCTest za úspěšné.
- **Ověřený IPA ani skutečné watchOS screenshoty zatím nejsou k dispozici.**
  Workflow je připravené je vytvořit po přidělení stroje, pokud kompilace a testy
  projdou. Výchozí balíček bude nepodepsaný; přímou instalaci do hodinek nelze
  slibovat bez Apple podpisu. Fyzické zařízení ani profily zde nebyly použity.
