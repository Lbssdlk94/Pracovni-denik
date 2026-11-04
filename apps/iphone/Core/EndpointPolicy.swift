import Foundation

enum EndpointPolicy {
    static let home = URL(string: "https://zavlahovy-denik.purplecedar.chatgpt.site/")!
    static let hosts: Set<String> = ["zavlahovy-denik.purplecedar.chatgpt.site", "dr-garden.purplecedar.chatgpt.site"]

    static func isDiary(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && url.user == nil && url.password == nil &&
        (url.port == nil || url.port == 443) && hosts.contains(url.host?.lowercased() ?? "")
    }
    static func isSignIn(_ url: URL) -> Bool {
        isDiary(url) && ["/signin-with-chatgpt", "/signout-with-chatgpt"].contains(url.path)
    }
    static func isExternal(_ url: URL) -> Bool {
        guard url.user == nil && url.password == nil else { return false }
        return ["https", "tel", "sms", "mailto", "maps"].contains(url.scheme?.lowercased() ?? "")
    }
}

extension EndpointPolicy {
    static func isEmbeddedDocument(_ url: URL) -> Bool {
        if url.absoluteString == "about:blank" { return true }
        guard url.scheme == "blob", let inner = URL(string: String(url.absoluteString.dropFirst(5))) else { return false }
        return isDiary(inner)
    }
}
