# Dr. Závlaha + Dr. Garden: společný adresář a pracovní obory

**Fáze 1 – analýza a návrh ke schválení, 29. 10. 2026.**

Větev: `plan/shared-directory-disciplines-2026-10-29`, základ GitHub `7042b94`. Tento dokument a anonymizovaná inventura jsou jedinými změnami. Aplikační kód, produkční databáze, provozní nastavení, přístupová práva a soubory nebyly upraveny. Převod ani migrace se zatím nespouštěly; jejich první běh patří do izolovaného prostředí ve fázi 2. Předchozí souhlasy s jinými úpravami nejsou souhlasem s touto fází 2.

**Poslední upřesnění zadání má přednost:** Google Disk je nyní mimo rozsah. Nenavrhujeme jeho nové sdílení, přesuny ani testy jeho přímých oprávnění. E-mailové integrace jsou rovněž mimo rozsah. Stávající připojení zůstanou zachována; aplikace musí nadále filtrovat všechny odkazy a souborové odpovědi podle oprávnění. Ověření oprávnění mimo aplikaci na Disku nebude kritériem této verze.

## 1. Ověřený současný stav

### Dvě samostatné instalace

| Vlastnost | Dr. Závlaha | Dr. Garden |
| --- | --- | --- |
| Adresa | `https://zavlahovy-denik.purplecedar.chatgpt.site/` | `https://dr-garden.purplecedar.chatgpt.site/` |
| Nasazená verze | 100 | 22 |
| Site ID | `appgprj_6ac948123b7481918aba63c781695c96` | `appgprj_6ad7176c04b48191a2efec629da48eb0` |
| Zdroj nasazení | `0ac8577658a5d75501807746f40e36af1385b844` | `b7e58a5140e74a10622b376ee4288d39821909cd` |
| Identita instalace | `inst-0336b6c30bb334ae9537ee66653cd401` | `inst-98a53a7b-b13f-41bf-93f7-55800f7b8f13` |
| Úložiště | vlastní D1 + soukromé R2 | vlastní D1 + soukromé R2 |
| Hostingový přístup | veřejný obal, firemní API vyžaduje přihlášení | navíc vlastní seznam povolených účtů na hostingu |

V obou manifestech je vazba pojmenovaná `DB` a `BUCKET`, ale tato jména neznamenají tutéž fyzickou databázi nebo bucket. Jejich obsah a instalační identity jsou odlišné. `worker/installation.js` ověřuje shodu identity databáze a značky `__installation.json` v R2. Pouhé přesměrování vazeb druhé aplikace na cizí úložiště by tuto ochranu porušilo.

Obě aplikace jsou vlastní JavaScript/ES moduly, HTML/CSS, Worker ESM, D1/SQLite a R2; nejde o React aplikaci. Sestavení vkládá klientské soubory do Workeru. GitHub projekt obsahuje `apps/work-diary`, `apps/super-admin` a `packages/platform`. Provozní zdroje obou instalací jsou samostatné; Garden má konsolidovaný základ migrací a verze protokolu se proti GitHubu mírně liší. Slepá náhrada celé instalace aktuálním GitHubem by přinesla nesouvisející změny.

Super Admin je samostatná řídicí aplikace/databáze. Spravuje licence, moduly a agregované technické metriky, nikoli zákazníky či pracovní obsah. Takto musí zůstat i po propojení.

### Inventura skutečných dat

Přečteno přes nativní read-only nástroje Sites, včetně všech vrácených stránek a zkrácení projekce. Výpisy zákazníků a souborové obsahy nejsou součástí větve. Podrobné počty a klasifikace vazeb jsou v `shared-directory-inventory-2026-10-29.json`.

| Evidence | Závlaha celkem / aktivní | Garden celkem / aktivní |
| --- | ---: | ---: |
| Zákazníci | 120 / 120 | 1 / 1 |
| Zahrady | 129 / 128 | 1 / 1 |
| Zakázky | 147 / 126 | 0 / 0 |
| Šachty | 11 / 6 | 0 / 0 |
| Samostatné servisní zápisy | 3 / 1 | 0 / 0 |
| Servisní protokoly | 113 | 0 |
| Fotografie protokolů v R2 | 164 připravených | 0 |
| Fotografie zakázek na Disku (`job_photos`) | 0 | 0 |
| Sledované závady | 1 | 0 |
| Členové | 5 | 1 |

