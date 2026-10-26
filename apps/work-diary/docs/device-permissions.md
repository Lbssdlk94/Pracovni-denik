# Oprávnění při prvním spuštění

Po prvním přihlášení daného uživatele v zařízení se zobrazí karta **Nastavte si toto zařízení** s volbami **Povolit polohu**, **Povolit upozornění**, **Teď ne** a **Hotovo**. Nejde o další přihlášení. Aplikace samotným otevřením nevyvolá systémové dialogy; každý se spustí až po klepnutí na odpovídající tlačítko.

GPS v tomto kroku slouží pouze k vyžádání oprávnění. Vrácené souřadnice se neukládají ani neodesílají. Běžné akce docházky a polohy šachet fungují dále dosavadním způsobem. Při zamítnutí se ukáže návod k povolení v systému, při nedostupnosti či vypršení času lze krok opakovat.

Upozornění používají existující Web Push registraci a backendové přiřazení k přihlášenému účtu. Klíč a registrace se připraví předem; přihlášení k push službě začíná přímo v obsluze klepnutí, jak vyžaduje iOS. Nabídka respektuje vypnuté funkce týmu a stav prohlížeče. Na iPhonu mimo aplikaci přidanou na plochu vysvětlí **Safari → Sdílet → Přidat na plochu** (iOS 16.4+); upozornění lze potom zapnout z aplikace na ploše. Nemůže obejít systémové zamítnutí oprávnění. Neprovádí automatické odeslání zkušební push zprávy.

**Teď ne** a **Hotovo** uloží dokončení nabídky pouze pro aktuální účet v tomto prohlížeči. Bez dostupného úložiště platí do konce otevření aplikace. V **Nastavení → Oprávnění zařízení → Nastavit oprávnění zařízení** lze nabídku kdykoliv znovu otevřít. Je to osobní nastavení i pro pracovníky; neodhaluje firemní konfiguraci.

Browser test `tests/device-permissions-browser.cjs` simuluje systémové API a výslovnou aktivaci klepnutím. S `QA_DEVICE_SETUP=1` v místním testovacím serveru používá dočasné testovací VAPID klíče a ověřuje registraci ve skutečném backendu; případný odchozí testovací push je zachycen lokálně, nikam se neposílá. Ověřuje, že první otevření nic samo nevyžádá, souřadnice neopustí zařízení, odložení se pamatuje, další účet má vlastní nabídku a iPhone dostane návod pro instalaci. Doručení skutečné push zprávy je třeba ověřit v aplikaci na ploše fyzického telefonu, nikoliv v emulaci.
