# Kalendář zakázek

V části **Zakázky → Kalendář** jsou návštěvy seskupené podle dne a seřazené
od nejčasnější. Kalendář začíná pondělím. Datum „Dnes“ se vždy určuje podle
českého časového pásma, i když má zařízení nastavené jiné pásmo.

- Šipkami či výběrem měsíce změníte měsíc. Klepnutím na den omezíte rozpis.
- **Celý měsíc** zruší výběr konkrétního dne. **Dnes** otevře dnešní návštěvy.
- **Bez termínu** zobrazí nenaplánované zakázky. V celém měsíci jsou na konci.
- Návštěvy s datem, ale bez času, jsou až za návštěvami s určeným časem.
- **Seznam** zobrazí všechny dny bez omezení měsícem, stále podle data a času.
- Stávající filtry stavu, kolegy a hledání platí i v kalendáři. Počet u dne
  odpovídá všem zakázkám ve výběru, včetně dalších stránek seznamu.

Vlastník nebo správce zadává datum a nepovinné **Čas od / Čas do** při vytváření
či úpravě zakázky. Lze zadat jen počáteční čas. Koncový čas musí být pozdější
v témže dni. Časy se ukládají jako místní český čas, bez převodu podle pásma
telefonu. Změna termínu pošle kolegovi stejné upozornění jako jiné změny zadání.

Pracovník uvidí pouze své zakázky a jejich počty. Vlastník a správce vidí všechny.
Soukromé údaje ani kalendář se neukládají do offline úložiště.

Migrace 0017 přidává časová pole a převezme jednoznačné intervaly ze starších
importovaných názvů ve formátu `08:15–10:00 · Název`. Zachovává původní texty,
kontakty, přiřazení i ID zakázek a nevytváří nové zakázky. Nejednoznačné časy
nedoplňuje. Další importy mohou rovnou předat `startTime` a `endTime` v `HH:MM`.