Dále jsou v Závlaze dva odkazy na plány zahrad, 34 fotografických odkazů ve vyfukování a 11 obrazových odkazů u šachet, včetně historických záznamů. Jde o metadata, nikoli ověření existence a kontrolních součtů všech objektů v R2. Garden takové odkazy v přečtených záznamech nemá.

Dr. Garden tedy není úplně prázdný: obsahuje jeden automaticky založený kontakt a jednu zahradu. Ty se zachovají. V Závlaze je 110 zákazníků a 111 řádků zakázek z předchozí testovací dávky, včetně smazaného pokusu. Nejsou automaticky považovány za duplicity ani určeny ke smazání.

V prověřených zákaznících/zahradách/zakázkách a hlavních pracovních tabulkách nebyla nalezena kolize ID mezi instalacemi. Nebyla nalezena ani přesná přeshraniční shoda normalizovaného jména, e-mailu nebo telefonu kontaktů. To není souhlas s automatickým sloučením ani úplná kontrola všech možných podobností.

U celé historie Závlahy je 10 zahrad bez zákazníka, 10 zakázek bez zákazníka a 27 zakázek bez zahrady. Tyto prázdné vazby nejsou samy o sobě chyby. V uvedených neprázdných vazbách na zákazníka/zahradu a u protokolů na zakázku nebyl nalezen odkaz na neexistující řádek. Odkaz na existující smazaný řádek je zvlášť historická vazba, nikoli osiřelý záznam.

Členové obou instalací mají dohromady šest různých identifikátorů. Žádný není v obou evidencích totožný. **Účty proto nelze automaticky sloučit ani podle stejného člověka, e-mailu či zobrazovaného jména.** Před převodem se připraví matice původní účet → výsledná identita, role a obory k potvrzení.

Inventura vznikala jednotlivými čteními a není transakční záloha. Před převodem se zopakuje nad konzistentními exporty; mezitím mohou přibýt záznamy.

### API, práva a ukládání dnes

- `worker/api.js`: důvěryhodná identita z hostingového přihlášení nebo osobní relace, role, kontrola původu zápisů, modulů a licence.
- `worker/jobs.js`, `service-work.js`, `drive-core.js`, `job-photos.js`: seznam i konkrétní zakázky/protokoly/fotky jsou omezené rolí a přiřazením. Členství v oborech zatím neexistuje.
- `worker/customers.js`: správci vidí adresář, pracovník nyní zejména kontakty přes přiřazené zakázky. Nové zadání výslovně rozšíří čtení kontaktů na příslušný obor; nerozšíří úpravy kontaktů ani přiřazování zakázek.
- `worker/api.js`, `garden-history.js`, `blowout.js`: základ zahrad, poznámky, čerpadlo, samostatné servisní zápisy, šachty a vyfukování dosud z větší části používají společný týmový rozsah. Zahradní DTO už dnes posílá i pracovní metadata. Nestačí tedy skrýt dvě záložky v UI.
- Ceny materiálu a účtování mají části jen pro vlastníka; ceny předplatného se pracovníkům odstraňují také serverově. Tato omezení se zachovají.
- Existuje záměrná výjimka, kdy přiřazený čtenář může měnit stav své zakázky. Byla popsána v auditu 28. 10. Tato práce ji bez samostatného rozhodnutí nerozšíří ani nepřepíše; oborové omezení bude platit i pro tuto současnou výjimku.
- Zápisy používají verze/CAS, mutation/operation ID, transakce a historii. Stejné čerpání služby se při opakování neodečítá dvakrát.
- IndexedDB ukládá šachty, servisní zápisy, protokoly, závady, rozpracované formuláře a některé soubory. Přihlášení řeší účet/instalaci/roli, ověření offline je dnes omezené časem přibližně 24 hodin. Oborová verze oprávnění a plošné vyřazení odvolaného oboru zatím chybí. Adresář zákazníků má převážně online úpravy; neslibujeme mu novou offline editaci nad tento rozsah.
- Service worker přednačítá aplikaci; API je z jeho obsluhy vynechané. Soukromé soubory mají `no-store`, ale mohou existovat cílené kopie v IndexedDB a paměti.
- `notifications.js` kontroluje přiřazení/roli při načtení i odeslání. Push na zamčené obrazovce už nepřenáší konkrétní jména nebo pracovní údaje. Chybí kontrola oboru. Připomínky pro realizace a jejich současné načasování se zachovají.
- Skutečné fotky nejsou jen na Disku: šachty, vyfukování, protokoly a plány používají R2. Google integrace pro fotky zakázky dnes používá `drive.file`, soukromý Můj disk a odmítá externí sdílení. Její změna je nyní odložená.

