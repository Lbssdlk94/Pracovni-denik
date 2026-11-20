import SwiftUI
import Charts

struct APIAttendanceDayView:View {
    @ObservedObject var store:APIStore
    let day:APIAttendanceDay,data:APIValue
    var action:((APIDomainAction)->Void)?=nil
    @State private var localAction:APIDomainAction?
    private var writable:Bool{store.writer && !store.isRolePreview && (store.manager || day.userID==store.userID)}
    private var corrections:[APIValue]{(data["detail"]["corrections"].isNull ? data["corrections"] : data["detail"]["corrections"]).array.filter{c in day.shifts.contains{$0.id==c["shiftId"].string}}}
    var body:some View {
        let kinds=["work","travel","break","other","unallocated"],totals=kinds.map{kind in (kind,day.slices.filter{$0.kind==kind}.reduce(0){$0+$1.milliseconds})}.filter{$0.1>0}
        List {
            Section{
                Text(APIAttendanceLogic.label(day.day,format:"EEEE d. MMMM yyyy").capitalized).font(.title3.bold())
                if store.manager{Text(day.name).font(.headline)}
                Text(APIAttendanceLogic.hours(day.net)).font(.largeTitle.bold()).monospacedDigit().foregroundStyle(DiaryStyle.accent)
                Text(day.open ? "Čistá pracovní doba · průběžně, neuzavřeno" : "Čistá pracovní doba · uzavřeno").font(.caption).foregroundStyle(.secondary)
                facts
                if !day.issues.isEmpty{ForEach(day.issues,id:\.self){Label($0,systemImage:"exclamationmark.triangle").foregroundStyle(DiaryStyle.warning).font(.subheadline)}}
                if !store.online{Label("Offline · uložený přehled dne",systemImage:"wifi.slash").font(.caption)}
            }
            Section("Rozdělení pracovního dne") {
                if data["detail"]["activitySchema"].int != 1{Text("Server neposkytuje podrobné intervaly. Nezařazený čas automaticky nepovažujeme za jinou činnost.").font(.caption)}
                Chart(totals,id:\.0){kind,value in BarMark(x:.value("Čas",value/3600000),y:.value("Den","Den")).foregroundStyle(color(kind))}.chartXAxis(.hidden).chartYAxis(.hidden).frame(height:22).accessibilityLabel("Grafické rozdělení pracovního dne")
                ForEach(totals,id:\.0){kind,value in HStack{Label(APIAttendanceLogic.kindTitles[kind] ?? kind,systemImage:kind=="break" ? "pause.circle.fill" : "circle.fill").foregroundStyle(color(kind));Spacer();Text(APIAttendanceLogic.hours(value)).monospacedDigit()}.font(.subheadline)}
                Text("Zakázkové hodiny, přejezdy a ostatní činnosti jsou částmi docházky. Nepřičítají se k ní podruhé.").font(.caption).foregroundStyle(.secondary)
            }
            Section("Časová osa") {
                ForEach(day.slices){slice in
                    VStack(alignment:.leading,spacing:5){
                        Text(APIAttendanceView.time(.number(slice.start))+" – "+APIAttendanceView.time(.number(slice.end))).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                        if !slice.job.id.isEmpty{NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:slice.job)}label:{Label(slice.job.title,systemImage:"list.clipboard")}.accessibilityIdentifier("attendance-timeline-job-"+slice.job.id)}
                        else{Label(APIAttendanceLogic.kindTitles[slice.kind] ?? "Nepřiřazený čas",systemImage:slice.kind=="break" ? "pause.circle" : "clock")}
                        Text(APIAttendanceLogic.hours(slice.milliseconds)+(slice.pending ? " · čeká na synchronizaci" : slice.confirmed ? "" : " · průběžně")).font(.caption)
                    }.padding(.vertical,4)
                }
            }
            Section("Směny a původní podrobnosti") {
                ForEach(day.shifts,id:\.id){shift in
                    VStack(alignment:.leading,spacing:8){
                        Text(APIAttendanceView.date(shift["startAt"])+" · "+APIAttendanceView.time(shift["startAt"])+" – "+(shift["endAt"].isNull ? "dosud" : APIAttendanceView.date(shift["endAt"])+" · "+APIAttendanceView.time(shift["endAt"]))).font(.subheadline)
                        DisclosureGroup("Poloha a podrobnosti"){
                            if store.manager{APIDataPairs(value:shift["startPosition"],labels:["latitude":"Zeměpisná šířka","longitude":"Zeměpisná délka","accuracy":"Přesnost (m)"]);APIDataPairs(value:shift["endPosition"],labels:["latitude":"Odchod – šířka","longitude":"Odchod – délka"])}
                            Text("GPS příchodu: "+shift["startGpsStatus"].string);Text("GPS odchodu: "+shift["endGpsStatus"].string)
                        }
                        if writable{Button("Navrhnout opravu"){show(APIAttendanceActions.correction(shift,remove:false))};Button("Požádat o smazání",role:.destructive){show(APIAttendanceActions.correction(shift,remove:true))}}
                    }
                }
            }
            if !corrections.isEmpty{Section("Historie oprav") {ForEach(corrections,id:\.id){c in VStack(alignment:.leading,spacing:5){Text(c["reason"].string).font(.headline);Text(c["status"].string=="approved" ? "Schváleno" : c["status"].string=="rejected" ? "Zamítnuto" : "Čeká na schválení");Text("Původně: "+APIAttendanceView.date(c["oldStartAt"])+" "+APIAttendanceView.time(c["oldStartAt"])+" – "+APIAttendanceView.time(c["oldEndAt"])).font(.caption);Text("Návrh: "+APIAttendanceView.date(c["startAt"])+" "+APIAttendanceView.time(c["startAt"])+" – "+APIAttendanceView.time(c["endAt"])).font(.caption);Text("Autor: "+c["createdBy"].string+" · "+APIAttendanceView.date(c["createdAt"])+" "+APIAttendanceView.time(c["createdAt"])).font(.caption);if !c["reviewedAt"].isNull{Text("Vyřídil: "+c["reviewedBy"].string+" · "+APIAttendanceView.date(c["reviewedAt"])+" "+APIAttendanceView.time(c["reviewedAt"])).font(.caption)}}}}}
        }.navigationTitle("Pracovní den").navigationBarTitleDisplayMode(.inline).scrollContentBackground(.hidden).background(DiaryStyle.background)
            .sheet(item:$localAction){APIAttendanceAction(store:store,action:$0)}
    }
    private var facts:some View{VStack(alignment:.leading,spacing:6){LabeledContent("Příchod",value:APIAttendanceView.time(day.first));LabeledContent("Odchod",value:day.last.isNull ? "Neukončeno" : APIAttendanceView.time(day.last));LabeledContent("Celková přítomnost",value:APIAttendanceLogic.hours(day.gross));LabeledContent("Přestávky",value:APIAttendanceLogic.hours(day.breaks));LabeledContent("Čistá pracovní doba",value:APIAttendanceLogic.hours(day.net))}.font(.subheadline)}
    private func show(_ value:APIDomainAction){if let action{action(value)}else{localAction=value}}
    private func color(_ kind:String)->Color{switch kind{case "work":return DiaryStyle.accent;case "travel":return .blue;case "break":return .orange;case "other":return .purple;default:return .secondary}}
}
struct APIAttendanceRepairView:View {
    @ObservedObject var store:APIStore
    let shift:APIValue
    var body:some View{APIAttendanceAction(store:store,action:APIAttendanceActions.correction(shift,remove:false))}
}
