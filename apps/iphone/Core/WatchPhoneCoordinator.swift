import Foundation
import WatchConnectivity
import SwiftUI

@MainActor
final class WatchPhoneCoordinator: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchPhoneCoordinator()
    @Published var paired = false
    @Published var installed = false
    @Published var reachable = false
    @Published var showSettings = false
    @Published var lastSync: Date?
    @Published var changedAt = UUID()
    @Published var problem: String?
    @Published var pendingJobId: String?
    @Published var pendingAction: String?
    private weak var api: APIStore?
    private var transport: WCSession?
    private var epoch = 0
    private var busy = false
    private var ledger = WatchRequestLedger()
    func attach(_ api: APIStore) {
        self.api = api
        guard !api.fixture, !ProcessInfo.processInfo.arguments.contains("--ui-testing"), WCSession.isSupported(), transport == nil else { return }
        let session = WCSession.default
        transport = session; session.delegate = self; session.activate()
        updateState(session)
    }
    func invalidate() {
        epoch += 1; ledger.clear(); lastSync = nil; pendingJobId = nil; pendingAction = nil
        // Application context contains ONLY an invalidation marker. The OS must
        // never persist a business snapshot for a different subsequent account.
        guard let session = transport, session.activationState == .activated else { return }
        let marker: [String:Any] = ["invalidated":true,"epoch":UUID().uuidString]
        try? session.updateApplicationContext(marker)
        if session.isReachable { session.sendMessage(marker,replyHandler:nil,errorHandler:nil) }
    }
    func clearFollowUp() { pendingJobId = nil; pendingAction = nil }
    private func updateState(_ session: WCSession) {
        paired = session.isPaired; installed = session.isWatchAppInstalled; reachable = session.isReachable
    }
    // Also callable with a fixture in tests. No arbitrary API command/URL can be
    // requested by the watch; the authenticated JS facade owns the allowlist.
    func handle(_ data: Data, call: (([String:Any]) async throws -> WatchReply)? = nil) async -> Data {
        var requestID: String?
        let ticket = epoch
        do {
            guard data.count <= 4096 else { throw WatchContractError.invalid }
            let request = try JSONDecoder().decode(WatchRequest.self,from:data)
            requestID = request.requestId; try request.validated()
            if request.kind == "action", let cached = try ledger.reply(for:data,id:request.requestId) { return cached }
            guard !busy else { return try JSONEncoder().encode(WatchReply.failure("Počkejte na dokončení předchozí operace.",requestId:requestID)) }
            busy = true; defer { busy = false }
            let payload = try JSONSerialization.jsonObject(with:data) as! [String:Any]
            let reply: WatchReply
            if let call { reply = try await call(payload) }
            else {
                guard let api, api.authenticated else { throw WatchContractError.unreachable }
                reply = try await APIWatchService.execute(api,input:payload)
            }
            guard ticket == epoch, reply.requestId == request.requestId else { throw DiaryBridgeError(message:"Přístup se změnil. Obnovte hodinky.") }
            let encoded = try JSONEncoder().encode(reply)
            guard encoded.count <= 100000 else { throw WatchContractError.invalid }
            if let action = reply.phoneAction, let id = reply.phoneJobId {
                guard ["protocol","travelSms","detail"].contains(action), id == request.jobId else { throw WatchContractError.invalid }
                pendingJobId = id; pendingAction = action
            }
            if request.kind == "action" { var acknowledgement = reply; acknowledgement.snapshot = nil; ledger.store(request:data,reply:try JSONEncoder().encode(acknowledgement),id:request.requestId) }
            lastSync = Date(); problem = nil
            if request.kind == "action" { changedAt = UUID() }
            return encoded
        } catch {
            problem = error.localizedDescription
            let code = (error as? DiaryBridgeError)?.code
            return (try? JSONEncoder().encode(WatchReply.failure(error.localizedDescription,requestId:requestID,code:code))) ?? Data()
        }
    }
    nonisolated func session(_ session: WCSession, didReceiveMessageData messageData: Data, replyHandler: @escaping (Data) -> Void) {
        Task { @MainActor [weak self] in
            guard let self else { replyHandler(Data()); return }
            let reply = await self.handle(messageData); replyHandler(reply)
        }
    }
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor [weak self] in self?.updateState(session); self?.problem = error?.localizedDescription }
    }
    nonisolated func sessionReachabilityDidChange(_ session: WCSession) { Task { @MainActor [weak self] in self?.updateState(session) } }
    nonisolated func sessionWatchStateDidChange(_ session: WCSession) { Task { @MainActor [weak self] in self?.updateState(session) } }
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) { Task { @MainActor [weak self] in self?.invalidate() } }
    nonisolated func sessionDidDeactivate(_ session: WCSession) { Task { @MainActor [weak self] in self?.invalidate(); session.activate() } }
}
