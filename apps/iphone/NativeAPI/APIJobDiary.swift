import SwiftUI

// Native screens use the existing API store, encrypted drafts/outbox and photo picker.
struct APIJobDiary:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    @State private var snapshot:APIValue = .null
    @State private var problem:String?
    @State private var editing:APIValue?
    @State private var editorOpen=false
    @State private var nextCursor=""
    var path:String{"/api/jobs/"+job.id+"/diary"}
    var entries:[APIValue]{
        var rows=snapshot["entries"].array
        for op in store.outbox where op.path.hasPrefix(path+"/"){
            guard let body=op.body else{continue};let id=String(op.path.split(separator:"/").last ?? "")
            rows.removeAll{$0.id==id};rows.append(body.merged(["id":.s(id),"pending":.bool(true),"syncState":.s(op.state),"authorName":.s(store.me["user"]["name"].string),"canEdit":.bool(false)]))
        }
        return rows.sorted{($0["date"].string,$0.id)>($1["date"].string,$1.id)}
    }
    var body:some View{List{
        Section{Text(job["title"].string).font(.headline);Text("Denní postup prací. Zápis nemění stav zakázky ani servisní protokol.").font(.footnote).foregroundStyle(.secondary)
            if store.writer && !job["cancelled"].bool{Button{editing=nil;editorOpen=true}label:{Label("Přidat dnešní zápis",systemImage:"plus")}.frame(minHeight:44)}
        }
        ForEach(entries,id:\.id){entry in DisclosureGroup{
            Text(entry["work"].string)
            ForEach(["material","notes","nextStep"],id:\.self){key in if !entry[key].string.isEmpty{Text(key=="material" ? "Materiál" : key=="notes" ? "Komplikace a poznámka" : "Další krok").font(.caption.bold());Text(entry[key].string)}}
            ForEach(entry["photos"].array,id:\.id){photo in APIAuthenticatedImage(store:store,path:photo["url"].string)}
            if entry["canEdit"].bool && store.writer{Button("Upravit zápis"){editing=entry;editorOpen=true}.frame(minHeight:44)}
            if entry["pending"].bool{Text("Čeká na odeslání · "+entry["syncState"].string).foregroundStyle(DiaryStyle.warning);Text("Případný konflikt vyřešíte ve Více → Synchronizace.").font(.footnote)}
        }label:{VStack(alignment:.leading,spacing:5){Text(entry["date"].string+" · "+entry["authorName"].string).font(.headline);Text(entry["work"].string).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)}}}
        if entries.isEmpty && !snapshot.isNull{Text("Zatím žádný denní zápis.").foregroundStyle(.secondary)}
        if !nextCursor.isEmpty{Button("Starší zápisy"){Task{await load(more:true)}}}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.navigationTitle("Deník realizace").navigationBarTitleDisplayMode(.inline).task(id:store.revision){await load()}.refreshable{await store.resume();await load()}
        .sheet(isPresented:$editorOpen){APIJobDiaryEditor(store:store,job:job,initial:editing ?? .null)}
    }
    func load(more:Bool=false)async{do{var c=URLComponents(string:path)!;if more{c.queryItems=[URLQueryItem(name:"cursor",value:nextCursor)]};let result=try await store.get(c.string!);if more{snapshot["entries"] = .array(snapshot["entries"].array+result["entries"].array.filter{row in !snapshot["entries"].array.contains{$0.id==row.id}})}else{snapshot=result};nextCursor=result["nextCursor"].string;problem=nil}catch{problem=error.localizedDescription}}
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
            Section("Fotografie"){
                APIFilesView(store:store,path:"/api/jobs/"+job.id+"/service",mode:.service,record:job,attached:{id in var ids=value["photoIds"].array;if !ids.contains(.s(id)){ids.append(.s(id))};value["photoIds"] = .array(ids);photoUploads.append(id);persist()},selection:photoSelection,selectionLabel:"Zahrnout do denního zápisu")
            }
            if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
            Button(saving ? "Ukládám…" : "Uložit denní zápis"){Task{await save()}}.disabled(saving||value["work"].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
        }else{ProgressView()}
    }.navigationTitle(initial.id.isEmpty ? "Dnešní zápis" : "Upravit zápis").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){persist();dismiss()}.disabled(saving)}}.task{if !loaded{let base=initial.isNull ? APIValue.object(["id":.s(UUID().uuidString),"version":.n(0),"date":.s(store.today),"work":.s(""),"material":.s(""),"notes":.s(""),"nextStep":.s(""),"photoIds":.array([])]) : initial;let draft=store.draft(key,fallback:base);value=draft.value;operationID=draft.operationID;photoUploads=value["photoIds"].array.map(\.string).filter{id in store.outbox.contains{$0.id==id}};loaded=true;store.beginEdit()}}
      .onChange(of:value){_,_ in if loaded{persist()}}.onDisappear{persist();if loaded{store.endEdit()}}
    }}
    func persist(){guard loaded else{return};store.saveDraft(key,draft:APIDraft(value:value,baseVersion:value["version"].int,operationID:operationID,updatedAt:Date()))}
    func save()async{saving=true;defer{saving=false};do{guard !value["date"].string.isEmpty,value["date"].string<=store.today else{throw APIError.local("Vyberte skutečné datum práce, nejpozději dnešní.")};persist();var payload=value.selecting(["version","date","work","material","notes","nextStep","photoIds"]);payload["operationId"] = .s(operationID);_ = try await store.write("/api/jobs/"+job.id+"/diary/"+value.id,method:"PUT",body:payload,offline:true,draftKey:key,operationID:operationID,dependsOn:photoUploads);loaded=false;store.endEdit();dismiss()}catch{problem=error.localizedDescription}}
}
