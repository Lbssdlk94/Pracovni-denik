# Výchozí Přehled pro všechny role — 23. 10. 2026

Na žádost vlastníka nahrazuje předchozí nastavení pouze pro pracovníky. Při běžném spuštění Pracovního deníku se všem rolím (vlastník, administrátor, správce, pracovník, čtenář) na telefonu i desktopu otevře Přehled. Online a offline start používají tutéž landingPage. Existující explicitní odkazy na zakázku a nastavení integrace zachovávají svůj cíl. Návrat do otevřené aplikace nepřerušuje formulář.

Změny: web/app.js — landingPage vrací overview nezávisle na roli, šířce a aktivní směně; web/index.html a web/sw.js — nový vstup a offline cache everyone-overview-v1. Docházka i pracovní moduly zůstávají dostupné podle oprávnění. Žádné změny API, databáze, licencí, sdílení ani provozních záznamů. Úprava je také ve společné šabloně budoucích firem.

Ověření na izolovaných datech:
- worker-landing-browser: PASS pro všech pět rolí při 390/430/1440 px, první přihlášení, opakovaný start, obnova stránky i studený offline start; role ověřena odpovědí serveru; dostupnost navigace do Docházky a Zakázek; omezení pracovníka a čtenáře.
- workspace-browser: PASS pro uložení a obnovu zákaznických, zahradních, zakázkových a protokolových konceptů včetně fotografie; ochrana změněné serverové verze a jiného účtu; vytížení kolegů.
- mobile-workspace-browser: PASS pro 360/390/430 a desktop; filtry, kalendář a zapamatování pohledu, navigace, detail, návrat, dotykové cíle a simulovaná klávesnice.
- Build a validace tří instalací: PASS; autentizovaný start a odmítnutí anonymního API na izolovaných SQLite/R2.

Omezení ověření: Chromium emulace, bez skutečného iPhonu nebo Safari. Offline kontrola ověřuje úvodní obrazovku a nepřítomnost neaktuálních návštěv; nepřidává nové offline funkce zakázek.
