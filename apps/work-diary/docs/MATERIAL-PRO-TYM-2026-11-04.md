# Materiál pro celý tým a odstranění syntetické sady

Katalog je při povoleném modulu dostupný vlastníkovi, administrátorovi, správci, pracovníkovi i čtenáři. Ceny a katalog spravují pouze vlastník, administrátor a správce; změny server znovu autorizuje při zápisu. Pracovník vybírá materiál a množství v protokolu své přidělené zakázky. Čtenáři se nerozšiřují práva zápisu ani přístupu k cizím zakázkám. Účtování práce/cesty zůstává samostatným prototypem vlastníka. Licence a vypnutí modulu zůstávají závazné.

Uložené řádky protokolu nadále používají cenové revize katalogu a historické snímky, nikoli cenu zaslanou klientem. Opakované odeslání zachovává stejné ID operace. Offline katalog je vázaný na přihlášený účet; změna účtu během načítání nesmí vrátit předchozí cache. Materiál je doplněný také do nabídky nativního klienta; doručení této změny do IPA vyžaduje nový Apple build.

## Jednorázové odstranění Test1–Test305

Migrace 0053 odstraňuje pouze identifikovanou sadu `volume-20261027`. Ověřuje přesná ID zákazníků a automatických zahrad, syntetické adresy, původní verze, značku a vazby zakázek. Jiné záznamy pojmenované Test zůstávají zachované. Rodiny s jinou návštěvou, předplatným, šachtou, servisním zápisem či skutečnou závadou se přeskočí. Výjimka pro jednu ověřenou závadu „Vyfoť oběd“ je omezena jejím přesným ID, zdrojovou testovací zakázkou, verzí a referencemi na dvě syntetické fotografie.

Používá standardní příznaky smazání a zvýšení verzí. Původní hodnoty, protokoly a soubory se fyzicky nemažou; zůstává možnost obnovy. Mazání není čištění R2 ani uvolňování místa. Plán a původní verze/metadata jsou v interním nastavení `cleanup:volume-20261027:20261104`. Opakování je bez dalších změn. Formulář pro opětovné vytvoření zátěžové sady byl odstraněn z běžného nastavení.

Zkouška na izolované kopii osmi souvisejících tabulek: 110 zákazníků, 110 zahrad a 110 aktivních zakázek označeno jako smazané. Jedna zakázka ze staršího pokusu již byla smazaná. Žádný jiný řádek těchto tabulek se nezměnil. Kopie sloužila výhradně pro čtení a ověření migrace; do provozu se neimportuje.

Ověření: 312 testů prošlo. Prohlížeč Chromium ověřil katalog a oprávnění na 360, 390, 430 a 1440 px, výběr množství do protokolu pracovníkem a jeho skutečné uložení po offline zápisu, původní ceny po změně katalogu a PDF. Skutečný iPhone/Safari a nová IPA nebyly v této kontrole ověřeny.
