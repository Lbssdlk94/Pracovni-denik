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
    @Published private var editCount=0
    var editing:Bool{editCount>0}
    func beginEdit(){editCount+=1}
    func endEdit(){editCount=max(0,editCount-1)}
    @Published var tab = 0
    @Published var revision = UUID()
    @Published var route: APIRoute?
    @Published private(set) var previewRole:String?
    @Published var outbox: [APIMutation] = []
    let fixture: Bool
    private(set) var transport: APITransport
    private(set) var vault: APIVault?
    private(set) var generation = 0
    private let monitor = NWPathMonitor()
    private var activeScope: String?
    private var started = false
    var jobMonthEpoch=0
    var jobMonthTask:Task<Void,Never>?
    var jobMonthPreparation:Task<Void,Never>?
    var jobMonthsReady=false
    var jobMonthsAuthorized=false
    private var liveVault:APIVault?
    var userID: String { me["user"]["id"].string }
    var actualRole:String{me["user"]["role"].string}
    var role:String{previewRole ?? actualRole}
    var previewTargets:[String]{APIRolePreview.targets(actualRole)}
    var canPreviewRoles:Bool{!previewTargets.isEmpty}
    var isRolePreview:Bool{previewRole != nil}
    var presentationID:String{scope+"|preview:"+(previewRole ?? "actual")}
    func setRolePreview(_ role:String?)throws{
        guard role == nil || previewTargets.contains(role!) else{throw APIError.local("Náhled role může otevřít pouze vlastník nebo administrátor.")}
        guard !busy,!editing,!syncing else{throw APIError.local("Nejprve uložte nebo zavřete formulář a dokončete synchronizaci.")}
        guard authenticated,let source=liveVault ?? vault else{throw APIError.local("Nejdříve se přihlaste.")}
        if let role{
            let temporary=try APIVault(scope:source.scope+"|role-preview:"+role,memoryOnly:true)
            temporary.state.session=source.state.session;temporary.state.verifiedAt=source.state.verifiedAt;temporary.state.cache=source.state.cache;temporary.state.jobMonths=source.state.jobMonths
            liveVault=source;vault=temporary
        }else{vault=source;liveVault=nil}
        generation+=1;previewRole=role;transport.previewRole=role;route=nil;tab=0;revision=UUID();updateOutbox();resetJobMonthWork()
        NativePushController.shared.invalidatePresentation();WatchPhoneCoordinator.shared.invalidate()
    }
    func requireLiveRole()throws{if isRolePreview{throw APIError.local("V náhledu role nelze ukládat změny. Vraťte se ke své roli.")}}
    var manager: Bool { me["permissions"]["manage"].bool && ["owner","administrator","admin"].contains(role) }
    var writer: Bool { me["permissions"]["write"].bool && role != "reader" }
    var owner: Bool { role == "owner" }
    var company: String { me["installation"]["name"].string.isEmpty ? (transport.origin.host?.hasPrefix("dr-garden") == true ? "Dr. Garden" : "Dr. Závlaha") : me["installation"]["name"].string }
    var today: String { let f = DateFormatter(); f.calendar = Calendar(identifier:.gregorian); f.timeZone = TimeZone(identifier:"Europe/Prague"); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date()) }
    var scope: String { vault?.scope ?? "" }
    var canIrrigate:Bool{me["workspace"].isNull || me["workspace"]["disciplines"].array.contains(.s("irrigation"))}
    func enabled(_ key:String)->Bool{if ["shafts","plans","blowout","pump","zoneManagement","pictureExport"].contains(key) && !canIrrigate{return false};return me["features"][key].bool}
    init(fixture: Bool = false, transport: APITransport? = nil) {
        self.fixture = fixture
        let saved=URL(string:UserDefaults.standard.string(forKey:"native-api-installation") ?? "")
        let origin = !fixture && saved.map{EndpointPolicy.isDiary($0)} == true ? saved! : EndpointPolicy.home
        self.transport = transport ?? APITransport(origin:origin,fixture:fixture)
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
        let fingerprint = APIValue.object(["role":value["user"]["role"],"permissions":value["permissions"],"workspace":value["workspace"].selecting(["workspaceId","state","authorizationVersion","userId","role","disciplines","selectedDiscipline","identityBindings"]),"discipline":.s(transport.discipline),"features":value["features"],"installation":value["installation"]["id"]])
        let authorization = APIVault.hash(String(data: try fingerprint.data(), encoding: .utf8)!)
        let next = transport.origin.host! + "|" + id + "|" + authorization
        if activeScope != next {
            liveVault=nil;previewRole=nil;transport.previewRole=nil
            generation += 1; route = nil; tab = 0
            // Previous encrypted files are retained, never exposed under new grants.
            vault = try APIVault(scope: next, memoryOnly: fixture); activeScope = next
        }
        me = value; authenticated = true; needsPasswordChange = false
        vault?.state.session = value; vault?.state.verifiedAt = Date(); try vault?.persist()
        if !fixture { UserDefaults.standard.set(next, forKey:"native-api-last-scope:" + transport.origin.host!) }
        updateOutbox();resetJobMonthWork();if !fixture{scheduleJobMonths()}
    }
    // Role/module discovery belongs to process startup or an explicit account,
    // installation or discipline change, never to routine data refreshes.
    func start() async {
        guard !started else { return }
        started = true
        await restore()
    }
    func restore() async {
        guard !busy, !authenticated else { return }; busy = true; defer { busy = false }
        do { try bind(await transport.request("/api/me")); online = true; error = nil; await sync();if !fixture{scheduleJobMonths()} }
        catch let e as APIError {
            if e.code == "password_change_required" { needsPasswordChange = true }
            else if e.isTransient, let last = UserDefaults.standard.string(forKey:"native-api-last-scope:" + transport.origin.host!), let local = try? APIVault(scope:last), local.offlineAllowed() {
                vault = local; activeScope = last; me = local.state.session; authenticated = true; online = false; updateOutbox()
            } else { lock(); if e.status != 401 { error = e.message } }
        } catch { self.error = error.localizedDescription }
    }
    func resume() async {
        guard authenticated else { return }
        // Retry queued work and refresh visible data. Every actual resource
        // request is still authorized by the server; no /api/me preflight.
        online = true
        error = nil
        await sync()
        if authenticated { revision = UUID() }
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
        try requireLiveRole()
        let account = try await transport.request("/api/auth/account")
        _ = try await transport.request("/api/auth/password",method:"PUT",body:.object(["username":.s(username),"currentPassword":.s(current),"password":.s(password),"version":account["version"]]))
        needsPasswordChange = false; try bind(await transport.request("/api/me"))
    }
    func switchInstallation(_ origin: URL) async throws {
        try requireLiveRole()
        guard vault?.state.outbox.isEmpty != false else { throw APIError.local("Nejdříve vyřešte neodeslané změny této firmy.") }
        lock(); transport = APITransport(origin:origin,fixture:fixture);if !fixture{UserDefaults.standard.set(origin.absoluteString,forKey:"native-api-installation")};await restore()
    }
    func switchDiscipline(_ discipline: String) async throws {
        try requireLiveRole()
        guard ["all","irrigation","garden"].contains(discipline), vault?.state.outbox.isEmpty != false else { throw APIError.local("Před změnou oboru odešlete neodeslanou práci.") }
        transport.discipline = discipline
        do { try bind(await transport.request("/api/me")); revision = UUID() } catch { lock(); throw error }
    }
    func lock() { resetJobMonthWork();liveVault=nil;previewRole=nil;transport.previewRole=nil;generation += 1; authenticated = false; me = .null; vault = nil; activeScope = nil; outbox = []; route = nil; NativePushController.shared.invalidatePresentation(); WatchPhoneCoordinator.shared.invalidate() }
    func logout() async throws {
        try requireLiveRole()
        guard vault?.state.outbox.isEmpty != false else { throw APIError.local("Nejdříve synchronizujte neodeslanou práci.") }
        _ = try await push("detach"); _ = try await transport.request("/api/access-logout",method:"POST",body:.object([:]))
        try transport.forgetCredential(); lock()
    }
    func get(_ path: String, refresh: Bool = false) async throws -> APIValue {
        let ticket = generation
        let requestedDiscipline=APIJobMonthCache.parameters(path,today:today)?["discipline"],selectedDiscipline=me["workspace"]["selectedDiscipline"].string
        let matchingDiscipline=requestedDiscipline==nil || selectedDiscipline.isEmpty || selectedDiscipline=="all" || requestedDiscipline==selectedDiscipline
        let cacheKey=path,list=APIJobMonthCache.isList(path),monthly=APIJobMonthCache.parameters(path,today:today) != nil && enabled("jobs") && enabled("offline") && matchingDiscipline
        if monthly{
            await prepareJobMonths()
            guard ticket==generation else{throw APIError.local("Účet se změnil.")}
            if refresh && online{beginJobMonthChange()}
            else if let cached=cachedJobList(path){if cached["_jobCache"]["stale"].bool && online{scheduleJobMonths()};return cached}
        }
        let monthTicket=jobMonthEpoch
        if !online,list,(!monthly || !jobMonthsAuthorized){throw APIError.local("Tento výběr zakázek ještě není uložený nebo vyžaduje nové ověření.")}
        if !online, let vault, vault.offlineAllowed(), let cached = vault.state.cache[cacheKey] { return cached }
        do {
            let result = try await transport.request(path)
            guard ticket == generation else { throw APIError.local("Přístup se změnil. Obnovte obrazovku.") }
            guard !monthly || monthTicket==jobMonthEpoch else{throw APIError.local("Plán se mezitím změnil. Obnovte přehled.")}
            if list{if monthly{vault?.state.cache[cacheKey]=result.merged(["jobs":.array(result["jobs"].array.map(APIJobMonthCache.lean))]);try? vault?.persist();scheduleJobMonths()}}
            else{vault?.state.cache[cacheKey] = result; try vault?.persist()}
            return result
        } catch let e as APIError {
            guard ticket==generation else{throw APIError.local("Účet se změnil.")}
            if e.status == 401 { lock(); throw e }
            if e.status == 403 || e.status == 404 && path.hasPrefix("/api/jobs/") { if list || path.hasPrefix("/api/jobs/"){beginJobMonthChange();purgeJobMonthCopies();jobMonthsAuthorized=false;revision=UUID()};vault?.state.cache.removeValue(forKey:cacheKey);try? vault?.persist();throw e }
            if e.isTransient,(!list || monthly && jobMonthsAuthorized),let vault, vault.offlineAllowed(), let cached = vault.state.cache[cacheKey] {if e.status==0{online=false}else{error="Server tuto část dočasně nenačetl. Zobrazují se poslední uložená data."};return cached}
            throw e
        }
    }
    func write(_ path: String, method: String, body: APIValue, offline: Bool = false, draftKey: String? = nil, operationID: String? = nil, dependsOn: [String] = []) async throws -> APIValue {
        try requireLiveRole()
        guard authenticated, let vault else { throw APIError.local("Nejdříve se přihlaste.") }
        let ticket = generation
        if path.hasPrefix("/api/jobs"){beginJobMonthChange()}
        if offline && enabled("offline") {
            guard writer, online || vault.offlineAllowed() else { throw APIError.local("Platnost offline přístupu vyžaduje nové spuštění s připojením.") }
            var op = APIMutation(id:operationID ?? UUID().uuidString,path:path,method:method,body:body,bytes:nil,contentType:"application/json",headers:[:],scope:scope,dependsOn:dependsOn,draftKey:draftKey)
            op.draftSnapshot = draftKey.flatMap { vault.state.drafts[$0]?.value }
            try vault.enqueue(op); updateOutbox(); if online { await sync() }
            guard authenticated, ticket == generation else { throw APIError.local("Přístup už není platný nebo se změnil účet. Neodeslaná práce zůstává zabezpečená.") }
            if let current = self.vault?.state.outbox.first(where: { $0.id == op.id }), current.state != "pending" { throw APIError(status:409,code:current.state,message:current.error) }
            revision = UUID(); return .object(["queued":.bool(self.vault?.state.outbox.contains(where: { $0.id == op.id }) == true)])
        }
        guard online else { throw APIError.local("Tuto změnu potvrďte s připojením. Koncept zůstává uložený.") }
        let result: APIValue
        do { result = try await transport.request(path,method:method,body:body) }
        catch let e as APIError { if e.status == 401, ticket == generation { lock() }; throw e }
        guard ticket == generation else { throw APIError.local("Účet se změnil.") }
        applyAcknowledgement(path:path,result:result)
        if let draftKey { self.vault?.state.drafts.removeValue(forKey:draftKey) }
        try self.vault?.persist(); revision = UUID(); return result
    }
    func upload(_ path: String, bytes: Data, type: String, headers: [String:String] = [:], offline: Bool = false, id: String = UUID().uuidString, draftKey:String?=nil) async throws {
        try requireLiveRole()
        guard authenticated else { throw APIError.local("Nejdříve se přihlaste.") }
        let ticket = generation
        if offline && enabled("offline"), let vault {
            guard writer, online || vault.offlineAllowed() else { throw APIError.local("Offline přístup vyžaduje nové spuštění s připojením.") }
            var op=APIMutation(id:id,path:path,method:"PUT",body:nil,bytes:bytes,contentType:type,headers:headers,scope:scope,dependsOn:[],draftKey:draftKey);op.draftSnapshot=draftKey.flatMap{vault.state.drafts[$0]?.value};try vault.enqueue(op);updateOutbox();if online{await sync()};guard authenticated,ticket==generation else{throw APIError.local("Přístup už není platný nebo se změnil účet. Neodeslaná příloha zůstává zabezpečená.")};if let current=self.vault?.state.outbox.first(where:{$0.id==id}),current.state != "pending"{throw APIError(status:409,code:current.state,message:current.error)};return
        }
        guard online else { throw APIError.local("Nahrání souboru vyžaduje připojení.") }
        do { _ = try await transport.bytes(path,method:"PUT",data:bytes,type:type,headers:headers) }
        catch let e as APIError { if e.status == 401,ticket == generation { lock() }; throw e }
        guard ticket == generation else { throw APIError.local("Účet se změnil.") }
        revision = UUID()
    }
    func sync() async {
        guard !isRolePreview,!syncing, online, let local = vault, !local.state.outbox.isEmpty else { return }
        let initialIDs=Set(local.state.outbox.map(\.id))
        syncing = true; defer {syncing=false;updateOutbox();if online,local.scope==scope,local.state.outbox.contains(where:{$0.state=="pending" && !initialIDs.contains($0.id)}){Task{await self.sync()}}}
        let ticket = generation
        for op in local.state.outbox where op.state == "pending" {
            guard generation == ticket, op.scope == scope,online else { return }
            if op.dependsOn.contains(where: { dependency in local.state.outbox.contains { $0.id == dependency } }) { continue }
            do {
                let pendingBytes=try local.mutationBytes(op)
                if op.method == "DRIVE_PHOTO", let bytes=pendingBytes, let metadata=op.body { try await APIJobPhotoUpload.send(store:self,path:op.path,data:bytes,metadata:metadata) }
                else if let bytes = pendingBytes { _ = try await transport.bytes(op.path,method:op.method,data:bytes,type:op.contentType,headers:op.headers) }
                else { let result=try await transport.request(op.path,method:op.method,body:op.body);guard generation==ticket else{return};applyAcknowledgement(path:op.path,result:result) }
                guard generation == ticket else { return }
                local.state.outbox.removeAll { $0.id == op.id }
                if let key = op.draftKey, var draft=local.state.drafts[key], draft.operationID == op.id {
                    if draft.value == op.draftSnapshot { local.state.drafts.removeValue(forKey:key) }
                    else { draft.operationID=UUID().uuidString;local.state.drafts[key]=draft }
                }
                try local.persist();if let key=op.binaryKey{local.removeBlob(key)}; revision = UUID()
            } catch let e as APIError {
                guard generation == ticket else { return }
                if e.status == 401 { lock(); return };if e.status==0 && e.code=="connection"{online=false;return}
                if !e.isTransient, let index = local.state.outbox.firstIndex(where: { $0.id == op.id }) {
                    local.state.outbox[index].state = e.status == 409 ? "conflict" : "blocked"; local.state.outbox[index].error = e.message; try? local.persist()
                }
                // One failed record never prevents unrelated reads or writes.
            } catch { self.error = error.localizedDescription }
        }
    }
    func currentJob(_ fallback:APIValue)->APIValue{
        guard let cached=vault?.state.cache["/api/jobs/"+fallback.id]?["job"],cached.id==fallback.id,cached["version"].int>=fallback["version"].int else{return fallback}
        return fallback.merged(cached.object)
    }
    func applyAcknowledgement(path:String,result:APIValue){
        var acknowledged=result
        if !result["job"].id.isEmpty,!result["report"].isNull{acknowledged["job"]["protocolStatus"]=result["report"]["documentState"].string=="ready" ? .s("ready") : .s("draft")}
        jobMonthsChanged(path:path,result:acknowledged)
        guard let vault else{return}
        let roots:[String:String]=["jobs":"job","customers":"customer","defects":"defect","vehicles":"vehicle","subscriptions":"subscription"]
        let parts=path.split(separator:"/");guard parts.count>=2,let singular=roots[String(parts[1])]else{return}
        var entity=result[singular];guard !entity.id.isEmpty else{return}
        if singular=="job",!result["report"].isNull{entity["protocolStatus"]=result["report"]["documentState"].string=="ready" ? .s("ready") : .s("draft")}
        func patch(_ value:APIValue)->APIValue{switch value{case .object(let fields):if value.id==entity.id{return value.merged(entity.object)};return .object(fields.mapValues{patch($0)});case .array(let values):return .array(values.map{patch($0)});default:return value}}
        for key in vault.state.cache.keys where key.hasPrefix("/api/"+String(parts[1])){vault.state.cache[key]=patch(vault.state.cache[key]!)}
    }
    func draft(_ key: String, fallback: APIValue) -> APIDraft { (isRolePreview ? nil : vault?.state.drafts[key]) ?? APIDraft(value:fallback,baseVersion:fallback["version"].int,operationID:UUID().uuidString,updatedAt:Date()) }
    func saveDraft(_ key: String, draft: APIDraft) { guard !isRolePreview else{return};do { vault?.state.drafts[key] = draft; try vault?.persist() } catch { self.error = error.localizedDescription } }
    func removeDraft(_ key: String) { guard !isRolePreview else{return};vault?.state.drafts.removeValue(forKey:key); try? vault?.persist() }
    func updateOutbox() { outbox = vault?.state.outbox ?? [] }
    func file(_ path:String,version:APIValue = .null) async throws -> APIBytes {
        let cacheKey=version.isNull ? path : path+"#v="+version.string
        if !online,let vault,vault.offlineAllowed(),let data=try vault.blob(cacheKey) ?? liveVault?.blob(cacheKey){return APIBytes(data:data,type:"application/octet-stream",filename:nil)}
        let ticket=generation
        do {let file=try await transport.bytes(path);guard ticket==generation else{throw APIError.local("Přístup se změnil.")};try vault?.saveBlob(file.data,path:cacheKey);return file}
        catch let e as APIError {if e.status==401{lock()};if e.isTransient,let vault,vault.offlineAllowed(),let data=try vault.blob(cacheKey) ?? liveVault?.blob(cacheKey){return APIBytes(data:data,type:"application/octet-stream",filename:nil)};throw e}
    }
    func push(_ action: String, extra: [String:Any] = [:]) async throws -> NativePushStatus { try await APIPushService.call(self, action:action, extra:extra) }
}
