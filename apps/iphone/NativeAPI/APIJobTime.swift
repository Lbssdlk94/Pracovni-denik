import SwiftUI

enum APIWorkTimeLogic {
    static let titles=["work":"Pracuje","travel":"Na cestě","break":"Přestávka","other":"Ostatní činnost","stop":"Ukončit práci","move":"Přesunout"]
    static let actions=["work":"Zahájit práci","travel":"Výjezd","break":"Přestávka","other":"Ostatní činnost","stop":"Ukončit práci","move":"Přesunout"]
    static func duration(_ interval:APIValue,now:Date=Date())->Int64{max(0,Int64(min(interval["endAt"].isNull ? now.timeIntervalSince1970*1000 : interval["endAt"].double,now.timeIntervalSince1970*1000)-interval["startAt"].double))}
    static func hours(_ milliseconds:Int64)->String{let minutes=max(0,milliseconds)/60000;return "\(minutes/60) h \(minutes%60) min"}
    @MainActor static func states(_ snapshot:APIValue,store:APIStore)->[APIValue]{
        var values=Dictionary(uniqueKeysWithValues:snapshot["states"].array.map{($0["userId"].string,$0)})
        for(path,data)in store.vault?.state.cache ?? [:] where path.hasSuffix("/time"){
            for state in data["states"].array where state["version"].int>(values[state["userId"].string]?["version"].int ?? -1){values[state["userId"].string]=state}
        }
        for operation in store.outbox.filter({$0.path.hasSuffix("/time/actions") && $0.state=="pending"}).sorted(by:{($0.body?["at"].double ?? 0)<($1.body?["at"].double ?? 0)}){
            guard let input=operation.body else{continue};let source=operation.path.split(separator:"/")[2],target=input["targetJobId"].string.isEmpty ? String(source) : input["targetJobId"].string,kind=input["action"].string=="move" ? "work" : input["action"].string
            for(index,worker)in input["workers"].array.enumerated(){let id=worker["userId"].string;var state=values[id] ?? .object(["userId":.s(id),"name":.s(id),"version":worker["version"]]);guard state["version"]==worker["version"]else{continue};if kind=="stop"{state["active"] = .null}else if state["active"]["jobId"].string != target || state["active"]["kind"].string != kind{state["active"] = .object(["id":.s(input["operationId"].string+"_"+String(index)),"jobId":.s(target),"kind":.s(kind),"startAt":input["at"],"userId":.s(id),"userName":state["name"]])};state["version"] = .n(worker["version"].int+1);state["pending"] = .bool(true);values[id]=state}
        }
        return snapshot["states"].array.map{($0.merged(values[$0["userId"].string]?.object ?? [:]))}
    }
}

