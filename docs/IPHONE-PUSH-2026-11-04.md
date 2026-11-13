# Nativní APNs – Pracovní deník 0.4.0 (4)

## Stav

Podpora APNs je implementovaná v iPhone klientu i ve společném backendu. **Doručování do skutečného telefonu zatím není aktivované ani ověřené:** na hostingu nejsou nastavené Apple APNs klíče, není k dispozici podepsaná aplikace s odpovídajícím provisioning profilem ani fyzický iPhone. Nepodepsané IPA samo push neumožní.

Nové části používají stávající centrum oznámení, preference a frontu doručení. Žádné další zakázky, zákazníci ani druhá evidence upozornění nevznikají. Zachované jsou role, obory, přiřazení, licence i centrální přepínač Upozornění. Stávající webový push zůstává samostatným kompatibilním transportem.

## Co je připravené

- `NativePushController.swift`: systémové oprávnění až po výslovném zapnutí, registrace APNs tokenu, aktualizace při spuštění/návratu, vypnutí, zkušební zpráva, preference zakázek/vozidel a docházky. APNs token se neukládá do UserDefaults; systém se registruje znovu. Uložená je pouze uživatelská volba zapnutí a samostatný neprůhledný identifikátor odběru pro bezpečné odhlášení.
- `PushAppDelegate`: příjem tokenu, rozlišení chyby chybějícího podpisu, oznámení za běhu a reakce na klepnutí. Push nemá libovolné URL ani zakázkové identifikátory. Klepnutí otevírá pouze centrum s opětovným ověřením přístupu. Otevřený formulář se nezahazuje; uživatel ho musí nejprve uložit/zavřít.
- `NativePushSettings.swift`: **Více → Push upozornění v iPhonu**, případně **zvonek → Nastavení oznámení → Otevřít nastavení oznámení iPhonu**. Chybějící konfigurace se nezobrazuje jako funkční odběr.
- `Resources/PracovniDenik.entitlements`, `project.yml`: Push Notifications, oddělení development/production a verze 0.4.0 (4). Manifest soukromí doplněn o identifikátor zařízení a vlastní nastavení UserDefaults.
- `worker/apns.js`: ES256 provider JWT z runtime .p8 klíče, sdílení téhož JWT při souběžném doručování a obnova nejpozději po 40 minutách; pevné Apple sandbox/production HTTPS cíle, zakázané přesměrování a timeout. Žádný klientem dodaný cizí endpoint.
- `worker/notifications.js`: odběr patří serverem ověřenému účtu; kontrola Bundle ID a prostředí; opakovatelné přihlášení, odhlášení, bezpečné převedení sdíleného telefonu na nový přihlášený účet a omezení četnosti zkušebních zpráv. API nevrací soukromý token ani Apple klíče.
- Doručování používá stávající `push_deliveries` s atomickými leases, deduplikací a nejvýše pěti pokusy během 24 hodin. Před výběrem každé dávky se ověřují aktuální oprávnění, přiřazení, obor, licence a preference. Neplatný APNs token se odstraní. Chyba jednoho zařízení nesmí zablokovat ostatní doručení ani uložení zakázky.
- Při běžném odhlášení a přepnutí účtu se odběr odstraní před zánikem přihlášení; čeká se i na právě probíhající registraci. Při změně přístupu se nativní zobrazení zneplatní. Po úplné obnově databáze se nativní odběry odstraní a zařízení se musí přihlásit znovu.

Zamčený displej zobrazuje jen „Pracovní deník – Máte nové upozornění. Otevřete aplikaci.“ Bez jména zákazníka, adresy, GPS, zadání nebo identifikátoru zakázky. Skutečný obsah je až v autorizovaném centru.

## Co je potřeba pro aktivaci

