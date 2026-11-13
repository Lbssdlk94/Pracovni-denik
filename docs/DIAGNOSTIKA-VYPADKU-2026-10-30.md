# Diagnostika a oprava výpadků Pracovního deníku

Datum: 30. 10. 2026. Větev: `fix/communication-recovery-2026-10-30`.

## Zjištění a míra jistoty

**Potvrzená chyba klienta:** `mapOnline()` odvozoval dostupnost všech přehledů od textu společného synchronizačního indikátoru. Jakmile jedna operace nastavila „Bez spojení“ nebo „Offline“, zákazníci, zakázky, mapy a další části odmítaly začít vlastní čtení, i když síť byla dostupná. Obnova tohoto indikátoru závisela na úspěchu celého `refreshRecords()`.

**Potvrzená návaznost způsobující blokování:** společné obnovení nejdříve synchronizovalo servisní zápisy, protokoly a závady a potom postupně stahovalo fotografie šachet. Teprve po jeho dokončení obnovovalo zahrady a viditelné zakázky/zákazníky. Selhání jednoho uploadu nebo fotografie proto mohlo opakovaně zastavovat i nesouvisející přehledy. U většího množství fotografií tato operace trvala dlouho i při funkční síti.

**Potvrzený nesoulad časových limitů:** každý běžný autorizovaný požadavek připravoval kontext obou firem postupně. Při potřebě obnovení uložené licence mohl dvakrát čekat na Super Admin API, každé volání nejvýše 8 sekund. Samotné čekání na řídicí službu tak mohlo překročit 15sekundový limit klientského GET. V dostupném provozním vzorku bylo 23 událostí, z nichž 18 mělo výsledek `canceled`; požadavky `/api/me` a `/api/jobs` se opakovaně rušily po 10,27–14,96 s při CPU 13–19 ms. Zrušení požadavku samo nedokazuje, která závislost jej v konkrétním okamžiku zdržovala. Blokování na nedostupném licenčním serveru je reprodukované v izolovaném testu.

**Další potvrzená chyba nasazených offline balíčků:** skutečné importy používaly `service-work-ui.js?v=workspace-controls-v1` a `live-protocol-preview.js?v=workspace-roles-v1`, ale Service Worker tyto přesné adresy neukládal. Offline start obou nativních sestavení v testu neotevřel rozhraní. Po doplnění těchto dvou adres stejný test prošel. Čistý GitHub základ má jinou verzi protokolu; zachoval jsem tento rozdíl a ověřil jeho vlastní kompletní graf importů.

## Provedená oprava

