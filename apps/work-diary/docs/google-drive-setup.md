# Google Disk: nastavení fotodokumentace zakázek

Funkce je součástí původní aplikace [Závlahový deník](https://zavlahovy-denik.purplecedar.chatgpt.site). Přihlášení kolegů přes osobní odkazy ani ChatGPT se nemění. Google připojuje správce pro celý tým; kolegové nepotřebují vlastní Google účet pro galerii ani nahrávání přes aplikaci. Vidí pouze fotky zakázek, ke kterým mají oprávnění. Vlastník a správci vidí všechny zakázky.

**Co je potřeba udělat ručně:** vytvořit Google Cloud projekt a OAuth údaje, vložit je do zabezpečeného formuláře v aplikaci a udělit souhlas na Googlu. Heslo ke Google účtu se zadává výhradně na Googlu, nikdy do aplikace ani do chatu. Skutečné OAuth připojení a nahrání musí ověřit držitel Google účtu; automatické testy používají simulátor Google API, nikoli váš Disk.

## 1. Otevřete Google Cloud Console

Otevřete https://console.cloud.google.com/ a přihlaste se účtem, pod kterým chcete spravovat projekt. Účet, do jehož Disku se budou ukládat fotky, můžete později zvolit samostatně na přihlašovací obrazovce Googlu.

## 2. Vytvořte projekt

Nahoře otevřete výběr projektu, zvolte **Nový projekt**, například „Závlahový deník“, a projekt vytvořte. Počkejte, až je vybraný. Použijte jeden projekt pro celou tuto integraci.

## 3. Aktivujte API

V **APIs & Services → Library** aktivujte **Google Drive API**. Aktivujte také **Google Picker API** pro výběr existující složky. Používá se oficiální přesměrovaný Picker, nikoli vložený widget: nemusíte vytvářet veřejný API klíč ani předávat token prohlížeči.

## 4. Nastavte souhlas OAuth

Otevřete **Google Auth Platform → Branding / Audience / Data Access** (v některých zobrazeních **APIs & Services → OAuth consent screen**).

- Zadejte název aplikace a kontaktní e-mail.
- Pro osobní Google účty zvolte **External**. Interní režim je jen pro příslušnou Google Workspace organizaci.
- Při testování přidejte účet, jehož Disk chcete používat, do **Test users**.
- Přidejte pouze oprávnění `https://www.googleapis.com/auth/drive.file`. Aplikace nežádá přístup k celému Disku ani další přihlašovací oprávnění. Připojený e-mail zjišťuje přes Drive API.
- Pro test lze ponechat stav **Testing**. Google u tohoto režimu standardně omezuje platnost obnovovacího přístupu na sedm dní; potom se účet musí připojit znovu. Pro trvalé používání nastavte **In production** a dokončete případné požadavky Googlu na identitu, značku, doménu a zveřejnění. Oprávnění `drive.file` je Googlu doporučované užší oprávnění.
- Pokud Google při produkčním zveřejnění vyžaduje vlastnictví domény, sdílenou doménu `chatgpt.site` nemůžete ověřovat jako svou. V takovém případě je nutná vlastní ověřená doména podporovaná hostingem; aktualizuje se `PUBLIC_APP_URL`, Redirect URI a OAuth konfigurace. Testování s vlastním testovacím účtem proveďte před tímto krokem. Tuto podmínku neurčuje aplikace.

Informace pro popis zpracování dat: originály jsou na vybraném soukromém Google Disku, šifrované přístupové údaje a metadata v serverové databázi aplikace, malé soukromé náhledy v jejím soukromém úložišti. Aplikace nevytváří veřejné odkazy ani automatické Google sdílení. Přístup k tokenům lze odvolat v aplikaci i v nastavení zabezpečení Google účtu.

## 5. Vytvořte OAuth přihlašovací údaje

V **Google Auth Platform → Clients → Create client** zvolte **Web application**. Nevybírejte klienta pro Android ani iOS: jde o webovou aplikaci fungující i na iPhonu. Zadejte například „Závlahový deník – web“.

Zkopírujte **Client ID** a **Client secret** do správce hesel. Nezveřejňujte secret, neposílejte ho do chatu, e-mailu ani Git repozitáře. Prohlížeč je nepotřebuje k volání Drive API; formulář je odešle serveru přes HTTPS.

## 6. Nastavte autorizované Redirect URI

Do **Authorized redirect URIs** vložte přesně:

```
https://zavlahovy-denik.purplecedar.chatgpt.site/api/drive/oauth/callback
```

Bez dalšího lomítka na konci, parametrů nebo části `#`. Přesnou aktuální hodnotu najdete také v aplikaci v Nastavení → Google Disk → Jednorázové nastavení Google OAuth. Pro serverový přesměrovaný tok není potřeba JavaScript origin ani prohlížečový OAuth token. Pokud Google formulář vyžaduje webový origin, použijte `https://zavlahovy-denik.purplecedar.chatgpt.site`.

## 7. Vložte údaje do aplikace

Přihlaste se jako **vlastník** aplikace. Otevřete **Nastavení → Google Disk → Jednorázové nastavení Google OAuth**. Vložte Client ID a Client secret a klepněte na **Bezpečně uložit OAuth nastavení**. Secret se uloží šifrovaně na serveru a následně se už nezobrazuje. Zálohy zahrad ho neobsahují.

Serverový šifrovací klíč byl pro tento hosting připraven jako tajná proměnná. V případě vlastního nasazení nastavte v produkčních runtime proměnných `DRIVE_TOKEN_ENCRYPTION_KEY` na 32 náhodných bajtů v base64url a `PUBLIC_APP_URL` na skutečný HTTPS origin. Volitelně lze serverově nastavit `GOOGLE_DRIVE_CLIENT_ID` a `GOOGLE_DRIVE_CLIENT_SECRET` místo formuláře; formulář má přednost. `.env.example` uvádí názvy bez skutečných hodnot. Lokální `.env` se nesmí commitovat a samo nenastaví produkční Sites runtime.

Existující šifrovací klíč nemažte ani neměňte bez řízeného převodu šifrovaných údajů; jinak přestane fungovat obnova přístupu i čtení konfigurace. Zálohu klíče uchovávejte odděleně a bezpečně, nikdy v běžné záloze zahrad.

## 8. Připojte Google účet

V **Nastavení → Google Disk** klepněte na **Připojit Google účet**. Otevře se oficiální přihlášení Googlu. Vyberte konkrétní účet a potvrďte požadovaný přístup. Po návratu se zobrazí e-mail a stav **Připojeno**.

Pro změnu účtu použijte **Změnit Google účet**. Nové fotky půjdou na nový účet po výběru jeho hlavní složky. Staré soubory se nepřesouvají a nemažou. Dřívější účty zůstávají šifrovaně připojené pouze pro načítání původních fotek; jsou uvedené v rozbalovacím přehledu. **Bezpečně odpojit Google Disk** zruší všechna tato připojení, smaže serverové tokeny a požádá Google o jejich odvolání; soubory zůstanou na Disku. Při nedostupnosti Googlu lze oprávnění dodatečně odvolat také na https://myaccount.google.com/connections.

## 9. Vyberte hlavní složku ZÁVLAHY

Máte dvě možnosti:

- **Vytvořit složku ZÁVLAHY** vytvoří soukromou složku v Můj disk. Opakované klepnutí použije její původní ID.
- **Vybrat existující hlavní složku** otevře oficiální Google Picker přes přesměrování. Vyberte jednu soukromou složku na právě připojeném účtu. Návrat z jiného účtu nebo výběr veřejně či jinak sdílené složky se odmítne.

Tato verze úmyslně používá soukromé složky vlastněné vybraným účtem v **Můj disk**, nikoli Workspace sdílené disky. Sdílení hlavní složky přímo na Googlu by obešlo přiřazení zakázek v aplikaci. Proto složku nesdílejte; kolegové pracují přes aplikaci. Změna hlavní složky nemění stará propojení ani soubory. Klepněte na **Ověřit připojení**.

## 10. Otestujte první fotografii

1. V Zakázkách otevřete nebo vytvořte skutečnou zakázku a přiřaďte kolegu. Jméno zákazníka, město a adresu vyplňujte pouze v tomto záznamu zakázky. Starší zakázky, které tyto údaje neměly, je mohou jednorázově doplnit přes **Upravit**; při nahrávání se údaje znovu nezadávají. Bez zákazníka nebo města se pro název složky použije dostupný název zakázky.
2. Klepněte na **Podrobnosti**, v **FOTODOKUMENTACI** vyberte **Před**, **Montáž** nebo **Hotovo**.
3. Klepněte na **Vyfotit** nebo **Přidat fotografie**. Vyberte jeden nebo více snímků. U každého lze upravit kategorii a napsat poznámku.
4. Klepněte na **Nahrát fotografie** a sledujte procenta. Přenáší se původní bajty souboru; fotografie se nezmenšují ani nepřevádějí. Náhledy jsou samostatné a kvalitu originálu nemění.
5. Po dokončení otevřete náhled přes celou obrazovku a stáhněte originál. Porovnejte velikost s vybraným souborem. V HEIC nepodporujícím prohlížeči je k dispozici stažení originálu; náhled vytvoří Google, pokud tento formát umí zpracovat. iPhone může soubor předat jako JPEG podle svého systémového nastavení; aplikace zachová přesně to, co prohlížeč předá.
6. Přes **Otevřít Google Disk** zkontrolujte hlavní složku, rok podle data založení zakázky, složku zakázky a tři kategorie. Název zakázkové složky obsahuje také krátké ID, aby se stejnojmenné zakázky rozlišily. Přímé otevření Disku vyžaduje oprávnění v příslušném Google účtu; prohlížení v aplikaci je dostupné přiřazenému kolegovi i bez něj.
7. Nahrajte druhou fotografii ke stejné zakázce. Má se objevit ve stejné zakázkové složce. Změňte název nebo adresu zakázky a vyzkoušejte další snímek: vazba podle ID zůstane zachována. Staré složky se nepřejmenovávají ani nepřesouvají.
8. Během většího nahrávání krátce vypněte připojení. Po chybě ho obnovte a klepněte na **Opakovat neúspěšná nahrávání**. Nevybírejte znovu stejný soubor jako novou položku, pokud chcete pokračovat ve stejném požadavku. Aplikace naváže na poslední potvrzenou část a nevytvoří druhý soubor. Výběr neodeslaných souborů zůstává jen v paměti otevřené stránky; po jejím zavření je nutné soubory vybrat znovu. Vědomé opětovné vybrání souboru je nové nahrávání, ne deduplikace podle obsahu.
9. Ověřte účet druhého kolegy: cizí zakázku ani její náhled nebo originál nemá otevřít. Správce má vidět všechny. Čtenář může fotografie prohlížet, nikoli nahrávat, měnit poznámky či mazat. Ke nahrávání a galerii je potřeba internet.
10. Na testovací zakázce ověřte smazání zakázky: snímky na Disku musí zůstat. Odstranění konkrétní fotografie vyžaduje zvláštní potvrzení správce **Odstranit z Google Disku** a přesune originál do koše na Disku, nejde o automatickou součást mazání zakázky.

## Časté potíže

- `redirect_uri_mismatch`: zkopírujte přesnou Redirect URI z aplikace do stejného OAuth klienta a uložte ji.
- Přístup zamítnutý testovacímu účtu: přidejte konkrétní Google účet do Test users, případně dokončete produkční zveřejnění.
- Výběr složky se nezdařil: vyberte soukromou složku vlastněnou právě připojeným účtem v Můj disk. Zkontrolujte aktivaci Picker API a `drive.file`.
- Je vyžadováno nové přihlášení: Google mohl token odvolat nebo mu skončila platnost v režimu Testing. Znovu připojte stejný účet; původní ID a fotky zůstanou zachované.
- Fotka byla sdílena nebo přesunuta přímo na Disku: obnovte soukromé sdílení a původní umístění; aplikace vazbu nepřepisuje jinou stejně pojmenovanou složkou.
- Plný Disk, limit API nebo výpadek: uvolněte místo či počkejte a použijte Opakovat. Soubory se nepřepisují.
- Zálohy zahrad a šachet neobsahují originály uložené na Google Disku ani OAuth tokeny. Originály zálohujte také podle pravidel svého Google účtu.

## Ověření pro vývojáře

`npm run check`, `npm test`, `npm run build`. Integrační test `tests/drive.test.js` používá simulátor oficiálních HTTP endpointů a ověřuje OAuth state, PKCE, šifrování, výběr soukromé složky, souběžné vytváření složek, rozdělený přenos původních bajtů, ztracenou odpověď, obnovení tokenu, změnu účtu, odpojení, mazání a oprávnění. Mobilní průchod se ověřuje přes lokální `scripts/preview-drive.mjs` a `tests/drive-browser.cjs`. Tyto testovací identity ani simulátor nejsou součástí nasazeného Workeru. Skutečný souhlas Googlu, reálné zásady daného účtu a upload na váš Disk ověřte výše uvedeným postupem; bez vašich OAuth údajů a souhlasu je nelze poctivě potvrdit.

Oficiální podklady: [Drive oprávnění](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [serverový OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [přesměrovaný Picker bez tokenu v prohlížeči](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker), [rezervovaná ID a bezpečné opakování tvorby](https://developers.google.com/workspace/drive/api/guides/create-file), [obnovitelné nahrávání](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [platnost testovacích tokenů](https://developers.google.com/identity/protocols/oauth2).
