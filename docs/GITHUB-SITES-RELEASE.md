# Vydání obou webů z GitHubu (bezpečný mezikrok)

Workflow `.github/workflows/sites-release.yml` běží při změnách pracovní aplikace na `main` a lze ho spustit ručně pomocí **Actions → Verify and prepare both Sites releases → Run workflow**. Neprovádí produkční publikaci.

## Co ověřuje
- `npm ci` s uzamčenými závislostmi;
- `npm run verify:release` (syntax, testy, build, izolované Worker testy);
- ověření výsledného Workeru a API vůči izolované testovací databázi.

Pokud některý krok selže, nevzniká úspěšné vydání.

## Výsledné artefakty
- **sites-zavlaha-SHA:** sestavený Worker včetně statických souborů a migrací; soubor `zavlaha-sites-release.tar.gz`;
- **sites-garden-frontend-SHA:** pouze zdrojové soubory `web/` pro začlenění do existující distribuce Garden; soubor `garden-frontend-only.tar.gz`;
- **sites-release-checksums-SHA:** SHA-256 kontrolní součty.

Žádný z artefaktů **není** přímý příkaz k nasazení na Sites ani potvrzení, že produkce běží na tomto commitu.

## Proč nelze spustit automatické nasazení na ChatGPT Sites

Tento GitHub projekt neobsahuje přístupový, podporovaný a zdokumentovaný deploy endpoint pro existující ChatGPT Sites projekty. GitHub Actions proto nemůže bezpečně vykonat stejné vydání jako nástroj Sites. **Nepoužívejte GitHub Pages**: aplikace má Worker, D1, R2 a autentizaci; statický web by ji nenahradil.

Před skutečným zapnutím automatického nasazení je nutné dodat podporované nasazovací rozhraní, oprávnění pro obě existující Sites, a definici:
1. Dr. Závlaha: aktualizace přesně **stávajícího** Site projektu, zachovat jeho origin, existující databázi D1, R2, tajné proměnné, `.openai` metadata a identitu instalace; migrace pouze řízeně.
2. Dr. Garden: zachovat **vlastní** Worker, DB, R2, `.openai` metadata a identitu; změny `web/` z kanonického repozitáře bezpečně začlenit do Garden distribuce, sestavit s Garden konfigurací a až pak publikovat.
3. Před prvním ostrým nasazením vytvořit a ověřit zálohu, testovat kompatibilitu Workeru a migrací; nasazení lze vrátit na předchozí verzi.
4. Žádná prod tajemství nesmí být v repozitáři ani ve workflow logu.

V té chvíli lze přidat navazující deployment jobs s ochranou prostředí, manuálním schválením a kontroly dostupnosti; **nepřidávejte je, dokud nástroj a přístup skutečně neexistují**.

## Spuštění
1. Sloučit PR s workflow do `main`.
2. Otevřít GitHub Actions, vybrat **Verify and prepare both Sites releases**.
3. Spustit `Run workflow` nebo vyčkat na změnu kódu pracovní aplikace.
4. Zkontrolovat úspěšné testy a stáhnout balíčky v sekci Artifacts.
5. Publikaci provést přes autorizovaný nástroj Sites s výše uvedenými pravidly.

Toto je přípravná automatizace, **nikoliv automatická publikace**.
