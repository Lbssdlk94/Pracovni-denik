import Foundation

// Native test transport / SwiftUI Preview only. Never used by a production request.
enum APIAttendanceFixture {
    static func example(me:APIValue,now:Date=Date(),before:Bool=false,overnight:Bool=false)->APIValue {
        let c=APIAttendanceLogic.calendar,today=c.startOfDay(for:now),user=me["user"]["id"].string
        let people:[APIValue]=[.object(["id":.s(user),"name":me["user"]["name"],"disciplines":.array([.s("irrigation")])]),.object(["id":.s("attendance-marek"),"name":.s("Marek · ukázka"),"disciplines":.array([.s("garden")])]),.object(["id":.s("attendance-petr"),"name":.s("Petr · ukázka"),"disciplines":.array([.s("irrigation"),.s("garden")])])]
        var shifts:[APIValue]=[],intervals:[APIValue]=[],states:[APIValue]=[]
        for (i,person) in people.enumerated() {
            for offset in [-2,-1,0] {
                if before && person.id==user && offset==0{continue}
                let day=c.date(byAdding:.day,value:offset,to:today)!,start=offset==0 ? (overnight && person.id==user ? c.date(bySettingHour:22,minute:0,second:0,of:c.date(byAdding:.day,value:-1,to:today)!)! : now.addingTimeInterval(-3*3600)) : c.date(byAdding:.hour,value:7,to:day)!
                let end:Date?=offset==0 && i<2 ? nil : start.addingTimeInterval(offset==0 ? 2*3600 : 8*3600)
                let sid="attendance-"+person.id+"-"+String(offset),s=APIValue.object(["id":.s(sid),"userId":.s(person.id),"userName":person["name"],"startAt":.number(start.timeIntervalSince1970*1000),"endAt":end.map{.number($0.timeIntervalSince1970*1000)} ?? .null,"version":.n(1),"startGpsStatus":.s("disabled"),"endGpsStatus":end==nil ? .null : .s("disabled")])
                shifts.append(s)
                let active=APIValue.object(["id":.s(sid+"-work"),"userId":.s(person.id),"userName":person["name"],"shiftId":.s(sid),"kind":.s(offset==0 && i==1 ? "break" : "work"),"startAt":s["startAt"],"endAt":s["endAt"],"jobId":.s("fixture-progress"),"job":.object(["id":.s("fixture-progress"),"title":.s("Realizace · ukázka"),"status":.s("in_progress")]),"version":.n(1)])
                intervals.append(active)
                if offset==0{states.append(.object(["userId":.s(person.id),"name":person["name"],"version":.n(1),"active":end==nil ? active : .null]))}
            }
        }
        if before{states.append(.object(["userId":.s(user),"name":me["user"]["name"],"version":.n(0),"active":.null]))}
        let own=shifts.first{$0["userId"].string==user && $0["endAt"].isNull} ?? .null
        return .object(["month":.s(APIAttendanceLogic.month(now)),"serverNow":.number(now.timeIntervalSince1970*1000),"employees":.array(people),"shifts":.array(shifts),"activeShift":own,"pendingCorrections":.array([]),"corrections":.array([]),"detail":.object(["activitySchema":.n(1),"asOf":.number(now.timeIntervalSince1970*1000),"people":.array(people),"shifts":.array(shifts),"intervals":.array(intervals),"states":.array(states),"corrections":.array([]),"ownToday":.object(["shifts":.array(shifts.filter{$0["userId"].string==user}),"intervals":.array(intervals.filter{$0["userId"].string==user}),"state":states.first{$0["userId"].string==user} ?? .null])])])
    }
    static func filtered(_ source:APIValue,me:APIValue,query:[String:String])->APIValue {
        var data=source,detail=source["detail"]
        let user=query["userId"] ?? me["user"]["id"].string,manager=["owner","administrator","admin"].contains(me["user"]["role"].string),category=query["discipline"] ?? "all"
        let people=detail["people"].array.filter{p in (manager || p.id==me["user"]["id"].string) && (user=="all" || p.id==user) && (category=="all" || category=="both" && p["disciplines"].array.count==2 || p["disciplines"].array.contains(.s(category)))}
        let ids=Set(people.map(\.id));detail["people"] = .array(people)
        detail["shifts"] = .array(source["shifts"].array.filter{ids.contains($0["userId"].string)})
        detail["intervals"] = .array(detail["intervals"].array.filter{ids.contains($0["userId"].string)})
        detail["states"] = .array(detail["states"].array.filter{ids.contains($0["userId"].string)})
        data["detail"]=detail;data["shifts"]=detail["shifts"];data["month"] = .s(query["month"] ?? source["month"].string);data["serverNow"] = .number(Date().timeIntervalSince1970*1000);return data
    }
    static func activity(_ input:APIValue,me:APIValue,data:inout APIValue)->APIValue {
        let user=me["user"]["id"].string
        var states=data["detail"]["states"].array,intervals=data["detail"]["intervals"].array
        guard let position=states.firstIndex(where:{$0["userId"].string==user})else{return .null}
        var state=states[position];guard state["version"]==input["version"] else{return .null}
        let old=state["active"],kind=input["action"].string=="resume" ? input["resumeKind"].string : input["action"].string
        if let i=intervals.firstIndex(where:{$0.id==old.id}){intervals[i]["endAt"]=input["at"];intervals[i]["version"] = .n(intervals[i]["version"].int+1)}
        if kind=="stop" || kind.isEmpty{state["active"] = .null}else{
            let row=APIValue.object(["id":.s(input["operationId"].string+"_interval"),"userId":.s(user),"userName":me["user"]["name"],"kind":.s(kind),"jobId":input["action"].string=="resume" ? input["resumeJobId"] : kind=="break" ? old["jobId"] : .null,"startAt":input["at"],"endAt":.null,"version":.n(1),"shiftId":input["shiftId"]]);state["active"]=row;intervals.append(row)
        }
        state["version"] = .n(state["version"].int+1);states[position]=state;data["detail"]["states"] = .array(states);data["detail"]["intervals"] = .array(intervals);data["detail"]["ownToday"]["state"]=state;data["detail"]["ownToday"]["intervals"] = .array(intervals.filter{$0["userId"].string==user})
        return .object(["state":state,"intervals":.array(intervals.filter{$0["userId"].string==user})])
    }
}
