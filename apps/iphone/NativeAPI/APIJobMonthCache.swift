import Foundation

struct APIJobMonthSnapshot:Codable {
    var jobs:[APIValue]
    var savedAt:Date
    var revision:Int
    var dirty:Bool=false
}
struct APIJobMonthState:Codable {
    var months:[String:APIJobMonthSnapshot]=[:]
    var verifiedAt:Date = .distantPast
}

enum APIJobMonthCache {
    static func months(containing day:String)->[String]{
        var calendar=Calendar(identifier:.gregorian);calendar.timeZone=TimeZone(identifier:"Europe/Prague")!
        let format=DateFormatter();format.locale=Locale(identifier:"en_US_POSIX");format.calendar=calendar;format.timeZone=calendar.timeZone;format.dateFormat="yyyy-MM-dd";format.isLenient=false
        guard let date=format.date(from:String(day.prefix(7))+"-01") else{return []}
        return [0,-1,1].compactMap{offset in calendar.date(byAdding:.month,value:offset,to:date).map{String(format.string(from:$0).prefix(7))}}
    }
    static func parameters(_ path:String,today:String)->[String:String]?{
        guard let url=URLComponents(string:path),url.path=="/api/jobs" else{return nil}
        let p=Dictionary((url.queryItems ?? []).map{($0.name,$0.value ?? "")},uniquingKeysWith:{$1})
        let allowed:Set<String>=["state","order","month","day","type","protocol","q","assignee","discipline"]
        guard Set(p.keys).isSubset(of:allowed),p["order"]=="schedule",let month=p["month"],months(containing:today).contains(month),["all","active","planned","on_way","in_progress","done","incomplete"].contains(p["state"] ?? "active") else{return nil}
        if let day=p["day"],day != "undated"{
            let f=DateFormatter();f.locale=Locale(identifier:"en_US_POSIX");f.calendar=Calendar(identifier:.gregorian);f.timeZone=TimeZone(identifier:"Europe/Prague");f.dateFormat="yyyy-MM-dd";f.isLenient=false
            guard day.hasPrefix(month+"-"),day.count==10,let date=f.date(from:day),f.string(from:date)==day else{return nil}
        }
        if (p["q"] ?? "").count>100{return nil}
        if let type=p["type"],!type.isEmpty,!["service","installation","survey"].contains(type){return nil}
        if let proto=p["protocol"],!proto.isEmpty,!["missing","draft","ready","unfinished"].contains(proto){return nil}
        return p
    }
    static func isList(_ path:String)->Bool{URLComponents(string:path)?.path=="/api/jobs"}
    static func lean(_ job:APIValue)->APIValue{
        var fields=job.object;fields.removeValue(forKey:"gardenNotes")
        if !job["customerContact"].isNull{fields["customerContact"]=job["customerContact"].selecting(["id","name"])}
        return .object(fields)
    }
    static func ascii(_ value:String)->String{String(value.unicodeScalars.map{scalar in scalar.value>=65 && scalar.value<=90 ? Character(UnicodeScalar(scalar.value+32)!) : Character(scalar)})}
    static func result(path:String,state:APIJobMonthState,today:String,now:Date=Date(),offline:Bool=false)->APIValue?{
        guard let p=parameters(path,today:today),let snapshot=state.months[p["month"] ?? ""] else{return nil}
        let requested=p["state"] ?? "active",search=ascii((p["q"] ?? "").trimmingCharacters(in:.whitespacesAndNewlines)),assignee=p["assignee"] ?? "",kind=p["type"] ?? "",proto=p["protocol"] ?? ""
        var rows=snapshot.jobs.filter{job in
            let discipline=p["discipline"] ?? ""
            if !discipline.isEmpty && discipline != "all" && !job["discipline"].string.isEmpty && job["discipline"].string != discipline{return false}
            let status=job["status"].string,protocolState=job["protocolStatus"].string.isEmpty ? "missing" : job["protocolStatus"].string
            guard requested=="all" || requested=="active" && status != "done" || status==requested else{return false}
            guard kind.isEmpty || job["jobType"].string==kind else{return false}
            guard assignee.isEmpty || job["assignedTo"].string==assignee || job["assignedTos"].array.contains(.s(assignee)) else{return false}
            if !proto.isEmpty{
                guard status=="done" else{return false}
                guard proto=="unfinished" ? ["missing","draft"].contains(protocolState) : protocolState==proto else{return false}
            }
            return search.isEmpty || ["title","description","address","customerName"].contains{ascii(job[$0].string).contains(search)}
        }
        let counts=Dictionary(grouping:rows,by:{$0["dueDate"].string})
        if let day=p["day"],!day.isEmpty{rows=rows.filter{$0["dueDate"].string==(day=="undated" ? "" : day)}}
        guard rows.count<=500 else{return nil} // Preserve server pagination for large results.
        func rank(_ j:APIValue)->Int{j["status"].string=="in_progress" ? 0 : j["status"].string=="incomplete" ? 2 : j["status"].string=="done" ? 3 : 1}
        func order(_ j:APIValue)->[String]{[j["dueDate"].string.isEmpty ? "9999-99-99" : j["dueDate"].string,j["plannedStart"].string.isEmpty ? (j["startTime"].string.isEmpty ? "24:00" : j["startTime"].string) : j["plannedStart"].string,j.id]}
        rows.sort{rank($0)==rank($1) ? order($0).lexicographicallyPrecedes(order($1)) : rank($0)<rank($1)}
        let days=counts.keys.filter{!$0.isEmpty}.sorted().map{day in APIValue.object(["date":.s(day),"count":.n(counts[day]!.count)])}
        return .object(["jobs":.array(rows),"nextCursor":.null,"calendar":.object(["days":.array(days),"undatedCount":.n(counts[""]?.count ?? 0)]),"_jobCache":.object(["at":.number(snapshot.savedAt.timeIntervalSince1970*1000),"offline":.bool(offline),"stale":.bool(snapshot.dirty || now.timeIntervalSince(snapshot.savedAt)>=60)])])
    }
}

