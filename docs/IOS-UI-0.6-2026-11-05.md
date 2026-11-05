# iOS 0.6 – nativní rozhraní a aktuální deník

Přehled si zachovává původní strukturu. Zakázky mají kompaktní karty, hledání, rychlé volby dne, samostatné filtry a akce přesunutí prstem. Detail odděluje plán práce, domluvený příjezd, místo, dokumentaci, závady a poznámky. Hlavní pracovní akce jsou dostupné nad spodním bezpečným okrajem. Menu Více rozděluje povolené funkce na práci, firemní agendu a nastavení.

Navazující obrazovky používají seskupené nativní SwiftUI prvky. Formuláře z webového klienta se zobrazují v samostatném nativním okně; uzavírá je skutečné původní tlačítko, takže zůstává platná kontrola neuložených změn. Hlavní akce se neopakuje v obsahu a spodní liště. Zrušení výběru prázdného času či data jej nevyplňuje. Vstupy přebírají autocomplete pro Apple Hesla. Změny nadále procházejí stávající validací, verzemi a offline frontou; není přidaná druhá evidence ani volný přístup k API.

Design používá systémové prvky, podporu tmavého režimu a Dynamic Type. Liquid Glass je vyhrazený navigaci a pracovním akcím, obsah zůstává čitelný. Na starších iOS je dostupná kompatibilní systémová varianta. Vypnuté přihlašování osobním odkazem a materiál dostupný celému týmu zůstávají součástí aktuálního deníku.

Sestavení je nastavené na standardní preview image `xcode-27`, který GitHub oficiálně nabízí: https://github.com/actions/runner-images/issues/14404. Vybraná verze Xcode a SDK se ukládá s artefaktem. Náhradní image lze zvolit ručně; nesmí se pak výsledek vydávat za sestavení SDK 27. Výběr simulátoru respektuje zvolenou verzi SDK a řadí verze číselně.

Apple: https://developer.apple.com/documentation/Xcode-Release-Notes/Xcode-27-release-notes
Apple: https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass

## Ověření

Lokálně prošlo 313 regresních testů společného backendu, 4 testy výběru simulátoru a 4 testy podpisové politiky. Integrační test skutečného izolovaného Worker/D1/R2 prošel 10 modulů, založil zákazníka s propojenou zahradou, uložil protokol, podpis a fotografii, otevřel skutečné PDF a ověřil offline úpravu se synchronizací bez duplicit. Nativní kontrakt nevystavuje skryté texty a tlačítka ani primární akce ze sbalených sekcí. Samostatný test ověřil obory, přiřazení, zákaz cizích zakázek, zachování textu formuláře, zrušení bez zápisu, přístup pracovníka k materiálu bez správy katalogu a zneplatnění nativních přehledů offline.

GitHub běh 41977868221 skutečně použil Xcode **27.1 / SDK 27.1** a zkompiloval SwiftUI; prošlo všech 26 jednotkových testů a oba původní testy prohlížečového enginu. Nativní UI testy chybně hledaly pouze `TabBar`, zatímco adaptivní navigace iOS 27 byla v simulátoru jinak uspořádaná. Ze skutečného snímku bylo ověřeno, že nativní přehled se otevřel; testy nyní vybírají navigační akce nezávisle na spodní či boční variantě. Následné výsledky se doplní po dokončení sestavení. Podpis IPA vyžaduje stávající bezpečně uložené Apple certifikáty a profily; nepodepsaný balíček nelze přímo nainstalovat do telefonu. Skutečné APNs, kamera a fyzické Apple Watch vyžadují ověření na zařízení.


## Nasazená kompatibilita

Podpora seskupených formulářů a metadat ovládacích prvků byla publikována bez databázové migrace:

- Dr. Závlaha: verze 119, zdroj `5f0f0c52bf96514e9049d153cf6ac94cded1a8d6`.
- Dr. Garden: verze 40, zdroj `7fcb7eac15cf708d03a6def06e7a45eb78378809`.

Obě URL vracejí nový kontrakt; přihlášení heslem zůstává povolené a osobní přihlašovací odkazy vypnuté. Nebyla měněna provozní data, role ani nastavení integrací. Verze 0.6 telefonu vyžaduje aktualizaci nainstalovaného balíčku; samotná aktualizace webu nepřepíše existující IPA.
