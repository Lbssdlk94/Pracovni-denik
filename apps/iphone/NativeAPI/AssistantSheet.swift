import SwiftUI
import Speech
import AVFoundation

// Same safe assistant endpoint as the web. Local and cloud modes do not download a model.
struct AssistantSheet: View {
    @ObservedObject var store: APIStore
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var mode = "basic"
    @State private var items: [AssistantTurn] = AssistantTurn.load()
    @State private var busy = false
    @State private var listening = false
    @State private var recognizer: SFSpeechRecognizer? = SFSpeechRecognizer(locale: Locale(identifier: "cs-CZ"))
    @State private var request: SFSpeechAudioBufferRecognitionRequest?
    @State private var task: SFSpeechRecognitionTask?
    private let engine = AVAudioEngine()
    private let modes = [("basic","Základní"),("local","V zařízení"),("cloud","Cloud")]
    private let quick = ["Co máme dnes za práci?","Ukaž nedokončené zakázky.","Najdi zákazníka Nováka.","Kolik hodin odpracoval Marek v listopadu?","Jaký materiál potřebujeme na zítřek?","Vytvoř servisní protokol."]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        DiaryStatusBanner(text: modeNote, symbol: "sparkles")
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
                                    DiaryActionButton(title: "Zrušit", symbol: "xmark") { say("Potvrzení je zrušené. Nic jsem neuložil.", mine: false) }
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
                        ForEach(modes, id: \.0) { Text($0.1).tag($0.0) }
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
        }
    }
    private var modeNote: String {
        switch mode {
        case "local": return "Režim v zařízení. Model se nestahuje, používají se stejné bezpečné funkce."
        case "cloud": return "Cloudový poskytovatel není zapojený. Používají se stejné bezpečné funkce."
        default: return "Základní asistent bez AI. Stejná oprávnění jako ve zbytku deníku."
        }
    }
    func send(_ value: String = "", confirmId: String? = nil) async {
        let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !busy, confirmId != nil || !clean.isEmpty else { return }
        if confirmId == nil { say(clean, mine: true); text = "" }
        guard store.online else { say("Jste offline a tento přehled nemám v iPhonu. Připojte se. Rozpracovaná práce zůstává.", mine: false); return }
        busy = true
        defer { busy = false }
        var body: [String: APIValue] = ["text": .string(clean), "mode": .string(mode)]
        if let confirmId { body["confirmId"] = .string(confirmId) }
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
        AssistantTurn.save(items)
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
    static func load() -> [AssistantTurn] { (UserDefaults.standard.data(forKey: "pd-assistant-history").flatMap { try? JSONDecoder().decode([AssistantTurn].self, from: $0) }) ?? [] }
    static func save(_ items: [AssistantTurn]) { UserDefaults.standard.set(try? JSONEncoder().encode(items), forKey: "pd-assistant-history") }
}
