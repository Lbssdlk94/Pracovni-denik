# Závlahový deník – týmová aplikace

Aplikace v češtině pro Safari na iPhonu s logem Dr. Závlaha. Zahrady, plány závlah, fotografie šachet, popisky ventilů a seznam zón se ukládají společně v Cloudflare D1 a R2. Prohlížeč drží kopii a frontu změn při výpadku připojení.

## Použití

Vlastník se přihlašuje přes ChatGPT. Nastavená runtime proměnná `TEAM_OWNER_EMAIL` zachovává jeho správcovský přístup. V **Náš tým** zadá e-mail kolegy, roli a způsob připojení. Výchozí **Osobní odkaz bez ChatGPT** vytvoří náhodný přístupový klíč: kolega nepotřebuje žádný účet ani heslo, pouze otevře svůj odkaz a potvrzuje zobrazený e-mail a roli. E-mail je označení příjemce, nejde o ověření vlastnictví e-mailové schránky. Volba **Účet ChatGPT** zachovává původní připojení na základě ověřené identity platformy. Pozvánka se automaticky neodesílá; správce ji sdílí připraveným textem a odkazem.

- **Vlastník** řídí i ostatní správce; jeho roli nelze změnit.
- **Správce** přidává a upravuje šachty, zóny, maže šachty a řídí pracovníky a čtenáře.
- **Pracovník** přidává a upravuje zahrady, plány, šachty a zóny.
- **Čtenář** prohlíží a stahuje fotografie a plány.

Úvodní stránka a přihlášení jsou veřejně dostupné. Týmová API, metadata a fotografie vyžadují přihlášeného člena; role se kontroluje na serveru při každém požadavku. Schéma neobsahuje veřejné URL fotografií. Původní pozvánka přes ChatGPT je vázaná na ověřený e-mail. Osobní odkaz je vlastní oprávnění k této aplikaci; zachovává se přihlášení a vlastnická identita Sites. Aplikace neukládá hesla a neimplementuje externí OAuth.

Šachty se obnovují při návratu do aplikace, každých 20 sekund při otevřené stránce a tlačítkem synchronizace. Místní změny při výpadku se sdílí po obnovení spojení. Při změně stejné šachty dvěma lidmi se kontroluje verze: změny se nepřepisují automaticky. Uživatel může uložit vlastní kopii nebo načíst týmovou verzi. Místní data z předchozí verze zůstávají v původní IndexedDB; vlastník je může výslovně převést do týmu. Původní seznam zón se použije při prvním založení týmového seznamu.

Na iPhonu lze v Safari zvolit **Sdílet → Přidat na plochu**. Kamera a systémové sdílení vyžadují ověření na skutečném zařízení. Offline data jsou kopie v zařízení; při odhlášení se týmová kopie vymaže. Člen, kterému byl odebrán přístup, už nemůže číst ani měnit data na serveru, ale nelze mu vzít obrázky, které si dříve stáhl.

## Zahrady a plány

V přehledu vytvořte zahradu. Její složka obsahuje šachty a jeden plán závlahy (PDF, JPG, PNG nebo WebP, nejvýše 20 MB). Nové fotografie uvnitř složky se přiřadí automaticky; existující šachty lze přesunout výběrem zahrady v editoru a uložením. Migrace původním šachtám žádnou zahradu nehádá: zůstanou v Nezařazených. Plány čtou všichni členové týmu, nahrávají je pracovníci a správci. Nahrazení plánu kontroluje verzi, aby se souběžné změny nepřepsaly. Nahrávání a tvorba zahrad vyžaduje připojení; otevřené plány se drží v místní kopii pro offline čtení.

Záloha verze 5 zahrnuje zahrady, čerpadla, servisní historii, GPS souřadnice šachet, přiřazení a plány. Obnova podporuje i starší zálohy verze 1 až 4.

## Řazení zahrad podle vzdálenosti

V přehledu zahrad vyberte **Nejbližší ke mně** a povolte přístup k poloze. Aplikace vyhledá polohy podle uložených adres a seřadí zahrady podle vzdálenosti vzdušnou čarou. Vzdálenosti jsou přibližné; nepředstavují vzdálenost jízdy. Uveďte ulici, číslo domu, obec a případně PSČ. Zahrady bez adresy či známé polohy jsou na konci. Více vzdálených výsledků vyžaduje volbu správného místa; tato volba platí pro vlastní zařízení. **A–Z** vrací abecední pořadí, **Aktualizovat mou polohu** získá nový aktuální bod. Poloha není sledovaná na pozadí, při řazení se neposílá API ani geokodéru a neukládá se do týmových záznamů. Zvolené řazení i vybrané místo nejednoznačné adresy se uchovávají v tomto zařízení. Po novém spuštění se obnoví poslední řazení. Pokud má aplikace již povolenou polohu, získá při obnovení řazení Nejbližší ke mně nový aktuální bod; stejně ho obnoví po návratu z pozadí, je-li starší než 5 minut. Bez již uděleného oprávnění nabídne tlačítko pro získání polohy a nevyvolává sama žádost o povolení. Aktuální GPS bod zůstává pouze v paměti, do trvalého úložiště se ukládá volba řazení, nikoliv poloha uživatele. A–Z se rovněž pamatuje.

