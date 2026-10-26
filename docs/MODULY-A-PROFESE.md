# Moduly a profesní sekce

V Nastavení → Funkce aplikace je 36 jednotlivých přepínačů, sedm skupin funkcí, vyhledávání a šest oborových sekcí. Výběr oboru pouze filtruje zobrazení; tlačítko „Připravit zapnutí podle oboru“ připraví volby a teprve „Uložit nastavení týmu“ je uloží. Změna oboru zde nemění centrální licenci ani názvosloví firmy. Profesní šablonu a názvosloví nadále spravuje Super Admin → Profese / Firmy.

Nových deset podfunkcí: kalendář, časová osa, týden, tabulka, vytížení, fronta plánování, převzetí, výjezd/SMS, přidávání fotografií do protokolu a účtování práce/cesty. Každá má vlastní firemní volbu a dědí dostupnost licence Zakázky (`licenseParent: jobs`). Nemají nové samostatné obchodní licence; katalog v Super Adminu ukazuje podfunkce pod rodičem. To zachovává všechny dosavadní sjednané tarify a výchozí chování bez migrace.

Profese Závlahy zobrazuje i odborné funkce; ostatní oborové sekce společné nástroje. Nejde o nové implementace revizí elektro, výpočtů potrubí ani dalších specializovaných modulů.

Vypnutí nemaže zakázky, historii, fotografie, uložené sazby ani původní ceny protokolů. Zmizí ovládání; u fotografií protokolu se vypíná přidávání, starší dokumentace zůstává čitelná. U účtování se staré částky uchovávají při běžné úpravě protokolu. Server odmítá vypnuté převzetí, výjezd, frontu, sazby a nové fotografie protokolu i pokus změnit částky při vypnutém účtování. Vypnuté pohledy nahradí denní seznam; uložená preference pohledu se nemaže. Interní audit předání se uchovává i při vypnutí jeho uživatelského ovládání.

Správce/administrátor upravuje společná nastavení; prototyp materiálu a účtování smí nastavovat pouze vlastník. Pracovník ani čtenář nemůže nastavení firmy měnit. Licence rodiče, oddělení firem, role a verzování zápisů zůstávají kontrolované serverem. Nastavení, účet a bezpečná záloha pro vlastníka zůstávají přístupné.

Kontroly: nová regresní sada API nad izolovanou SQLite, původní sada testů, test podepsané licence, sestavení Workerů, prohlížečové testy v Chromiu se zápisem/obnovením nastavení, profesním filtrem bez zápisu, hledáním, vypnutím/obnovením pohledů, protokolem a rozměry 360/390/430/1280/1440 px. Skutečný iPhone nebyl k dispozici.
