import SwiftUI
import UIKit
import PhotosUI

final class APIAssistantMemory: ObservableObject {
    struct Item: Codable, Identifiable, Equatable {
        var id = UUID().uuidString
        var text: String
        var mine: Bool
    }
    struct Thread: Codable, Identifiable, Equatable {
        var id = UUID().uuidString
        var title = "Nový chat"
        var draft = ""
        var items: [Item] = []
        var concept: APIValue = .null
        var context: APIValue = .null
        var confirmID = ""
        var notice = ""
        var updated = Date().timeIntervalSince1970
        var preview: String { items.last?.text ?? "Prázdná konverzace" }
    }
    private struct Saved: Codable { var threads: [Thread]; var activeID: String; var tab: String }
    private static let key = "pd.assistant.memory.v1"
    private static let pendingKey = "pd.assistant.pending.v1"
    @Published var threads: [Thread] = []
    @Published var activeID = ""
    @Published var tab = "chat"
    @Published var pendingCount = 0
    var active: Thread { threads.first { $0.id == activeID } ?? threads[0] }
    init() {
        if let data = UserDefaults.standard.data(forKey: Self.key), let saved = try? JSONDecoder().decode(Saved.self, from: data), !saved.threads.isEmpty {
            threads = saved.threads
            activeID = saved.threads.contains { $0.id == saved.activeID } ? saved.activeID : saved.threads[0].id
            tab = saved.tab == "result" ? "result" : "chat"
        } else { openFresh() }
        pendingCount = Self.loadPending().count
    }
    func update(_ body: (inout Thread) -> Void) {
        guard let index = threads.firstIndex(where: { $0.id == activeID }) else { return }
        body(&threads[index])
        threads[index].updated = Date().timeIntervalSince1970
        persist()
    }
    func append(_ text: String, mine: Bool) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        update {
            $0.items.append(Item(text: clean, mine: mine))
            if $0.items.count > 40 { $0.items.removeFirst($0.items.count - 40) }
            if mine && $0.title == "Nový chat" { $0.title = String(clean.prefix(42)) }
        }
    }
    func setConcept(_ value: APIValue) { update { $0.concept = value } }
    func setContext(_ value: APIValue) { update { $0.context = value } }
    func setConfirm(_ id: String) { update { $0.confirmID = id } }
    func setNotice(_ text: String) { update { $0.notice = text } }
    func setTab(_ value: String) { tab = value == "result" ? "result" : "chat"; persist() }
    func setDraft(_ text: String) { update { $0.draft = text } }
    func select(_ id: String) { guard threads.contains(where: { $0.id == id }) else { return }; activeID = id; persist() }
    func startNew() {
        if active.items.isEmpty && active.concept.isNull && active.draft.isEmpty { return }
        let thread = Thread()
        threads.insert(thread, at: 0)
        activeID = thread.id
        tab = "chat"
        if threads.count > 12 { threads = Array(threads.prefix(12)) }
        persist()
    }
    func syncPlanFromConcept() {
        guard !active.concept.isNull else { return }
        if active.concept["kind"].string == "protocol" {
            var context = active.context.isNull ? APIValue.object([:]) : active.context
            context["jobId"] = active.concept["jobId"]
            context["protocol"] = active.concept
            setContext(context)
            return
        }
        var plan = active.context["plan"]
        if plan.isNull { plan = .object([:]) }
        plan["title"] = active.concept["title"]
        plan["customer"] = active.concept["customerName"]
        plan["customerName"] = active.concept["customerName"]
        plan["address"] = active.concept["address"]
        plan["city"] = active.concept["city"]
        plan["terms"] = active.concept["terms"]
        plan["materials"] = active.concept["materials"]
        var context = active.context.isNull ? .object([:]) : active.context
        context["plan"] = plan
        context["customerName"] = active.concept["customerName"]
        setContext(context)
    }
    private func openFresh() { let thread = Thread(); threads = [thread]; activeID = thread.id }
    func enqueuePending(_ text: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        var list = Self.loadPending()
        if !list.contains(clean) { list.append(clean) }
        if list.count > 20 { list = Array(list.suffix(20)) }
        UserDefaults.standard.set(list, forKey: Self.pendingKey)
        pendingCount = list.count
    }
    func takePending() -> String? {
        var list = Self.loadPending()
        guard !list.isEmpty else { pendingCount = 0; return nil }
        let first = list.removeFirst()
        UserDefaults.standard.set(list, forKey: Self.pendingKey)
        pendingCount = list.count
        return first
    }
    private static func loadPending() -> [String] { UserDefaults.standard.stringArray(forKey: pendingKey) ?? [] }
    private func persist() {
        let saved = Saved(threads: threads, activeID: activeID, tab: tab)
        if let data = try? JSONEncoder().encode(saved) { UserDefaults.standard.set(data, forKey: Self.key) }
    }
}

