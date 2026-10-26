# Plánování na počítači

V **Zakázkách** najde správce/vlastník denní **Časovou osu** celého týmu. Na počítači je výchozí při prvním otevření; pak se respektuje uložený pohled konkrétního uživatele na zařízení. Telefon má vlastní uloženou volbu a původní denní přehled. Zůstávají Kalendář, Mapa podle oprávnění, Seznam, Týden, Tabulka a Vytížení.

## Rozpis a fronta

Hlavička a vyhledávání jsou kompaktní, méně používané volby jsou pod **Filtry** s počtem aktivních filtrů. Datum zůstává při posouvání dostupné; hodiny a jména kolegů zůstávají při posouvání rozpisu viditelné.

Vedle denní osy jsou skládací **Fronty zakázek** s vlastním hledáním, počty a stránkováním po 100 položkách:

- **Nenaplánované**: chybí den nebo dostupný přiřazený kolega. Má přednost, pokud současně chybějí časové údaje.
- **K upřesnění**: den a kolega jsou známí, ale chybí začátek/odhad práce nebo význam původního časového rozmezí.

Jedna zakázka je vždy jen v jedné skupině a vypisuje konkrétní chybějící údaje. Hotové zakázky nejsou v žádné pracovní frontě. Při stránkování jsou počty pro celý výsledek hledání a je uvedeno, že část záznamů ještě není načtená. **Upřesnit** otevře stávající boční editor. Sbalení fronty uvolní místo rozpisu; stav se pamatuje podle uživatele na zařízení.

**Celý den** zobrazuje 00:00–24:00 bez vodorovného posouvání a přizpůsobuje se šířce okna i sbalení fronty. **Detail** a **Přiblížit** používají podrobnější měřítko s vodorovným posouváním. Přiblížení drží přibližný střed dosavadního zobrazení, nemění uložené časy. Měřítko se pamatuje samostatně a nemění počet ani nabídku pohledů zakázek.

Na bloku návštěvy je výrazný zákazník a čas, druh práce je vedlejší údaj. Krátké bloky zůstávají v přesné časové poloze; úplné jméno, časové údaje, adresu, zadání, stav a předání ukáže najetí myši nebo zaměření klávesou Tab. Bublina jde zavřít Escape, lze na ni přejet myší, při tažení se skryje. Kliknutí dál otevírá původní editor/detail. Souběžné návštěvy mají vlastní stopy v řádku kolegy.

- **Naplánovat** otevře kontrolu dne, hlavního a dalších kolegů, začátku práce a odhadu délky. Naplánované a nedokončené zakázky lze také přetáhnout do rozpisu. Již vyjeté nebo probíhající zakázky upravujte v úplném formuláři.
- Přetažení nejprve nabídne kontrolu údajů, poté původní společný náhled změn a kolizí. Dokud nepotvrdíte uložení, nic se nemění.
- Kliknutí do volného místa rozpisu otevře původní formulář nové zakázky s datem, časem a kolegou. Tažení prázdného místa posouvá rozpis. U okrajů funguje automatické posouvání; Escape či puštění mimo plochu přesun zruší.
- Přesun zachovává výslovně zadaný odhad práce a další přiřazené kolegy. Začátek se přichytí po 15 minutách; před uložením jej lze změnit.
- V týdenním rozpisu fungují stejné původní přesuny a potvrzení. Sdílená zakázka je u každého přiřazeného kolegy. Pracovník vidí pouze serverem povolené zakázky a svůj řádek.

## Rychlé založení a úpravy

Ve formuláři vyhledejte zahradu nebo zákazníka jménem, názvem či adresou. Výběr zahrady doplní známé propojení a adresu; u zákazníka s více zahradami je nutný výběr konkrétní zahrady. Existuje i ruční zadání nového zákazníka. Žádný druhý adresář nevzniká.

Předvolby **Zazimování, Jarní spuštění, Servis, Realizace, Zaměření** vyplňují název a druh práce. Doplňující údaje jsou rozbalovací. Přepsání již ručně upravených hodnot vyžaduje potvrzení. Původní ukládání rozepsaného formuláře zůstává zapojené.

