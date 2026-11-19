import XCTest
@testable import PracovniDenik

final class APIJobCompletionTests:XCTestCase{
    func testPercentAndDailyThresholdUsePercentagePoints(){
        let base:APIValue = .object(["completionPercent":.n(12),"completionBaselinePercent":.n(10)])
        XCTAssertEqual(APICompletionProgress(job:base).percent,12)
        XCTAssertEqual(APICompletionProgress(job:base).target,20)
        XCTAssertEqual(APICompletionProgress(job:base).delta,2)
        XCTAssertTrue(APICompletionProgress(job:base).slow)
        XCTAssertFalse(APICompletionProgress(job:base.merged(["completionPercent":.n(30)])).slow)
        XCTAssertTrue(APICompletionProgress(job:base.merged(["completionTargetPoints":.n(25),"completionPercent":.n(30)])).slow)
        XCTAssertFalse(APICompletionProgress(job:base.merged(["completionPercent":.n(100)])).slow)
    }
    func testUnknownFirstDayAndZeroAreDifferent(){
        XCTAssertNil(APICompletionProgress(job:.object([:])).percent)
        let zero:APIValue = .object(["completionPercent":.n(0)])
        XCTAssertEqual(APICompletionProgress(job:zero).percent,0)
        XCTAssertNil(APICompletionProgress(job:zero).delta)
        XCTAssertFalse(APICompletionProgress(job:zero).slow)
    }
}
