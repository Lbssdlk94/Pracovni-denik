# Servisní protokol — nativní iOS, 20. 11. 2026

## Stav

Implementace je dokončená ve větvi `release/ios-0.8.5-2026-11-20`, zdroj aplikace `30d6cb84745d0220d57be261caa14c53da0b86d7`. **Vydání 0.8.5 (14) pro iPhone a Apple Watch včetně IPA bylo úspěšně sestaveno a ověřeno.** [Stažení a kontrolní součty](IPHONE-0.8.5-2026-11-20.md). Server nebyl nasazen a produkční databáze nebyla změněna.

## Původní architektura a zachovaná pravidla

Editor nahrazuje existující `APIProtocolEditor`, zachovává původní cestu `/api/jobs/:id/service`, `service_reports` s jedním záznamem na zakázku, historii `service_report_history`, verze zakázky/protokolu a idempotentní operace. Neukládá druhou docházku, kopii katalogu ani druhé úložiště fotografií. Data se ukládají do původního šifrovaného APIVault a původní fronty změn. Zakázky, schvalování a ruční dokončení zůstávají oddělené od individuálního ukončení práce.

Původní oprávnění a filtrování na serveru zůstávají zachována. Pracovník upravuje dostupný protokol; správce/majitel spravuje šablony; interní kalkulace a existující schvalované odesílání e-mailů zůstávají omezené původními oprávněními vlastníka. Nákladové sazby nejsou součástí veřejného snímku pracovních intervalů. Oddělení firem a profesí používá původní scoped DB/API a klíče nastavení.

## Implementované chování

- Nativní SwiftUI List s devíti rozbalovacími sekcemi: práce, materiál, poznámka k materiálu, závady, poznámky, doporučení, fotografie, práce a cesta, podpis. Souhrn a indikátor vyplnění, kompaktní hlavička, skutečný stav ukládání a připravenost z povinných polí šablony. Český výběr data, Dynamic Type, VoiceOver, světlý/tmavý režim; spodní tlačítka respektují safe area.
- Přednastavené činnosti a vlastní text. Konfigurovatelné šablony servis/realizace/zazimování/jarní spuštění/Garden/vlastní, dostupné sekce, povinné údaje, podpis, fotografie a kategorie. Správce přidává/upravuje/deaktivuje šablony a činnosti. Nastavení má CAS verzi a audit předchozí/nové hodnoty, autora a času. Historické protokoly mají uloženou verzi šablony.
- Samostatný katalog s vyhledáváním názvu/kódu, kategoriemi, oblíbenými a posledními položkami, více položkami v jednom otevření, plus/minus a ručním desetinným množstvím. Kontrola maximálně tří desetinných míst a kladného množství. Historická cena/revize se při změně množství nepřepisuje aktuální cenou katalogu; součty respektují měnu a původní oprávnění. Kompaktní odebrání/context menu/swipe bez nechtěného full-swipe odstranění.
- Práce/cesta vychází z existujícího ledgeru jednotlivých pracovníků včetně vícedenních návratů. Součty používají uzavřené intervaly; otevřené jsou označené jako neukončené. Základní docházka se k nim znovu nepřičítá. Čas a identita zakázky se ukládají jako historický snímek, který lze vědomě obnovit; podepsaná verze se při pozdější změně zakázky nepřepíše. Náklady nejsou zveřejněny pracovníkům.
- Závadu lze z uloženého protokolu převést přes původní editor sledovaných závad včetně závažnosti, stavu a fotografií. Existující převod se znovu otevře. Server vyžaduje skutečnou zahradu zakázky nebo skutečnou zahradu jejího zákazníka, autorizaci a původní unikátní zdroj protokolu. Opakované uložení nevytváří další závadu.
- Fotografie používají původní galerii, fotoaparát/knihovnu a upload frontu. Výběr, popis a příznak zahrnutí do PDF jsou součástí protokolu. Odebrání vazby neodstraňuje původní objekt fotografie. Selhání načtení vybrané fotografie zabrání vydávání neúplného PDF za kompletní.
- Podpis má samostatnou adaptivní obrazovku, skutečnou ruční kresbu, vymazání, jméno a volbu nepřítomen/odmítl. Pouhé klepnutí nepředstavuje podpis. PNG, čas podpisu/záznamu, podepsaná verze a hash zákaznického obsahu jsou uložené. Server porovnává zobrazenou verzi šablony, identity a pracovních intervalů; souběžná změna vyžaduje obnovení a nový podpis. Podstatná změna obsahu zneplatní původní podpis; čistě interní poznámka bez zveřejnění ho nemění. Povinný podpis nelze nahradit stavem nepřítomen.
- Offline protokol se zařazuje i při čekající fotografii a využívá původní `dependsOn`: při výpadku uploadu zůstane protokol čekající, po opakování se odešle až za fotografií. Regresní nativní test ověřuje zachování obou operací i přijetí výsledné verze.
- Každá změna se okamžitě ukládá do původního lokálního konceptu, síťový autosave má debounce. Uzavření/minimalizace uchová koncept. Jedna operace čeká na potvrzení; novější lokální text se po přijetí starší operace nepřepíše. CAS konflikt zůstává viditelný a není tiše přepsán. Trvalé lokální selhání se nezobrazuje jako Uloženo.
- Spodní lišta nabízí PDF a kontrolu/dokončení. Souhrn odkazuje přímo na chybějící sekci. Nepovinné prázdné sekce neblokují dokončení. Samostatné potvrzení protokolu automaticky nedokončuje zakázku; původní výslovná akce dokončení zachovává obchodní logiku.
- Katalog má vyhledávání trvale v horní navigaci a tlačítko Hotovo pro ukončení zadávání desetinného množství; hledání se neschovává pod numerickou klávesnici.
- Původní nativní PDF renderer je zachován a rozšířen o činnosti, šablonu, historickou identitu, skutečné uzavřené člověkohodiny, popisy vybraných fotografií a údaje podpisu. Interní poznámky se standardně vylučují; explicitní zveřejnění musí dovolit šablona. Nativní QuickLook, Share Sheet a původní archiv odeslaných protokolů. Před skutečným odesláním se potvrzuje příjemce. Stav Odesláno vyžaduje potvrzené odeslání poskytovatelem a odpovídající verzi protokolu; schválení samo neznamená odeslání.

