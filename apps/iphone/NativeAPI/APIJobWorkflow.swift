import Foundation

// Presentation decisions only. Every mutation is still authorized and versioned by the API.
enum APIJobPrimaryAction: String {
    case departure, start, complete
    var title: String {
        switch self { case .departure: return "Jsem na cestě"; case .start: return "Probíhá"; case .complete: return "Hotovo" }
    }
    var symbol: String {
        switch self { case .departure: return "location"; case .start: return "play.fill"; case .complete: return "checkmark" }
    }
    var targetStatus: String? {
        switch self { case .departure: return nil; case .start: return "in_progress"; case .complete: return "done" }
    }
}
struct APIJobStatusRequest:Identifiable {
    let id=UUID()
    let targetStatus:String?
}
enum APIJobWorkflow {
    static func primary(_ job: APIValue, travelEnabled: Bool) -> APIJobPrimaryAction? {
        guard !job["cancelled"].bool else { return nil }
        switch job["status"].string {
        case "planned": return travelEnabled ? .departure : .start
        case "on_way": return .start
        case "in_progress": return .complete
        default: return nil
        }
    }
    static func canWork(_ job: APIValue, userID: String, writer: Bool, manager: Bool) -> Bool {
        writer && !userID.isEmpty && !job["cancelled"].bool && (manager || job["assignedTo"].string == userID || job["assignedTos"].array.contains(.s(userID)))
    }
    static func canDeleteDiary(_ entry: APIValue, role: String, preview: Bool) -> Bool {
        !preview && ["owner", "administrator"].contains(role) && entry["canDelete"].bool && !entry["pending"].bool
    }
    static func diaryDeleteBody(_ entry: APIValue, operationID: String) -> APIValue {
        .object(["version": entry["version"], "operationId": .s(operationID), "confirm": .s("DELETE_JOB_DIARY_ENTRY")])
    }
    static func diaryEntries(_ saved: [APIValue], pending: [APIValue]) -> [APIValue] {
        var unique = Dictionary(saved.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        for row in pending { unique[row.id] = row }
        return unique.values.sorted { ($0["date"].string, $0.id) > ($1["date"].string, $1.id) }
    }
}

enum APIPhotoPaths {
    static func content(path: String, file: APIValue, jobGallery: Bool) -> String {
        jobGallery ? path + "/" + file.id + "/content" : path + "/photos/" + file.id
    }
    static func preview(_ photo: APIValue) -> String {
        photo["previewUrl"].string.isEmpty ? photo["url"].string : photo["previewUrl"].string
    }
    static func removalConfirmation(_ photo: APIValue) -> String {
        photo["storage"].string == "app" ? "REMOVE_APP_GALLERY_PHOTO" : "TRASH_GOOGLE_DRIVE_PHOTO"
    }
}
