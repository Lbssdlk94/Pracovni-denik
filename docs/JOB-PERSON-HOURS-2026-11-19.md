# Individuální pracovní doba na zakázkách

## Chování

V detailu zakázky je rozbalovací **Pracovní doba**. Zobrazuje pracovníky a jejich aktuální činnost, začátek a průběžnou délku intervalu, součet práce v člověkohodinách, dopravu a přestávky zvlášť. Podrobnosti obsahují jednotlivé dny a osoby, ukončené intervaly, schvalování/opravné návrhy a historii. Finanční přehled a volitelné individuální nákladové sazby vidí pouze vlastník, administrátor a správce. Zelená znamená práci, modrá dopravu, oranžová přestávku, šedá ukončení; všude zůstává text.

Přihlášený pracovník měří sebe. Správce nebo přidělený vedoucí zakázky může vybrat více lidí, zahájit dopravu/práci, přerušit či ukončit jejich intervaly, přidat dalšího kolegu nebo přesunout vybrané lidi na jinou dostupnou aktivní zakázku. Přesun skupiny smí vedoucí provést jen mezi zakázkami, které vede; nové přiřazení k cíli vyžaduje správce. Používají se původní kontroly přiřazení, oboru a potvrzení převzetí. Vedoucí nezískává finanční údaje ani možnost měnit firemní role.

Výjezd zavře předchozí činnost a začne dopravu. Zahájení práce zavře dopravu/přestávku a otevře práci. Ukončení vlastní práce ani odchod posledního člověka nezmění zakázku na Hotovo. Opětovné zahájení vytvoří další interval. Dokončení celé zakázky zůstává výslovnou společnou akcí a vyžaduje nejprve ukončení otevřených intervalů kolegů. Formulář protokolu, vyúčtování a jeho schvalování zůstávají zachované.

Při přechodu na jinou zakázku je nutné potvrdit zavření předchozího intervalu. Jeden člověk nemůže současně evidovat práci/dopravu/přestávku na dvou zakázkách. Výjezd skupiny nabízí jednu původním způsobem připravenou SMS; neodesílá zprávy na pozadí ani za každého člověka zvlášť.

## Docházka, opravy a náklady

Interval odkazuje na původní `attendance_shifts`. Otevřená směna se použije znovu; pokud není, první akce ji založí s pravdivým GPS stavem `unavailable`. Nevzniká druhý docházkový systém. Odchod v docházce ukončí navázaný otevřený interval, ale nedokončí zakázku. Přehled docházky rozděluje celkovou dobu na zakázky, dopravu, přestávky, ostatní a nerozřazenou dobu; jednotlivé části se nepřičítají podruhé.

Zpětné doplnění nebo oprava uzavřeného intervalu má důvod a prochází návrhem a schválením podle existujícího docházkového postupu. Návrh sám nemění schválená data. Původní hodnota, nová hodnota, autor a čas schválení zůstávají v historii; upozornění používají stávající inbox/push distribuci a opětovně kontrolují přístup. Návrh musí patřit do existující směny. Chybějící směnu nejdříve doplňte v Docházce. Smazání nebo zkrácení směny přes navázané intervaly je zablokované; nejprve je třeba uvést do souladu evidenci zakázky.

Sazba práce/dopravy se ukládá v haléřích a zachytí se do nového intervalu. Pozdější změna sazby nepřepočítá historii. Nezadaná sazba znamená neoceněné hodiny, nikoli nulový náklad. Při opravě druhu činnosti se neznámá historická sazba nedosazuje podle dnešního nastavení. Interní náklady se nepletou se zákaznickými cenami stávajícího protokolu.

## Data a souběh

Aditivní migrace `0057_job_person_hours.sql` přidává intervaly, verze osob, identifikátory operací, historii, návrhy oprav, sazby a vedoucí zakázky. Nemění původní historické hodiny a neodvozuje je zpětně z globálního stavu zakázky. Doplněn je odpovídající Drizzle snapshot a manifest přenositelných tabulek.

Částečný unikátní index a překryvové triggery vynucují jediný otevřený/nepřekrývající se interval člověka. D1 batch s CHECK podmínkou atomicky ověřuje verze osob, živou roli, přiřazení, obor, stav zakázky a docházku ještě před zápisem. Při konfliktu se vrátí 409 a celá změna se vrátí zpět, včetně případně zakládané směny. Operace má neměnný identifikátor a hash; opakování stejného požadavku nevytváří další hodiny, audit ani upozornění. Zastaralý globální stav nesmí předčasně ukončit individuální interval. Před odesláním soukromých sazeb/historie se znovu kontroluje živá role a dostupnost zakázky.

Garden používá společné kanonické API; podepsaná obálka propojení přenáší i příznak podpory nové evidence. Oddělené instalace nadále používají oddělené databáze a stávající kontroly firmy. Ve společném pracovním prostoru se uplatňují obor a přiřazení. Čas na nepřístupné jiné zakázce je v odpovědi anonymizován jako jiná činnost bez jejího identifikátoru.

## Offline a kompatibilita

Web používá stávající IndexedDB `serviceWork`, iOS stávající šifrovaný APIVault a frontu. Každá akce má původní čas a očekávané verze pracovníků. Při obnovení spojení se nejprve odešlou starší změny stejných lidí; novější kliknutí je nesmí přeskočit. Zpožděný GET nesmí přepsat novější potvrzený stav. Konflikt se uchová pro porovnání, nepřepisuje automaticky server a při opakování nemění původní čas. Změna oprávnění využívá existující odnětí místních dat a zabezpečenou obnovu neodeslané práce. Běžící stopky nejsou zdrojem pravdy.

