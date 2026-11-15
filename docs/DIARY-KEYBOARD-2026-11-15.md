# Mobilní deník při otevřené klávesnici

Příčina: spodní panel se dvěma akcemi používal `position: sticky; bottom: 0`. Po otevření klávesnice na iPhonu se modal výrazně zkrátil a obě tlačítka překryla pole formuláře.

Oprava:

- Do 760 CSS px jsou Uložit/Zpět v běžném toku až za poli. Lze k nim doscrollovat i s otevřenou klávesnicí. Desktopové přilepení zůstává.
- Modal deníku respektuje výšku i horní posun `visualViewport` a bezpečný horní okraj zařízení.
- Po změně velikosti klávesnice nebo přesunu fokusu se pole deníku posune do viditelné části pod hlavičku. Událost samotného posouvání toto dorovnání nespouští, takže uživatele nevrací zpět při cestě k tlačítkům. Automatické dorovnání pole se při pinch zoomu nespouští.
- Zachován text, místní koncepty, povinné fotografie, synchronizační fronta i existující práva. Beze změn backendu nebo databázového modelu. Nová verze app/CSS a Service Worker cache.

Ověření: syntaktická kontrola, přesné offline URL závislostí a rozšířený skutečný browser test sestaveného Workeru na izolovaných D1/R2/IndexedDB. Testuje zmenšení viditelné oblasti na 360/300 px a posun o 96 px při šířkách 360/390/430 px; celé pole pod hlavičkou, nepřekrytí, ruční scroll k tlačítkům, návrat po zavření klávesnice a zachování textu. Také prošly navazující uložení, fotky, offline/restart/502/synchronizace právě jednou, doplnění starého zápisu bez fotky, konflikty a desktop 1440 px. Oba firemní buildy a jejich autorizovaný start prošly validací.

Test používá Chromium a řízené hodnoty VisualViewport. Nejde o fyzický iPhone ani o skutečnou softwarovou klávesnici Safari; její animace, kurzor a návrhy textu zde ověřené nejsou. Náhledy zachycují pouze emulovanou viditelnou oblast: `/workspace/artifacts/job-diary-keyboard-2026-11-15/`.

Nasazení: Dr. Závlaha používá standardní balíček s kořenovými migracemi. Dr. Garden má po propojení zmrazenou lokální databázi a jeho předchozí plná migrace byla blokována `workspace_transfer_frozen`; tato čistě prezentační aktualizace proto neposílá další lokální migrace. Před zabalením bylo ověřeno, že sestavený Worker mimo vložený objekt `ASSETS` je bajtově shodný s předchozím sestavením Garden. Backend, konfigurace a sdílené API se tím nemění; SQL historie ani ochranné triggery nebyly upravovány. Další databázové změny vyžadují standardní migrační postup a dořešení lokální historie Garden.


Nasazeno úspěšně: Dr. Závlaha verze 133, zdroj `aa2802beab402ea976f7a5ee42bcdb32a89494e2`, nasazení `appgdep_6afa0e74d8ac8191920a137145b67ecd`. Dr. Garden verze 53, zdroj `a0203dae90caa35a137dde5e234b8e6e74835ac8`, nasazení `appgdep_6afa0e8b94148191b75f45ff53cd1557`. GitHub: [PR #16](https://github.com/Lbssdlk94/Pracovni-denik/pull/16).
