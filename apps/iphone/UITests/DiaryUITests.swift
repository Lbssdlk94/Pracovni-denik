import XCTest

final class DiaryUITests: XCTestCase {
    @MainActor
    func testBackgroundAndForegroundKeepAnOpenForm() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 20))
        let field = app.webViews.textFields["Poznámka"]
        XCTAssertTrue(field.waitForExistence(timeout: 20))
        field.tap()
        field.typeText("Rozepsana prace")
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(field.waitForExistence(timeout: 15))
        XCTAssertEqual(field.value as? String, "Rozepsana prace")
    }
    @MainActor
    func testDocumentPreviewDoesNotReplaceTheOpenForm() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()
        let field = app.webViews.textFields["Poznámka"]
        XCTAssertTrue(field.waitForExistence(timeout: 20))
        field.tap()
        field.typeText("Neodeslany zapis")
        app.webViews.links["Zobrazit dokument"].tap()
        XCTAssertTrue(app.navigationBars["Dokument"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.webViews.staticTexts["Náhled záznamu"].waitForExistence(timeout: 10))
        app.buttons["Zavřít"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        XCTAssertEqual(field.value as? String, "Neodeslany zapis")
    }
}
