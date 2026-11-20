# Zakázky a Docházka – nativní iOS

Větev `ui/ios-attendance-integration-2026-11-20` navazuje na ověřený redesign Zakázek, dashboardů a detailu (`cbb9366`). Nevytváří IPA ani nemění produkční data.

## Analýza a datové vazby

Původní `APIAttendanceView` byl jednoduchý měsíční seznam v `APIAttendance.swift`. Stávající `/api/attendance` již vrací směny, aktivní směnu, opravy, schvalování a souhrn rozdělení. Jednotlivé činnosti jsou v `job_time_intervals`, přímo navázané na `attendance_shifts`; stavy pracovníků, verze, audit, sazby a ochrany překryvů již existují. Tyto evidence se dál používají společně. Zastavení jednoho člověka ani odchod ze směny nemění stav celé zakázky.

Jediné nutné rozšíření schématu je migrace `0059_attendance_activities`: `job_time_intervals.job_id` dovolí NULL výhradně pro přestávku nebo výslovně zadanou ostatní činnost. Práce a doprava nadále vyžadují skutečnou zakázku. Migrace zachová původní řádky, ID, verze, sazby a audit; obnoví všech devět původních triggerů a unikátní aktivní interval pracovníka. Přidá index uživatel/čas. Nevzniká druhá tabulka směn nebo paralelní evidence přestávek. Prázdný `job_id` v auditních událostech/operacích znamená činnost bez zakázky, nikoliv smyšlenou zakázku.

## Rozhraní

- Zakázky zachovávají předchozí kompaktní seznam, filtry, seskupení, gesta, mapu, kalendář a osobní akce. Nově se zobrazí i skutečný vlastní název práce, pokud není pouhým opakováním zákazníka/typu; volba společných dostupných oborů je označená Obojí.
- Docházka má živou osobní kartu, příchod/odchod, přestávky a dynamické akce; další činnosti jsou v kompaktním menu. Velké písmo skládá akce a statistiky pod sebe.
- Měsíce se přepínají šipkami a nativním kalendářem. Čtyři statistiky používají jen uzavřené odeslané směny; průběžný čas zůstává oddělený.
- Swift Charts ukazuje aktuální týden nebo zvolený měsíc. Průběžná část má samostatné označení; výběr sloupce nabídne detail dne.
- Pracovní dny jsou od nejnovějšího. Detail obsahuje přítomnost, přestávky, čistý čas, práci, dopravu, výslovně zaznamenanou ostatní činnost a nepřiřazené úseky. Součet za jednotlivé dostupné zakázky i časová osa odkazují přímo na původní detail zakázky.
- Správce přepíná vlastní docházku / tým; týmový přehled má statistiky, pracovníky, období, výběr pracovníka a kategorii. Obojí u pracovníků znamená členství v obou oborech. Údaje se filtrují na serveru a při výpočtu přehledu.
- CSV exportuje právě vybraný měsíc a povolené pracovníky. Používá UTF-8 BOM, středník, uvozovky a ochranu před interpretací textových polí jako vzorců. Uzavřený a průběžný čas jsou v oddělených sloupcích.
- Původní doplnění dne, návrh opravy/smazání, schválení/zamítnutí, GPS podrobnosti a historie oprav zůstávají dostupné podle původních oprávnění.

## Výpočty a integrita

Dny a měsíce se dělí v `Europe/Prague`; týden začíná v pondělí. Hranice dnů používají kalendář, nikoliv pevné násobky 24 hodin. Čas vychází z uloženého začátku/konce, nikoliv z běžících stopek. Minimalizace nebo restart nepřeruší měření.

Směny a činnosti se rozdělují na nepřekrývající se úseky. Stejné ID se deduplikuje podle verze. Překryvy jsou označené a nepřičítají hodiny podruhé. Úsek bez odpovídající aktivity zůstává nepřiřazený; nedostává smyšlenou náplň. Otevřené a čekající směny nejsou uzavřené měsíční hodiny. Přestávky se odečítají od přítomnosti; zakázkové hodiny se k docházce nepřičítají.

