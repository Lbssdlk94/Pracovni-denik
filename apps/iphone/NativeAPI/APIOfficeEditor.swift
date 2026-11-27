import SwiftUI
import UniformTypeIdentifiers

struct APIOfficeEditor: View {
    @ObservedObject var store: APIStore
    let kind: OfficeKind
    let options: APIValue
    let finance: APIValue
    var linkedJob: APIValue = .null
    var row: APIValue = .null
    var action = ""
    var conflicts: [APIValue] = []
    @Environment(\.dismiss) private var dismiss
    @State private var values: [String: String] = [:]
    @State private var start = Date()
    @State private var end = Date().addingTimeInterval(3600)
    @State private var ack = false
    @State private var invoice = false
    @State private var problem = ""
    @State private var busy = false
    @State private var recordID = UUID().uuidString
    @State private var operationID = UUID().uuidString

    @State private var choosingPDF = false
    @State private var pdf: Data?
    @State private var pdfName = ""
    @State private var fileID = UUID().uuidString
    @State private var saved: APIValue = .null
    @State private var extracted = ""
    private var adding: Bool { action.isEmpty }
    private var date: String { DiaryDate.iso(Date()) }
    private func binding(_ key: String) -> Binding<String> {
        Binding(get: { values[key] ?? "" }, set: { values[key] = $0 })
    }
    private func input(_ title: String, _ key: String, numeric: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            TextField(title, text: binding(key)).keyboardType(numeric ? .decimalPad : .default)
        }
    }
    private func choice(_ title: String, _ key: String, _ codes: [String]) -> some View {
        Picker(title, selection: binding(key)) {
            ForEach(codes, id: \.self) { Text(OfficeFormat.label($0)).tag($0) }
        }
    }
    private func dateField(_ title: String, _ key: String) -> some View {
        DatePicker(title, selection: Binding(get: { DiaryDate.parse(values[key] ?? "") ?? Date() }, set: { values[key] = DiaryDate.iso($0) }), displayedComponents: .date)
    }
    private var title: String {
        if adding { return [.purchase:"Návrh nákupu", .leave:"Žádost o volno", .advance:"Nová záloha", .bill:"Nový doklad", .contract:"Rozpočet zakázky", .recurring:"Pravidelná platba", .money:"Nová transakce"][kind] ?? kind.title }
        return action == "void" ? "Stornovat" : OfficeFormat.label(action)
    }
    var body: some View {
        NavigationStack {
            Form {
                Group { if adding { createFields } else { actionFields } }.disabled(!saved.isNull)
                if invoice || action == "invoice" { invoiceFields.disabled(!saved.isNull) }
                if !problem.isEmpty { Text(problem).foregroundStyle(.red) }
                Button { Task { await save() } } label: {
                    if busy { ProgressView() } else { Text(!saved.isNull ? "Znovu přiložit PDF" : adding ? "Uložit" : "Potvrdit") }
                }.disabled(busy || !store.online || (!conflicts.isEmpty && action == "approve" && !ack))
            }.navigationTitle(title).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Zavřít") { dismiss() }.disabled(busy) } }
            .fileImporter(isPresented: $choosingPDF, allowedContentTypes: [.pdf]) { result in
                Task { await readPDF(result) }
            }
            .interactiveDismissDisabled(busy)
            .onAppear { if values.isEmpty { defaults() } }
        }
    }

    @ViewBuilder private var createFields: some View {
        if kind == .leave {
            Section {
                choice("Druh volna", "type", ["holiday","doctor","personal","other"])
                DatePicker("Od", selection: $start)
                DatePicker("Do", selection: $end, in: start...)
                TextField("Poznámka pro správce", text: binding("reason"), axis: .vertical)
            }
        } else {
            Section {
                input("Název", "title")
                Picker("Obor", selection: binding("discipline")) {
                    ForEach(options["disciplineChoices"].array.map(\.string), id: \.self) { Text($0 == "garden" ? "Zahrada" : "Závlaha").tag($0) }
                }.onChange(of: values["discipline"]) { old, new in if old != nil && old != new { values["jobId"] = "" } }
                Picker("Zakázka", selection: binding("jobId")) {
                    Text(kind == .contract || invoice ? "Vyberte zakázku" : "Bez zakázky").tag("")
                    ForEach(options["jobs"].array.filter { $0["discipline"].string.isEmpty || $0["discipline"].string == values["discipline"] }, id: \.id) { Text($0.title).tag($0.id) }
                }
            }
            Section {
                switch kind {
                case .purchase:
                    category
                    input("Množství", "quantity", numeric: true); input("Jednotka", "unit")
                    input("Odhad celkem (Kč)", "estimatedMinor", numeric: true)
                    input("Dodavatel", "supplier"); input("Potřeba do (RRRR-MM-DD)", "neededOn")
                case .advance:
                    Picker("Pracovník", selection: binding("beneficiaryId")) {
                        Text("Vyberte pracovníka").tag("")
                        ForEach(options["members"].array.filter { $0["role"].string != "reader" }, id: \.id) { Text($0.title).tag($0.id) }
                    }
                    amount; dateField("Datum předání", "date")
                case .money, .bill, .recurring:
                    choice("Směr", "direction", ["income","expense"]); category; amount
                    if kind == .money {
                        choice("Stav", "status", ["paid","expected"]); dateField("Datum platby", "date")
                    } else {
                        input("Protistrana", "counterparty")
                        if kind == .bill { dateField("Splatnost", "dueDate"); Toggle("Faktura k zakázce", isOn: $invoice) }
                        else {
                            input("Den splatnosti v měsíci", "day", numeric: true)
                            input("První měsíc (RRRR-MM)", "startMonth"); input("Poslední měsíc (nepovinné)", "endMonth")
                        }
                    }
                    if !invoice { input("Reference", "reference") }
                case .contract:
                    input("Cena zakázky (Kč)", "priceMinor", numeric: true)
                    input("Sjednaná záloha (Kč)", "depositMinor", numeric: true)
                    input("Splatnost zálohy (RRRR-MM-DD)", "depositDue")
                    input("Plánované náklady (Kč)", "budgetMinor", numeric: true)
                case .leave: EmptyView()
                }
            }
            TextField("Poznámka", text: binding("note"), axis: .vertical)
        }
    }
    private var category: some View { choice("Kategorie", "category", ["material","vehicles","tools","services","wages","other"]) }
    private var amount: some View { input("Částka (Kč)", "amountMinor", numeric: true) }
    private var invoiceFields: some View {
        Section("Faktura") {
            Button { choosingPDF = true } label: { Label(pdfName.isEmpty ? "Načíst z PDF" : pdfName, systemImage: "doc.viewfinder") }.disabled(busy)
            if !extracted.isEmpty {
                DisclosureGroup("Přečtený text") { Text(extracted).textSelection(.enabled) }
                Text("Zkontrolujte předvyplněné údaje. Čte se prvních osm stran. PDF se přiloží při uložení.").font(.footnote).foregroundStyle(.secondary)
            }
            input("Číslo faktury", "reference"); dateField("Datum vystavení", "issuedOn")
            input("Variabilní symbol", "variableSymbol"); input("Bankovní účet", "bankAccount")
            input("Dodavatel", "supplierName"); input("Odběratel", "customerName")
        }
    }
    @ViewBuilder private var actionFields: some View {
        Section(OfficeFormat.name(row)) {
            if action == "report" { input("Co jsem platil/a", "title"); category; input("Poznámka", "note") }
            if ["buy","submit_expense","report"].contains(action) {
                input("Zaplaceno celkem (Kč)", "actualMinor", numeric: true); input("Dodavatel", "supplier"); dateField("Datum úhrady", "date")
            }
            if action == "pay" {
                if kind == .bill {
                    Picker("Způsob úhrady", selection: binding("paymentId")) {
                        Text("Zapsat novou platbu").tag("")
                        ForEach(matchingPayments, id: \.id) { payment in Text(OfficeFormat.name(payment) + " · " + OfficeFormat.money(payment["data"]["amountMinor"])).tag(payment.id) }
                    }
                    if (values["paymentId"] ?? "").isEmpty { amount }
                }
                if (values["paymentId"] ?? "").isEmpty { dateField("Datum úhrady", "date") }
            }
            if ["price","extra","budget","give","return"].contains(action) { amount }
            if ["reject","revoke","void","price","extra","budget","give","return"].contains(action) { TextField("Důvod změny", text: binding("reason"), axis: .vertical) }
            if action == "allocate" {
                Picker("Schválený nákup", selection: binding("purchaseId")) {
                    Text("Vyberte nákup").tag("")
                    ForEach(finance["purchases"].array.filter { $0["owner_id"] == row["beneficiaryId"] && $0["discipline"] == row["discipline"] && $0["advance_id"].isNull }, id: \.id) { Text(OfficeFormat.name($0)).tag($0.id) }
                }
            }
            if action == "approve" && !conflicts.isEmpty {
                ForEach(conflicts, id: \.id) { Text($0.title + " · " + $0["date"].string) }
                Toggle("Zkontroloval/a jsem kolize s návštěvami", isOn: $ack)
            }
        }
    }
    private var matchingPayments: [APIValue] {
        finance["records"].array.filter {
            $0["status"].string == "paid" && $0["data"]["financeId"].isNull && $0["discipline"] == row["discipline"] && $0["data"]["direction"] == row["data"]["direction"] && (row["jobId"].string.isEmpty || $0["jobId"] == row["jobId"])
        }
    }
    private func defaults() {
        let disciplines = options["disciplineChoices"].array.map(\.string), selected = store.me["workspace"]["selectedDiscipline"].string
        values = ["date":date,"dueDate":date,"issuedOn":date,"startMonth":String(date.prefix(7)),"day":"1","quantity":"1","unit":"ks","type":"holiday","category":kind == .purchase ? "material" : "other","status":"paid","direction":"expense","discipline":disciplines.contains(selected) ? selected : disciplines.first ?? ""]
        if !linkedJob.isNull {
            values["jobId"] = linkedJob.id; values["discipline"] = linkedJob["discipline"].string
            values["title"] = linkedJob.title; invoice = true
        }
        if !adding {
            let data = row["data"]
            values["supplier"] = data["supplier"].string
            values["reference"] = data["reference"].string
            if !data["actualMinor"].isNull { values["actualMinor"] = String(data["actualMinor"].double / 100) }
            if action == "pay" && kind == .bill { values["amountMinor"] = String(Double(data["amountMinor"].int - data["paidMinor"].int) / 100) }
            if !data["paidOn"].string.isEmpty { values["date"] = data["paidOn"].string }
        }
    }
    private func readPDF(_ result: Result<URL, Error>) async {
        guard !busy else { return }
        busy = true; problem = ""
        defer { busy = false }
        do {
            let url = try result.get(), access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            guard let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 4 * 1024 * 1024 else { throw APIError.local("PDF může mít nejvýše 4 MB.") }
            let bytes = try Data(contentsOf: url)
            let text = try await Task.detached(priority: .userInitiated) { try APIInvoiceReader.read(bytes) }.value
            pdf = bytes; pdfName = url.lastPathComponent; extracted = text
            for (key, value) in APIInvoiceReader.suggestions(text) where (values[key] ?? "").isEmpty || ((key == "dueDate" || key == "issuedOn") && values[key] == date) {
                values[key] = value
            }
        } catch where (error as NSError).code == NSUserCancelledError {} catch { problem = error.localizedDescription }
    }
    private func save() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            var body = values.mapValues(APIValue.s)
            for key in ["amountMinor","estimatedMinor","actualMinor","priceMinor","depositMinor","budgetMinor"] {
                guard let text = values[key] else { continue }
                body[key] = text.isEmpty ? .null : try OfficeFormat.minor(text)
            }
            if kind == .leave && adding {
                guard end > start else { throw APIError.local("Konec volna musí být po začátku.") }
                body["startAt"] = .number(start.timeIntervalSince1970 * 1000); body["endAt"] = .number(end.timeIntervalSince1970 * 1000)
            }
            if kind == .purchase && adding {
                guard let quantity = Double((values["quantity"] ?? "").replacingOccurrences(of: ",", with: ".")), quantity.isFinite, quantity > 0 else { throw APIError.local("Zadejte kladné množství.") }
                body["quantity"] = .number(quantity)
            }
            if invoice || action == "invoice" {
                body["invoice"] = APIValue.object(body).selecting(["issuedOn","variableSymbol","bankAccount","supplierName","customerName"])
            }
            body["operationId"] = .s(operationID)
            var path = kind.base
            if adding {
                body["kind"] = .s(kind.rawValue); body["id"] = .s(recordID)
            } else if action == "report" {
                path = "/api/team-office/report-expense"; body["id"] = .s(recordID); body["advanceId"] = .s(row.id)
            } else {
                path += "/" + row.id + "/action"
                body["action"] = .s(action); body["version"] = row["version"]; body["acknowledgeConflicts"] = .bool(ack)
            }
            if saved.isNull {
                let result = try await store.write(path, method: "POST", body: .object(body))
                if (invoice || action == "invoice") && pdf != nil { saved = result["item"] }
            }
            if !saved.isNull, let pdf {
                let headers = ["if-match": saved["version"].string, "x-file-name": pdfName.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "faktura.pdf"]
                try await store.upload("/api/office-finance/" + saved.id + "/invoice-file/" + fileID, bytes: pdf, type: "application/pdf", headers: headers)
            }
            dismiss()
        } catch { problem = (saved.isNull ? "" : "Doklad je uložený. PDF se nepřiložilo. ") + error.localizedDescription }
    }
}
