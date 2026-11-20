# Nativní Přehled podle role – 2026-11-19

Pracovní větev `ui/ios-role-dashboards-2026-11-19` navazuje na ověřený SwiftUI detail (`e7b2b00`, 91 jednotkových + 21 UI testů). Žádná změna schématu, migrace dat nebo nová evidence docházky.

## Rozhraní

Správce (vlastník, administrátor a správce s existujícím oprávněním správy) má režimy Firma / Moje práce. Firma obsahuje čtyři souhrny, pracovníky v terénu, aktivní realizace a relevantní problémy. Pracovník má vlastní docházku, aktivní nebo nejbližší zakázku, její individuální akce, časovou osu a vlastní upozornění. Původní velké navigační dlaždice jsou odstraněny; pět záložek, oko a upozornění zůstávají.

Karty respektují Dynamic Type, systémové popředí a světlé/tmavé barvy. Liquid Glass používají navigace a pracovní akce. Přímé odkazy na zakázku otevírají detail bez přeskakování do seznamu. Detail skrývá Tab Bar podle předchozího zadání; samotný Přehled jej zachovává. Opraven je také směr oddělovačů řádků v detailu.

## Datový tok a oprávnění

Nový **čtecí** `GET /api/overview?mode=company|personal&discipline=all|irrigation|garden` skládá existující data. Staré API kontrakty jsou zachované. Společná projekce zakázky je extrahovaná do `job-projection.js`, takže se DTO ani ochrana pracovních poznámek nerozcházejí.

Firemní přehled je na serveru zakázán rolím bez oprávnění správy. Zakázky používají stávající `workspaceJobScope`, licence a členství v oborech; osobní seznam navíc vyžaduje přiřazení. Personál respektuje zvolený obor. Před vrácením odpovědi se znovu kontroluje živá role a revize pracovního prostoru. Super Admin nedostává nové oprávnění k firemním datům.

Pracovníci v práci vycházejí ze skutečných otevřených směn současných pracovních rolí. Firemní člověkohodiny jsou zaznamenaná práce na dostupných zakázkách, nepřičítá se k nim doprava ani podruhé docházka. Osobní hodiny nezahrnují kolegy. Staré zakázky bez intervalů nedostávají vymyšlené hodiny. Statistické součty nejsou omezeny stránkováním; mobilní časová osa dostává nejvýše 30 návštěv, nejprve ukazuje 8 a odkazuje na původní úplný seznam. Aktivní realizace mají limit 12 s odkazem na ostatní. Personál prvních 8, zbytek přes existující docházku.

Problémové součty sdílejí SQL filtry s původním seznamem zakázek (`attention`). Otevřené závady mají serverové filtry stavu, přiřazení a oboru. Oznámení a nepřečtený počet používají původní oprávněný seznam oznámení. Nevzniká e-mailová integrace ani nové automatické zprávy.

## Pracovní doba a docházka

Společný `APIAttendanceWorkflow` používá původní `/api/attendance/punch`, stabilní mutation ID, polohu a stávající ochranu před duplicitami. Sdílí ho původní Docházka i nová karta. Při změně účtu během GPS se zápis odmítne. Ukončení dne využívá existující serverové uzavření vlastního intervalu; nikdy automaticky neukončuje globální zakázku.

Přestávka, návrat, výjezd a vlastní ukončení práce používají původní `APIWorkTimeActionEditor`, verze pracovníků a šifrovanou offline frontu. Nevzniká nový docházkový systém. **Samostatná přestávka mimo zakázku v současném modelu neexistuje**: tlačítka přestávky jsou dostupná u probíhajícího vlastního intervalu. Příchod/odchod zůstává podle stávajícího kontraktu pouze online, protože server ukládá svůj skutečný čas; neodesílá se později s nesprávným časem. Offline pracovní intervaly nadále fungují.

## Výkon a offline