struct APIJobTimeView:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    var initialAction:String?=nil
    @State private var snapshot:APIValue = .null
    @State private var problem:String?
    @State private var selection=Set<String>()
    @State private var action:APIWorkTimeAction?
    @State private var proposal:APIWorkTimeProposal?
    @State private var costs=false
    @State private var more=false
    @State private var add=false
    @State private var lead=false
    @State private var conflict:APIMutation?
    @State private var busy=false
    @State private var initialShown=false
    private var path:String{"/api/jobs/"+job.id+"/time"}
    private var mayManage:Bool{snapshot["canManage"].bool && !store.isRolePreview}
    private var financial:Bool{snapshot["canManageCosts"].bool && store.manager}
    var body:some View{
        List{
            if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
            if snapshot.isNull{ProgressView("Načítám pracovní dobu…")}else{
                Section("Součet práce"){
                    Text(APIWorkTimeLogic.hours(Int64(snapshot["summary"]["total"]["workMs"].double))).font(.title2.bold())
                    Text("Člověkohodiny · doprava a přestávky jsou zvlášť.").font(.caption).foregroundStyle(.secondary)
                    if !store.online{Label("Offline · změny čekají v iPhonu",systemImage:"wifi.slash")}
                }
                Section("Pracovníci"){
                    TimelineView(.periodic(from:.now,by:15)){context in
                        ForEach(Array(APIWorkTimeLogic.states(snapshot,store:store).enumerated()),id:\.offset){_,state in
                            let active=state["active"],here=active["jobId"].string==job.id,kind=here ? active["kind"].string : "stopped"
                            VStack(alignment:.leading,spacing:8){
                                if mayManage && state["assigned"].bool{Toggle(state["name"].string,isOn:Binding(get:{selection.contains(state["userId"].string)},set:{if $0{selection.insert(state["userId"].string)}else{selection.remove(state["userId"].string)}}))}else{Text(state["name"].string).font(.headline)}
                                Label(here ? APIWorkTimeLogic.titles[kind] ?? kind : active.isNull ? "Práce ukončena" : "Na jiné zakázce",systemImage:kind=="travel" ? "location.fill" : kind=="break" ? "pause.circle.fill" : kind=="work" ? "circle.fill" : "checkmark.circle")
                                    .font(.subheadline.weight(.semibold)).foregroundStyle(kind=="work" ? Color.green : kind=="travel" ? Color.blue : kind=="break" ? Color.orange : Color.secondary)
                                if here{Text("Od "+Date(timeIntervalSince1970:active["startAt"].double/1000).formatted(date:.abbreviated,time:.shortened)+" · "+APIWorkTimeLogic.hours(APIWorkTimeLogic.duration(active,now:context.date))).font(.caption)}
                                if state["pending"].bool{Text("Čeká na odeslání").font(.caption)}
                            }.padding(.vertical,6)
                        }
                    }
                }
                if snapshot["canWrite"].bool && store.writer && !store.isRolePreview{
                    Section(mayManage ? "Pro vybrané pracovníky" : "Moje práce"){
                        ForEach(["travel","work","break","stop","other"]+(mayManage ? ["move"] : []),id:\.self){kind in
                            if kind != "travel" || store.enabled("jobTravel"){Button(APIWorkTimeLogic.actions[kind] ?? kind){action=APIWorkTimeAction(kind:kind)}}
                        }
                        Button("Doplnit pracovní dobu"){proposal=APIWorkTimeProposal(interval:.null)}
                        if mayManage{Button("Přidat dalšího pracovníka"){add=true}}
                    }
                }
                Section{
                    DisclosureGroup("Jednotlivé dny"){
                        ForEach(Array(snapshot["summary"]["days"].array.enumerated()),id:\.offset){_,day in
                            DisclosureGroup(day["date"].string+" · "+APIWorkTimeLogic.hours(Int64(day["workMs"].double))){
                                ForEach(day["workers"].object.keys.sorted(),id:\.self){id in Text((snapshot["states"].array.first{$0["userId"].string==id}?["name"].string ?? id)+" · "+APIWorkTimeLogic.hours(Int64(day["workers"][id]["workMs"].double)))}
                            }
                        }
                    }
                    DisclosureGroup("Souhrn pracovníků"){
                        ForEach(Array(snapshot["summary"]["workers"].array.enumerated()),id:\.offset){_,person in
                            VStack(alignment:.leading){Text(person["name"].string).font(.headline);Text("Práce "+APIWorkTimeLogic.hours(Int64(person["workMs"].double))+" · doprava "+APIWorkTimeLogic.hours(Int64(person["travelMs"].double))+" · přestávky "+APIWorkTimeLogic.hours(Int64(person["breakMs"].double))).font(.caption)}
                        }
                    }
                    DisclosureGroup("Ukončené intervaly"){
                        ForEach(Array(snapshot["intervals"].array.filter{!$0["endAt"].isNull}.prefix(more ? Int.max : 20)),id:\.id){interval in
                            VStack(alignment:.leading,spacing:8){Text(interval["userName"].string+" · "+(APIWorkTimeLogic.titles[interval["kind"].string] ?? "")).font(.headline);Text(APIFormat.date(interval["startAt"])+" · "+APIWorkTimeLogic.hours(APIWorkTimeLogic.duration(interval))).font(.caption);Text(interval["approval"].string=="approved" ? "Schváleno" : "Čeká na schválení").font(.caption)
                                if !store.isRolePreview && (mayManage || interval["userId"].string==store.userID){Button("Navrhnout opravu"){proposal=APIWorkTimeProposal(interval:interval)}}
                                if financial && interval["approval"].string != "approved"{Button("Schválit zaznamenané hodiny"){Task{await approveInterval(interval)}}}
                            }
                        }
                        if !more{Button("Zobrazit všechny intervaly"){more=true}}
                    }
                    DisclosureGroup("Schvalování a opravy"){
                        ForEach(snapshot["reviews"].array,id:\.id){review in
                            VStack(alignment:.leading,spacing:8){Text(review["reason"].string).font(.headline);Text(review["author_name"].string+" · "+APIFormat.date(review["created_at"])).font(.caption);Text(review["status"].string=="pending" ? "Čeká na schválení" : review["status"].string=="approved" ? "Schváleno" : "Zamítnuto");if let bytes=review["proposed"].string.data(using:.utf8),let value=try? JSONDecoder().decode(APIValue.self,from:bytes){Text(APIFormat.date(value["startAt"])+" – "+APIFormat.date(value["endAt"])).font(.caption)}
                                if financial && review["status"].string=="pending"{Button("Schválit"){Task{await reviewTime(review.id,decision:"approve")}};Button("Zamítnout",role:.destructive){Task{await reviewTime(review.id,decision:"reject")}}}
                            }
                        }
                    }
                }
                if financial{
                    Section("Interní náklady"){
                        Text("Práce: "+APIFormat.money(snapshot["summary"]["total"]["workCostMinor"]))
                        Text("Doprava: "+APIFormat.money(snapshot["summary"]["total"]["travelCostMinor"]))
                        if snapshot["summary"]["total"]["unpricedMs"].double>0{Text("U části intervalů není známá sazba.").foregroundStyle(DiaryStyle.warning)}
                        Button("Nákladové sazby pracovníků"){costs=true}
                        Button("Vedoucí pracovní doby"){lead=true}
                        DisclosureGroup("Historie změn"){
                            ForEach(snapshot["history"].array,id:\.id){event in VStack(alignment:.leading){Text(event["actor_name"].string+" · "+APIFormat.date(event["at"]));Text(event["reason"].string).font(.caption);if !event["before_value"].isNull{Text("Původně: "+event["before_value"].string).font(.caption)};if !event["after_value"].isNull{Text("Nově: "+event["after_value"].string).font(.caption)}}}
                        }
                    }
                }
                let pending=store.outbox.filter{$0.path==path+"/actions"}
                if !pending.isEmpty{Section("Neodeslané změny"){
                    ForEach(pending){op in VStack(alignment:.leading,spacing:8){Text(APIWorkTimeLogic.titles[op.body?["action"].string ?? ""] ?? "Pracovní akce");Text(op.error.isEmpty ? "Čeká na připojení" : op.error).font(.caption);DisclosureGroup("Původní údaje"){Text(String(data:(try? op.body?.data()) ?? Data(),encoding:.utf8) ?? "")};if op.state != "pending"{Text("Porovnejte s aktuálním stavem. Původní čas se nesmí automaticky posunout.").font(.caption);Button("Porovnat a znovu odeslat"){conflict=op}}}}
                }}
            }
        }.navigationTitle("Pracovní doba").navigationBarTitleDisplayMode(.inline)
            .task(id:store.scope+store.revision.uuidString){await load()}.refreshable{await load(refresh:true)}
            .sheet(item:$conflict){op in APIWorkTimeConflictView(store:store,job:job,operation:op)}
            .sheet(item:$action){request in APIWorkTimeActionEditor(store:store,job:job,snapshot:snapshot,kind:request.kind,selected:selection)}
            .sheet(item:$proposal){request in APIWorkTimeProposalEditor(store:store,job:job,snapshot:snapshot,interval:request.interval)}
            .sheet(isPresented:$costs){APIWorkTimeAdministration(store:store,job:job,snapshot:snapshot,mode:"rates")}
            .sheet(isPresented:$lead){APIWorkTimeAdministration(store:store,job:job,snapshot:snapshot,mode:"lead")}
            .sheet(isPresented:$add){APIWorkTimeAdministration(store:store,job:job,snapshot:snapshot,mode:"assign")}
            .disabled(busy)
    }
    func load(refresh:Bool=false)async{do{let value=try await store.get(path,refresh:refresh);guard !Task.isCancelled else{return};snapshot=value;problem=nil;if selection.isEmpty{selection=[store.userID]};if !initialShown,let initialAction{initialShown=true;action=APIWorkTimeAction(kind:initialAction)}}catch{if !Task.isCancelled{problem=error.localizedDescription;if let e=error as? APIError,[401,403,404].contains(e.status){snapshot = .null}}}}
    func reviewTime(_ id:String,decision:String)async{do{_ = try await store.write(path+"/reviews/"+id,method:"POST",body:.object(["operationId":.s(UUID().uuidString),"decision":.s(decision)]));await load(refresh:true)}catch{problem=error.localizedDescription}}
    func approveInterval(_ row:APIValue)async{busy=true;defer{busy=false};do{let op=UUID().uuidString;_ = try await store.write(path+"/proposals",method:"POST",body:.object(["operationId":.s(op),"intervalId":row["id"],"userId":row["userId"],"version":row["version"],"kind":row["kind"],"startAt":row["startAt"],"endAt":row["endAt"],"reason":.s("Schválení zaznamenaného intervalu")]));await reviewTime(op,decision:"approve")}catch{problem=error.localizedDescription}}
    func discard(_ op:APIMutation)async{do{try store.requireLiveRole();store.vault?.state.outbox.removeAll{$0.id==op.id};try store.vault?.persist();store.updateOutbox();await load(refresh:true)}catch{problem=error.localizedDescription}}
}
struct APIWorkTimeAction:Identifiable{let id=UUID();let kind:String}
struct APIWorkTimeProposal:Identifiable{let id=UUID();let interval:APIValue}

