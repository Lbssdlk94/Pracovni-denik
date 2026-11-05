import SwiftUI
import WebKit

@MainActor
final class NativeDiaryStore: ObservableObject {
    let browser: BrowserSession
    @Published var context: DiaryContext?
    @Published var overview: DiaryJobPage?
    @Published var jobs: [DiaryJob] = []
    @Published var nextCursor: String?
    @Published var loading = false
    @Published var error: String?
    @Published var webVisible = true
    @Published var tab = 0
    @Published var day = ""
    @Published var query = ""
    @Published var state = "all"
    @Published var mine = true
    @Published var allDates = false
    @Published var verifiedInForeground = true
    private var epoch = 0
    private var listEpoch = 0
    private var activated = false
    var wasActivated: Bool { activated }
    init(browser: BrowserSession) { self.browser = browser }

    func invalidate() {
        epoch += 1; listEpoch += 1; error = nil
        context = nil; overview = nil; jobs = []; nextCursor = nil
        webVisible = true; loading = false
    }
    func receive(_ signal: NativeSignal) async {
        if signal.kind == .screen { return }
        if signal.kind == .invalidated { invalidate(); return }
        if !activated || context == nil { await activate() }
    }
    func activate() async {
        let ticket = epoch
        loading = true; error = nil
        defer { if ticket == epoch { loading = false } }
        do {
            let current: DiaryContext = try await browser.nativeCall("context")
            guard ticket == epoch else { return }
            let changed = context?.identityKey != current.identityKey
            if changed { tab = 0; jobs = []; overview = nil; nextCursor = nil; query = ""; state = "all"; mine = true; allDates = !current.enabled("jobDay"); day = current.today }
            context = current
            if day.isEmpty { day = current.today }
            activated = true; verifiedInForeground = true; webVisible = false
            if current.enabled("jobs") && current.enabled("jobDay") {
                let result: DiaryJobPage = try await browser.nativeCall("overview", ["mine": mine])
                guard ticket == epoch else { return }; overview = result
            }
        } catch { if ticket == epoch {
            if (error as? DiaryBridgeError)?.code != "native_form_open" { invalidate() }
            webVisible = true; self.error = error.localizedDescription; verifiedInForeground = true
        } }
    }
    func reloadJobs(more: Bool = false) async {
        guard let current = context, current.nativeJobsAvailable else { return }
        listEpoch += 1; let ticket = listEpoch, identity = current.identityKey, generation = epoch
        loading = true; error = nil
        defer { if ticket == listEpoch { loading = false } }
        do {
            var args: [String: Any] = ["q": query, "state": state, "mine": mine]
            if !allDates && current.enabled("jobDay") { args["day"] = day }
            if more { args["cursor"] = nextCursor }
            let result: DiaryJobPage = try await browser.nativeCall("jobs", args)
            guard ticket == listEpoch, generation == epoch, context?.identityKey == identity else { return }
            jobs = more ? jobs + result.jobs.filter { item in !jobs.contains { $0.id == item.id } } : result.jobs
            nextCursor = result.nextCursor
        } catch {
            guard ticket == listEpoch, generation == epoch else { return }
            invalidate(); self.error = error.localizedDescription
        }
    }
    func detail(_ id: String) async throws -> DiaryJobDetail {
        let ticket = epoch, identity = context?.identityKey
        let value: DiaryJobDetail = try await browser.nativeCall("job", ["id": id])
        guard ticket == epoch, context?.identityKey == identity, context != nil else { throw DiaryBridgeError(message: "Přístup se změnil. Obnovte přehled.") }
        return value
    }
    func openWeb(page: String? = nil, job: String? = nil, action: String? = nil) async {
        error = nil
        // Display the existing browser first, so its alerts/confirmation dialogs
        // can be handled without a hidden WebView or a destructive reload.
        webVisible = true
        guard page != nil || job != nil else { return }
        var args: [String: Any] = [:]
        args["page"] = page; args["jobId"] = job; args["action"] = action
        do {
            let _: BridgeAcknowledgement = try await browser.nativeCall("open", args)
            if page == "attendance" { tab = 2 }
            if page == "customers" { tab = 3 }
        }
        catch { self.error = error.localizedDescription }
    }
    func resumed() async {
        if !webVisible { await activate(); if tab == 1 { await reloadJobs() } }
        verifiedInForeground = true
    }
}
