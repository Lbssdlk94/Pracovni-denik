import SwiftUI
import UIKit

@MainActor final class APIProtocolModel:ObservableObject {
    @Published var snapshot:APIValue = .null
    @Published var value:APIValue = .null
    @Published var baseline:APIValue = .null
    @Published var materials:[APIValue]=[]
    @Published var categories:[APIValue]=[]
    @Published var problem:String?
    @Published var loaded=false
    @Published var busy=false
    @Published var localSaved=false
    var jobID="",scope="",operationID=UUID().uuidString
    var submitted:APIValue?
    var task:Task<Void,Never>?
    var key:String{"protocol:"+jobID}
    var path:String{"/api/jobs/"+jobID+"/service?editor=1"}
    var report:APIValue{value["report"]}
    var modern:Bool{snapshot["protocol"]["schema"].int==1}
    var template:APIValue{let d=report["protocolDetails"];return !d["template"].isNull ? d["template"] : snapshot["protocol"]["templates"].array.first{$0.id==d["templateId"].string} ?? APIProtocolLogic.fallback}
    func pending(_ store:APIStore)->[APIMutation]{store.outbox.filter{$0.path.hasPrefix("/api/jobs/"+jobID+"/service")}}
    func load(store:APIStore,jobID:String)async {
        guard !loaded else{return};self.jobID=jobID;scope=store.scope
        do{
            let snap=try await store.get(path);guard scope==store.scope else{return};snapshot=snap
            var r=snap["report"].isNull ? APIValue.object(["date":.s(store.today),"work":.s(""),"materialItems":.array([]),"photoIds":.array([]),"customerSignature":.s("")]) : snap["report"]
            normalize(&r)
            baseline = .object(["version":snap["job"]["version"],"report":r]);let draft=store.draft(key,fallback:baseline);value=draft.value;operationID=draft.operationID
            if let queued=pending(store).first(where:{$0.body != nil}){submitted=queued.draftSnapshot}
            loaded=true
            if store.enabled("materials"){do{materials=try await APIDomainLogic.referenceRows("materials",store:store);categories=(try await store.get("/api/materials"))["categories"].array}catch{problem="Katalog není úplný: "+error.localizedDescription}}
        }catch{problem=error.localizedDescription}
    }
    func normalize(_ report:inout APIValue){
        if modern{
            if report["protocolDetails"]["schema"].int != 1 {let t=snapshot["protocol"]["templates"].array.first{$0["active"].bool} ?? APIProtocolLogic.fallback;report["protocolDetails"] = .object(["schema":.n(1),"templateId":.s(t.id),"template":t,"activities":.array([]),"customWork":report["work"],"photos":.array([]),"timeSnapshot":snapshot["protocol"]["time"],"signature":.object(["status":.s(report["customerSignature"].string.isEmpty ? "missing" : "legacy")])])}
            if report["protocolDetails"]["signature"]["status"].string=="signed"{report["protocolDetails"]["signature"]["localHash"] = .s(APIProtocolLogic.fingerprint(report))}
        }
    }
    func changed(store:APIStore){
        guard loaded,scope==store.scope,store.writer,!store.isRolePreview else{return}
        if modern,report["protocolDetails"]["signature"]["status"].string=="signed",!report["protocolDetails"]["signature"]["localHash"].string.isEmpty,report["protocolDetails"]["signature"]["localHash"].string != APIProtocolLogic.fingerprint(report){value["report"]["customerSignature"] = .s("");value["report"]["protocolDetails"]["signature"] = .object(["status":.s("invalidated")]);value["report"]["protocolDetails"]["confirmSignature"] = .bool(false)}
        persist(store);task?.cancel();task=Task{try? await Task.sleep(nanoseconds:2_000_000_000);guard !Task.isCancelled else{return};await save(store:store,finalize:false)}
    }
    func persist(_ store:APIStore){guard loaded,store.writer,!store.isRolePreview,scope==store.scope,value != baseline else{return};do{try store.saveDraftChecked(key,draft:APIDraft(value:value,baseVersion:value["version"].int,operationID:operationID,updatedAt:Date()));localSaved=true}catch{localSaved=false;problem="Chyba ukládání: "+error.localizedDescription}}
    func save(store:APIStore,finalize:Bool,complete:Bool=false)async {
        guard loaded,!busy,scope==store.scope,store.writer,!store.isRolePreview else{return}
        if !pending(store).isEmpty{if finalize{problem="Nejdříve synchronizujte čekající změny protokolu."};return}
        if !finalize,value==baseline{return}
        busy=true;defer{busy=false};persist(store)
        do{
            guard localSaved || value==baseline else{throw APIError.local("Nejdříve opravte místní ukládání.")}
            var r=APIProtocolLogic.payloadReport(report,modern:modern);if !store.owner{r["workCharges"] = .null;var fields=r.object;fields.removeValue(forKey:"workCharges");r = .object(fields)}
            let captured=value,id=operationID,body=APIValue.object(["version":value["version"],"operationId":.s(id),"report":r,"finalizeReport":.bool(finalize),"complete":.bool(complete)])
            submitted=captured
            _ = try await store.write(path,method:"PUT",body:body,offline:true,draftKey:key,operationID:id,dependsOn:store.outbox.filter{$0.path.hasPrefix("/api/jobs/"+jobID+"/service/photos/")}.map(\.id))
            if pending(store).isEmpty{adoptAcknowledgement(store:store,captured:captured)}
            problem=nil
        }catch{problem=error.localizedDescription}
    }
    func adoptAcknowledgement(store:APIStore,captured:APIValue){
        guard let saved=store.vault?.state.cache[path],!saved["report"].isNull else{return}
        snapshot=saved;var r=saved["report"];normalize(&r);baseline = .object(["version":saved["job"]["version"],"report":r])
        if value==captured{value=baseline;localSaved=false;store.removeDraft(key)}else{value["version"]=saved["job"]["version"]}
        operationID=UUID().uuidString;submitted=nil
        if value != baseline{persist(store);changed(store:store)}
    }
    func syncChanged(store:APIStore){guard loaded,!busy,scope==store.scope else{return};if let captured=submitted,pending(store).isEmpty{adoptAcknowledgement(store:store,captured:captured)};if let bad=pending(store).first(where:{$0.state != "pending"}){problem=bad.error}}
    func state(_ store:APIStore)->String{if busy{return "Ukládání"};if !pending(store).isEmpty{return "Čeká na synchronizaci"};if value != baseline{return localSaved ? (store.online ? "Uloženo v zařízení" : "Offline – uloženo v zařízení") : "Chyba ukládání"};return store.online ? "Uloženo" : "Offline – uložená kopie"}
    var status:String{
        let deliveries=snapshot["protocol"]["delivery"].array.filter{!$0["stale"].bool}
        if deliveries.contains(where:{$0["state"].string=="sent" && !$0["sent_at"].isNull}){return "Odesláno zákazníkovi"}
        if deliveries.contains(where:{["pending","approved"].contains($0["state"].string)}){return "Čeká na schválení"}
        if report["documentState"].string=="ready",value==baseline{return "Potvrzeno"}
        return APIProtocolLogic.missing(report,template:template).isEmpty ? "Připraveno k potvrzení" : "Rozpracováno"
    }
    func sign(_ signature:APIValue,png:String){value["report"]["customerSignature"] = .s(png);value["report"]["protocolDetails"]["signature"]=signature;value["report"]["protocolDetails"]["confirmSignature"] = .bool(signature["status"].string=="signed");value["report"]["protocolDetails"]["signature"]["localHash"] = .s(APIProtocolLogic.fingerprint(report))}
}
