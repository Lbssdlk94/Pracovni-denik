import SwiftUI

enum OfficeKind: String, CaseIterable, Identifiable {
    case bill, contract, recurring, advance, purchase, money, leave
    var id: String { rawValue }
    var title: String {
        switch self {
        case .bill: "Pohledávky a závazky"
        case .contract: "Rozpočty zakázek"
        case .recurring: "Pravidelné platby"
        case .advance: "Zálohy pracovníků"
        case .purchase: "Nákupy"
        case .money: "Příjmy a výdaje"
        case .leave: "Žádosti o volno"
        }
    }
    var symbol: String {
        switch self {
        case .bill: "doc.text"; case .contract: "list.clipboard"; case .recurring: "repeat"
        case .advance: "person.crop.circle"; case .purchase: "cart"; case .money: "arrow.left.arrow.right"; case .leave: "calendar"
        }
    }
    var team: Bool { [.purchase, .money, .leave].contains(self) }
    var base: String { team ? "/api/team-office" : "/api/office-finance" }
}

enum OfficeFormat {
    static let labels = [
        "pending":"Čeká na schválení", "approved":"Schváleno", "rejected":"Zamítnuto", "revoked":"Zrušeno", "withdrawn":"Staženo",
        "proposed":"Navrženo", "ordered":"Objednáno", "expense_pending":"Výdaj ke schválení", "bought":"Nakoupeno", "paid":"Zaplaceno",
        "expected":"Očekáváno", "void":"Stornováno", "active":"Aktivní", "open":"K úhradě", "settled":"Uhrazeno", "closed":"Uzavřeno", "paused":"Pozastaveno",
        "holiday":"Dovolená", "doctor":"Lékař", "personal":"Osobní volno", "other":"Ostatní",
        "approve":"Schválit", "reject":"Zamítnout", "revoke":"Zrušit schválení", "withdraw":"Stáhnout žádost", "order":"Označit jako objednané",
        "submit_expense":"Doložit nákup", "buy":"Schválit zaplacený nákup", "pay":"Zapsat úhradu", "price":"Upravit cenu", "extra":"Přidat vícepráci",
        "budget":"Upravit rozpočet", "allocate":"Přiřadit nákup", "give":"Předat peníze", "return":"Potvrdit vratku", "close":"Uzavřít",
        "pause":"Pozastavit", "resume":"Obnovit opakování", "report":"Zapsat výdaj ze zálohy", "invoice":"Doplnit fakturu", "created":"Vytvořeno",
        "material":"Materiál", "vehicles":"Vozidla", "tools":"Nářadí", "services":"Služby", "wages":"Odměny", "income":"Příjem", "expense":"Výdaj"
    ]
    static func label(_ value: String) -> String { labels[value] ?? value }
    static func money(_ minor: APIValue) -> String {
        (minor.double / 100).formatted(.currency(code: "CZK").locale(Locale(identifier: "cs_CZ")))
    }
    static func minor(_ text: String) throws -> APIValue {
        let clean = text.filter { !$0.isWhitespace }.replacingOccurrences(of: ",", with: ".")
        guard clean.range(of: #"^[0-9]{1,12}(\.[0-9]{1,2})?$"#, options: .regularExpression) != nil,
              let amount = Decimal(string: clean, locale: Locale(identifier: "en_US_POSIX")) else { throw APIError.local("Zadejte částku v Kč s nejvýše dvěma desetinnými místy.") }
        return .n(NSDecimalNumber(decimal: amount * 100).intValue)
    }
    static func name(_ row: APIValue) -> String {
        let data = row["data"]
        return data["title"].string.isEmpty ? label(data["type"].string) : data["title"].string
    }
    static func actions(_ kind: OfficeKind, _ row: APIValue, manager: Bool, mine: Bool) -> [String] {
        let status = row["status"].string, data = row["data"]
        var values: [String] = []
        switch kind {
        case .leave:
            if status == "pending" { if manager { values += ["approve","reject"] }; if mine { values.append("withdraw") } }
            if manager && status == "approved" { values.append("revoke") }
        case .purchase:
            if manager && status == "proposed" { values.append("approve") }
            if manager && status == "approved" { values.append("order") }
            if mine && ["approved","ordered"].contains(status) { values.append("submit_expense") }
            if manager && ["approved","ordered","expense_pending"].contains(status) { values.append("buy") }
            if manager && ["proposed","approved","ordered","expense_pending"].contains(status) { values.append("reject") }
            if mine && status == "proposed" { values.append("withdraw") }
        case .money:
            if manager && status == "expected" { values.append("pay") }
            if manager && status != "void" && data["purchaseId"].string.isEmpty && data["financeId"].string.isEmpty { values.append("void") }
        case .bill:
            if manager && status != "void" {
                if status != "settled" { values.append("pay") }
                if data["paidMinor"].int == 0 { values.append("void") }
                if !row["jobId"].string.isEmpty && data["invoice"].isNull { values.append("invoice") }
            }
        case .contract: if manager { values = ["price","budget","extra"] }
        case .recurring: if manager { values = [status == "active" ? "pause" : "resume"] }
        case .advance:
            if status == "active" {
                if manager {
                    values = ["allocate","give"]
                    let balance = data["givenMinor"].int - data["spentMinor"].int - data["returnedMinor"].int
                    if balance > 0 { values.append("return") }
                    if balance == 0 { values.append("close") }
                } else { values = ["report"] }
            }
        }
        return values
    }
}

struct APIOffice: View {
    @ObservedObject var store: APIStore
    @State private var month = Date()
    @State private var data: APIValue = .null
    @State private var problem = ""
    private var period: String { String(DiaryDate.iso(month).prefix(7)) }
    private var title: String { store.manager ? "Finance" : "Nákupy a zálohy" }
    var body: some View {
        List {
            if store.manager {
                Section {
                    HStack {
                        Button { shift(-1) } label: { Label("Předchozí měsíc", systemImage: "chevron.left").labelStyle(.iconOnly) }
                        Spacer()
                        Text(month.formatted(.dateTime.month(.wide).year().locale(Locale(identifier: "cs_CZ")))).font(.headline)
                        Spacer()
                        Button { shift(1) } label: { Label("Další měsíc", systemImage: "chevron.right").labelStyle(.iconOnly) }
                    }.buttonStyle(.borderless)
                    if !data.isNull {
                        let totals = data["report"]["monthly"][period]
                        LabeledContent("Příjmy", value: OfficeFormat.money(totals["income"]))
                        LabeledContent("Výdaje", value: OfficeFormat.money(totals["expense"]))
                        LabeledContent("Pohledávky", value: OfficeFormat.money(data["report"]["receivables"]))
                        LabeledContent("Závazky", value: OfficeFormat.money(data["report"]["payables"]))
                    }
                } header: { Text("Přehled hospodaření") }
            }
            Section("Evidence") {
                ForEach(store.manager ? OfficeKind.allCases : [.purchase, .advance, .leave]) { kind in
                    NavigationLink { APIOfficeList(store: store, kind: kind, month: period) } label: { Label(kind.title, systemImage: kind.symbol) }
                }
            }
            if store.manager {
                NavigationLink { APIOfficeReport(store: store, month: period, data: data) } label: { Label("Výhled a export", systemImage: "chart.bar") }
            }
            if !problem.isEmpty { Text(problem).foregroundStyle(.red) }
        }.navigationTitle(title)
        .task(id: period) { await load() }.refreshable { await load() }
    }
    private func shift(_ months: Int) { month = Calendar.current.date(byAdding: .month, value: months, to: month) ?? month }
    private func load() async {
        guard store.manager else { return }
        do {
            let result = try await store.get("/api/office-finance?month=" + period, refresh: true)
            try Task.checkCancellation()
            data = result; problem = ""
        } catch { if !Task.isCancelled { problem = error.localizedDescription } }
    }
}

struct APIOfficeList: View {
    @ObservedObject var store: APIStore
    let kind: OfficeKind
    let month: String
    var linkedJob: APIValue = .null
    @State private var records: [APIValue] = []
    @State private var options: APIValue = .null
    @State private var finance: APIValue = .null
    @State private var absences: [APIValue] = []
    @State private var query = ""
    @State private var problem = ""
    @State private var loading = true
    @State private var creating = false
    @State private var prepare = false
    @State private var notice = ""
    private var visible: [APIValue] {
        records.filter { row in query.isEmpty || [OfficeFormat.name(row), row["ownerName"].string, row["beneficiaryName"].string, row["jobTitle"].string, OfficeFormat.label(row["status"].string)].joined(separator: " ").localizedStandardContains(query) }
    }
    var body: some View {
        List {
            if !absences.isEmpty {
                DisclosureGroup("Schválené volno v příštích 30 dnech") {
                    ForEach(absences, id: \.id) { absence in
                        VStack(alignment: .leading) {
                            Text(absence.title)
                            let start = Date(timeIntervalSince1970: absence["startAt"].double / 1000)
                            let end = Date(timeIntervalSince1970: absence["endAt"].double / 1000)
                            Text(start.formatted(date: .abbreviated, time: .shortened) + " – " + end.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if !finance["pendingExpenses"].array.isEmpty {
                Section("Výdaje ke schválení") {
                    ForEach(finance["pendingExpenses"].array, id: \.id) { expense in
                        NavigationLink {
                            APIOfficeDetail(store: store, kind: .purchase, initial: .object(["id": .s(expense.id), "data": expense]), options: options, finance: finance)
                        } label: { LabeledContent(expense.title, value: OfficeFormat.money(expense["actualMinor"])) }
                    }
                }
            }
            if kind == .recurring {
                Button("Připravit doklady na " + month) { prepare = true }.disabled(loading || !store.online)
            }
            if !notice.isEmpty { Text(notice) }
            if loading { ProgressView("Načítám evidenci…") }
            if !problem.isEmpty { Text(problem).foregroundStyle(.red) }
            ForEach(visible, id: \.id) { row in
                NavigationLink {
                    APIOfficeDetail(store: store, kind: kind, initial: row, options: options, finance: finance)
                } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(OfficeFormat.name(row)).font(.headline)
                        let owner = row["beneficiaryName"].string.isEmpty ? row["ownerName"].string : row["beneficiaryName"].string
                        Text([owner, OfficeFormat.label(row["status"].string)].filter { !$0.isEmpty }.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                        if let amount = ["amountMinor","actualMinor","givenMinor","priceMinor","estimatedMinor"].map({ row["data"][$0] }).first(where: { !$0.isNull }) { Text(OfficeFormat.money(amount)).font(.subheadline.monospacedDigit()) }
                    }.padding(.vertical, 3)
                }
            }
            if visible.isEmpty && !loading && problem.isEmpty { ContentUnavailableView("Žádné záznamy", systemImage: kind.symbol) }
        }.navigationTitle(kind.title).navigationBarTitleDisplayMode(.inline).searchable(text: $query)
        .toolbar {
            if (store.manager || kind == .leave || kind == .purchase) && !options.isNull {
                Button { creating = true } label: { Label("Přidat záznam", systemImage: "plus") }.disabled(!store.online)
            }
        }
        .sheet(isPresented: $creating, onDismiss: { Task { await load() } }) {
            APIOfficeEditor(store: store, kind: kind, options: options, finance: finance, linkedJob: linkedJob)
        }
        .confirmationDialog("Připravit pravidelné doklady na " + month + "?", isPresented: $prepare) {
            Button("Připravit doklady") { Task {
                do {
                    let result = try await store.write("/api/office-finance/prepare-month", method: "POST", body: .object(["month": .s(month), "operationId": .s(UUID().uuidString)]))
                    notice = "Nové doklady: \(result["created"].int)"
                    await load()
                } catch { problem = error.localizedDescription }
            } }
        }
        .task { await load() }.refreshable { await load() }
    }
    private func load() async {
        loading = true
        defer { loading = false }
        do {
            if kind == .leave { options = .object([:]) }
            else { options = try await store.get("/api/team-office/options", refresh: true) }
            if kind.team {
                let result = try await store.get(kind.base + "?kind=" + kind.rawValue + (kind == .money ? "&month=" + month : ""), refresh: true)
                records = result["records"].array
                if kind == .leave && store.manager {
                    let path = "/api/team-office/availability?from=" + store.today + "&to=" + DiaryDate.shifted(store.today, days: 30)
                    absences = try await store.get(path, refresh: true)["absences"].array
                }
            } else {
                finance = try await store.get(kind.base + (store.manager ? "?month=" + month : "?view=advances"), refresh: true)
                records = finance["items"].array.filter { $0["kind"].string == kind.rawValue && (linkedJob.isNull || $0["jobId"].string == linkedJob.id) }
            }
            problem = ""
        } catch { problem = error.localizedDescription }
    }
}