Od šířky 1200 px kliknutí na zakázku otevře pravý editor vedle rozpisu. Lze změnit den, práci, odhad, příjezd, hlavního a další kolegy. Jsou zde poznámky zahrady, převzetí, přechod do úplného detailu, servisního protokolu, historie a závad zahrady. Úplný detail zachovává fotodokumentaci a Google Disk.

Uložení nezmění zobrazený den, filtry ani pozici rozpisu, i když zakázku přesunete na jiný den. Zavření, přechod jinam nebo obnovení změněného panelu se ptá na neuložené úpravy. Změna jiným uživatelem ponechá rozepsané údaje a nabídne načtení aktuální verze; zastaralé uložení server odmítne. Při změně oprávnění nebo odpojení se soukromý panel zavře.

## Co znamenají časy

Starší pole **Čas od / Čas do** v aplikaci neurčovala, zda jde o příjezd nebo práci. Migrace proto jejich hodnoty zachovává jako **Původní čas – význam neupřesněn**. Žádné provozní údaje se hromadně nepřevádějí. Nové pole **Co původní rozmezí znamená?** umožňuje výslovně zvolit původní práci, příjezd nebo údaj ponechaný jen pro informaci. Samotný výběr nic nekopíruje do plánu práce ani příjezdu; ty se zadávají zvlášť. Dokud význam není určený nebo chybí pracovní plán, zakázka zůstává k upřesnění.

Nová samostatná pole:

- **Plánovaný začátek práce + Odhad délky práce (minuty)** určují obsazení kolegy a souběhy.
- **Domluvené rozmezí příjezdu zákazníkovi** je nezávislá informace, nikoliv délka práce ani přejezdu.
- **Původní časy** lze výslovně převzít jako plán práce tlačítkem a potvrzením, že skutečně označují práci. Originální hodnoty zůstávají uložené.

Starší úplné rozmezí se na ose zobrazí šrafovaně s upozorněním na neurčený význam. Známý začátek bez délky má označený pomocný blok, jehož vizuální šířka není odhadem práce. Nezapočítá se jako známá délka ani potvrzený konflikt. Při uložení chybějící délku výslovně odsouhlasíte.

Server hledá skutečné souběhy známých pracovních intervalů pro všechny společné kolegy a celý příslušný den, včetně zakázek skrytých filtrem. Hotové návštěvy nevytvářejí nové plánovací kolize. Ve frontě pod **Rezerva mezi návštěvami** správce uloží pevnou týmovou rezervu 0–240 minut. Je označena jako rezerva, nejde o výpočet trasy. Nedostatečná rezerva nebo souběh vyžadují potvrzení; termíny se nikdy samy neposouvají.

**Vytížení** sčítá výhradně výslovně zadané odhady práce; starší neurčená rozmezí vykazuje jako návštěvy bez úplného plánu. Dokončené zakázky zůstávají podle filtru zahrnuté. Společná práce se počítá každému kolegovi; nejde o docházku.

## Převzetí kolegou

Tlačítko **Převzetí** na kartě a v panelu/detailu ukazuje potvrzení jednotlivých přiřazených kolegů. Je oddělené od stavů zakázky.

- Každý kolega sám zvolí **Převzít zakázku**, nebo **Potřebuji upřesnit** a napíše povinnou poznámku.
- Pouhé otevření nic nepotvrzuje. Správce vidí stav, autora, čas a historii.
- Změna termínu, práce, místa nebo přiřazení vyžádá nové potvrzení všech aktuálně přiřazených kolegů. Předchozí odpovědi zůstávají v historii. Nový kolega vždy čeká na převzetí; odebraný ztrácí přístup.
- Změna přijde do stávajícího centra oznámení, při povolených push také do zařízení. Stejná změna neodesílá dvě souběžná oznámení zakázky. Správce dostane odpověď nebo žádost o upřesnění. Centrum funguje i bez push; po návratu aplikace načte uložená oznámení.
- **Jsem na cestě**, přesný čas příjezdu a připravená SMS zákazníkovi zůstávají samostatnými původními funkcemi.

