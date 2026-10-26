# Servisní výkaz: práce, cesta a schvalování e-mailů

## Použití

1. Správce v **Nastavení → Fakturační údaje firmy** uloží jméno firmy, adresu, IČ, DIČ a případně kontakty a účet. Pracovník tuto administraci nevidí.
2. V detailu zákazníka přes **Upravit zákazníka** vyplňte e-mail a případné samostatné fakturační jméno, adresu, IČ a DIČ. Jinak se použije zákazníkovo jméno a první adresa. Seznam zákazníků ukazuje pouze jméno, otevření detailu a rychlé zavolání.
3. Jako vlastník otevřete zakázku a její **Servisní protokol**. V části **Práce a cesta → Nastavit sazby pro další výkazy** uložte obě sazby v Kč. Cena není předvyplněná; nulová sazba je povolená.
4. Zapněte **Zahrnout práci a cestu do výkazu**, zadejte skutečné hodiny a km. Práce se zaokrouhluje nahoru na celé hodiny, cesta nahoru na bloky 30 km. Nula má nula bloků. Například 1,2 hodiny a 31 km znamenají 2 hodiny a 2 cestovní bloky. Vzdálenost se nezjišťuje z GPS; zadejte celkové účtované km.
5. Uložené sazby se pro další nové výkazy nabízejí automaticky. Starší/rozpracovaný výkaz si zachová svou revizi sazeb. **Použít aktuální uložené sazby** je výslovná změna konkrétního výkazu.
6. Uložte a synchronizujte protokol. **Zobrazit PDF** ukáže práci, cestu, případný materiál, součty a fakturační údaje. Je to servisní výkaz, nikoli daňový doklad; modul nepočítá DPH ani nevystavuje fakturu. Různé měny materiálu se nikdy nesčítají do jedné částky.
7. Pod náhledem PDF se vlastníkovi zobrazí **Odeslání výkazu zákazníkovi**. Příjemce se převezme ze zákazníka; lze ho pro konkrétní žádost zkontrolovat/upravit.
8. **Připravit PDF ke schválení** uloží přesné PDF do soukromého úložiště. Nic neodesílá. Otevřete **Zkontrolovat PDF**, zkontrolujte příjemce a zvolte **Schválit a odeslat**. To je samostatné nevratné potvrzení v roli správce.

**Současný prototyp:** katalog materiálu, ceny, práce/cesta a celý schvalovací e-mailový panel jsou pouze pro vlastníka, včetně backendu. Vlastník má současně správcovská oprávnění a nyní schvaluje odeslání sám. Jiný správce ani pracovník tyto soukromé řádky nevidí a nemění; jejich běžné úpravy protokolu je zachovají. Zpřístupnění účtování pracovníkům je až budoucí samostatná změna. Firemní nastavení a běžné fakturační údaje respektují existující přístup správce a přiřazených pracovníků.

## Nastavení skutečného odesílání

