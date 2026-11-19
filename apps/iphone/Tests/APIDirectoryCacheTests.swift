import XCTest
@testable import PracovniDenik

final class APIDirectoryCacheTests:XCTestCase {
    func testCompleteDirectoryCanBePagedAndSearchedWithoutLoadingMedia()throws{
        let rows=(0..<305).map{n in APIValue.object(["id":.s("c"+String(n)),"name":.s("Zákazník "+String(n)),"phones":.array([.object(["number":.s("123"+String(n))])]),"addresses":.array([.object(["address":.s("Lipová"),"city":.s("Blatná")])])])}
        let snapshot:APIValue = .object(["at":.n(1800000000000),"customers":.array(rows),"gardens":.array([])])
        var cursor="",ids=Set<String>()
        repeat{
            var url=URLComponents(string:"/api/customers")!;if !cursor.isEmpty{url.queryItems=[URLQueryItem(name:"cursor",value:cursor)]}
            let page=try APIDirectoryCache.result(url.string!,snapshot:snapshot,offline:true)
            XCTAssertLessThanOrEqual(page["customers"].array.count,100);ids.formUnion(page["customers"].array.map(\.id));cursor=page["nextCursor"].string
        }while !cursor.isEmpty
        XCTAssertEqual(ids.count,305)
        XCTAssertEqual(try APIDirectoryCache.result("/api/customers?q=blatna",snapshot:snapshot,offline:true)["customers"].array.count,100)
    }
    @MainActor func testWarmDirectorySurvivesAnOfflineStoreUsingTheSameVault()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let first=try await store.get("/api/customers"),count=APIFixtureProtocol.requestSnapshot().count
        XCTAssertFalse(first["customers"].array.isEmpty)
        let detail=try await store.get("/api/customers/customer-1");XCTAssertEqual(detail["customer"]["gardens"].array.count,2)
        _ = try await store.get("/api/gardens");XCTAssertEqual(APIFixtureProtocol.requestSnapshot().count,count)
        store.resetDirectory();store.online=false
        let restored=try await store.get("/api/customers?q=Kortus");XCTAssertEqual(restored["customers"].array.count,1)
        XCTAssertEqual(APIFixtureProtocol.requestSnapshot().count,count)
    }
    @MainActor func testAuthoritativeDenialPurgesCachedDirectory()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();_ = try await store.get("/api/customers")
        APIFixtureProtocol.forcedStatus["/api/customers"]=403
        do{_ = try await store.get("/api/customers",refresh:true);XCTFail("Must reject authoritative denial")}catch let error as APIError{XCTAssertEqual(error.status,403)}
        XCTAssertNil(store.vault?.state.cache[APIDirectoryCache.key]);store.online=false
        do{_ = try await store.get("/api/customers");XCTFail("Denied contacts must not remain available offline")}catch{}
    }
    @MainActor func testChangedGrantsAndPreviewCannotReadPriorDirectory()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();_ = try await store.get("/api/customers")
        try store.setRolePreview("reader");store.online=false
        do{_ = try await store.get("/api/customers");XCTFail("Preview must not expose actual-role cached contacts")}catch{}
        try store.setRolePreview(nil);store.online=true
        var changed=store.me;changed["workspace"]["authorizationVersion"] = .n(2);try store.bind(changed);store.online=false
        do{_ = try await store.get("/api/customers");XCTFail("Changed grants require a new directory")}catch{}
    }
    @MainActor func testTransientFailureRetainsDirectoryAndDrafts()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();_ = try await store.get("/api/customers")
        let local=try XCTUnwrap(store.vault),old=local.state.cache[APIDirectoryCache.key]
        local.state.drafts["draft"] = APIDraft(value:.object(["work":.s("Rozepsaná práce")]),baseVersion:1,operationID:"draft",updatedAt:Date())
        APIFixtureProtocol.forcedStatus["/api/customers"]=503
        let refreshed=try await store.get("/api/customers",refresh:true)
        XCTAssertFalse(refreshed["customers"].array.isEmpty)
        XCTAssertEqual(local.state.cache[APIDirectoryCache.key],old);XCTAssertNotNil(local.state.drafts["draft"])
        store.directoryChanged(path:"/api/customers/customer-1");XCTAssertNil(local.state.cache[APIDirectoryCache.key]);XCTAssertNotNil(local.state.drafts["draft"])
    }
}