struct APIWorkTimeConflictView:View {
    @ObservedObject var store:APIStore
    let job:APIValue
    let operation:APIMutation
    @Environment(\.dismiss) private var dismiss
    @State private var fresh:APIValue = .null
    @State private var confirmed=false
    @State private var problem:String?
    @State private var busy=false
    var body:some View{NavigationStack{Form{
        Section("Původní neodeslaná akce"){
            Text(APIWorkTimeLogic.actions[operation.body?["action"].string ?? ""] ?? "Pracovní akce")
            if let at=operation.body?["at"]{Text(APIFormat.date(at))}
            Text(operation.error).font(.caption)
        }
        Section("Současný serverový stav"){
            if fresh.isNull{ProgressView("Načítám…")}
            ForEach(Array(fresh["states"].array.enumerated()),id:\.offset){_,state in Text(state["name"].string+" · "+(APIWorkTimeLogic.titles[state["active"]["kind"].string] ?? "Ukončeno"))}
        }
        Text("Původní čas se neposune. Pokud už patří před novější interval nebo se překrývá, server ho odmítne a bude potřeba návrh opravy.").font(.footnote)
        Toggle("Porovnal jsem údaje a potvrzuji případný přechod",isOn:$confirmed)
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
        Button("Odeslat s původním časem"){Task{await retry()}}.disabled(!confirmed||fresh.isNull||busy)
        Button("Ponechat serverové údaje",role:.destructive){Task{await discard()}}.disabled(!confirmed||busy)
    }.navigationTitle("Porovnání pracovní doby").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}.disabled(busy)}}}.task{do{fresh=try await store.get("/api/jobs/"+job.id+"/time",refresh:true)}catch{problem=error.localizedDescription}}}
    func archive()throws{try store.requireLiveRole();if let value=operation.body{store.saveDraft("time-conflict:"+operation.id,draft:APIDraft(value:value,baseVersion:0,operationID:operation.id,updatedAt:Date()))}}
    func discard()async{do{try archive();store.vault?.state.outbox.removeAll{$0.id==operation.id};try store.vault?.persist();store.updateOutbox();dismiss()}catch{problem=error.localizedDescription}}
    func retry()async{
        busy=true;defer{busy=false}
        let nextID=UUID().uuidString,binding=store.scope
        do{
            try archive();guard var value=operation.body else{throw APIError.local("Chybí původní údaje.")}
            let states=Dictionary(uniqueKeysWithValues:fresh["states"].array.map{($0["userId"].string,$0)})
            value["workers"] = .array(try value["workers"].array.map{worker in guard let state=states[worker["userId"].string]else{throw APIError.local("Pracovník už není dostupný.")};return .object(["userId":worker["userId"],"version":state["version"]])})
            value["operationId"] = .s(nextID);value["allowSwitch"] = .bool(true)
            _ = try await store.write(operation.path,method:"POST",body:value,offline:true,operationID:nextID)
            guard binding==store.scope else{throw APIError.local("Účet se změnil.")}
            store.vault?.state.outbox.removeAll{$0.id==operation.id};try store.vault?.persist();store.updateOutbox();dismiss()
        }catch{
            if binding==store.scope,store.outbox.contains(where:{$0.id==nextID}){store.vault?.state.outbox.removeAll{$0.id==operation.id};try? store.vault?.persist();store.updateOutbox()}
            problem=error.localizedDescription
        }
    }
}