- Samostatné přehledy mohou provést požadavek i po chybě jiné části. Stav sítě se neodvozuje z textu synchronizačního indikátoru.
- Ověření identity a oprávnění zůstává před načítáním aktuálních dat. Viditelné přehledy se obnovují před fotografiemi a frontou změn. Fotografie a odesílání běží nezávisle na hlavním obnovení; mají vlastní zámky proti souběžnému spuštění.
- Jedna neúspěšná skupina fronty nevymaže její obsah a neblokuje jinou skupinu. Chyby přihlášení/oprávnění zůstávají důvodem k zastavení, nikoli k obejití ochrany.
- GET/HEAD při síťové chybě, timeoutu nebo HTTP 429/500/502/503/504 provedou nejvýše jedno opakování. Limit zahrnuje i čtení těla odpovědi. Zrušení volajícím, 401/403/404/409 a ostatní nerelevantní chyby se neopakují.
- POST/PUT/PATCH/DELETE se automaticky neopakují transportní vrstvou. Odeslání místní práce řídí původní fronta se zachováním identifikátorů operací, verzí, konfliktních a potvrzovacích pravidel. Fotografie zůstávají v IndexedDB do potvrzení příslušného zápisu.
- Komunikace má jednu obnovovací smyčku s postupným prodlužováním intervalu, nejvýše přibližně minutu. Reaguje také na návrat do aplikace a událost připojení. Neprovádí reload ani mazání místního úložiště. Přechodná chyba při prvním spuštění se obnovuje také, bez nutnosti ručního reloadu.
- Platná podepsaná licence se ověřuje kryptograficky a její obnova může běžet přes `waitUntil` na pozadí. Konfigurace obou firem se čte souběžně. Obnova pro stejnou firmu sdílí jeden běžící požadavek; po selhání má krátkou prodlevu. Nezavádí se prodloužení platnosti ani přístup bez platné licence. Vypršelá či pozastavená licence zůstává neaktivní.
- Service Worker dále necachuje API. Při neodpovídající navigaci nabídne po nejvýše 5 s uloženou HTML schránku. Nové adresy modulů chrání před smícháním staré cache s novým kódem; offline manifest prošel kontrolou přesných importů včetně query verze.
- Přidán read-only `/api/connection-health`: pouze `SELECT 1`, příznak úspěchu a délka databázového round-tripu. Nezobrazuje záznamy, účty, klíče ani názvy tabulek. U Garden jde požadavek přes podepsané společné API.
- API přidává `x-request-id`, serverové časování a bezpečné logy pomalých/selhaných požadavků. Log obsahuje pouze skupinu endpointů, metodu, stav a dobu; nepíše kontakty, těla požadavků, tokeny ani identifikátory provozních záznamů. Klient má posledních 50 obdobně omezených měření v paměti (`communicationDiagnostics()`), bez trvalého ukládání obsahu.

## Živé měření po nasazení

Každou adresu jsem změřil osmkrát přes diagnostický endpoint a nativní Sites bránu, bez přihlášení za některého pracovníka. Všech 16 odpovědí mělo HTTP 200.

| Adresa | Verze | Odezva do hlaviček, medián | Rozsah odezvy | DB round-trip, medián | Rozsah DB |
|---|---:|---:|---:|---:|---:|
| Dr. Závlaha | 106 | 1 273,5 ms | 1 129–1 914 ms | 153 ms | 150–165 ms |
| Dr. Garden | 27 | 1 058,5 ms | 740–2 655 ms | 163 ms | 158–168 ms |

Klientská odezva zahrnuje síť exekutoru, jeho proxy a Sites transport. DB údaj měří čekání Workeru na jednoduchý D1 dotaz, nikoliv čistý CPU čas SQL. Jedná se o měření dostupnosti, nikoli výkonnostní test celého autorizovaného seznamu zakázek nebo telefonu uživatele.

Databáze D1 je dostupná. Ve zkoumaném starším vzorku nebyla odpověď 500/502/503/504 ani výsledek překročení CPU/paměti; byly v něm zrušené požadavky a pět odpovědí 403. Omezený vzorek nevylučuje jiné události mimo jeho rozsah. Aktuální kapacita databáze, obsazenost, denní čerpání a tarifní kvóty nejsou přes dostupné Sites nástroje vystavené. Jejich překročení není prokázanou příčinou těchto výpadků.

## Ověření

Všechny zápisové testy používají oddělené SQLite/Miniflare D1/R2 a syntetické účty/záznamy. Živé zakázky nebyly kvůli testům vytvářeny, upravovány ani mazány; nebyla potřeba datová migrace.