Adresy se vyhledávají přes veřejný Photon nad OpenStreetMap. API je dostupné jen přihlášeným členům týmu včetně čtenářů a odvozené výsledky se drží v D1 tabulce `garden_geocodes`. Adresa musí odpovídat aktuální zahradě. Změna adresy zneplatní staré výsledky; selhání poskytovatele nevytváří falešnou polohu. Výsledky bez shody se mohou znovu hledat po 24 hodinách. Požadavky mají timeout a omezení frekvence, při jedné akci se dohledává nejvýše 10 adres; pokračovat lze tlačítkem pro zbývající adresy. Již určené polohy lze používat offline. Funkci lze pro tým vypnout v Nastavení; závisí na složkách zahrad a poloze. Starší klient s původními přepínači zachová volbu nové funkce.

## Mazání zahrady a přehlednější ovládání

V detailu zahrady jsou záložky **Šachty**, **Servis**, **Plán** a **Mapa**, které respektují společné přepínače funkcí. **Přidat šachtu** nabídne fotoaparát nebo výběr fotografie a cílovou zahradu. Vyhledávání se při automatické synchronizaci zachovává. Navigace na telefonu má krátké popisky.

Vlastník a správce otevřou **Upravit zahradu → Smazat zahradu**. Potvrzení ukáže počet šachet a servisních záznamů. Výchozí volba zachová fotografie, popisky a GPS v Nezařazených. Druhá volba smaže i šachty a vyžaduje opsat název zahrady. V obou případech se odstraní plán a servisní historie. Mazání vyžaduje internet a potvrzení důsledků. Místní čekající změny nejprve synchronizujte.

Server kontroluje roli a celý potvrzený přehled (verze zahrady, šachet i servisu). Jeden atomický D1 batch označí zahradu jako smazanou, přesune nebo označí šachty a označí servis. Souběžná změna od kolegy zablokuje mazání bez částečných změn. Fotografie a plán se z R2 mažou až po úspěchu. Tombstone brání oživení smazané zahrady či šachty starým klientem. Čekající offline servis jiné osoby zůstane zachovaný a lze ho v **Čekající změny** převést do jiné zahrady. Šachtu se smazanou zahradou lze obdobně zachránit volbou nové zahrady či Nezařazených v editoru.

## Servis a čerpadlo

V údajích zahrady je volný text **Typ čerpadla** pro druh, výrobce a model. Sekce **Servis závlahy** obsahuje záznamy řazené podle data zásahu: datum, provedené práce, vyměněné díly a poznámku. Aplikace automaticky zobrazí, kdo záznam vytvořil a upravil. Pracovníci i správci mohou přidávat a upravovat servis; mazání je vyhrazené správcům a vlastníkovi. Čtenáři historii pouze prohlížejí. Záznamy se kontrolují podle verze, takže souběžné změny nepřepisují práci kolegy. Při konfliktu formulář zachová text a nabídne uložení jako nový servis. Mazání ponechává tombstone, aby stará verze nemohla záznam oživit.

Servis se před odesláním uloží do IndexedDB. Po prvním přihlášení a načtení zahrady lze servis přidávat i upravovat offline, včetně zavření a opětovného otevření aplikace. Po návratu připojení a otevření aplikace se čekající záznamy automaticky sdílí. Stabilní ID změny chrání opakované odeslání po ztrátě odpovědi; konflikty s kolegou zachovají místní text a nabídnou samostatný nový záznam nebo týmovou verzi. Mazání vyžaduje internet. Vypršení přihlášení místní frontu zachová pro původní účet. Záloha zahrnuje i servisní historii. Starší klienti, kteří typ čerpadla neposílají, jeho hodnotu při úpravě zahrady zachovají.

## Nastavení funkcí

V nabídce **Nastavení** může vlastník nebo správce pro celý tým zapnout nebo vypnout složky zahrad, plány, servis, čerpadlo, ukládání offline, GPS a souřadnice, mapu, správu kolegů, správu seznamu zón, export obrázků, zálohy, vyhledávání a ukázkovou šachtu. Nastavení je sdílené přes D1 a ověřuje oprávnění i verzi při každém uložení. Pracovník a čtenář v Nastavení vidí pouze vlastní upozornění a nastavení push oznámení. Týmové funkce, Google Disk i připomínky materiálu se zobrazují jen vlastníkovi a správci. Vše je zpočátku zapnuté. Volba **Jen fotografie a popisky** zjednoduší aplikaci; **Zapnout všechny funkce** vrátí celý rozsah.

