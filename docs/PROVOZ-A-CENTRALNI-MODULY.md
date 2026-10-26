# Technický stav, licence a centrální moduly

Super Admin má sekce Technický stav, Licence a Zpřístupnění funkcí. Registr přijímá pouze agregované metriky, nikoli zakázky, zákazníky nebo fotografie. Nové přehledy vyžadují identitu provozovatele a platnou MFA relaci. Firemní služební token nemůže číst přehled ani měnit moduly.

Technický stav vyhodnocuje poslední heartbeat: do 15 minut čerstvý, do 24 hodin opožděný, poté zastaralý. Není to nezávislá kontrola HTTP dostupnosti. Zavřená aplikace bez automatického běhu nemusí posílat hlášení. Zobrazuje skutečně hlášenou verzi aplikace a schématu, přijetí revize konfigurace, připravenost DB/R2, hlášenou zálohu a překročení počtu uživatelů. Chybějící záloha není automaticky tvrzení, že jiná záloha neexistuje.

Licence ukazují platnost včetně posledního dne v časovém pásmu Europe/Prague. U testovací firmy rozhoduje dřívější konec trialu a licence. Lze filtrovat končící a prošlé licence. Přehled sám nic nepozastavuje a neposílá e-maily. Stávající podpis a kontrola licence na firemním serveru zůstávají autoritativní.

## Rozbalovací moduly

Firmy → detail → Upravit firmu a licenci → Povolené moduly firmy. Skupiny jsou sbalené. U Zakázek otevřít Jednotlivé části: Můj den, Seznam, Kalendář, Časová osa, Týden, Tabulka, Vytížení, Fronta plánování, Převzetí, Jsem na cestě, Fotografie protokolu a prototyp účtování. Mapa a fotodokumentace mají vlastní moduly a zachovávají své závislosti a role.

Integrace a přidávání souborů obsahuje celé propojení Google Disku a přidávání nových fotografií. Vypnutí Disku zablokuje jeho API a nastavení; nic na Googlu nemaže ani nerevokuje uložené připojení. Vypnutí nových fotografií zachová čtení uložených snímků, úpravy textu a popisků, blokuje nové snímky v zakázce/protokolu, šachtách, vyfukování a obrázkových plánech. PDF plány nejsou fotografie a zůstávají povolené. Opětovné odeslání šachty starým offline klientem při zákazu snímků zachová původní snímek a dovolí opravu textu/popisků.

U Upozornění jsou samostatná E-mailová upozornění kolegům (připomínky realizací přes Resend). Vypnutí zachová centrum oznámení a push. Neovlivňuje samostatný postup schvalování e-mailů s výkazy zákazníkům; ten není tímto přepínačem označován jako vypnutý.

Firemní vlastník, administrátor, správce, pracovník ani čtenář v instalaci připojené k platformě nemůže měnit moduly přes UI ani PUT /api/features. U nepřipojeného původního samostatného deníku se zachovává dosavadní nastavení. Nová firemní instalace se propojuje s platformou před otevřením.

Migrace 0001 pouze přidává JSON sloupec feature_overrides s výchozím {}. Stará centrální konfigurace dědí původní hodnoty; žádná firma se při nasazení nepřepne na jiné moduly. Výslovně uložené centrální volby mají přednost před dřívějšími místními přepínači, ale nepřekročí sjednaný tarif, profesi, modulové závislosti ani roli uživatele. Podmínky a ceny stávajících tarifů se nemění. Starší editor bez nového pole existující volby zachová.

## Postupné zpřístupnění

Nejprve povolit již implementovaný modul jedné firmě. Po ručním funkčním testu vybrat tuto firmu jako ověřenou. Pro rozšíření na více firem je nutná její platná licence a čerstvé hlášení aktuální revize a připravené DB/R2. Operátor výslovně potvrzuje provedený funkční test; pouhý heartbeat jej nedokazuje.

Změna je transakční pro nejvýše 20 vybraných firem, s očekávanými verzemi, idempotentním ID požadavku, historií a auditem. Konflikt jedné firmy odmítne celou změnu. Opakování stejného požadavku nezmění revize podruhé. Zpřístupnění není nasazením nového kódu; to nadále probíhá přes Sites. Automatický poskytovatelský adaptér není připojen. Změna se u připojeného serveru načte nejvýše po pěti minutách; ověřená cache může bez spojení platit až 24 hodin. Dr. Garden má automatické běhy podle původní volby stále vypnuté.

## Vozidla

Nový licencovaný modul Vozidla má části: tankování, spotřeba, servis, ostatní výdaje, samostatný zápis kilometrů, STK, známky, účtenky, vlastní výběr auta a připomínky. U starších profesí/tarifů operátor nejdříve přidá Vozidla do katalogové profese i tarifu a potom v detailu vybrané firmy výslovně převezme nové verze a povolí modul. Tím se bez rozhodnutí operátora nerozšíří sjednaná licence jiné firmy. Výchozí definice pro nové katalogy modul obsahují.

Firemní správce spravuje auta a v existujícím Týmu tlačítkem Řidič / auto označí kolegu. Role se nemění. Označený řidič v Vozidla → Moje auto zvolí aktivní auto sám. Další řidič může používat stejné auto; nejde o výhradní rezervaci nebo knihu předávání klíčů. Neoznačený pracovník nevidí provozní záznamy a řidič vidí historii aktuálně vybraného auta. Správce vidí vše v rámci své samostatné firmy. Čtenář zapisovat nemůže.

