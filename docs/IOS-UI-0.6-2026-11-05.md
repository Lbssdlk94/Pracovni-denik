# iOS 0.6 – nativní rozhraní a aktuální deník

Přehled si zachovává původní strukturu. Zakázky mají kompaktní karty, hledání, rychlé volby dne, samostatné filtry a akce přesunutí prstem. Detail odděluje plán práce, domluvený příjezd, místo, dokumentaci, závady a poznámky. Hlavní pracovní akce jsou dostupné nad spodním bezpečným okrajem. Menu Více rozděluje povolené funkce na práci, firemní agendu a nastavení.

Navazující obrazovky používají seskupené nativní SwiftUI prvky. Formuláře z webového klienta se zobrazují v samostatném nativním okně; uzavírá je skutečné původní tlačítko, takže zůstává platná kontrola neuložených změn. Hlavní akce se neopakuje v obsahu a spodní liště. Zrušení výběru prázdného času či data jej nevyplňuje. Vstupy přebírají autocomplete pro Apple Hesla. Změny nadále procházejí stávající validací, verzemi a offline frontou; není přidaná druhá evidence ani volný přístup k API.

Design používá systémové prvky, podporu tmavého režimu a Dynamic Type. Liquid Glass je vyhrazený navigaci a pracovním akcím, obsah zůstává čitelný. Na starších iOS je dostupná kompatibilní systémová varianta. Vypnuté přihlašování osobním odkazem a materiál dostupný celému týmu zůstávají součástí aktuálního deníku.

Sestavení je nastavené na standardní preview image `xcode-27`, který GitHub oficiálně nabízí: https://github.com/actions/runner-images/issues/14404. Vybraná verze Xcode a SDK se ukládá s artefaktem. Náhradní image lze zvolit ručně; nesmí se pak výsledek vydávat za sestavení SDK 27. Výběr simulátoru respektuje zvolenou verzi SDK a řadí verze číselně.

Apple: https://developer.apple.com/documentation/Xcode-Release-Notes/Xcode-27-release-notes
Apple: https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass

## Ověření

Lokálně: testy výběru simulátoru a podpisové politiky, kontrola JS adaptéru. Swift a simulátor vyžadují macOS/Xcode; výsledky GitHub Actions se doplní po dokončení. Podpis IPA vyžaduje stávající bezpečně uložené Apple certifikáty a profily; nepodepsaný balíček nelze přímo nainstalovat do telefonu. Skutečné APNs, kamera a fyzické Apple Watch vyžadují ověření na zařízení.
