# Průběžný stav R2 integrace

Rozpracováno na samostatné větvi, nenahrazuje zprávu o dokončení. Provozní soubory zatím nebyly přepsané ani migrované. V hostingu 18. 11. nebyly nastavené R2_* proměnné; jejich bezpečné nastavení bylo vyžádané přes rozhraní. Žádné klíče nejsou ve zdrojích.

Hotový základ: klientská komprese a náhledy, bezpečná výměna uložených fotografií s ověřením a CAS, SigV4 S3 klient, návrh soukromého objektového adaptéru s kompatibilitou starého úložiště, přílohy zakázek a napojení na existující offline frontu. Před rozšířením o R2 prošlo 83 testovacích souborů a izolovaný prohlížečový průchod kompresí a hromadnou náhradou.

Ještě zbývá ověřit a dokončit: integraci adaptéru a nových příloh, centrální přehled a podepsané kapacitní limity, oprávnění, migrace, testy S3 a offline, dokumentaci, tajné proměnné a připojení skutečného bucketu, bezpečné nasazení. Hromadná komprese skutečných fotografií potřebuje přihlášenou relaci vlastníka/administrátora; zde nebyla k dispozici.
