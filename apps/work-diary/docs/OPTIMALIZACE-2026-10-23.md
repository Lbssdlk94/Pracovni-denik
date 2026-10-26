# Optimalizace načítání a synchronizace — 23. 10. 2026

## Změny

- Úvodní nezávislá data (místní záznamy, zahrady, zóny, adresní volby, počet čekajících změn) se načítají souběžně. Výsledky se do UI převezmou až po kontrole generace přihlášení.
- Dokončení úvodní synchronizace zbytečně nepřekresluje Přehled a znovu nestahuje dnešní/nejbližší návštěvy a upozornění. Při změně role, funkcí nebo oprávnění se Přehled stále překreslí.
- Souběžné podněty k synchronizaci (připojení, návrat do aplikace, časovač a ruční obnovení) sdílejí jeden běh. Požadavek ručního obnovení zachová výslednou zprávu uživateli. Data a konflikty řeší původní mechanismus.
- Produkční sestavení zmenšuje JS/CSS pomocí již používaného esbuildu; názvy funkcí zůstávají zachované. Již minifikované Leaflet a jsPDF se znovu nezpracovávají. Původní zdrojové soubory zůstávají čitelné.
- Veřejné soubory aplikace mají obsahový SHA-256 ETag. Nezměněný soubor odpoví 304 bez těla a bez dekódování base64; změněný soubor odpoví 200. Cache používá max-age=0, must-revalidate, service worker no-cache. Nevkládá se dlouhá immutable cache pod neověřenou verzí URL.
- API, soukromé fotografie, protokoly a pracovní data nepoužívají tento statický handler. API nadále no-store; oprávnění a centrální moduly beze změny. Offline cache dostala verzi performance-v1, IndexedDB a koncepty nejsou mazány.
- Super Admin používá stejný handler a menší JS/CSS. Šablona budoucích instalací zahrnuje změny i přímou build závislost esbuild 0.25.12. Databázové migrace nebyly potřeba.

PDF už před úpravou používalo odložené načítání; měření potvrdilo, že se jsPDF na úvodu nestahuje jako vykonávaný skript. Z tohoto důvodu jsme tento mechanismus neměnili. Offline přednačtení knihovny a písma je zachováno.

## Orientační srovnání

Stejný izolovaný SQLite/R2 server, Chromium, viewport 390 × 844, prázdný profil, blokovaný service worker pro oddělení startu od offline přednačítání. Požadavky na zahrady a zóny záměrně zpožděné o 250 ms. Jedno měření před a jedno po; nejde o garantovaný výsledek na zařízení ani o reprezentativní benchmark.

| Metrika | Před | Po |
| --- | ---: | ---: |
| První Přehled | 1762 ms | 1289 ms |
| Dokončený úvod | 2036 ms | 1562 ms |
| Úvodní API požadavky | 12 | 9 |
| Načtené JS, dekódované bajty | 865500 | 807906 |
| Super Admin JS, dekódované bajty | 80964 | 68996 |

Přehled v tomto scénáři přibližně o 27 % dřív, 25 % méně API požadavků, JS deníku o 6,7 % a Super Admina o 14,8 % menší. Počet modulů se nemění; nebyla zavedena druhá evidence ani nový klientský framework. Zóny mají při prvním spuštění GET a seedovací PUT, tento oprávněný zápis nebyl mylně odstraněn jako duplicita.

## Ověření

- 56 sad jednotkových testů deníku PASS, 7 sad Super Admina PASS; syntaktické kontroly deníku i platformy PASS.
- Nový performance-browser: skutečně souběžné načtení zahrad/zón, jediné načtení přehledu, spojení tří online událostí do jedné synchronizace, 304 pro stejný obsah, 200 po změně a API no-store PASS.
- Prohlížečové regrese workspace, approved-layout, service-protocol, materials, mobile-workspace PASS: koncepty s fotografií a obnovení, ochrana změněné serverové verze a jiného účtu, zákazník/zahrada uložené a znovu otevřené, desktop rozpis a boční úpravy, role, protokol Unicode/materiál/fotografie/PDF, opakování selhaného stažení, offline zápis a následná synchronizace, navigace/kalendář/filtry a mobil 360/390/430.
- Super Admin reálný izolovaný UI průchod: MFA, vytvoření a úpravy firmy, uložení/obnovení, licence, centrální moduly a rollout, všech 10 sekcí a šířky 360/390/430/1280/1440 PASS.
- Skutečný izolovaný D1/workerd test Super Admina: MFA, atomické souběžné úpravy, idempotence a chybějící tenant-content API PASS.
- Všechny čtyři sestavené Workery: statické odpovědi 200/304/změněný-200 PASS; tři deníky navíc kompilovaný autentizovaný start a odmítnutí anonymního API PASS.

## Omezení

Ověřeno v Chromiu/emulaci, nikoliv na skutečném iPhonu/Safari/Androidu. Produkční data se kvůli kontrolám neměnila. Neodesílaly se skutečné e-maily, SMS nebo push; jejich doručení nebylo v této úpravě ověřováno. Externí poskytovatelé map, Disku a e-mailu zůstávají závislí na svých službách. Výsledky velikostí jsou nekomprimované bajty, nikoliv záruka skutečné síťové úspory po CDN kompresi. Nejde o zátěžový test tisíců současných uživatelů.

## Soubory

Deník: web/app.js, index.html, sw.js; scripts/build.mjs; nový worker/static-assets.js; testy static-assets.test.js a performance-browser.cjs; package.json/package-lock.json. Super Admin: scripts/build-admin.mjs a web/index.html. Produkční sestavení dist; změny ve společné šabloně a všech třech instalacích.
