# Přihlášení bez osobních odkazů

Osobní přístupové odkazy jsou trvale vypnuté v rozhraní a na serveru. Zamítnuté jsou náhled a výměna tokenu, vytváření a obnova odkazů, pozvání dalšího zařízení i původní propojení hostingové identity přes osobní odkaz. Dříve vydané linkové relace a historické tokenové cookies nelze použít. Heslové relace, ID členů, přiřazení zakázek a stávající vazby zůstávají zachované. Historické tokeny v databázi nejsou přijímány jako přihlášení.

Přihlášení jménem a heslem funguje dál; obnovení zapomenutého hesla zůstává vyhrazené administrátorovi. Samostatné přihlášení účtem ChatGPT respektuje dosavadní nastavení firmy a nebylo tímto požadavkem vypnuté. Veřejné možnosti přihlášení vracejí `linkAllowed: false`. Nastavení přechodového režimu nemůže odkazy znovu povolit.

Starý `#access` odkaz se odstraní z adresního řádku a zobrazí formulář jména a hesla se srozumitelnou zprávou. Token se neodesílá na server. Obnovení offline přístupu ze staré linkové relace se zamítne bez smazání místní fronty. Uživatel se přihlásí heslem ke stejnému účtu, aby mohl zachovat a synchronizovat svou práci.

Ověření: 313 regresních testů prošlo; cílené testy ověřily zákaz generování a výměny starých odkazů, odmítnutí historických cookies, identitu a oprávnění heslového účtu a odhlášení jednotlivých zařízení. Chromium na šířkách 390, 430 a 1440 ověřil formuláře, nepřítomnost odkazových akcí, skutečné přihlášení heslem a zachování místního neodeslaného zápisu při zamítnutí staré offline relace. Skutečný iPhone/Safari nebyl k dispozici. Databázová migrace ani změna provozních záznamů nebyla potřeba.
