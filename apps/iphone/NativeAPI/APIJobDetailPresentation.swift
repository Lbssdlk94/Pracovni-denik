import Foundation

// Presentation over the existing, permission-filtered time snapshot. No new timers or records.
enum APIJobDetailAction: Equatable {
    case travel, arrive, stop, resume, report
    var title:String {
        switch self {
        case .travel:return "Vyrazit na zakázku"
        case .arrive:return "Jsem na místě"
        case .stop:return "Ukončit práci"
        case .resume:return "Pokračovat v práci"
        case .report:return "Zobrazit protokol"
        }
    }
    var symbol:String {
        switch self {case .travel:return "location";case .arrive:return "mappin.and.ellipse";case .stop:return "stop.fill";case .resume:return "play.fill";case .report:return "doc.text"}
    }
    var timeKind:String? {
        switch self {case .travel:return "travel";case .arrive,.resume:return "work";case .stop:return "stop";case .report:return nil}
    }
    static func resolve(job:APIValue,states:[APIValue],userID:String,travelEnabled:Bool)->Self? {
        let active=states.first{$0["userId"].string==userID}?["active"] ?? .null
        // An open personal interval remains stoppable even if somebody finished the job.
        if active["jobId"].string==job.id {
            switch active["kind"].string {
            case "work":return .stop
            case "travel":return .arrive
            case "break","other":return .resume
            default:break
            }
        }
        if job["status"].string=="done" {return .report}
        guard !job["cancelled"].bool,job["status"].string != "incomplete" else{return nil}
        return travelEnabled ? .travel : .arrive
    }
}

enum APIJobDetailPresentation {
    static func initials(_ name:String)->String {
        name.split(whereSeparator:{$0.isWhitespace}).prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }
    static func crew(job:APIValue,states:[APIValue])->[APIValue] {
        var ids=job["assignedTos"].array.map(\.string)
        if ids.isEmpty && !job["assignedTo"].string.isEmpty {ids=[job["assignedTo"].string]}
        var seen=Set<String>()
        return ids.filter{!$0.isEmpty && seen.insert($0).inserted}.map { id in
            let state=states.first{$0["userId"].string==id}
            let name=state?["name"].string ?? (id==job["assignedTo"].string ? job["assignedName"].string : "Přiřazený pracovník")
            return .object(["id":.s(id),"name":.s(name.isEmpty ? "Přiřazený pracovník" : name)])
        }
    }
    static func date(_ day:String)->String {
        let f=DateFormatter();f.locale=Locale(identifier:"cs_CZ");f.timeZone=TimeZone(identifier:"Europe/Prague");f.dateFormat="yyyy-MM-dd"
        guard let value=f.date(from:day) else{return day.isEmpty ? "Termín nezadaný" : day}
        f.dateFormat="EEE d. M. yyyy";return f.string(from:value)
    }
    static func todayWorkers(snapshot:APIValue,jobID:String,now:Date)->[APIValue] {
        var calendar=Calendar(identifier:.gregorian);calendar.timeZone=TimeZone(identifier:"Europe/Prague")!
        let today=calendar.startOfDay(for:now).timeIntervalSince1970*1000
        let rows=snapshot["intervals"].array
        let todayRows=rows.filter{$0["startAt"].double<=now.timeIntervalSince1970*1000 && ($0["endAt"].isNull || $0["endAt"].double>today)}
        let clipped=todayRows.map{$0.merged(["startAt":.number(max(today,$0["startAt"].double))])}
        let hours=APIWorkTimeLogic.summary(clipped,now:now)["workers"].array
        var states=Dictionary(snapshot["states"].array.map{($0["userId"].string,$0)},uniquingKeysWith:{$1})
        for row in todayRows where states[row["userId"].string]==nil {
            states[row["userId"].string] = .object(["userId":row["userId"],"name":row["userName"],"active":.null])
        }
        let ids=Set(todayRows.map{$0["userId"].string})
        return states.values.filter{ids.contains($0["userId"].string) || $0["active"]["jobId"].string==jobID}.map { state in
            let here=state["active"]["jobId"].string==jobID
            let kind=here ? state["active"]["kind"].string : "stopped"
            let work=hours.first{$0["userId"]==state["userId"]}?["workMs"] ?? .n(0)
            return state.merged(["kind":.s(kind),"workMs":work])
        }.sorted{($0["name"].string,$0["userId"].string)<($1["name"].string,$1["userId"].string)}
    }
    static func workerStatus(_ kind:String)->String {
        ["travel":"Na cestě","work":"Pracuje","break":"Přerušeno","other":"Jiná činnost","stopped":"Ukončil práci"][kind] ?? "Ukončil práci"
    }
}
