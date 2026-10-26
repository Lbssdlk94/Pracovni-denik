# Servisní protokol a PDF

1. V **Zakázkách** otevřete **Podrobnosti → Otevřít servisní protokol**. Funguje u běžné zakázky i návštěvy z předplatného.
2. Zákazník a adresa se převezmou ze zakázky. Podle potřeby doplňte datum, práce, materiál, závady, poznámku a doporučení. Všechny podrobnosti zůstávají dobrovolné.
3. Přes **Vyfotit / Vybrat fotografie** přidejte snímky přímo do protokolu. Originály se ukládají soukromě k zakázce. Odebrání z protokolu nemaže originál z historie.
4. **Uložit rozpracovaný protokol** uloží zápis. **Dokončit servis / Dokončit zakázku** dokončí práci; u předplatného nadále platí stávající ochrana proti dvojímu odečtení.
5. **Zobrazit PDF** otevře náhled přímo nad formulářem, bez ukládání protokolu nebo stahování souboru. Po zavření náhledu zůstane rozpracovaný formulář zachovaný. Neuložené úpravy mají v PDF označení **NEULOŽENÝ NÁHLED**. U uloženého zápisu otevření náhledu nemění jeho verzi. V náhledu je také odkaz **Zobrazit PDF** pro otevření celé přílohy v nové kartě.
6. **Uložit a vytvořit PDF** uloží aktuální formulář a připraví dokument. Samotný export nemění stav zakázky ani čerpání. Potom použijte **Stáhnout PDF**, nebo **Sdílet PDF**, pokud zařízení podporuje sdílení souborů. Na iPhonu lze vybrat Uložit do Souborů.

PDF obsahuje identifikaci zakázky, zákazníka, adresu, datum, stav, přiřazené pracovníky, autora uloženého zápisu, vyplněné podrobnosti, fotografie vybrané do protokolu a čísla stran. Datum a čas se zobrazují bez dovětku „český čas“; výpočet časového pásma se nemění. Prázdné volitelné oddíly se vynechají; prázdný popis prací se výslovně označí jako nevyplněný. Nezaznamenané závady neznamenají automaticky „bez závad“. Rozpracovaný a nesynchronizovaný protokol mají viditelné označení. PDF neobsahuje ceny předplatného ani interní připravenost materiálu.

Dokument se vytváří přímo v prohlížeči bez externího konvertoru a bez automatického odeslání zákazníkovi. Fotografie pro PDF se zmenší na náhled do 1600 px; uložené originály se nemění. Formát HEIC závisí na podpoře prohlížeče: při nečitelném snímku PDF uvede jeho název a aplikace upozorní na vynechaný náhled. Selhání stažení fotografie přes internet zobrazuje chybu a opakování; fotografie se při výpadku tiše nevynechávají.

Offline formulář používá dosavadní osobní úložiště a frontu synchronizace včetně řešení konfliktů a kontroly přiřazení na serveru. Z již otevřené zakázky lze vytvořit PDF s textem a místními fotografiemi i bez internetu, pokud je aplikace připravená offline. Pro opětovné načtení dříve nahraných originálů fotografií je nutný internet. Místní PDF upozorňuje, že zápis ještě nebyl synchronizován; po sdílení změn vytvořte aktuální kopii. Serverový protokol může upravovat pouze správce/vlastník nebo přiřazený pracovník. Přiřazený čtenář může uložený protokol prohlížet a exportovat.

## Oprávnění a nabídka

- Pracovník a čtenář mají v Nastavení pouze osobní upozornění. Nabídky Tým a Záloha jsou skryté.
- Vlastník a správce mají tým a kompletní Nastavení. Záloha a obnova jsou v rozbalovací části **Nastavení → Záloha a pomoc**, včetně dosavadního přepínače funkce záloh.
- Cenu předplatného vidí pouze vlastník/správce. Ostatní role nedostávají sjednanou cenu, ceníkovou cenu ani přijaté částky v API přehledu, detailu ani offline servisním podkladu. Tarify, služby, platnost, čerpání a návštěvy jim zůstávají dostupné v rozsahu přiřazení. Dřívější offline servisní kopie se při online přihlášení očistí od částek.

Používají se existující tabulky `service_reports`, `service_report_history`, `service_photos` a fronta operací. Nová databázová migrace není potřeba. Veřejně cachované jsou pouze kód generátoru, jsPDF a písmo DejaVu Sans s českou diakritikou, nikoli zákaznické PDF nebo fotografie. Přibalené licence: hlavička `web/jspdf.umd.min.js`, `web/protocol-font-LICENSE.txt`.

## Ověření

`npm run check`, `npm run build`, `npm test` a `npm run test:subscriptions-worker` ověřují syntaxi, sestavení, oprávnění, sdílení, opakování požadavků, konflikty a čerpání v reálném workerd/D1. `tests/service-protocol-browser.cjs` na mobilním Chromium ověřuje běžnou zakázku, PDF s fotografií, výpadek/obnovu, offline export a synchronizaci, skrytí nabídky i přesun zálohy. `tests/subscriptions-browser.cjs` ověřuje i nepřítomnost cen u pracovníka. Vygenerované PDF bylo navíc zkontrolováno pomocí `pdfinfo`, `pdftotext` a náhledu stránky. Fyzické Safari na iPhonu není součástí tohoto automatického ověření.
