# Upozornění a push oznámení

## Použití na iPhonu

1. Použijte iOS 16.4 nebo novější. V Safari otevřete aplikaci, zvolte **Sdílet → Přidat na plochu** a potom aplikaci spusťte její ikonou na ploše.
2. Přihlaste se svým účtem nebo osobním odkazem od správce.
3. Klepněte na **zvoneček vpravo nahoře → Nastavení oznámení → Zapnout oznámení**. Potvrďte systémovou žádost telefonu. Povolení se nevyžaduje automaticky.
4. Volitelně vypněte push zprávy o zakázkách nebo docházce a uložte výběr. Tento výběr platí pro váš účet na všech zařízeních. Historie v centru zůstává.
5. Klepněte na **Poslat zkušební oznámení**. Pro zkoušku zavřete aplikaci a nechte správce přiřadit novou zakázku. Otevření oznámení vás přenese do centra. Konkrétní zakázku otevřete tlačítkem u zprávy.
6. Když je povolení zamítnuté, změňte je v systémovém nastavení oznámení. Zkontrolujte i režim Soustředění, připojení k internetu a případná omezení telefonu.

Centrum funguje i bez push oprávnění a v podporovaných prohlížečích na počítači. Nové události se obnovují při návratu do aplikace, přijetí push zprávy a při běžné synchronizaci přibližně každých 20 sekund. Bez internetu se soukromý obsah centra nezobrazuje.

## Události

- Přiřazený kolega: nová zakázka, změna zadání, přiřazení nebo stavu od jiného uživatele.
- Vlastník a správci: změna stavu zakázky; nová žádost o opravu nebo smazání docházky.
- Pracovník: schválení nebo zamítnutí jeho žádosti o změnu docházky.
- Vlastní provedená změna se jejímu autorovi znovu neposílá.

Na zamčené obrazovce je pouze obecné upozornění. Jména, adresy, důvody oprav a GPS se do push zpráv nevkládají. Centrum znovu ověřuje aktuální členství, roli i přiřazení zakázky. Po přeřazení zakázky nebo odebrání role už staré zprávy nezpřístupňují její obsah. GPS docházky zůstává pouze ve správcovském detailu docházky.

V **Nastavení → Funkce týmu → Upozornění** může vlastník nebo správce funkci vypnout celému týmu. Push odběr si každý člen zapíná sám na každém zařízení. **Vypnout v zařízení** odstraní odběr pouze z daného telefonu; odhlášení jej také odstraní. Pokud přepnete účet osobním odkazem, odběr se automaticky nepřevede; nový uživatel jej musí výslovně zapnout.

## Provoz a ověření

Hosting má nastavené serverové VAPID klíče `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` a HTTPS `PUBLIC_APP_URL`. Soukromý klíč je runtime secret, nevyskytuje se ve frontendovém kódu, zálohách nebo repozitáři. Zachovejte jej při dalších nasazeních. Oficiální Web Push nevyžaduje Apple Developer účet ani certifikát APNs.

Implementace používá Worker Web Crypto: P-256 ECDH, HKDF-SHA256, AES-128-GCM podle RFC 8291 a VAPID ES256 podle RFC 8292. Povolené HTTPS cíle jsou Apple, FCM, Mozilla a Windows Push; přesměrování se nepovolují. Privátní endpoint a klientské klíče jsou jen v neveřejné databázi a nejsou součástí exportu aplikace.

D1 triggery vytvářejí upozornění ve stejné transakci jako změnu zakázky/docházky. Jedinečný klíč události a příjemce brání duplicitám při opakování požadavku. `push_deliveries` má trvalou frontu, atomické zamykání a opakování dočasných chyb (nejvýše 5 pokusů během 24 hodin). Odesílá se bezprostředně na pozadí změny; čekající pokusy znovu zpracovávají běžné požadavky aplikace. Samostatný časovač není nasazen, takže při úplném výpadku a následně nulovém provozu se další pokus provede až při příštím použití aplikace. Centrum upozornění je trvalým zdrojem zpráv. Koncové služby a telefon doručení nezaručují. Slučování viditelných upozornění na telefonu zajišťuje pole `tag` v service workeru. Volitelná HTTP hlavička `Topic` se neposílá, aby její validace u Apple neblokovala doručení chybou `BadWebPushTopic`. Odpovědi 404/410 odstraní neplatný odběr.

Automatické testy: soukromí, aktuální přiřazení a role, potvrzené/zamítnuté opravy, opakované požadavky, přečtení, preference, souběžné doručení, opakování při chybě, zánik odběru, nezávislé rozšifrování aes128gcm a ověření podpisu JWT. Mobilní browser test pokrývá centrum, navigaci, zvoneček v detailu, nepřečtené zprávy a offline ochranu. Skutečné systémové povolení a doručení přes Apple je nutné dokončit na iPhonu podle kroků nahoře.

Oficiální dokumentace: [WebKit: Web Push na iOS a iPadOS](https://webkit.org/blog/13878/), [Apple: Sending web push notifications](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291.html), [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292.html).
