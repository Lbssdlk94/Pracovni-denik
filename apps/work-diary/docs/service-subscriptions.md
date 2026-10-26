# Servisní předplatné – použití a technické poznámky

## Použití

1. Otevřete **Předplatné → Správa tarifů**. Výchozí LOW (2 990 Kč/rok), MEDIUM
   (5 990 Kč/rok) a HIGH (14 990 Kč/rok) jsou záznamy v databázi. Ceny, měna,
   období, služby, počty, pořadí, výhody, priorita, rozsah a podmínky lze měnit.
   Tarif lze duplikovat nebo deaktivovat. Deaktivace nemaže smluvená období.
2. U služby nastavte počet v jednom sjednaném období, frekvenci, doporučené
   měsíce, automatické návrhy, odpočet a zahrnutí v ceně. Pro běžný servis,
   vyfouknutí a jarní spuštění je jedna položka každého druhu; další činnosti
   můžete přidat jako vlastní služby. Vlastní služba při duplikaci zachovává
   svou návaznost pro přenos čerpání.
3. **Zákaznická předplatná → Přiřadit tarif**: vyberte stávajícího zákazníka,
   případně jeho propojenou zahradu, platnost, sjednanou cenu, splatnost a kolegu.
   V detailu zákazníka tlačítko **Přiřadit tarif** otevře tento formulář
   rovnou s vybraným zákazníkem. Zkontrolujte shrnutí podmínek.
4. Výchozí volba **Potvrdit plán bez termínů a návštěvy plánovat postupně**
   potvrdí rozsah péče a plný počet služeb bez vytvoření zakázek. Kolegu ani
   termíny nyní nezadáváte. V detailu předplatného u služby klepněte na
   **Naplánovat návštěvu**, vyberte datum a kolegu. Volba **Rovnou potvrdit tuto
   návštěvu** ji zpřístupní kolegovi v běžných Zakázkách a Kalendáři.
   Samotné plánování nic neodečítá; čerpání se zapíše až dokončením.
   U staršího předplatného použijte **Potvrdit plán bez termínů**. Nedotčené
   automatické návrhy se archivují; potvrzené, ručně přidané a rozpracované
   návštěvy zůstanou zachované. Ceny ani počty sjednaných služeb se nemění.
   Při úpravě návštěv označte pouze ty, které chcete nyní uložit. Ostatní se nemění.
5. Pokud postupné plánování vypnete, automatické návrhy obsahují 1/3/12 servisů plus jedno vyfouknutí.
   Jarní spuštění v MEDIUM a HIGH je také zahrnutá služba; výchozí termín
   navrhuje správce tlačítkem **Naplánovat návštěvu**. Můžete zapnout i jeho
   automatické návrhy. Automatický návrh je vodítko; ověřte místní sezonu.
   Ke konkrétní návštěvě můžete přidat více lidí v rozbalovací části **Další
   kolegové**. Všichni vybraní uvidí stejnou zakázku, kontakty, fotky a připomínky.
   Sdílejí společný stav a protokol; dokončení odečte službu pouze jednou.
6. Ve vlastních zakázkách otevřete **Servisní protokol a materiál**. Zvolte
   zkontrolovaný/připravený/chybějící materiál, vyplňte skutečné datum, práce,
   materiál, závady, poznámku a doporučení. Chybějící materiál se zobrazí správcům.
   Při dokončení přes **Hotovo** se příprava materiálu nezobrazuje. Podrobnosti
   protokolu jsou dobrovolné a rozbalíte je jen podle potřeby. Bez ručního data
   se použije dnešní den.
7. **Uložit rozpracovaný protokol** neodečítá službu. **Dokončit servis** označí
   existující zakázku jako hotovou a jednou zapíše čerpání konkrétní služby.
   Nové otevření či smazání/storno zakázky odpočet vrátí. Změna již hotového
   protokolu nevytváří druhý odpočet. Správce může s odůvodněním potvrdit
   mimořádný servis bez odpočtu nebo opravný odpočet; kapacita se hlídá v databázi.
