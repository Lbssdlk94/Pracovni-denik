import XCTest
@testable import PracovniDenik

final class NativeModelsTests: XCTestCase {
    private func fixture() throws -> (DiaryContext, [DiaryJob]) {
        struct Fixture: Decodable { let context: DiaryContext; let jobs: [DiaryJob] }
        let url = try XCTUnwrap(Bundle.main.url(forResource: "NativeFixture", withExtension: "json"))
        let data = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
        return (data.context, data.jobs)
    }
    func testArrivalWindowDoesNotBecomeWorkDuration() throws {
        let (_, jobs) = try fixture(); let job = try XCTUnwrap(jobs.first)
        XCTAssertEqual(job.workTime, "Práce 09:00 · 1 hodina")
        XCTAssertEqual(job.arrivalWindow, "Příjezd 10:00–11:00")
        XCTAssertNil(job.originalTime)
    }
    func testCompletedJobUsesActualProtocolState() throws {
        let (_, jobs) = try fixture()
        XCTAssertEqual(jobs.first(where: { $0.status == "done" })?.protocolLabel, "Protokol hotový")
        XCTAssertFalse(try XCTUnwrap(jobs.first(where: { $0.status == "incomplete" })).active)
    }
    func testNavigationRetainsTheCompleteAddress() throws {
        let (_, jobs) = try fixture(); let job = try XCTUnwrap(jobs.first)
        let components = try XCTUnwrap(URLComponents(url: try XCTUnwrap(job.navigationURL), resolvingAgainstBaseURL: false))
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "daddr" })?.value, "Lipová 1488, Blatná")
    }
    func testContextFollowsFeaturePolicyAndRole() throws {
        let (context, _) = try fixture()
        XCTAssertTrue(context.nativeJobsAvailable)
        XCTAssertTrue(context.permissions.manage)
        XCTAssertEqual(context.workspace?.selectedDiscipline, "irrigation")
        XCTAssertEqual(context.user.role, "owner")
    }
}
