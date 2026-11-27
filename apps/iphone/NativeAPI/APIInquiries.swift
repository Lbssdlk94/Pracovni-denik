import SwiftUI

struct APIInquiries: View {
    @ObservedObject var store: APIStore
    @State private var closed = false
    @State private var query = ""
    @State private var status = ""
    @State private var category = ""
    @State private var assignee = ""
    @State private var summary: APIValue = .null
    @State private var records: [APIValue] = []
    @State private var problem = ""
    @State private var loading = true

    private var path: String {
        var url = URLComponents()
        url.path = "/api/inquiries"
        url.queryItems = ["closed": closed ? "1" : "0", "q": query, "status": status, "category": category, "assignee": assignee]
            .filter { !$0.value.isEmpty }.sorted { $0.key < $1.key }
            .map { URLQueryItem(name: $0.key, value: $0.value) }
        return url.string ?? "/api/inquiries"
    }

    var body: some View {
        List {
            Picker("Stav evidence", selection: $closed) {
                Text("Otevřené").tag(false)
                Text("Uzavřené").tag(true)
            }.pickerStyle(.segmented)
            if loading { ProgressView("Načítám poptávky…") }
            if !problem.isEmpty { Text(problem).foregroundStyle(.red) }
            if !loading && records.isEmpty && problem.isEmpty {
                ContentUnavailableView("Žádné poptávky", systemImage: "tray", description: Text("Zkuste jiný filtr nebo hledaný výraz."))
            }
            ForEach(records, id: \.id) { row in
                NavigationLink {
                    APIInquiryDetail(store: store, id: row.id, summary: summary)
                } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(row["firstName"].string + " " + row["lastName"].string).font(.headline)
                        Text([row["serviceLabel"].string, row["city"].string].filter { !$0.isEmpty }.joined(separator: " · "))
                        Text(row["number"].string + " · " + row["statusLabel"].string).font(.caption).foregroundStyle(.secondary)
                    }.padding(.vertical, 3)
                }
            }
        }.navigationTitle("Poptávky")
        .searchable(text: $query, prompt: "Jméno, číslo nebo adresa")
        .toolbar {
            Menu {
                Picker("Stav", selection: $status) {
                    Text("Všechny stavy").tag("")
                    ForEach(summary["statuses"].array.filter { $0["open"].bool != closed }, id: \.id) { Text($0["label"].string).tag($0.id) }
                }
                Picker("Obor", selection: $category) {
                    Text("Všechny obory").tag(""); Text("Závlaha").tag("irrigation"); Text("Zahrada").tag("garden"); Text("Obojí").tag("both")
                }
                Picker("Přiřazení", selection: $assignee) {
                    Text("Všichni").tag(""); Text("Bez přiřazení").tag("none")
                    ForEach(summary["members"].array, id: \.id) { Text($0.title).tag($0.id) }
                }
            } label: { Label("Filtry", systemImage: "line.3.horizontal.decrease.circle") }
        }
        .onChange(of: closed) { _, _ in status = "" }
        .task { do { summary = try await store.get("/api/inquiries/summary", refresh: true) } catch { problem = error.localizedDescription } }
        .task(id: path) {
            do { try await Task.sleep(for: .milliseconds(200)); await load() } catch {}
        }
        .refreshable { await load() }
    }

    private func load() async {
        let requested = path
        loading = true
        do {
            let result = try await store.get(requested, refresh: true)
            guard !Task.isCancelled, path == requested else { return }
            records = result["inquiries"].array
            problem = ""
        } catch {
            guard !Task.isCancelled, path == requested else { return }
            problem = error.localizedDescription
            records = []
        }
        loading = false
    }
}

struct APIInquiryDetail: View {
    @ObservedObject var store: APIStore
    let id: String
    let summary: APIValue
    @State private var row: APIValue = .null
    @State private var duplicates: APIValue = .null
    @State private var status = ""
    @State private var assignee = ""
    @State private var note = ""
    @State private var problem = ""
    @State private var busy = false
    @State private var converting = false
    @State private var preview: APIValue = .null
    private var base: String { "/api/inquiries/" + id }

