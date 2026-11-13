import XCTest
@testable import PracovniDenik

final class APIJobMonthCacheTests:XCTestCase {
    let today="2026-11-12"
    let path="/api/jobs?order=schedule&state=all&month=2026-11&day=2026-11-12"
    func job(_ id:String,_ day:String,status:String="planned")->APIValue{
        .object(["id":.s(id),"title":.s("Servis"),"dueDate":.s(day),"status":.s(status),"version":.n(1),"assignedTo":.s("worker"),"discipline":.s("irrigation"),"customerContact":.object(["id":.s("customer"),"name":.s("Kontakt"),"phones":.array([.s("PRIVATE")])]),"gardenNotes":.s("PRIVATE")])
    }
    func testThreeMonthsAndYearBoundary(){
        XCTAssertEqual(APIJobMonthCache.months(containing:today),["2026-11","2026-10","2026-12"])
        XCTAssertEqual(APIJobMonthCache.months(containing:"2027-01-01"),["2027-01","2026-12","2027-02"])
        XCTAssertNil(APIJobMonthCache.parameters("/api/jobs?order=schedule&month=2027-01",today:today))
        XCTAssertNil(APIJobMonthCache.parameters(path+"&cursor=next",today:today))
    }
    func testMonthFilteringOrderingCountsAndLeanCopy(){
        let rows=[job("done",today,status:"done"),job("failed",today,status:"incomplete"),job("active",today),job("working",today,status:"in_progress"),job("tomorrow","2026-11-13")]
        let state=APIJobMonthState(months:["2026-11":APIJobMonthSnapshot(jobs:rows,savedAt:Date(),revision:1)])
        let page=APIJobMonthCache.result(path:path,state:state,today:today)!
        XCTAssertEqual(page["jobs"].array.map(\.id),["working","active","failed","done"])
        XCTAssertEqual(page["calendar"]["days"].array.count,2)
        XCTAssertTrue(APIJobMonthCache.result(path:path+"&discipline=garden",state:state,today:today)!["jobs"].array.isEmpty)
        XCTAssertFalse(String(decoding:try! APIJobMonthCache.lean(rows[0]).data(),as:UTF8.self).contains("PRIVATE"))
    }
    @MainActor func testDownloadsAllThreeMonthsAndRepeatedReadsAvoidNetwork()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let months=APIJobMonthCache.months(containing:store.today),base=APIFixtureProtocol.fixtureData()["jobs"].array
        for (index,month) in months.enumerated(){var row=base[index];row["dueDate"] = .s(month+"-12");APIFixtureProtocol.records["/api/jobs/"+row.id]=row}
        await store.downloadJobMonths()
        XCTAssertEqual(Set(store.vault!.state.jobMonths!.months.keys),Set(months))
        let before=APIFixtureProtocol.requests.count
        for month in months{
            let page=try await store.get("/api/jobs?order=schedule&state=all&month="+month+"&day="+month+"-12")
            XCTAssertFalse(page["_jobCache"].isNull);XCTAssertFalse(page["jobs"].array.isEmpty)
        }
        XCTAssertEqual(APIFixtureProtocol.requests.count,before)
        store.online=false
        let offline=try await store.get("/api/jobs?order=schedule&state=all&month="+months[2]+"&day="+months[2]+"-12")
        XCTAssertTrue(offline["_jobCache"]["offline"].bool)
        store.online=true
        let refreshed=try await store.get("/api/jobs?order=schedule&state=all&month="+months[0],refresh:true)
        XCTAssertTrue(refreshed["_jobCache"].isNull);XCTAssertGreaterThan(APIFixtureProtocol.requests.count,before)
        store.resetJobMonthWork()
    }
    @MainActor func testRestartManifestDiscardsChangedVersionsAndKeepsDraftAndQueue()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();await store.downloadJobMonths()
        let local=store.vault!,month=String(store.today.prefix(7))
        store.saveDraft("kept",draft:APIDraft(value:.s("Neodeslaná práce"),baseVersion:1,operationID:"kept",updatedAt:Date()))
        store.online=false
        _ = try await store.write("/api/jobs/fixture-progress/service",method:"PUT",body:.object(["version":.n(1),"operationId":.s("pending"),"report":.object(["work":.s("Koncept")])]),offline:true,operationID:"pending")
        var changed=APIFixtureProtocol.fixtureData()["jobs"].array[0];changed["version"] = .n(2);APIFixtureProtocol.records["/api/jobs/"+changed.id]=changed
        store.online=true;store.resetJobMonthWork();await store.prepareJobMonths()
        XCTAssertNil(local.state.jobMonths?.months[month]);XCTAssertEqual(local.state.drafts["kept"]?.value,.s("Neodeslaná práce"));XCTAssertEqual(local.state.outbox.count,1)
        XCTAssertEqual(APIFixtureProtocol.requests.filter{$0.url?.path=="/api/workspace/manifest"}.count,2)
        XCTAssertEqual(APIFixtureProtocol.requests.filter{$0.url?.path=="/api/me"}.count,1)
        store.purgeJobMonthCopies();XCTAssertEqual(local.state.outbox.count,1);XCTAssertNotNil(local.state.drafts["kept"])
    }
    @MainActor func testAcknowledgedMoveUpdatesBothMonthsWithoutDiscardingOtherVisits()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();await store.downloadJobMonths()
        let months=APIJobMonthCache.months(containing:store.today),original=APIFixtureProtocol.fixtureData()["jobs"].array[0]
        var moved=original;moved["dueDate"] = .s(months[2]+"-15");moved["version"] = .n(2)
        store.jobMonthsChanged(path:"/api/jobs/"+moved.id,result:.object(["job":moved]))
        XCTAssertFalse(store.vault!.state.jobMonths!.months[months[0]]!.jobs.contains{$0.id==moved.id})
        XCTAssertEqual(store.vault!.state.jobMonths!.months[months[2]]!.jobs.first?["version"],.n(2))
        XCTAssertTrue(store.vault!.state.jobMonths!.months[months[0]]!.dirty)
        store.jobMonthsChanged(path:"/api/jobs/"+moved.id,result:.object(["deleted":.bool(true)]))
        XCTAssertFalse(store.vault!.state.jobMonths!.months.values.flatMap(\.jobs).contains{$0.id==moved.id})
    }
    @MainActor func testLegacyVaultDecodesAndEncryptedMonthCacheRestores()throws{
        let old=try JSONEncoder().encode(APILocalState());var object=try JSONSerialization.jsonObject(with:old) as! [String:Any];object.removeValue(forKey:"jobMonths")
        XCTAssertNil(try JSONDecoder().decode(APILocalState.self,from:JSONSerialization.data(withJSONObject:object)).jobMonths)
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent("MonthVault-"+UUID().uuidString)
        defer{try? FileManager.default.removeItem(at:directory)}
        let key=Data(repeating:29,count:32),scope="month-test"
        let vault=try APIVault(scope:scope,directory:directory,keyMaterial:key)
        vault.state.jobMonths=APIJobMonthState(months:["2026-11":APIJobMonthSnapshot(jobs:[job("one",today)],savedAt:Date(),revision:1)])
        try vault.persist()
        let restored=try APIVault(scope:scope,directory:directory,keyMaterial:key)
        XCTAssertEqual(restored.state.jobMonths?.months["2026-11"]?.jobs.first?.id,"one")
        let stored=try FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:nil).first!
        XCTAssertFalse(String(decoding:try Data(contentsOf:stored),as:UTF8.self).contains("PRIVATE"))
    }
}
