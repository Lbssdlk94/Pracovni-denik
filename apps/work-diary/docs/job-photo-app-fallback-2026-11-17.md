# Fotodokumentace bez Google Disku a mobilní detail zakázky

## Chování

- Bez použitelného připojení Google Disku se nové fotografie ukládají do existujícího soukromého úložiště aplikace (`service_photos` + R2). Připojený Disk zachovává dosavadní způsob nahrávání. Staré soubory se nikam automaticky nepřesouvají.
- Kategorie Před/Montáž/Hotovo a poznámky jsou samostatná metadata galerie. Původní soubor lze použít i v protokolu nebo deníku realizace bez další kopie originálu. Galerie nezobrazí všechny staré fotografie protokolů bez výslovného zařazení.
- Nová migrace 0055 přidává volitelné galerijní údaje a účel nahrávání. Rozlišuje centrální oprávnění fotodokumentace a fotografií protokolu i v databázových ochranných pravidlech. Nemění žádnou starší migraci ani provozní zakázku.
- Originály i náhledy jsou přístupné pouze přes autorizované API, podle oboru a současného přiřazení zakázky. Nezveřejňují se R2 klíče. Opakované nahrání stejného ID a obsahu nevytvoří další originál, změna poznámky má kontrolu verze. Odebrání z galerie ponechá originál kvůli protokolům a historii. Úplná záloha zahrnuje i privátní náhledy.
- Kontakt je pod adresou; tlačítko Fotodokumentace je na mobilu vedle Změnit stav, pod Jsem na cestě. Otevře vlastní část se zpětným tlačítkem. Deník realizace zůstává samostatný.
- Tlačítka mají viditelnou odezvu dotyku a práce se zakázkou také stav načítání. Změna stavu otevřená z detailu po uložení nebo zrušení obnoví stejný detail. Z karty zůstává dosavadní postup.
- Mobilní hledání je schované pod lupou vedle plus. Aktivní hledání označuje odznak; skrytí vyhledávání neruší dotaz. Desktop ponechává vyhledávací pole.

## Ověření

- `npm test`: 80 testovacích souborů, bez selhání.
- `npm run check`; oba skutečné artefakty prošly `npm run build` včetně kontrol izolovaného D1 a instalace.
- `tests/job-photo-app.test.js`: skutečné API, originály, kategorie, idempotence, konfliktní poznámky, soukromé čtení, oddělení zakázek, vypnuté moduly, zákaz nahrávání, opětovné přiřazení a uchování originálu po odebrání z galerie.
- `tests/workspace-policy.test.js`: Garden nepřevezme připojení Google Disku Závlahy; smí používat vlastní autorizovanou galerii v aplikaci. Původní zákaz Google uploadu z Garden zůstává.
- `scripts/test-job-photo-app-browser.mjs`: skutečný sestavený Worker + D1 + R2 + prohlížeč, izolovaná testovací data. Nahrání obrázku a náhledu při vypnutém Disku i fotografiích protokolu; kategorie/poznámka/obnovení; jeden originál; umístění kontaktu/tlačítek; vlastní galerie a návrat; uložená změna stavu, zrušení i Hotovo vracejí detail; lupa a aktivní dotaz; 360/390/430/1440 px bez vodorovného přetečení.
- `scripts/test-job-diary-browser.mjs`: opět prošel deník včetně povinných fotografií, offline zápisu a obnovení po 502 bez duplicit, oddělení záložek, zachování textu při zavření a emulovaném otevření klávesnice.
- Stejný nový galerijní test prošel i proti výslednému artefaktu Dr. Závlahy. Provozní záznamy nebyly při kontrolách měněny.

## Nasazení a omezení

Kanonické API a databázová migrace jsou v Dr. Závlaze. Dr. Garden používá sdílené API; jeho lokální databáze zůstává zmrazená. Jeho aktualizace obsahuje pouze frontend a statické soubory; sestavený server mimo vložená statická aktiva byl ověřen jako bajtově nezměněný. Nepouštět starší lokální migrace do zmrazené Garden databáze.

Úložiště aplikace přijímá jeden originál do 25 MiB, Drive zachovává původních 100 MiB. Nová hlavní galerie vyžaduje síť a výběr dosud neodeslaných souborů nepřežije zavření stránky; rozpracované offline zápisy a fotografie deníku/protokolů mají původní mechanismus. Skutečný iPhone, systémová klávesnice a Safari nebyly v tomto běhu dostupné; mobilní kontroly proběhly v Chromium a geometrické emulaci klávesnice. Větev dokončení předplatného přes protokol má návratový callback, ale nebyla samostatně ověřena klikáním tohoto konkrétního scénáře. Tato změna neaktualizuje nativní IPA.
