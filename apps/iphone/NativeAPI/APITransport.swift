import Foundation
import Security

struct APIBytes { let data: Data; let type: String; let filename: String? }
// Credentials belong to one exact installation and remain in Keychain.
enum APIKeychain {
    static func read(_ account: String) -> Data? {
        let q: [String: Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"cz.pracovnidenik.api",kSecAttrAccount as String:account,kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
        var result: CFTypeRef?; return SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess ? result as? Data : nil
    }
    static func write(_ data: Data?, account: String) throws {
        let q: [String: Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"cz.pracovnidenik.api",kSecAttrAccount as String:account]
        guard let data else { SecItemDelete(q as CFDictionary); return }
        let values: [String: Any] = [kSecValueData as String:data,kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(q as CFDictionary, values as CFDictionary)
        if status == errSecItemNotFound {
            let add = q.merging(values) { _, n in n }; guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else { throw APIError.local("Nepodařilo se zabezpečit přihlášení v Klíčence.") }; return
        }
        guard status == errSecSuccess else { throw APIError.local("Klíčenka není dostupná. Odemkněte iPhone.") }
    }
}
final class APIRedirectPolicy: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
@MainActor
final class APITransport {
    let origin: URL
    let fixture: Bool
    var discipline = "all"
    private let session: URLSession
    private let redirects = APIRedirectPolicy()
    private var cookie: String?
    init(origin: URL, fixture: Bool = false, configuration: URLSessionConfiguration? = nil) {
        precondition(EndpointPolicy.isDiary(origin))
        self.origin = origin; self.fixture = fixture
        cookie = fixture ? nil : APIKeychain.read("session:" + origin.host!).flatMap { String(data: $0, encoding: .utf8) }
        let config = configuration ?? .ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 25; config.timeoutIntervalForResource = 120
        if fixture { config.protocolClasses = [APIFixtureProtocol.self] }
        session = URLSession(configuration: config, delegate: redirects, delegateQueue: nil)
    }
    func forgetCredential() throws { cookie = nil; if !fixture { try APIKeychain.write(nil, account: "session:" + origin.host!) } }
    func bytes(_ path: String, method: String = "GET", data: Data? = nil, type: String = "application/json", headers: [String:String] = [:]) async throws -> APIBytes {
        let r=try requestFor(path,method:method,data:data,type:type,headers:headers)
        let result: (Data, URLResponse)
        do { result = try await session.data(for: r) }
        catch { if Task.isCancelled { throw CancellationError() }; throw APIError(status: 0, code: "connection", message: "Spojení se nepodařilo. Rozepsané změny zůstávají v iPhonu.") }
        guard let response = result.1 as? HTTPURLResponse else { throw APIError.local("API nevrátilo platnou odpověď.") }
        let body = result.0
        if let set = response.value(forHTTPHeaderField: "Set-Cookie") {
            let cookies = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie":set], for: origin)
            if let value = cookies.first(where: { $0.name == "__Host-zavlahy-access" && $0.domain == origin.host }) {
                cookie = value.value.isEmpty ? nil : value.name + "=" + value.value
                if !fixture { try APIKeychain.write(cookie?.data(using: .utf8), account: "session:" + origin.host!) }
            }
        }
        guard (200..<300).contains(response.statusCode) else {
            let v = (try? JSONDecoder().decode(APIValue.self, from: body)) ?? .null
            throw APIError(status: response.statusCode, code: v["code"].string, message: v["error"].string.isEmpty ? "Požadavek se nepodařil (\(response.statusCode)). Přihlášení a oprávnění ověřuje server." : v["error"].string,details:v)
        }
        return APIBytes(data: body, type: response.mimeType ?? "application/octet-stream", filename: response.suggestedFilename)
    }
    func requestFor(_ path:String,method:String="GET",data:Data?=nil,type:String="application/json",headers:[String:String]=[:]) throws -> URLRequest {
        guard path.hasPrefix("/api/"), !path.hasPrefix("//"), let url = URL(string: path, relativeTo: origin)?.absoluteURL,
              url.host == origin.host, url.scheme == "https", url.user == nil, url.password == nil,
              url.path.hasPrefix("/api/"), !url.path.contains("..") else { throw APIError.local("Nepovolená adresa API.") }
        var r = URLRequest(url: url); r.httpMethod = method; r.httpBody = data
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        r.setValue("shared-directory-v1", forHTTPHeaderField: "x-workspace-client-version")
        r.setValue(discipline, forHTTPHeaderField: "x-work-discipline")
        r.setValue("PracovniDenik-iOS/0.8", forHTTPHeaderField: "User-Agent")
        if method != "GET" { r.setValue("1", forHTTPHeaderField: "x-zavlahy-request"); r.setValue(origin.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin") }
        if data != nil { r.setValue(type, forHTTPHeaderField: "Content-Type") }
        if let cookie { r.setValue(cookie, forHTTPHeaderField: "Cookie") }
        for (key, value) in headers where !["cookie", "authorization", "host", "origin"].contains(key.lowercased()) { r.setValue(value, forHTTPHeaderField: key) }
        return r
    }
    func download(_ path:String) async throws -> URL {
        let request=try requestFor(path)
        let (temporary,response)=try await session.download(for:request)
        guard let http=response as? HTTPURLResponse,(200..<300).contains(http.statusCode) else{try? FileManager.default.removeItem(at:temporary);throw APIError.local("Soubor se nepodařilo stáhnout. Ověřte přístup a připojení.")}
        let destination=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString+".tar")
        try FileManager.default.moveItem(at:temporary,to:destination)
        try FileManager.default.setAttributes([.protectionKey:FileProtectionType.completeUntilFirstUserAuthentication],ofItemAtPath:destination.path)
        return destination
    }
    func request(_ path: String, method: String = "GET", body: APIValue? = nil) async throws -> APIValue {
        let result = try await bytes(path, method: method, data: try body?.data())
        guard result.type == "application/json" else { throw APIError.local("Server vrátil stránku místo dat. Obnovte přihlášení.") }
        return try JSONDecoder().decode(APIValue.self, from: result.data)
    }
}
