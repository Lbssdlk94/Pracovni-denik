# Nativní Přehled podle role – 2026-11-19

Pracovní větev `ui/ios-role-dashboards-2026-11-19` navazuje na ověřený SwiftUI detail (`e7b2b00`, 91 jednotkových + 21 UI testů). Žádná změna schématu, migrace dat nebo nová evidence docházky.

## Rozhraní

Správce (vlastník, administrátor a správce s existujícím oprávněním správy) má režimy Firma / Moje práce. Firma obsahuje čtyři souhrny, pracovníky v terénu, aktivní realizace a relevantní problémy. Pracovník má vlastní docházku, aktivní nebo nejbližší zakázku, její individuální akce, časovou osu a vlastní upozornění. Původní velké navigační dlaždice jsou odstraněny; pět záložek, oko a upozornění zůstávají.

Karty respektují Dynamic Type, systémové popředí a světlé/tmavé barvy. Liquid Glass používají navigace a pracovní akce. Přímé odkazy na zakázku otevírají detail bez přeskakování do seznamu. Detail skrývá Tab Bar podle předchozího zadání; samotný Přehled jej zachovává. Opraven je také směr oddělovačů řádků v detailu.

## Datový tok a oprávnění

Nový **čtecí** `GET /api/overview?mode=company|personal&discipline=all|irrigation|garden` skládá existující data. Staré API kontrakty jsou zachované. Společná projekce zakázky je extrahovaná do `job-projection.js`, takže se DTO ani ochrana pracovních poznámek nerozcházejí.

Firma je na serveru zakázána neprávním rolím. Zakázky používají stávající `workspaceJobScope`, licence a členství v oborech; osobní seznam navíc vyžaduje přiřazení. Personál respektuje zvolený obor. Před vrácením odpovědi se znovu kontroluje živá role a revize pracovního prostoru. Super Admin nedostává nové oprávnění k firemním datům.

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
- Celá dostupná JS/backend sada: **423/423** před závěrečnou optimalizací intervalů.
- Následné cílené testy dashboardu, pracovní doby a zahradní historie: **30/30** po optimalizaci.
- Test s **302 zakázkami**: správný celkový počet, 30 položek v mobilní odpovědi, explicitní příznak zkrácení; zhruba 40 kB JSON. Naměřených 6 ms je výhradně test v paměťovém SQLite, nikoli produkční latence.
- Python: 13 testů sestavení simulátorů a 4 pravidel podepisování prošly.
- Xcode kompilace a nativní scénáře: čeká na kontrolní GitHub běh s `checks_only=true`; žádná IPA.

Výsledky posledního nativního běhu, snímky a stav nasazení čtecího endpointu budou doplněny po ověření.