Vypnutí skryje nabídky a zachová existující data, přiřazení šachet, polohy, plány i servis. Na úvodní stránce jsou pouze složky zahrad, případně Nezařazené; fotografie šachet se zobrazí po otevření konkrétní složky. Při vypnutých složkách se šachty zobrazí společně. Funkce zahrad závisejí na složkách a mapa i na poloze; vlastní volby podřízených funkcí se zachovají. Správa kolegů řídí zobrazení nabídek, nikoliv členství, přístupová práva nebo automatické sdílení záznamů. Vypnuté offline ukládání blokuje nové zápisy při práci bez připojení; už čekající změny se mohou dokončit a kopie se nadále uchovává pro čtení a ochranu při ztrátě odpovědi serveru. Nastavení ukládejte online.

## Poloha šachet a mapa

V editoru šachty vyberte **Uložit aktuální GPS polohu**, povolte přístup k poloze a uložte šachtu. Alternativně zadejte souřadnice ručně. Polohy se sdílejí přes stejná oprávnění a kontrolu verzí jako fotografie; lze je uložit offline. Zahrada nabízí mapu všech svých šachet s polohou, otevření šachty a navigaci v Apple/Google Maps. Podklad OpenStreetMap vyžaduje internet; souřadnice, značky a načtené fotografie zůstávají dostupné offline. Leaflet 1.9.4 je hostovaný s aplikací. Poloha se získává pouze na vyžádání uživatele.

## Vývoj a nasazení

`web/` obsahuje klienta a originální logo, `worker/api.js` serverovou autorizaci a ukládání. Sestavení vloží statické soubory přímo do jediného ESM Workeru pod `dist/server/index.js` podle tvaru Sites Worker starteru. `.openai/hosting.json` drží stejné ID původní aplikace, vazby DB/BUCKET a konfiguraci migrací. `db/schema.js` je Drizzle schéma; SQL, snapshoty a journal jsou v `drizzle/`. Applied migrations se neupravují.

```sh
npm ci
npm run db:generate  # pouze po změně schématu
npm run build
npm run check
node tests/model.test.js
node tests/team.test.js
node tests/gardens.test.js
node tests/service.test.js
node scripts/preview-team.mjs
node tests/team-browser.cjs
node tests/gardens-browser.cjs
node tests/service-browser.cjs
node tests/offline-map-browser.cjs
node tests/features-browser.cjs
node tests/garden-ux-browser.cjs
node tests/access-links-browser.cjs
node tests/startup-browser.cjs # spusťte s čerstvým preview
node scripts/preview-nearby.mjs # alternativní preview s geokódovacími fixtures
node tests/nearby-browser.cjs
```

Preview běží pouze na loopback portu 5187 a simuluje různé účty pro ověření oprávnění. Testovací přihlášení ani databáze se nepřidávají do nasazeného Workeru. Testy ověřují migraci místních záznamů, pozvánky, sdílení mezi dvěma účty, změnu rolí, čtenáře, neoprávněný přístup, konflikty a zákaz obnovení smazané šachty.

## Vlastní popisky ventilů

Klepnutí na ventil ve fotografii otevře formulář pro libovolný text (nejvýše 100 znaků), například „Ventil trávník“ nebo „Ventil záhony“. Klepnutí na značku, její text nebo řádek v seznamu ventilů umožní popisek přepsat, změnit barvu či značku odebrat. Úprava zachová polohu značky i textu. Popisky se ukládají s fotografií, sdílí v týmu a fungují offline i při vypnuté správě zón. Původní popisky a samostatný seznam zón zůstávají zachované; nový text se do seznamu zón automaticky nepřidává.

## Adresa zahrady z aktuální polohy

V Nová zahrada nebo Upravit zahradu klepněte na **Použít aktuální polohu**. Po povolení GPS se jednorázově odešlou souřadnice přes přihlášené API službě Photon / OpenStreetMap a nalezená adresa se předvyplní. Adresu před uložením zkontrolujte či doplňte; zahrada se změní až po **Uložit zahradu**. Při chybě, odepření polohy či nedostupném internetu zůstává původní adresa a lze ji zadat ručně. Probíhající vyhledání nepřepíše souběžně upravený text a po zavření formuláře se jeho výsledek nepoužije. Souřadnice tohoto dohledání se neukládají do týmových záznamů. Tlačítko respektuje přepínač GPS a poloha, endpoint vyžaduje oprávnění k zápisu, omezuje frekvenci i velikost odpovědi a nemění uloženou zahradu.

## Špendlík šachty na mapě

