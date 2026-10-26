# Historie zahrady a sledované závady

## Kde funkce najdete

- **Zahrady → konkrétní zahrada → Historie:** návštěvy, práce, zaznamenaný materiál, původní závady v protokolu, fotografie a odkazy na zakázku a protokol/PDF. Pořadí je od nejnovějšího data.
- **Zahrady → konkrétní zahrada → Závady:** otevřené problémy a sbalené vyřešené závady. U ostatních částí zahrady je také upozornění na počet otevřených závad.
- **Více → Závady** na mobilu, **Závady** v levém menu na počítači: týmový přehled, hledání zahrady/zákazníka a filtry zahrady, pracovníka, stavu a priority. Rychlé volby Moje závady a Bez přiřazení.
- **Detail zakázky:** upozornění a přidání závady, pokud má zakázka přiřazenou zahradu.
- **Servisní protokol:** tlačítko „Uložit protokol a sledovat popsanou závadu“ uloží protokol a nabídne výslovné založení sledované závady. Samotné uložení textu do pole Zjištěné závady nic nezakládá. Další jednotlivé závady lze přidat tlačítkem Přidat závadu.

## Doporučený postup

1. Technik do protokolu zapíše problém a zvolí jeho sledování, případně přidá závadu přímo ze zahrady/zakázky. Doplní název, místo, prioritu a další krok. Fotografie lze vybrat z existující soukromé dokumentace; originály se nekopírují.
2. Servis nebo zazimování může normálně dokončit. Sledovaná závada zůstane otevřená, i když má nízkou prioritu.
3. Správce u závady přiřadí odpovědného a zvolí **Naplánovat opravu**. Otevře se stávající formulář zakázky se zahradou, zákazníkem a popisem. Vybere termín a techniky; přidat může další závady stejné zahrady. Existující opravná zakázka je vidět a před další se zobrazí potvrzení.
4. V opravné zakázce jsou související závady. Po dokončení protokolu se nabídne jejich kontrola. Každou skutečně opravenou závadu je třeba výslovně změnit na **Vyřešeno** a doplnit popis opravy. Není nutné uzavřít všechny závady návštěvy.
5. Vyřešená závada zmizí z otevřených a zůstane v rozbalovací historii. Lze ji znovu otevřít. Autor, čas a obsah změn, přiřazení, poznámky i vazby na opravy zůstávají v auditní stopě.

Stavy se mění samostatně podle skutečnosti: Nová, Čeká na díl, Oprava naplánována, Vyřešeno. Naplánování zakázky zachovává původní stav závady, který lze výslovně změnit v jejím detailu. Dokončení ani odstranění zakázky závadu automaticky neuzavře.

## Datové vazby a bezpečnost

Historie používá přímo `jobs.garden_id`, `service_reports`, `service_logs`, soukromé R2 fotografie a Google Drive fotodokumentaci. Nevzniká druhá evidence návštěv ani kopie souborů. Starší zakázka bez `garden_id` se zobrazí jen při současné shodě **ID zákazníka a úplné uložené adresy**, pokud tato adresa patří právě jedné aktivní zahradě zákazníka. Shoda jména ani přibližné geokódování nestačí. Nejednoznačnou starší návštěvu může správce propojit přes existující úpravu zakázky.

Přídavná migrace `0032_sharp_mongoose.sql` vytváří pouze `garden_defects`, `garden_defect_events` a `garden_defect_jobs` s unikátní vazbou závada/zakázka a unikátním klíčem převodu protokolu. Neupravuje ani nemaže provozní záznamy. Oprava používá existující zakázky a kalendář. Protokol lze převést opakovaně, ale vznikne nejvýše jedna sledovaná závada daného převodu; ručně je možné založit další samostatné problémy.

Aplikace má jednu týmovou databázi a společné zahrady pro členy týmu. Nový modul přebírá tato současná oprávnění; nezavádí širší přístup ani nové týmy. Nečlen se nedostane k datům. Čtenář prohlíží, pracovník/správce/vlastník zapisuje závady, zakázky vytváří správce/vlastník. Původní zakázky, protokoly a fotografie zůstávají omezené na správce a přiřazené pracovníky. I závada ve společné zahradě skryje nepřístupné zdrojové odkazy a fotografie. Materiál se v historii zobrazuje bez cen katalogu. Kontroly probíhají na serveru, včetně kontrol členství při databázovém zápisu.

## Offline a synchronizace

Závady používají stejnou IndexedDB jako servisní protokoly (bezpečné zvýšení verze na 4). Autorství a oprávnění potvrzuje server. Čekající změny mají vlastní ID požadavku, vstupují do počtu synchronizovaných změn a ochrany proti přepnutí účtu s neodeslanou prací. Odesílají se po protokolech, aby již existoval zdrojový zápis. Opakovaný požadavek nepřidá auditní událost ani závadu znovu.

Při výpadku se text uloží do telefonu a zobrazí stav Čeká na sdílení. Konflikt verzí ponechá místní i aktuální serverový zápis: uživatel převezme zápis kolegy nebo výslovně potvrdí své změny na jeho aktuální verzi. Chybný zápis lze upravit; odeslání lze zkusit znovu. Přístupové chyby data zamknou do obnovení oprávnění.

Načtené přehledy a historie jsou stejně jako autorizované protokoly dostupné offline nejvýše 24 hodin a jsou oddělené podle účtu/role. Neotevřenou zahradu a historii je nutné nejprve načíst online. Plánování nové opravné zakázky vyžaduje internet, protože stávající evidence zakázek je online. Odkazy na originální fotografie potřebují připojení; tento modul nestahuje další kopie všech souborů pro offline použití. Stávající offline fotografie protokolů zůstávají beze změny.

## Ověření

- `tests/garden-history.test.js`: celý postup původní servis → závada → oprava více problémů → výslovné vyřešení/znovuotevření, audit, převod bez duplikace, zákazník s více zahradami, jednoznačné starší adresy, verze, role a přístup k původním médiím, fotografie bez kopírování, materiál bez cen, vypnuté funkce.
- `scripts/test-garden-history-worker.mjs`: skutečné workerd/D1 migrace, současné vytvoření a opakování stejného požadavku, konflikt dvou úprav a atomické vazby oprav bez změn z neúspěšného požadavku.
- `tests/garden-history-browser.cjs`: skutečné rozhraní, převod protokolu, dokončení původní návštěvy s otevřeným problémem, offline zápis a synchronizace, přidělení, předvyplněná oprava dvou závad, výslovné vyřešení jedné, historie obou návštěv, konflikt offline zápisu a rozhodnutí uživatele. Šířky 360/390/430 px a desktop.
- Regrese servisních protokolů/PDF/offline, mobilních zakázek a Google Disku používají samostatnou místní testovací databázi a simulované externí služby. Provozní data se nepřepisují.

Fyzický iPhone ani skutečný Safari nejsou dostupné. Chromium a WebKit jsou automatizovaná emulace; nelze jí potvrdit chování skutečné systémové klávesnice nebo Google účtu.
