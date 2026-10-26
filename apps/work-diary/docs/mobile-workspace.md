# Mobilní nabídka, rozepsané formuláře a vytížení

## Navigace a úvodní stránka

Na mobilu (do 760 px) jsou dole **Zakázky, Zahrady, Zákazníci, Docházka a Více**. Vypnuté funkce se nezobrazují. Pod **Více** jsou podle role Předplatné, Materiál, Tým a Nastavení. Materiál zůstává jen vlastníkovi, Tým vlastníkovi/správci a pracovník má v Nastavení pouze upozornění. Nabídka Více nepoužívá společné okno formulářů; zavře se výběrem sekce, klepnutím mimo nabídku nebo Esc. Na počítači zůstává úplné boční menu.

Při otevření v počítačovém rozložení (od 761 px) se jako první zobrazí Zakázky, pokud jsou zapnuté. Mobil dál vychází z docházky: před příchodem Docházka, po příchodu Zakázky. Záměrný odkaz na zakázku nebo návrat z připojení Google Disku má nadále přednost. Změna velikosti okna sama nepřepíná rozepsanou práci do jiné sekce.

## Rozepsané formuláře

Průběžná soukromá kopie funguje pro zakázku, zákazníka (včetně více telefonů a adres), zahradu, servisní záznam zahrady a servisní protokol (včetně vybraných fotografií, materiálu a práce/cesty vlastníka). Ostatní konfigurační formuláře a editor popisků fotografie touto funkcí zatím pokryté nejsou. API klíče, přístupové odkazy ani hesla se do rozepsaných kopií neukládají.

Po změně se údaje uchovají v místním IndexedDB. Při přepnutí aplikace na pozadí nebo opuštění stránky se dokončí čekající uložení. Po návratu otevřete stejnou úpravu, případně znovu Nový zákazník/zakázka/zahrada, a zvolte **Pokračovat v rozepsaném**. Kopii lze samostatně zahodit. Stav u formuláře ukazuje, zda se právě ukládá, zda je uchovaná, nebo zda uložení selhalo.

Tato kopie není potvrzený záznam a neodesílá se automaticky na server ani kolegům. Nezmění stav zakázky, docházku, čerpání předplatného ani sazby. Až původní tlačítko formuláře provede běžné uložení se všemi existujícími oprávněními a kontrolou verze. Po úspěšném uložení se rozepsaná kopie odstraní. Při změně serverové verze lze starou kopii pouze zobrazit a zkopírovat, nikoli automaticky přepsat novější údaje.

Kopie jsou vázané na konkrétní účet, roli, formulář, záznam a jeho původní verzi. K obnovení jsou dostupné nejvýše 7 dní, nejvýše 20 kopií v zařízení. Prošlé kopie se uklidí při dalším uchování formuláře. Odhlášení a přepnutí účtu je odstraní; změna role je znepřístupní a vymaže. Nejsou ve veřejné PWA cache ani v záloze zahrad. Ztráta či vymazání dat prohlížeče odstraní i místní kopie. Při nedostatku místa nebo zákazu úložiště zobrazí formulář chybu a je potřeba použít jeho běžné uložení.

Fotografie se uchovávají v původních bytech s názvem, MIME typem a časem. To obchází problém WebKitu s ukládáním objektů File do IndexedDB. Stejný bezztrátový formát používá fronta servisních protokolů a přijímá i starší uložené Files; ochrana proti opakovanému odeslání a serverová kontrola čerpání se nemění.

## Vytížení kolegů

Vlastník a správce otevřou na počítači **Zakázky → Vytížení**. Volba týdne používá již existující kalendář/API zakázek, nevytváří druhou evidenci. Řádky představují kolegy, sloupce dny a poslední sloupec týdenní součet. Kliknutím na den se otevře časová osa vybraného kolegy.

Počítá se délka potvrzených návštěv s úplným časem, včetně hotových podle zvoleného filtru Stav. Sdílená zakázka se započte každému přiřazenému kolegovi. Bez dne nebo úplného času se délka neodhaduje; počet návštěv bez úplného času je vidět zvlášť. Souběhy se označují a jejich délky se sčítají; nejde o skutečnou docházku ani automatický odhad kapacity. Návrhy čekající na schválení se do hodin nezahrnují. Při otevření Vytížení se výchozí filtr Aktuální zakázky přepne na Všechny stavy.

Přehled respektuje filtry a načtené stránky. Pokud nejsou všechny záznamy načtené, upozorní na neúplný součet. Pracovník nedostane přehled celého týmu; dosavadní backend stále vrací jen jemu oprávněné zakázky. Vytížení nepřidává ceny, údaje předplatného, GPS docházky ani soukromý materiál.

## Ověření

`tests/workspace-browser.cjs` ověřuje oba způsoby startu, nabídku Více a role, výpočet/otevření vytížení, skutečné obnovení formulářů po reloadu, více kontaktů/adres, fotografie, zákaz automatických serverových zápisů, vyčištění po potvrzení, konflikt verze a oddělení účtů. Běží v Chromiu a při dostupném Playwright WebKit i s `QA_BROWSER=webkit`. Test WebKit na Linuxu není test fyzického iPhonu či macOS Safari.

`tests/workload.test.js` kontroluje sdílení, souběhy, chybějící časy, hranice týdne a započítání dokončených a ignorování nepotvrzených návštěv. `tests/photo-storage.test.js` kontroluje totožnost původních bytů a metadat i kompatibilitu starších front. Dosavadní prohlížečové scénáře používají pomocník `tests/browser-nav.cjs` k otevření sekcí schovaných pod Více; kde potřebují docházku, přejdou do ní výslovně.
