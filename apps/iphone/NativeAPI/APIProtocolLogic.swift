import Foundation
import CryptoKit

enum APIProtocolLogic {
    static let sections:[(String,String,String)]=[("work","Provedené práce","checklist"),("materialItems","Použitý materiál","shippingbox"),("material","Poznámka k materiálu","note.text"),("defects","Zjištěné závady","exclamationmark.triangle"),("notes","Poznámky","note.text"),("recommendations","Doporučení pro příště","calendar.badge.checkmark"),("photos","Fotodokumentace","camera"),("time","Práce a cesta","clock"),("signature","Podpis zákazníka","signature")]
    static let fallback:APIValue = .object(["id":.s("legacy"),"name":.s("Servisní protokol"),"sections":.array(sections.map{.s($0.0)}),"required":.array([.s("date")]),"activities":.array([])])
    static func work(_ report:APIValue)->String{let d=report["protocolDetails"];return (d["activities"].array.map{"• "+$0["title"].string}+[d["customWork"].string]).filter{!$0.isEmpty}.joined(separator:"\n")}
    static func payloadReport(_ report:APIValue,modern:Bool)->APIValue {
        var r=report.selecting(APISchemas.service.map(\.id)+["materialItems","photoIds","customerSignature","workCharges"])
        if modern {var d=report["protocolDetails"];d["signature"]=d["signature"].selecting(["status","name","signedAt","at"]);var fields=d.object;fields.removeValue(forKey:"template");fields.removeValue(forKey:"timeSnapshot");d = .object(fields);r["protocolDetails"]=d;r["work"] = .s(work(report))}
        return r
    }
    static func missing(_ report:APIValue,template:APIValue)->[String]{
        var required=Set(template["required"].array.map(\.string));required.insert("date");if template["signatureRequired"].bool{required.insert("signature")};if template["photosRequired"].bool{required.insert("photos")}
        let r=report.merged(["work":report["protocolDetails"]["schema"].int==1 ? .s(work(report)) : report["work"]])
        var missing=required.filter{k in switch k{case "signature":return report["customerSignature"].string.isEmpty || report["protocolDetails"]["signature"]["status"].string != "signed";case "photos":return report["photoIds"].array.isEmpty;case "materialItems":return report[k].array.isEmpty;default:return report[k].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty}}
        if !["work","material","defects","notes","recommendations"].contains(where:{!r[$0].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty}) && r["materialItems"].array.isEmpty && r["photoIds"].array.isEmpty{missing.insert("content")}
        return missing.sorted()
    }
    static func readiness(_ report:APIValue,template:APIValue)->Double{let total=Set(template["required"].array.map(\.string)+["date","content"]+(template["signatureRequired"].bool ? ["signature"]:[])+(template["photosRequired"].bool ? ["photos"]:[])).count;return Double(max(0,total-missing(report,template:template).count))/Double(max(1,total))}
    static func fingerprint(_ report:APIValue)->String {
        var r=payloadReport(report,modern:true);r["customerSignature"] = .null
        var d=r["protocolDetails"];d["template"]=report["protocolDetails"]["template"];d["timeSnapshot"]=report["protocolDetails"]["timeSnapshot"];for k in ["signature","contentHash","confirmSignature","refreshTime"]{d[k] = .null};r["protocolDetails"]=d;if !d["customerNotes"].bool{r["notes"] = .null}
        return SHA256.hash(data:(try? r.data()) ?? Data()).map{String(format:"%02x",$0)}.joined()
    }
    static func quantity(_ text:String)throws->Double{let raw=text.trimmingCharacters(in:.whitespacesAndNewlines).replacingOccurrences(of:",",with:".");guard raw.range(of:"^([0-9]{1,7})(\\.[0-9]{1,3})?$",options:.regularExpression) != nil,let amount=Double(raw),amount>0,amount<=1000000 else{throw APIError.local("Množství musí být kladné číslo s nejvýše třemi desetinnými místy.")};return amount}
    static func setQuantity(_ text:String,index:Int,lines:APIValue)throws->APIValue{let q=try quantity(text);var rows=lines.array;guard rows.indices.contains(index)else{throw APIError.local("Položka již není v protokolu.")};rows[index]["quantity"] = .number(q);return .array(rows)}
    static func timeRows(_ time:APIValue)->[APIValue]{time["workers"].array.map{worker in let rows=time["intervals"].array.filter{$0["userId"].string==worker["userId"].string};func total(_ kind:String)->Double{rows.filter{$0["kind"].string==kind && !$0["endAt"].isNull}.reduce(0){$0+max(0,$1["endAt"].double-$1["startAt"].double)}};return worker.merged(["workMs":.number(total("work")),"travelMs":.number(total("travel")),"open":.bool(rows.contains{$0["endAt"].isNull})])}}
}
