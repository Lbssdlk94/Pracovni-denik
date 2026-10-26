# Provoz Závlahového deníku a samostatné firmy

## Co znamená samostatná instalace

Každá firma dostane nový Site, vlastní D1 databázi, R2 úložiště, klíče, plánovač a pozvánky. Správce není oddělená firma: vidí tým této instalace. Aplikace záměrně neobsahuje společnou registraci firem ani zákaznický portál.

Čisté zdroje připraví:

```sh
npm run prepare:company -- --name "Nová firma" --owner "vlastnik@example.cz" --out /workspace/firmy/nova-firma
```

Cílová složka musí být prázdná a mimo projekt. Výstup neobsahuje provozní data, katalog materiálu, kontakty, tajemství ani ID původního Site. Obsahuje pouze výchozí upravitelné tarify. Postup nasazení je v jeho README-INSTALACE.md. Nový projekt a prostředky musí založit provozovatel hostingu; příkaz je sám nezakládá. Identita instalace je zabudovaná do výsledného sestavení a ověřuje se proti databázi i značce v úložišti. Tuto kontrolu neobcházejte přepisováním značky.

Současné přihlašování vlastníka přes ChatGPT vyžaduje důvěryhodnou autentizační bránu Sites. Při přesunu jinam musí brána odstraňovat klientské identitní hlavičky a vkládat jen ověřenou identitu, nebo se musí nahradit autentizace. Samostatné vystavení Workeru internetu není podporovaná migrace přihlášení.

## Firma, zařízení a pozvánky

V Nastavení → Firma, zabezpečení a úplné zálohy vlastník upraví název firmy. Fakturační údaje zůstávají v dosavadním nastavení firmy. Pracovníci mají nadále pouze nastavení upozornění.

Nová osobní pozvánka je jednorázová a platí 7 dní, pro správce 1 den. Po přijetí vznikne samostatná relace zařízení, platná nejvýše 30 dní, pro správce 7 dní. Odhlášení relaci odvolá na serveru. Správa zařízení umožňuje odvolat jednotlivé relace nebo pozvat další zařízení bez odhlášení ostatních nových relací. Obnovení původního přístupového odkazu nadále odvolává všechny relace kolegy. U starších opakovatelných odkazů platí přechodná lhůta 90 dní od migrace; pak je nutná nová pozvánka.

Offline identita vyžaduje nové serverové ověření nejpozději po 24 hodinách. Vzdálené odhlášení nemůže smazat soubory z odpojeného telefonu. Zařízení chraňte systémovým zámkem.

## Úplné zálohy

Úplné šifrované zálohy spravuje pouze vlastník. Zahrnují databázový snímek všech aplikačních tabulek a odkazované soubory R2, včetně protokolů, fotografií, zákazníků, docházky a předplatných. Původní export zahrad/šachet zůstává samostatným částečným exportem.

Google Disk je externí úložiště: archiv uchovává vazby a místní náhledy, nikoli originály na Disku. Zajistěte jejich zálohu zvlášť. Záloha nevytváří veřejné odkazy.

1. Ověřte serverový DRIVE_TOKEN_ENCRYPTION_KEY (32 náhodných bajtů, base64url). Nikdy jej nevkládejte do frontendového kódu.
2. Vytvořte a stáhněte obnovovací sadu chráněnou heslem alespoň 12 znaků. Sadu uložte mimo aplikaci, heslo odděleně do správce hesel. Umožní obnovu na server s novým klíčem. Samotný archiv ani samotné heslo nestačí.
3. Klikněte Vytvořit úplnou zálohu. Neodcházejte, dokud není Připravená; přerušené vytváření lze obnovit tlačítkem Pokračovat.
4. Stáhněte šifrovaný TAR archiv a bezpečně jej uložte mimo hosting. Automatické zálohy ve stejném R2 nechrání proti ztrátě celého účtu.

Automatický ověřený kontrolní běh připravuje denní zálohu a uchovává posledních 7 hotových automatických denních záloh. Dlouhé zálohy pokračují při dalších bězích. Ruční zálohy se automaticky nemažou. Pokud se zdrojový soubor při kopírování změní nebo chybí, záloha skončí chybou; spusťte nový snímek. Kontrolujte stav a stáří poslední hotové zálohy, samotné nastavení plánovače úspěch nedokazuje.

## Obnova bez přepsání provozu

Obnova je povolená pouze do prázdné instalace stejného vlastníka a přesně stejného databázového schématu. Původní provozní instalaci nepřepisuje. Připravte cílový Site s vlastním úložištěm a ID, ale se stejnými migracemi jako archiv; běžná nová firma není automaticky kompatibilním cílem staré zálohy.

