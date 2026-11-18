# Miniatury fotografií v deníku realizace

Příčina prázdných dlaždic: předchozí rozhraní vytvářelo obrázek pouze pro první tři JPG/PNG do 2 MB. Ostatní fotografie měly jen ikonu a odkaz, i když byl jejich originál dostupný.

Rozbalený zápis nyní nabízí náhled všech připojených fotografií bez tohoto pořadového a velikostního omezení. Načítání spouští IntersectionObserver při přiblížení dlaždice k obrazovce; jeden otevřený zápis stahuje nejvýše dva obrázky současně. Sbalený zápis nezačne načítat originály. Při sbalení, změně záložky nebo zavření detailu se fronta zastaví a místní Blob URL se uvolní.

Původní odkazy, soubory, pořadí a názvy se nemění. Klepnutí otevírá originál. Nečitelný soubor nebo nepodporovaný formát zobrazí „Náhled nelze zobrazit“ a ponechá odkaz na originál. Místní dosud neodeslané fotografie mají náhled z Blobu i bez internetu. Rozhraní nadále používá existující soukromé API a autorizaci.

Soubory: `web/job-diary-ui.js`, verze importů v `web/jobs-ui.js`, `web/app.js`, `web/index.html`, `web/sw.js`; nový `scripts/test-diary-thumbnails-browser.mjs` a upravená očekávání dosavadního `scripts/test-job-diary-browser.mjs`.

Ověření:

- Tři cílené testovací soubory prošly: deník a oprávnění, přesné offline importy a paměťová cache. Kontrola syntaxe prošla.
- Obě firemní sestavení prošla validací Workeru, autentizovaným startupem a odmítnutím anonymního API.
- Přesné finální sestavení Dr. Závlahy v izolovaném Miniflare D1/R2 + Chromiu: osm skutečně dekódovatelných JPG větších než 2 MB, včetně obrázků 4–8; ověřený limit dvou požadavků, nulové stahování ze sbaleného zápisu, zachované bajty originálu a odkaz, chybový náhled, náhled místního offline souboru a šířky 360/390/430 px bez přetečení.
- Dosavadní prohlížečová regrese deníku prošla: PNG včetně většího než 2 MB, skutečné uložení, povinné fotografie, rozepsaný text, offline zápis/fotka po restartu, vložená 502 a následná synchronizace právě jednou, výslovné řešení konfliktu, emulace klávesnice a rozměry 360/390/430/1440 px.
- Backend je v obou sestaveních mimo vložená statická aktiva bajtově nezměněný. Schéma ani provozní záznamy se neupravují; publikují se frontendové archivy bez kořenových migrací.

Omezení: jde o zobrazení původních fotografií v malé dlaždici, nikoli serverové generování zmenšených souborů. Při prvním náhledu se čte originál; pro velké fotografie proto záleží na připojení. HEIC/HEIF zobrazí náhled jen v prohlížeči, který jej umí dekódovat. Skutečný iPhone/Safari nebyl k dispozici; nativní SwiftUI aplikace se v této úpravě nemění. Všechny testovací zápisy a soubory byly izolované od provozních dat.

## Nasazení

Nativní Sites nástroje 18. 11. 2026 potvrdily obě publikace jako `succeeded`, se zachováním přístupového nastavení. Archivy mají pouze hosting manifest, Worker a kopii manifestu, bez kořenových migrací.

- Dr. Závlaha: https://zavlahovy-denik.purplecedar.chatgpt.site, verze **141**, zdroj `233245d1124ec46f1c15ceeaddbb9e036ee0b742`, deployment `appgdep_6afdb6042f4881918cba694f0ac34a38`.
- Dr. Garden: https://dr-garden.purplecedar.chatgpt.site, verze **61**, zdroj `17ff5df15d600f59a7dc34800817598fc808c9be`, deployment `appgdep_6afdb62393208191a26b293b0dcee104`.
- GitHub: https://github.com/Lbssdlk94/Pracovni-denik/pull/24, implementace `c3ca121`, větev `fix/diary-photo-thumbnails-2026-11-18` navazuje na #23.
