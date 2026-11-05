# Pracovní deník pro iPhone a Apple Watch – 0.6.0 (6)

Přehled si zachovává původní strukturu. Zakázky, detail, nabídka funkcí a navazující formuláře mají nové nativní SwiftUI rozložení. Systémové prvky a Liquid Glass využívají SDK iOS 27, obsah zůstává na čitelných neprůhledných kartách.

## Implementované rozhraní

- Kompaktní karty zakázek: zákazník a čas, konkrétní zahrada, adresa, technik, stav, důvod nedokončení a skutečný stav protokolu. Nativní hledání, Moje/Celý tým podle role, Dnes/Zítra, výběr dne a samostatné filtry s Použít/Zrušit.
- Detail rozlišuje plán práce a domluvený příjezd. Odděluje místo, dokumentaci, otevřené závady a poznámky. Navigace a pracovní akce zůstávají dostupné nad bezpečným spodním okrajem; pro velké písmo se akce skládají pod sebe. Čtenář nemá rychlé ovládání změny stavu a výjezdu.
- Nabídka Více dělí povolené funkce na práci v terénu, firemní agendu a aplikaci/zařízení. Materiál je přístupný všem povoleným firemním rolím, správu katalogu nadále chrání backend.
- Formuláře mají seskupená pole, nativní okna, dostupné zavírání a jednu hlavní akci nad spodním okrajem. Destruktivní akce jsou oddělené. Zavření volá původní ovladač a zachovává kontrolu rozepsané práce. Zrušení výběru prázdného času/data hodnotu nevyplní. Pole přebírají autocomplete pro Apple Hesla.
- Systémový tmavý režim, Dynamic Type a omezení průhlednosti. Výstrahy mají kontrastní barvy a podpis zůstává tmavý na bílém podkladu. Načtené náhledy fotografie se uchovají i pod otevřeným formulářem; při zneplatnění přístupu se odstraní.

## Apple Watch je SwiftUI

Hodinky mají samostatné nativní `WatchDayView`, `WatchJobView`, `WatchArrivalView` a `WatchInboxView`. Neobsahují WKWebView ani HTML rozhraní. Karty ukazují čas, zákazníka, konkrétní zahradu a stav s ikonou. Pracovní akce zachovávají původní autorizovaný WatchConnectivity kontrakt přes přihlášený iPhone: převzetí, přesný čas příjezdu, zahájení, dokončení a přechod do telefonu. Rozhoduje serverové potvrzení; dokončení samo neřeší závady. Nevzniká druhý účet ani databáze.

## Zachování současného deníku

Jde o převod a úpravu rozhraní, nikoli přepsání veškeré doménové logiky do Swiftu. Přehled a zakázky používají typované modely. Další obrazovky vykresluje SwiftUI z typovaného popisu aktuálně dostupných ovládacích prvků. Dosavadní validace, verze, koncepty a offline fronty zůstávají ve stále připojeném skrytém WKWebView. Změny se předávají původním handlerům přes neprůhledné identifikátory. Skryté texty a tlačítka ani akce ze sbalených sekcí se nevystavují do nativního rozhraní. Cena v historických protokolech a obchodní oprávnění se touto úpravou nemění.

Nebyla měněna provozní data, databázové schéma ani nastavení integrací. Převzatá hlavní větev GitHubu zachovává nově přidaný prezentační web; již ověřené opravy synchronizace a sdíleného prostoru zůstávají v aktuální podobě.

Kompatibilní adaptér byl publikován:

- Dr. Závlaha: verze 119, zdroj `5f0f0c52bf96514e9049d153cf6ac94cded1a8d6`.
- Dr. Garden: verze 40, zdroj `7fcb7eac15cf708d03a6def06e7a45eb78378809`.

Obě URL vracejí nový kontrakt; heslo zůstává povolené a osobní přihlašovací odkazy vypnuté. Webová publikace sama neaktualizuje nainstalovanou IPA.

## Ověření

- 313 regresních testů společného backendu: bez selhání.
- 13 Python testů přípravy/volby/párování simulátorů a 4 testy podpisové politiky: bez selhání.
- Integrační test izolovaného skutečného Worker/D1/R2 prochází 10 modulů, uloží zákazníka s propojenou zahradou, protokol, podpis a fotografii, vytvoří skutečné PDF a ověří offline úpravu se synchronizací bez duplicit.
- Samostatný test nativního kontraktu ověřuje obory, přiřazení, zákaz cizích zakázek, zachování textu a zrušení bez zápisu, přístup pracovníka k materiálu bez správy katalogu a zneplatnění přehledů offline. Ověřeno také seskupování ovládacích prvků a nepředání skrytého obsahu.
- GitHub běh 41980906704: Xcode 27.1 / iOS SDK 27.1, všech 26 Swift jednotkových a 8 UI testů prošlo na iPhonu Duo. Vzniklo skutečné iPhone IPA včetně vloženého Watch executable, ikony, privacy manifestu a shodných verzí. Samostatné sestavení Watch prošlo také.
- Klasický iPhone 18 Pro / iOS 27.0 v běhu 41983507621: všech 26 jednotkových testů a 7 z 8 UI testů prošlo. Selhání jednoho testu bylo způsobeno předčasným rozpoznáním tlačítka Přehled v úvodním formulářovém obalu. Test nyní čeká na jedinečný titulek skutečného nativního přehledu a na dostupnost konkrétní navigační akce.

