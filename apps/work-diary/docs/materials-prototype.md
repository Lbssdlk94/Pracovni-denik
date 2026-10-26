# Katalog materiálu – soukromý prototyp vlastníka

Celý modul je přístupný pouze roli **owner**. Správce, pracovník ani čtenář nevidí nabídku Materiál ani výběr katalogových položek v protokolu. Všechny požadavky `/api/materials` ověřují vlastníka na serveru; skrytá tlačítka nejsou jedinou ochranou. U protokolů ostatní role nedostávají katalogové řádky ani jejich ceny, a to ani v historii nebo podkladech pro PDF. Dosavadní ruční text materiálu zůstává dostupný podle oprávnění zakázky.

## Použití

1. Jako vlastník otevřete **Materiál** v hlavní nabídce.
2. V části **Správa kategorií** lze vytvořit kategorii, přejmenovat ji, změnit pořadí nebo ji skrýt. Nižší číslo pořadí se zobrazuje dříve. Předpřipravené jsou Trubky, Trysky, Postřikovače, Ventily, Spojky a tvarovky a Ostatní.
3. Přes **Nový materiál** vyplňte název, kategorii, volitelný kód, jednotku, cenu a měnu. Jednotky lze psát vlastní, například ks, m nebo bal. Přes **Upravit** lze změnit i kategorii položky. Kategorie i položky lze znovu aktivovat; přepínač **Včetně skrytých** je ukáže v přehledu.
4. Konkrétní produkty a ceny zadává vlastník; čitelné položky z jeho snímků byly doplněny samostatným importem. Cenu zadáváte jako přesnou jednotkovou částku. Prototyp nepočítá DPH, nespravuje skladové zásoby a nenahrazuje fakturaci.
5. V **Zakázky → Podrobnosti → Otevřít servisní protokol → Podrobnosti servisu** se vlastníkovi zobrazí **Materiál z katalogu**. Vyhledejte nebo vyfiltrujte materiál, přidejte ho a zadejte množství. Řádky lze odebrat; ruční poznámka k materiálu zůstává dobrovolná.
6. Množství podporuje až tři desetinná místa. Zobrazí se jednotková i řádková cena a součet; různé měny se sčítají odděleně. Uložení, dokončení a náhled PDF používají dosavadní tlačítka protokolu. Náhled neukládá změny.

## Ukládání a offline práce

Katalog používá D1 tabulky `material_categories`, `material_items` a neměnné revize `material_item_revisions`. Sjednaný výběr se ukládá samostatně v `service_reports.material_items`; nepřepisuje ruční text. Do protokolu se uloží kopie názvu, kódu, jednotky, ceny, měny a revize spolu s množstvím. Server cenu přebírá z uložené revize, nikoli z nedůvěryhodného údaje ve formuláři. Pozdější přecenění nebo přejmenování proto nemění starší protokol. Materiál původně vybraný offline používá ověřitelnou původní revizi i při pozdější synchronizaci.

Úpravy katalogu, kategorií a cen vyžadují internet. Každý řádek má vlastní verzi; zastaralá souběžná úprava vrací konflikt. Katalog lze na jiném zařízení obnovit tlačítkem **Obnovit**. Po prvním načtení je osobní kopie katalogu vlastníka dostupná až 24 hodin offline. Výběr materiálu se ukládá do existující osobní fronty protokolů a sdílí se po připojení se stejnou ochranou proti duplicitám a konfliktům jako ostatní servisní zápisy.

Skrytí položky či kategorie zachovává historické protokoly. Nový výběr skrytého materiálu server odmítne, existující řádek s původní cenou lze dál zachovat nebo upravit jeho množství. Když jiná role upraví běžné údaje protokolu, skryté katalogové řádky se na serveru zachovají. Pokus jiné role výslovně změnit tyto řádky je zakázaný.

PDF vytvořené vlastníkem může obsahovat katalogové řádky i ceny. Ostatní role tato data nedostávají. Vlastník samozřejmě může vlastní PDF vědomě stáhnout či sdílet. Samotná data katalogu nejsou ve veřejné service worker cache ani v běžné záloze zahrad a šachet. Změna účtu vymaže dosavadní osobní úložiště; při přihlášení jiné role se znepřístupní i kopie katalogu.

## Ověření

Migrace `0024_owner_materials.sql` zachovává starší servisní záznamy s prázdným výchozím polem položek. `tests/materials.test.js` ověřuje zakázaný přístup správce/pracovníka/čtenáře, úpravy kategorií, verze cen, kanonické ceny, částečná množství, opakování, historické řádky a jejich zachování i utajení při úpravách jinými rolemi. `tests/materials-browser.cjs` ověřuje mobilní ovládání, soukromou nabídku, výběr do protokolu, PDF, změnu ceny a offline synchronizaci. Test reálného workerd/D1 ověřuje také migrace a transakce nového modulu. Výsledné PDF bylo zkontrolováno přes `pdftotext`. Fyzický iPhone není součástí automatického testu.

## Smazání materiálu

U položky je vedle **Upravit** tlačítko **Smazat**; stejná možnost je i v úpravě položky. Potvrzovací okno zobrazí název materiálu. **Zrušit** nic nemění. Mazání vyžaduje internet a zůstává pouze vlastníkovi. Smazaný materiál zmizí z katalogu, z přehledu **Včetně skrytých** a z nového výběru do protokolu. **Skrýt** zůstává samostatnou možností pro dočasně nepoužívané položky.

Migrace `0030_fine_toad.sql` přidává příznak odstranění v `material_items`. Server uchovává technický záznam a neměnné revize kvůli již uloženým protokolům. Jejich názvy, ceny, množství i PDF se smazáním katalogové položky nemění. Existující řádek lze dále zachovat či upravit jeho množství, ale smazaný materiál již nelze nově vybrat do jiného protokolu. Zastaralá úprava jej nemůže obnovit.

Pro odlišení od dosavadního skrytí používá smazání `DELETE /api/materials/items/:id` s `{version, remove:true}`. Původní klient s `{version}` nadále provádí jen skrytí. Server kontroluje roli i verzi. Opakování smazání se stejnou původní verzí je bezpečné i po ztrátě odpovědi. Po smazání se zneplatní místní kopie katalogu, aby jej chybný síťový refresh nevrátil do přehledu. Jiná zařízení musí načíst aktuální katalog; nový výběr ze zastaralé offline kopie server odmítne při synchronizaci.

`tests/material-delete-browser.cjs` ověřuje zrušení/potvrzení, mazání ze seznamu a úpravy, ztracenou odpověď a bezpečné opakování, výpadek při obnovení, druhé zařízení, skryté položky, mobilní/desktopové rozložení i zachovaný historický protokol a PDF. Serverové a workerd testy ověřují role, verze a nemožnost obnovení smazané položky.