## Tabulka, hromadné změny a PDF

Tabulka zachovává řazení a uložený výběr sloupců. Správce vybere nejvýše 50 naplánovaných či nedokončených zakázek a zvolí **Hromadně upravit** den a/nebo hlavního kolegu, se zachováním dalších kolegů podle volby. Náhled a kolize se potvrdí společně; transakce uloží buď celý výběr, nebo nic. Opakování stejného požadavku nevytvoří další změnu.

Rozpis, tabulka a vytížení automaticky načtou až 500 záznamů, další přes **Načíst další** s upozorněním na neúplný přehled. Serverová kontrola kolizí tímto limitem omezena není.

Servisní protokol od 1200 px zachovává **PDF vedle formuláře**, které obnovuje aktuální neuložený obsah bez odeslání či uložení. Původní PDF, materiál, fotografie, předplatné a čerpání nejsou nahrazeny.

## Ukládání, práva a ověření

Migrace `0035_strong_lord_hawal.sql` přidává pouze pole významu původního času s výchozím „unknown“, bez převodu dat. Předchozí migrace `0034_minor_post.sql` přidává do původních zakázek pouze explicitní plánovací údaje a revizi předání, dále tabulky potvrzení a jejich historie. Původní zakázky, časy, přiřazení, protokoly a soubory se nemažou ani nezdvojují. Historické zakázky bez potvrzení se zobrazují jako čekající; nevytváří se falešná starší potvrzení.

API navazuje na původní ochranu CSRF, role a oddělené D1 databáze jednotlivých aplikací/týmů. Kontrola oprávnění a verzí je i ve write SQL. Původní globální revize rozpisu a transakční plánovač chrání souběžné úpravy i změny rezervy. Potvrzení má vlastní verzi a ID operace; opakování nezapisuje další odpověď. Změny zadání resetují potvrzení transakčně i z původních serverových cest.

Plánování a převzetí používají stejně jako dosavadní seznam online API. Nejde o nový offline seznam zakázek. Původní offline protokoly, fotografie a synchronizace pokračují stejným mechanismem; explicitní časy jsou součástí servisního snapshotu. Push není náhradou oprávnění ani podmínkou centra oznámení.

Ověřeno na oddělených syntetických datech: jednotkové/API testy, skutečný workerd/D1 s transakcemi a souběžnými požadavky, Chromium a Linux WebKit; desktop 1280/1440 a telefony 390/430 px, mobilní regrese také 360 px. Testy pokrývají založení kliknutím, dvě zahrady zákazníka, ochranu ručních hodnot, frontu/přetažení, boční úpravy bez ztráty kontextu, konflikty a rezervu, individuální převzetí/revize/historii, odmítnutí zastaralé verze, role a oddělení dat. Regrese zahrnují týden, hromadné úpravy, ovládání myší, živé i offline PDF, historii/závady, fotogalerii a Google Disk s mockovaným OAuth/providerem. Neproběhl test na fyzickém iPhonu ani macOS Safari, ani nový živý souhlas skutečného účtu Google. Pro testování se neukládalo do provozních zakázek.

Doplňující ověření verze 72: `tests/planning-queues.test.js` kontroluje přednost skupin, počty, chybějící délku, zachování původních hodnot, nedostupného kolegu a práva. `tests/desktop-timeline-refinements-browser.cjs` ověřuje 1280/1440 px, přizpůsobení celého dne, zoom, uvolnění šířky po sbalení, bublinu myší i klávesnicí, upřesnění v panelu bez automatického kopírování, zachování filtrů a posunu i zrušení rozepsané nové zakázky bez vzniku záznamu. Původní testy založení, výběru zahrad, přesunů, obnovení stránky, individuálního převzetí a mobilního rozhraní zůstávají součástí ověření.
