import XCTest

final class APISecondaryUITests:XCTestCase {
    func launch(dark:Bool=false)->XCUIApplication {
        continueAfterFailure=false
        let app=XCUIApplication();app.launchArguments=["--native-api-testing"]+(dark ? ["--native-ui-dark-testing"]:[]);app.launch()
        XCTAssertTrue(app.staticTexts["native-overview-title"].waitForExistence(timeout:15));return app
    }
    func capture(_ name:String,_ app:XCUIApplication){let attachment=XCTAttachment(screenshot:app.screenshot());attachment.name=name;attachment.lifetime = .keepAlways;add(attachment)}
    func testSettingsAppearanceAndGroupedMoreRemainNative(){
        let app=launch();app.tabBars.buttons["Více"].tap();app.buttons["Nastavení"].tap()
        let appearance=app.descendants(matching:.any).matching(identifier:"settings-appearance").firstMatch
        XCTAssertTrue(appearance.waitForExistence(timeout:10));XCTAssertEqual(app.webViews.count,0);capture("secondary-settings-light",app)
    }
    func testCompactCustomerDetailKeepsContactAndRelatedGardens(){
        let app=launch(dark:true);app.tabBars.buttons["Zákazníci"].tap();app.staticTexts["Jan Kortus – ukázka"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Zahrady"].waitForExistence(timeout:10));XCTAssertEqual(app.webViews.count,0);capture("secondary-customer-dark",app)
    }
    func testNewJobRetainsRequiredFieldsAndDraftClose(){
        let app=launch();app.tabBars.buttons["Zakázky"].tap();app.buttons["Nová zakázka"].tap()
        XCTAssertTrue(app.staticTexts["ZÁKLADNÍ ÚDAJE"].exists || app.staticTexts["Základní údaje"].exists)
        XCTAssertTrue(app.buttons["Zavřít"].waitForExistence(timeout:10));capture("secondary-job-form",app)
        app.buttons["Zavřít"].tap();app.buttons["Zahodit koncept"].tap();XCTAssertTrue(app.buttons["Nová zakázka"].waitForExistence(timeout:10))
    }
    func testWorkerCanExportOwnAttendanceWithoutTeamControls(){
        continueAfterFailure=false
        let app=XCUIApplication();app.launchArguments=["--native-api-testing","--native-api-attendance-redesign-testing","--native-api-worker-testing"];app.launch()
        XCTAssertTrue(app.staticTexts["native-overview-title"].waitForExistence(timeout:15))
        app.tabBars.buttons["Více"].tap();app.buttons["Nastavení"].tap()
        let link=app.buttons["Export mé docházky"];XCTAssertTrue(link.waitForExistence(timeout:10));if !link.isHittable{app.swipeUp()};link.tap()
        let save=app.buttons["personal-export-save"];XCTAssertTrue(save.waitForExistence(timeout:10));XCTAssertTrue(save.isEnabled)
        XCTAssertFalse(app.segmentedControls["attendance-mode"].exists);XCTAssertEqual(app.webViews.count,0);capture("secondary-personal-export",app)
    }
}
