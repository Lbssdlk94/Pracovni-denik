# Připravené vydání iPhone a Apple Watch 0.8.5 (14)

**Stav: zdroj připraven, nová IPA zatím neexistuje.** Navazuje na ověřené [vydání 0.8.4 (13)](IPHONE-0.8.4-2026-11-20.md) a obsahuje všechny jeho změny. Větev `release/ios-0.8.5-2026-11-20` nastavuje společnou verzi telefonu a Apple Watch na **0.8.5 (14)**, zachovává původní bundle ID, přímé API a šifrovaná data.

## Obsah

- Předchozí dashboardy správce/pracovníka, kompaktní detail a seznam Zakázek, osobní/týmová Docházka, přestávky, grafy, časová osa, CSV, procenta dokončení, vlastní pracovní intervaly/člověkohodiny, bublinová tlačítka, komprese fotografií a offline adresář zákazníků/zahrad.
- [Nový servisní protokol](IOS-SERVICE-PROTOCOL-2026-11-20.md): rozbalovací sekce, skutečná připravenost, správou nastavitelné šablony/činnosti, katalog materiálu s hledáním a desetinným množstvím, skutečná pracovní doba, sledované závady, výběr/popisy fotografií pro PDF, samostatný podpis s kontrolou verze, automatické lokální/síťové ukládání, kontrolní souhrn a původní schvalování/odesílání.
- Původní Apple Watch aplikace; tato úloha mění primárně telefonní protokol. Společná verze obou targetů je připravena, nové Watch sestavení ještě neproběhlo.

## Co je a není ověřeno

Na zdroji protokolu `7672c7a` prošlo **446/446 backendových testů**, reálný sestavený Worker/D1 včetně všech 61 migrací, validace artefaktu/startupu a místní kontroly podpisu/sestavení **17/17**. Podrobný seznam souborů, výsledků a omezení je v dokumentu protokolu.

Nativní zdroj `41ef5a7` se zkompiloval a prošel **133/133 jednotkovými testy**, ale UI sada měla **1/6 úspěšných**. Opravy testovacích identifikátorů, očekávání nativního PDF a poslední úpravy podpisu jsou v novějším zdroji, zatím bez úspěšného opakování nativní sady.

[Kontrolní běh 44779185288](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44779185288) nezačal provádět ani první krok: GitHub oznámil neúspěšnou platbu nebo potřebu zvýšit spending limit v Billing & plans. Nebyl přidělen runner a nevznikl žádný artefakt. **Neexistuje úspěšný release build 0.8.5 ani kontrolní součet nové IPA.** Starou IPA 0.8.4 nelze vydávat za tuto aktualizaci.

## Dokončení po odblokování GitHub Actions

Nejprve zopakovat nativní kontrolu protokolu z release větve:

```sh
gh workflow run iphone.yml --ref release/ios-0.8.5-2026-11-20 \
  -f runner=macos-26 -f checks_only=true -f sign_ipa=false -f check_scope=protocol
```

Po vyřešení případných dalších nálezů spustit úplné vydávací sestavení:

```sh
gh workflow run iphone.yml --ref release/ios-0.8.5-2026-11-20 \
  -f runner=macos-26 -f checks_only=false -f sign_ipa=false -f check_scope=all
```

Release workflow vždy spouští celou sadu bez ohledu na zaměřený přepínač: jednotkové a všechny UI testy, Release pro zařízení, kontrolu phone/Watch bundle a Watch simulátor. Teprve po úspěchu stáhnout skutečný artefakt, ověřit GitHub SHA-256 ZIP, SHA-256 IPA z CI, obě Info.plist **0.8.5 (14)**, původní bundle ID, ARM binárky, privacy manifesty, ikony a absenci webového runtime. Poté doplnit tento dokument o skutečný běh, commit, artefakt, výsledky a kontrolní součty.

Parametr `sign_ipa=false` odpovídá dosavadnímu předávání IPA k vlastnímu podepsání při instalaci. Nevytváří se vydání do App Store ani TestFlight. Nepodepsaná IPA není přímo instalovatelná bez podpisu; během této úlohy nebyly vyžádány ani změněny Apple certifikáty.

## Aktivace a omezení

IPA sama nepublikuje backend ani nemigruje produkční DB. Rozšířené šablony a bezpečně verzované podpisy vyžadují odpovídající API a migraci **0060**, předchozí přestávky migraci **0059**. Starší backend má základní fallback s pravdivou informací o nedostupné podpoře. Nasazení, rollback a fyzické testy popisuje dokument protokolu.

Aktualizovat pod stejnou podepisovací identitou a bundle ID, bez odinstalování/mazání dat, nejprve synchronizovat čekající změny. Fyzický iPhone/Watch, skutečný fotoaparát, VoiceOver, zákaznické odeslání a push nebyly tímto vydáním dosud ověřeny.
