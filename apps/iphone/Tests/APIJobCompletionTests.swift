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

    @MainActor func testSavingEstimateUpdatesTheNativeJobWithoutCompletingIt()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let path="/api/jobs/fixture-progress",before=try await store.get(path),original=before["job"]
        let input:APIValue = .object(["operationId":.s("completion-native-save"),"version":.n(0),"percent":.n(30),"note":.s("Hotová hlavní větev")])
        let saved=try await store.write(path+"/completion",method:"PATCH",body:input)
        XCTAssertEqual(saved["job"]["completionPercent"],.n(30));XCTAssertEqual(saved["job"]["completionUpdatedBy"].string,store.userID)
        XCTAssertEqual(saved["job"]["status"],original["status"]);XCTAssertEqual(store.currentJob(original)["completionPercent"],.n(30))
        let replay=try await store.write(path+"/completion",method:"PATCH",body:input)
        XCTAssertTrue(replay["replayed"].bool);XCTAssertEqual(replay["job"]["completionVersion"],saved["job"]["completionVersion"])
        XCTAssertTrue(store.outbox.isEmpty)
    }

    @MainActor func testEstimateConflictDoesNotOverwriteTheColleagueAndTargetHasItsOwnVersion()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();let path="/api/jobs/fixture-progress"
        _ = try await store.write(path+"/completion",method:"PATCH",body:.object(["operationId":.s("completion-colleague"),"version":.n(0),"percent":.n(40)]))
        do{
            _ = try await store.write(path+"/completion",method:"PATCH",body:.object(["operationId":.s("completion-stale"),"version":.n(0),"percent":.n(12)]));XCTFail("Stale estimate must not replace a colleague's value")
        }catch let error as APIError{XCTAssertEqual(error.status,409)}
        let target=try await store.write(path+"/completion-target",method:"PATCH",body:.object(["operationId":.s("completion-threshold"),"version":.n(0),"points":.n(20)]))
        XCTAssertEqual(target["job"]["completionPercent"],.n(40));XCTAssertEqual(target["job"]["completionVersion"],.n(1));XCTAssertEqual(target["job"]["completionTargetVersion"],.n(1))
    }
}
