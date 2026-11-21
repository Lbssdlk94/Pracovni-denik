import SwiftUI

struct APISessionsView:View {
    @ObservedObject var store:APIStore
    @State private var sessions:[APIValue]=[]
    @State private var all=false
    @State private var selected:APIValue = .null
    @State private var confirm=false
    @State private var problem:String?
    var body:some View{List{if store.manager{Toggle("Zařízení celého týmu",isOn:$all)};ForEach(sessions,id:\.id){session in DisclosureGroup(session["name"].string+(session["current"].bool ? " · tento iPhone" : "")){Text(session["agent"].string).font(.caption);Text("Přihlášení: "+APIFormat.date(session["createdAt"]));Text("Platnost: "+APIFormat.date(session["expiresAt"]));Button("Odhlásit zařízení",role:.destructive){selected=session;confirm=true}.disabled(session["current"].bool && !store.outbox.isEmpty)}};if let problem{Text(problem)}}.secondaryChrome().navigationTitle("Přihlášená zařízení").task(id:String(all)){await load()}.confirmationDialog("Odhlásit vybrané zařízení?",isPresented:$confirm,titleVisibility:.visible){Button("Odhlásit zařízení",role:.destructive){Task{do{_ = try await store.write("/api/access-sessions/"+selected.id,method:"DELETE",body:.object([:]));if selected["current"].bool{try store.transport.forgetCredential();store.lock()}else{await load()}}catch{problem=error.localizedDescription}}};Button("Zrušit",role:.cancel){}}}
    func load()async{do{sessions=(try await store.get("/api/access-sessions"+(all && store.manager ? "?userId=all" : "")))["sessions"].array}catch{problem=error.localizedDescription}}
}
struct APIPrivacyView:View {
    @ObservedObject var store:APIStore
    @State private var value:APIValue = .null
    @State private var days=""
    @State private var confirm=false
    @State private var problem:String?
    var body:some View{Form{Text("Toto nastavení odstraňuje pouze starší GPS souřadnice. Docházka a schválené opravy zůstanou zachované.").font(.footnote);TextField("Počet dní (prázdné = bez automatického mazání)",text:$days).keyboardType(.numberPad);Button("Uložit dobu uchování"){confirm=true};if let problem{Text(problem)}}.secondaryChrome().navigationTitle("Uchování GPS").task{do{value=try await store.get("/api/privacy/policy");days=value["policy"]["gpsDays"].string}catch{problem=error.localizedDescription}}.confirmationDialog("Potvrdit dobu uchování GPS?",isPresented:$confirm,titleVisibility:.visible){Button("Uložit"){Task{do{let count:Int?=days.isEmpty ? nil : Int(days);guard days.isEmpty || count != nil && (30...3650).contains(count!)else{throw APIError.local("Vyberte 30 až 3650 dní.")};value=try await store.write("/api/privacy/policy",method:"PUT",body:.object(["version":value["version"],"gpsDays":count.map{.n($0)} ?? .null,"confirm":.s("ULOZIT")]));problem="Uloženo."}catch{problem=error.localizedDescription}}};Button("Zrušit",role:.cancel){}}}
}
struct APIProtocolPhotoPicker:View {
    @ObservedObject var store:APIStore
    let jobID:String
    @Binding var photos:APIValue
    @State private var rows:[APIValue]=[]
    @State private var problem:String?
    var body:some View{DisclosureGroup("Fotografie ze zdrojové zakázky"){ForEach(rows,id:\.id){photo in Toggle(photo["name"].string.isEmpty ? "Fotografie" : photo["name"].string,isOn:Binding(get:{photos.array.contains{$0.id==photo.id && $0["jobId"].string==jobID}},set:{on in var values=photos.array;values.removeAll{$0.id==photo.id && $0["jobId"].string==jobID};if on{values.append(.object(["id":.s(photo.id),"jobId":.s(jobID)]))};photos = .array(values)}))};if rows.isEmpty{Text("Ve zdrojové zakázce nejsou dostupné fotografie.").font(.footnote)};if let problem{Text(problem).font(.footnote)}}.task(id:jobID){guard !jobID.isEmpty else{return};do{let service=try await store.get("/api/jobs/"+jobID+"/service");rows=service["photos"].array;if store.enabled("googleDrive") && store.enabled("drivePhotos"){let drive=try await store.get("/api/jobs/"+jobID+"/photos");rows+=drive["photos"].array.filter{p in !rows.contains{$0.id==p.id}}}}catch{problem=error.localizedDescription}}}
}