## 2. Varianty architektury

| Varianta | Přínosy | Rizika / omezení |
| --- | --- | --- |
| Dvě autoritativní databáze a obousměrná synchronizace kontaktů i práce | Zachová dnešní fyzické instalace a jejich částečnou nezávislost. | Dvě zápisová místa, konflikty mazání/rolí, obtížná okamžitá revokace, duplicity a komplikovaný souhrnný kalendář. Podmínka jedné společné karty vyžaduje další společnou autoritu; pouhé kopírování ji nesplní. Nedoporučuji. |
| Jedna autoritativní pracovní databáze a společné API, dvě současné vstupní aplikace | Jedna karta zákazníka, transakční vazby a členství, společný přehled, jednotná autorizace, jednodušší migrace na vlastní hosting. | Nutné sjednotit pracovní API, autentizaci, licence a přístup k původním souborům; společná služba je důležitá pro obě aplikace. Doporučeno. |

**Doporučení:** pro tyto dvě výslovně propojené organizace vytvořit jeden pracovní prostor (`workspace`) se společnou autoritou zákazníků, zahrad a pracovních dat. Obor je bezpečnostní atribut dat, nikoli jen filtr. Ostatní firmy, firma Test a Super Admin do tohoto prostoru nepatří.

Zachovat oba odkazy a značky. Po přechodu obě rozhraní používají společné pracovní API. V prostředí Sites doporučuji ověřit společné API v existující pracovní instalaci Dr. Závlahy a u Dr. Garden využít bezpečnou serverovou bránu. Nevycházím z neověřeného předpokladu, že Sites umí připojit dva projekty ke stejné fyzické D1/R2.

Brána ověří skutečné přihlášení na vstupní adrese a předá krátce platné podepsané tvrzení o identitě a konkrétním požadavku. Společné API samo načte aktuální roli a obory, ověří audience, původní instalaci, čas, nonce a podpis/otisk požadavku. Prohlížeč nesmí dodávat důvěryhodnou roli, oborové oprávnění ani servisní tajemství. Podpis není univerzální vlastnický token. Osobní cookie se nepřenáší mezi doménami a uživatel se nemusí vydávat za vlastníka.

Před změnou dat se toto propojení ověří na neprodukční konfiguraci obou typů hostingového přístupu. Pokud ho dostupný hosting bezpečně nedovolí, převod se zastaví a předloží se jiný vstupní bod společného API; žádná skrytá kopie adresáře nenahradí schválený model.

Původní Garden databáze zůstane po ověřeném převodu obnovitelným archivem, nikoli druhou aktivně upravovanou kartou zákazníka. Samostatná firemní nastavení a původní identifikátory organizací se zachovají. Nevypínají se instalační značky ani se nepřepíší identity bucketů. Na vlastním hostingu lze později stejné rozhraní provozovat přímo nad společnou databází.

## 3. Navržený datový model

Následující seznam je návrh, nikoli provedená migrace či spustitelný SQL soubor.

