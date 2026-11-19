import SwiftUI
import UIKit

@main
@MainActor
struct PracovniDenikApp:App {
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var pushDelegate
    @StateObject private var store:APIStore
    init(){
        #if DEBUG
        let fixture=ProcessInfo.processInfo.arguments.contains("--native-api-testing")
        #else
        let fixture=false
        #endif
        _store=StateObject(wrappedValue:APIStore(fixture:fixture))
    }
    var body:some Scene{WindowGroup{APIRoot(store:store).diaryBubble()}}
}
struct FileShare:UIViewControllerRepresentable {
    let url:URL
    func makeUIViewController(context:Context)->UIActivityViewController{UIActivityViewController(activityItems:[url],applicationActivities:nil)}
    func updateUIViewController(_ controller:UIActivityViewController,context:Context){}
}
