import SwiftUI

enum WatchStyle { static let accent = Color(red:0.45,green:0.84,blue:0.67) }
struct WatchDayView: View {
    @ObservedObject var store: WatchStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var showPreviewDetail = false
    @State private var showPreviewInbox = false
    var body: some View {
        NavigationStack {
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
                .toolbar { ToolbarItem(placement:.topBarTrailing) { Button { Task { await store.refresh() } } label: { Image(systemName:"arrow.clockwise") }.accessibilityLabel("Obnovit zakázky").disabled(store.busy) } }
                .navigationDestination(isPresented:$showPreviewDetail) { if let id = store.snapshot?.jobs.first?.id { WatchJobView(store:store,id:id) } }
                .navigationDestination(isPresented:$showPreviewInbox) { WatchInboxView(store:store) }
        }.tint(WatchStyle.accent)
            .task {
                if store.preview {
                    showPreviewDetail = ProcessInfo.processInfo.arguments.contains("--watch-preview-detail")
                    showPreviewInbox = ProcessInfo.processInfo.arguments.contains("--watch-preview-inbox")
                } else { await store.resume() }
                while !Task.isCancelled {
                    do { try await Task.sleep(for:.seconds(30));try Task.checkCancellation() } catch { break }
                    if scenePhase == .active { await store.refresh() }
                }
            }
            .onChange(of:scenePhase) { _,phase in if phase == .active { Task { await store.resume() } } else { store.pause() } }
    }
    @ViewBuilder private func content(_ snapshot: WatchSnapshot) -> some View {
        Section {
            VStack(alignment:.leading,spacing:3) {
                Text(snapshot.companyName).font(.caption).foregroundStyle(WatchStyle.accent)
                Text(snapshot.userName).font(.footnote).foregroundStyle(.secondary)
            }
            if snapshot.notificationsEnabled {
                NavigationLink { WatchInboxView(store:store) } label: { Label("Upozornění · \(snapshot.unread)",systemImage:"bell") }
            }
        }
        if snapshot.jobsEnabled {
            Section("Dnešní návštěvy") {
                if snapshot.jobs.isEmpty { Text("Na dnešek nemáte přiřazené návštěvy.").font(.footnote) }
                ForEach(snapshot.jobs) { job in
                    NavigationLink { WatchJobView(store:store,id:job.id) } label: {
                        VStack(alignment:.leading,spacing:5) {
                            Text(job.customerName).font(.headline).lineLimit(2)
                            Text(job.compactTime).font(.subheadline).foregroundStyle(WatchStyle.accent)
                            Text(job.stateLabel).font(.caption).foregroundStyle(job.status == "incomplete" ? .orange : .secondary)
                        }.padding(.vertical,4)
                    }.accessibilityIdentifier("watch-job-"+job.id)
                }
                if snapshot.hasMoreJobs { Text("Další návštěvy najdete v iPhonu.").font(.footnote) }
            }
        } else { Section { Text("Pohled Můj den je ve firmě vypnutý.").font(.footnote) } }
    }
}
struct WatchJobView: View {
    @ObservedObject var store: WatchStore
    let id: String
    @State private var confirmDone = false
    @State private var showArrival = false
    var body: some View {
        TimelineView(.periodic(from:.now,by:1)) { timeline in
            List {
                if let snapshot = store.visible(at:timeline.date), let job = snapshot.jobs.first(where:{$0.id == id}) {
                    Section {
                        Text(job.customerName).font(.headline)
                        Text(job.title).font(.footnote).foregroundStyle(.secondary)
                        Text(job.stateLabel).foregroundStyle(WatchStyle.accent)
                        Text([job.kindLabel,job.disciplineLabel].filter{!$0.isEmpty}.joined(separator:" · ")).font(.caption)
                    }
                    Section("Termín a místo") {
                        Text(job.workLabel).font(.footnote)
                        if !job.arrivalStart.isEmpty { Text("Příjezd \(job.arrivalStart)" + (job.arrivalEnd.isEmpty ? "" : "–\(job.arrivalEnd)")).font(.footnote) }
                        if !job.originalStart.isEmpty { Text("Původní čas \(job.originalStart)").font(.caption).foregroundStyle(.secondary) }
                        if !job.arrivalTime.isEmpty { Text("Očekávaný příjezd \(job.arrivalTime)").font(.footnote) }
                        if !job.gardenName.isEmpty { Text(job.gardenName).font(.footnote) }
                        if !job.address.isEmpty { Text(job.address).font(.footnote) }
                        if let url = job.navigationURL { Link(destination:url) { Label("Navigovat",systemImage:"location") } }
                    }
                    Section("Práce") {
                        if job.canAccept { Button("Převzít zakázku") { Task { await store.perform(.accept,job:job) } } }
                        else if job.handoffStatus == "accepted" { Label("Převzato",systemImage:"checkmark.circle").font(.footnote) }
                        if job.canDepart { Button("Jsem na cestě") { showArrival = true } }
                        if job.canStart { Button("Zahájit práci") { Task { await store.perform(.start,job:job) } } }
                        if job.canComplete {
                            if job.requiresProtocol { Button("Dokončit na iPhonu") { Task { await store.perform(.openPhone,job:job) } } }
                            else { Button("Hotovo") { confirmDone = true }.accessibilityIdentifier("watch-complete") }
                        }
                        if job.status == "incomplete" { Text(job.incompleteReason).foregroundStyle(.orange).font(.footnote) }
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
                Button("Potvrdit dokončení") { if let job = store.visible()?.jobs.first(where:{$0.id == id}) { Task { await store.perform(.complete,job:job) } } }
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
    private var exactTime: String { String(format:"%02d:%02d",hour,minute) }
    var body: some View {
        NavigationStack {
            VStack(spacing:6) {
                Text("Příjezd dnes v \(exactTime)").font(.headline)
                HStack {
                    Picker("Hodina",selection:$hour) { ForEach(0..<24,id:\.self){ Text(String(format:"%02d",$0)).tag($0) } }
                    Picker("Minuta",selection:$minute) { ForEach(0..<60,id:\.self){ Text(String(format:"%02d",$0)).tag($0) } }
                }.frame(height:85)
                Text("Čas v místě zakázky").font(.caption2).foregroundStyle(.secondary)
                Button("Potvrdit odjezd") { let value = exactTime;dismiss();Task { await store.perform(.depart,job:job,arrivalTime:value) } }.disabled(store.busy || store.preview)
            }.navigationTitle("Na cestě").padding(.horizontal,6)
        }.onAppear {
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
