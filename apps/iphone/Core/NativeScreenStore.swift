import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class NativeScreenStore: ObservableObject {
    let browser: BrowserSession
    @Published var screen: NativeScreenSnapshot?
    @Published var error: String?
    @Published var busy = false
    @Published var images: [String: Data] = [:]
    @Published var fileRequest: NativeFileRequest?
    @Published var preview: NativePreviewFile?
    private var epoch = 0
    private var pending: [String: [String: Any]] = [:]
    private var flushTask: Task<Void, Never>?
    private var loadingImages = Set<String>()
    init(browser: BrowserSession) { self.browser = browser }
    func invalidate() {
        epoch += 1; error = nil; pending = [:]; flushTask?.cancel(); screen = nil; images = [:]; loadingImages = []
        fileRequest = nil; preview = nil; busy = false
    }
    private func accept(_ value: NativeScreenSnapshot, generation: Int) {
        guard epoch == generation else { return }
        screen = value; fileRequest = value.file
    }
    func refresh() async {
        guard !busy, pending.isEmpty, browser.hasDocument else { return }
        let generation = epoch
        do { let value: NativeScreenSnapshot = try await browser.nativeCall("screen"); accept(value, generation: generation); error = nil }
        catch { if generation == epoch { self.error = error.localizedDescription } }
    }
    func change(_ control: NativeControl, value: String? = nil, checked: Bool? = nil, values: [String]? = nil, commit: Bool = false) {
        var args: [String: Any] = ["action":"value", "commit":commit]
        args["value"] = value; args["checked"] = checked; args["values"] = values; args["_label"] = control.label; args["_kind"] = control.kind
        pending[control.id] = args
        flushTask?.cancel()
        flushTask = Task {
            do { try await Task.sleep(for: .milliseconds(180)); try Task.checkCancellation() } catch { return }
            await flush()
        }
    }
    func flush() async {
        guard !busy else { return }
        let generation = epoch; busy = true
        defer { if generation == epoch { busy = false } }
        while let entry = pending.first, generation == epoch {
            pending.removeValue(forKey: entry.key)
            guard let target = screen?.find(entry.key), target.label == entry.value["_label"] as? String, target.kind == entry.value["_kind"] as? String else { pending[entry.key] = entry.value; error = "Formulář se změnil. Poslední úprava zůstává rozepsaná; před uložením ji zkontrolujte."; break }
            var args = entry.value; args.removeValue(forKey: "_label"); args.removeValue(forKey: "_kind"); args["handle"] = target.handle
            do { let value: NativeScreenSnapshot = try await browser.nativeCall("control", args); accept(value, generation: generation); error = nil }
            catch { pending[entry.key] = entry.value; self.error = error.localizedDescription; break }
        }
    }
    func perform(_ control: NativeControl, action: String = "click", extra: [String: Any] = [:]) async {
        flushTask?.cancel()
        // Finish all typed values before the submitter is activated.
        for _ in 0..<200 { if !busy { break }; try? await Task.sleep(for: .milliseconds(20)) }
        guard !busy else { error = "Probíhá ukládání. Počkejte na dokončení."; return }
        await flush()
        guard pending.isEmpty else { return }
        let generation = epoch; busy = true
        defer { if generation == epoch { busy = false } }
        var args = extra; args["action"] = action; let current = screen?.find(control.id); args["handle"] = current?.label == control.label && current?.kind == control.kind ? current?.handle : control.handle
        do {
            let value: NativeScreenSnapshot = try await browser.nativeCall("control", args)
            accept(value, generation: generation); error = nil
            if let transfer = value.transfer { await openAsset(transfer.id) }
        } catch { if generation == epoch { self.error = error.localizedDescription } }
    }
    func attach(_ request: NativeFileRequest, files: [NativePickedFile]) async {
        let generation = epoch
        do {
            let value: NativeScreenSnapshot = try await browser.nativeCall("control", ["handle":request.id,"action":"file","files":files.map(\.payload)])
            fileRequest = nil; accept(value, generation: generation)
        } catch { self.error = error.localizedDescription }
    }
    func cancelFile(_ request: NativeFileRequest) async {
        let _: NativeScreenSnapshot? = try? await browser.nativeCall("control", ["handle":request.id,"action":"cancelFile"])
        fileRequest = nil
    }
    func image(_ handle: String, force: Bool = false) async {
        guard !loadingImages.contains(handle), force || images[handle] == nil else { return }
        let generation = epoch; loadingImages.insert(handle)
        defer { loadingImages.remove(handle) }
        do { let asset: NativeAsset = try await browser.nativeCall("asset", ["handle":handle]); if generation == epoch { images[handle] = asset.bytes } }
        catch { /* A protected/deleted photograph must not replace the rest of a form. */ }
    }
    func openAsset(_ handle: String) async {
        let generation = epoch
        do {
            let asset: NativeAsset = try await browser.nativeCall("asset", ["handle":handle])
            guard generation == epoch, let data = asset.bytes else { return }
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let suffix = asset.type.contains("pdf") ? ".pdf" : asset.type.hasPrefix("image/") ? ".jpg" : ".bin"
            let proposed = URL(fileURLWithPath: asset.name).lastPathComponent
            let safe = proposed.isEmpty || [".",".."].contains(proposed) ? "Pracovni-denik"+suffix : proposed.contains(".") ? proposed : proposed+suffix
            let url = folder.appendingPathComponent(safe)
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            preview = NativePreviewFile(url: url)
        } catch { self.error = error.localizedDescription }
    }
}

@MainActor
extension NativeScreenStore {
    func prepareFile(_ request: NativeFileRequest, data: Data, name: String, type: String, last: Bool) async throws {
        let generation = epoch
        let _: BridgeAcknowledgement = try await browser.nativeCall("control", ["handle":request.id,"action":"fileStart","name":name,"type":type,"size":data.count])
        var index=0
        for offset in stride(from:0,to:data.count,by:262144) {
            guard generation == epoch else { throw DiaryBridgeError(message:"Přístup se změnil.") }
            let chunk=data.subdata(in:offset..<min(data.count,offset+262144))
            let _: BridgeAcknowledgement = try await browser.nativeCall("control", ["handle":request.id,"action":"fileChunk","index":index,"data":chunk.base64EncodedString()]);index+=1
        }
        let _: BridgeAcknowledgement = try await browser.nativeCall("control", ["handle":request.id,"action":"fileFinish","last":last])
        if last { fileRequest=nil;await refresh() }
    }
    func prepareFile(_ request: NativeFileRequest, url: URL, last: Bool) async throws {
        let generation=epoch,handle=try FileHandle(forReadingFrom:url)
        defer { try? handle.close() }
        let size=try handle.seekToEnd();try handle.seek(toOffset:0)
        let _: BridgeAcknowledgement = try await browser.nativeCall("control", ["handle":request.id,"action":"fileStart","name":url.lastPathComponent,"type":UTType(filenameExtension:url.pathExtension)?.preferredMIMEType ?? "application/octet-stream","size":size])
        var index=0
        while let chunk=try handle.read(upToCount:262144),!chunk.isEmpty {
            guard generation == epoch else { throw DiaryBridgeError(message:"Přístup se změnil.") }
            let _: BridgeAcknowledgement = try await browser.nativeCall("control", ["handle":request.id,"action":"fileChunk","index":index,"data":chunk.base64EncodedString()]);index+=1
        }
        let _: BridgeAcknowledgement = try await browser.nativeCall("control", ["handle":request.id,"action":"fileFinish","last":last])
        if last { fileRequest=nil;await refresh() }
    }
}
