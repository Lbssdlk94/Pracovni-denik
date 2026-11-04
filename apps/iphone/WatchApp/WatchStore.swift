import Foundation
import Combine
import WatchConnectivity

@MainActor
private final class WatchPendingCall {
    private var continuation: CheckedContinuation<Data,Error>?
    private var timeout: Task<Void,Never>?
    init(_ continuation: CheckedContinuation<Data,Error>) {
        self.continuation = continuation
        timeout = Task { [weak self] in
            do { try await Task.sleep(for:.seconds(20)); try Task.checkCancellation() } catch { return }
            self?.finish(.failure(WatchContractError.timedOut))
        }
    }
    func finish(_ result: Result<Data,Error>) {
        guard let continuation else { return }
        self.continuation = nil; timeout?.cancel(); timeout = nil
        continuation.resume(with:result)
    }
}
@MainActor
final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var snapshot: WatchSnapshot?
    @Published private(set) var busy = false
    @Published private(set) var reachable = false
    @Published var message: String?
    @Published var problem: String?
    private var active = true
    private var epoch = 0
    private var transport: WCSession?
    let preview: Bool
    init(preview: Bool = false) {
        self.preview = preview
        super.init()
        if preview {
            if let url = Bundle.main.url(forResource:"WatchPreview",withExtension:"json"), let data = try? Data(contentsOf:url) { snapshot = try? JSONDecoder().decode(WatchSnapshot.self,from:data) }
            reachable = true
        } else if WCSession.isSupported() {
            let session = WCSession.default
            transport = session; session.delegate = self; session.activate()
        }
    }
    func visible(at date: Date = Date()) -> WatchSnapshot? { active && (preview || snapshot?.isFresh(at:date) == true) ? snapshot : nil }
    func resume() async { active = true; if !preview { await refresh() } }
    func pause() { if preview { return };active = false; epoch += 1; snapshot = nil; message = nil; problem = nil }
    private func invalidate() { epoch += 1;snapshot = nil;message = nil;problem = "Ověřte přístup obnovením. Otevřete deník na iPhonu." }
    private func exchange(_ request: WatchRequest) async throws -> WatchReply {
        try request.validated()
        guard let session = transport, session.activationState == .activated, session.isReachable else { throw WatchContractError.unreachable }
        let data = try JSONEncoder().encode(request)
        let response: Data = try await withCheckedThrowingContinuation { continuation in
            let pending = WatchPendingCall(continuation)
            session.sendMessageData(data,replyHandler:{ response in Task { @MainActor in pending.finish(.success(response)) } },errorHandler:{ error in Task { @MainActor in pending.finish(.failure(error)) } })
        }
        guard response.count <= 100000 else { throw WatchContractError.invalid }
        let reply = try JSONDecoder().decode(WatchReply.self,from:response)
        guard reply.requestId == request.requestId else { throw WatchContractError.invalid }
        if let error = reply.error { throw NSError(domain:"WorkDiaryWatch",code:1,userInfo:[NSLocalizedDescriptionKey:error]) }
        if let snapshot = reply.snapshot, !snapshot.isFresh() { throw WatchContractError.stale }
        return reply
    }
    func refresh() async {
        guard active, !busy, !preview else { return }
        let ticket = epoch;busy = true;defer { busy = false }
        do {
            let reply = try await exchange(.refresh())
            guard ticket == epoch, active else { return }
            snapshot = reply.snapshot; problem = nil; reachable = true
        } catch {
            guard ticket == epoch else { return };snapshot = nil;problem = error.localizedDescription
        }
    }
    func perform(_ action: WatchAction, job: WatchJob, arrivalTime: String? = nil) async {
        guard !busy, !preview, let state = visible() else { return }
        let request = WatchRequest.change(action,job:job,snapshot:state,arrivalTime:arrivalTime),ticket = epoch
        busy = true;problem = nil;message = nil;defer { busy = false }
        do {
            let reply = try await exchange(request)
            guard ticket == epoch, active else { return }
            // Never optimistically mark work done; display only the server reply.
            snapshot = reply.snapshot;message = reply.message
        } catch {
            guard ticket == epoch else { return };snapshot = nil;problem = error.localizedDescription
        }
    }
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor [weak self] in self?.reachable = session.isReachable;self?.problem = error?.localizedDescription;if error == nil { await self?.refresh() } }
    }
    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor [weak self] in
            guard let self else { return };reachable = session.isReachable
            if reachable { await refresh() } else { invalidate() }
        }
    }
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String:Any]) {
        if message["invalidated"] as? Bool == true { Task { @MainActor [weak self] in self?.invalidate() } }
    }
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String:Any]) {
        if applicationContext["invalidated"] as? Bool == true { Task { @MainActor [weak self] in self?.invalidate() } }
    }
}
