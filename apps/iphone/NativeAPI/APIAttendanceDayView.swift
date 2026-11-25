import SwiftUI
import Charts

struct APIAttendanceDayView:View {
    @ObservedObject var store:APIStore
    let day:APIAttendanceDay,data:APIValue
    var action:((APIDomainAction)->Void)?=nil
    @State private var localAction:APIDomainAction?
    private var writable:Bool{!store.isRolePreview && (store.manager || day.userID==store.userID && (store.writer || store.role=="reader"))}
    private var corrections:[APIValue]{(data["detail"]["corrections"].isNull ? data["corrections"] : data["detail"]["corrections"]).array.filter{c in day.shifts.contains{$0.id==c["shiftId"].string}}}
    var body:some View {
        let kinds=["work","travel","break","other","unallocated"],totals=kinds.map{kind in (kind,day.slices.filter{$0.kind==kind}.reduce(0){$0+$1.milliseconds})}.filter{$0.1>0}
        List {
            Section{
                VStack(alignment:.leading,spacing:10){
                Text(APIAttendanceLogic.label(day.day,format:"EEEE d. MMMM yyyy").capitalized).font(.title3.bold())
                if store.manager{Text(day.name).font(.headline)}
                Text(APIAttendanceLogic.hours(day.net)).font(.largeTitle.bold()).monospacedDigit().foregroundStyle(DiaryStyle.accent)
                Text(data["detail"]["activitySchema"].int != 1 ? "Celková přítomnost · rozdělení není dostupné" : day.open ? "Čistá pracovní doba · průběžně, neuzavřeno" : "Čistá pracovní doba · uzavřeno").font(.caption).foregroundStyle(.secondary)
                facts
                if !day.issues.isEmpty{ForEach(day.issues,id:\.self){Label($0,systemImage:"exclamationmark.triangle").foregroundStyle(DiaryStyle.warning).font(.subheadline)}}
                if !store.online{Label("Offline · uložený přehled dne",systemImage:"wifi.slash").font(.caption)}
                }.frame(maxWidth:.infinity,alignment:.leading).padding(.vertical,4)
            }
            Section("Rozdělení pracovního dne") {
                if data["detail"]["activitySchema"].int != 1{Text("Server neposkytuje podrobné intervaly. Nezařazený čas automaticky nepovažujeme za jinou činnost.").font(.caption)}
                if data["detail"]["activitySchema"].int==1{Chart(totals,id:\.0){kind,value in BarMark(x:.value("Čas",value/3600000),y:.value("Den","Den")).foregroundStyle(color(kind))}.chartXAxis(.hidden).chartYAxis(.hidden).frame(height:22).accessibilityLabel("Grafické rozdělení pracovního dne")
                ForEach(totals,id:\.0){kind,value in HStack{Label(APIAttendanceLogic.kindTitles[kind] ?? kind,systemImage:kind=="break" ? "pause.circle.fill" : "circle.fill").foregroundStyle(color(kind));Spacer();Text(APIAttendanceLogic.hours(value)).monospacedDigit()}.font(.subheadline)}
                }
                Text("Zakázkové hodiny, přejezdy a ostatní činnosti jsou částmi docházky. Nepřičítají se k ní podruhé.").font(.caption).foregroundStyle(.secondary)
            }
            if data["detail"]["activitySchema"].int==1{Section("Čas na jednotlivých zakázkách"){APIAttendanceJobDaySummary(store:store,slices:day.slices)}}
            if data["detail"]["activitySchema"].int==1{Section("Časová osa") {
                ForEach(day.slices){slice in
                    VStack(alignment:.leading,spacing:5){
                        Text(APIAttendanceView.time(.number(slice.start))+" – "+APIAttendanceView.time(.number(slice.end))).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                        if !slice.job.id.isEmpty{NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:slice.job)}label:{Label(slice.job.title,systemImage:"list.clipboard")}.accessibilityIdentifier("attendance-timeline-job-"+slice.job.id)}
                        else{Label(APIAttendanceLogic.kindTitles[slice.kind] ?? "Nepřiřazený čas",systemImage:slice.kind=="break" ? "pause.circle" : "clock")}
                        if !slice.job.id.isEmpty{Text(APIAttendanceLogic.kindTitles[slice.kind] ?? slice.kind).font(.caption).foregroundStyle(.secondary)}
                        Text(APIAttendanceLogic.hours(slice.milliseconds)+(slice.pending ? " · čeká na synchronizaci" : slice.confirmed ? "" : " · průběžně")).font(.caption)
                    }.padding(.vertical,4)
                }
            }
            }
            Section("Směny a původní podrobnosti") {
                ForEach(day.shifts,id:\.id){shift in
                    VStack(alignment:.leading,spacing:8){
                        Text(shiftTitle(shift)).font(.subheadline)
                        DisclosureGroup("Poloha a podrobnosti"){
                            if store.manager{APIDataPairs(value:shift["startPosition"],labels:["latitude":"Zeměpisná šířka","longitude":"Zeměpisná délka","accuracy":"Přesnost (m)"]);APIDataPairs(value:shift["endPosition"],labels:["latitude":"Odchod – šířka","longitude":"Odchod – délka"])}
                            Text("GPS příchodu: "+shift["startGpsStatus"].string);Text("GPS odchodu: "+shift["endGpsStatus"].string)
                        }
                        if writable{Button("Navrhnout opravu"){show(APIAttendanceActions.correction(shift,remove:false))};if store.manager{Button("Smazat záznam",role:.destructive){show(APIAttendanceActions.managerDelete(shift))}}else{Button("Požádat o smazání",role:.destructive){show(APIAttendanceActions.correction(shift,remove:true))}}}
                    }
                }
            }
            if !corrections.isEmpty{Section("Historie oprav"){ForEach(corrections,id:\.id){APIAttendanceCorrectionRow(value:$0)}}}
        }.navigationTitle("Pracovní den").navigationBarTitleDisplayMode(.inline).contentMargins(.top,0,for:.scrollContent).scrollContentBackground(.hidden).background(DiaryStyle.background)
            .sheet(item:$localAction){APIAttendanceAction(store:store,action:$0)}
    }
    private var facts:some View{VStack(alignment:.leading,spacing:6){LabeledContent("Příchod",value:APIAttendanceView.time(day.first));LabeledContent("Odchod",value:day.last.isNull ? "Neukončeno" : APIAttendanceView.time(day.last));LabeledContent("Celková přítomnost",value:APIAttendanceLogic.hours(day.gross));if data["detail"]["activitySchema"].int==1{LabeledContent("Přestávky",value:APIAttendanceLogic.hours(day.breaks));LabeledContent("Čistá pracovní doba",value:APIAttendanceLogic.hours(day.net))}}.font(.subheadline)}
    private func shiftTitle(_ shift:APIValue)->String {
        let start=APIAttendanceView.date(shift["startAt"])+" · "+APIAttendanceView.time(shift["startAt"])
        let end=shift["endAt"].isNull ? "dosud" : APIAttendanceView.date(shift["endAt"])+" · "+APIAttendanceView.time(shift["endAt"])
        return start+" – "+end
    }
    private func show(_ value:APIDomainAction){if let action{action(value)}else{localAction=value}}
    private func color(_ kind:String)->Color{switch kind{case "work":return DiaryStyle.accent;case "travel":return .blue;case "break":return .orange;case "other":return .purple;default:return .secondary}}
}
struct APIAttendanceRepairView:View {
    @ObservedObject var store:APIStore
    let shift:APIValue
    var body:some View{APIAttendanceAction(store:store,action:APIAttendanceActions.correction(shift,remove:false))}
}