@MainActor
extension APIStore {
    func resetJobMonthWork(){jobMonthEpoch+=1;jobMonthTask?.cancel();jobMonthTask=nil;jobMonthPreparation?.cancel();jobMonthPreparation=nil;jobMonthsReady=false;jobMonthsAuthorized=false}
    func beginJobMonthChange(){jobMonthEpoch+=1;jobMonthTask?.cancel();jobMonthTask=nil;jobMonthPreparation?.cancel();jobMonthPreparation=nil}
    func purgeJobMonthCopies(){
        guard let local=vault else{return}
        local.state.jobMonths=nil
        for key in Array(local.state.cache.keys) where APIJobMonthCache.isList(key){local.state.cache.removeValue(forKey:key)}
        try? local.persist()
    }
    func cachedJobList(_ path:String)->APIValue?{
        guard authenticated,enabled("jobs"),enabled("offline"),jobMonthsAuthorized,let local=vault,online || local.offlineAllowed(),let state=local.state.jobMonths else{return nil}
        let selected=me["workspace"]["selectedDiscipline"].string
        if let requested=APIJobMonthCache.parameters(path,today:today)?["discipline"],!selected.isEmpty,selected != "all",requested != selected{return nil}
        return APIJobMonthCache.result(path:path,state:state,today:today,offline:!online)
    }
    func prepareJobMonths() async {
        guard !Task.isCancelled else{return}
        if jobMonthsReady{return};if let task=jobMonthPreparation{await task.value;return}
        let ticket=jobMonthEpoch,binding=scope
        let task=Task{@MainActor in
            guard !Task.isCancelled,let local=self.vault,self.authenticated,self.enabled("jobs"),self.enabled("offline")else{return}
            // Generic job lists from older versions have no per-record access fence.
            for key in Array(local.state.cache.keys) where APIJobMonthCache.isList(key){local.state.cache.removeValue(forKey:key)}
            var state=local.state.jobMonths ?? APIJobMonthState();let window=Set(APIJobMonthCache.months(containing:self.today));state.months=state.months.filter{window.contains($0.key)}
            if self.enabled("attendance"){state.months=state.months.filter{_,snapshot in snapshot.jobs.allSatisfy{!$0["myTime"].isNull}}}
            if !self.online{self.jobMonthsAuthorized=local.offlineAllowed() && Date().timeIntervalSince(state.verifiedAt)<86400;self.jobMonthsReady=true;return}
            if self.me["workspace"].isNull{state=APIJobMonthState();local.state.jobMonths=state;self.jobMonthsAuthorized=true;self.jobMonthsReady=true;try? local.persist();return}
            let ids=Array(Set(state.months.values.flatMap{$0.jobs.map(\.id)})).sorted()
            if ids.isEmpty{local.state.jobMonths=state;self.jobMonthsAuthorized=true;self.jobMonthsReady=true;return}
            do{
                var allowed=Set<String>(),versions:[String:Int]=[:],stamp=""
                for start in stride(from:0,to:ids.count,by:1000){
                    guard !Task.isCancelled,ticket==self.jobMonthEpoch,binding==self.scope else{return}
                    var input:APIValue = .object(["records":.array([]),"gardens":.array([]),"services":.array([]),"defects":.array([]),"serviceWork":.array(ids[start..<min(start+1000,ids.count)].map{.s($0)})]);if !stamp.isEmpty{input["expectedStamp"] = .s(stamp)}
                    let requested=Set(ids[start..<min(start+1000,ids.count)])
                    let manifest=try await self.transport.request("/api/workspace/manifest",method:"POST",body:input)
                    guard !Task.isCancelled,ticket==self.jobMonthEpoch,binding==self.scope else{return}
                    guard manifest["completeForRequestedIds"].bool,manifest["requestedCounts"]["serviceWork"].int==min(1000,ids.count-start),!manifest["stamp"].string.isEmpty,stamp.isEmpty || stamp==manifest["stamp"].string,manifest["workspace"]["authorizationVersion"]==self.me["workspace"]["authorizationVersion"],manifest["workspace"]["role"].string==self.actualRole,manifest["workspace"]["workspaceId"]==self.me["workspace"]["workspaceId"],manifest["workspace"]["disciplines"]==self.me["workspace"]["disciplines"],Set(manifest["allowed"]["serviceWork"].array.map(\.string)).isSubset(of:requested) else{throw APIError.local("Oprávnění uložených zakázek nebylo potvrzeno.")}
                    stamp=manifest["stamp"].string;allowed.formUnion(manifest["allowed"]["serviceWork"].array.map(\.string));for(id,value)in manifest["jobVersions"].object{versions[id]=value.int}
                }
                guard !Task.isCancelled,ticket==self.jobMonthEpoch,binding==self.scope else{return}
                let fence:APIValue = .object(["records":.array([]),"gardens":.array([]),"services":.array([]),"defects":.array([]),"serviceWork":.array([]),"expectedStamp":.s(stamp)])
                let final=try await self.transport.request("/api/workspace/manifest",method:"POST",body:fence)
                guard final["stamp"].string==stamp,final["completeForRequestedIds"].bool,final["requestedCounts"]["serviceWork"].int==0 else{throw APIError.local("Přiřazení zakázek se změnilo.")}
                guard ticket==self.jobMonthEpoch,binding==self.scope,!Task.isCancelled else{return}
                state.months=state.months.filter{_,snapshot in snapshot.jobs.allSatisfy{allowed.contains($0.id)&&versions[$0.id]==$0["version"].int}}
                state.verifiedAt=Date();local.state.jobMonths=state;self.jobMonthsAuthorized=true;self.jobMonthsReady=true;try? local.persist()
            }catch{
                guard ticket==self.jobMonthEpoch,binding==self.scope,!Task.isCancelled else{return}
                if let error=error as? APIError,error.status==401{self.lock();return}
                if let error=error as? APIError,error.isTransient,local.offlineAllowed(),Date().timeIntervalSince(state.verifiedAt)<86400{self.jobMonthsAuthorized=true}
                else{self.purgeJobMonthCopies();self.jobMonthsAuthorized=false}
                self.jobMonthsReady=true
            }
        }
        jobMonthPreparation=task;await task.value;if ticket==jobMonthEpoch{jobMonthPreparation=nil}
    }
    func scheduleJobMonths(){guard authenticated,enabled("jobs"),enabled("offline"),online,!isRolePreview,jobMonthTask==nil else{return};jobMonthTask=Task{@MainActor in await self.downloadJobMonths()}}
    func downloadJobMonths() async {
        guard !Task.isCancelled else{return}
        await prepareJobMonths();let ticket=jobMonthEpoch,binding=scope
        defer{if ticket==jobMonthEpoch{jobMonthTask=nil}}
        guard authenticated,online,enabled("jobs"),enabled("offline"),!Task.isCancelled,let local=vault else{return}
        for month in APIJobMonthCache.months(containing:today){
            if let old=local.state.jobMonths?.months[month],!old.dirty,Date().timeIntervalSince(old.savedAt)<60{continue}
            var rows:[APIValue]=[],seen=Set<String>(),cursor="",revision:Int?,complete=false
            do{
                for _ in 0..<50{
                    var url=URLComponents(string:"/api/jobs")!;var q=[URLQueryItem(name:"state",value:"all"),URLQueryItem(name:"order",value:"schedule"),URLQueryItem(name:"month",value:month),URLQueryItem(name:"cacheSnapshot",value:"1")];if !cursor.isEmpty{q.append(URLQueryItem(name:"cursor",value:cursor))};url.queryItems=q
                    let page=try await transport.request(url.string!)
                    guard ticket==jobMonthEpoch,binding==scope,online,!Task.isCancelled else{return}
                    guard !page["listRevision"].isNull,revision==nil || revision==page["listRevision"].int else{break};revision=page["listRevision"].int
                    for job in page["jobs"].array where seen.insert(job.id).inserted{rows.append(APIJobMonthCache.lean(job))}
                    let next=page["nextCursor"].string;if next.isEmpty{complete=true;break};guard next != cursor else{break};cursor=next
                }
                if complete,let revision{
                    var state=local.state.jobMonths ?? APIJobMonthState();let old=state.months[month];state.months=state.months.filter{APIJobMonthCache.months(containing:today).contains($0.key)};state.months[month]=APIJobMonthSnapshot(jobs:rows,savedAt:Date(),revision:revision);state.verifiedAt=Date();local.state.jobMonths=state;jobMonthsAuthorized=true;try? local.persist()
                    if old?.jobs != rows || old?.dirty==true{self.revision=UUID()}
                }
            }catch let e as APIError{
                guard ticket==jobMonthEpoch,binding==scope,!Task.isCancelled else{return};if e.status==401{lock();return};if e.status==403{purgeJobMonthCopies();jobMonthsAuthorized=false;self.revision=UUID()};return
            }catch{return}
        }
    }
    func jobMonthsChanged(path:String,result:APIValue){
        let route=URLComponents(string:path)?.path ?? path
        guard ["/api/jobs","/api/customers","/api/gardens","/api/subscriptions","/api/members","/api/features"].contains(where:{route==$0 || route.hasPrefix($0+"/")}) else{return}
        beginJobMonthChange();guard let local=vault,var state=local.state.jobMonths else{return}
        let parts=route.split(separator:"/"),deleted=result["deleted"].bool && parts.count==3 && parts[1]=="jobs" ? String(parts[2]) : ""
        let replacements=([result["job"]]+result["jobs"].array).filter{!$0.id.isEmpty && !$0["title"].isNull && !$0["dueDate"].isNull};let ids=Set(replacements.map(\.id))
        for month in Array(state.months.keys){guard var snapshot=state.months[month]else{continue};snapshot.jobs.removeAll{$0.id==deleted || ids.contains($0.id)};snapshot.jobs += replacements.filter{$0["dueDate"].string.isEmpty || $0["dueDate"].string.hasPrefix(month+"-")}.map(APIJobMonthCache.lean);snapshot.dirty=true;state.months[month]=snapshot}
        local.state.jobMonths=state;for key in Array(local.state.cache.keys) where APIJobMonthCache.isList(key){local.state.cache.removeValue(forKey:key)}
    }
}
