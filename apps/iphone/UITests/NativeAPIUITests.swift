import XCTest

final class NativeAPIUITests:XCTestCase {
    func launch()->XCUIApplication{let app=XCUIApplication();app.launchArguments=["--native-api-testing"];app.launch();XCTAssertTrue(app.staticTexts["native-overview-title"].waitForExistence(timeout:15));XCTAssertEqual(app.webViews.count,0,"Native client must never embed a web application");return app}
    func capture(_ name:String,_ app:XCUIApplication){let image=XCTAttachment(screenshot:app.screenshot());image.name=name;image.lifetime = .keepAlways;add(image)}
    func testOverviewAndPersistentFiveTabs(){let app=launch();for tab in ["Přehled","Zakázky","Docházka","Zákazníci","Více"]{XCTAssertTrue(app.tabBars.buttons[tab].exists)};capture("prehled-api",app)}
    func testJobTimeIsNativeAndKeepsFiveTabs(){
        let app=launch();app.tabBars.buttons["Zakázky"].tap();let job=app.buttons["native-job-fixture-progress"];XCTAssertTrue(job.waitForExistence(timeout:10));job.tap()
        let time=app.buttons["Pracovní doba"];if !time.isHittable{app.swipeUp()};XCTAssertTrue(time.waitForExistence(timeout:10));time.tap()
        XCTAssertTrue(app.staticTexts["Člověkohodiny · doprava a přestávky jsou zvlášť."].waitForExistence(timeout:10));XCTAssertTrue(app.tabBars.buttons["Zákazníci"].exists);XCTAssertEqual(app.webViews.count,0);capture("pracovni-doba-api",app)
    }
    func testJobsAndNativeDetail(){let app=launch();app.tabBars.buttons["Zakázky"].tap();let job=app.buttons["native-job-fixture-progress"];XCTAssertTrue(job.waitForExistence(timeout:10));job.tap();XCTAssertTrue(app.buttons["Servisní protokol"].waitForExistence(timeout:10));XCTAssertTrue(app.tabBars.buttons["Přehled"].exists);XCTAssertEqual(app.webViews.count,0);capture("detail-api",app)}
    func testCompletionEstimateUsesNativeSheetAndStaysInJobDetail(){
        let app=launch();app.tabBars.buttons["Zakázky"].tap();let job=app.buttons["native-job-fixture-progress"];XCTAssertTrue(job.waitForExistence(timeout:10));job.tap()
        let edit=app.buttons["Upravit odhad"];XCTAssertTrue(edit.waitForExistence(timeout:10));for _ in 0..<5{if edit.isHittable{break};app.swipeUp()};XCTAssertTrue(edit.isHittable);edit.tap()
        XCTAssertTrue(app.navigationBars["Dokončení zakázky"].waitForExistence(timeout:10))
        let slider=app.sliders["Odhad dokončení v procentech"];XCTAssertTrue(slider.waitForExistence(timeout:10));slider.adjust(toNormalizedSliderPosition:0.3)
        capture("odhad-dokonceni-api",app);app.buttons["Uložit odhad"].tap()
        XCTAssertTrue(app.buttons["Upravit odhad"].waitForExistence(timeout:10));XCTAssertTrue(app.tabBars.buttons["Zákazníci"].exists);XCTAssertTrue(app.buttons["Servisní protokol"].exists);XCTAssertEqual(app.webViews.count,0)
        capture("detail-s-odhadem-api",app)
    }
    func testCustomerContactAndTwoGardens(){let app=launch();app.tabBars.buttons["Zákazníci"].tap();let row=app.staticTexts["Jan Kortus – ukázka"].firstMatch;XCTAssertTrue(row.waitForExistence(timeout:10));capture("zakaznici-api",app);row.tap();XCTAssertTrue(app.staticTexts["Zahrady"].waitForExistence(timeout:10));XCTAssertEqual(app.webViews.count,0);capture("zakaznik-detail-api",app)}
    func testMoreAndSettingsProgressiveDisclosure(){let app=launch();app.tabBars.buttons["Více"].tap();XCTAssertTrue(app.buttons["Nastavení"].waitForExistence(timeout:10));capture("vice-api",app);app.buttons["Nastavení"].tap();XCTAssertTrue(app.staticTexts["Moje přihlášení"].waitForExistence(timeout:10));XCTAssertEqual(app.webViews.count,0);capture("nastaveni-api",app)}
    func testNewJobCanCloseWithoutCreatingRecord(){let app=launch();app.tabBars.buttons["Zakázky"].tap();let add=app.buttons["Nová zakázka"];XCTAssertTrue(add.waitForExistence(timeout:10));add.tap();XCTAssertTrue(app.buttons["Zavřít"].waitForExistence(timeout:10));app.buttons["Zavřít"].tap();app.buttons["Zahodit koncept"].tap();XCTAssertTrue(app.buttons["Nová zakázka"].waitForExistence(timeout:10));XCTAssertEqual(app.webViews.count,0)}
    func testProtocolFormIsNativeAndKeepsTabNavigationUnderSheet(){let app=launch();app.tabBars.buttons["Zakázky"].tap();let job=app.buttons["native-job-fixture-progress"];XCTAssertTrue(job.waitForExistence(timeout:10));job.tap();app.buttons["Servisní protokol"].tap();let work=app.textViews["Provedené práce"];XCTAssertTrue(work.waitForExistence(timeout:10));work.tap();work.typeText("Kontrola a seřízení systému.");XCTAssertEqual(app.webViews.count,0);capture("protokol-api",app);app.buttons["Zavřít"].tap();XCTAssertTrue(app.tabBars.buttons["Zakázky"].waitForExistence(timeout:10))}
    func testAttendanceDaysAndMoreNativeModules(){let app=launch();app.tabBars.buttons["Docházka"].tap();XCTAssertTrue(app.staticTexts["Pracovní dny"].waitForExistence(timeout:10));capture("dochazka-api",app);app.tabBars.buttons["Více"].tap();let agenda=app.buttons["Firemní agenda"];XCTAssertTrue(agenda.waitForExistence(timeout:10));agenda.tap();app.buttons["Materiál"].tap();XCTAssertTrue(app.staticTexts["Rotační tryska"].waitForExistence(timeout:10));XCTAssertEqual(app.webViews.count,0);capture("material-api",app)}

