# iPhone a Apple Watch 0.8.4 (13)

Zdroj vychází z ověřené větve `ui/ios-attendance-integration-2026-11-20`, commit `0e4d7f7a89607a15879d76208d9491705051b3b2`. Vydání navyšuje společnou verzi telefonu a hodinek na 0.8.4 (13), zachovává bundle ID i šifrovaná lokální data.

## Obsah

- Všechny předchozí aktualizace 0.8.3 včetně individuálních člověkohodin, procent dokončení, komprese/miniatur a uloženého adresáře zákazníků a zahrad.
- Nové dashboardy správce/pracovníka, kompaktní detail zakázky a jednotná bublinová tlačítka.
- Kompaktní seznam Zakázek, vyhledávání, filtry, seskupení, gesta, mapa/kalendář a vlastní pracovní akce.
- Nová osobní a týmová Docházka, přestávky, statistiky, grafy, součty za zakázky, časová osa, CSV a původní opravy/schvalování.
- Původní společná evidence pracovní doby, oprávnění, offline fronta a Apple Watch aplikace.

Podrobná implementace a výsledky předchozích testů: [Docházka a Zakázky](IOS-ATTENDANCE-JOBS-2026-11-20.md), [kompaktní Zakázky](IOS-COMPACT-JOBS-2026-11-20.md).

## Sestavení a ověření

Vydávací sestavení bude spuštěno přes existující `iphone.yml`, `runner=macos-26`, `checks_only=false`, `sign_ipa=false`, `check_scope=all`. Balíček je určený k vlastnímu podepsání při instalaci, stejně jako předchozí vydání. Výsledek, odkaz a kontrolní součet budou doplněny po skutečném dokončení.

## Aktivace a omezení

Sestavení IPA samo nenasazuje server ani migraci. Nové samostatné přestávky a jejich offline režim vyžadují kompatibilní backend a migraci 0059 podle [postupu nasazení](IOS-ATTENDANCE-JOBS-2026-11-20.md). Starší server poskytuje základní docházku; nedostupné podrobnosti klient označí.

Aktualizovat pod stejným bundle ID a podepisovací identitou, bez odinstalování nebo mazání dat. Před aktualizací odeslat čekající změny. IPA neznamená ověření fyzického telefonu/hodinek, APNs ani publikaci do TestFlight/App Store.
