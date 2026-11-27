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
    @State private var assistant=false
    @StateObject private var assistantMemory=APIAssistantMemory()
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
            if store.authenticated && !store.needsPasswordChange {
                VStack { Spacer(); HStack { Spacer(); Button { assistant=true } label: { Image(systemName:"sparkles").font(.title2).frame(width:56, height:56).background(DiaryStyle.accent, in:Circle()).foregroundStyle(.white) }.accessibilityLabel("Pracovní asistent").padding(.trailing, 16).padding(.bottom, 72) } }
            }
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
            .fullScreenCover(isPresented:$assistant){APIAssistantWorkspace(store:store, memory:assistantMemory)}
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
    @State private var company=EndpointPolicy.home.host!
    @State private var verifyingCloudflare=false
    @State private var recovery=false
    var body:some View {
        NavigationStack{ScrollView{VStack(alignment:.leading,spacing:22){Image("DiaryMark").resizable().frame(width:72,height:72).clipShape(RoundedRectangle(cornerRadius:18));Text("Pracovní deník").font(.largeTitle.bold());Text("Přihlaste se firemním účtem.").foregroundStyle(.secondary)
            VStack(spacing:15){Picker("Firma",selection:$company){ForEach(EndpointPolicy.installations, id: \.1) { name, host in Text(name).tag(host) }}.pickerStyle(.menu)
                if company == EndpointPolicy.cloudflareHost {
                    Button("Ověřit přístup ke Cloudflare"){ verifyingCloudflare=true }
                        .frame(minHeight:44).disabled(store.busy)
                }
                TextField("Přihlašovací jméno",text:$username).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled().frame(minHeight:44).accessibilityIdentifier("api-login-username")
                SecureField("Heslo",text:$password).textContentType(.password).frame(minHeight:44).accessibilityIdentifier("api-login-password")
                Button("Přihlásit se"){Task{await signIn()}}.diaryBubble(.primary).frame(minHeight:44).disabled(store.busy)
            }.diaryCard()
            Button("Zapomenuté heslo"){recovery=true}.frame(minHeight:44)
            if store.busy{ProgressView("Ověřuji přihlášení…")};if let error=store.error{Text(error).foregroundStyle(DiaryStyle.warning)}
        }.padding(24)}.background(DiaryStyle.background).navigationTitle(store.company).navigationBarTitleDisplayMode(.inline)}
            .onAppear{company=store.transport.origin.host ?? company}
            .onChange(of:company){_,_ in password=""}
            .sheet(isPresented:$verifyingCloudflare){
                NavigationStack {
                    APICloudflareAccess(onVerified: { token in
                        verifyingCloudflare=false
                        Task {
                            do {
                                try await selectCompany()
                                try store.transport.setCloudflareCookie(token)
                                await store.restore()
                            } catch { store.error=error.localizedDescription }
                        }
                    }, onError: { message in
                        verifyingCloudflare=false
                        store.error=message
                    })
                    .navigationTitle("Ověření Cloudflare")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { Button("Zavřít"){verifyingCloudflare=false} }
                }
            }
            .alert("Obnovení hesla",isPresented:$recovery){Button("Rozumím",role:.cancel){}}message:{Text("Požádejte administrátora firmy o nové dočasné heslo. Obnovení odkazem ani e-mailem není dostupné.")}
    }
    private func selectCompany() async throws {
        if store.transport.origin.host != company {
            try await store.switchInstallation(URL(string:"https://"+company+"/")!)
        }
    }

    private func signIn() async {
        do {
            try await selectCompany()
            if !store.authenticated && !store.needsPasswordChange {
                await store.login(username:username,password:password)
            }
        } catch { store.error=error.localizedDescription }
        password=""
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
    @State private var query = ""
    private func matches(_ title: String) -> Bool { query.isEmpty || title.localizedStandardContains(query) }

    var body: some View {
        List {
            if query.isEmpty {
                HStack(spacing: 14) {
                    Image(systemName: "person.crop.circle.fill").font(.largeTitle).foregroundStyle(DiaryStyle.accent)
                    VStack(alignment: .leading) {
                        Text(store.me["user"]["name"].string).font(.headline)
                        Text(store.company).font(.subheadline).foregroundStyle(.secondary)
                    }
                }.padding(.vertical, 4)
            }
            Section("Práce v terénu") { resources([.gardens, .defects, .shafts]) }
            Section("Firemní agenda") {
                if store.manager && !store.isRolePreview && matches("Poptávky") {
                    NavigationLink { APIInquiries(store: store) } label: { Label("Poptávky", systemImage: "tray.full") }
                }
                let office = store.manager ? "Finance" : "Nákupy a zálohy"
                if (store.manager || store.role == "worker") && !store.isRolePreview && matches(office) {
                    NavigationLink { APIOffice(store: store) } label: { Label(office, systemImage: "creditcard") }
                }
                resources([.materials, .vehicles, .subscriptions])
            }
            Section("Účet a tým") {
                resources([.team, .notifications])
                if matches("Nastavení") { NavigationLink { APISettings(store: store) } label: { Label("Nastavení", systemImage: "gearshape") } }
                if matches("Koncepty a synchronizace") { NavigationLink { APIOutboxView(store: store) } label: { Label("Koncepty a synchronizace", systemImage: "arrow.triangle.2.circlepath") } }
            }
        }.navigationTitle("Více").searchable(text: $query, prompt: "Hledat v nabídce")
    }
    @ViewBuilder private func resources(_ entities: [APIEntity]) -> some View {
        ForEach(entities.filter { store.enabled($0.feature) && (!$0.managerOnly || store.manager) && matches($0.title) }, id: \.self) { entity in
            NavigationLink {
                if entity == .vehicles { APIVehiclesHome(store: store) }
                else { APIResourceList(store: store, resource: APIResource(entity: entity)) }
            } label: { Label(entity.title, systemImage: entity.symbol) }
        }
    }
}

struct APIPhoneFollowUp:Identifiable{let id=UUID();let job:APIValue;let action:String}
