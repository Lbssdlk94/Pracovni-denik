import SwiftUI
import Network

@MainActor
final class APIStore: ObservableObject {
    @Published var me: APIValue = .null
    @Published var online = true
    @Published var error: String?
    @Published var authenticated = false
    @Published var needsPasswordChange = false
    @Published var busy = false
    @Published var syncing = false
    @Published var editing = false
    @Published var tab = 0
    @Published var revision = UUID()
    @Published var route: APIRoute?
    @Published var outbox: [APIMutation] = []
    let fixture: Bool
    private(set) var transport: APITransport
    private(set) var vault: APIVault?
    private(set) var generation = 0
    private let monitor = NWPathMonitor()
    private var activeScope: String?
    var userID: String { me["user"]["id"].string }
    var role: String { me["user"]["role"].string }
    var manager: Bool { me["permissions"]["manage"].bool }
    var writer: Bool { me["permissions"]["write"].bool }
    var owner: Bool { role == "owner" }
    var company: String { me["installation"]["name"].string.isEmpty ? (transport.origin.host?.hasPrefix("dr-garden") == true ? "Dr. Garden" : "Dr. Závlaha") : me["installation"]["name"].string }
    var today: String { let f = DateFormatter(); f.calendar = Calendar(identifier:.gregorian); f.timeZone = TimeZone(identifier:"Europe/Prague"); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date()) }
    var scope: String { vault?.scope ?? "" }
    func enabled(_ key: String) -> Bool { me["features"][key].bool }
    init(fixture: Bool = false, transport: APITransport? = nil) {
        self.fixture = fixture
        self.transport = transport ?? APITransport(origin: EndpointPolicy.home, fixture: fixture)
        if !fixture {
            monitor.pathUpdateHandler = { [weak self] path in Task { @MainActor in
                guard let self else { return }; let reconnect = !self.online && path.status == .satisfied
                self.online = path.status == .satisfied
                if reconnect { await self.resume() }
            } }; monitor.start(queue: DispatchQueue(label:"cz.pracovnidenik.connectivity"))
        }
    }
    func bind(_ value: APIValue) throws {
        let id = value["user"]["id"].string
        guard !id.isEmpty else { throw APIError.local("Odpověď neobsahuje ověřený účet.") }
        let fingerprint = APIValue.object(["role":value["user"]["role"],"permissions":value["permissions"],"workspace":value["workspace"],"features":value["features"],"installation":value["installation"]["id"]])
        let authorization = APIVault.hash(String(data: try fingerprint.data(), encoding: .utf8)!)
        let next = transport.origin.host! + "|" + id + "|" + authorization
        if activeScope != next {
            generation += 1; route = nil; tab = 0
            // Previous encrypted files are retained, never exposed under new grants.
            vault = try APIVault(scope: next, memoryOnly: fixture); activeScope = next
        }
        me = value; authenticated = true; needsPasswordChange = false
        vault?.state.session = value; vault?.state.verifiedAt = Date(); try vault?.persist()
        if !fixture { UserDefaults.standard.set(next, forKey:"native-api-last-scope:" + transport.origin.host!) }
        updateOutbox()
    }
    func restore() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { try bind(await transport.request("/api/me")); error = nil; await sync() }
        catch let e as APIError {
            if e.code == "password_change_required" { needsPasswordChange = true }
            else if e.isTransient, let last = UserDefaults.standard.string(forKey:"native-api-last-scope:" + transport.origin.host!), let local = try? APIVault(scope:last), local.offlineAllowed() {
                vault = local; activeScope = last; me = local.state.session; authenticated = true; online = false; updateOutbox()
            } else { lock(); if e.status != 401 { error = e.message } }
        } catch { self.error = error.localizedDescription }
    }
    func resume() async {
        guard authenticated else { await restore(); return }
        do { try bind(await transport.request("/api/me")); online = true; await sync(); revision = UUID() }
        catch let e as APIError { if [401,403].contains(e.status) || (e.isTransient && vault?.offlineAllowed() != true) { lock() }; if e.isTransient { online=false }; error = e.message }
        catch { self.error = error.localizedDescription }
    }
    func login(username: String, password: String) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do {
            let preview = try await transport.request("/api/auth/login", method:"POST", body:.object(["username":.s(username),"password":.s(password),"preview":.bool(true)]))
            if let vault, !vault.state.outbox.isEmpty, preview["userId"].string != userID { throw APIError.local("Nejdříve odešlete čekající změny pod původním účtem.") }
            let result = try await transport.request("/api/auth/login",method:"POST",body:.object(["username":.s(username),"password":.s(password),"preview":.bool(false),"expectedUserId":preview["userId"],"expectedVersion":preview["credentialVersion"]]))
            needsPasswordChange = result["mustChange"].bool
            if !needsPasswordChange { try bind(await transport.request("/api/me")); await sync() }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
    func changePassword(username: String, current: String, password: String) async throws {
        let account = try await transport.request("/api/auth/account")
        _ = try await transport.request("/api/auth/password",method:"PUT",body:.object(["username":.s(username),"currentPassword":.s(current),"password":.s(password),"version":account["version"]]))
        needsPasswordChange = false; try bind(await transport.request("/api/me"))
    }
    func switchInstallation(_ origin: URL) async throws {
        guard vault?.state.outbox.isEmpty != false else { throw APIError.local("Nejdříve vyřešte neodeslané změny této firmy.") }
        lock(); transport = APITransport(origin:origin,fixture:fixture); await restore()
    }
    func switchDiscipline(_ discipline: String) async throws {
        guard ["all","irrigation","garden"].contains(discipline), vault?.state.outbox.isEmpty != false else { throw APIError.local("Před změnou oboru odešlete neodeslanou práci.") }
        transport.discipline = discipline
        do { try bind(await transport.request("/api/me")); revision = UUID() } catch { lock(); throw error }
    }
    func lock() { generation += 1; authenticated = false; me = .null; vault = nil; activeScope = nil; outbox = []; route = nil; NativePushController.shared.invalidatePresentation(); WatchPhoneCoordinator.shared.invalidate() }
    func logout() async throws {
        guard vault?.state.outbox.isEmpty != false else { throw APIError.local("Nejdříve synchronizujte neodeslanou práci.") }
        _ = try await push("detach"); _ = try await transport.request("/api/access-logout",method:"POST",body:.object([:]))
        try transport.forgetCredential(); lock()
    }
    func get(_ path: String, refresh: Bool = false) async throws -> APIValue {
        let ticket = generation
        if !online, let vault, vault.offlineAllowed(), let cached = vault.state.cache[path] { return cached }
        do {
            let result = try await transport.request(path)
            guard ticket == generation else { throw APIError.local("Přístup se změnil. Obnovte obrazovku.") }
            vault?.state.cache[path] = result; try vault?.persist(); return result
        } catch let e as APIError {
            if e.status == 401 { lock(); throw e }
            if e.status == 403 { vault?.state.cache.removeValue(forKey:path);try? vault?.persist();throw e }
            if e.isTransient, let vault, vault.offlineAllowed(), let cached = vault.state.cache[path] { online = false; return cached }
            throw e
        }
    }
    func write(_ path: String, method: String, body: APIValue, offline: Bool = false, draftKey: String? = nil, operationID: String? = nil, dependsOn: [String] = []) async throws -> APIValue {
        guard authenticated, let vault else { throw APIError.local("Nejdříve se přihlaste.") }
        if offline {
            guard enabled("offline"), vault.offlineAllowed() else { throw APIError.local("Platnost offline přístupu vyžaduje ověření.") }
            var op = APIMutation(id:operationID ?? UUID().uuidString,path:path,method:method,body:body,bytes:nil,contentType:"application/json",headers:[:],scope:scope,dependsOn:dependsOn,draftKey:draftKey)
            op.draftSnapshot = draftKey.flatMap { vault.state.drafts[$0]?.value }
            try vault.enqueue(op); updateOutbox(); if online { await sync() }
            if let current = self.vault?.state.outbox.first(where: { $0.id == op.id }), current.state != "pending" { throw APIError(status:409,code:current.state,message:current.error) }
            revision = UUID(); return .object(["queued":.bool(self.vault?.state.outbox.contains(where: { $0.id == op.id }) == true)])
        }
        guard online else { throw APIError.local("Tuto změnu potvrďte s připojením. Koncept zůstává uložený.") }
        let ticket = generation; try bind(await transport.request("/api/me"))
        guard ticket == generation else { throw APIError.local("Oprávnění se změnila. Zkontrolujte rozepsané údaje.") }
        let result = try await transport.request(path,method:method,body:body)
        guard ticket == generation else { throw APIError.local("Účet se změnil.") }
        if let draftKey { self.vault?.state.drafts.removeValue(forKey:draftKey) }
        try self.vault?.persist(); revision = UUID(); return result
    }
    func upload(_ path: String, bytes: Data, type: String, headers: [String:String] = [:], offline: Bool = false, id: String = UUID().uuidString) async throws {
        guard authenticated else { throw APIError.local("Nejdříve se přihlaste.") }
        if offline, let vault {
            guard enabled("offline"),vault.offlineAllowed() else { throw APIError.local("Offline přístup vyžaduje ověření.") }
            try vault.enqueue(APIMutation(id:id,path:path,method:"PUT",body:nil,bytes:bytes,contentType:type,headers:headers,scope:scope,dependsOn:[],draftKey:nil)); updateOutbox(); if online { await sync() }; return
        }
        guard online else { throw APIError.local("Nahrání souboru vyžaduje připojení.") }
        _ = try await transport.bytes(path,method:"PUT",data:bytes,type:type,headers:headers); revision = UUID()
    }
    func sync() async {
        guard !syncing, online, let local = vault, !local.state.outbox.isEmpty else { return }
        syncing = true; defer { syncing = false; updateOutbox() }
        let ticket = generation
        do { try bind(await transport.request("/api/me")) } catch { if let e = error as? APIError, [401,403].contains(e.status) { lock() }; self.error = error.localizedDescription; return }
        guard ticket == generation, local.scope == scope else { error = "Oprávnění se změnila. Původní neodeslané změny zůstaly zabezpečené."; return }
        for op in local.state.outbox where op.state == "pending" {
            guard generation == ticket, op.scope == scope else { return }
            if op.dependsOn.contains(where: { dependency in local.state.outbox.contains { $0.id == dependency } }) { continue }
            do {
                if op.method == "DRIVE_PHOTO", let bytes=op.bytes, let metadata=op.body { try await APIJobPhotoUpload.send(store:self,path:op.path,data:bytes,metadata:metadata) }
                else if let bytes = op.bytes { _ = try await transport.bytes(op.path,method:op.method,data:bytes,type:op.contentType,headers:op.headers) }
                else { _ = try await transport.request(op.path,method:op.method,body:op.body) }
                guard generation == ticket else { return }
                local.state.outbox.removeAll { $0.id == op.id }
                if let key = op.draftKey, var draft=local.state.drafts[key], draft.operationID == op.id {
                    if draft.value == op.draftSnapshot { local.state.drafts.removeValue(forKey:key) }
                    else { draft.operationID=UUID().uuidString;local.state.drafts[key]=draft }
                }
                try local.persist(); revision = UUID()
            } catch let e as APIError {
                if e.status == 401 { lock(); return }
                if !e.isTransient, let index = local.state.outbox.firstIndex(where: { $0.id == op.id }) {
                    local.state.outbox[index].state = e.status == 409 ? "conflict" : "blocked"; local.state.outbox[index].error = e.message; try? local.persist()
                }
                // One failed record never prevents unrelated reads or writes.
            } catch { self.error = error.localizedDescription }
        }
    }
    func draft(_ key: String, fallback: APIValue) -> APIDraft { vault?.state.drafts[key] ?? APIDraft(value:fallback,baseVersion:fallback["version"].int,operationID:UUID().uuidString,updatedAt:Date()) }
    func saveDraft(_ key: String, draft: APIDraft) { do { vault?.state.drafts[key] = draft; try vault?.persist() } catch { self.error = error.localizedDescription } }
    func removeDraft(_ key: String) { vault?.state.drafts.removeValue(forKey:key); try? vault?.persist() }
    func updateOutbox() { outbox = vault?.state.outbox ?? [] }
    func file(_ path:String) async throws -> APIBytes {
        if !online,let vault,vault.offlineAllowed(),let data=try vault.blob(path){return APIBytes(data:data,type:"application/octet-stream",filename:nil)}
        let ticket=generation
        do {let file=try await transport.bytes(path);guard ticket==generation else{throw APIError.local("Přístup se změnil.")};try vault?.saveBlob(file.data,path:path);return file}
        catch let e as APIError {if e.status==401{lock()};if e.isTransient,let vault,vault.offlineAllowed(),let data=try vault.blob(path){return APIBytes(data:data,type:"application/octet-stream",filename:nil)};throw e}
    }
    func push(_ action: String, extra: [String:Any] = [:]) async throws -> NativePushStatus { try await APIPushService.call(self, action:action, extra:extra) }
}
