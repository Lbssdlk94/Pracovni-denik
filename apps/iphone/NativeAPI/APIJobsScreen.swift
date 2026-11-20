import SwiftUI

struct APIJobsScreen:View {
    @ObservedObject var store:APIStore
    @StateObject private var model=APIJobsListModel()
    @State private var period=APIJobsPeriod.today
    @State private var mine=true
    @State private var applied=APIJobsFilters()
    @State private var query=""
    @State private var filters=false,calendar=false,map=false,doneExpanded=false
    @Environment(\.dynamicTypeSize) private var typeSize
    private let previewRows:[APIValue]?
    init(store:APIStore,filter:APIDashboardJobFilter?=nil,previewRows:[APIValue]?=nil){
        self.previewRows=store.fixture ? previewRows : nil
        _model=StateObject(wrappedValue:APIJobsListModel(previewRows:store.fixture ? previewRows ?? [] : []))
        self.store=store;_mine=State(initialValue:filter?.mine ?? true);_period=State(initialValue:filter?.allDates==true ? .all : .today)
        var value=APIJobsFilters();value.state=filter?.state ?? "all";value.attention=filter?.attention ?? "";_applied=State(initialValue:value)
    }
    private var key:String{APIJobsPresentation.paths(filters:applied,period:period,mine:mine,manager:store.manager,userID:store.userID,now:Date()).joined(separator:"|")+store.scope+store.today+store.revision.uuidString}
    private var jobs:[APIValue]{APIJobsPresentation.sorted(model.rows.map{store.currentJob($0)}.filter{APIJobsPresentation.matches($0,filters:applied,period:period,query:query,now:Date())},by:applied.sort)}
    var body:some View {
        List {
            Section {
                controls
                freshness
                if applied.dateRange{Text(APIJobsPresentation.date(APIJobsPresentation.day(applied.from))+" – "+APIJobsPresentation.date(APIJobsPresentation.day(applied.to))).font(.caption).foregroundStyle(.secondary)}
                if !applied.attention.isEmpty{Text(APIDashboardLogic.attentionTitles[applied.attention] ?? applied.attention).font(.subheadline.weight(.semibold))}
            }.listRowBackground(Color.clear).listRowSeparator(.hidden).listRowInsets(EdgeInsets(top:2,leading:0,bottom:2,trailing:0))
            jobSections
            if model.loading{ProgressView(model.rows.isEmpty ? "Načítám zakázky…" : "Načítám další zakázky…").font(.subheadline).listRowBackground(Color.clear)}
            if jobs.isEmpty && !model.loading{
                ContentUnavailableView(query.isEmpty ? "Žádné zakázky pro tento výběr" : "Žádné výsledky",systemImage:"calendar.badge.checkmark",description:Text("Zkuste změnit termín, hledání nebo filtry.")).listRowBackground(Color.clear)
                if period == .today && query.isEmpty && applied.count==0{APIUpcomingVisits(store:store,mine:mine)}
            }
            if let problem=model.problem{Section{Text(problem).font(.caption).foregroundStyle(DiaryStyle.warning);Button("Zkusit znovu"){Task{await load(refresh:true)}}.diaryBubble()}.listRowBackground(Color.clear)}
        }.listStyle(.insetGrouped).listSectionSpacing(10).scrollContentBackground(.hidden).background(DiaryStyle.background)
            .navigationTitle("Zakázky").navigationBarTitleDisplayMode(.inline)
            .searchable(text:$query,placement:.navigationBarDrawer(displayMode:.always),prompt:"Hledat zakázku nebo zákazníka")
            .toolbar{APIHeader(store:store);if store.manager && !store.isRolePreview{ToolbarItem(placement:.topBarTrailing){Button{let r=APIResource(entity:.jobs);store.route=APIRoute(resource:r,value:r.initial(store),isNew:true)}label:{Image(systemName:"plus")}.accessibilityLabel("Nová zakázka")}}}
            .task(id:key){if previewRows==nil{await load()}}.refreshable{if previewRows==nil{await store.resume(refreshViews:false);await load(refresh:true)}}
            .sheet(isPresented:$filters){APIJobsFilterSheet(store:store,original:applied,rows:model.rows){value in applied=value;if !value.worker.isEmpty{mine=false};if value.dateRange{period = .all}}}
            .sheet(isPresented:$calendar){APIJobsCalendarSheet(filters:applied){from,to in applied.from=from;applied.to=to;applied.dateRange=true;period = .all}}
            .sheet(isPresented:$map){NavigationStack{APIJobsMap(store:store,jobs:jobs)}}
    }
    private var controls:some View {
        VStack(spacing:8){
            Picker("Termín zakázek",selection:$period){ForEach(APIJobsPeriod.allCases.filter{$0 != .all || store.enabled("jobList")},id:\.self){Text($0.title).tag($0)}}.pickerStyle(.segmented).accessibilityIdentifier("jobs-period")
                .onChange(of:period){_,value in if value != .all{applied.dateRange=false}}
            let layout=typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:8)) : AnyLayout(HStackLayout(spacing:8))
            layout{
                if store.manager{Picker("Tým",selection:$mine){Text("Moje").tag(true);Text("Celý tým").tag(false)}.pickerStyle(.segmented).accessibilityIdentifier("jobs-team").onChange(of:mine){_,value in if value{applied.worker=""}}}
                HStack(spacing:4){
                    if store.enabled("jobCalendar"){Button{calendar=true}label:{Image(systemName:"calendar")}.accessibilityLabel("Kalendář zakázek").accessibilityIdentifier("jobs-calendar")}
                    if store.manager && store.enabled("jobMap") && store.enabled("location"){Button{map=true}label:{Image(systemName:"map")}.accessibilityLabel("Mapa zakázek").accessibilityIdentifier("jobs-map")}
                    Button{filters=true}label:{Image(systemName:"line.3.horizontal.decrease").overlay(alignment:.topTrailing){if applied.count>0{Text(String(applied.count)).font(.caption2.bold()).padding(3).foregroundStyle(Color(.systemBackground)).background(DiaryStyle.actionFill,in:Circle()).offset(x:9,y:-7)}}}.accessibilityLabel("Filtry").accessibilityValue("Aktivní filtry: \(applied.count)").accessibilityIdentifier("jobs-filters")
                }.buttonStyle(APIJobsCompactButtonStyle()).fixedSize(horizontal:true,vertical:false)
            }
        }
    }
    @ViewBuilder private var jobSections:some View {
        ForEach(APIJobsGroup.allCases){group in
            let rows=jobs.filter{APIJobsGroup.of($0)==group}
            if !rows.isEmpty{
                Section {
                    if group != .done || doneExpanded{ForEach(rows,id:\.id){job in APIJobListRow(store:store,job:job).listRowInsets(EdgeInsets(top:8,leading:12,bottom:8,trailing:12)).listRowSeparator(.hidden)}}
                }header:{
                    if group == .done{Button{withAnimation{doneExpanded.toggle()}}label:{HStack{Text("Dokončené · \(rows.count)");Spacer();Image(systemName:doneExpanded ? "chevron.up" : "chevron.down")}.frame(minHeight:44)}.buttonStyle(.plain).accessibilityIdentifier("jobs-completed").accessibilityValue(doneExpanded ? "Rozbaleno" : "Sbaleno")}
                    else{Text(group.title+" · \(rows.count)")}
                }
            }
        }
    }
    private var freshness:some View {
        HStack(alignment:.firstTextBaseline,spacing:5){
            Image(systemName:!store.online ? "wifi.slash" : model.cache["stale"].bool ? "clock.arrow.circlepath" : "arrow.clockwise")
            Text(!store.online ? "Offline · uložená data" : model.cache.isNull ? "Načítání" : model.cache["stale"].bool ? "Uložená kopie · "+APIAttendanceView.time(model.cache["at"]) : "Synchronizováno v "+APIAttendanceView.time(model.cache["at"]))
            if !store.outbox.isEmpty{Text("· čeká: \(store.outbox.count)")}
            Spacer(minLength:0)
            if !model.loading{Text("\(jobs.count)\(model.complete ? "" : "+") zakázek")}
        }.font(.caption).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true).accessibilityElement(children:.combine)
    }
    private func load(refresh:Bool=false)async{await model.load(store:store,filters:applied,period:period,mine:mine,refresh:refresh)}
}

struct APIJobsCompactButtonStyle:ButtonStyle {
    func makeBody(configuration:Configuration)->some View{configuration.label.font(.body.weight(.semibold)).foregroundStyle(DiaryStyle.accent).frame(minWidth:44,minHeight:44).background(DiaryStyle.soft.opacity(configuration.isPressed ? 0.55 : 1),in:RoundedRectangle(cornerRadius:13)).scaleEffect(configuration.isPressed ? 0.96 : 1)}
}