Závěrečné ověření **prošlo celé**: [GitHub Actions 41984820174](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/41984820174), zdroj `20338eb09b6e6086db531d1272f437e56afd7282`. Na čerstvém iPhonu 18 Pro / iOS 27.0 prošlo všech **26 jednotkových + 8 UI testů**. Na Apple Watch Series 12 (46 mm) / watchOS 27.0 se SwiftUI aplikace sestavila, nainstalovala, spustila a vznikly soubory náhledů dne, detailu a upozornění. Vizuálně potvrzené jsou den a upozornění; soubor detailu zachytil úvodní načítací obrazovku a není důkazem jeho vykreslení. Xcode i SDK byly 27.1. Vytvořeno iPhone IPA s vloženou Watch aplikací; kontroly skutečných balíčků prošly. Artefakt: `13396325113`, uchování 14 dní. Podepsaná distribuční větev nebyla spuštěná (nepodepsané IPA).

### Stav připravené verze 0.6.1 (7)

Zdrojové změny přidávají jednu společnou `NavigationStack` cestu pro výběr zakázky i náhled, odstranění asynchronního počátečního přesměrování, pracovní návštěvy na začátku Watch přehledu, kompaktní hlavičku detailu a čitelné tlačítko nativních možností. Watch používá `confirmationDialog`, nikoli nepodporované webové menu. Přehled ani pracovní operace iPhonu se proti ověřené 0.6.0 nemění.

**Tato verze není sestavená ani ověřená.** GitHub při běhu [41989006987](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/41989006987), zdroj `ef245a434aa51cba243f0310b02385b8b934d70b`, odmítl přidělit runner. Neproběhl žádný sestavovací krok. Anotace: “The job was not started because recent account payments have failed or your spending limit needs to be increased.” Stejná překážka nastala u předchozího běhu 41988885874. Nelze ji zaměňovat za chybu překladače ani za úspěšné sestavení 0.6.1. Je potřeba opravit platbu/limit v nastavení GitHub Billing a poté spustit nové ověření. Nesmí se nahrazovat ověřené IPA neexistujícím balíčkem 0.6.1.

Po prodloužení čekání na náhled v úspěšném běhu [41986860050](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/41986860050) se také znovu sestavila 0.6.0 a prošlo všech 26+8 iOS testů. Jeho artefakt `13396707201` je zdrojem předávaného IPA. Kontrolní součet po stažení byl ověřen: `61c14d1265bb43a62e1db582a95e31dced1a20f20a1c104cf834edae522ee690`. Desetisekundové čekání samo nepomohlo s náhledem Watch detailu; proto vznikla samostatně označená, zatím neověřená úprava navigace 0.6.1.

Testy UI používají místní fixture, ne provozní účty. Zápisové integrační testy používají výhradně syntetické uživatele a oddělené úložiště. Úspěch formulářového UI testu sám není vydáván za ověření skutečného přihlášení či fyzického fotoaparátu.

### Reprodukovatelnost Apple CI

Standardní image `xcode-27` poskytl Xcode 27.1 a iOS SDK 27.1. Preview runtime iOS 27.1 byl kompatibilní s Duo, nikoli s globálně dostupným klasickým iPhonem 18 Pro. Příprava nyní vybírá skutečně dostupné dvojice zařízení/runtime stejné hlavní verze a vytváří vlastní klasický iPhone a hodinky. Stejná ID používá celý běh.

Párování ověřuje skutečný aktivní stav místo opakované aktivace již aktivní dvojice. Při automatickém vypnutí Watch simulátoru během startu páru nejvýše dvakrát opakuje pouze boot/instalaci tohoto testovacího zařízení; aplikační zápisy neopakuje a selhání nezakrývá. Náhledy a záznamy jsou součástí artefaktů. Přesná verze nástrojů a SDK se ukládá do souborů.

## Hlavní soubory

- `apps/iphone/App/DiaryDesign.swift`, `NativeDiaryViews.swift`: karty, barvy, zakázky, detail a nabídka.
- `apps/iphone/App/NativeForms.swift`, `NativeFields.swift`, `Core/NativeScreenModels.swift`, `NativePresentation.swift`, `NativeScreenStore.swift`: nativní pole a okna, metadata, pořadí změn a návrat k obsahu.
- `apps/iphone/App/NativeSurfaces.swift`: podpis a další nativní pracovní plochy.
- `apps/iphone/WatchApp/WatchViews.swift`, `PracovniDenikWatchApp.swift`: SwiftUI hodinek.
- `apps/work-diary/web/native-screens.js`, `native-client.js`, `sw.js`: zpětně kompatibilní kontrakt a cache.
- `.github/workflows/iphone.yml`, Python/Swift/UI testy a příprava simulátorů: sestavení, kontroly a náhledy.

## Instalace a hranice

Předávané ověřené IPA je **0.6.0 (6)**; zdrojová připravená verze je **0.6.1 (7)**. Minimální iOS zůstává 17 a watchOS 10; starší systém má kompatibilní materiál namísto Liquid Glass. Starší runtime nebyl v tomto vydání zvlášť ověřený.

IPA je nepodepsané a vyžaduje vlastní Apple podepsání. Toto vydání se neposílá do TestFlight/App Store. Instalovat jako aktualizaci; před odinstalací je nutné synchronizovat neodeslanou práci. Fyzické iPhone/Watch, reálné přihlášení, fotoaparát, GPS, systémové sdílení, dlouhé uspání, velké soubory a APNs vyžadují samostatnou zkoušku na zařízení. Watch náhledy s fixture nenahrazují ověření skutečného spojení s přihlášeným iPhonem.