| Entita | Změna / účel |
| --- | --- |
| `workspaces`, vazby organizací | Výslovně povolená pracovní skupina Dr. Závlaha + Dr. Garden. Ostatní organizace zůstávají izolované. |
| `disciplines` | Dvě interní hodnoty `irrigation` / `garden`. Neexistuje třetí interní obor „both“. |
| `workspace_members`, vazby identit | Účet, stávající role a verze oprávnění; zachování původních účtů a jejich původu. Nastavení vlastníka zůstává oddělené od čtení práce obou oborů. |
| `member_disciplines` | Jedna nebo dvě řádky přiřazení pracovníka k oborům. Unikátní vazba účet + obor. Změna jen podle současné hierarchie správy týmu. |
| `customers` | Jedna společná karta: původní ID, kontakty, e-mail, adresy s jejich původními ID a nová obecná kontaktní poznámka. Jedna verze pro společný obsah. Žádné automatické kopie na obor. |
| `customer_disciplines` | Množina oborů zákazníka; UI zobrazuje Závlaha, Garden nebo Obojí podle přítomnosti dvou vazeb. |
| `gardens` / místa | Původní ID a volitelný zákazník; společná adresa, název a výslovně společný základní popis. Zákazník může mít více míst. U místa bez zákazníka se povolené obory uchovají samostatnou vazbou, nikoli automatickým zpřístupněním všem. |
| `garden_discipline_data`, pracovní poznámky | Poznámky, údaje o čerpadle a pracovní dokumentace oddělené oborem. Stará `gardens.notes` se automaticky nezveřejní oběma týmům; podle původu zůstane pracovní poznámkou. |
| `jobs` | Zachovat ID, přiřazení, stav, časy a vazby; přidat povinný konkrétní obor a pracovní prostor. Nikdy „Obojí“. Obor se nesmí odvozovat až z aktuální kategorie zákazníka. |
| Protokoly, pokusy, servisní zápisy, závady, přílohy | Jednoznačný vlastní nebo neměnný zděděný obor ověřovaný vůči rodiči. Historické snímky a částky se nepřepočítají změnou společné karty. |
| Šachty, vyfukování a jejich dokumentace | Vždy `irrigation`, včetně fotografií, plánů závlahy, značek, instrukcí, závad a odkazů. Starý zahradní JSON vyfukování se zpřístupní jen samostatným autorizovaným DTO. |
| Registr souborů | Původní ID/provider/instalace/klíč nebo file ID, velikost/hash, vlastník dat, obor či výslovně společný rozsah. Soubor se nemusí fyzicky kopírovat jen kvůli nové historii. |
| Audit členství | Událost, aktér, čas serveru, původní/nová množina oborů, zákazník/pracovník, důvod/operace. Ukládá se atomicky se změnou. |
| Původ a aliasy | Evidence původní instalace, tabulky a ID, pravidel převodu, případně ručně schváleného sloučení. Staré identifikátory a odkazy zůstávají dohledatelné. |
| Manifest synchronizace | Verze oprávnění, obory, rozsah uživatele a zrušené lokální dostupnosti; není závislý na tom, zda se načetla celá stránkovaná evidence. |

Pracovní entity ponesou povinný obor a vazbu na pracovní prostor, případně ji budou mít přes neobcházitelného rodiče. Indexy a databázové podmínky budou podporovat dotazy podle prostoru, oboru, termínu a přiřazení. Zápis musí kontrolovat stejný pracovní prostor a slučitelné vazby; nestačí existence libovolného ID.

Aktivní zákazník má nejméně jednu příslušnost. Odebrání posledního oboru nenahrazuje dosavadní samostatnou akci odstranění/archivace zákazníka. Odebrání oboru zákazníkovi je zakázáno při existenci zakázky či pracovního záznamu tohoto oboru, včetně uchované historie a měkce smazaných záznamů. Kontrola a změna proběhnou v jedné transakci, aby souběžné založení zakázky kontrolu neobešlo. Přidání druhého oboru nevytváří nového zákazníka.

Obor zakázky se po vzniku pracovních zápisů nesmí jednoduše přepsat a tím odtajnit starou historii. Přechod práce do jiného oboru se řeší novou navazující zakázkou nebo výslovným auditovaným převodem s opětovným vyhodnocením všech pracovních dat.

## 4. Matice oprávnění

| Osoba | Karty zákazníků a společný základ míst | Zakázky | Pracovní obsah a soubory |
| --- | --- | --- | --- |
| Správce / administrátor / vlastník | Oba obory, filtr Vše / Závlaha / Garden | Oba obory v rozsahu své stávající role | Souhrnná historie s oborem; ceny, vlastnické funkce a správa práv zůstávají podle původních pravidel. |
| Pracovník Závlaha | Závlaha a Obojí | Závlaha **a současné pravidlo přiřazení** | Jen povolená práce Závlaha; Šachty/Vyfukování ano u dostupné zahrady. |
| Pracovník Garden | Garden a Obojí | Garden **a současné pravidlo přiřazení** | Jen povolená práce Garden; nikdy obsah, počty, náhledy nebo odkazy Šachet/Vyfukování. |
| Pracovník obou týmů | Oba obory | Podle přepnutého oboru a přiřazení | Oba obory, ale beze zvýšení role, cenových a správních pravomocí. |
| Čtenář | Viditelnost podle jeho oborů | Současná práva čtenáře a přiřazení, omezená oborem | Bez nových zapisovacích pravomocí; současná výjimka pro změnu stavu přiřazené zakázky se výslovně eviduje. |
| Super Admin platformy | Nezíská přístup k pracovním datům | Nezíská přístup | Jen metadata povoleného propojení, licence, moduly a technický stav. |

