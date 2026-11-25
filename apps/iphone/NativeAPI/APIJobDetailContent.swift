import SwiftUI

// Reuses the existing destinations, editors and APIStore cache/outbox.
struct APIJobDetailContent:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    let timeSnapshot:APIValue
    let timeProblem:String?
    let defects:[APIValue]
    let defectProblem:String?
    let retryTime:()->Void
    let remove:()->Void
    @Binding var action:APIDomainAction?
    @State private var handoff:APIValue = .null
    @State private var handoffProblem:String?
    @State private var report=false
    private var assigned:Bool{job["assignedTos"].array.map(\.string).contains(store.userID)||job["assignedTo"].string==store.userID}
    private var projected:APIValue{APIWorkTimeLogic.project(timeSnapshot,store:store)}
    private var mayMaterial:Bool{job["jobType"].string=="installation" && (assigned || store.manager) && store.writer}
    var body:some View {
        VStack(alignment:.leading,spacing:16){
            APIJobCompactHeader(job:job,states:projected["states"].array)
            APIJobScheduleSection(job:job)
            quickActions
            APIJobCompletionCard(store:store,job:job)
            if store.enabled("attendance") {
                APIJobTimeOverview(store:store,job:job,snapshot:projected,problem:timeProblem,retry:retryTime)
            }
            realizationGroup
            documentationGroup
            if job["jobType"].string != "installation" { informationGroup }
        }
        .sheet(isPresented:$report){APIProtocolEditor(store:store,jobID:job.id)}
        .task(id:store.scope+job.id+store.revision.uuidString){await loadHandoffs()}
    }
    private var quickActions:some View {
        HStack(alignment:.top,spacing:8){
            if let phone=job["customerContact"]["phones"].array.first?["number"].string,
               !phone.filter({"0123456789".contains($0)}).isEmpty,
               let url=URL(string:"tel:"+phone.filter{"+0123456789".contains($0)}) {
                Link(destination:url){APIJobQuickLabel(title:"Zavolat",symbol:"phone")}.diaryBubble().accessibilityLabel("Zavolat zákazníkovi")
            } else {
                APIJobQuickLabel(title:"Bez telefonu",symbol:"phone.down").foregroundStyle(.secondary).accessibilityLabel("Telefon zákazníka není vyplněný")
            }
            if let url=APIFormat.navigation(job["address"].string){
                Link(destination:url){APIJobQuickLabel(title:"Navigovat",symbol:"location")}.diaryBubble()
            }
            if store.enabled("drivePhotos") && job["jobType"].string != "installation" {
                NavigationLink{photos}label:{APIJobQuickLabel(title:"Fotky",symbol:"camera")}.diaryBubble().accessibilityLabel("Fotodokumentace").accessibilityIdentifier("job-quick-photos")
            }
        }
    }
    private var realizationGroup:some View {
        APIJobGroup(title: job["jobType"].string=="installation" ? "Práce" : "Práce") {
            if job["jobType"].string=="installation" {
                NavigationLink{APIJobDiary(store:store,job:job).toolbar(.hidden,for:.tabBar)}label:{APIJobSettingsRow(title:"Deník realizace",symbol:"book.closed")}.accessibilityLabel("Deník realizace")
            }
            if store.enabled("attendance") {
                NavigationLink{workTime}label:{APIJobSettingsRow(title:"Pracovní doba",symbol:"clock")}.accessibilityLabel("Pracovní doba")
            }
            if mayMaterial {
                NavigationLink{material}label:{APIJobSettingsRow(title:"Připravenost materiálu",symbol:"shippingbox",detail:materialStatus)}
            }
            NavigationLink{notes}label:{APIJobSettingsRow(title:"Zadání a poznámky",symbol:"text.alignleft")}
            if store.enabled("jobHandoffs") {
                NavigationLink{handoffs}label:{APIJobSettingsRow(title:"Předání kolegům",symbol:"person.2",detail:handoff["handoffs"].isNull ? nil : "Počet: \(handoff["handoffs"].array.count)")}
            }
            if job["jobType"].string=="installation" {
                NavigationLink{customer}label:{APIJobSettingsRow(title:"Údaje zákazníka",symbol:"person.crop.rectangle",detail:job["customerName"].string)}
                NavigationLink{APIJobSupplementary(job:job)}label:{APIJobSettingsRow(title:"Doplňující údaje",symbol:"info.circle")}
                if store.manager && !store.isRolePreview {
                    NavigationLink{APIJobRecordManagement(remove:remove)}label:{APIJobSettingsRow(title:"Správa záznamu",symbol:"gearshape")}
                }
            }
        }
    }
    private var documentationGroup:some View {
        APIJobGroup(title:"Dokumentace") {
            if store.enabled("drivePhotos") && job["jobType"].string != "installation" {
                NavigationLink{photos}label:{APIJobSettingsRow(title:"Fotodokumentace",symbol:"photo.on.rectangle")}
            }
            if store.enabled("defects"),!job["gardenId"].string.isEmpty {
                NavigationLink{defectList}label:{APIJobSettingsRow(title:"Závady",symbol:"exclamationmark.triangle",detail:defectProblem==nil ? "Počet otevřených: \(defects.count)" : "Nelze ověřit")}
            }
            if !job["gardenId"].string.isEmpty {
                NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.gardens),initial:.object(["id":job["gardenId"],"name":job["gardenName"]])).toolbar(.hidden,for:.tabBar)}label:{APIJobSettingsRow(title:"Historie zahrady",symbol:"leaf")}
            }
            Button{report=true}label:{APIJobSettingsRow(title:"Protokol zakázky",symbol:"doc.text",detail:APIFormat.protocolState(job["protocolStatus"].string))}
        }
    }
    private var informationGroup:some View {
        APIJobGroup(title:"Informace") {
            NavigationLink{customer}label:{APIJobSettingsRow(title:"Údaje zákazníka",symbol:"person.crop.rectangle",detail:job["customerName"].string)}
            NavigationLink{APIJobSupplementary(job:job)}label:{APIJobSettingsRow(title:"Doplňující údaje",symbol:"info.circle")}
            if store.manager && !store.isRolePreview {
                NavigationLink{APIJobRecordManagement(remove:remove)}label:{APIJobSettingsRow(title:"Správa záznamu",symbol:"gearshape")}
            }
        }
    }
    private var workTime:some View{APIJobTimeView(store:store,job:job).toolbar(.hidden,for:.tabBar)}
    private var photos:some View {
        ScrollView{APIFilesView(store:store,path:"/api/jobs/"+job.id+"/photos",mode:.job,record:job).padding(16)}
            .background(DiaryStyle.background).navigationTitle("Fotodokumentace").toolbar(.hidden,for:.tabBar)
    }
    private var materialStatus:String {
        ["unchecked":"Nezkontrolováno","checked":"Zkontrolován","ready":"Připraven","missing":"Chybí materiál"][job["materialStatus"].string] ?? "Nezkontrolováno"
    }
    private var material:some View {
        List {
            Section("Stav materiálu") {
                Text(materialStatus)
                if !job["materialNote"].string.isEmpty{Text(job["materialNote"].string)}
                Button("Aktualizovat připravenost"){
                    action=APIDomainAction(title:"Připravenost materiálu",path:"/api/jobs/"+job.id+"/service",method:"PUT",fields:[.choice("materialStatus","Stav materiálu","unchecked:Nezkontrolováno|checked:Materiál zkontrolován|ready:Materiál připraven|missing:Chybějící materiál"),.field("materialNote","Poznámka nebo chybějící materiál",.notes)],value:.object(["version":job["version"],"operationId":.s(UUID().uuidString),"materialStatus":job["materialStatus"],"materialNote":job["materialNote"]]))
                }
            }
        }.navigationTitle("Připravenost materiálu").toolbar(.hidden,for:.tabBar)
    }
    private var notes:some View {
        List {
            Section("Zadání práce"){Text(job["description"].string.isEmpty ? "Zadání není vyplněné." : job["description"].string).textSelection(.enabled)}
            Section("Poznámky k zahradě"){Text(job["gardenNotes"].string.isEmpty ? "Bez poznámek." : job["gardenNotes"].string).textSelection(.enabled)}
        }.navigationTitle("Zadání a poznámky").toolbar(.hidden,for:.tabBar)
    }
    private var customer:some View {
        List {
            Section("Kontakt") {
                Text(job["customerName"].string.isEmpty ? "Zákazník neuveden" : job["customerName"].string)
                ForEach(Array(job["customerContact"]["phones"].array.enumerated()),id:\.offset){_,phone in
                    if let url=URL(string:"tel:"+phone["number"].string.filter{"+0123456789".contains($0)}){Link(phone["number"].string,destination:url)}
                }
            }
            if store.enabled("customers"),!job["customerId"].string.isEmpty {
                NavigationLink("Karta zákazníka"){APIEntityDetail(store:store,resource:APIResource(entity:.customers),initial:job["customerContact"].merged(["id":job["customerId"],"name":job["customerName"]])).toolbar(.hidden,for:.tabBar)}
            }
        }.navigationTitle("Údaje zákazníka").toolbar(.hidden,for:.tabBar)
    }
    private var defectList:some View {
        List {
            if let defectProblem{Section{Text(defectProblem).foregroundStyle(DiaryStyle.warning)}}
            if defects.isEmpty && defectProblem==nil {Text("Žádné otevřené závady.")}
            ForEach(defects,id:\.id){defect in NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.defects),initial:defect).toolbar(.hidden,for:.tabBar)}label:{APIDefectBadge(defect:defect)}}
            if store.writer && !store.isRolePreview {
                Button("Přidat závadu"){
                    let r=APIResource(entity:.defects,seed:.object(["gardenId":job["gardenId"],"sourceJobId":.s(job.id),"discipline":job["discipline"]]));store.route=APIRoute(resource:r,value:r.initial(store),isNew:true)
                }
            }
            NavigationLink("Všechny závady zahrady"){APIResourceList(store:store,resource:APIResource(entity:.defects,seed:.object(["gardenId":job["gardenId"]]))).toolbar(.hidden,for:.tabBar)}
        }.navigationTitle("Závady").toolbar(.hidden,for:.tabBar)
    }
    private var handoffs:some View {
        List {
            if let handoffProblem{Text(handoffProblem).foregroundStyle(DiaryStyle.warning);Button("Zkusit znovu"){Task{await loadHandoffs()}}}
            if handoff.isNull && handoffProblem==nil{ProgressView("Načítání předání")}
            ForEach(Array(handoff["handoffs"].array.enumerated()),id:\.offset){_,h in VStack(alignment:.leading){Text(h["name"].string+" · "+APIFormat.status(h["status"].string));if !h["note"].string.isEmpty{Text(h["note"].string).font(.footnote)}}}
            if assigned,!store.isRolePreview,let own=handoff["handoffs"].array.first(where:{$0["userId"].string==store.userID}) {
                Button("Převzít zakázku"){action=makeHandoff(own,status:"accepted")}
                Button("Potřebuje upřesnit"){action=makeHandoff(own,status:"clarification")}
            }
        }.navigationTitle("Předání kolegům").toolbar(.hidden,for:.tabBar)
    }
    private func loadHandoffs()async {
        guard store.enabled("jobHandoffs") else{return};let scope=store.scope
        do{let result=try await store.get("/api/jobs/"+job.id+"/handoffs");guard !Task.isCancelled,scope==store.scope else{return};handoff=result;handoffProblem=nil}
        catch{guard !Task.isCancelled,scope==store.scope else{return};handoffProblem=error.localizedDescription;handoff = .null}
    }
    func makeHandoff(_ own:APIValue,status:String)->APIDomainAction{APIDomainAction(title:status=="accepted" ? "Převzít zakázku" : "Upřesnění zadání",path:"/api/jobs/"+job.id+"/handoffs",fields:status=="clarification" ? [.field("note","Co je potřeba upřesnit",.notes,true)] : [],value:.object(["operationId":.s(UUID().uuidString),"jobVersion":handoff["jobVersion"],"revision":handoff["revision"],"version":own["version"],"status":.s(status),"note":.s("")]))}}

