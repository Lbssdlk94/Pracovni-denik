import XCTest
@testable import PracovniDenik

final class APIJobsPresentationTests:XCTestCase {
    private let now=ISO8601DateFormatter().date(from:"2026-11-20T07:00:00Z")!
    private func job(_ id:String,status:String="planned",day:String="2026-11-20")->APIValue{.object(["id":.s(id),"status":.s(status),"dueDate":.s(day),"title":.s(id),"assignedTo":.s("me"),"jobType":.s("installation")])}
    func testMultiDayActiveJobsStayTodayButOldIncompleteAndFutureJobsDoNot(){
        let f=APIJobsFilters()
        for status in ["in_progress","on_way"]{XCTAssertTrue(APIJobsPresentation.matches(job("old",status:status,day:"2026-09-01"),filters:f,period:.today,query:"",now:now))}
        for status in ["planned","incomplete","done"]{XCTAssertFalse(APIJobsPresentation.matches(job("old",status:status,day:"2026-09-01"),filters:f,period:.today,query:"",now:now))}
        XCTAssertFalse(APIJobsPresentation.matches(job("future",status:"in_progress",day:"2026-11-21"),filters:f,period:.today,query:"",now:now))
        XCTAssertFalse(APIJobsPresentation.matches(job("old",status:"in_progress",day:"2026-09-01"),filters:f,period:.tomorrow,query:"",now:now))
    }
    func testGroupsUseRealStatusAndApprovalAndAlwaysPlaceDoneLast(){
        XCTAssertEqual(APIJobsGroup.allCases,[.working,.travel,.planned,.approval,.incomplete,.done])
        XCTAssertEqual(APIJobsGroup.of(job("p").merged(["serviceApproval":.s("pending")])),.approval)
        XCTAssertEqual(APIJobsGroup.of(job("p",status:"done").merged(["serviceApproval":.s("pending")])),.done)
    }
    func testCombinedSearchCustomerDisciplineAndType(){
        var f=APIJobsFilters();f.customer="c";f.type="installation";f.discipline="irrigation"
        let row=job("j").merged(["customerName":.s("Pan Petřík"),"address":.s("Dřevníky 39"),"customerId":.s("c"),"discipline":.s("irrigation")])
        XCTAssertTrue(APIJobsPresentation.matches(row,filters:f,period:.today,query:"petrik",now:now))
        XCTAssertTrue(APIJobsPresentation.matches(row,filters:f,period:.today,query:"drevniky",now:now))
        f.discipline="garden";XCTAssertFalse(APIJobsPresentation.matches(row,filters:f,period:.today,query:"",now:now))
        f.discipline="irrigation";f.customer="other";XCTAssertFalse(APIJobsPresentation.matches(row,filters:f,period:.today,query:"",now:now))
    }
    func testEverySortHasStableTiesAndCorrectDirection(){
        let a=job("a").merged(["customerName":.s("Žák"),"plannedStart":.s("08:00"),"updatedAt":.n(20)])
        let b=job("b").merged(["customerName":.s("Adam"),"plannedStart":.s("10:00"),"updatedAt":.n(30)])
        XCTAssertEqual(APIJobsPresentation.sorted([b,a],by:.schedule).map(\.id),["a","b"])
        XCTAssertEqual(APIJobsPresentation.sorted([a,b],by:.customer).map(\.id),["b","a"])
        XCTAssertEqual(APIJobsPresentation.sorted([a,b],by:.updated).map(\.id),["b","a"])
    }
    func testWorkerRequestsCannotSelectAnotherEmployeeAndCarryUsesExistingEndpoints(){
        var f=APIJobsFilters();f.worker="someone-else"
        let paths=APIJobsPresentation.paths(filters:f,period:.today,mine:false,manager:false,userID:"me",now:now)
        XCTAssertEqual(paths.count,3)
        for p in paths{let q=URLComponents(string:p)!.queryItems!;XCTAssertEqual(q.first{$0.name=="assignee"}?.value,"me");XCTAssertEqual(URLComponents(string:p)?.path,"/api/jobs")}
        XCTAssertTrue(paths[0].contains("month=2026-11"));XCTAssertTrue(paths[1].contains("state=in_progress"));XCTAssertTrue(paths[2].contains("state=on_way"))
    }
    func testRangeUsesMonthCacheWhenSmallAndExistingPagedListWhenLong(){
        var f=APIJobsFilters();f.dateRange=true;f.from=now;f.to=APIJobsPresentation.calendar.date(byAdding:.day,value:40,to:now)!
        XCTAssertEqual(APIJobsPresentation.paths(filters:f,period:.all,mine:true,manager:true,userID:"me",now:now).count,2)
        f.to=APIJobsPresentation.calendar.date(byAdding:.month,value:12,to:now)!
        let p=APIJobsPresentation.paths(filters:f,period:.all,mine:true,manager:true,userID:"me",now:now)
        XCTAssertEqual(p.count,1);XCTAssertFalse(p[0].contains("month="))
    }
    func testCzechDatesAndMissingProgressDoNotInventValues(){
        XCTAssertEqual(APIJobsPresentation.appointment(job("j").merged(["plannedStart":.s("08:00")])),"20. 11. · 08:00")
        XCTAssertEqual(APIJobsPresentation.selectedDay(.tomorrow,now:ISO8601DateFormatter().date(from:"2026-11-20T23:30:00Z")!),"2026-11-22")
        XCTAssertTrue(job("j")["completionPercent"].isNull)
        XCTAssertNil(APIJobsPresentation.phone(job("j")))
    }
    @MainActor func testModelReusesScopedCacheAndDoesNotRediscoverIdentity()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let model=APIJobsListModel();await model.load(store:store,filters:APIJobsFilters(),period:.all,mine:true)
        XCTAssertFalse(model.rows.isEmpty);XCTAssertNil(model.problem)
        XCTAssertEqual(APIFixtureProtocol.requestSnapshot().filter{$0.url?.path=="/api/me"}.count,1)
        store.online=false;await model.load(store:store,filters:APIJobsFilters(),period:.today,mine:true)
        XCTAssertFalse(model.complete);XCTAssertNotNil(model.problem)
    }
    @MainActor func testForbiddenReloadClearsVisibleRows()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();let model=APIJobsListModel()
        await model.load(store:store,filters:APIJobsFilters(),period:.all,mine:true)
        XCTAssertFalse(model.rows.isEmpty)
        APIFixtureProtocol.lock.withLock{APIFixtureProtocol.forcedStatus["/api/jobs"]=403}
        await model.load(store:store,filters:APIJobsFilters(),period:.all,mine:true,refresh:true)
        XCTAssertTrue(model.rows.isEmpty);XCTAssertNotNil(model.problem)
    }
}
