import SwiftUI

struct APISubscriptionContent:View {
    @ObservedObject var store:APIStore
    let snapshot:APIValue
    let subscription:APIValue
    @Binding var action:APIDomainAction?
    @State private var contract:APIRoute?
    var periods:[APIValue]{subscription["periods"].array.isEmpty ? snapshot["periods"].array : subscription["periods"].array}
    var body:some View{VStack(alignment:.leading,spacing:18){Text(subscription["customerName"].string).font(.title2.bold());Text(APIFormat.status(subscription["status"].string));
        ForEach(Array(periods.enumerated()),id:\.offset){_,period in
            DisclosureGroup(period["startDate"].string+"–"+period["endDate"].string){
                Text(period["snapshot"]["name"].string).font(.headline)
                if store.manager{Text("Sjednaná cena: "+APIFormat.money(period["agreedPrice"],currency:period["snapshot"]["currency"].string));Text(APIFormat.status(period["paymentStatus"].string))}
                ForEach(Array(period["services"].array.enumerated()),id:\.offset){_,s in Text(s["name"].string+": zbývá "+s["remaining"].string)}
                if store.manager{
                    Button("Potvrdit plán a plánovat postupně"){action=make("confirm-plan",title:"Potvrdit plán",period:period,fields:[],extra:[:])}
                    Button("Přidat návštěvu"){let services=period["snapshot"]["services"].array;action=make("visit",title:"Naplánovat návštěvu",period:period,fields:[APIField(id:"serviceId",title:"Služba",kind:.choice,required:true,choices:services.map{APIChoice(id:$0.id,title:$0["name"].string)}),.field("date","Datum",.date,true),.ref("assignedTo","Pracovník","people",required:true),.field("startTime","Původní čas od",.time),.field("endTime","Původní čas do",.time)],extra:["jobId":.s(UUID().uuidString),"date":.s(store.today),"confirm":.bool(true)])}
                    Button("Evidovat platbu"){action=make("payment",title:"Platba",period:period,fields:[.choice("paymentStatus","Stav platby","unpaid:Neuhrazené|partial:Částečně uhrazené|paid:Uhrazené|overdue:Po splatnosti"),.field("amount","Přijatá částka",.money),.field("date","Datum přijetí",.date),.field("note","Poznámka",.notes)],extra:["paymentStatus":period["paymentStatus"],"date":.s(store.today)])}
                }
            }.diaryCard()
        }
        if store.manager{
            Button("Změnit nebo prodloužit tarif"){let r=APIResource(entity:.subscriptions,seed:.object(["existingId":.s(subscription.id),"version":subscription["version"],"customerId":subscription["customerId"],"gardenId":subscription["gardenId"]]));contract=APIRoute(resource:r,value:r.initial(store))}.frame(minHeight:44)
            Button("Stav předplatného"){action=APIDomainAction(title:"Stav předplatného",path:"/api/subscriptions/"+subscription.id+"/state",fields:[.choice("status","Stav","active:Aktivní|paused:Pozastavené|ended:Ukončené")],value:.object(["version":subscription["version"],"operationId":.s(UUID().uuidString),"status":subscription["status"]]))}.frame(minHeight:44)
        }
        DisclosureGroup("Plánované návštěvy"){ForEach(Array(subscription["jobs"].array.enumerated()),id:\.offset){_,job in NavigationLink(job["title"].string+" · "+job["dueDate"].string){APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)}}}.diaryCard()
    }.sheet(item:$contract){r in APISubscriptionActivation(store:store,initial:r.value)}}
    func make(_ name:String,title:String,period:APIValue,fields:[APIField],extra:[String:APIValue])->APIDomainAction{APIDomainAction(title:title,path:"/api/subscriptions/"+subscription.id+"/"+name,fields:fields,value:APIValue.object(["version":subscription["version"],"operationId":.s(UUID().uuidString),"periodId":period["id"]]).merged(extra))}
}
struct APISubscriptionActivation:View {
    @ObservedObject var store:APIStore
    let initial:APIValue
    @Environment(\.dismiss)private var dismiss
    @State private var value:APIValue = .null
    @State private var mode="activate"
    @State private var options:[String:[APIValue]]=[:]
    @State private var problem:String?
    @State private var saved=false
    var fields:[APIField]{[.ref("customerId","Zákazník","customers",required:true),.ref("gardenId","Konkrétní zahrada","gardens"),.ref("tariffId","Tarif","tariffs",required:true),.field("startDate","Platnost od / účinnost změny",.date,true),.field("endDate","Platnost do",.date),.field("agreedPrice","Sjednaná cena",.money),.choice("settlement","Vypořádání čerpání","reset:Nové čerpání|carry:Přenést vyčerpané služby"),.field("planLater","Návštěvy plánovat později",.toggle),.ref("assignedTo","Pracovník pro automatický návrh","people"),.field("autoConfirm","Automaticky potvrdit návrhy",.toggle)]}
    var body:some View{NavigationStack{Form{if !initial["existingId"].string.isEmpty{Picker("Změna",selection:$mode){Text("Změnit tarif").tag("change");Text("Prodloužit").tag("renew")}};APIFieldsView(fields:fields,value:$value,options:options);if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)};Button("Uložit předplatné"){Task{await save()}}.disabled(saved)}.navigationTitle("Servisní předplatné").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}}}}.task{value=initial.merged(["operationId":.s(UUID().uuidString),"periodId":.s(UUID().uuidString),"startDate":.s(store.today),"endDate":.s(""),"planLater":.bool(true),"autoConfirm":.bool(false),"settlement":.s("reset")]);if !initial["existingId"].string.isEmpty{mode="renew"};do{for ref in ["customers","gardens","tariffs","people"]{options[ref]=try await APIDomainLogic.referenceRows(ref,store:store)}}catch{problem=error.localizedDescription}}}
    func save()async{do{
        var body=value.selecting(fields.map(\.id)+["version","operationId","periodId"])
        if body["version"].isNull{body["version"] = .n(0)}
        if body["endDate"].string.isEmpty{var o=body.object;o.removeValue(forKey:"endDate");body = .object(o)}
        if body["gardenId"].string.isEmpty{body["gardenId"] = .null}
        if body["agreedPrice"].isNull{var o=body.object;o.removeValue(forKey:"agreedPrice");body = .object(o)}
        if let tariff=options["tariffs"]?.first(where:{$0.id==body["tariffId"].string}){body["tariffVersion"]=tariff["version"]}
        let id=initial["existingId"].string.isEmpty ? initial.id : initial["existingId"].string
        _=try await store.write("/api/subscriptions/"+id+"/"+mode,method:"POST",body:body);saved=true;dismiss()
    }catch{problem=error.localizedDescription}}
}
struct APIVehiclesHome:View {
    @ObservedObject var store:APIStore
    @State private var data:APIValue = .null
    @State private var selected=""
    @State private var problem:String?
    var vehicle:APIValue{data["vehicles"].array.first{$0.id==selected} ?? .null}
    var body:some View{ScrollView{VStack(alignment:.leading,spacing:18){Picker("Vybrat auto",selection:$selected){Text("Vyberte auto").tag("");ForEach(Array(data["vehicles"].array.enumerated()),id:\.offset){_,v in Text(v["name"].string+" · "+v["plate"].string).tag(v.id)}}.pickerStyle(.menu).diaryCard()
        if !store.manager && data["driver"]["enabled"].bool && store.enabled("fleetDriverSelection"){Button("Uložit moje auto"){Task{await select()}}.frame(minHeight:44)}
        if !vehicle.isNull{
            if store.enabled("fleetFuel") && store.writer{DiaryTile(title:"Přidat tankování",subtitle:vehicle["name"].string,symbol:"fuelpump"){let r=APIResource(entity:.entries,parent:selected,seed:.object(["odometer":vehicle["odometer"]]));store.route=APIRoute(resource:r,value:r.initial(store),isNew:true)}}
            NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.vehicles),initial:vehicle)}label:{Label("Podrobnosti vozidla",systemImage:"chevron.right").frame(minHeight:44).diaryCard()}
        }
        if store.manager{NavigationLink("Správa vozidel"){APIResourceList(store:store,resource:APIResource(entity:.vehicles))}.frame(minHeight:44);NavigationLink("Řidiči"){APIResourceList(store:store,resource:APIResource(entity:.drivers))}.frame(minHeight:44)}
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
    }.padding(18)}.background(DiaryStyle.background).navigationTitle("Vozidla").task(id:store.revision){do{data=try await store.get("/api/vehicles");if selected.isEmpty{selected=data["driver"]["vehicleId"].string}}catch{problem=error.localizedDescription}}}
    func select()async{do{_=try await store.write("/api/vehicles/selection",method:"PUT",body:.object(["operationId":.s(UUID().uuidString),"version":data["driver"]["version"],"vehicleId":selected.isEmpty ? .null : .s(selected)]));problem="Auto je přiřazené."}catch{problem=error.localizedDescription}}
}
struct APIHistoryVisit:View {
    @ObservedObject var store:APIStore
    let visit:APIValue
    var body:some View{VStack(alignment:.leading,spacing:14){Text(visit["date"].string).font(.headline);Text(APIFormat.status(visit["status"].string));Text(visit["technician"].string);ForEach(["work","material","defects","notes","recommendations"],id:\.self){key in if !visit[key].string.isEmpty{Text(visit[key].string).textSelection(.enabled)}};if !visit["jobId"].string.isEmpty{NavigationLink("Původní zakázka a protokol"){APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:.object(["id":visit["jobId"],"title":visit["title"]]))}}}.diaryCard()}
}
struct APINoticeContent:View {
    @ObservedObject var store:APIStore
    let notice:APIValue
    @State private var problem:String?
    var body:some View{VStack(alignment:.leading,spacing:14){Text(notice["title"].string).font(.title2.bold());Text(notice["body"].string);if notice["kind"].string.hasPrefix("job") || notice["kind"].string.contains("service"){NavigationLink("Otevřít související zakázku"){APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:.object(["id":notice["resourceId"],"title":.s("Zakázka")]))}};Button("Označit přečtené"){Task{do{_=try await store.write("/api/notifications/read",method:"POST",body:.object(["ids":.array([.s(notice.id)])]))}catch{problem=error.localizedDescription}}};if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}}.diaryCard()}
}
