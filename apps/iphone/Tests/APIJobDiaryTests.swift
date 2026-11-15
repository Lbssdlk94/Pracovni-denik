import XCTest
@testable import PracovniDenik

final class APIJobDiaryTests:XCTestCase {
    func testDailyDiaryRequiresAtLeastOnePhoto(){
        XCTAssertThrowsError(try APIJobDiaryRules.requirePhoto(.object(["photoIds":.array([])])))
        XCTAssertThrowsError(try APIJobDiaryRules.requirePhoto(.object([:])))
        XCTAssertNoThrow(try APIJobDiaryRules.requirePhoto(.object(["photoIds":.array([.s("existing-photo")])])))
    }
    @MainActor func testOfflineDiaryUsesSameOutboxAndPreservesProtocolAndJob()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let path="/api/jobs/fixture-next/diary",before=(try await store.get("/api/jobs/fixture-next"))["job"]
        _ = try await store.get(path)
        store.online=false
        let payload:APIValue = .object(["version":.n(0),"operationId":.s("diary-one"),"date":.s(store.today),"work":.s("Položeno potrubí"),"material":.s("PE 32 mm"),"notes":.s(""),"nextStep":.s("Ventilová šachta"),"photoIds":.array([.s("fixture-photo")])])
        _ = try await store.write(path+"/one",method:"PUT",body:payload,offline:true,operationID:"diary-one")
        XCTAssertEqual(store.outbox.count,1)
        _ = try await store.write(path+"/one",method:"PUT",body:payload,offline:true,operationID:"diary-one")
        XCTAssertEqual(store.outbox.count,1)
        let offline=try await store.get(path);XCTAssertTrue(offline["entries"].array.isEmpty)
        store.online=true;await store.sync();await store.sync()
        XCTAssertTrue(store.outbox.isEmpty)
        let saved=try await store.get(path)
        XCTAssertEqual(saved["entries"].array.count,1);XCTAssertEqual(saved["entries"].array.first?["work"],.s("Položeno potrubí"))
        let after=(try await store.get("/api/jobs/fixture-next"))["job"]
        XCTAssertEqual(before["version"],after["version"]);XCTAssertEqual(before["status"],after["status"])
        XCTAssertNil(APIFixtureProtocol.records["/api/jobs/fixture-next/report"])
    }
    @MainActor func testDiaryServerConflictKeepsLocalTextAndIndependentDraft()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let path="/api/jobs/fixture-next/diary/one"
        store.saveDraft("unrelated",draft:APIDraft(value:.s("Jiná rozpracovaná práce"),baseVersion:1,operationID:"other",updatedAt:Date()))
        APIFixtureProtocol.forcedStatus[path]=409
        do{_ = try await store.write(path,method:"PUT",body:.object(["version":.n(0),"operationId":.s("conflict"),"date":.s(store.today),"work":.s("Místní text"),"photoIds":.array([.s("fixture-photo")])]),offline:true,operationID:"conflict");XCTFail("Conflict must remain explicit")}catch{}
        XCTAssertEqual(store.outbox.first?.state,"conflict");XCTAssertEqual(store.outbox.first?.body?["work"],.s("Místní text"));XCTAssertEqual(store.vault?.state.drafts["unrelated"]?.value,.s("Jiná rozpracovaná práce"))
    }
}
