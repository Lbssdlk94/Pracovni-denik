# iPhone: dokončení pracovních postupů 0.8.1 (10)

Zdrojová větev: `fix/ios-current-workflows-2026-11-18`, základ `32bc72c` (poslední dokončené webové změny). Rozpracované R2 zůstává na samostatné větvi. Produkční data ani hosting se touto úpravou nemění.

## Změny

- Společná nativní pravidla určují další akci: Naplánováno → Jsem na cestě; Na cestě → Probíhá; Probíhá → Hotovo. Vypnutý modul odjezdu nabídne zahájení práce. Hotové, nedokončené, zrušené a neznámé stavy nenabízejí automatické pokračování. Změna stavu dál vyžaduje potvrzení, aktuální verzi a serverové oprávnění; odjezd vyžaduje přesný čas a zachovává připravenou SMS. Servisní předplatné dál vyžaduje stávající dokončovací protokol.
- Detail má hlavní akce v safe-area liště nad systémovou navigací. Formuláře se otevírají jako SwiftUI sheet přímo nad detailem. Uložení nepřepíná aktivní záložku ani nepopuje NavigationStack. Stejné postupové pravidlo používají karty zakázek.
- Kontakt je dostupný pod místem návštěvy. Fotodokumentace se otevírá samostatně, spodní pětice záložek zůstává dostupná. Duplicitní titul zákazníka a velký úvodní panel Přehledu byly odstraněny.
- Galerie přestala vyžadovat modul `googleDrive`. Při serverovém `uploadStorage=app` využívá existující PUT originálu, PATCH kategorie/poznámky a PUT náhledu. Stávající Drive soubory a staré fronty se nemažou. Při změně účtu se další kroky vícenásobného nahrávání zastaví; nesmějí pokračovat pod novým účtem. Částečné nahrání používá stejné ID a stejné bajty při opakování.
- Galerie, protokol a deník používají společné nativní miniatury. Malý náhled je preferovaný, plná fotografie se otevírá v Quick Look. U chybějícího náhledu se použije stávající originál; chyby oprávnění se tímto fallbackem neobcházejí. U starších/protokolových fotek bez uloženého malého náhledu se zatím stahuje celý soubor a lokálně zmenší.
- Výběr až 40 snímků se zpracovává postupně. Fotoaparát i knihovna zmenšují fotky na nejvýše 2048 pixelů na delší straně; JPEG se adaptivně kóduje s cílem do 800 KiB. Opravena chyba Retina rendereru: jeho scale je nyní 1, takže 2048 obrazových bodů neznamená 6144 pixelů. Velikost není pevně zaručena u detailních scén a průhledných PNG; průhlednost se zachovává. HEIC používá systémový ImageIO dekodér a výstup JPEG. Existující serverové fotografie se touto změnou nepřepisují.
- Deník je seskupený po dnech s jedním datumem. Pending zápis nahrazuje odpovídající serverový řádek bez duplikace. Povinné fotografie, šifrované koncepty a závislosti offline fronty se zachovávají.
- Mazání zápisu vyžaduje `canDelete` ze serveru, roli přesně owner/administrator, potvrzení, verzi a operationId. Správce, pracovník, čtenář ani náhled role akci nedostanou. Smazání je online, neodstraňuje fotografie, zakázku ani protokol. Konflikt zůstává viditelný.

## Kontroly

- 4 Python testy zásad podpisu a 13 testů přípravy/párování simulátorů: prošly.
- Izolované skutečné backendové testy `job-diary.test.js`, `job-photo-app.test.js`, `job-workflow.test.js`: prošly. Pokrývají role, přiřazení, pracovní obory, CAS, povinné snímky, idempotenci, uchování fotografií a explicitní nedokončení. První pokus z kořene měl chybný pracovní adresář; korektní opakování proběhlo z `apps/work-diary`.
- Syntaktický parser tree-sitter-swift: 74 souborů bez syntaktických chyb. Nejde o kompilaci, kontrolu typů ani ověření SwiftUI layoutu.
- Přidáno 11 XCTest scénářů pro stavové akce, přiřazení, přesné role, deduplikaci deníku, odjezd/zahájení/dokončení, galerii bez Disku, výpadek uploadu, Retina kompresi, cesty/náhledy a konfliktní smazání. Přidány dva UI scénáře pro setrvání v detailu a galerii bez Disku. Jejich spuštění vyžaduje Xcode.
- Zdrojové změny neobsahují R2 údaje, tokeny ani změny serverových oprávnění. `git diff --check` prošel.

## Vydání a omezení

