import Foundation
import CryptoKit

struct APIDraft: Codable, Equatable {
    var value: APIValue
    let baseVersion: Int
    var operationID: String
    var updatedAt: Date
}
struct APIMutation: Codable, Identifiable, Equatable {
    let id: String
    let path: String
    let method: String
    let body: APIValue?
    let bytes: Data?
    let contentType: String
    let headers: [String:String]
    let scope: String
    let dependsOn: [String]
    let draftKey: String?
    var draftSnapshot: APIValue? = nil
    var state: String = "pending"
    var error: String = ""
}
struct APILocalState: Codable {
    var session: APIValue = .null
    var verifiedAt: Date = .distantPast
    var cache: [String:APIValue] = [:]
    var drafts: [String:APIDraft] = [:]
    var outbox: [APIMutation] = []
}
@MainActor
final class APIVault {
    let scope: String
    private let url: URL
    private let key: SymmetricKey
    private let memoryOnly: Bool
    var state: APILocalState
    init(scope: String, memoryOnly: Bool = false, directory: URL? = nil) throws {
        self.scope = scope; self.memoryOnly = memoryOnly
        let account = "vault:" + scope
        let secret: Data
        if memoryOnly { secret = Data(repeating: 17, count: 32) }
        else if let old = APIKeychain.read(account) { secret = old }
        else {
            secret = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
            try APIKeychain.write(secret, account: account)
        }
        key = SymmetricKey(data: secret)
        let base = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("NativeAPI", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        url = base.appendingPathComponent(Self.hash(scope) + ".sealed")
        if !memoryOnly, FileManager.default.fileExists(atPath: url.path) {
            let sealed = try AES.GCM.SealedBox(combined: Data(contentsOf: url))
            let bytes = try AES.GCM.open(sealed, using: key, authenticating: Data(scope.utf8))
            state = try JSONDecoder().decode(APILocalState.self, from: bytes)
        } else { state = APILocalState() }
    }
    func saveBlob(_ data: Data, path: String) throws {
        guard !memoryOnly else { return }
        let sealed = try AES.GCM.seal(data, using:key, authenticating:Data((scope+path).utf8))
        try sealed.combined?.write(to: url.deletingLastPathComponent().appendingPathComponent(Self.hash(scope+path)+".blob"), options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
    }
    func blob(_ path: String) throws -> Data? {
        let file=url.deletingLastPathComponent().appendingPathComponent(Self.hash(scope+path)+".blob")
        guard !memoryOnly, FileManager.default.fileExists(atPath:file.path) else { return nil }
        return try AES.GCM.open(AES.GCM.SealedBox(combined:Data(contentsOf:file)),using:key,authenticating:Data((scope+path).utf8))
    }
    static func hash(_ string: String) -> String { SHA256.hash(data: Data(string.utf8)).map { String(format:"%02x",$0) }.joined() }
    func persist() throws {
        guard !memoryOnly else { return }
        let bytes = try JSONEncoder().encode(state)
        let sealed = try AES.GCM.seal(bytes, using: key, authenticating: Data(scope.utf8))
        guard let combined = sealed.combined else { throw APIError.local("Zápis se nepodařilo zabezpečit.") }
        try combined.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        var file = url; try file.setResourceValues(values)
    }
    func enqueue(_ operation: APIMutation) throws {
        guard operation.scope == scope else { throw APIError.local("Změna patří jinému účtu nebo oboru.") }
        if let existing = state.outbox.first(where: { $0.id == operation.id }) {
            guard existing.path == operation.path && existing.body == operation.body && existing.bytes == operation.bytes else { throw APIError.local("Identifikátor už patří jiné rozepsané změně.") }; return
        }
        state.outbox.append(operation); try persist()
    }
    func offlineAllowed(at date: Date = Date()) -> Bool {
        guard !state.session["user"]["id"].string.isEmpty, date.timeIntervalSince(state.verifiedAt) >= 0, date.timeIntervalSince(state.verifiedAt) < 86400,
              state.session["features"]["offline"] != .bool(false) else { return false }
        let license = state.session["license"]
        return license.isNull || (license["active"].bool && license["expiresAt"].double > date.timeIntervalSince1970 * 1000)
    }
}
