# Zelená ikona podle vizuálního návrhu — 23. 10. 2026

Nová ikona: jednoduchý tmavě zelený monogram #193F3B na bílém podkladu podle dodané předlohy, vektorově překreslený pro ostré zobrazení. Starý modrý zápisník je archivován. Společný SVG zdroj vytváří značku v rozhraní, favicon, Apple touch ikonu 180 px, PWA 192/512 a maskable varianty, plus export 1024 a 32/48 px. Shodné výstupy pro Dr. Závlahu, Dr. Garden, Test, Super Admin a šablonu budoucích firem.

Změny: assets/app-icon/approved-mark.svg a approved-master.png; scripts/prepare-app-icons.mjs; web/work-diary-icon*.png, work-diary-mark.svg, index.html, manifest.webmanifest, sw.js; verze odkazů v app.js a overview-ui.js; v Super Adminu favicon/Apple ikona v index.html a značka v admin.js. Verzování green-icon-v1 brání načtení staré cache. Push používá novou ikonu. Funkce aplikace, název Pracovní deník při instalaci, PWA identita a provozní data nezměněny.

Kontroly PASS: neprůhlednost a rozměry všech variant, shoda v pěti sadách assetů, Android 80% safe circle, odpovědi skutečných sestavených Workerů (200, MIME, správné PNG), manifest/apple/favicon/SVG/cache/push odkazy; build všech tří firemních instalací a Super Admina; autentizovaný start a odmítnutí anonymního API na izolované databázi; Chromium test všech pěti rolí při 390/430/1440 px, reload, online/offline a navigace podle oprávnění. Žádné testovací zápisy do produkčních dat.

Omezení: bez skutečného iPhonu, Safari a Androidu; domácí systémové masky a instalace na skutečnou plochu neověřeny. Již uložená ikona na iOS se nemusí aktualizovat automaticky, nové přidání použije novou ikonu. Lokální databáze a koncepty nejsou mazány.