struct APIAssistantWorkspace: View {
    @ObservedObject var store: APIStore
    @ObservedObject var memory: APIAssistantMemory
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var size
    @FocusState private var focused: Bool
    @State private var busy = false
    @State private var history = false
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var showCamera = false
    @State private var useMinistral = false
    @State private var prompts: [String] = []
    @StateObject private var ministral = MinistralLibrary.shared
    private var wide: Bool { size == .regular }
    private var concept: APIValue {
        get { memory.active.concept }
        nonmutating set { memory.setConcept(newValue) }
    }
    var body: some View {
        VStack(spacing: 0) {
            bar
            if !memory.active.notice.isEmpty {
                Text(memory.active.notice).font(.caption).foregroundStyle(DiaryStyle.warning).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.bottom, 6)
            }
            if !wide {
                Picker("Panel", selection: Binding(get: { memory.tab }, set: { memory.setTab($0) })) {
                    Text("Asistent").tag("chat")
                    Text("Výsledek").tag("result")
                }.pickerStyle(.segmented).padding(.horizontal, 12).padding(.bottom, 8)
            }
            if wide {
                HStack(spacing: 0) { chatColumn.frame(maxWidth: .infinity); Divider(); result.frame(maxWidth: .infinity) }
            } else if memory.tab == "result" { result } else { messages }
        }
        .background(DiaryStyle.background)
        .safeAreaInset(edge: .bottom, spacing: 0) { if !wide { composer } }
        .sheet(isPresented: $history) { historySheet }
        .onChange(of: store.online) { _, online in if online { Task { await flushPending() } } }
        .task { if store.online { await flushPending() } }
        .onChange(of: pickedPhoto) { _, item in
            guard let item else { return }
            Task {
                if let bytes = try? await item.loadTransferable(type: Data.self) { await uploadCaptured(bytes) }
                pickedPhoto = nil
            }
        }
        .sheet(isPresented: $showCamera) { APICamera { bytes in Task { await uploadCaptured(bytes) } } }
    }
    private var statusLine: String {
        let place = memory.active.context["customerName"].string
        let job = place.isEmpty ? "Bez vybrané zakázky" : place
        let mode = store.online ? "Základní režim" : "Offline"
        let commands = memory.pendingCount > 0 ? " · příkazy \(memory.pendingCount)" : ""
        return "\(job) · \(mode) · fronta \(store.outbox.count)\(commands)"
    }
    private var bar: some View {
        HStack(spacing: 0) {
            Button { dismiss() } label: { Image(systemName: "xmark") }.frame(width: 44, height: 44).accessibilityLabel("Zavřít")
            Text("Asistent").font(.headline).lineLimit(1)
            Spacer(minLength: 4)
            Text(statusLine).font(.caption2).foregroundStyle(DiaryStyle.accent).lineLimit(2).minimumScaleFactor(0.7)
            Button { history = true } label: { Image(systemName: "clock") }.frame(width: 44, height: 44).accessibilityLabel("Historie")
            Button { memory.startNew() } label: { Image(systemName: "square.and.pencil") }.frame(width: 44, height: 44).accessibilityLabel("Nový chat")
            Button { dismiss() } label: { Image(systemName: "chevron.down") }.frame(width: 44, height: 44).accessibilityLabel("Minimalizovat")
            Menu {
                Button("Nový chat", systemImage: "square.and.pencil") { memory.startNew() }
                Button("Historie", systemImage: "clock") { history = true }
                Divider()
                Toggle("Přepsat příkaz modelem Ministral", isOn: $useMinistral)
                Text(ministral.message).font(.caption)
                if ministral.downloading {
                    ProgressView(value: ministral.progress)
                    Button("Zrušit stahování") { ministral.cancel() }
                } else if ministral.installed {
                    Button("Smazat model z telefonu") { ministral.remove(); useMinistral = false }
                } else {
                    Button("Stáhnout Ministral 3B") { ministral.start() }
                }
                Text("Model jen přepíše větu na příkaz. Evidenci čte a ukládá stávající asistent až po potvrzení.")
            } label: { Image(systemName: "ellipsis") }.frame(width: 44, height: 44).accessibilityLabel("Nastavení asistenta")
        }.padding(.horizontal, 4)
    }
    private var chatColumn: some View { VStack(spacing: 0) { messages; composer } }
    private var messages: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 6) {
                    if memory.active.items.isEmpty { Text("Napište příkaz. Zakázka se uloží až tlačítkem Uložit zakázku.").font(.caption).foregroundStyle(.secondary) }
                    if !prompts.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack { ForEach(prompts, id: \.self) { prompt in Button(prompt) { memory.setDraft(prompt) }.buttonStyle(.bordered).font(.caption) } }
                        }
                    }
                    ForEach(memory.active.items) { item in
                        Text(item.text).font(.subheadline).frame(maxWidth: .infinity, alignment: item.mine ? .trailing : .leading)
                            .padding(.horizontal, 10).padding(.vertical, 7)
                            .background(item.mine ? DiaryStyle.soft : Color.clear, in: RoundedRectangle(cornerRadius: 14))
                            .id(item.id)
                    }
                }.padding(.horizontal, 12).padding(.vertical, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: memory.active.items.count) { _, _ in if let id = memory.active.items.last?.id { proxy.scrollTo(id, anchor: .bottom) } }
        }
    }
    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Příkaz", text: Binding(get: { memory.active.draft }, set: { memory.setDraft($0) }), axis: .vertical)
                .lineLimit(1...4).font(.subheadline).focused($focused).frame(minHeight: 36)
            Button { Task { await send() } } label: { Image(systemName: "arrow.up") }
                .disabled(busy || memory.active.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .frame(width: 44, height: 44).accessibilityLabel("Odeslat")
        }
        .padding(.horizontal, 12).padding(.vertical, 8).background(DiaryStyle.background)
    }
    private var result: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if concept.isNull {
                    Text(memory.active.confirmID.isEmpty ? "Výsledek příkazu se objeví tady. Bez tlačítka Uložit zakázku se nic nezapíše." : "Příkaz čeká na potvrzení. Text je v rozhovoru. Dokud neklepnete na Potvrdit, nic se neuloží.").font(.subheadline).foregroundStyle(.secondary)
                    if !memory.active.confirmID.isEmpty {
                        Button("Potvrdit") { Task { await confirm() } }.disabled(busy).buttonStyle(.borderedProminent).frame(minHeight: 44)
                        Button("Zrušit") { Task { await cancelConcept() } }.disabled(busy).frame(minHeight: 44)
                    }
                }
                else { conceptForm }
            }.padding(12)
        }
    }
    private var conceptForm: some View {
        Group {
            if concept["kind"].string == "protocol" { protocolForm }
            else if ["defect", "diary", "followup", "complete", "photo", "dictionary"].contains(concept["kind"].string) { noteForm }
            else { jobConceptForm }
        }
    }
    private var protocolForm: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { Text("Servisní protokol").font(.headline); Text("Koncept").font(.caption.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 4).background(DiaryStyle.soft, in: Capsule()) }
            Text([concept["jobTitle"].string, concept["customerName"].string, concept["address"].string].filter { !$0.isEmpty }.joined(separator: " · ")).font(.subheadline)
            TextField("Provedené práce", text: binding("work"), axis: .vertical).frame(minHeight: 88).accessibilityLabel("Provedené práce")
            ForEach(Array(concept["materials"].array.enumerated()), id: \.offset) { index, row in
                VStack(alignment: .leading, spacing: 6) {
                    Text(row["label"].string.isEmpty ? "Materiál" : row["label"].string).font(.caption.weight(.semibold))
                    HStack {
                        TextField("Množství", text: materialBinding(index, "quantity")).frame(minHeight: 44).accessibilityLabel("Množství \(row["label"].string)")
                        Text(row["unit"].string).frame(minWidth: 28)
                    }
                    if !row["choices"].array.isEmpty {
                        Picker("Katalog", selection: choiceBinding(index)) {
                            Text("Nevybráno").tag("")
                            ForEach(Array(row["choices"].array.enumerated()), id: \.offset) { _, choice in
                                Text(choice["name"].string).tag(choice["id"].string)
                            }
                        }.frame(minHeight: 44)
                    } else if row["status"].string == "missing" {
                        Text("V katalogu není. Novou položku nezakládám.").font(.caption).foregroundStyle(.secondary)
                    } else if row["status"].string == "unquantified" {
                        Text("Množství chybí, do katalogu se nezapíše.").font(.caption).foregroundStyle(.secondary)
                    }
                }.padding(8).background(DiaryStyle.surface, in: RoundedRectangle(cornerRadius: 14))
            }
            ForEach(concept["questions"].array, id: \.string) { question in Text(question.string).font(.caption) }
            Button("Uložit do protokolu") { Task { await confirm() } }.disabled(memory.active.confirmID.isEmpty || busy).buttonStyle(.borderedProminent).frame(minHeight: 44)
            Button("Zrušit koncept") { Task { await cancelConcept() } }.disabled(memory.active.confirmID.isEmpty || busy).frame(minHeight: 44)
        }
    }
    private var noteForm: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(concept["title"].string.isEmpty ? "Návrh" : concept["title"].string).font(.headline)
                Text("Koncept").font(.caption.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 4).background(DiaryStyle.soft, in: Capsule())
            }
            Text(concept["summary"].string).font(.subheadline)
            if ["before", "after", "gallery"].contains(concept["capture"].string) {
                PhotosPicker(selection: $pickedPhoto, matching: .images) { Label("Vybrat z galerie", systemImage: "photo") }.frame(minHeight: 44)
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button { showCamera = true } label: { Label("Vyfotit", systemImage: "camera") }.frame(minHeight: 44)
                }
                Text("Snímek se nahraje k zakázce a k protokolu se připojí až po potvrzení. Co je na něm, neposuzuji.").font(.caption).foregroundStyle(.secondary)
            }
            ForEach(Array(concept["lines"].array.enumerated()), id: \.offset) { _, line in
                Text(line.string).font(.subheadline)
            }
            Button("Uložit návrh") { Task { await confirm() } }.disabled(memory.active.confirmID.isEmpty || busy).buttonStyle(.borderedProminent).frame(minHeight: 44)
            Button("Zrušit koncept") { Task { await cancelConcept() } }.disabled(memory.active.confirmID.isEmpty || busy).frame(minHeight: 44)
        }
    }
    private var jobConceptForm: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { Text("Nová zakázka").font(.headline); Text("Koncept").font(.caption.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 4).background(DiaryStyle.soft, in: Capsule()) }
            field("Zákazník", "customerName")
            field("Adresa", "address")
            field("Město", "city")
            field("Název", "title")
            Text(APIDuration.totalLabel(concept["terms"].array)).font(.subheadline.weight(.semibold)).foregroundStyle(DiaryStyle.accent)
            ForEach(Array(concept["terms"].array.enumerated()), id: \.offset) { index, _ in
                VStack(alignment: .leading, spacing: 6) {
                    Text("Den \(index + 1)").font(.caption.weight(.semibold))
                    TextField("Datum", text: termBinding(index, "date")).frame(minHeight: 44).accessibilityLabel("Datum dne \(index + 1)")
                    TextField("Od", text: termBinding(index, "start")).frame(minHeight: 44).accessibilityLabel("Začátek dne \(index + 1)")
                    APIDurationPicker(minutes: durationBinding(index), start: concept["terms"].array.indices.contains(index) ? concept["terms"].array[index]["start"].string : "08:00", term: true) { end in
                        var rows = concept["terms"].array
                        guard rows.indices.contains(index) else { return }
                        rows[index]["end"] = .s(end)
                        concept["terms"] = .array(rows)
                    }
                    TextField("Pracovníci", text: peopleBinding(index)).frame(minHeight: 44).accessibilityLabel("Pracovníci dne \(index + 1)")
                    TextField("Poznámka k dni", text: termBinding(index, "note")).frame(minHeight: 44)
                    Button("Odebrat den", role: .destructive) { var rows = concept["terms"].array; if rows.indices.contains(index) { rows.remove(at: index); concept["terms"] = .array(rows) } }.frame(minHeight: 44)
                }.padding(8).background(DiaryStyle.surface, in: RoundedRectangle(cornerRadius: 14))
            }
            Button { var rows = concept["terms"].array; rows.append(.object(["date": .s(""), "start": .s("08:00"), "end": .s("16:00"), "people": .array([]), "note": .s("")])); concept["terms"] = .array(rows) } label: { Label("Přidat den", systemImage: "plus") }.frame(minHeight: 44)
            ForEach(Array(concept["materials"].array.enumerated()), id: \.offset) { index, _ in
                VStack(alignment: .leading, spacing: 6) {
                    TextField("Materiál", text: materialBinding(index, "name")).frame(minHeight: 44)
                    HStack {
                        TextField("Množství", text: materialBinding(index, "quantity")).frame(minHeight: 44)
                        TextField("Jednotka", text: materialBinding(index, "unit")).frame(minHeight: 44)
                    }
                    Picker("Stav", selection: readinessBinding(index)) { Text("K nákupu").tag("to_buy"); Text("Máme").tag("on_hand") }.pickerStyle(.segmented)
                }
            }
            Button { var rows = concept["materials"].array; rows.append(.object(["name": .s(""), "quantity": .s("1"), "unit": .s("ks"), "readiness": .s("to_buy")])); concept["materials"] = .array(rows) } label: { Label("Přidat materiál", systemImage: "plus") }.frame(minHeight: 44)
            TextField("Poznámky", text: binding("notes"), axis: .vertical).frame(minHeight: 44)
            Button("Uložit zakázku") { Task { await confirm() } }.disabled(memory.active.confirmID.isEmpty || busy).buttonStyle(.borderedProminent).frame(minHeight: 44)
            Button("Zrušit koncept") { Task { await cancelConcept() } }.disabled(memory.active.confirmID.isEmpty || busy).frame(minHeight: 44)
        }
    }
    private var historySheet: some View {
        NavigationStack {
            List(memory.threads) { thread in
                Button { memory.select(thread.id); history = false } label: {
                    VStack(alignment: .leading, spacing: 2) { Text(thread.title).foregroundStyle(.primary); Text(thread.preview).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                }.accessibilityLabel(thread.title)
            }
            .navigationTitle("Historie").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button { history = false } label: { Image(systemName: "xmark") }.accessibilityLabel("Zavřít historii") } }
        }
    }
    private func field(_ title: String, _ key: String) -> some View { TextField(title, text: binding(key)).frame(minHeight: 44).accessibilityLabel(title) }
    private func choiceBinding(_ index: Int) -> Binding<String> {
        Binding(get: {
            guard concept["materials"].array.indices.contains(index) else { return "" }
            let row = concept["materials"].array[index]
            return row["choiceId"].string.isEmpty ? row["itemId"].string : row["choiceId"].string
        }, set: { value in
            var rows = concept["materials"].array
            guard rows.indices.contains(index) else { return }
            rows[index]["choiceId"] = .s(value)
            concept["materials"] = .array(rows)
        })
    }
    private func binding(_ key: String) -> Binding<String> { Binding(get: { concept[key].string }, set: { concept[key] = .s($0) }) }
    private func termBinding(_ index: Int, _ key: String) -> Binding<String> {
        Binding(get: { concept["terms"].array.indices.contains(index) ? concept["terms"].array[index][key].string : "" }, set: { var rows = concept["terms"].array; guard rows.indices.contains(index) else { return }; rows[index][key] = .s($0); concept["terms"] = .array(rows) })
    }
    private func peopleBinding(_ index: Int) -> Binding<String> {
        Binding(get: { concept["terms"].array.indices.contains(index) ? concept["terms"].array[index]["people"].array.map(\.string).joined(separator: ", ") : "" }, set: { var rows = concept["terms"].array; guard rows.indices.contains(index) else { return }; rows[index]["people"] = .array($0.split(separator: ",").map { APIValue.s(String($0).trimmingCharacters(in: .whitespaces)) }.filter { !$0.string.isEmpty }); concept["terms"] = .array(rows) })
    }
    private func materialBinding(_ index: Int, _ key: String) -> Binding<String> {
        Binding(get: { concept["materials"].array.indices.contains(index) ? concept["materials"].array[index][key].string : "" }, set: { var rows = concept["materials"].array; guard rows.indices.contains(index) else { return }; rows[index][key] = .s($0); concept["materials"] = .array(rows) })
    }
    private func readinessBinding(_ index: Int) -> Binding<String> {
        Binding(get: { concept["materials"].array.indices.contains(index) && concept["materials"].array[index]["readiness"].string == "on_hand" ? "on_hand" : "to_buy" }, set: { var rows = concept["materials"].array; guard rows.indices.contains(index) else { return }; rows[index]["readiness"] = .s($0); concept["materials"] = .array(rows) })
    }
    private func durationBinding(_ index: Int) -> Binding<Int?> {
        Binding(get: {
            guard concept["terms"].array.indices.contains(index) else { return nil }
            let term = concept["terms"].array[index]
            return APIDuration.span(term["start"].string, term["end"].string)
        }, set: { minutes in
            guard let minutes, concept["terms"].array.indices.contains(index) else { return }
            var rows = concept["terms"].array
            let choice = APIDuration.choice(start: rows[index]["start"].string, minutes: minutes, term: true)
            if !choice.end.isEmpty { rows[index]["end"] = .s(choice.end); concept["terms"] = .array(rows) }
        })
    }
    private func send() async {
        let text = memory.active.draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        busy = true
        defer { busy = false }
        await deliver(text)
    }
    private func deliver(_ text: String) async {
        let notes = memory.active.concept["notes"].string
        memory.syncPlanFromConcept()
        var outgoing = text
        if useMinistral && store.online {
            do {
                let raw = try await MinistralRuntime.answer(text)
                if let command = MinistralCommand.extract(raw) { outgoing = command }
                else { memory.append("Ministral nevrátil jeden příkaz. Posílám původní větu základnímu asistentovi, který nic neuloží bez potvrzení.", mine: false) }
            } catch {
                let shown = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                memory.append(shown + " Pokračuji základním režimem.", mine: false)
            }
        }
        memory.append(text, mine: true)
        if outgoing != text { memory.append("Příkaz pro evidenci: \(outgoing)", mine: false) }
        memory.setDraft("")
        memory.setNotice("")
        if !store.online {
            memory.enqueuePending(outgoing)
            let message = "Příkaz jsem si schoval. Zápis bez připojení neukládám. Až budete online, navrhnu ho znovu a počkám na potvrzení. Nic se teď neuložilo."
            memory.append(message, mine: false)
            memory.setNotice(message)
            return
        }
        do {
            var body: APIValue = .object(["text": .s(outgoing), "mode": .s("basic")])
            if !memory.active.context.isNull { body["context"] = memory.active.context }
            let response = try await store.write("/api/assistant", method: "POST", body: body)
            var reply = response["reply"].string
            let cards = response["cards"].array.map { card in
                [card["title"].string, card["subtitle"].string].filter { !$0.isEmpty }.joined(separator: " · ")
            }.filter { !$0.isEmpty }
            if !cards.isEmpty { reply += (reply.isEmpty ? "" : "\n") + cards.joined(separator: "\n") }
            prompts = response["suggestions"].array.map(\.string).filter { !$0.isEmpty }
            if response["choices"].array.isEmpty == false && prompts.isEmpty {
                prompts = response["choices"].array.map(\.string).filter { !$0.isEmpty }
            }
            memory.append(reply, mine: false)
            if !response["context"].isNull { memory.setContext(response["context"]) }
            if !response["concept"].isNull {
                var next = response["concept"]
                if next["notes"].string.isEmpty && !notes.isEmpty { next["notes"] = .s(notes) }
                memory.setConcept(next)
                memory.setTab("result")
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
            memory.setConfirm(response["confirm"]["id"].string)
            if response["concept"].isNull && !response["confirm"]["id"].string.isEmpty { memory.setTab("result") }
        } catch {
            if !store.online { memory.enqueuePending(outgoing) }
            let shown = ((error as? LocalizedError)?.errorDescription ?? error.localizedDescription).trimmingCharacters(in: .whitespacesAndNewlines)
            let message = (shown.isEmpty ? "Server neposlal podrobnost." : shown) + (memory.active.concept.isNull ? "" : " Rozpracovaný koncept zůstává v iPhonu.")
            memory.append(message, mine: false)
            memory.setNotice(message)
        }
    }
    private func flushPending() async {
        guard store.online, !busy, let text = memory.takePending() else { return }
        memory.setDraft(text)
        await send()
        if store.online, memory.pendingCount > 0 { await flushPending() }
    }
    private func uploadCaptured(_ bytes: Data) async {
        let jobId = concept["jobId"].string.isEmpty ? memory.active.context["jobId"].string : concept["jobId"].string
        guard !jobId.isEmpty else {
            memory.append("Nemám vybranou zakázku. Fotografii nikam neukládám a nepopisuji, co je na ní.", mine: false)
            return
        }
        guard store.online else {
            memory.append("Fotografii bez připojení nenahrávám. Nic jsem nepřipojil a obsah snímku neposuzuji.", mine: false)
            return
        }
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let type = bytes.count > 3 && bytes[0] == 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71 ? "image/png" : "image/jpeg"
            let prepared = try APIImage.prepared(bytes, type: type)
            let id = UUID().uuidString
            let file = "fotografie." + prepared.extensionName
            try await store.upload("/api/jobs/\(jobId)/service/photos/\(id)", bytes: prepared.data, type: prepared.type, headers: ["x-file-name": file])
            let capture = concept["capture"].string
            if capture == "before" || capture == "after" {
                _ = try? await store.write("/api/jobs/\(jobId)/photos/\(id)", method: "PATCH", body: .object(["category": .s(capture), "note": .s(""), "version": .n(1)]))
            }
            await deliver("Připoj poslední fotografii k protokolu.")
        } catch {
            let shown = ((error as? LocalizedError)?.errorDescription ?? error.localizedDescription).trimmingCharacters(in: .whitespacesAndNewlines)
            memory.append((shown.isEmpty ? "Fotografii se nepodařilo nahrát." : shown) + " Nic jsem nepřipojil a obsah snímku neposuzuji.", mine: false)
        }
    }
    private func confirm() async {
        let id = memory.active.confirmID
        guard !id.isEmpty, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let response = try await store.write("/api/assistant", method: "POST", body: .object(["confirmId": .s(id), "concept": concept, "mode": .s("basic")]))
            memory.append(response["reply"].string, mine: false)
            memory.setNotice("")
            if !response["mutated"].isNull {
                memory.setConcept(.null)
                memory.setConfirm("")
                if !response["context"].isNull { memory.setContext(response["context"]) }
                memory.setTab("chat")
            }
        } catch {
            let shown = ((error as? LocalizedError)?.errorDescription ?? error.localizedDescription).trimmingCharacters(in: .whitespacesAndNewlines)
            let message = (shown.isEmpty ? "Uložení se nepodařilo. Server neposlal podrobnost." : shown) + " Koncept zůstává, můžete ho opravit a uložit znovu."
            memory.append(message, mine: false)
            memory.setNotice(message)
        }
    }
    private func cancelConcept() async {
        let id = memory.active.confirmID
        guard !id.isEmpty else { return }
        _ = try? await store.write("/api/assistant", method: "POST", body: .object(["cancelId": .s(id), "mode": .s("basic")]))
        memory.setConcept(.null)
        memory.setConfirm("")
        memory.setContext(.null)
        memory.setNotice("")
        memory.append("Koncept je zrušený. Nic se neuložilo.", mine: false)
    }
}
