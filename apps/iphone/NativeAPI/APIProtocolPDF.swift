import SwiftUI
import UIKit
import CoreText

struct APIWorkChargesEditor:View {
    @ObservedObject var store:APIStore
    @Binding var charges:APIValue
    var suggestedHours:Double?=nil
    @State private var rate:APIValue = .null
    @State private var enabled=false
    var body:some View{DisclosureGroup("Práce a cesta"){
        Toggle("Zahrnout práci a cestu",isOn:$enabled).onChange(of:enabled){_,on in if !on{charges = .null}else if charges.isNull{charges = .object(["rateId":rate["id"],"hours":.number(suggestedHours ?? 0),"kilometers":.n(0),"hourlyMinor":rate["hourlyMinor"],"travelRateMinor":rate["travelMinor"],"currency":.s("CZK")])}}
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

            page();text(report["protocolDetails"]["template"]["name"].string.isEmpty ? "SERVISNÍ PROTOKOL" : report["protocolDetails"]["template"]["name"].string.uppercased(),true)
            text(snapshot["job"]["title"].string,true);text("Datum provedení: "+report["date"].string)
            let billing=report["billingDetails"].isNull ? snapshot["billingPreview"] : report["billingDetails"]
            for (key,label) in [("company","Dodavatel"),("customer","Zákazník")] {var b=billing[key];if key=="customer",b["name"].string.isEmpty{b["name"]=snapshot["job"]["customerName"];if b["address"].string.isEmpty{b["address"]=snapshot["job"]["address"]}};text(label,true);text([b["name"].string,b["address"].string,b["companyId"].string.isEmpty ? "" : "IČO: "+b["companyId"].string,b["taxId"].string.isEmpty ? "" : "DIČ: "+b["taxId"].string,b["email"].string,b["phone"].string,b["bankAccount"].string].filter{!$0.isEmpty}.joined(separator:"\n"))}
            text("Místo: "+snapshot["job"]["address"].string)
            var totals:[String:Int]=[:]
            for f in APISchemas.service where f.id != "date"{if !report[f.id].string.isEmpty{text(f.title,true);text(report[f.id].string)}}
            if !report["materialItems"].array.isEmpty{text("Použitý materiál",true)}
            for line in report["materialItems"].array{let total=lineTotal(line),currency=line["currency"].string;totals[currency,default:0]+=total;text([line["name"].string,line["sku"].string,line["quantity"].string+" "+line["unit"].string,APIFormat.money(line["priceMinor"],currency:currency),APIFormat.money(.n(total),currency:currency)].filter{!$0.isEmpty}.joined(separator:" · "))}
            for currency in totals.keys.sorted(){text("Materiál celkem: "+APIFormat.money(.n(totals[currency]!),currency:currency),true)}
            let time=report["protocolDetails"]["timeSnapshot"]
            if !time.isNull{text("Práce a cesta – evidence zakázky",true);for row in APIProtocolLogic.timeRows(time){text(row["name"].string+" · práce "+APIAttendanceLogic.hours(row["workMs"].double)+" · cesta "+APIAttendanceLogic.hours(row["travelMs"].double)+(row["open"].bool ? " · otevřený interval není započten" : ""))}}
            let status=report["protocolDetails"]["signature"]["status"].string
            if !status.isEmpty{text("Potvrzení zákazníka: "+APIProtocolSignatureStatus.title(status));let sig=report["protocolDetails"]["signature"];if !sig["signedAt"].isNull{text(sig["name"].string+" · "+APIAttendanceView.date(sig["signedAt"])+" "+APIAttendanceView.time(sig["signedAt"])+" · verze "+sig["signedVersion"].string)}}
            let charges=report["workCharges"]
            if !charges.isNull{let hours=Int(hours),travel=Int(travel);text("Práce: \(hours) započatých hodin · cesta: \(travel) bloků po 30 km",true);if let total=chargeTotal(charges){text("Práce a cesta celkem: "+APIFormat.money(.n(total)))}else{text("Sazby práce a cesty nejdříve potvrďte uložením protokolu.")}}
            if let data=Data(base64Encoded:report["customerSignature"].string.components(separatedBy:",").last ?? ""),let image=UIImage(data:data){if y+100>790{page()};text("Podpis zákazníka",true);image.draw(in:CGRect(x:42,y:y,width:240,height:90));y+=100}
            for (index,image) in photos.enumerated(){page();text("Fotodokumentace · \(index+1)",true);let ids=APIProtocolExport.photoIDs(report);if ids.indices.contains(index){text(report["protocolDetails"]["photos"].array.first{$0.id==ids[index]}?["caption"].string ?? "")};let scale=min(511/image.size.width,650/image.size.height);image.draw(in:CGRect(x:42,y:y,width:image.size.width*scale,height:image.size.height*scale));y+=image.size.height*scale+16}
            text(report["documentState"].string=="ready" ? "Protokol hotový" : "Rozpracovaný protokol")
        }
    }
}
