import Foundation

// This protocol carries only a minimal, authenticated projection. Credentials,
// pricing, protocols, photos and an offline mutation queue are deliberately absent.
struct WatchJob: Codable, Identifiable, Equatable {
    let id: String
    let version: Int
    let title, customerName, address, gardenName, dueDate, status, kind, discipline: String
    let plannedStart, arrivalStart, arrivalEnd, originalStart: String
    let estimatedMinutes: Int?
    let arrivalTime, handoffStatus, protocolStatus, incompleteReason: String
    let canStart, canComplete, requiresProtocol, canDepart, canAccept: Bool
    var stateLabel: String { ["planned":"Naplánováno", "on_way":"Na cestě", "in_progress":"Probíhá", "done":"Hotovo", "incomplete":"Nedokončeno"][status] ?? status }
    var kindLabel: String { ["service":"Servis", "installation":"Realizace", "survey":"Zaměření"][kind] ?? kind }
    var disciplineLabel: String { ["irrigation":"Závlaha", "garden":"Garden"][discipline] ?? "" }
    var compactTime: String { !plannedStart.isEmpty ? plannedStart : !arrivalStart.isEmpty ? "Příjezd \(arrivalStart)" : !originalStart.isEmpty ? "Původní čas \(originalStart)" : "Čas neurčen" }
    var workLabel: String { plannedStart.isEmpty ? "Začátek práce neurčen" : "Práce \(plannedStart)" + (estimatedMinutes.map { " · \(WatchJob.durationLabel($0))" } ?? " · délka neurčena") }
    private static func durationLabel(_ minutes: Int) -> String {
        let hours = minutes / 60, mins = minutes % 60
        func word(_ value: Int, _ one: String, _ few: String, _ many: String) -> String {
            let mod = abs(value) % 100
            let name = (11...14).contains(mod) ? many : (value % 10 == 1 ? one : ((2...4).contains(value % 10) ? few : many))
            return "\(value) \(name)"
        }
        if hours > 0 && mins > 0 { return word(hours, "hodina", "hodiny", "hodin") + " " + word(mins, "minuta", "minuty", "minut") }
        if hours > 0 { return word(hours, "hodina", "hodiny", "hodin") }
        return word(mins, "minuta", "minuty", "minut")
    }
    var navigationURL: URL? {
        guard !address.isEmpty else { return nil }
        var url = URLComponents(string: "https://maps.apple.com/")!
        url.queryItems = [URLQueryItem(name:"daddr",value:address)]
        return url.url
    }
}
struct WatchNotice: Codable, Identifiable, Equatable {
    let id, title, body: String
    let createdAt: Double
    let read: Bool
}
struct WatchSnapshot: Codable, Equatable {
    let protocolVersion: Int
    let binding: String
    let generatedAt: Double
    let today, companyName, userName: String
    let jobsEnabled, notificationsEnabled: Bool
    let jobs: [WatchJob]
    let hasMoreJobs: Bool
    let notices: [WatchNotice]
    let unread: Int
    func isFresh(at date: Date = Date()) -> Bool {
        protocolVersion == 1 && binding.count == 64 && generatedAt <= date.timeIntervalSince1970 * 1000 + 30000 && date.timeIntervalSince1970 * 1000 - generatedAt <= 120000
    }
}
enum WatchAction: String, Codable, CaseIterable { case accept, start, complete, depart, openPhone }
struct WatchRequest: Codable, Equatable {
    let protocolVersion: Int
    let requestId: String
    let kind: String
    var action: WatchAction?
    var jobId: String?
    var jobVersion: Int?
    var binding: String?
    var snapshotAt: Double?
    var arrivalTime: String?
    static func refresh() -> WatchRequest { WatchRequest(protocolVersion:1,requestId:UUID().uuidString,kind:"refresh") }
    static func change(_ action: WatchAction, job: WatchJob, snapshot: WatchSnapshot, arrivalTime: String? = nil) -> WatchRequest {
        WatchRequest(protocolVersion:1,requestId:UUID().uuidString,kind:"action",action:action,jobId:job.id,jobVersion:job.version,binding:snapshot.binding,snapshotAt:snapshot.generatedAt,arrivalTime:arrivalTime)
    }
    func validated(at date: Date = Date()) throws {
        guard protocolVersion == 1, UUID(uuidString:requestId) != nil else { throw WatchContractError.invalid }
        guard kind == "action" else {
            guard kind == "refresh", action == nil, jobId == nil, jobVersion == nil, binding == nil, snapshotAt == nil, arrivalTime == nil else { throw WatchContractError.invalid }
            return
        }
        guard action != nil, let id = jobId, id.range(of:"^[-A-Za-z0-9_]{1,100}$",options:.regularExpression) != nil,
              let version = jobVersion, version > 0, let key = binding, key.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil,
              let at = snapshotAt, at.isFinite, date.timeIntervalSince1970 * 1000 - at <= 120000, at <= date.timeIntervalSince1970 * 1000 + 30000 else { throw WatchContractError.stale }
        if action == .depart {
            guard let time = arrivalTime, time.range(of:"^([01][0-9]|2[0-3]):[0-5][0-9]$",options:.regularExpression) != nil else { throw WatchContractError.invalid }
        } else if arrivalTime != nil { throw WatchContractError.invalid }
    }
}
struct WatchReply: Codable {
    var requestId: String?
    var snapshot: WatchSnapshot?
    var message: String?
    var error: String?
    var code: String?
    var phoneAction: String?
    var phoneJobId: String?
    var invalidated: Bool?
    static func failure(_ message: String, requestId: String? = nil, code: String? = nil) -> WatchReply {
        WatchReply(requestId:requestId,error:message,code:code)
    }
}
enum WatchContractError: LocalizedError {
    case invalid, stale, unreachable, timedOut
    var errorDescription: String? {
        switch self {
        case .invalid: return "Neplatná zpráva hodinek. Obnovte aplikaci."
        case .stale: return "Přehled je starší. Nejdříve obnovte zakázky."
        case .unreachable: return "Otevřete Pracovní deník na spárovaném iPhonu a připojte ho k internetu."
        case .timedOut: return "iPhone neodpověděl včas. Výsledek akce ověřte obnovením; akce se automaticky neopakuje."
        }
    }
}
// In-memory replay protection, scoped to the current phone authentication epoch.
// The API's unchanged version CAS remains authoritative after a process restart.
struct WatchRequestLedger {
    private var order: [String] = []
    private var values: [String:(Data,Data)] = [:]
    mutating func store(request: Data, reply: Data, id: String) {
        if values[id] == nil { order.append(id) }
        values[id] = (request,reply)
        while order.count > 32 { values.removeValue(forKey:order.removeFirst()) }
    }
    func reply(for request: Data, id: String) throws -> Data? {
        guard let entry = values[id] else { return nil }
        guard entry.0 == request else { throw WatchContractError.invalid }
        return entry.1
    }
    mutating func clear() { order = []; values = [:] }
}
