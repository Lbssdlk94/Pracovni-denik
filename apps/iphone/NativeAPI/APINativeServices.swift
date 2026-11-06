import Foundation
import CryptoKit

@MainActor
enum APIPushService {
    static func call(_ store:APIStore,action:String,extra:[String:Any])async throws->NativePushStatus {
        let transport=store.transport,key="push-device:"+transport.origin.host!+"|"+store.userID
        let device=APIKeychain.read(key).flatMap{String(data:$0,encoding:.utf8)}
        let value=try JSONDecoder().decode(APIValue.self,from:JSONSerialization.data(withJSONObject:extra))
        var result:APIValue
        switch action{
        case "config":
            result=try await transport.request("/api/notifications/native/config")
            if let device{let state=try await transport.request("/api/notifications/native?deviceId="+device);result=result.merged(state.object)}
            result["userId"] = .s(store.userID);result["deviceId"] = device.map{.s($0)} ?? .null
        case "register":
            result=try await transport.request("/api/notifications/native",method:"POST",body:value)
            if !store.fixture{try APIKeychain.write(result["deviceId"].string.data(using:.utf8),account:key)}
        case "detach":
            result=try await transport.request("/api/notifications/native",method:"DELETE",body:.object(["deviceId":device.map{.s($0)} ?? .null]));if !store.fixture{try APIKeychain.write(nil,account:key)}
        case "preferences":result=try await transport.request("/api/notifications/preferences",method:"PUT",body:value)
        case "test":guard let device else{throw APIError.local("Nejdříve zapněte oznámení.")};result=try await transport.request("/api/notifications/native/test",method:"POST",body:.object(["deviceId":.s(device)]))
        case "received":store.revision=UUID();result = .object(["ok":.bool(true)])
        default:throw APIError.local("Nepodporovaná operace oznámení.")
        }
        return try result.decode(NativePushStatus.self)
    }
}
@MainActor
enum APIWatchService {
    static func execute(_ store:APIStore,input:[String:Any])async throws->WatchReply {
        let data=try JSONSerialization.data(withJSONObject:input),request=try JSONDecoder().decode(WatchRequest.self,from:data);try request.validated()
        guard store.authenticated,store.online else{throw WatchContractError.unreachable}
        await store.resume();guard store.authenticated else{throw WatchContractError.unreachable}
        let binding=APIVault.hash(store.scope),scope=store.scope
        if request.kind=="refresh"{return WatchReply(requestId:request.requestId,snapshot:try await snapshot(store,binding:binding))}
        guard request.binding==binding,let id=request.jobId,let action=request.action,store.enabled("jobs"),store.enabled("jobDay") else{throw WatchContractError.stale}
        guard !store.editing else{throw DiaryBridgeError(message:"Na iPhonu je rozepsaný formulář. Nejdříve jej uložte nebo zavřete.",code:"native_form_open")}
        let response=try await store.get("/api/jobs/"+id),job=response["job"]
        guard assigned(job,store:store),job["dueDate"].string==store.today,job["version"].int==request.jobVersion else{throw WatchContractError.stale}
        var phone:String?,message="Změna byla uložena."
        if action == .openPhone || action == .complete && !job["servicePeriodId"].isNull{phone=job["servicePeriodId"].isNull ? "detail" : "protocol";message="Otevřete zakázku na iPhonu."}
        else if action == .accept {
            guard store.enabled("jobHandoffs") else{throw WatchContractError.invalid}
            let h=try await store.get("/api/jobs/"+id+"/handoffs");guard let own=h["handoffs"].array.first(where:{$0["userId"].string==store.userID}) else{throw WatchContractError.invalid}
            _=try await store.write("/api/jobs/"+id+"/handoffs",method:"POST",body:.object(["operationId":.s(request.requestId),"jobVersion":job["version"],"revision":h["revision"],"version":own["version"],"status":.s("accepted"),"note":.s("")]))
        }else if action == .depart{
            guard store.writer,store.enabled("jobTravel"),let time=request.arrivalTime else{throw WatchContractError.invalid}
            _=try await store.write("/api/jobs/"+id+"/departure",method:"POST",body:.object(["version":job["version"],"arrivalDate":.s(store.today),"arrivalTime":.s(time)]));phone="travelSms";message="Odjezd je uložený. SMS připravte na iPhonu."
        }else{
            guard !["done","incomplete"].contains(job["status"].string) else{throw WatchContractError.stale}
            _=try await store.write("/api/jobs/"+id+"/status",method:"PATCH",body:.object(["version":job["version"],"status":.s(action == .start ? "in_progress" : "done"),"incompleteReason":.s("")]))
        }
        guard scope==store.scope else{throw WatchContractError.stale}
        let refreshed=try? await snapshot(store,binding:binding)
        return WatchReply(requestId:request.requestId,snapshot:refreshed,message:message,phoneAction:phone,phoneJobId:phone==nil ? nil : id)
    }
    static func assigned(_ job:APIValue,store:APIStore)->Bool{(job["assignedTos"].array.map(\.string).contains(store.userID)||job["assignedTo"].string==store.userID)&&job["serviceApproval"].string=="confirmed"}
    static func snapshot(_ store:APIStore,binding:String)async throws->WatchSnapshot {
        let now=Date().timeIntervalSince1970*1000,scope=store.scope
        var jobs:[WatchJob]=[],notices:[WatchNotice]=[],unread=0,more=false
        if store.enabled("jobs")&&store.enabled("jobDay"){
            let page=try await store.get("/api/jobs?state=all&order=schedule&month="+String(store.today.prefix(7))+"&day="+store.today+"&assignee="+store.userID)
            let values=page["jobs"].array.filter{assigned($0,store:store)};more=values.count>30 || !page["nextCursor"].isNull
            for j in values.prefix(30){let own=j["handoffs"].array.first{$0["userId"].string==store.userID};let active = !["done","incomplete"].contains(j["status"].string)
                jobs.append(WatchJob(id:j.id,version:j["version"].int,title:j["title"].string,customerName:j["customerName"].string,address:j["address"].string,gardenName:j["gardenName"].string,dueDate:j["dueDate"].string,status:j["status"].string,kind:j["jobType"].string,discipline:j["discipline"].string,plannedStart:j["plannedStart"].string,arrivalStart:j["arrivalWindowStart"].string,arrivalEnd:j["arrivalWindowEnd"].string,originalStart:j["startTime"].string,estimatedMinutes:j["estimatedMinutes"].isNull ? nil : j["estimatedMinutes"].int,arrivalTime:j["arrivalTime"].string,handoffStatus:own?["status"].string ?? "pending",protocolStatus:j["protocolStatus"].string,incompleteReason:j["incompleteReason"].string,canStart:active && j["status"].string != "in_progress",canComplete:active,requiresProtocol:!j["servicePeriodId"].isNull,canDepart:active && store.writer && store.enabled("jobTravel"),canAccept:active && store.enabled("jobHandoffs") && own?["status"].string != "accepted"))
            }
        }
        if store.enabled("notifications"){let inbox=try await store.get("/api/notifications");unread=inbox["unread"].int;notices=inbox["notifications"].array.prefix(10).map{WatchNotice(id:$0.id,title:$0["title"].string,body:$0["body"].string,createdAt:$0["createdAt"].double,read:!$0["readAt"].isNull)}}
        guard scope==store.scope else{throw WatchContractError.stale}
        return WatchSnapshot(protocolVersion:1,binding:binding,generatedAt:now,today:store.today,companyName:store.company,userName:store.me["user"]["name"].string,jobsEnabled:store.enabled("jobs")&&store.enabled("jobDay"),notificationsEnabled:store.enabled("notifications"),jobs:jobs,hasMoreJobs:more,notices:notices,unread:unread)
    }
}
