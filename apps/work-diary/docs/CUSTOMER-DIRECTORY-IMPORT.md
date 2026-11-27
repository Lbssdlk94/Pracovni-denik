# Hromadný import adresáře

CSV import v Asistentovi podporuje až 250 zákaznických nebo dodavatelských profilů, nejvýše 5 000 fyzických řádků a soubor do 1 MB. Jeden profil může mít až 20 adres, 20 telefonů a 20 kontaktních osob. Nativní klienti dál používají stejnou databázi a API; tato změna neobsahuje nové sestavení iOS.

Pro více řádků jednoho profilu vyplňte stejné `ID zákazníka` nebo `ID mWork`. Samotné stejné jméno není důvodem ke sloučení. Každý řádek může obsahovat jinou kontaktní osobu, telefon, e-mail a adresu. Fakturační název, fakturační adresa, IČO a DIČ jsou samostatné údaje. Rozdílné fakturační údaje u stejného ID vyžadují kontrolu celého profilu.

`Obor` podporuje Závlaha, Garden/Zahrada a Obojí. `Typ kontaktu` podporuje Zákazník, Dodavatel a Obojí. Obě klasifikace jsou nezávislé. Nevyplněný obor zůstává nezařazený. Dodavatelům se automaticky nezakládá zahrada.

Před uložením se zobrazí všechny připravené profily, jejich adresy, kontakty, fakturační údaje a přeskočené položky. Import nevytváří faktury ani finanční zůstatky a z importovaných poznámek automaticky nepřiděluje negativní hodnocení. Zdrojové interní poznámky jsou v zákaznickém DTO a rozhraní dostupné pouze roli `admin` (Správce).

Potvrzení schvaluje přesný připravený seznam. Web ukládá po pěti profilech a automaticky navazuje; po výpadku zůstává možnost pokračování. ID nových profilů jsou odvozena z identifikace zdroje. Opakované potvrzení vrací stejné pokračování. Každá dávka znovu ověřuje roli, modul, pracovní obor a existující kontakty. Import existující profily automaticky nepřepisuje.

## Řízené nahrazení

Údržbový import může provést pouze přesný plán schválený v runtime konfiguraci: krátkodobý token, hash každé části, hash závěrečného archivování a hash zdroje. Bez této konfigurace endpoint vrací 404. Soubory zákazníků ani tokeny nejsou součástí zdrojového kódu nebo veřejných souborů webu.

Odpovídající profily se aktualizují se zachováním zákaznických a adresních ID. Ostatní staré kontakty se pouze archivují. Zakázky, zahrady a doklady se nemažou. Verze všech měněných záznamů se kontrolují ve stejné transakci jako změny; zastaralá část se celá vrátí zpět. Každá část i závěr mají neměnnou auditní stopu a potvrzení umožňující bezpečné opakování. Nový kontakt vytvořený během importu zabrání závěrečnému archivování, dokud se plán neobnoví.

Archiv je dostupný správcům přes volbu „Zobrazit i archivované“. Obnovení se provádí úpravou kontaktu a odškrtnutím „Archivovaný kontakt“. Přímé vazby starších zakázek fungují i po archivování. Offline snímek zachovává archivované kontakty pro jejich přímé otevření; běžný seznam je skrývá.

## Ověření

Testy pokrývají 250 profilů s více kontakty a adresami, fakturační údaje, odlišné typy a obory, duplicity, opakované potvrzení, výpadek odpovědi, roli a náhled role, archivování, zastaralé verze, podvržená data, vypršelý token, souběžnou tvorbu kontaktu, zachování zakázek a sestavený Worker.

Interaktivní lokální náhled není nakonfigurovaný (chybí dev skript i statický výstup pro preview); ověření vzhledu v prohlížeči tímto náhledem neproběhlo. Stávající test úprav konceptu zakázky obsahuje pevné datum 2026-12-01, které nyní koliduje s dalším dnem konceptu; stejná chyba byla ověřena i před touto změnou.
