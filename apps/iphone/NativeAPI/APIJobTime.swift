import SwiftUI

enum APIWorkTimeLogic {
    static let titles=["work":"Pracuje","travel":"Na cestě","break":"Přestávka","other":"Ostatní činnost","stop":"Ukončit práci","move":"Přesunout"]
    static let actions=["work":"Zahájit práci","travel":"Výjezd","break":"Přestávka","other":"Ostatní činnost","stop":"Ukončit práci","move":"Přesunout"]
    static func duration(_ interval:APIValue,now:Date=Date())->Int64{max(0,Int64(min(interval["endAt"].isNull ? now.timeIntervalSince1970*1000 : interval["endAt"].double,now.timeIntervalSince1970*1000)-interval["startAt"].double))}
    static func hours(_ milliseconds:Int64)->String{let minutes=max(0,milliseconds)/60000;return "\(minutes/60) h \(minutes%60) min"}
    @MainActor static func project(_ snapshot:APIValue,store:APIStore)->APIValue{
        var intervals=snapshot["intervals"].array
        var values=Dictionary(uniqueKeysWithValues:snapshot["states"].array.map{($0["userId"].string,$0)})
        for(path,data)in store.vault?.state.cache ?? [:] where path.hasSuffix("/time") || path=="/api/attendance/state"{
            for state in data["states"].array where state["version"].int>(values[state["userId"].string]?["version"].int ?? -1){values[state["userId"].string]=state}
        }
        if let ledger=store.vault?.state.cache["/api/attendance/state"] {
            for row in ledger["intervals"].array where snapshot["attendanceProjection"].bool || row["jobId"].string==snapshot["job"].id && !snapshot["job"].id.isEmpty {
                if let i=intervals.firstIndex(where:{$0.id==row.id}){if row["version"].int>=intervals[i]["version"].int{intervals[i]=intervals[i].merged(row.object)}}else{intervals.append(row)}
            }
        }
        let pending=store.outbox.filter{($0.path.hasSuffix("/time/actions") || $0.path=="/api/attendance/activities" || $0.path=="/api/attendance/punch") && $0.state=="pending"}.sorted{($0.body?["at"].double ?? 0)<($1.body?["at"].double ?? 0)}
        for operation in pending {
            if operation.path.hasPrefix("/api/attendance/"),let input=operation.body {
                let id=store.userID;var state=values[id] ?? .object(["userId":.s(id),"name":store.me["user"]["name"],"version":.n(0)])
                if operation.path.hasSuffix("/punch"),input["kind"].string != "departure"{continue}
                if operation.path.hasSuffix("/activities"),state["version"] != input["version"]{continue}
                let old=state["active"]
                if !old.isNull,let i=intervals.firstIndex(where:{$0.id==old.id}){intervals[i]["endAt"]=input["at"];intervals[i]["pending"] = .bool(true)}
                let action=input["action"].string,kind=action=="resume" ? input["resumeKind"].string : action
                if operation.path.hasSuffix("/punch") || kind.isEmpty || kind=="stop"{state["active"] = .null}
                else {
                    let row=APIValue.object(["id":.s(input["operationId"].string+"_interval"),"userId":.s(id),"userName":store.me["user"]["name"],"jobId":action=="resume" ? input["resumeJobId"] : kind=="break" && old["jobId"].string != "unavailable" ? old["jobId"] : .null,"kind":.s(kind),"startAt":input["at"],"endAt":.null,"shiftId":input["shiftId"],"pending":.bool(true),"version":.n(1)])
                    state["active"]=row
                    if snapshot["attendanceProjection"].bool || !row["jobId"].string.isEmpty && row["jobId"].string==snapshot["job"].id{intervals.append(row)}
                }
                if !old.isNull || operation.path.hasSuffix("/activities"){state["version"] = .n(state["version"].int+1)};state["pending"] = .bool(true);values[id]=state;continue
            }
            guard let input=operation.body else{continue};let source=operation.path.split(separator:"/")[2],target=input["targetJobId"].string.isEmpty ? String(source) : input["targetJobId"].string,kind=input["action"].string=="move" ? "work" : input["action"].string
            for(index,worker)in input["workers"].array.enumerated(){let id=worker["userId"].string;var state=values[id] ?? .object(["userId":.s(id),"name":.s(id),"version":worker["version"]]);guard state["version"]==worker["version"]else{continue};let same=state["active"]["jobId"].string==target && state["active"]["kind"].string==kind
                if !state["active"].isNull && !same,let position=intervals.firstIndex(where:{$0.id==state["active"].id}){intervals[position]["endAt"]=input["at"];intervals[position]["pending"] = .bool(true)}
                if kind=="stop"{state["active"] = .null}else if state["active"]["jobId"].string != target || state["active"]["kind"].string != kind{state["active"] = .object(["id":.s(input["operationId"].string+"_"+String(index)),"jobId":.s(target),"kind":.s(kind),"startAt":input["at"],"userId":.s(id),"userName":state["name"]])};if !same && kind != "stop" && (snapshot["attendanceProjection"].bool || target==snapshot["job"].id){var row=state["active"];row["userName"]=state["name"];row["pending"] = .bool(true);row["approval"] = .s("pending");intervals.append(row)};state["version"] = .n(worker["version"].int+1);state["pending"] = .bool(true);values[id]=state}
        }
        var result=snapshot
        result["states"] = .array(snapshot["states"].array.map{($0.merged(values[$0["userId"].string]?.object ?? [:]))})
        result["intervals"] = .array(intervals)
        let attendance=snapshot["attendanceProjection"].bool,knownCrew=!snapshot["canSeeCrew"].isNull
        let seeCrew=attendance || snapshot["canSeeCrew"].bool || (!knownCrew && (snapshot["canManage"].bool || snapshot["canManageCosts"].bool))
        if !seeCrew {
            let me=store.userID
            result["intervals"] = .array(result["intervals"].array.filter{$0["userId"].string==me})
            result["reviews"] = .array(snapshot["reviews"].array.filter{$0["user_id"].string==me || $0["created_by"].string==me})
            result["states"] = .array(result["states"].array.map{state in
                if state["userId"].string==me {return state}
                var hidden=state
                hidden["active"] = .null
                hidden["timeVisible"] = .bool(false)
                return hidden
            })
            result["rates"] = .null
            result["history"] = .null
            result["canSeeCrew"] = .bool(false)
        }
        return result
    }
    @MainActor static func overviewProjection(_ source:APIValue,store:APIStore)->APIValue {
        guard !source.isNull else{return .null}
        var snapshot=source
        let own:(APIValue)->Int={value in value["states"].array.first{$0["userId"].string==store.userID}?["version"].int ?? -1}
        if let cached=store.vault?.state.cache["/api/jobs/"+source["job"].id+"/time"],own(cached)>own(source){snapshot=cached}
        var result=project(snapshot,store:store)
        let active=result["states"].array.first{$0["userId"].string==store.userID}?["active"]["jobId"].string ?? ""
        if !active.isEmpty,active != "unavailable",active != result["job"].id,let target=store.vault?.state.cache["/api/jobs/"+active+"/time"]{result=project(target,store:store)}
        return result
    }
    @MainActor static func states(_ snapshot:APIValue,store:APIStore)->[APIValue]{project(snapshot,store:store)["states"].array}
    static func summary(_ rows:[APIValue],now:Date=Date(),financial:Bool=false)->APIValue{
        let keys=["workMs","travelMs","breakMs","otherMs"]+(financial ? ["workCostMinor","travelCostMinor","unpricedMs"] : [])
        let blank=APIValue.object(Dictionary(uniqueKeysWithValues:keys.map{($0,.n(0))}))
        var people:[String:APIValue]=[:],days:[String:APIValue]=[:],total=blank
        var calendar=Calendar(identifier:.gregorian);calendar.timeZone=TimeZone(identifier:"Europe/Prague")!
        let formatter=DateFormatter();formatter.calendar=calendar;formatter.timeZone=calendar.timeZone;formatter.dateFormat="yyyy-MM-dd"
        func add(_ row:inout APIValue,_ key:String,_ amount:Double){row[key] = .number(row[key].double+amount)}
        for row in rows{
            let start=row["startAt"].double,end=min(row["endAt"].isNull ? now.timeIntervalSince1970*1000 : row["endAt"].double,now.timeIntervalSince1970*1000),kind=row["kind"].string,id=row["userId"].string,key=kind+"Ms"
            guard end>start,keys.contains(key)else{continue}
            var person=people[id] ?? blank.merged(["userId":.s(id),"name":row["userName"]]);add(&person,key,end-start)
            if financial && ["work","travel"].contains(kind){if row["hourlyMinor"].isNull{add(&person,"unpricedMs",end-start)}else{add(&person,kind+"CostMinor",(end-start)*row["hourlyMinor"].double/3600000)}}
            people[id]=person
            var position=start
            while position<end{
                let date=Date(timeIntervalSince1970:position/1000),dayKey=formatter.string(from:date),next=calendar.date(byAdding:.day,value:1,to:calendar.startOfDay(for:date))!.timeIntervalSince1970*1000,stop=min(next,end)
                var day=days[dayKey] ?? blank.merged(["date":.s(dayKey),"workers":.object([:])]);add(&day,key,stop-position)
                var worker=day["workers"][id].isNull ? blank : day["workers"][id];add(&worker,key,stop-position);day["workers"][id]=worker;days[dayKey]=day;position=stop
            }
        }
        for id in Array(people.keys){var person=people[id]!;if financial{person["workCostMinor"] = .number(person["workCostMinor"].double.rounded());person["travelCostMinor"] = .number(person["travelCostMinor"].double.rounded())};people[id]=person;for key in keys{add(&total,key,person[key].double)}}
        return .object(["total":total,"workers":.array(people.keys.sorted().compactMap{people[$0]}),"days":.array(days.keys.sorted(by:>).compactMap{days[$0]})])
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
        let projected=APIWorkTimeLogic.project(snapshot,store:store)
        let summary=APIWorkTimeLogic.summary(projected["intervals"].array,financial:financial)
        List{
            if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)}
            if snapshot.isNull{ProgressView("Načítám pracovní dobu…")}else{
                Section("Součet práce"){
                    TimelineView(.periodic(from:.now,by:15)){context in Text(APIWorkTimeLogic.hours(Int64(APIWorkTimeLogic.summary(projected["intervals"].array,now:context.date)["total"]["workMs"].double))).font(.title2.bold())}
                    Text("Člověkohodiny · doprava a přestávky jsou zvlášť.").font(.caption).foregroundStyle(.secondary)
                    if !store.online{Label("Offline · změny čekají v iPhonu",systemImage:"wifi.slash")}
                }
                Section("Pracovníci"){
                    TimelineView(.periodic(from:.now,by:15)){context in
                        ForEach(Array(APIWorkTimeLogic.states(snapshot,store:store).enumerated()),id:\.offset){_,state in
                            let active=state["active"],here=active["jobId"].string==job.id,kind=here ? active["kind"].string : "stopped"
                            VStack(alignment:.leading,spacing:8){
                                let visible=state["timeVisible"].isNull || state["timeVisible"].bool || state["userId"].string==store.userID
                                if mayManage && state["assigned"].bool{Toggle(state["name"].string,isOn:Binding(get:{selection.contains(state["userId"].string)},set:{if $0{selection.insert(state["userId"].string)}else{selection.remove(state["userId"].string)}}))}else{Text(state["name"].string).font(.headline)}
                                if visible{
                                    Label(here ? APIWorkTimeLogic.titles[kind] ?? kind : active.isNull ? "Práce ukončena" : active["jobId"].string.isEmpty ? "Jiná pracovní činnost" : "Na jiné zakázce",systemImage:kind=="travel" ? "location.fill" : kind=="break" ? "pause.circle.fill" : kind=="work" ? "circle.fill" : "checkmark.circle")
                                        .font(.subheadline.weight(.semibold)).foregroundStyle(kind=="work" ? Color.green : kind=="travel" ? Color.blue : kind=="break" ? Color.orange : Color.secondary)
                                    if here{
                                        Text("Od "+Date(timeIntervalSince1970:active["startAt"].double/1000).formatted(date:.abbreviated,time:.shortened)+" · "+APIWorkTimeLogic.hours(APIWorkTimeLogic.duration(active,now:context.date))).font(.caption)
                                        if !store.isRolePreview && (mayManage || state["userId"].string==store.userID){Button("Upravit začátek"){if let interval=projected["intervals"].array.first(where:{$0.id==active.id}){proposal=APIWorkTimeProposal(interval:interval,scope:"start")}}}
                                    }
                                    if state["pending"].bool{Text("Čeká na odeslání").font(.caption)}
                                }
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
                if !snapshot["canWrite"].bool && snapshot["canRequest"].bool && !store.isRolePreview{
                    Section("Vlastní doba"){Button("Požádat o opravu vlastní doby"){proposal=APIWorkTimeProposal(interval:.null)}}
                }
                Section{
                    DisclosureGroup("Jednotlivé dny"){
                        ForEach(Array(summary["days"].array.enumerated()),id:\.offset){_,day in
                            DisclosureGroup(day["date"].string+" · "+APIWorkTimeLogic.hours(Int64(day["workMs"].double))){
                                ForEach(day["workers"].object.keys.sorted(),id:\.self){id in Text((snapshot["states"].array.first{$0["userId"].string==id}?["name"].string ?? id)+" · "+APIWorkTimeLogic.hours(Int64(day["workers"][id]["workMs"].double)))}
                            }
                        }
                    }
                    DisclosureGroup("Souhrn pracovníků"){
                        ForEach(Array(summary["workers"].array.enumerated()),id:\.offset){_,person in
                            VStack(alignment:.leading){Text(person["name"].string).font(.headline);Text("Práce "+APIWorkTimeLogic.hours(Int64(person["workMs"].double))+" · doprava "+APIWorkTimeLogic.hours(Int64(person["travelMs"].double))+" · přestávky "+APIWorkTimeLogic.hours(Int64(person["breakMs"].double))).font(.caption)}
                        }
                    }
                    DisclosureGroup("Ukončené intervaly"){
                        ForEach(Array(projected["intervals"].array.filter{!$0["endAt"].isNull}.prefix(more ? Int.max : 20)),id:\.id){interval in
                            VStack(alignment:.leading,spacing:8){Text(interval["userName"].string+" · "+(APIWorkTimeLogic.titles[interval["kind"].string] ?? "")).font(.headline);Text(APIFormat.date(interval["startAt"])+" · "+APIWorkTimeLogic.hours(APIWorkTimeLogic.duration(interval))).font(.caption);Text(interval["approval"].string=="approved" ? "Schváleno" : "Čeká na schválení").font(.caption)
                                if !store.isRolePreview && (mayManage || interval["userId"].string==store.userID){Button("Navrhnout opravu"){proposal=APIWorkTimeProposal(interval:interval)};Button("Navrhnout smazání",role:.destructive){proposal=APIWorkTimeProposal(interval:interval,remove:true)}}
                                if financial && interval["approval"].string != "approved"{Button("Schválit zaznamenané hodiny"){Task{await approveInterval(interval)}}}
                            }
                        }
                        if !more{Button("Zobrazit všechny intervaly"){more=true}}
                    }
                    DisclosureGroup("Schvalování a opravy"){
                        ForEach(snapshot["reviews"].array,id:\.id){review in
                            VStack(alignment:.leading,spacing:8){Text(review["reason"].string).font(.headline);Text(review["author_name"].string+" · "+APIFormat.date(review["created_at"])).font(.caption);Text(review["status"].string=="pending" ? "Čeká na schválení" : review["status"].string=="approved" ? "Schváleno" : review["status"].string=="rejected" ? "Zamítnuto" : review["status"].string=="withdrawn" ? "Staženo" : review["status"].string);if review["conflict"].int==1{Text("Interval se od žádosti změnil. Schválení ho nepřepíše.").font(.caption)};if let bytes=review["proposed"].string.data(using:.utf8),let value=try? JSONDecoder().decode(APIValue.self,from:bytes){Text(value["remove"].bool ? "Návrh: smazat interval "+APIFormat.date(value["startAt"])+" – "+APIFormat.date(value["endAt"]) : (value["startAt"].isNull ? "" : "Začátek "+APIFormat.date(value["startAt"])+" ")+(value["endAt"].isNull ? "" : "Konec "+APIFormat.date(value["endAt"]))).font(.caption)}
                                if review["status"].string=="pending" && (review["created_by"].string==store.userID || review["user_id"].string==store.userID){Button("Stáhnout žádost"){Task{await reviewTime(review.id,decision:"withdraw")}}}
                                if financial && review["status"].string=="pending"{Button("Schválit"){Task{await reviewTime(review.id,decision:"approve")}};Button("Zamítnout",role:.destructive){Task{await reviewTime(review.id,decision:"reject")}}}
                            }
                        }
                    }
                }
                if financial{
                    Section("Interní náklady"){
                        Text("Práce: "+APIFormat.money(summary["total"]["workCostMinor"]))
                        Text("Doprava: "+APIFormat.money(summary["total"]["travelCostMinor"]))
                        if summary["total"]["unpricedMs"].double>0{Text("U části intervalů není známá sazba.").foregroundStyle(DiaryStyle.warning)}
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
            .sheet(item:$proposal){request in APIWorkTimeProposalEditor(store:store,job:job,snapshot:snapshot,interval:request.interval,remove:request.remove,initialScope:request.scope)}
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
struct APIWorkTimeProposal:Identifiable{let id=UUID();let interval:APIValue;var remove=false;var scope:String="both"}

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
    }.navigationTitle(APIWorkTimeLogic.actions[kind] ?? "Pracovní akce").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}.disabled(busy)}}}.editLease(store).task{if kind=="move"{await loadTargets()}}}
    func loadTargets()async{do{
        var rows:[APIValue]=[],cursor="",seen=Set<String>()
        for _ in 0..<100{
            var url=URLComponents(string:"/api/jobs?state=active&order=schedule")!
            if !cursor.isEmpty{url.queryItems?.append(URLQueryItem(name:"cursor",value:cursor))}
            let value=try await store.get(url.string!);rows+=value["jobs"].array.filter{$0.id != job.id && !["done","incomplete"].contains($0["status"].string)}
            cursor=value["nextCursor"].string
            if cursor.isEmpty{targets=rows;return}
            guard seen.insert(cursor).inserted else{throw APIError.local("Seznam zakázek se změnil. Otevřete přesun znovu.")}
        }
        throw APIError.local("Zúžení seznamu zakázek vyžaduje připojení.")
    }catch{problem=error.localizedDescription}}

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
    @ObservedObject var store:APIStore;let job:APIValue;let snapshot:APIValue;let interval:APIValue;let remove:Bool;var initialScope:String="both"
    @Environment(\.dismiss) private var dismiss
    @State private var user="";@State private var kind="work";@State private var scope="both";@State private var start=Date().addingTimeInterval(-3600);@State private var end=Date();@State private var reason="";@State private var problem:String?;@State private var busy=false
    private var openInterval:Bool{!interval.isNull && interval["endAt"].isNull}
    var body:some View{NavigationStack{Form{if remove{Text("Ukončený interval se smaže až po schválení správcem. Docházka a směna zůstanou. Otevřenou práci nejdříve ukončete.").font(.caption)}else{Picker("Pracovník",selection:$user){ForEach(Array(snapshot["states"].array.filter{snapshot["canManage"].bool || $0["userId"].string==store.userID}.enumerated()),id:\.offset){_,state in Text(state["name"].string).tag(state["userId"].string)}}.disabled(!interval.isNull);Picker("Činnost",selection:$kind){ForEach(["work","travel","break","other"],id:\.self){Text(APIWorkTimeLogic.titles[$0]!).tag($0)}};if !interval.isNull{Picker("Rozsah opravy",selection:$scope){Text("Upravit začátek").tag("start");if !openInterval{Text("Upravit konec").tag("end");Text("Upravit začátek i konec").tag("both")}}.disabled(openInterval)};if interval.isNull || scope != "end"{DatePicker("Od",selection:$start)};if interval.isNull || (scope != "start" && !openInterval){DatePicker("Do",selection:$end)}};TextField("Povinný důvod",text:$reason,axis:.vertical);Text(remove ? "Smazání neschvaluje pracovník sám. Původní záznam zůstane v historii změn." : "Odešle se jen vybraná část. Nezměněný čas se nesmí přepsat. Interval musí patřit do docházky a návrh schvaluje správce.").font(.caption);if let problem{Text(problem).foregroundStyle(DiaryStyle.warning)};Button(remove ? "Odeslat smazání ke schválení" : "Odeslat návrh"){Task{await save()}}.disabled(busy)}.environment(\.timeZone,TimeZone(identifier:"Europe/Prague")!).navigationTitle(remove ? "Smazat pracovní dobu" : "Doplnění a oprava času").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít"){dismiss()}.disabled(busy)}}}.editLease(store).onAppear{user=interval["userId"].string.isEmpty ? store.userID : interval["userId"].string;scope=openInterval ? "start" : initialScope;if !interval.isNull{kind=interval["kind"].string;start=Date(timeIntervalSince1970:interval["startAt"].double/1000);if !interval["endAt"].isNull{end=Date(timeIntervalSince1970:interval["endAt"].double/1000)}}}}
    func save()async{busy=true;defer{busy=false};do{var body:APIValue = .object(["operationId":.s(UUID().uuidString),"intervalId":interval.isNull ? .s(UUID().uuidString) : interval["id"],"userId":.s(user),"version":interval.isNull ? .n(0) : interval["version"],"reason":.s(reason)]);if remove{guard !interval.isNull else{throw APIError.local("Smazat lze jen existující interval.")};body["remove"] = .bool(true)}else if interval.isNull{body["kind"] = .s(kind);body["startAt"] = .number((start.timeIntervalSince1970*1000).rounded(.down));body["endAt"] = .number((end.timeIntervalSince1970*1000).rounded(.down))}else{if kind != interval["kind"].string{body["kind"] = .s(kind)};if scope != "end"{body["startAt"] = .number((start.timeIntervalSince1970*1000).rounded(.down))};if scope != "start" && !openInterval{body["endAt"] = .number((end.timeIntervalSince1970*1000).rounded(.down))}};_ = try await store.write("/api/jobs/"+job.id+"/time/proposals",method:"POST",body:body);dismiss()}catch{problem=error.localizedDescription}}
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
