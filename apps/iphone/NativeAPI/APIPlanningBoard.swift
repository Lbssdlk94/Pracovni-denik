import SwiftUI

enum OfficePlanningMode: String, CaseIterable, Identifiable {
    case week = "jobWeek", day = "jobTimeline", load = "jobWorkload", table = "jobTable", backlog = "jobBacklog"
    var id: String { rawValue }
    var title: String {
        switch self { case .week: "Týden"; case .day: "Časová osa"; case .load: "Vytížení týmu"; case .table: "Tabulka"; case .backlog: "Fronta zakázek" }
    }
}

struct APIPlanningBoard: View {
    @ObservedObject var store: APIStore
    @State var mode: OfficePlanningMode
    @State private var day = Date()
    @State private var rows: [APIValue] = []
    @State private var people: [APIValue] = []
    @State private var query = ""
    @State private var loading = true
    @State private var problem = ""
    private var modes: [OfficePlanningMode] { OfficePlanningMode.allCases.filter { store.enabled($0.rawValue) && ($0 != .backlog || store.manager) } }
    private var days: [String] {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = TimeZone(identifier: "Europe/Prague")!
        let offset = (calendar.component(.weekday, from: day) + 5) % 7
        return (0..<7).map { DiaryDate.shifted(DiaryDate.iso(day), days: $0 - offset) }
    }
    private var request: URLComponents {
        var url = URLComponents()
        url.path = mode == .backlog ? "/api/jobs/backlog" : "/api/jobs"
        var parameters = ["q":query]
        if mode != .backlog { parameters["state"] = "all"; parameters["order"] = "schedule" }
        if mode == .week || mode == .load { parameters["from"] = days.first; parameters["to"] = days.last }
        if mode == .day { let key = DiaryDate.iso(day); parameters["month"] = String(key.prefix(7)); parameters["day"] = key }
        url.queryItems = parameters.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        return url
    }

    var body: some View {
        List {
            Section {
                Picker("Zobrazení", selection: $mode) { ForEach(modes) { Text($0.title).tag($0) } }
                if [.day,.week,.load].contains(mode) { DatePicker("Datum", selection: $day, displayedComponents: .date) }
            }
            if loading { ProgressView("Načítám plán…") }
            if !problem.isEmpty { Text(problem).foregroundStyle(.red) }
            if !loading && rows.isEmpty && problem.isEmpty { ContentUnavailableView("Žádné zakázky", systemImage: "calendar") }
            if mode == .week {
                ForEach(days, id: \.self) { key in
                    let visits = rows.filter { APIJobsPresentation.scheduleDates($0).contains(key) }
                    if !visits.isEmpty { Section(DiaryDate.localized(key)) { ForEach(visits, id: \.id) { jobRow($0) } } }
                }
            } else if mode == .load || mode == .day {
                let ids = Array(Set(rows.flatMap { assigned($0) } + (store.manager ? people.map(\.id) : []))).sorted()
                ForEach(ids, id: \.self) { id in
                    let visits = rows.filter { assigned($0).contains(id) }
                    Section(people.first(where: { $0.id == id })?.title ?? (id == store.userID ? store.me["user"]["name"].string : id.isEmpty ? "Bez přiřazení" : "Přiřazený kolega")) {
                        if mode == .load {
                            let total = visits.reduce(0) { sum, job in sum + job["estimatedMinutes"].int * max(1, APIJobsPresentation.scheduleDates(job).filter { days.contains($0) }.count) }
                            LabeledContent("Naplánováno", value: "\(total / 60) h \(total % 60) min")
                            if visits.contains(where: { $0["estimatedMinutes"].isNull }) { Text("Část návštěv nemá zadanou délku.").font(.caption).foregroundStyle(.secondary) }
                        }
                        ForEach(visits, id: \.id) { jobRow($0) }
                    }
                }
            } else { ForEach(rows, id: \.id) { jobRow($0) } }
        }
        .navigationTitle("Plánování").navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Zakázka nebo zákazník")
        .task(id: (request.string ?? "") + mode.rawValue) { do { try await Task.sleep(for: .milliseconds(200)); await load() } catch {} }
        .refreshable { await load() }
    }
    private func assigned(_ row: APIValue) -> [String] {
        let list = row["assignedTos"].array.map(\.string)
        return list.isEmpty ? [row["assignedTo"].string] : list
    }
    private func jobRow(_ job: APIValue) -> some View {
        NavigationLink { APIEntityDetail(store: store, resource: APIResource(entity: .jobs), initial: job) } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(job.title).font(.headline)
                Text([job["customerName"].string, job["city"].string].filter { !$0.isEmpty }.joined(separator: " · "))
                if mode == .backlog {
                    Text(job["status"].string == "incomplete" ? "Nedokončená návštěva" : job["dueDate"].string.isEmpty ? "Chybí termín" : job["planningMissingAssignee"].bool ? "Chybí přiřazení" : "Upřesnit čas nebo délku").foregroundStyle(.secondary)
                } else {
                    Text([DiaryDate.localized(job["dueDate"].string), job["plannedStart"].string, APIFormat.status(job["status"].string)].filter { !$0.isEmpty }.joined(separator: " · ")).foregroundStyle(.secondary)
                }
            }.font(.subheadline).padding(.vertical, 2)
        }
    }
    private func load() async {
        let base = request
        loading = true
        do {
            var collected: [APIValue] = [], seen = Set<String>(), cursor = ""
            repeat {
                var page = base
                if !cursor.isEmpty { page.queryItems?.append(URLQueryItem(name: "cursor", value: cursor)) }
                let result = try await store.get(page.string!, refresh: true)
                try Task.checkCancellation()
                collected.append(contentsOf: result["jobs"].array)
                cursor = result["nextCursor"].string
                if !cursor.isEmpty && !seen.insert(cursor).inserted { throw APIError.local("Seznam se mezitím změnil. Obnovte plán.") }
            } while !cursor.isEmpty
            if store.manager && [.load,.day].contains(mode) { people = try await store.get("/api/jobs/people", refresh: true)["people"].array }
            try Task.checkCancellation()
            rows = collected
            problem = ""
        } catch {
            if Task.isCancelled { return }
            rows = []; problem = error.localizedDescription
        }
        loading = false
    }
}
