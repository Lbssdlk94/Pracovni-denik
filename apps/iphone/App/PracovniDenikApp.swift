import SwiftUI
import UIKit
import WebKit

@main
@MainActor
struct PracovniDenikApp: App {
    @StateObject private var session = BrowserSession(testing: ProcessInfo.processInfo.arguments.contains("--ui-testing"))
    var body: some Scene {
        WindowGroup { DiaryScreen(session: session).preferredColorScheme(.light) }
    }
}

struct DiaryWebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) { /* Keep the current page and form. */ }
}
struct FileShare: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
struct DiaryScreen: View {
    @ObservedObject var session: BrowserSession
    private let green = Color(red: 0.09, green: 0.25, blue: 0.21)
    var body: some View {
        ZStack {
            Color(red: 0.969, green: 0.976, blue: 0.965).ignoresSafeArea()
            DiaryWebView(webView: session.webView)
            if session.initialLoading && !session.hasDocument {
                ProgressView("Otevírám Pracovní deník…").padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
            }
        }
        .tint(green)
        .safeAreaInset(edge: .top, spacing: 0) {
            if let message = session.problem {
                VStack(alignment: .leading, spacing: 12) {
                    Text(message).font(.callout)
                    Button("Znovu načíst", action: session.retry).buttonStyle(.borderedProminent)
                }.padding().frame(maxWidth: .infinity, alignment: .leading).background(Color.white)
            }
        }
        .sheet(item: $session.authentication) { page in
            NavigationStack {
                DiaryWebView(webView: page.webView)
                    .navigationTitle("Přihlášení")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zavřít") { session.authentication = nil } } }
            }
        }
        .sheet(item: $session.sharedFile) { file in FileShare(url: file.url) }
        .sheet(item: $session.document) { page in
            NavigationStack {
                DiaryWebView(webView: page.webView)
                    .navigationTitle("Dokument")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zavřít") { session.document = nil } } }
            }
        }
    }
}
