import SwiftUI

struct APIProtocolSignatureScreen:View {
    let customer:String
    let initial:APIValue
    let completed:(APIValue,String)->Void
    @Environment(\.dismiss) private var dismiss
    @State private var name=""
    @State private var encoded=""
    @State private var status="signed"
    var body:some View{NavigationStack{GeometryReader{geometry in ScrollView{VStack(alignment:.leading,spacing:14){TextField("Jméno zákazníka",text:$name).textFieldStyle(.roundedBorder).accessibilityIdentifier("protocol-signature-name");Text("Potvrzuji převzetí uvedených provedených prací. Podpis se vztahuje k aktuálnímu obsahu protokolu.").font(.subheadline);Picker("Způsob potvrzení",selection:$status){Text("Podepsat").tag("signed");Text("Zákazník nebyl přítomen").tag("absent");Text("Podpis odmítl").tag("refused")}.pickerStyle(.menu)
        if status=="signed"{APISignature(encoded:$encoded,height:max(220,geometry.size.height-280))}
        else{Label(status=="absent" ? "Zákazník nebyl přítomen" : "Zákazník odmítl podpis",systemImage:"person.crop.circle.badge.questionmark").font(.headline);Text("Podpis se nevytvoří. Pokud jej šablona vyžaduje, protokol bude nadále neúplný.").font(.caption)}
        Button("Potvrdit podpis"){let at=(Date().timeIntervalSince1970*1000).rounded();completed(.object(["status":.s(status),"name":.s(name),"signedAt":.number(at),"at":.number(at)]),status=="signed" ? encoded : "");dismiss()}.diaryBubble(.primary).disabled(name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || status=="signed" && encoded.isEmpty).accessibilityIdentifier("protocol-signature-confirm")
    }.padding(18)}}.navigationTitle("Podpis zákazníka").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}}}.onAppear{name=initial["name"].string.isEmpty ? customer : initial["name"].string}}}
}
