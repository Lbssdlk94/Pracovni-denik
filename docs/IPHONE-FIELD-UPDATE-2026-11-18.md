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
- Přidáno 10 XCTest scénářů pro stavové akce, přiřazení, přesné role, deduplikaci deníku, odjezd/zahájení/dokončení, galerii bez Disku, výpadek uploadu, Retina kompresi, cesty/náhledy a konfliktní smazání. Přidány dva UI scénáře pro setrvání v detailu a galerii bez Disku. Jejich spuštění vyžaduje Xcode.
- Zdrojové změny neobsahují R2 údaje, tokeny ani změny serverových oprávnění. `git diff --check` prošel.

## Vydání a omezení

Toto prostředí je Linux bez Xcode. Předchozí GitHub běh 43742164617 skončil před spuštěním runneru; anotace uvádí neúspěšné platby nebo nízký limit útraty v Billing & plans. Aktuální [běh 44378588683](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44378588683) pro commit `607d61b3657dfdd110f928b550d08818d2d70c98` skončil stejným způsobem před spuštěním runneru. Anotace check-runu `135064307236`: „The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the Billing & plans section in your settings“. Neběžel žádný Xcode test, nevznikla nová IPA ani ověřené screenshoty. Nepodepsaná/podepsaná IPA, fyzický iPhone a Watch, reálné HEIC fotografie, tmavý režim a Dynamic Type na 360/390/430 bodech zatím nejsou v této změně ověřené. Ani lokální parser, ani backendové testy nejsou náhradou.

Po dostupném macOS runneru spusťte existující workflow `iPhone and Apple Watch build and IPA` pro tuto větev. Před vydáním musí projít jednotkové a UI testy, oba simulátory, release device build a kontrola obou bundle. Podepsání používá dosavadní GitHub Secrets; nic se nevkládá do kódu. Aktualizujte se stejným bundle ID a podpisem bez odinstalace; staré neodeslané změny nejdříve synchronizujte. Pro návrat použijte poslední ověřené sestavení; lokální data nemažte. R2 klíče jsou výhradně serverové, do iOS nepatří.
