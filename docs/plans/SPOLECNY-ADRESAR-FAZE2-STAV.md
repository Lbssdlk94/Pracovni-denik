# Společný adresář a oddělené obory – stav po nasazení

30. října 2026. Fáze 2 je aktivovaná. Pracovní větev: `plan/shared-directory-disciplines-2026-10-29`.

## Provozní stav

- Dr. Závlaha: https://zavlahovy-denik.purplecedar.chatgpt.site/ – vydání 105, prostředí 14.
- Dr. Garden: https://dr-garden.purplecedar.chatgpt.site/ – vydání 26, prostředí 8.
- Obě adresy používají společné API a jednu autoritativní pracovní D1/R2 instalaci Dr. Závlahy.
- Pracovní prostor: `workspace-dr-zavlaha-garden-2026`. Oddělené obory: `irrigation`, `garden`.
- Původní Garden D1 zůstala zachovaná a trvale uzamčená jako archiv. Není druhou pracovní evidencí ani záložním místem pro zápis při výpadku API.
- Zachováno publikum obou Sites. Test, ostatní firmy a Super Admin se nepřipojily k pracovní databázi.

## Výsledek převodu

Před uzamčením proběhl živý převod nanečisto. Poté byl po krátkém uzamčení obou databází ověřen konzistentní snímek. Finální plán neobsahoval žádnou blokující překážku a byl navázán na generaci změn a kontrolní hash:

`ea6778dad3a63fdb2a9a913e32073c6782c4be5ac4fcdf3ac30d32c115b3d050`

Stav při aktivaci:

| Evidence | Původní Závlaha | Původní Garden | Společná evidence |
| --- | ---: | ---: | ---: |
| Zákazníci | 120 | 1 | 121 |
| Zahrady včetně historie | 129 | 1 | 130 |
| Zakázky včetně historie | 148 | 0 | 148 |
| Kanoničtí členové | 5 | 1 | 5 |

Šest původních hostingových identit je výslovně navázáno na pět členů. Sloučil se pouze uživatelem schválený pár vlastnických identit. Ostatní členové, přiřazení zakázek a jejich role zůstali zachovaní. Nevznikaly shody podle jména, telefonu či adresy. Prázdné volitelné vazby se neopravovaly odhadem.

Původní Garden zákazník a zahrada zachovali svá ID. Tři kolizní výchozí tarify dostaly ID `garden-tariff-low`, `garden-tariff-medium`, `garden-tariff-high`; jejich definice se zachovaly. Původní tarify a smluvní snapshoty Závlahy se nepřepsaly.

Závlaha při převodu obsahovala také 2 závady, 113 protokolů a 164 servisních fotografií. Zůstaly na původních vazbách a v původním úložišti. Žádné provozní zakázky se nepoužily k testovacím zápisům.

Uživatel výslovně schválil pokračování bez nové úplné zálohy. Nová záloha nebyla předstíraná ani vynucovaná. Dosavadní zálohy se nemazaly. Původní Garden databáze a úložiště se zachovaly.

## Funkce a ochrany

- Společné kontakty, adresy a základní popis zahrady; oborové pracovní poznámky, zakázky, historie, protokoly, závady a pracovní fotografie.
- Štítky Závlaha/Garden/Obojí a přepínač Vše/Závlaha/Garden. Správa příslušnosti v zákaznících a týmu s verzováním a auditem.
- Zákaz odebrání zákaznického oboru s pracovní historií. Kategorie Obojí nezpřístupňuje pracovníkovi automaticky všechny zakázky. Nadále rozhoduje jeho role, obor a konkrétní přiřazení.
- Serverové filtry před stránkováním a ochrana přímých odkazů, médií, historie, oznámení a synchronizace. Samostatná ochrana polí Šachty/Vyfukování/čerpadlo/plán.
- SQL transakční kontroly současných změn rolí a příslušnosti, stabilní operační ID, idempotentní čerpání a zachování sjednaných tarifních podmínek.
- Offline revize oprávnění, ověření lokálních ID před odesláním fronty, odstranění nepřístupných cache a šifrovaná záchrana neodeslaných textů, fotografií a rozepsaných formulářů.
- Oddělená licenční připojení, preference a tarifní katalogy obou organizací. Technické statistiky nepočítají automaticky všechny členy společné databáze do každé firmy. Garden se neoznačuje jako zálohovaná starší zálohou samotné Závlahy.
- Zdrojové změny jsou na samostatné pracovní větvi; hostingové zdroje zachovaly značky, migrační základy i publika instalací.

