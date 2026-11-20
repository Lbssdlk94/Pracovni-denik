import SwiftUI
import UIKit

struct APIProtocolSectionLabel:View {
    let title:String,icon:String,summary:String,filled:Bool,required:Bool
    var body:some View{HStack(spacing:10){Image(systemName:icon).foregroundStyle(DiaryStyle.accent).frame(width:24);VStack(alignment:.leading,spacing:3){Text(title).font(.subheadline.weight(.semibold));Text(summary.isEmpty ? (required ? "Povinné · chybí" : "Nepovinné") : summary).font(.caption).foregroundStyle(.secondary).lineLimit(2)};Spacer(minLength:4);Image(systemName:filled ? "checkmark.circle.fill" : required ? "circle.dashed" : "circle").foregroundStyle(filled ? DiaryStyle.accent : Color.secondary).accessibilityLabel(filled ? "Vyplněno" : required ? "Povinný údaj chybí" : "Nepovinné")}.frame(minHeight:44)}
}
struct APIProtocolWorkSection:View {
    let template:APIValue
    @Binding var details:APIValue
    @Binding var legacyWork:APIValue
    let modern:Bool
    var body:some View{VStack(alignment:.leading,spacing:8){if modern{ForEach(template["activities"].array.filter{$0["active"].bool || details["activities"].array.contains($0)},id:\.id){activity in Button{var selected=details["activities"].array;if selected.contains(where:{$0.id==activity.id}){selected.removeAll{$0.id==activity.id}}else{selected.append(activity.selecting(["id","title"]))};details["activities"] = .array(selected)}label:{HStack{Image(systemName:details["activities"].array.contains(where:{$0.id==activity.id}) ? "checkmark.circle.fill" : "circle");Text(activity["title"].string).foregroundStyle(.primary);Spacer()}.frame(minHeight:44)}.buttonStyle(.borderless).accessibilityIdentifier("protocol-activity-"+activity.id)}
        TextField("Další provedené práce",text:Binding(get:{details["customWork"].string},set:{details["customWork"] = .s($0)}),axis:.vertical).lineLimit(3...8).textFieldStyle(.roundedBorder).accessibilityIdentifier("protocol-work")
    }else{TextField("Provedené práce",text:Binding(get:{legacyWork.string},set:{legacyWork = .s($0)}),axis:.vertical).lineLimit(3...8).textFieldStyle(.roundedBorder).accessibilityIdentifier("protocol-work")}}}
}
enum APIProtocolSignatureStatus {
    static func title(_ status:String)->String{switch status{case "signed":return "Podepsáno";case "absent":return "Zákazník nebyl přítomen";case "refused":return "Podpis odmítl";case "invalidated":return "Nutné nové potvrzení";case "legacy":return "Starší podpis · potvrďte aktuální obsah";default:return "Podpis chybí"}}
}
struct APIProtocolTimeSection:View {
    let time:APIValue
    var body:some View{let rows=APIProtocolLogic.timeRows(time);VStack(alignment:.leading,spacing:8){if time.isNull{Text("Podrobná evidence času není dostupná. Ruční účtování níže nenahrazuje evidenci pracovníků.").font(.caption)}else{ForEach(rows,id:\.id){row in VStack(alignment:.leading,spacing:3){Text(row["name"].string).font(.subheadline.weight(.semibold));Text("Práce: "+APIAttendanceLogic.hours(row["workMs"].double)+" · cesta: "+APIAttendanceLogic.hours(row["travelMs"].double)).font(.caption);if row["open"].bool{Text("Otevřený interval · není započtený do uzavřených hodin").font(.caption).foregroundStyle(DiaryStyle.warning)}}};LabeledContent("Člověkohodiny",value:APIAttendanceLogic.hours(rows.reduce(0){$0+$1["workMs"].double}));Text("Čas pochází z intervalů této zakázky za všechny dny. Celková docházka se nepřičítá.").font(.caption).foregroundStyle(.secondary)}}}
}
struct APIProtocolPhotos:View {
    @ObservedObject var store:APIStore
    let jobID:String,job:APIValue
    @Binding var ids:APIValue
    @Binding var metadata:APIValue
    @State private var legacy:[APIValue]=[]
    private func entry(_ id:String)->APIValue{metadata.array.first{$0.id==id} ?? .object(["id":.s(id),"caption":.s(""),"includePDF":.bool(true)])}
    private func set(_ value:APIValue){var rows=metadata.array;rows.removeAll{$0.id==value.id};rows.append(value);metadata = .array(rows)}
    var body:some View{VStack(alignment:.leading,spacing:10){APIFilesView(store:store,path:"/api/jobs/"+jobID+"/service",mode:.service,record:job,attached:{id in var a=ids.array;if !a.contains(.s(id)){a.append(.s(id));ids = .array(a)}},selection:$ids)
        if !legacy.isEmpty{DisclosureGroup("Další fotografie zakázky"){ForEach(legacy,id:\.id){photo in Toggle(photo["name"].string.isEmpty ? "Fotografie zakázky" : photo["name"].string,isOn:Binding(get:{ids.array.contains(.s(photo.id))},set:{selected in var a=ids.array;a.removeAll{$0 == .s(photo.id)};if selected{a.append(.s(photo.id))};ids = .array(a)}))}}}
        ForEach(ids.array.map(\.string),id:\.self){id in VStack(alignment:.leading,spacing:6){TextField("Popis fotografie",text:Binding(get:{entry(id)["caption"].string},set:{text in var e=entry(id);e["caption"] = .s(text);set(e)})).textFieldStyle(.roundedBorder);Toggle("Zahrnout fotografii do PDF",isOn:Binding(get:{entry(id)["includePDF"].bool},set:{on in var e=entry(id);e["includePDF"] = .bool(on);set(e)}));Button("Odebrat z protokolu",systemImage:"minus.circle"){ids = .array(ids.array.filter{$0 != .s(id)});metadata = .array(metadata.array.filter{$0.id != id})}.frame(minHeight:44)}.padding(.vertical,6)}
        Text("Odebrání z protokolu nesmaže původní fotografii ze zakázky.").font(.caption).foregroundStyle(.secondary)
    }.task{if store.enabled("googleDrive") && store.enabled("drivePhotos"){do{legacy=(try await store.get("/api/jobs/"+jobID+"/photos"))["photos"].array}catch{}}}.onChange(of:ids){_,_ in metadata = .array(metadata.array.filter{ids.array.contains(.s($0.id))})}}
}
struct APIProtocolReview:View {
    @ObservedObject var store:APIStore
    @ObservedObject var model:APIProtocolModel
    let completing:Bool,edit:(String)->Void,pdf:()->Void,finish:()->Void
    @Environment(\.dismiss) private var dismiss
    var body:some View{NavigationStack{List{Section("Souhrn protokolu"){Text(APIProtocolExport.snapshot(model.snapshot,report:model.report)["job"]["customerName"].string).font(.headline);LabeledContent("Datum",value:model.report["date"].string);Text(model.modern ? APIProtocolLogic.work(model.report) : model.report["work"].string);APIProtocolMaterialTotals(lines:model.report["materialItems"]);APIProtocolTimeSection(time:model.report["protocolDetails"]["timeSnapshot"]);LabeledContent("Fotodokumentace",value:"\(model.report["photoIds"].array.count) fotografií");LabeledContent("Podpis",value:APIProtocolSignatureStatus.title(model.report["protocolDetails"]["signature"]["status"].string))}
        let missing=APIProtocolLogic.missing(model.report,template:model.template)
        if !missing.isEmpty{Section("Chybějící povinné údaje"){ForEach(missing,id:\.self){id in Button{edit(id)}label:{Label(id=="date" ? "Datum provedení" : id=="content" ? "Provedené práce, materiál nebo fotografie" : APIProtocolLogic.sections.first{$0.0==id}?.1 ?? id,systemImage:"exclamationmark.circle")}.frame(minHeight:44)}}}
        if completing{Text("Potvrzením dokončíte celou návštěvu podle původního schvalovacího procesu. Nejde o ukončení pouze vlastního pracovního intervalu.").font(.caption)}
        if let error=model.problem{Text(error).foregroundStyle(DiaryStyle.warning)}
        Section{Button("Náhled PDF",systemImage:"doc.text.magnifyingglass",action:pdf);Button(completing ? "Potvrdit dokončení návštěvy" : "Potvrdit protokol",action:finish).diaryBubble(.primary).disabled(!missing.isEmpty || model.busy || !model.pending(store).isEmpty).accessibilityIdentifier("protocol-finalize")}
    }.navigationTitle("Zkontrolovat protokol").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.cancellationAction){Button("Zpět"){dismiss()}}}}}
}
struct APIProtocolShare:UIViewControllerRepresentable {
    let url:URL
    func makeUIViewController(context:Context)->UIActivityViewController{UIActivityViewController(activityItems:[url],applicationActivities:nil)}
    func updateUIViewController(_ controller:UIActivityViewController,context:Context){}
}
enum APIProtocolExport {
    static func report(_ report:APIValue,modern:Bool)->APIValue{var result=report;if modern{result["work"] = .s(APIProtocolLogic.work(report))};return result}
    static func snapshot(_ snapshot:APIValue,report:APIValue)->APIValue{var result=snapshot;result["job"]=snapshot["job"].merged(report["protocolDetails"]["identity"].object);return result}
    static func photoIDs(_ report:APIValue)->[String]{report["photoIds"].array.map(\.string).filter{id in report["protocolDetails"]["photos"].array.first{$0.id==id}?["includePDF"].bool ?? true}}
    static func customerReport(_ report:APIValue)->APIValue{var r=report;if report["protocolDetails"]["schema"].int==1 && report["protocolDetails"]["signature"]["status"].string != "signed"{r["customerSignature"] = .s("")};if !report["protocolDetails"]["customerNotes"].bool{r["notes"] = .s("")};return r}
}