struct APIWorkTimeActionEditor:View {
    @ObservedObject var store:APIStore;let job:APIValue;let snapshot:APIValue;let kind:String;let selected:Set<String>
    @Environment(\.dismiss) private var dismiss
    @State private var busy=false;@State private var problem:String?;@State private var switchConfirmed=false;@State private var target="";@State private var targets:[APIValue]=[]
    @State private var arrival=Date().addingTimeInterval(1800);@State private var sms:String?;@State private var sent=false
    @State private var operation=UUID().uuidString
    @State private var blocked=false
    var body:some View{NavigationStack{Form{
        Text(job.title).font(.headline);ForEach(Array(APIWorkTimeLogic.states(snapshot,store:store).filter{selected.contains($0["userId"].string)}.enumerated()),id:\.offset){_,state in Text(state["name"].string)}
        if kind=="travel"{DatePicker("Předpokládaný příjezd",selection:$arrival).environment(\.timeZone,TimeZone(identifier:"Europe/Prague")!);Text("SMS se připraví jen jednou za celý výjezd. Odeslání potvrdíte ve Zprávách.").font(.caption)}
        if kind=="move"{Picker("Cílová zakázka",selection:$target){Text("Vyberte zakázku").tag("");ForEach(targets,id:\.id){Text($0.title).tag($0.id)}}}
        Toggle("Ukončit předchozí interval při přechodu",isOn:$switchConfirmed)
        if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
        if busy{ProgressView("Ukládám pracovní akci…")}
        if blocked{Text("Neodeslanou akci porovnejte v přehledu pracovní doby. Původní čas zůstal uložený.").font(.caption)}
        if !sent{Button("Potvrdit pro vybrané pracovníky"){Task{await save()}}.diaryBubble(.primary).disabled(busy||blocked)}
        if let sms,let url=URL(string:sms){Link("Připravit jednu SMS zákazníkovi",destination:url).simultaneousGesture(TapGesture().onEnded{self.sms=nil})}
        if sent{Button("Hotovo"){dismiss()}}
    }.navigationTitle(APIWorkTimeLogic.actions[kind] ?? "Pracovní akce").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}.disabled(busy)}}}.editLease(store).task{if kind=="move"{do{let value=try await store.get("/api/jobs?state=active&order=schedule&month="+String(store.today.prefix(7)));targets=value["jobs"].array.filter{$0.id != job.id}}catch{problem=error.localizedDescription}}}}
    func save()async{guard !busy else{return};busy=true;defer{busy=false};do{
        let states=APIWorkTimeLogic.states(snapshot,store:store).filter{selected.contains($0["userId"].string)&&$0["assigned"].bool};guard !states.isEmpty else{throw APIError.local("Vyberte alespoň jednoho pracovníka.")}
        if kind=="move"&&target.isEmpty{throw APIError.local("Vyberte cílovou zakázku.")}
        let destination=kind=="move" ? target : job.id
        if !switchConfirmed && kind != "stop" && states.contains(where:{!$0["active"].isNull && $0["active"]["jobId"].string != destination}){throw APIError.local("Pracovník má otevřený interval jinde. Zkontrolujte jej a potvrďte přechod.")}
        var input:APIValue = .object(["operationId":.s(operation),"action":.s(kind),"at":.number((Date().timeIntervalSince1970*1000).rounded(.down)),"workers":.array(states.map{.object(["userId":$0["userId"],"version":$0["version"]])}),"allowSwitch":.bool(switchConfirmed)])
        if kind=="move"{input["targetJobId"] = .s(target)}
        if kind=="travel"{let f=DateFormatter();f.timeZone=TimeZone(identifier:"Europe/Prague");f.dateFormat="yyyy-MM-dd";input["arrivalDate"] = .s(f.string(from:arrival));f.dateFormat="HH:mm";input["arrivalTime"] = .s(f.string(from:arrival))}
        _ = try await store.write("/api/jobs/"+job.id+"/time/actions",method:"POST",body:input,offline:true,operationID:operation)
        if kind=="travel" && store.online && !store.outbox.contains(where:{$0.id==operation}),let phone=job["customerContact"]["phones"].array.first?["number"].string{let digits=phone.filter{"+0123456789".contains($0)};var parts=URLComponents();parts.scheme="sms";parts.path=digits;parts.queryItems=[URLQueryItem(name:"body",value:"Dobrý den, jsme na cestě. Předpokládaný příjezd "+arrival.formatted(date:.abbreviated,time:.shortened)+". Děkujeme.")];sms=parts.string}
        sent=true;if sms==nil{dismiss()}
    }catch{blocked=store.outbox.contains{$0.id==operation};problem=error.localizedDescription}}
}