## Kde funkce najít

V horním přepínači **Obor** zvolte **Vše** pro společný přehled správce. V zákazníkovi nebo v týmu otevřete **Obory / Příslušnost k oborům**. Stávající zákazníci Závlahy začali jako Závlaha, původní zákazník Garden jako Garden. Přidání druhého oboru používá stejnou kartu; nezakládá její kopii. Pracovník jediného týmu má obor automaticky.

Pro další osobní účty se identity neslučují jen podle e-mailu. Pro práci v obou oborech lze dál používat dosavadní adresu aplikace s příslušným oprávněním. Další hostingové identity vyžadují výslovné bezpečné propojení.

## Ověření

- Zaměřená sada propojení: 55 úspěšných testů. Úplná sada po finálních opravách: 274 úspěšných testů, žádný neúspěšný test.
- Skutečný lokální workerd/D1/R2: podepsaný snímek, transakční převod s 305 syntetickými zakázkami, stabilní ID, vlastnický alias, opakování, zámek zápisů a zachování původních záznamů.
- Skutečný lokální workerd: dvě vstupní adresy, jeden pracovní DB/R2, souběžná změna s CAS, idempotentní audit, neplatný podpis/cizí člen, přenos a čtení fotografie 25 MiB.
- Chromium: mobilní šířky 390/430 a desktop 1280/1440, výběry oborů, více zahrad/adres přes ID, formuláře, zrušení bez zápisu a kontrola vodorovného přetečení.
- Chromium/IndexedDB/WebCrypto: upgrade v4→v5, odebrání oprávnění, atomické odstranění čitelné cache, šifrované zachování protokolu/fotky/formuláře, stabilní ID čekajících operací a obnovení stránky.
- Provoz: podepsaná komunikace Garden→Závlaha ověřená před převodem i po aktivaci. Stav společného prostoru je `active`; původní Garden zápisy jsou blokované. Dočasné převodní oprávnění je po dokončení explicitně neplatné; původní token vrací 404.

Metadata živého převodu bez kontaktních údajů a bez tajných hodnot jsou v `/workspace/artifacts/shared-directory/production-preview.json`, `production-frozen-preview.json`, `production-transfer-result.json`.

## Omezení a provozní poznámky

- Ověření mobilu proběhlo v Chromiu, nikoli na fyzickém iPhonu/Safari. Přihlášení skutečných pracovníků a jejich provozní zakázky se neimpersonovaly; role a celé zápisy se testovaly izolovaně.
- Už odpojenému telefonu nelze vzdáleně odebrat data okamžitě. Po dalším ověření připojení se uplatní revize oprávnění a bezpečné vyčištění. Při selhání šifrování/úložiště se nesmí předstírat úspěšná záchrana a zahodit originální práci.
- Google Disk se nepřeváděl. Garden měl pouze prázdný technický řadič bez konfigurace a spojení; zůstal v původním archivu. Garden nesmí převzít připojení Závlahy. Interní fotografie protokolů používají stávající R2. Sdílení na Disku a jeho externí přímé odkazy zůstávají mimo tento úkol. E-mailové integrace se nezaváděly.
- Při přípravě publikace se opravilo umístění migračních souborů v archivu; mezitím se obnovila předchozí vydání. Správný balíček kontroluje `scripts/package-workspace-release.mjs`. Nativní uložení je podle source SHA idempotentní: jiný archiv ke stejnému commitu nevytvoří náhradu; oprava balení musí mít nový commit.
- Pouhé odebrání tajné proměnné z konfigurace nebylo dostačujícím důkazem jejího zneplatnění za běhu. Převodní přístup byl proto přepsán explicitně vypršelou hodnotou a ověřen odpovědí 404.
- Po aktivaci nelze bezpečně jen přepnout na starou neoborovou verzi nebo obnovit zápisy do původní Garden DB. Rollback vyžaduje řízenou obnovu společných dat a započtení nových zápisů. Budoucí změna hostingových identit nebo technických klíčů vyžaduje výslovné přepárování vstupů a licencí; není ověřená jako obyčejná obnova na cizí hosting.
