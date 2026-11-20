import SwiftUI

// Opt-in components for secondary screens. Approved dashboard/job/attendance/protocol
// components and the shared APIFieldEditor retain their original rendering.
struct APIFormGroup: Identifiable {
    let id: String
    let title: String
    let symbol: String
    let fields: [APIField]
}
enum APISecondaryLayout {
    static func group(_ field: APIField) -> String {
        if ["email","phones","addresses","phone","contactNotes","bankAccount","companyId","taxId"].contains(field.id) { return "contact" }
        if ["dueDate","plannedStart","estimatedMinutes","arrivalWindowStart","arrivalWindowEnd","startTime","endTime","date","discoveredOn","inspectionDate","vignetteDate","leadDays","legacyTimeMeaning"].contains(field.id) { return "schedule" }
        if ["assignedTo","assignedTos","assigneeId","workers","driverId"].contains(field.id) { return "people" }
        if ["priceMinor","costMinor","currency","billingPeriod","hours","kilometers","hourlyMinor","travelMinor","billing","definition"].contains(field.id) { return "finance" }
        if field.kind == .notes || ["nextStep","resolution","status","defectIds","services","benefits","terms"].contains(field.id) { return "details" }
        return "identity"
    }
    static func groups(_ fields: [APIField]) -> [APIFormGroup] {
        let catalog=[("identity","Základní údaje","square.text.square"),("contact","Kontakty a adresy","person.crop.rectangle"),("schedule","Termín a čas","calendar"),("people","Pracovníci","person.2"),("finance","Ceny a fakturace","creditcard"),("details","Podrobnosti","text.alignleft")]
        return catalog.compactMap { id,title,symbol in
            let rows=fields.filter { group($0)==id }
            return rows.isEmpty ? nil : APIFormGroup(id:id,title:title,symbol:symbol,fields:rows)
        }
    }
    static func matching(_ choices: [APIChoice], query: String) -> [APIChoice] {
        query.isEmpty ? choices : choices.filter { $0.title.localizedStandardContains(query) }
    }
}
struct APISecondaryFormSections: View {
    let fields: [APIField]
    @Binding var value: APIValue
    var options: [String:[APIValue]] = [:]
    var edited: (String)->Void = { _ in }
    var body: some View {
        ForEach(APISecondaryLayout.groups(fields)) { group in
            Section {
                ForEach(group.fields) { field in
                    APISecondaryField(field:field,value:Binding(get:{value[field.id]},set:{value[field.id]=$0;edited(field.id)}),options:options)
                }
            } header: { Label(group.title,systemImage:group.symbol) }
        }
    }
}
struct APISecondaryField: View {
    let field: APIField
    @Binding var value: APIValue
    var options: [String:[APIValue]]
    @State private var selecting=false
    private var choices: [APIChoice] {
        field.kind == .choice ? field.choices : (options[field.reference ?? ""] ?? []).map { APIChoice(id:$0.id,title:APIDomainLogic.referenceLabel($0,kind:field.reference ?? "")) }
    }
    var body: some View {
        Group {
            if [.choice,.reference].contains(field.kind),choices.count>8 {
                Button { selecting=true } label: {
                    HStack { Text(field.title).foregroundStyle(.primary);Spacer();Text(choices.first{$0.id==value.string}?.title ?? (value.string.isEmpty ? "Vybrat" : "Uložená vazba")).foregroundStyle(.secondary).lineLimit(2);Image(systemName:"chevron.up.chevron.down").font(.caption).foregroundStyle(DiaryStyle.accent) }.frame(minHeight:44)
                }.accessibilityIdentifier("api-field-"+field.id)
            } else if field.kind == .notes {
                VStack(alignment:.leading,spacing:6) {
                    Text(field.title+(field.required ? " *":"")).font(.caption).foregroundStyle(.secondary)
                    TextField(field.title,text:Binding(get:{value.string},set:{value = .s($0)}),axis:.vertical).lineLimit(2...5).frame(minHeight:44).accessibilityIdentifier("api-field-"+field.id)
                }
            } else { APIFieldEditor(field:field,value:$value,options:options) }
        }.environment(\.locale,Locale(identifier:"cs_CZ"))
            .sheet(isPresented:$selecting) {
                APISecondaryChoiceSheet(title:field.title,choices:choices,required:field.required,value:Binding(get:{value.string},set:{value = .s($0)}))
            }
    }
}
struct APISecondaryChoiceSheet: View {
    let title: String
    let choices: [APIChoice]
    let required: Bool
    @Binding var value: String
    @State private var query=""
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                if !required && query.isEmpty { Button("Bez výběru"){value="";dismiss()} }
                ForEach(APISecondaryLayout.matching(choices,query:query)) { choice in
                    Button { value=choice.id;dismiss() } label: {
                        HStack { Text(choice.title).foregroundStyle(.primary);Spacer();if choice.id==value {Image(systemName:"checkmark").foregroundStyle(DiaryStyle.accent)} }.frame(minHeight:44)
                    }
                }
                if APISecondaryLayout.matching(choices,query:query).isEmpty { ContentUnavailableView.search(text:query) }
            }.searchable(text:$query,placement:.navigationBarDrawer(displayMode:.always),prompt:"Hledat v seznamu")
                .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.cancellationAction){Button("Zrušit"){dismiss()}} }
        }.sensoryFeedback(.selection,trigger:value)
    }
}
struct APISecondarySection<Content: View>: View {
    let title: String
    let symbol: String
    let content: Content
    init(title:String,symbol:String,@ViewBuilder content:()->Content){self.title=title;self.symbol=symbol;self.content=content()}
    var body: some View {
        VStack(alignment:.leading,spacing:10) {
            Label(title,systemImage:symbol).font(.subheadline.weight(.semibold)).foregroundStyle(DiaryStyle.accent)
            content
        }.padding(14).frame(maxWidth:.infinity,alignment:.leading).background(DiaryStyle.surface,in:RoundedRectangle(cornerRadius:20))
    }
}
struct APISecondaryReadFields: View {
    let value: APIValue
    let fields: [APIField]
    var body: some View {
        VStack(alignment:.leading,spacing:10) {
            ForEach(fields) { field in
                let v=value[field.id]
                if !v.isNull && (!v.string.isEmpty || !v.array.isEmpty || !v.object.isEmpty) {
                    if [.array,.object].contains(field.kind) {
                        DisclosureGroup(field.title) { APIReadFields(value:value,fields:[field]).padding(.vertical,8) }
                    } else if field.kind == .notes {
                        VStack(alignment:.leading,spacing:4){Text(field.title).font(.caption).foregroundStyle(.secondary);Text(v.string).textSelection(.enabled)}
                    } else {
                        LabeledContent {
                            if field.kind == .toggle { Image(systemName:v.bool ? "checkmark.circle.fill":"minus.circle").foregroundStyle(v.bool ? DiaryStyle.accent:Color.secondary).accessibilityLabel(v.bool ? "Ano":"Ne") }
                            else { Text(field.kind == .money ? APIFormat.money(v,currency:value["currency"].string) : field.id=="status" ? APIFormat.status(v.string) : v.string).multilineTextAlignment(.trailing).textSelection(.enabled) }
                        } label: { Text(field.title).foregroundStyle(.secondary) }
                    }
                }
            }
        }.font(.subheadline)
    }
}
enum APIAppearance: String, CaseIterable, Identifiable {
    case system,light,dark
    var id:String{rawValue}
    var title:String{self == .system ? "Podle systému" : self == .light ? "Světlý" : "Tmavý"}
    var scheme:ColorScheme?{self == .system ? nil : self == .light ? .light:.dark}
}
struct APIAppAppearance: ViewModifier {
    @AppStorage("diary-interface-appearance") private var preference="system"
    func body(content:Content)->some View {
        #if DEBUG
        content.preferredColorScheme(ProcessInfo.processInfo.arguments.contains("--native-ui-dark-testing") ? .dark : (APIAppearance(rawValue:preference) ?? .system).scheme)
        #else
        content.preferredColorScheme((APIAppearance(rawValue:preference) ?? .system).scheme)
        #endif
    }
}
