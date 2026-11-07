import Foundation
import UIKit

// Isolated URLProtocol test backend. No production requests or credentials are used.
final class APIFixtureProtocol:URLProtocol {
    static let lock=NSLock()
    static var records:[String:APIValue]=[:]
    static var requests:[URLRequest]=[]
    static var forcedStatus:[String:Int]=[:]
    static func reset(){lock.lock();defer{lock.unlock()};records=[:];requests=[];forcedStatus=[:]}
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
        if path=="/api/jobs"{var jobs=fixture["jobs"].array.map{job in records["/api/jobs/"+job.id] ?? job};let components=URLComponents(url:request.url!,resolvingAgainstBaseURL:false)!;let q=Dictionary(components.queryItems?.map{($0.name,$0.value ?? "")} ?? [],uniquingKeysWith:{$1});if let day=q["day"]{jobs=jobs.filter{$0["dueDate"].string==day}};let ranks=["in_progress":0,"on_way":1,"planned":2,"incomplete":3,"done":4];jobs.sort{(ranks[$0["status"].string] ?? 2)<(ranks[$1["status"].string] ?? 2)};return json(.object(["jobs":.array(jobs),"nextCursor":.null]))}
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
            if parts[3]=="status"{let b=body();guard b["version"]==job["version"]else{return json(.object(["error":.s("Konflikt verze")]),409)};job["status"]=b["status"];job["incompleteReason"]=b["incompleteReason"];job["version"] = .n(job["version"].int+1);records[key]=job;return json(.object(["job":job]))}
            if parts[3]=="service"{var report=records[key+"/report"] ?? .null;if method=="PUT"{let b=body();guard b["version"]==job["version"]else{return json(.object(["error":.s("Konflikt verze")]),409)};report=b["report"];report["version"] = .n(1);report["documentState"] = .s(b["finalizeReport"].bool ? "ready" : "draft");records[key+"/report"]=report;job["version"] = .n(job["version"].int+1);if b["complete"].bool{job["status"] = .s("done")};records[key]=job};return json(.object(["job":job,"report":report,"photos":.array([]),"billingPreview":.object([:])]))}
            if parts[3]=="handoffs"{return json(.object(["jobVersion":job["version"],"revision":.n(1),"handoffs":.array([.object(["userId":.s("fixture-owner"),"version":.n(1),"status":.s("pending")])])]))}
        }
        if parts.count==3 && parts[1]=="customers",let row=customers.first(where:{$0.id==parts[2]}){return json(.object(["customer":row]))}
        if parts.count==4 && parts[1]=="gardens" && parts[3]=="history"{return json(.object(["visits":.array([.object(["id":.s("job:fixture-progress"),"jobId":.s("fixture-progress"),"title":.s("Servis závlahy"),"date":.s("2026-11-06"),"work":.s("Kontrola systému."),"status":.s("done"),"technician":.s("Luboš – ukázka")])])]))}
        if parts.count==4 && parts[1]=="gardens" && parts[3]=="services"{return json(.object(["services":.array([])]))}
        return json(.object(["error":.s("Testovací server nemá tuto cestu: "+path)]),501)
    }
    static func fixtureData()->APIValue{var raw=(try? JSONDecoder().decode(APIValue.self,from:Data(contentsOf:Bundle.main.url(forResource:"NativeFixture",withExtension:"json")!))) ?? .null;let f=DateFormatter();f.timeZone=TimeZone(identifier:"Europe/Prague");f.dateFormat="yyyy-MM-dd";let today=f.string(from:Date());raw["jobs"] = .array(raw["jobs"].array.map{$0.merged(["dueDate":.s(today),"gardenId":.s("garden-1"),"customerId":.s("customer-1"),"assignedTos":.array([.s("fixture-owner")]),"serviceApproval":.s("confirmed")])});var features=raw["context"]["features"].object;for k in ["offline","materials","vehicles","fleetFuel","fleetDriverSelection","fleetConsumption","fleetExpenses","photoUploads","protocolPhotos","gardenHistory","service","plans","shafts","blowout","jobHandoffs"]{features[k] = .bool(true)};raw["context"]["features"] = .object(features);return raw}
    static var customers:[APIValue]{[.object(["id":.s("customer-1"),"name":.s("Jan Kortus – ukázka"),"version":.n(1),"email":.s("test@example.invalid"),"phones":.array([.object(["id":.s("phone-1"),"number":.s("+420123456789"),"label":.s("Mobil")])]),"addresses":.array([.object(["id":.s("address-1"),"label":.s("Zahrada maminky"),"address":.s("Lipová 1488"),"city":.s("Blatná")])])])]}
    static var gardens:[APIValue]{[.object(["id":.s("garden-1"),"name":.s("Zahrada maminky"),"address":.s("Lipová 1488, Blatná"),"customerId":.s("customer-1"),"version":.n(1),"addressDetails":.object(["customerAddressId":.s("address-1"),"city":.s("Blatná")])]),.object(["id":.s("garden-2"),"name":.s("Zahrada u domu"),"address":.s("Nádražní 12, Písek"),"customerId":.s("customer-1"),"version":.n(1)])]}
    static var material:APIValue{.object(["id":.s("material-1"),"name":.s("Rotační tryska"),"sku":.s("RN 12"),"unit":.s("ks"),"currency":.s("CZK"),"priceMinor":.n(24500),"version":.n(1),"categoryId":.s("category-1"),"active":.bool(true)])}
    static var vehicle:APIValue{.object(["id":.s("vehicle-1"),"name":.s("Mercedes Sprinter"),"plate":.s("TEST 01"),"version":.n(1),"odometer":.n(12000)])}
}
