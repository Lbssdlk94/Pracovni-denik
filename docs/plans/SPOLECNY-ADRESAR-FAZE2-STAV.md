# Společný adresář: rozpracovaná fáze 2

30. října 2026. Uživatel schválil jednu autoritativní pracovní databázi a společné API. Následně výslovně požádal pokračovat i bez nové zálohy. Čekání na novou zálohu proto není blokátorem. Dosavadní zálohy se nemažou ani nevypínají. Google Disk a e-mailové integrace nejsou součástí změny.

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

Izolovaná SQLite, skutečný workerd/D1/R2 přes Miniflare a stávající regresní sada. Poslední úplný běh má 268 úspěšných testů; zaměřená sada propojení má 49 testů. Další změny vyžadují nový běh před nasazením. Samostatný Worker test ověřuje společný zápis/čtení/úpravu, nezměněné ID zákazníka a zahrady, souběžnou CAS změnu členství, jeden auditní záznam při opakování, nepřihlášeného/cizího člena a nepodepsané RPC.

Nejde o ověření produkčního propojení Sites, které dosud nebylo zapnuto. Dosud nebyla přesunuta, sloučena ani přepsána žádná produkční pracovní data.

## Dokončené rozšíření pracovní větve (30. října)

- Přídavné migrace 0044–0048: výslovné aliasy identit, šifrovaná obnova, adresní vazby přes ID, oddělené licenční politiky a konfigurace organizací, katalogy tarifů a limity členů podle oboru.
- Organizační kontext zachovává původní licenční připojení obou firem. Nastavení, pracovní poznámky, připomínky a výchozí tarify se neslévají. Sdílí se kontaktní poznámky a základní popis zahrady.
- Mobilní štítky a výběr oboru, auditovaná správa příslušnosti zákazníka/pracovníka a formuláře. Vazby zákazník–více zahrad–adresa–opravná zakázka jsou ověřeny přes ID.
- Offline manifest před odesláním čekajících změn; verze oprávnění, oddělení účtu/instalace, atomické odstranění nepřístupných cache a šifrované zachování neodeslané práce včetně fotek a rozepsaných formulářů. Schválené aliasy přebírají čekající operace se zachováním jejich ID.
- Izolované skutečné Worker/D1/R2 ověření obou vstupů včetně 25 MiB fotografie. Skutečný Chromium ověřil IndexedDB/WebCrypto a šířky 390/430/1280/1440; nejde o fyzický iPhone/Safari ani produkční ověření.
- Dokončení původní i opravné návštěvy samo neuzavírá závadu. Výslovné řešení, protokol a společná historie bez dvojí návštěvy jsou ověřeny testy.

## Nutné dokončit před aktivací

1. Produkční provedení připraveného převodu nanečisto a importu. Migrace 0049 přidává trvalý zámek zápisů a generaci změn. Úzce vymezené, časově omezené technické připojení umí snímek, kontrolní plán s hashem, transakční import a odstavit starou databázi. Převod a rollback včetně aliasů, původních ID a kolizních tarifů jsou ověřeny izolovaně. Pokud v Garden přibudou pracovní záznamy mimo ověřený rozsah, převod se zastaví a nic nevynechá. Dosavadní samostatný plánovač zůstává pouze kontrolním nástrojem.
2. Ověření brány na hostingu Sites, přenos změn do přesných zdrojů obou instalací při zachování různých migračních základen, značek a hostingových publik. Nezaměňovat místní test za produkční proof.
3. Teprve následně aktivovat společný prostor a směrování. Účet Test, ostatní firmy a Super Admin se nepřipojují k pracovní databázi.

Nastavení `SHARED_WORKSPACE_GATEWAY` se zatím nikde v produkci nevytvářelo. Vývojový kód ani migrace zatím nebyly nasazené. Přesun aktivního společného prostoru na úplně jiné hostingové identity vyžaduje výslovné přepárování vstupů a licencí; není ověřen jako obyčejná obnova zálohy.
