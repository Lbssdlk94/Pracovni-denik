import SwiftUI
import Charts

struct APIAttendanceLiveCard:View {
    @ObservedObject var store:APIStore
    let data:APIValue,busy:Bool,punch:()->Void,activity:(String)->Void
    @Environment(\.dynamicTypeSize) private var size
    private var shift:APIValue{data["activeShift"]}
    private var personal:APIValue{data["detail"]["states"].array.first{$0["userId"].string==store.userID}?["active"] ?? .null}
    private var writable:Bool{store.writer && !store.isRolePreview && !busy && (store.online || store.enabled("offline"))}
    var body:some View {
        VStack(alignment:.leading,spacing:12){
            HStack{Text("Pracovní den").font(.headline);Spacer();Text(shift.isNull ? "Mimo práci" : personal["kind"].string=="break" ? "Přestávka" : "V práci").font(.caption.weight(.semibold)).padding(.horizontal,8).padding(.vertical,4).background(DiaryStyle.surface.opacity(0.6),in:Capsule());if !shift.isNull,data["detail"]["activitySchema"].int==1{activityMenu}}
            TimelineView(.periodic(from:.now,by:1)){context in
                let start=APIAttendanceLogic.calendar.startOfDay(for:context.date),end=APIAttendanceLogic.calendar.date(byAdding:.day,value:1,to:start)!
                let day=APIAttendanceLogic.days(shifts:data["detail"]["shifts"].array.filter{$0["userId"].string==store.userID},intervals:data["detail"]["intervals"].array,from:start,to:end,now:context.date).first
                VStack(spacing:7){
                    Text(APIDashboardLogic.clock(day?.net ?? 0)).font(.system(.largeTitle,design:.rounded,weight:.bold)).monospacedDigit().foregroundStyle(DiaryStyle.accent).minimumScaleFactor(0.6).lineLimit(1).accessibilityLabel(data["detail"]["activitySchema"].int==1 ? "Dnes odpracováno" : "Dnešní přítomnost").accessibilityValue(APIAttendanceLogic.hours(day?.net ?? 0)).accessibilityIdentifier("attendance-live-clock")
                    Text(data["detail"]["activitySchema"].int != 1 ? "Přítomnost · rozdělení není dostupné" : day?.open==true ? "Dnes průběžně · neuzavřeno" : "Dnes odpracováno").font(.caption).foregroundStyle(.secondary)
                    ViewThatFits(in:.horizontal){HStack(spacing:20){clockFacts(day)};VStack(alignment:.leading,spacing:6){clockFacts(day)}}
                }.frame(maxWidth:.infinity)
            }
            if !shift.isNull,APIAttendanceLogic.calendar.startOfDay(for:APIAttendanceLogic.date(shift["startAt"].double))<APIAttendanceLogic.calendar.startOfDay(for:Date()){
                VStack(alignment:.leading,spacing:8){Label("Neukončená docházka z předchozího dne",systemImage:"exclamationmark.triangle").font(.subheadline.weight(.semibold));Text("Může jít o směnu přes půlnoc. Zkontrolujte skutečný odchod; směnu automaticky neukončujeme.").font(.caption)
                    if writable{NavigationLink("Zkontrolovat a navrhnout opravu"){APIAttendanceRepairView(store:store,shift:shift)}}
                }.padding(10).background(DiaryStyle.warning.opacity(0.12),in:RoundedRectangle(cornerRadius:14)).accessibilityIdentifier("attendance-unclosed-warning")
            }
            if !shift.isNull,data["detail"]["activitySchema"].int==1 {
                if size.isAccessibilitySize{VStack(spacing:8){pauseButton;punchButton}}
                else{HStack(spacing:8){pauseButton;punchButton}}
            }else{punchButton}
            if busy{ProgressView("Ukládám docházku…")}
            if !store.online{Text("Průběžný čas vychází z uložených údajů. Čekající změny se potvrdí po synchronizaci.").font(.caption).foregroundStyle(.secondary)}
        }.padding(16).background(DiaryStyle.soft,in:RoundedRectangle(cornerRadius:24))
    }
    private var pauseButton:some View {
        Button{activity(personal["kind"].string=="break" ? "resume" : "break")}label:{Label(personal["kind"].string=="break" ? "Ukončit přestávku" : "Přestávka",systemImage:personal["kind"].string=="break" ? "play.circle" : "pause.circle").frame(maxWidth:.infinity)}.diaryBubble(.secondary).disabled(!writable).accessibilityLabel(personal["kind"].string=="break" ? "Ukončit přestávku" : "Zahájit přestávku").accessibilityIdentifier("attendance-break")
    }
    private var punchButton:some View {
        Button(action:punch){Text(shift.isNull ? "Zahájit pracovní den" : "Zaznamenat odchod").frame(maxWidth:.infinity)}.diaryBubble(.primary).disabled(!writable || !store.online && data["detail"]["activitySchema"].int != 1).accessibilityIdentifier("attendance-punch")
    }
    private var activityMenu:some View {
        Menu {
            if personal["kind"].string=="break"{Button("Ukončit přestávku bez obnovení zakázky"){activity("stop")}}
            else if personal["kind"].string=="other"{Button("Ukončit ostatní činnost"){activity("stop")}}
            else{Button("Zahájit ostatní pracovní činnost"){activity("other")}}
        }label:{Image(systemName:"ellipsis")}.diaryBubble(.icon).disabled(!writable).accessibilityLabel("Další pracovní činnosti")
    }
    @ViewBuilder private func clockFacts(_ day:APIAttendanceDay?)->some View {
        VStack{Text("Příchod").foregroundStyle(.secondary);Text((day?.first.isNull==false ? APIAttendanceView.time(day!.first) : "—")).fontWeight(.semibold)}
        VStack{Text("Odchod").foregroundStyle(.secondary);Text((day?.last.isNull==false ? APIAttendanceView.time(day!.last) : "—")).fontWeight(.semibold)}
        VStack{Text("Přestávky").foregroundStyle(.secondary);Text(APIAttendanceLogic.hours(day?.breaks ?? 0)).fontWeight(.semibold)}
    }
}
struct APIAttendanceMetrics:View {
    let items:[(String,String,String)]
    @Environment(\.dynamicTypeSize) private var size
    var body:some View{LazyVGrid(columns:Array(repeating:GridItem(.flexible(),alignment:.leading),count:size.isAccessibilitySize ? 1 : 2),spacing:10){ForEach(items.indices,id:\.self){i in let item=items[i];VStack(alignment:.leading,spacing:7){Image(systemName:item.2).foregroundStyle(DiaryStyle.accent);Text(item.1).font(.title3.weight(.bold)).monospacedDigit().fixedSize(horizontal:false,vertical:true);Text(item.0).font(.caption).foregroundStyle(.secondary)}.padding(14).frame(maxWidth:.infinity,minHeight:100,alignment:.leading).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:20)).accessibilityElement(children:.combine)}}}
}
struct APIAttendanceDayRow:View {
    let day:APIAttendanceDay
    var showName=false
    var body:some View{
        HStack(alignment:.top,spacing:12){
            Text(APIAttendanceLogic.label(day.day,format:"d")).font(.title3.bold()).foregroundStyle(DiaryStyle.accent).frame(minWidth:42,minHeight:44).background(DiaryStyle.soft,in:RoundedRectangle(cornerRadius:12)).accessibilityHidden(true)
            VStack(alignment:.leading,spacing:4){Text(APIAttendanceLogic.label(day.day,format:"EEEE d. M.").capitalized).font(.headline);if showName{Text(day.name).font(.subheadline)};Text(APIAttendanceView.time(day.first)+" – "+(day.last.isNull ? "dosud" : APIAttendanceView.time(day.last))).font(.caption).foregroundStyle(.secondary);Text(day.issues.first ?? (day.open ? "Průběžné · neuzavřeno" : day.shifts.contains{$0["corrected"].bool} ? "Schválená oprava" : "Uzavřeno")).font(.caption).foregroundStyle(day.issues.isEmpty ? Color.secondary : DiaryStyle.warning)}
            Spacer(minLength:0);Text(APIAttendanceLogic.hours(day.net)).font(.subheadline.weight(.semibold)).monospacedDigit().fixedSize(horizontal:false,vertical:true)
        }.padding(.vertical,5).accessibilityElement(children:.combine)
    }
}
struct APIAttendancePersonRow:View {
    let person:APIValue,day:APIAttendanceDay?,state:APIValue
    private var title:String{day?.open==true ? state["kind"].string=="break" ? "Přestávka" : state["kind"].string=="travel" ? "Na cestě" : "V práci" : "Mimo práci"}
    var body:some View{HStack(alignment:.top,spacing:10){Text(APIJobDetailPresentation.initials(person.title)).font(.caption.weight(.semibold)).dynamicTypeSize(...DynamicTypeSize.large).foregroundStyle(DiaryStyle.accent).frame(width:36,height:36).background(DiaryStyle.soft,in:Circle()).accessibilityHidden(true);VStack(alignment:.leading,spacing:4){Text(person.title).font(.subheadline.weight(.semibold));Text(day.map{APIAttendanceView.time($0.first)+" – "+($0.last.isNull ? "dosud" : APIAttendanceView.time($0.last))} ?? "Bez dnešní směny").font(.caption).foregroundStyle(.secondary);Text(title).font(.caption.weight(.semibold)).foregroundStyle(title=="Přestávka" ? .orange : title=="Na cestě" ? .blue : title=="V práci" ? DiaryStyle.accent : .secondary)};Spacer(minLength:0);Text(day.map{APIAttendanceLogic.hours($0.net)+($0.open ? " · průběžně" : "")} ?? "—").font(.caption).fixedSize(horizontal:false,vertical:true);Image(systemName:"chevron.right").font(.caption2).foregroundStyle(.secondary)}.frame(minHeight:44).padding(.vertical,5).contentShape(Rectangle()).accessibilityElement(children:.combine)}
}
struct APIAttendanceChart:View {
    @ObservedObject var store:APIStore
    let data:APIValue,month:Date,user:String
    let allowedUsers:Set<String>
    @Binding var week:Bool
    @State private var selected:Date?
    var body:some View {
        let c=APIAttendanceLogic.calendar,now=Date(),weekStart=c.dateInterval(of:.weekOfYear,for:now)!.start
        let from=week ? weekStart : c.dateInterval(of:.month,for:month)!.start,to=week ? c.date(byAdding:.day,value:7,to:weekStart)! : c.date(byAdding:.month,value:1,to:from)!
        let days=APIAttendanceLogic.days(shifts:data["detail"]["shifts"].array.filter{allowedUsers.contains($0["userId"].string) && (user=="all" || $0["userId"].string==user)},intervals:data["detail"]["intervals"].array,from:from,to:to)
        let grouped=Dictionary(grouping:days,by:\.day)
        VStack(alignment:.leading,spacing:12){
            Picker("Období grafu",selection:$week){Text("Aktuální týden").tag(true);Text("Zvolený měsíc").tag(false)}.pickerStyle(.segmented).accessibilityIdentifier("attendance-chart-period")
            Text(week ? "Tento týden" : APIAttendanceLogic.label(month,format:"LLLL yyyy").capitalized).font(.headline)
            if days.isEmpty{Text("V tomto období nejsou záznamy.").font(.subheadline).foregroundStyle(.secondary).frame(minHeight:150)}else{
                Chart(grouped.keys.sorted(),id:\.self){day in
                    let rows=grouped[day] ?? [],confirmed=rows.reduce(0){$0+$1.confirmed}/3600000,provisional=rows.reduce(0){$0+max(0,$1.net-$1.confirmed)}/3600000
                    BarMark(x:.value("Den",day,unit:.day),y:.value("Uzavřeno",confirmed)).foregroundStyle(DiaryStyle.accent).accessibilityLabel(APIAttendanceLogic.label(day,format:"d. M.")+" · uzavřeno").accessibilityValue(APIAttendanceLogic.hours(confirmed*3600000))
                    BarMark(x:.value("Den",day,unit:.day),y:.value("Průběžně",provisional)).foregroundStyle(DiaryStyle.accent.opacity(0.35)).accessibilityLabel("Průběžně, neuzavřeno").accessibilityValue(APIAttendanceLogic.hours(provisional*3600000))
                }.chartXScale(domain:from...to).chartXSelection(value:$selected).chartYAxisLabel("hodiny").frame(height:170).accessibilityIdentifier("attendance-chart")
                Text("Světlá část sloupce je průběžná a není potvrzeným součtem.").font(.caption2).foregroundStyle(.secondary)
                if let selected,let picked=grouped[c.startOfDay(for:selected)]{ForEach(picked){day in NavigationLink{APIAttendanceDayView(store:store,day:day,data:data)}label:{Label(APIAttendanceLogic.label(day.day,format:"d. M.")+" · "+APIAttendanceLogic.hours(day.net)+" · Otevřít den",systemImage:"calendar")}.frame(minHeight:44)}}
            }
        }.padding(14).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:22))
    }
}
struct APIAttendanceMonthPicker:View {
    @Binding var month:Date
    @State private var selected=Date()
    @Environment(\.dismiss) private var dismiss
    var body:some View{NavigationStack{Form{DatePicker("Měsíc",selection:$selected,in:APIAttendanceLogic.monthDate("2000-01")...APIAttendanceLogic.monthDate("2099-12").addingTimeInterval(25*86400),displayedComponents:.date).datePickerStyle(.graphical)}.environment(\.locale,Locale(identifier:"cs_CZ")).environment(\.timeZone,APIAttendanceLogic.calendar.timeZone).navigationTitle("Vybrat měsíc").toolbar{ToolbarItem(placement:.cancellationAction){Button("Zavřít",systemImage:"xmark"){dismiss()}.labelStyle(.iconOnly).buttonStyle(.automatic)};ToolbarItem(placement:.confirmationAction){Button("Zobrazit"){month=APIAttendanceLogic.monthDate(APIAttendanceLogic.month(selected));dismiss()}.buttonStyle(.automatic)}}}.onAppear{selected=month}}
}