Pravidlo pro pracovní zakázku: **správný pracovní prostor ∧ povolený obor ∧ stávající oprávnění role ∧ přiřazení, je-li vyžadováno ∧ povolený modul/licence**. Štítek Obojí na zákazníkovi vyhodnocení zakázky neobchází. Kontakty jsou podle nového zadání dostupné podle oboru i tehdy, pokud pracovník zatím nemá konkrétní zakázku; úpravy karty stále patří správci.

„Správce vidí obě firmy“ neznamená, že získá vlastnické funkce druhé instalace, přístup k tajným klíčům nebo možnost měnit jiné administrátory mimo dosavadní hierarchii. Při převodu se nesmí použít pravidlo „vezmi nejvyšší roli ze všech zdrojů“ ani automatické spojení účtů podle e-mailu.

Společná serverová autorizační vrstva se použije před čtením i změnou: seznamy, hledání/návrhy, počty, kalendáře, časová osa, vytížení, mapa, detail, historie, závady, služby, přímé fotografie, PDF/exporty, přílohy, oznámení i synchronizace. Stejná kontrola musí být v databázové podmínce zápisu kvůli souběžným změnám rolí a oborů. Neplatný či chybějící obor nepřiděluje přístup „pro jistotu“.

## 5. Společná zahrada bez úniku pracovních údajů

Základ místa se nejprve autorizuje: u propojené zahrady podle příslušnosti zákazníka, u zahrady bez zákazníka podle samostatné příslušnosti místa převzaté z původu a případně potvrzené správcem. Prázdný zákazník tak zůstane platnou volitelnou vazbou, ale není výjimkou z oprávnění.

Zahradní odpověď pro Garden bude obsahovat pouze povolený společný základ a jeho práci. Nebude posílat `pumpType`, staré pracovní `notes`, soubory plánu závlahy, značky šachet, JSON vyfukování, jejich počty, skryté názvy či URL. Bezpečnost nelze zajistit odstraněním tlačítek až v prohlížeči.

Společné obecné poznámky jsou pouze nová výslovně kontaktní/společná pole. Stávající volný text zahrady či protokolu se nepovýší na společnou poznámku podle odhadu obsahu.

Historie se sestaví z původních zakázek a samostatných servisních zápisů. Protokol obohatí příslušnou návštěvu, nevytvoří druhou. Pracovník uvidí jen povolené obory a přiřazení; správce oba s označením oboru. Prázdná volitelná vazba nevyvolá párování podle jména či adresy.

Každá fotka/příloha je buď výslovně společná fotografie zahrady, nebo pracovní soubor konkrétního oboru/zakázky. Fotka ze Šachet či Vyfukování nesmí být zařazená jako společná. Pracovní fotka se nestane společnou jen tím, že její zákazník přejde na Obojí. Změna viditelnosti vyžaduje oprávnění, audit a kontrolu všech odkazujících záznamů.

U stávajících R2 souborů se zachová zdroj, klíč, ID a kontrolní součet. Pokud se pro společnou službu kopírují, nejprve se ověří cílový hash a přístup a teprve pak se přepne registr; původní zdroj zůstane po dobu návratu. Kolize instalačních značek nebo klíčů se neřeší přepsáním bucketu.

## 6. Offline a oznámení

Použít současné fronty, verze a idempotenci, doplnit pracovní prostor, identitu, obor a verzi oprávnění. Režim „Vše“ správce není nový obor ani údaj, kterému se věří z klienta.

Po připojení je pořadí závazné:

1. Obnovit autentizaci, aktuální roli, obory, moduly a `authorizationVersion`.
2. Při změně zablokovat zastaralé otevřené detaily a fronty, zrušit probíhající načítání a odstranit odvolaná data, soubory, náhledy, formuláře a objektové URL z běžné lokální dostupnosti.
3. Načíst explicitní autorizační manifest a povolená data. První stránka seznamu nesmí být omylem vyhodnocená jako úplná evidence a vymazat jiné platné položky.
4. Teprve potom odeslat stále povolené čekající operace. Zakázané operace neobnovují dřívější oprávnění; souběh vrací konflikt k ručnímu porovnání.

