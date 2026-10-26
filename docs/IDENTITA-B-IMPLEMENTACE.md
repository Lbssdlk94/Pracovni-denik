# Pracovní deník — implementace identity B, 23. 10. 2026

Podklad: uživatelem dodaný Pracovni_denik_Codex_LITE.zip, ZADANI_PRO_CODEX.md,
sedm konceptů obrazovek a čtyři JPG identity B. Všechny obrazové reference
byly prohlédnuty. JPG slouží jako vizuální směr, nepoužívají se jako obraz UI.

## Rozsah

Upravuje se existující firemní Pracovní deník a společný zdroj pro další
instalace. Super Admin zachovává vlastní rozhraní; jeho repozitář obsahuje
i společnou firemní aplikaci. Databáze, tabulky, provozní data, endpointy,
role, licence, připomínky, fotky, katalogové ceny a zakázkové workflow se
nemění. Nebyl přidán dashboard, nový modul, Gmail ani Google Disk integrace.

## Změněné soubory

Stejné vizuální soubory jsou v apps/work-diary/web společného repozitáře
a v web/ instalací Dr. Závlaha, Dr. Garden a Test:

- design-tokens.css: přesná paleta #F7F8F6 / #193F3B / #9DB7A7 / #DCE2DF /
  #1D2523, čitelná doplňující šedá, stavové barvy, měřítko mezer, rádiusy,
  stíny a systémová typografie. Kompatibilní aliasy současných proměnných.
- work-diary-ui.css: společné komponenty současného UI — tlačítka, pole,
  karty, štítky, navigace, filtry, dialogy, materiál, pracovní zápisy,
  docházka, oznámení, vozidla a desktopové plánování.
- index.html: dva sdílené styly načtené za dosavadními a nová theme-color.
- manifest.webmanifest: pouze barva pozadí a systému. Jméno, start_url,
  scope, id i všechny instalační ikony jsou zachované.
- sw.js: nová verze statické cache a oba nové CSS soubory v precache.
  IndexedDB, rozpracované formuláře a synchronizační fronty se nemažou.

Regresní kontrola je v scripts/test-identity-b.mjs a
 tests/identity-b-visual-browser.cjs. Existující browser-nav.cjs nově umí
najít skutečnou URL importovaného cloud modulu, protože jeho verze nemusí
být shodná s app.js. Kontroly materiálu, protokolu a rozepsaných formulářů
používají tento skutečný modul. Starší testovací workload fixture nově
obsahuje explicitní začátek a délku práce; původní časová rozmezí se na dobu
práce nepřevádějí. Test protokolu počká na existenci formuláře nastavení
uvnitř současné sbalené sekce, ne na jeho viditelnost.

## Záměrné odchylky od konceptů

- Zachovány názvy firem, dodané firemní logotypy, instalační ikona a stávající
  konzistentní SVG ikony. Neostré generované značky z JPG nejsou překreslené
  jako nová identita firmy.
- Zachována navigace a její skutečná data. Nevzniká fiktivní statistika nebo
  nová úvodní obrazovka s funkcemi, které deník nemá.
- Povinná pole, nativní selecty, datumy a checkboxy zůstávají funkčními
  ovládacími prvky. Datum se formátuje podle prohlížeče/OS.
- Červené závady, jantarové výstrahy a modrý stav Na cestě mají srozumitelný
  význam i vedle zelené identity; štítky nespoléhají jen na barvu.
- PDF protokoly se nepřekreslují. Jednotný styl dostává jejich editor a
  náhledové ovládání; dosavadní výpočty a uložené soubory se nemění.
- Desktopový rozpis, měřítka a boční editor zachovávají současnou geometrii.
  Jemné zkrácení svislých mezer toolbaru udržuje kolegy nad přehybem stránky.

## Ověření

Sestavení společné aplikace a autentizovaný start přesně sestaveného Workeru
na izolované SQLite/R2. Kompletní sada 55 testovacích souborů deníku prošla.
Žádná skutečná provozní zakázka nebyla pro test vytvářená, měněná ani smazaná.

Chromium, 360/390/430 a desktop 1280/1440: mobilní přehled, hledání a filtry,
44px cíle, navigace, plná adresa, detail, oddělení kliknutí, zvonek/křížek,
zavření po posunutí, návrat na pozici, kalendář, zapamatování pohledu,
menší viewport jako kontrola otevřené klávesnice. Desktopové založení ze
slotu, více zahrad zákazníka, přetažení a plánování z fronty, boční uložení,
kolize, ochrana souběžných změn a individuální předání kolegům prošly.

Materiál: kategorie, položky, množství, staré ceny po změně katalogu,
PDF a offline synchronizace; prototyp zůstává skrytý správci a pracovníkovi.
Protokol: české znaky a vícestránkový PDF, soukromá fotka, náhled, oprava
po výpadku sítě, offline zápis a synchronizace. Rozpracovaný zákazník,
zahrada, zakázka a protokol s fotografií přežijí obnovení; změna účtu
neodhaluje cizí koncepty. Otevření a zavření nové zakázky nevytváří záznam.

Test připojené licence ověřil omezené moduly, chybějící staré skripty,
pozastavení a obnovení, zachované oprávnění a offline start. Nová kontrola
ověřila přesných pět hlavních barev a zachování nového stylu po offline
obnovení a opětovném připojení. V testovaných pohledech nevzniklo vodorovné
přetékání ani chyba stránky. Snímky jsou v /workspace/reports/identita-b/.

## Omezení a rizika

Skutečný iPhone, Safari a WebKit nejsou v tomto prostředí dostupné. Mobilní
chování bylo ověřeno v Chromiu/emulaci, klávesnice zmenšením viewportu.
Systémový font se mírně liší mezi Apple a Windows/Linux. Uživatelům staré
otevřené verze může nový vzhled přijít až po načtení nové verze service
workeru; není třeba mazat data aplikace. Existující backendová oprávnění
byla ověřena automatickými testy; nepřihlašovali jsme se za skutečné členy
firem a netestovali zápisem do jejich provozních záznamů.
