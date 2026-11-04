import Foundation

struct DiaryUser: Codable, Equatable { let id: String; let name: String; let role: String }
struct DiaryPermissions: Codable { let write: Bool; let manage: Bool; let delete: Bool }
struct DiaryWorkspace: Codable { let selectedDiscipline: String?; let disciplines: [String]; let authorizationVersion: Int? }
struct DiaryContext: Codable {
    let user: DiaryUser
    let companyName: String
    let features: [String: Bool]
    let permissions: DiaryPermissions
    let workspace: DiaryWorkspace?
    let identityKey: String
    let today: String
    func enabled(_ key: String) -> Bool { features[key] != false }
    var nativeJobsAvailable: Bool { enabled("jobs") && (enabled("jobDay") || enabled("jobList")) }
}
struct DiaryJob: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let status: String
    let customerName: String
    let address: String
    let gardenName: String
    let assignedName: String
    let dueDate: String
    let description: String
    let plannedStart: String
    let estimatedMinutes: Int?
    let arrivalWindowStart: String
    let arrivalWindowEnd: String
    let startTime: String
    let endTime: String
    let legacyTimeMeaning: String
    let jobType: String
    let discipline: String?
    let protocolStatus: String
    let incompleteReason: String
    let gardenNotes: String
    let arrivalTime: String
    let version: Int
    var customerLabel: String { customerName.isEmpty ? title : customerName }
    var stateLabel: String { ["planned":"Naplánováno", "on_way":"Na cestě", "in_progress":"Probíhá", "done":"Hotovo", "incomplete":"Nedokončeno"][status] ?? status }
    var kindLabel: String { ["service":"Servis", "installation":"Realizace", "survey":"Zaměření"][jobType] ?? jobType }
    var protocolLabel: String { ["ready":"Protokol hotový", "draft":"Protokol rozpracovaný", "missing":"Protokol chybí"][protocolStatus] ?? "Protokol chybí" }
    var disciplineLabel: String? { ["irrigation":"Závlaha", "garden":"Garden"][discipline ?? ""] }
    var active: Bool { !["done", "incomplete"].contains(status) }
    var workTime: String {
        if !plannedStart.isEmpty {
            return "Práce \(plannedStart)" + (estimatedMinutes.map { " · \($0) min" } ?? " · délka neurčena")
        }
        return "Začátek práce neurčen"
    }
    var arrivalWindow: String? {
        guard !arrivalWindowStart.isEmpty else { return nil }
        return "Příjezd \(arrivalWindowStart)" + (arrivalWindowEnd.isEmpty ? "" : "–\(arrivalWindowEnd)")
    }
    var originalTime: String? {
        guard !startTime.isEmpty else { return nil }
        return "Původní čas \(startTime)" + (endTime.isEmpty ? "" : "–\(endTime)") + (legacyTimeMeaning == "unknown" ? " · k upřesnění" : "")
    }
    var compactTime: String { !plannedStart.isEmpty ? plannedStart : !arrivalWindowStart.isEmpty ? "Příjezd \(arrivalWindowStart)" : !startTime.isEmpty ? "Původní čas \(startTime)" : "Čas neurčen" }
    var navigationURL: URL? {
        guard !address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        var url = URLComponents(string: "https://maps.apple.com/")!
        url.queryItems = [URLQueryItem(name: "daddr", value: address)]
        return url.url
    }
}
struct DiaryDefect: Codable, Identifiable {
    let id: String; let title: String; let discoveredOn: String; let priority: String; let status: String
    var stateLabel: String { ["new":"Nová", "awaiting_part":"Čeká na díl", "repair_planned":"Oprava naplánována", "resolved":"Vyřešeno"][status] ?? status }
    var priorityLabel: String { ["low":"Nízká", "normal":"Běžná", "high":"Vysoká"][priority] ?? priority }
}
struct DiaryJobPage: Codable { let jobs: [DiaryJob]; let nextCursor: String?; let nextJob: DiaryJob? }
struct DiaryJobDetail: Codable { let job: DiaryJob; let defects: [DiaryDefect] }
struct BridgeReply<T: Decodable>: Decodable { let data: T?; let error: String?; let status: Int?; let code: String? }
struct BridgeAcknowledgement: Decodable { let opened: Bool?; let allowed: Bool? }
struct DiaryBridgeError: LocalizedError {
    let message: String
    var code: String? = nil
    var errorDescription: String? { message }
}
struct NativeSignal: Equatable {
    enum Kind { case ready, invalidated, screen }
    let id = UUID()
    let kind: Kind
}
