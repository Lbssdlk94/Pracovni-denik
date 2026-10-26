# Pracovní deník 2.0 — první vydání po schválení návrhu

Toto vydání dokončuje rozpracované nastavení funkcí; neprovádí databázovou migraci a nezakládá Super Admina.

## Použití

Vlastník, administrátor a správce otevřou Nastavení → Funkce aplikace · zapnout / vypnout. Funkce se přepínají jednotlivě a změny se potvrzují tlačítkem Uložit nastavení týmu. K dispozici jsou i Zapnout všechny funkce, Vypnout všechny funkce a Jen šachty a popisky. Pracovník a čtenář nadále vidí pouze svá nastavení upozornění.

- Šachty jsou nyní samostatná volba. Po vypnutí zmizí záložka, počty, přidávání i šachty v plánu; změna platí také pro nově založené zahrady. Původní šachty, fotografie a značky se nemažou.
- Zahrada otevře první dostupnou část dokumentace. Pokud jsou všechny části vypnuté, zůstanou viditelné údaje zahrady a srozumitelná zpráva.
- Samostatně lze skrýt historii, evidenci závad a vlastníkovi katalog materiálu. Starší protokoly při uložení uchovají materiálové položky i při vypnutém katalogu.
- Vypnutí pracovních funkcí nezablokuje přístup k nastavení a jejich opětovné zapnutí. Stávající čekající zápisy šachet mohou dokončit synchronizaci s původním oprávněním.
- Spodní slogany i doprovodné popisky postranní nabídky jsou odstraněné.

## Společný základ platformy

`platform/modules.js` používá existující seznam funkcí, kontroluje závislosti a výslovný průnik profese, tarifu, firmy, řízeného nasazení a firemního nastavení. Neznámý/neimplementovaný modul nelze povolit. Materiál zůstává prototypem vlastníka. Role provozovatele sama neuděluje práva uživatele firmy.

`platform/professions.js` obsahuje validátor verzovaných profesních konfigurací a šest výchozích šablon: Závlahář, Elektrikář, Instalatér, Truhlář, Zahradník a Univerzální pracovní deník. Generátor čisté firmy přebírá i tento společný základ.

Tato pravidla jsou připravená a testovaná knihovna pro další etapu. **Licence, centrální správa, profesní přepínání v uživatelském rozhraní ani Super Admin ještě nejsou nasazené funkce.** Současné moduly řídí dosavadní firemní nastavení; pravidla nové platformy se nesmějí vydávat za již vynucovanou licenci.

## Kontroly

- `node --test tests/feature-modules.test.js tests/platform-foundation.test.js tests/company-provisioning.test.js`
- Dosavadní úplná sada regresních testů a syntaxe.
- Sestavení a izolované testy Worker/D1 pro role, plánování, obnovu záloh a samostatnou firmu.
- `node tests/feature-modules-browser.cjs`: skutečné uložení přepínačů a obnova stránky, původní i nová zahrada bez šachet, otevření zakázky a uložení protokolu při vypnutých závadách/katalogu, vypnutí všeho a opětovné zapnutí, serverová oprávnění a šířky 360/390/430/1280/1440.

Prohlížečové scénáře používají pouze lokální izolovaná data na loopbacku. Ověřeno v Chromiu; skutečný iPhone/Safari se v této etapě neověřoval.

## Další etapa a podmínka zálohy

Schválený návrh je v samostatném dokumentu Super Admin. Před zásahy do datového modelu je nutné dokončit aktuální úplnou živou zálohu, stáhnout ji s obnovovací sadou a ověřit obnovu. Poslední zjištěný stav Dr. Závlahy stále ukazoval novější zálohu jako `building`; samotná starší `ready` tuto podmínku nenahrazuje. Nový úplný export nesmí být nahrazen zdrojovým archivem ani předstíráním přihlášení vlastníka.
