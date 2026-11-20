# Servisní protokol — nativní iOS, 20. 11. 2026

## Stav

Implementace je připravená ve větvi `ui/ios-service-protocol-2026-11-20`, zdroj `7672c7a`; navazující větev `release/ios-0.8.5-2026-11-20` zvyšuje verzi telefonu a hodinek. Server nebyl nasazen a produkční databáze nebyla změněna. **Nová IPA ještě nevznikla.** Finální nativní ověření blokuje GitHub Billing & plans; výsledky jednotlivých ověření jsou níže.

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
- Každá změna se okamžitě ukládá do původního lokálního konceptu, síťový autosave má debounce. Uzavření/minimalizace uchová koncept. Jedna operace čeká na potvrzení; novější lokální text se po přijetí starší operace nepřepíše. CAS konflikt zůstává viditelný a není tiše přepsán. Trvalé lokální selhání se nezobrazuje jako Uloženo.
- Spodní lišta nabízí PDF a kontrolu/dokončení. Souhrn odkazuje přímo na chybějící sekci. Nepovinné prázdné sekce neblokují dokončení. Samostatné potvrzení protokolu automaticky nedokončuje zakázku; původní výslovná akce dokončení zachovává obchodní logiku.
- Původní nativní PDF renderer je zachován a rozšířen o činnosti, šablonu, historickou identitu, skutečné uzavřené člověkohodiny, popisy vybraných fotografií a údaje podpisu. Interní poznámky se standardně vylučují; explicitní zveřejnění musí dovolit šablona. Nativní QuickLook, Share Sheet a původní archiv odeslaných protokolů. Před skutečným odesláním se potvrzuje příjemce. Stav Odesláno vyžaduje potvrzené odeslání poskytovatelem a odpovídající verzi protokolu; schválení samo neznamená odeslání.

## Soubory

| Oblast | Upravené / přidané soubory |
| --- | --- |
| Editor a model | `apps/iphone/NativeAPI/APIProtocol.swift`, `APIProtocolModel.swift`, `APIProtocolLogic.swift` |
| Komponenty | `APIProtocolComponents.swift`, `APIProtocolCatalog.swift`, `APIProtocolSignature.swift`, `APIProtocolTemplates.swift` |
| PDF a integrace | `APIProtocolPDF.swift`, `APIMedia.swift`, `APIAdministration.swift`, `APIStore.swift` |
| Preview / testovací aplikace | `APIProtocolFixture.swift`, `APIProtocolPreviews.swift`, `APIFixture.swift`, `PracovniDenikApp.swift` |
| Nativní testy a projekt | `apps/iphone/Tests/APIProtocolLogicTests.swift`, `UITests/APIProtocolUITests.swift`, `UITests/NativeAPIUITests.swift`, `project.yml`, `.github/workflows/iphone.yml` |
| API | `apps/work-diary/worker/protocol-design.js`, `service-work.js`, `api.js`, `garden-history.js`, `protocol-emails.js` |
| Sdílený web/PDF | `apps/work-diary/web/protocol-model.js`, `service-protocol-pdf.js`, `work-charges-ui.js`, `sw.js` |
| Databáze | `apps/work-diary/db/schema.js`, `drizzle/0060_protocol_design.sql`, příslušný journal a snapshot |
| Sestavení a testy | `apps/work-diary/scripts/build.mjs`, `test-protocol-design-worker.mjs`, `tests/protocol-design.test.js` |

Přesný diff proti poslednímu vydání: `git diff 7a3ae0b..ui/ios-service-protocol-2026-11-20 --stat`.

## Ověření

- **446/446 serverových testů prošlo** na zdroji `7672c7a`, včetně 15 nových případů protokolu, původní kompatibility, cen, podpisu, fotografií, oddělení firem a sledovaných závad. Příkaz z `apps/work-diary`: `node --test --test-isolation=none tests/*.test.js`.
- Skutečný sestavený Worker/workerd + D1: **prošlo všech 61 migrací**, reálné template CAS/audit, zákaz zápisu pracovníkem, ukládání činností a snímku, replay bez duplikace a skutečný ledger bez interních sazeb. `node scripts/build.mjs` a `node scripts/test-protocol-design-worker.mjs`.
- Validace skutečného Worker artefaktu/startupu/autorizace: `node scripts/validate-artifact.mjs --allow-unbound` **prošlo**. `--allow-unbound` je pouze pro izolovaný feature checkout bez produkčního hosting ID; nejde o nasazení.
- Místní Python kontroly podpisové politiky **4/4** a sestavení/simulátorů **13/13** prošly.
- [Nativní běh 44774311749](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44774311749), zdroj `8a50cc3`: kompilace aplikace a **131/131 jednotkových testů** prošly.
- [Nativní běh 44776317228](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44776317228), zdroj `41ef5a7`: kompilace a **133/133 jednotkových testů prošly**, včetně skutečného UIKit/PDFKit PDF a offline konceptu/synchronizace. UI **1/6 prošel, 5/6 selhalo** při hledání prvků. Snímky, AX výpisy a videa prokázaly přepsání dětských ID na DisclosureGroup, složený label šablony a přítomný nativní QuickLook bez testem hledaného tlačítka Done. Identifikátory byly přesunuty pouze na záhlaví, šablona má vlastní ID a PDF se ověřuje přes skutečný QLPDF view. **Tyto opravy ještě nejsou nativně ověřené.**
- [Následující běh 44779185288](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44779185288), zdroj `7672c7a`: GitHub nezačal provádět ani první krok. Anotace: “The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings”. Nejde o úspěšný compile/test.
- Previews jsou vytvořené pro koncept, vyplněný/potvrzený protokol, tmavý režim, velký text, offline a malou šířku. Export některých simulátorových snímků proběhl; fyzický telefon ani skutečné odesílání zákazníkovi nebyly testovány.

## Nasazení a zbývající rizika

1. Odblokovat GitHub Actions v Billing & plans, zopakovat zaměřený nativní test `check_scope=protocol` a opravit případné další skutečné chyby. Pak úplná release sada a IPA podle [vydání 0.8.5](IPHONE-0.8.5-2026-11-20.md). Finální UI testy a nejnovější drobné změny SwiftUI nejsou kvůli blokaci ověřené.
2. Samostatně připravit nasazení odpovídajícího serveru a bezpečnou migraci **0060** na správné instalaci. Jde o přidání `protocol_details TEXT NOT NULL DEFAULT '{}'`; stávající řádky/historie zůstávají. Migrace 0059 pro přestávky je součástí předchozího vydání, musí být přítomná pro plnou docházku. Produkční migrace v této úloze nebyly spuštěné.
3. Aktualizovat backend/web před používáním rozšířených šablon/podpisů v klientovi. Starší server bez 0060 nabízí základní protokol a klient pravdivě uvádí chybějící podporu. Nový server obsluhuje také starší web/klienty a při jejich změně obsahu moderního protokolu zneplatní podpis. Po vytvoření moderních podepsaných protokolů nevracet starý server, který tato pravidla nezná; při rollbacku zachovat novou kompatibilní API vrstvu a přidaný sloupec.
4. Na fyzickém iPhonu ještě ověřit fotoaparát/knihovnu, podpis v obou orientacích, VoiceOver, skutečné offline ukončení/restart a následnou synchronizaci. E-mail ověřovat jen s explicitně schváleným příjemcem; testy neposílají zákazníkům zprávy.
