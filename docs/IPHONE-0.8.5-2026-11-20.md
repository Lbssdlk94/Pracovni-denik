# iPhone a Apple Watch 0.8.5 (14)

**IPA byla vytvořena, stažena a nezávisle ověřena.** Vydání navazuje na [0.8.4 (13)](IPHONE-0.8.4-2026-11-20.md) a obsahuje všechny jeho změny. Zdroj aplikace: `30d6cb84745d0220d57be261caa14c53da0b86d7`, větev `release/ios-0.8.5-2026-11-20`. Telefon i vložená Apple Watch aplikace mají **0.8.5 (14)**, původní bundle ID a šifrovaná lokální data.

## Obsah

- Předchozí dashboardy správce/pracovníka, kompaktní detail a seznam Zakázek, osobní/týmová Docházka, přestávky, grafy, časová osa, CSV, procenta dokončení, individuální pracovní intervaly/člověkohodiny, bublinová tlačítka, komprese fotografií a offline adresář zákazníků/zahrad.
- [Nový servisní protokol](IOS-SERVICE-PROTOCOL-2026-11-20.md): rozbalovací sekce, skutečná připravenost, nastavitelné šablony/činnosti, hledání materiálu a desetinné množství, skutečná pracovní doba, sledované závady, výběr/popisy fotografií pro PDF, samostatný podpis s kontrolou verze, automatické ukládání, kontrolní souhrn a původní schvalování/odesílání.
- Opravený export zachovává historickou identitu, šablonu, pracovní intervaly a údaje podpisu. Offline protokol se řadí za závislé fotografie. Dokončení katalogu zůstává dostupné také při aktivním hledání a po zadávání množství.
- Původní nativní Apple Watch aplikace se společnou verzí. Změny této úlohy se týkají převážně telefonního protokolu.

## Výsledky ověření

Úplné vydávací sestavení [44791578694](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44791578694) skončilo **success**. Parametry: `runner=macos-26`, `checks_only=false`, `sign_ipa=false`, `check_scope=all`.

- **135/135 jednotkových a 52/52 UI testů prošlo**, včetně dashboardu, detailu/seznamu zakázek, docházky, protokolu, skutečného UIKit/PDFKit exportu, podpisu a offline fronty. Všechny šest UI sad je ve výsledném logu, žádná nebyla vynechána.
- **17/17 kontrol podpisové politiky a sestavení** prošlo. Release sestavení pro fyzický iPhone i kontrola vložené Watch aplikace prošly.
- Watch simulátor byl sestaven/spuštěn a vytvořil tři snímky. Zaměřený kontrolní běh [44791566539](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44791566539) rovněž prošel: 135 jednotkových + 13 UI testů protokolu/docházky, bez IPA.
- Serverová část: **446/446 testů**, reálný sestavený Worker/D1 se všemi **61 migracemi** a validace artefaktu/startupu prošly. Od tohoto ověření se serverový zdroj nezměnil; podrobnosti a soubory uvádí dokument protokolu.
- Stažený ZIP odpovídá SHA-256 z GitHubu a IPA odpovídá SHA-256 z CI. Samostatně ověřeny phone/Watch Info.plist **0.8.5 (14)**, původní bundle ID, skutečné platformy iPhoneOS/WatchOS, nativní ARM binárky, ikony, privacy manifesty, vazba Watch na telefon a absence HTML/JS runtime i přímého linkování WebKitu.
- Vizuálně zkontrolovány konečné snímky katalogu s desetinným množstvím a dostupným dokončením, docházky s velkým textem a nativního PDF s uchovanými údaji protokolu.

## Stažení

[Artefakt s IPA, logy a snímky](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44791578694/artifacts/14658871464), artefakt `14658871464`, ZIP **182 922 935 B**, dostupný do **4. 12. 2026**.

- Soubor uvnitř artefaktu: `PracovniDenik-UNSIGNED-REQUIRES-SIGNING.ipa`.
- SHA-256 ZIP: `a2399a75a7ed489c99fbfc27e6c51824e5d51ccf070c23d7e3a6017adc9a10bf`.
- SHA-256 IPA: `e559c52620e33116a2a5d3bea494f771d95ff6cda8a80a314b130248bddca460`.
- IPA **3 777 208 B**, místní soubor `/workspace/artifacts/ios-0.8.5/PracovniDenik-0.8.5-UNSIGNED.ipa`; kontrolní součet `SHA256.txt`, inspekce `verification.json` a logy/snímky `ci/` ve stejném adresáři.

IPA **není podepsaná**; použije se dosavadní vlastní podepsání při instalaci. Nevydává se do TestFlight/App Store. Apple certifikáty nebyly změněny. Dokumentační commit po dokončení nemění zdroj aplikace, projekt ani workflow a nevyžaduje další sestavení.

## Aktivace a zbývající rizika

IPA sama nepublikuje backend ani nemigruje produkční DB. Rozšířené šablony a bezpečně verzované podpisy vyžadují odpovídající API a migraci **0060**, předchozí přestávky migraci **0059**. Starší backend má základní fallback s pravdivou informací o nedostupné podpoře. Produkční server ani databáze nebyly v této úloze změněny. Nasazení a rollback popisuje dokument protokolu.

Aktualizovat pod stejnou podepisovací identitou a bundle ID, bez odinstalování/mazání dat, nejprve synchronizovat čekající změny. Fyzický iPhone/Watch, skutečný fotoaparát, VoiceOver, podpis v obou orientacích, restart bez připojení, zákaznické odeslání a push je třeba ověřit v reálném provozu; simulátorové testy je nenahrazují. Testy neposílaly zákazníkům e-maily.
