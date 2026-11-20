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
- Pracovní dny jsou od nejnovějšího. Detail obsahuje přítomnost, přestávky, čistý čas, práci, dopravu, výslovně zaznamenanou ostatní činnost a nepřiřazené úseky. Časová osa odkazuje přímo na původní detail dostupné zakázky.
- Správce přepíná vlastní docházku / tým; týmový přehled má statistiky, pracovníky, období, výběr pracovníka a kategorii. Obojí u pracovníků znamená členství v obou oborech. Údaje se filtrují na serveru a při výpočtu přehledu.
- CSV exportuje právě vybraný měsíc a povolené pracovníky. Používá UTF-8 BOM, středník, uvozovky a ochranu před interpretací textových polí jako vzorců. Uzavřený a průběžný čas jsou v oddělených sloupcích.
- Původní doplnění dne, návrh opravy/smazání, schválení/zamítnutí, GPS podrobnosti a historie oprav zůstávají dostupné podle původních oprávnění.

## Výpočty a integrita

Dny a měsíce se dělí v `Europe/Prague`; týden začíná v pondělí. Hranice dnů používají kalendář, nikoliv pevné násobky 24 hodin. Čas vychází z uloženého začátku/konce, nikoliv z běžících stopek. Minimalizace nebo restart nepřeruší měření.

Směny a činnosti se rozdělují na nepřekrývající se úseky. Stejné ID se deduplikuje podle verze. Překryvy jsou označené a nepřičítají hodiny podruhé. Úsek bez odpovídající aktivity zůstává nepřiřazený; nedostává smyšlenou náplň. Otevřené a čekající směny nejsou uzavřené měsíční hodiny. Přestávky se odečítají od přítomnosti; zakázkové hodiny se k docházce nepřičítají.

Předchozí neukončený den vyvolá upozornění s opravou, nikoliv automatický odchod o půlnoci. Skutečná směna přes půlnoc zůstane jedna. Dlouhé, překrývající se nebo neplatně seřazené záznamy se označí ke kontrole. Opravy dále procházejí původní žádostí a schválením s původní/novou hodnotou, autorem a časem.

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

## Ověření

Výsledky nativní kompilace, UI scénářů a posledního úplného kontrolního běhu budou doplněny po dokončení. Produkční migrace a nasazení nejsou provedené. Fyzický iPhone, ruční VoiceOver a skutečné hovory nejsou vydávány za ověřené.
