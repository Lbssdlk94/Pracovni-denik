# Návaznosti zákazníků, zahrad a servisů – verze 74

## Opravené chyby a jejich příčiny

- Plánování opravy ze závady: zákazník byl načten do nabídky, ale formulář zároveň přidal druhou vybranou položku se stejným ID s nepravdivým textem o chybějícím kontaktu. Kontrola se nyní řídí skutečně načtenými kontakty. ID jsou porovnávána jako řetězce; žádné párování podle jména. Kontakt mimo první stránku adresáře se načte samostatně podle ID. Před zobrazením se znovu ověří aktuální účet a platnost asynchronního požadavku.
- Opravná zakázka používá aktuálně načtenou konkrétní zahradu a její adresu. První adresa zákazníka ji nepřepisuje. Vazba na závadu zůstává zachovaná. Skutečně nedostupný kontakt dostane pravdivé upozornění a lze zvolit dostupný kontakt nebo výslovné ruční zadání; při neplatné vazbě zahrady ji správce opraví v detailu zahrady nebo přes Kontrolu propojení. Neplatná zahrada se při editaci potichu nezruší.
- PDF už původní neurčené časové rozmezí neoznačuje za plán práce. Uvádí samostatně termín, plán práce, příjezd a význam původních časů podle skutečně uložených údajů.
- Místní čekající protokol a samostatný servis se promítají do společné historie podle existujících ID zdrojů. Předchozí uložená návštěva je překryta místní verzí, nevytváří se její kopie. Čekající změna i případná chyba synchronizace jsou označené.

## Zlepšení a použití

### Kontrola propojení

Vlastník a správce: **Nastavení → Kontrola propojení → Zkontrolovat propojení**.

Filtry ukazují zahrady bez dostupného zákazníka, zakázky bez zahrady a neplatné nebo vzájemně rozdílné vazby. Výsledky se stránkují. Oprava vede do existujících formulářů. Před potvrzením změny se zobrazí zákazník, konkrétní zahrada, její adresa a adresa původní zakázky. Výběry obsahují i adresy pro rozlišení více zahrad jednoho zákazníka. Existující záznamy se automaticky nepřepisují ani nespojují. Jméno Pavel Faiereisel samo o sobě nezakládá žádnou vazbu.

### Nová zahrada a zákazník

Nová zahrada současně vytvoří minimální kontakt se jménem a adresou; správce může místo toho vybrat existující kontakt. Nový zákazník současně vytvoří jednu zahradu z první adresy, nebo správce zvolí již existující nepřiřazenou zahradu. Jedna adresa zákazníka neznamená automaticky jednu další zahradu. Opakování stejného požadavku používá stabilní ID; dvojice se ukládá v jedné databázové transakci. Žádný historický záznam se tímto zpětně nedoplňuje.

Pracovník dál nemůže vybírat cizí soukromé kontakty ani spravovat adresář; automatické vytvoření minimálního kontaktu je součástí vytvoření nové zahrady. Existující role a výběr kontaktů podle přiřazených zakázek zůstávají zachované. Pokud jsou zákazníci nebo zahrady vypnutí v nastavení týmu, skrytý protějšek se nezakládá. Toto zakládání a ruční opravy vazeb nadále vyžadují internet.

### Historie a Servis

**Zahrada → Historie** je společný chronologický přehled. Zakázka a její protokol tvoří jednu návštěvu. **Servis** slouží pro samostatný zásah bez zakázky; automaticky je zahrnut i v Historii. K existující zakázce se zapisuje pouze protokol. Historické přiřazení bez explicitní zahrady je nadále možné jen při shodném ID zákazníka a jedinečné přesné normalizované adrese; nikoli podle jména nebo podobnosti adres.

### Stejnojmenný materiál

**Materiál → Stejné názvy a ceny – kontrola položek** (stále prototyp pouze pro vlastníka podle dosavadních oprávnění).

Obě importované položky Blazing mají odlišné kategorie (Odbočky k postřikovačům a Čerpací technika / dopouštění), shodnou cenu a jednotku a prázdný kód. Z těchto dat nelze potvrdit variantu ani skutečnou duplicitu. Ve výběru se zobrazí kategorie, dostupný kód / varianta a ID; chybějící varianta je označená. Pole **Kód / varianta / rozměr** lze doplnit ručně.

Akce **Ponechat tuto pro nový výběr** po výslovném potvrzení skryje ostatní jednotlivě vypsané položky kontrolované skupiny. Neprovádí sloučení ani přesměrování historických ID. Skryté položky lze opět aktivovat. Server atomicky ověří verze všech kontrolovaných položek i oprávnění. Uložené protokoly, jejich názvy, jednotky, množství, původní ceny a PDF se změnou katalogu nepřepočítávají.

## Provedené kontroly

Všechny zápisy probíhaly ve fixture SQLite nebo samostatném workerd/D1/R2 prostředí, bez úprav provozních zakázek.