Tankování ukládá cenu v haléřích, litry v tisícinách, datum, km a plnou nádrž; ID a jméno/účet autora doplní server. Úprava jiným správcem původního autora nepřepíše. Spotřeba používá výpočet mezi plnými nádržemi převzatý a otestovaný ze Superb Garage. Data ani fotografie z původní aplikace nebyly z jejího localStorage přeneseny; původní aplikace zůstala beze změny. Automatický import její místní historie není součástí této dodávky.

Účtenky jsou soukromě v R2 dané firmy, ne na Google Disku. Mají kontrolu přístupu při každém čtení, nejvýše tři snímky na záznam a limit 8 MB na snímek; UI snímky předem připraví jako JPEG. Stabilní ID při opakovaném pokusu brání duplicitě. Vypnutí nových snímků nebo účtenek zachová již uložené přílohy. Úplná systémová záloha nově zahrnuje tabulky vozidel i soubory účtenek.

Odebrání auta je archivace, která zruší výběr řidičů, ale zachová historii správci. Přepínač Včetně odebraných ji opět zobrazí. Nájezd automaticky pouze roste; zpětně vložené tankování jej nesnižuje. Nejnovějších 1 000 záznamů je limit přehledu auta; neúplná historie nevrací zavádějící spotřebu.

STK a známky mají vlastní nastavitelný předstih. Zprávy vznikají v současném centru oznámení, bez duplicit na auto/termín/uživatele, s novou kontrolou přiřazení při čtení i push. Kontrola proběhne při otevření Vozidel a v existujícím serverovém běhu připomínek. Bez zapnutého serverového běhu nelze slíbit upozornění při trvale zavřené aplikaci; zejména Dr. Garden zůstává podle původní volby bez automatických běhů. Připomínky vozidel neposílají nové e-maily; využívají centrum a nakonfigurované push. Pro tankování a ostatní změny vozidel je v této verzi potřeba internet. Offline mechanismy dosavadních částí deníku se nemění. Nepřenáší se minihra původní aplikace.

## Jednoduchá úvodní obrazovka Vozidel (22. 10. 2026)

Výběr auta a Přidat tankování zůstávají přímo na stránce. STK, známka,
spotřeba, servis, náklady, historie a správa aut se zobrazí až po otevření
„Podrobnosti a historie“. Rozbalení se při obnově záznamů zachová; nové
otevření aplikace začíná se sbalenými podrobnostmi. Odkaz z upozornění
otevře rovnou příslušné podrobnosti. Prohlížení jiného auta správcem nemění
jeho přiřazení jako řidiče. Neuložený výběr jiného auta u pracovníka dočasně
zablokuje tankování, aby se omylem nezapsalo k původnímu autu.

Izolovaný prohlížečový test ověřil uložení tankování a účtenky, autora,
obnovení dat, výběr auta, zachování STK/známky, rozbalení klávesnicí,
oprávnění a šířky 360/390/430/1280/1440. Testy se nedotýkají provozních dat.

### Fotografie auta

V Podrobnostech a historii může vlastník, administrátor nebo správce zvolit
Přidat/Změnit fotku auta, vybrat soubor nebo auto vyfotit. Snímek se před
odesláním zmenší a zobrazí u vybraného auta přímo nad tankováním. Klepnutí
otevře zvětšení. Pracovník vidí pouze snímek svého vybraného auta; nemůže
jej měnit. Nahrazování i odstranění kontroluje verzi na serveru. Vypnutí
nového přepínače Fotografie aut nebo globálního nahrávání zabrání novým
uploadům; existující fotografie zůstanou dostupné. Uložení používá soukromé
firemní R2 bez Google Disku a fotografie jsou součástí úplné zálohy.
Migrace 0041 pouze přidává tři sloupce do stávající tabulky vozidel.

## Přímé povolení nového modulu existující firmě

Starší definice tarifu a profese ani sjednané kopie automaticky neobsahují
nově vytvořený modul. To se projevilo zamčeným přepínačem Vozidel u firem.
V detailu firmy je proto tlačítko Povolit Vozidla. U nedostupných modulů
v editoru je uveden důvod a akce Povolit pro tuto firmu.

Po výslovném potvrzení operátor rozšíří pouze potřebné moduly v nabídce
použitého katalogového tarifu a profese a jako dodatek do sjednaných kopií
vybrané firmy. Zapne se i výběr firmy, řízené zpřístupnění a přepínač modulu.
Nepřebírá se dnešní katalogová cena, datumy, limit uživatelů, názvosloví ani
jiné podmínky. Základní čísla sjednaných verzí se nemění; dodatek je uložen
v historii module_extension, verzi firmy a podepsané revizi její licence.
Jiné existující firmy zachovají své sjednané kopie a dostupnost.

Operace vyžaduje operátora s MFA a ochranu CSRF, je atomická, kontroluje
souběžné úpravy katalogu i firmy a při opakování stejného požadavku se
neprovede dvakrát. Běžné firemní role nemají přístup. Pozastavená nebo
prošlá licence se touto akcí neobnoví. Firemní server používá pětiminutovou
mezipaměť ověřené licence; po jejím obnovení je potřeba načíst deník znovu.

Ověřeno na izolovaných datech: starý katalog i stará firma bez Vozidel,
povolení přes zamčený přepínač, skutečné uložení a obnovení stránky,
zachování sjednané ceny při vyšší aktuální katalogové ceně, oddělení druhé
firmy, podepsaná licence, konflikt a opakované odeslání, oprávnění a mobilní
šířky 360/390/430 i desktop 1280/1440. Živé licence se pro test neměnily.
