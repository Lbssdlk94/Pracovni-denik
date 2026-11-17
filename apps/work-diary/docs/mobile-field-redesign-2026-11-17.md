# Mobilní rozhraní pro práci v terénu

## Rozsah a společné komponenty

Implementace vychází z písemného zadání a jeho barevných tokenů. Referenční Claude artefakt nebyl použit jako ověřený zdroj. Web/PWA zachovává existující model, API, oprávnění a synchronizaci.

Nový prezentační modul `web/field-components.js` obsahuje `StatusBadge`, `AvatarStack`, `StickyActionBar`, `OfflineBadge`, `VisitCard`, `Accordion` a zobrazení času. Používá existující sadu outline ikon a původní obsluhy akcí. `web/design-tokens.css` obsahuje požadované barevné tokeny, rádiusy a místní proměnné písmo Inter. Font s licencí je součástí aplikace i offline cache; jeho načtení není závislé na Google Fonts.

## Detail zakázky

- Zavření vlevo, titulek uprostřed, menu dalších akcí vpravo. Notifikace zůstávají dostupné přes menu.
- Zákazník je uveden jednou; přesné opakování jména v konci názvu práce je pouze vizuálně zkráceno. Původní název v datech se nemění.
- Samostatná karta času a data, příjezdové rozmezí vedle plánu, neutrální typy práce a barevné textové stavy. Starý čas neznámého významu je označen „Původní čas · k upřesnění“; neodvozuje se z něj délka práce. Přesné původní plánovací údaje jsou v doplňujících údajích.
- Avatary se zkrácenými jmény mají dostupný úplný popis. Celá karta adresy otevírá původní navigační odkaz. Telefon zákazníka je dostupný přímým `tel:` odkazem; další kontakty jsou v akordeonu.
- Na mobilu je dole stále viditelná hlavní akce odjezdu, protokol a změna stavu. Lišta respektuje safe area a její skutečná výška se měří pro odsazení obsahu. Po odebrání nepřístupných akcí se volné místo nevynechává. V deníku realizace a galerii je lišta schovaná, aby neomezovala editor a klávesnici.
- Zadání a doplňující údaje jsou sbalitelné. Upravit, přidat závadu a smazat jsou v menu, při zachování rolí a původního potvrzení smazání. Velký červený box zmizel. Fotodokumentace zůstává samostatným tlačítkem a vlastním pohledem se zpět.

## Zakázky → Den

- Výběr týmu, vlastních zakázek a nedokončených k řešení má vždy právě jednu aktivní volbu. Dnes/Zítra jsou u data v samostatné skupině. Číslo dne lze stále zadat nativním výběrem i přepínat šipkami.
- Prázdný dnešek zabírá jeden řádek. Nejbližší návštěva je nahoře; označení se mění podle počtu výsledků.
- Karta zvýrazňuje čas, zákazníka a adresu; odjezd je primární, navigace obrysová a podrobnosti textové. Změna stavu je dostupná v detailu, u ostatních původních pohledů zůstává původní ovládání.
- Krátký odznak připojení u nadpisu vysvětlí uloženou kopii a nutnost připojení po klepnutí. Nenahrazuje ani nemění offline úložiště. Volba náhledu role vlastníka zůstává dostupná v kompaktní podobě.
- Kalendář, Mapa, Seznam, Zákazníci, Docházka a Více ponechávají svou organizaci. Přebírají společné tokeny, písmo, štítky, čitelnější ovládání a focus.

## Kontroly

- `npm test`: 81 testovacích souborů, bez selhání; `npm run check` bez chyby. Testování používá izolovaná data.
- Nové jednotkové testy `tests/field-components.test.js`: rozlišení skutečně plánované práce, příjezdu a nejasného starého času; žádné odvozování délky z příjezdu; zkrácení názvů bez volného párování; escapování jmen; textové stavy; odznak cache; kontrast hlavních tokenů nejméně 4,5:1.
- `scripts/test-field-ui-browser.mjs`: skutečný produkční Worker v izolovaném Miniflare/D1/R2 + Chromium + IndexedDB. Na 390×844 a 360×844 se po zavření původního jednorázového průvodce oprávněními vejde při prázdném dnešku nejbližší návštěva i primární tlačítko nad spodní navigaci. V detailu jsou akce vidět před posunutím i na konci obsahu. Ověřeny 44px cíle, telefon, navigační adresa, menu s upozorněními, zrušené smazání, přepnutí fotek a deníku, skutečné uložení stavu a návrat do detailu, protokol a načtení uložené návštěvy offline.
- Stejný test kontroluje přetečení a skutečné textové barevné kombinace v detailu, denním pohledu, kalendáři, seznamu, mapě, zákaznících, docházce, přehledu a nabídce Více. Dlouhé jméno a adresa nezpůsobují vodorovné přetečení. Inter se v prohlížeči skutečně načetl. Rozsah této kontroly není audit každého historického záznamu a všech uživatelských kombinací modulů.
- Prošel i původní prohlížečový postup hlavní fotodokumentace včetně uložení a opětovného načtení originálu/náhledu a deník realizace včetně emulované klávesnice, povinných fotografií, offline zápisu, restartu a synchronizace po 502 bez duplicit (360/390/430/1440).
- Výsledný artefakt Dr. Závlahy prošel novým celým prohlížečovým postupem. Oba skutečné webové artefakty prošly sestavením a izolovanou kontrolou autentizace/instalace/zakázek. Sestavený server mimo vložená veřejná statická aktiva je u obou instalací bajtově stejný jako před změnou.

## Omezení

Skutečný iPhone ani Safari nebyly dostupné; mobilní kontroly a klávesnice byly emulovány v Chromium. Dlouhé názvy zůstávají čitelné a mohou zvětšit karty; tvrzení o návštěvě nad přehybem je ověřeno pro běžný obsah testovací zakázky. Tmavý režim byl jako volitelný odložen. Změna je webová, nikoli aktualizace nativní SwiftUI/Watch IPA. Provozní zakázky nebyly testy přepisovány. Žádné databázové migrace nejsou součástí vydání.
