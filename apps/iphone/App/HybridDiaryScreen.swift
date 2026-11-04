import SwiftUI
import UIKit

struct HybridDiaryScreen: View {
    @ObservedObject var session: BrowserSession
    @ObservedObject private var push = NativePushController.shared
    @ObservedObject private var watch = WatchPhoneCoordinator.shared
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
                            Button { Task { await store.activate() } } label: { Label("Přehled", systemImage: "chevron.left") }.frame(minHeight: 44).accessibilityIdentifier("native-screen-back")
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
                if let problem = session.problem {
                    VStack(alignment:.leading,spacing:10) {
                        Text(problem).font(.callout)
                        Button("Znovu načíst",action:session.retry).buttonStyle(.bordered).frame(minHeight:44)
                    }.padding().frame(maxWidth:.infinity,alignment:.leading).background(.background)
                }
                if let error = store.error {
                    HStack { Text(error).font(.callout); Button("Zavřít") { store.error = nil }.frame(minHeight: 44) }.padding().background(.background)
                }
            }
            .sheet(isPresented:$watch.showSettings){WatchPhoneSettings()}
            .safeAreaInset(edge:.bottom){if watch.pendingJobId != nil {Button(watch.pendingAction == "travelSms" ? "Připravit SMS po odjezdu z hodinek" : "Otevřít zakázku z hodinek"){Task{await openWatchJob()}}.buttonStyle(.bordered).padding().background(.regularMaterial)}}
            .sheet(isPresented:$push.showSettings){NativePushSettings(push:push)}
            .safeAreaInset(edge:.bottom){if push.pendingInbox {Button("Otevřít nové upozornění"){Task{await openPushInbox()}}.buttonStyle(.bordered).padding().background(.regularMaterial)}}
            .onChange(of:watch.changedAt){_,_ in Task{if scenePhase == .active && nativeVisible {await store.activate();if store.tab == 1 {await store.reloadJobs()}}}}
            .onChange(of:push.inboxRequest){_,_ in Task{await openPushInbox()}}
            .onChange(of: session.nativeSignal) { _, signal in Task { if signal.kind == .invalidated {push.invalidatePresentation();watch.invalidate()};await store.receive(signal);if signal.kind == .ready {await push.refresh();await openPushInbox()} } }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await store.resumed(); await push.refresh();await openPushInbox() } }
                else {
                    store.verifiedInForeground = false
                    if phase == .background {
                        let background = UIApplication.shared.beginBackgroundTask(withName: "Uchovat rozepsaný formulář")
                        Task { await screens.flush(); let _: BridgeAcknowledgement? = try? await session.nativeCall("flushDrafts"); if background != .invalid { UIApplication.shared.endBackgroundTask(background) } }
                    }
                }
            }
            .task {
                push.attach(session)
                watch.attach(session)
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(60)); try Task.checkCancellation() } catch { break }
                    if scenePhase == .active && nativeVisible { await store.activate(); if store.tab == 1 { await store.reloadJobs() } }
                }
            }
    }
    private func openWatchJob() async {
        guard let id = watch.pendingJobId, scenePhase == .active else { return }
        await store.openWeb(job:id,action:watch.pendingAction == "detail" ? nil : watch.pendingAction)
        if store.error == nil { watch.clearFollowUp() }
    }
    private func openPushInbox() async {
        guard push.pendingInbox,store.context != nil,scenePhase == .active else{return}
        await store.openWeb(page:"notifications")
        if store.error == nil {push.pendingInbox=false}
    }
}
