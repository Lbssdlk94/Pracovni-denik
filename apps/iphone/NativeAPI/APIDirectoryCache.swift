import Foundation

// The existing encrypted, account/installation/grant-scoped vault owns this snapshot.
enum APIDirectoryCache {
    static let key="directory-snapshot-v1"
    static let lifetime:TimeInterval=120
    static func matches(_ path:String)->Bool{
        guard path.hasPrefix("/api/"),let url=URLComponents(string:path),url.host==nil,url.scheme==nil,url.path.range(of:"^/api/(customers|gardens)(?:/[-\\w]{1,100})?$",options:.regularExpression) != nil else{return false}
        return (url.queryItems ?? []).allSatisfy{["q","cursor","discipline"].contains($0.name)}
    }
    static func invalid(_ message:String="Adresář nebo oprávnění se změnily.")->APIError{APIError(status:409,code:"directory_invalidated",message:message)}
    static func result(_ path:String,snapshot:APIValue,offline:Bool,now:Date=Date())throws->APIValue{
        guard let url=URLComponents(string:path),matches(path)else{throw invalid()}
        let parts=url.path.split(separator:"/").map(String.init),kind=parts[1]
        let p=Dictionary((url.queryItems ?? []).map{($0.name,$0.value ?? "")},uniquingKeysWith:{$1})
        var rows=snapshot[kind].array
        if let discipline=p["discipline"],discipline != "all"{rows=rows.filter{$0["disciplines"].array.contains(.s(discipline))}}
        let metadata:APIValue = .object(["at":snapshot["at"],"offline":.bool(offline),"persistent":.bool(snapshot["persistent"].isNull || snapshot["persistent"].bool),"stale":.bool(now.timeIntervalSince1970*1000-snapshot["at"].double>=lifetime*1000)])
        if parts.count==3{
            guard let row=rows.first(where:{$0.id==parts[2]})else{throw APIError(status:404,code:"directory_missing",message:"Záznam není v dostupném uloženém adresáři.")}
            let value=kind=="customers" ? row.merged(["gardens":.array(snapshot["gardens"].array.filter{$0["customerId"].string==row.id})]) : row
            return .object([kind=="customers" ? "customer" : "garden":value,"_directoryCache":metadata])
        }
        if let q=p["q"],!q.isEmpty{rows=rows.filter{row in
            let fields=[row["name"].string,row["email"].string,row["address"].string]+row["phones"].array.map{$0["number"].string}+row["addresses"].array.flatMap{[$0["address"].string,$0["city"].string]}
            return fields.joined(separator:" ").range(of:q,options:[.caseInsensitive,.diacriticInsensitive]) != nil
        }}
        rows.sort{let order=$0["name"].string.localizedStandardCompare($1["name"].string);return order == .orderedSame ? $0.id<$1.id : order == .orderedAscending}
        if kind=="gardens"{return .object(["gardens":.array(rows),"_directoryCache":metadata])}
        var offset=0
        if let cursor=p["cursor"],!cursor.isEmpty{
            let c=cursor.split(separator:":");guard c.count==3,c[0]=="directory",Double(c[1])==snapshot["at"].double,let index=Int(c[2]),index>=0,index<=rows.count else{throw invalid("Adresář se změnil. Obnovte první stránku.")};offset=index
        }
        let end=min(offset+100,rows.count),cursor=end<rows.count ? "directory:"+String(Int64(snapshot["at"].double))+":"+String(end) : ""
        return .object(["customers":.array(Array(rows[offset..<end])),"nextCursor":cursor.isEmpty ? .null : .s(cursor),"_directoryCache":metadata])
    }
}

