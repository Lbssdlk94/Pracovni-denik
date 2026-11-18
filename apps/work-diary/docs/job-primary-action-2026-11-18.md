# Hlavní tlačítko podle stavu zakázky

Detail i karta návštěvy používají stejný výběr další akce:

| Uložený stav | Hlavní tlačítko | Po potvrzení |
| --- | --- | --- |
| Naplánováno | Jsem na cestě | Zadání přesného příjezdu, stav Na cestě, zachovaná nabídka SMS |
| Na cestě | Probíhá | Potvrzení zahájení práce, stav Probíhá |
| Probíhá | Hotovo | Potvrzení dokončení, stav Hotovo |
| Hotovo / Nedokončeno | Bez tlačítka dalšího kroku | Další změny přes stávající Změnit stav |

Samotné otevření ani zrušení potvrzení nic neukládá. Po potvrzení se nabídne další krok podle skutečně uloženého stavu. Při práci v detailu zůstává dialog otevřený a zachovává záložku i pozici. Upravit přesný příjezd lze ve stavu Na cestě přes nabídku ⋯ → Upravit příjezd. Obecná změna stavu, důvody nedokončení a servisní protokol zůstávají dostupné.

U předplatného přechází Hotovo do dosavadního dokončení přes protokol; neobchází čerpání služby. Před potvrzením se načítá aktuální zakázka, kontroluje původní očekávaný stav a ukládá s verzí/CAS. Serverová oprávnění zůstávají beze změn. Modul Odjezd lze nadále vypnout; ostatní pracovní stavy tím nejsou zakázané. Čtenářům se nové primární pracovní tlačítko nezobrazuje.

Upraveno: `web/job-travel.js`, `web/jobs-ui.js` a verze importů v `web/app.js`, `web/index.html`, `web/sw.js`. Bez změny API, databáze, produkčních záznamů nebo nativní aplikace.

Ověření na izolovaných datech:

- 6 cílených testovacích souborů prošlo: odjezd, pracovní postup, předplatné, moduly/oprávnění, paměťová cache a přesné offline importy. Kontrola syntaxe prošla.
- Obě finální sestavení prošla validací Workeru, přihlášeným startupem a odmítnutím anonymního API.
- Prohlížečový test na přesném finálním sestavení Dr. Závlahy (Chromium + Miniflare D1/R2) skutečně uložil odjezd, zahájení a dokončení. Ověřil zrušení potvrzení bez zápisu, obnovení stránky, dokončení z karty a přechod předplatného do protokolu bez předčasného označení Hotovo.
- Zachované SMS, úprava příjezdu, změny stavu, editace, protokol a návraty bez jediného zavření dialogu. Regrese mazání deníku i zachování fotografie prošla.
- Primární akce alespoň 44 × 44 px a bez vodorovného přetečení na 360/390/430 px, stávající menu také na 1440 px. Fyzický iPhone/Safari nebyl k dispozici.
- Backend obou sestavení je mimo vložená statická aktiva bajtově nezměněný. Frontendové archivy neobsahují kořenové migrace, zmrazená databáze Dr. Garden se neupravuje.

Starší scénář `tests/job-travel-browser.cjs` byl přizpůsoben novému umístění úpravy příjezdu; samostatně nebyl v tomto běhu spouštěný. Jeho klíčové návaznosti pokrývá spuštěný `scripts/test-detail-actions-browser.mjs`.

## Nasazení 18. 11. 2026

Nativní Sites nástroj potvrdil obě publikace jako `succeeded`; přístupové nastavení se nezměnilo.

- Dr. Závlaha: https://zavlahovy-denik.purplecedar.chatgpt.site, verze **140**, zdroj `5e3523b0e513784abfe38cc404e75e504c58d74b`, deployment `appgdep_6afd525b734881919b4d29dbb7d4f180`.
- Dr. Garden: https://dr-garden.purplecedar.chatgpt.site, verze **60**, zdroj `8948dfe524f14ac3b58fa54dad43746b65147cf3`, deployment `appgdep_6afd5278489c8191adeebc64115166bc`.
- GitHub: https://github.com/Lbssdlk94/Pracovni-denik/pull/23, implementace `f42822b`, samostatná větev `feat/progressive-job-action-2026-11-18` navazující na #22.
