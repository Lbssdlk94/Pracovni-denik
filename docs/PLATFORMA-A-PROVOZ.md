# Pracovní deník: společný zdroj a oddělené prostředky

Kanonický zdroj je tento repozitář. `apps/work-diary` obsahuje existující pracovní aplikaci, `apps/super-admin` centrální administraci a `packages/platform` společné pravidlo modulů a profesní šablony. Stávající repozitáře obou Sites jsou distribuční kopie pro příslušný hosting, nikoli další vývojové větve produktu. Nemíchat jejich `.openai`, migrace, klíče ani databáze.

## Hranice důvěry

Super Admin má vlastní D1, bez R2. Jeho schéma obsahuje výhradně registry, verze licencí, agregované technické metriky, pozvánky, MFA a audit. Nemá připojení k firemním DB/R2, SQL konzoli, impersonaci, API zakázek ani proxy firemních souborů. Operátor není automaticky členem žádného týmu. Hostingový účet a přístup ke zdrojům jsou samostatná privilegovaná oprávnění mimo Super Admin.

Každá firma používá vlastní origin, DB, R2, šifrovací klíče a uživatelské relace. Tím jsou oddělené i service worker, IndexedDB, offline fronty a přístupové cookies. Do jedné sdílené domény se firemní prostředí zatím neslučují. Kontrola `installation_state` a marker R2 odmítá nesprávnou vazbu DB/úložiště. Samotný název nebo e-mail není identifikátor firmy.

## Přihlášení provozovatele

Sites ověřuje ChatGPT identitu. Server navíc kontroluje `PLATFORM_OPERATOR_EMAIL` a první ověřené ID účtu pevně sváže s operátorem. Firemní role vstup nepovolují. TOTP (RFC 6238, 6 číslic / 30 sekund) je povinný před každým přístupem k administrativním API. První návštěva vyžaduje zapsání klíče do autentizátoru, ověření a uložení deseti jednorázových obnovovacích kódů. Klíč je v D1 šifrovaný AES-GCM; obnovovací kódy a relační tokeny se ukládají jako SHA-256. Tajné hodnoty nejsou v localStorage ani ve zdrojích. Relace: nejvýše osm hodin, třicet minut nečinnosti; HttpOnly/Secure/SameSite cookie, ochrana původu, omezení pokusů a ochrana před opětovným použitím TOTP.

## Licence a moduly

Povolení je průnik profesní verze, sjednané verze tarifu, výběru firmy a řízeného nasazení. Firemní nastavení smí dále vypínat. Role a závislosti modulů zůstávají platné. Katalog obsahuje jen implementované moduly; nové pojmenování samo nevytváří nový odborný modul.

Cena a limity se při přiřazení kopírují do sjednané verze. Úprava katalogového tarifu či profese je zpětně nepřepisuje. V detailu firmy lze výslovně převzít novou verzi. Optimistická verze záznamu a transakční idempotentní operace chrání před tichým přepsáním a duplicitním založením.

Server firmy stahuje ECDSA P-256 podepsanou konfiguraci, kontroluje firmu, instalaci, klíč, verzi a platnost. Při připojení ji obnovuje nejvýše po pěti minutách. Ověřená kopie platí nejvýše 24 hodin; bez spojení nelze zaručit okamžité odebrání licence. Po vypršení je potřebné nové ověření, místní neodeslané změny se nemažou. Pozastavení blokuje pracovní API, ponechá vlastníkův export a úplnou zálohu. Pozvánky počítají členy i čekající pozvánky; SQL podmínka limitu brání souběžnému překročení kvóty. Již existující členové se při snížení limitu nemažou.

Hlášení obsahuje počty členů/pozvánek/aktivních přístupů, verzi aplikace a schématu, čas poslední připravené zálohy a zdraví DB/R2. Žádná jména pracovníků, e-maily, obchodní obsah nebo soubory. Bez prvního hlášení zobrazuje administrace „nezměřeno“. Aktivita za 30 dní se začíná měřit připojením modulu a počítá se pouze mezi aktuálními členy. Hlášení vzniká při návštěvě aplikace, případně stávajícím serverovém běhu. Nenahrazuje nepřetržitý monitoring.

## Založení firmy a skutečné omezení hostingu

