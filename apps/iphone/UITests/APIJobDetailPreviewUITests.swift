import XCTest

final class APIJobDetailPreviewUITests:XCTestCase {
    override func setUp(){super.setUp();continueAfterFailure=false}
    private func launch(_ arguments:[String]=[])->XCUIApplication {
        let app=XCUIApplication();app.launchArguments=["--native-job-detail-preview"]+arguments;app.launch()
        XCTAssertTrue(app.staticTexts["Realizace – Pan Petřík"].waitForExistence(timeout:15))
        XCTAssertTrue(app.buttons["job-primary-action"].waitForExistence(timeout:10))
        return app
    }
    private func capture(_ name:String,_ app:XCUIApplication){let attachment=XCTAttachment(screenshot:app.screenshot());attachment.name=name;attachment.lifetime = .keepAlways;add(attachment)}
    func testLightDetailPreview(){let app=launch();XCTAssertEqual(app.buttons["job-primary-action"].label,"Ukončit práci");capture("detail-swiftui-light",app);app.swipeUp();capture("detail-swiftui-workers-light",app);app.swipeUp();capture("detail-swiftui-groups-light",app)}
    func testDarkDetailPreview(){let app=launch(["--preview-dark"]);capture("detail-swiftui-dark",app);app.swipeUp();capture("detail-swiftui-workers-dark",app);app.swipeUp();capture("detail-swiftui-groups-dark",app)}
    func testTravelAndPausedActions(){let app=launch(["--preview-travel"]);XCTAssertEqual(app.buttons["job-primary-action"].label,"Jsem na místě");capture("detail-swiftui-travel",app);app.terminate();app.launchArguments=["--native-job-detail-preview","--preview-paused","--preview-dark"];app.launch();let action=app.buttons["job-primary-action"];XCTAssertTrue(action.waitForExistence(timeout:15));XCTAssertEqual(action.label,"Pokračovat v práci");capture("detail-swiftui-paused",app)}
    func testLargeTypeOfflinePreview(){let app=launch(["--preview-large-text","--preview-offline"]);capture("detail-swiftui-large-type",app);XCTAssertEqual(app.webViews.count,0);XCTAssertTrue(app.buttons["job-primary-action"].isHittable)}
    func testPersonalStopPreservesOpenJobAndReturnsToDetail(){
        let app=launch();app.buttons["job-primary-action"].tap()
        XCTAssertTrue(app.navigationBars["Ukončit práci"].waitForExistence(timeout:10))
        app.buttons["Potvrdit pro vybrané pracovníky"].tap()
        let action=app.buttons["job-primary-action"]
        expectation(for:NSPredicate(format:"label == %@","Vyrazit na zakázku"),evaluatedWith:action)
        waitForExpectations(timeout:10)
        XCTAssertTrue(app.staticTexts["Realizace – Pan Petřík"].exists)
        XCTAssertFalse(app.tabBars.firstMatch.exists)
        capture("detail-swiftui-my-work-stopped",app)
    }
    func testMaterialUsesTheExistingEditorFromItsDetail(){
        let app=launch()
        let material=app.buttons.matching(NSPredicate(format:"label BEGINSWITH %@","Připravenost materiálu")).firstMatch
        for _ in 0..<5{if material.isHittable{break};app.swipeUp()}
        XCTAssertTrue(material.isHittable);material.tap()
        let update=app.buttons["Aktualizovat připravenost"];XCTAssertTrue(update.waitForExistence(timeout:10));update.tap()
        XCTAssertTrue(app.buttons["Potvrdit"].waitForExistence(timeout:10))
        capture("detail-swiftui-material-editor",app)
    }

}
