# Kompaktní nativní Zakázky

Větev `ui/ios-compact-jobs-2026-11-20` navazuje na dashboardy a detail (`2dd36ed`).

## Analýza a rozhodnutí

Původní `APIJobsScreen` byl v `APIRoot.swift`: seznam s velkými ovládacími řádky a čtyřmi akcemi u zakázky, bez všech požadovaných filtrů. Používal již oprávněný `/api/jobs`, původní měsíční cache a `APIStore`. `APIJobsMap` vyžaduje správce a potvrzené/geokódované adresy. Docházka a individuální intervaly existují samostatně od globálního stavu zakázky. Tyto kontrakty, databáze, serverová oprávnění, schvalování i offline fronta zůstávají zachované.

Existující seznam API podporuje stránkování, obor, pracovníka, typ, stav, protokol, pozornost a měsíční výběr. Nemá libovolné řazení podle zákazníka/aktualizace ani souhrn člověkohodin v kartách. Proto klient načítá úplné oprávněné stránky zvoleného rozsahu, vyhledává a řadí lokálně. Během načítání či chyby výslovně označuje neúplnost. Tím se neřadí jen první stránka za všechny zakázky. Rozsahy do tří měsíců používají měsíční požadavky/cache; širší výběr používá původní stránkovaný seznam bez omezení sedmidenního serverového filtru. Velké seznamy vykresluje nativní lazy List.

Filtrování a řazení proběhne pouze jednou při vykreslení obrazovky; jednotlivé sekce používají společný výsledek seskupený v jednom průchodu. Klíče řazení, vyhledávací dotaz a hranice data se připravují předem. Karty mimo viditelnou oblast nevyvolávají plošné načítání souhrnů pracovní doby.

Dnešní výběr doplňuje oprávněné `in_progress` a `on_way` přes původní API i z předchozích měsíců. Neskryje tak pokračující vícedenní realizaci. Zítřek ani výslovné období se tím nerozšiřují.

Při přechodu přes půlnoc se zohlední i osobní aktivní interval z původní offline fronty. Měsíční offline cache s více než 500 záznamy se čte přes její existující denní výběry; nejde o novou cache ani rozšíření oprávnění. Přechodná chyba API zachová původní čas potvrzeného načtení a označí výsledek jako uloženou kopii, i když telefon zůstává připojený.

Člověkohodiny se načítají odloženě pouze u zobrazených řádků přes původní `/api/jobs/:id/time`, využívají šedesátisekundovou cache a původní projekci fronty. Správce vidí souhrn, pracovník vlastní práci. Neukazují se vymyšlené nuly při chybě načtení. Osobní akce před otevřením původního editoru znovu načte oprávněný snímek/verze; nepřepíná globální zakázku. Starý postup zakázek bez docházky je zachován a má původní UI test.

## Rozhraní

- Nativní vyhledávání; Dnes / Zítra / Všechny; Moje / Celý tým; kompaktní ikony kalendáře, mapy a filtrů s počtem.
- Filtry se upravují v pracovní kopii sheetu. Zahrnují původní protokoly a pozornost z dashboardu, datum/období, obor, pracovníka, typ, zákazníka a řazení. Reset a potvrzení jsou oddělené od zavření.
- Skupiny Probíhající, Na cestě, Naplánované, Čekající na schválení, Nemohu dokončit, Dokončené. Prázdné jsou skryté; dokončené jsou na konci a standardně sbalené.
- Kompaktní karty mají český termín, jeden hlavní název, stav, dostupnou adresu, odhad bez velkého bloku při chybění, iniciály a skutečné hodiny. Volání, navigace, osobní akce a menu mají minimálně 44 bodů.
- Swipe oběma směry vždy s `allowsFullSwipe:false`; všechny funkce jsou i v tlačítkách/menu. Mazání zůstává v původním potvrzovaném detailu. Přeplánování používá stávající editor s kontrolou konfliktů a termínů.
- Mapa dostává stejná filtrovaná data jako seznam, změny přebírá i při otevření a u bodu používá stejnou kompaktní kartu. Zachována jsou původní oprávnění i upřesňování adres.
- Jedna informace o synchronizaci nad seznamem. Offline čtení používá pouze původní přístupově ověřenou cache tří měsíců. Starší/nenačtené zakázky nejsou vydávány za úplný stav.
- Světlý i tmavý režim používají původní barevné tokeny. Tmavě zelená primární akce i počet filtrů mají vždy bílý text; systémové pozadí by v tmavém režimu vytvořilo nečitelný černý text.
- Horní lišty filtrů a kalendáře používají systémový styl místo dvojího obalení vlastní bublinou a nativním sklem. „Resetovat“ se tak neořezává na jediné písmeno. Při přístupnostních velikostech písma se hodiny, procenta a synchronizační souhrn skládají pod sebe; malé dekorativní iniciály mají čitelnou pevnou velikost a VoiceOver stále čte celé jméno.

## Upravené soubory

