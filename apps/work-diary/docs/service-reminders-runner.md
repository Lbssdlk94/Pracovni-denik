# Serverový kontrolní běh předplatného

Tato instrukce je pro autorizovanou cloudovou úlohu vlastníka propojeného Site.
Neprovádí změny tarifů, cen ani smluv. Úloha pouze spustí úzce omezené serverové
vytvoření připomínek materiálu pouze pro zakázky typu Realizace, podle týmového
nastavení předstihu, pracovních/kalendářních dní a přesunu víkendů či svátků,
a vyprázdnění jejich oznámení/e-mailové fronty.

1. Nativním Sites `get_site` načtěte aktuální propojený projekt. Z jeho odpovědi
   získáte existující `siwc_bypass_bearer_token`. Token nikdy nevypisujte, neukládejte
   do souborů, URL či textu úlohy a nevytvářejte ani nerotujte nový.
2. Pošlete HTTPS POST bez těla na vlastní origin Site, cesta
   `/api/service-reminders/run`. Použijte `x-zavlahy-request: 1`,
   `Authorization: Bearer <token>` a pro Sites service access také
   `OAI-Sites-Authorization: Bearer <token>`. Použijte běžný User-Agent a zachovejte
   důvěryhodné TLS a proxy. Token posílejte pouze tomuto Site, nenásledujte redirect.
3. Ověřte HTTP 200 a JSON počty. Opakování je bezpečné: stejné upozornění
   za stejný běh nevytváří. Běh nezakládá zakázky ani nezpracovává platby.
4. Chybu zaznamenejte bez hlaviček či tokenu. Při 401 nebo změně service tokenu
   nic neobcházejte. Vlastník musí aktualizovat `SERVICE_REMINDER_TOKEN_HASH`
   (SHA-256 aktuálního tokenu) přes runtime secrets a nasadit uloženou verzi.

Zdroj těchto instrukcí je v repozitáři stejného Site, soubor
`docs/service-reminders-runner.md`. Samostatná služba není anonymní: veřejný
endpoint porovnává hash svého runtime tajemství a neumožňuje určit libovolného
uživatele nebo data požadavkem. Neposkytuje žádnou návštěvnickou identitu.

Po nasazení se musí jednou provést skutečný autorizovaný kontrolní běh. Vytvoření
cloudové úlohy samo o sobě neprokazuje, že už proběhla plánovaná kontrola. Úloha
má běžet jednou za hodinu mezi 08:00 a 18:00, pásmo Europe/Prague. Na konci běhu
aplikace zaznamenává čas a počty do neveřejného settings; správce je vidí v UI.
