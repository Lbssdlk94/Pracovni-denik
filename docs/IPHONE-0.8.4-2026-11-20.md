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

Vydávací sestavení [44733769829](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44733769829) pro zdroj `795d55d603078b0071e81db96db7cc730d84baca` skončilo **success**. Parametry: `runner=macos-26`, `checks_only=false`, `sign_ipa=false`, `check_scope=all`.

- Xcode 26.6 / iOS SDK 26.5: **123 jednotkových + 46 UI testů bez chyb**; místní 4 kontroly politiky podpisu a 13 kontrol sestavení/simulátorů také prošly.
- Release build pro fyzický iPhone prošel, včetně kontroly skutečného bundle bez HTML/JS a bez dynamického linkování WebKitu.
- Vložená Watch aplikace má vlastní nativní binárku, ikony, privacy manifest a správnou vazbu na telefon. Sestavení/spuštění Watch simulátoru a tři snímky prošly.
- Stažený archiv byl porovnán s SHA-256 poskytovaným GitHubem. Samotná IPA odpovídá kontrolnímu součtu v CI. Nezávisle byly zkontrolovány Info.plist telefonu i hodinek: **0.8.4 (13)**, původní bundle ID, nativní ARM architektury, ikony, soukromí a absence webového runtime.

[Stáhnout artefakt s IPA, logy a snímky](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44733769829/artifacts/14628686740). Artefakt `14628686740`, ZIP 46 022 388 B, dostupnost do 4. 12. 2026.

- SHA-256 ZIP: `e99036bf5d230d512e5baf555785dffc3a236f1f71b3f450898ba69669a9000e`.
- SHA-256 IPA: `fd73b436f02d54c3054ff3d94327da05895a809cec68c1219aea6b3176462777`.
- IPA: 3 480 780 B; místní soubor `/workspace/artifacts/ios-0.8.4/PracovniDenik-0.8.4-UNSIGNED.ipa`, kontrolní součet `SHA256.txt`, podrobná inspekce `verification.json` ve stejném adresáři.

IPA **není podepsaná**; použije se dosavadní vlastní podepsání při instalaci. Nevydává se do TestFlight/App Store. Dokumentační commit po dokončení nemění aplikaci, projekt ani workflow a nevyžaduje další sestavení.

## Aktivace a omezení

Sestavení IPA samo nenasazuje server ani migraci. Nové samostatné přestávky a jejich offline režim vyžadují kompatibilní backend a migraci 0059 podle [postupu nasazení](IOS-ATTENDANCE-JOBS-2026-11-20.md). Starší server poskytuje základní docházku; nedostupné podrobnosti klient označí.

Aktualizovat pod stejným bundle ID a podepisovací identitou, bez odinstalování nebo mazání dat. Před aktualizací odeslat čekající změny. IPA neznamená ověření fyzického telefonu/hodinek, APNs ani publikaci do TestFlight/App Store.
