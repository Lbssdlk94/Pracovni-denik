# Deník realizace: vyplňování pro všechny členy

Větev `fix/diary-all-members-2026-11-19` navazuje na ověřený iPhone klient 0.8.1. Žádná migrace ani přepis provozních záznamů není potřeba.

- Vlastník, administrátor, správce, pracovník i čtenář mohou vytvořit denní zápis u realizace, ke které mají stávající přístup. Přiřazení, obory, licence a režim read-only zůstávají závazné.
- Pracovník a čtenář upravují pouze vlastní zápisy; vedoucí role mohou opravovat i cizí zápisy jako dosud. Autora a upravující účet určuje server, verze a audit zůstávají zachované.
- Mazat mohou výhradně role `owner` a `administrator`, s potvrzením, CAS a idempotentní operací. Správce (`admin`), pracovník ani čtenář tuto možnost nemají. Fotografie, protokol i zakázka zůstávají zachované.
- Výjimka pro čtenáře platí jen pro deník a povinné fotografie deníku. Nová PUT cesta `/api/jobs/:job/diary/photos/:photo` používá stávající soukromé service_photos a existující ukládání, bez kopírování evidence. Neumožňuje zapisovat servisní protokol, zadání ani přiřazení zakázky. Dosavadní samostatná pravidla změny pracovního stavu se nemění.
- Zákaz nahrávání fotografií nebo vypnutý modul se nadále respektuje. Fotografie zůstává povinná. Účet bez přístupu k zakázce nezískává přístup jen svou rolí.
- Web i SwiftUI používají stejná pravidla. Offline změny a fotografie zůstávají v dosavadních úložištích, vázané na účet a oprávnění. iOS připravená verze 0.8.2 (11).

## Kontroly

82 backendových a klientských testovacích souborů prošlo v izolaci. Nové scénáře ověřují čtenářův zápis, vlastní úpravu, povinnou fotografii a opakování bez duplikace, zákaz úpravy cizího zápisu, zákaz mazání pro správce/pracovníka/čtenáře, zachování fotografií po smazání administrátorem, odmítnutí po odebrání přiřazení a neměnnost ostatních pravomocí. Prošly také dosavadní testy pracovních oborů a souběžné změny oprávnění. 17 Python kontrol podpisů a simulátorů prošlo.

Přidány dva XCTest scénáře a jeden UI scénář pro čtenáře. První běh [44468458629](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44468458629) potvrdil všechny nové scénáře a 13 UI testů, ale jeden dosavadní unit test náhledu role selhal: očekával, že poslední položka společného logu požadavků bude právě jeho požadavek. Asynchronní načítání z jiného testovacího store toto pořadí nezaručuje. Test nyní používá unikátní query marker a zamčený snapshot logu a stále ověřuje hlavičku skutečně odeslaného požadavku. Pravidla náhledu v aplikaci se nemění.

Opakovaný Xcode běh [44469633898](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44469633898), zdroj `bb7db04af270b02c53b893a51ea79f9238251077`, skončil `success`: 72 unit testů a 13 UI testů bez selhání, release device build, kontrola čistě nativního bundle i přibalené Watch aplikace a její sestavení/spuštění na simulátoru s náhledy. Xcode 27.1 / iOS SDK 27.1.

[IPA, náhledy a protokoly](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44469633898/artifacts/14503209578), verze 0.8.2 (11), expirace artefaktu 3. 12. 2026. ZIP má 9 344 263 B; GitHub digest `sha256:4da5b23c80d1cd00fb50d0213f7ad5e39f97ca92086a9714984cba3853345359`. IPA není podepsaná; vyžaduje vlastní podpis. Na fyzickém iPhonu/Apple Watch, TestFlightu ani App Store nebyla tato verze ověřena nebo publikována. Obrazy náhledů nebyly z tohoto cloudového prostředí vizuálně zkontrolovány; metadata a úplný Xcode log byly přečteny přes GitHub API.

## Nasazení webu

19. 11. 2026 Sites potvrdily obě publikace ve stavu `succeeded`:

- Dr. Závlaha: verze 142, zdroj `e7647985d5719e3225a6c0c583ed86aa61d32b26`, deployment `appgdep_6afe9069c8c48191a28e59c08daf8c44`.
- Dr. Garden: verze 62, zdroj `df66a5ed711162f2bd61895d0a44ddaba0eca7f2`, deployment `appgdep_6afe9099ac2881919053d56cec01d80c`.

Obě sestavení i ověření výsledného Worker artefaktu prošla v izolaci, včetně přihlášeného načtení a odmítnutí anonymního přístupu. Závlaha poskytuje společné API; Garden dostal pouze frontendový balíček. Byte porovnání potvrdilo, že se jeho backend mimo vložené webové soubory nezměnil. Nebyly spuštěny historické migrace Garden ani změněny provozní záznamy. Service Worker verze `diary-members-v1` aktualizuje změněné moduly.

Přímá následná HTTP kontrola produkčního `/sw.js` z cloudového shellu vrátila 403; nelze ji vydávat za úspěšný funkční test produkční relace. Produkční zápis/mazání nebyly zkoušeny na skutečných zakázkách. Automatizované oprávnění a ukládání byly ověřeny na izolované databázi.