struct APIWorkTimeProposalEditor:View {
    @ObservedObject var store:APIStore;let job:APIValue;let snapshot:APIValue;let interval:APIValue
    @Environment(\.dismiss) private var dismiss
    @State private var user="";@State private var kind="work";@State private var start=Date().addingTimeInterval(-3600);@State private var end=Date();@State private var reason="";@State private var problem:String?;@State private var busy=false
    var body:some View{NavigationStack{Form{Picker("Pracovník",selection:$user){ForEach(Array(snapshot["states"].array.filter{snapshot["canManage"].bool || $0["userId"].string==store.userID}.enumerated()),id:\.offset){_,state in Text(state["name"].string).tag(state["userId"].string)}}.disabled(!interval.isNull);Picker("Činnost",selection:$kind){ForEach(["work","travel","break","other"],id:\.self){Text(APIWorkTimeLogic.titles[$0]!).tag($0)}};DatePicker("Od",selection:$start);DatePicker("Do",selection:$end);TextField("Povinný důvod",text:$reason,axis:.vertical);Text("Interval musí patřit do existující docházkové směny. Návrh schvaluje správce.").font(.caption);if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)};Button("Odeslat návrh"){Task{await save()}}.disabled(busy)}.environment(\.timeZone,TimeZone(identifier:"Europe/Prague")!).navigationTitle("Doplnění a oprava času").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}.disabled(busy)}}}.editLease(store).onAppear{user=interval["userId"].string.isEmpty ? store.userID : interval["userId"].string;if !interval.isNull{kind=interval["kind"].string;start=Date(timeIntervalSince1970:interval["startAt"].double/1000);end=Date(timeIntervalSince1970:interval["endAt"].double/1000)}}}
    func save()async{busy=true;defer{busy=false};do{_ = try await store.write("/api/jobs/"+job.id+"/time/proposals",method:"POST",body:.object(["operationId":.s(UUID().uuidString),"intervalId":interval.isNull ? .s(UUID().uuidString) : interval["id"],"userId":.s(user),"version":interval.isNull ? .n(0) : interval["version"],"kind":.s(kind),"startAt":.number((start.timeIntervalSince1970*1000).rounded(.down)),"endAt":.number((end.timeIntervalSince1970*1000).rounded(.down)),"reason":.s(reason)]));dismiss()}catch{problem=error.localizedDescription}}
}

