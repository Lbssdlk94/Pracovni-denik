import SwiftUI
import UniformTypeIdentifiers

private struct OfficeSelection: Identifiable {
    let id: String
}

struct APIOfficeDetail: View {
    @ObservedObject var store: APIStore
    let kind: OfficeKind
    let initial: APIValue
    let options: APIValue
    let finance: APIValue
    @State private var details: APIValue = .null
    @State private var action: OfficeSelection?
    @State private var picking = false
    @State private var busy = false
    @State private var problem = ""
    @State private var preview: URL?
    @State private var showFile = false
    private var base: String { kind.base + "/" + initial.id }
    private var row: APIValue {
        let current = details[kind.team ? "record" : "item"]
        return current.isNull ? initial : current
    }
    private var data: APIValue { row["data"] }
    private var actions: [String] {
        OfficeFormat.actions(kind, row, manager: store.manager, mine: row["ownerId"].string == store.userID)
    }
    private let textFields = [
        ("counterparty","Protistrana"),("reference","Reference"),("direction","Směr"),("category","Kategorie"),
        ("date","Datum"),("dueDate","Splatnost"),("depositDue","Splatnost zálohy"),("neededOn","Potřeba do"),
        ("supplier","Dodavatel"),("quantity","Množství"),("unit","Jednotka"),("paidOn","Datum úhrady"),
        ("startMonth","Od měsíce"),("endMonth","Do měsíce"),("day","Den splatnosti"),("note","Poznámka"),
        ("reason","Důvod"),("decisionReason","Důvod rozhodnutí"),("lastReason","Poslední změna")
    ]
    private let amounts = [
        ("amountMinor","Částka"),("actualMinor","Zaplaceno"),("estimatedMinor","Odhad"),("paidMinor","Uhrazeno"),
        ("givenMinor","Předáno"),("spentMinor","Čerpáno"),("returnedMinor","Vráceno"),("priceMinor","Cena zakázky"),
        ("depositMinor","Záloha"),("budgetMinor","Rozpočet nákladů")
    ]
    var body: some View {
        List {
            Section {
                Text(OfficeFormat.name(row)).font(.title3.bold())
                LabeledContent("Stav", value: OfficeFormat.label(row["status"].string))
                ForEach(["ownerName","beneficiaryName","jobTitle"], id: \.self) { key in
                    if !initial[key].string.isEmpty { Text(initial[key].string) }
                }
                ForEach(textFields, id: \.0) { key, title in
                    if !data[key].string.isEmpty { LabeledContent(title, value: OfficeFormat.label(data[key].string)) }
                }
                ForEach(amounts, id: \.0) { key, title in
                    if !data[key].isNull { LabeledContent(title, value: OfficeFormat.money(data[key])) }
                }
                if kind == .leave {
                    LabeledContent("Od", value: timestamp(data["startAt"]))
                    LabeledContent("Do", value: timestamp(data["endAt"]))
                }
                if kind == .advance {
                    LabeledContent("Zůstatek", value: OfficeFormat.money(.n(data["givenMinor"].int - data["spentMinor"].int - data["returnedMinor"].int)))
                }
            }
            if !data["invoice"].isNull {
                Section("Faktura") {
                    ForEach([("number","Číslo"),("issuedOn","Datum vystavení"),("variableSymbol","Variabilní symbol"),("bankAccount","Účet"),("supplierName","Dodavatel"),("customerName","Odběratel")], id: \.0) { key, title in
                        if !data["invoice"][key].string.isEmpty { LabeledContent(title, value: data["invoice"][key].string) }
                    }
                    if !data["invoiceFile"].isNull {
                        Button("Otevřít PDF") { Task { await open(base + "/invoice-file", name: "faktura.pdf") } }
                    } else if row["status"].string != "void" { Button("Přiložit PDF") { picking = true } }
                }
            }
            if kind == .purchase {
                Section("Účtenky a doklady") {
                    ForEach(details["receipts"].array, id: \.id) { file in
                        Button(file.title) { Task { await open(base + "/receipt/" + file.id, name: file.title) } }
                    }
                    if store.writer { Button("Přidat doklad") { picking = true } }
                }
            }
            if !actions.isEmpty {
                Section("Dostupné kroky") {
                    ForEach(actions, id: \.self) { name in
                        Button(name == "void" ? "Stornovat" : OfficeFormat.label(name)) { action = OfficeSelection(id: name) }
                    }
                }.disabled(!store.online || (details.isNull && !(kind == .advance && !store.manager)))
            }
            if !details["history"].array.isEmpty {
                Section("Historie") {
                    ForEach(Array(details["history"].array.enumerated()), id: \.offset) { _, event in
                        VStack(alignment: .leading) {
                            Text(OfficeFormat.label(event["action"].string))
                            Text([timestamp(event["at"]), event["actor_name"].string, event["name"].string].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if busy { ProgressView() }
            if !problem.isEmpty { Text(problem).foregroundStyle(.red) }
        }.disabled(busy)
        .navigationTitle(kind.title).navigationBarTitleDisplayMode(.inline)
        .task { await load() }.refreshable { await load() }
        .sheet(item: $action, onDismiss: { Task { await load() } }) { selected in
            APIOfficeEditor(store: store, kind: kind, options: options, finance: finance, row: row, action: selected.id, conflicts: details["conflicts"].array)
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: kind == .bill ? [.pdf] : [.jpeg, .png, .pdf]) { result in
            Task { await upload(result) }
        }
        .sheet(isPresented: $showFile, onDismiss: cleanup) {
            if let preview { NavigationStack { APIQuickLook(url: preview).toolbar { Button("Zavřít") { showFile = false } } } }
        }
        .onDisappear { if !showFile { cleanup() } }
    }
    private func timestamp(_ value: APIValue) -> String {
        Date(timeIntervalSince1970: value.double / 1000).formatted(date: .abbreviated, time: .shortened)
    }
    private func load() async {
        guard kind != .advance || store.manager else { return }
        do { details = try await store.get(base, refresh: true); problem = "" }
        catch { problem = error.localizedDescription }
    }
    private func cleanup() {
        if let preview { try? FileManager.default.removeItem(at: preview); self.preview = nil }
    }
    private func open(_ path: String, name: String) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let file = try await store.file(path)
            let ext = URL(fileURLWithPath: name).pathExtension.lowercased()
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension(["png","jpg","jpeg","pdf"].contains(ext) ? ext : "pdf")
            try file.data.write(to: url, options: [.atomic, .completeFileProtection])
            preview = url; showFile = true
        } catch { problem = error.localizedDescription }
    }
    private func upload(_ result: Result<URL, Error>) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let url = try result.get()
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let info = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey])
            guard let size = info.fileSize, size <= 4 * 1024 * 1024, let mime = info.contentType?.preferredMIMEType else { throw APIError.local("Vyberte doklad do 4 MB.") }
            let fileID = UUID().uuidString
            let suffix = kind == .bill ? "/invoice-file/" : "/receipts/"
            let headers = ["if-match": row["version"].string, "x-file-name": url.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "doklad"]
            try await store.upload(base + suffix + fileID, bytes: Data(contentsOf: url), type: mime, headers: headers)
            await load()
        } catch where (error as NSError).code == NSUserCancelledError {} catch { problem = error.localizedDescription }
    }
}
