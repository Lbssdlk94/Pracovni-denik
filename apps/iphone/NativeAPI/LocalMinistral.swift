import Foundation
#if MINISTRAL_DEVICE
import llama
#endif

enum MinistralCommand {
    static func extract(_ text: String) -> String? {
        guard let start = text.firstIndex(of: "{"), let end = text[start...].firstIndex(of: "}") else { return nil }
        let slice = text[start...end]
        guard let data = slice.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let command = object["command"] as? String else { return nil }
        let clean = command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...180).contains(clean.count), !clean.contains("\n") else { return nil }
        return clean
    }
}

enum MinistralError: LocalizedError {
    case lowMemory
    case missing
    case simulator
    case loadFailed
    case tooLong
    case decodeFailed
    var errorDescription: String? {
        switch self {
        case .lowMemory: return "Ministral 3B potřebuje iPhone s 8 GB paměti. Na tomhle telefonu bych ho nenačetl, nic jsem nespustil."
        case .missing: return "Model ještě není stažený. Klepněte na Stáhnout Ministral."
        case .simulator: return "Na simulátoru se Ministral nespouští. V IPA na iPhonu ano."
        case .loadFailed: return "Model se nepodařilo načíst. Nechte v telefonu volné aspoň 4 GB a zkuste to znovu."
        case .tooLong: return "Příkaz je na tenhle běh moc dlouhý. Zkuste kratší větu."
        case .decodeFailed: return "Ministral odpověď nedokončil. Základní asistent zůstává k dispozici."
        }
    }
}

@MainActor
final class MinistralLibrary: NSObject, ObservableObject {
    static let shared = MinistralLibrary()
    nonisolated static let byteCount: Int64 = 2_147_023_008
    nonisolated static let fileName = "Ministral-3-3B-Instruct-2512-Q4_K_M.gguf"
    nonisolated static let source = URL(string: "https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512-GGUF/resolve/main/Ministral-3-3B-Instruct-2512-Q4_K_M.gguf")!

    @Published private(set) var installed = false
    @Published private(set) var downloading = false
    @Published private(set) var progress = 0.0
    @Published private(set) var message = "Ministral 3B není v telefonu."

    private var session: URLSession?
    private var task: URLSessionDownloadTask?
    private let modelURL: URL

    private override init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        modelURL = base.appendingPathComponent(Self.fileName)
        super.init()
        refresh()
    }

    func refresh() {
        let size = (try? FileManager.default.attributesOfItem(atPath: modelURL.path)[.size] as? NSNumber)?.int64Value ?? 0
        installed = size == Self.byteCount
        if installed && !downloading { message = "Ministral 3B je v telefonu. První odpověď může trvat minutu." }
    }

    func start() {
        guard !downloading else { return }
        refresh()
        if installed { return }
        if ProcessInfo.processInfo.physicalMemory < 7_000_000_000 {
            message = MinistralError.lowMemory.localizedDescription
            return
        }
        do {
            try FileManager.default.createDirectory(at: modelURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let free = try modelURL.deletingLastPathComponent().resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage ?? 0
            if free < Self.byteCount + 500_000_000 {
                message = "Na stažení je potřeba asi 2,7 GB volného místa. Nic jsem nestáhl."
                return
            }
        } catch {
            message = "Úložiště se nepodařilo připravit. Nic jsem nestáhl."
            return
        }
        downloading = true
        progress = 0
        message = "Stahuji Ministral 3B, asi 2,2 GB. Nechte aplikaci otevřenou."
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 60
        configuration.waitsForConnectivity = true
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        self.session = session
        task = session.downloadTask(with: Self.source)
        task?.resume()
    }

    func cancel() {
        task?.cancel()
        task = nil
        session?.invalidateAndCancel()
        session = nil
        downloading = false
        progress = 0
        message = "Stahování je zrušené. Model se nespustil."
    }

    func remove() {
        cancel()
        try? FileManager.default.removeItem(at: modelURL)
        #if MINISTRAL_DEVICE
        MinistralEngine.unload()
        #endif
        installed = false
        message = "Model je smazaný z telefonu."
    }

    nonisolated fileprivate static func storedModelURL() -> URL? {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(fileName)
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
        return size == byteCount ? url : nil
    }
}

extension MinistralLibrary: URLSessionDownloadDelegate {
    nonisolated func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        let expected = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : MinistralLibrary.byteCount
        let value = min(1, Double(totalBytesWritten) / Double(expected))
        Task { @MainActor in
            self.progress = value
            self.message = "Stahuji Ministral 3B, \(Int(value * 100)) % z 2,2 GB."
        }
    }

    nonisolated func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        let destination = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(MinistralLibrary.fileName)
        do {
            try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
            try FileManager.default.moveItem(at: location, to: destination)
            let size = (try FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? NSNumber)?.int64Value ?? 0
            guard size == MinistralLibrary.byteCount else {
                try? FileManager.default.removeItem(at: destination)
                Task { @MainActor in self.finish(false, "Stažený soubor nemá správnou velikost. Model jsem nespustil.") }
                return
            }
            Task { @MainActor in self.finish(true, "Ministral 3B je v telefonu. První odpověď může trvat minutu.") }
        } catch {
            Task { @MainActor in self.finish(false, "Model se nepodařilo uložit. Nic jsem nespustil.") }
        }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error else { return }
        if (error as NSError).code == NSURLErrorCancelled { return }
        Task { @MainActor in self.finish(false, "Stahování selhalo. Zkuste to znovu na Wi-Fi. Model se nespustil.") }
    }

    private func finish(_ ok: Bool, _ text: String) {
        downloading = false
        installed = ok
        progress = ok ? 1 : 0
        message = text
        task = nil
        session?.finishTasksAndInvalidate()
        session = nil
    }
}