8. **Zapsat platbu / stav** eviduje skutečné částky a data i stav platby. Stav je
   vědomé rozhodnutí správce, automaticky se pouze zobrazí prodlení po splatnosti.
   Žádná platební brána ani automatické strhávání nejsou připojené.
9. **Změnit tarif** vytváří nové období od zvolené účinnosti; původní podmínky a
   cena zůstávají v historii. Zvolte nový plný počet, přenos čerpání nebo vlastní
   počáteční hodnoty. Přenos dál reaguje na opravy starších servisů. Vlastní
   služby, které nový tarif neobsahuje, se nepřenášejí. Změna začíná nejdříve
   dnes a až po prvním dni předchozího období. Dokončené servisy nelze změnou
   zpětně přesunout do jiných smluvních podmínek.
10. **Prodloužit** přidá další období s novou kopií podmínek a novou kapacitou,
    staré období neupravuje. Předplatné lze pozastavit, znovu aktivovat a ukončit.
    Ukončení zruší nedokončené návštěvy, zachová historii a fotografie.

## Offline a fotografie

Otevřením návštěvy s internetem si telefon uloží její autorizované údaje;
seznam zakázek přednačítá nejvýše osm vlastních nedokončených servisů. V offline
Předplatném jsou jen údaje uložené v daném zařízení, nikoli celý seznam serveru.
Zápis a původní JPG/PNG/HEIC (nejvýše 25 MB/kus, 40 na protokol) se ukládají do
IndexedDB. Po obnovení připojení se soukromé fotografie a protokol odešlou.
HEIC lze uchovat i v prohlížeči, který neumí jeho náhled. Fotografie protokolů
jsou v soukromém R2 úložišti aplikace, přístupné přes kontrolované API zakázky.
Stávající fotodokumentace Google Disk zůstává k dispozici v detailu zakázky.
Odebrání snímku z aktuálního protokolu nemaže originál ze servisní historie.

Na konflikt se nikdy nepoužije tiché přepsání: formulář ukáže serverovou verzi
pro porovnání a nabídne převzetí či výslovné použití místních změn. Při odebrání
přístupu se citlivý snímek dat odstraní; vlastní neodeslaný text lze vyřešit nebo
vědomě zahodit. Přepnutí účtu s čekajícími změnami je blokované stejně jako u
stávajícího servisu. Čistá cache platí nejvýše 24 hodin, je oddělená podle účtu a
při změně role se zneplatní. Oprávnění odebrané na serveru nelze zjistit na zcela
odpojeném telefonu; po připojení se vždy ověřuje před zápisem. Tarify, smlouvy a
platby se nikdy nemění offline. Smazání lokálních dat prohlížeče před synchronizací
odstraní dosud neodeslané zápisy; běžná sdílená záloha neobsahuje tuto soukromou cache.

## Připomínky a e-mail

Zakázky mají tři druhy: **Servis, Realizace a Zaměření**. Druh volí správce
při vytvoření nebo úpravě; přehled a kalendář lze filtrovat podle druhu.
Starší zakázky mají výchozí druh Servis, který lze podle potřeby změnit.
V **Nastavení → Připomínky materiálu před realizací** správce nastaví počet dní
předem (0 až 60), pracovní nebo kalendářní dny a přesun víkendové či sváteční
připomínky na předchozí pracovní den. Výchozí předstih je **3 pracovní dny**;
pracovní dny vynechávají soboty, neděle a české svátky včetně Velikonoc.
Náhled pro libovolný termín ukáže konkrétní datum připomínky. Nastavení platí
pro celý tým, ostatní kolegové ho mohou prohlížet. Změny se potvrzují serverem;
souběžnou změnu jiného správce nelze bez obnovení přepsat.
Serverový kontrolní běh vytváří připomínku materiálu **pouze pro Realizaci**.
Pokud nově přidaná zakázka nebo změna předstihu vypočte již minulý den, kontrola
upozorní při nejbližším běhu v povolený den, dokud nezačne den po realizaci.
Dostane ji každý přiřazený kolega,
pokud je zakázka potvrzená a nedokončená. Funguje i bez servisního předplatného.
U zakázek typu Servis a Zaměření se připomínka materiálu nevytváří. Běžná oznámení
o přiřazení a změně zakázky fungují dále pro všechny druhy.
Stejnou připomínku neposílá dvakrát. Změna dne či přiřazení zneplatní starou
připomínku. Odkaz vždy vede do soukromé existující zakázky. Push používá dosavadní
VAPID konfiguraci a uživatelovo povolení; zamčený telefon nezobrazuje kontaktní
údaje. Pro nepřítomnost uživatelů je potřeba aktivní propojená cloudová úloha.
Její nastavení a poslední běh zkontrolujete v přehledu předplatného.
Dokud není pravidelná úloha aktivní, správce může použít tlačítko **Spustit
kontrolu připomínek**. Ruční tlačítko nezajišťuje běh při zavřené aplikaci.
Pro tento Site je zapnutá propojená úloha **Kontrola materiálu před realizací**, která
běží každou hodinu od 08:00 do 18:00 v pásmu Europe/Prague. Limit pěti aktivních
úloh byl vyřešen pozastavením úlohy Sprout Pi na výslovnou žádost vlastníka.
První serverový kontrolní běh byl ověřen; budoucí běhy sledujte podle času poslední kontroly.

