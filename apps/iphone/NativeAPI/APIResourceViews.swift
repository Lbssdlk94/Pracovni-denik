import SwiftUI

struct APIResourceList: View {
    @ObservedObject var store: APIStore
    let resource: APIResource
    @State private var rows: [APIValue] = []
    @State private var query = ""
    @State private var cursor = ""
    @State private var problem: String?
    @State private var loading = false
    @State private var requestID=UUID()
    @StateObject private var location=APILocation()
    @State private var categories:[APIValue]=[]
    @State private var category=""
    @State private var onlyMine = false
    var visible: [APIValue] { rows.filter { row in
        let matches=query.isEmpty || [row.title,row["address"].string,row["sku"].string,row["customerName"].string].joined(separator:" ").localizedCaseInsensitiveContains(query)
        let garden=resource.seed["gardenId"].string,customer=resource.seed["customerId"].string
        return matches && (category.isEmpty || row["categoryId"].string==category) && (garden.isEmpty || row["gardenId"].string == garden || resource.entity == .gardens && row.id == garden) && (customer.isEmpty || row["customerId"].string == customer) && (!onlyMine || row["assignedTo"].string == store.userID)
    } }
    var body: some View {
        List {
            if resource.entity == .gardens && store.enabled("location") && store.enabled("nearby"){Button("Ukázat přibližné vzdálenosti"){Task{_ = await location.capture()}}}
            if resource.entity == .materials {Picker("Kategorie",selection:$category){Text("Všechny kategorie").tag("");ForEach(categories,id:\.id){Text($0.title).tag($0.id)}};if store.manager{NavigationLink("Správa kategorií"){APIResourceList(store:store,resource:APIResource(entity:.categories))}}}
            if resource.entity == .subscriptions && store.manager{NavigationLink("Správa tarifů"){APIResourceList(store:store,resource:APIResource(entity:.tariffs))}}
            if resource.entity == .defects { Section { Toggle("Moje závady",isOn:$onlyMine) } }
            if loading && rows.isEmpty { ProgressView("Načítám…") }
            if let problem { Text(problem).foregroundStyle(DiaryStyle.warning) }
            ForEach(Array(visible.enumerated()),id:\.offset) { _,row in
                NavigationLink { APIEntityDetail(store:store,resource:resource,initial:row) } label: { APIRecordRow(entity:resource.entity,value:row,distance:resource.entity == .gardens ? APIPlaces.distance(row,from:location.position) : nil) }
                    .listRowBackground(DiaryStyle.surface).accessibilityIdentifier("api-record-"+row.id)
            }
            if !loading && visible.isEmpty { Text("Žádné záznamy pro tento výběr.").foregroundStyle(.secondary) }
            if !cursor.isEmpty { Button("Načíst další") { Task { await load(more:true) } }.frame(minHeight:44) }
        }.listStyle(.insetGrouped).scrollContentBackground(.hidden).background(DiaryStyle.background)
            .navigationTitle(resource.title).navigationBarTitleDisplayMode(.inline).searchable(text:$query,prompt:"Hledat")
            .toolbar { if resource.entity.canCreate && resource.editable(store) { ToolbarItem(placement:.topBarTrailing) { Button { create() } label:{Image(systemName:"plus")}.accessibilityLabel("Přidat záznam") } } }
            .task(id:store.scope+store.revision.uuidString) { await load() }.refreshable { await store.resume();await load() }
    }
    func create() {
        if resource.entity == .subscriptions { store.route = APIRoute(resource:resource,value:resource.initial(store),isNew:true) }
        else { store.route=APIRoute(resource:resource,value:resource.initial(store),isNew:true) }
    }
    func load(more:Bool=false) async {
        if more && loading{return};let ticket=UUID();requestID=ticket;loading=true;defer{if requestID==ticket{loading=false}};let scope=store.scope
        do {
            var c=URLComponents(string:resource.listPath)!
            if more { var q=c.queryItems ?? [];q.append(URLQueryItem(name:resource.entity == .materials ? "after" : "cursor",value:cursor));c.queryItems=q }
            let page=try await store.get(c.string!)
            guard scope==store.scope,requestID==ticket else {return}
            let values=page[resource.listKey].array
            if resource.entity == .materials{categories=page["categories"].array}
            rows=more ? rows+values.filter { value in !rows.contains(where:{$0.id==value.id}) } : values
            cursor=page["nextCursor"].string;problem=nil
            if (!resource.seed["gardenId"].string.isEmpty || !resource.seed["customerId"].string.isEmpty) && !cursor.isEmpty{loading=false;await load(more:true)}
        } catch is CancellationError{} catch {if requestID==ticket{problem=error.localizedDescription}}
    }
}
struct APIRecordRow: View {
    let entity: APIEntity
    let value: APIValue
    var distance:String?=nil
    var body: some View {
        HStack(spacing:13) {
            Image(systemName:entity.symbol).font(.title3).foregroundStyle(DiaryStyle.accent).frame(width:42,height:42).background(DiaryStyle.soft,in:RoundedRectangle(cornerRadius:13))
            VStack(alignment:.leading,spacing:5) {
                Text(entity == .jobs && !value["customerName"].string.isEmpty ? value["customerName"].string : value.title).font(.headline).fixedSize(horizontal:false,vertical:true)
                if let distance{Text(distance).font(.caption).foregroundStyle(.secondary)}
                if entity == .jobs {
                    if value.title != value["customerName"].string {Text(value.title).font(.subheadline).foregroundStyle(.secondary)}
                    Text([APIFormat.status(value["status"].string),value["dueDate"].string,value["plannedStart"].string].filter{!$0.isEmpty}.joined(separator:" · ")).font(.caption).foregroundStyle(.secondary)
                    if value["status"].string == "done" { Text(APIFormat.protocolState(value["protocolStatus"].string)).font(.caption).foregroundStyle(DiaryStyle.accent) }
                }
                if entity == .defects { Text(APIFormat.status(value["status"].string)+" · "+value["discoveredOn"].string).font(.caption).foregroundStyle(value["status"].string == "resolved" ? Color.secondary : DiaryStyle.warning) }
                if entity == .materials { Text([value["sku"].string,APIFormat.money(value["priceMinor"],currency:value["currency"].string)+" / "+value["unit"].string].filter{!$0.isEmpty}.joined(separator:" · ")).font(.caption).foregroundStyle(.secondary) }
                if entity == .entries { Text(APIFormat.money(value["costMinor"])+" · "+value["date"].string).font(.caption).foregroundStyle(.secondary) }
                if entity == .subscriptions { Text([value["customerName"].string,APIFormat.status(value["status"].string)].filter{!$0.isEmpty}.joined(separator:" · ")).font(.caption).foregroundStyle(.secondary) }
            }.frame(maxWidth:.infinity,alignment:.leading)
            if entity == .customers, let phone=value["phones"].array.first?["number"].string,let url=URL(string:"tel:"+phone.filter{"+0123456789".contains($0)}) { Link(destination:url){Image(systemName:"phone").frame(width:44,height:44)}.accessibilityLabel("Zavolat") }
        }.padding(.vertical,8)
    }
}
enum APIFormat {
    static func date(_ value:APIValue)->String{let date=Date(timeIntervalSince1970:value.double/1000);return date.formatted(.dateTime.day().month().year())}
    static func status(_ value:String)->String { ["planned":"Naplánováno","on_way":"Na cestě","in_progress":"Probíhá","done":"Hotovo","incomplete":"Nedokončeno","new":"Nová","awaiting_part":"Čeká na díl","repair_planned":"Oprava naplánována","resolved":"Vyřešeno","active":"Aktivní","paused":"Pozastavené","ended":"Ukončené","unpaid":"Neuhrazené","paid":"Uhrazené","partial":"Částečně uhrazené","overdue":"Po splatnosti","accepted":"Převzato","clarification":"Potřebuje upřesnit","pending":"Čeká na převzetí"][value] ?? value }
    static func protocolState(_ value:String)->String { ["ready":"Protokol hotový","draft":"Protokol rozpracovaný"][value] ?? "Protokol chybí" }
    static func money(_ value:APIValue,currency:String="CZK")->String { let f=NumberFormatter();f.numberStyle = .currency;f.currencyCode=currency.isEmpty ? "CZK" : currency;f.locale=Locale(identifier:"cs_CZ");return f.string(from:NSDecimalNumber(value:value.double/100)) ?? value.string }
    static func navigation(_ address:String)->URL? { guard !address.isEmpty else{return nil};var c=URLComponents(string:"https://maps.apple.com/")!;c.queryItems=[URLQueryItem(name:"daddr",value:address)];return c.url }
}
struct APIEntityDetail: View {
    @ObservedObject var store: APIStore
    let resource: APIResource
    let initial: APIValue
    @State private var value: APIValue = .null
    @State private var detail: APIValue = .null
    @State private var defects: [APIValue] = []
    @State private var problem: String?
    @State private var unavailable=false
    @State private var deleteConfirm = false
    @State private var action: APIDomainAction?
    private var record: APIValue { value.isNull ? initial : value }
    var body: some View {
        ScrollView {
            VStack(alignment:.leading,spacing:18) {
                if unavailable{Text("Záznam není dostupný pro tento účet.")}else{
                if !defects.isEmpty {
                    NavigationLink { APIResourceList(store:store,resource:APIResource(entity:.defects,seed:.object(["gardenId":record["gardenId"].isNull ? .s(record.id) : record["gardenId"]]))) } label:{Label("Pozor: \(defects.count) nevyřešené závady",systemImage:"exclamationmark.triangle.fill").font(.headline).foregroundStyle(DiaryStyle.warning).diaryCard()}
                }
                if resource.entity == .jobs { APIJobDetailContent(store:store,job:record,action:$action) }
                else if resource.entity == .customers { customer }
                else if resource.entity == .gardens { garden }
                else if resource.entity == .defects { defect }
                else if resource.entity == .vehicles { vehicle }
                else if resource.entity == .notifications { APINoticeContent(store:store,notice:record) }
                else if resource.entity == .subscriptions { APISubscriptionContent(store:store,snapshot:detail,subscription:record,action:$action) }
                else if resource.entity == .team { APITeamContent(store:store,member:record,action:$action) }
                else {
                    APIReadFields(value:record,fields:resource.fields).diaryCard()
                    if resource.entity == .entries {
                        if !record["authorName"].string.isEmpty { Text("Přidal/a: "+record["authorName"].string).font(.footnote) }
                        APIFilesView(store:store,path:"/api/vehicles/"+resource.parent+"/entries/"+record.id+"/receipts",mode:.receipts,record:record)
                    }
                    if resource.entity == .history { APIHistoryVisit(store:store,visit:record) }
                }
                }
                if resource.entity == .tariffs && store.manager{Button("Duplikovat tarif"){var copy=record;copy["id"] = .s(UUID().uuidString);copy["version"] = .n(0);copy["definition"]["name"] = .s(record["definition"]["name"].string+" – kopie");store.route=APIRoute(resource:resource,value:copy,isNew:true)}}
                if let problem { DiaryStatusBanner(text:problem,warning:true) }
                DisclosureGroup("Doplňující údaje") { Text("ID: "+record.id).font(.caption).textSelection(.enabled);Text("Verze: "+record["version"].string).font(.caption) }.diaryCard()
                if store.manager && [.jobs,.materials,.categories,.services,.vehicles,.subscriptions].contains(resource.entity) {
                    DisclosureGroup("Správa záznamu") { Button("Smazat záznam",role:.destructive){deleteConfirm=true}.frame(minHeight:44) }.diaryCard()
                }
            }.padding(18)
        }.background(DiaryStyle.background).navigationTitle(record.title).navigationBarTitleDisplayMode(.inline)
            .toolbar { if resource.editable(store) && !resource.fields.isEmpty { ToolbarItem(placement:.topBarTrailing){Button("Upravit"){store.route=APIRoute(resource:resource,value:record)}} } }
            .task(id:store.scope+store.revision.uuidString){await load()}.refreshable{await store.resume();await load()}
            .sheet(item:$action) { APIActionEditor(store:store,action:$0) }
            .confirmationDialog("Opravdu smazat tento záznam?",isPresented:$deleteConfirm,titleVisibility:.visible){Button("Smazat",role:.destructive){Task{await remove()}};Button("Zrušit",role:.cancel){}}
    }
    private var customer: some View {
        VStack(spacing:18) {
            DisclosureGroup("Kontakt a adresa") {
                APIReadFields(value:record,fields:resource.fields.filter{["name","email","phones","addresses","contactNotes"].contains($0.id)})
                ForEach(Array(record["phones"].array.enumerated()),id:\.offset){_,p in if let url=URL(string:"tel:"+p["number"].string.filter{"+0123456789".contains($0)}){Link("Zavolat "+p["number"].string,destination:url).frame(minHeight:44)}}
            }.diaryCard()
            link("Zahrady",.gardens,seed:.object(["customerId":.s(record.id)]))
            link("Zakázky",.jobs,seed:.object(["customerId":.s(record.id)]))
            if store.enabled("subscriptions") { link("Servisní předplatné",.subscriptions,seed:.object(["customerId":.s(record.id)])) }
            DisclosureGroup("Fakturační údaje"){APIReadFields(value:record["billing"],fields:APISchemas.billing)}.diaryCard()
            if store.manager,!store.me["workspace"].isNull { Button("Zařazení do oborů"){action=APIDomainAction.membership(record:record,kind:"customers")}.buttonStyle(.bordered).frame(minHeight:44) }
        }
    }
    private var garden: some View {
        VStack(spacing:18) {
            DisclosureGroup("Kontakt a adresa") {
                Text(record["address"].string).textSelection(.enabled)
                if let url=APIFormat.navigation(record["address"].string){Link("Navigovat",destination:url).frame(minHeight:44)}
                if !record["customerId"].string.isEmpty { NavigationLink("Otevřít zákazníka"){APIEntityDetail(store:store,resource:APIResource(entity:.customers),initial:.object(["id":record["customerId"],"name":.s("Zákazník")]))}.frame(minHeight:44) }
                if store.manager { Button("Přiřadit existujícího zákazníka"){action=APIDomainAction.linkCustomer(garden:record)}.frame(minHeight:44) }
            }.diaryCard()
            link("Zakázky",.jobs,seed:.object(["gardenId":.s(record.id),"customerId":record["customerId"],"address":record["address"],"city":record["addressDetails"]["city"],"customerAddressId":record["addressDetails"]["customerAddressId"]]))
            if store.enabled("gardenHistory"){link("Historie a servis",.history,parent:record.id)}
            if store.enabled("defects"){link("Závady",.defects,seed:.object(["gardenId":.s(record.id)]))}
            if store.enabled("service"){link("Samostatné servisní zápisy",.services,parent:record.id)}
            if store.enabled("shafts"){link("Šachty a fotodokumentace",.shafts,seed:.object(["gardenId":.s(record.id)]))}
            if store.enabled("blowout"){NavigationLink{APIBlowoutView(store:store,garden:record)}label:{category("Vyfukování","wind")}}
            if store.enabled("plans"){NavigationLink{APIPlanView(store:store,garden:record)}label:{category("Plán zahrady","map")}}
            DisclosureGroup("Technické údaje"){APIReadFields(value:record,fields:resource.fields.filter{["notes","pumpType","sharedDescription"].contains($0.id)})}.diaryCard()
        }
    }
    private var defect: some View {
        VStack(alignment:.leading,spacing:16) {
            Label(record["status"].string == "resolved" ? "Vyřešená závada" : "Otevřená závada",systemImage:"exclamationmark.triangle").foregroundStyle(record["status"].string == "resolved" ? DiaryStyle.accent : DiaryStyle.warning)
            APIReadFields(value:record,fields:resource.fields.filter{!["repairJobIds","sourceJobId","gardenId"].contains($0.id)}).diaryCard()
            if !record["sourceJobId"].string.isEmpty { NavigationLink("Původní zakázka"){APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:.object(["id":record["sourceJobId"],"title":.s("Zdrojová zakázka")]))} }
            if store.manager { Button("Naplánovat opravu"){Task{await planRepair()}}.buttonStyle(.borderedProminent).frame(minHeight:44) }
            DisclosureGroup("Historie změn") { ForEach(Array(detail["events"].array.enumerated()),id:\.offset){_,e in VStack(alignment:.leading){Text(e["actorName"].string).font(.headline);Text(APIFormat.status(e["record"]["status"].string));Text(e["record"]["nextStep"].string)}.padding(.vertical,6)} }.diaryCard()
        }
    }
    private var vehicle: some View {
        VStack(spacing:18) {
            if record["hasPhoto"].bool { APIAuthenticatedImage(store:store,path:resource.recordPath(record.id)+"/photo") }
            if store.writer && store.enabled("fleetFuel") { Button("Přidat tankování"){let r=APIResource(entity:.entries,parent:record.id,seed:.object(["odometer":record["odometer"]]));store.route=APIRoute(resource:r,value:r.initial(store),isNew:true)}.buttonStyle(.borderedProminent).frame(minHeight:44) }
            link("Tankování a provozní záznamy",.entries,parent:record.id)
            DisclosureGroup("Podrobnosti vozidla"){APIReadFields(value:record,fields:resource.fields)}.diaryCard()
            if store.enabled("fleetConsumption"),!detail["consumption"].isNull { DisclosureGroup("Spotřeba"){Text(detail["consumption"].string+" l / 100 km mezi plnými nádržemi")}.diaryCard() }
            if store.manager && store.enabled("fleetPhotos") && store.enabled("photoUploads") { APIFilesView(store:store,path:resource.recordPath(record.id)+"/photo",mode:.vehicle,record:record) }
        }
    }
    private func category(_ title:String,_ symbol:String)->some View { HStack{Label(title,systemImage:symbol).font(.headline);Spacer();Image(systemName:"chevron.right")}.foregroundStyle(DiaryStyle.accent).frame(minHeight:44).diaryCard() }
    private func link(_ title:String,_ entity:APIEntity,parent:String="",seed:APIValue = .object([:]))->some View { NavigationLink{APIResourceList(store:store,resource:APIResource(entity:entity,parent:parent,seed:seed))}label:{category(title,entity.symbol)} }
    func load() async {
        let scope=store.scope
        do {
            if [.jobs,.customers,.defects,.vehicles,.subscriptions].contains(resource.entity) {
                let response=try await store.get(resource.recordPath(initial.id));guard scope==store.scope else{return};detail=response;value=response[resource.recordKey].isNull ? response : response[resource.recordKey]
            } else {
                let response=try await store.get(resource.listPath);guard scope==store.scope else{return};detail=response;value=response[resource.listKey].array.first(where:{$0.id==initial.id}) ?? initial
            }
            let garden=resource.entity == .gardens ? record.id : record["gardenId"].string
            if !garden.isEmpty && store.enabled("defects") { let response=try await store.get("/api/defects?gardenId="+garden);guard scope==store.scope else{return};defects=response["defects"].array.filter{$0["status"].string != "resolved"} }
            problem=nil
        }catch{if let e=error as? APIError,[403,404].contains(e.status){unavailable=true;value = .null;detail = .null;defects=[]};problem=error.localizedDescription}
    }
    func planRepair() async {
        do {
            let gardens=try await APIDomainLogic.referenceRows("gardens",store:store)
            guard let g=gardens.first(where:{$0.id==record["gardenId"].string}) else{throw APIError.local("Zahrada už není dostupná. Opravte nejdřív její vazbu.")}
            let seed=APIValue.object(["gardenId":.s(g.id),"customerId":g["customerId"],"customerAddressId":g["addressDetails"]["customerAddressId"],"address":g["address"],"city":g["addressDetails"]["city"],"title":.s("Oprava: "+record["title"].string),"description":.s([record["description"].string,record["location"].string].filter{!$0.isEmpty}.joined(separator:"\n")),"defectIds":.array([.s(record.id)])])
            let r=APIResource(entity:.jobs,seed:seed);store.route=APIRoute(resource:r,value:r.initial(store),isNew:true)
        }catch{problem=error.localizedDescription}
    }
    func remove() async {
        do {
            var body=APIValue.object(["version":record["version"]]);if [.vehicles,.entries,.subscriptions].contains(resource.entity){body["operationId"] = .s(UUID().uuidString)}
            _=try await store.write(resource.recordPath(record.id),method:"DELETE",body:body)
        }catch{problem=error.localizedDescription}
    }
}
struct APIReadFields: View {
    let value:APIValue
    let fields:[APIField]
    var body: some View {
        VStack(alignment:.leading,spacing:12){ForEach(fields){field in let v=value[field.id];if !v.isNull && (!v.string.isEmpty || !v.array.isEmpty || !v.object.isEmpty){
            VStack(alignment:.leading,spacing:5){Text(field.title).font(.caption).foregroundStyle(.secondary)
                if field.kind == .object { AnyView(APIReadFields(value:v,fields:field.children)) }
                else if field.kind == .array { ForEach(Array(v.array.enumerated()),id:\.offset){_,row in if row.object.isEmpty{Text(APIFormat.status(row.string))}else{AnyView(APIReadFields(value:row,fields:field.children))}} }
                else if field.kind == .money { Text(APIFormat.money(v)) }
                else if field.kind == .toggle { Text(v.bool ? "Ano" : "Ne") }
                else {Text(field.choices.first(where:{$0.id==v.string})?.title ?? APIFormat.status(v.string)).textSelection(.enabled)}
            }
        }}}
    }
}
struct APIDataPairs:View {
    let value:APIValue
    let labels:[String:String]
    var body:some View { VStack(alignment:.leading,spacing:10){ForEach(labels.keys.sorted(),id:\.self){key in if !value[key].isNull && !value[key].string.isEmpty {HStack{Text(labels[key]!).foregroundStyle(.secondary);Spacer();Text(value[key].string)}}}} }
}