1. Apple Developer členství, explicitní App ID **`cz.pracovnidenik.app`** a zapnutá capability **Push Notifications**. Jiné Bundle ID vyžaduje odpovídající změnu projektu, ověření podepisování a serverové konfigurace; nepřepisujte je pouze při instalaci IPA.
2. Apple APNs autentizační klíč `.p8`, jeho Key ID a Apple Team ID. Klíč musí mít oprávnění pro použitý bundle a prostředí. Klíč, heslo k Apple účtu ani soukromý certifikát neposílejte do chatu či repozitáře.
3. V bezpečném nastavení runtime hostingu společného API nastavit:

   | Název | Obsah |
   | --- | --- |
   | `APNS_TEAM_ID` | Desetimístné Apple Team ID |
   | `APNS_KEY_ID` | Desetimístné ID APNs klíče |
   | `APNS_BUNDLE_ID` | `cz.pracovnidenik.app` |
   | `APNS_PRIVATE_KEY` | **Secret**: celý PEM obsah `.p8` včetně původních řádků |

   Ve sdílené instalaci Dr. Závlaha / Dr. Garden se API odběrů a doručování provádí v kanonické instalaci Dr. Závlahy. Do Super Adminu ani do firemního JavaScriptu se Apple klíč neposílá. Do budoucích samostatných instalací se tajné klíče nekopírují v čistém balíčku.
4. Vytvořit Apple podpisový certifikát a provisioning profil pro uvedené App ID s Push Notifications. Vývojové zařízení musí být zahrnuté v development/ad-hoc profilu. Běžné podepsání přes bezplatný osobní profil nebo nástroj, který entitlement odstraní či změní Bundle ID, push nezprovozní.
5. Pro připravené volitelné podepsání přes GitHub uložit do **Actions secrets**:

   - `APPLE_CERTIFICATE_P12_BASE64`: vlastní export certifikátu se soukromým klíčem `.p12`, v base64.
   - `APPLE_CERTIFICATE_PASSWORD`: neprázdné heslo exportu `.p12`.
   - `APPLE_PROFILE_BASE64`: provisioning profil `.mobileprovision` v base64.

   `.p8` patří pouze serveru, nikoli do těchto tří distribučních secrets. Podpisový profil/certifikát se v jobu ukládá jen do dočasného runneru a keychainu a po použití se odstraní. Nejsou součástí logového artefaktu.
6. Spustit aktualizovaný workflow **iPhone build and IPA** ručně s `sign_ipa=true`. Po zařazení workflow do výchozí větve je volba přímo v Run workflow; předtím je nutné spustit podporovanou větev pomocí workflow_dispatch. Běžný push dál sestavuje nepodepsaný balíček bez vyžadování Apple údajů.
7. Podepsaný krok ověří Bundle ID, platnost profilu a APNs prostředí, odvodí export typu debugging / release-testing / app-store-connect a po exportu ověří podpis a entitlement. **Neprovádí upload do App Store ani TestFlightu.** Výstup je `PracovniDenik-SIGNED.ipa`; samotný nepodepsaný artefakt není důkaz funkčního APNs.
8. Nainstalovat odpovídajícím způsobem na skutečný iPhone, přihlásit se, otevřít nastavení push, zapnout a poslat zkoušku. „APNs přijalo“ znamená potvrzení serverem Apple, nikoli potvrzené zobrazení telefonem. Ověřit také se zamčeným displejem, režimy Soustředění, zákazem oprávnění, přepnutím účtu a přeřazením zakázky.

## Databáze a kompatibilita

Aditivní migrace `0050_native_push_transport.sql` přidává typ transportu a nullable nativní údaje do `push_subscriptions` a bezpečnou diagnostiku do `push_deliveries`. Starší webové odběry dostanou konstantní výchozí transport `web`; jejich endpointy ani šifrovací klíče se nepřepisují. Žádný provozní obchodní záznam se nepřevádí ani nemaže. Původní migrační SQL a záznamy historie zůstávají zachované, včetně samostatné konsolidované historie Dr. Garden.

Registrace zařízení je trvalý soukromý serverový záznam a vyžaduje internet. Nevstupuje do offline obchodní fronty. Připomínky se generují stávajícími mechanismy; touto změnou se nepřidávají naplánované úlohy ani nezapíná dříve vypnutá automatika Dr. Garden. První odeslání běží na pozadí serverové změny i se zavřenou aplikací. Opakování po výpadku využívá současné serverové běhy a provoz; při nulovém provozu není samostatný trvalý retry worker. Apple ani telefon nezaručují každé doručení; centrum je zdrojem historie.

