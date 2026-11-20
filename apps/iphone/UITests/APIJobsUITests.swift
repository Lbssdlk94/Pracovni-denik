import XCTest

final class APIJobsUITests:XCTestCase {
    override func setUp(){super.setUp();continueAfterFailure=false}
    private func launch(worker:Bool=false,dark:Bool=false)->XCUIApplication{
        let app=XCUIApplication();app.launchArguments=["--native-api-testing","--native-api-jobs-redesign-testing","--native-dashboard-capture-testing"]+(worker ? ["--native-api-worker-testing"] : [])+(dark ? ["--native-ui-dark-testing"] : []);app.launch()
        XCTAssertTrue(app.staticTexts["native-overview-title"].waitForExistence(timeout:15));app.tabBars.buttons["Zakázky"].tap()
        XCTAssertTrue(app.buttons["native-job-fixture-progress"].waitForExistence(timeout:15));return app
    }
    private func capture(_ name:String,_ app:XCUIApplication){let a=XCTAttachment(screenshot:app.screenshot());a.name=name;a.lifetime = .keepAlways;add(a)}
    private func reveal(_ element:XCUIElement,in app:XCUIApplication){
        for _ in 0..<10{if element.exists && element.isHittable{return};app.swipeUp()}
        XCTAssertTrue(element.waitForExistence(timeout:5));XCTAssertTrue(element.isHittable)
    }
    func testManagerCompactListAndDirectDetail(){
        let app=launch();XCTAssertTrue(app.segmentedControls["jobs-team"].exists);XCTAssertFalse(app.switches["Všechny dny"].exists)
        XCTAssertTrue(app.buttons["jobs-filters"].exists);XCTAssertTrue(app.searchFields.firstMatch.exists);capture("jobs-manager-light",app)
        app.buttons["native-job-fixture-progress"].tap();XCTAssertTrue(app.navigationBars["Detail zakázky"].waitForExistence(timeout:10));XCTAssertFalse(app.tabBars.firstMatch.exists);XCTAssertEqual(app.webViews.count,0)
    }
    func testTodayTomorrowAndActiveInstallationFromPreviousMonth(){
        let app=launch();XCTAssertTrue(app.buttons["native-job-fixture-progress"].exists)
        app.segmentedControls["jobs-period"].buttons["Zítra"].tap()
        XCTAssertTrue(app.buttons["native-job-fixture-tomorrow"].waitForExistence(timeout:10));XCTAssertFalse(app.buttons["native-job-fixture-progress"].exists)
        app.segmentedControls["jobs-period"].buttons["Dnes"].tap();XCTAssertTrue(app.buttons["native-job-fixture-progress"].waitForExistence(timeout:10))
    }
    func testSearchAndNativeFilterSheet(){
        let app=launch();let search=app.searchFields.firstMatch;search.tap();search.typeText("petrik")
        XCTAssertTrue(app.buttons["native-job-fixture-progress"].waitForExistence(timeout:5));XCTAssertFalse(app.buttons["native-job-fixture-travel"].exists)
        // Cancel search before opening the existing native filter sheet.
        if app.buttons["Cancel"].exists{app.buttons["Cancel"].tap()}else if app.buttons["Zrušit"].exists{app.buttons["Zrušit"].tap()}else{search.buttons.firstMatch.tap()}
        app.buttons["jobs-filters"].tap();XCTAssertTrue(app.navigationBars["Filtry"].waitForExistence(timeout:10));capture("jobs-filter-sheet",app)
        let type=app.buttons["jobs-filter-type"];reveal(type,in:app);type.tap();app.buttons["Realizace"].firstMatch.tap()
        app.buttons["Zobrazit zakázky"].tap();XCTAssertTrue(app.navigationBars["Zakázky"].waitForExistence(timeout:10))
    }
    func testCompletedAreCollapsedAndCanBeExpanded(){
        let app=launch();let completed=app.buttons["jobs-completed"];reveal(completed,in:app)
        XCTAssertFalse(app.buttons["native-job-fixture-done"].exists);completed.tap();let job=app.buttons["native-job-fixture-done"];reveal(job,in:app);capture("jobs-completed-expanded",app);job.tap();XCTAssertTrue(app.navigationBars["Detail zakázky"].waitForExistence(timeout:10))
    }
    func testSwipeDoesNotExecuteAndContextMenuKeepsStateActions(){
        let app=launch();let job=app.buttons["native-job-fixture-progress"];job.swipeLeft()
        XCTAssertTrue(app.buttons["Navigovat"].firstMatch.waitForExistence(timeout:5));XCTAssertFalse(app.navigationBars["Pracovní akce"].exists)
        job.swipeRight();job.press(forDuration:1.2);XCTAssertTrue(app.buttons["Otevřít detail"].waitForExistence(timeout:5));XCTAssertTrue(app.buttons["Přeplánovat"].exists);capture("jobs-context-menu",app)
    }
    func testWorkerCannotUseTeamOrAdministrationAndOwnActionIsNative(){
        let app=launch(worker:true,dark:true);XCTAssertFalse(app.segmentedControls["jobs-team"].exists);XCTAssertFalse(app.buttons["Nová zakázka"].exists)
        capture("jobs-worker-dark",app);app.buttons["job-row-primary-fixture-progress"].tap();XCTAssertTrue(app.navigationBars["Výjezd"].waitForExistence(timeout:10));app.buttons["Zavřít"].tap();XCTAssertTrue(app.buttons["native-job-fixture-progress"].waitForExistence(timeout:10));XCTAssertEqual(app.webViews.count,0)
    }
    func testCalendarUsesNativeDateSelection(){
        let app=launch();app.buttons["jobs-calendar"].tap();XCTAssertTrue(app.navigationBars["Kalendář zakázek"].waitForExistence(timeout:10));XCTAssertTrue(app.datePickers.firstMatch.exists);capture("jobs-calendar",app);app.buttons["Zobrazit"].tap();XCTAssertTrue(app.buttons["native-job-fixture-next"].waitForExistence(timeout:10));XCTAssertFalse(app.buttons["native-job-fixture-progress"].exists)
    }
}