Pro neodeslanou práci z právě odvolaného oboru navrhuji šifrovaný obnovovací balíček pouze pro správce, oddělený od pracovního zápisu. Po úspěšném zabezpečení se místní čitelná kopie odstraní; balíček se nikdy automaticky nepromítne do zakázky a pracovník ho nemůže přečíst přes API. Před implementací se ověří ochrana klíčů a obnovitelnost. Bez bezpečné obnovy musí být případná ztráta neodeslaného konceptu oznámena; nesmí se tiše smazat ani ponechat přístupná zrušenému oboru.

Zařízení bez internetu nemůže okamžitě zjistit změnu provedenou jinde. Zachovat časově omezené offline oprávnění, po jeho vypršení vyžadovat internet a revokaci dokončit při další synchronizaci. Ani odstranění z aplikace neodvolá již stažený export či soubor, který si člověk uložil mimo ni.

Oznámení musí mít obor nebo jednoznačný autorizovaný rodičovský záznam. Kontrola se provede při vytvoření, načtení centra oznámení, sestavování počtů a těsně před push doručením. Po změně oborů se dříve připravené nepovolené oznámení nevydá. Dosavadní obecný text push na zamčené obrazovce se zachová. E-mailové konektory se neupravují; není možné přesunem staré fronty omylem zopakovat odesílání.

## 7. Plán převodu: nejdřív nanečisto

### A. Příprava a obnovitelná záloha

- Po schválení se připraví kompatibilní společné sestavení, nikoli přímá produkční změna tohoto dokumentu.
- Vytvořit čerstvou úplnou zálohu **obou** D1, soukromých souborů a potřebných vazeb/integrací, uložit mimo měněnou instalaci, ověřit heslo/obnovovací materiál a provést obnovu do izolovaných prázdných instalací. Pouhý stav „Připravená“ bez ověřené obnovy není migrační test.
- Nezávisle uložit seznam původních objektů a hashů, verze aplikací, schéma, instalační identity a možnosti návratu. Tajemství neukládat do GitHubu nebo migračního reportu.

### B. Deterministický zkušební převod

- Vytvořit manifest `migration_run_id`, zdrojové snapshoty, pravidla, kontrolní součty a rozhodnutí správce. Stejný manifest při opakování vytvoří stejné výsledky.
- Existující zákazníci Závlahy dostanou obor Závlaha, Garden zákazníci obor Garden. Žádný automaticky Obojí. Oba obory vzniknou až výslovným přidáním nebo potvrzeným sloučením.
- Zakázky a samostatná práce dostanou konkrétní obor podle původní instalace. Šachty a Vyfukování jsou vždy Závlaha. Nejasná klasifikace se předloží ke kontrole a mezitím není zveřejněna druhému týmu.
- Přenést i uchované smazané řádky, historii pokusů, přílohové vazby a cenové snímky. Původní ID zákazníků, adres, zahrad i zakázek se zachovají. Případná nově zjištěná kolize ID převod zablokuje a vyžádá výslovné mapování; nesmí tiše nahradit jiný záznam.
- Již smazaný testovací pokus se neobnoví a nevytvoří se další aktivní náhradní zakázka. Testovací dávka se v inventuře označí; podle zadání zachovat data zůstává zachovaná, dokud správce výslovně neschválí jiné nakládání.
- `NULL`/prázdná volitelná vazba zůstane prázdná. Neprázdný odkaz na neexistující cíl je samostatný nález k řešení. Nezačít automaticky tvořit zahrady ke všem importovaným zákazníkům; stávající automatické párování se zachová pro běžné nové záznamy, nikoli pro obnovu původní historie.
- Duplicitní kandidáty jen navrhnout. Potvrzené sloučení vytvoří jednu aktivní kartu, obory jako sjednocení a audit/aliasy obou původních ID; zahrady a zakázky zůstanou jednotlivé a historie obou záznamů dohledatelná. Kontaktní hodnoty a adresní ID se nesmí tiše přepsat. Při shodném lokálním ID adresy ve dvou slučovaných kontaktech se zachovají oba původní identifikátory v aliasu s původním zákazníkem/instalací a obě adresy; nové jednoznačné rozlišení nesmí přepsat ani zaměnit starou adresní vazbu zakázky. Tento případ je samostatným migračním testem.
- Zvlášť zkontrolovat identitní matici šesti současných účtů a původní hierarchii rolí. Žádné povyšování podle názvu, e-mailu nebo vyšší role nalezené v jiném účtu.