    var body: some View {
        Form {
            if !problem.isEmpty { Text(problem).foregroundStyle(.red) }
            if row.isNull { if problem.isEmpty { ProgressView() } } else {
                Section(row["firstName"].string + " " + row["lastName"].string) {
                    Text(row["serviceLabel"].string).font(.headline)
                    ForEach(["company", "address", "preferredDate", "phone", "email", "description"], id: \.self) { key in
                        if !row[key].string.isEmpty { Text(row[key].string).textSelection(.enabled) }
                    }
                }
                Section("Vyřízení") {
                    Picker("Stav", selection: $status) {
                        ForEach(summary["statuses"].array.filter { $0.id != "converted" || row["status"].string == "converted" }, id: \.id) { Text($0["label"].string).tag($0.id) }
                    }.disabled(row["status"].string == "converted")
                    Picker("Přiřadit", selection: $assignee) {
                        Text("Nikdo").tag("")
                        ForEach(summary["members"].array, id: \.id) { Text($0.title).tag($0.id) }
                    }
                    TextField("Interní poznámka", text: $note, axis: .vertical)
                    Button("Uložit změny") {
                        var payload: [String: APIValue] = ["internalNote": .s(note), "assigneeId": assignee.isEmpty ? .null : .s(assignee)]
                        if row["status"].string != "converted" { payload["status"] = .s(status) }
                        Task { await action("", "PATCH", payload) }
                    }
                }.disabled(busy || !store.online || store.isRolePreview)
                if row["jobId"].string.isEmpty {
                    Section("Zákazník a zakázka") {
                        ForEach(duplicates["customers"].array, id: \.id) { customer in
                            if row["customerId"].string != customer.id {
                                Button("Propojit s kontaktem " + customer.title) { Task { await action("/link", "POST", ["customerId": .s(customer.id)]) } }
                            } else { Label(customer.title, systemImage: "link") }
                        }
                        Button("Převést na zakázku") { Task { await action("/convert", "POST", ["preview": .bool(true)]) } }
                    }.disabled(busy || !store.online || store.isRolePreview)
                } else if store.enabled("jobs") {
                    NavigationLink("Otevřít zakázku") { APIEntityDetail(store: store, resource: APIResource(entity: .jobs), initial: .object(["id": row["jobId"]])) }
                }
                if !row["photos"].array.isEmpty {
                    Section("Fotografie") {
                        ForEach(row["photos"].array, id: \.id) { photo in APIAuthenticatedImage(store: store, path: base + "/photos/" + photo.id) }
                    }
                }
                if !row["events"].array.isEmpty {
                    Section("Historie") {
                        ForEach(Array(row["events"].array.enumerated()), id: \.offset) { _, event in
                            VStack(alignment: .leading) {
                                Text(event["summary"].string)
                                Text(event["actorName"].string).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }.navigationTitle(row["number"].string.isEmpty ? "Poptávka" : row["number"].string)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $converting, onDismiss: { Task { await load() } }) {
            APIInquiryConversion(store: store, path: base + "/convert", preview: preview, members: summary["members"].array)
        }
    }

    private func load() async {
        do {
            let data = try await store.get(base, refresh: true)
            row = data["inquiry"]
            duplicates = data["duplicates"]
            status = row["status"].string
            note = row["internalNote"].string
            assignee = row["assigneeId"].string
            problem = ""
        } catch { problem = error.localizedDescription }
    }

    private func action(_ suffix: String, _ method: String, _ values: [String: APIValue]) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let result = try await store.write(base + suffix, method: method, body: APIValue.object(values).merged(["version": row["version"]]))
            if result["preview"].bool { preview = result; converting = true }
            else { await load() }
        } catch { problem = error.localizedDescription }
    }
}

private struct APIInquiryConversion: View {
    @ObservedObject var store: APIStore
    let path: String
    let preview: APIValue
    let members: [APIValue]
    @Environment(\.dismiss) var dismiss
    @State private var job: APIValue = .null
    @State private var customer = ""
    @State private var acknowledge = false
    @State private var busy = false
    @State private var problem = ""
    private var matches: [APIValue] { preview["duplicates"]["customers"].array }

    private func field(_ key: String) -> Binding<String> {
        Binding(get: { job[key].string }, set: { job[key] = .s($0) })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Zákazník") {
                    Picker("Kontakt", selection: $customer) {
                        Text("Vyberte kontakt").tag(""); Text("Nový zákazník").tag("new")
                        ForEach(matches, id: \.id) { Text($0.title).tag($0.id) }
                    }
                    if !matches.isEmpty && customer == "new" { Toggle("Prověřil/a jsem shodné kontakty", isOn: $acknowledge) }
                }
                Section("Zakázka") {
                    TextField("Název zakázky", text: field("title"))
                    Picker("Obor", selection: field("discipline")) {
                        ForEach(preview["disciplines"].array.map(\.string), id: \.self) { Text($0 == "garden" ? "Zahrada" : "Závlaha").tag($0) }
                    }
                    Picker("Typ", selection: field("jobType")) {
                        Text("Servis").tag("service"); Text("Realizace").tag("installation"); Text("Zaměření").tag("survey"); Text("Zazimování").tag("blowout"); Text("Údržba").tag("maintenance")
                    }
                    TextField("Popis", text: field("description"), axis: .vertical)
                    TextField("Adresa", text: field("address")); TextField("Město", text: field("city"))
                    TextField("Termín (RRRR-MM-DD)", text: field("dueDate"))
                    Picker("Přiřadit", selection: field("assignedTo")) {
                        ForEach(members, id: \.id) { Text($0.title).tag($0.id) }
                    }
                }
                if !problem.isEmpty { Text(problem).foregroundStyle(.red) }
                Button("Vytvořit zakázku") { Task { await convert() } }
                    .disabled(busy || customer.isEmpty || job["title"].string.isEmpty || (customer == "new" && !matches.isEmpty && !acknowledge))
            }.navigationTitle("Nová zakázka").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Zavřít") { dismiss() }.disabled(busy) }
            .interactiveDismissDisabled(busy)
            .onAppear {
                job = preview["suggestion"]
                job["assignedTo"] = .s(members.contains { $0.id == store.userID } ? store.userID : members.first?.id ?? "")
                customer = matches.count == 1 ? matches[0].id : matches.isEmpty ? "new" : ""
            }
        }
    }

    private func convert() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await store.write(path, method: "POST", body: .object(["version": preview["inquiry"]["version"], "mode": .s(customer == "new" ? "new" : "existing"), "customerId": customer == "new" ? .null : .s(customer), "acknowledgeDuplicates": .bool(acknowledge), "job": job]))
            dismiss()
        } catch { problem = error.localizedDescription }
    }
}