1. Přihlaste se jako vlastník cílové prázdné instalace.
2. Při jiném serverovém klíči vyberte obnovovací sadu a zadejte její heslo.
3. Nahrajte TAR archiv; aplikace ověří šifrování, části, kontrolní součty a schéma.
4. Potvrďte zdrojovou a cílovou instalaci zadáním OBNOVIT.
5. Počkejte na stav Obnovená. Ověřte počty, vazby, fotografie a protokoly. Znovu pozvěte kolegy; osobní odkazy a relace se při obnově zneplatňují. Rozpracované odchozí zprávy se automaticky nerozesílají znovu.
6. Identita cílové instalace se zachová. Integrační tajemství se při použití obnovovací sady přešifrují cílovým klíčem. Při jiné doméně zkontrolujte také povolené OAuth redirect URI, odesílatele, servisní hash a samostatný plánovač; samotná obnova je za vás nepřenastaví.

Každá část zpracovává omezenou dávku; soubor R2 má limit 32 MB, datová část 12 MB a manifest 4 MB. Aplikace při překročení selže s chybou, nikoli s neúplnou hotovou zálohou. Velké databáze mohou narazit na kvóty D1/Workeru při atomickém snímku nebo obnově. Pro větší instalace je nutný objemový test a případně nativní export správce hostingu. Obnova skutečné provozní zálohy se v rámci této změny neprováděla.

## Plánovač a dohled

Existující úloha Kontrola materiálu před realizací byla obnovena. Serverový POST /api/service-reminders/run používá úzce omezený servisní token, jehož SHA-256 hash je v SERVICE_REMINDER_TOKEN_HASH. Plánovač Sites musí využít zamýšlený autentizovaný servisní přístup a nesmí ukládat token do zdrojů ani výstupů. Nikdy nepoužívejte osobní odkaz pracovníka jako cron token. Nová firma potřebuje vlastní plánovač a vlastní hash.

U jiného hostingu ověřte autentizační bránu, způsob bezpečného předání tokenu a runtime. Plánovač spouštějte nejvýše v potřebné četnosti (stávající nastavení po hodině 8–18, Europe/Prague). Pouhý ruční test nepotvrzuje autonomní plánování. Nastavení ukazuje čas a výsledek skutečného serverového běhu; při stáří nad 3 hodiny varuje, takže varování může být očekávané v noci. Poslední záloha má samostatný 48hodinový ukazatel. Nejde o nezávislý externí monitoring ani smluvní SLA.

## Osobní údaje

Vlastník může vyhledat zákazníka či pracovníka a stáhnout strukturovaný technický export. Před předáním jej zkontrolujte: nevyhledává všechny zmínky ve volném textu a může obsahovat údaje souvisejících osob. Nenahrazuje právní posouzení žádosti ani kompletní anonymizaci.

Automatické odstranění starších GPS je výchozím stavem vypnuté. Lze výslovně nastavit 30–3650 dní pro dokončené směny. Časy a odpracované hodiny zůstanou. Již existující zálohy mohou polohy obsahovat až do odstranění archivu. Úplný výmaz osoby napříč volným textem, externími soubory a offline zařízeními se automaticky neprovádí.

## Kontroly vydání a provozní meze

Před vydáním spusťte npm ci, npm run verify:release a npm audit. Verify spustí syntax, jednotkové/regresní testy, sestavení a izolované D1 testy obnovy a plánování. Prohlížečové scénáře jsou v tests/*browser.cjs a potřebují lokální QA adaptér. CI služba ani externí dohled se tím automaticky nezřizují.

Zůstává nutné ověřit skutečný iPhone/Android, provozní objem, náklady a kvóty, dodavatelské podmínky, region a právní dokumentaci před prodejem. Zákaznické servisní tarify nejsou licenční fakturace aplikace. Změna nevytváří platební bránu, SaaS správu firem ani garantovanou dostupnost.

## Role týmu

Vlastník může v Tým přiřadit role Administrátor, Správce, Pracovník a Čtenář. Administrátor má všechna provozní oprávnění správce a navíc smí přidělovat a měnit Správce, Pracovníky a Čtenáře. Správce spravuje jen Pracovníky a Čtenáře. Nikdo si sám nemění roli ani nemění vlastníka. Administrátora přiděluje jen vlastník; role není vázaná na konkrétní e-mail. Výhradní funkce vlastníka zůstávají vyhrazené (například prototyp materiálu a úplné zálohy).

Volitelné serverové TEAM_INITIAL_ADMINISTRATOR_EMAIL připraví pouze jednorázovou pozvánku na účet ChatGPT. Uložení markeru initial-administrator-v1 brání opětovnému udělení role po ruční změně nebo odebrání. Pro nové firmy nechte prázdné nebo nastavte jejich vlastní pozvánku; nepřebírejte e-maily ani konfiguraci jiné firmy.
