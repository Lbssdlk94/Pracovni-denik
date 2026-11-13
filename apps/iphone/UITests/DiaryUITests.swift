import XCTest

final class DiaryUITests: XCTestCase {
    @MainActor
    private func openForm(_ app: XCUIApplication, text: String) -> XCUIElement {
        app.launchArguments = ["--ui-testing"]
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 20))
        let loaded = NSPredicate(format: "exists == false")
        let loading = app.staticTexts["Otevírám Pracovní deník…"]
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: loaded, object: loading)], timeout: 20), .completed)
        let field = app.webViews.textFields["Poznámka"]
        XCTAssertTrue(field.waitForExistence(timeout: 20))
        field.tap()
        field.typeText(text)
        assertValue(text, in: field)
        return field
    }
    private func assertValue(_ value: String, in field: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        let expected = NSPredicate(format: "value == %@", value)
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: expected, object: field)], timeout: 10), .completed, file: file, line: line)
    }
    @MainActor
    func testBackgroundAndForegroundKeepAnOpenForm() {
        let app = XCUIApplication()
        let field = openForm(app, text: "Rozepsana prace")
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(field.waitForExistence(timeout: 15))
        assertValue("Rozepsana prace", in: field)
    }
    @MainActor
    func testDocumentPreviewDoesNotReplaceTheOpenForm() {
        let app = XCUIApplication()
        let field = openForm(app, text: "Neodeslany zapis")
        app.webViews.links["Zobrazit dokument"].tap()
        XCTAssertTrue(app.navigationBars["Dokument"].waitForExistence(timeout: 10))
        let preview = app.webViews.staticTexts["Náhled záznamu"]
        if !preview.waitForExistence(timeout: 10) {
            // This hierarchy only contains the isolated local fixture.
            print("LOCAL TEST PREVIEW: \(app.debugDescription)")
            XCTFail("Local document content did not appear")
        }
        app.buttons["Zavřít"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        assertValue("Neodeslany zapis", in: field)
    }
}
