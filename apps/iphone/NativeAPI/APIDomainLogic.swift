import Foundation

enum APIDomainLogic {
    static func referenceLabel(_ row: APIValue, kind: String) -> String {
        if kind == "gardens" { return [row["name"].string,row["addressDetails"]["city"].string,row["address"].string.replacingOccurrences(of:", Česká republika",with:"")].filter{!$0.isEmpty}.joined(separator:" · ") }
        if kind == "materials" { return [row["name"].string,row["sku"].string,row["unit"].string].filter{!$0.isEmpty}.joined(separator:" · ") }
        return row.title
    }
    @MainActor static func referenceRows(_ key: String, store: APIStore) async throws -> [APIValue] {
        let map: [String:(String,String)] = ["customers":("/api/customers","customers"),"gardens":("/api/gardens","gardens"),"people":("/api/jobs/people","people"),"defectPeople":("/api/defects/people","people"),"jobs":("/api/jobs?state=all","jobs"),"defects":("/api/defects","defects"),"materials":("/api/materials","items"),"categories":("/api/materials","categories"),"vehicles":("/api/vehicles","vehicles"),"tariffs":("/api/tariffs/options","tariffs")]
        guard let (path,list)=map[key] else { return [] }
        var result:[APIValue]=[],next:String?=nil,seen=Set<String>()
        repeat {
            var c=URLComponents(string:path)!
            if let next { var q=c.queryItems ?? [];q.append(URLQueryItem(name:key=="materials" ? "after" : "cursor",value:next));c.queryItems=q }
            let page=try await store.get(c.string!);result += page[list].array
            let cursor=page["nextCursor"].string
            if cursor.isEmpty || seen.contains(cursor) { next=nil } else { seen.insert(cursor);next=cursor }
            if key == "categories" { next=nil }
        } while next != nil
        return result
    }
    static func prefillGarden(_ input: APIValue, garden: APIValue, touched: Set<String>) -> APIValue {
        guard input["gardenId"].string == garden.id else { return input }
        var result=input
        let fields:[String:APIValue] = ["customerId":garden["customerId"],"address":garden["address"],"city":garden["addressDetails"]["city"],"customerAddressId":garden["addressDetails"]["customerAddressId"]]
        for (key,value) in fields where !touched.contains(key) && !value.isNull && !value.string.isEmpty { result[key]=value }
        return result
    }
    @MainActor static func save(resource:APIResource,value:APIValue,isNew:Bool,operationID:String,draftKey:String,store:APIStore) async throws {
        let id=value.id.isEmpty ? UUID().uuidString : value.id
        var body=value.selecting(resource.fields.map(\.id)+["version"])
        if body["version"].isNull { body["version"] = .n(0) }
        if store.me["workspace"].isNull { var fields=body.object;fields.removeValue(forKey:"discipline");body = .object(fields) }
        var path=resource.recordPath(id),method="PUT",offline=false
        switch resource.entity {
        case .jobs:
            body=body.merged(["customerAddressId":value["customerAddressId"],"assignedTo":value["assignedTos"].array.first ?? value["assignedTo"],"status":value["status"].isNull ? .s("planned") : value["status"],"incompleteReason":value["incompleteReason"].isNull ? .s("") : value["incompleteReason"]])
            if !value["previewRevision"].isNull { body["previewRevision"]=value["previewRevision"];body["allowOverlaps"]=value["allowOverlaps"] }
        case .gardens: if isNew { path="/api/gardens";method="POST";body["id"] = .s(id) } else { method="PATCH" }
        case .defects:
            body["mutationId"] = .s(operationID);body["photos"] = value["photos"].isNull ? .array([]) : value["photos"]
            if value["fromProtocol"].bool { body["fromProtocol"] = .bool(true) }
            offline=true
        case .services: body["mutationId"] = .s(operationID);offline=true
        case .vehicles,.entries,.drivers: body["operationId"] = .s(operationID)
        case .customers: break
        case .materials,.categories: break
        case .tariffs: break
        default: throw APIError.local("Tento záznam má vlastní postup uložení.")
        }
        _ = try await store.write(path,method:method,body:body,offline:offline,draftKey:draftKey,operationID:operationID)
    }
}
