import SwiftUI

struct APIFieldsView: View {
    let fields: [APIField]
    @Binding var value: APIValue
    var options: [String:[APIValue]] = [:]
    var edited: (String) -> Void = { _ in }
    var body: some View {
        VStack(alignment:.leading,spacing:16) {
            ForEach(fields) { field in
                APIFieldEditor(field:field,value:Binding(get:{value[field.id]},set:{value[field.id]=$0;edited(field.id)}),options:options)
                if field.id != fields.last?.id { Divider() }
            }
        }
    }
}
struct APIFieldEditor: View {
    let field: APIField
    @Binding var value: APIValue
    var options: [String:[APIValue]]
    @State private var rawNumber:String?
    private var text: Binding<String> { Binding(get:{
        if let rawNumber,[APIFieldKind.integer,.decimal,.money,.liters].contains(field.kind){return rawNumber}
        switch field.kind { case .money: return value.isNull ? "" : String(value.double/100);case .liters: return value.isNull ? "" : String(value.double/1000);default:return value.string }
    },set:{ next in
        switch field.kind {
        case .integer,.decimal,.money,.liters:
            rawNumber=next
            let parsed=Double(next.replacingOccurrences(of:",",with:"."));let scale=field.kind == .money ? 100.0 : field.kind == .liters ? 1000.0 : 1.0
            value=parsed.map{.number(field.kind == .decimal ? $0 : ($0*scale).rounded())} ?? .null
        default:value = .s(next)
        }
    }) }
    var body: some View {
        VStack(alignment:.leading,spacing:8) {
            switch field.kind {
            case .toggle: Toggle(field.title,isOn:Binding(get:{value.bool},set:{value = .bool($0)})).frame(minHeight:44)
            case .choice,.reference:
                let choices = field.kind == .choice ? field.choices : (options[field.reference ?? ""] ?? []).map { APIChoice(id:$0.id,title:APIDomainLogic.referenceLabel($0,kind:field.reference ?? "")) }
                Picker(field.title,selection:text) {
                    if !field.required { Text(field.id == "customerAddressId" ? "Adresa vyplněná ručně" : "Bez výběru").tag("") }
                    if !value.string.isEmpty && !choices.contains(where:{$0.id==value.string}) { Text("Uložená vazba · načítám podrobnosti").tag(value.string) }
                    ForEach(choices) { choice in Text(choice.title).tag(choice.id) }
                }.pickerStyle(.navigationLink).frame(minHeight:44)
            case .array:
                DisclosureGroup(field.title + " · \(value.array.count)") {
                    ForEach(Array(value.array.enumerated()),id:\.offset) { index, item in
                        VStack(alignment:.leading,spacing:10) {
                            if field.children.count == 1,field.children[0].id == "value" {
                                AnyView(APIFieldEditor(field:field.children[0],value:Binding(get:{value.array.indices.contains(index) ? value.array[index] : .null},set:{new in var a=value.array;if a.indices.contains(index){a[index]=new;value = .array(a)}}),options:options))
                            } else {
                                AnyView(APIFieldsView(fields:field.children,value:Binding(get:{value.array.indices.contains(index) ? value.array[index] : .null},set:{new in var a=value.array;if a.indices.contains(index){a[index]=new;value = .array(a)}}),options:options))
                            }
                            Button("Odebrat",role:.destructive) { var a=value.array;if a.indices.contains(index){a.remove(at:index);value = .array(a)} }.frame(minHeight:44)
                        }.padding(.vertical,10)
                    }
                    Button { var a=value.array;var new=APIValue.object(["id":.s(UUID().uuidString)]);for f in field.children { new[f.id] = f.initial };a.append(field.children.count == 1 && field.children[0].id == "value" ? .s("") : new);value = .array(a) } label:{Label("Přidat položku",systemImage:"plus")}.frame(minHeight:44)
                }
            case .object:
                DisclosureGroup(field.title) { AnyView(APIFieldsView(fields:field.children,value:$value,options:options)).padding(.vertical,12) }
            case .notes:
                Text(field.title).font(.subheadline).foregroundStyle(.secondary)
                TextEditor(text:text).frame(minHeight:100).accessibilityLabel(field.title)
            case .date,.time:
                if value.string.isEmpty{Button("Nastavit: "+field.title){value = .s(field.kind == .date ? DiaryDate.iso(Date()) : APIAttendanceView.time(.number(Date().timeIntervalSince1970*1000)))}.frame(minHeight:44)}else{DatePicker(field.title,selection:Binding(get:{if field.kind == .date{return DiaryDate.parse(value.string) ?? Date()};let f=DateFormatter();f.timeZone=TimeZone(identifier:"Europe/Prague");f.dateFormat="HH:mm";return f.date(from:value.string) ?? Date()},set:{date in value = .s(field.kind == .date ? DiaryDate.iso(date) : APIAttendanceView.time(.number(date.timeIntervalSince1970*1000)))}),displayedComponents:field.kind == .date ? .date : .hourAndMinute).environment(\.timeZone,TimeZone(identifier:"Europe/Prague")!);if !field.required{Button("Bez hodnoty",role:.destructive){value = .s("")}.font(.caption)}}
            case .password: SecureField(field.title,text:text).textContentType(field.id == "password" ? .newPassword : .oneTimeCode).frame(minHeight:44)
            default:
                Text(field.title + (field.required ? " *" : "")).font(.caption).foregroundStyle(.secondary)
                TextField(field.kind == .date ? "RRRR-MM-DD" : field.kind == .time ? "HH:mm" : field.title,text:text,axis:.vertical)
                    .textInputAutocapitalization(field.kind == .date || field.kind == .time ? .never : .sentences)
                    .keyboardType([APIFieldKind.integer,.decimal,.money,.liters].contains(field.kind) ? .decimalPad : .default)
                    .frame(minHeight:44).accessibilityLabel(field.title).accessibilityIdentifier("api-field-"+field.id)
            }
        }
    }
}
@MainActor
struct APIEntityEditor: View {
    @ObservedObject var store: APIStore
    let resource: APIResource
    let original: APIValue
    let isNew: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var value: APIValue = .null
    @State private var options: [String:[APIValue]] = [:]
    @State private var touched = Set<String>()
    @State private var operationID = UUID().uuidString
    @State private var loading = true
    @State private var saving = false
    @State private var problem: String?
    @State private var overlap:APIValue = .null
    @State private var confirmClose = false
    private var key: String { resource.id+":"+original.id }
    private var fields:[APIField]{
        var result=resource.fields.filter{($0.feature==nil || store.enabled($0.feature!)) && (!$0.ownerOnly || store.owner) && ($0.id != "discipline" || !store.me["workspace"].isNull)}
        if !store.enabled("customers"){result=result.filter{$0.id != "customerId" && $0.id != "customerAddressId"}}
        if !store.enabled("gardens"){result=result.filter{$0.id != "gardenId"}}
        if !store.canIrrigate{result=result.filter{$0.id != "pumpType"}}
        if resource.entity == .customers && !isNew{result=result.filter{$0.id != "discipline"}}
        result=result.map{field in var f=field;if f.id=="discipline"{f.required=true;f.choices=f.choices.filter{store.me["workspace"]["disciplines"].array.contains(.s($0.id))}};return f}
        if resource.entity == .entries{result=result.map{field in var f=field;if f.id=="kind"{f.choices=f.choices.filter{store.enabled(["fuel":"fleetFuel","service":"fleetService","expense":"fleetExpenses"][$0.id] ?? "vehicles")}};if f.id=="litersMilli"{f.required=value["kind"].string=="fuel"};return f}.filter{!["litersMilli","full","station"].contains($0.id) || value["kind"].string=="fuel"}}
        if resource.entity == .vehicles{let gates=["inspectionDate":"fleetStk","vignetteDate":"fleetVignette","leadDays":"fleetAlerts","odometer":"fleetOdometer"];result=result.filter{field in gates[field.id].map{store.enabled($0)} ?? true}}
        return result
    }
    private var visibleOptions:[String:[APIValue]]{var result=options;if resource.entity == .jobs && !value["customerId"].string.isEmpty{result["gardens"]=options["gardens",default:[]].filter{$0["customerId"]==value["customerId"]}};return result}
    private var extras:Set<String>{resource.entity == .jobs ? ["arrivalWindowStart","arrivalWindowEnd","legacyTimeMeaning","startTime","endTime","customerName","discipline"] : resource.entity == .vehicles ? ["model","vin","inspectionDate","vignetteDate","leadDays","notes"] : []}

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:18) {
                    if loading { ProgressView("Načítám údaje…") }
                    else { APIFieldsView(fields:fields.filter{!extras.contains($0.id)},value:$value,options:visibleOptions,edited:edited).diaryCard();if !fields.filter({extras.contains($0.id)}).isEmpty{DisclosureGroup("Doplňující údaje"){APIFieldsView(fields:fields.filter{extras.contains($0.id)},value:$value,options:visibleOptions,edited:edited)}.diaryCard()} }
                    if resource.entity == .defects,!value["sourceJobId"].string.isEmpty {APIProtocolPhotoPicker(store:store,jobID:value["sourceJobId"].string,photos:Binding(get:{value["photos"]},set:{value["photos"]=$0})).diaryCard()}
                    if !overlap.isNull {VStack(alignment:.leading){ForEach(Array(overlap["warnings"].array.enumerated()),id:\.offset){_,warning in Text(warning["message"].string).foregroundStyle(DiaryStyle.warning)};if !overlap["overlaps"].array.isEmpty{Text("Překryvy práce: \(overlap["overlaps"].array.count). Zkontrolujte přiřazení, čas a rezervu mezi návštěvami.").foregroundStyle(DiaryStyle.warning)}};Button("Přesto uložit po kontrole překryvů"){value["allowOverlaps"] = .bool(true);value["previewRevision"]=overlap["revision"];Task{await save()}}.buttonStyle(.bordered)}
                    if let problem { DiaryStatusBanner(text:problem,warning:true) }
                    Text("Koncept se průběžně ukládá v tomto iPhonu.").font(.footnote).foregroundStyle(.secondary)
                }.padding(18)
            }.background(DiaryStyle.background).navigationTitle(isNew ? "Nový záznam" : "Upravit").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement:.cancellationAction) { Button("Zavřít") { confirmClose=true }.disabled(saving) }
                    ToolbarItem(placement:.confirmationAction) { Button("Uložit") { Task { await save() } }.disabled(loading || saving) }
                }
                .confirmationDialog("Rozepsané údaje",isPresented:$confirmClose,titleVisibility:.visible) {
                    Button("Ponechat koncept a zavřít") { persist();dismiss() }
                    Button("Zahodit koncept",role:.destructive) { store.removeDraft(key);dismiss() }
                    Button("Pokračovat v úpravách",role:.cancel) {}
                }.interactiveDismissDisabled().editLease(store)
        }.task { await load() }
            .onChange(of:value) { _,_ in if !loading {persist()} }
            .onChange(of:value["discipline"].string){_,discipline in if resource.entity == .gardens && !touched.contains("notes") && !value["workNotes"][discipline].isNull{value["notes"]=value["workNotes"][discipline]}}
            .onChange(of:value["gardenId"].string) { _,_ in if !loading { hydrateGarden() } }
            .onChange(of:value["customerAddressId"].string){_,id in if touched.contains("customerAddressId"),let address=options["addresses"]?.first(where:{$0.id==id}) {if !touched.contains("address"){value["address"]=address["address"]};if !touched.contains("city"),!address["city"].string.isEmpty{value["city"]=address["city"]}}}
            .onChange(of:value["customerId"].string) { _,_ in if !loading { Task { await loadAddresses() } } }
    }
    func edited(_ key:String){touched.insert(key);overlap = .null;value["allowOverlaps"] = .bool(false);value["previewRevision"] = .null}
    func persist() { store.saveDraft(key,draft:APIDraft(value:value,baseVersion:original["version"].int,operationID:operationID,updatedAt:Date(),touchedFields:touched)) }
    func load() async {
        let initial = isNew ? resource.initial(store).merged(original.object) : original
        let draft=store.draft(key,fallback:initial);value=draft.value;operationID=draft.operationID;touched=draft.touchedFields ?? []
        if resource.entity == .gardens && !store.me["workspace"].isNull{if value["discipline"].string.isEmpty{value["discipline"]=resource.initial(store)["discipline"]};if !touched.contains("notes") && !value["workNotes"][value["discipline"].string].isNull{value["notes"]=value["workNotes"][value["discipline"].string]}}
        do {
            let refs=Set(fields.flatMap { [$0.reference].compactMap{$0} + $0.children.compactMap(\.reference) })
            for ref in refs { options[ref] = try await APIDomainLogic.referenceRows(ref,store:store) }
            await loadAddresses();hydrateGarden();loading=false
        } catch { problem=error.localizedDescription;loading=false }
    }
    func loadAddresses() async {
        let selected=value["customerId"].string
        guard !selected.isEmpty else {options["addresses"]=[];return}
        do { let customer=try await store.get("/api/customers/"+value["customerId"].string);guard selected==value["customerId"].string else{return};options["addresses"]=customer["customer"]["addresses"].array;if resource.entity == .jobs && !touched.contains("customerName"){value["customerName"]=customer["customer"]["name"]} } catch { problem=error.localizedDescription }
    }
    func hydrateGarden() {
        guard let garden=options["gardens"]?.first(where:{$0.id==value["gardenId"].string}) else { return }
        value=APIDomainLogic.prefillGarden(value,garden:garden,touched:touched)
        if !garden["addressDetails"]["customerAddressId"].string.isEmpty {
            let id=garden["addressDetails"]["customerAddressId"].string
            if !options["addresses",default:[]].contains(where:{$0.id==id}) { options["addresses",default:[]].append(.object(["id":.s(id),"name":.s(garden.title+" · "+garden["address"].string)])) }
        }
    }
    func save() async {
        saving=true;defer{saving=false}
        do {
            for field in fields where field.required && (value[field.id].isNull || value[field.id].string.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && field.kind != .array && field.kind != .object) { throw APIError.local("Doplňte: "+field.title) }
            if resource.entity == .jobs && !value["customerId"].string.isEmpty && value["gardenId"].string.isEmpty && options["gardens",default:[]].filter({$0["customerId"] == value["customerId"]}).count > 1 { throw APIError.local("Zákazník má více zahrad. Vyberte konkrétní zahradu.") }
            try await APIDomainLogic.save(resource:resource,value:value,isNew:isNew,operationID:operationID,draftKey:key,store:store)
            dismiss()
        } catch let error as APIError { if !error.details["preview"]["revision"].isNull{overlap=error.details["preview"]};if error.code=="planner_conflict"{value["allowOverlaps"] = .bool(false);value["previewRevision"] = .null;overlap = .null};problem=error.localizedDescription } catch{problem=error.localizedDescription}
    }
}
