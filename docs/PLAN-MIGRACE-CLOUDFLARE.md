# Plán bezpečné migrace Pracovního deníku na Cloudflare

Datum přípravy: 27. 11. 2026  
Stav: plán připraven; produkční aplikace ani data nebyly měněny.

## Zajištěná kopie zdrojového kódu

- Výchozí větev: `main`
- Výchozí commit: `4e0525660a65385e94840ec7aecbab11b8029cf6`
- Neměnná záložní větev: `backup/before-cloudflare-migration-2026-11-27`
- Pracovní větev pro přípravu: `migration/cloudflare-preparation`

Záložní větev zachycuje zdrojový kód k uvedenému commitu. **Neobsahuje produkční databázi, R2 soubory, hesla, relace ani tajné klíče.** Produkční data je nutné zálohovat zvlášť z aplikace.

## Co je v repozitáři už připraveno

Aplikace v `apps/work-diary` je sestavovaná jako ESM Cloudflare Worker a používá vazby na D1 (`DB`) a R2 (`BUCKET`). Kód obsahuje migrace databáze, šifrované úplné zálohy a obnovu i vlastní přihlášení jménem a heslem. Přihlášení přes hostingovou identitu zůstává kvůli přechodu podporované, dokud ji vlastník výslovně nevypne.

Repozitář popisuje každou firmu jako samostatnou instalaci s vlastní databází, R2 úložištěm, klíči a relacemi. Proto se nesmí cílová aplikace připojit ke stávajícímu produkčnímu D1/R2, sdílet jejich tajemství ani převzít jejich ID instalace bez ověřeného postupu obnovy.

## Doporučený postup

### 1. Zjistit přesný rozsah a uložit produkční zálohu

1. Potvrdit, kterou instalaci přesouváme (pravděpodobně Dr. Závlaha); Dr. Garden je samostatná instalace a do přesunu se nezahrne automaticky.
2. V deníku jako vlastník otevřít **Nastavení → Záloha a pomoc** a vytvořit **úplnou šifrovanou zálohu** včetně obnovovací sady. Uložit archiv a obnovovací sadu mimo GitHub a mimo cílový Cloudflare účet; heslo k obnovovací sadě uložit odděleně ve správci hesel.
3. Zapsat verzi databázového schématu, čas zálohy a kontrolní součty. Ověřit, že archiv obsahuje potřebné soubory a lze jej načíst. Zálohy Dr. Závlahy a Dr. Garden vést odděleně.
4. Před ostrým přepnutím udělat novou finální zálohu. Před ní synchronizovat offline změny všech zařízení a po dobu posledního převodu pozastavit zápisy.

### 2. Založit izolované Cloudflare prostředí

1. Zřídit nový Worker, novou D1 databázi a nový R2 bucket. Použít novou identitu instalace a nové náhodné šifrovací klíče. Zachovat přísné oddělení od původní instalace.
2. Připravit build a konfiguraci Cloudflare (včetně compatibility date, D1/R2 bindings, secrets, domény a případného cron běhu). Nepřidávat žádné tajné hodnoty do repozitáře ani do klientského kódu.
3. Nastavit autentizaci před zpřístupněním Workeru. Na veřejném Workeru se nesmí důvěřovat klientským `oai-authenticated-user-*` hlavičkám. Ověřit přechod na vlastní heslové účty, nastavit přístup vlastníka a bezpečně vyřešit zbylé legacy účty. Nechat aktivní jen serverem ověřený způsob přihlášení.

### 3. Obnovit a ověřit oddělenou kopii

1. Obnovit úplnou zálohu do prázdné cílové instalace s přesně odpovídajícím schématem a vlastními prostředky D1/R2 podle podporovaného postupu v `apps/work-diary/docs/PROVOZ-A-SAMOSTATNE-FIRMY.md`.
2. Starou produkční instalaci ponechat online, ale cílovou Cloudflare verzi držet jako neveřejné/staging prostředí bez reálných zápisů.
3. Ověřit počty a vazby záznamů, fotografie a soubory, uživatelské role, přihlášení, zálohu a obnovu, synchronizaci i offline fronty. Použít regresní a skutečné lokální Worker/D1/R2 ověření z `apps/work-diary/package.json`.
4. Ověřit doménu, HTTPS, iPhone/Safari, Android, push, Google Disk, e-mailová připomenutí a plánovače jednotlivě. Integrace závislé na původním Sites hostingu nebo jeho tajných hodnotách se nesmí prohlásit za funkční bez skutečného testu.

### 4. Přepnout až po zkoušce a zachovat návrat

1. Před přepnutím provést finální úplnou zálohu, krátce zastavit zápisy, dokončit převod a ověřit cílovou kopii.
2. Teprve potom změnit cílovou doménu / přístup uživatelů. Starou instalaci nemažte ani nepřepisujte; ponechte ji připravenou k návratu.
3. Po přepnutí ověřit skutečné přihlášení, zápis a čtení, nahrání souboru, offline synchronizaci a všechny plánované běhy.
4. Při problému vrátit směrování na původní instalaci. Pokud už se na Cloudflare zapisovalo, nejdřív uchovat novou zálohu a vyřešit rozdílné změny; prosté přepnutí zpět by jinak mohlo ztratit nové záznamy.

## Co zatím brání ostrému převodu

- Není ověřeno, který Cloudflare účet, zóna/doména a produkční instalace mají být cílem.
- GitHub poskytuje zdrojový kód, nikoli produkční D1/R2 obsah ani tajné hodnoty.
- Je třeba potvrdit, že existuje aktuální obnovitelná úplná záloha aplikace a že cílové Cloudflare prostředí může bezpečně převzít její data.
- Je nutné sestavit a ověřit Cloudflare konfiguraci a přihlašovací hranici. Samotné zveřejnění Workeru s důvěrou v hlavičky původního hostingu není bezpečný migrační postup.
- Součástí tohoto plánu není přesun Super Admina ani automatické zakládání firem.

## Bezpečnostní hranice

Dosud se vytvořily pouze dvě GitHub větve a tento plán. Nebyla změněna větev `main`, žádný produkční deployment, databáze, R2 bucket, DNS, uživatelský účet ani heslo. Žádná provozní záloha nebyla stažena ani obnovena.


## Nově zjištěná větev asistenta

Při kontrole 27. 11. 2026 byla nalezena větev `assistant-zaklad` na commitu `6b6fd97b6ebf5866641c1d768e1a99f54de2b87c`. Je o 8 commitů napřed oproti `main`; merge ani pull request do `main` nebyl nalezen. Záložní větev a tato migrační větev proto zatím obsahují původní stav z `main`, nikoli tyto novější funkce.

Větev přidává asistenta ve webové a iOS aplikaci, lokální rozpoznávání českých příkazů, čtení přes současné API, plánování zakázek a docházku, práci s katalogovým materiálem a import zákazníků/materiálu z CSV. Podle commit popisů zápisy čekají na výslovné potvrzení a audit. Změny zahrnují `apps/work-diary/worker/assistant.js`, `web/assistant-*.js`, testy a iOS obrazovku.

Před jakýmkoli buildem určeným pro Cloudflare je třeba rozhodnout, zda se tato větev nejdřív zkontroluje a začlení. Nasazení z původního `main` by funkce asistenta neobsahovalo. Tato kontrola byla read-only; větev `assistant-zaklad` nebyla upravena ani sloučena.
