import SwiftUI
import UIKit

struct APIProtocolEditor:View {
    @ObservedObject var store:APIStore
    let jobID:String
    var completing=false
    @Environment(\.dismiss) private var dismiss
    @State private var snapshot:APIValue = .null
    @State private var value:APIValue = .object([:])
    @State private var operationID=UUID().uuidString
    @State private var materials:[APIValue]=[]
    @State private var selectedMaterial=""
    @State private var quantity="1"
    @State private var preview:APIFile?
    @State private var defectRoute:APIRoute?
    @State private var problem:String?
    @State private var saving=false
    @State private var loaded=false
    @State private var pdfData:Data?
    @State private var email=false
    @State private var photoUploads:[String]=[]
    var key:String{"protocol:"+jobID}
    var report:Binding<APIValue>{Binding(get:{value["report"]},set:{value["report"]=$0})}
    var body:some View {
        NavigationStack {
            ScrollView{VStack(alignment:.leading,spacing:18){
                if !loaded{ProgressView("Načítám protokol…")}
                else{
                    APIFieldsView(fields:APISchemas.service,value:report).diaryCard()
                    if store.enabled("materials"){
                        DisclosureGroup("Použitý materiál · \(value["report"]["materialItems"].array.count)"){
                            Picker("Materiál z katalogu",selection:$selectedMaterial){Text("Vyberte položku").tag("");ForEach(Array(materials.enumerated()),id:\.offset){_,item in Text(APIDomainLogic.referenceLabel(item,kind:"materials")).tag(item.id)}}
                            TextField("Množství",text:$quantity).keyboardType(.decimalPad)
                            Button("Přidat materiál"){addMaterial()}.frame(minHeight:44)
                            ForEach(Array(value["report"]["materialItems"].array.enumerated()),id:\.offset){index,line in
                                VStack(alignment:.leading){Text(line["name"].string+" · "+line["sku"].string);Text(line["quantity"].string+" "+line["unit"].string+" · "+APIFormat.money(.n(APIProtocolPDF.lineTotal(line)),currency:line["currency"].string)).font(.caption);Button("Odebrat",role:.destructive){var a=value["report"]["materialItems"].array;a.remove(at:index);value["report"]["materialItems"] = .array(a)}.frame(minHeight:44)}.padding(.vertical,8)
                            }
                        }.diaryCard()
                    }
                    if store.enabled("protocolPhotos") || !snapshot["photos"].array.isEmpty{
                        DisclosureGroup("Fotodokumentace"){
                            APIFilesView(store:store,path:"/api/jobs/"+jobID+"/service",mode:.service,record:snapshot["job"],attached:{id in var a=value["report"]["photoIds"].array;if !a.contains(.s(id)){a.append(.s(id));value["report"]["photoIds"] = .array(a)};photoUploads.append(id)})
                        }.diaryCard()
                    }
                    DisclosureGroup("Podpis zákazníka"){APISignature(encoded:Binding(get:{value["report"]["customerSignature"].string},set:{value["report"]["customerSignature"] = .s($0)}))}.diaryCard()
                    if store.owner && store.enabled("workCharges"){APIWorkChargesEditor(store:store,charges:Binding(get:{value["report"]["workCharges"]},set:{value["report"]["workCharges"]=$0})).diaryCard()}
                    if store.writer && store.enabled("defects") && !snapshot["job"]["gardenId"].string.isEmpty{
                        Button("Převést text protokolu na sledovanou závadu"){Task{await trackDefect()}}.frame(minHeight:44)
                    }
                    Button("Zobrazit PDF"){Task{await showPDF()}}.buttonStyle(.bordered).frame(minHeight:44)
                    if store.writer {Button("Uložit rozpracovaný protokol"){Task{await save(finalize:false,complete:false)}}.buttonStyle(.bordered).frame(minHeight:44)
                    Button(completing ? "Potvrdit dokončení návštěvy" : "Potvrdit hotový protokol"){Task{await save(finalize:true,complete:completing)}}.buttonStyle(.borderedProminent).frame(minHeight:44)}
                    if store.owner && store.enabled("emailNotifications"){Button("Odeslání protokolu zákazníkovi"){Task{await preparePDF();if pdfData != nil{email=true}}}}
                }
                if let problem{DiaryStatusBanner(text:problem,warning:true)}
            }.padding(18)}.background(DiaryStyle.background).navigationTitle("Servisní protokol").navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){persist();dismiss()}.disabled(saving)}}
        }.task{await load()}.onChange(of:value){_,_ in if loaded{persist()}}
            .sheet(item:$preview){file in APIQuickLook(url:file.url).onDisappear{try? FileManager.default.removeItem(at:file.url.deletingLastPathComponent())}}
            .sheet(isPresented:$email){NavigationStack{APIProtocolEmailView(store:store,jobID:jobID,pdf:pdfData ?? Data(),jobVersion:snapshot["job"]["version"],reportVersion:snapshot["report"]["version"])}}
            .sheet(item:$defectRoute){route in APIEntityEditor(store:store,resource:route.resource,original:route.value,isNew:route.isNew)}
            .disabled(saving).interactiveDismissDisabled().editLease(store)
    }
    func load()async{do{
        snapshot=try await store.get("/api/jobs/"+jobID+"/service")
        let base=APIValue.object(["version":snapshot["job"]["version"],"report":snapshot["report"].isNull ? .object(["date":.s(store.today),"work":.s(""),"material":.s(""),"defects":.s(""),"notes":.s(""),"recommendations":.s(""),"photoIds":.array([]),"materialItems":.array([]),"customerSignature":.s("")]) : snapshot["report"]])
        let draft=store.draft(key,fallback:base);value=draft.value;operationID=draft.operationID
        if store.enabled("materials"){materials=try await APIDomainLogic.referenceRows("materials",store:store)}
        loaded=true
    }catch{problem=error.localizedDescription}}
    func persist(){store.saveDraft(key,draft:APIDraft(value:value,baseVersion:value["version"].int,operationID:operationID,updatedAt:Date()))}
    func payload(finalize:Bool,complete:Bool)->APIValue {
        var report=value["report"].selecting(APISchemas.service.map(\.id)+["materialItems","photoIds","customerSignature"])
        if store.owner && store.enabled("workCharges") && !value["report"]["workCharges"].isNull{report["workCharges"] = value["report"]["workCharges"]}
        return .object(["version":value["version"],"operationId":.s(operationID),"report":report,"complete":.bool(complete),"finalizeReport":.bool(finalize)])
    }
    func save(finalize:Bool,complete:Bool)async{saving=true;defer{saving=false};do{persist();_=try await store.write("/api/jobs/"+jobID+"/service",method:"PUT",body:payload(finalize:finalize,complete:complete),offline:true,draftKey:key,operationID:operationID,dependsOn:photoUploads);dismiss()}catch{problem=error.localizedDescription}}
    func addMaterial(){guard let item=materials.first(where:{$0.id==selectedMaterial}),let q=Double(quantity.replacingOccurrences(of:",",with:".")),q>0,q<=1000000,abs(q*1000-(q*1000).rounded())<0.00001 else{problem="Vyberte materiál a kladné množství nejvýše se třemi desetinnými místy.";return};let line=item.merged(["itemId":.s(item.id),"itemVersion":item["version"],"quantity":.number(q)]);var a=value["report"]["materialItems"].array;a.append(line);value["report"]["materialItems"] = .array(a);selectedMaterial="";quantity="1"}
    func preparePDF()async{do{var images:[UIImage]=[];for reference in value["report"]["photoIds"].array{let id=reference.string;let bytes:Data;if let op=store.outbox.first(where:{$0.id==id}),let pending=try store.vault?.mutationBytes(op){bytes=pending}else{bytes=try await store.file("/api/jobs/"+jobID+"/service/photos/"+id).data};guard let image=APIImage.thumbnail(bytes,maxPixels:1600)else{throw APIError.local("Fotografii nelze vložit do PDF.")};images.append(image)};pdfData=try APIProtocolPDF.make(snapshot:snapshot,report:value["report"],photos:images)}catch{pdfData=nil;problem="PDF není úplné: "+error.localizedDescription}}
    func showPDF()async{await preparePDF();if let data=pdfData{preview=APIFile(url:APIImage.temporary(data,name:"Servisni-protokol.pdf"))}}
    func trackDefect()async{do{
        guard !value["report"]["defects"].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else{throw APIError.local("Nejdříve doplňte text zjištěné závady.")}
        guard store.outbox.isEmpty,store.online else{throw APIError.local("Převod uloženého protokolu potvrďte po synchronizaci. Samostatnou závadu lze zaznamenat i offline.")}
        let result=try await store.write("/api/jobs/"+jobID+"/service",method:"PUT",body:payload(finalize:false,complete:false))
        value["version"]=result["job"]["version"];operationID=UUID().uuidString;snapshot=result
        let r=APIResource(entity:.defects,seed:.object(["gardenId":snapshot["job"]["gardenId"],"sourceJobId":.s(jobID),"fromProtocol":.bool(true),"title":.s(String(value["report"]["defects"].string.prefix(160))),"description":value["report"]["defects"],"discipline":snapshot["job"]["discipline"]]));defectRoute=APIRoute(resource:r,value:r.initial(store),isNew:true)
    }catch{problem=error.localizedDescription}}
}
struct APIWorkChargesEditor:View {
    @ObservedObject var store:APIStore
    @Binding var charges:APIValue
    @State private var rate:APIValue = .null
    @State private var enabled=false
    var body:some View{DisclosureGroup("Práce a cesta – prototyp vlastníka"){
        Toggle("Zahrnout práci a cestu",isOn:$enabled).onChange(of:enabled){_,on in if !on{charges = .null}else if charges.isNull{charges = .object(["rateId":rate["id"],"hours":.n(0),"kilometers":.n(0)])}}
        if enabled{APIFieldsView(fields:[.field("hours","Počet hodin",.decimal,true),.field("kilometers","Kilometry",.decimal,true)],value:$charges);Text("Účtuje se každá započatá hodina a každých započatých 30 km.").font(.footnote);Text("Použité uložené sazby: "+APIFormat.money(rate["hourlyMinor"])+" / hod · "+APIFormat.money(rate["travelMinor"])+" / 30 km").font(.caption)}
    }.task{if let data=try? await store.get("/api/work-rates"){rate=data["rate"];enabled = !charges.isNull}}}
}
enum APIProtocolPDF {
    static func lineTotal(_ line:APIValue)->Int { var amount=Decimal(line["priceMinor"].int)*(Decimal(string:line["quantity"].string,locale:Locale(identifier:"en_US_POSIX")) ?? 0);var result=Decimal();NSDecimalRound(&result,&amount,0,.plain);return NSDecimalNumber(decimal:result).intValue }
    static func make(snapshot:APIValue,report:APIValue,photos:[UIImage]=[])throws->Data {
        let renderer=UIGraphicsPDFRenderer(bounds:CGRect(x:0,y:0,width:595,height:842))
        return renderer.pdfData{ctx in
            var y:CGFloat=42
            func page(){ctx.beginPage();y=42}
            func text(_ value:String,_ bold:Bool=false){guard !value.isEmpty else{return};let font=bold ? UIFont.boldSystemFont(ofSize:13) : UIFont.systemFont(ofSize:11);let attrs:[NSAttributedString.Key:Any]=[.font:font,.foregroundColor:UIColor.black];let rect=(value as NSString).boundingRect(with:CGSize(width:511,height:10000),options:[.usesLineFragmentOrigin,.usesFontLeading],attributes:attrs,context:nil);if y+rect.height>790{page()};(value as NSString).draw(in:CGRect(x:42,y:y,width:511,height:rect.height+4),withAttributes:attrs);y+=rect.height+12}
            page();text("SERVISNÍ PROTOKOL",true)
            text(snapshot["job"]["title"].string,true);text("Datum provedení: "+report["date"].string)
            let billing=report["billingDetails"].isNull ? snapshot["billingPreview"] : report["billingDetails"]
            for (key,label) in [("company","Dodavatel"),("customer","Zákazník")] {let b=billing[key];text(label,true);text([b["name"].string,b["address"].string,b["companyId"].string.isEmpty ? "" : "IČO: "+b["companyId"].string,b["taxId"].string.isEmpty ? "" : "DIČ: "+b["taxId"].string,b["email"].string,b["phone"].string,b["bankAccount"].string].filter{!$0.isEmpty}.joined(separator:"\n"))}
            text("Místo: "+snapshot["job"]["address"].string)
            var totals:[String:Int]=[:]
            for f in APISchemas.service where f.id != "date"{if !report[f.id].string.isEmpty{text(f.title,true);text(report[f.id].string)}}
            if !report["materialItems"].array.isEmpty{text("Použitý materiál",true)}
            for line in report["materialItems"].array{let total=lineTotal(line),currency=line["currency"].string;totals[currency,default:0]+=total;text([line["name"].string,line["sku"].string,line["quantity"].string+" "+line["unit"].string,APIFormat.money(line["priceMinor"],currency:currency),APIFormat.money(.n(total),currency:currency)].filter{!$0.isEmpty}.joined(separator:" · "))}
            for currency in totals.keys.sorted(){text("Materiál celkem: "+APIFormat.money(.n(totals[currency]!),currency:currency),true)}
            let charges=report["workCharges"]
            if !charges.isNull{let hours=Int(ceil(charges["hours"].double)),travel=Int(ceil(charges["kilometers"].double/30));text("Práce: \(hours) započatých hodin · cesta: \(travel) bloků po 30 km",true);if !charges["totalMinor"].isNull{text("Práce a cesta celkem: "+APIFormat.money(charges["totalMinor"]))}}
            if let data=Data(base64Encoded:report["customerSignature"].string.components(separatedBy:",").last ?? ""),let image=UIImage(data:data){if y+100>790{page()};text("Podpis zákazníka",true);image.draw(in:CGRect(x:42,y:y,width:240,height:90));y+=100}
            for (index,image) in photos.enumerated(){page();text("Fotodokumentace · \(index+1)",true);let scale=min(511/image.size.width,650/image.size.height);image.draw(in:CGRect(x:42,y:y,width:image.size.width*scale,height:image.size.height*scale));y+=image.size.height*scale+16}
            text(report["documentState"].string=="ready" ? "Protokol hotový" : "Rozpracovaný protokol")
        }
    }
}
