import XCTest

final class APIDashboardUITests:XCTestCase {
    override func setUp(){super.setUp();continueAfterFailure=false}
    private func launch(worker:Bool=false,extra:[String]=[])->XCUIApplication {
        let app=XCUIApplication();app.launchArguments=["--native-api-testing","--native-dashboard-capture-testing"]+(worker ? ["--native-api-worker-testing"] : [])+extra;app.launch()
        XCTAssertTrue(app.staticTexts["native-overview-title"].waitForExistence(timeout:15))
        return app
    }
    private func capture(_ name:String,_ app:XCUIApplication){let attachment=XCTAttachment(screenshot:app.screenshot());attachment.name=name;attachment.lifetime = .keepAlways;add(attachment)}
    private func reveal(_ element:XCUIElement,in app:XCUIApplication){
        XCTAssertTrue(element.waitForExistence(timeout:10))
        let top=app.navigationBars.firstMatch.frame.maxY+8,bottom=app.tabBars.firstMatch.frame.minY-8
        for _ in 0..<12 {
            let f=element.frame
            if element.isHittable && f.midY>top && f.midY<bottom{return}
            let offset:CGFloat=f.midY>=bottom ? -130 : 100
            let point=app.coordinate(withNormalizedOffset:CGVector(dx:0.8,dy:0.5))
            point.press(forDuration:0.1,thenDragTo:point.withOffset(CGVector(dx:0,dy:offset)),withVelocity:.slow,thenHoldForDuration:0.1)
        }
        XCTAssertTrue(element.isHittable,app.debugDescription)
    }
    func testManagerDashboardAndPersonalSwitch(){
        let app=launch();XCTAssertTrue(app.staticTexts["Firemní přehled"].exists)
        XCTAssertTrue(app.staticTexts["Pracovníci v práci"].waitForExistence(timeout:10));capture("dashboard-company-light",app)
        app.segmentedControls["dashboard-mode"].buttons["Moje práce"].tap()
        XCTAssertTrue(app.staticTexts["Moje docházka"].waitForExistence(timeout:10));capture("dashboard-owner-personal",app)
        app.segmentedControls["dashboard-mode"].buttons["Firma"].tap()
        XCTAssertTrue(app.staticTexts["Pracovníci v práci"].waitForExistence(timeout:10))
        XCTAssertEqual(app.tabBars.buttons.count,5)
    }
    func testWorkerStartsTheExistingAttendanceDay(){
        let app=launch(worker:true,extra:["--native-api-before-day-testing"])
        XCTAssertFalse(app.segmentedControls["dashboard-mode"].exists)
        let action=app.buttons["dashboard-attendance-action"];XCTAssertTrue(action.waitForExistence(timeout:10));XCTAssertEqual(action.label,"Zahájit pracovní den");capture("dashboard-worker-before-day",app)
        action.tap();expectation(for:NSPredicate(format:"label == %@","Ukončit pracovní den"),evaluatedWith:action);waitForExpectations(timeout:10)
    }
    func testCurrentJobOpensDirectlyAndKeepsPersonalWorkSeparate(){
        let app=launch(worker:true,extra:["--native-api-work-dashboard-testing"])
        let job=app.buttons["dashboard-current-job"];reveal(job,in:app);capture("dashboard-worker-current-job",app);job.tap()
        XCTAssertTrue(app.navigationBars["Detail zakázky"].waitForExistence(timeout:10));XCTAssertFalse(app.navigationBars["Zakázky"].exists);XCTAssertFalse(app.tabBars.firstMatch.exists);XCTAssertEqual(app.buttons["job-primary-action"].label,"Ukončit práci")
    }
    func testBreakAndResumeUseTheExistingWorkTimeEditor(){
        let app=launch(worker:true,extra:["--native-api-work-dashboard-testing"])
        let pause=app.buttons["Zahájit přestávku"];XCTAssertTrue(pause.waitForExistence(timeout:10));pause.tap()
        XCTAssertTrue(app.navigationBars["Přestávka"].waitForExistence(timeout:10));app.buttons["Potvrdit pro vybrané pracovníky"].tap()
        let resume=app.buttons["Ukončit přestávku"];XCTAssertTrue(resume.waitForExistence(timeout:10));capture("dashboard-worker-break",app);resume.tap()
        XCTAssertTrue(app.navigationBars["Zahájit práci"].waitForExistence(timeout:10));app.buttons["Potvrdit pro vybrané pracovníky"].tap();XCTAssertTrue(pause.waitForExistence(timeout:10))
    }
    func testPersonalStopDoesNotFinishTheGlobalJob(){
        let app=launch(worker:true,extra:["--native-api-work-dashboard-testing"])
        let stop=app.buttons["job-primary-action"];reveal(stop,in:app);XCTAssertEqual(stop.label,"Ukončit práci");stop.tap()
        XCTAssertTrue(app.navigationBars["Ukončit práci"].waitForExistence(timeout:10));app.buttons["Potvrdit pro vybrané pracovníky"].tap()
        let depart=app.buttons["job-primary-action"];expectation(for:NSPredicate(format:"label == %@","Vyrazit na zakázku"),evaluatedWith:depart);waitForExpectations(timeout:10)
        XCTAssertTrue(app.tabBars.buttons["Přehled"].exists)
    }
    func testWorkerTravelAndEmptyDay(){
        let app=launch(worker:true,extra:["--native-api-work-dashboard-testing","--native-api-travel-testing"])
        let action=app.buttons["job-primary-action"];reveal(action,in:app);XCTAssertEqual(action.label,"Jsem na místě");capture("dashboard-worker-travel",app)
        app.terminate();app.launchArguments=["--native-api-testing","--native-dashboard-capture-testing","--native-api-worker-testing","--native-api-no-jobs-testing"];app.launch()
        let empty=app.staticTexts["Dnes bez naplánovaných návštěv."];reveal(empty,in:app);capture("dashboard-worker-empty",app)
    }
    func testOfflineDashboardPreservesQueueAndShowsStoredData(){
        let app=launch(worker:true,extra:["--native-api-work-dashboard-testing","--native-api-offline-dashboard-testing"])
        let action=app.buttons["dashboard-attendance-action"];XCTAssertTrue(action.waitForExistence(timeout:10));XCTAssertFalse(action.isEnabled)
        app.buttons["Zahájit přestávku"].tap();app.buttons["Potvrdit pro vybrané pracovníky"].tap()
        XCTAssertTrue(app.buttons["Ukončit přestávku"].waitForExistence(timeout:10));capture("dashboard-worker-offline",app)
    }
    func testManagerAndWorkerDarkAppearance(){
        let app=launch(extra:["--native-ui-dark-testing","--native-api-work-dashboard-testing"])
        XCTAssertTrue(app.staticTexts["Pracovníci v práci"].waitForExistence(timeout:10));capture("dashboard-company-dark",app)
        app.segmentedControls["dashboard-mode"].buttons["Moje práce"].tap();XCTAssertTrue(app.staticTexts["Moje docházka"].waitForExistence(timeout:10));capture("dashboard-worker-dark",app)
    }
    func testDashboardErrorDoesNotBlockTheOtherModules(){
        let app=launch(extra:["--native-api-overview-error-testing"])
        XCTAssertTrue(app.buttons["Zkusit znovu"].waitForExistence(timeout:10));capture("dashboard-error-state",app)
        app.tabBars.buttons["Zákazníci"].tap()
        XCTAssertTrue(app.staticTexts["Jan Kortus – ukázka"].firstMatch.waitForExistence(timeout:10))
    }

}
