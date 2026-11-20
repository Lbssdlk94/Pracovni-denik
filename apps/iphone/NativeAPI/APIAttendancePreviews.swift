#if DEBUG
import SwiftUI
@MainActor struct APIAttendancePreviewHost:View {
    @StateObject private var store:APIStore
    let team:Bool,dark:Bool,large:Bool
    init(team:Bool=false,manager:Bool=false,dark:Bool=false,large:Bool=false,overnight:Bool=false,before:Bool=false,offline:Bool=false,empty:Bool=false){
        self.team=team;self.dark=dark;self.large=large
        var source=APIFixtureProtocol.fixtureData();if !team && !manager{source["context"]["user"]["role"] = .s("worker");source["context"]["permissions"]["manage"] = .bool(false);source["context"]["workspace"]["role"] = .s("worker")};let model=APIStore(fixture:true);try? model.bind(source["context"]);model.online = !offline
        var sample=APIAttendanceFixture.example(me:source["context"],before:before,overnight:overnight)
        if empty{sample["shifts"] = .array([]);sample["activeShift"] = .null;sample["detail"]["shifts"] = .array([]);sample["detail"]["intervals"] = .array([]);sample["detail"]["ownToday"] = .null}
        APIFixtureProtocol.lock.withLock{APIFixtureProtocol.records["fixture-attendance"]=sample}
        _store=StateObject(wrappedValue:model)
    }
    var body:some View{NavigationStack{APIAttendanceView(store:store,initialUser:team ? "all" : store.userID)}.tint(DiaryStyle.accent).diaryBubble().preferredColorScheme(dark ? .dark : .light).dynamicTypeSize(large ? .accessibility2 : .large)}
}
#Preview("Docházka · pracovník"){APIAttendancePreviewHost()}
#Preview("Docházka · tým · tma"){APIAttendancePreviewHost(team:true,dark:true)}
#Preview("Docházka · před příchodem"){APIAttendancePreviewHost(before:true)}
#Preview("Docházka · neukončená směna"){APIAttendancePreviewHost(overnight:true)}
#Preview("Docházka · velké písmo"){APIAttendancePreviewHost(large:true)}
#Preview("Docházka · offline"){APIAttendancePreviewHost(offline:true)}
#Preview("Docházka · malý iPhone",traits:.fixedLayout(width:320,height:640)){APIAttendancePreviewHost()}
#Preview("Docházka · prázdná"){APIAttendancePreviewHost(empty:true)}
#Preview("Docházka · správce · vlastní"){APIAttendancePreviewHost(manager:true)}
#endif