struct APIWorkTimeAdministration:View {
    @ObservedObject var store:APIStore;let job:APIValue;let snapshot:APIValue;let mode:String
    @Environment(\.dismiss) private var dismiss
    @State private var user="";@State private var work="";@State private var travel="";@State private var problem:String?;@State private var busy=false
    var people:[APIValue]{mode=="assign" ? snapshot["candidates"].array : snapshot["states"].array}
    var body:some View{NavigationStack{Form{Picker("Pracovník",selection:$user){Text("Vyberte kolegu").tag("");ForEach(Array(people.enumerated()),id:\.offset){_,person in Text(person["name"].string).tag(mode=="assign" ? person["id"].string : person["userId"].string)}};if mode=="rates"{TextField("Práce Kč / hod",text:$work).keyboardType(.decimalPad);TextField("Doprava Kč / hod",text:$travel).keyboardType(.decimalPad);Text("Prázdné pole = sazba neurčena. Změna platí pro nové intervaly; historické sazby zůstanou zachované.").font(.caption)};if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)};Button("Uložit"){Task{await save()}}.disabled(busy)}.navigationTitle(mode=="rates" ? "Interní náklady" : mode=="lead" ? "Vedoucí pracovní doby" : "Přidat pracovníka").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}}}}.editLease(store).onChange(of:user){_,id in if let rate=snapshot["rates"].array.first(where:{$0["user_id"].string==id}){work=rate["work_minor"].isNull ? "" : String(rate["work_minor"].double/100);travel=rate["travel_minor"].isNull ? "" : String(rate["travel_minor"].double/100)}else{work="";travel=""}}}
    func save()async{busy=true;defer{busy=false};do{var input:APIValue = .object(["operationId":.s(UUID().uuidString)]);let method:String
        if mode=="rates"{guard !user.isEmpty else{throw APIError.local("Vyberte pracovníka.")};func amount(_ value:String)throws->APIValue{if value.isEmpty{return .null};guard let n=Double(value.replacingOccurrences(of:",",with:".")),n.isFinite,n>=0,n<=1000000 else{throw APIError.local("Zadejte platnou nákladovou sazbu.")};return .number((n*100).rounded())};input["userId"] = .s(user);input["version"] = snapshot["rates"].array.first{$0["user_id"].string==user}?["version"] ?? .n(0);input["workMinor"] = try amount(work);input["travelMinor"] = try amount(travel);method="PUT"}
        else if mode=="lead"{input["userId"] = user.isEmpty ? .null : .s(user);input["version"] = snapshot["lead"]["version"].isNull ? .n(0) : snapshot["lead"]["version"];method="PUT"}
        else{guard !user.isEmpty else{throw APIError.local("Vyberte pracovníka.")};input["userIds"] = .array([.s(user)]);input["jobVersion"] = snapshot["job"]["version"];method="POST"}
        _ = try await store.write("/api/jobs/"+job.id+"/time/"+mode,method:method,body:input);dismiss()
    }catch{problem=error.localizedDescription}}
}