Jeden souhrnný HTTP požadavek místo načítání každé zakázky. Žádné další kontroly `/api/me` kvůli dashboardu. Živé počítadlo a přepočet času neprovádějí síťové požadavky. Stavové čtení pracovníků v původním `timeDetail` je převedeno ze dvou dotazů na osobu na dva hromadné dotazy. Dashboard používá kompaktní čtecí projekci pouze dnešních intervalů bez finančních sazeb, historie a schvalovacích záznamů. Podrobná evidence nadále vrací plný původní kontrakt.

Kompaktní projekce se nikdy neukládá jako úplná evidence. Novější potvrzené intervaly z původní cache mají přednost před starým souhrnem. Vlastní offline akce se projektují přes původní frontu; zvolená zakázka musí být dostupná v daném účtu. Neznámá aktivní zakázka se nevydává za jinou plánovanou návštěvu. Souhrn obsahuje čas snímku; offline a snímky starší než 90 sekund jsou označené jako uložené. Je uveden počet neodeslaných změn.

## Náhledy a ověření

`APIDashboardPreviews.swift`: správce světlý/tmavý, pracovník před příchodem, na cestě, během realizace, na přestávce, offline a velké písmo. Ukázky používají izolovaný testovací transport, nikdy produkční data. UI testy zachycují skutečné SwiftUI komponenty a jsou označeny jako ukázka.

Dosavadní ověření:
- Celá dostupná JS/backend sada po závěrečných změnách: **424/424**, 0 chyb (`node --test --test-isolation=none tests/*.test.js`).
- Následné cílené testy dashboardu, pracovní doby a zahradní historie: **30/30** po optimalizaci.
- Test s **302 zakázkami**: správný celkový počet, 30 položek v mobilní odpovědi, explicitní příznak zkrácení; zhruba 40 kB JSON. Naměřených 6 ms je výhradně test v paměťovém SQLite, nikoli produkční latence.
- Python: 13 testů sestavení simulátorů a 4 pravidel podepisování prošly.
- Xcode **26.6**, iOS SDK **26.5**, kontrolní běh [44616419970](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44616419970), zdroj `116897f`: **97 jednotkových + 30 UI testů**, 0 chyb. Kompilace iPhonu i Apple Watch prošla. `checks_only=true`, `sign_ipa=false`; krok podepisování a balení byl přeskočen, kontrola nepřítomnosti IPA prošla.
- Sestavení Workeru včetně nových ručně skládaných modulů a validace artefaktu prošly. `node scripts/test-dashboard-worker.mjs` prošel proti izolovanému workerd/D1/R2: skutečná obsluha endpointu, role, odfiltrování cizí zakázky a sazeb, osobní/souhrnné hodiny, filtry problémů a individuální ukončení.
- Snímky jsou přímo ze SwiftUI simulátoru, včetně světla/tmy, příchodu, cesty, práce, přestávky, offline fronty a chyby přehledu. Reálný iPhone fyzicky testovaný nebyl.

## Nasazení serveru a návrat

Společný backend na https://zavlahovy-denik.purplecedar.chatgpt.site má nasazenou verzi **149**, zdroj `25f285fdb97ffdf3b8fd26749b8ae859effd00ac`, deployment `appgdep_6aff6954576c8191af88409b4e0c63f5` se stavem `succeeded`. Revize prostředí **17** zůstala zachovaná. Dr. Garden používá existující podepsaný přenos všech `/api/` požadavků do tohoto společného backendu; jeho lokální starší databáze a Worker se nepřepisovaly.

Archiv obsahoval pouze `.openai/hosting.json` a `dist/server/index.js`. Žádné databázové migrace, změny provozních záznamů, přístupových údajů ani nastavení sdílení. Kontrola potvrdila shodu všech vložených webových souborů před/po sestavení. Webové rozhraní se tímto úkolem neredesignovalo.

Standardní helper pluginu Sites nebyl v prostředí dostupný. Zdroj byl proto ověřen a posunut běžným Git ff-only postupem s dočasným oprávněním předaným skrytě přes stdin a pouze procesní HTTP hlavičku; klíče se neukládaly do repozitáře nebo konfigurace. Uložení verze a publikaci provedly oficiální nástroje Sites. Při návratu lze nasadit předchozí uloženou verzi **148**, protože nevznikla změna schématu ani migrace dat.