- `apps/iphone/NativeAPI/APIJobsScreen.swift`: seznam, ovládání, skupiny, centrální otevření detailu, synchronizační indikátor a kompaktní tlačítka.
- `apps/iphone/NativeAPI/APIJobListRow.swift`: karta, osobní akce, původní editory, gesta, menu, kontakty a odložené načítání hodin.
- `apps/iphone/NativeAPI/APIJobsPresentation.swift`: kombinace filtrů, termíny, řazení a parametry stávajícího API.
- `apps/iphone/NativeAPI/APIJobsListModel.swift`: stránkování, deduplikace verzí, původní offline cache a přerušení zastaralých požadavků.
- `apps/iphone/NativeAPI/APIJobsFilters.swift`: potvrzovaný sheet filtrů a nativní výběr data/období.
- `apps/iphone/NativeAPI/APIGeometry.swift`, `APIRoot.swift`: propojení stávající mapy a oddělení původní velké obrazovky seznamu.
- `apps/iphone/NativeAPI/APIStore.swift`: zachování skutečného času cache při přechodném výpadku API.
- `apps/iphone/NativeAPI/APIJobsFixture.swift`, `APIJobsPreviews.swift`, `APIFixture.swift`, `apps/iphone/App/PracovniDenikApp.swift`: izolované testovací scénáře a DEBUG Previews včetně velkého písma, malého/velkého telefonu, offline a prázdného seznamu. Ukázková data se nepoužívají v produkčním transportu.
- `apps/iphone/Tests/APIJobsPresentationTests.swift`, `apps/iphone/UITests/APIJobsUITests.swift`, `NativeAPIUITests.swift`, `apps/iphone/project.yml`: automatizované scénáře a zachování původního postupu bez docházky.
- `.github/workflows/iphone.yml`: volitelný výběr kontrol pouze pro `checks_only`; běžné vydání nadále spouští všechny testy. `checks_only=true` přeskočí podepsané i nepodepsané IPA a jejich nepřítomnost samostatně ověří.

## Ověření

Úspěšný [kontrolní běh 44688906367](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44688906367) ověřil implementační commit `9e416d34342857af305ba211c7419073f79d4bc0`. Použil `runner=macos-26`, `checks_only=true`, `sign_ipa=false`, `check_scope=jobs`, Xcode 26.6 a iOS SDK 26.5.

| Kontrola | Výsledek |
| --- | --- |
| iPhone sestavení a všechny jednotkové testy | 111 / 111, bez chyb |
| Nové nativní UI scénáře zakázek | 9 / 9, bez chyb |
| Sestavení Watch pro simulátor, párování a export tří ukázek | Úspěšné |
| Python kontroly sestavovacích skriptů | 13 / 13 |
| Python kontroly pravidel podepisování | 4 / 4 |
| Kontrola nepřítomnosti IPA ve workflow i staženém ZIP | Úspěšná |
| `git diff --check` | Bez chyb |

Čtrnáct nových jednotkových testů pokrývá vícedenní a čekající osobní intervaly přes půlnoc, skupiny, kombinace hledání/filtrů, řazení, české termíny, parametry oprávněného API, období, původní cache, vymazání při 403, 205 stránkovaných zakázek s deduplikací verzí, opakovaný cursor, idempotentní offline synchronizaci, 650 uložených zakázek a původní čas cache při 503. Nové UI testy ověřily obě role, přímé otevření detailu, hledání/filtry, Dnes/Zítra, dokončené, gesta a kontextové menu, osobní akci, kalendář, filtrovanou mapu, světlo/tmu a rozložení ovládání s velkým písmem. Xcode Previews používají izolovaný fixture transport.

Původních 30 UI testů prošlo v předchozím plném [běhu 44685029126](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44685029126): dashboard 9, detail 6, původní nativní scénáře 15. Tento běh celkově neuspěl kvůli jednomu novému testu kontextového menu, který při zavírání swipe omylem aktivoval vyhledávání. Test byl opraven a všech devět nových scénářů následně prošlo. Poslední běh cíleně opakuje všechny jednotkové testy a nové UI scénáře; není vydáván za současné zopakování všech 39 UI testů.

Skutečné snímky simulátoru byly vizuálně zkontrolovány: světlý seznam, pracovník ve tmě, filtry, kalendář, mapa, rozbalené dokončené, kontextové menu a velké písmo. Během ověřování se opravila funkčnost nativního swipe při zděděném stylu tlačítek, celá dotyková plocha sbalené sekce, duplicitní identifikátor karty za mapovým sheetem, kontrast primární akce ve tmě a ořezání nápisu Resetovat.

Artefakt `14608720257`, `PracovniDenik-builds-and-logs-CHECKS-ONLY-NO-IPA`, má ověřený SHA-256 `5a0d878f7548c131f8d8ea041f515de01a5f51cb2e0db0e14db4e791e72c8ba6`. Obsahuje protokoly a snímky, žádnou IPA. Lokální report je v `/workspace/reports/ios-compact-jobs/run10/`. Podepsané ani nepodepsané zařízení/release balíčkování se nespouštělo. Není vyžadována migrace nebo nasazení serveru/webu; do nainstalované aplikace se změny dostanou až budoucím sestavením a instalací.

## Praktická omezení

Na simulátoru 402 × 874 bodů jsou u plných karet vidět přibližně dvě celé a část třetí. Čtyři až pět karet není při všech údajích, skupinách, vyhledávání a 44bodových akcích zaručeno; Dynamic Type a čitelnost mají přednost před tímto orientačním cílem. Previews jsou připravené i pro 320 × 640 a 440 × 956, jejich samostatné vykreslení na těchto rozměrech není vydávané za provedený test fyzických zařízení.

Server stále uplatňuje původní workspace/discipline/assignment oprávnění. Nabídka zákazníků je odvozena z právě načtených dostupných zakázek. Mapa neuděluje pracovníkovi nové správcovské oprávnění a offline mapový podklad závisí na cache MapKitu. Neomezené historické výběry vyžadují síť a mohou mít více stránek; průběh se zobrazuje a změna výběru načítání ruší. Zůstává původní limit cache 500 zakázek na jeden den a okno uložených tří měsíců; neúplnost je označena. Fyzický iPhone, ruční VoiceOver průchod, skutečné telefonní hovory a výkon s produkčními objemy dat zatím nebyly testované.
