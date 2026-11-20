import SwiftUI

@MainActor final class APIAttendanceModel:ObservableObject {
    @Published var data:APIValue = .null
    @Published var loading=false
    @Published var problem:String?
    @Published var received:Date?
    private var scope="",request=""
    private var ticket=UUID()
    func load(store:APIStore,month:String,user:String,discipline:String,refresh:Bool=false)async {
        let key="/api/attendance?month="+month+"&userId="+user+"&detail=1&discipline="+discipline,id=UUID(),binding=store.scope
        if scope != binding || request != key{data = .null;received=nil};scope=binding;request=key;ticket=id;loading=true
        defer{if ticket==id{loading=false}}
        do{let value=try await store.get(key,refresh:refresh);guard ticket==id,binding==store.scope,!Task.isCancelled else{return};data=value;received=Date();problem=nil}
        catch{guard ticket==id,binding==store.scope,!Task.isCancelled else{return};if let e=error as? APIError,[401,403,404].contains(e.status){data = .null;received=nil};problem=error.localizedDescription}
    }
    func projected(store:APIStore)->APIValue {
        var value=data,detail=data["detail"]
        if detail.isNull{detail = .object(["people":store.manager ? data["employees"] : .array([store.me["user"]]),"shifts":data["shifts"],"intervals":.array([])])}
        let states=detail["states"].array
        let own=detail["ownToday"]["state"].merged(["userId":.s(store.userID),"name":store.me["user"]["name"]])
        let seed=APIValue.object(["attendanceProjection":.bool(true),"job":.null,"states":.array(states.filter{$0["userId"].string != store.userID}+[own]),"intervals":.array(APIAttendanceLogic.unique(detail["intervals"].array+detail["ownToday"]["intervals"].array))])
        let projected=APIWorkTimeLogic.project(seed,store:store)
        var shifts=APIAttendanceLogic.unique(data["shifts"].array+detail["shifts"].array+detail["todayShifts"].array+detail["recentShifts"].array+detail["ownToday"]["shifts"].array+[data["activeShift"]])
        var active=data["activeShift"]
        for op in store.outbox.filter({($0.path=="/api/attendance/punch" || $0.path.hasSuffix("/time/actions")) && $0.state=="pending"}).sorted(by:{($0.body?["at"].double ?? 0)<($1.body?["at"].double ?? 0)}) {
            guard let input=op.body else{continue}
            if op.path.hasSuffix("/time/actions") {
                guard active.isNull,["work","travel","break","other","move"].contains(input["action"].string),let index=input["workers"].array.firstIndex(where:{$0["userId"].string==store.userID})else{continue}
                active = .object(["id":.s(input["operationId"].string+"_shift_"+String(index)),"userId":.s(store.userID),"userName":store.me["user"]["name"],"startAt":input["at"],"endAt":.null,"version":.n(1),"pending":.bool(true)])
                shifts=APIAttendanceLogic.unique(shifts+[active]);continue
            }
            if input["kind"].string=="arrival"{
                active = .object(["id":input["mutationId"],"userId":.s(store.userID),"userName":store.me["user"]["name"],"startAt":input["at"],"endAt":.null,"version":.n(1),"pending":.bool(true)])
                shifts=APIAttendanceLogic.unique(shifts+[active])
            }else if let i=shifts.firstIndex(where:{$0.id==input["shiftId"].string}) {
                shifts[i]["endAt"]=input["at"];shifts[i]["pending"] = .bool(true);shifts[i]["version"] = .n(shifts[i]["version"].int+1)
                if active.id==input["shiftId"].string{active = .null}
            }
        }
        detail["intervals"]=projected["intervals"];detail["states"]=projected["states"];detail["shifts"] = .array(shifts)
        value["detail"]=detail;value["activeShift"]=active
        if data["detail"]["activitySchema"].int==1{value["pendingCorrections"] = .array(detail["corrections"].array.filter{$0["status"].string=="pending"})}
        return value
    }
}
