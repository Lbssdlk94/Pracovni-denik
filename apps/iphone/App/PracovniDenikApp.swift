import SwiftUI
import UIKit

@main
@MainActor
struct PracovniDenikApp:App {
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var pushDelegate
    @StateObject private var store:APIStore
    init(){
        #if DEBUG
        let fixture=ProcessInfo.processInfo.arguments.contains("--native-api-testing") || ProcessInfo.processInfo.arguments.contains("--native-job-detail-preview")
        #else
        let fixture=false
        #endif
        _store=StateObject(wrappedValue:APIStore(fixture:fixture))
    }
    var body:some Scene{WindowGroup{
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--native-job-detail-preview") {
            APIJobDetailPreviewHost(kind:ProcessInfo.processInfo.arguments.contains("--preview-travel") ? "travel" : ProcessInfo.processInfo.arguments.contains("--preview-paused") ? "break" : "work",appearance:ProcessInfo.processInfo.arguments.contains("--preview-dark") ? .dark : .light,largeText:ProcessInfo.processInfo.arguments.contains("--preview-large-text"),offline:ProcessInfo.processInfo.arguments.contains("--preview-offline"))
        }else{APIRoot(store:store).diaryBubble()}
        #else
        APIRoot(store:store).diaryBubble()
        #endif
    }}
}
struct FileShare:UIViewControllerRepresentable {
    let url:URL
    func makeUIViewController(context:Context)->UIActivityViewController{UIActivityViewController(activityItems:[url],applicationActivities:nil)}
    func updateUIViewController(_ controller:UIActivityViewController,context:Context){}
}
