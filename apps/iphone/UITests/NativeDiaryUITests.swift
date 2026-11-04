import XCTest

final class NativeDiaryUITests: XCTestCase {
    @MainActor
    private func launch() -> XCUIApplication {
        let app = XCUIApplication(); app.launchArguments = ["--native-ui-testing"]; app.launch()
        XCTAssertTrue(app.tabBars.buttons["Přehled"].waitForExistence(timeout: 25))
        return app
    }
    @MainActor
    func testNativeOverviewListAndDetail() {
        let app = launch()
        XCTAssertTrue(app.staticTexts["Pracovní deník"].exists)
        let overview = XCTAttachment(screenshot: app.screenshot()); overview.name = "SwiftUI-prehled"; overview.lifetime = .keepAlways; add(overview)
        app.tabBars.buttons["Zakázky"].tap()
        let customer = app.staticTexts["Pavel Svoboda – ukázka"]
        XCTAssertTrue(customer.waitForExistence(timeout: 15)); customer.tap()
        XCTAssertTrue(app.navigationBars["Detail zakázky"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Práce 09:00 · 60 min"].exists)
        XCTAssertTrue(app.staticTexts["Příjezd 10:00–11:00"].exists)
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Ventil čeká na výměnu"].waitForExistence(timeout: 10))
        let detail = XCTAttachment(screenshot: app.screenshot()); detail.name = "SwiftUI-detail"; detail.lifetime = .keepAlways; add(detail)
    }
    @MainActor
    func testNativeFormHandoffDoesNotDiscardAnOpenForm() {
        let app = launch(); app.tabBars.buttons["Více"].tap(); app.buttons["Zákazníci"].tap()
        let field = app.textFields.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-field-")).firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 15)); XCTAssertTrue(app.staticTexts["Engine visibility: visible"].exists); field.tap(); field.typeText("Zachovat zapis")
        app.buttons["Přehled"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 10)); XCTAssertEqual(field.value as? String, "Zachovat zapis")
        app.buttons["Zavřít formulář"].tap()
        app.buttons["Přehled"].tap()
        XCTAssertTrue(app.tabBars.buttons["Přehled"].waitForExistence(timeout: 15))
    }
    @MainActor
    func testNativePaginationShowsTheExistingJobsOnce() {
        let app = launch(); app.tabBars.buttons["Zakázky"].tap()
        let more = app.buttons["Načíst další zakázky"]
        if !more.waitForExistence(timeout: 10) { app.swipeUp() }
        more.tap()
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Důvod: Chyběl materiál"].waitForExistence(timeout: 10))
    }
}
