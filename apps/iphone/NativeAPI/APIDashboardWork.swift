import SwiftUI

struct APIDashboardCurrentJob:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    let snapshot:APIValue
    @Environment(\.dynamicTypeSize) private var typeSize
    private var personal:APIValue{snapshot["states"].array.first{$0["userId"].string==store.userID}?["active"] ?? .null}
    var body:some View {
        APIDashboardSection(title:personal["jobId"].string==job.id ? "Aktuální zakázka" : "Nejbližší návštěva"){
            VStack(alignment:.leading,spacing:12){
                NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)}label:{
                    VStack(alignment:.leading,spacing:8){
                        HStack{Text(job.title).font(.title3.weight(.bold));Spacer();Image(systemName:"chevron.right").font(.caption)}
                        if !job["customerName"].string.isEmpty,!job.title.localizedCaseInsensitiveContains(job["customerName"].string){Text(job["customerName"].string).font(.subheadline)}
                        if !job["address"].string.isEmpty{Label(job["address"].string,systemImage:"mappin").font(.subheadline).foregroundStyle(.secondary)}
                        if personal["jobId"].string==job.id{Label(APIJobDetailPresentation.workerStatus(personal["kind"].string),systemImage:personal["kind"].string=="travel" ? "location" : personal["kind"].string=="break" ? "pause.circle" : "play.circle").font(.caption.weight(.semibold)).foregroundStyle(DiaryStyle.accent)}
                        APIJobCompletionSummary(job:job,compact:true)
                    }.contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityIdentifier("dashboard-current-job")
                if snapshot["job"].id==job.id{
                    TimelineView(.periodic(from:.now,by:30)){context in
                        let own=APIJobDetailPresentation.todayWorkers(snapshot:snapshot,jobID:job.id,now:context.date).first{$0["userId"].string==store.userID}
                        if let own{Text("Můj dnešní čas: "+APIWorkTimeLogic.hours(Int64(own["workMs"].double))).font(.caption).foregroundStyle(.secondary)}
                    }
                }
                APIJobAvatarStack(people:APIJobDetailPresentation.crew(job:job,states:snapshot["states"].array))
                Divider()
                quickActions
                if snapshot["job"].id==job.id{APIJobActionBar(store:store,job:job,snapshot:snapshot,showPause:true,includeProtocol:false)}
            }.padding(14).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:22))
        }
    }
    private var quickActions:some View {
        let layout=typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:8)) : AnyLayout(HStackLayout(spacing:8))
        return layout {
            if let phone=job["customerContact"]["phones"].array.first?["number"].string,!phone.isEmpty,let url=URL(string:"tel:"+phone.filter{"+0123456789".contains($0)}){Link(destination:url){Image(systemName:"phone")}.diaryBubble(.icon).accessibilityLabel("Zavolat zákazníkovi")}
            if let url=APIFormat.navigation(job["address"].string){Link(destination:url){Image(systemName:"location")}.diaryBubble(.icon).accessibilityLabel("Navigovat")}
            if store.enabled("drivePhotos"){
                NavigationLink{ScrollView{APIFilesView(store:store,path:"/api/jobs/"+job.id+"/photos",mode:.job,record:job).padding(16)}.navigationTitle("Fotodokumentace")}label:{Image(systemName:"camera")}.diaryBubble(.icon).accessibilityLabel(store.writer ? "Přidat fotografii" : "Fotodokumentace")
            }
            Spacer(minLength:0)
            NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)}label:{Label("Otevřít",systemImage:"chevron.right")}.diaryBubble().accessibilityLabel("Otevřít zakázku")
        }
    }
}
struct APIDashboardAttendanceCard:View {
    @ObservedObject var store:APIStore
    let data:APIValue
    let job:APIValue
    let snapshot:APIValue
    @StateObject private var location=APILocation()
    @State private var operation=UUID().uuidString
    @State private var busy=false
    @State private var problem:String?
    @State private var timeAction:APIWorkTimeAction?
    private var personal:APIValue{snapshot["states"].array.first{$0["userId"].string==store.userID}?["active"] ?? .null}
    private var shift:APIValue{data["attendance"]["activeShift"]}
    private var pendingStart:Double?{
        guard shift.isNull else{return nil}
        return store.outbox.filter{$0.path.hasSuffix("/time/actions") && $0.state=="pending"}.compactMap{op -> Double? in
            guard let body=op.body,["work","travel","break"].contains(body["action"].string),body["workers"].array.contains(where:{$0["userId"].string==store.userID}) else{return nil}
            return body["at"].double
        }.min()
    }
    private var pendingArrival:Bool{pendingStart != nil}
    private var canPause:Bool{!shift.isNull && personal["jobId"].string==job.id && ["work","break"].contains(personal["kind"].string) && snapshot["canWrite"].bool && store.writer && !store.isRolePreview}
    var body:some View {
        VStack(alignment:.leading,spacing:12){
            HStack{Label("Moje docházka",systemImage:"clock").font(.subheadline.weight(.semibold));Spacer();Text(pendingArrival ? "Čeká na odeslání" : shift.isNull ? "Mimo práci" : personal["kind"].string=="break" ? "Přestávka" : "Pracuješ").font(.caption.weight(.semibold))}.foregroundStyle(DiaryStyle.accent)
            TimelineView(.periodic(from:.now,by:1)){context in
                let at=Date(timeIntervalSince1970:data["asOf"].double/1000)
                let own=(snapshot["intervals"].array).filter{$0["userId"].string==store.userID}
                let original=data["timeSnapshot"]["intervals"].array.filter{$0["userId"].string==store.userID}
                let currentBreak=APIWorkTimeLogic.summary(APIDashboardLogic.clipped(own,now:context.date),now:context.date)["total"]["breakMs"].double
                let oldBreak=APIWorkTimeLogic.summary(APIDashboardLogic.clipped(original,now:at),now:at)["total"]["breakMs"].double
                let breaks=max(0,data["attendance"]["breakMs"].double-oldBreak+currentBreak)
                let shifts=data["attendance"]["shifts"].array+(pendingStart.map{[APIValue.object(["startAt":.number($0),"endAt":.null])]} ?? [])
                let elapsed=max(0,APIDashboardLogic.elapsed(shifts,now:context.date)-breaks)
                VStack(alignment:.leading,spacing:6){
                    Text(APIDashboardLogic.clock(elapsed)).font(.largeTitle.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.65).foregroundStyle(DiaryStyle.accent).accessibilityLabel("Dnes odpracováno").accessibilityValue(APIWorkTimeLogic.hours(Int64(elapsed)))
                    if !shift.isNull{Text("Příchod v "+APIAttendanceView.time(shift["startAt"])).font(.subheadline).foregroundStyle(.secondary)}
                    if breaks>0{Text("Přestávky: "+APIWorkTimeLogic.hours(Int64(breaks))).font(.caption).foregroundStyle(.secondary)}
                }
            }
            if canPause {
                Button{timeAction=APIWorkTimeAction(kind:personal["kind"].string=="break" ? "work" : "break")}label:{Text(personal["kind"].string=="break" ? "Ukončit přestávku" : "Zahájit přestávku").frame(maxWidth:.infinity)}.diaryBubble(.primary)
            }
            Button{Task{await punch()}}label:{Text(shift.isNull ? "Zahájit pracovní den" : "Ukončit pracovní den").frame(maxWidth:.infinity)}.diaryBubble(canPause ? .secondary : .primary).disabled(busy || pendingArrival || !store.online || store.isRolePreview).accessibilityIdentifier("dashboard-attendance-action")
            if busy{ProgressView("Ukládám docházku…")}
            if !store.online{Text("Příchod a odchod vyžadují připojení. Pracovní intervaly zakázky lze dál ukládat offline.").font(.caption).foregroundStyle(.secondary)}
            if pendingArrival{Text("Zahájení z pracovní akce se potvrdí po synchronizaci. Další příchod nezapisujte.").font(.caption).foregroundStyle(.secondary)}
            if let problem{Text(problem).font(.caption).foregroundStyle(DiaryStyle.warning)}
        }.padding(16).background(DiaryStyle.soft,in:RoundedRectangle(cornerRadius:24))
            .onChange(of:shift["id"].string+"|"+shift["version"].string){_,_ in if !busy{operation=UUID().uuidString}}
            .sheet(item:$timeAction){item in APIWorkTimeActionEditor(store:store,job:job,snapshot:snapshot,kind:item.kind,selected:[store.userID])}
    }
    private func punch()async {
        guard !busy else{return};busy=true;defer{busy=false}
        do{try await APIAttendanceWorkflow.punch(store:store,activeShift:shift,location:location,operationID:operation);operation=UUID().uuidString;problem=nil}catch{problem=error.localizedDescription}
    }
}