enum MinistralRuntime {
    static func answer(_ text: String) async throws -> String {
        #if MINISTRAL_DEVICE
        let prompt = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await Task.detached(priority: .userInitiated) {
            try MinistralEngine.complete(prompt)
        }.value
        #else
        throw MinistralError.simulator
        #endif
    }
}

#if MINISTRAL_DEVICE
private enum MinistralEngine {
    private static let lock = NSLock()
    private static var backendReady = false
    private static var model: OpaquePointer?
    private static var context: OpaquePointer?
    private static var vocab: OpaquePointer?
    private static var loadedPath = ""

    static func unload() {
        lock.lock()
        defer { lock.unlock() }
        releaseLocked()
    }

    static func complete(_ user: String) throws -> String {
        lock.lock()
        defer { lock.unlock() }
        guard ProcessInfo.processInfo.physicalMemory >= 7_000_000_000 else { throw MinistralError.lowMemory }
        guard let url = MinistralLibrary.storedModelURL() else { throw MinistralError.missing }
        try prepare(url)
        guard let model, let context, let vocab else { throw MinistralError.loadFailed }
        let system = "Jsi pracovní asistent deníku v telefonu. Nevymýšlej zákazníky, hodiny, ceny ani stav zakázek. Když uživatel chce údaj z deníku nebo změnu, odpověz jen jedním JSON objektem {\"command\":\"krátký český příkaz\"}. Příkaz napiš tak, jak by ho zadal člověk, například {\"command\":\"Najdi zákazníka Petřík\"}. Nic jiného k tomu nepřidávej. Když se jen ptá, co umíš, odpověz česky jednou větou a neříkej, že jsi něco uložil."
        let prompt = "[SYSTEM_PROMPT]\(system)[/SYSTEM_PROMPT][INST]\(user)[/INST]"
        var tokens = try tokenize(vocab, prompt)
        if tokens.count > 900 { throw MinistralError.tooLong }
        let promptCount = Int32(tokens.count)
        let decoded = tokens.withUnsafeMutableBufferPointer { buffer -> Int32 in
            guard let base = buffer.baseAddress else { return -1 }
            return llama_decode(context, llama_batch_get_one(base, promptCount))
        }
        if decoded != 0 { throw MinistralError.decodeFailed }
        var chain = llama_sampler_chain_default_params()
        chain.no_perf = true
        guard let sampler = llama_sampler_chain_init(chain) else { throw MinistralError.decodeFailed }
        defer { llama_sampler_free(sampler) }
        llama_sampler_chain_add(sampler, llama_sampler_init_temp(0.2))
        llama_sampler_chain_add(sampler, llama_sampler_init_dist(42))
        let eos = llama_vocab_eos(vocab)
        var output = ""
        for _ in 0..<160 {
            let token = llama_sampler_sample(sampler, context, -1)
            if token == eos { break }
            output += piece(vocab, token)
            if MinistralCommand.extract(output) != nil { break }
            var one = [token]
            let step = one.withUnsafeMutableBufferPointer { buffer -> Int32 in
                guard let base = buffer.baseAddress else { return -1 }
                return llama_decode(context, llama_batch_get_one(base, 1))
            }
            if step != 0 { break }
        }
        let clean = output.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty { throw MinistralError.decodeFailed }
        return clean
    }

    private static func prepare(_ url: URL) throws {
        if model != nil && loadedPath == url.path { return }
        releaseLocked()
        if !backendReady {
            llama_backend_init()
            backendReady = true
        }
        let params = llama_model_default_params()
        guard let loaded = url.path.withCString({ llama_model_load_from_file($0, params) }) else { throw MinistralError.loadFailed }
        var contextParams = llama_context_default_params()
        contextParams.n_ctx = 1024
        contextParams.n_batch = 1024
        contextParams.n_ubatch = 256
        contextParams.n_threads = 4
        contextParams.n_threads_batch = 4
        guard let created = llama_init_from_model(loaded, contextParams), let words = llama_model_get_vocab(loaded) else {
            llama_model_free(loaded)
            throw MinistralError.loadFailed
        }
        model = loaded
        context = created
        vocab = words
        loadedPath = url.path
    }

    private static func releaseLocked() {
        if let context { llama_free(context) }
        if let model { llama_model_free(model) }
        context = nil
        model = nil
        vocab = nil
        loadedPath = ""
    }

    private static func tokenize(_ vocab: OpaquePointer, _ text: String) throws -> [Int32] {
        var tokens = [Int32](repeating: 0, count: max(32, text.utf8.count + 8))
        let count = text.withCString { pointer in
            llama_tokenize(vocab, pointer, Int32(text.utf8.count), &tokens, Int32(tokens.count), true, true)
        }
        guard count > 0 else { throw MinistralError.tooLong }
        return Array(tokens.prefix(Int(count)))
    }

    private static func piece(_ vocab: OpaquePointer, _ token: Int32) -> String {
        var buffer = [CChar](repeating: 0, count: 256)
        let count = llama_token_to_piece(vocab, token, &buffer, Int32(buffer.count), 0, false)
        guard count > 0 else { return "" }
        let bytes = buffer.prefix(Int(count)).map { UInt8(bitPattern: $0) }
        return String(bytes: bytes, encoding: .utf8) ?? ""
    }
}
#endif
