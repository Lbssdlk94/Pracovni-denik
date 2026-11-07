# Náhled rolí deníku

## Použití a hranice

Vlastník a administrátor mají v horní části webu/PWA volbu **Zobrazit jako**. Vlastník může zobrazit administrátora, správce, pracovníka a čtenáře; administrátor správce, pracovníka a čtenáře. Ostatní role přepínač nemají. Aktivní náhled nabízí návrat k vlastní roli také v přilepené hlavičce.

Jde o náhled menu a ovládání s vlastními dostupnými daty, **nikoli přihlášení za konkrétního pracovníka ani simulaci jeho přiřazených zakázek**. Původní účet, serverová role, příslušnost k oborům a oprávnění se nemění. Náhled nepřetrvává po novém spuštění. Neprovádí další `/api/me` ani autorizaci místního inventáře.

Náhled neukládá změny: klient blokuje zápisy i při práci offline, pozastaví odesílání fronty a skryje živé formulářové koncepty. Server nezávisle odmítá označené mutace včetně účtů, obnovy, přenosu a OAuth operací. Značka náhledu se přenáší podepsaným propojením Dr. Garden → společné API. Nejde o omezení skutečného vlastníka: návratem do jeho role lze dál pracovat podle skutečných oprávnění.

Před přepnutím je nutné zavřít otevřený formulář a vyřešit rozpracované značky v plánu. Náhled nemění živé koncepty ani nesmaže neodeslané operace. V SwiftUI je připravena stejná volba v záhlaví a Nastavení → Náhled deníku, s dočasným paměťovým úložištěm odděleným od skutečné šifrované fronty a konceptů. V náhledu nelze odesílat ani z Apple Watch.

## Implementace

- Web: `role-preview-model.js`, `role-preview.css`, `cloud.js`, `app.js`, shell a Service Worker; kompatibilní popis hlavičky pro starší nativní most.
- API: `worker/role-preview.js`, vstupní kontrola `api.js`, podepsaná značka v `workspace-gateway.js`, přibalení v `scripts/build.mjs`.
- iPhone: `APIRolePreview.swift`, prezentace v `APIStore`, menu/banner v `APIRoot` a `APISettings`, značka v `APITransport`, ochrana před zápisy fronty a nativních akcí.
- Bez databázové migrace a bez změn provozních záznamů.

## Kontroly

Izolovaný SQLite/D1/R2 a skutečný Chromium:

- přepnutí vlastník → čtenář/správce → vlastník, skutečná role zůstává owner;
- návrat je viditelný i po posunutí, šířky 390/1440 bez vodorovného přesahu;
- pokus uložit stav zakázky je odmítnut, stav v databázi se nezmění;
- offline zápis nevytvoří položku fronty, skutečný rozepsaný formulář po návratu zůstává;
- pracovník nedostane přepínač; podvržená značka od běžných rolí je odmítnuta serverem;
- přepínání nepřidalo žádné `/api/me` ani `/api/workspace/manifest`;
- kompilovaný artefakt obou firem: ověřené spuštění, autentizace, zakázky a stejné testy náhledu;
- regresní skripty přihlášení (390/430/1440), odolnosti komunikace a offline SW, nativního mostu a formulářů/protokolu/fotky/PDF prošly;
- webová sada `npm test`, kontrola whitespace a 17 Python testů sestavování/podepisování iPhone.

SwiftUI má přidané čtyři unit testy a UI test přepnutí/vrácení. Linux nemá Xcode; syntaktická kontrola parserem není kompilace. Existující parserové chyby u tří velkých původních Swift souborů jsou stejné i v základní revizi. Aktuální sestavení a testy simulátoru je nutné potvrdit přes GitHub Actions; předchozí běh blokovalo účtování GitHubu. Nejde o vydanou novou IPA.
