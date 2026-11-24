import XCTest
@testable import PracovniDenik

final class MinistralCommandTests: XCTestCase {
    func testExtractsOneDiaryCommand() {
        XCTAssertEqual(MinistralCommand.extract("{\"command\":\"Najdi zákazníka Petřík\"}"), "Najdi zákazníka Petřík")
        XCTAssertEqual(MinistralCommand.extract("Poznámka\n{\"command\":\"Co máme dnes za práci?\"}\n"), "Co máme dnes za práci?")
        XCTAssertNil(MinistralCommand.extract("Dnes nevím a nic si nevymýšlím."))
        XCTAssertNil(MinistralCommand.extract("{\"command\":\"\"}"))
        XCTAssertNil(MinistralCommand.extract("{\"command\":\"řádek\\ndruhý\"}"))
    }
}
