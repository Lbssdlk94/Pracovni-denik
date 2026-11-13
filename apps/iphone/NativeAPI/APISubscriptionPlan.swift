import SwiftUI

struct APISubscriptionPlanRequest:Identifiable{let id=UUID();let job:APIValue}
struct APISubscriptionPlanEditor:View {
    @ObservedObject var store:APIStore
    let subscription:APIValue
    let job:APIValue
    @Environment(\.dismiss) private var dismiss
    @State private var value:APIValue = .null
    @State private var people:[APIValue]=[]
    @State private var operationID=UUID().uuidString
    @State private var problem:String?
    @State private var busy=false
    private var fields:[APIField]{[.field("dueDate","Termín návštěvy",.date,true),.ref("assignedTo","Hlavní kolega","people",required:true),.array("assignedTos","Další přiřazení kolegové",[.ref("value","Kolega","people",required:true)]),.field("startTime","Původní čas od",.time),.field("endTime","Původní čas do",.time),.field("confirm","Potvrdit návštěvu pracovníkům",.toggle)]}
    var body:some View{NavigationStack{Form{Text(job.title).font(.headline);APIFieldsView(fields:fields,value:$value,options:["people":people]);Text("Původní časové rozmezí se nepřevádí na délku práce. Tu můžete upřesnit v zakázce.").font(.footnote);if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)};Button("Uložit návštěvu"){Task{await save()}}.disabled(busy)}.navigationTitle("Potvrdit plán návštěvy").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}}}}.editLease(store).task{value=job.selecting(["id","version","dueDate","assignedTo","assignedTos","startTime","endTime"]).merged(["confirm":.bool(true)]);do{people=try await APIDomainLogic.referenceRows("people",store:store)}catch{problem=error.localizedDescription}}}
    func save()async{busy=true;defer{busy=false};do{_ = try await store.write("/api/subscriptions/"+subscription.id+"/plan",method:"POST",body:.object(["version":subscription["version"],"operationId":.s(operationID),"jobs":.array([value])]));dismiss()}catch{problem=error.localizedDescription}}
}
