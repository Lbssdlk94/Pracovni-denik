> Nahrazeno nastavením pro všechny role, viz VYCHOZI-PREHLED-PRO-VSECHNY.md. Níže je záznam předchozí úpravy.

# Výchozí Přehled pro pracovníky — 23. 10. 2026

Role pracovník nyní při běžném spuštění otevírá Přehled na mobilu i desktopu, přednostně před Docházkou a Zakázkami. Stejná funkce se používá pro online i offline start. Odkazy na konkrétní zakázku a nastavení integrace ponechávají svůj explicitní cíl. Návrat do již otevřené aplikace nepřerušuje práci ani formuláře.

Příčina: landingPage dříve upřednostnila desktopové Zakázky a při nezahájené směně Docházku. Nová první větev podle role worker otevírá overview. Z Přehledu je stále dostupné Zaznamenat příchod. Chování ostatních rolí zachováno.

Změny: web/app.js, web/index.html, web/sw.js (nová verze vstupu a offline cache); nový tests/worker-landing-browser.cjs; aktualizovaná očekávání začátku práce v tests/workspace-browser.cjs, tests/mobile-workspace-browser.cjs, tests/approved-layout-browser.cjs. Stejná úprava ve společné šabloně a všech třech firemních instalacích.

Ověření na izolovaných SQLite/R2 datech: worker-landing PASS (390/430/1440; první přihlášení, reload, studený offline start, přechod do Docházky, skrytí týmových a owner akcí, zachování desktopového startu vlastníka); workspace PASS (rozpracované zákaznické, zahradní, zakázkové a protokolové formuláře včetně fotografie, ochrana při změně serverové verze, změna účtu, vytížení); mobile-workspace PASS (360/390/430 a desktop, kalendář, filtry, dotykové cíle, detail, navigace, návrat a simulovaná klávesnice). Build a validace všech tří instalací PASS včetně autentizovaného startu a odmítnutí anonymního API.

Pouze Chromium emulace, skutečný iPhone/Safari nebyl dostupný. Žádné databázové migrace, provozní zápisy ani změny oprávnění. Offline test ověřuje výchozí obrazovku a nepřítomnost neaktuálních návštěv, nikoli nové offline ukládání zakázek.