Offline práce vyžaduje platný stávající grant a předem autorizovanou kopii zakázky/pracovní doby. Web přednačítá pracovní dobu nejbližších nejvýše osmi přiřazených návštěv společně se servisními údaji. Akce starší než 24 hodin se automaticky neaplikují; zůstávají k vyřešení jako zpětná oprava. Ruční návrhy mohou pokrýt nejvýše sedm dní na jeden interval a vyžadují existující docházku. Sazby, schválení, nové přiřazení a vedoucí vyžadují připojení.

Nové webové a nativní zdroje posílají `x-work-time-client: v1`. Instalovaný starší klient bez příznaku zachovává dosavadní stavový postup a nezačne skrytě měřit intervaly, které neumí ovládat. Nové explicitní `/time` API funguje nezávisle na příznaku; globální dokončení vždy chrání existující otevřené intervaly. Měsíční mezipaměť se při upgradu zneplatní podle verze formátu, bez zahození konceptů/fronty. **Nevytváří se nová IPA**; připravený GitHub běh `checks_only=true` sestavuje a testuje simulátory a kontroluje nepřítomnost IPA.

## Ověření

Všechny mutace při testech používají syntetická data / izolovanou SQLite a Miniflare D1/R2, žádné provozní zakázky.

- `tests/job-time.test.js`: individuální i skupinové akce, návrat/přestávka, restart čtení, nezávislé ukončení, přesun a přidání kolegy/vedoucí, 62 člověkohodin, náklady a historie sazeb, návrh/schválení/notifikace, atomické konflikty/verze/živá role, směna a její ochrana, Garden/Závlaha, read-only pracovní prostor, kompatibilita starého klienta, odnětí role během finančního čtení.
- `tests/job-time-client.test.js`: trvalá fronta a restart klienta, přesné původní časové údaje, idempotentní synchronizace, přechod mezi zakázkami, konflikty, účty/role/lease, odnětí oprávnění, zpožděné GET a pořadí starší offline / novější online akce.
- `scripts/test-job-time-browser.mjs`: skutečný sestavený Worker + D1, hromadné zahájení, samostatné ukončení, offline přestávka, skutečné nové načtení PWA přes Service Worker, automatická synchronizace, zachování detailu a stavu zakázky; šířky 360/390/1280 px bez vodorovného přetečení a s dotykovými cíli nejméně 44 px.
- Stávající plná regrese, syntaktická kontrola, kontrola přesných offline URL a sestaveného artefaktu se spouštějí před vydáním. Plná regrese prošla ve všech 86 testovacích souborech. Samostatně prošlo 18 serverových a 7 klientských regresních scénářů nové evidence. Prošly také oba sestavené instalační artefakty, test přesných offline importů a uvedený mobilní/desktopový prohlížečový scénář nad kanonickým produkčním sestavením.

Neověřené: fyzický iPhone/Watch a skutečné odeslání SMS mobilním operátorem; vizuální kontrola Safari na zařízení. Nová nativní verze vyžaduje pozdější sestavení a instalaci IPA, které nyní není spuštěné. Nová úplná provozní záloha nebyla v tomto běhu vytvořena; původní uživatelovo rozhodnutí pokračovat bez ní zůstává zachované.

## Nasazení a návrat

1. Zachovat předchozí živé verze a zdrojové commity obou instalací. Ověřit kompletní artefakt a izolovanou migraci.
2. Kanonický Dr. Závlaha: zabalit přes `scripts/package-workspace-release.mjs`, včetně kořenových `drizzle`, `db` a `.openai/hosting.json`. Novou migraci neaplikovat ručně na produkční zakázky. Sites uplatní jen dosud neprovedenou migraci.
3. Garden: nasadit sestavený Worker s novými webovými prostředky a minimální změnou podepsaného přenosu příznaku klienta. **Do jeho archivu nepřibalovat historické kořenové migrace ani novou 0057**; lokální historická databáze Garden je po propojení vyřazená a změny evidence patří do kanonické databáze.
4. Před uložením verze pushnout přesný zdrojový commit. Zachovat publikum webů a vazby na existující DB/bucket/tajné údaje.
5. Návrat: znovu nasadit předchozí uloženou aplikační verzi; nové tabulky ponechat zachované. Starší aplikace je ignoruje. Pokud se musí během návratu obnovit aplikace, nejprve zastavit nové zápisy, zachovat a exportovat nové intervaly/fronty; tabulky ani staré provozní záznamy se při návratu nemažou. Starší klient nemusí umět ovládat nově otevřené časovače, proto rollback koordinovat se správci a předchozí nové intervaly bezpečně ukončit. Žádná ztrátová down migrace není součástí vydání.

## Kontrolní běh iOS

[GitHub Actions 44512110475](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44512110475) na zdroji `cfa9c9e`: 82 jednotkových testů a 14 testů ovládání prošlo, včetně nové nativní pracovní doby, 62 člověkohodin, offline fronty a mezipaměti. Sestavení simulátoru Watch prošlo. Závěrečná kontrola potvrdila, že nevznikla žádná IPA. Nativní soubory a kontrolní workflow jsou v konečném zdroji totožné s ověřeným commitem. Exportované snímky nebyly v tomto prostředí vizuálně zkontrolovány.

Správce/vedoucí může opravovat také existující uzavřený interval dřívějšího pracovníka po změně obsazení zakázky. Samotná oprava pracovníka znovu nepřiřadí a neobnoví jeho přístup k zakázce. Pro nové doplnění nadále platí současné přiřazení a stávající docházka.
