import SwiftUI

struct APIDomainAction:Identifiable {
    let id=UUID()
    let title:String
    let path:String
    var method="POST"
    var fields:[APIField]=[]
    var value:APIValue = .object([:])
    var confirmation:String?=nil
    var offline=false
    static func membership(record:APIValue,kind:String)->APIDomainAction { APIDomainAction(title:"Pracovní obory",path:"/api/workspace/"+kind+"/"+record.id+"/disciplines",method:"PUT",fields:[.array("disciplines","Příslušnost k oborům",[.choice("value","Obor","irrigation:Závlaha|garden:Garden")])],value:.object(["version":record["membershipVersion"],"disciplines":record["disciplines"],"operationId":.s(UUID().uuidString)]),confirmation:"Ověřte obory před uložením. Odebrání oboru se zakázkami může server odmítnout.") }
    static func linkCustomer(garden:APIValue)->APIDomainAction{APIDomainAction(title:"Propojit zákazníka",path:"/api/gardens/"+garden.id+"/customer",method:"PATCH",fields:[.ref("customerId","Existující zákazník","customers",required:true)],value:.object(["version":garden["version"],"customerId":garden["customerId"]]),confirmation:garden.title+"\n"+garden["address"].string+"\nZkontrolujte zahradu a zákazníka. Rozdílná adresa sama o sobě není shoda.")}
}
struct APIActionEditor:View {
    @ObservedObject var store:APIStore
    let action:APIDomainAction
    @Environment(\.dismiss) private var dismiss
    @State private var value:APIValue = .null
    @State private var options:[String:[APIValue]]=[:]
    @State private var problem:String?
    @State private var saving=false
    @State private var confirmed=false
    private var key:String{"action:"+action.path}
    var body:some View {
        NavigationStack {
            ScrollView{VStack(alignment:.leading,spacing:18){APIFieldsView(fields:action.fields,value:$value,options:options).diaryCard();if let message=action.confirmation{Text(message).font(.callout);Toggle("Údaje jsem zkontroloval/a",isOn:$confirmed)};if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}}.padding(18)}
                .background(DiaryStyle.background).navigationTitle(action.title).navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}.disabled(saving)};ToolbarItem(placement:.confirmationAction){Button("Potvrdit"){Task{await save()}}.disabled(saving || action.confirmation != nil && !confirmed)}}
        }.editLease(store).task{value=action.value;do{if action.path.hasSuffix("/disciplines"){let current=try await store.get(action.path);value=value.merged(current["membership"].selecting(["version","disciplines"]).object)};for ref in Set(action.fields.compactMap(\.reference)+action.fields.flatMap{$0.children.compactMap(\.reference)}){options[ref]=try await APIDomainLogic.referenceRows(ref,store:store)}}catch{problem=error.localizedDescription}}
    }
    func save()async{saving=true;defer{saving=false};do{for f in action.fields where f.required && value[f.id].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty{throw APIError.local("Doplňte: "+f.title)};_=try await store.write(action.path,method:action.method,body:value,offline:action.offline,operationID:value["operationId"].string.isEmpty ? nil : value["operationId"].string);dismiss()}catch{problem=error.localizedDescription}}
}
struct APIJobStatusEditor:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    var initialStatus:String?=nil
    @Environment(\.dismiss) private var dismiss
    @State private var selected:String
    @State private var reason=""
    @State private var custom=""
    @State private var problem:String?
    @State private var report=false
    @State private var busy=false
    init(store:APIStore,job:APIValue,initialStatus:String?=nil){
        self.store=store;self.job=job;self.initialStatus=initialStatus
        _selected=State(initialValue:initialStatus ?? (["done","incomplete"].contains(job["status"].string) ? job["status"].string : "in_progress"))
    }
    var body:some View {
        NavigationStack{Form{
            Picker("Stav",selection:$selected){ForEach(["planned","in_progress","incomplete","done"],id:\.self){Text(APIFormat.status($0)).tag($0)}}
            if selected=="incomplete"{
                Picker("Důvod nedokončení",selection:$reason){Text("Vyberte důvod").tag("");ForEach(["Chyběl materiál","Zákazník nebyl přítomen","Závadu nelze opravit při této návštěvě","Nutná další návštěva","Nepříznivé podmínky","Vlastní důvod"],id:\.self){Text($0).tag($0)}}
                if reason=="Vlastní důvod"{TextField("Vlastní důvod",text:$custom,axis:.vertical)}
            }
            if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
            Button("Potvrdit změnu"){Task{await save()}}.disabled(busy).accessibilityValue(APIFormat.status(selected))
        }.navigationTitle("Změnit stav").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}.disabled(busy)}}}.editLease(store).interactiveDismissDisabled(busy)
            .sheet(isPresented:$report){APIProtocolEditor(store:store,jobID:job.id,completing:true)}
    }
    func save()async{busy=true;defer{busy=false};do{
        if selected=="done" && !job["servicePeriodId"].isNull{report=true;return}
        let why=reason=="Vlastní důvod" ? custom.trimmingCharacters(in:.whitespacesAndNewlines) : reason
        if selected=="incomplete" && why.isEmpty{throw APIError.local("Vyberte a doplňte důvod nedokončení.")}
        _=try await store.write("/api/jobs/"+job.id+"/status",method:"PATCH",body:.object(["version":job["version"],"status":.s(selected),"incompleteReason":.s(selected=="incomplete" ? why : "")]))
        dismiss()
    }catch{problem=error.localizedDescription}}
}
struct APIDepartureEditor:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    var composeOnly=false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var value:APIValue = .object([:])
    @State private var problem:String?
    @State private var sms=false
    @State private var sent=false
    @State private var busy=false
    var body:some View {
        NavigationStack {
            Form {
                APIFieldsView(fields:[.field("arrivalDate","Datum příjezdu",.date,true),.field("arrivalTime","Přesný čas příjezdu",.time,true)],value:$value).disabled(sent || busy)
                if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
                Button(sent ? "Odjezd uložen" : "Potvrdit odjezd"){Task{await send()}}.disabled(sent || busy)
            }.navigationTitle("Jsem na cestě").navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}.disabled(busy)}}
        }.editLease(store).interactiveDismissDisabled(busy)
            .task{value = .object(["arrivalDate":composeOnly ? job["arrivalDate"] : .s(store.today),"arrivalTime":composeOnly ? job["arrivalTime"] : .s("")]);if composeOnly{sent=true;sms=true}}
            .confirmationDialog("Informovat zákazníka",isPresented:$sms,titleVisibility:.visible){Button("Připravit SMS"){compose()};Button("Hotovo",role:.cancel){dismiss()}} message:{Text("Zprávu zkontrolujete a odešlete v aplikaci Zprávy.")}
    }
    func send()async{guard !busy else{return};busy=true;defer{busy=false};do{guard value["arrivalTime"].string.range(of:"^([01][0-9]|2[0-3]):[0-5][0-9]$",options:.regularExpression) != nil else{throw APIError.local("Zadejte přesný čas HH:mm.")};_=try await store.write("/api/jobs/"+job.id+"/departure",method:"POST",body:value.merged(["version":job["version"]]));sent=true;sms=true}catch{problem=error.localizedDescription}}
    func compose(){let phone=job["customerContact"]["phones"].array.first?["number"].string ?? "";guard !phone.isEmpty else{problem="Zákazník nemá vyplněný telefon.";return};var c=URLComponents();c.scheme="sms";c.path=phone.filter{"+0123456789".contains($0)};c.queryItems=[URLQueryItem(name:"body",value:"Dobrý den, jsme na cestě na domluvenou zakázku. Předpokládaný příjezd v "+value["arrivalTime"].string+". "+store.company)];if let url=c.url{openURL(url);dismiss()}}
}
