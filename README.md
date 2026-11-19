# Pracovní deník 2.0

Společný zdroj existujícího pracovního deníku a oddělené centrální administrace. Neobsahuje provozní databáze ani tajné hodnoty.

- `apps/work-diary` – pracovní aplikace, jedna samostatná DB/R2/origin na firmu.
- `apps/super-admin` – registr firem, profese, platformové tarify a licence, TOTP a audit.
- `packages/platform` – společná pravidla modulů a šablony.
- `db`, `drizzle` – výhradně metadata Super Admina; pracovní schéma zůstává u pracovní aplikace.

Použití a hranice architektury: [docs/PLATFORMA-A-PROVOZ.md](docs/PLATFORMA-A-PROVOZ.md).

## iPhone a Apple Watch

[Nativní SwiftUI klient 0.8 s přímým API — aktuální stav a ověření](docs/IPHONE-NATIVE-API-2026-11-06.md). Poslední sestavení prošlo, navazující dokončení zatím blokuje GitHub Billing & plans; PR #4 zůstává rozpracovaný.

## Vývoj

`npm ci`, `npm run check`, `npm test`, `npm run build`, `npm run build:tenant`, `npm run test:tenant`.

Skutečný izolovaný D1/R2: `npm run test:worker`, `node scripts/test-tenant-policy-worker.mjs`, pracovní `test:administrator-worker`, `test:planning-worker`, `test:operations-worker`.

Izolované prohlížečové testy vyžadují Playwright a Chromium: `node apps/super-admin/tests/admin-browser.cjs`. Testovací HTTP server je pouze na loopbacku a není součástí nasazeného Workeru. `npm run preview` rovněž spouští výhradně izolovaná testovací data.

Super Admin se publikuje z kořenového buildu podle kořenového `.openai/hosting.json`. Firemní aplikaci na tento projekt nepublikovat. Její instalační balíček vznikne přes `node scripts/prepare-company.mjs`; nová instalace musí získat vlastní Sites ID, DB/R2 a nové klíče. Existující migrace každé instalace zachovat.

Individuální měření dopravy/práce a člověkohodin na zakázkách, propojení s docházkou, opravy, oprávnění a offline fronta: [popis a bezpečné nasazení](docs/JOB-PERSON-HOURS-2026-11-19.md). iOS lze zkontrolovat ručním během `iphone.yml` s `checks_only=true` bez vytvoření IPA.

Odhad dokončení zakázek v procentech a barevný denní posun s výchozí hranicí 20 procentních bodů: [použití, nasazení a příprava SwiftUI bez IPA](docs/JOB-COMPLETION-2026-11-19.md).