### C. Přehled pro schválení a testy

Výstup dry-run: počty před/po po oborech, mapa všech ID a referencí, zachované prázdné vazby, samostatné neplatné vazby, kandidáti duplicit, přesná navržená sloučení, matice rolí/oborů, seznam starých a nových souborových odkazů a rozdíly hashů. Žádná provozní změna, dokud je kritický rozdíl nevyřešený.

Dry-run se spustí alespoň dvakrát nad stejnými exporty. Druhý běh nesmí přidat zákazníka, zahradu, návštěvu, čerpání ani soubor. Zkušební databáze projde kontrolou referencí a všemi akceptačními scénáři níže.

### D. Řízené přepnutí a návrat

Před přepnutím ověřit nové či čekající offline zápisy a dohodnout krátké okno pozastavení zápisů. Zvolit konzistentní poslední snapshot; neprovozovat starou a novou databázi souběžně jako dvě zápisové autority. Zastaralí klienti musí dostat čitelnou zprávu o aktualizaci, ne odeslat neomezená stará data do nového modelu.

Po přepnutí běží jen společná pracovní autorita. Vypnout původní zapisovací cesty, zkontrolovat oba vstupy, přímé soubory a úlohy oznámení. Původní data a soubory se po ověřovací dobu nemažou.

Návrat před první novou produkční změnou je obnova původního směrování a dvojice ověřených záloh. Po nových zápisech se návrat nesmí provést slepou obnovou starého snapshotu: nejprve zastavit zápisy, uložit delta deník a nové soubory a schválit jejich vyrovnání. Plán návratu obsahuje toto rozhodovací místo.

## 8. Plán testů a podmínky přijetí

Pouze testovací/obnovené izolované instalace. Reálné účty, zakázky a fotky se nepoužijí k zápisovým testům.

| Oblast | Povinné ověření |
| --- | --- |
| Zákazníci | Závlaha, Garden, Obojí; jedna karta a stejné ID po přidání druhého oboru; více míst; společná kontaktní poznámka a samostatné pracovní poznámky. |
| Zakázky | Každá má právě jeden obor; zákazník Obojí neodtajní druhou práci; správný výběr kontaktů a míst; prázdná volitelná vazba; blokace neslučitelného oboru zákazníka. |
| Matice osob | Vlastník, správce, administrátor, pracovník Závlaha, Garden, oba obory a čtenář; zachování role, cen a přiřazení; žádné samoobslužné přidání oboru. |
| Obcházení UI | Cizí ID, přímý URL/API, parametry filtru, stránkování, hledání, počty, kalendář, časová osa, tabulka, vytížení, mapa, export a PDF nesmí rozšířit autorizaci. Mapa zůstává jen pro správce. |
| Společná zahrada | Garden pracovník vidí základ zákazníka Obojí, ale nikoli Šachty/Vyfukování, čerpadlo/poznámky/plán závlahy, jejich soubory, náhledy, počty či URL. Přímé staré i nové R2 aplikační URL jsou zamítnuty. |
| Pracovní data | Protokoly, výkazy, závady, vlastní historie pokusů, starší servisní zápisy a fotografie oddělené oborem. Správce vidí společnou časovou historii s označením a bez dvojí návštěvy. |
| Změna příslušnosti | Audit kdo/kdy/před/po; blokace odebrání oboru zákazníkovi s prací i historií; souběžné založení práce při odebrání nesmí obejít zákaz. |
| Souběh | CAS změn kontaktu dvěma aplikacemi, změna role mezi kontrolou a SQL zápisem, idempotentní retry včetně protokolu/čerpání; žádný tichý poslední zápis přes cizí změnu. |
| Offline | Oddělení účet/prostor/obor/verze práv, stále povolené fronty, revokace a vyčištění blobů/konceptů po synchronizaci, expirovaná relace, uzamčená bezpečná obnova neodeslané práce, přepnutí účtu a částečně načtené seznamy. |
| Oznámení | Nová i už připravená událost po změně týmu, počty, přímý cíl a push. Bez úniku druhého oboru a bez opakovaného odeslání starých front. |
| Migrace a soubory | Počty aktivních/historických řádků, zachování všech vazeb/ID/původních časů a částek, prázdné versus neplatné vazby, ručně potvrzené duplicity, opakování, hash souborů, obnova a řízený návrat. |
| Mobil / desktop | 360/390/430 a 1280/1440 CSS px, textové štítky, čitelné přepínače, dialogy/klávesnice a safe-area; skutečný iPhone/Safari zvlášť, pokud bude k dispozici. |
| Platforma | Ostatní firmy a Super Admin nemají přístup; obor nepřepne zakázané moduly/licenci; různé povolení modulů a přihlášení na obou vstupech. |

