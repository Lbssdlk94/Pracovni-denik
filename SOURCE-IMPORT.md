# Import zdrojového kódu

Importovaná verze zdroje: `a6008792a3bbe1c50fc534f183ebf6df8f1a360e`.

Tento repozitář obsahuje aktuální zdrojový snapshot Pracovního deníku a Super Admina, včetně testů a databázových schémat. Provozní databáze, R2 soubory zákazníků, přístupové klíče, místní úložiště a historie interního Sites repozitáře nejsou součástí importu. Syntetické testovací příklady a schémata/defaulty aplikace jsou zachovány.

Manifesty hostingu neobsahují identifikátory živých instalací. Je potřeba je nastavit samostatně pro konkrétní hosting. Uložení na GitHub neprovádí nasazení do běžících firem.

## Další aktualizace

Ze samostatného checkoutu tohoto GitHub repozitáře spusťte `python3 tools/import_sites_source.py --source /cesta/k/pracovni-denik-platform`, zkontrolujte diff, spusťte testy a změny commitněte/pushněte. Skript vyžaduje čistý zdrojový checkout, zachovává interní relativní symlinky a odmítá externí symlinky nebo nalezený vzor přístupového klíče. Samotné přidání vzdáleného repozitáře do nezfiltrované historie není náhradou tohoto exportu.

Automatická synchronizace, GitHub Actions ani automatické produkční nasazování nejsou tímto importem zapnuty.
