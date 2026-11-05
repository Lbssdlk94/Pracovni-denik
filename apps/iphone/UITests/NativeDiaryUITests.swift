import XCTest

final class NativeDiaryUITests: XCTestCase {
    @MainActor
    private func launch() -> XCUIApplication {
        let app = XCUIApplication(); app.launchArguments = ["--native-ui-testing"]; app.launch()
        XCTAssertTrue(app.buttons["Přehled"].waitForExistence(timeout: 25), app.debugDescription)
        return app
    }
    @MainActor
    func testNativeOverviewListAndDetail() {
        let app = launch()
        XCTAssertTrue(app.staticTexts["Pracovní deník"].exists)
        let overview = XCTAttachment(screenshot: app.screenshot()); overview.name = "SwiftUI-prehled"; overview.lifetime = .keepAlways; add(overview)
        app.buttons["Zakázky"].tap()
        let customer = app.buttons["native-job-fixture-progress"]
        XCTAssertTrue(customer.waitForExistence(timeout: 15));
        let jobs = XCTAttachment(screenshot: app.screenshot()); jobs.name = "SwiftUI-zakazky"; jobs.lifetime = .keepAlways; add(jobs)
        customer.tap()
        XCTAssertTrue(app.navigationBars["Detail zakázky"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Práce 09:00 · 60 min"].exists)
        XCTAssertTrue(app.staticTexts["Příjezd 10:00–11:00"].exists)
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Ventil čeká na výměnu"].waitForExistence(timeout: 10))
        let detail = XCTAttachment(screenshot: app.screenshot()); detail.name = "SwiftUI-detail"; detail.lifetime = .keepAlways; add(detail)
    }
    @MainActor
    func testNativeFormHandoffDoesNotDiscardAnOpenForm() {
        let app = launch(); app.buttons["Více"].tap(); app.buttons["Zákazníci"].tap()
        let field = app.textFields.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-field-")).firstMatch
        guard field.waitForExistence(timeout:15) else { XCTFail("Native form missing: \(app.debugDescription)");return }
        XCTAssertTrue(app.staticTexts["Engine visibility: visible"].exists); field.tap(); field.typeText("Zachovat zapis")
        let form = XCTAttachment(screenshot:app.screenshot());form.name="SwiftUI-native-form";form.lifetime = .keepAlways;add(form)
        app.buttons["native-screen-back"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 10)); XCTAssertEqual(field.value as? String, "Zachovat zapis")
        app.buttons.matching(NSPredicate(format:"identifier BEGINSWITH %@ AND label == %@","native-control-","Zavřít formulář")).firstMatch.tap()
        app.buttons["native-screen-back"].tap()
        XCTAssertTrue(app.buttons["Přehled"].waitForExistence(timeout: 15))
    }
    @MainActor
    func testNativePushSettingsExplainMissingAppleConfigurationWithoutRequestingPermission() {
        let app=launch();app.buttons["Více"].tap();app.swipeUp()
        let settings=app.buttons["native-push-settings"];XCTAssertTrue(settings.waitForExistence(timeout:10));settings.tap()
        XCTAssertTrue(app.staticTexts["native-push-not-configured"].waitForExistence(timeout:15))
        XCTAssertFalse(app.buttons["Zapnout oznámení"].isEnabled)
        let image=XCTAttachment(screenshot:app.screenshot());image.name="SwiftUI-native-push-settings";image.lifetime = .keepAlways;add(image)
    }
    @MainActor
    func testNativePaginationShowsTheExistingJobsOnce() {
        let app = launch(); app.buttons["Zakázky"].tap()
        let more = app.buttons["Načíst další zakázky"]
        if !more.waitForExistence(timeout: 10) { app.swipeUp() }
        more.tap()
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Důvod: Chyběl materiál"].waitForExistence(timeout: 10))
    }
    @MainActor
    func testProtocolUsesNativeSheetAndOnePrimarySaveAction() {
        let app = launch(); app.buttons["Zakázky"].tap()
        let customer = app.buttons["native-job-fixture-progress"]; XCTAssertTrue(customer.waitForExistence(timeout: 15)); customer.tap()
        let protocolButton = app.buttons["Servisní protokol"]
        for _ in 0..<4 { if protocolButton.isHittable { break }; app.swipeUp() }
        protocolButton.tap()
        XCTAssertTrue(app.navigationBars["Servisní protokol"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label == %@", "Uložit")).count, 1)
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "SwiftUI-protokol-sheet"; image.lifetime = .keepAlways; add(image)
        app.buttons["native-modal-close"].tap()
        XCTAssertFalse(app.navigationBars["Servisní protokol"].exists)
    }
    @MainActor
    func testOpeningAndCancellingEmptyArrivalTimeDoesNotFillIt() {
        let app = launch(); app.buttons["Zakázky"].tap()
        let customer = app.buttons["native-job-fixture-progress"]; XCTAssertTrue(customer.waitForExistence(timeout: 15)); customer.tap()
        let depart = app.buttons["Jsem na cestě"]; XCTAssertTrue(depart.waitForExistence(timeout: 10)); depart.tap()
        let time = app.buttons["native-field-id:fixture-arrival"]; XCTAssertTrue(time.waitForExistence(timeout: 15)); time.tap()
        app.buttons["Zrušit"].tap()
        XCTAssertTrue(app.buttons["native-field-id:fixture-arrival"].label.contains("Vybrat čas"))
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "SwiftUI-presny-prijezd"; image.lifetime = .keepAlways; add(image)
    }

}