E-mail je volitelný a vyžaduje vlastní odesílací službu. V této implementaci jde o
Resend:

1. Na https://resend.com založte účet a ověřte vlastní odesílací doménu podle jeho
   DNS pokynů. Heslo nikomu neposílejte.
2. Vygenerujte API klíč pro odesílání a v runtime secrets stávajícího Site nastavte
   `RESEND_API_KEY` a `SERVICE_EMAIL_FROM` (např. `Dr. Závlaha <servis@vasedomena.cz>`).
3. Znovu nasaďte uloženou verzi, aby se konfigurace uplatnila. Neměňte VAPID ani
   klíč pro šifrování Google Disku.
4. Nastavte testovací zakázku typu Realizace tři dny předem, zkontrolujte e-mail člena týmu a
   spusťte kontrolní úlohu. Ověřte přijetí skutečným účtem. Bez těchto údajů se
   e-mail neposílá; centrum oznámení a povolený push fungují samostatně.

E-mailová fronta má trvalé identifikátory, zámky pro souběh, nejvýše pět pokusů a
poskytovatelský idempotency-key. Při výpadku nebo dočasné chybě se stav uloží pro další běh. Trvalé odmítnutí
(typicky neověřený odesílatel či neplatný klíč) se označí jako neúspěšné a
vyžaduje opravu konfigurace a řízené znovuzařazení. Neopakuje se naslepo
vytvoření druhé zprávy.

## Datový model a kontroly

`service_tariffs` ukládá editovatelné definice. `subscriptions` je smluvní vazba na
stávajícího zákazníka/zahradu; `subscription_periods` uchovává samostatné kopie cen
 a podmínek. `subscription_payments` je historie přijatých plateb. Plány jsou pouze
řádky v existujícím `jobs` s odkazy na sjednané období a službu. `service_reports`,
`service_report_history` a `service_photos` rozšiřují konkrétní zakázku, nevedou
paralelní evidenci zakázek. `subscription_usage` má primární klíč zakázky; databázový
trigger přepíná čerpání podle jejího stavu. `subscription_operations` chrání proti
opakování požadavku, včetně porovnání obsahu. Mutace používají verze a transakce D1.

Správce a vlastník spravují obchodní část. Pracovník čte předplatné pouze díky své
schválené přiřazené zakázce a může zapisovat pouze vlastní protokol a přípravu.
Tyto kontroly jsou i na backendu a u obsahu fotografií. Budoucí zákaznický portál
musí mít samostatné ověřené mapování identity na customer_id a úzké API. Nyní
nevzniká zákaznický účet ani veřejný zákaznický endpoint.

Automatický plán má limit 80 návrhů na období; služby lze plánovat také ručně.
Tento limit chrání velikost jedné transakce. V žádném případě se nepublikují
skutečné zákaznické kontakty nebo přístupové tokeny ve zdrojích a veřejných souborech.
