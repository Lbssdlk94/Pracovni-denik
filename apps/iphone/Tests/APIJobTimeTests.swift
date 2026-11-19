import XCTest
@testable import PracovniDenik

final class APIJobTimeTests:XCTestCase{
    func testPersonalStopDoesNotMeanJobCompletion(){
        let job:APIValue = .object(["id":.s("a"),"status":.s("in_progress"),"myTime":.object(["version":.n(1),"active":.object(["jobId":.s("a"),"kind":.s("work")])])])
        XCTAssertEqual(APIJobWorkflow.primary(job,travelEnabled:true),.stopWork)
        XCTAssertNil(APIJobPrimaryAction.stopWork.targetStatus)
        XCTAssertEqual(APIJobWorkflow.primary(job.merged(["myTime":.object(["active":.null])]),travelEnabled:true),.start)
        XCTAssertEqual(APIWorkTimeLogic.duration(.object(["startAt":.n(1000),"endAt":.n(61000)])),60000)
    }
    @MainActor func testOfflineActionsUseTheExistingDurableQueueAndProjectIndividualState()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let path="/api/jobs/fixture-progress/time",snapshot=try await store.get(path),now=Int(Date().timeIntervalSince1970*1000)-60000
        store.online=false
        for(index,kind)in ["travel","work","stop"].enumerated(){let id="time-"+String(index),input=APIValue.object(["operationId":.s(id),"action":.s(kind),"at":.n(now+index*1000),"workers":.array([.object(["userId":.s(store.userID),"version":.n(index)])])]);_ = try await store.write(path+"/actions",method:"POST",body:input,offline:true,operationID:id)}
        let states=APIWorkTimeLogic.states(snapshot,store:store)
        XCTAssertEqual(states[0]["version"],.n(3));XCTAssertTrue(states[0]["active"].isNull);XCTAssertEqual(store.outbox.count,3)
        store.online=true;await store.sync();XCTAssertTrue(store.outbox.isEmpty)
        let refreshed=try await store.get(path);XCTAssertEqual(refreshed["states"].array[0]["version"],.n(3));XCTAssertEqual(refreshed["intervals"].array.count,2)
        let count=APIFixtureProtocol.requestSnapshot().count;await store.sync();XCTAssertEqual(APIFixtureProtocol.requestSnapshot().count,count)
    }
    @MainActor func testRolePreviewCannotQueueWorkTime()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();try store.setRolePreview("worker")
        do{_ = try await store.write("/api/jobs/fixture-progress/time/actions",method:"POST",body:.object([:]),offline:true,operationID:"denied");XCTFail("Preview cannot record hours")}catch{}
        XCTAssertTrue(store.outbox.isEmpty)
    }
}