Předchozí neukončený den vyvolá upozornění s opravou, nikoliv automatický odchod o půlnoci. Skutečná směna přes půlnoc zůstane jedna. Počet záznamů ke kontrole deduplikuje ID směny i při zobrazení přes více kalendářních dnů. Dlouhé, překrývající se nebo neplatně seřazené záznamy se označí ke kontrole. Opravy dále procházejí původní žádostí a schválením s původní/novou hodnotou, autorem a časem.

## Zpětně kompatibilní API

- `GET /api/attendance?month=YYYY-MM&userId=...&detail=1&discipline=all|irrigation|garden|both` přidává pole `detail`. Stará pole a původní web se nemění. Oprávněná metadata zakázek se načtou hromadně; nepřístupný název/ID a finanční sazby se do přehledu neposílají. Verze pracovníků se načítají společně, bez požadavku na každého pracovníka zvlášť.
- `POST /api/attendance/activities` používá stejnou evidenci a transakční kontrolu verzí. Akce `break`, `resume`, `other`, `stop` jsou vždy vlastní. Přestávka z práce zachová vazbu na zakázku; samostatná přestávka žádnou nevymýšlí. Návrat obnoví předchozí povolenou práci; lze také ukončit přestávku bez obnovení zakázky. Obnovená práce používá původní sazby pro nový interval a oprávnění zakázky.
- `POST /api/attendance/punch` volitelně přijme původní `at`. Bez něj zůstává původní serverový čas. Rozšířené potvrzení stavu využívá nový klientský header `x-attendance-client: v1` nebo přítomnost `at`. Díky tomu funguje i původní migrační test nad databází před zavedením pracovní doby.
- Odchod uzavře jen vlastní otevřený interval prostřednictvím původního triggeru. Přechod ze samostatné přestávky na zakázku používá původní potvrzení přechodu a jednu existující směnu.

Tenant/workspace routing, role, licence, přiřazení a oprávnění Závlaha/Garden zůstávají původní. Role preview nemůže zapisovat. Vedoucí/správce nemění pracovníky jiné firmy. Soukromé náklady zůstávají pouze v původním správcovském API.

## Offline a obnova

Nové úkony používají původní šifrovaný `APIVault`, outbox, závislosti operací, stejná ID a kontrolu verzí. Původní čas stisku se uloží před síťovým/GPS čekáním, v celých milisekundách. Opakované odeslání zachovává stejný obsah a nevytvoří další směnu/interval. Potvrzení aktualizuje původní cache, která zůstává oddělená účtem a oprávněními.

Příchody/odchody a samostatné přestávky fungují offline až po potvrzení nového serverového kontraktu `activitySchema: 1` a při povoleném platném offline přístupu. Bez něj zůstane původní online postup; chybějící podrobné rozdělení se nevydává za skutečnou nulovou přestávku. Server přijme offline čas nejvýše 24 hodin starý, stejně jako původní pracovní akce. Starší nebo konfliktní úkony zůstanou k vyřešení s původním časem; automaticky se neposouvají. GPS se při offline stisku nevymýšlí.

## Nasazení a návrat

1. Před produkčním nasazením porovnat větev s aktuálním serverem, vytvořit a ověřit úplnou zálohu a během migrace pozastavit zápisy původním servisním režimem. Neodstraňovat offline fronty zařízení.
2. Aplikovat `0059_attendance_activities.sql` nad schématem 0058. Přestavbu tabulky provést v transakční dávce podporované nasazovacím prostředím; pokud prostředí provádí příkazy jednotlivě, držet zápisy pozastavené po celou migraci a ověření. Při chybě neotevírat zápisy nad částečným schématem.
3. Ověřit počty/ID/verze původních řádků, cizí klíče, devět triggerů a index jediného aktivního intervalu. Poté nasadit zpětně kompatibilní server včetně `attendance-detail.js` a aktualizovaného sestavení Workeru; obnovit zápisy po úspěšné kontrole.
4. Nativní změny distribuovat až budoucím výslovně spuštěným sestavením iOS. Tento úkol používá pouze kontrolní běhy bez IPA.
5. Bezpečný návrat UI je předchozí iOS verze se zachováním kompatibilního serveru a migrace. Nemažte samostatné přestávky ani nevracejte NOT NULL ztrátovou migrací. Předchozí server potřebuje ponechat kompatibilitu pro NULL job_id v načítání stavu, auditu ukončení a triggeru odchodu. Po přijetí nových zápisů neobnovovat starou zálohu naslepo; zachovat nové intervaly a použít opravu dopředu. Při selhání samotné migrace před obnovením zápisů lze obnovit ověřenou úplnou zálohu.

