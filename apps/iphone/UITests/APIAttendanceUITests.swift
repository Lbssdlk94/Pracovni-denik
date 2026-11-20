import XCTest

final class APIAttendanceUITests:XCTestCase {
    override func setUp(){super.setUp();continueAfterFailure=false}
    private func launch(worker:Bool=false,extra:[String]=[])->XCUIApplication{
        let app=XCUIApplication();app.launchArguments=["--native-api-testing","--native-api-attendance-redesign-testing","--native-dashboard-capture-testing"]+(worker ? ["--native-api-worker-testing"] : [])+extra;app.launch()
        XCTAssertTrue(app.staticTexts["native-overview-title"].waitForExistence(timeout:15));app.tabBars.buttons["Docházka"].tap();XCTAssertTrue(app.buttons["attendance-month"].waitForExistence(timeout:15));return app
    }
    private func label(_ expected:String,_ element:XCUIElement){expectation(for:NSPredicate(format:"label == %@",expected),evaluatedWith:element);waitForExpectations(timeout:15)}
    private func capture(_ name:String,_ app:XCUIApplication){let a=XCTAttachment(screenshot:app.screenshot());a.name=name;a.lifetime = .keepAlways;add(a)}
    private func reveal(_ element:XCUIElement,_ app:XCUIApplication){for _ in 0..<12{if element.exists && element.isHittable && element.frame.midY<app.tabBars.firstMatch.frame.minY{return};app.swipeUp()};XCTAssertTrue(element.waitForExistence(timeout:5));XCTAssertTrue(element.isHittable)}
    func testWorkerLiveCardAndBreakResumeUseExistingLedger(){
        let app=launch(worker:true,extra:["--native-ui-dark-testing"]);XCTAssertFalse(app.segmentedControls["attendance-mode"].exists);XCTAssertTrue(app.staticTexts["attendance-live-clock"].exists);capture("attendance-worker-dark",app)
        let pause=app.buttons["attendance-break"];reveal(pause,app);pause.tap();XCTAssertTrue(app.buttons.matching(identifier:"attendance-break").firstMatch.waitForExistence(timeout:10));label("Ukončit přestávku",app.buttons["attendance-break"]);app.buttons["attendance-break"].tap();label("Zahájit přestávku",app.buttons["attendance-break"])
    }
    func testManagerCanSwitchTeamAndOpenEmployee(){
        let app=launch();app.segmentedControls["attendance-mode"].buttons["Celý tým"].tap()
        let worker=app.buttons["attendance-person-attendance-marek"];reveal(worker,app);capture("attendance-manager-team",app);worker.tap();XCTAssertTrue(app.navigationBars["Docházka"].waitForExistence(timeout:10));XCTAssertEqual(app.webViews.count,0)
    }
    func testCalendarAndPreviousMonth(){
        let app=launch();let before=app.buttons["attendance-month"].label;app.buttons["Předchozí měsíc"].tap();XCTAssertNotEqual(app.buttons["attendance-month"].label,before);app.buttons["attendance-month"].tap();XCTAssertTrue(app.navigationBars["Vybrat měsíc"].waitForExistence(timeout:10));XCTAssertTrue(app.datePickers.firstMatch.exists);capture("attendance-month-picker",app);app.buttons["Zobrazit"].tap()
    }
    func testDayDetailContainsTimelineAndDirectJobNavigation(){
        let app=launch(worker:true);let day=app.buttons.matching(NSPredicate(format:"identifier BEGINSWITH %@","attendance-day-")).firstMatch;reveal(day,app);day.tap();XCTAssertTrue(app.navigationBars["Pracovní den"].waitForExistence(timeout:10));capture("attendance-day-detail",app)
        let job=app.buttons["attendance-timeline-job-fixture-progress"].firstMatch;reveal(job,app);job.tap();XCTAssertTrue(app.navigationBars["Detail zakázky"].waitForExistence(timeout:10))
    }
    func testOldOpenShiftOffersCorrectionWithoutAutomaticDeparture(){
        let app=launch(worker:true,extra:["--native-api-overnight-testing"]);let warning=app.otherElements["attendance-unclosed-warning"];if !warning.exists{XCTAssertTrue(app.staticTexts["Neukončená docházka z předchozího dne"].waitForExistence(timeout:10))};capture("attendance-open-overnight",app);XCTAssertTrue(app.buttons["attendance-punch"].exists)
    }
    func testStartAndFinishOwnDay(){
        let app=launch(worker:true,extra:["--native-api-before-day-testing"]);let punch=app.buttons["attendance-punch"];reveal(punch,app);XCTAssertEqual(punch.label,"Zahájit pracovní den");punch.tap();label("Zaznamenat odchod",app.buttons["attendance-punch"]);app.buttons["attendance-punch"].tap();label("Zahájit pracovní den",app.buttons["attendance-punch"])
    }
    func testLargeTextAndMonthlyChartStayNative(){
        let app=launch(extra:["--native-jobs-large-text-testing"]);let period=app.segmentedControls["attendance-chart-period"];reveal(period,app);period.buttons["Zvolený měsíc"].tap();capture("attendance-large-chart",app);XCTAssertEqual(app.webViews.count,0)
    }
}