    func testQuickDepartureRequiresExactTimeAndCanBeCancelled(){
        let app=launch();app.tabBars.buttons["Zakázky"].tap()
        let depart=app.buttons["Jsem na cestě"].firstMatch
        XCTAssertTrue(depart.waitForExistence(timeout:10));depart.tap()
        XCTAssertTrue(app.navigationBars["Jsem na cestě"].waitForExistence(timeout:10))
        app.buttons["Potvrdit odjezd"].tap()
        XCTAssertTrue(app.staticTexts["Zadejte přesný čas HH:mm."].waitForExistence(timeout:10))
        capture("odjezd-api",app);app.buttons["Zavřít"].tap()
        XCTAssertTrue(app.buttons["native-job-fixture-progress"].waitForExistence(timeout:10))
        XCTAssertEqual(app.webViews.count,0)
    }
    func testSavedProtocolCanBeReopenedWithoutWebRuntime(){
        let app=launch();app.tabBars.buttons["Zakázky"].tap()
        let job=app.buttons["native-job-fixture-progress"];XCTAssertTrue(job.waitForExistence(timeout:10));job.tap()
        app.buttons["Servisní protokol"].tap()
        let work=app.textViews["Provedené práce"];XCTAssertTrue(work.waitForExistence(timeout:10));work.tap();work.typeText("Ověřený nativní zápis.")
        app.swipeUp();let save=app.buttons["Uložit rozpracovaný protokol"];if !save.isHittable{app.swipeUp()};XCTAssertTrue(save.waitForExistence(timeout:10));save.tap()
        XCTAssertTrue(app.buttons["Servisní protokol"].waitForExistence(timeout:10));app.buttons["Servisní protokol"].tap()
        let restored=app.textViews["Provedené práce"];XCTAssertTrue(restored.waitForExistence(timeout:10));XCTAssertEqual(restored.value as? String,"Ověřený nativní zápis.");XCTAssertEqual(app.webViews.count,0)
    }