## Upravené soubory

Cesty jsou relativní ke kořeni repozitáře. Předchozí redesign Zakázek, dashboardu a detailu je součástí výchozí verze; seznam níže obsahuje změny tohoto navazujícího úkolu.

- `apps/iphone/NativeAPI/`: `APIAttendance.swift`, `APIAttendanceScreen.swift`, `APIAttendanceComponents.swift`, `APIAttendanceDayView.swift`, `APIAttendanceLogic.swift`, `APIAttendanceModel.swift`, `APIAttendanceFixture.swift`, `APIAttendancePreviews.swift` – rozhraní, výpočty, přístup k původním datům a výhradně testovací příklady.
- `apps/iphone/NativeAPI/`: `APIJobTime.swift`, `APIStore.swift`, `APITransport.swift` – společná projekce času, stávající šifrovaná cache/fronta a verze klientského kontraktu.
- `apps/iphone/NativeAPI/`: `APIJobsPresentation.swift`, `APIJobListRow.swift`, `APIJobsFilters.swift` – neduplicitní vlastní název práce a označení společných oborů.
- `apps/iphone/NativeAPI/APIFixture.swift`, `apps/iphone/Tests/APIAttendanceLogicTests.swift`, `apps/iphone/UITests/APIAttendanceUITests.swift`, `apps/iphone/UITests/NativeAPIUITests.swift`, `apps/iphone/project.yml` – původní testovací transport, nové scénáře, scrollování k líně načítanému obsahu a zahrnutí testů do projektu.
- `apps/work-diary/worker/attendance-detail.js`, `apps/work-diary/worker/attendance.js`, `apps/work-diary/worker/job-time.js` – zpětně kompatibilní rozšíření původních serverových funkcí a společného ledgeru.
- `apps/work-diary/db/schema.js`, `apps/work-diary/drizzle/0059_attendance_activities.sql`, `apps/work-diary/drizzle/meta/0059_snapshot.json`, `apps/work-diary/drizzle/meta/_journal.json` – bezpečné rozšíření stávající tabulky a migrační metadata.
- `apps/work-diary/scripts/build.mjs`, `apps/work-diary/scripts/test-attendance-detail-worker.mjs`, `apps/work-diary/tests/attendance-detail.test.js` – zahrnutí modulu do sestavení Workeru, skutečné D1/workerd ověření a serverové regresní testy.
- `.github/workflows/iphone.yml` – volitelný rozsah kontrol `attendance`; běžné vydání nadále provádí všechny testy. Kontrolní běh má nezávislou kontrolu, že nevznikla IPA.
- `docs/IOS-ATTENDANCE-JOBS-2026-11-20.md` – architektura, ověření a postup nasazení/návratu.

## Ověření

### Server a sestavení

Z adresáře `apps/work-diary`:

- `node --test --test-isolation=none tests/*.test.js` – **431/431**, žádné přeskočené testy. Obsahuje 7 nových integračních scénářů a původních 18 testů pracovní doby.
- `node scripts/build.mjs` – sestavení Workeru prošlo.
- `node scripts/test-attendance-detail-worker.mjs` – prošel skutečný sestavený Worker/workerd a D1, všech 60 migrací, přestávka bez fiktivní zakázky, idempotence, původní offline časy, audit/trigger odchodu, přechod z přestávky na skutečnou zakázku a serverová oprávnění.
- `node scripts/test-dashboard-worker.mjs` – původní dashboard/regrese oprávnění a nezávislého ukončení práce prošly nad workerd/D1.
- `node scripts/validate-artifact.mjs --allow-unbound` – prošla kontrola sestaveného Workeru v izolovaném testovacím prostředí. Parametr nepublikuje aplikaci; pracovní větev nemá svázaný produkční hosting.

