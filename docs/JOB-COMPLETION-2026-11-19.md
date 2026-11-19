# Procenta dokončení a denní posun

Web: v detailu zakázky je karta **Dokončení zakázky**. Přiřazený pracovník, správce, administrátor nebo vlastník upraví celé procento 0–100 a může připojit poznámku k postupu či důvod pomalejší práce. U odhadu je serverem doplněný autor a čas. Čtenář odhad vidí, nemění jej. Přístup vždy navazuje na existující přiřazení, licenci a obor Garden/Závlaha; kontroluje jej backend i při souběžné změně role. Náhled rolí nic neukládá.

Stejný odhad se ukazuje na kartách zakázek, tedy také v pohledu **Seznam → Celý tým** pro správce. Nezadaný odhad se zobrazuje jako nezadaný, ne jako 0 %. Zadání 100 % nemění stav zakázky, nezačíná ani nekončí člověkohodiny a nevytváří novou zakázku ani návštěvu.

## Denní barvy

Podle výslovné volby uživatele je výchozí hranice **20 procentních bodů**. Příklad: předchozí den 10 %, nový den 12 % → červeně „Malý posun · +2 p. b.“; 10 % → 30 % → zeleně „Posun +20 p. b.“. Zobrazuje se i datum výchozího odhadu. Správce, administrátor a vlastník mohou hranici u konkrétní zakázky změnit v rozbalovacím nastavení (1–100 bodů). Pracovník ji měnit nemůže.

Porovnávají se poslední dva kalendářní dny se zaznamenaným odhadem, v časovém pásmu Europe/Prague. První den je neutrální. Opakované změny během téhož dne se stále porovnávají s konečným odhadem předchozího zaznamenaného dne. Čtení aplikace, víkend ani den bez nového odhadu žádný záznam nevytvoří a barvu automaticky nezhorší. Při mezeře mezi zápisy je výchozí datum viditelné; nejde o automaticky měřenou produktivitu za každý kalendářní den. Odhad 100 % má zelené označení, i když zbývající část byla menší než denní hranice. Snížení odhadu je možné a má samostatný textový popisek. Procenta jsou orientační odhad zakázky.

Poznámka je viditelná u aktuálního odhadu a v jeho detailu. Předchozí změny, poznámky a autoři zůstávají v auditní tabulce; obsah původního Deníku realizace a pracovních výkazů zůstává zachovaný.

## Ukládání, souběh a mezipaměť

Odhad a nastavení hranice mají vlastní nezávislé verze. Při konfliktu se zadané údaje nesmažou: ukáže se aktuální serverový odhad a jeho přepsání vyžaduje výslovné potvrzení. Jedna operace má stabilní identifikátor a serverový hash; stejné opakování nezapisuje odhad podruhé. Autor, den a čas pocházejí ze serveru. CHECK podmínka v atomickém D1 batchi ověřuje živá oprávnění i aktuální verzi před zápisem.

Po změně se zvýší původní revize zakázky, takže stávající kalendáře, měsíční kopie a synchronizační manifest rozpoznají aktualizaci. Samotné plánování, stav a přiřazení se nemění. Aktualizuje se karta v seznamu i otevřený detail, bez návratu na jinou stránku. Rozepsaný odhad používá existující lokální koncepty; může se obnovit po restartu. Potvrzení odhadu nebo změny hranice vyžaduje připojení. Offline koncept se nevydává za sdílený záznam.

## Server a migrace

- `PATCH /api/jobs/:id/completion`: `operationId`, `version`, `percent`, volitelně `note`.
- `PATCH /api/jobs/:id/completion-target`: správcovská změna `operationId`, `version`, `points`.
- Stávající job DTO navíc vrací `completionPercent`, `completionVersion`, autora/čas/den, `completionBaselinePercent/Day`, `completionNote`, `completionTargetPoints/Version`.
- Aditivní migrace `0058_job_completion.sql` přidává `job_completion`, `job_completion_targets`, `job_completion_events`. Nevytváří domnělá historická procenta a nemění původní řádky zakázek. Drizzle snapshot a seznam přenositelných tabulek jsou doplněné.

Nasazení: kanonický Dr. Závlaha používá kompletní balíček s kořenovým `drizzle`, `db` a zachovaným hostingovým manifestem. Garden dostává pouze Worker/manifest s novými webovými prostředky; jeho dřívější databázové migrace se znovu nespouštějí. Datové zápisy byly testované pouze na syntetických datech. Při návratu k předchozí aplikační verzi nové tabulky ani audit nemažte; předchozí aplikace je nevyužívá. Nová provozní záloha nebyla v tomto úkolu vytvořena; pokračuje dřívější uživatelovo rozhodnutí pracovat bez ní.

## Příprava iOS — bez nové IPA

SwiftUI komponenty v `APIJobCompletion.swift` zobrazují procenta, barevný posun, autora a poznámku v detailu i seznamu. Připravené jsou nativní formuláře pro odhad a správcovskou hranici, řešení konfliktů, využití existujících šifrovaných konceptů a bezpečná aktualizace verze měsíční mezipaměti. Doplněné jsou izolované fixture endpointy a testy modelu.

**GitHub Actions ani sestavení IPA se v tomto úkolu nespouštějí.** Zdroj se ukládá na samostatnou větev s `[skip ci]`. V prostředí není Xcode; nové SwiftUI změny a přidané Swift testy nejsou zkompilované ani spuštěné. Do nainstalovaného iOS klienta se dostanou až s budoucím vydáním.

## Provedené kontroly

- Plná webová regrese: 87 testovacích souborů prošlo.
- Samostatně 10 regresních scénářů odhadu: role a přiřazení, Garden/Závlaha a read-only pracovní prostor, náhled rolí, vypnutý modul, 0/100 a neplatné vstupy, denní hranice a stejnodenní úpravy, identifikace autora, atomické souběhy, opakování, nezávislý stav/docházka a aditivní migrace.
- Skutečný sestavený Worker + izolovaná Miniflare D1/R2 a prohlížeč: red/green příklady, poznámka, přepsání až po porovnání, konfigurace hranice, obnovení offline konceptu po restartu a opětovném připojení, aktualizovaný seznam, zachovaný stav zakázky; 360/390/1280 px bez vodorovného přetečení a tlačítka nejméně 44 px.
- Syntaktická kontrola, přesné offline importy a čistý instalační balíček včetně schématu.

Neověřeno: fyzický iPhone/Safari, kompilace nové nativní verze v Xcode a ukládání pod skutečnými provozními účty. Zápisové produkční testy nebyly prováděny.
