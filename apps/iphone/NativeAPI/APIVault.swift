import Foundation
import CryptoKit

struct APIDraft: Codable, Equatable {
    var value: APIValue
    let baseVersion: Int
    var operationID: String
    var updatedAt: Date
    var touchedFields: Set<String>? = nil
}
struct APIMutation: Codable, Identifiable, Equatable {
    let id: String
    let path: String
    let method: String
    let body: APIValue?
    var bytes: Data?
    let contentType: String
    let headers: [String:String]
    let scope: String
    let dependsOn: [String]
    let draftKey: String?
    var binaryKey:String? = nil
    var binaryDigest:String? = nil
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
    private var memoryBlobs:[String:Data]=[:]
    var state: APILocalState
    init(scope: String, memoryOnly: Bool = false, directory: URL? = nil, keyMaterial:Data?=nil) throws {
        self.scope = scope; self.memoryOnly = memoryOnly
        let account = "vault:" + scope
        let secret: Data
        if let keyMaterial{guard keyMaterial.count==32 else{throw APIError.local("Neplatný šifrovací klíč úložiště.")};secret=keyMaterial}
        else if memoryOnly { secret = Data(repeating: 17, count: 32) }
        else if let old = APIKeychain.read(account) { secret = old }
        else {
            secret = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
            try APIKeychain.write(secret, account: account)
        }
        key = SymmetricKey(data: secret)
        let base = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("NativeAPI", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        var directoryURL=base;var attributes=URLResourceValues();attributes.isExcludedFromBackup=true;try? directoryURL.setResourceValues(attributes)
        url = base.appendingPathComponent(Self.hash(scope) + ".sealed")
        if !memoryOnly, FileManager.default.fileExists(atPath: url.path) {
            let sealed = try AES.GCM.SealedBox(combined: Data(contentsOf: url))
            let bytes = try AES.GCM.open(sealed, using: key, authenticating: Data(scope.utf8))
            state = try JSONDecoder().decode(APILocalState.self, from: bytes)
        } else { state = APILocalState() }
    }
    func saveBlob(_ data: Data, path: String) throws {
        if memoryOnly {memoryBlobs[path]=data;return}
        let sealed = try AES.GCM.seal(data, using:key, authenticating:Data((scope+path).utf8))
        guard let encrypted=sealed.combined else{throw APIError.local("Přílohu se nepodařilo zabezpečit.")}
        try encrypted.write(to: url.deletingLastPathComponent().appendingPathComponent(Self.hash(scope+path)+".blob"), options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
    }
    func blob(_ path: String) throws -> Data? {
        if memoryOnly{return memoryBlobs[path]}
        let file=url.deletingLastPathComponent().appendingPathComponent(Self.hash(scope+path)+".blob")
        guard !memoryOnly, FileManager.default.fileExists(atPath:file.path) else { return nil }
        return try AES.GCM.open(AES.GCM.SealedBox(combined:Data(contentsOf:file)),using:key,authenticating:Data((scope+path).utf8))
    }
    func removeBlob(_ path:String){memoryBlobs.removeValue(forKey:path);try? FileManager.default.removeItem(at:url.deletingLastPathComponent().appendingPathComponent(Self.hash(scope+path)+".blob"))}
    func mutationBytes(_ op:APIMutation)throws->Data?{if let key=op.binaryKey{guard let data=try blob(key)else{throw APIError.local("Chybí čekající příloha. Znovu ji vyberte; zápis zůstává neodeslaný.")};return data};return op.bytes}
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
        var incoming=operation
        if let bytes=incoming.bytes{incoming.binaryDigest=SHA256.hash(data:bytes).map{String(format:"%02x",$0)}.joined()}
        if let existing=state.outbox.first(where:{$0.id==incoming.id}){
            guard existing.path==incoming.path,existing.method==incoming.method,existing.contentType==incoming.contentType,existing.headers==incoming.headers,existing.body==incoming.body,existing.binaryDigest==incoming.binaryDigest else{throw APIError.local("Identifikátor už patří jiné rozepsané změně.")};return
        }
        if let bytes=incoming.bytes{let key="outbox:"+incoming.id;try saveBlob(bytes,path:key);incoming.bytes=nil;incoming.binaryKey=key}
        state.outbox.append(incoming);try persist()
    }
    func offlineAllowed(at date: Date = Date()) -> Bool {
        guard !state.session["user"]["id"].string.isEmpty, date.timeIntervalSince(state.verifiedAt) >= 0, date.timeIntervalSince(state.verifiedAt) < 86400,
              state.session["features"]["offline"].bool else { return false }
        let license = state.session["license"]
        return license.isNull || (license["active"].bool && license["expiresAt"].double > date.timeIntervalSince1970 * 1000)
    }
}