V editoru fotografie otevřete **Poloha šachty → Umístit špendlík na mapu** (u existující polohy **Posunout špendlík na mapě**). Klepnutí do mapy položí špendlík, tažením ho přesuňte. Alternativně použijte **Najít mou polohu**, **Špendlík do středu mapy** nebo vložte odkaz z Apple Map obsahující `coordinate`, `ll` či zeměpisné souřadnice. Zkrácené odkazy bez souřadnic se nestahují; lze zkopírovat samotné souřadnice z detailu špendlíku. Potvrďte **Použít polohu** a pak **Uložit** šachtu. Teprve uložení sdílí bod s kolegy. Zrušení ponechá dosavadní polohu. Přetažení nebo ruční výběr nemá údaj o přesnosti GPS; samotné získání GPS ho zachová.

Výběr místa používá již dostupnou mapu OpenStreetMap, uložené body lze otevřít v Apple Mapách na telefonu i počítači. Podklad potřebuje internet, ale vložení souřadnic a uložení šachty funguje i offline. Čtenář nemůže polohu měnit. Přepínač Mapa šachet skrývá také výběr špendlíku; přepínač GPS a poloha skrývá celou polohu šachty. Výběr místa automaticky nezískává polohu uživatele.

## Fotka z dronu se značkami šachet

Ve složce zahrady otevřete **Plán → Nahrát plán** a vyberte JPG, PNG nebo WebP (nejvýše 20 MB). **Označit šachty** zapne úpravy: klepněte do obrázku, vyberte šachtu z téže zahrady a značku případně přetáhněte. Každá šachta má jednu značku; opětovný výběr ji přemístí. **Uložit značky** sdílí polohy v plánu pro celý tým. Klepnutí na značku při prohlížení otevře šachtu. Odebrání značky nemaže fotografii. Polohy jsou ruční souřadnice ve snímku, nesouvisí s GPS bodem šachty. PDF zůstává ke čtení bez značek.

Ukládání značek potřebuje internet, načtený plán a značky lze prohlížet offline. Rozpracované úpravy v aktuálním otevření přežijí automatickou synchronizaci i přepnutí záložky. Nové spuštění před uložením je nezachová. Čtenář může značky prohlížet a otevírat šachty, nikoliv upravovat. Verze zahrady a obrázku chrání před přepsáním kolegových změn. Nahrazení obrázku výslovně upozorňuje, že značky se odstraní a musí se umístit znovu. Značky se zahrnují do zálohy verze 5 a obnovují až po obnovení šachet. Přesunuté či smazané šachty se v původním plánu nezobrazují. Přepínač Plány závlahy řídí i tuto funkci.

## Osobní přístup bez ChatGPT

Odkazy obsahují 256bitový náhodný klíč v části URL za `#access=`, která se neposílá s načtením stránky a odstraní se z adresního řádku. Po ověření odkazu a potvrzení příjemce se klíč použije v cookie `__Host-zavlahy-access` s HttpOnly, Secure, SameSite=Lax a dobou 30 dnů. Odkaz si kolega uchová pro nové přihlášení; platí do zrušení nebo obnovy. Klíč se neukládá v prohlížečovém úložišti aplikace a v D1 zůstává pouze SHA-256 otisk. Seznam týmu ani zálohy klíče neobsahují. Přihlášení je chráněno proti požadavkům z jiného webu a příliš mnoha pokusům.

**Nový odkaz** zneplatní předchozí klíč i přístup v zařízeních přihlášených jeho pomocí. Odebrání kolegy zruší přístup okamžitě na serveru. Přesný návrat dříve odebraného kolegy se stejným e-mailem zachová jeho interní identitu; nový odkaz tak umožní obnovit i čekající offline změny jeho původního účtu. Před přepnutím na jiného uživatele se musí nesdílené změny vyřešit. Role se ověřuje při každém týmovém požadavku, takže její změna platí i pro již přihlášeného kolegu. Správce nemůže pozvat dalšího správce ani obnovit jeho odkaz; to smí vlastník.

První otevření a přihlášení potřebuje internet. Potom lze používat načtenou kopii a offline frontu stejně jako při přihlášení přes ChatGPT. Odhlášení vymaže místní kopii a cookie v tomto zařízení; osobní odkaz zůstává platný. Při odepření přístupu se data a čekající změny zamknou a zachovají pro původního uživatele. Dříve stažené soubory a offline kopie nelze serverovým odebráním vzít zpět. Osobní odkaz funguje jako klíč, proto se sdílí pouze příslušnému kolegovi. Nikdo se nezve ani mu neposílá zpráva automaticky při nasazení.


### Obnova zaseknutého načítání