1. Super Admin → Firmy → Přidat firmu: kontakty, správce, profese, tarif, trial, povolené moduly.
2. Vznikne registr a idempotentní úloha `Čeká na hosting`. Sites neposkytuje této aplikaci serverové API pro automatické zakládání dalších Sites/D1/R2. Registr nesmí tvrdit, že hosting už existuje.
3. Čistý balíček lze připravit příkazem `node scripts/prepare-company.mjs --name "Firma" --owner "spravce@example.cz" --profession electrician --out /workspace/firma`.
4. Operátor zřídí nový hosting, vlastní DB/R2 a nové tajné klíče podle balíčku. Nepoužívat ID projektu ani zálohu jiné firmy. Zvolí také odpovídající přístupovou politiku Sites pro správce firmy.
5. V detailu firmy → Propojit připravenou instalaci: správný HTTPS origin a ověřené ID instalace. Jednorázově se ukáže konfigurace; token se v centrální DB uchová pouze jako hash. Hostovací proměnné firmy jsou `PLATFORM_CONTROL_URL`, `PLATFORM_COMPANY_ID`, `PLATFORM_SERVICE_TOKEN`, `PLATFORM_SIGNING_PUBLIC_KEY`, `PLATFORM_SIGNING_KEY_ID`; pro soukromý Sites control plane navíc jeho `PLATFORM_CONTROL_BYPASS_TOKEN`. Klíče mapovat z odpovídajících položek JSON, nikoli vložit JSON do webu. `PLATFORM_REQUIRE_INVITATION=1` zapíná bezpečné přijetí prvního vlastníka místo automatického bootstrapu; použít pouze u nové prázdné firmy.
6. Až instalace přijme podepsanou verzi a potvrdí DB/R2, změní se na `Připravená`. Teprve potom jde vytvořit časově omezenou jednorázovou pozvánku pro přihlášenou ověřenou e-mailovou identitu prvního správce. URL je v hash části, přihlášený příjemce ji potvrzuje na serveru. Pozvánka se připravuje ke zkopírování; e-mail se neposílá.

Pro vlastní provisioning je připraven HTTPS adaptér `PROVISIONER_URL` / `PROVISIONER_TOKEN`. Přijímá POST s `Idempotency-Key` a requestId `create:<companyId>`, profesními a licenčními metadaty. Musí opakování bezpečně vrátit ke stejným prostředkům. HTTP 2xx znamená pouze přijetí do fronty; připravenost potvrzuje až konkrétní instalace. Přesměrování jsou odmítnuta, tokeny se neposílají do jiné domény. Adaptér nebyl napojen na skutečného poskytovatele; automatické založení hostingu zatím nefunguje.

## Přenos na VPS

Není nutné přepisovat pravidla licencí, moduly, profesní model, UI ani WebCrypto. Oddělená vstupní funkce `platformAPI(Request, env)` používá úzké D1 rozhraní prepare/bind/first/all/run/batch. Testy ověřují stejné SQL i na běžném SQLite s transakčním adaptérem. Firemní soubory vyžadují kompatibilní S3/R2 adaptér, důvěryhodné OIDC ověření a proxy, která zahazuje podvržené identity. Sites přihlašovací hlavičky nelze na veřejném VPS důvěřivě převzít z prohlížeče. Ostrý VPS, S3 adaptér, vlastní OIDC a provozní zálohy VPS nejsou v této etapě nasazené ani provozně ověřené.

Při migraci nejdříve ověřit obnovu každé samostatné firmy včetně souborů, klíčů, auditních vazeb a přístupů. Potom přepnout její origin a vydat novou konfiguraci. Nemíchat offline databáze dvou firem. Dr. Garden má podle přání uživatele serverové automatické běhy nadále vypnuté; tuto volbu centrální licence nemění.

## Ověření a zbývající hranice

Testy běží nad SQLite i skutečnými D1/R2 v Miniflare a oddělenými daty v Chromiu. Fyzický iPhone, Safari, ostré přijetí pozvánky jinou identitou, reálný externí provisioning, kapacitní zátěž a VPS nejsou tímto simulovány. Bezpečnostní kontroly a testy nenahrazují nezávislý penetrační audit před komerčním provozem.

## Jednorázové propojení nového hostingu

Provozovatel hostingu může přes chráněné runtime nastavení `PLATFORM_HOST_CONNECTIONS` dodat nejvýše 20 časově omezených potvrzení již založených firem. Každé obsahuje přesná ID firmy a instalace, HTTPS origin, očekávanou verzi a e-mail prvního správce, hash samostatného služebního tokenu, jedinečné ID operace a expiraci (nejvýše sedm dní). Platí jen pro dosud nepropojenou firmu ve stavu `awaiting_host`. Chybějící firma se nezakládá; pozdější změny správce, stávající propojení, licence ani role se nepřepisují. Propojení má audit a historii a je jednorázové i při opakovaných požadavcích. Po ověření se runtime potvrzení odstraní. Nevzniká obecné anonymní API pro správu firem a MFA provozovatele zůstává povinné.

`GET /api/signing-key` zveřejňuje pouze veřejný ověřovací klíč a jeho označení. Soukromé klíče ani data firem nevrací. Nové prostředí může pomocí svého vlastního `PLATFORM_SERVICE_TOKEN` zavolat `POST /api/platform-initialize`. Ověří identitu databáze a bucketu, podepsanou konfiguraci a odešle technický heartbeat. Odpověď obsahuje pouze připravenost a ID/revizi; nevytváří členství provozovatele v cizí firmě ani provozní zakázky. Stav `ready` potvrzuje až tato úspěšná kontrola.

Tento postup umožňuje ruční zřízení přes podporované nástroje hostingu. Není napojením obecného automatického provisioneru na libovolného poskytovatele. Firmu lze samostatně zapsat v Super Adminu, automatické založení hostingových prostředků z jeho tlačítka zůstává závislé na poskytovatelském adaptéru.
