# Realizace sjednocení vzhledu

Výchozí práce je na větvi `ui/complete-redesign-2026-11-20`. Tento dokument popisuje stav po dokončení navazujících úprav. Chráněné nativní obrazovky se neměnily.

## Beze změny (nativní iOS)

Dashboard správce, dashboard pracovníka, přehled zakázek, detail zakázky, docházka, seznam zákazníků a servisní protokol včetně jejich komponent. Kontroluje je `scripts/check-protected-surfaces.mjs`.

## Přepracované nebo sjednocené plochy

- Ostatní nativní obrazovky používají `DiaryStyle`, seskupené formuláře (`APISecondaryFormSections`) a `secondaryChrome()`: zakázky a zákazníci mimo chráněný seznam, zahrady, závady, materiál, předplatné, vozidla, nastavení, přihlášení, deník realizace, zálohy, synchronizace, Google Disk a odeslání protokolu.
- Mobilní i desktopový web mají společnou vrstvu `.pd-secondary` na všech hlavních stránkách (přehled, zakázky, zákazníci, docházka, zahrady, tým, nastavení, materiál, závady, předplatné, vozidla). Dialogy dostávají `.pd-secondary-dialog`.
- Světlý, tmavý a systémový režim je v prohlížeči i v nastavení iOS.
- Super Admin má vlastní kompaktní panely a dialogy, bez přístupu do firemních dat.

## Funkce

Obchodní logika, API, oprávnění a offline fronta se v této etapě neměnily. Web a iOS dál používají stejné endpointy.

## Testy provedené v tomto prostředí

- `node scripts/check-protected-surfaces.mjs` — chráněné iOS soubory beze změny.
- iOS se tady nepřekládá (není Xcode). Vizuální browser testy Playwright se v tomto kroku nespouštěly.

## Zbývající rizika

- Větev obsahuje i novější nativní funkce z řady 0.8.5, nejen barvy. Sloučení do `main` je potřeba zkontrolovat jako celek.
- Každý webový dialog není ručně překreslený. Drží ho společné styly.
- Produkční nasazení a podpis iOS IPA tady neproběhly.
