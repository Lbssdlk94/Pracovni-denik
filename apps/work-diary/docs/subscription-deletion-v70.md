# Smazání ukončeného předplatného

Vlastník nebo správce otevře **Předplatné → Podrobnosti předplatného**. U stavu **Ukončené** najde dole samostatnou část **Smazání předplatného** a tlačítko **Smazat předplatné**. Následuje potvrzení se jménem zákazníka. Aktivní a pozastavené předplatné je nutné nejprve ukončit; pracovníci mazat nemohou. Smazání vyžaduje připojení.

Smazaný záznam se nezobrazuje v žádném přehledu předplatných, ani ve filtru Ukončené nebo u zákazníka; detail vrací 404. Nelze jej znovu aktivovat, prodloužit či měnit. Pod stejným ID nelze založit nový kontrakt.

Jde o odstranění z aplikace pomocí příznaku `subscriptions.deleted_at` a `deleted_by`. Interní období, sjednané podmínky, platby a čerpání zůstávají kvůli existujícím vazbám. Zákazník, zahrada, zakázky, servisní protokoly a originální soukromé fotografie se nemažou. Dokončené návštěvy zůstávají v historii zahrady; jejich protokol je přístupný podle stejných oprávnění a nepotřebuje již zobrazovat odstraněný kontrakt.

Přídavná migrace `0033_breezy_terror.sql` přidává pouze dva nullable sloupce, bez změn provozních dat. Server kontroluje roli, stav Ukončené i verzi při databázovém zápisu. ID operace zajišťuje opakování bez druhého zápisu a bez obnovení smazaného předplatného.

Místní kopie předplatného ve starších offline protokolech se po smazání na stejném zařízení odstraní, ale pracovní zápis se zachová. Při obnovení přehledu online se ověřují také místní kopie ostatních členů; nedostupná předplatná se skryjí. Zařízení, které zůstává zcela offline, se o změně dozví až po připojení; platnost jeho dosavadní autorizované kopie zůstává nejvýše 24 hodin.

Ověření: jednotkové testy mazání/stavů/rolí/verzí a souběhu členství, celý mobilní postup v prohlížeči včetně zrušení potvrzení a offline přehledu, zachování zákazníka/zahrady/zakázky/protokolu i původních bajtů fotografie. Samostatný test workerd/D1 ověřuje souběžné opakování stejného smazání a zachování vazeb. Testy používají oddělené místní databáze; žádné provozní předplatné se kvůli testu nemaže.
