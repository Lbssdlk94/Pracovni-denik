import SwiftUI
import UniformTypeIdentifiers

struct APIAttendanceView:View {
    @ObservedObject var store:APIStore
    @StateObject private var model=APIAttendanceModel()
    @StateObject private var location=APILocation()
    @State private var selectedMonth:Date
    @State private var team=false
    @State private var employee="all"
    @State private var discipline="all"
    @State private var dayFilter:String?
    @State private var activeOnly=false
    @State private var calendar=false
    @State private var export=false
    @State private var busy=false
    @State private var problem:String?
    @State private var punchID=UUID().uuidString
    @State private var punchAt:Double?
    @State private var action:APIDomainAction?
    @State private var chartWeek=true
    @Environment(\.dynamicTypeSize) private var typeSize
    init(store:APIStore,initialUser:String?=nil,initialDay:String?=nil,initialActiveOnly:Bool=false,initialMonth:String?=nil){
        self.store=store
        _selectedMonth=State(initialValue:APIAttendanceLogic.monthDate(initialMonth ?? initialDay.map{String($0.prefix(7))} ?? String(store.today.prefix(7))))
        _team=State(initialValue:store.manager && initialUser != nil && initialUser != store.userID)
        _employee=State(initialValue:initialUser ?? "all");_dayFilter=State(initialValue:initialDay);_activeOnly=State(initialValue:initialActiveOnly)
    }
    private var month:String{APIAttendanceLogic.month(selectedMonth)}
    private var user:String{store.manager && team ? employee : store.userID}
    private var key:String{month+user+discipline+store.scope+String(store.online)+store.revision.uuidString}
    private var projected:APIValue{model.projected(store:store)}
    private func scopedShifts(_ data:APIValue)->[APIValue]{let allowed=Set(data["detail"]["people"].array.map(\.id));return data["detail"]["shifts"].array.filter{team ? allowed.contains($0["userId"].string) && (user=="all" || $0["userId"].string==user) : $0["userId"].string==store.userID}}
    private func days(_ data:APIValue,now:Date=Date())->[APIAttendanceDay]{APIAttendanceLogic.days(shifts:scopedShifts(data),intervals:data["detail"]["intervals"].array,from:APIAttendanceLogic.monthDate(month),to:APIAttendanceLogic.calendar.date(byAdding:.month,value:1,to:APIAttendanceLogic.monthDate(month))!,now:now)}
    var body:some View {
        let data=projected,records=days(data),totals=APIAttendanceLogic.total(records)
        List {
            if store.manager{Section{Picker("Zobrazení docházky",selection:$team){Text("Moje docházka").tag(false);Text("Celý tým").tag(true)}.pickerStyle(.segmented).accessibilityIdentifier("attendance-mode")}.listRowBackground(Color.clear).listRowInsets(.init(top:0,leading:0,bottom:0,trailing:0))}
            if model.data.isNull {
                if model.loading{ProgressView("Načítám docházku…")}
                else{ContentUnavailableView("Docházka není načtená",systemImage:"clock.badge.exclamationmark",description:Text("Obnovte data nebo zkontrolujte připojení."))}
            }else{
                Section {
                    freshness(data)
                    if !team{APIAttendanceLiveCard(store:store,data:data,busy:busy,punch:{Task{await punch(data)}},activity:{kind in Task{await activity(kind,data:data)}})}
                    if team{teamFilters(data)}
                    monthControl
                }.listRowBackground(Color.clear).listRowSeparator(.hidden).listRowInsets(.init(top:4,leading:0,bottom:4,trailing:0))
                if team{Section{teamStats(data,records:records);teamPeople(data)}.listRowBackground(Color.clear).listRowSeparator(.hidden).listRowInsets(.init(top:4,leading:0,bottom:4,trailing:0))}
                else{Section{APIAttendanceMetrics(items:[(data["detail"]["activitySchema"].int==1 ? "Odpracováno" : "Uzavřená přítomnost",APIAttendanceLogic.hours(totals.confirmed),"clock"),("Pracovních dnů",String(totals.days),"calendar.badge.checkmark"),(data["detail"]["activitySchema"].int==1 ? "Průměr za den" : "Průměr přítomnosti",APIAttendanceLogic.hours(totals.average),"chart.line.uptrend.xyaxis"),("Na zakázkách",data["detail"]["activitySchema"].int==1 ? APIAttendanceLogic.hours(totals.work) : "Nedostupné","list.clipboard")]);Text("Souhrny obsahují jen uzavřené a odeslané směny. Otevřený den je průběžný.").font(.caption).foregroundStyle(.secondary)}.listRowBackground(Color.clear).listRowSeparator(.hidden).listRowInsets(.init(top:4,leading:0,bottom:4,trailing:0))}
                Section{APIAttendanceChart(store:store,data:data,month:selectedMonth,user:user,allowedUsers:team ? Set(data["detail"]["people"].array.map(\.id)) : [store.userID],week:$chartWeek)}.listRowBackground(Color.clear).listRowInsets(.init(top:0,leading:0,bottom:0,trailing:0))
                Section("Pracovní dny") {
                    let filtered=records.filter{(dayFilter==nil || APIJobsPresentation.day($0.day)==dayFilter) && (!activeOnly || $0.open)}
                    if filtered.isEmpty{Text("Pro tento výběr nejsou pracovní dny.").foregroundStyle(.secondary)}
                    ForEach(filtered){day in NavigationLink{APIAttendanceDayView(store:store,day:day,data:data,action:{action=$0})}label:{APIAttendanceDayRow(day:day,showName:team)}.accessibilityIdentifier("attendance-day-"+APIJobsPresentation.day(day.day))}
                    if store.writer && !store.isRolePreview{Button("Doplnit chybějící den",systemImage:"plus.circle"){action=APIAttendanceActions.correction(.object(["id":.s(UUID().uuidString),"version":.n(0),"userId":.s(user=="all" ? store.userID : user)]),remove:false)}.buttonStyle(.automatic).frame(minHeight:44).accessibilityIdentifier("attendance-add-day")}
                }
                if dayFilter != nil || activeOnly{Button("Zobrazit celý měsíc"){dayFilter=nil;activeOnly=false}}
                reviewSections(data)
            }
            if model.loading && !model.data.isNull{ProgressView("Aktualizuji docházku…")}
            if let error=problem ?? model.problem{Section{Text(error).foregroundStyle(DiaryStyle.warning);Button("Zkusit znovu"){Task{await load(refresh:true)}}}}
        }.listStyle(.insetGrouped).listSectionSpacing(10).contentMargins(.top,0,for:.scrollContent).scrollContentBackground(.hidden).background(DiaryStyle.background)
            .navigationTitle("Docházka").navigationBarTitleDisplayMode(.inline)
            .toolbar{APIHeader(store:store);ToolbarItem(placement:.topBarTrailing){Menu{Button("Vybrat měsíc",systemImage:"calendar"){calendar=true};if store.manager{Button("Export měsíční docházky",systemImage:"square.and.arrow.up"){export=true}.disabled(data["detail"]["activitySchema"].int != 1)}}label:{Image(systemName:"calendar")}.buttonStyle(.automatic).accessibilityLabel("Období a export").accessibilityIdentifier("attendance-period-menu")}}
            .task(id:key){await load()}.refreshable{await store.resume(refreshViews:false);await load(refresh:true)}
            .sheet(isPresented:$calendar){APIAttendanceMonthPicker(month:$selectedMonth)}
            .sheet(item:$action){APIAttendanceAction(store:store,action:$0)}
            .fileExporter(isPresented:$export,document:APIAttendanceCSV(text:APIAttendanceLogic.csv(records)),contentType:.commaSeparatedText,defaultFilename:"dochazka-"+month){result in if case .failure(let error)=result{problem=error.localizedDescription}}
            .onChange(of:selectedMonth){_,value in dayFilter=nil;activeOnly=false;if APIAttendanceLogic.month(value) != String(store.today.prefix(7)){chartWeek=false}}
            .onChange(of:team){_,value in if value{employee="all"}else{discipline="all"}}
    }
    private var monthControl:some View {
        HStack{Button{moveMonth(-1)}label:{Image(systemName:"chevron.left")}.accessibilityLabel("Předchozí měsíc");Spacer(minLength:0);Button{calendar=true}label:{Text(APIAttendanceLogic.label(selectedMonth,format:"LLLL yyyy").capitalized).font(.headline).padding(.horizontal,10)}.accessibilityIdentifier("attendance-month");Spacer(minLength:0);Button{moveMonth(1)}label:{Image(systemName:"chevron.right")}.accessibilityLabel("Následující měsíc")}.buttonStyle(APIJobsCompactButtonStyle())
    }
    private func moveMonth(_ amount:Int){if let date=APIAttendanceLogic.calendar.date(byAdding:.month,value:amount,to:selectedMonth),2000...2099 ~= APIAttendanceLogic.calendar.component(.year,from:date){selectedMonth=date}}
    private func freshness(_ data:APIValue)->some View {
        VStack(alignment:.leading,spacing:4){
            Label(!store.online ? "Offline · uložená data" : data["_attendanceCache"]["stale"].bool ? "Uložená kopie" : "Aktualizováno v "+Self.time(data["serverNow"]),systemImage:!store.online ? "wifi.slash" : "clock.arrow.circlepath")
            if !store.outbox.isEmpty{NavigationLink("\(store.outbox.count) změn čeká na synchronizaci"){APIOutboxView(store:store)}}
            if data["detail"]["activitySchema"].int != 1{Text("Podrobné rozdělení a přestávky mimo zakázku vyžadují aktualizaci serveru.")}
        }.font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("attendance-freshness")
    }
    private func teamFilters(_ data:APIValue)->some View {
        VStack(spacing:6){Picker("Pracovník",selection:$employee){Text("Všichni pracovníci").tag("all");ForEach(data["employees"].array,id:\.id){Text($0.title).tag($0.id)}};if data["detail"]["activitySchema"].int==1{Picker("Kategorie",selection:$discipline){Text("Všechny kategorie").tag("all");Text("Dr. Závlaha").tag("irrigation");Text("Dr. Garden").tag("garden");Text("Obojí").tag("both")}}}.pickerStyle(.menu)
    }
    private func teamStats(_ data:APIValue,records:[APIAttendanceDay])->some View {
        let detail=data["detail"],today=APIAttendanceLogic.calendar.startOfDay(for:Date()),next=APIAttendanceLogic.calendar.date(byAdding:.day,value:1,to:today)!
        let days=APIAttendanceLogic.days(shifts:scopedShifts(data),intervals:detail["intervals"].array,from:today,to:next)
        let present=Set(scopedShifts(data).filter{$0["endAt"].isNull && $0["startAt"].double<=Date().timeIntervalSince1970*1000}.map{$0["userId"].string}).count
        let check=records.filter{!$0.issues.isEmpty}.count+data["pendingCorrections"].array.count
        return APIAttendanceMetrics(items:[("Dnes v práci","\(present)/\(detail["people"].array.count)","person.2"),("Dnes uzavřeno",APIAttendanceLogic.hours(days.reduce(0){$0+$1.confirmed}),"clock"),("Měsíc uzavřeno",APIAttendanceLogic.hours(records.reduce(0){$0+$1.confirmed}),"calendar"),("Ke kontrole",String(check),"exclamationmark.triangle")])
    }
    @ViewBuilder private func teamPeople(_ data:APIValue)->some View {
        let detail=data["detail"],today=APIAttendanceLogic.calendar.startOfDay(for:Date()),next=APIAttendanceLogic.calendar.date(byAdding:.day,value:1,to:today)!
        let records=APIAttendanceLogic.days(shifts:scopedShifts(data),intervals:detail["intervals"].array,from:today,to:next)
        VStack(alignment:.leading,spacing:10){Text("Dnešní docházka týmu").font(.headline)
            ForEach(detail["people"].array.filter{user=="all" || $0.id==user},id:\.id){person in
                let day=records.first{$0.userID==person.id},state=detail["states"].array.first{$0["userId"].string==person.id}?["active"] ?? .null
                NavigationLink{APIAttendanceView(store:store,initialUser:person.id,initialMonth:month)}label:{APIAttendancePersonRow(person:person,day:day,state:state)}.buttonStyle(.plain).accessibilityIdentifier("attendance-person-"+person.id)
            }
        }.padding(14).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:22))
    }
    @ViewBuilder private func reviewSections(_ data:APIValue)->some View {
        if store.manager,!data["pendingCorrections"].array.isEmpty{Section("Čeká na schválení") {ForEach(data["pendingCorrections"].array,id:\.id){c in VStack(alignment:.leading,spacing:8){Text(c["userName"].string).font(.headline);Text(c["reason"].string);HStack{Button("Schválit"){action=APIAttendanceActions.review(c,approve:true)};Button("Zamítnout"){action=APIAttendanceActions.review(c,approve:false)}}}}}}
        if store.manager{Section{Button("Export měsíční docházky",systemImage:"square.and.arrow.up"){export=true}.disabled(data["detail"]["activitySchema"].int != 1).buttonStyle(.automatic).frame(minHeight:44)}}
    }
    private func load(refresh:Bool=false)async{await model.load(store:store,month:month,user:user,discipline:team ? discipline : "all",refresh:refresh)}
    private func punch(_ data:APIValue)async {
        guard !busy else{return};busy=true;defer{busy=false};if punchAt==nil{punchAt=(Date().timeIntervalSince1970*1000).rounded()}
        do{try await APIAttendanceWorkflow.punch(store:store,activeShift:data["activeShift"],location:location,operationID:punchID,offline:data["detail"]["activitySchema"].int==1,at:punchAt);punchID=UUID().uuidString;punchAt=nil;problem=nil}catch{problem=error.localizedDescription}
    }
    private func activity(_ kind:String,data:APIValue)async {
        guard !busy,store.writer,!store.isRolePreview else{return};busy=true;defer{busy=false}
        let state=data["detail"]["states"].array.first{$0["userId"].string==store.userID} ?? .null,active=state["active"],shift=data["activeShift"]
        let prior=data["detail"]["intervals"].array.filter{$0["userId"].string==store.userID && $0["endAt"]==active["startAt"]}.max{$0["startAt"].double<$1["startAt"].double}
        let id=UUID().uuidString,body=APIValue.object(["operationId":.s(id),"action":.s(kind),"at":.number((Date().timeIntervalSince1970*1000).rounded()),"version":state["version"].isNull ? .n(0) : state["version"],"shiftId":shift["id"],"shiftVersion":shift["version"],"resumeKind":prior?["kind"] ?? .s(""),"resumeJobId":prior?["jobId"] ?? .null])
        do{_ = try await store.write("/api/attendance/activities",method:"POST",body:body,offline:true,operationID:id,dependsOn:store.outbox.filter{$0.state=="pending" && ($0.path.hasPrefix("/api/attendance/") || $0.path.hasSuffix("/time/actions"))}.map(\.id));problem=nil}catch{problem=error.localizedDescription}
    }
    static func time(_ value:APIValue)->String{value.isNull ? "" : APIAttendanceLogic.label(APIAttendanceLogic.date(value.double),format:"HH:mm")}
    static func date(_ value:APIValue)->String{APIAttendanceLogic.label(APIAttendanceLogic.date(value.double),format:"d. M. yyyy")}
}
extension APIAttendanceLogic{static func hours(_ value:Double)->String{APIWorkTimeLogic.hours(Int64(max(0,value)))}}
struct APIAttendanceCSV:FileDocument {
    static var readableContentTypes:[UTType]{[.commaSeparatedText]}
    var text:String
    init(text:String){self.text=text}
    init(configuration:ReadConfiguration)throws{text=String(data:configuration.file.regularFileContents ?? Data(),encoding:.utf8) ?? ""}
    func fileWrapper(configuration:WriteConfiguration)throws->FileWrapper{FileWrapper(regularFileWithContents:Data(text.utf8))}
}