- `npm run check`, `npm test`: všechny soubory testů prošly (43 testovacích souborů).
- `npm run build`: sestavení a kontrola Worker artefaktu.
- `npm run test:planning-worker`: skutečný workerd/D1, souběžná uložení, kolize, rezervy, oprávnění a převzetí kolegy.
- `npm run test:record-links-worker`: skutečný workerd/D1, současné opakování požadavků na dvojici zahrada/zákazník, stabilní vazby, vynucené selhání a rollback obou zápisů, atomické ponechání hlavního materiálu.
- `linkage-audit-browser.cjs`: skutečně uložená oprava ze závady, správný zákazník mimo prvních 100 kontaktů, druhá zahrada a její adresa, vazba závady, žádný nový duplicitní kontakt; správná historie obou zahrad; ruční opravy vazeb s porovnáním adres a následným obnovením; oba směry nového založení; skutečně smazaný zákazník; místní protokol i samostatný servis v historii, synchronizace bez dvojích návštěv.
- `garden-history-browser.cjs`: převod textu protokolu do sledované závady, dokončení bez automatického uzavření závady, více závad v jedné opravě, výslovné vyřešení, historie obou návštěv, offline závada, následná synchronizace a konflikt s úpravou druhého uživatele.
- `desktop-planning-browser.cjs`: vytvoření kliknutím do rozpisu, více zahrad, ochrana ručních údajů, přetažení a obnovení, změna termínu/kolegy, zachování filtrů/pozice, souběžné změny, individuální předání. Plán práce a původní časy zůstávají oddělené.
- `customers-browser.cjs`: uložení a úpravy více kontaktů/adres, propojení zahrad, kontakty pouze pro přiřazené pracovníky a zrušení přístupu po přeřazení, offline soukromí.
- `materials-browser.cjs`: potvrzení hlavní položky, úpravy kategorií a kódu, množství, uložený protokol a PDF, zachování staré ceny po změně katalogu, offline synchronizace, katalog nepřístupný správci a pracovníkovi.
- `service-protocol-browser.cjs`: uložený protokol, vícestránkové PDF s diakritikou a soukromou fotografií, opakování po chybě načtení souboru, PDF bez internetu a synchronizace.
- Extrakce skutečně vytvořeného PDF nástrojem `pdftotext`: **12,5 m × 25,50 Kč = 318,75 Kč**, součet 318,75 Kč; staré časy **10:15–11:00 · Význam neurčen** nejsou vydávány za plánovanou délku práce.
- Serverové testy rolí vlastník/správce/pracovník/čtenář, odmítnutí nepozvaného účtu, izolace dvou databází týmů, verzování a ochrana před duplicitním odečtením či opakovaným vytvořením závady.
- Mobilní šířky 360/390/430 a desktop 1280/1440; formuláře bez vodorovného posouvání. Chromium a linuxový WebKit; zkontrolován také mobilní snímek formuláře opravy. Nové moduly jsou zahrnuté do offline cache verze 74.

## Neověřené části a omezení

- Není k dispozici skutečný iPhone, macOS Safari ani fyzická klávesnice telefonu. Mobilní rozměry a fokus byly emulovány; chování skutečné softwarové klávesnice není tímto potvrzené.
- Linuxový WebKit hlásí interní chybu při úplném `page.reload()` v režimu offline. Obnovení celé offline aplikace je ověřeno v Chromiu. Ve WebKitu je ověřeno offline ukládání v otevřené aplikaci a následná synchronizace, nikoli tento studený offline reload.
- Offline historie a protokoly využívají stávající autorizovanou místní kopii (časově omezenou na 24 hodin). Před cestou bez internetu je potřeba načíst danou návštěvu a historii. Nové zakázky, zákazníci, zahrady, opravy vazeb a katalogové úpravy vyžadují internet jako dosud.
- Provozní zahrady ani přiřazení Pavla Faiereisela nebyly ručně opravovány. Správce musí odlišné adresy ověřit a výslovně potvrdit správnou vazbu.
- Google Disk a e-mailové integrace nebyly měněny ani ověřovány se skutečnými externími účty. Příslušné lokální regresní testy používají testovací odpovědi; nejsou dokladem funkčnosti externích služeb.

## Hlavní změněné soubory

Backend: `worker/record-links.js`, `worker/paired-records.js`, `worker/api.js`, `worker/customers.js`, `worker/jobs.js`, `worker/materials.js`, `worker/garden-history.js`.

Rozhraní a offline: `web/record-links-ui.js`, `web/garden-history-model.js`, `web/jobs-ui.js`, `web/customers-ui.js`, `web/app.js`, `web/cloud.js`, `web/garden-history-ui.js`, `web/material-model.js`, `web/material-picker.js`, `web/materials-ui.js`, `web/service-protocol-pdf.js`, `web/model.js`, `web/style.css`, `web/sw.js`. Ostatní změny ve webových modulech pouze aktualizují označení offline cache 73 → 74.

Build a ověření: `scripts/build.mjs`, `scripts/test-record-links-worker.mjs`, `package.json`, nové testy `record-links.test.js`, `garden-history-model.test.js`, `linkage-audit-browser.cjs` a aktualizace existujících zákaznických/materiálových regresí. `dist/server/index.js` je znovu sestavený výstup.

Databázová migrace není potřebná: využívají se existující vazby, záznamy, revize a protokolové snímky. Publikování neprovádí hromadné slučování ani zpětné doplňování provozních dat.