    func testReaderAppearancePreviewHasAnAlwaysAvailableReturnToActualRole(){
        let app=launch();let picker=app.buttons["role-preview-picker"].firstMatch;XCTAssertTrue(picker.waitForExistence(timeout:10));picker.tap();app.buttons["Čtenář"].tap()
        XCTAssertTrue(app.staticTexts["Náhled: Čtenář"].waitForExistence(timeout:10));XCTAssertTrue(app.buttons["Zpět k mojí roli"].exists)
        app.tabBars.buttons["Více"].tap();XCTAssertFalse(app.buttons["Tým"].exists);capture("nahled-ctenar-api",app)
        app.buttons["Zpět k mojí roli"].firstMatch.tap();XCTAssertTrue(app.staticTexts["native-overview-title"].waitForExistence(timeout:10));XCTAssertFalse(app.staticTexts["Náhled: Čtenář"].exists)
    }

    func testPrimaryCompletionStaysInDetailAndKeepsBottomNavigation(){
        let app=launch();app.tabBars.buttons["Zakázky"].tap()
        let job=app.buttons["native-job-fixture-progress"];XCTAssertTrue(job.waitForExistence(timeout:10));job.tap()
        let primary=app.buttons["job-primary-action"];XCTAssertTrue(primary.waitForExistence(timeout:10));XCTAssertEqual(primary.label,"Hotovo")
        primary.tap();XCTAssertTrue(app.navigationBars["Změnit stav"].waitForExistence(timeout:10))
        XCTAssertEqual(app.buttons["Potvrdit změnu"].value as? String,"Hotovo",app.debugDescription)
        app.buttons["Potvrdit změnu"].tap()
        XCTAssertTrue(app.buttons["Servisní protokol"].waitForExistence(timeout:10))
        let completed=NSPredicate(format:"exists == false")
        expectation(for:completed,evaluatedWith:app.buttons["job-primary-action"])
        waitForExpectations(timeout:10)
        XCTAssertTrue(app.tabBars.buttons["Zákazníci"].exists)
        XCTAssertEqual(app.webViews.count,0);capture("detail-po-dokonceni-api",app)
    }
    func testGalleryRemainsAvailableWithDriveDisabled(){
        let app=launch();app.tabBars.buttons["Zakázky"].tap()
        let job=app.buttons["native-job-fixture-progress"];XCTAssertTrue(job.waitForExistence(timeout:10));job.tap()
        let gallery=app.buttons["Fotodokumentace"];if !gallery.isHittable{app.swipeUp()}
        XCTAssertTrue(gallery.waitForExistence(timeout:10));gallery.tap()
        XCTAssertTrue(app.buttons["Vybrat fotografii"].waitForExistence(timeout:10))
        XCTAssertTrue(app.tabBars.buttons["Přehled"].exists)
        XCTAssertEqual(app.webViews.count,0);capture("fotodokumentace-bez-disku-api",app)
    }

    func testReaderCanOpenDiaryEditorWithoutJobManagementActions(){
        let app=XCUIApplication();app.launchArguments=["--native-api-testing","--native-api-reader-testing"];app.launch()
        XCTAssertTrue(app.staticTexts["native-overview-title"].waitForExistence(timeout:15));app.tabBars.buttons["Zakázky"].tap()
        let job=app.buttons["native-job-fixture-progress"];XCTAssertTrue(job.waitForExistence(timeout:10));job.tap()
        let diary=app.buttons["Deník realizace"];XCTAssertTrue(diary.waitForExistence(timeout:10));if !diary.isHittable{app.swipeUp()};diary.tap()
        let add=app.buttons["Přidat dnešní zápis"];XCTAssertTrue(add.waitForExistence(timeout:10));add.tap()
        XCTAssertTrue(app.textViews["Co se udělalo"].waitForExistence(timeout:10))
        for _ in 0..<3{if app.buttons["Vybrat fotografii"].exists{break};app.swipeUp()};XCTAssertTrue(app.buttons["Vybrat fotografii"].exists);XCTAssertFalse(app.buttons["Smazat zápis"].exists);XCTAssertEqual(app.webViews.count,0)
        capture("denik-ctenar-api",app)
    }

}
