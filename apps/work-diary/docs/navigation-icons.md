# Navigační ikony

Sada dodaná uživatelem v `zavlahovy-denik-ikony.zip` podle `PRO_CODEX.md`. Původní SVG a manifest jsou v `assets/navigation-icons/`; autor výslovně dovoluje použití, úpravy a distribuci bez uvedení autora.

`web/navigation-icons.js` obsahuje stejné vektorové tvary a společný helper `navigationIcon(section)` pro desktopovou navigaci, mobilní spodní lištu a nabídku Více. Mapuje existující identifikátory sekcí na dodané symboly. SVG jsou inline, bez ID, dekorativní (`aria-hidden`, `focusable=false`) a dědí `currentColor`. Názvy, pořadí, routy a oprávnění se nemění.

`web/navigation-icons.css` nastavuje 24 px na desktopu, 26 px v mobilní navigaci, minimální cíle 44 × 44 px a paletu zadání: aktivní #263e34, neaktivní #687769, aktivní pozadí #e9eee5. Akční ikony mimo navigaci a ikona aplikace na ploše zůstávají původní.

Ověření na izolovaném náhledu: všech deset symbolů při 24 px v obou stavech, hranice tvarů včetně tahu bez oříznutí, mapování, barvy currentColor, žádná duplicitní ID, desktop 1440 px a mobil 390/430 px, otevření a zavření Více, přechody sekcí a omezení pracovníka/správce. Chromium a WebKit; fyzický iPhone ani macOS Safari nebyly k dispozici. Do provozních dat se při kontrole nezapisuje.
