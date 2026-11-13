import XCTest
@testable import PracovniDenik

final class NativeEditQueueTests: XCTestCase {
    func testDependentFieldsKeepLastUserEditOrder() {
        var edits=NativeEditQueue()
        edits.set("customer",["value":"first"]);edits.set("address",["value":"manual"]);edits.set("customer",["value":"second"])
        XCTAssertEqual(edits.takeFirst()?.key,"address")
        let latest=edits.takeFirst();XCTAssertEqual(latest?.key,"customer");XCTAssertEqual(latest?.value["value"] as? String,"second");XCTAssertTrue(edits.isEmpty)
    }
    func testFailedRequestDoesNotReplaceNewTypingAndInvalidationClearsEdits() {
        var edits=NativeEditQueue();edits.set("work",["value":"old"])
        let request=edits.takeFirst()!;edits.set("work",["value":"latest"]);edits.restoreFirst(request.key,request.value)
        XCTAssertEqual(edits.takeFirst()?.value["value"] as? String,"latest")
        edits.restoreFirst(request.key,request.value);XCTAssertFalse(edits.isEmpty);edits.clear();XCTAssertTrue(edits.isEmpty)
    }
}
