import SwiftUI

enum APIJobDiaryRules {
    static func requirePhoto(_ value:APIValue)throws {
        guard !value["photoIds"].array.isEmpty else{throw APIError.local("K dennímu zápisu přidejte alespoň jednu fotografii.")}
    }
}

// Native screens use the existing API store, encrypted drafts/outbox and photo picker.
struct APIJobDiary:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    @State private var snapshot:APIValue = .null
    @State private var problem:String?
    @State private var editing:APIValue?
    @State private var editorOpen=false
    @State private var nextCursor=""
    @State private var requestID=UUID()
    @State private var removing:APIValue = .null
    @State private var confirmRemoval=false
    @State private var deleting=false
    @State private var deleteOperation=UUID().uuidString
    var path:String{"/api/jobs/"+job.id+"/diary"}
    var entries:[APIValue]{
        let pending=store.outbox.filter{$0.method=="PUT" && $0.path.hasPrefix(path+"/")}.compactMap{op -> APIValue? in
            guard let body=op.body else{return nil}
            let id=String(op.path.split(separator:"/").last ?? "")
            return body.merged(["id":.s(id),"pending":.bool(true),"syncState":.s(op.state),"authorName":.s(store.me["user"]["name"].string),"canEdit":.bool(false)])
        }
        return APIJobWorkflow.diaryEntries(snapshot["entries"].array,pending:pending)
    }
    var days:[String]{Array(Set(entries.map{$0["date"].string})).sorted(by:>)}
    var body:some View{List{
        Section{
            Text("Denní postup prací. Zápis nemění stav zakázky ani servisní protokol.").font(.footnote).foregroundStyle(.secondary)
            if APIJobWorkflow.canWriteDiary(job,userID:store.userID,role:store.role,preview:store.isRolePreview){Button{editing=nil;editorOpen=true}label:{Label("Přidat dnešní zápis",systemImage:"plus")}.frame(minHeight:48)}
        }
        ForEach(days,id:\.self){day in
            Section(DiaryDate.localized(day)){
                ForEach(entries.filter{$0["date"].string==day},id:\.id){entry in
                    DisclosureGroup{
                        Text(entry["work"].string).textSelection(.enabled)
                        ForEach(["material","notes","nextStep"],id:\.self){key in if !entry[key].string.isEmpty{Text(key=="material" ? "Materiál" : key=="notes" ? "Komplikace a poznámka" : "Další krok").font(.caption.bold());Text(entry[key].string)}}
                        if !entry["photos"].array.isEmpty{APIPhotoGrid(store:store,photos:entry["photos"].array)}
                        if entry["canEdit"].bool && APIJobWorkflow.diaryRole(store.role) && !store.isRolePreview{Button("Upravit zápis"){editing=entry;editorOpen=true}.frame(minHeight:44)}
                        if APIJobWorkflow.canDeleteDiary(entry,role:store.role,preview:store.isRolePreview){Button("Smazat zápis",role:.destructive){removing=entry;deleteOperation=UUID().uuidString;confirmRemoval=true}.frame(minHeight:44).disabled(deleting)}
                        if entry["pending"].bool{Text("Čeká na odeslání · "+entry["syncState"].string).foregroundStyle(DiaryStyle.warning);Text("Případný konflikt vyřešíte ve Více → Synchronizace.").font(.footnote)}
                    }label:{VStack(alignment:.leading,spacing:5){HStack{Text(entry["authorName"].string).font(.headline);Spacer();if !entry["photoIds"].array.isEmpty{Label(String(entry["photoIds"].array.count),systemImage:"camera").font(.caption)}};Text(entry["work"].string).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)}}
                }
            }
        }
        if entries.isEmpty && !snapshot.isNull{Text("Zatím žádný denní zápis.").foregroundStyle(.secondary)}
        if !nextCursor.isEmpty{Button("Starší zápisy"){Task{await load(more:true)}}}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.navigationTitle("Deník realizace").navigationBarTitleDisplayMode(.inline).task(id:store.scope+store.revision.uuidString){await load()}.refreshable{await store.resume();await load()}
        .sheet(isPresented:$editorOpen){APIJobDiaryEditor(store:store,job:job,initial:editing ?? .null)}
        .confirmationDialog("Smazat denní zápis? Fotografie a servisní protokol zůstanou zachované.",isPresented:$confirmRemoval,titleVisibility:.visible){Button("Smazat zápis",role:.destructive){Task{await remove()}};Button("Zrušit",role:.cancel){}}
    }
    func remove()async{
        guard !deleting,APIJobWorkflow.canDeleteDiary(removing,role:store.role,preview:store.isRolePreview) else{return}
        deleting=true;defer{deleting=false}
        do{_ = try await store.write(path+"/"+removing.id,method:"DELETE",body:APIJobWorkflow.diaryDeleteBody(removing,operationID:deleteOperation));snapshot["entries"] = .array(snapshot["entries"].array.filter{$0.id != removing.id});await load()}catch{problem=error.localizedDescription}
    }
    func load(more:Bool=false)async{
        let scope=store.scope,ticket=UUID();requestID=ticket
        do{var c=URLComponents(string:path)!;if more{c.queryItems=[URLQueryItem(name:"cursor",value:nextCursor)]};let result=try await store.get(c.string!);guard scope==store.scope,requestID==ticket else{return};if more{snapshot["entries"] = .array(APIJobWorkflow.diaryEntries(snapshot["entries"].array,pending:result["entries"].array))}else{snapshot=result};nextCursor=result["nextCursor"].string;problem=nil}catch{if scope==store.scope,requestID==ticket{problem=error.localizedDescription}}
    }
}
struct APIJobDiaryEditor:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    let initial:APIValue
    @Environment(\.dismiss) private var dismiss
    @State private var value:APIValue = .null
    @State private var operationID=UUID().uuidString
    @State private var photoUploads:[String]=[]
    @State private var loaded=false
    @State private var saving=false
    @State private var problem:String?
    var key:String{"job-diary:"+job.id+":"+(initial.id.isEmpty ? "new" : initial.id)}
    var fields:[APIField]{[.field("date","Datum práce",.date,true),.field("work","Co se udělalo",.notes,true),.field("material","Použitý materiál (nepovinné)",.notes),.field("notes","Komplikace a poznámka (nepovinné)",.notes),.field("nextStep","Další krok (nepovinné)",.notes)]}
    var photoSelection:Binding<APIValue>{Binding(get:{value["photoIds"]},set:{value["photoIds"]=$0})}
    var body:some View{NavigationStack{Form{
        if loaded{
            APIFieldsView(fields:fields,value:$value)
            Section("Fotografie · povinné"){
                Text("K zápisu přidejte alespoň jednu fotografii.").font(.footnote).foregroundStyle(.secondary)
                APIFilesView(store:store,path:"/api/jobs/"+job.id+"/service",mode:.diary,record:job,attached:{id in var ids=value["photoIds"].array;if !ids.contains(.s(id)){ids.append(.s(id))};value["photoIds"] = .array(ids);photoUploads.append(id);persist()},selection:photoSelection,selectionLabel:"Zahrnout do denního zápisu")
            }
            if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
            Button(saving ? "Ukládám…" : "Uložit denní zápis"){Task{await save()}}.disabled(saving||value["work"].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty||value["photoIds"].array.isEmpty)
        }else{ProgressView()}
    }.navigationTitle(initial.id.isEmpty ? "Dnešní zápis" : "Upravit zápis").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){persist();dismiss()}.disabled(saving)}}.task{if !loaded{let base=initial.isNull ? APIValue.object(["id":.s(UUID().uuidString),"version":.n(0),"date":.s(store.today),"work":.s(""),"material":.s(""),"notes":.s(""),"nextStep":.s(""),"photoIds":.array([])]) : initial;let draft=store.draft(key,fallback:base);value=draft.value;operationID=draft.operationID;photoUploads=value["photoIds"].array.map(\.string).filter{id in store.outbox.contains{$0.id==id}};loaded=true;store.beginEdit()}}
      .onChange(of:value){_,_ in if loaded{persist()}}.onDisappear{persist();if loaded{store.endEdit()}}
    }}
    func persist(){guard loaded else{return};store.saveDraft(key,draft:APIDraft(value:value,baseVersion:value["version"].int,operationID:operationID,updatedAt:Date()))}
    func save()async{saving=true;defer{saving=false};do{guard !value["date"].string.isEmpty,value["date"].string<=store.today else{throw APIError.local("Vyberte skutečné datum práce, nejpozději dnešní.")};try APIJobDiaryRules.requirePhoto(value);persist();var payload=value.selecting(["version","date","work","material","notes","nextStep","photoIds"]);payload["operationId"] = .s(operationID);_ = try await store.write("/api/jobs/"+job.id+"/diary/"+value.id,method:"PUT",body:payload,offline:true,draftKey:key,operationID:operationID,dependsOn:photoUploads);loaded=false;store.endEdit();dismiss()}catch{problem=error.localizedDescription}}
}
