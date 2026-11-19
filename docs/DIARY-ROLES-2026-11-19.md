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

Přidány dva XCTest scénáře a jeden UI scénář pro čtenáře. Skutečný výsledek Xcode, nasazení a případná omezení budou zaznamenány po dokončení ověření.
