import SwiftUI

// Same approved green identity, with native controls and semantic text sizing.
enum DiaryStyle {
    static let accent = Color("DiaryAccent")
    static let background = Color("DiaryBackground")
    static let soft = Color("DiarySoft")
}
struct DiaryBadge: View {
    let text: String
    var warning = false
    var body: some View {
        Text(text).font(.caption.weight(.semibold)).foregroundStyle(warning ? Color.orange : DiaryStyle.accent)
            .padding(.horizontal, 10).padding(.vertical, 7).background(warning ? Color.orange.opacity(0.12) : DiaryStyle.soft, in: Capsule())
    }
}
struct DiaryTile: View {
    let title: String; let subtitle: String; let symbol: String; let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: symbol).font(.title2).frame(width: 48, height: 48).background(DiaryStyle.soft, in: RoundedRectangle(cornerRadius: 16))
                VStack(alignment: .leading, spacing: 5) { Text(title).font(.headline); Text(subtitle).font(.subheadline).foregroundStyle(.secondary) }
                Spacer(minLength: 0); Image(systemName: "chevron.right").font(.caption.weight(.semibold))
            }.foregroundStyle(DiaryStyle.accent).padding(16).frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
                .background(.background, in: RoundedRectangle(cornerRadius: 24)).overlay(RoundedRectangle(cornerRadius: 24).stroke(DiaryStyle.accent.opacity(0.09)))
        }.buttonStyle(.plain)
    }
}
struct NativeDiaryTabs: View {
    @ObservedObject var store: NativeDiaryStore
    let context: DiaryContext
    var body: some View {
        TabView(selection: $store.tab) {
            NavigationStack { NativeOverview(store: store, context: context) }.tabItem { Label("Přehled", systemImage: "square.grid.2x2") }.tag(0)
            if context.nativeJobsAvailable {
                NavigationStack { NativeJobs(store: store, context: context) }.tabItem { Label("Zakázky", systemImage: "list.clipboard") }.tag(1)
            }
            NavigationStack { NativeMore(store: store, context: context) }.tabItem { Label("Více", systemImage: "ellipsis") }.tag(2)
        }.tint(DiaryStyle.accent)
    }
}
struct NativeHeaderActions: ToolbarContent {
    @ObservedObject var store: NativeDiaryStore
    let context: DiaryContext
    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            if context.enabled("notifications") {
                Button { Task { await store.openWeb(page: "notifications") } } label: { Image(systemName: "bell") }.accessibilityLabel("Upozornění").frame(minWidth: 44, minHeight: 44)
            }
        }
    }
}
struct NativeOverview: View {
    @ObservedObject var store: NativeDiaryStore
    let context: DiaryContext
    var next: DiaryJob? { store.overview?.jobs.first(where: \.active) ?? store.overview?.nextJob }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 16) {
                    Image("DiaryMark").resizable().scaledToFit().frame(width: 62, height: 62).clipShape(RoundedRectangle(cornerRadius: 18))
                    VStack(alignment: .leading, spacing: 4) { Text("Pracovní deník").font(.largeTitle.bold()); Text("Vše pro dnešní práci.").foregroundStyle(.secondary) }
                }.padding(.vertical, 12)
                if let discipline = context.workspace?.selectedDiscipline {
                    DiaryBadge(text: ["irrigation":"Závlaha", "garden":"Garden", "all":"Oba obory"][discipline] ?? discipline)
                }
                if context.enabled("attendance") {
                    DiaryTile(title: "Docházka", subtitle: "Příchod, odchod a pracovní dny", symbol: "clock") { Task { await store.openWeb(page: "attendance") } }
                }
                if context.enabled("jobs") && context.enabled("jobDay") {
                    let count = store.overview?.jobs.filter(\.active).count ?? 0
                    DiaryTile(title: "Dnešní návštěvy", subtitle: "\(count) aktivních" + (store.overview?.nextCursor == nil ? "" : "+"), symbol: "calendar") { store.allDates = false; store.day = context.today; store.tab = 1 }
                }
                if context.nativeJobsAvailable {
                    DiaryTile(title: "Zakázky", subtitle: "Přehled a plánování práce", symbol: "list.clipboard") { store.tab = 1 }
                } else if context.enabled("jobs") {
                    DiaryTile(title: "Zakázky", subtitle: "Další pohledy zakázek", symbol: "calendar") { Task { await store.openWeb(page: "jobs") } }
                }
                if context.enabled("customers") {
                    DiaryTile(title: "Zákazníci", subtitle: "Kontakty a jejich zahrady", symbol: "person.crop.rectangle") { Task { await store.openWeb(page: "customers") } }
                }
                if let next {
                    Text("Další návštěva").font(.title3.bold()).padding(.top, 8)
                    NavigationLink { NativeJobDetail(store: store, id: next.id) } label: { NativeJobCard(job: next) }.buttonStyle(.plain)
                } else if context.enabled("jobs") && context.enabled("jobDay") && !store.loading {
                    Text("Na dnešek ani další dny není naplánovaná aktivní návštěva.").font(.callout).foregroundStyle(.secondary)
                }
                if store.loading { ProgressView().frame(maxWidth: .infinity) }
                Text(context.today).font(.footnote).foregroundStyle(.secondary)
            }.padding(20)
        }.background(DiaryStyle.background).navigationTitle(context.companyName).navigationBarTitleDisplayMode(.inline)
            .toolbar { NativeHeaderActions(store: store, context: context) }
            .refreshable { await store.activate() }
    }
}
struct NativeJobCard: View {
    let job: DiaryJob
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { DiaryBadge(text: job.stateLabel, warning: job.status == "incomplete"); Spacer(minLength: 4); Text(job.kindLabel).font(.caption).foregroundStyle(.secondary) }
            Text(job.customerLabel).font(.headline).foregroundStyle(DiaryStyle.accent).frame(maxWidth: .infinity, alignment: .leading)
            if job.title != job.customerLabel { Text(job.title).font(.subheadline).foregroundStyle(.secondary) }
            Text([job.dueDate, job.compactTime].filter { !$0.isEmpty }.joined(separator: " · ")).font(.subheadline.weight(.semibold))
            if !job.gardenName.isEmpty { Text(job.gardenName).font(.subheadline) }
            if !job.address.isEmpty { Label(job.address, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(.secondary) }
            if !job.assignedName.isEmpty { Label(job.assignedName, systemImage: "person").font(.footnote).foregroundStyle(.secondary) }
            if let label = job.disciplineLabel { Text(label).font(.caption).foregroundStyle(.secondary) }
            if job.status == "done" { DiaryBadge(text: job.protocolLabel, warning: job.protocolStatus != "ready") }
            if job.status == "incomplete" { Text("Důvod: \(job.incompleteReason)").font(.callout).foregroundStyle(.orange) }
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(.background, in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(DiaryStyle.accent.opacity(0.08))).foregroundStyle(.primary)
    }
}
struct NativeJobs: View {
    @ObservedObject var store: NativeDiaryStore
    let context: DiaryContext
    var filterKey: String { [store.day,store.query,store.state,String(store.mine),String(store.allDates),context.identityKey].joined(separator: "|") }
    var body: some View {
        List {
            Section {
                if context.enabled("jobDay") && context.enabled("jobList") {
                    Picker("Období", selection: $store.allDates) { Text("Vybraný den").tag(false); Text("Všechny termíny").tag(true) }.pickerStyle(.segmented)
                }
                if !store.allDates && context.enabled("jobDay") {
                    DatePicker("Den návštěv", selection: Binding(get: { Self.date(store.day) }, set: { store.day = Self.day($0) }), displayedComponents: .date).environment(\.locale, Locale(identifier: "cs_CZ")).environment(\.timeZone, TimeZone(identifier: "Europe/Prague")!)
                }
                if context.permissions.manage { Toggle("Pouze moje zakázky", isOn: $store.mine).tint(DiaryStyle.accent) }
                Picker("Stav", selection: $store.state) {
                    Text("Všechny").tag("all"); Text("Naplánováno").tag("planned"); Text("Na cestě").tag("on_way"); Text("Probíhá").tag("in_progress"); Text("Nedokončeno").tag("incomplete"); Text("Hotovo").tag("done")
                }
            }
            Section {
                ForEach(store.jobs) { job in
                    NavigationLink { NativeJobDetail(store: store, id: job.id) } label: { NativeJobCard(job: job) }
                        .listRowBackground(Color.clear).listRowSeparator(.hidden).listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                }
                if store.loading { ProgressView("Načítám zakázky…") }
                else if store.jobs.isEmpty { ContentUnavailableView("Žádné zakázky", systemImage: "calendar", description: Text("Zkuste jiný den nebo upravte filtry.")) }
                if store.nextCursor != nil { Button("Načíst další zakázky") { Task { await store.reloadJobs(more: true) } }.frame(minHeight: 44) }
            }
        }.listStyle(.insetGrouped).scrollContentBackground(.hidden).background(DiaryStyle.background)
            .navigationTitle("Zakázky").searchable(text: $store.query, prompt: "Zákazník, práce nebo adresa")
            .toolbar {
                NativeHeaderActions(store: store, context: context)
                ToolbarItem(placement: .topBarLeading) { Button("Další pohledy") { Task { await store.openWeb(page: "jobs") } } }
            }
            .task(id: filterKey) {
                do { try await Task.sleep(for: .milliseconds(300)); try Task.checkCancellation(); await store.reloadJobs() } catch {}
            }
            .refreshable { await store.activate(); await store.reloadJobs() }
    }
    static func date(_ value: String) -> Date {
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.timeZone = TimeZone(identifier: "Europe/Prague"); return formatter.date(from: value) ?? Date()
    }
    static func day(_ value: Date) -> String {
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd"; formatter.timeZone = TimeZone(identifier: "Europe/Prague"); return formatter.string(from: value)
    }
}
struct NativeJobDetail: View {
    @ObservedObject var store: NativeDiaryStore
    let id: String
    @State private var detail: DiaryJobDetail?
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let detail {
                    let job = detail.job
                    Text(job.customerLabel).font(.largeTitle.bold()).foregroundStyle(DiaryStyle.accent)
                    if !job.gardenName.isEmpty { Text(job.gardenName).font(.title3).foregroundStyle(.secondary) }
                    if job.title != job.customerLabel { Text(job.title).font(.title2.bold()) }
                    HStack { DiaryBadge(text: job.stateLabel, warning: job.status == "incomplete"); DiaryBadge(text: job.kindLabel) }
                    if let label = job.disciplineLabel { Text(label).font(.subheadline).foregroundStyle(.secondary) }
                    if !job.dueDate.isEmpty { Label(job.dueDate, systemImage: "calendar") }
                    Label(job.workTime, systemImage: "clock")
                    if let arrival = job.arrivalWindow { Text(arrival).font(.callout).foregroundStyle(.secondary) }
                    if let original = job.originalTime { Text(original).font(.callout).foregroundStyle(.secondary) }
                    if !job.arrivalTime.isEmpty && job.status == "on_way" { Text("Předpokládaný příjezd: \(job.arrivalTime)").font(.headline) }
                    if !job.assignedName.isEmpty { Label(job.assignedName, systemImage: "person") }
                    if !job.address.isEmpty { Label(job.address, systemImage: "mappin.and.ellipse") }
                    if job.status == "done" { DiaryBadge(text: job.protocolLabel, warning: job.protocolStatus != "ready") }
                    if job.status == "incomplete" { Label(job.incompleteReason, systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
                    if !detail.defects.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Label("Otevřené závady: \(detail.defects.count)", systemImage: "exclamationmark.triangle.fill").font(.headline)
                            ForEach(detail.defects) { defect in
                                VStack(alignment: .leading) { Text(defect.title).font(.headline); Text("\(defect.discoveredOn) · \(defect.priorityLabel) · \(defect.stateLabel)").font(.caption) }
                            }
                            action("Otevřít závady", symbol: "arrow.up.right", job: job, kind: "defects")
                        }.padding().background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 18))
                    }
                    if let url = job.navigationURL { Link(destination: url) { Label("Navigovat", systemImage: "location").frame(maxWidth: .infinity, minHeight: 44) }.buttonStyle(.bordered) }
                    if store.context?.enabled("jobTravel") != false && job.active { action("Jsem na cestě", symbol: "location.north", job: job, kind: "depart") }
                    action("Změnit stav", symbol: "checkmark.circle", job: job, kind: "status")
                    action("Servisní protokol", symbol: "doc.text", job: job, kind: "protocol")
                    if store.context?.enabled("googleDrive") != false && store.context?.enabled("drivePhotos") != false { action("Fotodokumentace", symbol: "camera", job: job, kind: "photos") }
                    if !job.description.isEmpty { Text("Zadání práce").font(.headline); Text(job.description) }
                    if !job.gardenNotes.isEmpty { Text("Poznámky k zahradě").font(.headline); Text(job.gardenNotes) }
                    action("Úplný detail a další akce", symbol: "arrow.up.right.square", job: job, kind: "detail")
                } else if let error { ContentUnavailableView("Zakázku nelze načíst", systemImage: "wifi.exclamationmark", description: Text(error)) }
                else { ProgressView("Načítám zakázku…") }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
        }.background(DiaryStyle.background).navigationTitle("Detail zakázky").navigationBarTitleDisplayMode(.inline)
            .task { await load() }.refreshable { await load() }
    }
    func action(_ title: String, symbol: String, job: DiaryJob, kind: String) -> some View {
        Button { Task { await store.openWeb(job: job.id, action: kind) } } label: { Label(title, systemImage: symbol).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading) }.buttonStyle(.bordered)
    }
    func load() async {
        do { detail = try await store.detail(id); error = nil }
        catch { detail = nil; self.error = error.localizedDescription; store.invalidate(); store.error = error.localizedDescription }
    }
}
struct NativeMore: View {
    @ObservedObject var store: NativeDiaryStore
    let context: DiaryContext
    private var sections: [(String,String,String)] {
        var items: [(String,String,String)] = [("customers","Zákazníci","person.crop.rectangle"),("home","Zahrady","leaf"),("attendance","Docházka","clock"),("defects","Závady","exclamationmark.triangle"),("subscriptions","Předplatné","checkmark.seal"),("vehicles","Vozidla","car"),("settings","Nastavení","gearshape")]
        if context.permissions.manage { items.append(("team","Náš tým","person.2")) }
        if context.user.role == "owner" { items.append(("materials","Materiál","shippingbox")) }
        return items.filter { key,_,_ in (key == "home" ? context.enabled("gardens") || context.enabled("shafts") : context.enabled(["team":"teamManagement"][key] ?? key)) }
    }
    var body: some View {
        List {
            Section(context.user.name) {
                ForEach(sections, id: \.0) { page,title,symbol in
                    Button { Task { await store.openWeb(page: page) } } label: { Label(title, systemImage: symbol).frame(minHeight: 44) }
                }
            }
            Section {
                Button("Otevřít celý deník") { Task { await store.openWeb() } }.frame(minHeight: 44)
                Text("Všechny povolené části vašeho pracovního deníku.").font(.footnote).foregroundStyle(.secondary)
            }
        }.scrollContentBackground(.hidden).background(DiaryStyle.background).navigationTitle("Více")
    }
}
