# SwiftUI a přímé API — 0.8.0 (9)

## Stav a zdroje

Nativní klient je ve větvi `feat/swift-api-client-2026-11-06`, [rozpracovaný PR #4](https://github.com/Lbssdlk94/Pracovni-denik/pull/4). Zachovává schválené rozhraní, pět záložek Přehled / Zakázky / Docházka / Zákazníci / Více, původní bundle ID a doprovodnou SwiftUI aplikaci hodinek.

Poslední úspěšně sestavený zdroj: **`f82cf005e89faade44f29ee4f2b5e38aafcbb7f0`**, [běh 42264874748](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/42264874748). Xcode 27.1 / SDK 27.1: **36 jednotkových + 7 UI testů**, unsigned device build, kontrola skutečného IPA bez webového enginu, Watch device bundle a spuštěné simulátory telefonu i hodinek. Artefakt `13526569071` byl stažen, jeho obsah zkontrolován. IPA SHA-256: `efcb139aa971214fbc5d3c918c694c8d8319027fae05de96cbf23d0c6e14414f`.

**Finální vydání není ověřené.** Navazující commity `cf32f54` a `e8bd416` doplňují nativní potvrzení návštěv předplatného, rychlý odjezd, kontrolu podobného materiálu, zahradní plán se značkami, vazby závad a delší PDF. Mají nové regresní testy a prošly kontrolou syntaxe, ale nemají výsledek z Xcode. [Běh 42267712850](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/42267712850) se vůbec nespustil: „The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings“. Po obnovení Actions je nutné znovu sestavit aktuální větev, opravit případné chyby a teprve poté vydat finální IPA. PR zůstává draft.

## Architektura

- `apps/iphone/NativeAPI`: samostatné SwiftUI obrazovky a formuláře s definicí polí zkompilovanou v aplikaci. Server neposílá HTML, JavaScript ani popis ovládacích prvků z DOM.
- `APITransport`: `URLSession`, pouze důvěryhodné HTTPS `/api/` adresy, explicitní pracovní obor, žádné automatické přesměrování, heslová relace v Keychain odděleně pro každou instalaci.
- `APIStore`: aktuální identita, role, licence, moduly a obor; přímá API volání; pravidelné ověření spojení bez obnovování stránky. Oddělení dat firem nadále vynucuje server, včetně přiřazení konkrétním pracovníkům.
- `APIVault`: AES-GCM, klíč pouze v Keychain; cache, koncepty a fronta podle instalace/účtu/oprávnění. Velké binární soubory jsou šifrované odděleně, nikoli součástí každé JSON aktualizace.
- Stabilní operation/mutation ID, verzování a závislosti fotografií na protokolu. Konflikt nezablokuje nesouvisející zápisy. Úspěšné potvrzení staršího zápisu nesmaže novější koncept. Konflikt vyžaduje vědomou kontrolu, ne tiché přepsání.
- Offline dostupnost vyžaduje povolený modul a nejvýše 24 hodin staré ověření účtu a licence. Změny cen, oprávnění, plateb a správy zůstávají online. Po změně oprávnění se stará šifrovaná data nezpřístupní pod novými právy; ponechávají se pro případ řešení neodeslané práce.
- Server zůstává současným REST backendem a zdrojem pravdy. Není přepsaný do Swiftu; neexistuje druhá provozní databáze.
- `project.yml` používá explicitní whitelist souborů. Starší browserový engine a `.js` zdroje nejsou v targetu. `verify_bundle.py` kontroluje skutečnou release aplikaci včetně absence přímého WebKit linku, JS/HTML a původní konfigurace prohlížeče. UI testy navíc ověřují `app.webViews.count == 0`.

## Nativní pracovní části

| Oblast | Implementace |
| --- | --- |
| Přehled a zakázky | Přehled, aktivní návštěvy, seznam, kalendář, filtry, další stránky, rychlé akce 2 × 2, status, povinný důvod nedokončení, převzetí vlastní přidělené zakázky, přesný příjezd a připravená SMS. |
| Místo a zákazníci | Kompaktní seznam, volání, samostatné kontaktní a adresní údaje, více zahrad, přesné ID vazby zákazník/zahrada/adresa/závada; pozdní odpověď nepřepisuje ruční úpravy. |
| Historie a závady | Společná historie, původní zakázka, protokol, související fotografie; výslovný zápis a řešení závady, přiřazení, odkazy na opravy a historie změn. Dokončení návštěvy závadu samo neuzavírá. |
| Servisní protokol | Skutečné API uložení, rozpracovaný/hotový stav, dobrovolné pracovní údaje, katalogový materiál se zmrazenou cenou, podpis, fotky a nativní PDF s náhledem a sdílením. |
| Zahrada a závlaha | Samostatné servisní zápisy, šachty, původní snímky, přesouvání bodů i popisků, GPS, export kopie fotografie se značkami, plán a vyfukování. Obor Garden nedostává závlahářské části. |
| Materiál | Kategorie, katalog, kódy/varianty, ceny a jednotky, bezpečné odebrání, vědomá kontrola podobných položek. Historické protokoly se nepřepočítávají. |
| Předplatné | Tarify/služby, zmrazené sjednané podmínky, aktivace, změna a prodloužení, platby a stavy, postupné plánování i potvrzení konkrétní návštěvy. Ceny jen oprávněným rolím. |
| Vozidla | Více aut, řidič a jeho vlastní výběr, tankování s původním autorem, účtenky, fotografie auta, spotřeba a termíny v podrobnostech. |
| Docházka a tým | Příchod/odchod a podporované GPS údaje, pracovní dny/detail, opravy; místní účty, role, obory a řidiči podle současných serverových oprávnění. |
| Nastavení a integrace | Firma/fakturace, sazby, předstih připomínek, rezerva plánování, vlastní heslo a relace, soukromí, zálohy, ruční kontrola vazeb, Resend a schvalování výkazu; moduly pouze pro čtení, řídí je Super Admin. |
| Apple Watch a upozornění | Nativní SwiftUI Watch, přímá vazba na aktuální API účet telefonu, vlastní převzetí/status, předání protokolu nebo SMS na iPhone; APNs zachovává současné serverové doručování a předvolby. |

Systémové obrazovky PhotosPicker, fotoaparátu, QuickLook, sdílení, navigace a SMS zůstávají systémové. Google používá `ASWebAuthenticationSession` pouze pro standardní autorizaci poskytovatele, nikoli pro vykreslování deníku nebo jeho pracovní logiky.

## Kompatibilní serverové rozšíření

Nové připojení Googlu potřebovalo samostatný nativní OAuth vstup. Bylo doplněno do existujících `worker/drive.js`, `worker/api.js` a pravidel workspace; build zůstává kompatibilní s webovým OAuth.

Jednorázový grant je vázaný na existující heslovou relaci, origin a vstupní instalaci; v prohlížeči se vymění za jednorázovou OAuth cookie a PKCE. Do autorizačního prohlížeče se nepředává přihlašovací cookie deníku. Callback znovu kontroluje aktuální relaci a oprávnění, vrací pevné schéma `pracovnidenik://drive-callback`; veřejný vstup bez důkazu je odmítnut.

Nasazeno do kanonického API Dr. Závlahy jako **Sites 121**, source `dfdbf0a3bdb11f1a737652d8855dfbf648c0c316`, deployment `appgdep_6aee12f945148191aec0775ec684de60` skončil `succeeded`. Nebyla potřeba migrace DB a provozní záznamy se neupravovaly. Dr. Garden používá již existující společné API; jeho vlastní frontend Sites 41 se kvůli tomuto rozšíření neměnil. Dosavadní omezení integrací oboru Garden se neobchází.

Čtení veřejných `/api/auth/options` na obou doménách vrátilo JSON 200. Nový `/api/drive/native-start` bez grantu vrátil JSON 401. Nejde o ověření přihlášení do skutečného soukromého účtu ani skutečného Google souhlasu.

## Provedené kontroly a hranice

Úspěšné:

- 316 testů `apps/work-diary/npm test`, 0 selhání; izolovaná data a fake služby.
- Samostatné OAuth/Drive kontroly: 11 testů včetně replay, jiného originu, změny role a odvolání relace během odpovědi Googlu.
- Skutečný izolovaný workerd/D1/R2 `test:job-workflow-worker`: idempotentní nedokončení, zachování původního pokusu, přeplánování, adresní ID vazby, uložení a filtry protokolů, serverové role.
- 13 Python testů přípravy simulátorů a 4 testy podepisovacích zásad.
- Výše uvedený úspěšný Xcode běh pro `f82cf00`, včetně skutečně sestaveného IPA, Watch a snímků.
- Kontrola syntaxe aktuálních Swift zdrojů parserem; není náhradou kompilace ani testů v Xcode.

Neúspěšné nebo neověřené:

- Poslední Swift změny a nové testy: Xcode je nespustil kvůli GitHub Billing & plans. Ani úspěšný starší build, ani syntax parser neprokazují, že poslední commit lze sestavit a vydat.
- Starší integrační `test:administrator-worker` stále očekává zákaz katalogu materiálu pro administrátora; skutečná současná politika povoluje čtení katalogu. Tentýž starší scénář dále počítá s osobními přístupovými odkazy, které byly dříve na žádost uživatele zrušeny. Nebyl označen za úspěšný.
- Dříve spuštěný širší `test:subscriptions-worker` skončil u počtu připomínek (4 místo očekávaných 2); používá D1 `meta.changes`, do kterého mohou zasahovat triggery. Výsledek nelze vydávat za úspěšný kompletní test předplatného. Záznam problému je zachován, produkční databáze se kvůli němu neupravovala.
- Nedostupný fyzický iPhone a Watch: skutečný Keychain po distribučním podepsání, fotoaparát, GPS, dlouhé uspání, doručení APNs a chování Watch bez telefonu.
- Google consent na skutečném účtu, skutečné odeslání schváleného e-mailu, velké soubory na fyzickém zařízení a obnova reálné zálohy nebyly provedeny.
- Testy šifrovaného vaultu používají explicitně vložený testovací klíč: unsigned simulátor nemá Keychain entitlements. Produkční klient používá výhradně Keychain, bez nezabezpečeného náhradního ukládání.
- Snímky a UI testy jsou z jednoho izolovaného simulátoru; neprokazují všechny velikosti iPhonu, Dynamic Type a fyzické iOS klávesnice.

## Bezpečný přechod ze staršího IPA

Nejdříve v 0.7 synchronizovat všechny čekající zápisy a uložit koncepty, ověřit firemní heslo. Aktualizovat bez odinstalace se stejným bundle ID a podepisovací identitou. Původní data WebKit/IndexedDB se nemažou, ale bez starého enginu je nelze bezpečně automaticky převést do nového vaultu. Existující neodeslanou starou frontu proto nový klient automaticky nepřevezme. Nové nativní koncepty a fronty mají vlastní šifrované verzované ukládání.

## Snímky posledního úspěšného sestavení

Pouze umělá testovací data; toto jsou skutečné snímky simulátoru `f82cf00`, nikoli makety nebo doklad posledních neověřených doplnění.

- [Přehled](previews/iphone-0.8/prehled.png)
- [Zákazníci](previews/iphone-0.8/zakaznici.png)
- [Více](previews/iphone-0.8/vice.png)
- [Nastavení](previews/iphone-0.8/nastaveni.png)
- [Apple Watch](previews/iphone-0.8/watch-detail.png)
