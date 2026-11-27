import XCTest
@testable import PracovniDenik

final class APIOfficeTests: XCTestCase {
    func testAmountRequiresWholeHalere() throws {
        XCTAssertEqual(try OfficeFormat.minor("1 234,01"), .n(123401))
        XCTAssertEqual(try OfficeFormat.minor("0.10"), .n(10))
        for value in ["", "12.345", "-12", "nan", "2 000 Kč"] { XCTAssertThrowsError(try OfficeFormat.minor(value)) }
    }
    func testWorkerCanOnlySettleOwnApprovedPurchase() {
        let row: APIValue = .object(["status": .s("approved")])
        XCTAssertEqual(OfficeFormat.actions(.purchase, row, manager: false, mine: true), ["submit_expense"])
        XCTAssertTrue(OfficeFormat.actions(.purchase, row, manager: false, mine: false).isEmpty)
        XCTAssertFalse(OfficeFormat.actions(.purchase, row, manager: false, mine: true).contains("buy"))
    }
    func testInvoiceReadingLeavesAmbiguousAmountsAndForeignCurrencyForReview() {
        let input = "Faktura číslo: FV-2026-1\nDatum splatnosti: 7. 12. 2026\nCelkem k úhradě: 1 234,50 Kč"
        let fields = APIInvoiceReader.suggestions(input)
        XCTAssertEqual(fields["amountMinor"], "1234,50")
        XCTAssertEqual(fields["dueDate"], "2026-12-07")
        XCTAssertEqual(fields["reference"], "FV-2026-1")
        XCTAssertNil(APIInvoiceReader.suggestions(input + "\nCelkem k úhradě: 300 Kč")["amountMinor"])
        XCTAssertNil(APIInvoiceReader.suggestions(input + "\nMěna: EUR")["amountMinor"])
    }
    @MainActor func testExportEscapesContactTextAndPreservesHalere() throws {
        let row: APIValue = .object(["title": .s("=x;\"A\""), "amountMinor": .n(1025)])
        let csv = try XCTUnwrap(String(data: APIOfficeReport.csv([row]), encoding: .utf8))
        XCTAssertTrue(csv.contains("\"'=x;\"\"A\"\"\""))
        XCTAssertTrue(csv.contains("\"10,25\""))
    }
}
