import SwiftUI
import Speech
import AVFoundation

// Same safe assistant endpoint as the web. Local and cloud modes do not download a model.
struct AssistantSheet: View {
    @ObservedObject var store: APIStore
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var mode = "basic"
    @State private var items: [AssistantTurn] = []
    @State private var scope = ""
    @State private var busy = false
    @State private var listening = false
    @State private var recognizer: SFSpeechRecognizer? = SFSpeechRecognizer(locale: Locale(identifier: "cs-CZ"))
    @State private var request: SFSpeechAudioBufferRecognitionRequest?
    @State private var task: SFSpeechRecognitionTask?
    private let engine = AVAudioEngine()
    @ObservedObject private var ministral = MinistralLibrary.shared
    private let modes = [("basic","Základní", true),("local","V zařízení", true),("cloud","Cloud", false)]
    private let quick = ["Co máme dnes za práci?","Ukaž nedokončené zakázky.","Najdi zákazníka Nováka.","Kolik hodin odpracoval Marek v listopadu?","Jaký materiál potřebujeme na zítřek?","Vytvoř servisní protokol."]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        DiaryStatusBanner(text: modeNote, symbol: "sparkles")
                        if mode == "local" { localModelCard }
                        if items.isEmpty {
                            Text("Napište běžný příkaz, nebo klepněte na rychlou akci. Změny se neuloží, dokud je nepotvrdíte.")
                                .font(.callout).foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        ForEach(items) { item in
                            VStack(alignment: .leading, spacing: 10) {
                                Text(item.text).font(.body).fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: item.mine ? .trailing : .leading)
                                if let confirm = item.confirm {
                                    DiaryActionButton(title: "Potvrdit", symbol: "checkmark", prominent: true) { Task { await send(confirmId: confirm) } }
                                    DiaryActionButton(title: "Zrušit", symbol: "xmark") { Task { await send("", cancelId: confirm) } }
                                }
                            }
                            .padding(14)
                            .background(item.mine ? DiaryStyle.actionFill : DiaryStyle.soft, in: RoundedRectangle(cornerRadius: 22))
                            .foregroundStyle(item.mine ? Color.white : Color.primary)
                        }
                        ForEach(quick, id: \.self) { sample in
                            DiaryActionButton(title: sample, symbol: "text.bubble") { Task { await send(sample) } }
                        }
                    }.padding(16)
                }
                VStack(spacing: 10) {
                    Picker("Režim", selection: $mode) {
                        ForEach(modes, id: \.0) { item in
                            Text(item.2 ? item.1 : item.1 + " · nedostupné").tag(item.0)
                        }
                    }.pickerStyle(.segmented)
                    HStack(alignment: .bottom, spacing: 8) {
                        TextField("Například: Co máme dnes za práci?", text: $text, axis: .vertical)
                            .lineLimit(1...3).padding(12)
                            .background(DiaryStyle.background, in: RoundedRectangle(cornerRadius: 17))
                        if recognizer != nil {
                            Button { toggleVoice() } label: {
                                Image(systemName: listening ? "stop.fill" : "mic")
                                    .frame(width: 50, height: 50)
                                    .background(listening ? Color.red.opacity(0.12) : DiaryStyle.soft, in: RoundedRectangle(cornerRadius: 17))
                                    .foregroundStyle(listening ? Color.red : DiaryStyle.accent)
                            }.buttonStyle(.plain).accessibilityLabel(listening ? "Zastavit diktování" : "Hlasové zadání")
                        }
                        Button { Task { await send(text) } } label: {
                            Image(systemName: "arrow.up").font(.body.weight(.semibold))
                                .frame(width: 50, height: 50)
                                .background(DiaryStyle.actionFill, in: RoundedRectangle(cornerRadius: 17))
                                .foregroundStyle(.white)
                        }.buttonStyle(.plain).disabled(busy).accessibilityLabel("Odeslat")
                    }
                }.padding(16).background(DiaryStyle.surface)
            }.background(DiaryStyle.background)
                .navigationTitle("Pracovní asistent")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Zavřít") { stopVoice(); dismiss() } }
                }
                .onAppear { loadHistory(); ministral.refresh() }
                .onChange(of: store.scope) { _, _ in loadHistory() }
        }
    }
    private var modeNote: String {
        switch mode {
        case "local": return ministral.installed ? "Ministral 3B běží v telefonu. Firemní údaje dál bere ze serveru a zápis čeká na potvrzení." : "Ministral 3B se stáhne do telefonu, asi 2,2 GB. Do aplikace ani na server se model nevkládá."
        case "cloud": return "Nedostupné. Cloudový poskytovatel není zapojený a placené API se nevolá."
        default: return "Základní asistent bez AI. Stejná oprávnění jako ve zbytku deníku."
        }
    }
    @ViewBuilder private var localModelCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(ministral.message).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            if ministral.downloading {
                ProgressView(value: ministral.progress)
                DiaryActionButton(title: "Zrušit stahování", symbol: "xmark") { ministral.cancel() }
            } else if ministral.installed {
                DiaryActionButton(title: "Smazat model z telefonu", symbol: "trash") { ministral.remove() }
            } else {
                DiaryActionButton(title: "Stáhnout Ministral 3B", symbol: "arrow.down.circle", prominent: true) { ministral.start() }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    func loadHistory() {
        let next = store.scope
        if next != scope { scope = next; items = AssistantTurn.load(scope: next) }
    }
    func send(_ value: String = "", confirmId: String? = nil, cancelId: String? = nil) async {
        let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !busy, confirmId != nil || cancelId != nil || !clean.isEmpty else { return }
        if mode == "cloud" && confirmId == nil && cancelId == nil {
            say(modeNote, mine: false)
            return
        }
        if mode == "local" && confirmId == nil && cancelId == nil {
            guard ministral.installed else { say("Nejdřív stáhněte Ministral 3B. Nic jsem se neptal serveru.", mine: false); return }
            say(clean, mine: true)
            text = ""
            busy = true
            defer { busy = false }
            let answer: String
            do { answer = try await MinistralRuntime.answer(clean) }
            catch { say(error.localizedDescription, mine: false); return }
            if let command = MinistralCommand.extract(answer) {
                say("Rozumím tomu jako: \(command)", mine: false)
                await deliver(command)
            } else {
                say(answer + "\n\nTohle není údaj z deníku. Jména, hodiny a ceny beru jen z evidence.", mine: false)
            }
            return
        }
        if confirmId == nil && cancelId == nil { say(clean, mine: true); text = "" }
        await deliver(clean, confirmId: confirmId, cancelId: cancelId)
    }
    func deliver(_ clean: String, confirmId: String? = nil, cancelId: String? = nil) async {
        if !store.online {
            if confirmId != nil || cancelId != nil { say("Potvrzení bez připojení neodešlu. Nic se neuložilo.", mine: false); return }
            say(offlineReply(clean), mine: false)
            return
        }
        busy = true
        defer { busy = false }
        var body: [String: APIValue] = ["text": .string(clean), "mode": .string("basic")]
        if let confirmId { body["confirmId"] = .string(confirmId) }
        if let cancelId { body["cancelId"] = .string(cancelId) }
        do {
            let result = try await store.write("/api/assistant", method: "POST", body: .object(body))
            say(result["reply"].string.isEmpty ? "Hotovo." : result["reply"].string, mine: false, confirm: result["confirm"]["id"].string.isEmpty ? nil : result["confirm"]["id"].string)
        } catch {
            say(error.localizedDescription, mine: false)
        }
    }
    func say(_ text: String, mine: Bool, confirm: String? = nil) {
        items.append(AssistantTurn(text: text, mine: mine, confirm: confirm))
        items = Array(items.suffix(40))
        AssistantTurn.save(items, scope: scope)
    }
    func offlineReply(_ value: String) -> String {
        let folded = value.folding(options: .diacriticInsensitive, locale: Locale(identifier: "cs")).lowercased()
        let missing = "Tento přehled v zařízení nemám. Připojte se. Nic jsem si nevymyslel."
        if folded.contains("smaz") || folded.contains("odstran") { return "Smazání tady nespouštím. Použijte stávající obrazovku záznamu." }
        if folded.contains("vytvor") || folded.contains("vytvoř") || folded.contains("protokol") { return "Zápis bez připojení neukládám. Až budete online, příkaz zopakujte. Nic se teď nezměnilo." }
        if folded.contains("hodin") || folded.contains("výkaz") || folded.contains("vykaz") || folded.contains("materiál") || folded.contains("material") { return missing }
        let jobs = store.vault?.state.jobMonths?.months.values.flatMap { $0.jobs } ?? []
        if jobs.isEmpty { return missing }
        let today = pragueDay()
        let shown: [APIValue]
        if folded.contains("čekaj") || folded.contains("cekaj") {
            shown = jobs.filter { $0["jobType"].string == "service" && $0["status"].string != "done" }
        } else if folded.contains("nedokon") {
            shown = jobs.filter { $0["status"].string == "incomplete" }
        } else if folded.contains("zítra") || folded.contains("zitra") {
            shown = jobs.filter { $0["dueDate"].string == nextDay(today) }
        } else if folded.contains("dnes") {
            shown = jobs.filter { $0["dueDate"].string == today }
        } else {
            return missing
        }
        if shown.isEmpty { return "V uloženém přehledu nic takového není." }
        return "Z uloženého přehledu:\n" + shown.prefix(8).map { "• \($0["title"].string)" }.joined(separator: "\n")
    }
    func pragueDay() -> String {
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_US_POSIX")
        format.timeZone = TimeZone(identifier: "Europe/Prague")
        format.dateFormat = "yyyy-MM-dd"
        return format.string(from: Date())
    }
    func nextDay(_ day: String) -> String {
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_US_POSIX")
        format.timeZone = TimeZone(identifier: "Europe/Prague")
        format.dateFormat = "yyyy-MM-dd"
        guard let date = format.date(from: day), let next = Calendar(identifier: .gregorian).date(byAdding: .day, value: 1, to: date) else { return "" }
        return format.string(from: next)
    }
    func toggleVoice() { listening ? stopVoice() : startVoice() }
    func startVoice() {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else { Task { @MainActor in say("Hlasové zadání není povolené. Příkaz napište.", mine: false) }; return }
            Task { @MainActor in
                let audio = SFSpeechAudioBufferRecognitionRequest()
                request = audio
                let node = engine.inputNode
                let format = node.outputFormat(forBus: 0)
                node.removeTap(onBus: 0)
                node.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in audio.append(buffer) }
                engine.prepare()
                try? engine.start()
                listening = true
                task = recognizer?.recognitionTask(with: audio) { result, error in
                    if let result { Task { @MainActor in text = result.bestTranscription.formattedString; if result.isFinal { stopVoice(); Task { await send(text) } } } }
                    if error != nil { Task { @MainActor in stopVoice() } }
                }
            }
        }
    }
    func stopVoice() {
        if engine.isRunning { engine.stop(); engine.inputNode.removeTap(onBus: 0) }
        request?.endAudio()
        task?.cancel()
        listening = false
    }
}
private struct AssistantTurn: Identifiable, Codable {
    var id = UUID()
    var text: String
    var mine: Bool
    var confirm: String?
    static func load(scope: String) -> [AssistantTurn] { (UserDefaults.standard.data(forKey: "pd-assistant-history-v2:" + scope).flatMap { try? JSONDecoder().decode([AssistantTurn].self, from: $0) }) ?? [] }
    static func save(_ items: [AssistantTurn], scope: String) { UserDefaults.standard.set(try? JSONEncoder().encode(items), forKey: "pd-assistant-history-v2:" + scope) }
}
