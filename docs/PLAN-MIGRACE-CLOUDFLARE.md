# Příprava testovací migrace deníku na Cloudflare

Datum: 27. 11. 2026  
Stav: zdroj a postup ověřeny; Cloudflare účet ani produkční data zatím nebyly změněny.

## Přesný zdroj pro test

Testovací nasazení vychází z commitu **`9e80f6c731b28ef20e69d8974304c25b42bdcc5c`** na větvi `feat/assistant-create-records`. Commit synchronizuje zdroje živého Závlahového deníku v182 a Dr. Garden v101. Obsahuje také asistenta a hromadný import zákazníků a dodavatelů.

Pro jistotu jsou zachované tyto větve:

- Kopie zdrojů před migrací: `backup/before-cloudflare-migration-2026-11-27` (původní `main`).
- Kopie přesného testovacího zdroje: `backup/cloudflare-test-9e80f6c-2026-11-27`.
- Pracovní větev testu: `migration/cloudflare-test-9e80f6c`.

Žádná z nich nemění `main` ani stávající Sites nasazení. Kopie v GitHubu není záloha produkční databáze ani R2 souborů.

## Postup testu

### 1. Založit oddělený testovací backend

1. Na novém Cloudflare účtu vytvořit testovací Worker, novou prázdnou D1 databázi (`DB`) a nový prázdný R2 bucket (`BUCKET`).
2. Sestavit `apps/work-diary` z výše uvedeného commitu a připravit Wrangler konfiguraci pro Worker, D1 a R2. Konfigurace a tajemství zůstanou mimo zdrojový kód; použít oddělené testovací hodnoty a doménu.
3. Spustit databázové migrace z daného commitu pouze na nové prázdné D1. Nejpoužívat původní Sites DB ani existující R2.
4. Na prázdné instalaci ověřit načtení aplikace, vlastní přihlášení, základní čtení/zápis, nahrání a načtení testovacího souboru. Nepoužívat skutečná zákaznická data.

### 2. Připojit obě webové varianty k testovacímu API

1. Závlahový web sestavit z `apps/work-diary/web`.
2. Dr. Garden web vytvořit podle `apps/work-diary/deployments/dr-garden/README.md`: zkopírovat společný `web/`, překrýt třemi soubory z `deployments/dr-garden/web` a vynechat `volume-test-photo-1.jpg` a `volume-test-photo-2.jpg`.
3. Oba testovací weby nasměrovat na tentýž testovací Worker/API podle ověřené konfigurace daného commitu.
4. Ověřit, že každý web zobrazuje jen odpovídající zakázky a kontakty podle oboru Závlaha/Garden. Otestovat také dodavatele, zákazníky, asistenta a import CSV. Zdrojový návod uvádí, že import může obsahovat až 250 profilů, 5 000 řádků a soubor do 1 MB; při importu se ukáže náhled a data se zapíší až po potvrzení.
5. Načíst testovací weby na iPhonu a ověřit synchronizaci a offline frontu proti testovacímu backendu.

Poznámka k architektuře: README varianty Dr. Garden říká, že současný Garden web předává API požadavky do Závlahového deníku a že sdílený Worker/migrace pocházejí ze Závlahového deníku v182. Test má proto výslovně potvrdit správné oddělení dat podle oboru před obnovou skutečných dat.

### 3. Obnovu skutečných dat dělat až do stagingu

1. Vlastník předá aktuální zálohu databáze ze Sites a kopii příslušných fotek a příloh. Pokud se použije úplná šifrovaná záloha deníku, uchová se obnovovací sada a heslo odděleně. Zálohy obou značek vést odděleně.
2. Obnovit ji do odděleného stagingového Workeru/D1/R2. Neobnovovat do produkčních nebo sdílených prostředků a neukazovat staging běžným pracovníkům jako ostrý deník.
3. Porovnat počty profilů, zákazníků a dodavatelů, jejich kontakty a obory, zakázky a vazby, soubory/fotografie, oprávnění a audit. Na iPhonu ověřit přihlášení a synchronizaci. Ověřit také návrat na původní Sites, dokud staging ještě nemá nezávislé změny.

### 4. Ostré přepnutí ponechat jako samostatnou pozdější fázi

Ostré přepnutí není součástí testu. Až staging projde ověřením, naplánovat okno údržby: nejdřív synchronizovat offline zápisy všech telefonů, krátce zastavit zápisy do Sites, pořídit finální zálohu a její soubory, obnovit čerstvá data, zkontrolovat a teprve pak nasměrovat oba weby i iPhone na nový API endpoint. Sites ponechat dostupný pro návrat. Pokud se do Cloudflare už zapíše, před návratem pořídit další zálohu a vyřešit rozdílné změny.

## Co je potřeba před skutečným během

- Přístup ke Cloudflare účtu kolegy nebo jeho vlastní nasazení. Cloudflare připojení v tomto prostředí není dostupné.
- Záloha databáze a soubory z Sites. V repozitáři ani v záložních větvích nejsou.
- Doména/URL pro testovací Worker a weby; testovací tajemství a provozní plánovače se nastavují pouze v Cloudflare.
- Po testu schválený čas a postup produkčního přepnutí. Do té doby zůstává aktuální Sites provoz zdrojem pravdy.

## Kontrola změn

Při kontrole větve `feat/assistant-create-records` byl potvrzen výše uvedený commit a soubor `apps/work-diary/deployments/dr-garden/README.md`. Tato migrační příprava pouze vytváří oddělené reference a tento dokument. Nebyl spuštěn build ani testy; nebyl proveden deployment, změněna databáze, R2, heslo ani živá aplikace.