Po nasazení vnější neautentizovaný kontrolní požadavek z tohoto prostředí odmítl Cloudflare kódem **403 / 1010** ještě před aplikací. Nejde o ověřenou latenci API ani o přihlášenou produkční zkoušku. Oprávnění a funkčnost endpointu jsou ověřené izolovanými integračními testy; produkční přihlášený průchod na telefonu zbývá ověřit.

## Zbývající omezení

- Nový iOS vzhled je na pracovní větvi; **nevznikla nová IPA a již nainstalovaná aplikace se sama nezmění**. Do telefonu se dostane s následným výslovně vyžádaným sestavením/vydáním.
- Přestávka mimo zakázku nemá v dosavadním API samostatný typ. Kvůli zachování jednoho systému se nevytváří další evidence; přestávka a návrat používají existující pracovní interval.
- Chybějící docházka se neodvozuje z domnělého směnového rozvrhu. Přehled upozorňuje na skutečné neukončené směny a čekající opravy; bez dat rozvrhu nelze spolehlivě tvrdit, že někdo měl přijít.
- Dynamické písmo je implementované a detail má UI scénář velkého písma; všechny fyzické velikosti telefonů a ruční VoiceOver průchod nebyly otestované.

## Upravené soubory

Přehled všech souborů od výchozí revize `9fc163d` zahrnuje i související nový detail zakázky:


- `apps/iphone/App/PracovniDenikApp.swift`
- `apps/iphone/NativeAPI/APIActions.swift`
- `apps/iphone/NativeAPI/APIAttendance.swift`
- `apps/iphone/NativeAPI/APIDashboard.swift`
- `apps/iphone/NativeAPI/APIDashboardComponents.swift`
- `apps/iphone/NativeAPI/APIDashboardFixture.swift`
- `apps/iphone/NativeAPI/APIDashboardLogic.swift`
- `apps/iphone/NativeAPI/APIDashboardPreviews.swift`
- `apps/iphone/NativeAPI/APIDashboardWork.swift`
- `apps/iphone/NativeAPI/APIFixture.swift`
- `apps/iphone/NativeAPI/APIJobActionBar.swift`
- `apps/iphone/NativeAPI/APIJobCompletion.swift`
- `apps/iphone/NativeAPI/APIJobDetailComponents.swift`
- `apps/iphone/NativeAPI/APIJobDetailContent.swift`
- `apps/iphone/NativeAPI/APIJobDetailPresentation.swift`
- `apps/iphone/NativeAPI/APIJobDetailPreviews.swift`
- `apps/iphone/NativeAPI/APIJobTime.swift`
- `apps/iphone/NativeAPI/APIResourceViews.swift`
- `apps/iphone/NativeAPI/APIRolePreview.swift`
- `apps/iphone/NativeAPI/APIRoot.swift`
- `apps/iphone/NativeAPI/APISchema.swift`
- `apps/iphone/Tests/APIDashboardTests.swift`
- `apps/iphone/Tests/APIJobDetailPresentationTests.swift`
- `apps/iphone/UITests/APIDashboardUITests.swift`
- `apps/iphone/UITests/APIJobDetailPreviewUITests.swift`
- `apps/iphone/UITests/NativeAPIUITests.swift`
- `apps/iphone/project.yml`
- `apps/work-diary/scripts/build.mjs`
- `apps/work-diary/scripts/test-dashboard-worker.mjs`
- `apps/work-diary/tests/dashboard.test.js`
- `apps/work-diary/worker/api.js`
- `apps/work-diary/worker/dashboard-filters.js`
- `apps/work-diary/worker/dashboard.js`
- `apps/work-diary/worker/garden-history.js`
- `apps/work-diary/worker/job-projection.js`
- `apps/work-diary/worker/job-time.js`
- `apps/work-diary/worker/jobs.js`
- `docs/IOS-JOB-DETAIL-REDESIGN-2026-11-19.md`
- `docs/IOS-ROLE-DASHBOARDS-2026-11-19.md`
