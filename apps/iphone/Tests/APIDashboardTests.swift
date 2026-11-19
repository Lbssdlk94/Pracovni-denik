import XCTest
@testable import PracovniDenik

final class APIDashboardTests:XCTestCase {
    func testClockClipsMidnightAndDoesNotDoubleCountJobHours(){
        let now=ISO8601DateFormatter().date(from:"2026-11-19T10:00:00Z")!
        let shifts:[APIValue]=[.object(["startAt":.number(now.timeIntervalSince1970*1000-12*3600000),"endAt":.null])]
        XCTAssertEqual(APIDashboardLogic.elapsed(shifts,now:now),11*3600000)
        XCTAssertEqual(APIDashboardLogic.clock(3661000),"01:01:01")
        XCTAssertEqual(APIDashboardLogic.clock(-100),"00:00:00")
    }
    func testTimelinePutsCurrentVisitFirstAndCompletedLast(){
        let rows:[APIValue]=[.object(["id":.s("done"),"status":.s("done"),"plannedStart":.s("07:00")]),.object(["id":.s("later"),"status":.s("planned"),"plannedStart":.s("09:00")]),.object(["id":.s("current"),"status":.s("in_progress"),"plannedStart":.s("11:00")])]
        XCTAssertEqual(APIDashboardLogic.orderedVisits(rows,activeID:"current").map(\.id),["current","later","done"])
    }
    @MainActor func testPersonalAndCompanyModesAreSeparateAndUseNoRepeatedIdentityDiscovery()async throws {
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let company=try await store.get("/api/overview?mode=company"),personal=try await store.get("/api/overview?mode=personal")
        XCTAssertEqual(company["mode"].string,"company");XCTAssertFalse(company["people"].array.isEmpty)
        XCTAssertEqual(personal["mode"].string,"personal");XCTAssertTrue(personal["people"].array.isEmpty)
        XCTAssertEqual(APIFixtureProtocol.requestSnapshot().filter{$0.url?.path=="/api/me"}.count,1)
        XCTAssertTrue(store.outbox.isEmpty)
    }
    @MainActor func testDashboardUsesExistingEncryptedCacheOfflineAndIsPurgedByAccountScope()async throws {
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();let path="/api/overview?mode=personal"
        let original=try await store.get(path);store.online=false
        let cached=try await store.get(path);XCTAssertEqual(cached,original)
        var other=store.me;other["user"]["id"] = .s("other-owner");try store.bind(other)
        XCTAssertNil(store.vault?.state.cache[path])
    }
    @MainActor func testSharedAttendanceCommandRetriesTheSameMutationWithoutCreatingAnotherShift()async throws {
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let data=try await store.get("/api/overview?mode=personal"),shift=data["attendance"]["activeShift"],location=APILocation()
        try await APIAttendanceWorkflow.punch(store:store,activeShift:shift,location:location,operationID:"same-end")
        try await APIAttendanceWorkflow.punch(store:store,activeShift:shift,location:location,operationID:"same-end")
        let after=try await store.get("/api/overview?mode=personal")
        XCTAssertTrue(after["attendance"]["activeShift"].isNull);XCTAssertEqual(after["attendance"]["shifts"].array.count,1)
    }
    @MainActor func testAcknowledgedWorkIntervalsAreNotLostWhenTheOverviewFallsBackToAnOlderBundle()async throws {
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let before=try await store.get("/api/overview?mode=personal"),snapshot=before["timeSnapshot"],id=snapshot["job"].id
        let op="acknowledged-work",at=Int(Date().timeIntervalSince1970*1000)-30000
        _ = try await store.write("/api/jobs/"+id+"/time/actions",method:"POST",body:.object(["operationId":.s(op),"action":.s("work"),"at":.n(at),"workers":.array([.object(["userId":.s(store.userID),"version":.n(0)])])]),offline:true,operationID:op)
        let projected=APIWorkTimeLogic.overviewProjection(snapshot,store:store)
        XCTAssertEqual(projected["intervals"].array.count,1)
        XCTAssertEqual(projected["states"].array.first?["active"]["kind"].string,"work")
        XCTAssertTrue(store.outbox.isEmpty)
    }

}
