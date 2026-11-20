import SwiftUI

struct APIProtocolTemplateSelection:Identifiable{let value:APIValue;var id:String{value.id}}
struct APIProtocolTemplateManager:View {
    @ObservedObject var store:APIStore
    @State private var data:APIValue = .null
    @State private var selection:APIProtocolTemplateSelection?
    @State private var problem:String?
    @Environment(\.dismiss) private var dismiss
    var body:some View{NavigationStack{List{if data.isNull{ProgressView("Načítám šablony…")}else{ForEach(data["templates"].array,id:\.id){t in Button{selection=APIProtocolTemplateSelection(value:t)}label:{VStack(alignment:.leading){Text(t.title);Text((t["active"].bool ? "Aktivní" : "Deaktivovaná")+" · \(t["activities"].array.count) činností").font(.caption).foregroundStyle(.secondary)}}.accessibilityIdentifier("protocol-template-"+t.id)};Button("Přidat vlastní šablonu",systemImage:"plus"){selection=APIProtocolTemplateSelection(value:APIProtocolLogic.fallback.merged(["id":.s(UUID().uuidString),"name":.s("Vlastní protokol"),"discipline":.s("both"),"jobTypes":.array([.s("service"),.s("installation"),.s("survey")]),"active":.bool(true)]))};Text("Změny šablon nemění historicky uložené protokoly. Deaktivovaná činnost není nabízena pro nový výběr.").font(.caption)};if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}}.navigationTitle("Šablony protokolů").toolbar{ToolbarItem(placement:.cancellationAction){Button("Hotovo"){dismiss()}}}.task{do{data=try await store.get("/api/protocol-templates")}catch{problem=error.localizedDescription}}.sheet(item:$selection){selected in APIProtocolTemplateEditor(initial:selected.value){template in var rows=data["templates"].array;rows.removeAll{$0.id==template.id};rows.append(template);data=try await store.write("/api/protocol-templates",method:"PUT",body:.object(["version":data["version"],"templates":.array(rows)]))}}}}
}
struct APIProtocolTemplateEditor:View {
    let initial:APIValue,save:(APIValue)async throws->Void
    @State private var value:APIValue = .null
    @State private var busy=false
    @State private var problem:String?
    @Environment(\.dismiss) private var dismiss
    private func text(_ key:String)->Binding<String>{Binding(get:{value[key].string},set:{value[key] = .s($0)})}
    private func toggle(_ key:String)->Binding<Bool>{Binding(get:{value[key].bool},set:{value[key] = .bool($0)})}
    private func contains(_ key:String,_ id:String)->Binding<Bool>{Binding(get:{value[key].array.contains(.s(id))},set:{on in var a=value[key].array;a.removeAll{$0 == .s(id)};if on{a.append(.s(id))};value[key] = .array(a)})}
    var body:some View{NavigationStack{Form{Section("Šablona"){TextField("Název",text:text("name"));Toggle("Aktivní",isOn:toggle("active"));Picker("Kategorie",selection:text("discipline")){Text("Závlaha").tag("irrigation");Text("Garden").tag("garden");Text("Obojí").tag("both")};ForEach([("service","Servis"),("installation","Realizace"),("survey","Zaměření")],id:\.0){id,title in Toggle(title,isOn:contains("jobTypes",id))}}
        Section("Dostupné sekce a povinné údaje"){ForEach(APIProtocolLogic.sections,id:\.0){id,title,_ in VStack(alignment:.leading){Toggle(title,isOn:contains("sections",id));if value["sections"].array.contains(.s(id)),!["time","signature","photos"].contains(id){Toggle("Povinné",isOn:contains("required",id)).font(.caption)}}};Toggle("Vyžadovat podpis",isOn:toggle("signatureRequired"));Toggle("Vyžadovat fotografie",isOn:toggle("photosRequired"));Toggle("Povolit zákaznické poznámky v PDF",isOn:toggle("customerNotes"))}
        Section("Přednastavené činnosti"){ForEach(Array(value["activities"].array.indices),id:\.self){i in VStack{TextField("Název činnosti",text:Binding(get:{value["activities"].array[i]["title"].string},set:{text in var rows=value["activities"].array;rows[i]["title"] = .s(text);value["activities"] = .array(rows)}));Toggle("Nabízet při výběru",isOn:Binding(get:{value["activities"].array[i]["active"].bool},set:{on in var rows=value["activities"].array;rows[i]["active"] = .bool(on);value["activities"] = .array(rows)}))}};Button("Přidat činnost",systemImage:"plus"){var a=value["activities"].array;a.append(.object(["id":.s(UUID().uuidString),"title":.s(""),"active":.bool(true)]));value["activities"] = .array(a)}}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.navigationTitle("Upravit šablonu").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zrušit"){dismiss()}.disabled(busy)};ToolbarItem(placement:.confirmationAction){Button("Uložit"){Task{busy=true;defer{busy=false};do{try await save(value);dismiss()}catch{problem=error.localizedDescription}}}.disabled(busy)}}.onAppear{value=initial}}}
}
