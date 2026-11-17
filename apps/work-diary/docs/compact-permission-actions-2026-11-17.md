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

## Potvrzené nasazení

- Dr. Závlaha v136: `255b3d47f988613407f45d51187ae5543fe999d2`, úspěšné nasazení `appgdep_6afca954a3cc8191954cb85910d27963`, https://zavlahovy-denik.purplecedar.chatgpt.site/.
- Dr. Garden v56: `7e94e3fd4577c80dab57c28e29f7fc22289c644e`, úspěšné nasazení `appgdep_6afca980051c81919da668780e59b725`, https://dr-garden.purplecedar.chatgpt.site/.
- Test v12: `01c051cb9c83588e0035b716afa5203555e45a40`, úspěšné nasazení `appgdep_6afca9b4771081919ab1120fcc47fc5d`, https://pracovni-denik-test.purplecedar.chatgpt.site/.

Každý skutečný sestavený server byl před uložením porovnán s předchozím: mimo vložená statická aktiva byl bajtově totožný. Publikace obsahovala manifest a `dist`, bez zavádění databázových migrací. Geometrický test prošel nad styly každé instalace samostatně. Přístupy k webům zůstaly zachované. GitHub PR: https://github.com/Lbssdlk94/Pracovni-denik/pull/19.
