# iPhone – ověřené sestavení 4. 11. 2026

Samostatná aplikace Pracovní deník používá stejné nasazené webové rozhraní v persistentním WKWebView. Server, oprávnění, provozní data a webový vzhled se tímto krokem nemění. Nativní zdroje jsou v `apps/iphone`, sestavení v `.github/workflows/iphone.yml`.

## Výsledek

- Větev: `feat/iphone-github-build-2026-11-03`.
- Ověřený zdrojový commit: `b6c0c88e06f02f495ac524cd7c838fe6bd5f8597`.
- [Úspěšný GitHub Actions běh 41777475113](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/41777475113).
- Xcode 26.0.1 na macOS 15, XcodeGen 2.44.1, iOS deployment target 17.0.
- 7 unit testů a 2 UI testy: **9 úspěšných, 0 chyb**.
- Úspěšné Release sestavení pro skutečné zařízení bez podpisu.
- Kontrola skutečného `.app` balíčku ověřila binární soubor, zkompilovanou ikonu, privacy manifest a povolené adresy obou deníků.
- Artefakt `PracovniDenik-builds-and-logs-UNSIGNED`, ID `13297378863`, 283 918 bajtů, obsahuje IPA, kontrolní součet, logy a testovací výsledek. Retence je 14 dní.

UI testy používají izolované HTML bez provozních API. Ověřují text skutečně napsaný před testovanou akcí i po ní: odchod na plochu a návrat, otevření a zavření dokumentu bez nahrazení původního formuláře. Předchozí běh odkryl nedostatečné čekání testu na hotové načtení/propsání vstupu a chybějící explicitní UTF-8 v testovacím blob dokumentu; po úpravě prošel celý běh. Testy netvrdí, že ověřily všechny pracovní postupy webu nebo skutečný servisní PDF na telefonu.

Ikona je bajtově shodná se schválenou webovou ikonou `apps/work-diary/web/work-diary-icon-1024.png`. Pracovní obrazovky jsou aktuální web, takže se nenavrhuje druhý vzhled ani druhá databáze. Jediná instance WKWebView se neobnovuje při změně stavu SwiftUI či krátkém přerušení sítě. Při ukončení procesu systémem je k pokračování potřebné výslovné obnovení; neuloženou paměť procesu není možné zaručit.

## Instalace a omezení

Podrobnosti: [návod pro iPhone](../apps/iphone/README.md). IPA je **nepodepsaná**, pro instalaci použijte vlastní podepsání stejným způsobem jako u 3D Scanneru. Tento výsledek není vydáním do TestFlight ani App Store. Požadavky App Store a možnost schválení aplikace s webovým rozhraním zatím nebyly ověřeny.

Fyzický iPhone nebyl k dispozici. Na něm zbývá ověřit skutečné přihlášení (zejména omezení poskytovatele ChatGPT uvnitř WKWebView), plný offline zápis a synchronizaci, dlouhé uspání, fotoaparát, GPS, PDF a systémové SMS. Nativní APNs/push při zavřené aplikaci nejsou implementované. Centrum oznámení zachovává webové chování.

Automatická kontrola sestavení hlásí neblokující upozornění na nepoužitý AppIntents framework a deklaraci orientací. GitHub navíc hlásí kompatibilitu Actions v4 s přechodem na Node 24; všechny kroky přesto úspěšně proběhly.

Z prostředí této relace nebylo možné přímo stáhnout archiv artefaktu (úložiště GitHub Actions vrátilo HTTP 403). Vytvoření balíčku, kontrola jeho obsahu před zabalením a úspěšné nahrání jsou ověřené v CI; lokální instalace ani lokální kontrola staženého IPA se proto neuvádějí jako provedené.

Webové opravy dokončené před iPhone sestavením jsou samostatně zdokumentované v [kontrole a opravách z 3. 11. 2026](KONTROLA-A-OPRAVY-2026-11-03.md), nasazené do Dr. Závlahy (108) a Dr. Garden (29). iPhone zdroje do jejich produkčních dat nezapisovaly.
