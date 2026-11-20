#if DEBUG
import SwiftUI
@MainActor struct APIAttendancePreviewHost:View {
    @StateObject private var store:APIStore
    let team:Bool,dark:Bool,large:Bool
    init(team:Bool=false,dark:Bool=false,large:Bool=false,overnight:Bool=false,before:Bool=false,offline:Bool=false){
        self.team=team;self.dark=dark;self.large=large
        let source=APIFixtureProtocol.fixtureData(),model=APIStore(fixture:true);try? model.bind(source["context"]);model.online = !offline
        let sample=APIAttendanceFixture.example(me:source["context"],before:before,overnight:overnight)
        APIFixtureProtocol.lock.withLock{APIFixtureProtocol.records["fixture-attendance"]=sample}
        _store=StateObject(wrappedValue:model)
    }
    var body:some View{NavigationStack{APIAttendanceView(store:store,initialUser:team ? "all" : store.userID)}.tint(DiaryStyle.accent).diaryBubble().preferredColorScheme(dark ? .dark : .light).dynamicTypeSize(large ? .accessibility2 : .large)}
}
#Preview("Docházka · moje"){APIAttendancePreviewHost()}
#Preview("Docházka · tým · tma"){APIAttendancePreviewHost(team:true,dark:true)}
#Preview("Docházka · před příchodem"){APIAttendancePreviewHost(before:true)}
#Preview("Docházka · neukončená směna"){APIAttendancePreviewHost(overnight:true)}
#Preview("Docházka · velké písmo"){APIAttendancePreviewHost(large:true)}
#Preview("Docházka · offline"){APIAttendancePreviewHost(offline:true)}
#Preview("Docházka · malý iPhone",traits:.fixedLayout(width:320,height:640)){APIAttendancePreviewHost()}
#endif
