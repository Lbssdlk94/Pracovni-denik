# Mobilní ovládání zakázek

Na mobilu se první otevření zakázek zobrazí jako denní rozpis. Kalendář, mapa (pouze pro správce/vlastníka) a seznam zůstávají dostupné. Vybraný pohled se pamatuje pro konkrétní účet a mobilní nebo počítačové zobrazení; filtry a den se při zavření detailu nemění.

- **Filtry:** stav, druh a technik jsou na telefonu rozbalovací. Číslo počítá tyto aktivní filtry. Vymazání zachová samostatně zadané hledání. Moje/Celý tým sdílí filtr přiřazení; běžný pracovník vidí pouze svoje zakázky.
- **Dnes/Zítra:** přepnou na příslušný den. Prázdný den nabídne nejvýše pět nejbližších dalších nedokončených návštěv odpovídajících hledání, druhu a přiřazení. Jde o tentýž autorizovaný seznam zakázek, nikoli druhou evidenci.
- **Karta:** zákazník, práce, čas, technik, stav a krátká adresa. Ovládací tlačítka nevyvolávají otevření celé karty. Zkrácení adresy je pouze zobrazení; původní údaje a navigační adresa se nemění.
- **Detail:** společná posouváním zachovaná lišta pro upozornění a zavření. ID a datum založení jsou v doplňujících údajích, smazání v samostatné části. Rychlé odkazy vedou na servisní protokol a fotodokumentaci. Správce může z nepřipojeného Disku přejít do jeho nastavení.
- **Účet a synchronizace:** odhlášení je na mobilu v nabídce Více. Klepnutím na stav v hlavičce zobrazíte aktuální informace o synchronizaci.

## Ověření

Automatizovaný scénář `tests/mobile-workspace-browser.cjs` používá pouze čerstvou místní databázi a syntetické zakázky. Kontroluje mobilní šířky 360/390/430 px a desktop 1440 px, oprávnění, denní fallback, zákaznické hledání, filtry, rozměry dotykových cílů, překrývání, vnořená upozornění, zavření po posunutí, návrat do seznamu, změnu výšky viditelného prostoru, servisní formulář, galerii a zapamatování pohledu. Stávající scénáře pro servisní protokol/PDF/offline a Google Disk používají lokální nebo simulované služby.

Skutečný iPhone, systémová klávesnice, Apple Mapy ani skutečný Google consent screen se v místních testech neovládají. Menší viditelný prostor při klávesnici je simulován; CSS reaguje také na skutečné události `visualViewport`. Bezpečné okraje používají `env(safe-area-inset-*)`. Konečná kontrola fyzického telefonu má potvrdit zavření detailu po posunutí, psaní v protokolu a návrat z Map.

## Náhledy

`web/mobile-preview-overview.png` a `web/mobile-preview-detail.png` jsou snímky mobilního zobrazení se syntetickými údaji z testovací databáze. Neobsahují skutečné zákazníky ani zakázky.
