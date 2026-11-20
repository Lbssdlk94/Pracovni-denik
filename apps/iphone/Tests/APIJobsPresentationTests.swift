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
        XCTAssertTrue(APIJobsPresentation.matches(job("queued",day:"2026-11-19"),filters:f,period:.today,query:"",now:now,personalActiveID:"queued"))
        XCTAssertFalse(APIJobsPresentation.matches(job("other",day:"2026-11-19"),filters:f,period:.today,query:"",now:now,personalActiveID:"queued"))
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
    @MainActor func testAllPagesAreMergedBeforeFinalSortAndDuplicateVersionsAreReplaced()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let rows=(0..<205).map{job(String(format:"job-%03d",$0)).merged(["version":.n(1)])}
        let newer=rows[0].merged(["version":.n(2),"customerName":.s("Aktualizovaný zákazník")])
        let pages:[APIValue]=[.object(["jobs":.array(Array(rows.prefix(100))),"nextCursor":.s("1")]),.object(["jobs":.array(Array(rows[100..<200])),"nextCursor":.s("2")]),.object(["jobs":.array(Array(rows.suffix(5))+[newer]),"nextCursor":.null])]
        APIFixtureProtocol.lock.withLock{APIFixtureProtocol.records["fixture-job-pages"] = .array(pages)}
        let model=APIJobsListModel();await model.load(store:store,filters:APIJobsFilters(),period:.all,mine:true)
        XCTAssertTrue(model.complete);XCTAssertNil(model.problem);XCTAssertEqual(model.rows.count,205)
        XCTAssertEqual(model.rows.first{$0.id==newer.id}?["version"].int,2)
        XCTAssertEqual(APIJobsPresentation.sorted(model.rows,by:.customer).first?.id,newer.id)
    }
    @MainActor func testRepeatingCursorStopsWithoutLosingLoadedDataOrClaimingCompleteness()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let page:APIValue = .object(["jobs":.array([job("one")]),"nextCursor":.s("0")])
        APIFixtureProtocol.lock.withLock{APIFixtureProtocol.records["fixture-job-pages"] = .array([page])}
        let model=APIJobsListModel();await model.load(store:store,filters:APIJobsFilters(),period:.all,mine:true)
        XCTAssertFalse(model.complete);XCTAssertNotNil(model.problem);XCTAssertEqual(model.rows.count,1)
    }
    @MainActor func testListReloadCannotDropPendingWorkAndSyncReplaysOnlyOnce()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let path="/api/jobs/fixture-progress/time",snapshot=try await store.get(path),version=snapshot["states"].array.first{$0["userId"].string==store.userID}?["version"] ?? .n(0)
        let at=Date().timeIntervalSince1970*1000-10000
        store.online=false
        _ = try await store.write(path+"/actions",method:"POST",body:.object(["operationId":.s("jobs-offline-work"),"action":.s("work"),"at":.number(at),"workers":.array([.object(["userId":.s(store.userID),"version":version])])]),offline:true,operationID:"jobs-offline-work")
        let model=APIJobsListModel();await model.load(store:store,filters:APIJobsFilters(),period:.today,mine:true)
        XCTAssertEqual(store.outbox.count,1)
        store.online=true;await store.sync();await store.sync()
        XCTAssertTrue(store.outbox.isEmpty)
        let after=try await store.get(path);XCTAssertEqual(after["intervals"].array.count,1)
    }
    @MainActor func testLargeAuthorizedOfflineMonthUsesExistingDaySelections()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();store.online=false
        let month=String(store.today.prefix(7)),rows=(0..<650).map{index in job("cached-\(index)",day:month+(index<325 ? "-01" : "-02"))}
        store.vault?.state.jobMonths=APIJobMonthState(months:[month:APIJobMonthSnapshot(jobs:rows,savedAt:Date(),revision:1)],verifiedAt:Date());store.jobMonthsAuthorized=true;store.jobMonthsReady=true
        let model=APIJobsListModel();await model.load(store:store,filters:APIJobsFilters(),period:.all,mine:false)
        // Fixture IDs in this test represent the current account's existing cache.
        // The 'all team' manager request has no assignee and preserves all 650.
        XCTAssertEqual(model.rows.count,650);XCTAssertFalse(model.complete);XCTAssertTrue(model.cache["offline"].bool)
    }
    @MainActor func testTransientServerFallbackKeepsItsOriginalTimestampAndIsAlwaysStale()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let path="/api/jobs?state=all&order=schedule&month="+String(store.today.prefix(7))
        _ = try await store.get(path,refresh:true)
        let stamp=store.vault?.state.cache[path]?["_jobCache"]["at"] ?? .null
        XCTAssertGreaterThan(stamp.double,0)
        APIFixtureProtocol.lock.withLock{APIFixtureProtocol.forcedStatus["/api/jobs"]=503}
        let fallback=try await store.get(path,refresh:true)
        XCTAssertEqual(fallback["_jobCache"]["at"],stamp);XCTAssertTrue(fallback["_jobCache"]["stale"].bool);XCTAssertTrue(store.online)
    }
}
