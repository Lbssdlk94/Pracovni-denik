import SwiftUI

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
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            if !typeSize.isAccessibilitySize {
                VStack(spacing: 5) {
                    Image(systemName: job.status == "done" ? "checkmark.circle.fill" : job.status == "incomplete" ? "exclamationmark.circle.fill" : "clock")
                        .foregroundStyle(job.status == "incomplete" ? Color.orange : DiaryStyle.accent)
                    Text(job.plannedStart.isEmpty ? "—" : job.plannedStart).font(.headline.monospacedDigit())
                }.frame(width: 58).padding(.vertical, 12).background(DiaryStyle.soft, in: RoundedRectangle(cornerRadius: 16))
            }
            VStack(alignment: .leading, spacing: 7) {
                Text(job.customerLabel).font(.headline).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
                if job.title != job.customerLabel { Text(job.title).font(.subheadline).foregroundStyle(.secondary).lineLimit(2) }
                HStack(spacing: 7) {
                    Text(job.stateLabel).font(.caption.weight(.semibold)).foregroundStyle(job.status == "incomplete" ? Color.orange : DiaryStyle.accent)
                    Text("· \(job.kindLabel)").font(.caption).foregroundStyle(.secondary)
                }
                if !job.gardenName.isEmpty { Text(job.gardenName).font(.caption.weight(.medium)).foregroundStyle(.secondary).lineLimit(2) }
                if !job.address.isEmpty { Label(job.address, systemImage: "mappin").font(.subheadline).foregroundStyle(.secondary).lineLimit(2) }
                Text([DiaryDate.localized(job.dueDate), job.compactTime].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                if !job.assignedName.isEmpty { Label(job.assignedName, systemImage: "person").font(.caption).foregroundStyle(.secondary) }
                if job.status == "done" { DiaryBadge(text: job.protocolLabel, warning: job.protocolStatus != "ready") }
                if job.status == "incomplete" { Text("Důvod: \(job.incompleteReason)").font(.callout).foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true) }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.padding(16).background(DiaryStyle.surface, in: RoundedRectangle(cornerRadius: 22))
            .accessibilityElement(children: .combine)
    }
}
struct NativeJobs: View {
    @ObservedObject var store: NativeDiaryStore
    let context: DiaryContext
    @State private var filters = false
    @State private var calendar = false
    var filterKey: String { [store.day,store.query,store.state,String(store.mine),String(store.allDates),context.identityKey].joined(separator: "|") }
    var filterCount: Int { (store.state == "all" ? 0 : 1) + (store.allDates ? 1 : 0) }
    var body: some View {
        List {
            Section {
                VStack(spacing: 12) {
                    if context.permissions.manage {
                        Picker("Tým", selection: $store.mine) { Text("Moje").tag(true); Text("Celý tým").tag(false) }.pickerStyle(.segmented)
                    }
                    if context.enabled("jobDay") {
                        HStack(spacing: 8) {
                            Button { store.day = context.today; store.allDates = false } label: { Text("Dnes").frame(minWidth: 44, minHeight: 44) }
                                .buttonStyle(.bordered).tint(store.day == context.today && !store.allDates ? DiaryStyle.accent : .secondary)
                            Button { store.day = DiaryDate.shifted(context.today, days: 1); store.allDates = false } label: { Text("Zítra").frame(minWidth: 44, minHeight: 44) }.buttonStyle(.bordered)
                            Spacer(minLength: 0)
                            Button { calendar = true } label: { Label(store.allDates ? "Všechny dny" : Self.dayLabel(store.day), systemImage: "calendar").font(.subheadline.weight(.semibold)).frame(minHeight: 44) }.accessibilityIdentifier("native-job-date")
                        }
                    }
                    if store.state != "all" || store.allDates {
                        HStack {
                            Text(store.allDates ? "Všechny termíny" : "Vybraný den").font(.caption).foregroundStyle(.secondary)
                            Spacer(); Button("Zrušit filtry") { store.state = "all"; store.allDates = !context.enabled("jobDay") }.font(.caption)
                        }
                    }
                }.padding(.vertical, 5)
            }.listRowBackground(Color.clear).listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 4, trailing: 0)).listRowSeparator(.hidden)
            Section(store.loading ? "Načítám rozpis" : "\(store.jobs.count) návštěv\(store.nextCursor == nil ? "" : "+")") {
                ForEach(store.jobs) { job in
                    NavigationLink { NativeJobDetail(store: store, id: job.id) } label: { NativeJobCard(job: job) }
                        .accessibilityIdentifier("native-job-" + job.id)
                        .listRowBackground(Color.clear).listRowSeparator(.hidden).listRowInsets(EdgeInsets(top: 5, leading: 0, bottom: 5, trailing: 0))
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if context.permissions.write { Button("Změnit stav", systemImage: "checkmark.circle") { Task { await store.openWeb(job: job.id, action: "status") } }.tint(DiaryStyle.accent) }
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: false) {
                            if context.permissions.write && job.active && context.enabled("jobTravel") { Button("Jsem na cestě", systemImage: "location.north") { Task { await store.openWeb(job: job.id, action: "depart") } }.tint(.blue) }
                        }
                }
                if store.loading { ProgressView("Načítám zakázky…").frame(maxWidth: .infinity).listRowBackground(Color.clear) }
                else if store.jobs.isEmpty { ContentUnavailableView("Žádné zakázky", systemImage: "calendar", description: Text("Na tento den tu není žádná návštěva. Vyberte jiný den nebo upravte filtry.")).listRowBackground(Color.clear) }
                if store.nextCursor != nil { Button("Načíst další zakázky") { Task { await store.reloadJobs(more: true) } }.frame(minHeight: 44) }
            }
        }.listStyle(.insetGrouped).scrollContentBackground(.hidden).background(DiaryStyle.background)
            .navigationTitle("Zakázky").searchable(text: $store.query, prompt: "Zákazník, práce nebo adresa")
            .toolbar {
                NativeHeaderActions(store: store, context: context)
                ToolbarItem(placement: .topBarTrailing) {
                    Button { filters = true } label: { Label(filterCount == 0 ? "Filtry" : "Filtry (\(filterCount))", systemImage: "line.3.horizontal.decrease") }.accessibilityIdentifier("native-job-filters")
                }
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button("Kalendář a plánování", systemImage: "calendar") { Task { await store.openWeb(page: "jobs") } }
                    } label: { Image(systemName: "calendar.badge.clock") }.accessibilityLabel("Další pohledy zakázek")
                }
            }
            .sheet(isPresented: $filters) { NativeJobFilters(store: store, context: context) }
            .sheet(isPresented: $calendar) { NativeJobDatePicker(store: store) }
            .task(id: filterKey) { do { try await Task.sleep(for: .milliseconds(300)); try Task.checkCancellation(); await store.reloadJobs() } catch {} }
            .refreshable { await store.activate(); await store.reloadJobs() }
    }
    static func date(_ value: String) -> Date {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"; formatter.timeZone = TimeZone(identifier: "Europe/Prague"); return formatter.date(from: value) ?? Date()
    }
    static func day(_ value: Date) -> String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"; formatter.timeZone = TimeZone(identifier: "Europe/Prague"); return formatter.string(from: value)
    }
    static func dayLabel(_ value: String) -> String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "cs_CZ"); formatter.timeZone = TimeZone(identifier: "Europe/Prague"); formatter.dateFormat = "d. M."; return formatter.string(from: date(value))
    }
}
private struct NativeJobFilters: View {
    @ObservedObject var store: NativeDiaryStore
    let context: DiaryContext
    @Environment(\.dismiss) private var dismiss
    @State private var state: String
    @State private var allDates: Bool
    init(store: NativeDiaryStore, context: DiaryContext) { self.store = store; self.context = context; _state = State(initialValue: store.state); _allDates = State(initialValue: store.allDates) }
    var body: some View {
        NavigationStack {
            Form {
                Section("Stav zakázky") {
                    Picker("Stav", selection: $state) {
                        Text("Všechny").tag("all"); Text("Naplánováno").tag("planned"); Text("Na cestě").tag("on_way"); Text("Probíhá").tag("in_progress"); Text("Nedokončeno").tag("incomplete"); Text("Hotovo").tag("done")
                    }
                }
                if context.enabled("jobDay") && context.enabled("jobList") { Section("Období") { Toggle("Všechny termíny", isOn: $allDates) } }
                Section { Button("Zrušit filtry") { state = "all"; allDates = !context.enabled("jobDay") } }
            }.navigationTitle("Filtry zakázek").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Použít") { store.state = state; store.allDates = allDates; dismiss() }.fontWeight(.semibold) }
                }
        }.tint(DiaryStyle.accent).presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
}
private struct NativeJobDatePicker: View {
    @ObservedObject var store: NativeDiaryStore
    @Environment(\.dismiss) private var dismiss
    @State private var day: Date
    init(store: NativeDiaryStore) { self.store = store; _day = State(initialValue: NativeJobs.date(store.day)) }
    var body: some View {
        NavigationStack {
            DatePicker("Den návštěv", selection: $day, displayedComponents: .date).datePickerStyle(.graphical).padding()
                .environment(\.locale, Locale(identifier: "cs_CZ")).environment(\.timeZone, TimeZone(identifier: "Europe/Prague")!)
                .navigationTitle("Den návštěv").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Zrušit") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Vybrat den") { store.day = NativeJobs.day(day); store.allDates = false; dismiss() } }
                }
        }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
}
struct NativeJobDetail: View {
    @ObservedObject var store: NativeDiaryStore
    let id: String
    @State private var detail: DiaryJobDetail?
    @State private var error: String?
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let detail {
                    let job = detail.job
                    VStack(alignment: .leading, spacing: 10) {
                        HStack { DiaryBadge(text: job.stateLabel, warning: job.status == "incomplete"); Spacer(); Text(job.kindLabel).font(.subheadline).foregroundStyle(.secondary) }
                        Text(job.customerLabel).font(.largeTitle.bold()).fixedSize(horizontal: false, vertical: true)
                        if job.title != job.customerLabel { Text(job.title).font(.title3).foregroundStyle(.secondary) }
                        if !job.gardenName.isEmpty { Label(job.gardenName, systemImage: "leaf").font(.subheadline).foregroundStyle(.secondary) }
                        if let label = job.disciplineLabel { Text(label).font(.caption).foregroundStyle(DiaryStyle.accent) }
                    }.padding(.vertical, 6)
                    DiarySection(title: "Návštěva", symbol: "calendar") {
                        if !job.dueDate.isEmpty { DiaryInfoRow(title: "Den", value: DiaryDate.localized(job.dueDate), symbol: "calendar") }
                        DiaryInfoRow(title: "Plán práce", value: job.workTime, symbol: "clock")
                        if let arrival = job.arrivalWindow { Divider(); DiaryInfoRow(title: "Domluvený příjezd", value: arrival, symbol: "clock.badge.checkmark") }
                        if let original = job.originalTime { DiaryStatusBanner(text: original, symbol: "clock.badge.questionmark", warning: job.legacyTimeMeaning == "unknown") }
                        if !job.arrivalTime.isEmpty && job.status == "on_way" { DiaryInfoRow(title: "Předpokládaný příjezd", value: job.arrivalTime, symbol: "location.north") }
                        if !job.assignedName.isEmpty { Divider(); DiaryInfoRow(title: "Technik", value: job.assignedName, symbol: "person") }
                    }
                    if !job.address.isEmpty {
                        DiarySection(title: "Místo zakázky", symbol: "mappin.and.ellipse") {
                            Text(job.address).font(.body).textSelection(.enabled)
                            if let url = job.navigationURL { Link(destination: url) { Label("Navigovat", systemImage: "location.fill").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading) } }
                        }
                    }
                    if !detail.defects.isEmpty {
                        DiarySection(title: "Otevřené závady: \(detail.defects.count)", symbol: "exclamationmark.triangle.fill") {
                            ForEach(detail.defects) { defect in
                                VStack(alignment: .leading, spacing: 5) { Text(defect.title).font(.headline); Text("\(defect.discoveredOn) · \(defect.priorityLabel) · \(defect.stateLabel)").font(.caption).foregroundStyle(.secondary) }
                            }
                            action("Závady a naplánování opravy", symbol: "arrow.right", job: job, kind: "defects")
                        }
                    }
                    if job.status == "incomplete" { DiaryStatusBanner(text: "Důvod: \(job.incompleteReason)", symbol: "exclamationmark.circle", warning: true) }
                    DiarySection(title: "Dokumentace", symbol: "doc.text") {
                        if job.status == "done" { DiaryBadge(text: job.protocolLabel, warning: job.protocolStatus != "ready") }
                        action("Servisní protokol", symbol: "doc.text", job: job, kind: "protocol")
                        if store.context?.enabled("googleDrive") != false && store.context?.enabled("drivePhotos") != false { action("Fotodokumentace", symbol: "photo.on.rectangle", job: job, kind: "photos") }
                    }
                    if !job.description.isEmpty { DiarySection(title: "Zadání práce", symbol: "text.alignleft") { Text(job.description).textSelection(.enabled) } }
                    if !job.gardenNotes.isEmpty { DiarySection(title: "Poznámky k zahradě", symbol: "note.text") { Text(job.gardenNotes).textSelection(.enabled) } }
                    action("Úplný detail a další možnosti", symbol: "ellipsis.circle", job: job, kind: "detail")
                } else if let error { ContentUnavailableView("Zakázku nelze načíst", systemImage: "wifi.exclamationmark", description: Text(error)) }
                else { ProgressView("Načítám zakázku…").frame(maxWidth: .infinity).padding(.top, 60) }
            }.frame(maxWidth: 760, alignment: .leading).padding(18).frame(maxWidth: .infinity)
        }.background(DiaryStyle.background).navigationTitle("Detail zakázky").navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                if let job = detail?.job, store.context?.permissions.write == true {
                    let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
                    layout {
                        if store.context?.enabled("jobTravel") != false && job.active { action("Jsem na cestě", symbol: "location.north.fill", job: job, kind: "depart", prominent: true) }
                        action("Změnit stav", symbol: "checkmark.circle", job: job, kind: "status")
                    }.padding(12).diaryGlass().padding(.horizontal, 14).padding(.bottom, 8)
                }
            }
            .task { await load() }.refreshable { await load() }
            .onChange(of: store.webVisible) { _, visible in if !visible { Task { await load() } } }
    }
    func action(_ title: String, symbol: String, job: DiaryJob, kind: String, prominent: Bool = false) -> some View {
        DiaryActionButton(title: title, symbol: symbol, prominent: prominent) { Task { await store.openWeb(job: job.id, action: kind) } }
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
        items.append(("materials","Materiál","shippingbox"))
        return items.filter { key,_,_ in (key == "home" ? context.enabled("gardens") || context.enabled("shafts") : context.enabled(["team":"teamManagement"][key] ?? key)) }
    }
    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Image(systemName: "person.crop.circle.fill").font(.system(size: 42)).foregroundStyle(DiaryStyle.accent)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.user.name).font(.headline)
                        Text(context.companyName).font(.subheadline).foregroundStyle(.secondary)
                        Text(["owner":"Vlastník", "administrator":"Administrátor", "admin":"Správce", "worker":"Pracovník", "reader":"Čtenář"][context.user.role] ?? context.user.role).font(.caption).foregroundStyle(DiaryStyle.accent)
                    }
                }.padding(.vertical, 6)
            }
            Section("Práce v terénu") { rows(["customers", "home", "attendance", "defects"]) }
            Section("Firemní agenda") { rows(["materials", "vehicles", "subscriptions", "team"]) }
            Section("Aplikace a zařízení") {
                rows(["settings"])
                if context.enabled("notifications") {
                    Button { NativePushController.shared.showSettings = true } label: { menuLabel("Upozornění na iPhonu", "bell.badge") }.accessibilityIdentifier("native-push-settings")
                }
                Button { WatchPhoneCoordinator.shared.showSettings = true } label: { menuLabel("Apple Watch", "applewatch") }.accessibilityIdentifier("native-watch-settings")
                Button { Task { await store.openWeb() } } label: { menuLabel("Všechny funkce deníku", "rectangle.stack") }
            }
            Section {
                Text("Pracovní deník · \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")").font(.footnote).foregroundStyle(.secondary)
            }.listRowBackground(Color.clear)
        }.listStyle(.insetGrouped).scrollContentBackground(.hidden).background(DiaryStyle.background).navigationTitle("Více")
            .toolbar { NativeHeaderActions(store: store, context: context) }
    }
    private func rows(_ keys: [String]) -> some View {
        ForEach(sections.filter { keys.contains($0.0) }, id: \.0) { page, title, symbol in
            Button { Task { await store.openWeb(page: page) } } label: { menuLabel(title, symbol) }.accessibilityLabel(title)
        }
    }
    private func menuLabel(_ title: String, _ symbol: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).font(.body.weight(.medium)).foregroundStyle(DiaryStyle.accent).frame(width: 36, height: 36).background(DiaryStyle.soft, in: RoundedRectangle(cornerRadius: 11))
            Text(title).foregroundStyle(.primary)
            Spacer(minLength: 6); Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
        }.frame(minHeight: 48)
    }
}
