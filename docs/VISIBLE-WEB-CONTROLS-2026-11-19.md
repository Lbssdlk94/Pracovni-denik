# Viditelná tlačítka a rozbalovací položky na webu

Podle uživatelova snímku dostaly dosavadní textové akce a nativní rozbalovací nadpisy společný ohraničený povrch. Příkladem je „Nastavit hranici posunu“, který nově vizuálně navazuje na tlačítko „Upravit odhad“.

`apps/work-diary/web/control-surfaces.css` se načítá za dosavadními styly. Platí pro firemní aplikaci a její dialogy bez závislosti na konkrétní firmě, profesi nebo roli:

- Textové akce, Podrobnosti, položky menu a odhlášení mají světlý podklad, obrys, zaoblení a dotykovou výšku nejméně 44 px.
- Rozbalovací položky mají vlastní obrys a výšku nejméně 48 px. Zachovávají stávající ikony; tam, kde indikátor chyběl, je plus/mínus. Otevřený stav má také odlišný podklad.
- Další kontaktní údaje, zadání, pracovní doba, nastavení hranice, denní zápisy a další nativní `<summary>` používají stejný princip. Zachovává se nativní ovládání myší a klávesnicí.
- Položky mobilního menu Více a stavové tlačítko připojení dostaly vlastní obrys. Stávající hlavní zelené akce a vybrané navigační skupiny zůstávají rozeznatelné.
- Stisk, hover a klávesnicový focus jsou viditelné. Vypnuté/hidden ovládací prvky zůstávají vypnuté/skryté; destruktivní akce si ponechávají červenou barvu a původní potvrzení. Snížený pohyb vypíná nové přechody.

Nezměnily se obslužné funkce, API, databáze, oprávnění, offline fronty, iOS ani Apple Watch. Nový stylesheet je součástí Service Worker cache `visible-controls-v1`, včetně nových instalací ze stejného firemního zdroje. GitHub větev: `ui/visible-web-controls-2026-11-19`. Nevytváří se IPA ani nespouští GitHub Actions.

## Kontroly

- Sestavený Worker, izolovaná Miniflare D1/R2 a Chromium: prošel dosavadní scénář procent dokončení včetně ukládání, konfliktu, nastavitelné hranice, offline konceptu, restartu a aktualizace seznamu.
- Šířky 360/390/1280 px bez vodorovného přetečení; zkoušená tlačítka nejméně 44 px.
- Vlastní ohraničení a neprůhledný podklad nadpisu hranice; kliknutí a Space mění skutečný nativní stav `details.open`.
- Kontrola viditelných běžných akcí v Přehledu, Zakázkách, Zákaznících, Docházce a Nastavení nenašla textová tlačítka bez obrysu, podkladu a stínu. Seskupená navigace a mapové ovládání mají vlastní stávající vzhled.
- První doplňkový kontrolní skript zkusil kliknout přímo na skrytou položku Nastavení. Po správném otevření menu Více ověření prošlo; nešlo o chybu aplikace.
- Prošly přesné offline importy a oba instalační artefakty. Celá backendová regrese se kvůli čistě CSS změně znovu nespouští. Fyzický iPhone/Safari nebyl v tomto úkolu ověřován.

Náhledy skutečného webového sestavení: `/workspace/reports/visible-controls/`.