struct APIJobGroup<Content:View>:View {
    let title:String
    @ViewBuilder let content:Content
    var body:some View {
        VStack(alignment:.leading,spacing:7){
            Text(title.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(.secondary).padding(.horizontal,12)
            VStack(spacing:0){content}.buttonStyle(.plain).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:20))
        }
    }
}
struct APIJobSettingsRow:View {
    let title:String
    let symbol:String
    var detail:String?=nil
    var body:some View {
        HStack(spacing:12){
            Image(systemName:symbol).font(.body.weight(.medium)).foregroundStyle(DiaryStyle.accent).frame(width:30,height:30).background(DiaryStyle.soft,in:RoundedRectangle(cornerRadius:9)).accessibilityHidden(true)
            VStack(alignment:.leading,spacing:2){Text(title).font(.body);if let detail,!detail.isEmpty{Text(detail).font(.caption).foregroundStyle(.secondary)}}
            Spacer(minLength:4)
            Image(systemName:"chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary).accessibilityHidden(true)
        }.padding(.horizontal,14).padding(.vertical,10).frame(minHeight:52).contentShape(Rectangle()).accessibilityElement(children:.combine)
            .overlay(alignment:.bottom){Rectangle().fill(Color(.separator)).frame(height:0.5).padding(.leading,56)}
    }
}
struct APIJobQuickLabel:View {
    let title:String
    let symbol:String
    var body:some View{VStack(spacing:6){Image(systemName:symbol).font(.title3);Text(title).font(.caption.weight(.semibold)).fixedSize(horizontal:false,vertical:true)}.frame(maxWidth:.infinity,minHeight:48).multilineTextAlignment(.center)}
}
struct APIJobSupplementary:View {
    let job:APIValue
    var body:some View {
        List {
            LabeledContent("ID",value:job.id).textSelection(.enabled)
            LabeledContent("Verze",value:job["version"].string)
            if !job["estimatedMinutes"].isNull{LabeledContent("Plánovaná doba",value:APIDuration.label(job["estimatedMinutes"].int))}
            if !job["startTime"].string.isEmpty{LabeledContent("Původní čas",value:job["startTime"].string+"–"+job["endTime"].string);if job["legacyTimeMeaning"].string=="unknown"{Text("Význam původního času je k upřesnění.")}}
            if !job["incompleteReason"].string.isEmpty{LabeledContent("Důvod nedokončení",value:job["incompleteReason"].string)}
        }.navigationTitle("Doplňující údaje").toolbar(.hidden,for:.tabBar)
    }
}
struct APIJobRecordManagement:View {
    let remove:()->Void
    var body:some View {
        List{Section{Button("Smazat zakázku",role:.destructive,action:remove)}footer:{Text("Zakázka zmizí všem přiřazeným kolegům. Fotografie na Google Disku zůstanou.")}}
            .navigationTitle("Správa záznamu").toolbar(.hidden,for:.tabBar)
    }
}