Přehled zahrad se zobrazí před stahováním fotografií. Během prvního stahování se u šachet ukazuje načítání; chybný nebo zadrhnutý přenos nabídne opakování místo nekonečné čekací obrazovky. Síťové čtení má limit 15 sekund, přihlášení osobním odkazem také 15 sekund, jednotlivá fotografie 20 sekund. Limit zahrnuje hlavičky i tělo odpovědi. Zápisy mají delší limit 60 sekund. Otevření a běžné transakce místního úložiště mají limit 12 sekund; při potížích doporučí aplikace zavřít další záložky a použít Safari nebo Chrome. Obnova žádná místní data nemaže.

Po aktivaci osobního odkazu se před načtením dat ověří, že prohlížeč uložil přístupovou cookie a server skutečně rozpoznal správného kolegu. Pokud cookie chybí, zobrazí se vysvětlení přímo u pozvánky bez přesměrování do ChatGPT. Při chybě náhledu pozvánky lze stejný odkaz zkusit znovu; jeho klíč zůstává pouze v paměti otevřené stránky.


## Docházkový deník

V nabídce **Docházka** zaznamená každý člen týmu (včetně čtenáře fotografií) vlastní **PŘÍCHOD** a **ODCHOD**. Čas pochází ze serveru při přijetí zápisu; zobrazení a měsíční hranice používají `Europe/Prague`. Přestávky se neodečítají. GPS se jednorázově získá po stisknutí tlačítka, nikdy na pozadí. Při zamítnutí, nedostupnosti či vypršení získání GPS se čas přesto uloží s příslušným stavem. Vypnutá funkce GPS nebrání zápisu času. Docházka vyžaduje internet; nesynchronizuje se přes offline frontu servisních záznamů.

Každý kolega čte pouze své směny a návrhy oprav. Vlastník a správce mohou vybrat kolegu nebo celý tým a vidí GPS obou stisků včetně přesnosti a času původního měření. Server u ostatních rolí souřadnice nevrací, a to ani v odpovědi na zápis. Docházka se necachuje v IndexedDB a není součástí společných záloh zahrad. Role a rozsah dat se kontrolují na každém požadavku. Odebrání člena zachová historické výkazy pro správce.

Měsíční výkaz automaticky sčítá pouze uzavřené směny. Směny přes hranici měsíce se rozdělí podle skutečně uplynulého času; změna letního času nemění správný výpočet délky. Otevřená směna se do celkových hodin nezapočítává. Výkaz lze stáhnout jako CSV pro Excel; obsahuje měsíční součet každého vybraného kolegy bez GPS. Čísla hodin v CSV jsou zaokrouhlená na dvě desetinná místa, zobrazení hodin a minut vynechává sekundy.

**Navrhnout opravu času** nebo **Doplnit zapomenutou směnu** vytvoří návrh s důvodem. Ten do potvrzení správcem nemění žádnou odpracovanou dobu. Správce výslovně schválí nebo zamítne návrh; návrhy zůstávají v historii s původními časy, rozhodnutím a poznámkou. Schválení i změna směny jsou atomické. Opravy zastaralé verze a překrývající se směny se odmítnou. Jedna navržená směna může trvat nejvýše sedm dní a nemůže obsahovat budoucí časy. GPS se opravou nepřepisuje ani nevymýšlí; ručně doplněná směna GPS nemá. Jednoznačnost času při opakované hodině přechodu na zimní čas vyžaduje zadat čas mimo tuto hodinu.

Opakovaný síťový pokus o stejný příchod či odchod nevytvoří druhý zápis. Databáze dovoluje pouze jednu otevřenou směnu každého kolegy a jeden čekající návrh opravy dané směny. **Docházkový deník** lze vypnout pro celý tým v nastavení funkcí; záznamy zůstávají zachované.

Ověření: `npm test`, `npm run check`, `npm run build`, poté s čerstvým loopback preview `node tests/attendance-browser.cjs`. Testy zahrnují osobní přístup bez ChatGPT, soukromí GPS, chybějící polohu, schvalování a zamítání, zastaralé návrhy, překryvy, přechody času, měsíční součty a CSV.


### Jednoduchý přehled docházky

Hlavní stránka obsahuje příchod, odchod, vlastní čas odpracovaný dnes a vlastní součet aktuálního měsíce. Obě počítadla zahrnují právě probíhající směnu a všechny uzavřené či schválené směny v daném období. Vycházejí z času serveru a pravidel `Europe/Prague`, včetně směn přes půlnoc a změn letního času. Údaje patří vždy přihlášenému kolegovi, i když správce v podrobném výkazu vybere jiného kolegu či celý tým. Denní součet sčítá také více směn v jednom dni. Čekající návrhy jej nezmění.

