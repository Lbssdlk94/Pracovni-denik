import SwiftUI

struct HybridDiaryScreen: View {
    @ObservedObject var session: BrowserSession
    @StateObject private var store: NativeDiaryStore
    @StateObject private var screens: NativeScreenStore
    @Environment(\.scenePhase) private var scenePhase
    init(session: BrowserSession) {
        self.session = session
        _store = StateObject(wrappedValue: NativeDiaryStore(browser: session))
        _screens = StateObject(wrappedValue: NativeScreenStore(browser: session))
    }
    var nativeVisible: Bool { !store.webVisible && store.context != nil }
    var body: some View {
        ZStack {
            // The web form, DOM, Files, IndexedDB, cookies and outboxes remain
            // mounted when covered by native screens. Never reload to switch UI.
            DiaryScreen(session: session).opacity(ProcessInfo.processInfo.arguments.contains("--ui-testing") ? 1 : 0).allowsHitTesting(ProcessInfo.processInfo.arguments.contains("--ui-testing")).accessibilityHidden(!ProcessInfo.processInfo.arguments.contains("--ui-testing"))
            NativeScreenView(store: screens)
                .opacity(nativeVisible || ProcessInfo.processInfo.arguments.contains("--ui-testing") ? 0 : 1).allowsHitTesting(!nativeVisible && !ProcessInfo.processInfo.arguments.contains("--ui-testing")).accessibilityHidden(nativeVisible || ProcessInfo.processInfo.arguments.contains("--ui-testing"))
                .safeAreaInset(edge: .top) {
                    if !nativeVisible && store.wasActivated {
                        HStack {
                            Button { Task { await store.activate() } } label: { Label("Přehled", systemImage: "chevron.left") }.frame(minHeight: 44)
                            Spacer()
                            if store.loading { ProgressView() }
                        }.padding(.horizontal).background(.regularMaterial)
                    }
                }
            if let context = store.context {
                NativeDiaryTabs(store: store, context: context).opacity(nativeVisible ? 1 : 0)
                    .allowsHitTesting(nativeVisible).accessibilityHidden(!nativeVisible)
            }
            if !store.verifiedInForeground || scenePhase != .active {
                DiaryStyle.background.ignoresSafeArea().overlay { ProgressView("Ověřuji přístup…") }
            }
        }.tint(DiaryStyle.accent)
            .safeAreaInset(edge: .top) {
                if let error = store.error {
                    HStack { Text(error).font(.callout); Button("Zavřít") { store.error = nil }.frame(minHeight: 44) }.padding().background(.background)
                }
            }
            .onChange(of: session.nativeSignal) { _, signal in Task { await store.receive(signal) } }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await store.resumed() } }
                else {
                    store.verifiedInForeground = false
                    if phase == .background {
                        let background = UIApplication.shared.beginBackgroundTask(withName: "Uchovat rozepsaný formulář")
                        Task { await screens.flush(); let _: BridgeAcknowledgement? = try? await session.nativeCall("flushDrafts"); UIApplication.shared.endBackgroundTask(background) }
                    }
                }
            }
            .task {
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(60)); try Task.checkCancellation() } catch { break }
                    if scenePhase == .active && nativeVisible { await store.activate(); if store.tab == 1 { await store.reloadJobs() } }
                }
            }
    }
}