## Ověření

- 293 unit testů společné aplikace bez chyby, včetně šesti nových APNs scénářů: nezávislé ověření JWT, souběžné sdílení provider tokenu, privátní a idempotentní registrace, zákaz cizího účtu a Bundle ID, společná fronta, preference, atomické claims, rebind telefonu, přeřazení/smazání zakázky, retry, zánik tokenu a chybějící konfigurace.
- Skutečný workerd s generovaným testovacím klíčem a mockem Apple ověřil Web Crypto podpis, přesný cíl a hlavičky, obecný payload, 200/429/400 a zákaz přesměrování. **Tento test nepotvrzuje živé HTTP/2 spojení s APNs ani doručení na zařízení.**
- Chromium + skutečný lokální Worker/D1/R2: nativní přechod do nastavení oznámení, pravdivý stav bez klíčů a odhlášení; současně zachované uložení zákazníka/zahrady, protokolu, podpisu, fotky, PDF, značek, mapy a offline synchronizace bez duplicit. Zkoušky prošly ve variantách Dr. Závlaha i Dr. Garden.
- Dva Python testy podpisové politiky odmítají chybějící entitlement, cizí App ID, propadlý profil a nesoulad development/production. Skutečné podepisování s Apple certifikátem nemohlo proběhnout bez secrets.
- [GitHub Actions 41838395861](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/41838395861): **17 unit + 6 UI = 23 iOS testů bez chyby**, dva Python testy podpisové politiky a úspěšné sestavení pro simulátor i zařízení (Xcode 26.0.1). Podepsaný krok byl správně přeskočen bez ruční aktivace a Apple secrets.

Žádné testy neposílaly zprávy skutečným uživatelům ani neměnily provozní zakázky. Neověřená zůstává skutečná Apple konfigurace, podepsaný build, fyzický iPhone a doručení přes APNs/hostovaný HTTP/2. Lokální workerd sám HTTP/2 APNs nepokrývá; je nutná živá zkouška nasazeného hostingu po bezpečném nastavení Apple údajů.

Oficiální zdroje: [Apple – připojení k APNs](https://developer.apple.com/documentation/usernotifications/establishing-a-connection-to-apns), [Apple – požadavky na odesílání](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns), [Apple – aps-environment](https://developer.apple.com/documentation/bundleresources/entitlements/aps-environment), [Cloudflare workerd – místní HTTP/2 omezení oproti produkčnímu proxy stacku](https://github.com/cloudflare/workerd/issues/4841).

## Vydání a nasazení

Ověřený iOS aplikační commit: `ca4d8b6dcff4cda334b896108389da2a9aea71f6`, větev `feat/iphone-native-push-2026-11-04`.
GitHub artefakt `13328465402`, expirace 18. 11. 2026. Nepodepsané IPA má 595 906 bytů a SHA256 `ef795453137a013c9d41b8a070744295fff50473949f09751b2f4c89a5004ee4`. Souhlasí s přiloženým SHA256; Info.plist potvrzuje 0.4.0 (4), iOS 17+ a výchozí production režim.

Podpora serveru a schema-only migrace byly nasazené:

- Dr. Závlaha **111**, commit `3a0f2bcb4ea6dc77ae6f6d22f6c5910a56831fae`, deployment `appgdep_6aeb361b58ec8191913eead2582a192a`, succeeded, https://zavlahovy-denik.purplecedar.chatgpt.site.
- Dr. Garden **32**, commit `7d54d716bbdb3c53cbc600d4acb81a9916d1b6a0`, deployment `appgdep_6aeb3632dda08191ab0abbee03ae169e`, succeeded, https://dr-garden.purplecedar.chatgpt.site.

Zachované publikum obou instalací, runtime revision 14/8 a dosavadní klíče. Apple secrets nepřidány, žádné skutečné push zprávy neodeslány. Poslední oprava cache JWT byla zvlášť ověřena souběžnými voláními a skutečným workerd s mockem APNs. Zkoušky modelu a ukládání nepoužívaly provozní data.
