import SwiftUI
import UIKit
import UserNotifications

struct NativeNotificationPreferences: Decodable, Equatable {let jobs:Bool;let attendance:Bool}
struct NativePushStatus: Decodable {
    let preferences: NativeNotificationPreferences?
    let configured: Bool?; let enabled: Bool?; let topic: String?; let code: String?
    let missing: [String]?; let userId: String?; let registered: Bool?; let deviceId: String?
    let accepted: Bool?; let ok: Bool?
}
enum NativePushPolicy {
    static func token(_ data: Data) -> String { data.map { String(format:"%02x",$0) }.joined() }
    static func opensInbox(_ info: [AnyHashable:Any]) -> Bool { (info["workDiaryInbox"] as? NSNumber)?.intValue == 1 }
    static func environment(_ value: String?) -> String? { ["development","production"].contains(value ?? "") ? value : nil }
}

@MainActor
final class NativePushController: ObservableObject {
    static let shared = NativePushController()
    @Published var showSettings = false
    @Published var status: NativePushStatus?
    @Published var permission: UNAuthorizationStatus = .notDetermined
    @Published var busy = false
    @Published var message: String?
    @Published var pendingInbox = false
    @Published var inboxRequest = UUID()
    private weak var browser: BrowserSession?
    private var actorKey: String?
    private var token: String?
    private var registering = false
    private var generation = 0
    private var desired: Bool { actorKey.map { UserDefaults.standard.bool(forKey:"native-push-enabled:"+$0) } ?? false }
    private func desire(_ value: Bool) { if let actorKey { UserDefaults.standard.set(value,forKey:"native-push-enabled:"+actorKey) } }
    func invalidatePresentation() { generation+=1;status=nil;actorKey=nil;message=nil;showSettings=false }
    func attach(_ browser: BrowserSession) { self.browser=browser }
    private func call(_ action: String, extra: [String:Any] = [:]) async throws -> NativePushStatus {
        guard let browser else { throw DiaryBridgeError(message:"Nejdříve se přihlaste do deníku.") }
        var values=extra;values["action"]=action;return try await browser.nativeCall("nativePush",values)
    }
    func refresh() async {
        guard !busy, let browser, !browser.usesIsolatedNativeFixture || browser.hasDocument else { return }
        busy=true;let ticket=generation;defer{busy=false}
        permission=await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        do {
            let config=try await call("config")
            guard generation == ticket else{return}
            let key=(browser.webView.url?.host ?? "")+"|"+(config.userId ?? "")
            if key != actorKey { generation+=1;actorKey=key;status=nil;message=nil }
            status=config
            if desired && config.configured == true && config.enabled != false && [.authorized,.provisional,.ephemeral].contains(permission) && !browser.usesIsolatedNativeFixture {
                // Re-register at launch/foreground; APNs tokens are never persisted.
                UIApplication.shared.registerForRemoteNotifications()
            }
        } catch { if generation == ticket {status=nil;message=error.localizedDescription} }
    }
    func enable() async {
        guard !busy,status?.configured == true,status?.enabled != false else{return}
        busy=true;defer{busy=false};message=nil
        do {
            guard Bundle.main.bundleIdentifier == status?.topic,
                  NativePushPolicy.environment(Bundle.main.object(forInfoDictionaryKey:"NativePushEnvironment") as? String) != nil else {
                throw DiaryBridgeError(message:"Bundle ID nebo prostředí podepsané aplikace neodpovídá nastavení serveru.")
            }
            let granted=try await UNUserNotificationCenter.current().requestAuthorization(options:[.alert,.badge,.sound])
            permission=await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            guard granted else {message="Oznámení jsou zakázaná. Povolte je v nastavení iPhonu.";return}
            desire(true);message="Registruji telefon u Apple…";UIApplication.shared.registerForRemoteNotifications()
        }catch{message=error.localizedDescription}
    }
    func receivedToken(_ data: Data) async {
        token=NativePushPolicy.token(data)
        guard desired,!registering,status?.configured == true,status?.enabled != false,let token,
              let environment=NativePushPolicy.environment(Bundle.main.object(forInfoDictionaryKey:"NativePushEnvironment") as? String) else {return}
        registering=true;let ticket=generation;defer{registering=false}
        do {
            let result=try await call("register",extra:["token":token,"environment":environment,"bundleId":Bundle.main.bundleIdentifier ?? ""])
            guard generation == ticket else{return}
            guard result.registered == true else{throw DiaryBridgeError(message:"Telefon nebyl přihlášený k oznámením.")}
            let next=try await call("config");guard generation == ticket else{return};message="Oznámení jsou zapnutá pro tento účet.";status=next
        }catch{if generation == ticket{message=error.localizedDescription}}
    }
    func failed(_ error: Error) { message="Registrace APNs se nezdařila. Aplikace musí být podepsaná profilem s Push Notifications. "+error.localizedDescription }
    func disable() async {
        guard !busy else{return};busy=true;let ticket=generation;defer{busy=false}
        do {let _=try await call("detach");guard generation == ticket else{return};desire(false);UIApplication.shared.unregisterForRemoteNotifications();token=nil;let next=try await call("config");guard generation == ticket else{return};status=next;message="Oznámení jsou v tomto telefonu vypnutá."}catch{if generation == ticket{message=error.localizedDescription}}
    }
    func preferences(jobs: Bool, attendance: Bool) async {
        guard !busy else{return};busy=true;let ticket=generation;defer{busy=false}
        do{let _=try await call("preferences",extra:["jobs":jobs,"attendance":attendance]);let next=try await call("config");guard generation == ticket else{return};status=next;message="Výběr oznámení je uložený pro váš účet."}catch{if generation == ticket{message=error.localizedDescription}}
    }
    func test() async {
        guard !busy else{return};busy=true;defer{busy=false}
        do{let result=try await call("test");message=result.accepted == true ? "Apple zprávu přijalo. Doručení ověřte na telefonu, také při zamčeném displeji." : "Apple zprávu nepřijalo."}catch{message=error.localizedDescription}
    }
    func received(open: Bool) async {
        if open {pendingInbox=true;inboxRequest=UUID()}
        let _:NativePushStatus?=try? await call("received")
    }
}

final class PushAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application:UIApplication,didFinishLaunchingWithOptions launchOptions:[UIApplication.LaunchOptionsKey:Any]?=nil)->Bool {
        UNUserNotificationCenter.current().delegate=self;return true
    }
    func application(_ application:UIApplication,didRegisterForRemoteNotificationsWithDeviceToken deviceToken:Data){Task{@MainActor in await NativePushController.shared.receivedToken(deviceToken)}}
    func application(_ application:UIApplication,didFailToRegisterForRemoteNotificationsWithError error:Error){Task{@MainActor in NativePushController.shared.failed(error)}}
    func userNotificationCenter(_ center:UNUserNotificationCenter,willPresent notification:UNNotification,withCompletionHandler completionHandler:@escaping(UNNotificationPresentationOptions)->Void){
        guard NativePushPolicy.opensInbox(notification.request.content.userInfo) else{completionHandler([]);return}
        Task{@MainActor in await NativePushController.shared.received(open:false)};completionHandler([.banner,.list,.sound])
    }
    func userNotificationCenter(_ center:UNUserNotificationCenter,didReceive response:UNNotificationResponse,withCompletionHandler completionHandler:@escaping()->Void){
        if response.actionIdentifier == UNNotificationDefaultActionIdentifier && NativePushPolicy.opensInbox(response.notification.request.content.userInfo){Task{@MainActor in await NativePushController.shared.received(open:true)}}
        completionHandler()
    }
}
