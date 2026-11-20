#if DEBUG
import SwiftUI

@MainActor struct APIJobsPreviewHost:View {
    @StateObject private var store:APIStore
    private let rows:[APIValue]
    let dark:Bool,large:Bool
    init(manager:Bool=true,dark:Bool=false,large:Bool=false,offline:Bool=false,empty:Bool=false){
        self.dark=dark;self.large=large
        var fixture=APIFixtureProtocol.fixtureData()
        fixture["context"]["user"]["role"] = .s(manager ? "owner" : "worker")
        fixture["context"]["workspace"]["role"] = .s(manager ? "owner" : "worker")
        fixture["context"]["permissions"]["manage"] = .bool(manager)
        let model=APIStore(fixture:true);try? model.bind(fixture["context"]);model.online = !offline
        let examples=empty ? [] : APIJobsFixture.examples(fixture["jobs"].array.first ?? .null)
        rows=examples;_store=StateObject(wrappedValue:model)
        APIFixtureProtocol.lock.withLock{for row in examples{APIFixtureProtocol.records["/api/jobs/"+row.id]=row}}
    }
    var body:some View {
        TabView(selection:.constant(1)){
            NavigationStack{APIOverview(store:store)}.tabItem{Label("Přehled",systemImage:"square.grid.2x2")}.tag(0)
            NavigationStack{APIJobsScreen(store:store,previewRows:rows)}.tabItem{Label("Zakázky",systemImage:"list.clipboard")}.tag(1)
        }.tint(DiaryStyle.accent).diaryBubble().preferredColorScheme(dark ? .dark : .light).dynamicTypeSize(large ? .accessibility3 : .large)
            .safeAreaInset(edge:.top){Text("NÁVRH · UKÁZKOVÁ DATA").font(.caption2).foregroundStyle(.secondary)}
    }
}
#Preview("Zakázky · správce"){APIJobsPreviewHost()}
#Preview("Zakázky · pracovník · tma"){APIJobsPreviewHost(manager:false,dark:true)}
#Preview("Zakázky · velké písmo"){APIJobsPreviewHost(large:true)}
#Preview("Zakázky · offline"){APIJobsPreviewHost(offline:true)}
#Preview("Zakázky · prázdné"){APIJobsPreviewHost(empty:true)}

#endif
