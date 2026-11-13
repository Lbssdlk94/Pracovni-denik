import SwiftUI
import UIKit
import CoreText

struct APIProtocolEditor:View {
    @ObservedObject var store:APIStore
    let jobID:String
    var completing=false
    @Environment(\.dismiss) private var dismiss
    @State private var baseline:APIValue = .null
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
                    APIFieldsView(fields:APISchemas.service,value:report).disabled(!store.writer).diaryCard()
                    if store.enabled("materials"){
                        DisclosureGroup("Použitý materiál · \(value["report"]["materialItems"].array.count)"){
                            Picker("Materiál z katalogu",selection:$selectedMaterial){Text("Vyberte položku").tag("");ForEach(Array(materials.enumerated()),id:\.offset){_,item in Text(APIDomainLogic.referenceLabel(item,kind:"materials")).tag(item.id)}}
                            TextField("Množství",text:$quantity).keyboardType(.decimalPad).disabled(!store.writer)
                            Button("Přidat materiál"){addMaterial()}.frame(minHeight:44).disabled(!store.writer)
                            ForEach(Array(value["report"]["materialItems"].array.enumerated()),id:\.offset){index,line in
                                VStack(alignment:.leading){Text(line["name"].string+" · "+line["sku"].string);Text(line["quantity"].string+" "+line["unit"].string+" · "+APIFormat.money(.n(APIProtocolPDF.lineTotal(line)),currency:line["currency"].string)).font(.caption);Button("Odebrat",role:.destructive){var a=value["report"]["materialItems"].array;a.remove(at:index);value["report"]["materialItems"] = .array(a)}.frame(minHeight:44).disabled(!store.writer)}.padding(.vertical,8)
                            }
                        }.diaryCard()
                    }
                    if store.enabled("protocolPhotos") || !snapshot["photos"].array.isEmpty{
                        DisclosureGroup("Fotodokumentace"){
                            APIFilesView(store:store,path:"/api/jobs/"+jobID+"/service",mode:.service,record:snapshot["job"],attached:{id in var a=value["report"]["photoIds"].array;if !a.contains(.s(id)){a.append(.s(id));value["report"]["photoIds"] = .array(a)};photoUploads.append(id)},selection:Binding(get:{value["report"]["photoIds"]},set:{value["report"]["photoIds"]=$0}))
                        }.diaryCard()
                    }
                    DisclosureGroup("Podpis zákazníka"){APISignature(encoded:Binding(get:{value["report"]["customerSignature"].string},set:{value["report"]["customerSignature"] = .s($0)}))}.disabled(!store.writer).diaryCard()
                    if store.owner && store.enabled("workCharges"){APIWorkChargesEditor(store:store,charges:Binding(get:{value["report"]["workCharges"]},set:{value["report"]["workCharges"]=$0})).diaryCard()}
                    if store.writer && store.enabled("defects") && !snapshot["job"]["gardenId"].string.isEmpty{
                        Button("Převést text protokolu na sledovanou závadu"){Task{await trackDefect()}}.frame(minHeight:44)
                    }
                    Button("Zobrazit PDF"){Task{await showPDF()}}.buttonStyle(.bordered).frame(minHeight:44)
                    if store.writer {Button("Uložit rozpracovaný protokol"){Task{await save(finalize:false,complete:false)}}.buttonStyle(.bordered).frame(minHeight:44)
                    Button(completing ? "Potvrdit dokončení návštěvy" : "Potvrdit hotový protokol"){Task{await save(finalize:completing ? hasContent : true,complete:completing)}}.buttonStyle(.borderedProminent).frame(minHeight:44)}
                    if store.owner && store.enabled("emailNotifications"){Button("Odeslání protokolu zákazníkovi"){Task{guard value==baseline,snapshot["report"]["documentState"].string=="ready",!store.outbox.contains(where:{$0.path.hasPrefix("/api/jobs/"+jobID+"/")})else{problem="Nejdříve uložte a synchronizujte hotový protokol. E-mailem lze odeslat jen uložený výkaz.";return};await preparePDF();if pdfData != nil{email=true}}}}
                }
                if let problem{DiaryStatusBanner(text:problem,warning:true)}
            }.padding(18)}.background(DiaryStyle.background).navigationTitle("Servisní protokol").navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){persist();dismiss()}.disabled(saving)}}
        }.task{await load()}.onChange(of:value){_,_ in if loaded{persist()}}
            .sheet(item:$preview){file in APIQuickLook(url:file.url).onDisappear{try? FileManager.default.removeItem(at:file.url.deletingLastPathComponent())}}
            .sheet(isPresented:$email){NavigationStack{APIProtocolEmailView(store:store,jobID:jobID,pdf:pdfData ?? Data(),jobVersion:snapshot["job"]["version"],reportVersion:snapshot["report"]["version"],initialRecipient:snapshot["job"]["customerEmail"].string)}}
            .sheet(item:$defectRoute){route in APIEntityEditor(store:store,resource:route.resource,original:route.value,isNew:route.isNew)}
            .disabled(saving).interactiveDismissDisabled().editLease(store)
    }
    var hasContent:Bool{APISchemas.service.filter{$0.id != "date"}.contains{!value["report"][$0.id].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty} || !value["report"]["materialItems"].array.isEmpty || !value["report"]["photoIds"].array.isEmpty || !value["report"]["customerSignature"].string.isEmpty}
    func load()async{do{
        snapshot=try await store.get("/api/jobs/"+jobID+"/service")
        let base=APIValue.object(["version":snapshot["job"]["version"],"report":snapshot["report"].isNull ? .object(["date":.s(store.today),"work":.s(""),"material":.s(""),"defects":.s(""),"notes":.s(""),"recommendations":.s(""),"photoIds":.array([]),"materialItems":.array([]),"customerSignature":.s("")]) : snapshot["report"]])
        baseline=base;let draft=store.draft(key,fallback:base);value=draft.value;operationID=draft.operationID
        if store.enabled("materials"){materials=try await APIDomainLogic.referenceRows("materials",store:store)}
        loaded=true
    }catch{problem=error.localizedDescription}}
    func persist(force:Bool=false){guard store.writer,force || value != baseline else{return};store.saveDraft(key,draft:APIDraft(value:value,baseVersion:value["version"].int,operationID:operationID,updatedAt:Date()))}
    func payload(finalize:Bool,complete:Bool)->APIValue {
        var report=value["report"].selecting(APISchemas.service.map(\.id)+["materialItems","photoIds","customerSignature"])
        if store.owner && store.enabled("workCharges") && !value["report"]["workCharges"].isNull{report["workCharges"] = value["report"]["workCharges"]}
        return .object(["version":value["version"],"operationId":.s(operationID),"report":report,"complete":.bool(complete),"finalizeReport":.bool(finalize)])
    }
    func save(finalize:Bool,complete:Bool)async{saving=true;defer{saving=false};do{persist(force:true);_=try await store.write("/api/jobs/"+jobID+"/service",method:"PUT",body:payload(finalize:finalize,complete:complete),offline:true,draftKey:key,operationID:operationID,dependsOn:photoUploads);dismiss()}catch{problem=error.localizedDescription}}
    func addMaterial(){do{guard let item=materials.first(where:{$0.id==selectedMaterial})else{throw APIError.local("Vyberte materiál.")};value["report"]["materialItems"]=try APIMaterialSelection.add(item,to:value["report"]["materialItems"],quantity:quantity);selectedMaterial="";quantity="1"}catch{problem=error.localizedDescription}}
    func preparePDF()async{do{var images:[UIImage]=[];for reference in value["report"]["photoIds"].array{let id=reference.string;let bytes:Data;if let op=store.outbox.first(where:{$0.id==id}),let pending=try store.vault?.mutationBytes(op){bytes=pending}else{bytes=try await photo(id)};guard let image=APIImage.thumbnail(bytes,maxPixels:1600)else{throw APIError.local("Fotografii nelze vložit do PDF.")};images.append(image)};var export=value["report"];if value != baseline{export["documentState"] = .s("draft")};pdfData=try APIProtocolPDF.make(snapshot:snapshot,report:export,photos:images)}catch{pdfData=nil;problem="PDF není úplné: "+error.localizedDescription}}
    func photo(_ id:String)async throws->Data{do{return try await store.file("/api/jobs/"+jobID+"/service/photos/"+id).data}catch let error as APIError{guard error.status==404,store.enabled("googleDrive"),store.enabled("drivePhotos")else{throw error};return try await store.file("/api/jobs/"+jobID+"/photos/"+id+"/content").data}}
    func showPDF()async{await preparePDF();if let data=pdfData{preview=APIFile(url:APIImage.temporary(data,name:"Servisni-protokol.pdf"))}}
    func trackDefect()async{do{
        guard !value["report"]["defects"].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else{throw APIError.local("Nejdříve doplňte text zjištěné závady.")}
        guard !store.outbox.contains(where:{$0.path.hasPrefix("/api/jobs/"+jobID+"/")}),store.online else{throw APIError.local("Převod uloženého protokolu potvrďte po synchronizaci. Samostatnou závadu lze zaznamenat i offline.")}
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
        Toggle("Zahrnout práci a cestu",isOn:$enabled).onChange(of:enabled){_,on in if !on{charges = .null}else if charges.isNull{charges = .object(["rateId":rate["id"],"hours":.n(0),"kilometers":.n(0),"hourlyMinor":rate["hourlyMinor"],"travelRateMinor":rate["travelMinor"],"currency":.s("CZK")])}}
        if enabled{APIFieldsView(fields:[.field("hours","Počet hodin",.decimal,true),.field("kilometers","Kilometry",.decimal,true)],value:$charges);Text("Účtuje se každá započatá hodina a každých započatých 30 km.").font(.footnote);Text("Použité uložené sazby: "+APIFormat.money(charges["hourlyMinor"].isNull ? rate["hourlyMinor"] : charges["hourlyMinor"])+" / hod · "+APIFormat.money(charges["travelRateMinor"].isNull ? rate["travelMinor"] : charges["travelRateMinor"])+" / 30 km").font(.caption)}
    }.task{if let data=try? await store.get("/api/work-rates"){rate=data["rate"];enabled = !charges.isNull}}}
}
enum APIProtocolPDF {
    static func chargeTotal(_ charges:APIValue)->Int?{guard !charges["hourlyMinor"].isNull,!charges["travelRateMinor"].isNull else{return nil};let hourUnits=ceil((charges["hours"].double*1000).rounded()/1000),travelUnits=ceil((charges["kilometers"].double*1000).rounded()/30000);let amount=hourUnits*charges["hourlyMinor"].double+travelUnits*charges["travelRateMinor"].double;guard amount.isFinite,amount>=0,amount<1e15 else{return nil};return Int(amount.rounded())}
    static func lineTotal(_ line:APIValue)->Int { var amount=Decimal(line["priceMinor"].int)*(Decimal(string:line["quantity"].string,locale:Locale(identifier:"en_US_POSIX")) ?? 0);var result=Decimal();NSDecimalRound(&result,&amount,0,.plain);return NSDecimalNumber(decimal:result).intValue }
    @MainActor static func make(snapshot:APIValue,report:APIValue,photos:[UIImage]=[])throws->Data {
        let renderer=UIGraphicsPDFRenderer(bounds:CGRect(x:0,y:0,width:595,height:842))
        let hours=ceil(report["workCharges"]["hours"].double),travel=ceil(report["workCharges"]["kilometers"].double/30)
        guard hours.isFinite,travel.isFinite,hours>=0,travel>=0,hours<Double(Int.max),travel<Double(Int.max)else{throw APIError.local("Zkontrolujte množství práce a kilometrů před exportem PDF.")}
        return renderer.pdfData{ctx in
            var y:CGFloat=42
            func page(){ctx.beginPage();y=42}
            func text(_ value:String,_ bold:Bool=false){
                guard !value.isEmpty else{return}
                let font=bold ? UIFont.boldSystemFont(ofSize:13) : UIFont.systemFont(ofSize:11)
                let attributed=NSAttributedString(string:value,attributes:[.font:font,.foregroundColor:UIColor.black])
                let setter=CTFramesetterCreateWithAttributedString(attributed)
                var offset=0
                while offset<attributed.length {
                    if y>760{page()}
                    let available=790-y
                    let path=CGPath(rect:CGRect(x:0,y:0,width:511,height:available),transform:nil)
                    let frame=CTFramesetterCreateFrame(setter,CFRange(location:offset,length:0),path,nil)
                    let count=CTFrameGetVisibleStringRange(frame).length
                    guard count>0 else{page();continue}
                    let part=attributed.attributedSubstring(from:NSRange(location:offset,length:count))
                    let height=ceil(part.boundingRect(with:CGSize(width:511,height:available),options:[.usesLineFragmentOrigin,.usesFontLeading],context:nil).height)
                    part.draw(with:CGRect(x:42,y:y,width:511,height:available),options:[.usesLineFragmentOrigin,.usesFontLeading],context:nil)
                    y+=height+12;offset+=count
                    if offset<attributed.length{page()}
                }
            }

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
            if !charges.isNull{let hours=Int(hours),travel=Int(travel);text("Práce: \(hours) započatých hodin · cesta: \(travel) bloků po 30 km",true);if let total=chargeTotal(charges){text("Práce a cesta celkem: "+APIFormat.money(.n(total)))}else{text("Sazby práce a cesty nejdříve potvrďte uložením protokolu.")}}
            if let data=Data(base64Encoded:report["customerSignature"].string.components(separatedBy:",").last ?? ""),let image=UIImage(data:data){if y+100>790{page()};text("Podpis zákazníka",true);image.draw(in:CGRect(x:42,y:y,width:240,height:90));y+=100}
            for (index,image) in photos.enumerated(){page();text("Fotodokumentace · \(index+1)",true);let scale=min(511/image.size.width,650/image.size.height);image.draw(in:CGRect(x:42,y:y,width:image.size.width*scale,height:image.size.height*scale));y+=image.size.height*scale+16}
            text(report["documentState"].string=="ready" ? "Protokol hotový" : "Rozpracovaný protokol")
        }
    }
}