Toto prostředí je Linux bez Xcode. Po odstranění platební blokace byl znovu spuštěn [běh 44378797078](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44378797078), pokus 2, Xcode 27.1. Kompilace prošla, všech deset nových funkčních unit testů prošlo. Celkově proběhlo 69 unit testů s jednou chybou a 12 UI testů s jednou chybou. IPA nevznikla, protože workflow správně nepokračovalo po selhání testů.

Odhalené příčiny a opravy před dalším sestavením:

- Zrušená úloha pro měsíční cache ještě vytvářela novou autorizační přípravu a odesílala další manifest fence. Doplněny kontroly cancellation/epoch/scope před přípravou a mezi síťovými kroky; při změně zakázky se ruší i rozpracovaná příprava. Nový test ověřuje nulové požadavky po okamžitém zrušení downloaderu, původní očekávání dvou manifest požadavků zůstává zachované.
- Detail odvozoval akci jen ze svého snapshotu a čekal na nové GET. Nyní čte již potvrzenou novější verzi z existujícího cache záznamu APIStore; nevzniká další evidence. Unit test ověřuje aktualizaci ještě před dalším GET, UI test čeká na skutečné zmizení akce a současně ověřuje setrvání v detailu.

Následující úspěšné ověření je zaznamenáno níže. Fyzický iPhone/Watch, reálné HEIC fotografie, tmavý režim a Dynamic Type na 360/390/430 bodech zatím nejsou v této změně ověřené.

Po dostupném macOS runneru spusťte existující workflow `iPhone and Apple Watch build and IPA` pro tuto větev. Před vydáním musí projít jednotkové a UI testy, oba simulátory, release device build a kontrola obou bundle. Podepsání používá dosavadní GitHub Secrets; nic se nevkládá do kódu. Aktualizujte se stejným bundle ID a podpisem bez odinstalace; staré neodeslané změny nejdříve synchronizujte. Pro návrat použijte poslední ověřené sestavení; lokální data nemažte. R2 klíče jsou výhradně serverové, do iOS nepatří.


Opakované ověření: [běh 44382420809](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44382420809) pro `a29b785` zkompiloval aplikaci a všech 70 unit testů prošlo. Jeden UI test dokončení ještě selhal. Přidané předávání cílového stavu přes identifikovatelný sheet požadavek místo dvojice nezávislých stavů bool/target odstraňuje možnost otevřít formulář se starým cílem. UI test nově kontroluje i skutečně vybraný stav před potvrzením, nejen text hlavního tlačítka. Workflow nyní sestavuje feature větve přes pull request a main přes push; ruční spuštění pro libovolnou větev zůstává. Dvojí spuštění a rušení stejného SHA tak neplýtvá macOS během. Finální ověření těchto změn prošlo, viz následující záznam.


## Ověřené dokončení

- Zdroj `518a76548db2820fc2bd9d2047e52795a272e39e`, [běh 44385049004](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44385049004), stav **success**. Xcode 27.1, iOS/watchOS SDK 27.1.
- **70 jednotkových testů + 12 UI testů, 0 chyb.** Nový UI scénář potvrdil cílový stav Hotovo, změnu stavu a setrvání v detailu se spodní navigací.
- Release sestavení pro skutečný iPhone a kontrola bundle bez WebKitu/JS/HTML prošly. Vložená Watch aplikace, shodné verze, ikony, nastavení soukromí, build simulátoru Watch a tři náhledy prošly.
- IPA, SHA256 soubor, logy a náhledy: [PracovniDenik-builds-and-logs-UNSIGNED](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44385049004/artifacts/14467321342), ID `14467321342`, 8 877 783 bajtů ZIP. Digest ZIP `fcecfdc37fd68bfb730d9db07e74fa03e0b00ac545582e3fc65f24f92a1bebda`. Toto je checksum celého ZIP, nikoli samotné IPA; její checksum je v `IPA-SHA256.txt` uvnitř. Platnost artefaktu do 2. 12. 2026.
- Podpis Apple nebyl spuštěn (`sign_ipa=false`), TestFlight/App Store nebyly publikovány. Fyzická zařízení a skutečné doručování APNs zůstávají neověřené.
- Místní stažení náhledů blokuje síťový proxy při připojení na GitHub artifact blob host (CONNECT 403). Náhledy byly vytvořeny v CI, ale nebyly zde ručně vizuálně prohlédnuty. Uživatel je může stáhnout přímo přes výše uvedený GitHub artefakt.
- Následující dokumentační commit nemění testovaný Swift kód, project.yml ani workflow. Další placené sestavení není potřeba opakovat kvůli samotnému záznamu výsledků.
