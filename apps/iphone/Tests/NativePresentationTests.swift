import XCTest
@testable import PracovniDenik

final class NativePresentationTests: XCTestCase {
    private func control(_ json: String) throws -> NativeControl { try JSONDecoder().decode(NativeControl.self, from: Data(json.utf8)) }
    func testAdjacentFieldsAreGroupedWithoutChangingTheirHandlesOrOrder() throws {
        let controls = try [
            control(#"{"id":"name","handle":"n1","kind":"field","text":"Jméno"}"#),
            control(#"{"id":"phone","handle":"n2","kind":"field","text":"Telefon"}"#),
            control(#"{"id":"save","handle":"n3","kind":"button","text":"Uložit","primary":true}"#)
        ]
        let groups = NativePresentation.groups(controls)
        XCTAssertEqual(groups.count, 2)
        XCTAssertEqual(groups[0].kind, .fields)
        XCTAssertEqual(groups[0].controls.map(\.handle), ["n1", "n2"])
        XCTAssertEqual(groups[1].kind, .actions)
        XCTAssertEqual(groups.flatMap(\.controls).map(\.id), controls.map(\.id))
    }
    func testOldContractStillDecodesAndDestructiveActionsRemainMarked() throws {
        let value = try control(#"{"id":"delete","handle":"h","kind":"button","text":"Smazat","danger":true}"#)
        XCTAssertNil(value.intent); XCTAssertTrue(value.isAction); XCTAssertEqual(value.actionSymbol, "trash")
    }
    func testNativeHeaderAndStickyActionDoNotDuplicateControlsOrPromoteAnActionFromClosedDetails() throws {
        let value = try JSONDecoder().decode(NativeScreenSnapshot.self, from: Data(#"{"revision":1,"title":"Upravit zákazníka","modal":true,"nodes":[{"id":"title","handle":"h1","kind":"heading","text":"Upravit zákazníka","level":2},{"id":"close","handle":"h2","kind":"button","text":"Zavřít","intent":"dismiss"},{"id":"details","handle":"h3","kind":"disclosure","expanded":false,"children":[{"id":"hiddenSave","handle":"h4","kind":"button","text":"Uložit další nastavení","primary":true}]},{"id":"form","handle":"h5","kind":"form","children":[{"id":"save","handle":"h6","kind":"button","text":"Uložit","primary":true}]}]}"#.utf8))
        XCTAssertEqual(value.repeatedTitleID, "title"); XCTAssertEqual(value.closeControl?.handle, "h2"); XCTAssertEqual(value.primaryControl?.id, "save")
        XCTAssertEqual(value.find("hiddenSave")?.handle, "h4")
    }
    func testCzechCalendarDaysAcrossDaylightSavingTime() {
        XCTAssertEqual(DiaryDate.shifted("2026-10-25", days: 1), "2026-10-26")
        XCTAssertEqual(DiaryDate.shifted("2026-03-29", days: 1), "2026-03-30")
        XCTAssertEqual(DiaryDate.shifted("2026-12-31", days: 1), "2027-01-01")
        XCTAssertEqual(DiaryDate.shifted("", days: 1), "")
    }
    func testCompactDestinationIsNotAnActionGridAndRetainsSmallDistance() throws {
        let row = try control(#"{"id":"garden:g1","handle":"original-live-button","kind":"destination","text":"Zahrada maminky","subtitle":"≈ 12 km","symbol":"leaf","children":[{"id":"fallback","handle":"original-live-button","kind":"button","text":"Zahrada maminky Lipová 1488 2 šachty"}]}"#)
        XCTAssertEqual(NativePresentation.groups([row]).first?.kind, .container)
        XCTAssertEqual(row.label, "Zahrada maminky"); XCTAssertEqual(row.subtitle, "≈ 12 km")
        XCTAssertEqual(row.handle, row.children?.first?.handle)
    }
    func testLocalCategoryDoesNotExposeAddressOrPromoteHiddenSave() throws {
        let row = try control(#"{"id":"contact","handle":"h","kind":"category","text":"Kontakt a adresa","children":[{"id":"address","handle":"a","kind":"text","text":"Lipová 1488, Blatná"},{"id":"save","handle":"s","kind":"button","text":"Uložit","primary":true}]}"#)
        XCTAssertEqual(row.presentedDescendants.map(\.id), ["contact"])
        XCTAssertEqual(row.find("address")?.label, "Lipová 1488, Blatná")
    }
    func testReadOnlyCustomerDetailCanStayInsideTabsButEditingRemainsModal() throws {
        let decoder = JSONDecoder()
        let detail = try decoder.decode(NativeScreenSnapshot.self, from: Data(#"{"revision":1,"title":"Pavel Svoboda","nodes":[],"modal":true,"presentation":"page"}"#.utf8))
        let form = try decoder.decode(NativeScreenSnapshot.self, from: Data(#"{"revision":2,"title":"Upravit zákazníka","nodes":[],"modal":true}"#.utf8))
        XCTAssertTrue(detail.isInlineDetail); XCTAssertFalse(form.isInlineDetail)
    }
}
