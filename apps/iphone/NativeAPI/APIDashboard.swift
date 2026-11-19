import SwiftUI

struct APIOverview:View {
    @ObservedObject var store:APIStore
    @State private var company:Bool
    @State private var snapshot:APIValue = .null
    @State private var snapshotScope=""
    @State private var problem:String?
    @State private var loading=false
    @State private var requestID=UUID()
    private let previewData:APIValue?
    init(store:APIStore,previewData:APIValue?=nil){
        self.store=store;self.previewData=store.fixture ? previewData : nil
        _company=State(initialValue:store.manager)
        if store.fixture,let previewData{let mode=store.manager ? "company" : "personal"
            _snapshot=State(initialValue:previewData[mode].isNull ? previewData : previewData[mode]);_snapshotScope=State(initialValue:store.scope+mode)}
    }
    private var mode:String{company && store.manager ? "company" : "personal"}
    private var path:String{"/api/overview?mode="+mode+"&discipline="+store.transport.discipline}
    private var key:String{store.scope+path+store.revision.uuidString}
    private var data:APIValue{snapshotScope==store.scope+mode ? snapshot : .null}
    private var projected:APIValue{APIWorkTimeLogic.overviewProjection(data["timeSnapshot"],store:store)}
    private var displayJob:APIValue {
        let active=projected["states"].array.first{$0["userId"].string==store.userID}?["active"] ?? data["myState"]["active"]
        if active["jobId"].string=="unavailable"{return .null}
        if !active["jobId"].string.isEmpty,active["jobId"].string != "unavailable" {
            if let known=([data["currentJob"],data["nextJob"]]+data["todayJobs"].array+data["activeJobs"].array).first(where:{$0.id==active["jobId"].string}){return store.currentJob(known)}
            if let cached=store.vault?.state.cache["/api/jobs/"+active["jobId"].string]?["job"],!cached["title"].string.isEmpty{return store.currentJob(cached)}
            return .null
        }
        return !store.enabled("jobDay") || data["nextJob"].isNull ? .null : store.currentJob(data["nextJob"])
    }
    var body:some View {
        ScrollView {
            LazyVStack(alignment:.leading,spacing:16){
                header
                if loading && data.isNull{ProgressView("Načítám pracovní přehled…").frame(maxWidth:.infinity,minHeight:100)}
                if !data.isNull {
                    APIDashboardFreshness(store:store,asOf:data["asOf"])
                    if mode=="company"{companyContent}else{personalContent}
                }
                if let problem{DiaryStatusBanner(text:problem,warning:true);Button("Zkusit znovu"){Task{await load(refresh:true)}}.diaryBubble()}
            }.padding(18)
        }.background(DiaryStyle.background).navigationTitle(store.company).navigationBarTitleDisplayMode(.inline)
            .toolbar{APIHeader(store:store,unread:data["unread"].isNull ? nil : data["unread"].int)}
            .onChange(of:mode){_,value in if let previewData{snapshot=previewData[value].isNull ? previewData : previewData[value];snapshotScope=store.scope+value}}
            .task(id:key){if previewData==nil{await load()}}
            .refreshable{if previewData==nil{await store.resume(refreshViews:false);await load(refresh:true)}}
    }
    private var header:some View {
        VStack(alignment:.leading,spacing:8){
            Text(APIJobDetailPresentation.date(store.today)).font(.subheadline).foregroundStyle(.secondary)
            Text(mode=="company" ? "Firemní přehled" : APIDashboardLogic.greeting(name:store.me["user"]["name"].string)).font(.title2.weight(.bold)).accessibilityIdentifier("native-overview-title")
            if store.manager {
                Picker("Zobrazení přehledu",selection:$company){Text("Firma").tag(true);Text("Moje práce").tag(false)}.pickerStyle(.segmented).accessibilityIdentifier("dashboard-mode")
            }
        }
    }
    private var companyContent:some View {
        VStack(alignment:.leading,spacing:18){
            APIDashboardStats(store:store,data:data,company:true)
            if store.enabled("attendance") {
                APIDashboardSection(title:"Pracovníci v terénu"){
                    if data["people"].array.isEmpty{Text("Žádní dostupní pracovníci.").font(.subheadline).foregroundStyle(.secondary)}
                    ForEach(Array(data["people"].array.prefix(8)),id:\.id){person in
                        NavigationLink{personDestination(person)}label:{APIDashboardPersonRow(person:person)}.buttonStyle(.plain)
                    }
                    if data["people"].array.count>8{NavigationLink("Všichni pracovníci"){APIAttendanceView(store:store,initialUser:"all",initialDay:store.today)}.diaryBubble()}
                }
            }
            if store.enabled("jobs") {
                APIDashboardSection(title:"Aktivní realizace"){
                    if data["activeJobs"].array.isEmpty{Text("Žádné probíhající realizace.").font(.subheadline).foregroundStyle(.secondary)}
                    ForEach(data["activeJobs"].array,id:\.id){job in
                        NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)}label:{APIDashboardProjectRow(job:store.currentJob(job))}.buttonStyle(.plain)
                    }
                    if data["stats"]["inProgress"].int>data["activeJobs"].array.count{
                        NavigationLink("Všechny probíhající zakázky"){APIJobsScreen(store:store,filter:APIDashboardJobFilter(state:"in_progress",mine:false,allDates:true))}.diaryBubble()
                    }
                }
            }
            attention
        }
    }
    @ViewBuilder private func personDestination(_ person:APIValue)->some View {
        if store.enabled("teamManagement"){APIEntityDetail(store:store,resource:APIResource(entity:.team),initial:person)}else{APIAttendanceView(store:store,initialUser:person.id,initialDay:store.today)}
    }
    private var personalContent:some View {
        VStack(alignment:.leading,spacing:18){
            if store.enabled("attendance"){APIDashboardAttendanceCard(store:store,data:data,job:displayJob,snapshot:projected)}
            APIDashboardStats(store:store,data:data,company:false)
            if !displayJob.isNull,store.enabled("jobs") {
                APIDashboardCurrentJob(store:store,job:displayJob,snapshot:projected)
            }else if store.enabled("jobs"){
                let active=projected["states"].array.first{$0["userId"].string==store.userID}?["active"] ?? data["myState"]["active"]
                Text(active.isNull ? "Nemáte další naplánovanou návštěvu." : "Aktivní zakázka není v tomto přehledu dostupná. Podrobnosti se obnoví po synchronizaci; docházka zůstává přístupná.").font(.subheadline).foregroundStyle(.secondary)
            }
            if store.enabled("jobs")&&store.enabled("jobDay"){timeline}
            attention
            if store.enabled("notifications"),data["notifications"].array.contains(where:{$0["readAt"].isNull}) {
                APIDashboardSection(title:"Moje oznámení"){
                    ForEach(Array(data["notifications"].array.filter{$0["readAt"].isNull}.prefix(5)),id:\.id){notice in
                        NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.notifications),initial:notice)}label:{APIJobSettingsRow(title:notice["title"].string,symbol:"bell",detail:notice["body"].string)}.buttonStyle(.plain)
                    }
                }
            }
        }
    }
    private var timeline:some View {
        APIDashboardSection(title:"Dnešní návštěvy") {
            let active=projected["states"].array.first{$0["userId"].string==store.userID}?["active"]["jobId"].string ?? ""
            let visits=APIDashboardLogic.orderedVisits(data["todayJobs"].array,activeID:active)
            if visits.isEmpty{Text("Dnes bez naplánovaných návštěv.").font(.subheadline).foregroundStyle(.secondary)}
            ForEach(Array(visits.prefix(8)),id:\.id){job in
                NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)}label:{APIDashboardVisitRow(job:job,active:job.id==active)}.buttonStyle(.plain)
            }
            if data["todayTruncated"].bool || visits.count>8{
                NavigationLink("Všechny dnešní návštěvy"){APIJobsScreen(store:store,filter:APIDashboardJobFilter(mine:true))}.diaryBubble()
            }
            if !data["nextJob"].isNull,data["nextJob"]["dueDate"].string != store.today {
                NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:data["nextJob"])}label:{APIJobSettingsRow(title:"Nejbližší další návštěva",symbol:"calendar",detail:APIJobDetailPresentation.date(data["nextJob"]["dueDate"].string)+" · "+data["nextJob"].title)}.buttonStyle(.plain)
            }
        }
    }
    private var attention:some View {
        APIDashboardSection(title:mode=="company" ? "Vyžaduje pozornost" : "Moje upozornění"){
            if data["attention"].array.isEmpty && data["complete"].bool {Label("Vše je v pořádku",systemImage:"checkmark.circle").font(.subheadline).foregroundStyle(.secondary)}
            ForEach(data["attention"].array,id:\.id){item in
                NavigationLink{attentionDestination(item)}label:{APIJobSettingsRow(title:APIDashboardLogic.attentionTitles[item.id] ?? item.id,symbol:APIDashboardLogic.attentionSymbols[item.id] ?? "exclamationmark.circle",detail:"Počet: \(item["count"].int)")}.buttonStyle(.plain)
            }
        }
    }
    @ViewBuilder private func attentionDestination(_ item:APIValue)->some View {
        switch item["kind"].string {
        case "jobs":APIJobsScreen(store:store,filter:APIDashboardJobFilter(attention:item["filter"].string,mine:mode != "company",allDates:true))
        case "attendance":APIAttendanceView(store:store,initialUser:mode=="company" ? "all" : store.userID)
        case "defects":APIResourceList(store:store,resource:APIResource(entity:.defects,seed:.object(["status":.s("open"),"assignee":.s(mode=="company" ? "" : store.userID),"discipline":.s(store.transport.discipline)])))
        default:APIResourceList(store:store,resource:APIResource(entity:.notifications))
        }
    }
    private func load(refresh:Bool=false)async {
        let ticket=UUID(),scope=store.scope,requestedMode=mode,requestedPath=path
        requestID=ticket;loading=true
        defer{if requestID==ticket{loading=false}}
        if snapshotScope != scope+requestedMode{snapshot = .null;problem=nil}
        if snapshot.isNull,let cached=store.vault?.state.cache[requestedPath]{snapshot=cached;snapshotScope=scope+requestedMode}
        do {
            let result=try await store.get(requestedPath,refresh:refresh)
            guard !Task.isCancelled,ticket==requestID,scope==store.scope,requestedMode==mode else{return}
            snapshot=result;snapshotScope=scope+requestedMode;problem=nil
            #if DEBUG
            if store.fixture,ProcessInfo.processInfo.arguments.contains("--native-api-offline-dashboard-testing"){store.online=false}
            #endif
            let time=result["timeSnapshot"]
            if !time.isNull,!time["job"].id.isEmpty,time["projection"].string != "dashboard" {
                let key="/api/jobs/"+time["job"].id+"/time"
                let old=store.vault?.state.cache[key] ?? .null
                let versions=Dictionary(old["states"].array.map{($0["userId"].string,$0["version"].int)},uniquingKeysWith:max)
                let current=time["states"].array.allSatisfy{$0["version"].int >= (versions[$0["userId"].string] ?? 0)}
                if current,time["serverNow"].double >= old["serverNow"].double{store.vault?.state.cache[key]=time;try? store.vault?.persist()}
            }
        }catch{
            guard !Task.isCancelled,ticket==requestID,scope==store.scope else{return}
            if let e=error as? APIError,[401,403,404].contains(e.status){snapshot = .null}
            problem=error.localizedDescription
        }
    }
}
