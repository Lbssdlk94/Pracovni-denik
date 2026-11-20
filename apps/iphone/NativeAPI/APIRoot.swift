import SwiftUI
import UIKit

struct APIRoot:View {
    @ObservedObject var store:APIStore
    @ObservedObject private var push=NativePushController.shared
    @ObservedObject private var watch=WatchPhoneCoordinator.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var outbox=false
    @State private var inbox=false
    @State private var followUp:APIPhoneFollowUp?
    var body:some View {
        ZStack{
            if store.needsPasswordChange{APIPasswordView(store:store,mandatory:true)}
            else if store.authenticated{
                TabView(selection:$store.tab){
                    NavigationStack{APIOverview(store:store)}.tabItem{Label("Přehled",systemImage:"square.grid.2x2")}.tag(0)
                    if store.enabled("jobs"){NavigationStack{APIJobsScreen(store:store)}.tabItem{Label("Zakázky",systemImage:"list.clipboard")}.tag(1)}
                    if store.enabled("attendance"){NavigationStack{APIAttendanceView(store:store)}.tabItem{Label("Docházka",systemImage:"clock")}.tag(2)}
                    if store.enabled("customers"){NavigationStack{APIResourceList(store:store,resource:APIResource(entity:.customers))}.tabItem{Label("Zákazníci",systemImage:"person.crop.rectangle")}.tag(3)}
                    NavigationStack{APIMore(store:store)}.tabItem{Label("Více",systemImage:"ellipsis")}.tag(4)
                }.id(store.presentationID)
            }else{APILogin(store:store)}
            if scenePhase != .active{DiaryStyle.background.ignoresSafeArea().overlay{Text("Pracovní deník").font(.title2.bold())}}
        }.tint(DiaryStyle.accent)
            .safeAreaInset(edge:.top,spacing:0){VStack(spacing:0){if store.authenticated && store.isRolePreview{APIRolePreviewBanner(store:store)};if store.authenticated && !store.isRolePreview && (!store.online || !store.outbox.isEmpty){Button{outbox=true}label:{HStack{Image(systemName:store.online ? "arrow.triangle.2.circlepath" : "wifi.slash");Text(store.online ? "\(store.outbox.count) neodeslaných změn" : "Offline · změny zůstávají v iPhonu").font(.caption);Spacer();Image(systemName:"chevron.right")}.padding(12).background(DiaryStyle.soft)}}}}
            .safeAreaInset(edge:.bottom){if store.authenticated,let error=store.error {Text(error).font(.caption).padding(8).background(.regularMaterial).onTapGesture{store.error=nil}}}
            .sheet(item:$store.route){route in
                Group{
                    if route.resource.entity == .subscriptions{APISubscriptionActivation(store:store,initial:route.value)}
                    else if route.resource.entity == .shafts{APIShaftEditor(store:store,initial:route.value,isNew:route.isNew)}
                    else if route.resource.entity == .team{APILocalAccountEditor(store:store)}
                    else{APIEntityEditor(store:store,resource:route.resource,original:route.value,isNew:route.isNew)}
                }
            }
            .sheet(isPresented:$inbox){NavigationStack{APIResourceList(store:store,resource:APIResource(entity:.notifications))}}
            .sheet(item:$followUp,onDismiss:{watch.clearFollowUp()}){request in Group{if request.action=="protocol"{APIProtocolEditor(store:store,jobID:request.job.id,completing:true)}else if request.action=="travelSms"{APIDepartureEditor(store:store,job:request.job,composeOnly:true)}else{NavigationStack{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:request.job)}}}}
            .sheet(isPresented:$outbox){NavigationStack{APIOutboxView(store:store)}}
            .sheet(isPresented:$push.showSettings){NativePushSettings(push:push)}
            .sheet(isPresented:$watch.showSettings){WatchPhoneSettings()}
            .onChange(of:push.inboxRequest){_,_ in openInbox()}
            .onChange(of:watch.pendingJobId){_,_ in Task{await openWatchRequest()}}
            .onChange(of:store.authenticated){_,authenticated in if authenticated{openInbox()}}
            .onChange(of:store.editing){_,editing in if !editing{openInbox();Task{await openWatchRequest()}}}
            .onChange(of:scenePhase){_,phase in if phase == .active{Task{await store.resume();await push.refresh()}}else{try? store.vault?.persist()}}
            .onChange(of:store.scope){_,_ in outbox=false;inbox=false;followUp=nil;push.invalidatePresentation();watch.invalidate()}
            .task{
                await store.start();push.attach(store);watch.attach(store);await push.refresh()
                // Keep work data current; resume does not rediscover permissions.
                while !Task.isCancelled{do{try await Task.sleep(for:.seconds(45));try Task.checkCancellation()}catch{break};if scenePhase == .active{await store.resume()}}
            }
    }
    func openInbox(){guard push.pendingInbox,store.authenticated,store.enabled("notifications"),!store.editing else{return};push.pendingInbox=false;inbox=true}
    func openWatchRequest()async{guard store.authenticated,!store.editing,followUp==nil,let id=watch.pendingJobId else{return};let scope=store.scope,action=watch.pendingAction ?? "detail";do{let result=try await store.get("/api/jobs/"+id);guard scope==store.scope,!store.editing else{return};followUp=APIPhoneFollowUp(job:result["job"],action:action)}catch{store.error=error.localizedDescription;watch.clearFollowUp()}}

}
struct APILogin:View {
    @ObservedObject var store:APIStore
    @State private var username=""
    @State private var password=""
    @State private var company="zavlahovy-denik.purplecedar.chatgpt.site"
    @State private var recovery=false
    var body:some View {
        NavigationStack{ScrollView{VStack(alignment:.leading,spacing:22){Image("DiaryMark").resizable().frame(width:72,height:72).clipShape(RoundedRectangle(cornerRadius:18));Text("Pracovní deník").font(.largeTitle.bold());Text("Přihlaste se firemním účtem.").foregroundStyle(.secondary)
            VStack(spacing:15){Picker("Firma",selection:$company){Text("Dr. Závlaha").tag("zavlahovy-denik.purplecedar.chatgpt.site");Text("Dr. Garden").tag("dr-garden.purplecedar.chatgpt.site")}.pickerStyle(.menu)
                TextField("Přihlašovací jméno",text:$username).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled().frame(minHeight:44).accessibilityIdentifier("api-login-username")
                SecureField("Heslo",text:$password).textContentType(.password).frame(minHeight:44).accessibilityIdentifier("api-login-password")
                Button("Přihlásit se"){Task{if store.transport.origin.host != company{try? await store.switchInstallation(URL(string:"https://"+company+"/")!)};await store.login(username:username,password:password);password=""}}.diaryBubble(.primary).frame(minHeight:44).disabled(store.busy)
            }.diaryCard()
            Button("Zapomenuté heslo"){recovery=true}.frame(minHeight:44)
            if store.busy{ProgressView("Ověřuji přihlášení…")};if let error=store.error{Text(error).foregroundStyle(DiaryStyle.warning)}
        }.padding(24)}.background(DiaryStyle.background).navigationTitle(store.company).navigationBarTitleDisplayMode(.inline)}
            .onAppear{company=store.transport.origin.host ?? company}
            .alert("Obnovení hesla",isPresented:$recovery){Button("Rozumím",role:.cancel){}}message:{Text("Požádejte administrátora firmy o nové dočasné heslo. Obnovení odkazem ani e-mailem není dostupné.")}
    }
}
struct APIHeader:ToolbarContent {
    @ObservedObject var store:APIStore
    var unread:Int?=nil
    var body:some ToolbarContent{
        ToolbarItem(placement:.topBarTrailing){if store.canPreviewRoles{APIRolePreviewPicker(store:store)}}
        ToolbarItem(placement:.topBarTrailing){if store.enabled("notifications"){NavigationLink{APIResourceList(store:store,resource:APIResource(entity:.notifications))}label:{Image(systemName:"bell").overlay(alignment:.topTrailing){if let unread,unread>0{Text(unread>99 ? "99+" : String(unread)).font(.caption2.bold()).padding(4).foregroundStyle(Color.white).background(DiaryStyle.actionFill,in:Capsule()).offset(x:12,y:-10)}}}.accessibilityLabel("Upozornění").accessibilityValue(unread.map{"\($0) nepřečtených"} ?? "")}}
    }
}
struct APIMore:View {
    @ObservedObject var store:APIStore
    var body:some View{ScrollView{VStack(spacing:16){HStack{Image(systemName:"person.crop.circle.fill").font(.largeTitle);VStack(alignment:.leading){Text(store.me["user"]["name"].string).font(.headline);Text(store.company).foregroundStyle(.secondary)}}.diaryCard()
        category("Práce v terénu","leaf",entities:[.gardens,.defects,.shafts])
        category("Firemní agenda","building.2",entities:[.materials,.vehicles,.subscriptions])
        if store.manager && store.enabled("teamManagement"){NavigationLink{APIResourceList(store:store,resource:APIResource(entity:.team))}label:{row("Tým","person.2")}}
        if store.enabled("notifications"){NavigationLink{APIResourceList(store:store,resource:APIResource(entity:.notifications))}label:{row("Upozornění","bell")}}
        NavigationLink{APISettings(store:store)}label:{row("Nastavení","gearshape")}
        NavigationLink{APIOutboxView(store:store)}label:{row("Koncepty a synchronizace","arrow.triangle.2.circlepath")}
    }.padding(18)}.background(DiaryStyle.background).navigationTitle("Více").navigationBarTitleDisplayMode(.inline)}
    @ViewBuilder func category(_ title:String,_ symbol:String,entities:[APIEntity])->some View{let allowed=entities.filter{store.enabled($0.feature)&&(!$0.managerOnly||store.manager)};if !allowed.isEmpty{NavigationLink{ScrollView{VStack(spacing:16){ForEach(allowed,id:\.self){entity in if entity == .vehicles{NavigationLink{APIVehiclesHome(store:store)}label:{row(entity.title,entity.symbol)}}else{NavigationLink{APIResourceList(store:store,resource:APIResource(entity:entity))}label:{row(entity.title,entity.symbol)}}}}.padding(18)}.background(DiaryStyle.background).navigationTitle(title)}label:{row(title,symbol)}}}
    func row(_ title:String,_ symbol:String)->some View{HStack(spacing:14){Image(systemName:symbol).frame(width:44,height:44).background(DiaryStyle.soft,in:RoundedRectangle(cornerRadius:14));Text(title).font(.headline);Spacer();Image(systemName:"chevron.right").font(.caption)}.foregroundStyle(DiaryStyle.accent).frame(minHeight:48).diaryCard().accessibilityElement(children:.combine).accessibilityLabel(title)}
}

struct APIPhoneFollowUp:Identifiable{let id=UUID();let job:APIValue;let action:String}