## Soubory

| Oblast | Upravené / přidané soubory |
| --- | --- |
| Editor a model | `apps/iphone/NativeAPI/APIProtocol.swift`, `APIProtocolModel.swift`, `APIProtocolLogic.swift` |
| Komponenty | `APIProtocolComponents.swift`, `APIProtocolCatalog.swift`, `APIProtocolSignature.swift`, `APIProtocolTemplates.swift` |
| PDF a integrace | `APIProtocolPDF.swift`, `APIMedia.swift`, `APIAdministration.swift`, `APIStore.swift` |
| Preview / testovací aplikace | `APIProtocolFixture.swift`, `APIProtocolPreviews.swift`, `APIFixture.swift`, `PracovniDenikApp.swift` |
| Navazující kontroly docházky | `apps/iphone/NativeAPI/APIAttendanceFixture.swift`, `Tests/APIAttendanceLogicTests.swift`, `UITests/APIAttendanceUITests.swift` |
| Nativní testy a projekt | `apps/iphone/Tests/APIProtocolLogicTests.swift`, `UITests/APIProtocolUITests.swift`, `UITests/NativeAPIUITests.swift`, `project.yml`, `.github/workflows/iphone.yml` |
| API | `apps/work-diary/worker/protocol-design.js`, `service-work.js`, `api.js`, `garden-history.js`, `protocol-emails.js` |
| Sdílený web/PDF | `apps/work-diary/web/protocol-model.js`, `service-protocol-pdf.js`, `work-charges-ui.js`, `sw.js` |
| Databáze | `apps/work-diary/db/schema.js`, `drizzle/0060_protocol_design.sql`, příslušný journal a snapshot |
| Sestavení a testy | `apps/work-diary/scripts/build.mjs`, `test-protocol-design-worker.mjs`, `tests/protocol-design.test.js` |

Přesný diff proti poslednímu vydání: `git diff 7a3ae0b..release/ios-0.8.5-2026-11-20 --stat`.

