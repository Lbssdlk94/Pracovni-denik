import SwiftUI
import UIKit

struct APIProtocolEditor:View {
    @ObservedObject var store:APIStore
    let jobID:String
    var completing=false
    @StateObject private var model=APIProtocolModel()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scene
    @State private var expanded:Set<String>=["work"]
    @State private var catalog=false
    @State private var signature=false
    @State private var review=false
    @State private var templates=false
    @State private var email=false
    @State private var preview:APIFile?
    @State private var share:APIFile?
    @State private var defectRoute:APIRoute?
    @State private var pdfData:Data?
    @State private var scrollTarget:String?
    private var writable:Bool{store.writer && !store.isRolePreview}
    private func field(_ id:String)->Binding<APIValue>{Binding(get:{model.value["report"][id]},set:{model.value["report"][id]=$0})}
    private func detail(_ id:String)->Binding<APIValue>{Binding(get:{model.value["report"]["protocolDetails"][id]},set:{model.value["report"]["protocolDetails"][id]=$0})}
    var body:some View{NavigationStack{ScrollViewReader{proxy in List{
        if !model.loaded{if model.problem==nil{ProgressView("Načítám protokol…")}else{ContentUnavailableView("Protokol není načtený",systemImage:"doc.badge.ellipsis");Button("Zkusit znovu"){Task{await model.load(store:store,jobID:jobID)}}}}
        else{
            Section{header}.listRowSeparator(.hidden)
            ForEach(APIProtocolLogic.sections,id:\.0){id,title,icon in
                if visible(id){Section{DisclosureGroup(isExpanded:Binding(get:{expanded.contains(id)},set:{on in if on{expanded.insert(id)}else{expanded.remove(id)}})){
                    sectionContent(id).padding(.vertical,8).disabled(!writable || model.busy)
                }label:{APIProtocolSectionLabel(title:title,icon:icon,summary:summary(id),filled:filled(id),required:required(id))}.accessibilityIdentifier("protocol-section-"+id)}.id(id)}
            }
            if !model.snapshot["history"].array.isEmpty{Section{DisclosureGroup("Historie protokolu"){ForEach(Array(model.snapshot["history"].array.enumerated()),id:\.offset){_,row in Text(APIAttendanceView.date(row["created_at"])+" · "+APIAttendanceView.time(row["created_at"])+" · "+row["created_by"].string).font(.caption)}}}}
            if !model.pending(store).isEmpty{NavigationLink("Otevřít čekající změny"){APIOutboxView(store:store)}}
        }
        if let error=model.problem{Section{Text(error).foregroundStyle(DiaryStyle.warning).accessibilityIdentifier("protocol-error");if writable{Button("Uložit / zkusit znovu"){Task{await model.save(store:store,finalize:false)}}}}}
    }.listStyle(.insetGrouped).listSectionSpacing(10).contentMargins(.top,0,for:.scrollContent).scrollContentBackground(.hidden).background(DiaryStyle.background).navigationTitle(model.template["name"].string.isEmpty ? "Servisní protokol" : model.template["name"].string).navigationBarTitleDisplayMode(.inline)
        .onChange(of:scrollTarget){_,id in if let id{withAnimation{proxy.scrollTo(id,anchor:.top)};scrollTarget=nil}}
        .toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít",systemImage:"xmark"){model.persist(store);dismiss()}.labelStyle(.iconOnly).disabled(model.busy)};ToolbarItem(placement:.topBarTrailing){Menu{
            if writable{Button("Uložit rozpracovaný protokol",systemImage:"square.and.arrow.down"){Task{await model.save(store:store,finalize:false)}}}
            if store.manager && model.modern{Button("Správa šablon a činností",systemImage:"slider.horizontal.3"){templates=true}}
            Button("Sdílet PDF",systemImage:"square.and.arrow.up"){Task{await makePDF(sharing:true)}}
            if store.owner && store.enabled("emailNotifications"){Button("Odeslání zákazníkovi",systemImage:"envelope"){Task{await openEmail()}}}
        }label:{Image(systemName:"ellipsis")}.accessibilityLabel("Možnosti protokolu")}}
        .safeAreaInset(edge:.bottom){if model.loaded{HStack(spacing:10){Button{Task{await makePDF()}}label:{Label("Náhled PDF",systemImage:"doc.text.magnifyingglass")}.diaryBubble(.secondary).accessibilityIdentifier("protocol-pdf");if writable{Button("Zkontrolovat a dokončit"){model.task?.cancel();model.persist(store);review=true}.diaryBubble(.primary).accessibilityIdentifier("protocol-review")}}.padding(12).background(.bar)}}
    }}.task{await model.load(store:store,jobID:jobID)}.onChange(of:model.value){_,_ in model.changed(store:store)}.onChange(of:store.revision){_,_ in model.syncChanged(store:store)}.onChange(of:scene){_,state in if state != .active{model.persist(store)}}.onDisappear{model.task?.cancel();model.persist(store)}
        .sheet(isPresented:$catalog){APIProtocolCatalog(store:store,items:model.materials,categories:model.categories,lines:field("materialItems"))}
        .sheet(isPresented:$signature){APIProtocolSignatureScreen(customer:model.snapshot["job"]["customerName"].string,initial:model.report["protocolDetails"]["signature"]){meta,png in model.sign(meta,png:png)}}
        .sheet(isPresented:$templates,onDismiss:{Task{await model.refreshAuxiliary(store:store)}}){APIProtocolTemplateManager(store:store)}
        .sheet(isPresented:$review){APIProtocolReview(store:store,model:model,completing:completing,edit:{id in review=false;let target=id=="content" ? "work" : id=="date" ? "header" : id;expanded.insert(target);scrollTarget=target},pdf:{Task{review=false;await makePDF()}},finish:{Task{await model.save(store:store,finalize:true,complete:completing);if model.problem==nil{review=false;if completing{dismiss()}}}})}
        .sheet(item:$preview){APIQuickLook(url:$0.url)}.sheet(item:$share){APIProtocolShare(url:$0.url)}
        .sheet(isPresented:$email,onDismiss:{Task{await model.refreshAuxiliary(store:store)}}){NavigationStack{APIProtocolEmailView(store:store,jobID:jobID,pdf:pdfData ?? Data(),jobVersion:model.snapshot["job"]["version"],reportVersion:model.snapshot["report"]["version"],initialRecipient:model.snapshot["job"]["customerEmail"].string)}}
        .sheet(item:$defectRoute){APIEntityEditor(store:store,resource:$0.resource,original:$0.value,isNew:$0.isNew)}.editLease(store)
    }
    private var header:some View{VStack(alignment:.leading,spacing:10){HStack{Text(model.status).font(.caption.weight(.semibold)).padding(6).background(DiaryStyle.soft,in:Capsule());Spacer();Text(model.state(store)).font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("protocol-save-state")};Text(model.snapshot["job"]["customerName"].string.isEmpty ? model.snapshot["job"].title : model.snapshot["job"]["customerName"].string).font(.title2.bold());Text(model.snapshot["job"]["address"].string).font(.subheadline).foregroundStyle(.secondary)
        APIFieldEditor(field:APISchemas.service[0],value:field("date"),options:[:]).disabled(!writable)
        if model.modern{Picker("Typ protokolu",selection:Binding(get:{model.report["protocolDetails"]["templateId"].string},set:{id in changeTemplate(id)})){ForEach(availableTemplates,id:\.id){Text($0.title).tag($0.id)}}.disabled(!writable)}else{Text("Základní protokol. Šablony a verze podpisu vyžadují aktualizaci serveru.").font(.caption).foregroundStyle(.secondary)}
        VStack(alignment:.leading,spacing:6){HStack{Text("Připravenost protokolu").font(.subheadline.bold());Spacer();Text("\(Int(APIProtocolLogic.readiness(model.report,template:model.template)*100)) %").monospacedDigit()};ProgressView(value:APIProtocolLogic.readiness(model.report,template:model.template)).tint(DiaryStyle.accent);Text(APIProtocolLogic.missing(model.report,template:model.template).isEmpty ? "Povinné údaje jsou vyplněné" : "Zbývá doplnit povinné údaje").font(.caption)}.padding(12).background(DiaryStyle.soft,in:RoundedRectangle(cornerRadius:16))
        if model.report["protocolDetails"]["signature"]["status"].string=="invalidated"{Label("Obsah se změnil. Vyžádejte nové potvrzení zákazníka.",systemImage:"signature").font(.caption).foregroundStyle(DiaryStyle.warning)}
    }.id("header")}
    private var availableTemplates:[APIValue]{var a=model.snapshot["protocol"]["templates"].array.filter{$0["active"].bool};if !a.contains(where:{$0.id==model.template.id}){a.append(model.template)};return a}
    private func changeTemplate(_ id:String){guard let t=availableTemplates.first(where:{$0.id==id})else{return};let old=APIProtocolLogic.work(model.report);model.value["report"]["protocolDetails"]["templateId"] = .s(id);model.value["report"]["protocolDetails"]["template"]=t;model.value["report"]["protocolDetails"]["activities"] = .array([]);model.value["report"]["protocolDetails"]["customWork"] = .s(old)}
    private func visible(_ id:String)->Bool{let configured=model.template["sections"].array.map(\.string);return (configured.isEmpty || configured.contains(id)) && (id != "materialItems" || store.enabled("materials") || !model.report["materialItems"].array.isEmpty)}
    private func required(_ id:String)->Bool{model.template["required"].array.contains(.s(id)) || id=="photos" && model.template["photosRequired"].bool || id=="signature" && model.template["signatureRequired"].bool}
    private func filled(_ id:String)->Bool{switch id{case "work":return !(model.modern ? APIProtocolLogic.work(model.report) : model.report["work"].string).isEmpty;case "materialItems":return !model.report[id].array.isEmpty;case "photos":return !model.report["photoIds"].array.isEmpty;case "signature":return model.report["protocolDetails"]["signature"]["status"].string=="signed";case "time":return !model.report["protocolDetails"]["timeSnapshot"]["intervals"].array.isEmpty;default:return !model.report[id].string.isEmpty}}
    private func summary(_ id:String)->String{switch id{case "materialItems":return "\(model.report[id].array.count) položek";case "photos":return "\(model.report["photoIds"].array.count) fotografií";case "signature":return APIProtocolSignatureStatus.title(model.report["protocolDetails"]["signature"]["status"].string);case "time":let rows=APIProtocolLogic.timeRows(model.report["protocolDetails"]["timeSnapshot"]);return APIAttendanceLogic.hours(rows.reduce(0){$0+$1["workMs"].double})+" · \(rows.count) pracovníků";case "work":return String((model.modern ? APIProtocolLogic.work(model.report):model.report[id].string).prefix(90));default:return String(model.report[id].string.prefix(90))}}
    @ViewBuilder private func sectionContent(_ id:String)->some View{switch id{
    case "work":APIProtocolWorkSection(template:model.template,details:Binding(get:{model.value["report"]["protocolDetails"]},set:{model.value["report"]["protocolDetails"]=$0}),legacyWork:field("work"),modern:model.modern)
    case "materialItems":VStack(alignment:.leading,spacing:8){if store.enabled("materials"){Button("Otevřít katalog materiálu",systemImage:"magnifyingglass"){catalog=true}.diaryBubble(.secondary).accessibilityIdentifier("protocol-catalog")};ForEach(Array(model.report[id].array.indices),id:\.self){APIProtocolMaterialLine(lines:field(id),index:$0)};APIProtocolMaterialTotals(lines:model.report[id])}
    case "photos":APIProtocolPhotos(store:store,jobID:jobID,job:model.snapshot["job"],ids:field("photoIds"),metadata:detail("photos"))
    case "signature":Button{signature=true}label:{Label(summary(id),systemImage:"signature")}.diaryBubble(.secondary).disabled(!model.modern).accessibilityIdentifier("protocol-signature");if !model.modern{APISignature(encoded:Binding(get:{model.report["customerSignature"].string},set:{model.value["report"]["customerSignature"] = .s($0)}))}
    case "time":APIProtocolTimeSection(time:model.report["protocolDetails"]["timeSnapshot"].isNull ? model.snapshot["protocol"]["time"] : model.report["protocolDetails"]["timeSnapshot"]);if model.modern{Button("Obnovit z evidence zakázky"){model.value["report"]["protocolDetails"]["timeSnapshot"]=model.snapshot["protocol"]["time"];model.value["report"]["protocolDetails"]["refreshTime"] = .bool(true)}};if store.owner && store.enabled("workCharges"){APIWorkChargesEditor(store:store,charges:field("workCharges"))}
    case "defects":textEditor(id);if store.enabled("defects"),!model.snapshot["job"]["gardenId"].string.isEmpty{Button("Vytvořit / otevřít sledovanou závadu",systemImage:"exclamationmark.triangle"){Task{await trackDefect()}}.diaryBubble(.secondary).accessibilityIdentifier("protocol-track-defect")}
    case "notes":textEditor(id);if model.modern && model.template["customerNotes"].bool{Toggle("Zahrnout poznámky do zákaznického PDF",isOn:Binding(get:{model.report["protocolDetails"]["customerNotes"].bool},set:{model.value["report"]["protocolDetails"]["customerNotes"] = .bool($0)}))}else{Text("Interní poznámky se do zákaznického PDF nepřenášejí.").font(.caption).foregroundStyle(.secondary)}
    default:textEditor(id)
    }}
    private func textEditor(_ id:String)->some View{TextField(APIProtocolLogic.sections.first{$0.0==id}?.1 ?? id,text:Binding(get:{model.report[id].string},set:{model.value["report"][id] = .s($0)}),axis:.vertical).lineLimit(3...8).textFieldStyle(.roundedBorder).accessibilityIdentifier("protocol-field-"+id)}
    private func trackDefect()async{guard !model.report["defects"].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else{model.problem="Nejdříve doplňte popis závady.";return};await model.save(store:store,finalize:false);guard model.problem==nil,model.pending(store).isEmpty,store.online else{model.problem="Nejdříve synchronizujte protokol; samostatnou závadu lze zachytit i offline.";return};do{let data=try await store.get("/api/defects?jobId="+jobID);if let existing=data["defects"].array.first(where:{$0["sourceJobId"].string==jobID && $0["sourceProtocol"].bool}){defectRoute=APIRoute(resource:APIResource(entity:.defects),value:existing,isNew:false)}else{let seed:APIValue = .object(["gardenId":model.snapshot["job"]["gardenId"],"sourceJobId":.s(jobID),"fromProtocol":.bool(true),"title":.s(String(model.report["defects"].string.prefix(160))),"description":model.report["defects"],"discipline":model.snapshot["job"]["discipline"]]);let r=APIResource(entity:.defects,seed:seed);defectRoute=APIRoute(resource:r,value:r.initial(store),isNew:true)}}catch{model.problem=error.localizedDescription}}
    private func makePDF(sharing:Bool=false)async{do{guard !model.report["materialItems"].array.contains(where:{(try? APIProtocolLogic.quantity($0["quantity"].string))==nil})else{throw APIError.local("Nejdříve opravte množství materiálu.")};var export=APIProtocolLogic.payloadReport(model.report,modern:model.modern);if model.value != model.baseline{export["documentState"] = .s("draft")};let ids=APIProtocolExport.photoIDs(export);var images:[UIImage]=[];for id in ids{let bytes:Data;if let op=store.outbox.first(where:{$0.id==id}),let data=try store.vault?.mutationBytes(op){bytes=data}else{do{bytes=try await store.file("/api/jobs/"+jobID+"/service/photos/"+id).data}catch let error as APIError where error.status==404{bytes=try await store.file("/api/jobs/"+jobID+"/photos/"+id+"/content").data}};guard let image=APIImage.thumbnail(bytes,maxPixels:1600)else{throw APIError.local("Fotografii nelze vložit do PDF.")};images.append(image)};let data=try APIProtocolPDF.make(snapshot:model.snapshot,report:APIProtocolExport.customerReport(export),photos:images);pdfData=data;let file=APIFile(url:APIImage.temporary(data,name:"Servisni-protokol.pdf"));if sharing{share=file}else{preview=file}}catch{model.problem="PDF není úplné: "+error.localizedDescription}}
    private func openEmail()async{guard model.value==model.baseline,model.pending(store).isEmpty,model.snapshot["report"]["documentState"].string=="ready",store.online else{model.problem="Nejdříve potvrďte a synchronizujte aktuální protokol.";return};await makePDF();preview=nil;if pdfData != nil{email=true}}
}