**Záznamy a měsíční výkazy** jsou po prvním otevření sbalené. Uvnitř zůstávají jednotlivé směny, GPS pro správce, filtry kolegy a měsíce, export CSV a návrh doplnění zapomenuté směny. Podrobný CSV výkaz nadále zahrnuje pouze ukončené směny. Otevření přehledu se při aktualizaci zachovává. Vyřízené opravy (schválené i zamítnuté) jsou ve zvlášť sbalené historii. Přímo na hlavní stránce jsou jen čekající návrhy: správce vidí všechny čekající žádosti týmu a ostatní role pouze vlastní, nezávisle na filtrech podrobného výkazu.


### Úvodní stránka podle docházky

Při spuštění přihlášené aplikace se výchozí stránka vybere podle vlastní otevřené směny: bez příchodu či po odchodu se otevře Docházka, při zaznamenaném příchodu bez odchodu Zakázky (pokud jsou zapnuté, jinak Zahrady). Stav se zjistí na serveru společně s ověřením účtu a platí samostatně pro každého kolegu. Ručně lze kdykoli přejít do ostatních částí aplikace. Pokud je docházka pro tým vypnutá, úvodní stránkou zůstávají zahrady (případně společné šachty při vypnutých složkách). Offline spuštění použije naposledy ověřený stav uložené relace. Zkouška v prohlížeči: `node tests/attendance-entry-browser.cjs` s čerstvým loopback preview.


### Smazání docházky se schválením

Po rozbalení **Záznamy a měsíční výkazy** lze u konkrétní směny vybrat **Požádat o smazání** a uvést důvod. Žádost se zobrazí mezi čekajícími žádostmi, samostatně označená jako smazání. Vlastník či správce ji musí výslovně schválit tlačítkem **Schválit smazání → Potvrdit smazání**, nebo zamítnout. Také žádost podaná správcem nejdřív čeká na schválení.

Do schválení se směna dál započítává. Po schválení se odstraní z aktivních záznamů, denních i měsíčních součtů, CSV a přehledu otevřené směny. Souřadnice původního záznamu se vymažou; databázový příznak smazání a historie žádosti s původními časy, důvodem a rozhodnutím zůstávají pro audit a ochranu před obnovením zastaralým klientem. Smazání otevřené směny uvolní možnost nového příchodu. Změna směny od podání žádosti zabrání schválení zastaralého návrhu. Starší klient nemůže smazání schválit jako běžnou opravu času.

Přístupová práva jsou shodná s ostatní docházkou: kolega žádá jen o vlastní záznamy, správce může spravovat všechny a rozhodnutí je omezené na správce a vlastníka. Jedna směna má nejvýše jednu čekající žádost o úpravu nebo smazání. Vyřízené žádosti zůstávají ve sbalené historii. Test: `node tests/attendance-delete-browser.cjs` s čerstvým loopback preview.


## Fotodokumentace zakázek a Google Disk

Implementace navazuje na `jobs`, stávající přihlášení a serverová oprávnění. Návod pro vlastníka a skutečný Google účet: [docs/google-drive-setup.md](docs/google-drive-setup.md), dostupný také přímo v Nastavení → Google Disk. Backend: `worker/drive-core.js`, `worker/drive.js`, `worker/job-photos.js`. OAuth má pouze scope `drive.file`, state s browser cookie a PKCE; oficiální přesměrovaný Picker nepředává token prohlížeči. AES-GCM odděluje konfiguraci, účty i resumable session URL pomocí AAD. Produkční tajemství patří do Sites runtime proměnných, nikoli do manifestu či Git.

D1 rezervuje Google ID před vytvářením složek a souborů, unikátní klíče, per-photo lease a pevné request ID chrání souběh a opakování. Originál se přenáší v 2MB částech přes přihlášené serverové API bez převodu kvality. Galerie i originál jsou privátní; malý JPEG náhled od Googlu může mít soukromou kopii v R2. HEIC/HEIF se uchovává beze změny, zobrazitelnost originálu závisí na prohlížeči. Předchozí účty zůstávají pro staré soubory připojené do výslovného odpojení. Smazání zakázky nikdy nemaže soubory na Disku; přesun fotky do koše je samostatná potvrzená akce správce.

Úvodní obrazovka po příchodu nyní otevírá Zakázky (při zapnuté funkci), před příchodem Docházku. Zakázky mají navíc zákazníka a město přímo v původním záznamu, bez duplicitní evidence.

## Centrum upozornění a Web Push

Zvoneček vpravo nahoře funguje na všech stránkách i nad otevřenými detaily. Kolega dostává vlastní zakázky a rozhodnutí o docházce, správce změny stavů a žádosti k vyřízení. Obsah centra je soukromý; push zpráva je obecná. Zapnutí: aplikace z plochy iPhonu (iOS 16.4+) → zvoneček → Nastavení oznámení → Zapnout oznámení. [Návod a provozní detaily](docs/notifications.md). Runtime VAPID klíče jsou oddělené od klíče Google Disku.

