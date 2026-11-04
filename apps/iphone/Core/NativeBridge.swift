import Foundation
import WebKit

// No tokens, credentials, arbitrary URLs or server identities cross this bridge.
// Data comes from the existing page's authenticated, scoped cloud.js client.
@MainActor
final class NativeStateRelay: NSObject, WKScriptMessageHandler {
    weak var owner: BrowserSession?
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let owner, message.webView === owner.webView, message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, EndpointPolicy.isDiary(url),
              let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "ready" { owner.nativeSignal = NativeSignal(kind: .ready) }
        else if type == "invalidated" { owner.nativeSignal = NativeSignal(kind: .invalidated) }
    }
}
extension BrowserSession {
    func nativeCall<T: Decodable>(_ command: String, _ arguments: [String: Any] = [:]) async throws -> T {
        guard let url = webView.url, EndpointPolicy.isDiary(url), hasDocument else { throw DiaryBridgeError(message: "Nejdříve otevřete a přihlaste deník ve webové části.") }
        let script = """
        try {
          if (!window.__workDiaryNative) return JSON.stringify({error:'Nativní přehled zatím není připravený. Použijte webovou část nebo obnovte aplikaci po uložení práce.'});
          const data = await window.__workDiaryNative.execute(command, payload);
          return JSON.stringify({data});
        } catch(error) { return JSON.stringify({error:error.message||'Operace se nepodařila.',status:error.status||0,code:error.code||null}); }
        """
        let result = try await webView.callAsyncJavaScript(script, arguments: ["command": command, "payload": arguments], in: nil, contentWorld: .page)
        guard let text = result as? String, let data = text.data(using: .utf8) else { throw DiaryBridgeError(message: "Neplatná odpověď deníku.") }
        let reply = try JSONDecoder().decode(BridgeReply<T>.self, from: data)
        guard let value = reply.data else { throw DiaryBridgeError(message: reply.error ?? "Deník není dostupný.", code: reply.code) }
        return value
    }
}
