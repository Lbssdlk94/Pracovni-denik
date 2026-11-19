import SwiftUI

enum APIRolePreview {
    static func targets(_ actualRole:String)->[String]{["owner":["administrator","admin","worker","reader"],"administrator":["admin","worker","reader"]][actualRole] ?? []}
    static func name(_ role:String)->String{["owner":"Vlastník","administrator":"Administrátor","admin":"Správce","worker":"Pracovník","reader":"Čtenář"][role] ?? role}
}
struct APIRolePreviewPicker:View {
    @ObservedObject var store:APIStore
    var body:some View{Menu{
        Button("Moje role · "+APIRolePreview.name(store.actualRole)){select(nil)}
        ForEach(store.previewTargets,id:\.self){role in Button(APIRolePreview.name(role)){select(role)}}
    }label:{Label(store.previewRole.map{"Náhled: "+APIRolePreview.name($0)} ?? "Zobrazit jako",systemImage:"eye").labelStyle(.iconOnly).frame(minWidth:44,minHeight:44)}.accessibilityIdentifier("role-preview-picker")}
    func select(_ role:String?){do{try store.setRolePreview(role)}catch{store.error=error.localizedDescription}}
}
struct APIRolePreviewBanner:View {
    @ObservedObject var store:APIStore
    var body:some View{if let role=store.previewRole{VStack(alignment:.leading,spacing:6){Label("Náhled: "+APIRolePreview.name(role),systemImage:"eye").font(.subheadline.bold());Text("Vaše data · náhled bez ukládání změn").font(.caption);Button("Zpět k mojí roli"){do{try store.setRolePreview(nil)}catch{store.error=error.localizedDescription}}.frame(minHeight:44)}.frame(maxWidth:.infinity,alignment:.leading).padding(.horizontal,16).background(DiaryStyle.soft)}}
}
