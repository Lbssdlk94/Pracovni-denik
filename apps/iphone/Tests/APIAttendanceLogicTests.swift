import XCTest
@testable import PracovniDenik

final class APIAttendanceLogicTests:XCTestCase {
    private func date(_ value:String)->Date{ISO8601DateFormatter().date(from:value)!}
    private func ms(_ value:String)->APIValue{.number(date(value).timeIntervalSince1970*1000)}
    private func shift(_ id:String,_ from:String,_ to:String?,user:String="me")->APIValue{.object(["id":.s(id),"userId":.s(user),"userName":.s(user),"startAt":ms(from),"endAt":to.map(ms) ?? .null,"version":.n(1)])}
    private func interval(_ id:String,_ kind:String,_ from:String,_ to:String?,user:String="me")->APIValue{shift(id,from,to,user:user).merged(["kind":.s(kind)])}
    private func days(_ shifts:[APIValue],_ intervals:[APIValue],now:String="2026-11-20T20:00:00Z")->[APIAttendanceDay]{APIAttendanceLogic.days(shifts:shifts,intervals:intervals,from:APIAttendanceLogic.monthDate("2026-11"),to:APIAttendanceLogic.monthDate("2026-12"),now:date(now))}
    func testRealExamplePartitionsEightAndHalfHoursWithoutDoubleCounting(){
        let s=shift("s","2026-11-20T06:00:00Z","2026-11-20T14:30:00Z")
        let rows=[interval("other","other","2026-11-20T06:00:00Z","2026-11-20T06:30:00Z"),interval("travel1","travel","2026-11-20T06:30:00Z","2026-11-20T07:00:00Z"),interval("work1","work","2026-11-20T07:00:00Z","2026-11-20T12:00:00Z"),interval("travel2","travel","2026-11-20T12:00:00Z","2026-11-20T12:30:00Z"),interval("work2","work","2026-11-20T12:30:00Z","2026-11-20T14:30:00Z")]
        let day=days([s],rows)[0];XCTAssertEqual(day.net/3600000,8.5);XCTAssertEqual(day.work/3600000,7);XCTAssertEqual(day.slices.filter{$0.kind=="travel"}.reduce(0){$0+$1.milliseconds}/3600000,1);XCTAssertEqual(day.slices.filter{$0.kind=="other"}.reduce(0){$0+$1.milliseconds}/3600000,0.5)
    }
    func testUnallocatedIsNotInventedOtherWorkAndBreaksReduceNet(){
        let day=days([shift("s","2026-11-20T06:00:00Z","2026-11-20T14:30:00Z")],[interval("b","break","2026-11-20T10:00:00Z","2026-11-20T10:30:00Z")])[0]
        XCTAssertEqual(day.gross/3600000,8.5);XCTAssertEqual(day.net/3600000,8);XCTAssertFalse(day.slices.contains{$0.kind=="other"});XCTAssertEqual(day.confirmed,day.net)
    }
    func testOpenAndPendingShiftsAreNeverConfirmedMonthlyHours(){
        let open=shift("s","2026-11-20T06:00:00Z",nil),rows=days([open],[],now:"2026-11-20T08:00:00Z")
        XCTAssertEqual(rows[0].net/3600000,2);XCTAssertEqual(APIAttendanceLogic.total(rows).confirmed,0);XCTAssertEqual(APIAttendanceLogic.total(rows).days,0)
        let pending=shift("s","2026-11-20T06:00:00Z","2026-11-20T08:00:00Z").merged(["pending":.bool(true)])
        XCTAssertEqual(days([pending],[])[0].confirmed,0)
    }
    func testCrossMidnightKeepsOneShiftAndSplitsDaysWithoutAutomaticDeparture(){
        let rows=days([shift("night","2026-11-19T21:00:00Z",nil)],[],now:"2026-11-20T05:00:00Z")
        XCTAssertEqual(rows.count,2);XCTAssertEqual(rows.reduce(0){$0+$1.gross}/3600000,8);XCTAssertTrue(rows.allSatisfy{$0.open && $0.last.isNull && !$0.issues.isEmpty})
        XCTAssertEqual(APIAttendanceLogic.reviewCount(rows,corrections:[]),1)
        XCTAssertEqual(APIAttendanceLogic.reviewCount(rows,corrections:[.object(["id":.s("request"),"shiftId":.s("night"),"status":.s("pending")])]),1)
    }
    func testDSTDaysHaveTwentyThreeAndTwentyFiveActualHours(){
        for (start,end,expected) in [("2026-03-28T23:00:00Z","2026-03-29T22:00:00Z",23.0),("2026-10-24T22:00:00Z","2026-10-25T23:00:00Z",25.0)]{
            let s=shift("dst",start,end),d=APIAttendanceLogic.days(shifts:[s],intervals:[],from:date(start),to:date(end),now:date(end))
            XCTAssertEqual(d.count,1);XCTAssertEqual(d[0].gross/3600000,expected)
        }
    }
    func testDuplicateVersionsAndOverlapCannotDoubleCount(){
        let one=shift("s","2026-11-20T06:00:00Z","2026-11-20T14:00:00Z"),two=shift("s2","2026-11-20T07:00:00Z","2026-11-20T13:00:00Z")
        let day=days([one,one,two],[interval("a","work","2026-11-20T08:00:00Z","2026-11-20T12:00:00Z"),interval("b","travel","2026-11-20T09:00:00Z","2026-11-20T10:00:00Z")])[0]
        XCTAssertEqual(day.gross/3600000,8);XCTAssertTrue(day.issues.contains("Překrývající se směny"));XCTAssertTrue(day.issues.contains("Překrývající se činnosti"));XCTAssertLessThan(day.confirmed,day.gross)
    }
    func testEachEmployeeRetainsTheirOwnHours(){
        let rows=days([shift("a","2026-11-20T06:00:00Z","2026-11-20T14:00:00Z"),shift("b","2026-11-20T06:00:00Z","2026-11-20T09:00:00Z",user:"other")],[])
        XCTAssertEqual(rows.count,2);XCTAssertEqual(APIAttendanceLogic.total(rows).confirmed/3600000,11)
    }
    func testCSVQuotesFieldsAndSeparatesProvisionalHours(){
        let s=shift("s","2026-11-20T06:00:00Z",nil).merged(["userName":.s("=CMD(\"bad\")")]),csv=APIAttendanceLogic.csv(days([s],[],now:"2026-11-20T08:00:00Z"))
        XCTAssertTrue(csv.hasPrefix("\u{FEFF}"));XCTAssertTrue(csv.contains("'=CMD"));XCTAssertTrue(csv.contains("Průběžné hodiny"));XCTAssertTrue(csv.contains("\"0.0000\";\"2.0000\""))
    }
    func testCzechCalendarUsesMondayAndMonthBoundaries(){XCTAssertEqual(APIAttendanceLogic.calendar.firstWeekday,2);XCTAssertEqual(APIAttendanceLogic.month(APIAttendanceLogic.monthDate("2026-11")),"2026-11")}
    @MainActor func testPendingBreakPreservesJobAssociationAndDoesNotStopColleagues()async throws {
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let sample=APIAttendanceFixture.example(me:store.me)
        APIFixtureProtocol.lock.withLock{APIFixtureProtocol.records["fixture-attendance"]=sample}
        let model=APIAttendanceModel();await model.load(store:store,month:String(store.today.prefix(7)),user:store.userID,discipline:"all")
        let own=sample["detail"]["ownToday"]["state"],shift=sample["activeShift"],op="attendance-offline-break"
        store.online=false
        _ = try await store.write("/api/attendance/activities",method:"POST",body:.object(["operationId":.s(op),"action":.s("break"),"at":.number((Date().timeIntervalSince1970*1000).rounded()),"version":own["version"],"shiftId":shift["id"],"shiftVersion":shift["version"]]),offline:true,operationID:op)
        let projected=model.projected(store:store),states=projected["detail"]["states"].array,active=states.first{$0["userId"].string==store.userID}!["active"]
        XCTAssertEqual(active["kind"].string,"break");XCTAssertEqual(active["jobId"].string,"fixture-progress")
        XCTAssertEqual(APIJobDetailAction.resolve(job:.object(["id":.s("fixture-progress"),"status":.s("in_progress")]),states:states,userID:store.userID,travelEnabled:true),.resume)
        XCTAssertEqual(states.first{$0["userId"].string=="attendance-marek"}?["active"]["kind"].string,"break")
        XCTAssertEqual(store.outbox.count,1)
    }
    @MainActor func testCapturedPunchIsAnIntegerAndQueueSurvivesEncryptedRestartWithoutDuplicates()async throws {
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();store.online=false
        let captured=Date().timeIntervalSince1970*1000
        try await APIAttendanceWorkflow.punch(store:store,activeShift:.null,location:APILocation(),operationID:"captured-punch",offline:true,at:captured)
        let operation=try XCTUnwrap(store.outbox.first),at=operation.body!["at"].double
        XCTAssertEqual(at,at.rounded());XCTAssertEqual(at,captured.rounded())
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString,isDirectory:true);defer{try? FileManager.default.removeItem(at:directory)}
        let key=Data(repeating:41,count:32),vault=try APIVault(scope:store.scope,directory:directory,keyMaterial:key)
        try vault.enqueue(operation)
        let restored=try APIVault(scope:store.scope,directory:directory,keyMaterial:key);try restored.enqueue(operation)
        XCTAssertEqual(restored.state.outbox.count,1);XCTAssertEqual(restored.state.outbox.first?.body?["at"].double,at)
        var changed=operation.body!;changed["at"] = .number(at+1000)
        let duplicate=APIMutation(id:operation.id,path:operation.path,method:operation.method,body:changed,bytes:nil,contentType:operation.contentType,headers:operation.headers,scope:operation.scope,dependsOn:[],draftKey:nil)
        XCTAssertThrowsError(try restored.enqueue(duplicate));XCTAssertEqual(restored.state.outbox.count,1)
    }
    @MainActor func testDeniedAttendanceReloadClearsVisibleData()async {
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();let model=APIAttendanceModel()
        await model.load(store:store,month:String(store.today.prefix(7)),user:store.userID,discipline:"all");XCTAssertFalse(model.data.isNull)
        APIFixtureProtocol.lock.withLock{APIFixtureProtocol.forcedStatus["/api/attendance"]=403}
        await model.load(store:store,month:String(store.today.prefix(7)),user:store.userID,discipline:"all",refresh:true);XCTAssertTrue(model.data.isNull);XCTAssertNotNil(model.problem)
    }

}
