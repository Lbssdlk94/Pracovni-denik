# SwiftUI detail zakázky – návrh a pracovní implementace

Větev: `ui/ios-compact-job-detail-2026-11-19`. Výchozí revize: `9fc163d`.

Uživatel upřesnil vzhled fotografiemi detailu zakázky a požádal o skutečný SwiftUI náhled. Cílem tohoto vydání na pracovní větvi jsou ověřené nativní snímky pro posouzení vzhledu; žádné nasazení ani nová IPA.

## Rozložení

Kompaktní hlavička, stav/typ/obor, termín a příjezd, adresa, iniciály pracovníků. Tři rychlé akce: telefon, navigace, galerie. Malá karta dokončení používá původní editor odhadu; hranice posunu je v jejím menu. Dvojice souhrnů a dnešní pracovníci se počítají z existujících intervalů, včetně offline fronty. Realizace, Dokumentace a Informace používají sdílené řádky, existující obrazovky a původní editory. Editace a administrativní akce jsou v menu a ve skupině Informace.

Tab Bar je skryt v detailu a jeho podrobnostech. Bezpečná spodní lišta otevírá původní editor individuální pracovní akce. Ukončení práce mění pouze interval přihlášeného pracovníka. Globální stav lze dál explicitně změnit z menu. Instalace bez modulu docházky zachovávají svůj dosavadní stavový postup.

Nejsou změněny API, databáze, oprávnění ani synchronizační služby. Souhrn a spodní lišta sdílejí jeden požadavek `/api/jobs/:id/time`; třicetisekundový přepočet nepřidává síťové požadavky. Počty fotografií a denních zápisů nejsou na kartách vymyšlené: současná odpověď detailu tyto souhrny neposkytuje. Závady jsou počítané z již načteného seznamu, odlišuje se načítání a chyba od skutečné nuly.

## Náhled

`APIJobDetailPreviews.swift` obsahuje Xcode `#Preview` pro světlo, tmu, cestu, přestávku, dokončení a velké písmo/offline. Zkušební spouštěcí argument `--native-job-detail-preview` je dostupný jen v Debug a používá izolovaný `APIFixtureProtocol`. Ukázkové osoby/hodiny jsou výhradně v tomto náhledu, označeném „NÁVRH · UKÁZKOVÁ DATA“. Není napojen na produkční backend.

Argumenty: `--preview-dark`, `--preview-travel`, `--preview-paused`, `--preview-large-text`, `--preview-offline`. UI testy pořizují snímky skutečných komponent.

## Ověření

Lokálně: 13 testů nastavení simulátorů a 4 testy pravidel podepisování prošly. Kontrola whitespace prošla. Linux nemá Xcode; kompilaci a nativní UI ověří macOS GitHub Actions s `checks_only=true`, `sign_ipa=false`. Tento režim výslovně přeskočí vytvoření IPA.

Ověřeno: běh [44603790579](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44603790579) na revizi `e7b2b00` úspěšně dokončil **91 jednotkových a 21 UI testů**, kompilaci iPhonu i Apple Watch a kontrolu nepřítomnosti IPA. Xcode 26.6 / SDK 26.5.

Následná větev `ui/ios-role-dashboards-2026-11-19` převzala tento detail, opravila horizontální oddělovače ve skupinách a sdílí osobní pracovní akce s novým dashboardem. Její běh [44616419970](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44616419970) prošel s **97 jednotkovými a 30 UI testy**, včetně všech původních scénářů detailu. Nové snímky jsou skutečný SwiftUI simulátor; žádná IPA se nevytvářela. Podrobnosti serverového přehledu a omezení jsou v `IOS-ROLE-DASHBOARDS-2026-11-19.md`.

Přímé fyzické testování iPhonu a ruční VoiceOver průchod nebyly provedeny. Dostupné číselné údaje v produkčním rozhraní pocházejí z API; ilustrační hodnoty jsou pouze v izolovaných Debug previews.