Ověření: `npm test`, `npm run check`, `npm run build`. Mobilní centrum: `node scripts/preview-team.mjs` a `node tests/notifications-browser.cjs`. Testovací push poskytovatel: `node scripts/preview-notifications.mjs` a `node tests/push-browser.cjs`. Browser testy vyžadují Playwright a Chromium; testy používají vždy novou paměťovou databázi. Reálné povolení a doručení přes Apple ověřte podle návodu na iPhonu.

## Zákazníci a více kontaktů

Část **Zákazníci** obsahuje jméno nebo název, až 20 telefonů a 20 adres s vlastním označením. Telefon otevře vytáčení, adresy mají samostatné město. Vlastník a správce zákazníky vytváří, upravuje a maže; kolega vidí jen kontakty zákazníků svých nesmazaných zakázek. Oprávnění se ověřují i při přímém otevření API a změně přiřazení. Kontakty se neukládají do offline kopie ani exportní zálohy. Funkci lze vypnout pro celý tým v Nastavení.

V nové nebo upravované zakázce vyberte zákazníka z adresáře a jeho konkrétní adresu realizace. Údaje se předvyplní, stále je lze upřesnit pro danou zakázku. Starší zakázky s ručně zadaným jménem zůstávají funkční; při úpravě je lze propojit s adresářem. Automatické slučování podle jména se neprovádí. Změna kontaktů nemění historické údaje místa realizace a smazání zákazníka zachová zakázky i fotografie na Google Disku.

Oprava Web Push: Cloudflare `fetch` nepodporuje `redirect: 'error'`. Odesílání používá `manual` a případné přesměrování odmítne bez jeho následování. Stejná oprava platí pro HTTP klienta Google Disku. `npm run test:worker` zkouší skutečný požadavek uvnitř workerd, podpis, šifrování, úspěch poskytovatele a odmítnutí přesměrování. Test potřebuje povolení pro místní síťové prostředí Miniflare. Test připojení fyzického iPhonu zůstává samostatným krokem.

U zákazníka lze nastavit **Původ závlahy**: Dělali jsme my, Cizí závlaha nebo Předělávali jsme ji. Dosavadní záznamy mají hodnotu Zatím neurčeno. Údaj se zobrazuje v adresáři, detailu zákazníka i v propojené zakázce; upravují ho správci. Starší klienti, kteří tento údaj neposílají, jeho uloženou hodnotu zachovají. Nedokončené zakázky mají červený okraj, vykřičník a viditelný důvod, dokončené zelený vzhled.

## Volání, navigace a zákaznické zahrady

V adresáři a detailu zákazníka jsou odkazy **Zavolat** u telefonů a **Navigovat** u adres. Volání otevře vytáčení zařízení; navigace otevře trasu autem podle vybrané adresy, na iPhonu v Apple Mapách a na Androidu nebo Windows v Google Mapách. Stejné kontakty jsou dostupné i z přiřazené zakázky. Aplikace při vytvoření odkazu nezjišťuje polohu; výchozí místo řeší až otevřené mapy.

Jeden zákazník může mít více existujících zahrad. V jeho detailu zvolte **Připojit zahradu**; tlačítkem **Otevřít zahradu** přejdete na její šachty, servis a plán. Ve složce zahrady je **Kontakt na zákazníka** a pro správce **Přiřadit zákazníka / Změnit propojení**. Přesunutí již přiřazené zahrady vyžaduje potvrzení. **Odpojit** zruší propojení a zachová samotnou zahradu. V nové zakázce výběr propojené zahrady doplní zákazníka a místo realizace; dosavadní zakázky se zpětně nepřepisují.

Propojení zahrad mění správci, kontroluje se verze zahrady i aktuální role v SQL. Kontakty zákazníků zůstávají dostupné správcům a kolegům přiřazeným k jejich zakázkám. Samotné propojení sdílené zahrady další přístup ke kontaktům nepřidává. Telefonní a navigační odkazy se ověřují v browser testu; skutečné otevření systémového vytáčení nebo mapové aplikace závisí na zařízení.

## Servisní protokol a PDF

V každé zakázce otevřete Podrobnosti → Otevřít servisní protokol. Dobrovolný zápis prací, materiálu, závad a fotografií lze uložit a exportovat do PDF. [Použití, offline režim a oprávnění](docs/service-protocol.md). Pracovníkům je skrytá cena předplatného, nabídky Tým a Záloha; správce má zálohu v Nastavení → Záloha a pomoc.

## Jsem na cestě a SMS zákazníkovi

