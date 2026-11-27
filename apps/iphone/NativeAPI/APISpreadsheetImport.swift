import SwiftUI
import UniformTypeIdentifiers

struct APISpreadsheetImport: View {
    @ObservedObject var store: APIStore
    let materials: Bool
    @State private var picking = false
    @State private var name = ""
    @State private var contents = ""
    @State private var categories: [APIValue] = []
    @State private var category = ""
    @State private var response: APIValue = .null
    @State private var busy = false
    @State private var problem = ""

    private var confirmation: String { response["confirm"]["id"].string }

    var body: some View {
        Form {
            Section {
                Button { picking = true } label: {
                    Label(name.isEmpty ? "Vybrat tabulku ze Souborů" : name, systemImage: "tablecells")
                }
                if materials {
                    Picker("Kategorie materiálu", selection: $category) {
                        Text("Vyberte kategorii").tag("")
                        ForEach(categories, id: \.id) { Text($0.title).tag($0.title) }
                    }
                }
                Button("Zkontrolovat tabulku") { Task { await preview() } }
                    .disabled(contents.isEmpty || (materials && category.isEmpty))
            } footer: {
                Text(materials ? "CSV s názvem, jednotkou a cenou položky. Maximální velikost je 1 MB." : "Vyberte CSV se záhlavím, například Jméno, Telefon a E-mail. Tabulku Google lze stáhnout jako CSV. Před uložením uvidíte také přeskočené kontakty.")
            }.disabled(!confirmation.isEmpty || busy || !store.online)
            if !response.isNull {
                Section("Kontrola importu") {
                    Text(response["reply"].string).textSelection(.enabled)
                    if !confirmation.isEmpty {
                        Button(response["continueImport"].bool ? "Pokračovat v importu" : "Potvrdit import") {
                            Task { await send(.object(["confirmId": .s(confirmation)])) }
                        }.buttonStyle(.borderedProminent)
                        Button("Zrušit zbývající import", role: .cancel) {
                            Task { await send(.object(["cancelId": .s(confirmation)])) }
                        }
                    }
                }.disabled(busy || !store.online)
            }
            if busy { ProgressView("Zpracovávám tabulku…") }
            if !problem.isEmpty { Text(problem).foregroundStyle(.red) }
        }
        .navigationTitle(materials ? "Import materiálu" : "Import kontaktů")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: category) { _, _ in response = .null }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.commaSeparatedText, .tabSeparatedText, .plainText]) { result in
            do {
                let url = try result.get()
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                guard let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 1_000_000 else {
                    throw APIError.local("Rozdělte tabulku na soubory do 1 MB.")
                }
                contents = try String(contentsOf: url, encoding: .utf8)
                name = url.lastPathComponent
                response = .null
                problem = ""
            } catch where (error as NSError).code == NSUserCancelledError {} catch { problem = error.localizedDescription }
        }
        .task {
            guard materials else { return }
            do {
                let result = try await store.get("/api/materials", refresh: true)
                categories = result["categories"].array.filter { $0["active"].bool }
                if categories.count == 1 { category = categories[0].title }
            } catch { problem = error.localizedDescription }
        }
    }

    private func preview() async {
        await send(.object(["text": .s(materials ? "Import materiálu " + category : "Import zákazníků a dodavatelů"), "file": .object(["name": .s(name), "text": .s(contents)])]))
    }

    private func send(_ payload: APIValue) async {
        guard !busy else { return }
        busy = true
        problem = ""
        defer { busy = false }
        do { response = try await store.write("/api/assistant", method: "POST", body: payload) }
        catch { problem = error.localizedDescription }
    }
}
