import XCTest
import WebKit
@testable import PracovniDenik

final class BrowserLifecycleTests: XCTestCase {
    @MainActor
    func testTransientFailureKeepsTheSameWebViewAndDoesNotEraseContent() {
        let session = BrowserSession(testing: true, autoLoad: false)
        let original = session.webView
        session.webView(original, didFinish: nil)
        session.navigationFailed(NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet))
        XCTAssertTrue(session.webView === original)
        XCTAssertTrue(session.hasDocument)
        XCTAssertNotNil(session.problem)
        XCTAssertFalse(session.initialLoading)
        session.webView(original, didFinish: nil)
        XCTAssertNil(session.problem)
        XCTAssertTrue(session.webView === original)
    }
    @MainActor
    func testCanceledNavigationDoesNotShowAnOutageOrReplaceTheBrowser() {
        let session = BrowserSession(testing: true, autoLoad: false)
        let original = session.webView
        session.navigationFailed(NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled))
        XCTAssertNil(session.problem)
        XCTAssertTrue(session.webView === original)
    }
    @MainActor
    func testProcessTerminationRequiresExplicitRetry() {
        let session = BrowserSession(testing: true, autoLoad: false)
        let original = session.webView
        session.webViewWebContentProcessDidTerminate(original)
        XCTAssertNotNil(session.problem)
        XCTAssertNil(session.webView.url, "termination unexpectedly navigated the browser")
        XCTAssertTrue(session.webView === original)
    }
}
