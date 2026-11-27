import SwiftUI

struct APIOfficeReport: View {
    @ObservedObject var store: APIStore
    let month: String
    let data: APIValue
    @State private var busy = false
    @State private var problem = ""
    @State private var folder: URL?
    @State private var output: URL?
    @State private var sharing = false

    var body: some View {
        List {
            Section("Výhled plateb") {
                LabeledContent("Po splatnosti", value: OfficeFormat.money(data["report"]["overdue"]))
                ForEach(data["report"]["forecast"].object.keys.sorted(), id: \.self) { key in
                    DisclosureGroup(key) { totals(data["report"]["forecast"][key]) }
                }
            }
            Section("Obory za " + month) {
                ForEach(data["report"]["byDiscipline"].object.keys.sorted(), id: \.self) { key in
                    DisclosureGroup(key == "garden" ? "Zahrada" : "Závlaha") { totals(data["report"]["byDiscipline"][key]) }
                }
            }
            Section("Výsledky zakázek") {
                ForEach(data["report"]["jobResults"].array, id: \.id) { result in
                    DisclosureGroup(result.title) {
                        ForEach([("priceMinor","Celková cena"),("paidMinor","Přijato"),("costMinor","Náklady"),("remainingMinor","Zbývá přijmout"),("unbilledMinor","Zbývá vyúčtovat"),("overpaidMinor","Přeplatek")], id: \.0) { key, title in
                            LabeledContent(title, value: OfficeFormat.money(result[key]))
                        }
                    }
                }
                if !data["notice"].string.isEmpty { Text(data["notice"].string).font(.footnote).foregroundStyle(.secondary) }
            }
            Section("Export za " + month) {
                Button("Sdílet transakce jako CSV") { Task { await export(archive: false) } }
                Button("Sdílet podklady a doklady jako ZIP") { Task { await export(archive: true) } }
                if busy { ProgressView("Připravuji soubor…") }
                if !problem.isEmpty { Text(problem).foregroundStyle(.red) }
            }.disabled(busy || !store.online)
        }.navigationTitle("Výhled a export").navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $sharing, onDismiss: cleanup) { if let output { APIProtocolShare(url: output) } }
        .onDisappear { if !sharing { cleanup() } }
    }
    @ViewBuilder private func totals(_ entry: APIValue) -> some View {
        LabeledContent("Příjmy", value: OfficeFormat.money(entry["income"]))
        LabeledContent("Výdaje", value: OfficeFormat.money(entry["expense"]))
    }
    private func cleanup() {
        if let folder { try? FileManager.default.removeItem(at: folder) }
        folder = nil; output = nil
    }
    static func csv(_ records: [APIValue]) -> Data {
        func cell(_ text: String) -> String {
            let guarded = text.trimmingCharacters(in: .whitespacesAndNewlines).first.map { "=+-@".contains($0) } == true ? "'" + text : text
            return "\"" + guarded.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        let header = ["Datum","Název","Směr","Stav","Kategorie","Částka (Kč)","Zakázka","Reference","Poznámka"]
        let rows = records.map { r in
            [r["date"].string, r["title"].string, OfficeFormat.label(r["direction"].string), OfficeFormat.label(r["status"].string),
             OfficeFormat.label(r["category"].string), String(format: "%.2f", r["amountMinor"].double / 100).replacingOccurrences(of: ".", with: ","),
             r["jobTitle"].string, r["reference"].string, r["note"].string]
        }
        return Data(("\u{feff}" + ([header] + rows).map { $0.map(cell).joined(separator: ";") }.joined(separator: "\r\n")).utf8)
    }
    private func export(archive: Bool) async {
        guard !busy else { return }
        busy = true; problem = ""; cleanup()
        defer { busy = false }
        let generation = store.generation
        do {
            let result = try await store.get("/api/office-finance/export?month=" + month, refresh: true)
            let fm = FileManager.default
            let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            folder = root
            let content = root.appendingPathComponent("Finance-" + month, isDirectory: true)
            try fm.createDirectory(at: content, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
            let csv = content.appendingPathComponent("Transakce-" + month + ".csv")
            try Self.csv(result["records"].array).write(to: csv, options: .completeFileProtection)
            if archive {
                try Self.csv(result["bills"].array).write(to: content.appendingPathComponent("Otevrene-doklady.csv"), options: .completeFileProtection)
                for (index, item) in result["receipts"].array.enumerated() {
                    let file = try await store.file(item["path"].string)
                    let name = URL(fileURLWithPath: item["name"].string).lastPathComponent
                    try file.data.write(to: content.appendingPathComponent("\(index + 1)-" + name), options: .completeFileProtection)
                }
                let zip = root.appendingPathComponent("Finance-" + month + ".zip")
                var failure: NSError?
                var copyError: Error?
                NSFileCoordinator().coordinate(readingItemAt: content, options: .forUploading, error: &failure) { url in
                    do { try fm.copyItem(at: url, to: zip) } catch { copyError = error }
                }
                if let failure { throw failure }; if let copyError { throw copyError }
                output = zip
            } else { output = csv }
            guard generation == store.generation else { cleanup(); return }
            sharing = true
        } catch { cleanup(); problem = error.localizedDescription }
    }
}
