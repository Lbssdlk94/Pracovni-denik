# Menu detailu, přechody, mazání deníku a kompaktní Přehled

## Změny

1. Velikost písma položek menu detailu nyní odpovídá tlačítku Zavolat zákazníkovi (13 CSS px). Příčinou byla obecná pravidla `.modal-head button` s 25px písmem určeným zavíracímu tlačítku. Pravidlo je omezené na přímé tlačítko hlavičky; menu zůstává nejméně 48 px vysoké.
2. Odjezd, stav, úprava a protokol se z detailu načítají při otevřeném dialogu. Sdílený `dialog-view-changing` umožňuje bezpečně uvolnit předchozí obsluhy, rozpracovaný deník a pozorování velikosti bez zavírání okna. Návrat a zrušení i uložení stavu/úprav zůstávají ve stejném dialogu. Potvrzený odjezd přechází přímo na připravenou SMS. Chování tlačítek přímo ze seznamu zůstává zachované. Fotky, závady a upozornění zachovávají dosavadní způsob otevření.
3. Vlastník (`owner`) a administrátor (`administrator`) mohou po potvrzení smazat uložený denní zápis realizace. Běžný správce (`admin`), pracovník a čtenář toto právo nemají. Oprávnění se kontroluje na serveru a znovu v podmínce databázové změny. Zápis se označí jako smazaný, uloží se čas a autor smazání, zvýší verze a zapíše idempotentní operace. Z běžného deníku a historie zahrady zmizí; text a fotografie nejsou fyzicky odstraněné. Verze chrání před smazáním cizí novější změny. Starý offline zápis ani opakované odeslání nesmí obnovit smazané ID.
4. Velký blok s ikonou, nadpisem Pracovní deník a podtitulkem byl z Přehledu odstraněn. Horní značka firmy a ostatní funkce zůstávají.

## Ukládání a převod

Migrace `0056_job_diary_deletion.sql` přidává pouze nullable `deleted_at` a `deleted_by`. Žádná existující provozní data nemění na smazaná. Záznamy smazané uživatelem se filtrují také ve společné historii zahrady. Fotografie nadále podléhají původním oprávněním zakázky.

Mazání je vědomě online operace; nevytváří nový druh offline fronty. Klient po potvrzené odpovědi odstraní pouze danou položku ze svého indexu, i když by následné načítání selhalo. Neodeslané změny a fotografie jiných zápisů nemaže. Smazání zápisu s vlastní neodeslanou změnou vyžaduje nejdříve její vyřešení. Další zařízení zjišťují smazání při standardním obnovení deníku; stará offline kopie není vzdáleně okamžitě vymazaná. Konfliktní neodeslaný text zůstává v místním zařízení a server jej nemůže znovu zapsat pod smazaným ID.

Kanonické API a migrace jsou v Dr. Závlaze. Dr. Garden používá stejné API; jeho lokální zmrazená databáze se nemigruje a jeho server mimo vložená veřejná aktiva zůstává bajtově nezměněný.

## Ověření

- Celá dosavadní sada: 81 testovacích souborů bez selhání; syntaxe bez chyby. Rozšířená cílená sada deníku, jeho klienta a cache také prošla po přidání poslední kontroly odebraných rolí.
- Skutečné API na izolované databázi: vytvoření zápisu, mazání vlastníkem i administrátorem, zamítnutí dalších rolí a cizí zakázky, zastaralá verze, povinné potvrzení, opakování operace, audit autora/času, zachování fotografie, odstranění z historie zahrady, zákaz obnovení starým PUT a zastavení po odebrání role během požadavku. Stav zakázky se nemění.
- Klient: odstraní se jen správný indexovaný záznam; cizí neodeslané změny zůstávají; offline a nepřípustná role jsou odmítnuté.
- `scripts/test-detail-actions-browser.mjs`: skutečný Worker/D1/R2/IndexedDB a Chromium. Při úmyslném zpoždění GET o 400 ms nebyl zachycen žádný snímek se zavřeným dialogem ani nativní událost zavření během přechodů do odjezdu, stavu, úprav a protokolu a zpět. Ověřeno skutečné uložení stavu a času příjezdu, připravená SMS, zrušení i potvrzení mazání zápisu, audit, obnovení stránky bez smazaného zápisu a zachovaná fotografie. Font menu odpovídá volání na 360/390/430/1440 px při zachování dotykových ploch >=44 px.
- Původní prohlížečový test deníku znovu prošel: povinné fotografie, offline zápis a restart, obnovení po 502 bez duplicit, řešení konfliktů, oddělené pohledy, emulovaná klávesnice a rozměry do 1440 px. Jeho pomocný import cloud modulu byl aktualizován na přesnou novou offline verzi.
- Stejný nový prohlížečový postup prošel i proti výslednému artefaktu Dr. Závlahy. Obě sestavení prošla kontrolou izolované autentizace, instalace a zakázek. Produkční zakázky nebyly použity k testovacím zápisům nebo smazání.

Skutečný iPhone/Safari nebyl dostupný; šířky i klávesnice jsou emulované. Toto vydání mění web/PWA a společné API, nikoliv nativní SwiftUI aplikaci.
