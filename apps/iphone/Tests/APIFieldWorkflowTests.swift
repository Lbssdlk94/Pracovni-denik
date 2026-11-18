import XCTest
import UIKit
@testable import PracovniDenik

final class APIFieldWorkflowTests:XCTestCase {
    func testPrimaryActionTracksActualJobStateAndNeverCompletesAnIncompleteVisit() {
        for (status,expected) in [("planned",APIJobPrimaryAction.departure),("on_way",.start),("in_progress",.complete)] {
            XCTAssertEqual(APIJobWorkflow.primary(.object(["status":.s(status)]),travelEnabled:true),expected)
        }
        for status in ["done","incomplete","unknown",""] {
            XCTAssertNil(APIJobWorkflow.primary(.object(["status":.s(status)]),travelEnabled:true))
        }
        XCTAssertEqual(APIJobWorkflow.primary(.object(["status":.s("planned")]),travelEnabled:false),.start)
        XCTAssertNil(APIJobWorkflow.primary(.object(["status":.s("planned"),"cancelled":.bool(true)]),travelEnabled:true))
    }
    func testWorkActionsRequireAssignmentAndWriterPermission() {
        let job:APIValue = .object(["assignedTos":.array([.s("worker"),.s("other")])])
        XCTAssertTrue(APIJobWorkflow.canWork(job,userID:"worker",writer:true,manager:false))
        XCTAssertFalse(APIJobWorkflow.canWork(job,userID:"outsider",writer:true,manager:false))
        XCTAssertFalse(APIJobWorkflow.canWork(job,userID:"worker",writer:false,manager:false))
        XCTAssertFalse(APIJobWorkflow.canWork(job,userID:"",writer:true,manager:true))
    }
    func testDiaryDeletionRequiresExactRoleAndServerPermission() {
        let entry:APIValue = .object(["canDelete":.bool(true)])
        for role in ["owner","administrator"] { XCTAssertTrue(APIJobWorkflow.canDeleteDiary(entry,role:role,preview:false)) }
        for role in ["admin","worker","reader"] { XCTAssertFalse(APIJobWorkflow.canDeleteDiary(entry,role:role,preview:false)) }
        XCTAssertFalse(APIJobWorkflow.canDeleteDiary(entry,role:"owner",preview:true))
        XCTAssertFalse(APIJobWorkflow.canDeleteDiary(.object([:]),role:"owner",preview:false))
        XCTAssertFalse(APIJobWorkflow.canDeleteDiary(entry.merged(["pending":.bool(true)]),role:"owner",preview:false))
    }
    func testPendingDiaryIsNotDuplicatedAndKeepsUnsentText() {
        let server:APIValue = .object(["id":.s("one"),"date":.s("2026-11-18"),"work":.s("Uložená práce")])
        let pending=server.merged(["work":.s("Neodeslaný dodatek"),"pending":.bool(true)])
        let result=APIJobWorkflow.diaryEntries([server,server],pending:[pending])
        XCTAssertEqual(result.count,1);XCTAssertEqual(result[0]["work"],pending["work"])
    }
    @MainActor func testDepartureStartAndCompletionPersistWithoutExtraLoginChecks() async throws {
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        var job=(try await store.get("/api/jobs/fixture-next"))["job"]
        _ = try await store.write("/api/jobs/fixture-next/departure",method:"POST",body:.object(["version":job["version"],"arrivalDate":.s(store.today),"arrivalTime":.s("09:35")]))
        job=(try await store.get("/api/jobs/fixture-next"))["job"]
        XCTAssertEqual(job["status"],.s("on_way"));XCTAssertEqual(APIJobWorkflow.primary(job,travelEnabled:true),.start)
        let detailSnapshot=job
        for state in ["in_progress","done"] {
            _ = try await store.write("/api/jobs/fixture-next/status",method:"PATCH",body:.object(["version":job["version"],"status":.s(state)]))
            XCTAssertEqual(store.currentJob(detailSnapshot)["status"],.s(state),"Acknowledged changes must update detail before its next GET")
            job=(try await store.get("/api/jobs/fixture-next"))["job"];XCTAssertEqual(job["status"],.s(state))
        }
        XCTAssertNil(APIJobWorkflow.primary(job,travelEnabled:true))
        XCTAssertEqual(APIFixtureProtocol.requests.filter{$0.url?.path=="/api/me"}.count,1)
    }
    @MainActor func testGalleryWithoutDriveKeepsBytesOfflineAndSynchronizesOnlyOnce() async throws {
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        var me=store.me;me["features"]["googleDrive"] = .bool(false);try store.bind(me)
        let image=UIGraphicsImageRenderer(size:CGSize(width:40,height:40)).image{context in UIColor.green.setFill();context.fill(CGRect(x:0,y:0,width:40,height:40))}
        let data=try XCTUnwrap(APIImage.jpeg(image)),path="/api/jobs/fixture-next/photos"
        store.online=false
        try await APIJobPhotoUpload.upload(store:store,path:path,data:data,type:"image/jpeg",name:"Zahrada.jpg",id:"gallery-one")
        XCTAssertEqual(store.outbox.count,1)
        XCTAssertEqual(try store.vault?.mutationBytes(store.outbox[0]),data)
        store.online=true;await store.sync();await store.sync()
        XCTAssertTrue(store.outbox.isEmpty)
        let originals=APIFixtureProtocol.requests.filter{$0.url?.path==path+"/gallery-one/content" && $0.httpMethod=="PUT"}
        XCTAssertEqual(originals.count,1);XCTAssertEqual(URLComponents(url:try XCTUnwrap(originals.first?.url),resolvingAgainstBaseURL:false)?.queryItems?.first?.value,"app")
        XCTAssertEqual(APIFixtureProtocol.records[path+"/gallery-one"]?["category"],.s("during"))
        XCTAssertFalse(APIFixtureProtocol.requests.contains{$0.url?.path==path && $0.httpMethod=="POST"})
    }
    @MainActor func testFailedUploadRetainsEncryptedBytesForRetry() async throws {
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let path="/api/jobs/fixture-next/photos",data=Data([255,216,255,1])
        APIFixtureProtocol.forcedStatus[path+"/retry/content"]=503
        try await APIJobPhotoUpload.upload(store:store,path:path,data:data,type:"image/jpeg",name:"Fotografie.jpg",id:"retry")
        XCTAssertEqual(store.outbox.count,1);XCTAssertEqual(try store.vault?.mutationBytes(store.outbox[0]),data)
        APIFixtureProtocol.forcedStatus.removeValue(forKey:path+"/retry/content");await store.sync()
        XCTAssertTrue(store.outbox.isEmpty)
    }
    func testRetinaPhotoCompressionHasBoundedPixelDimensions() throws {
        let format=UIGraphicsImageRendererFormat();format.scale=3
        let image=UIGraphicsImageRenderer(size:CGSize(width:1200,height:900),format:format).image{context in UIColor.blue.setFill();context.fill(CGRect(x:0,y:0,width:1200,height:900))}
        let data=try XCTUnwrap(APIImage.jpeg(image)),decoded=try XCTUnwrap(UIImage(data:data)?.cgImage)
        XCTAssertLessThanOrEqual(max(decoded.width,decoded.height),2048)
        XCTAssertLessThan(data.count,800*1024)
        XCTAssertThrowsError(try APIImage.prepared(Data("invalid".utf8),type:"image/heic"))
    }
    func testPhotoPreviewAndRemovalPreserveOriginalStorage() {
        let photo:APIValue = .object(["id":.s("one"),"url":.s("/api/original"),"previewUrl":.s("/api/preview"),"storage":.s("app")])
        XCTAssertEqual(APIPhotoPaths.preview(photo),"/api/preview")
        XCTAssertEqual(APIPhotoPaths.preview(.object(["url":.s("/api/original")])),"/api/original")
        XCTAssertEqual(APIPhotoPaths.removalConfirmation(photo),"REMOVE_APP_GALLERY_PHOTO")
        XCTAssertEqual(APIPhotoPaths.removalConfirmation(.object(["storage":.s("drive")])),"TRASH_GOOGLE_DRIVE_PHOTO")
    }
    @MainActor func testDiaryDeleteKeepsPhotoAndJobAndVersionConflictsAreExplicit() async throws {
        APIFixtureProtocol.reset();let store=APIStore(fixture:true);await store.start()
        let path="/api/jobs/fixture-next/diary/day",job=(try await store.get("/api/jobs/fixture-next"))["job"]
        let entry:APIValue = .object(["id":.s("day"),"version":.n(3),"date":.s(store.today),"work":.s("Položené potrubí"),"photoIds":.array([.s("photo-one")]),"canDelete":.bool(true)])
        APIFixtureProtocol.records[path]=entry
        APIFixtureProtocol.records["/api/jobs/fixture-next/service/photos/photo-one"] = .object(["ready":.bool(true)])
        do{_ = try await store.write(path,method:"DELETE",body:APIJobWorkflow.diaryDeleteBody(entry.merged(["version":.n(2)]),operationID:"stale"));XCTFail("Stale deletion must not be accepted")}catch let error as APIError{XCTAssertEqual(error.status,409)}
        XCTAssertNotNil(APIFixtureProtocol.records[path])
        _ = try await store.write(path,method:"DELETE",body:APIJobWorkflow.diaryDeleteBody(entry,operationID:"remove"))
        XCTAssertNil(APIFixtureProtocol.records[path]);XCTAssertNotNil(APIFixtureProtocol.records["/api/jobs/fixture-next/service/photos/photo-one"])
        let after=(try await store.get("/api/jobs/fixture-next"))["job"]
        XCTAssertEqual(after["version"],job["version"]);XCTAssertEqual(after["status"],job["status"])
    }

}
