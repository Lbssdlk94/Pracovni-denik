# Jedno datum v deníku realizace

Odstraněn duplicitní minikalendář s číslem dne a měsícem. Jeho pevná šířka a nezalamovaný měsíc na iPhonu přetékaly do sousedního textu. Každá skupina nyní obsahuje jediný sémantický `<time>` v nadpisu, např. „Dnes · Neděle 15. listopadu 2026“. Pod ním zůstává pouze počet zápisů. Datum se přirozeně zalamuje podle dostupné šířky.

Ověřeno v existujícím izolovaném browser testu sestaveného Workeru/D1/R2/IndexedDB: jedno datum ve skupině, odstraněný rámeček, počet zápisů nepřekrývá nadpis a nadpis nepřetéká při 360/390/430/1440 CSS px. Prošly také dosavadní kontroly klávesnice, ukládání/fotografií, offline obnovy, 502, právě jednoho odeslání a porovnání konfliktů. Prošla syntaxe modulu, kontrola offline URL a validace obou firemních sestavení. Fyzický iPhone/Safari není dostupný; prohlížečová kontrola používá Chromium.

Bez databázových nebo backendových změn. Standardní balíček Dr. Závlahy obsahuje kořenové migrace. Pro prezentační vydání Dr. Garden byla opět ověřena shoda sestaveného backendu mimo vložený objekt ASSETS; zmrazená lokální databáze a její migrační historie se nemění (stejný postup jako při opravě klávesnice).

Náhled: `/workspace/artifacts/job-diary-single-date-2026-11-15/mobile-390.png`.

Nasazeno úspěšně: Dr. Závlaha verze 134 (zdroj `9583456c642128b3897a38ea90ab944cf9f2cd6d`, nasazení `appgdep_6afa2203e2d4819195d4fd257711be21`); Dr. Garden verze 54 (zdroj `9e2bcbfcc1033da04b2b02fbcc7f9f143e9a62ca`, nasazení `appgdep_6afa2219d660819187d45c794800151f`). GitHub: [PR #17](https://github.com/Lbssdlk94/Pracovni-denik/pull/17).
