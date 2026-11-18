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

Nové sestavení s těmito opravami ještě musí projít. Fyzický iPhone/Watch, reálné HEIC fotografie, tmavý režim a Dynamic Type na 360/390/430 bodech zatím nejsou v této změně ověřené.

Po dostupném macOS runneru spusťte existující workflow `iPhone and Apple Watch build and IPA` pro tuto větev. Před vydáním musí projít jednotkové a UI testy, oba simulátory, release device build a kontrola obou bundle. Podepsání používá dosavadní GitHub Secrets; nic se nevkládá do kódu. Aktualizujte se stejným bundle ID a podpisem bez odinstalace; staré neodeslané změny nejdříve synchronizujte. Pro návrat použijte poslední ověřené sestavení; lokální data nemažte. R2 klíče jsou výhradně serverové, do iOS nepatří.
