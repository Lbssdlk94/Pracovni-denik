import SwiftUI

enum WatchStyle {
    static let accent = Color(red:0.45,green:0.84,blue:0.67)
    static let warning = Color(red:1,green:0.72,blue:0.4)
    static func symbol(_ state: String) -> String {
        ["planned":"calendar", "on_way":"location.north", "in_progress":"play.circle", "incomplete":"exclamationmark.circle", "done":"checkmark.circle"][state] ?? "circle"
    }
}
struct WatchVisitSummary: View {
    let job: WatchJob
    var body: some View {
        VStack(alignment:.leading,spacing:6) {
            Text(job.compactTime).font(.headline.monospacedDigit()).foregroundStyle(WatchStyle.accent)
            Text(job.customerName).font(.headline).fixedSize(horizontal:false,vertical:true)
            if !job.gardenName.isEmpty { Text(job.gardenName).font(.caption2).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true) }
            Label(job.stateLabel,systemImage:WatchStyle.symbol(job.status)).font(.caption).foregroundStyle(job.status == "incomplete" ? WatchStyle.warning : Color.secondary)
        }.padding(.vertical,5).accessibilityElement(children:.combine)
    }
}
private enum WatchRoute: Hashable { case job(String), inbox }
struct WatchDayView: View {
    @ObservedObject var store: WatchStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var path: [WatchRoute]
    @State private var showOptions = false
    @MainActor init(store: WatchStore) {
        self.store = store
        var initial: [WatchRoute] = []
        if store.preview {
            let args = ProcessInfo.processInfo.arguments
            if args.contains("--watch-preview-detail"), let id = store.snapshot?.jobs.first?.id { initial = [.job(id)] }
            else if args.contains("--watch-preview-inbox") { initial = [.inbox] }
        }
        _path = State(initialValue: initial)
    }
    var body: some View {
        NavigationStack(path: $path) {
            TimelineView(.periodic(from:.now,by:1)) { timeline in
                List {
                    if let snapshot = store.visible(at:timeline.date) { content(snapshot) }
                    else {
                        Section {
                            Image(systemName:"applewatch").font(.largeTitle).foregroundStyle(WatchStyle.accent)
                            Text("Spojit s iPhonem").font(.headline)
                            Text(store.problem ?? "Otevřete Pracovní deník na iPhonu. Hodinky zobrazí vaše dnešní přidělené návštěvy.").font(.footnote)
                            Button("Obnovit") { Task { await store.refresh() } }.disabled(store.busy)
                        }
                    }
                    if let message = store.message { Section { Text(message).font(.footnote).foregroundStyle(WatchStyle.accent) } }
                    if store.busy { ProgressView("Ověřuji…") }
                }
            }.navigationTitle("Dnes")
                .toolbar {
                    ToolbarItem(placement:.topBarTrailing) {
                        Button { showOptions = true } label: { Image(systemName:"ellipsis").foregroundStyle(.white) }
                            .tint(Color(white:0.2)).accessibilityLabel("Možnosti deníku").disabled(store.busy)
                    }
                }
                .navigationDestination(for: WatchRoute.self) { route in
                    switch route {
                    case .job(let id): WatchJobView(store:store,id:id)
                    case .inbox: WatchInboxView(store:store)
                    }
                }
        }.tint(WatchStyle.accent)
            .confirmationDialog("Možnosti deníku",isPresented:$showOptions,titleVisibility:.visible) {
                Button("Obnovit zakázky") { Task { await store.refresh() } }
                if store.visible()?.notificationsEnabled == true { Button("Upozornění") { path.append(.inbox) } }
                Button("Zrušit",role:.cancel) {}
            }
            .task {
                if !store.preview { await store.resume() }
                while !Task.isCancelled {
                    do { try await Task.sleep(for:.seconds(30));try Task.checkCancellation() } catch { break }
                    if scenePhase == .active { await store.refresh() }
                }
            }
            .onChange(of:scenePhase) { _,phase in if phase == .active { Task { await store.resume() } } else { store.pause() } }
    }
    @ViewBuilder private func content(_ snapshot: WatchSnapshot) -> some View {
        if snapshot.jobsEnabled {
            Section(snapshot.companyName) {
                if snapshot.jobs.isEmpty { Text("Na dnešek nemáte přiřazené návštěvy.").font(.footnote) }
                ForEach(snapshot.jobs) { job in
                    NavigationLink(value: WatchRoute.job(job.id)) { WatchVisitSummary(job:job) }
                        .accessibilityIdentifier("watch-job-"+job.id)
                }
                if snapshot.hasMoreJobs { Text("Další návštěvy najdete v iPhonu.").font(.footnote) }
            }
        } else { Section { Text("Pohled Můj den je ve firmě vypnutý.").font(.footnote) } }
        if snapshot.notificationsEnabled {
            Section { NavigationLink(value: WatchRoute.inbox) { Label("Upozornění · \(snapshot.unread)",systemImage:"bell") } }
        }
        Section { Text(snapshot.userName).font(.caption2).foregroundStyle(.secondary) }.listRowBackground(Color.clear)
    }
}
struct WatchJobView: View {
    @ObservedObject var store: WatchStore
    let id: String
    @State private var confirmDone = false
    @State private var pendingCompletion: WatchJob?
    @State private var showArrival = false
    var body: some View {
        TimelineView(.periodic(from:.now,by:1)) { timeline in
            List {
                if let snapshot = store.visible(at:timeline.date), let job = snapshot.jobs.first(where:{$0.id == id}) {
                    Section {
                        VStack(alignment:.leading,spacing:7) {
                            Text(job.customerName).font(.headline).fixedSize(horizontal:false,vertical:true)
                            Text(job.title).font(.footnote).foregroundStyle(.secondary)
                            Label(job.stateLabel,systemImage:WatchStyle.symbol(job.status)).font(.subheadline).foregroundStyle(job.status == "incomplete" ? WatchStyle.warning : WatchStyle.accent)
                            Text([job.kindLabel,job.disciplineLabel].filter{!$0.isEmpty}.joined(separator:" · ")).font(.caption)
                        }.padding(.vertical,4)
                    }
                    Section("Termín a místo") {
                        Label(job.workLabel,systemImage:"clock").font(.footnote)
                        if !job.arrivalStart.isEmpty { Text("Příjezd \(job.arrivalStart)" + (job.arrivalEnd.isEmpty ? "" : "–\(job.arrivalEnd)")).font(.footnote) }
                        if !job.originalStart.isEmpty { Text("Původní čas \(job.originalStart)").font(.caption).foregroundStyle(.secondary) }
                        if !job.arrivalTime.isEmpty { Text("Očekávaný příjezd \(job.arrivalTime)").font(.footnote) }
                        if !job.gardenName.isEmpty { Text(job.gardenName).font(.footnote) }
                        if !job.address.isEmpty { Label(job.address,systemImage:"mappin").font(.footnote).fixedSize(horizontal:false,vertical:true) }
                        if let url = job.navigationURL { Link(destination:url) { Label("Navigovat",systemImage:"location") } }
                    }
                    Section("Práce") {
                        if job.canAccept { Button { Task { await store.perform(.accept,job:job) } } label: { Label("Převzít zakázku",systemImage:"checkmark.circle") } }
                        else if job.handoffStatus == "accepted" { Label("Převzato",systemImage:"checkmark.circle").font(.footnote) }
                        if job.canDepart { Button { showArrival = true } label: { Label("Jsem na cestě",systemImage:"location.north") } }
                        if job.canStart { Button { Task { await store.perform(.start,job:job) } } label: { Label("Zahájit práci",systemImage:"play.fill") } }
                        if job.canComplete {
                            if job.requiresProtocol { Button("Dokončit na iPhonu") { Task { await store.perform(.openPhone,job:job) } } }
                            else { Button { pendingCompletion = job; confirmDone = true } label: { Label("Hotovo",systemImage:"checkmark") }.accessibilityIdentifier("watch-complete") }
                        }
                        if job.status == "incomplete" { Text(job.incompleteReason).foregroundStyle(WatchStyle.warning).font(.footnote) }
                        if job.status == "done" { Text(["ready":"Protokol hotový","draft":"Protokol rozpracovaný","missing":"Protokol chybí"][job.protocolStatus] ?? "Protokol chybí").font(.footnote) }
                    }.disabled(store.busy || store.preview)
                    if let message = store.message { Text(message).font(.footnote).foregroundStyle(WatchStyle.accent) }
                } else {
                    Text(store.problem ?? "Návštěva není dostupná. Obnovte přehled.").font(.footnote)
                    Button("Obnovit") { Task { await store.refresh() } }.disabled(store.busy)
                }
                if store.busy { ProgressView("Ukládám…") }
            }
        }.navigationTitle("Zakázka")
            .confirmationDialog("Označit zakázku jako hotovou?",isPresented:$confirmDone,titleVisibility:.visible) {
                Button("Potvrdit dokončení") { if let job = pendingCompletion { Task { await store.perform(.complete,job:job) } } }
                Button("Zrušit",role:.cancel) {}
            } message: { Text("Závady tím nebudou vyřešené. Protokol můžete doplnit na iPhonu.") }
            .sheet(isPresented:$showArrival) { if let job = store.visible()?.jobs.first(where:{$0.id == id}) { WatchArrivalView(store:store,job:job) } }
    }
}
struct WatchArrivalView: View {
    @ObservedObject var store: WatchStore
    let job: WatchJob
    @Environment(\.dismiss) private var dismiss
    @State private var hour = 12
    @State private var minute = 0
    @State private var seeded = false
    private var exactTime: String { String(format:"%02d:%02d",hour,minute) }
    var body: some View {
        NavigationStack {
            ScrollView { VStack(spacing:6) {
                Text("Příjezd dnes v \(exactTime)").font(.headline)
                HStack {
                    Picker("Hodina",selection:$hour) { ForEach(0..<24,id:\.self){ Text(String(format:"%02d",$0)).tag($0) } }
                    Picker("Minuta",selection:$minute) { ForEach(0..<60,id:\.self){ Text(String(format:"%02d",$0)).tag($0) } }
                }.frame(height:85)
                Text("Čas v místě zakázky").font(.caption2).foregroundStyle(.secondary)
                Button("Potvrdit odjezd") { let value = exactTime;dismiss();Task { await store.perform(.depart,job:job,arrivalTime:value) } }.disabled(store.busy || store.preview)
            }.padding(.horizontal,6) }.navigationTitle("Na cestě")
        }.onAppear {
            guard !seeded else { return };seeded = true
            var calendar = Calendar(identifier:.gregorian);calendar.timeZone = TimeZone(identifier:"Europe/Prague")!
            let suggested = Date().addingTimeInterval(1800);hour = calendar.component(.hour,from:suggested);minute = calendar.component(.minute,from:suggested)
        }
    }
}
struct WatchInboxView: View {
    @ObservedObject var store: WatchStore
    var body: some View {
        TimelineView(.periodic(from:.now,by:1)) { timeline in
            List {
                if let snapshot = store.visible(at:timeline.date), snapshot.notificationsEnabled {
                    if snapshot.notices.isEmpty { Text("Nemáte žádná upozornění.") }
                    ForEach(snapshot.notices) { notice in
                        NavigationLink {
                            ScrollView { VStack(alignment:.leading,spacing:12) { Text(notice.title).font(.headline);Text(notice.body).font(.footnote);Text(Date(timeIntervalSince1970:notice.createdAt/1000),style:.relative).font(.caption).foregroundStyle(.secondary) }.padding(.horizontal,8) }.navigationTitle("Upozornění")
                        } label: { VStack(alignment:.leading,spacing:4) { Text(notice.title).font(.headline);if !notice.read { Text("Nové").font(.caption).foregroundStyle(WatchStyle.accent) } } }
                    }
                    Text("Systémová oznámení se zrcadlí z iPhonu podle nastavení Apple Watch.").font(.caption2).foregroundStyle(.secondary)
                } else { Text(store.problem ?? "Obnovte spojení s iPhonem.").font(.footnote) }
            }
        }.navigationTitle("Upozornění")
    }
}
