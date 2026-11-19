import XCTest
@testable import PracovniDenik

final class APIJobDetailPresentationTests:XCTestCase {
    private let job:APIValue = .object(["id":.s("one"),"status":.s("in_progress")])
    private func state(_ kind:String,jobID:String="one")->APIValue{.object(["userId":.s("me"),"active":.object(["jobId":.s(jobID),"kind":.s(kind)])])}
    func testActionUsesMyIntervalRatherThanGlobalStatus(){
        for(kind,expected)in [("travel",APIJobDetailAction.arrive),("work",.stop),("break",.resume),("other",.resume)]{
            XCTAssertEqual(APIJobDetailAction.resolve(job:job,states:[state(kind)],userID:"me",travelEnabled:true),expected)
        }
        XCTAssertEqual(APIJobDetailAction.resolve(job:job,states:[state("work",jobID:"other")],userID:"me",travelEnabled:true),.travel)
        XCTAssertEqual(APIJobDetailAction.resolve(job:job,states:[state("work")],userID:"someone-else",travelEnabled:false),.arrive)
        XCTAssertEqual(APIJobDetailAction.stop.timeKind,"stop")
    }
    func testOpenPersonalIntervalCanBeStoppedAfterSomeoneCompletesJob(){
        let done=job.merged(["status":.s("done")])
        XCTAssertEqual(APIJobDetailAction.resolve(job:done,states:[state("work")],userID:"me",travelEnabled:true),.stop)
        XCTAssertEqual(APIJobDetailAction.resolve(job:done,states:[],userID:"me",travelEnabled:true),.report)
        XCTAssertNil(APIJobDetailAction.resolve(job:job.merged(["cancelled":.bool(true)]),states:[],userID:"me",travelEnabled:true))
    }
    func testTodayClipsMidnightAndKeepsStoppedWorkerWithoutCountingTravelAsWork(){
        let now=ISO8601DateFormatter().date(from:"2026-11-19T10:00:00Z")!
        let row:APIValue = .object(["userId":.s("me"),"userName":.s("Luboš"),"kind":.s("work"),"startAt":.number(now.timeIntervalSince1970*1000-12*3600000),"endAt":.number(now.timeIntervalSince1970*1000-3600000)])
        let travel=row.merged(["kind":.s("travel"),"startAt":.number(now.timeIntervalSince1970*1000-3600000),"endAt":.number(now.timeIntervalSince1970*1000)])
        let snapshot:APIValue = .object(["states":.array([]),"intervals":.array([row,travel])])
        let workers=APIJobDetailPresentation.todayWorkers(snapshot:snapshot,jobID:"one",now:now)
        XCTAssertEqual(workers.count,1);XCTAssertEqual(workers[0]["kind"].string,"stopped")
        XCTAssertEqual(workers[0]["workMs"].double,10*3600000) // Midnight in Prague is 23:00 UTC.
    }
    func testNoInventedWorkersAndCrewNamesDoNotSplitOnCommas(){
        XCTAssertTrue(APIJobDetailPresentation.crew(job:job,states:[]).isEmpty)
        let assigned=job.merged(["assignedTos":.array([.s("me"),.s("me"),.s("two")])])
        let crew=APIJobDetailPresentation.crew(job:assigned,states:[.object(["userId":.s("me"),"name":.s("Luboš Sadílek")])])
        XCTAssertEqual(crew.count,2);XCTAssertEqual(crew[0]["name"].string,"Luboš Sadílek")
        XCTAssertEqual(APIJobDetailPresentation.initials("Luboš Sadílek"),"LS")
    }
}
