import Foundation
import UIKit

// Isolated URLProtocol test backend. No production requests or credentials are used.
final class APIFixtureProtocol:URLProtocol {
    static let lock=NSLock()
    static var records:[String:APIValue]=[:]
    static var requests:[URLRequest]=[]
    static var forcedStatus:[String:Int]=[:]
    static func reset(){lock.lock();defer{lock.unlock()};records=[:];requests=[];forcedStatus=[:]}
    static func requestSnapshot()->[URLRequest]{lock.lock();defer{lock.unlock()};return requests}
    override class func canInit(with request:URLRequest)->Bool{true}
    override class func canonicalRequest(for request:URLRequest)->URLRequest{request}
    override func startLoading(){Self.lock.lock();let result=Self.response(request);Self.lock.unlock();let http=HTTPURLResponse(url:request.url!,statusCode:result.0,httpVersion:"HTTP/1.1",headerFields:result.2)!;client?.urlProtocol(self,didReceive:http,cacheStoragePolicy:.notAllowed);client?.urlProtocol(self,didLoad:result.1);client?.urlProtocolDidFinishLoading(self)}
    override func stopLoading(){}
    static func response(_ request:URLRequest)->(Int,Data,[String:String]){
        requests.append(request);let path=request.url!.path,method=request.httpMethod ?? "GET"
        func json(_ value:APIValue,_ status:Int=200)->(Int,Data,[String:String]){(status,(try? value.data()) ?? Data(),["Content-Type":"application/json"])}
        if let status=forcedStatus[path]{return json(.object(["error":.s("Isolated fixture \(status)")]),status)}
        func body()->APIValue{var data=request.httpBody;if data==nil,let stream=request.httpBodyStream{stream.open();defer{stream.close()};var bytes=Data();var buffer=[UInt8](repeating:0,count:4096);while stream.hasBytesAvailable{let n=stream.read(&buffer,maxLength:buffer.count);if n<=0{break};bytes.append(buffer,count:n)};data=bytes};return (try? JSONDecoder().decode(APIValue.self,from:data ?? Data())) ?? .null}
        let fixture=fixtureData(),me=fixture["context"].merged(["installation":.object(["id":.s("native-fixture"),"name":.s("Dr. Závlaha"),"version":.n(1)]),"license":.null])
        if path=="/api/me"{return json(records[path] ?? me)}
        if path=="/api/auth/login"{let b=body();if b["preview"].bool{return json(.object(["userId":.s("fixture-owner"),"credentialVersion":.n(1)]))};return(200,try! APIValue.object(["mustChange":.bool(false)]).data(),["Content-Type":"application/json","Set-Cookie":"__Host-zavlahy-access=fixture; Path=/; Secure; HttpOnly; SameSite=Lax"])}
        if path=="/api/auth/account"{return json(.object(["username":.s("fixture"),"version":.n(1)]))}
        if path=="/api/notifications/native/config"{return json(.object(["configured":.bool(false),"registered":.bool(false),"enabled":.bool(false),"userId":.s("fixture-owner")]))}
        if path=="/api/access-logout" || path=="/api/notifications/native"{return json(.object(["ok":.bool(true)]))}
        if path=="/api/jobs"{
            let all=fixture["jobs"].array.map{records["/api/jobs/"+$0.id] ?? $0}
            var jobs=all
            let q=Dictionary(URLComponents(url:request.url!,resolvingAgainstBaseURL:false)!.queryItems?.map{($0.name,$0.value ?? "")} ?? [],uniquingKeysWith:{$1})
            if let month=q["month"]{jobs=jobs.filter{$0["dueDate"].string.isEmpty || $0["dueDate"].string.hasPrefix(month+"-")}}
            if let day=q["day"]{jobs=jobs.filter{$0["dueDate"].string==(day=="undated" ? "" : day)}}
            let ranks=["in_progress":0,"on_way":1,"planned":2,"incomplete":3,"done":4];jobs.sort{(ranks[$0["status"].string] ?? 2)<(ranks[$1["status"].string] ?? 2)}
            var page:APIValue = .object(["jobs":.array(jobs),"nextCursor":.null])
            if q["cacheSnapshot"]=="1"{page["listRevision"] = .n(all.reduce(0){$0+$1["version"].int})}
            return json(page)
        }
        if path=="/api/workspace/manifest"{
            if let override=records[path]{return json(override)}
            let b=body(),names=["records","gardens","services","serviceWork","defects"]
            let jobs=fixture["jobs"].array.map{records["/api/jobs/"+$0.id] ?? $0},requested=Set(b["serviceWork"].array.map(\.string)),visible=jobs.filter{requested.contains($0.id)}
            let revision=jobs.reduce(0){$0+$1["version"].int},stamp="fixture:"+String(revision)
            if !b["expectedStamp"].string.isEmpty && b["expectedStamp"].string != stamp{return json(.object(["error":.s("Snapshot changed")]),409)}
            return json(.object(["completeForRequestedIds":.bool(true),"stamp":.s(stamp),"requestedCounts":.object(Dictionary(uniqueKeysWithValues:names.map{($0,.n(b[$0].array.count))})),"allowed":.object(Dictionary(uniqueKeysWithValues:names.map{($0,$0=="serviceWork" ? .array(visible.map{.s($0.id)}) : .array([]))})),"jobVersions":.object(Dictionary(uniqueKeysWithValues:visible.map{($0.id,$0["version"])})),"workspace":me["workspace"]]))
        }
        if path=="/api/customers"{return json(.object(["customers":.array(customers),"nextCursor":.null]))}
        if path=="/api/gardens"{return json(.object(["gardens":.array(gardens)]))}
        if path=="/api/materials"{return json(.object(["items":.array([material]),"categories":.array([.object(["id":.s("category-1"),"name":.s("Postřikovače"),"version":.n(1),"active":.bool(true)])]),"nextCursor":.null]))}
        if path=="/api/defects"{return json(.object(["defects":fixture["defects"]]))}
        if path=="/api/notifications"{return json(.object(["notifications":.array([.object(["id":.s("notice-1"),"title":.s("Ukázkové upozornění"),"body":.s("Zkontrolujte zadání zakázky."),"readAt":.null])]),"unread":.n(1)]))}
        if path=="/api/jobs/people" || path=="/api/defects/people"{return json(.object(["people":.array([me["user"]])]))}
        if path=="/api/zones"{return json(.object(["zones":.array([]),"version":.n(1)]))}
        if path=="/api/shafts"{return json(.object(["records":.array([])]))}
        if path=="/api/team"{return json(.object(["members":.array([me["user"]])]))}
        if path=="/api/attendance"{return json(.object(["shifts":.array([.object(["id":.s("shift-1"),"userId":.s("fixture-owner"),"userName":.s("Luboš – ukázka"),"startAt":.number(Date().addingTimeInterval(-3600).timeIntervalSince1970*1000),"endAt":.null,"version":.n(1)])]),"activeShift":.null,"summary":.object([:]),"employees":.array([me["user"]]),"corrections":.array([]),"pendingCorrections":.array([])]))}
        if path=="/api/vehicles"{return json(.object(["vehicles":.array([vehicle]),"driver":.object(["enabled":.bool(true),"vehicleId":vehicle["id"],"version":.n(1)]),"canManage":.bool(true),"canWrite":.bool(true)]))}
        if path=="/api/vehicles/vehicle-1"{return json(.object(["vehicle":vehicle,"entries":.array([.object(["id":.s("entry-1"),"kind":.s("fuel"),"date":.s("2026-11-06"),"costMinor":.n(36000),"litersMilli":.n(10000),"createdByName":.s("Luboš – ukázka"),"version":.n(1)])]),"receipts":.array([]),"consumption":.number(7.2),"canWrite":.bool(true)]))}
        let parts=path.split(separator:"/").map(String.init)
        if parts.count>=3 && parts[1]=="jobs",let base=fixture["jobs"].array.first(where:{$0.id==parts[2]}){let key="/api/jobs/"+parts[2];var job=records[key] ?? base
            if parts.count==3{if method=="PUT"{let b=body();guard b["version"]==job["version"]else{return json(.object(["error":.s("Konflikt verze")]),409)};job=job.merged(b.object);job["version"] = .n(job["version"].int+1);records[key]=job};return json(.object(["job":job]))}
            if ["completion","completion-target"].contains(parts[3]),method=="PATCH"{
                let b=body(),target=parts[3]=="completion-target",field=target ? "points" : "percent",versionKey=target ? "completionTargetVersion" : "completionVersion",operationKey="completion-operation:"+b["operationId"].string
                if let previous=records[operationKey]{guard previous==b else{return json(.object(["error":.s("Jiný obsah operace")]),409)};return json(.object(["job":job,"replayed":.bool(true)]))}
                guard b["version"].int==job[versionKey].int,b[field].int>=(target ? 1 : 0),b[field].int<=100 else{return json(.object(["error":.s("Konflikt odhadu")]),409)}
                if target{job["completionTargetPoints"]=b[field]}else{
                    let formatter=DateFormatter();formatter.timeZone=TimeZone(identifier:"Europe/Prague");formatter.dateFormat="yyyy-MM-dd";let day=formatter.string(from:Date())
                    if job["completionDay"].string != day{job["completionBaselinePercent"]=job["completionPercent"];job["completionBaselineDay"]=job["completionDay"]}
                    job["completionPercent"]=b[field];job["completionDay"] = .s(day);job["completionNote"]=b["note"].isNull ? .s("") : b["note"];job["completionUpdatedBy"]=me["user"]["id"];job["completionUpdatedName"]=me["user"]["name"];job["completionUpdatedAt"] = .number(Date().timeIntervalSince1970*1000)
                }
                job[versionKey] = .n(job[versionKey].int+1);job["version"] = .n(job["version"].int+1);records[key]=job;records[operationKey]=b;return json(.object(["job":job]))
            }
            if parts[3]=="time"{
                let timeKey=key+"/timeSnapshot",userID=me["user"]["id"],name=me["user"]["name"],manager=["owner","administrator","admin"].contains(me["user"]["role"].string)
                var time=records[timeKey] ?? .object(["job":job,"states":.array([.object(["userId":userID,"name":name,"version":.n(0),"active":.null,"assigned":.bool(true)])]),"intervals":.array([]),"reviews":.array([]),"rates":.array([]),"history":.array([]),"summary":.object(["total":.object(["workMs":.n(0),"travelMs":.n(0),"breakMs":.n(0)]),"days":.array([]),"workers":.array([])]),"canWrite":.bool(true),"canManage":.bool(manager),"canManageCosts":.bool(manager),"serverNow":.number(Date().timeIntervalSince1970*1000)])
                if parts.count==5,parts[4]=="actions",method=="POST"{
                    let b=body(),operationKey="time-operation:"+b["operationId"].string
                    if records[operationKey] != nil{return json(time.merged(["replayed":.bool(true)]))}
                    let workers=b["workers"].array
                    var states=time["states"].array,intervals=time["intervals"].array
                    guard !workers.isEmpty,workers.allSatisfy({worker in states.contains{$0["userId"]==worker["userId"] && $0["version"]==worker["version"]}}) else{return json(.object(["error":.s("Čas se změnil"),"code":.s("job_time_conflict")]),409)}
                    for worker in workers {
                        let index=states.firstIndex{$0["userId"]==worker["userId"]}!
                        var state=states[index]
                        if !state["active"].isNull{intervals=intervals.map{row in row.id==state["active"].id ? row.merged(["endAt":b["at"]]) : row}}
                        if b["action"].string=="stop"{state["active"] = .null}else{
                            let row=APIValue.object(["id":.s(b["operationId"].string+"_"+String(index)),"jobId":.s(parts[2]),"userId":state["userId"],"userName":state["name"],"kind":b["action"],"startAt":b["at"],"endAt":.null,"version":.n(1),"approval":.s("pending")]);intervals.append(row);state["active"]=row
                        }
                        state["version"] = .n(state["version"].int+1);states[index]=state
                    }
                    time["states"] = .array(states);time["intervals"] = .array(intervals);records[timeKey]=time;records[operationKey] = .bool(true)
                }
                return json(time)
            }
            if parts[3]=="departure",method=="POST"{
                let b=body();guard b["version"]==job["version"]else{return json(.object(["error":.s("Konflikt verze")]),409)}
                guard b["arrivalTime"].string.range(of:"^([01][0-9]|2[0-3]):[0-5][0-9]$",options:.regularExpression) != nil else{return json(.object(["error":.s("Přesný čas je povinný")]),400)}
                job=job.merged(["status":.s("on_way"),"arrivalTime":b["arrivalTime"],"arrivalDate":b["arrivalDate"],"version":.n(job["version"].int+1)]);records[key]=job;return json(.object(["job":job]))
            }
            if parts[3]=="photos"{
                if parts.count==4{return json(records[path] ?? .object(["photos":.array([]),"uploadStorage":.s("app"),"canUpload":.bool(true)]))}
                if parts.count==6,method=="PUT"{records[path] = .object(["ready":.bool(true)]);return json(.object(["ok":.bool(true)]))}
                if parts.count==5,method=="PATCH"{records[path]=body();return json(.object(["ok":.bool(true)]))}
            }
            if parts.count==6,parts[3]=="diary",parts[4]=="photos",method=="PUT"{return json(.object(["photo":.object(["id":.s(parts[5])])]))}
            if parts[3]=="diary"{
                let prefix=key+"/diary/"
                if parts.count==4{return json(.object(["job":job,"entries":.array(records.filter{$0.key.hasPrefix(prefix)}.values.sorted{$0["date"].string>$1["date"].string}),"nextCursor":.null]))}
                let entryKey=prefix+parts[4],old=records[entryKey] ?? .null
                if method=="DELETE"{
                    let b=body();guard ["owner","administrator"].contains(me["user"]["role"].string)else{return json(.object(["error":.s("Zakázáno")]),403)}
                    guard b["confirm"].string=="DELETE_JOB_DIARY_ENTRY",!old.isNull else{return json(.object(["error":.s("Potvrďte smazání")]),400)}
                    guard b["version"]==old["version"]else{return json(.object(["error":.s("Zápis se změnil")]),409)}
                    records.removeValue(forKey:entryKey);return json(.object(["ok":.bool(true)]))
                }
                if method=="PUT"{
                    let b=body()
                    if old["operationId"]==b["operationId"],!old.isNull{return json(.object(["job":job,"entry":old,"replayed":.bool(true)]))}
                    guard b["version"].int==old["version"].int else{return json(.object(["error":.s("Zápis se změnil"),"code":.s("diary_conflict")]),409)}
                    guard !b["photoIds"].array.isEmpty else{return json(.object(["error":.s("K dennímu zápisu přidejte alespoň jednu fotografii."),"code":.s("diary_photo_required")]),400)}
                    records[entryKey]=b.merged(["id":.s(parts[4]),"version":.n(old["version"].int+1),"authorName":.s("Luboš – ukázka"),"createdBy":.s("fixture-owner"),"canEdit":.bool(true),"canDelete":.bool(["owner","administrator"].contains(me["user"]["role"].string)),"photos":.array([])])
                }
                guard let row=records[entryKey]else{return json(.object(["error":.s("Zápis neexistuje")]),404)}
                return json(.object(["job":job,"entry":row]))
            }
            if parts[3]=="status"{let b=body();guard b["version"]==job["version"]else{return json(.object(["error":.s("Konflikt verze")]),409)};job["status"]=b["status"];job["incompleteReason"]=b["incompleteReason"];job["version"] = .n(job["version"].int+1);records[key]=job;return json(.object(["job":job]))}
            if parts[3]=="service"{var report=records[key+"/report"] ?? .null;if method=="PUT"{let b=body();guard b["version"]==job["version"]else{return json(.object(["error":.s("Konflikt verze")]),409)};report=b["report"];report["version"] = .n(1);report["documentState"] = .s(b["finalizeReport"].bool ? "ready" : "draft");records[key+"/report"]=report;job["version"] = .n(job["version"].int+1);if b["complete"].bool{job["status"] = .s("done")};records[key]=job};return json(.object(["job":job,"report":report,"photos":.array([]),"billingPreview":.object([:])]))}
            if parts[3]=="handoffs"{return json(.object(["jobVersion":job["version"],"revision":.n(1),"handoffs":.array([.object(["userId":.s("fixture-owner"),"version":.n(1),"status":.s("pending")])])]))}
        }
        if parts.count==3 && parts[1]=="customers",let row=customers.first(where:{$0.id==parts[2]}){return json(.object(["customer":row]))}
        if parts.count==4 && parts[1]=="gardens" && parts[3]=="history"{return json(.object(["visits":.array([.object(["id":.s("job:fixture-progress"),"jobId":.s("fixture-progress"),"title":.s("Servis závlahy"),"date":.s("2026-11-06"),"work":.s("Kontrola systému."),"status":.s("done"),"technician":.s("Luboš – ukázka")])])]))}
        if parts.count==4 && parts[1]=="gardens" && parts[3]=="services"{return json(.object(["services":.array([])]))}
        return json(.object(["error":.s("Testovací server nemá tuto cestu: "+path)]),501)
    }
    static func fixtureData()->APIValue{var raw=(try? JSONDecoder().decode(APIValue.self,from:Data(contentsOf:Bundle.main.url(forResource:"NativeFixture",withExtension:"json")!))) ?? .null;let f=DateFormatter();f.timeZone=TimeZone(identifier:"Europe/Prague");f.dateFormat="yyyy-MM-dd";let today=f.string(from:Date());raw["jobs"] = .array(raw["jobs"].array.map{$0.merged(["dueDate":.s(today),"gardenId":.s("garden-1"),"customerId":.s("customer-1"),"assignedTos":.array([.s("fixture-owner")]),"serviceApproval":.s("confirmed")])});var features=raw["context"]["features"].object;for k in ["offline","materials","vehicles","fleetFuel","fleetDriverSelection","fleetConsumption","fleetExpenses","photoUploads","protocolPhotos","drivePhotos","jobTravel","gardenHistory","service","plans","shafts","blowout","jobHandoffs"]{features[k] = .bool(true)};raw["context"]["features"] = .object(features);raw["context"]["workspace"]["workspaceId"] = .s("fixture-workspace");raw["context"]["workspace"]["role"]=raw["context"]["user"]["role"];if ProcessInfo.processInfo.arguments.contains("--native-api-reader-testing"){raw["context"]["user"]["role"] = .s("reader");raw["context"]["workspace"]["role"] = .s("reader");raw["context"]["permissions"]["write"] = .bool(false);raw["context"]["permissions"]["manage"] = .bool(false);raw["jobs"] = .array(raw["jobs"].array.map{$0.merged(["jobType":.s("installation")])})};return raw}
    static var customers:[APIValue]{[.object(["id":.s("customer-1"),"name":.s("Jan Kortus – ukázka"),"version":.n(1),"email":.s("test@example.invalid"),"phones":.array([.object(["id":.s("phone-1"),"number":.s("+420123456789"),"label":.s("Mobil")])]),"addresses":.array([.object(["id":.s("address-1"),"label":.s("Zahrada maminky"),"address":.s("Lipová 1488"),"city":.s("Blatná")])])])]}
    static var gardens:[APIValue]{[.object(["id":.s("garden-1"),"name":.s("Zahrada maminky"),"address":.s("Lipová 1488, Blatná"),"customerId":.s("customer-1"),"version":.n(1),"addressDetails":.object(["customerAddressId":.s("address-1"),"city":.s("Blatná")])]),.object(["id":.s("garden-2"),"name":.s("Zahrada u domu"),"address":.s("Nádražní 12, Písek"),"customerId":.s("customer-1"),"version":.n(1)])]}
    static var material:APIValue{.object(["id":.s("material-1"),"name":.s("Rotační tryska"),"sku":.s("RN 12"),"unit":.s("ks"),"currency":.s("CZK"),"priceMinor":.n(24500),"version":.n(1),"categoryId":.s("category-1"),"active":.bool(true)])}
    static var vehicle:APIValue{.object(["id":.s("vehicle-1"),"name":.s("Mercedes Sprinter"),"plate":.s("TEST 01"),"version":.n(1),"odometer":.n(12000)])}
}
