import SwiftUI

struct APIJobListRow:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    let open:(APIValue)->Void
    @State private var statusRequest:APIJobStatusRequest?
    @State private var departure=false
    @State private var report=false
    @State private var work:APIWorkTimeAction?
    @State private var snapshot:APIValue = .null
    @State private var timeScope=""
    @State private var timeProblem:String?
    @State private var contact:APIValue = .null
    @State private var contactScope=""
    @Environment(\.openURL) private var openURL
    @Environment(\.dynamicTypeSize) private var typeSize
    var mayWork:Bool{APIJobWorkflow.canWork(current,userID:store.userID,writer:store.writer,manager:store.manager) && !store.isRolePreview}
    private var current:APIValue{let value=store.currentJob(job);return contactScope==store.scope && !contact.isNull ? value.merged(["customerContact":contact]) : value}
    private var projected:APIValue{
        let own=current["myTime"].merged(["userId":.s(store.userID),"version":.n(current["myTime"]["version"].int),"assigned":.bool(assigned)])
        var source=timeScope==store.scope && !snapshot.isNull ? snapshot : .object(["job":current,"states":.array([own]),"intervals":.array([])])
        if let saved=store.vault?.state.cache["/api/jobs/"+job.id+"/time"],saved["projection"].string != "dashboard",saved["serverNow"].double>source["serverNow"].double{source=saved}
        source["states"] = .array(source["states"].array.map{state in state["userId"].string==store.userID && own["version"].int>state["version"].int ? state.merged(own.object) : state})
        return APIWorkTimeLogic.project(source,store:store)
    }
    private var assigned:Bool{current["assignedTo"].string==store.userID || current["assignedTos"].array.contains(.s(store.userID))}
    private var personal:APIJobDetailAction?{APIJobDetailAction.resolve(job:current,states:projected["states"].array,userID:store.userID,travelEnabled:store.enabled("jobTravel"))}
    private var mayRecord:Bool{mayWork && assigned && (current["serviceApproval"].isNull || current["serviceApproval"].string=="confirmed")}
    var body:some View {
        VStack(alignment:.leading,spacing:4){
            Button{open(current)}label:{summary}.buttonStyle(.plain).accessibilityIdentifier("native-job-"+job.id)
            actionRow
        }.padding(.horizontal,12).padding(.vertical,8)
            .background{RoundedRectangle(cornerRadius:20).fill(DiaryStyle.surface).contentShape(RoundedRectangle(cornerRadius:20)).onTapGesture{open(current)}}
            .contentShape(RoundedRectangle(cornerRadius:20))
            .contextMenu{menu}
            .swipeActions(edge:.trailing,allowsFullSwipe:false){
                if let url=APIFormat.navigation(current["address"].string){Button{openURL(url)}label:{Label("Navigovat",systemImage:"location")}.tint(DiaryStyle.accent)}
                if let phone=APIJobsPresentation.phone(current){Button{openURL(phone)}label:{Label("Zavolat",systemImage:"phone")}.tint(.blue)}
            }
            .swipeActions(edge:.leading,allowsFullSwipe:false){if mayRecord,let personal{Button{performPrimary()}label:{Label(shortTitle(personal),systemImage:personal.symbol)}.tint(DiaryStyle.accent)}}
            .sheet(item:$statusRequest){request in APIJobStatusEditor(store:store,job:current,initialStatus:request.targetStatus)}
            .sheet(isPresented:$departure){APIDepartureEditor(store:store,job:current)}
            .sheet(item:$work){request in APIJobRowWorkSheet(store:store,job:current,kind:request.kind)}
            .sheet(isPresented:$report){APIProtocolEditor(store:store,jobID:job.id)}
            .task(id:store.scope+job.id+store.revision.uuidString){await loadTime();await loadContact()}
    }
    private var summary:some View {
        VStack(alignment:.leading,spacing:4){
            HStack(alignment:.firstTextBaseline,spacing:6){Text(APIJobsPresentation.title(current)).font(.headline).foregroundStyle(.primary).lineLimit(typeSize.isAccessibilitySize ? nil : 2);Spacer(minLength:2);statusBadge;Image(systemName:"chevron.right").font(.caption2).foregroundStyle(.secondary).accessibilityHidden(true)}
            Text(typeTitle+(current["discipline"].string.isEmpty ? "" : current["discipline"].string=="garden" ? " · Garden" : " · Závlaha")+" · "+APIJobsPresentation.appointment(current)).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)
            if !current["address"].string.isEmpty{Label(current["address"].string,systemImage:"mappin").font(.caption).foregroundStyle(.secondary).lineLimit(typeSize.isAccessibilitySize ? nil : 1)}
            HStack(spacing:6){crew;Spacer(minLength:0);if timeScope==store.scope,!snapshot.isNull{Text(hours).font(.caption).foregroundStyle(.secondary)};if !current["completionPercent"].isNull{Text(current["completionPercent"].string+" %").font(.caption.weight(.semibold)).foregroundStyle(DiaryStyle.accent)}}
            if !current["completionPercent"].isNull{ProgressView(value:min(100,max(0,current["completionPercent"].double)),total:100).tint(DiaryStyle.accent).accessibilityLabel("Dokončení zakázky").accessibilityValue(current["completionPercent"].string+" procent")}
        }.frame(maxWidth:.infinity,alignment:.leading).contentShape(Rectangle()).accessibilityElement(children:.combine)
    }
    private var typeTitle:String{["installation":"Realizace","service":"Servis","survey":"Zaměření"][current["jobType"].string] ?? "Zakázka"}
    private var hours:String{
        let rows=projected["intervals"].array.filter{store.manager || $0["userId"].string==store.userID}
        let value=rows.filter{$0["kind"].string=="work"}.reduce(Int64(0)){$0+APIWorkTimeLogic.duration($1)}
        return APIWorkTimeLogic.hours(value)+(store.manager ? " celkem" : " moje")
    }
    private var statusBadge:some View{
        let status=current["status"].string
        let color:Color=status=="done" ? .green : status=="on_way" ? .blue : status=="incomplete" ? DiaryStyle.warning : DiaryStyle.accent
        return Text(current["serviceApproval"].string=="pending" ? "Ke schválení" : status=="incomplete" ? "Nelze dokončit" : APIFormat.status(status)).font(.caption2.weight(.semibold)).foregroundStyle(.primary).padding(.horizontal,7).padding(.vertical,4).background(color.opacity(0.12),in:Capsule()).fixedSize(horizontal:false,vertical:true)
    }
    private var crew:some View{
        let names=Dictionary(current["handoffs"].array.map{($0["userId"].string,$0["name"].string)},uniquingKeysWith:{$1})
        let people=APIJobDetailPresentation.crew(job:current,states:projected["states"].array)
        return HStack(spacing:-3){ForEach(Array(people.prefix(3)),id:\.id){person in
            let name=names[person.id] ?? person["name"].string
            Text(name=="Přiřazený pracovník" ? "·" : APIJobDetailPresentation.initials(name)).font(.caption2.weight(.semibold)).foregroundStyle(DiaryStyle.accent).frame(width:24,height:24).background(DiaryStyle.soft,in:Circle()).accessibilityLabel(name)
        };if people.count>3{Text("+\(people.count-3)").font(.caption2).padding(.leading,5)}}
    }
    private var actionRow:some View {
        let layout=typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:4)) : AnyLayout(HStackLayout(spacing:4))
        return layout{
            HStack(spacing:4){if let url=APIFormat.navigation(current["address"].string){Link(destination:url){Image(systemName:"location")}.buttonStyle(APIJobsCompactButtonStyle()).accessibilityLabel("Navigovat")};if let phone=APIJobsPresentation.phone(current){Link(destination:phone){Image(systemName:"phone")}.buttonStyle(APIJobsCompactButtonStyle()).accessibilityLabel("Zavolat zákazníkovi")}}
            Spacer(minLength:0)
            if store.enabled("attendance"),let personal,(mayRecord || personal == .report){Button{performPrimary()}label:{Label(shortTitle(personal),systemImage:personal.symbol).font(.caption.weight(.semibold)).fixedSize(horizontal:false,vertical:true)}.buttonStyle(APIJobsCompactButtonStyle(primary:true)).accessibilityLabel(personal.title).accessibilityIdentifier("job-row-primary-"+job.id)}
            else if !store.enabled("attendance"),mayWork,let legacy=APIJobWorkflow.primary(current,travelEnabled:store.enabled("jobTravel")){Button{if legacy == .departure{departure=true}else{statusRequest=APIJobStatusRequest(targetStatus:legacy.targetStatus)}}label:{Label(legacy.title,systemImage:legacy.symbol).font(.caption.weight(.semibold))}.buttonStyle(APIJobsCompactButtonStyle())}
            Menu{menu}label:{Image(systemName:"ellipsis")}.buttonStyle(APIJobsCompactButtonStyle()).accessibilityLabel("Další akce zakázky").accessibilityIdentifier("job-row-menu-"+job.id)
        }
    }
    @ViewBuilder private var menu:some View {
        Button("Otevřít detail",systemImage:"arrow.up.right.square"){open(current)}
        if APIResource(entity:.jobs).editable(store),!store.isRolePreview{
            Button("Upravit zakázku",systemImage:"pencil"){edit()}
            Button("Přeplánovat",systemImage:"calendar"){edit()}
        }
        if store.enabled("attendance"),mayRecord,let personal{Button(personal.title,systemImage:personal.symbol){performPrimary()}}
        if store.enabled("attendance"),mayRecord,personal == .stop{Button("Přerušit práci",systemImage:"pause"){work=APIWorkTimeAction(kind:"break")}}
        Button("Zobrazit protokol",systemImage:"doc.text"){report=true}
        if mayWork{Button("Změnit stav zakázky",systemImage:"checkmark.circle"){statusRequest=APIJobStatusRequest(targetStatus:nil)}}
        if store.manager,current["serviceApproval"].string=="pending"{Button("Schválení zakázky",systemImage:"checkmark.seal"){open(current)}}
        // Destructive record management remains in the existing confirmed detail flow.
        if store.manager,!store.isRolePreview{Button("Správa záznamu",systemImage:"gearshape"){open(current)}}
    }
    private func shortTitle(_ action:APIJobDetailAction)->String{switch action{case .travel:return "Vyrazit";case .arrive:return "Jsem na místě";case .stop:return "Ukončit práci";case .resume:return "Pokračovat";case .report:return "Protokol"}}
    private func performPrimary(){guard let personal else{return};if let kind=personal.timeKind{work=APIWorkTimeAction(kind:kind)}else{report=true}}
    private func edit(){store.route=APIRoute(resource:APIResource(entity:.jobs),value:current)}
    private func loadTime()async{
        guard store.enabled("attendance") else{return};let scope=store.scope,key="/api/jobs/"+job.id+"/time"
        if let cached=store.vault?.state.cache[key],cached["projection"].string != "dashboard"{snapshot=cached;timeScope=scope;let version=cached["states"].array.first{$0["userId"].string==store.userID}?["version"].int ?? 0;if Date().timeIntervalSince1970*1000-cached["serverNow"].double<60000 && cached["job"]["version"].int>=current["version"].int && version>=current["myTime"]["version"].int{return}}
        do{try await Task.sleep(for:.milliseconds(250));let value=try await store.get(key);guard !Task.isCancelled,scope==store.scope else{return};snapshot=value;timeScope=scope;timeProblem=nil}catch is CancellationError{}catch{guard scope==store.scope else{return};if let e=error as? APIError,[401,403,404].contains(e.status){snapshot = .null;timeScope=""};timeProblem=error.localizedDescription}
    }
    private func loadContact()async{
        guard store.enabled("customers"),!current["customerId"].string.isEmpty,current["customerContact"]["phones"].isNull else{return}
        let scope=store.scope
        do{let value=try await store.get("/api/customers/"+current["customerId"].string);guard scope==store.scope,!Task.isCancelled else{return};contact=value["customer"];contactScope=scope}catch{guard scope==store.scope else{return};contact = .null;contactScope=""}
    }
}

