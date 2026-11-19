import Foundation

struct APIDashboardJobFilter {
    var state="all"
    var attention=""
    var mine=true
    var allDates=false
}
enum APIDashboardLogic {
    static let attentionTitles=["approval":"Čeká na schválení","material":"Kontrola materiálu","defects":"Otevřené závady","protocol":"Nedokončené protokoly","overdue":"Zakázky po termínu","incomplete":"Nemohu dokončit","photos":"Chybějící fotodokumentace","unclosedAttendance":"Neukončená docházka","attendanceReview":"Opravy docházky"]
    static let attentionSymbols=["approval":"checkmark.seal","material":"shippingbox","defects":"exclamationmark.triangle","protocol":"doc.text","overdue":"calendar.badge.exclamationmark","incomplete":"hand.raised","photos":"camera","unclosedAttendance":"clock.badge.exclamationmark","attendanceReview":"clock.arrow.circlepath"]
    static func greeting(name:String,at:Date=Date())->String {
        var c=Calendar(identifier:.gregorian);c.timeZone=TimeZone(identifier:"Europe/Prague")!
        let hour=c.component(.hour,from:at),phrase=hour<11 ? "Dobré ráno" : hour<18 ? "Dobrý den" : "Dobrý večer"
        let first=name.split(whereSeparator:{$0.isWhitespace}).first.map(String.init) ?? ""
        return phrase+(first.isEmpty ? "" : ", "+first)
    }
    static func clock(_ milliseconds:Double)->String {
        let seconds=Int(max(0,milliseconds)/1000)
        return String(format:"%02d:%02d:%02d",seconds/3600,seconds/60%60,seconds%60)
    }
    static func dayStart(_ date:Date)->Double{var c=Calendar(identifier:.gregorian);c.timeZone=TimeZone(identifier:"Europe/Prague")!;return c.startOfDay(for:date).timeIntervalSince1970*1000}
    static func clipped(_ rows:[APIValue],now:Date)->[APIValue] {
        let start=dayStart(now),end=now.timeIntervalSince1970*1000
        return rows.filter{$0["startAt"].double<end && ($0["endAt"].isNull || $0["endAt"].double>start)}.map{$0.merged(["startAt":.number(max(start,$0["startAt"].double))])}
    }
    static func elapsed(_ shifts:[APIValue],now:Date)->Double {
        clipped(shifts,now:now).reduce(0){$0+Double(APIWorkTimeLogic.duration($1,now:now))}
    }
    static func orderedVisits(_ rows:[APIValue],activeID:String)->[APIValue] {
        rows.sorted{a,b in
            let rank:(APIValue)->Int={row in row.id==activeID ? 0 : row["status"].string=="done" ? 2 : 1}
            return (rank(a),a["plannedStart"].string,a.id)<(rank(b),b["plannedStart"].string,b.id)
        }
    }
}
