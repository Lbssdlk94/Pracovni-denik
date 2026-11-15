# Povinná fotografie v deníku realizace

Každé nové uložení denního zápisu vyžaduje alespoň jednu fotografii. Kontroluje to webový formulář, offline klient i server (`400`, `diary_photo_required`). Při úpravě postačí již přiložená fotografie. Server nadále ověřuje, že skutečně existuje, patří ke stejné zakázce a její nahrání skončilo; samotné vymyšlené ID nestačí.

Historické zápisy bez fotografií zůstávají čitelné. Při jejich úpravě je potřeba fotografii přidat. Staré neodeslané zápisy, které po změně pravidla odmítne server, mají akci **Doplnit fotografii**. Doplnění zachová ID, text, datum a původní verzi; nevytváří další kopii zápisu. Konflikty a změny oprávnění se tím neobcházejí. Vypnuté přidávání fotek není automaticky zapnuté; formulář vysvětlí, že bez fotky zápis nelze uložit. Rozpracovaný text lze dál uložit jako místní koncept bez fotografie.

Ověřeno 347 automatickými testy včetně nových serverových a klientských kontrol. Prohlížečový test sestaveného Workeru v izolovaných D1/R2 a IndexedDB ověřil: zákaz uložení bez fotky online/offline i po odebrání poslední vybrané fotky; uložení s fotkou; úpravu s původní přílohou bez dalšího uploadu; přežití restartu a 502, následnou synchronizaci právě jednou; doplnění fotky ke starému textovému záznamu ve frontě přes skutečné rozhraní bez ztráty textu nebo duplikace; konflikty a mobilní rozměry 360/390/430 i desktop 1440 px. Žádná skutečná zakázka nebyla měněna. Oba firemní artefakty se sestavily a prošly validací startu a autorizace.

Ve SwiftUI je stejná podmínka na tlačítku i před samotným uložením. Přidán XCTest pro chybějící/prázdnou fotodokumentaci a existující fotografii; testovací API zohledňuje nové pravidlo. Linux nemá Xcode, proto lokálně nelze potvrdit kompilaci ani běh XCTestu. Povinnost na serveru platí i pro již vydané aplikace; nový nativní formulář vyžaduje nové sestavení iOS aplikace.

Nasazeno: Dr. Závlaha verze 131 (zdroj `2429a6f1609b28890fc4c3f185ca4a71de82be47`, nasazení `appgdep_6af9ed94cb78819189c0a1210c995a7a`); Dr. Garden verze 51 (zdroj `3835348db7b1fba347b20cfd8a75af561bc80712`, nasazení `appgdep_6af9edabee54819187babd6962caa65d`). Obě nasazení úspěšná. GitHub změny: [PR #14](https://github.com/Lbssdlk94/Pracovni-denik/pull/14), navazuje na #13.

Nativní build [43741830189](https://github.com/Lbssdlk94/Pracovni-denik/actions/runs/43741830189) se nespustil ani k prvnímu kroku: GitHub hlásí neúspěšnou platbu nebo nutnost zvýšit limit čerpání. Nejde o úspěšně sestavenou IPA; XCTest zatím není ověřený. Serverové pravidlo je již nasazené nezávisle na tomto buildu.
