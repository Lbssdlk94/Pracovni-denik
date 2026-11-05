import SwiftUI

@main
@MainActor
struct PracovniDenikWatchApp: App {
    @StateObject private var store = WatchStore(preview: ProcessInfo.processInfo.arguments.contains("--watch-preview"))
    var body: some Scene { WindowGroup { WatchDayView(store:store).tint(WatchStyle.accent) } }
}
