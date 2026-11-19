# iPhone: společný styl bublinových ovládacích prvků

Připravená změna zdrojového kódu na větvi `ui/ios-bubble-controls-2026-11-19`, založené na `ed0bb6f` (deník realizace pro všechny dostupné role). Uživatel povolil změnit GitHub, ale výslovně nechce nové sestavení IPA. Verze 0.8.2 (11) ani workflow se proto nemění; tato větev není nové vydání aplikace.

## Vzhled a rozsah

`DiaryBubbleButtonStyle` v `apps/iphone/App/DiaryDesign.swift` sjednocuje vlastní ovládací prvky telefonu. Styl zdědí celý `APIRoot`, včetně formulářů a prezentovaných obrazovek. Dosavadní explicitní `.bordered`, `.borderedProminent` a `.plain` výjimky v aktivním klientovi NativeAPI byly převedeny na tento styl:

- Vedlejší akce a odkazy: světlá kapsle, jemný okraj a stín, zelený text.
- Hlavní akce: plná tmavě zelená kapsle s bílým textem.
- Samostatné ikony: kruhová varianta stejného povrchu.
- Miniatury: zaoblený povrch bez ořezání fotografie do úzké kapsle.
- Stisk: jemné ztmavení/zesvětlení a zmenšení. V režimu omezeného pohybu se zmenšení ani animace nepoužijí.
- Vypnuté tlačítko zůstává skutečně disabled; destruktivní akce si ponechávají sémantickou roli a červené označení.

Sklo se použije od iOS 26; iOS 17–25 dostane materiálový povrch. Omezená průhlednost a zvýšený kontrast používají neprůhledný podklad. Dotyková plocha je minimálně 44 bodů, hlavní akce minimálně 50 bodů; text může růst a zalamovat se. Ořez se nevztahuje na obsah tlačítek. Informační karty, API, oprávnění, synchronizace a akce se nepřepisují. Nativní systémové dialogy, klávesnice a výběry souborů nadále vykresluje iOS. Watch target se nemění.

## Lokální ověření a další kontrola

- `git diff --check` bez chyb.
- Ručně zkontrolovaný diff: mění se styly, rozměry a jejich přiřazení, žádné API cesty nebo obslužné akce.
- Aktivní NativeAPI klient už neobsahuje staré explicitní `buttonStyle` přepisy. Výchozí styl je nastavený u kořene aplikace.
- Připravené Xcode previews pro 390 bodů ve světlém režimu, 360 bodů v tmavém režimu a velký text. Náhledy nebyly v tomto Linux prostředí vykreslené.

Sestavení, XCTest, UI testy a ověření na fyzickém iPhonu zatím neproběhly. Před vydáním je potřeba v Xcode ověřit formuláře, tlačítka v toolbaru, víceřádkové položky, miniatury, sheet prezentace a akční lištu nad tab barem při běžné i zvětšené velikosti textu. Obrázek zaslaný v konverzaci je vizuální koncept, nikoli screenshot spuštěného sestavení.

## GitHub bez sestavení

Push jde pouze na novou větev, nikoli `main`. Commit obsahuje `[skip ci]`; stávající workflow má push sestavení omezené na `main`. Nebude ručně spuštěn `workflow_dispatch` ani vytvořena IPA. Případné budoucí sestavení je samostatný krok na výslovný požadavek uživatele. Samotné uložení této větve nezmění nainstalovanou aplikaci ani web.
