# Přihlášení jménem a heslem — 4. 11. 2026

Zavedeno do stávajícího Pracovního deníku. Účty zachovávají ID členů, role,
přiřazení zakázek, oborové členství a současné databáze/R2. Super Admin má dále
své samostatné přihlášení s druhým faktorem; tento modul ho nemění.

## Použití

1. Stávající uživatel: Nastavení → Přihlášení → Moje přihlášení. Nastaví si
   přihlašovací jméno a heslo pro svůj současný účet (nevznikne nový člen).
2. Nový kolega: Tým → Vytvořit účet. Jméno, přihlašovací jméno, oprávnění,
   ve společném prostoru také obor. Kontaktní e-mail je nepovinný. Prázdné
   dočasné heslo znamená vygenerování bezpečného hesla; zobrazí se jednou.
3. Nový kolega musí před otevřením dat změnit dočasné heslo. Platí i pro přímé
   API a po obnovení aplikace. Dočasná relace neumožňuje běžnou práci.
4. Zapomenuté heslo obnovuje **výhradně role Administrátor** v Týmu → Obnovit
   heslo. Owner, Správce (admin), Pracovník ani Čtenář tento endpoint nemají.
   Zůstává současná hierarchie: administrátor nemění vlastníka ani jiného
   administrátora; může obnovovat přístup Správce, Pracovníka a Čtenáře.
   Vlastní známé heslo si může změnit každý, což není obnova zapomenutého hesla.
   Samoobslužná obnova, e-mailové odkazy a obnovovací kódy nejsou implementované.
   Ztrátu hesla vlastníka/administrátora proto řeší provozovatel po ověření
   identity mimo tento modul; žádná skrytá obnova nebo univerzální heslo neexistuje.
5. Vlastník: Nastavení → Způsob přihlašování firmy → Pouze jméno a heslo.
   Server vyžaduje přihlášení vlastníka jeho již nastaveným trvalým heslem
   a opětovné potvrzení hesla. Pro přechod starých členů zůstává po nasazení
   původní autentizace povolená, dokud vlastník tuto volbu výslovně nezmění.
   Přepínač platí pro společný adresář obou propojených firem.

Nikomu nebylo při vývoji vytvořeno ani resetováno skutečné provozní heslo.
Administrátora musí nejprve vytvořit/přidělit vlastník podle současných pravidel.

## Zabezpečení a ukládání

- @noble/hashes 2.4.0, scrypt N=32768, r=8, p=3, 24b náhodná sůl, 32b výstup.
  Nezávislý test porovnává výsledek s Node crypto.scrypt. Paměťové KDF jsou
  uvnitř isolate sériové; nejvýše čtyři rozpracované/čekající požadavky.
- Jména jsou normalizovaná, unikátní, hesla 12–128 znaků. Server neukládá
  prostá hesla, hesla nejsou v URL, návrzích formulářů, lokální databázi ani logu.
- Cookie __Host-zavlahy-access je Secure/HttpOnly/SameSite=Lax, tokeny jsou
  náhodné a v databázi pouze hashované. Relace ověřuje verzi hesla. Nové heslo
  ruší staré relace, nepoužité osobní odkazy a registrace push zařízení.
- Zápis hesla/reset/policy používá CAS. Revokace i audit jsou podmíněné skutečným
  úspěchem CAS ve stejné D1 transakci. Otestována i souběžná změna mezi načtením
  a zápisem: nezruší novější platnou relaci a nevytvoří falešný audit.
- Trvalé limity pokusů podle IP, kombinace IP/účtu a účtu; shodná chyba pro
  neexistující jméno a nesprávné heslo, náhradní KDF i pro neexistující účet.
- Před změnou cookie se ověří cílová identita a čekající offline změny. Lokální
  přístup se zamkne ještě před změnou cookie, aby dočasné první přihlášení ani
  nejistý výsledek sítě nezpřístupnil offline obsah předchozího uživatele.
- Nová ID nejsou párována podle e-mailu nebo jména. Existující člen s e-mailem
  se znovu nezakládá; přihlašování se doplní na jeho současné ID. Účty bez e-mailu
  mají interní .invalid adresu, která se nepoužije pro e-mailové připomínky.
- Migrace 0051 přidává local_credentials, local_auth_rates, local_auth_events
  a způsob/verzi přihlášení relace. 0052 doplňuje ochranu při převodu prostoru.
  Původní migrace se nemění; Garden má vlastní konsolidovaný journal.