Přímá oprávnění Google Disku a e-mailové integrace jsou po posledním upřesnění mimo testovací rozsah. Jejich splnění se nesmí označit za hotové. V této fázi nebyla implementace těchto budoucích scénářů ani migrační dry-run provedena.

## 9. Etapy implementace po schválení

1. **Technické ověření společného API a vstupů:** neprodukční brána, ověřená identita, společná autorita, rozdílné licence, žádný přístup jiné firmy. Neúspěch blokuje převod.
2. **Model a jednotná autorizace:** dvě interní příslušnosti, pracovní obor, audit, DTO zahrady, zachování současných rolí a uzavření všech vedlejších cest.
3. **Adresář a ovládání:** jedna karta, více míst, rozlišení kontakt/práce, správní filtry a automatický obor pracovníka; oba vstupy používají stejná data.
4. **Soubory, historie, oznámení a offline:** stávající R2 a chráněné aplikační odkazy, fronty a revokace, bez změny externího Disku/e-mailu.
5. **Obnovitelné zálohy, opakovaný dry-run a kompletní testovací matice:** porovnání a konkrétní report ke kontrole před provozním přepnutím.
6. **Přepnutí a následné ověření:** pouze podle ověřeného postupu, zachování návratu, původní úložiště ponechaná po ochrannou dobu.

Jde o změnu autorizačního a datového základu dvou aplikací, ne pouze přidání tří štítků. Orientačně několik etap v řádu 2–4 týdnů vývojové práce a ověřování, nikoli garantovaný termín; přesnější rozsah určí technické ověření brány a identit. Odložený Google Disk v odhadu není.

## 10. Rizika, otevřené body a navržené výchozí volby

| Bod | Návrh a podmínka |
| --- | --- |
| Omezení Sites pro společné API | Ověřit jako první na izolovaném prostředí; nepředstírat společnou databázi pouhou kopií kontaktů. |
| Šest různých členských ID | Připravit jmennou matici pro vlastníka mimo veřejný report; žádné slučování podle e-mailu ani automatické povýšení. Určení výsledných identit blokuje produkční přepnutí, nikoli tento plán. |
| Práva pracovníků | Výchozí je přesně požadovaný průnik obor + současné přiřazení zakázky. Kontakty příslušného oboru lze číst nezávisle na přiřazení zakázky. |
| Licence / moduly / vlastník | Nepřenést vlastnické pravomoci jen kvůli propojení. Zachovat vazbu organizace a licence k práci daného oboru; nepřepínat oprávnění podle podvrhnutého hostitele/filtru. |
| Poznámky a nejasné staré soubory | Pracovní podle původu; společné jen výslovně. Nejasný obsah do vyjasnění nedostane druhý tým. |
| Testovací data | Zachovat a označit, nevylučovat ani nemazat bez výslovného rozhodnutí. |
| Duplicitní či kolidující záznamy | Předložit kandidáty; shoda jména/telefonu/adresy není souhlas se sloučením. |
| Staré klienty a offline revokace | Bez online spojení nelze okamžitou revokaci garantovat. Nutná verze oprávnění, uzavření staré API cesty a ověřená obnova lokální práce. |
| Návrat po nových zápisech | Potřebuje delta deník a vyrovnání; pouhé vrácení starého zálohového souboru by ztratilo novou práci. |
| Google Disk / e-mail | Nyní odloženo. Staré integrace zachovat a nepovolovat nové širší sdílení. Přímé externí odkazy mimo aplikaci tento projekt necertifikuje. |

Žádná další otázka nyní neblokuje dokončení fáze 1. Ke schválení předkládám variantu jedné autoritativní pracovní databáze/API pro tuto dvojici, uvedený model a oprávnění, zachování dat včetně testů a postup nejdříve záloha → izolovaná obnova → opakovaný dry-run → kontrola změn → provozní přepnutí.

**Čeká se na výslovné schválení tohoto plánu. Fáze 2 nezačne automaticky.**
