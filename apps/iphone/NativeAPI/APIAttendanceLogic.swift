import Foundation

struct APIAttendanceSlice:Identifiable {
    let start:Double,end:Double,kind:String,job:APIValue,pending:Bool,confirmed:Bool
    var id:String{"\(start)|\(end)|\(kind)|\(job.id)"}
    var milliseconds:Double{max(0,end-start)}
}
struct APIAttendanceDay:Identifiable {
    let day:Date,userID:String,name:String,shifts:[APIValue],slices:[APIAttendanceSlice],issues:[String]
    var id:String{userID+"|"+APIJobsPresentation.day(day)}
    var gross:Double{slices.reduce(0){$0+$1.milliseconds}}
    var breaks:Double{slices.filter{$0.kind=="break"}.reduce(0){$0+$1.milliseconds}}
    var net:Double{max(0,gross-breaks)}
    var confirmed:Double{slices.filter{$0.confirmed && $0.kind != "break"}.reduce(0){$0+$1.milliseconds}}
    var work:Double{slices.filter{$0.confirmed && $0.kind=="work"}.reduce(0){$0+$1.milliseconds}}
    var open:Bool{shifts.contains{$0["endAt"].isNull || $0["pending"].bool}}
    var first:APIValue{shifts.min{$0["startAt"].double<$1["startAt"].double}?["startAt"] ?? .null}
    var last:APIValue{open ? .null : shifts.max{$0["endAt"].double<$1["endAt"].double}?["endAt"] ?? .null}
}
enum APIAttendanceLogic {
    static var calendar:Calendar{var value=APIJobsPresentation.calendar;value.firstWeekday=2;value.minimumDaysInFirstWeek=4;return value}
    static func instant(_ date:Date)->Double{date.timeIntervalSince1970*1000}
    static func date(_ ms:Double)->Date{Date(timeIntervalSince1970:ms/1000)}
    static func month(_ date:Date)->String{String(APIJobsPresentation.day(date).prefix(7))}
    static func monthDate(_ text:String)->Date{let f=DateFormatter();f.calendar=calendar;f.timeZone=calendar.timeZone;f.dateFormat="yyyy-MM-dd";return f.date(from:text+"-01") ?? calendar.startOfDay(for:Date())}
    static func label(_ date:Date,format:String)->String{let f=DateFormatter();f.calendar=calendar;f.timeZone=calendar.timeZone;f.locale=Locale(identifier:"cs_CZ");f.dateFormat=format;return f.string(from:date)}
    static func unique(_ rows:[APIValue])->[APIValue]{Array(Dictionary(rows.filter{!$0.id.isEmpty}.map{($0.id,$0)},uniquingKeysWith:{$0["version"].int>$1["version"].int ? $0 : $0.merged($1.object)}).values)}
    static func days(shifts:[APIValue],intervals:[APIValue],from:Date,to:Date,now:Date=Date())->[APIAttendanceDay]{
        let rows=unique(shifts),activity=unique(intervals),limit=instant(now)
        var output:[APIAttendanceDay]=[],day=calendar.startOfDay(for:from)
        while day<to {
            let next=calendar.date(byAdding:.day,value:1,to:day)!,a=instant(max(day,from)),b=min(instant(min(next,to)),limit)
            if b>a {
                let inDay=rows.filter{$0["startAt"].double<b && ($0["endAt"].isNull ? limit : $0["endAt"].double)>a}
                let groups=Dictionary(grouping:inDay,by:{$0["userId"].string})
                for (user,shifts) in groups {
                    let raw=activity.filter{$0["userId"].string==user && $0["startAt"].double<b && ($0["endAt"].isNull ? limit : $0["endAt"].double)>a}
                    let points=Set(([a,b]+shifts.flatMap{[max(a,$0["startAt"].double),min(b,$0["endAt"].isNull ? limit : $0["endAt"].double)]}+raw.flatMap{[max(a,$0["startAt"].double),min(b,$0["endAt"].isNull ? limit : $0["endAt"].double)]}).filter{$0>=a && $0<=b}).sorted()
                    var slices:[APIAttendanceSlice]=[],issues=Set<String>()
                    for (start,end) in zip(points,points.dropFirst()) where end>start {
                        let cover=shifts.filter{$0["startAt"].double<=start && ($0["endAt"].isNull ? limit : $0["endAt"].double)>=end};if cover.isEmpty{continue}
                        let items=raw.filter{$0["startAt"].double<=start && ($0["endAt"].isNull ? limit : $0["endAt"].double)>=end}
                        if cover.count>1{issues.insert("Překrývající se směny")};if items.count>1{issues.insert("Překrývající se činnosti")}
                        let row=items.count==1 ? items[0] : .null
                        let kind=["work","travel","break","other"].contains(row["kind"].string) ? row["kind"].string : "unallocated"
                        let pending=cover.contains{$0["pending"].bool} || row["pending"].bool
                        let confirmed=cover.count==1 && !cover[0]["endAt"].isNull && !pending && items.count<=1
                        slices.append(APIAttendanceSlice(start:start,end:end,kind:kind,job:row["job"],pending:pending,confirmed:confirmed))
                    }
                    if shifts.contains(where:{$0["endAt"].isNull && calendar.startOfDay(for:date($0["startAt"].double))<calendar.startOfDay(for:now)}){issues.insert("Neukončená docházka z předchozího dne; může jít o směnu přes půlnoc")}
                    if shifts.contains(where:{$0["endAt"].isNull && limit-$0["startAt"].double>16*3600000}){issues.insert("Dlouhá otevřená směna vyžaduje kontrolu")}
                    output.append(APIAttendanceDay(day:day,userID:user,name:shifts.first?["userName"].string ?? "",shifts:shifts,slices:slices,issues:issues.sorted()))
                }
            }
            day=next
        }
        return output.sorted{$0.day==$1.day ? $0.name.localizedStandardCompare($1.name) == .orderedAscending : $0.day>$1.day}
    }
    static func total(_ days:[APIAttendanceDay])->(confirmed:Double,days:Int,average:Double,work:Double){
        let confirmed=days.reduce(0){$0+$1.confirmed},closed=days.filter{$0.confirmed>0}.count
        return (confirmed,closed,closed==0 ? 0 : confirmed/Double(closed),days.reduce(0){$0+$1.work})
    }
    static func csv(_ days:[APIAttendanceDay])->String {
        func cell(_ value:String)->String{let clean=value.trimmingCharacters(in:.whitespacesAndNewlines);let safe=clean.first.map{"=+-@".contains($0)}==true ? "'"+value : value;return "\""+safe.replacingOccurrences(of:"\"",with:"\"\"")+"\""}
        let heading=["Pracovník","Datum","Příchod","Odchod","Uzavřené čisté hodiny","Průběžné hodiny","Přestávky (h)","Zakázky v uzavřených směnách (h)","Stav"]
        let rows=days.map{d in [d.name,label(d.day,format:"d. M. yyyy"),APIAttendanceView.time(d.first),d.last.isNull ? "Neukončeno" : APIAttendanceView.time(d.last),String(format:"%.4f",d.confirmed/3600000),String(format:"%.4f",max(0,d.net-d.confirmed)/3600000),String(format:"%.4f",d.breaks/3600000),String(format:"%.4f",d.work/3600000),d.issues.isEmpty ? (d.open ? "Průběžné" : "Uzavřeno") : d.issues.joined(separator:"; ")]}
        return "\u{FEFF}"+([heading]+rows).map{$0.map(cell).joined(separator:";")}.joined(separator:"\r\n")
    }
    static let kindTitles=["work":"Práce na zakázce","travel":"Přejezdy","break":"Přestávky","other":"Ostatní činnost","unallocated":"Nepřiřazený čas"]
}
