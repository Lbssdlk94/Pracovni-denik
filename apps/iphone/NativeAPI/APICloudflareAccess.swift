import SwiftUI
import WebKit

struct APICloudflareAccess: UIViewRepresentable {
    let onVerified: (String?) -> Void
    let onError: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onVerified: onVerified, onError: onError) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        let url = URL(string: "https://" + EndpointPolicy.cloudflareHost + "/api/auth/options")!
        web.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        let onVerified: (String?) -> Void
        let onError: (String) -> Void
        private var finished = false

        init(onVerified: @escaping (String?) -> Void, onError: @escaping (String) -> Void) {
            self.onVerified = onVerified
            self.onError = onError
        }

        func webView(_ web: WKWebView, decidePolicyFor action: WKNavigationAction,
                    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            let diary = EndpointPolicy.isDiary(url) && url.host == EndpointPolicy.cloudflareHost
            decisionHandler(diary || EndpointPolicy.isCloudflareAccess(url) ? .allow : .cancel)
        }

        func webView(_ web: WKWebView, decidePolicyFor navigation: WKNavigationResponse,
                    decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
            guard navigation.isForMainFrame, let response = navigation.response as? HTTPURLResponse,
                  response.url?.host == EndpointPolicy.cloudflareHost, response.url?.path == "/api/auth/options",
                  response.statusCode == 200, response.mimeType == "application/json" else {
                decisionHandler(.allow)
                return
            }
            decisionHandler(.cancel)
            guard !finished else { return }
            finished = true
            web.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
                let token = cookies.first { cookie in
                    let domain = cookie.domain.lowercased()
                    return cookie.name == "CF_Authorization" &&
                        (domain == EndpointPolicy.cloudflareHost || domain == "." + EndpointPolicy.cloudflareHost) &&
                        cookie.path == "/" && cookie.isSecure && (cookie.expiresDate ?? .distantFuture) > Date()
                }?.value
                self?.onVerified(token)
            }
        }

        func webView(_ web: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            onError("Ověření Cloudflare se nepodařilo načíst.")
        }
    }
}