// Load a fresh, authorized snapshot only when opening an action. The original
// editor keeps version conflicts, offline writes, switch confirmation and SMS.
struct APIJobRowWorkSheet:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    let kind:String
    @State private var snapshot:APIValue = .null
    @State private var problem:String?
    @State private var retry=UUID()
    @Environment(\.dismiss) private var dismiss
    var body:some View {
        Group {
            if !snapshot.isNull {
                APIWorkTimeActionEditor(store:store,job:store.currentJob(job),snapshot:snapshot,kind:kind,selected:[store.userID])
            }else{loadingView}
        }.task(id:store.scope+retry.uuidString){await load()}
    }
    private var loadingView:some View {
        NavigationStack {
            VStack(spacing:16){
                if let problem{Text(problem);Button("Zkusit znovu"){retry=UUID()}}
                else{ProgressView("Načítám pracovní stav…")}
            }.padding().navigationTitle("Pracovní akce")
                .toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}}}
        }
    }
    private func load()async {
        let scope=store.scope
        do {
            let value=try await store.get("/api/jobs/"+job.id+"/time",refresh:true)
            guard scope==store.scope,!Task.isCancelled else{return}
            guard value["canWrite"].bool,!store.isRolePreview,value["states"].array.contains(where:{$0["userId"].string==store.userID && $0["assigned"].bool}) else{throw APIError.local("K této pracovní akci nemáte oprávnění.")}
            snapshot=value;problem=nil
        }catch{guard scope==store.scope,!Task.isCancelled else{return};problem=error.localizedDescription}
    }
}
struct APIUpcomingVisits:View {
    @ObservedObject var store:APIStore
    var mine:Bool
    @State private var jobs:[APIValue]=[]
    var body:some View{Group{if !jobs.isEmpty{Text("Nejbližší naplánované návštěvy").font(.headline);ForEach(jobs,id:\.id){job in NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)}label:{APIRecordRow(entity:.jobs,value:job)}}}}.task(id:store.scope+String(mine)+store.revision.uuidString){do{let suffix=mine || !store.manager ? "&assignee="+store.userID : "";let result=try await store.get("/api/jobs?state=active&order=schedule&after="+store.today+suffix);jobs=Array(result["jobs"].array.filter{!["done","incomplete"].contains($0["status"].string)}.prefix(3))}catch{jobs=[]}}}
}
