# Společný adresář: rozpracovaná fáze 2

29. října 2026. Uživatel schválil jednu autoritativní pracovní databázi a společné API. Následně výslovně požádal pokračovat i bez nové zálohy. Čekání na novou zálohu proto není blokátorem. Dosavadní zálohy se nemažou ani nevypínají. Google Disk a e-mailové integrace nejsou součástí změny.

Větev: `plan/shared-directory-disciplines-2026-10-29`. Tento dokument je pracovní stav, nikoli tvrzení o dokončené implementaci nebo nasazení.

## Dosud napsáno

- Přídavná migrace 0043 a odpovídající Drizzle snapshot. Neaktivuje pracovní prostor a neklasifikuje žádná stávající provozní data.
- Skutečně vyzkoušená serverová brána: dvě vstupní adresy, jeden kanonický Worker/API a D1. Druhý testovací vstup nemá DB ani R2. HMAC, šifrovaná identita, hash těla, krátká platnost, trvalá evidence nonce proti opakování, kontrola párovaného originu.
- Model dvou příslušností (irrigation/garden); Obojí je pouze zobrazení množiny dvou vazeb.
- SQL autorizační predikáty a HTTP ochrana přímých odkazů; napojeny na čtení zakázek, zákazníků, servisních protokolů, historie, závad, fotografií, oznámení a základu zahrad. Pracovní údaje zahrady se odstraňují před odpovědí Garden pracovníkovi. Zůstává původní omezení přiřazení zakázek.
- Transakční změny příslušnosti s auditem, idempotencí, CAS/verzí, aktuální hierarchií rolí a monotónní verzí oprávnění. Přidání druhého oboru nezakládá druhého zákazníka.
- Databázové ochrany zachované historie při odebrání oboru, autorů pracovních zápisů, přiřazených kolegů, neměnného oboru zakázky a současných změn rolí. Původní výjimka přiřazeného čtenáře pro změnu stavu zůstává.
- Bezpečné vytvoření počáteční příslušnosti u nově založeného zákazníka/zahrady; nové zakázky a předplatná nesou konkrétní obor.
- Samostatný deterministický plánovač převodu nanečisto nad obnovenými snímky. Zachovává identifikátory, nikdy nepáruje lidi podle jména/telefonu/adresy, rozlišuje volitelné prázdné a neprázdné neplatné vazby. Neprovádí SQL ani připojení k produkci. Výstup neobsahuje kontakty ani tajné hodnoty.

## Dosud ověřeno

Izolovaná SQLite, skutečný workerd/D1/R2 přes Miniflare a stávající regresní sada. Poslední úplný běh po doplnění aliasů a šifrované obnovy měl 241 úspěšných testů. Další změny vyžadují nový běh před nasazením. Samostatný Worker test ověřuje společný zápis/čtení/úpravu, nezměněné ID zákazníka a zahrady, souběžnou CAS změnu členství, jeden auditní záznam při opakování, nepřihlášeného/cizího člena a nepodepsané RPC.

Nejde o ověření produkčního propojení Sites, které dosud nebylo zapnuto. Dosud nebyla přesunuta, sloučena ani přepsána žádná produkční pracovní data.

## Nutné dokončit před aktivací

1. Dotažení celého rozsahu autorizace a integračních testů, včetně předplatných, oprav více závad, oddělených poznámek, zápisů při odvolání oprávnění a exportů.
2. Organizační kontext původních vlastnických oprávnění, nastavení a licencí. Je ověřeno, že hosting přiděluje ID podle konkrétního Site. Uživatel výslovně potvrdil propojení obou vlastnických přístupů stejného e-mailu do jedné kanonické identity se zachováním původních ID jako aliasů. Ze šesti původních hostingových ID má vzniknout pět kanonických členů; čtyři ostatní účty zůstávají beze sloučení. Konkrétní schválená ID jsou uložena mimo Git v soukromém převodním souboru. Garden vlastník nesmí získat tajné konfigurace ani zálohovací pravomoci původní Závlahy pouhým importem řádku members.
3. Dokončit klientské začlenění. Serverové ověřování konkrétních lokálních ID je připravené; šifrované obnovovací balíčky včetně fotografií lze uložit a zobrazit pouze původnímu vlastníkovi. Soukromý klíč je zašifrovaný původním instalačním klíčem a rekey při obnově zálohy je doplněn. Zbývá offline verze oprávnění, zabezpečení neodeslané práce, odvolání místní dostupnosti a odstranění otevřených detailů/objektových URL. Změna musí proběhnout před odesláním čekajících zápisů.
4. UI štítky a filtry oborů, správa příslušnosti týmu/zákazníků, mobilní ovládání a navigace. Zachovat nynější vzhled.
5. Skutečný převod nanečisto nad konzistentními snímky obou instalací, klasifikace všech pracovních tabulek a souborových odkazů, řízený import a ověření idempotence. Aktuální plánovač je kontrolní nástroj, nikoli dokončený importér.
6. Ověření brány na hostingu Sites, přenos změn do přesných zdrojů obou instalací při zachování různých migračních základen, značek a hostingových publik. Nezaměňovat místní test za produkční proof.
7. Teprve následně aktivovat společný prostor a směrování. Účet Test, ostatní firmy a Super Admin se nepřipojují k pracovní databázi.

Nastavení `SHARED_WORKSPACE_GATEWAY` se zatím nikde v produkci nevytvářelo. Vývojový kód ani migrace zatím nebyly nasazené.
