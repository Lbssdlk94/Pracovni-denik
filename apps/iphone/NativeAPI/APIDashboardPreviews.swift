#if DEBUG
import SwiftUI

@MainActor
struct APIDashboardPreviewHost:View {
    @StateObject private var store:APIStore
    private let snapshot:APIValue
    let appearance:ColorScheme
    let largeText:Bool
    init(manager:Bool=true,kind:String="work",appearance:ColorScheme = .light,offline:Bool=false,largeText:Bool=false){
        self.appearance=appearance;self.largeText=largeText
        var fixture=APIFixtureProtocol.fixtureData()
        fixture["context"]["user"]["role"] = .s(manager ? "owner" : "worker")
        fixture["context"]["permissions"]["manage"] = .bool(manager)
        let model=APIStore(fixture:true);try? model.bind(fixture["context"])
        var records:[String:APIValue]=[:]
        let now=Date().timeIntervalSince1970*1000,user=model.userID
        if kind != "before" {
            var job=fixture["jobs"].array.first!
            job["jobType"] = .s("installation");job["title"] = .s("Realizace – ukázka");job["status"] = .s("in_progress");job["completionPercent"] = .n(45)
            records["/api/jobs/"+job.id]=job
            let row:APIValue = .object(["id":.s("preview-dashboard-time"),"jobId":.s(job.id),"userId":.s(user),"userName":model.me["user"]["name"],"kind":.s(kind),"startAt":.number(now-1800000),"endAt":.null,"version":.n(1)])
            records["/api/jobs/"+job.id+"/timeSnapshot"] = .object(["job":job,"states":.array([.object(["userId":.s(user),"name":model.me["user"]["name"],"active":row,"assigned":.bool(true),"version":.n(1)])]),"intervals":.array([row]),"canWrite":.bool(true),"canManage":.bool(manager),"canManageCosts":.bool(manager),"serverNow":.number(now)])
        }else{records["fixture-attendance"] = .object(["activeShift":.null,"shifts":.array([])])}
        snapshot = .object(["company":manager ? APIDashboardFixture.dashboard(fixture:fixture,me:model.me,records:records,mode:"company") : .null,"personal":APIDashboardFixture.dashboard(fixture:fixture,me:model.me,records:records,mode:"personal")])
        model.online = !offline
        _store=StateObject(wrappedValue:model)
    }
    var body:some View {
        TabView {
            NavigationStack{APIOverview(store:store,previewData:snapshot)}.tabItem{Label("Přehled",systemImage:"square.grid.2x2")}
            NavigationStack{APIJobsScreen(store:store)}.tabItem{Label("Zakázky",systemImage:"list.clipboard")}
            NavigationStack{APIAttendanceView(store:store)}.tabItem{Label("Docházka",systemImage:"clock")}
            NavigationStack{APIResourceList(store:store,resource:APIResource(entity:.customers))}.tabItem{Label("Zákazníci",systemImage:"person.crop.rectangle")}
            NavigationStack{APIMore(store:store,assistant:.constant(false))}.tabItem{Label("Více",systemImage:"ellipsis")}
        }.tint(DiaryStyle.accent).diaryBubble().preferredColorScheme(appearance).dynamicTypeSize(largeText ? .accessibility3 : .large)
            .safeAreaInset(edge:.top,spacing:0){Text("NÁVRH · UKÁZKOVÁ DATA").font(.caption2).foregroundStyle(.secondary).padding(4)}
    }
}
#Preview("Správce · firma"){APIDashboardPreviewHost()}
#Preview("Správce · tmavý"){APIDashboardPreviewHost(appearance:.dark)}
#Preview("Pracovník · před příchodem"){APIDashboardPreviewHost(manager:false,kind:"before")}
#Preview("Pracovník · na cestě"){APIDashboardPreviewHost(manager:false,kind:"travel")}
#Preview("Pracovník · realizace"){APIDashboardPreviewHost(manager:false,appearance:.dark)}
#Preview("Pracovník · přestávka"){APIDashboardPreviewHost(manager:false,kind:"break")}
#Preview("Offline · velké písmo"){APIDashboardPreviewHost(manager:false,offline:true,largeText:true)}
#endif
