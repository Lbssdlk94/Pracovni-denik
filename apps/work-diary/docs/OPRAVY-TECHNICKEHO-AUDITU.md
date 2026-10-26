# Výsledek oprav technického auditu – vydání 76 a 77

Zvolený model je samostatná instalace pro každou firmu. Další firmy se nepřidávají jako správci původního týmu. Všechny zapisovací regresní testy používají izolovaná data.

| Nález | Provedená změna | Zbývající mez |
|---|---|---|
| A1 – jediný tým | Generátor čisté instalace, nové ID v sestavení, ověření vazby D1/R2, oddělení offline identity | Každý zákazník potřebuje nový Site/prostředky; společný SaaS není vytvořen |
| A2 – neúplné zálohy | Šifrovaný konzistentní snímek DB + odkazované R2, archiv, ověření, obnova pouze do prázdné instalace, heslová obnovovací sada; sjednocené limity částečného exportu | Externí originály na Google Disku jsou mimo archiv; kvóty/velký objem vyžadují objemový test |
| A3 – vypnutá úloha | Existující úloha znovu zapnuta; skutečný heartbeat, stav záloh a chyby; denní automatické zálohy | Autonomní běh je třeba průběžně sledovat; nejde o externí SLA monitoring |
| A4 – trvalé odkazy | Jednorázové expirované pozvánky, oddělené relace zařízení, serverové odhlášení/revokace, přísnější admin lhůty; 24hodinové ověření offline identity | Staré odkazy mají 90denní přechodné období. Offline soubory na ztraceném telefonu nelze vzdáleně garantovaně vymazat |
| A5 – závislosti | jsPDF 4.2.1 v package-lock, Drizzle tooling a bezpečné verze tranzitivních balíčků | npm audit k datu kontroly uvádí 0 známých zranitelností; není to penetrační test |
| A6 – identitní brána | Postup izolovaného nasazení výslovně vyžaduje Sites nebo odpovídající ověřenou bránu | Přenesení samotného Workeru na libovolný veřejný hosting není bezpečné samostatné přihlašování |
| A7 – provoz | Reprodukovatelný verify:release, stav kontrol a záloh, návod obnovy | CI služba, externí monitoring, zátěž/náklady a smluvní SLA nejsou automaticky zřízeny |
| A8 – hlavičky/mapa | CSP, ochrana rámců, Permissions-Policy, strict-origin-when-cross-origin a sjednocený OSM server | OSM nemá komerční SLA; vhodnost dodavatele pro větší provoz se musí ověřit |
| A9 – osobní údaje | Vlastnický strukturovaný export zákazníka/pracovníka, výslovně nastavitelná retence GPS, žádné automatické mazání ve výchozím nastavení | Volné texty, právní posouzení a úplný výmaz/anonymizace napříč zálohami a zařízeními nejsou automatizované |

## Provedené kontroly

- Jednotkové a regresní scénáře včetně 602 zahrad v jedné záloze, souboru po částech, konzistentního snímku při dalších změnách, chybných klíčů a poškozených/chybějících částí.
- Vytvoření čistého balíčku nové firmy: žádné provozní záznamy, tajemství ani původní projekt; unikátní identita, vlastní databáze a úložiště.
- Izolovaný skutečný workerd/D1 + R2: kompletní archiv, obnova s novým serverovým klíčem a heslovou sadou, přešifrování integračního nastavení, původní ID/soukromé soubory, kontrola cizích klíčů, zákaz obnovy do neprázdné DB.
- Role owner/admin/worker/reader na serveru; jednorázové přijetí i souběžný pokus, expirace, logout, revokace a pozvání dalšího zařízení bez ukončení předchozí relace.
- Izolované D1 plánování: souběžné úpravy, verzování, individuální předání a historie, idempotence, rozdíl plánu práce a příjezdu, oprávnění.
- Chromium: nastavení firmy a skutečné uložení, stažení archivu a obnovovací sady, strukturovaný export, pozvánka a odvolání přístupu; 360/390/430/1280/1440 px bez vodorovného přetečení a hlavní dotyky alespoň 44 px.
- Chromium i Linux WebKit: vícestránkové PDF s češtinou a soukromou fotografií, opakování po chybě sítě, offline PDF/synchronizace a mobilní nastavení. WebKit navíc stažení archivu/sady/exportu.
- Regrese pracovního přehledu: nedokončená práce s povinným důvodem pod aktivním plánem, stabilita po obnově, přeplánování a historie pokusu, otevřené závady, rozlišení zahrad, skutečné stavy protokolů a jejich filtr.

Fyzický iPhone/macOS Safari ani Android nejsou k dispozici. Osobní přihlášení v Linux WebKitu přes lokální HTTP není označeno za ověřené: emulace nepřijímá produkční Secure cookie. Tok prošel v Chromiu a serverových testech, ale vyžaduje reálnou HTTPS kontrolu na telefonu. Produkční data se kvůli testování nepřepisovala ani neobnovovala.

Podrobný postup používání a omezení: [PROVOZ-A-SAMOSTATNE-FIRMY.md](PROVOZ-A-SAMOSTATNE-FIRMY.md).

Doplněk 77: po prvním provozním běhu zvětšeny souborové dávky na 8 MB a rozpočet kontrolního běhu na 30 sekund. Obnova ověřuje již existující soubory po rozsazích, aby nedržela další plnou kopii v paměti. Formát archivu zůstává kompatibilní, včetně rozpracovaných 1MB částí.
