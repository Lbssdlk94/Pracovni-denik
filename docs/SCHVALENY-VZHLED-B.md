# Schválený vzhled B v celé platformě

Implementace navazuje na náhled `/workspace/designs/pracovni-denik-koncept-b/index.html`, který uživatel schválil k použití v deníku i Super Adminu.

## Co se změnilo

- Stejné přesné barvy B, bílé zaoblené karty, ikony, typografie, jemné stíny, vyhledávání a formulářová pole v obou prostředích.
- Nový **Přehled** se čtyřmi hlavními vstupy, skutečnými dnešními počty a nejbližší aktivní návštěvou. Zahrady a vozidla zůstávají dostupné pod hlavním obsahem a v navigaci. Zakázky i protokoly se otevírají ve stávající evidenci.
- Nejdůležitější návštěva v denním seznamu má zelenou kartu; nedokončené a hotové návštěvy zachovávají vlastní význam a řazení. Karty mají rovnoměrné akce po dvou.
- Detail používá nové záhlaví se zákazníkem, výraznější práci, ikony údajů, rychlý přístup k protokolu a fotografiím. Zavření i zvonek zůstávají dostupné při posouvání. Údaje a jejich editace se neomezují.
- Současný kompaktní formulář nové zakázky se používá i na mobilu. Vyhledání zahrady/zákazníka, původní časy, formulářové koncepty a samotné uložení používají původní mechanismy.
- Rozpis, fronty, boční editor, kalendář, tabulka, vytížení, zahrady, zákazníci, materiál, výkazy, vozidla a nastavení dostaly společné vizuální prvky. Časová geometrie, souběhy a všechna stávající zobrazení rozpisu zůstávají zachována.
- Super Admin používá stejné základní CSS přímo z firemní šablony. Vlastní nadstavba upravuje jeho statistiky, tabulky, přihlašování/MFA, katalogy a rozbalovací ovládání modulů.
- Nové statické soubory jsou zahrnuté do verze offline cache. IndexedDB, neodeslané změny a rozepsané formuláře se nemažou.

## Zdrojové soubory

- `apps/work-diary/web/design-tokens.css`, `approved-layout.css`: barvy a skutečné sdílené komponenty.
- `interface-icons.js`, `work-diary-mark.svg`: ikony a schválený symbol v rozhraní. Nainstalovaná ikona a identita PWA se nemění.
- `overview-ui.js`: jen přehled existujících záznamů, čte původní API se serverovým omezením oprávnění. Nepřidává druhou evidenci zakázek ani protokolů.
- `app.js`, `jobs-ui.js`, `job-composer.js`, `index.html`, `sw.js`: zapojení vzhledu a navigace.
- `apps/super-admin/web/admin-identity.css`, `admin.js`, `index.html`, `scripts/build-admin.mjs`: společné styly, skutečné provozní přehledy a jejich balení do původního Workeru.
- Regresní kontrola `tests/approved-layout-browser.cjs` a úpravy navigační pomůcky ve stávajících testech.

Vše je ve společné firemní šabloně a ve stávajících instalacích. Nová firma připravená existujícím nástrojem tak dostane stejné soubory. Manifesty, firemní názvy, publikum instalací, role, licence, runtime proměnné ani migrační historie se tímto vydáním nemění.

## Funkční návaznosti

- Na počítači se stále nejprve otevřou zakázky a zapamatovaný pohled.
- Na telefonu zůstává při nezahájené směně původní vstup do docházky. Po zahájení dne se při příštím otevření zobrazí nový Přehled; je přístupný také ve spodní navigaci.
- Správce vidí serverem povolený tým, pracovník jen přidělené návštěvy. Prototyp materiálu zůstává pouze vlastníkovi. Mapa i správa týmových plánů respektují dosavadní pravidla.
- Počty Přehledu jsou pro dnešní den; při omezeném načtení mají `+`. Prázdná nebo nenačtená data se nevydávají za změřenou nulu. Při odpojení se starý živý plán skryje a zobrazí pravdivé vysvětlení.
- Připomínky ani automatické běhy firem se nezapínají. Odesílání e-mailů/Google Disk ani jejich nastavení se nemění.

## Ověření

Testování probíhá pouze nad oddělenými SQLite/R2 testovacími daty a lokálními relacemi; v provozních zakázkách, účtech ani firmách se testovací zápisy nedělají.

- 55 testovacích souborů deníku a 7 Super Admina prošlo; kontroly syntaxe a sestavení prošly.
- Chromium 360/390/430 px: skutečné počty, oprávnění pracovníka, tlačítka Přehledu, zkrácená adresa versus úplný cíl navigace, filtry, klikání na kartu a její tlačítka, 44px dotykové cíle, zavření detailu po posunutí a nekolidující zvonek.
- Chromium 1280/1440 px: rozpis, kliknutí do volného místa, zákazník s více zahradami, přetažení z fronty, uložení bočního editoru, uchování kontextu, konflikty současných úprav, potvrzování jednotlivými kolegy a další změna zadání.
- Skutečné uložení a opětovné načtení zakázky z kompaktního mobilního formuláře, včetně konkrétní zahrady a zákazníka. Zavření formuláře bez uložení nevytváří zakázku.
- Servisní protokol: skutečné uložení, vícestránkové PDF s češtinou a fotografií, množství a historické ceny materiálu, opakování po výpadku, offline uložení a následná synchronizace.
- Koncepty zákazníka, zahrady, zakázky a protokolu přežijí obnovení. Ochrana před přepsáním novější verze a oddělení konceptů mezi účty zachováno.
- Super Admin: skutečný testovací druhý faktor, uložení/obnovení firmy, moduly Vozidla, granularita funkcí, licence, neveřejný firemní obsah a všechny jeho sekce na všech pěti šířkách.

Skutečný iPhone/Safari a WebKit nejsou v tomto prostředí dostupné. Mobilní šířky, dotykový režim a zmenšený viewport klávesnice byly ověřeny v Chromiu. Původní databázová struktura a backendová oprávnění jsou beze změny; nebyla potřeba nová migrace.