- 281 automatických testů prošlo, 0 chyb. Spouštěno skutečným dynamickým importem všech `tests/*.test.js`, aby nebyla zakryta chyba načtení modulu.
- Nové serverové testy: zablokovaný licenční server nezadrží čtení s platnou podepsanou licencí; sdílení obnovy a prodleva po chybě; vypršení bez neoprávněného prodloužení; nové podepsané pozastavení; nedostupná DB vrací bezpečné 503.
- Nové transportní testy: síťové chyby, timeout těla, 429/500/502/503/504; omezené opakování; žádné automatické opakování zápisu ani autorizační chyby.
- Test obnovovací smyčky: jeden časovač a běžící požadavek, postupné prodlevy, pozastavení a opětovné připojení.
- Nový Chromium test s reálným Worker/D1/R2: záměrně zastavená fotografie nezablokuje zakázky a zákazníky; GET 503 se obnoví; 504 při ověřování nevyřadí ostatní čtení; PUT 502 ponechá původní protokol, fotografii i ID operace přes obnovení stránky; automatické opětovné připojení odešle vše právě jednou. Ověřeno také skutečné uložení Service Workeru, otevření schránky bez spojení a následná obnova. Tento test prošel v GitHub základu i v obou přesných nativních sestaveních.
- Kontrola přesných importů v offline manifestu prošla ve všech třech sestaveních.
- Regresní Chromium test 390/430/1280/1440 px: výběr oboru, sdílený zákazník, více zahrad, správná adresa a město, zavření formuláře bez zápisu, bez vodorovného přetečení a omezení Garden pracovníka.
- Regrese skutečné dvojice Workerů: společná DB, autorizace/přímé odkazy, CAS, idempotence, ochrana proti opakování podepsaného RPC a přenos 25MiB fotografie.
- Regrese offline změny oprávnění: IndexedDB upgrade, atomické odebrání plaintextu, šifrované zachování neodeslaného protokolu/fotografie/formuláře a stabilní povolená ID operací po reloadu.
- Sestavení, kontrola syntaxe a ověření přesného nasazovaného Worker artefaktu prošly pro obě aplikace.

## Nasazení a další postup

- Dr. Závlaha: verze **106**, commit `42bbcaa0fad04cb4f7cfecf8d7ae9aecd6cc0e7d`, deployment `appgdep_6ae4d56b5e4c819192b0e84f2aad62c6`, stav `succeeded`, prostředí revize 14.
- Dr. Garden: verze **27**, commit `f9391349cbdda46201e83b92da4bf857b20662ff`, deployment `appgdep_6ae4d58596c08191a3f8b0b254779495`, stav `succeeded`, prostředí revize 8.
- Adresy, přístupy, společná databáze, role a provozní data zachovány. Nebyly měněny runtime klíče, automatické úlohy ani integrace Disku/e-mailu.
- Již otevřenou aplikaci jednou zavřít a otevřít s internetem; tím se načtou nové verzované moduly a offline schránka. Nemazat data prohlížeče kvůli obnově spojení: mohou obsahovat neodeslanou práci.
- Při dalším incidentu použít čas události, `x-request-id` a nová serverová časování k určení konkrétní pomalé vrstvy. Před případným zvýšením kapacity nejdříve ověřit skutečné kvóty a čerpání u provozovatele Sites. Z těchto měření nevyplývá potřeba přesunu hostingu.

## Omezení ověření

Není k dispozici fyzický iPhone ani Safari; mobil je ověřený v Chromium emulaci. Netestoval jsem přihlášení za skutečného pracovníka ani neprováděl zápisy do skutečných zakázek. Nemám úplnou historickou telemetrii infrastruktury ani tarifní účet Cloudflare/Sites, proto nelze připsat každý minulý zrušený požadavek konkrétní externí službě nebo vyloučit budoucí skutečný síťový výpadek.

Při blokování sítě v tomto Chromium prostředí může `navigator.onLine` zůstat `true`. Test proto ověřuje i pravdivý stav „Server nyní neodpovídá“ místo nesprávné jistoty o odpojeném telefonu. Uložená offline schránka a návrat komunikace přesto prošly.

## Změněné soubory

`web/app.js`, `web/cloud.js`, `web/io.js`, nový `web/connection-recovery.js`, `web/sw.js`, `web/index.html`, `worker/api.js`, `worker/tenant-platform.js`, `worker/workspace-context.js`; nové/rozšířené testy `tests/io.test.js`, `tests/connection-recovery.test.js`, `tests/communication-server.test.js`, `tests/service-worker-cache.test.js`, `scripts/test-communication-browser.mjs`. V nativních instalacích také přegenerovaný `dist/server/index.js` a vlastní přesné adresy offline modulů při zachování původních variant protokolu a firemního označení.
