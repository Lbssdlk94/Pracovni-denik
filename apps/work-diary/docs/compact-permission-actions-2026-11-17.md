# Plynulé řazení dostupných akcí

Příčinou mezery v mobilním detailu byla pevná čísla sloupců u Navigovat, Jsem na cestě, Změnit stav a Fotodokumentace. Při nepřítomnosti akce algoritmus Grid respektoval další explicitní sloupec a nechal před ním prázdné místo.

- Akce detailu používají pořadí DOM, bez přeskakování pevných pozic. Mobilní Servisní protokol zůstává přes celou šířku. Lichá poslední dostupná akce vyplní poslední řádek.
- Parita i čtyřsloupcový režim karet počítají pouze viditelné akce, také při skrytí atributem `hidden`, nejen při úplném vynechání prvku ze serverového výsledku.
- Prázdné nebo celé skryté společné skupiny akcí nezanechávají vlastní mezery. Navigační CSS nesmí vynutit zobrazení prvku s `hidden`. Materiál čtenářům nerezervuje sloupec pro nepřístupné editace.
- Společné styly používají všechny profesní šablony; nejsou zavedené výjimky pro závlaháře či zahradníky. Kontrola ostatních CSS nenašla další pevné pozice oprávněními skrytých akčních tlačítek. Pevné sloupce formulářů a časové osy nejsou akční rezervovaná místa a zůstávají zachované.
- Změna je pouze ve sdíleném CSS a verzování cache. API, role, rozhodování o dostupnosti funkcí, databáze ani neodeslané zápisy se nemění.

## Ověření

`node scripts/test-compact-actions-browser.mjs` čte skutečné styly dané instalace. Ověřuje 310 neprázdných kombinací všech pěti akcí: fyzicky vynechané prvky i `hidden`, šířky 360/390/430/1280/1440, logické pořadí, začátek každého řádku bez mezery, nepřekrývání, 44px dotykové cíle a vodorovné přetečení. Dále kontroluje prázdné skupiny dalších stránek, skrytou navigaci, sloupce materiálu a 15 kombinací skrytých akcí na kartách při každé šířce. Jde o izolovanou kontrolu rozložení, nikoliv přihlášení pod 310 skutečnými účty.

Prošel také předchozí skutečný prohlížečový postup galerie a detailu proti izolovanému Worker/D1/R2, včetně uložení a zrušení změny stavu, dokončení, nahrání fotky a obnovení stránky. Cílené regrese cache, centrálních omezení a administrátorských oprávnění i syntaxe prošly. Sestavení GitHub šablony má záměrně nepřiřazený hosting; validace prošla s `--allow-unbound`. Žádná produkční zakázka nebyla upravena kvůli testu.

Skutečný iPhone/Safari nebyl v tomto běhu dostupný. Geometrie byla ověřena v Chromium; řešení používá `:has()` a filtrování `:nth-child(... of ...)`, které vyžadují moderní prohlížeč (Safari 16.4+). Aplikace již používá `:has()` i před touto změnou. Nativní SwiftUI ani Watch aplikace tímto webovým vydáním nejsou měněny.