@MainActor
extension APIStore {
    func resetDirectory(){directoryEpoch+=1;directoryFlight?.cancel();directoryFlight=nil;directoryReady=false}
    func purgeDirectory(){
        let existed=vault?.state.cache[APIDirectoryCache.key] != nil
        resetDirectory();guard let local=vault else{return};local.state.cache.removeValue(forKey:APIDirectoryCache.key)
        for path in Array(local.state.cache.keys) where APIDirectoryCache.matches(path){local.state.cache.removeValue(forKey:path)}
        try? local.persist();if existed{revision=UUID()}
    }
    func directoryChanged(path:String){
        guard let url=URLComponents(string:path)else{return}
        let parts=url.path.split(separator:"/")
        if parts.count>=2 && ["customers","gardens","members","features","local-accounts","workspace"].contains(String(parts[1])) || parts.count==3 && parts[1]=="jobs" {purgeDirectory()}
    }
    func scheduleDirectory(){
        guard !fixture,authenticated,online,enabled("offline"),!isRolePreview,directoryFlight==nil else{return}
        Task{@MainActor in _ = try? await prepareDirectory()}
    }
    func directoryRead(_ path:String,refresh:Bool)async throws->APIValue{
        guard authenticated else{throw APIError.local("Nejdříve se přihlaste.")}
        let license=me["license"]
        guard license.isNull || license["active"].bool && license["expiresAt"].double>Date().timeIntervalSince1970*1000 else{purgeDirectory();throw APIError.local("Licence vyžaduje ověření s připojením.")}
        guard enabled("offline"),!isRolePreview else{
            guard online else{throw APIError.local("Adresář v tomto režimu vyžaduje připojení.")}
            do{return try await transport.request(path)}catch let e as APIError{if e.status==401{lock()};throw e}
        }
        guard let kind=URLComponents(string:path)?.path.split(separator:"/").dropFirst().first,enabled(String(kind))else{throw APIError(status:403,code:"module_disabled",message:"Tento modul je vypnutý.")}
        let url=URLComponents(string:path),requested=url?.queryItems?.first{$0.name=="discipline"}?.value,selected=me["workspace"]["selectedDiscipline"].string
        if let requested,!selected.isEmpty,selected != "all",requested != selected{guard online else{throw APIError.local("Tento obor není uložený v aktuálním adresáři.")};return try await transport.request(path)}
        if !refresh,directoryReady,let local=vault,local.offlineAllowed(),let old=local.state.cache[APIDirectoryCache.key],Date().timeIntervalSince1970*1000-old["at"].double<86400000{
            if online && Date().timeIntervalSince1970*1000-old["at"].double>=APIDirectoryCache.lifetime*1000{scheduleDirectory()}
            return try APIDirectoryCache.result(path,snapshot:old,offline:!online)
        }
        let snapshot=try await prepareDirectory(force:refresh)
        return try APIDirectoryCache.result(path,snapshot:snapshot,offline:!online)
    }
    func prepareDirectory(force:Bool=false)async throws->APIValue{
        guard authenticated,let local=vault,enabled("offline"),!isRolePreview else{throw APIDirectoryCache.invalid()}
        let old=local.state.cache[APIDirectoryCache.key] ?? .null
        func recent(_ value:APIValue,_ seconds:TimeInterval)->Bool{let age=Date().timeIntervalSince1970*1000-value["at"].double;return !value.isNull && age>=0 && age<seconds*1000}
        if !online{guard local.offlineAllowed(),recent(old,86400)else{throw APIError.local("Adresář zatím není uložený nebo potřebuje ověření s připojením.")};return old}
        if directoryReady && !force && (recent(old,APIDirectoryCache.lifetime) || recent(old,86400) && Date().timeIntervalSince(directoryLastAttempt)<30){return old}
        if let flight=directoryFlight{return try await flight.value}
        directoryLastAttempt=Date()
        let ticket=directoryEpoch,binding=scope,session=me
        let task=Task{@MainActor () async throws -> APIValue in
            var oldAllowed=true
            @MainActor func check()throws{guard !Task.isCancelled,self.authenticated,self.scope==binding,self.directoryEpoch==ticket else{throw APIDirectoryCache.invalid()}}
            @MainActor func fence(_ expected:String="")async throws->String{
                if session["workspace"].isNull{return ""}
                var input:APIValue = .object(["records":.array([]),"gardens":.array([]),"services":.array([]),"serviceWork":.array([]),"defects":.array([])])
                if !expected.isEmpty{input["expectedStamp"] = .s(expected)}
                let manifest=try await self.transport.request("/api/workspace/manifest",method:"POST",body:input);try check()
                guard manifest["completeForRequestedIds"].bool,!manifest["stamp"].string.isEmpty,expected.isEmpty || manifest["stamp"].string==expected,
                    manifest["workspace"]["workspaceId"]==session["workspace"]["workspaceId"],manifest["workspace"]["authorizationVersion"]==session["workspace"]["authorizationVersion"],manifest["workspace"]["role"]==session["user"]["role"],manifest["workspace"]["disciplines"]==session["workspace"]["disciplines"],manifest["features"].isNull || manifest["features"]==session["features"] else{throw APIDirectoryCache.invalid()}
                return manifest["stamp"].string
            }
            do{
                let stamp=try await fence();try check()
                if !old.isNull && old["stamp"].string != stamp{oldAllowed=false;local.state.cache.removeValue(forKey:APIDirectoryCache.key);self.directoryReady=false;try local.persist();self.revision=UUID()}
                var customers:[APIValue]=[],gardens:[APIValue]=[],cursor="",seen=Set<String>()
                if self.enabled("customers"){
                    for page in 0..<200{
                        var url=URLComponents(string:"/api/customers")!;if !cursor.isEmpty{url.queryItems=[URLQueryItem(name:"cursor",value:cursor)]}
                        let response=try await self.transport.request(url.string!);try check()
                        guard case .array(let rows)=response["customers"]else{throw APIDirectoryCache.invalid("Neúplný adresář.")}
                        for row in rows{guard !row.id.isEmpty,seen.insert(row.id).inserted else{throw APIDirectoryCache.invalid("Adresář se během načítání změnil.")};customers.append(row)}
                        let next=response["nextCursor"].string;if next.isEmpty{break};guard page<199,next != cursor else{throw APIDirectoryCache.invalid("Adresář nebyl načten celý.")};cursor=next
                    }
                }
                if self.enabled("gardens"){
                    let response=try await self.transport.request("/api/gardens");try check()
                    guard case .array(let rows)=response["gardens"],Set(rows.map(\.id)).count==rows.count else{throw APIDirectoryCache.invalid("Neúplný seznam zahrad.")};gardens=rows
                }
                _ = try await fence(stamp);try check()
                var result:APIValue = .object(["at":.number((Date().timeIntervalSince1970*1000).rounded(.down)),"stamp":.s(stamp),"customers":.array(customers),"gardens":.array(gardens)])
                local.state.cache[APIDirectoryCache.key]=result
                do{try local.persist()}catch{result["persistent"] = .bool(false);local.state.cache[APIDirectoryCache.key]=result;self.error="Adresář je načtený, ale kopii se nepodařilo uložit do telefonu."}
                self.directoryReady=true
                if old["customers"] != result["customers"] || old["gardens"] != result["gardens"]{self.revision=UUID()}
                return result
            }catch{
                try check()
                if let e=error as? APIError{if e.status==401{self.lock();throw e};if [403,404,409].contains(e.status){self.purgeDirectory();throw e}}
                if !oldAllowed{self.directoryReady=false;self.revision=UUID()}
                if oldAllowed,local.offlineAllowed(),recent(old,86400){self.directoryReady=true;return old}
                throw error
            }
        }
        directoryFlight=task;defer{if ticket==directoryEpoch{directoryFlight=nil}}
        return try await task.value
    }
}
