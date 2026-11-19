# Uložený adresář zákazníků a zahrad

Větev `feat/offline-directory-2026-11-19` navazuje na přípravu bublinového iOS rozhraní. Rozšíření nevyžaduje databázovou migraci ani nová API oprávnění. Nepřepisuje provozní data.

## Co se ukládá

Všechny zákazníky a zahrady, které vrátí současné autorizované seznamy: kontakty, adresy a dostupné základní údaje, původní ID i propojení zákazníka na více zahrad. Seznam zákazníků se stahuje po všech stránkách, nikoli jen prvních 100 záznamů. Nejsou automaticky stahovány fotografie, dokumenty, servisní protokoly ani kompletní pracovní historie.

Web používá samostatný klíč `directory-cache-v1` ve stávajícím IndexedDB. SwiftUI klient používá `directory-snapshot-v1` ve stávajícím šifrovaném APIVaultu; nevzniká další databáze. Snapshot se publikuje až po úplném stažení a kontrole. Přerušení mezi stránkami nepřepíše dobrou kopii neúplným seznamem.

## Rychlost a synchronizace

Po ověření relace se adresář přednačítá na pozadí. Při prvním online použití v novém procesu je potřeba potvrdit dostupný rozsah, další otevření už ověřené kopie zobrazí místní data okamžitě. Po dvou minutách může současně proběhnout jediná sdílená aktualizace; neúspěšná automatická aktualizace má třicetisekundovou pauzu. Ruční obnovení může vynutit aktuální data.

Vyhledávání podle jména, kontaktu nebo adresy a stránkování fungují i nad úplným uloženým adresářem. Základní detail zákazníka obsahuje propojené dostupné zahrady. Nové zakládání a úpravy zákazníků/zahrad nadále vyžadují připojení. Nedochází ke změně současné fronty pracovních zápisů, fotografií ani konceptů.

## Oprávnění

- Webový snapshot je svázaný s účtem, instalací, workspace, rolí, oprávněními, moduly, verzí autorizace, obory a vybraným oborem. iOS využívá již existující stejně vymezený šifrovaný vault.
- Serverové filtrování zákazníků a zahrad se používá beze změny; nevzniká neomezený export nebo nový přístup k cizím datům.
- Při úplném online stažení existující `/api/workspace/manifest` ověřuje kontext a stejný stamp před a po všech stránkách. Nejde o opakované přihlašování nebo `/api/me` před každým kliknutím.
- Změna známého stampu nedovolí návrat ke starému adresáři při následném výpadku. Odpovědi 401/403/404/409 při obnovování kopii zneplatní; zpožděný výsledek starého účtu nesmí publikovat do nového kontextu.
- Změna zákazníka, zahrady, přiřazení nebo pravidel přístupu ruší příslušnou kopii. Náhled jiné role nepoužívá skutečnou privilegovanou kopii.
- Offline dostupnost podléhá dosavadnímu ověření oprávnění a licence, nejvýše 24 hodin; uložený adresář také není offline poskytován po více než 24 hodinách bez úspěšného stažení. Zcela offline zařízení nemůže okamžitě zjistit změnu oprávnění provedenou jinde.
- Při nedostatku místa se úspěšně načtená online data mohou zobrazit i bez uložení; metadata kopie to označují. Není tím zaručená dostupnost po restartu.

## Ověření

Prošlo 83 backendových a klientských testovacích souborů v izolovaném prostředí. Nový soubor obsahuje 11 konkrétních scénářů: 305 zákazníků a zahrad, všechny stránky, lokální hledání, více zahrad, nová instance cache bez sítě, vypršení lease, oddělení účtů/rolí/oborů, neúplné stažení, skutečné odmítnutí serverem, změna oprávnění uprostřed stahování, okamžitá uložená kopie s obnovou na pozadí a nedostatek místa. Prošly také syntax kontroly a izolované ověření obou sestavených Workerů.

Pro iOS je připraveno pět XCTest scénářů v `APIDirectoryCacheTests.swift`. Na výslovné přání uživatele nebylo spuštěno GitHub sestavení ani vytvořena nová IPA. SwiftUI část tedy není nyní ověřena kompilací, XCTest nebo na skutečném iPhonu. V tomto prostředí neproběhl ruční test Safari/PWA; provozní zakázky ani kontakty nebyly kvůli testování měněny.

## Nasazení

Webové sestavení obsahuje pouze změnu frontendu. Backend mimo vložené webové soubory zůstává byte shodný s předchozí verzí. Archiv neobsahuje kořenové migrace a nespouští historické migrace Garden. Přesná čísla publikovaných verzí budou doplněna po nasazení. Service Worker používá cache `zavlahovy-denik-offline-directory-v1`.

iOS zdrojový kód se ukládá na GitHub s `[skip ci]`, na samostatnou větev. Workflow ani číslo verze se nemění; v nainstalované IPA se změna projeví až po pozdějším sestavení a instalaci nové verze.
