# iPhone a Apple Watch 0.8.3 (12)

Uživatel 19. 11. 2026 výslovně požádal o vytvoření IPA se všemi připravenými úpravami. Tím nahradil dřívější požadavek pouze ukládat zdroje bez sestavení.

## Obsah vydání

- Nativní SwiftUI klient a pět trvalých navigačních záložek.
- Společný bublinový styl vlastních tlačítek, hlavní a vedlejší varianty, kruhové ikony a reakce při stisku.
- Akce přímo nad detailem zakázky a pokračování pracovního stavu bez návratu do seznamu.
- Deník realizace pro všechny role s přístupem k zakázce, povinné fotografie a mazání pouze vlastníkem či administrátorem.
- Miniatury, komprese fotografií a galerie bez povinného připojení Google Disku.
- Kopie zakázek za minulý, aktuální a příští měsíc a autorizovaný adresář zákazníků a zahrad.
- Individuální a hromadná evidence práce, dopravy a přestávek, propojení s docházkou, náklady a schvalované opravy.
- Procenta dokončení, autor a poznámka, porovnání denního posunu, výchozí hranice 20 procentních bodů a potvrzení přepsání souběžné změny.
- Existující zabezpečené koncepty a synchronizační fronta. Součástí iPhone balíčku zůstává SwiftUI aplikace pro Apple Watch.

## Sestavení

Větev `release/ios-0.8.3-2026-11-19`, zdroj `2ada710d293b45aca115855308f84a06ec96344e`.
GitHub běh: https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44549687612.

Parametry: `runner=xcode-27`, `checks_only=false`, `sign_ipa=false`. Výstup používá dosavadní nepodepsanou IPA pro vlastní podpis. Žádné publikování do TestFlightu/App Store ani změna produkčního webu není součástí tohoto vydání.

Lokálně prošly 4 kontroly podpisů a 13 kontrol výběru/párování simulátorů. Nově jsou doplněné dva integrační XCTest scénáře odhadu (uložení, autor, zachování stavu a idempotence; konflikt a nezávislá verze hranice) a jeden UI scénář jeho nativního formuláře a zachování detailu. Výsledky dokončeného macOS běhu jsou uvedené níže.

První běh `44545554781` zkompiloval aplikaci a prošlo 86 unit testů i 14 původních UI testů. Nový test odhadu selhal, protože XCTest označil tlačítko pod safe-area lištou jako hittable a klepl na překrývající akci Hotovo. Video a accessibility hierarchie potvrzují shodnou souřadnici překrytí. Test nově ověřuje celý rám tlačítka nad akční lištou a před klepnutím jej odroluje. Kontrola existence formuláře ani ukládání nebyla odstraněna nebo oslabena.

Druhý běh `44547824627` znovu prošel 86 unit a 14 původních UI scénářů; nový test zastavil po přesunutí ovládacího prvku nad viditelnou oblast rychlým swipe gestem. Oprava používá krátký pomalý drag, kontrolu horní i dolní hranice a obousměrné přizpůsobení. Mezi třemi běhy se měnil pouze tento UI test, aplikační Swift zdroje zůstaly shodné.

## Dokončené vydání

Běh **44549687612** pro zdroj **2ada710d293b45aca115855308f84a06ec96344e** skončil `success`.

- Xcode 27.1 / iOS SDK 27.1: **86 unit testů + 15 UI testů, bez chyb**. Nový test upravil odhad ve skutečném nativním sheetu, uložil jej a ověřil zachování detailu a navigace.
- Release device build a kontrola skutečného bundle prošly: žádný přibalený webový runtime, ikony, soukromí a APNs prostředí v konfiguraci.
- Vložená Watch aplikace má správné ID, executable, ikony, soukromí a verzi shodnou s iPhonem. Její samostatné sestavení, párování/spuštění simulátoru a tři náhledy prošly.
- [IPA, náhledy a logy na GitHubu](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/44549687612/artifacts/14542997871): artefakt `14542997871`, ZIP 16 739 176 B, dostupnost do 3. 12. 2026.
- SHA256 celého ZIP: `3e046ebc753931b426f522a278ead77bdef0c88066c636ebeca68f8a5e966b1f`.
- SHA256 IPA: `27cbde79f9d8691985d90a6f64396fbcfc33e6b76b62d7b3b570b097ba172b9c`, velikost 2 668 380 B.
- Stažený ZIP byl nezávisle porovnán s GitHub digestem. IPA byla rozbalena a porovnána s CI součtem; ověřena verze **0.8.3 (12)**, identita obou aplikací, přítomnost binárek, soukromí a absence HTML/JS.
- Místní výstup: `/workspace/artifacts/ios-0.8.3/PracovniDenik-0.8.3-UNSIGNED.ipa` a `SHA256.txt`. Náhledy jsou ve stejném adresáři.

IPA **není podepsaná**. Použije se dosavadní vlastní podpis, se stejným bundle ID a podpisovou identitou pro aktualizaci. Nevydávalo se do App Store/TestFlightu; fyzický iPhone/Watch a skutečné doručování push nebyly touto kontrolou ověřené. Před aktualizací synchronizujte neodeslanou práci; aplikaci neodinstalovávejte kvůli aktualizaci.

Dokumentační commit po sestavení nemění žádné testované soubory aplikace, projekt ani workflow; nová IPA se kvůli této dokumentaci nevytváří.
