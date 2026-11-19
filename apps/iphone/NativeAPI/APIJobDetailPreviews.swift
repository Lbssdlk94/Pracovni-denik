#if DEBUG
import SwiftUI

// Isolated examples for Xcode Previews and simulator captures only.
// No production API, credentials, database or user data are used.
@MainActor
struct APIJobDetailPreviewHost:View {
    @StateObject private var store:APIStore
    private let job:APIValue
    let appearance:ColorScheme
    private let largeText:Bool
    @State private var path=["detail"]
    init(kind:String="work",appearance:ColorScheme = .light,largeText:Bool=false,offline:Bool=false){
        self.appearance=appearance;self.largeText=largeText
        let fixture=APIFixtureProtocol.fixtureData()
        let model=APIStore(fixture:true)
        try? model.bind(fixture["context"])
        let now=Date().timeIntervalSince1970*1000
        let id="preview-"+kind+(appearance == .dark ? "-dark" : "-light")+(largeText ? "-large" : "-regular")+(offline ? "-offline" : "-online"),owner=model.userID
        let ids=[owner,"preview-marek","preview-petr"],names=["Luboš Sadílek","Marek","Petr"]
        let values=fixture["jobs"].array.first{$0.id=="fixture-progress"} ?? .null
        let job=values.merged(["id":.s(id),"title":.s("Realizace – Pan Petřík"),"customerName":.s("Pan Petřík"),"address":.s("Dřevníky 39, Dřevníky"),"jobType":.s("installation"),"status":.s(kind=="done" ? "done" : kind=="planned" ? "planned" : "in_progress"),"plannedStart":.s("08:00"),"arrivalWindowStart":.s("08:00"),"arrivalWindowEnd":.s("08:10"),"assignedName":.s(names[0]),"assignedTos":.array(ids.map(APIValue.s)),"completionPercent":.n(45),"completionUpdatedName":.s(names[0]),"completionUpdatedAt":.number(now-900000),"materialStatus":.s("ready"),"description":.s("Realizace kapkové závlahy. Dokončit větve u terasy a prověřit těsnost spojů."),"customerContact":.object(["id":.s("customer-1"),"name":.s("Pan Petřík"),"phones":.array([.object(["number":.s("+420000000000")])])])])
        self.job=job
        let hours=[5.5,6.25,3.0]
        var intervals:[APIValue]=[]
        var states:[APIValue]=[]
        for i in 0..<3 {
            let active=i<2 && !["done","planned","stopped"].contains(kind)
            let row:APIValue = .object(["id":.s("preview-interval-\(i)"),"jobId":.s(id),"userId":.s(ids[i]),"userName":.s(names[i]),"kind":.s(i==0 && ["travel","break"].contains(kind) ? kind : "work"),"startAt":.number(now-hours[i]*3600000),"endAt":active ? .null : .number(now),"version":.n(1)])
            intervals.append(row)
            states.append(.object(["userId":.s(ids[i]),"name":.s(names[i]),"assigned":.bool(true),"version":.n(1),"active":active ? row : .null]))
        }
        intervals.append(.object(["id":.s("preview-yesterday"),"jobId":.s(id),"userId":.s(owner),"userName":.s(names[0]),"kind":.s("work"),"startAt":.number(now-86400000-3.25*3600000),"endAt":.number(now-86400000),"version":.n(1)]))
        let snapshot:APIValue = .object(["job":job,"states":.array(states),"intervals":.array(intervals),"canWrite":.bool(true),"canManage":.bool(true),"canManageCosts":.bool(true),"reviews":.array([]),"rates":.array([]),"history":.array([]),"serverNow":.number(now)])
        APIFixtureProtocol.lock.lock()
        APIFixtureProtocol.records["/api/jobs/"+id]=job
        APIFixtureProtocol.records["/api/jobs/"+id+"/timeSnapshot"]=snapshot
        APIFixtureProtocol.lock.unlock()
        model.vault?.state.cache["/api/jobs/"+id] = .object(["job":job])
        model.vault?.state.cache["/api/jobs/"+id+"/time"]=snapshot
        model.online = !offline
        _store=StateObject(wrappedValue:model)
    }
    var body:some View {
        NavigationStack(path:$path){
            Text("Návrh detailu zakázky").navigationDestination(for:String.self){_ in
                APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)
                    .safeAreaInset(edge:.top,spacing:0){Text("NÁVRH · UKÁZKOVÁ DATA").font(.caption2.weight(.semibold)).foregroundStyle(.secondary).frame(maxWidth:.infinity).padding(.vertical,4).background(DiaryStyle.background)}
            }
        }.diaryBubble().preferredColorScheme(appearance).dynamicTypeSize(largeText ? .accessibility3 : .large)
    }
}

#Preview("Detail · světlý"){APIJobDetailPreviewHost()}
#Preview("Detail · tmavý"){APIJobDetailPreviewHost(appearance:.dark)}
#Preview("Na cestě"){APIJobDetailPreviewHost(kind:"travel")}
#Preview("Přerušeno"){APIJobDetailPreviewHost(kind:"break",appearance:.dark)}
#Preview("Dokončeno"){APIJobDetailPreviewHost(kind:"done")}
#Preview("Velký text · offline"){APIJobDetailPreviewHost(largeText:true,offline:true)}
#Preview("Pracovní doba · načítání"){
    APIJobTimeOverview(store:APIStore(fixture:true),job:.null,snapshot:.null,problem:nil,retry:{}).padding().background(DiaryStyle.background)
}
#Preview("Pracovní doba · chyba"){
    APIJobTimeOverview(store:APIStore(fixture:true),job:.null,snapshot:.null,problem:"Připojení není dostupné. Neodeslaná data zůstávají uložená.",retry:{}).padding().background(DiaryStyle.background)
}
#endif
