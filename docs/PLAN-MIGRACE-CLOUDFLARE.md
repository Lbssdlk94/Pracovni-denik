# Příprava testovací migrace deníku na Cloudflare

Datum: 27. 11. 2026  
Stav: zdroj ověřen; prázdná testovací D1 a soukromý R2 bucket založeny. Worker zatím není nasazen ani veřejně dostupný. Produkční Sites zůstávají beze změny.

## Přesný zdroj pro test

Testovací nasazení vychází z commitu **`9e80f6c731b28ef20e69d8974304c25b42bdcc5c`** na větvi `feat/assistant-create-records`. Commit synchronizuje zdroje živého Závlahového deníku v182 a Dr. Garden v101. Obsahuje také asistenta a hromadný import zákazníků a dodavatelů.

Pro jistotu jsou zachované tyto větve:

- Kopie zdrojů před migrací: `backup/before-cloudflare-migration-2026-11-27` (původní `main`).
- Kopie přesného testovacího zdroje: `backup/cloudflare-test-9e80f6c-2026-11-27`.
- Pracovní větev testu: `migration/cloudflare-test-9e80f6c`.

Žádná z nich nemění `main` ani stávající Sites nasazení. Kopie v GitHubu není záloha produkční databáze ani R2 souborů.

## Postup testu

### 1. Založit oddělený testovací backend

1. V Cloudflare účtu Info@drzavlaha.cz jsou založené prázdná D1 `work-diary-test-db` a soukromý R2 bucket `work-diary-test-files`. První Worker nasadit bez veřejné URL.
2. Pracovní větev připravuje izolovaný instalační balíček, statický testovací ID instalace a Wrangler konfiguraci pro tato dvě prostředí. Build vloží ověřovací vrstvu Cloudflare Access; bez ověřené Access identity Worker vrací 403. Tajemství nejsou v repozitáři.
3. Spustit jednu čistou počáteční migraci pouze na nové prázdné D1. Nepoužívat původní Sites DB ani jiné R2.
4. Až bude Worker vytvořen, před zapnutím `workers.dev` na něj v Cloudflare připojit Access a omezit přihlášení na firemní identity. Poté ověřit načtení webu, přihlášení, základní čtení/zápis a soukromý upload souboru. V aplikaci použít pouze testovací data.

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

- Připojit Cloudflare Workers Builds k soukromému repozitáři `Lbssdlk94/Pracovni-denik` na pracovní větvi `migration/cloudflare-test-9e80f6c`; před potvrzením přístupu ověřit požadovaný rozsah oprávnění.
- Záloha databáze a soubory z Sites. V repozitáři ani v záložních větvích nejsou.
- Cloudflare Access v Zero Trust a testovací URL `workers.dev`; Access identita bude do aplikace předána pouze z ověřeného Worker kontextu.
- Po testu schválený čas a postup produkčního přepnutí. Do té doby zůstává aktuální Sites provoz zdrojem pravdy.

## Kontrola změn

Při kontrole větve `feat/assistant-create-records` byl potvrzen výše uvedený commit a soubor `apps/work-diary/deployments/dr-garden/README.md`. Příprava změnila pouze pracovní větev, založila prázdnou D1 a soukromý R2 bucket a připravila jejich testovací konfiguraci. Build ani testy zatím neběžely; Worker ani veřejná URL nejsou nasazené. Main, Sites, hesla a skutečná data zůstaly beze změny.
