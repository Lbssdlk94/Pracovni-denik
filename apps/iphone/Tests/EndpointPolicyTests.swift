import XCTest
@testable import PracovniDenik

final class EndpointPolicyTests: XCTestCase {
    func testExactHTTPSDiaryOrigins() {
        XCTAssertTrue(EndpointPolicy.isDiary(EndpointPolicy.home))
        XCTAssertTrue(EndpointPolicy.isDiary(URL(string: "https://dr-garden.purplecedar.chatgpt.site/?job=123")!))
        for text in ["http://zavlahovy-denik.purplecedar.chatgpt.site/", "https://zavlahovy-denik.purplecedar.chatgpt.site.evil.test/", "https://evil.test/", "https://user@zavlahovy-denik.purplecedar.chatgpt.site/", "https://zavlahovy-denik.purplecedar.chatgpt.site:8443/", "file:///private/data"] {
            XCTAssertFalse(EndpointPolicy.isDiary(URL(string: text)!), text)
        }
    }
    func testSignInStaysSeparateFromOperationalNavigation() {
        XCTAssertTrue(EndpointPolicy.isSignIn(URL(string: EndpointPolicy.home.absoluteString + "signin-with-chatgpt")!))
        XCTAssertFalse(EndpointPolicy.isSignIn(URL(string: "https://evil.test/signin-with-chatgpt")!))
        XCTAssertFalse(EndpointPolicy.isSignIn(EndpointPolicy.home))
    }
    func testCloudflareSignInIsSeparateFromDiaryAndAllowsItsProvider() throws {
        let provider = try XCTUnwrap(URL(string: "https://dash.cloudflare.com/oauth2/auth"))
        let challenge = try XCTUnwrap(URL(string: "https://challenges.cloudflare.com/"))
        let lookalike = try XCTUnwrap(URL(string: "https://dash.cloudflare.com.example.test/"))
        XCTAssertTrue(EndpointPolicy.isCloudflareSignInPage(provider, mainFrame: true))
        XCTAssertFalse(EndpointPolicy.isCloudflareAccess(provider))
        XCTAssertFalse(EndpointPolicy.isDiary(provider))
        XCTAssertTrue(EndpointPolicy.isCloudflareSignInPage(challenge, mainFrame: false))
        XCTAssertFalse(EndpointPolicy.isCloudflareSignInPage(challenge, mainFrame: true))
        XCTAssertFalse(EndpointPolicy.isCloudflareSignInPage(lookalike, mainFrame: true))
    }
    func testPDFBlobMustBelongToKnownDiary() {
        XCTAssertTrue(EndpointPolicy.isEmbeddedDocument(URL(string: "blob:https://zavlahovy-denik.purplecedar.chatgpt.site/test-pdf")!))
        XCTAssertFalse(EndpointPolicy.isEmbeddedDocument(URL(string: "blob:https://evil.test/private")!))
        XCTAssertTrue(EndpointPolicy.isEmbeddedDocument(URL(string: "about:blank")!))
        XCTAssertFalse(EndpointPolicy.isEmbeddedDocument(URL(string: "file:///private/pdf")!))
    }
    func testExternalActionsExcludeExecutableAndLocalURLs() {
        for text in ["tel:+420123456789", "sms:+420123456789", "mailto:user@example.test", "https://maps.apple.com/?q=test"] {
            XCTAssertTrue(EndpointPolicy.isExternal(URL(string: text)!))
        }
        for text in ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,test", "https:missing-host"] {
            XCTAssertFalse(EndpointPolicy.isExternal(URL(string: text)!))
        }
    }
}
