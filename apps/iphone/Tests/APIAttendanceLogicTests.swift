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
}