Z kořene repozitáře prošly 4 testy politiky podpisu a 13 testů sestavení/simulátorů pomocí Python `unittest`.

### Nativní iOS

[Úplný kontrolní běh 44728896487](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44728896487), zdroj `83daa4f`:

- **123/123 nativních jednotkových testů**, **46/46 UI scénářů**; žádné chyby.
- UI sada zahrnuje 7 scénářů Docházky, 9 dashboardu, 6 detailu, 9 Zakázek a 15 původních nativních scénářů.
- Kompilace a testy iOS simulátoru, sestavení Apple Watch simulátoru a export nativních snímků prošly. Běh použil Xcode 26.6, iPhone 17 Pro / iOS 26.5 a Apple Watch Series 11 (46 mm) / watchOS 26.5.
- Kontrola nepřítomnosti IPA prošla; rovněž stažený archiv je bez IPA. Jeho SHA-256 `95dd89da7e5b4dd5578152c2f3e1b745b2a37215eec77bea817fd7999611eba9` byl ověřen.

Závěrečné změny `1d27f9d` / `911b4b3` deduplikují počet směn ke kontrole a přidávají součet za jednotlivé zakázky i kompaktní hlavičku dne. [Závěrečný cílený běh 44731574412](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44731574412), zdroj `911b4b3`, prošel: znovu **123/123 jednotkových testů a 7/7 UI testů Docházky**, kompilace iOS simulátoru i Apple Watch a kontrola nepřítomnosti IPA. Nový UI scénář ověřuje skutečný součet za zakázku a návaznou navigaci z časové osy.

Závěrečný archiv snímků a logů má ověřený SHA-256 `07112ea089e42e1fd96633b3fcada949291929f13b60c4ea6de649888f2a540b`; neobsahuje IPA. Zkontrolovány byly nativní snímky osobní docházky v tmavém režimu, týmu ve světlém, kalendáře, neukončené směny a kompaktního detailu s časem jednotlivých zakázek. Test velkého písma ověřuje přechod k přepínači měsíčního grafu; neprokazuje ruční čitelnost všech popisků či obsluhu VoiceOver.

Běhy používají `checks_only=true`, `sign_ipa=false`. Neprovádějí sestavení podepsaného balíčku pro fyzické zařízení. Snímky a logy jsou v artefaktech příslušných kontrolních běhů s názvem `PracovniDenik-builds-and-logs-CHECKS-ONLY-NO-IPA`.

### Rozsah a zbývající rizika

Produkční migrace a nasazení nejsou provedené. Nový backend vyžaduje migraci 0059; starý backend zůstává použitelný pro základní docházku a klient označí nedostupné podrobnosti. Pro aktivaci nových samostatných přestávek a jejich offline režimu je nutné nasadit kompatibilní server podle postupu výše.

Automatizované UI scénáře pracují s oddělenými testovacími příklady; nejsou důkazem provedení produkčního zápisu. Oprávnění a integrita databáze se ověřují také samostatnými serverovými testy nad SQLite a skutečným D1/workerd.

Fyzický iPhone, ruční VoiceOver, skutečné hovory/navigace a reálný výpadek připojení na zařízení nejsou vydávány za ověřené. Offline projekce, přetrvání operací v šifrovaném úložišti, opakované odeslání, změna dne a DST mají automatizované pokrytí. Před distribucí ještě ověřit skutečný telefon, ruční přístupnost a nasazení proti kopii produkčních dat. Kompilace pro simulátor sama nenahrazuje ověření podepsaného balíčku na zařízení.