1. Založte účet u [Resend](https://resend.com), přidejte svou odesílací doménu a podle instrukcí služby nastavte a ověřte DNS záznamy. Vytvořte API klíč s oprávněním Sending access pro tuto doménu.
2. Jako **vlastník nebo správce** otevřete **Nastavení → Nastavení hostingu · Resend**.
3. Do pole **API klíč Resend** vložte klíč. Do **Odesílatel** zadejte například `Dr. Závlaha <servis@vase-domena.cz>` z ověřené domény. Zvolte **Uložit nastavení Resend**. Klíč nevkládejte do chatu ani zdrojového kódu.
4. Změna se projeví ihned bez dalšího nasazení. Klíč se uloží na serveru šifrovaně pomocí AES-GCM a serverového hlavního klíče, který již chrání propojení s Diskem, s odděleným kontextem šifrování. Prohlížeč zpět dostává pouze informaci „klíč je uložený“, adresu odesílatele a verzi. Nejde o obecný editor ostatních tajných proměnných hostingu.
5. Při změně samotného odesílatele nechte pole klíče prázdné. Vyplněním nového klíče nahradíte původní. **Vypnout a odstranit uložený klíč** odesílání vypne i v případě původní konfigurace přes prostředí; klíč v účtu Resend musíte případně odvolat přímo v Resend. Pro opětovné zapnutí vložte klíč znovu.
6. Otevřete aktuální uložené PDF a obnovte stav odesílání. Připravte žádost na vlastní testovací e-mail, zkontrolujte PDF a samostatně schvalte odeslání. Ověřte doručení i přílohu ve schránce/spamu. Uložení konfigurace samo neověřuje doménu ani neposílá e-mail. Nastavení přípravy/schvalování výkazů zatím zůstává pouze vlastníkovi.

Pro technickou správu zůstává podporovaný původní fallback `RESEND_API_KEY` + `SERVICE_EMAIL_FROM`, pokud v aplikaci neexistuje vlastní konfigurace. Nastavení v aplikaci má přednost. Neměňte ani nemažte serverový `DRIVE_TOKEN_ENCRYPTION_KEY` bez migrace zašifrovaných údajů; při jeho nedostupnosti se odesílání bezpečně zastaví a nevrátí se k jinému účtu. Samotný hlavní klíč se v aplikaci nezobrazuje ani nenastavuje.

Pokud se po zahájení pokusu o odeslání změní klíč nebo odesílatel Resend, zbývající pokusy této zprávy se zastaví, aby se nepřenesly mezi účty s jinou platností idempotence. Před novou žádostí ověřte původní doručení v Resend.

Aktuální aplikace již má hodinovou serverovou úlohu pro připomínky. Kontroluje i schválené e-maily výkazů; opakování e-mailů není závislé na zapnutí materiálových připomínek. Nevytváří se nová naplánovaná úloha. Stav „přijato e-mailovou službou“ znamená přijetí poskytovatelem, nikoli potvrzené doručení do schránky. Webhooky doručení nejsou implementované.

## Konzistence a bezpečnost

- D1 migrace 0026 a 0027 jsou pouze přídavné. `work_rate_revisions` uchovává neměnné sazby, `service_reports.work_charges` serverem vypočtenou kopii a `billing_details` kopii fakturačních údajů. Změna firemních nebo zákaznických údajů nepozmění starší PDF/protokol. Správce může při uložení výslovně zvolit obnovení fakturačních údajů.
- Hodiny/km podporují tři desetinná místa. Ceny se ukládají v haléřích. Klientem podvržené sazby a součty server ignoruje; vychází z uložené revize.
- Výkaz používá existující offline frontu a CAS verzi zakázky. Uložené sazby starého výkazu fungují offline, správa sazeb a příprava/schválení e-mailu vyžadují internet. Konflikty řeší stávající porovnání místního/serverového zápisu.
- PDF pro schválení je neměnná příloha do 12 MB v neveřejném R2. Identifikátor žádosti, SHA-256, příjemce a verze chrání opakované požadavky. Změna protokolu/zakázky vyžaduje nové PDF a nové schválení. Žádný veřejný odkaz na PDF se nevytváří.
- Příprava žádosti neposílá e-mail. Jen serverem potvrzený vlastník může žádost schválit. Schválení kontroluje verzi a přesný příjemce/hash. Každý přístup včetně stažení PDF ověřuje oprávnění.
- Odesílání má serverový lease, pevný idempotency key Resend a nejvýše 5 pokusů během méně než 24hodinové lhůty idempotence poskytovatele. Po nejistém výsledku nejdřív obnovte stav. Po uplynutí lhůty se automatické opakování zastaví; před novou žádostí ověřte stav u poskytovatele.
- Žádost lze zamítnout do zahájení pokusů. Odeslaný e-mail nelze vzít zpět. Smazání/změna zakázky zastaví nové pokusy, již přijatou zprávu neodvolá.
- Testy používají lokální D1/R2 a falešného poskytovatele. Skutečnou doručitelnost je nutné ověřit až po nastavení domény a klíče.
