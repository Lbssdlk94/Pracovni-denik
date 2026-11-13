import XCTest
@testable import PracovniDenik

final class WatchContractTests: XCTestCase {
    private func snapshot() throws -> WatchSnapshot {
        let path = Bundle.main.url(forResource:"NativeFixture",withExtension:"json")!
        let fixture = try JSONSerialization.jsonObject(with:Data(contentsOf:path)) as! [String:Any]
        let raw = (fixture["jobs"] as! [[String:Any]])[0]
        let job: [String:Any] = ["id":raw["id"]!,"version":1,"title":"Servis","customerName":"Ukázka","address":"Lipová 1488, Blatná","gardenName":"Zahrada","dueDate":"2026-11-04","status":"planned","kind":"service","discipline":"irrigation","plannedStart":"09:00","arrivalStart":"10:00","arrivalEnd":"11:00","originalStart":"","estimatedMinutes":NSNull(),"arrivalTime":"","handoffStatus":"pending","protocolStatus":"missing","incompleteReason":"","canStart":true,"canComplete":true,"requiresProtocol":false,"canDepart":true,"canAccept":true]
        let value: [String:Any] = ["protocolVersion":1,"binding":String(repeating:"a",count:64),"generatedAt":Date().timeIntervalSince1970*1000,"today":"2026-11-04","companyName":"Test","userName":"Kolega","jobsEnabled":true,"notificationsEnabled":true,"jobs":[job],"hasMoreJobs":false,"notices":[],"unread":0]
        return try JSONDecoder().decode(WatchSnapshot.self,from:JSONSerialization.data(withJSONObject:value))
    }
    func testContractHasNoCredentialsAndSeparatesArrivalFromWork() throws {
        let state = try snapshot(),job = state.jobs[0]
        XCTAssertTrue(state.isFresh());XCTAssertFalse(state.isFresh(at:Date().addingTimeInterval(121)))
        XCTAssertEqual(job.workLabel,"Práce 09:00 · délka neurčena")
        XCTAssertEqual(job.compactTime,"09:00")
        let url = try XCTUnwrap(job.navigationURL),query = URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems
        XCTAssertEqual(query?.first?.value,"Lipová 1488, Blatná")
        let data = try JSONEncoder().encode(state),text = String(data:data,encoding:.utf8)!
        for key in ["password","cookie","price","materialItems","photoIds"] { XCTAssertFalse(text.contains(key)) }
    }
    func testRequestsRejectStaleSnapshotsAndInvalidArrival() throws {
        let state = try snapshot();try WatchRequest.refresh().validated()
        var request = WatchRequest.change(.depart,job:state.jobs[0],snapshot:state,arrivalTime:"10:15")
        try request.validated();request.arrivalTime = "24:00";XCTAssertThrowsError(try request.validated())
        request.arrivalTime = "10:15";XCTAssertThrowsError(try request.validated(at:Date().addingTimeInterval(121)))
        request.jobId = "../other";XCTAssertThrowsError(try request.validated())
        let invalid = WatchRequest(protocolVersion:1,requestId:UUID().uuidString,kind:"refresh",jobId:"another")
        XCTAssertThrowsError(try invalid.validated())
    }
    func testReplayLedgerIsBoundedAndRejectsChangedPayloads() throws {
        var ledger = WatchRequestLedger();let payload = Data("request".utf8),reply = Data("reply".utf8)
        ledger.store(request:payload,reply:reply,id:"one")
        XCTAssertEqual(try ledger.reply(for:payload,id:"one"),reply)
        XCTAssertThrowsError(try ledger.reply(for:Data("changed".utf8),id:"one"))
        for i in 0..<32 { ledger.store(request:payload,reply:reply,id:String(i)) }
        XCTAssertNil(try ledger.reply(for:payload,id:"one"));ledger.clear();XCTAssertNil(try ledger.reply(for:payload,id:"31"))
    }
    @MainActor
    func testPhoneRequestAllowlistAndReplayNeverRepeatWritesOrReturnOldSnapshots() async throws {
        let coordinator = WatchPhoneCoordinator(),state = try snapshot(),request = WatchRequest.change(.start,job:state.jobs[0],snapshot:state),data = try JSONEncoder().encode(request)
        var calls = 0
        let call: ([String:Any]) async throws -> WatchReply = { values in
            calls += 1;XCTAssertEqual(values["action"] as? String,"start")
            return WatchReply(requestId:request.requestId,snapshot:state,message:"Uloženo")
        }
        let first = try JSONDecoder().decode(WatchReply.self,from:await coordinator.handle(data,call:call))
        XCTAssertNotNil(first.snapshot)
        let replay = try JSONDecoder().decode(WatchReply.self,from:await coordinator.handle(data,call:call))
        XCTAssertEqual(calls,1);XCTAssertNil(replay.snapshot);XCTAssertEqual(replay.message,"Uloženo")
        coordinator.invalidate()
        _ = await coordinator.handle(data,call:call);XCTAssertEqual(calls,2)
        let invalid = try JSONDecoder().decode(WatchReply.self,from:await coordinator.handle(Data(repeating:1,count:4097),call:call))
        XCTAssertNotNil(invalid.error);XCTAssertEqual(calls,2)
    }
    @MainActor
    func testInvalidationDropsAnInflightOldIdentityReply() async throws {
        let coordinator = WatchPhoneCoordinator(),request = WatchRequest.refresh(),data = try JSONEncoder().encode(request)
        let reply = await coordinator.handle(data,call:{ _ in coordinator.invalidate();return WatchReply(requestId:request.requestId,message:"Old result") })
        let result = try JSONDecoder().decode(WatchReply.self,from:reply)
        XCTAssertNotNil(result.error);XCTAssertNil(result.snapshot)
    }
}
