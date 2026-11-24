import SwiftUI

struct APIJobsFilterSheet:View {
    @ObservedObject var store:APIStore
    let original:APIJobsFilters
    let rows:[APIValue]
    let apply:(APIJobsFilters)->Void
    @Environment(\.dismiss) private var dismiss
    @State private var draft=APIJobsFilters()
    @State private var people:[APIValue]=[]
    @State private var problem:String?
    private var customers:[APIValue]{
        let values=rows.filter{!$0["customerId"].string.isEmpty}.map{APIValue.object(["id":$0["customerId"],"name":.s($0["customerName"].string.isEmpty ? $0.title : $0["customerName"].string)])}
        return Dictionary(values.map{($0.id,$0)},uniquingKeysWith:{$1}).values.sorted{$0.title.localizedStandardCompare($1.title) == .orderedAscending}
    }
    var body:some View {
        NavigationStack {
            Form {
                Section("Stav zakázky"){
                    Picker("Stav",selection:$draft.state){
                        Text("Všechny stavy").tag("all")
                        Text("Čeká na naplánování").tag("waiting")
                        ForEach(["planned","on_way","in_progress","approval","incomplete","done"],id:\.self){key in Text(key=="approval" ? "Čeká na schválení" : key=="incomplete" ? "Nemohu dokončit" : APIFormat.status(key)).tag(key)}
                    }.accessibilityIdentifier("jobs-filter-state")
                }
                Section("Zařazení"){
                    if store.manager {
                        Picker("Pracovník",selection:$draft.worker){Text("Všichni pracovníci").tag("");ForEach(people,id:\.id){Text($0.title).tag($0.id)};if !draft.worker.isEmpty,!people.contains(where:{$0.id==draft.worker}){Text("Vybraný pracovník").tag(draft.worker)}}
                    }
                    Picker("Typ zakázky",selection:$draft.type){Text("Všechny typy").tag("");Text("Servis").tag("service");Text("Realizace").tag("installation");Text("Zaměření").tag("survey");Text("Zazimování").tag("blowout");Text("Údržba zahrady").tag("maintenance")}.accessibilityIdentifier("jobs-filter-type")
                    if !store.me["workspace"].isNull {
                        Picker("Obor",selection:$draft.discipline){Text(store.me["workspace"]["disciplines"].array.count>1 ? "Obojí" : "Dostupný obor").tag("all");ForEach(store.me["workspace"]["disciplines"].array.map(\.string),id:\.self){Text($0=="garden" ? "Dr. Garden" : "Dr. Závlaha").tag($0)}}
                    }
                    Picker("Zákazník",selection:$draft.customer){Text("Všichni zákazníci").tag("");ForEach(customers,id:\.id){Text($0.title).tag($0.id)};if !draft.customer.isEmpty,!customers.contains(where:{$0.id==draft.customer}){Text("Vybraný zákazník").tag(draft.customer)}}
                    Text("Nabídka zákazníků odpovídá dostupným načteným zakázkám.").font(.caption).foregroundStyle(.secondary)
                }
                if store.enabled("jobCalendar") || store.enabled("jobList"){Section("Termín"){
                    Toggle("Konkrétní období",isOn:$draft.dateRange)
                    if draft.dateRange{DatePicker("Od",selection:$draft.from,displayedComponents:.date);DatePicker("Do",selection:$draft.to,in:draft.from...,displayedComponents:.date)}
                }}
                Section("Řazení"){Picker("Seřadit",selection:$draft.sort){ForEach(APIJobsSort.allCases,id:\.self){Text($0.title).tag($0)}}.pickerStyle(.inline)}
                Section("Další filtry"){
                    Picker("Protokol",selection:$draft.protocolState){Text("Všechny").tag("");Text("Chybí nebo rozpracovaný").tag("unfinished");Text("Chybí").tag("missing");Text("Rozpracovaný").tag("draft");Text("Hotový").tag("ready")}
                    if !draft.attention.isEmpty{Text(APIDashboardLogic.attentionTitles[draft.attention] ?? draft.attention);Button("Zrušit filtr upozornění"){draft.attention=""}}
                }
                if let problem{Text(problem).font(.caption).foregroundStyle(DiaryStyle.warning)}
            }.environment(\.locale,Locale(identifier:"cs_CZ")).environment(\.timeZone,APIJobsPresentation.calendar.timeZone)
                .navigationTitle("Filtry").navigationBarTitleDisplayMode(.inline)
                .toolbar{
                    ToolbarItem(placement:.topBarLeading){Button("Resetovat"){draft=APIJobsFilters()}.buttonStyle(.automatic).accessibilityIdentifier("jobs-filter-reset")}
                    ToolbarItem(placement:.topBarTrailing){Button("Zavřít",systemImage:"xmark"){dismiss()}.labelStyle(.iconOnly).buttonStyle(.automatic)}
                }
                .safeAreaInset(edge:.bottom){Button("Zobrazit zakázky"){if draft.to<draft.from{draft.to=draft.from};apply(draft);dismiss()}.diaryBubble(.primary).padding(12).frame(maxWidth:.infinity).background(.regularMaterial)}
        }.onAppear{draft=original}.task(id:store.scope){
            guard store.manager else{return};let scope=store.scope
            do{let result=try await store.get("/api/jobs/people");guard scope==store.scope else{return};people=result["people"].array}catch{problem=error.localizedDescription}
        }.onChange(of:draft.from){_,value in if draft.to<value{draft.to=value}}
    }
}

struct APIJobsCalendarSheet:View {
    let filters:APIJobsFilters
    let apply:(Date,Date)->Void
    @Environment(\.dismiss) private var dismiss
    @State private var from=Date()
    @State private var to=Date()
    @State private var range=false
    var body:some View {
        NavigationStack{Form{
            Toggle("Vybrat období",isOn:$range)
            DatePicker(range ? "Od" : "Den návštěvy",selection:$from,displayedComponents:.date).datePickerStyle(.graphical)
            if range{DatePicker("Do",selection:$to,in:from...,displayedComponents:.date)}
        }.environment(\.locale,Locale(identifier:"cs_CZ")).environment(\.timeZone,APIJobsPresentation.calendar.timeZone)
            .navigationTitle("Kalendář zakázek").navigationBarTitleDisplayMode(.inline)
            .toolbar{ToolbarItem(placement:.cancellationAction){Button("Zrušit",systemImage:"xmark"){dismiss()}.labelStyle(.iconOnly).buttonStyle(.automatic)};ToolbarItem(placement:.confirmationAction){Button("Zobrazit"){apply(from,range ? max(from,to) : from);dismiss()}.buttonStyle(.automatic)}}
        }.onAppear{from=filters.dateRange ? filters.from : Date();to=filters.dateRange ? filters.to : from;range=filters.dateRange && APIJobsPresentation.day(from) != APIJobsPresentation.day(to)}.onChange(of:from){_,value in if to<value{to=value}}
    }
}
