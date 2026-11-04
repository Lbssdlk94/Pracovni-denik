import XCTest
@testable import PracovniDenik

final class NativePushTests:XCTestCase {
    func testDeviceTokenIsHexWithoutAssumingFixedAPNsLength(){XCTAssertEqual(NativePushPolicy.token(Data([0,15,128,255])),"000f80ff");XCTAssertEqual(NativePushPolicy.token(Data(repeating:128,count:40)).count,80)}
    func testOnlyGenericTrustedPayloadOpensInbox(){XCTAssertTrue(NativePushPolicy.opensInbox(["workDiaryInbox":1]));XCTAssertFalse(NativePushPolicy.opensInbox(["url":"https://evil.test"]));XCTAssertFalse(NativePushPolicy.opensInbox(["workDiaryInbox":0]));XCTAssertFalse(NativePushPolicy.opensInbox(["jobId":"private-job"]))}
    func testOnlyKnownSigningEnvironments(){XCTAssertEqual(NativePushPolicy.environment("production"),"production");XCTAssertEqual(NativePushPolicy.environment("development"),"development");XCTAssertNil(NativePushPolicy.environment("sandbox"));XCTAssertNil(NativePushPolicy.environment(nil))}
}
