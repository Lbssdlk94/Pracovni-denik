import Foundation

// Test transport only. Derive dashboard examples from its existing jobs/time/attendance records.
enum APIDashboardFixture {
    static func attendance(me:APIValue,records:[String:APIValue])->APIValue {
        if let saved=records["fixture-attendance"]{return saved}
        let before=ProcessInfo.processInfo.arguments.contains("--native-api-before-day-testing")
        let shift:APIValue = .object(["id":.s("shift-1"),"userId":me["user"]["id"],"userName":me["user"]["name"],"startAt":.number(Date().addingTimeInterval(-3600).timeIntervalSince1970*1000),"endAt":.null,"version":.n(1)])
        return .object(["shifts":.array(before ? [] : [shift]),"activeShift":before ? .null : shift,"summary":.object([:]),"employees":.array([me["user"]]),"corrections":.array([]),"pendingCorrections":.array([])])
    }
    static func dashboard(fixture:APIValue,me:APIValue,records:[String:APIValue],mode:String)->APIValue {
        let now=Date(),today=DateFormatter.dashboardDay.string(from:now),user=me["user"]["id"].string,company=mode=="company"
        let jobs=fixture["jobs"].array.map{records["/api/jobs/"+$0.id] ?? $0}.filter{company || $0["assignedTos"].array.contains(.s(user)) || $0["assignedTo"].string==user}
        let saved=records.filter{$0.key.hasSuffix("/timeSnapshot")}.map(\.value)
        let state=saved.flatMap{$0["states"].array}.filter{$0["userId"].string==user}.max{$0["version"].int<$1["version"].int} ?? .object(["userId":.s(user),"version":.n(0),"active":.null])
        let current=jobs.first{$0.id==state["active"]["jobId"].string}
        let ordered=jobs.sorted{($0["dueDate"].string,$0["plannedStart"].string,$0.id)<($1["dueDate"].string,$1["plannedStart"].string,$1.id)}
        let next=ordered.first{$0["dueDate"].string>=today && !["done","incomplete"].contains($0["status"].string)}
        let target=current ?? next
        let time:APIValue=target.map{job in records["/api/jobs/"+job.id+"/timeSnapshot"] ?? .object(["job":job,"states":.array([.object(["userId":.s(user),"name":me["user"]["name"],"version":.n(0),"active":.null,"assigned":.bool(true)])]),"intervals":.array([]),"canWrite":me["permissions"]["write"],"canManage":me["permissions"]["manage"],"canManageCosts":me["permissions"]["manage"],"serverNow":.number(now.timeIntervalSince1970*1000)])} ?? .null
        let allIntervals=saved.flatMap{$0["intervals"].array}
        let intervals=APIDashboardLogic.clipped(allIntervals.filter{company || $0["userId"].string==user},now:now)
        let summary=APIWorkTimeLogic.summary(intervals,now:now)
        let shifts=attendance(me:me,records:records)
        var people:[String:APIValue]=[user:.object(["id":.s(user),"name":me["user"]["name"],"state":.s(shifts["activeShift"].isNull ? "off" : "other"),"inWork":.bool(!shifts["activeShift"].isNull),"workMs":.n(0)])]
        for entry in saved{for s in entry["states"].array {
            let id=s["userId"].string,active=s["active"],job=jobs.first{$0.id==active["jobId"].string}
            let work=summary["workers"].array.first{$0["userId"].string==id}?["workMs"] ?? .n(0)
            people[id] = .object(["id":.s(id),"name":s["name"],"state":.s(active.isNull ? "off" : active["kind"].string),"inWork":.bool(!active.isNull),"workMs":work,"job":job ?? .null])
        }}
        let todayJobs=ordered.filter{$0["dueDate"].string==today}
        let activeJobs=jobs.filter{$0["status"].string=="in_progress" && $0["jobType"].string=="installation"}.map{job -> APIValue in
            let rows=allIntervals.filter{$0["jobId"].string==job.id},total=APIWorkTimeLogic.summary(rows,now:now)["total"]["workMs"]
            return job.merged(["time":.object(["workMs":total,"activeCount":.n(rows.filter{$0["endAt"].isNull && $0["kind"].string=="work"}.count)])])
        }
        let types=["approval","material","protocol","overdue","incomplete","photos"]
        let attention=types.compactMap{kind -> APIValue? in
            if kind=="approval" && !company{return nil}
            let count=jobs.filter{matches($0,kind:kind,day:today)}.count
            return count==0 ? nil : .object(["id":.s(kind),"kind":.s("jobs"),"filter":.s(kind),"count":.n(count)])
        }
        let ownBreak=APIWorkTimeLogic.summary(intervals.filter{$0["userId"].string==user},now:now)["total"]["breakMs"]
        return .object(["mode":.s(mode),"asOf":.number(now.timeIntervalSince1970*1000),"day":.s(today),"complete":.bool(true),"stats":.object(["workersInWork":.n(people.values.filter{$0["inWork"].bool}.count),"workersTotal":.n(people.count),"inProgress":.n(jobs.filter{$0["status"].string=="in_progress"}.count),"pendingApproval":.n(jobs.filter{$0["serviceApproval"].string=="pending"}.count),"todayWorkMs":summary["total"]["workMs"],"todayVisits":.n(todayJobs.count)]),"people":.array(company ? people.values.sorted{$0.id<$1.id} : []),"activeJobs":.array(activeJobs),"todayJobs":.array(todayJobs),"todayTruncated":.bool(false),"currentJob":current ?? .null,"nextJob":next ?? .null,"myState":state,"timeSnapshot":time.isNull ? .null : time.merged(["projection":.s("dashboard")]),"attendance":shifts.merged(["breakMs":ownBreak]),"attention":.array(attention),"notifications":.array([]),"unread":.n(0)])
    }
    static func matches(_ job:APIValue,kind:String,day:String)->Bool {
        switch kind {
        case "approval":return job["serviceApproval"].string=="pending"
        case "material":return job["jobType"].string=="installation" && !["done","incomplete"].contains(job["status"].string) && job["materialStatus"].string != "ready"
        case "protocol":return job["status"].string=="done" && job["protocolStatus"].string != "ready"
        case "overdue":return !job["dueDate"].string.isEmpty && job["dueDate"].string<day && job["status"].string != "done"
        case "incomplete":return job["status"].string=="incomplete"
        default:return false
        }
    }
}
private extension DateFormatter {
    static var dashboardDay:DateFormatter{let f=DateFormatter();f.timeZone=TimeZone(identifier:"Europe/Prague");f.dateFormat="yyyy-MM-dd";return f}
}
