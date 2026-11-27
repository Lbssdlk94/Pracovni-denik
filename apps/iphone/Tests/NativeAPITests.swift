import XCTest
import PDFKit
@testable import PracovniDenik

final class NativeAPITests:XCTestCase {
    func testGardenPrefillUsesExactIDsAndPreservesManualInput(){let input:APIValue = .object(["gardenId":.s("garden-1"),"address":.s("Ručně doplněná adresa")]);let result=APIDomainLogic.prefillGarden(input,garden:APIFixtureProtocol.gardens[0],touched:["address"]);XCTAssertEqual(result["customerId"],.s("customer-1"));XCTAssertEqual(result["customerAddressId"],.s("address-1"));XCTAssertEqual(result["city"],.s("Blatná"));XCTAssertEqual(result["address"],input["address"]);XCTAssertEqual(APIDomainLogic.prefillGarden(input,garden:APIFixtureProtocol.gardens[1],touched:[]),input)}
    func testIncompleteGardenNeverClearsExistingValues(){let result=APIDomainLogic.prefillGarden(.object(["gardenId":.s("garden-2"),"city":.s("Doplněné město")]),garden:APIFixtureProtocol.gardens[1],touched:[]);XCTAssertEqual(result["city"],.s("Doplněné město"));XCTAssertNotEqual(APIDomainLogic.referenceLabel(APIFixtureProtocol.gardens[0],kind:"gardens"),APIDomainLogic.referenceLabel(APIFixtureProtocol.gardens[1],kind:"gardens"))}
    func testMoneyUsesImmutablePriceAndDecimalRounding(){let line:APIValue = .object(["priceMinor":.n(199),"quantity":.number(1.5)]);XCTAssertEqual(APIProtocolPDF.lineTotal(line),299)}
    @MainActor func testTransportRestrictsOriginAndSendsScopeWithoutRedirects()async throws{APIFixtureProtocol.reset();let transport=APITransport(origin:EndpointPolicy.home,fixture:true);transport.discipline="garden";_ = try await transport.request("/api/me");let r=try XCTUnwrap(APIFixtureProtocol.requests.last);XCTAssertEqual(r.value(forHTTPHeaderField:"x-work-discipline"),"garden");XCTAssertEqual(r.value(forHTTPHeaderField:"x-workspace-client-version"),"shared-directory-v1");for path in ["https://evil.test/api/me","//evil.test/api/me","/not-api"]{do{_ = try await transport.request(path);XCTFail("Unexpected path accepted")}catch{}}}
    @MainActor func testCloudflareAccessCookieStaysOnTestWorker() throws {
        let origin = try XCTUnwrap(URL(string: "https://" + EndpointPolicy.cloudflareHost))
        let cloudflare = APITransport(origin: origin, fixture: true)
        let production = APITransport(origin: EndpointPolicy.home, fixture: true)
        try cloudflare.setCloudflareCookie("header.payload.signature")
        try production.setCloudflareCookie("header.payload.signature")
        XCTAssertEqual(try cloudflare.requestFor("/api/me").value(forHTTPHeaderField: "Cookie"),
                       "CF_Authorization=header.payload.signature")
        XCTAssertNil(try production.requestFor("/api/me").value(forHTTPHeaderField: "Cookie"))
        XCTAssertThrowsError(try cloudflare.setCloudflareCookie("invalid; other=value"))
        try cloudflare.forgetCredential()
        XCTAssertNil(try cloudflare.requestFor("/api/me").value(forHTTPHeaderField: "Cookie"))
    }
    @MainActor func testFailedOptionalReadDoesNotLockLegitimateAccount()async throws{APIFixtureProtocol.reset();let store=APIStore(fixture:true);try store.bind(APIFixtureProtocol.fixtureData()["context"]);APIFixtureProtocol.forcedStatus["/api/zones"]=403;do{_ = try await store.get("/api/zones");XCTFail("Access must be denied")}catch{};XCTAssertTrue(store.authenticated);let customers=try await store.get("/api/customers");XCTAssertFalse(customers["customers"].array.isEmpty)}
    @MainActor func testOfflineLeaseExpiresAndPermissionScopesAreSeparate()throws{let store=APIStore(fixture:true);try store.bind(APIFixtureProtocol.fixtureData()["context"]);let first=store.scope;XCTAssertTrue(store.vault!.offlineAllowed());XCTAssertFalse(store.vault!.offlineAllowed(at:Date().addingTimeInterval(86500)));var changed=store.me;changed["features"]["materials"] = .bool(false);try store.bind(changed);XCTAssertNotEqual(first,store.scope);XCTAssertTrue(store.vault!.state.drafts.isEmpty)}
    @MainActor func testOutboxDuplicateAndChangedPayloadAreRejected()throws{let v=try APIVault(scope:"isolated-test",memoryOnly:true);let op=APIMutation(id:"one",path:"/api/defects/one",method:"PUT",body:.object(["title":.s("Závada")]),bytes:nil,contentType:"application/json",headers:[:],scope:v.scope,dependsOn:[],draftKey:nil);try v.enqueue(op);try v.enqueue(op);XCTAssertEqual(v.state.outbox.count,1);let changed=APIMutation(id:"one",path:op.path,method:op.method,body:.object(["title":.s("Jiná závada")]),bytes:nil,contentType:op.contentType,headers:[:],scope:v.scope,dependsOn:[],draftKey:nil);XCTAssertThrowsError(try v.enqueue(changed));XCTAssertEqual(v.state.outbox.count,1)}
    @MainActor func testStatusSavePersistsAndIncompleteIsNeverDone()async throws{APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.restore();let job=(try await store.get("/api/jobs/fixture-progress"))["job"];_ = try await store.write("/api/jobs/fixture-progress/status",method:"PATCH",body:.object(["version":job["version"],"status":.s("incomplete"),"incompleteReason":.s("Chyběl materiál")]));let saved=(try await store.get("/api/jobs/fixture-progress"))["job"];XCTAssertEqual(saved["status"],.s("incomplete"));let list=(try await store.get("/api/jobs?order=schedule"))["jobs"].array;XCTAssertEqual(list.first?.id,"fixture-next");XCTAssertEqual(list.last?["status"],.s("done"))}
    @MainActor func testProtocolOfflineQueueIsIdempotentAndKeepsSnapshot()async throws{APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.restore();let job=(try await store.get("/api/jobs/fixture-progress"))["job"];store.online=false;let body:APIValue = .object(["version":job["version"],"operationId":.s("stable"),"report":.object(["work":.s("Kontrola"),"materialItems":.array([APIFixtureProtocol.material])])]);_ = try await store.write("/api/jobs/fixture-progress/service",method:"PUT",body:body,offline:true,operationID:"stable");_ = try await store.write("/api/jobs/fixture-progress/service",method:"PUT",body:body,offline:true,operationID:"stable");XCTAssertEqual(store.outbox.count,1);store.online=true;await store.sync();XCTAssertTrue(store.outbox.isEmpty);let saved=(try await store.get("/api/jobs/fixture-progress/service"))["report"];XCTAssertEqual(saved["materialItems"].array.first?["priceMinor"],.n(24500))}
    @MainActor func testPlannerRevisionDoesNotChangeAuthorizationScope()throws{let store=APIStore(fixture:true);var me=APIFixtureProtocol.fixtureData()["context"];me["workspace"]["plannerVersion"] = .n(1);try store.bind(me);let scope=store.scope;me["workspace"]["plannerVersion"] = .n(2);try store.bind(me);XCTAssertEqual(scope,store.scope)}
    @MainActor func testNewerDraftSurvivesSuccessfulSync()async throws{APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.restore();let original:APIValue = .object(["version":.n(1),"report":.object(["work":.s("Původní")])]);store.saveDraft("protocol:fixture-progress",draft:APIDraft(value:original,baseVersion:1,operationID:"draft-op",updatedAt:Date()));store.online=false;_ = try await store.write("/api/jobs/fixture-progress/service",method:"PUT",body:original.merged(["operationId":.s("draft-op")]),offline:true,draftKey:"protocol:fixture-progress",operationID:"draft-op");var newer=store.vault!.state.drafts["protocol:fixture-progress"]!;newer.value["report"]["work"] = .s("Novější neodeslaná práce");store.saveDraft("protocol:fixture-progress",draft:newer);store.online=true;await store.sync();XCTAssertTrue(store.outbox.isEmpty);let retained=try XCTUnwrap(store.vault!.state.drafts["protocol:fixture-progress"]);XCTAssertEqual(retained.value["report"]["work"],.s("Novější neodeslaná práce"));XCTAssertNotEqual(retained.operationID,"draft-op")}
    @MainActor func testOneConflictDoesNotStopOtherQueuedChanges()async throws{APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.restore();store.online=false;for id in ["fixture-progress","fixture-next"]{_ = try await store.write("/api/jobs/"+id+"/service",method:"PUT",body:.object(["version":.n(1),"operationId":.s(id),"report":.object(["work":.s(id)])]),offline:true,operationID:id)};APIFixtureProtocol.forcedStatus["/api/jobs/fixture-progress/service"]=409;store.online=true;await store.sync();XCTAssertTrue(store.authenticated);XCTAssertEqual(store.outbox.count,1);XCTAssertEqual(store.outbox.first?.state,"conflict");let response=try await store.get("/api/jobs/fixture-next/service");XCTAssertEqual(response["report"]["work"],.s("fixture-next"))}
    @MainActor func testBinaryOutboxDoesNotKeepLargePayloadInState()throws{let vault=try APIVault(scope:"photo-test",memoryOnly:true);let bytes=Data(repeating:71,count:1024*1024);let op=APIMutation(id:"photo",path:"/api/jobs/job/service/photos/photo",method:"PUT",body:nil,bytes:bytes,contentType:"image/jpeg",headers:[:],scope:vault.scope,dependsOn:[],draftKey:nil);try vault.enqueue(op);XCTAssertNil(vault.state.outbox[0].bytes);XCTAssertEqual(try vault.mutationBytes(vault.state.outbox[0]),bytes);XCTAssertLessThan(try JSONEncoder().encode(vault.state).count,3000);try vault.enqueue(op);XCTAssertEqual(vault.state.outbox.count,1)}
    @MainActor func testEncryptedVaultRestoresDraftWithoutPlaintext()throws{
        let directory=FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("VaultTest-"+UUID().uuidString,isDirectory:true)
        let scope="vault-test-"+UUID().uuidString
        defer{if FileManager.default.fileExists(atPath:directory.path){try? FileManager.default.removeItem(at:directory)}}
        let vault:APIVault
        do{vault=try APIVault(scope:scope,directory:directory,keyMaterial:Data(repeating:29,count:32))}catch{XCTFail("Vault initialization: \(error)");return}
        vault.state.drafts["one"]=APIDraft(value:.object(["note":.s("Soukromá poznámka")]),baseVersion:1,operationID:"one",updatedAt:Date())
        do{try vault.persist()}catch{XCTFail("Encrypted atomic persistence: \(error)");return}
        let files=try FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:nil)
        XCTAssertEqual(files.count,1)
        let stored=try Data(contentsOf:files[0]);XCTAssertFalse(String(decoding:stored,as:UTF8.self).contains("Soukromá poznámka"))
        let restored:APIVault
        do{restored=try APIVault(scope:scope,directory:directory,keyMaterial:Data(repeating:29,count:32))}catch{XCTFail("Encrypted restoration: \(error)");return}
        XCTAssertEqual(restored.state.drafts["one"]?.value["note"],.s("Soukromá poznámka"))
    }
    @MainActor func testWorkerCannotEditCommercialResources(){let store=APIStore(fixture:true);var me=APIFixtureProtocol.fixtureData()["context"];me["user"]["role"] = .s("worker");me["permissions"]["manage"] = .bool(false);try? store.bind(me);for entity:APIEntity in [.tariffs,.customers,.materials,.vehicles,.jobs]{XCTAssertFalse(APIResource(entity:entity).editable(store))};XCTAssertTrue(APIResource(entity:.defects).editable(store))}

    func testMalformedNumberNeverTrapsTheClient(){XCTAssertEqual(APIValue.number(1e300).int,0);XCTAssertEqual(APIValue.string("inf").int,0);XCTAssertEqual(APIValue.number(12).int,12)}
    func testTarParserRejectsTraversalAndChecksumDamage()throws{
        func archive(name:String)->Data{let payload=Data("{\"id\":\"fixture\"}".utf8);var header=Data(repeating:0,count:512);func field(_ text:String,_ offset:Int){for(i,byte)in text.utf8.enumerated(){header[offset+i]=byte}};field(name,0);field(String(format:"%011o",payload.count),124);header[156]=48;for i in 148..<156{header[i]=32};let checksum=header.reduce(0){$0+Int($1)};field(String(format:"%06o",checksum)+"\0 ",148);var result=header;result.append(payload);result.append(Data(repeating:0,count:512-payload.count));result.append(Data(repeating:0,count:1024));return result}
        let url=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString+".tar");defer{try? FileManager.default.removeItem(at:url)}
        try archive(name:"manifest.json").write(to:url);let entries=try APITar.entries(url);XCTAssertEqual(entries.map(\.name),["manifest.json"]);XCTAssertEqual(try APITar.read(entries[0],url:url),Data("{\"id\":\"fixture\"}".utf8))
        try archive(name:"../manifest.json").write(to:url);XCTAssertThrowsError(try APITar.entries(url));var damaged=archive(name:"manifest.json");damaged[20]=13;try damaged.write(to:url);XCTAssertThrowsError(try APITar.entries(url))
    }

    func testWorkAndTravelUseStartedBlocksAndStoredRates(){let charges:APIValue = .object(["hours":.number(1.1),"kilometers":.number(30.1),"hourlyMinor":.n(80000),"travelRateMinor":.n(30000)]);XCTAssertEqual(APIProtocolPDF.chargeTotal(charges),220000);XCTAssertNil(APIProtocolPDF.chargeTotal(.object(["hours":.n(2),"kilometers":.n(60)])))}
    @MainActor func testGardenWorkerCannotOpenIrrigationSections(){let store=APIStore(fixture:true);var me=APIFixtureProtocol.fixtureData()["context"];me["user"]["role"] = .s("worker");me["workspace"]["disciplines"] = .array([.s("garden")]);try? store.bind(me);for feature in ["shafts","blowout","plans","zoneManagement"]{XCTAssertFalse(store.enabled(feature))};XCTAssertTrue(store.enabled("gardens"))}

    @MainActor func testOneCachedServerFailureDoesNotPutTheWholeClientOffline()async throws{APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.restore();_ = try await store.get("/api/zones");APIFixtureProtocol.forcedStatus["/api/zones"]=503;_ = try await store.get("/api/zones");XCTAssertTrue(store.online);let before=APIFixtureProtocol.requests.count;let customers=try await store.get("/api/customers");XCTAssertFalse(customers["customers"].array.isEmpty);XCTAssertGreaterThan(APIFixtureProtocol.requests.count,before)}

    func testSelectingMaterialTwiceAddsQuantityWithoutChangingFrozenPrice()throws{
        let first=try APIMaterialSelection.add(APIFixtureProtocol.material,to:.array([]),quantity:"1,5")
        var changed=APIFixtureProtocol.material;changed["priceMinor"] = .n(99900);changed["version"] = .n(2)
        let second=try APIMaterialSelection.add(changed,to:first,quantity:"2")
        XCTAssertEqual(second.array.count,1);XCTAssertEqual(second.array[0]["quantity"],.number(3.5));XCTAssertEqual(second.array[0]["priceMinor"],.n(24500));XCTAssertEqual(second.array[0]["itemVersion"],.n(1))
        XCTAssertThrowsError(try APIMaterialSelection.add(changed,to:second,quantity:"inf"))
    }
    @MainActor func testLongProtocolPDFContainsEveryPageAndRejectsInvalidCharges()throws{
        let long=String(repeating:"Kontrola ventilů a postřikovačů. ",count:240)+"KONEC-ZAZNAMU"
        let report:APIValue = .object(["date":.s("2026-11-06"),"work":.s(long),"documentState":.s("draft")])
        let bytes=try APIProtocolPDF.make(snapshot:.object([:]),report:report)
        let document=try XCTUnwrap(PDFDocument(data:bytes));XCTAssertGreaterThan(document.pageCount,1)
        let all=(0..<document.pageCount).compactMap{document.page(at:$0)?.string}.joined()
        XCTAssertTrue(all.contains("KONEC-ZAZNAMU"));XCTAssertTrue(all.contains("Rozpracovaný protokol"))
        XCTAssertThrowsError(try APIProtocolPDF.make(snapshot:.null,report:report.merged(["workCharges":.object(["hours":.number(1e300)])])))
    }

    @MainActor func testPermissionsAreDiscoveredOnlyOncePerAppLaunch()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true)
        await store.start();XCTAssertTrue(store.authenticated)
        let permissions=store.me,scope=store.scope,verifiedAt=store.vault!.state.verifiedAt
        APIFixtureProtocol.forcedStatus["/api/me"]=503
        await store.start();await store.restore();await store.resume();await store.resume()
        _ = try await store.get("/api/customers")
        _ = try await store.write("/api/jobs/fixture-progress/status",method:"PATCH",body:.object(["version":.n(1),"status":.s("in_progress")]))
        XCTAssertEqual(APIFixtureProtocol.requests.filter{$0.url?.path=="/api/me"}.count,1)
        XCTAssertEqual(store.me,permissions);XCTAssertEqual(store.scope,scope);XCTAssertEqual(store.vault!.state.verifiedAt,verifiedAt)
        XCTAssertTrue(store.authenticated)
    }
    @MainActor func testPullToRefreshDoesNotAlsoTriggerTheRevisionDrivenLoad()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let revision=store.revision
        await store.resume(refreshViews:false)
        XCTAssertEqual(store.revision,revision,"The visible screen performs its explicit refresh; do not restart its task as well")
        let page=try await store.get("/api/jobs?state=active&order=schedule",refresh:true)
        XCTAssertFalse(page["jobs"].array.isEmpty)
        let requests=APIFixtureProtocol.requestSnapshot()
        XCTAssertEqual(requests.filter{$0.url?.path=="/api/jobs"}.count,1)
        XCTAssertEqual(requests.filter{$0.url?.path=="/api/me"}.count,1)
        await store.resume()
        XCTAssertNotEqual(store.revision,revision,"Background/foreground refresh still updates visible views")
    }
    @MainActor func testQueuedSyncAndWatchRefreshDoNotRediscoverPermissions()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        APIFixtureProtocol.forcedStatus["/api/me"]=503;store.online=false
        _ = try await store.write("/api/jobs/fixture-progress/service",method:"PUT",body:.object(["version":.n(1),"operationId":.s("startup-only-report"),"report":.object(["work":.s("Kontrola")])]),offline:true,operationID:"startup-only-report")
        XCTAssertEqual(store.outbox.count,1);await store.resume();XCTAssertTrue(store.outbox.isEmpty)
        let input=try XCTUnwrap(JSONSerialization.jsonObject(with:JSONEncoder().encode(WatchRequest.refresh())) as? [String:Any])
        let reply=try await APIWatchService.execute(store,input:input)
        XCTAssertNotNil(reply.snapshot)
        XCTAssertEqual(APIFixtureProtocol.requests.filter{$0.url?.path=="/api/me"}.count,1)
    }
    @MainActor func testNewAppInstanceLoadsChangedPermissions()async throws{
        APIFixtureProtocol.reset();let first=APIStore(fixture:true);await first.start();XCTAssertTrue(first.manager)
        var changed=first.me;changed["user"]["role"] = .s("worker");changed["permissions"]["manage"] = .bool(false)
        APIFixtureProtocol.records["/api/me"]=changed
        await first.resume();XCTAssertTrue(first.manager)
        let next=APIStore(fixture:true);await next.start()
        XCTAssertEqual(next.role,"worker");XCTAssertFalse(next.manager);XCTAssertNotEqual(first.scope,next.scope)
        XCTAssertEqual(APIFixtureProtocol.requests.filter{$0.url?.path=="/api/me"}.count,2)
    }
    @MainActor func testServerPermissionDenialStillBlocksQueuedMutation()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        APIFixtureProtocol.forcedStatus["/api/jobs/fixture-progress/service"]=403
        do{_ = try await store.write("/api/jobs/fixture-progress/service",method:"PUT",body:.object(["version":.n(1),"operationId":.s("denied-report"),"report":.object(["work":.s("Soukromý koncept")])]),offline:true,operationID:"denied-report");XCTFail("Server denial must not look like a successful save")}catch{}
        XCTAssertTrue(store.authenticated);XCTAssertEqual(store.outbox.first?.state,"blocked")
        XCTAssertEqual(store.outbox.first?.body?["report"]["work"],.s("Soukromý koncept"))
        XCTAssertEqual(APIFixtureProtocol.requests.filter{$0.url?.path=="/api/me"}.count,1)
    }
    @MainActor func testExpiredServerSessionPreservesUnsentQueueAndDoesNotAutomaticallyRelogin()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();let local=try XCTUnwrap(store.vault)
        let draft=APIDraft(value:.object(["work":.s("Neodeslaná práce")]),baseVersion:1,operationID:"expired-report",updatedAt:Date())
        store.saveDraft("protocol:fixture-progress",draft:draft)
        APIFixtureProtocol.forcedStatus["/api/jobs/fixture-progress/service"]=401
        do{_ = try await store.write("/api/jobs/fixture-progress/service",method:"PUT",body:.object(["version":.n(1),"operationId":.s("expired-report"),"report":draft.value]),offline:true,draftKey:"protocol:fixture-progress",operationID:"expired-report");XCTFail("An expired session cannot acknowledge queued work")}catch{}
        XCTAssertFalse(store.authenticated);XCTAssertEqual(local.state.outbox.count,1);XCTAssertEqual(local.state.drafts["protocol:fixture-progress"],draft)
        await store.resume();await store.start()
        XCTAssertEqual(APIFixtureProtocol.requests.filter{$0.url?.path=="/api/me"}.count,1)
    }
    @MainActor func testDirectWriteHonorsExpiredSessionWithoutPermissionsPreflight()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        APIFixtureProtocol.forcedStatus["/api/jobs/fixture-progress/status"]=401
        do{_ = try await store.write("/api/jobs/fixture-progress/status",method:"PATCH",body:.object(["version":.n(1),"status":.s("done")]));XCTFail("Server authentication must remain authoritative")}catch{}
        XCTAssertFalse(store.authenticated)
        XCTAssertEqual(APIFixtureProtocol.requests.filter{$0.url?.path=="/api/me"}.count,1)
    }
    @MainActor func testLongRunningOnlineSessionCanSyncWithoutExtendingOfflinePermissionLease()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let expired=Date().addingTimeInterval(-86500);store.vault!.state.verifiedAt=expired
        _ = try await store.write("/api/jobs/fixture-progress/service",method:"PUT",body:.object(["version":.n(1),"operationId":.s("online-expired-offline-lease"),"report":.object(["work":.s("Online uložená práce")])]),offline:true,operationID:"online-expired-offline-lease")
        XCTAssertTrue(store.outbox.isEmpty);XCTAssertEqual(store.vault!.state.verifiedAt,expired)
        store.online=false
        do{_ = try await store.write("/api/jobs/fixture-next/service",method:"PUT",body:.object(["version":.n(1),"report":.object(["work":.s("Neověřená offline práce")])]),offline:true,operationID:"denied-expired-offline");XCTFail("The offline lease must not be extended by data refreshes")}catch{}
        XCTAssertTrue(store.outbox.isEmpty)
        XCTAssertEqual(APIFixtureProtocol.requests.filter{$0.url?.path=="/api/me"}.count,1)
    }

    @MainActor func testRolePreviewChangesPresentationWithoutChangingActualRoleOrPollingIdentity()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let realScope=store.scope,real=try XCTUnwrap(store.vault)
        try store.setRolePreview("reader")
        XCTAssertEqual(store.role,"reader");XCTAssertEqual(store.actualRole,"owner");XCTAssertFalse(store.manager);XCTAssertFalse(store.writer);XCTAssertTrue(store.canPreviewRoles)
        // Background refreshes from another store may finish after this request.
        // Assert the actual preview request rather than the shared log's last item.
        let marker="rolePreviewCheck="+UUID().uuidString
        _ = try await store.get("/api/customers?"+marker)
        let previewRequest=try XCTUnwrap(APIFixtureProtocol.requestSnapshot().last{$0.url?.path=="/api/customers" && $0.url?.query==marker})
        XCTAssertEqual(previewRequest.value(forHTTPHeaderField:"x-work-diary-preview-role"),"reader")
        try store.setRolePreview(nil)
        XCTAssertEqual(store.role,"owner");XCTAssertTrue(store.manager);XCTAssertTrue(store.vault === real);XCTAssertEqual(store.scope,realScope)
        XCTAssertEqual(APIFixtureProtocol.requests.filter{$0.url?.path=="/api/me"}.count,1)
    }
    @MainActor func testPreviewUsesDisposableStorageAndCannotWriteOrSyncTheActualQueue()async throws{
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start();let real=try XCTUnwrap(store.vault)
        let draft=APIDraft(value:.object(["work":.s("Skutečná rozepsaná práce")]),baseVersion:1,operationID:"real-draft",updatedAt:Date())
        store.saveDraft("protocol:fixture-progress",draft:draft)
        let operation=APIMutation(id:"real-queued",path:"/api/jobs/fixture-progress/service",method:"PUT",body:.object(["version":.n(1),"operationId":.s("real-queued"),"report":.object(["work":.s("Skutečná práce")])]),bytes:nil,contentType:"application/json",headers:[:],scope:store.scope,dependsOn:[],draftKey:nil)
        try real.enqueue(operation);store.updateOutbox();let count=APIFixtureProtocol.requests.count
        try store.setRolePreview("worker");XCTAssertTrue(store.writer);XCTAssertTrue(store.outbox.isEmpty)
        do{_ = try await store.write(operation.path,method:"PUT",body:operation.body!,offline:true);XCTFail("Preview must not submit or enqueue")}catch{}
        do{try await store.upload("/api/jobs/fixture-progress/service/photos/test",bytes:Data([1]),type:"image/jpeg",offline:true);XCTFail("Preview must not enqueue media")}catch{}
        await store.sync();XCTAssertEqual(APIFixtureProtocol.requests.count,count)
        store.saveDraft("protocol:fixture-progress",draft:APIDraft(value:.null,baseVersion:1,operationID:"preview",updatedAt:Date()))
        store.vault!.state.drafts["preview-only"]=draft
        try store.setRolePreview(nil)
        XCTAssertEqual(real.state.drafts["protocol:fixture-progress"],draft);XCTAssertNil(real.state.drafts["preview-only"]);XCTAssertEqual(store.outbox.map(\.id),["real-queued"])
    }
    @MainActor func testOnlyActualOwnerAndAdministratorMaySelectLowerPreviewRoles()throws{
        let store=APIStore(fixture:true);var me=APIFixtureProtocol.fixtureData()["context"]
        for role in ["worker","reader","admin"]{me["user"]["role"] = .s(role);try store.bind(me);XCTAssertFalse(store.canPreviewRoles);XCTAssertThrowsError(try store.setRolePreview("reader"))}
        me["user"]["role"] = .s("administrator");try store.bind(me);XCTAssertEqual(store.previewTargets,["admin","worker","reader"])
        XCTAssertThrowsError(try store.setRolePreview("owner"));XCTAssertThrowsError(try store.setRolePreview("administrator"));try store.setRolePreview("reader");XCTAssertEqual(store.actualRole,"administrator")
    }
    @MainActor func testPreviewSwitchCannotDiscardAnOpenForm()throws{
        let store=APIStore(fixture:true);try store.bind(APIFixtureProtocol.fixtureData()["context"]);store.beginEdit()
        XCTAssertThrowsError(try store.setRolePreview("reader"));XCTAssertEqual(store.role,"owner");store.endEdit();try store.setRolePreview("reader");XCTAssertTrue(store.isRolePreview)
    }

}