U nedokončené zakázky zvolte **Jsem na cestě**, do okna zadejte **přesný předpokládaný čas příjezdu dnes** (český čas) a potvrďte odjezd. Nejsou zde volby relativní doby. Stav **Na cestě** a příjezd se sdílejí se správcem; při zapnutých upozorněních přijde i do jeho centra oznámení a obvyklé push fronty. **Upravit příjezd** dovolí změnit čas. Tato akce nemění plánovaný termín v kalendáři ani nečerpá službu předplatného. Dokončenou zakázku je nejdříve nutné znovu otevřít. Odjezd vyžaduje internet a oprávnění správce/vlastníka či přiřazeného pracovníka.

Po uložení se nabídne zákazníkovo číslo (u více čísel lze vybrat). Pokud číslo v kontaktu není, lze ho napsat pro tuto SMS. Tlačítko **Otevřít SMS** otevře telefonní aplikaci s připraveným, upravitelným textem včetně přesného času. Odeslání pracovník potvrdí ve Zprávách. Aplikace SMS automaticky neposílá a neoznačuje ji za doručenou; cena se řídí tarifem telefonu. K dispozici je i kopírování textu. iPhone používá formát odkazu `sms:…&body=…`, Android `sms:…?body=…`; otevření nativních Zpráv je potřeba ověřit na konkrétním telefonu.

Migrace `0023_job_departure.sql` doplňuje příjezd/odjezd k existujícím zakázkám a upravuje sdílená upozornění. `tests/job-travel.test.js`, `tests/job-travel-browser.cjs` a test skutečného workerd/D1 ověřují role, souběžné verze, opakování bez duplicitních upozornění, přesný čas, SMS odkazy, mobilní formulář, zavření bez uložení a chybu offline. Testy žádnou SMS neodesílají.

Servisní protokol má také **Zobrazit PDF**: náhled se otevře bez dalšího zápisu či stažení a zachová formulář. Dokument lze zobrazit v aplikaci nebo otevřít jako PDF v nové kartě; stažení a sdílení zůstávají volitelné. Z časů v PDF byl odstraněn dovětek „český čas“.

## Materiál – prototyp pouze pro vlastníka

Nabídka **Materiál** obsahuje upravitelné kategorie a vlastní katalog s jednotkami, kódy a cenami. Vlastník pak materiál vybírá do servisního protokolu, doplní množství a získá součet i řádky v PDF. Kategorie lze přidat, přejmenovat, seřadit a skrýt, položky přesouvat mezi nimi. Ceny v dřívějších protokolech se změnou katalogu nepřepisují. Celý prototyp je skrytý správci a pracovníkům a chráněný i na serveru. [Použití a technické podrobnosti](docs/materials-prototype.md).

Z osmi fotografií materiálu od vlastníka bylo doplněno 29 čitelných položek do přesně odpovídajících osmi kategorií. Čtyři neúplné řádky byly na jeho žádost vynechány. Záznam importu: `imports/materials-2026-10-16.json`, databázová migrace `0025_material_photos_20261016.sql`. Data importu se neposílají jako veřejné webové soubory; katalog zůstává přístupný jen vlastníkovi.

Práce, cesta, fakturační údaje a schvalované e-maily: viz [návod](docs/work-report-billing.md). Soukromý prototyp účtování i e-mailových výkazů je pouze pro vlastníka.

Počítačové rozložení používá stejnou aplikaci a týmová data: boční menu a horní lišta zůstávají dostupné, od 1024 px je kalendář vedle rozpisu, širší formuláře/PDF a dvousloupcové nastavení. Na širokých monitorech se přehled zakázek, zákazníků a materiálu skládá do více sloupců; telefon zachovává spodní navigaci a původní ovládání. Styly jsou v `web/desktop.css`.

V Zakázkách na počítači správce začíná časovou osou celého týmu s měřítkem Celý den/přiblížením, oddělenými frontami Nenaplánované a K upřesnění, založením kliknutím do rozpisu a bočním editorem. Plán práce a odhad délky jsou oddělené od domluveného příjezdu i starších časů; souběhy a pevná rezerva vyžadují kontrolu. Kolegové potvrzují převzetí jednotlivě, s historií a novým potvrzením po změně zadání. Týden, vytížení, tabulka, hromadné úpravy, PDF i mobilní ovládání zůstávají zachované. Použití, migrace, kompatibilita a ověření: [plánování na počítači](docs/job-timeline.md).

Mobilní navigace nyní používá čtyři hlavní sekce a nabídku **Více**. Počítač otevírá jako první **Zakázky** a správce/vlastník má také týdenní **Vytížení** kolegů. Rozepsané zakázky, zákazníci, zahrady a servisní formuláře se uchovávají místně včetně fotografií protokolu; neodesílají se automaticky na server. Podrobnosti, hranice funkcí a ověření: [mobilní pracovní prostředí a vytížení](docs/mobile-workspace.md).