struct APIAttendanceCorrectionRow:View {
    let value:APIValue
    private func stamp(_ key:String)->String{value[key].isNull ? "Nezapsáno" : APIAttendanceView.date(value[key])+" "+APIAttendanceView.time(value[key])}
    var body:some View{VStack(alignment:.leading,spacing:5){
        Text(value["reason"].string).font(.headline)
        Text(value["status"].string=="approved" ? "Schváleno" : value["status"].string=="rejected" ? "Zamítnuto" : value["status"].string=="withdrawn" ? "Staženo" : "Čeká na schválení")
        Text("Původně: "+stamp("oldStartAt")+" – "+stamp("oldEndAt")).font(.caption)
        Text("Návrh: "+stamp("startAt")+" – "+stamp("endAt")).font(.caption)
        Text("Autor: "+value["createdBy"].string+" · "+stamp("createdAt")).font(.caption)
        if !value["reviewedAt"].isNull{Text("Vyřídil: "+value["reviewedBy"].string+" · "+stamp("reviewedAt")).font(.caption)}
    }}
}

struct APIAttendanceJobDaySummary:View {
    @ObservedObject var store:APIStore
    let slices:[APIAttendanceSlice]
    var body:some View {
        let grouped=Dictionary(grouping:slices.filter{$0.kind=="work" && !$0.job.id.isEmpty},by:{$0.job.id})
        if grouped.isEmpty{Text("V tomto dni nejsou dostupné přiřazené zakázky.").font(.subheadline).foregroundStyle(.secondary)}
        ForEach(grouped.keys.sorted(),id:\.self){id in
            let rows=grouped[id] ?? [],job=rows.first?.job ?? .null,hours=APIAttendanceLogic.hours(rows.reduce(0){$0+$1.milliseconds})
            NavigationLink{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:job)}label:{
                VStack(alignment:.leading,spacing:4){Text(job.title).font(.subheadline.weight(.semibold));Text(hours+(rows.contains{!$0.confirmed} ? " · průběžně" : "")).font(.caption).foregroundStyle(.secondary)}.frame(minHeight:44)
            }.accessibilityIdentifier("attendance-summary-job-"+id)
        }
    }
}
