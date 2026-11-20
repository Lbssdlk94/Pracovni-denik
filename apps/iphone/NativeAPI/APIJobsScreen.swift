import SwiftUI

struct APIJobsScreen:View {
    @ObservedObject var store:APIStore
    @StateObject private var model=APIJobsListModel()
    @State private var period=APIJobsPeriod.today
    @State private var mine=true
    @State private var applied=APIJobsFilters()
    @State private var query=""
    @State private var detailJob:APIValue = .null
    @State private var filters=false
    @State private var calendar=false
    @State private var map=false
    @State private var doneExpanded=false
    @Environment(\.dynamicTypeSize) private var typeSize
    private let previewRows:[APIValue]?
    init(store:APIStore,filter:APIDashboardJobFilter?=nil,previewRows:[APIValue]?=nil){
        self.previewRows=store.fixture ? previewRows : nil
        _model=StateObject(wrappedValue:APIJobsListModel(previewRows:store.fixture ? previewRows ?? [] : []))
        self.store=store;_mine=State(initialValue:filter?.mine ?? true);_period=State(initialValue:filter?.allDates==true ? .all : .today)
        var value=APIJobsFilters();value.state=filter?.state ?? "all";value.attention=filter?.attention ?? "";_applied=State(initialValue:value)
    }
    private var key:String{APIJobsPresentation.paths(filters:applied,period:period,mine:mine,manager:store.manager,userID:store.userID,now:Date()).joined(separator:"|")+store.scope+store.today+store.revision.uuidString}
    private var jobs:[APIValue]{
        let now=Date(),selected=APIJobsPresentation.selectedDay(period,now:now),from=applied.dateRange ? APIJobsPresentation.day(applied.from) : "",to=applied.dateRange ? APIJobsPresentation.day(applied.to) : "",search=APIJobsPresentation.normalize(query)
        let known=model.rows.map{store.currentJob($0)}
        let own=known.map{$0["myTime"]}.max{$0["version"].int<$1["version"].int} ?? .null
        let seed:APIValue = .object(["job":.null,"states":.array([own.merged(["userId":.s(store.userID),"version":.n(own["version"].int)])]),"intervals":.array([])])
        let active=APIWorkTimeLogic.project(seed,store:store)["states"].array.first{$0["userId"].string==store.userID}?["active"]["jobId"].string ?? ""
        let available=known.filter{APIJobsPresentation.matches($0,filters:applied,period:period,query:query,now:now,selected:selected,rangeStart:from,rangeEnd:to,normalizedSearch:search,personalActiveID:active)}
        return APIJobsPresentation.sorted(available,by:applied.sort)
    }
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
        }.listStyle(.insetGrouped).listSectionSpacing(6).contentMargins(.top,0,for:.scrollContent).scrollContentBackground(.hidden).background(DiaryStyle.background)
            .navigationTitle("Zakázky").navigationBarTitleDisplayMode(.inline)
            .searchable(text:$query,placement:.navigationBarDrawer(displayMode:.always),prompt:"Hledat zakázku nebo zákazníka")
            .toolbar{APIHeader(store:store);if store.manager && !store.isRolePreview{ToolbarItem(placement:.topBarTrailing){Button{let r=APIResource(entity:.jobs);store.route=APIRoute(resource:r,value:r.initial(store),isNew:true)}label:{Image(systemName:"plus")}.accessibilityLabel("Nová zakázka")}}}
            .task(id:key){if previewRows==nil{await load()}}.refreshable{if previewRows==nil{await store.resume(refreshViews:false);await load(refresh:true)}}
            .sheet(isPresented:$filters){APIJobsFilterSheet(store:store,original:applied,rows:model.rows){value in applied=value;if !value.worker.isEmpty{mine=false};if value.dateRange{period = .all}}}
            .sheet(isPresented:$calendar){APIJobsCalendarSheet(filters:applied){from,to in applied.from=from;applied.to=to;applied.dateRange=true;period = .all}}
            .sheet(isPresented:$map){NavigationStack{APIJobsMap(store:store,jobs:jobs)}}
            .navigationDestination(isPresented:Binding(get:{!detailJob.isNull},set:{if !$0{detailJob = .null}})){if !detailJob.isNull{APIEntityDetail(store:store,resource:APIResource(entity:.jobs),initial:detailJob)}}
    }
    private var controls:some View {
        VStack(spacing:8){
            Picker("Termín zakázek",selection:$period){ForEach(APIJobsPeriod.allCases.filter{$0 != .all || store.enabled("jobList")},id:\.self){Text($0.title).tag($0)}}.pickerStyle(.segmented).accessibilityIdentifier("jobs-period")
                .onChange(of:period){_,value in if value != .all{applied.dateRange=false}}
            if typeSize.isAccessibilitySize {
                VStack(alignment:.leading,spacing:8){if store.manager{teamPicker};filterButtons}
            }else{
                ViewThatFits(in:.horizontal){
                    HStack(spacing:8){if store.manager{teamPicker.frame(minWidth:150)};filterButtons}
                    VStack(alignment:.leading,spacing:8){if store.manager{teamPicker};filterButtons}
                }
            }
        }
    }
    private var teamPicker:some View {
        Picker("Tým",selection:$mine){Text("Moje").tag(true);Text("Celý tým").tag(false)}.pickerStyle(.segmented).accessibilityIdentifier("jobs-team").onChange(of:mine){_,value in if value{applied.worker=""}}
    }
    private var filterButtons:some View {
        HStack(spacing:4){
            if store.enabled("jobCalendar"){Button{calendar=true}label:{Image(systemName:"calendar")}.accessibilityLabel("Kalendář zakázek").accessibilityIdentifier("jobs-calendar")}
            if store.manager && store.enabled("jobMap") && store.enabled("location"){Button{map=true}label:{Image(systemName:"map")}.accessibilityLabel("Mapa zakázek").accessibilityIdentifier("jobs-map")}
            Button{filters=true}label:{Image(systemName:"line.3.horizontal.decrease").overlay(alignment:.topTrailing){if applied.count>0{Text(String(applied.count)).font(.caption2.bold()).padding(3).foregroundStyle(Color.white).background(DiaryStyle.actionFill,in:Circle()).offset(x:9,y:-7)}}}.accessibilityLabel("Filtry").accessibilityValue("Aktivní filtry: \(applied.count)").accessibilityIdentifier("jobs-filters")
        }.buttonStyle(APIJobsCompactButtonStyle()).fixedSize(horizontal:true,vertical:false)
    }
    @ViewBuilder private var jobSections:some View {
        ForEach(APIJobsGroup.allCases){group in
            let rows=jobs.filter{APIJobsGroup.of($0)==group}
            if !rows.isEmpty{
                Section {
                    if group != .done || doneExpanded{ForEach(rows,id:\.id){job in APIJobListRow(store:store,job:job,open:{detailJob=$0}).listRowInsets(EdgeInsets(top:3,leading:0,bottom:3,trailing:0)).listRowSeparator(.hidden).listRowBackground(Color.clear)}}
                }header:{
                    if group == .done{Button{withAnimation{doneExpanded.toggle()}}label:{HStack{Text("Dokončené · \(rows.count)");Spacer();Image(systemName:doneExpanded ? "chevron.up" : "chevron.down")}.frame(minHeight:44).contentShape(Rectangle())}.buttonStyle(.plain).accessibilityIdentifier("jobs-completed").accessibilityValue(doneExpanded ? "Rozbaleno" : "Sbaleno")}
                    else{Text(group.title+" · \(rows.count)").font(.subheadline.weight(.semibold)).foregroundStyle(.primary)}
                }
            }
        }
    }
    private var freshness:some View {
        let layout=typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:4)) : AnyLayout(HStackLayout(alignment:.firstTextBaseline,spacing:5))
        return layout{
            Label(!store.online ? "Offline · uložená data" : model.cache.isNull ? "Načítání" : model.cache["stale"].bool ? "Uložená kopie · "+updatedTime : "Synchronizováno v "+updatedTime,systemImage:!store.online ? "wifi.slash" : model.cache["stale"].bool ? "clock.arrow.circlepath" : "arrow.clockwise")
            if !store.outbox.isEmpty{Text("· čeká: \(store.outbox.count)")}
            if !typeSize.isAccessibilitySize{Spacer(minLength:0)}
            if !model.loading{Text("\(jobs.count)\(model.complete ? "" : "+") zakázek")}
        }.font(.caption).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true).accessibilityElement(children:.combine)
    }
    private var updatedTime:String{model.cache["at"].double>0 ? APIAttendanceView.time(model.cache["at"]) : "čas neznámý"}
    private func load(refresh:Bool=false)async{await model.load(store:store,filters:applied,period:period,mine:mine,refresh:refresh)}
}

struct APIJobsCompactButtonStyle:ButtonStyle {
    var primary=false
    func makeBody(configuration:Configuration)->some View{configuration.label.font(.body.weight(.semibold)).foregroundStyle(primary ? Color.white : DiaryStyle.accent).padding(.horizontal,primary ? 8 : 0).frame(minWidth:44,minHeight:44).background((primary ? DiaryStyle.actionFill : DiaryStyle.soft).opacity(configuration.isPressed ? 0.65 : 1),in:RoundedRectangle(cornerRadius:13)).scaleEffect(configuration.isPressed ? 0.96 : 1)}
}