## Ověření

- Úplné vydávací sestavení [44791578694](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44791578694), zdroj `30d6cb8`: **135/135 nativních jednotkových + 52/52 UI testů bez chyb**. Zahrnuje všech šest UI sad, původní funkce, nativní PDFKit kontrolu skutečného PDF, offline koncepty a pořadí fotografie/protokolu. Release iPhone, vložená Watch a Watch simulátor se třemi snímky prošly. IPA byla stažena a nezávisle ověřena podle SHA-256, phone/Watch identity/verze/platformy, privacy a nativních binárek.
- Zaměřené ověření [44791566539](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44791566539): **135 jednotkových + 13 UI testů protokolu/docházky bez chyb**, včetně posledních oprav katalogu, podpisu/PDF, noční směny a velkého písma. Checks-only kontrola potvrdila absenci IPA.
- **446/446 serverových testů prošlo**, včetně 15 případů protokolu, původní kompatibility, historických cen, podpisu, fotografií, oddělení firem a sledovaných závad. Příkaz z `apps/work-diary`: `node --test --test-isolation=none tests/*.test.js`. Serverový zdroj se od tohoto ověření `7672c7a` nezměnil.
- Skutečný sestavený Worker/workerd + D1: **všech 61 migrací**, reálné template CAS/audit, zákaz zápisu pracovníkem, ukládání činností a snímku, replay bez duplikace a skutečný ledger bez interních sazeb prošly. `node scripts/build.mjs` a `node scripts/test-protocol-design-worker.mjs`.
- `node scripts/validate-artifact.mjs --allow-unbound` prošlo na skutečném izolovaném Workeru/startupu/autorizaci. `--allow-unbound` je pro feature checkout bez produkčního hosting ID, nejde o nasazení.
- Kontroly podpisové politiky **4/4** a sestavení/simulátorů **13/13** prošly místně i v CI.
- Previews pro koncept, vyplněný/potvrzený protokol, tmavý režim, velký text, offline a malou šířku. Exportovány a zkontrolovány konečné snímky katalogu, velkého textu a nativního PDF.

Konečná kontrola opravila také ztrátu historických metadat při PDF exportu, blokování zařazení offline protokolu čekající fotografií a nedostupné horní dokončení katalogu během hledání. Testovací podklady pro noční směnu nyní zaručují předchozí místní den při jakékoli denní době. Testovací gesto pro velké písmo vede přes volnou plochu seznamu místo menu. Původní neúspěšné běhy byly následně překryty výše uvedeným úplným úspěšným ověřením; strojový záznam je v `docs/test-results/ios-protocol-2026-11-20.json`.

## Nasazení a zbývající rizika

1. Automatizované kontroly a vydání IPA jsou dokončené podle [vydání 0.8.5](IPHONE-0.8.5-2026-11-20.md). Instalace používá dosavadní vlastní podpis; fyzické scénáře uvedené níže zůstávají k provoznímu ověření.
2. Samostatně připravit nasazení odpovídajícího serveru a bezpečnou migraci **0060** na správné instalaci. Jde o přidání `protocol_details TEXT NOT NULL DEFAULT '{}'`; stávající řádky/historie zůstávají. Migrace 0059 pro přestávky je součástí předchozího vydání, musí být přítomná pro plnou docházku. Produkční migrace v této úloze nebyly spuštěné.
3. Aktualizovat backend/web před používáním rozšířených šablon/podpisů v klientovi. Starší server bez 0060 nabízí základní protokol a klient pravdivě uvádí chybějící podporu. Nový server obsluhuje také starší web/klienty a při jejich změně obsahu moderního protokolu zneplatní podpis. Po vytvoření moderních podepsaných protokolů nevracet starý server, který tato pravidla nezná; při rollbacku zachovat novou kompatibilní API vrstvu a přidaný sloupec.
4. Na fyzickém iPhonu ještě ověřit fotoaparát/knihovnu, podpis v obou orientacích, VoiceOver, skutečné offline ukončení/restart a následnou synchronizaci. E-mail ověřovat jen s explicitně schváleným příjemcem; testy neposílají zákazníkům zprávy.
