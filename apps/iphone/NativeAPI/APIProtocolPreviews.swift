#if DEBUG
import SwiftUI
@MainActor struct APIProtocolPreviewHost:View {
    @StateObject private var store:APIStore
    let dark:Bool,large:Bool
    init(state:String="draft",dark:Bool=false,large:Bool=false,offline:Bool=false){
        self.dark=dark;self.large=large;APIFixtureProtocol.reset();let source=APIFixtureProtocol.fixtureData();let model=APIStore(fixture:true);try? model.bind(source["context"]);model.online = !offline
        APIFixtureProtocol.records["protocol-redesign-fixture"] = .bool(true)
        if state != "draft"{var r:APIValue = .object(["date":.s(model.today),"work":.s("Kontrola sekcí"),"notes":.s("Interní poznámka"),"photoIds":.array([]),"materialItems":.array([APIFixtureProtocol.material.merged(["itemId":APIFixtureProtocol.material["id"],"itemVersion":.n(1),"quantity":.number(1.5)])]),"version":.n(1),"documentState":.s(state=="confirmed" ? "ready":"draft")]);r["protocolDetails"] = .object(["schema":.n(1),"templateId":.s("service"),"template":APIProtocolFixture.template,"customWork":.s("Kontrola systému"),"activities":.array([]),"photos":.array([]),"signature":.object(["status":.s("missing")])]);APIFixtureProtocol.records["/api/jobs/fixture-progress/report"]=r}
        _store=StateObject(wrappedValue:model)
    }
    var body:some View{APIProtocolEditor(store:store,jobID:"fixture-progress").tint(DiaryStyle.accent).diaryBubble().preferredColorScheme(dark ? .dark:.light).dynamicTypeSize(large ? .accessibility2:.large)}
}
#Preview("Protokol · rozpracovaný"){APIProtocolPreviewHost()}
#Preview("Protokol · vyplněný · tmavý"){APIProtocolPreviewHost(state:"filled",dark:true)}
#Preview("Protokol · potvrzený"){APIProtocolPreviewHost(state:"confirmed")}
#Preview("Protokol · velké písmo"){APIProtocolPreviewHost(large:true)}
#Preview("Protokol · offline"){APIProtocolPreviewHost(offline:true)}
#Preview("Protokol · malý iPhone",traits:.fixedLayout(width:320,height:640)){APIProtocolPreviewHost()}
#endif
