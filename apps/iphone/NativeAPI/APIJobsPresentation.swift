import Foundation

enum APIJobsPeriod:String,CaseIterable {case today,tomorrow,all
    var title:String{switch self{case .today:return "Dnes";case .tomorrow:return "Zítra";case .all:return "Všechny"}}
}
enum APIJobsSort:String,CaseIterable {case schedule,status,customer,updated
    var title:String{switch self{case .schedule:return "Podle termínu";case .status:return "Podle stavu";case .customer:return "Podle zákazníka";case .updated:return "Poslední aktualizace"}}
}
enum APIJobsGroup:String,CaseIterable,Identifiable {case working,travel,planned,approval,incomplete,done
    var id:String{rawValue}
    var title:String{switch self{case .working:return "Probíhající";case .travel:return "Na cestě";case .planned:return "Naplánované";case .approval:return "Čekající na schválení";case .incomplete:return "Nemohu dokončit";case .done:return "Dokončené"}}
    static func of(_ job:APIValue)->Self{
        if job["status"].string=="done"{return .done}
        if job["serviceApproval"].string=="pending"{return .approval}
        switch job["status"].string{case "in_progress":return .working;case "on_way":return .travel;case "incomplete":return .incomplete;default:return .planned}
    }
}
struct APIJobsFilters:Equatable {
    var state="all",worker="",type="",discipline="all",customer="",protocolState="",attention=""
    var sort=APIJobsSort.schedule
    var dateRange=false
    var from=Date(),to=Date()
    var count:Int{[state != "all",!worker.isEmpty,!type.isEmpty,discipline != "all",!customer.isEmpty,!protocolState.isEmpty,!attention.isEmpty,dateRange,sort != .schedule].filter{$0}.count}
}
enum APIJobsPresentation {
    static var calendar:Calendar{var c=Calendar(identifier:.gregorian);c.timeZone=TimeZone(identifier:"Europe/Prague")!;return c}
    static func day(_ date:Date)->String{let f=DateFormatter();f.calendar=calendar;f.locale=Locale(identifier:"en_US_POSIX");f.timeZone=calendar.timeZone;f.dateFormat="yyyy-MM-dd";return f.string(from:date)}
    static func selectedDay(_ period:APIJobsPeriod,now:Date)->String{day(period == .tomorrow ? calendar.date(byAdding:.day,value:1,to:now)! : now)}
    static func date(_ day:String)->String{let f=DateFormatter();f.calendar=calendar;f.locale=Locale(identifier:"cs_CZ");f.timeZone=calendar.timeZone;f.dateFormat="yyyy-MM-dd";guard let d=f.date(from:day)else{return "Bez termínu"};f.dateFormat="d. M.";return f.string(from:d)}
    static func appointment(_ job:APIValue)->String{let time=job["arrivalWindowStart"].string.isEmpty ? (job["plannedStart"].string.isEmpty ? job["startTime"].string : job["plannedStart"].string) : job["arrivalWindowStart"].string;return [date(job["dueDate"].string),time].filter{!$0.isEmpty}.joined(separator:" · ")}
    static func title(_ job:APIValue)->String{job["customerName"].string.isEmpty ? job.title : job["customerName"].string}
    static func normalize(_ text:String)->String{text.folding(options:[.diacriticInsensitive,.caseInsensitive],locale:Locale(identifier:"cs_CZ")).trimmingCharacters(in:.whitespacesAndNewlines)}
    static func matches(_ job:APIValue,filters:APIJobsFilters,period:APIJobsPeriod,query:String,now:Date)->Bool{
        let status=job["status"].string,due=job["dueDate"].string
        if filters.state=="approval"{guard APIJobsGroup.of(job) == .approval else{return false}}
        else if filters.state != "all",status != filters.state{return false}
        if !filters.worker.isEmpty,job["assignedTo"].string != filters.worker,!job["assignedTos"].array.contains(.s(filters.worker)){return false}
        if !filters.type.isEmpty,job["jobType"].string != filters.type{return false}
        if filters.discipline != "all",!job["discipline"].string.isEmpty,job["discipline"].string != filters.discipline{return false}
        if !filters.customer.isEmpty,job["customerId"].string != filters.customer{return false}
        if filters.dateRange{if due<day(filters.from)||due>day(filters.to){return false}}
        else if period != .all{
            let target=selectedDay(period,now:now)
            let carry=period == .today && ["in_progress","on_way"].contains(status) && (due.isEmpty || due<=target)
            if due != target && !carry{return false}
        }
        let search=normalize(query)
        return search.isEmpty || ["customerName","title","address"].contains{normalize(job[$0].string).contains(search)}
    }
    static func sorted(_ jobs:[APIValue],by sort:APIJobsSort)->[APIValue]{
        func schedule(_ j:APIValue)->[String]{[j["dueDate"].string.isEmpty ? "9999-99-99" : j["dueDate"].string,j["plannedStart"].string.isEmpty ? j["startTime"].string : j["plannedStart"].string,j.id]}
        return jobs.sorted{a,b in
            switch sort{
            case .updated:if a["updatedAt"].double != b["updatedAt"].double{return a["updatedAt"].double>b["updatedAt"].double}
            case .customer:let x=normalize(title(a)),y=normalize(title(b));if x != y{return x.localizedStandardCompare(y) == .orderedAscending}
            case .status:if a["status"].string != b["status"].string{return a["status"].string<b["status"].string}
            case .schedule:break
            }
            return schedule(a).lexicographicallyPrecedes(schedule(b))
        }
    }
    static func paths(filters:APIJobsFilters,period:APIJobsPeriod,mine:Bool,manager:Bool,userID:String,now:Date)->[String]{
        var q=[URLQueryItem(name:"state",value:filters.state=="approval" ? "all" : filters.state),URLQueryItem(name:"order",value:"schedule")]
        let worker = !manager || mine ? userID : filters.worker
        if !worker.isEmpty{q.append(URLQueryItem(name:"assignee",value:worker))}
        for (key,value) in [("type",filters.type),("protocol",filters.protocolState),("attention",filters.attention),("discipline",filters.discipline=="all" ? "" : filters.discipline)] where !value.isEmpty{q.append(URLQueryItem(name:key,value:value))}
        func path(_ extra:[URLQueryItem])->String{var c=URLComponents();c.path="/api/jobs";c.queryItems=q+extra;return c.string!}
        if filters.dateRange{
            let f=DateFormatter();f.calendar=calendar;f.timeZone=calendar.timeZone;f.dateFormat="yyyy-MM-dd"
            if var first=f.date(from:String(day(filters.from).prefix(7))+"-01"){
                var months:[String]=[]
                while day(first)<=day(filters.to),months.count<4{months.append(String(day(first).prefix(7)));first=calendar.date(byAdding:.month,value:1,to:first)!}
                if months.count<=3{return months.map{path([URLQueryItem(name:"month",value:$0)])}}
            }
            return [path([])]
        }
        if period == .all{return [path([])]}
        let month=String(selectedDay(period,now:now).prefix(7))
        var result=[path([URLQueryItem(name:"month",value:month)])]
        // An installation can continue across days and months. These are the same
        // authorized list endpoint, not a new status or a second time ledger.
        if period == .today{
            for state in ["in_progress","on_way"] where filters.state=="all" || filters.state==state{
                var c=URLComponents(string:path([]))!;c.queryItems=c.queryItems?.map{$0.name=="state" ? URLQueryItem(name:"state",value:state) : $0};result.append(c.string!)
            }
        }
        return result
    }
    static func phone(_ job:APIValue)->URL?{let number=job["customerContact"]["phones"].array.first?["number"].string ?? "";let digits=number.filter{"+0123456789".contains($0)};return digits.contains(where:{$0.isNumber}) ? URL(string:"tel:"+digits) : nil}
}