- Úplná šifrovaná záloha obsahuje credentials/audit. Relace a dočasné rate
  counters se nezálohují. Převod dalšího prostoru neslučuje hesla automaticky.

## Ověření

- 300 regresních kontrol prošlo v izolované SQLite/R2. Sedm nových testů
  pokrývá KDF, první přihlášení, role, obnovení, relace, limity, CAS souběh,
  režim pouze heslem a obory/přiřazení ve společném prostoru.
- Skutečný lokální workerd/D1/R2, prohlížeč Chromium: 390/430/1440 CSS px,
  vytvoření a uložení účtu, přihlášení bez hlaviček hostingu, změna dočasného
  hesla, opětovné otevření, administrátorský reset, zákaz samoobslužné obnovy,
  žádné vodorovné přetékání. Totéž na finálních sestaveních obou instalací.
- Přepnutí účtu s čekajícím zápisem je odmítnuto před změnou cookie;
  dočasné přihlášení neotevře starou offline relaci. Vstupní přihlášení také
  ověřeno přes existující nativní ovládací kontrakt pro SwiftUI, heslo označeno
  jako secure. Samotná fyzická instalace iPhonu/Safari zde nebyla ověřena.
- Kontrola syntaxe a sestaveného Worker artefaktu. Zkušební scrypt ověření ve
  workerd trvalo přibližně 220–270 ms lokálně; není to měření produkčního zatížení.

## Nasazení a omezení

Nasazení přidává pouze schéma/kód. Nemění hesla uživatelů ani výchozí přechodový
režim. Dr. Garden měl původně navíc přístupovou bránu hostingu Sites (`custom`).
Na navazující požadavek uživatele na stejné přihlášení v obou denících byla
4. 11. 2026 otevřena samotná přihlašovací stránka: publikum hostingu je nyní
stejně jako u Dr. Závlahy `public`. Firemní data zůstávají za autentizací
a oprávněními společného API. Databázové účty ani hesla se tím neměnily.

Zdroj: větev feat/local-password-accounts-2026-11-04. Lokální test:

```
cd apps/work-diary
node scripts/build.mjs
node --input-type=module -e 'import "./tests/local-auth.test.js"'
node scripts/test-local-auth-browser.mjs
```

### Výsledek publikace

- Dr. Závlaha: verze **113**, zdroj `b99b144e526e4bbf967b2dd451e5f55835564441`,
  publikace `appgdep_6aeb50fd7c5881918955f6ae102d4bf9` úspěšná.
  https://zavlahovy-denik.purplecedar.chatgpt.site/
- Dr. Garden: verze **34**, zdroj `4db8232e78d77d8a5f87e48fa715e933aa24dd8a`,
  publikace `appgdep_6aeb514a2ed8819183f6608c5a775c3c` úspěšná.
  https://dr-garden.purplecedar.chatgpt.site/
- Veřejná kontrola curl: Dr. Závlaha `/api/auth/options` 200 s
  `password:true,legacyAllowed:true`; `/api/me` bez přihlášení 401.
  Při první publikaci Garden `/api/auth/options` vracel 401 na vstupní bráně
  hostingu. Následující schválená změna tuto bránu sjednotila (viz níže).
- Provozní chybové logy Dr. Závlahy po první publikaci bez záznamu chyby.
  Nebyly vytvářeny skutečné účty ani měněny provozní zakázky či hesla.

### Sjednocení vstupního přihlášení

- Uživatelský požadavek: „Přihlášení bude na obou stejné“.
- Sites změna publika Dr. Garden z `custom` na `public`, revize přístupu **3**,
  potvrzená nástrojem 2026-11-04T16:35:08.215967+00:00. Stávající správci,
  členové, role a povolení zůstali zachováni. Nebyla posílána žádná pozvánka.
- Read-only curl kontrola obou veřejných adres: `/` 200, `/api/auth/options`
  200 se shodným `password:true,legacyAllowed:true`; `/api/me`, `/api/jobs`,
  `/api/customers` a `/api/gardens` bez přihlášení všechny 401.
- Používá se společný adresář účtů. Každá adresa má vlastní zabezpečenou cookie
  relace; nejde o automatické přenášení přihlášení mezi doménami.
- Skutečným heslem uživatele nebylo testováno (není k dispozici); ověřena
  dostupnost přihlášení a odmítnutí anonymního přístupu k datům.
