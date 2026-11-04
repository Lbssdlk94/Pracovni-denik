import SwiftUI
import WebKit
import UIKit

struct AuthenticationPage: Identifiable {
    let id = UUID()
    let webView: WKWebView
}
struct SharedFile: Identifiable {
    let id = UUID()
    let url: URL
}

// One persistent WebView per application session. Changing SwiftUI state or
// returning from background must never recreate/reload a technician's form.
@MainActor
final class BrowserSession: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    let webView: WKWebView
    @Published var initialLoading = true
    @Published var problem: String?
    @Published var authentication: AuthenticationPage?
    @Published var sharedFile: SharedFile?
    private(set) var hasDocument = false
    private var downloadURLs: [ObjectIdentifier: URL] = [:]
    private let testing: Bool

    init(testing: Bool = false, autoLoad: Bool = true) {
        self.testing = testing
        let config = WKWebViewConfiguration()
        config.websiteDataStore = testing ? .nonPersistent() : .default()
        config.limitsNavigationsToAppBoundDomains = !testing
        config.defaultWebpagePreferences.preferredContentMode = .mobile
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.969, green: 0.976, blue: 0.965, alpha: 1)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        if autoLoad { loadInitialContent() }
    }
    func loadInitialContent() {
        if testing {
            webView.loadHTMLString("""
            <!doctype html><html lang="cs"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body style="font:18px -apple-system;background:#f7f9f6;color:#183f35"><h1>Test deníku</h1>
            <label>Poznámka <input aria-label="Poznámka" id="note"></label></body></html>
            """, baseURL: EndpointPolicy.home)
        } else { webView.load(URLRequest(url: EndpointPolicy.home)) }
    }
    func retry() {
        // Explicit user action only; no refresh on scenePhase or network changes.
        problem = nil
        initialLoading = !hasDocument
        if testing { loadInitialContent() }
        else if let url = webView.url, EndpointPolicy.isDiary(url) { webView.reload() }
        else { loadInitialContent() }
    }
    func navigationFailed(_ error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        initialLoading = false
        problem = "Deník se nepodařilo načíst. Zkontrolujte připojení. Neodeslanou práci ponechte v aplikaci."
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView !== self.webView {
            if let url = webView.url, EndpointPolicy.isDiary(url), !EndpointPolicy.isSignIn(url) {
                let root = URL(string: "https://" + url.host! + "/")!
                authentication = nil
                self.webView.load(URLRequest(url: root))
            }
            return
        }
        hasDocument = true
        initialLoading = false
        problem = nil
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if webView === self.webView { navigationFailed(error) }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if webView === self.webView { navigationFailed(error) }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard webView === self.webView else { return }
        initialLoading = false
        problem = "iOS ukončil zobrazení deníku. Uložená data zůstávají v aplikaci. Pro pokračování zvolte Znovu načíst."
    }
    private func showAuthentication(_ url: URL, configuration: WKWebViewConfiguration? = nil) -> WKWebView {
        let config = configuration ?? WKWebViewConfiguration()
        config.websiteDataStore = webView.configuration.websiteDataStore
        config.limitsNavigationsToAppBoundDomains = false
        let browser = WKWebView(frame: .zero, configuration: config)
        browser.navigationDelegate = self
        browser.uiDelegate = self
        authentication = AuthenticationPage(webView: browser)
        if configuration == nil { browser.load(URLRequest(url: url)) }
        return browser
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.shouldPerformDownload { decisionHandler(.download); return }
        if webView !== self.webView {
            decisionHandler(url.scheme == "https" || EndpointPolicy.isEmbeddedDocument(url) ? .allow : .cancel)
            return
        }
        if EndpointPolicy.isSignIn(url) { _ = showAuthentication(url); decisionHandler(.cancel); return }
        if EndpointPolicy.isDiary(url) || EndpointPolicy.isEmbeddedDocument(url) { decisionHandler(.allow); return }
        if url.scheme == "https", action.navigationType == .other, action.targetFrame?.isMainFrame != false {
            // OAuth redirects use a separate window with the same first-party
            // cookie store. The main diary keeps its App-Bound offline support.
            _ = showAuthentication(url)
        } else if EndpointPolicy.isExternal(url) { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url else { return nil }
        if EndpointPolicy.isEmbeddedDocument(url) || EndpointPolicy.isDiary(url) && !EndpointPolicy.isSignIn(url) {
            webView.load(action.request)
            return nil
        }
        if EndpointPolicy.isSignIn(url) || webView !== self.webView { return showAuthentication(url, configuration: configuration) }
        if EndpointPolicy.isExternal(url) { UIApplication.shared.open(url) }
        return nil
    }
    func webViewDidClose(_ webView: WKWebView) { if webView !== self.webView { authentication = nil } }
    private func presenter() -> UIViewController? {
        let window = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow }
        var controller = window?.rootViewController
        while let presented = controller?.presentedViewController { controller = presented }
        return controller
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard let host = presenter() else { completionHandler(); return }
        let alert = UIAlertController(title: webView.url?.host ?? "Pracovní deník", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        host.present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard let host = presenter() else { completionHandler(false); return }
        let alert = UIAlertController(title: "Pracovní deník", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Zrušit", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Potvrdit", style: .default) { _ in completionHandler(true) })
        host.present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard let host = presenter() else { completionHandler(nil); return }
        let alert = UIAlertController(title: "Pracovní deník", message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Zrušit", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "Použít", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        host.present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(EndpointPolicy.hosts.contains(origin.host) && frame.isMainFrame ? .prompt : .deny)
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        do {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let name = URL(fileURLWithPath: suggestedFilename).lastPathComponent
            let url = folder.appendingPathComponent(name.isEmpty ? "Vykaz.pdf" : name)
            downloadURLs[ObjectIdentifier(download)] = url
            completionHandler(url)
        } catch { completionHandler(nil); problem = "Soubor se nepodařilo připravit. Zkontrolujte volné místo." }
    }
    func downloadDidFinish(_ download: WKDownload) {
        if let url = downloadURLs.removeValue(forKey: ObjectIdentifier(download)) { sharedFile = SharedFile(url: url) }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloadURLs.removeValue(forKey: ObjectIdentifier(download))
        problem = "Soubor se nepodařilo stáhnout. Zkuste export znovu."
    }
}
