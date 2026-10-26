# Jednorázový import zakázek

`POST /api/maintenance/approved-job-import` je ve výchozím stavu vypnutý (404).
Slouží pouze k provedení přesné dávky schválené vlastníkem a vložené do
serverového tajemství `APPROVED_JOB_IMPORT`. Nepřijímá data ani identitu v těle
požadavku a neposkytuje přístup k jiným API. Nemění přihlášení uživatelů.

Serverová dávka obsahuje `id`, SHA-256 `tokenHash` náhodného 256bitového tokenu,
krátkou platnost `expiresAt`, `assigneeEmail` a pole `customers`, `gardens`, `jobs`.
Token se předává jen v hlavičce Authorization, nikdy v URL. Zákaznické údaje ani
token nepatří do zdrojového kódu, migrací či veřejných souborů. Tělo se nahrává
výhradně prostřednictvím správy runtime secrets vlastníka aplikace.

Zákazníci mají stabilní ID telefonů a adres; zakázky odkazují na konkrétní adresu
a zahradu. Dávka je pouze přidávací, existující záznamy nepřepisuje. Databázová
transakce zahrnuje všechny záznamy, kontroly členství, notifikace a potvrzení
importu v settings. Opakování stejné dávky nevytvoří duplicity. Konflikt ID
vrátí chybu a vrátí zpět celou dávku; nesmí se řešit náhodnou změnou ID a novým
pokusem bez kontroly existujících záznamů. Existující zákazníci se neslučují podle
samotného jména.

Po ověření živých záznamů okamžitě odstraňte `APPROVED_JOB_IMPORT` z runtime
konfigurace a nasaďte uloženou verzi s novou konfigurací. Záznam dokončené dávky
ponechte pro ochranu před opakováním. Role pracovníků a přístup ke kontaktům
nadále kontrolují běžná API aplikace.
